"""Management summary: a plain-language, jargon-free view of the same diagnostics.

No new analysis happens here. Everything shown is derived from the dataframes the
analyst view already uses, restated for non-technical readers.
"""
from __future__ import annotations

import html

import pandas as pd
import plotly.express as px
import streamlit as st

SLOT_PLAIN = {
    "Morning (06-11h)": "mornings (6-11am)",
    "Lunch (11-15h)": "lunchtime (11am-3pm)",
    "Afternoon (15-18h)": "afternoons (3-6pm)",
    "Evening (18-22h)": "evenings (6-10pm)",
    "Late Night (22-06h)": "late nights (10pm-6am)",
}
TIER_RANK = {"CRITICAL": 0, "CAUTION": 1, "REVIEW": 2, "HEALTHY": 3}

EXEC_CSS = """
<style>
.ex-banner {border-radius: 6px; padding: 1.1rem 1.3rem; margin-bottom: 1rem; border: 1px solid;}
.ex-banner .ex-status {font-size: 0.78rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;}
.ex-banner .ex-headline {font-size: 1.25rem; font-weight: 700; margin-top: 0.25rem; line-height: 1.35;}
.ex-red {background:#FEF2F2; border-color:#FECACA; color:#7F1D1D;}
.ex-amber {background:#FFFBEB; border-color:#FDE68A; color:#78350F;}
.ex-green {background:#F0FDF4; border-color:#BBF7D0; color:#14532D;}
.ex-h {font-size: 1.05rem; font-weight: 700; color:#0F172A; margin: 1.4rem 0 0.15rem 0;}
.ex-sub {font-size: 0.85rem; color:#64748B; margin-bottom: 0.6rem;}
.ex-table {width:100%; border-collapse: collapse; background:#FFFFFF; font-size:0.9rem;}
.ex-table th {text-align:left; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.04em; color:#64748B; padding:8px 10px; border-bottom:1px solid #E2E8F0;}
.ex-table td {padding:9px 10px; border-bottom:1px solid #F1F5F9; color:#0F172A;}
</style>
"""


def _e(x) -> str:
    return html.escape(str(x))


def _mood(v: float) -> str:
    if v >= 0.5:
        return "very positive"
    if v >= 0.05:
        return "positive"
    if v > -0.05:
        return "neutral"
    if v > -0.5:
        return "negative"
    return "very negative"


def _slot(s: str) -> str:
    return SLOT_PLAIN.get(s, s)


def _card(label: str, value: str, sub: str, accent: str = "#1E3A8A") -> str:
    return (
        f'<div class="bento-card" style="border-left: 4px solid {accent}; min-height: 128px;">'
        f'<div class="bento-label">{_e(label)}</div>'
        f'<div class="bento-value">{value}</div>'
        f'<div class="bento-sub">{_e(sub)}</div></div>'
    )


def render_management_summary(
    df: pd.DataFrame,
    funnel_stats: dict,
    triage_df: pd.DataFrame,
    sku_drift_df: pd.DataFrame,
    outlet_drift_df: pd.DataFrame,
    sku_weekly_df: pd.DataFrame,
    pdf_bytes: bytes,
) -> None:
    st.markdown(EXEC_CSS, unsafe_allow_html=True)

    n = len(df)
    avg_rating = df["rating"].mean()
    happy = df[df["rating"] >= 4.0]
    hidden = df[df["divergence_class"] == "Hidden_Risk"]
    hidden_of_happy = (len(hidden) / len(happy) * 100.0) if len(happy) else 0.0
    open_issues = triage_df[triage_df["Triage Tier"].isin(["CRITICAL", "CAUTION"])]
    urgent = int((triage_df["Triage Tier"] == "CRITICAL").sum())
    worsening = len(sku_drift_df) + len(outlet_drift_df)

    # ---- header -----------------------------------------------------------
    dates = pd.to_datetime(df["_parsed_dt"], errors="coerce").dropna()
    span = ""
    if len(dates) and not funnel_stats.get("timestamps_synthetic"):
        span = f" from {dates.min():%d %b %Y} to {dates.max():%d %b %Y}"
    st.markdown(
        f"""
        <div class="command-header">
            <h1>Customer Feedback Health Check</h1>
            <p>Based on {n:,} customer reviews{_e(span)} across {df['outlet'].nunique()} outlet(s).</p>
        </div>
        """,
        unsafe_allow_html=True,
    )

    # ---- verdict ----------------------------------------------------------
    if urgent > 0:
        css, status = "ex-red", "Action needed"
    elif len(open_issues) > 0 or worsening > 0:
        css, status = "ex-amber", "Keep an eye on this"
    else:
        css, status = "ex-green", "Looking healthy"
    headline = f"Customers rate you {avg_rating:.1f} out of 5"
    if len(hidden) > 0 and hidden_of_happy >= 3:
        headline += f", but about 1 in {max(2, round(100.0 / hidden_of_happy))} of your 4-5 star reviews still describes a problem."
    elif urgent > 0:
        headline += f", and {urgent} recurring problem(s) need attention."
    else:
        headline += "."
    st.markdown(
        f'<div class="ex-banner {css}"><div class="ex-status">{_e(status)}</div>'
        f'<div class="ex-headline">{_e(headline)}</div></div>',
        unsafe_allow_html=True,
    )

    # ---- four headline numbers ---------------------------------------------
    c1, c2, c3, c4 = st.columns(4)
    c1.markdown(_card("Average rating", f"{avg_rating:.2f} / 5", f"from {n:,} reviews"), unsafe_allow_html=True)
    c2.markdown(
        _card("Happy ratings hiding a problem", f"{hidden_of_happy:.0f}%",
              f"{len(hidden)} of {len(happy)} reviews rated 4-5 stars mention an issue", "#B91C1C"),
        unsafe_allow_html=True,
    )
    c3.markdown(
        _card("Problem areas to fix", f"{len(open_issues)}", f"{urgent} urgent", "#B45309"),
        unsafe_allow_html=True,
    )
    c4.markdown(
        _card("Getting worse", f"{worsening}", "dishes or outlets with falling feedback for 3+ weeks", "#92400E"),
        unsafe_allow_html=True,
    )

    # ---- top priorities -----------------------------------------------------
    st.markdown('<div class="ex-h">Top priorities this week</div>', unsafe_allow_html=True)
    st.markdown('<div class="ex-sub">The biggest recurring complaints, who owns the fix, and the first step.</div>', unsafe_allow_html=True)
    ranked = triage_df[triage_df["Triage Tier"] != "HEALTHY"].copy()
    ranked["_rank"] = ranked["Triage Tier"].map(TIER_RANK)
    ranked = ranked.sort_values(["_rank", "Negative Mentions"], ascending=[True, False]).head(3)
    if ranked.empty:
        st.success("No recurring problem areas found in this selection.")
    for i, (_, r) in enumerate(ranked.iterrows(), start=1):
        with st.container(border=True):
            urgent_tag = "URGENT" if r["Triage Tier"] == "CRITICAL" else "WATCH"
            st.markdown(
                f"**{i}. {r['Failure Mode']}** &nbsp; `{urgent_tag}` &nbsp; "
                f"{int(r['Negative Mentions'])} complaints ({r['Negative Share (%)']:.0f}% of reviews that mention it)"
            )
            st.markdown(
                f"**Worst at:** {r['Primary Outlet Hotspot']}, {_slot(r['Peak Shift Hotspot'])}  \n"
                f"**Owner:** {r['Responsible Station']}  \n"
                f"**First step:** {r['Automated SOP Action']}"
            )

    # ---- outlet scorecard ---------------------------------------------------
    st.markdown('<div class="ex-h">How each outlet is doing</div>', unsafe_allow_html=True)
    st.markdown('<div class="ex-sub">"Reviews with a problem" is the share of reviews that describe something going wrong, whatever the star rating.</div>', unsafe_allow_html=True)
    sl_outlets = set(outlet_drift_df["entity_name"]) if len(outlet_drift_df) else set()
    rows = []
    for outlet, g in df.groupby("outlet"):
        prob = g["has_operational_defect"].mean() * 100.0
        slipping = outlet in sl_outlets
        if prob >= 50:
            badge = "&#128308; Act now"
        elif prob >= 30 or slipping:
            badge = "&#128993; Watch"
        else:
            badge = "&#128994; On track"
        rows.append((outlet, len(g), g["rating"].mean(), prob, "Falling" if slipping else "Steady", badge, prob))
    rows.sort(key=lambda t: -t[6])
    body = "".join(
        f"<tr><td><b>{_e(o)}</b></td><td>{cnt:,}</td><td>{rt:.2f}</td><td>{pr:.0f}%</td><td>{_e(tr)}</td><td>{bd}</td></tr>"
        for o, cnt, rt, pr, tr, bd, _ in rows
    )
    st.markdown(
        '<table class="ex-table"><thead><tr><th>Outlet</th><th>Reviews</th><th>Avg rating</th>'
        '<th>Reviews with a problem</th><th>Trend</th><th>Status</th></tr></thead>'
        f"<tbody>{body}</tbody></table>",
        unsafe_allow_html=True,
    )

    # ---- what's getting worse ------------------------------------------------
    st.markdown('<div class="ex-h">What is getting worse</div>', unsafe_allow_html=True)
    st.markdown('<div class="ex-sub">Dishes and outlets where customer feedback has fallen week after week.</div>', unsafe_allow_html=True)
    alerts = pd.concat([sku_drift_df, outlet_drift_df], ignore_index=True) if worsening else pd.DataFrame()
    if alerts.empty:
        st.info("Nothing is on a sustained downward trend in this selection.")
    else:
        alerts = alerts.sort_values("net_erosion").head(4)
        for _, a in alerts.iterrows():
            kind = "dish" if a["entity_type"] == "SKU" else "outlet"
            st.markdown(
                f"- **{a['entity_name']}** ({kind}): feedback has fallen **{int(a['consecutive_weeks'])} weeks in a row**, "
                f"from {_mood(a['start_sentiment'])} to {_mood(a['end_sentiment'])}."
            )
        worst = sku_drift_df.sort_values("net_erosion").head(1)
        if len(worst):
            name = worst.iloc[0]["entity_name"]
            wk = sku_weekly_df[sku_weekly_df["sku"] == name].sort_values("iso_year_week")
            if len(wk) >= 3:
                fig = px.line(wk, x="iso_year_week", y="mean_sentiment", markers=True)
                fig.update_traces(line_color="#1E3A8A")
                fig.add_hline(y=0, line_dash="dot", line_color="#94A3B8")
                fig.update_layout(
                    title=dict(text=f"{name}: weekly customer mood", font=dict(size=14)),
                    height=270, margin=dict(l=10, r=10, t=40, b=10),
                    yaxis=dict(title="Unhappy  <---  mood  --->  Happy", range=[-1, 1]),
                    xaxis=dict(title=""), plot_bgcolor="#FFFFFF", paper_bgcolor="#FFFFFF",
                )
                st.plotly_chart(fig, use_container_width=True)

    # ---- real customer words -------------------------------------------------
    st.markdown('<div class="ex-h">In customers\' own words</div>', unsafe_allow_html=True)
    st.markdown('<div class="ex-sub">Happy-looking ratings that still report a problem.</div>', unsafe_allow_html=True)
    quotes = hidden.sort_values("vader_compound").drop_duplicates(subset=["raw_text"]).head(3)
    if quotes.empty:
        st.caption("No examples in this selection.")
    for _, q in quotes.iterrows():
        text = str(q["raw_text"]).strip()
        text = (text[:220] + "...") if len(text) > 220 else text
        text = text.replace("$", "\\$")
        st.markdown(f"> \"{text}\"  \n> *{int(q['rating'])} stars, {q['outlet']}*")

    # ---- export ---------------------------------------------------------------
    st.markdown('<div class="ex-h">Take it with you</div>', unsafe_allow_html=True)
    st.download_button(
        label="Download the one-page brief (PDF)",
        data=pdf_bytes,
        file_name="Customer_Feedback_Brief.pdf",
        mime="application/pdf",
    )
    st.caption("Want the full detail behind these numbers? Switch to **Analyst detail** at the top of the sidebar.")
