import io
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from src.sample_data import generate_qsr_benchmark_dataset
from src.ingestion_hygiene import load_raw_file, run_hygiene_funnel
from src.nlp_preprocessor import apply_dual_path_nlp
from src.sentiment_engine import score_dual_lexicon
from src.diagnostic_analytics import (
    audit_rating_divergence,
    classify_failure_modes,
    detect_temporal_drift,
    build_shift_heatmap,
)
from src.exec_view import render_management_summary
from src.sop_triage import build_sop_triage_matrix, build_outlet_shift_triage
from src.briefing_generator import (
    build_verified_telemetry_payload,
    synthesize_briefing_text,
    generate_shift_huddle_pdf,
)

# -----------------------------------------------------------------------------
# PAGE CONFIGURATION & STRICT FLAT CORPORATE STYLING (NO GRADIENTS, NO NEON)
# -----------------------------------------------------------------------------
st.set_page_config(
    page_title="Reading through the Stars | Hospitality Triage Intelligence",
    page_icon="★",
    layout="wide",
    initial_sidebar_state="expanded",
)

CUSTOM_CSS = """
<style>
/* Clean, flat corporate palette: Off-White #F8FAFC canvas, White #FFFFFF cards, Slate #0F172A text, Navy #1E3A8A accent */
html, body, [class*="css"] {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #0F172A;
}

.stApp {
    background-color: #F8FAFC;
}

/* Sidebar flat slate styling */
section[data-testid="stSidebar"] {
    background-color: #FFFFFF;
    border-right: 1px solid #E2E8F0;
}

/* Top Command Header Banner - solid flat color, zero gradients */
.command-header {
    background-color: #0F172A;
    color: #FFFFFF;
    padding: 1.25rem 1.5rem;
    border-radius: 6px;
    border-left: 5px solid #1D4ED8;
    margin-bottom: 1.25rem;
}
.command-header h1 {
    margin: 0;
    font-size: 1.45rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: #FFFFFF;
}
.command-header p {
    margin: 0.3rem 0 0 0;
    font-size: 0.88rem;
    color: #CBD5E1;
}

/* Bento Metric Cards - flat white surface with crisp 1px border */
.bento-card {
    background-color: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 6px;
    padding: 1rem 1.15rem;
    height: 100%;
}
.bento-label {
    font-size: 0.74rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #64748B;
    margin-bottom: 0.35rem;
}
.bento-value {
    font-size: 1.6rem;
    font-weight: 700;
    color: #0F172A;
    line-height: 1.2;
}
.bento-sub {
    font-size: 0.78rem;
    color: #475569;
    margin-top: 0.3rem;
}

/* Severity Badges - muted corporate tones */
.badge-critical {
    background-color: #FEE2E2;
    color: #991B1B;
    border: 1px solid #FECACA;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 700;
}
.badge-caution {
    background-color: #FEF3C7;
    color: #92400E;
    border: 1px solid #FDE68A;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 700;
}
.badge-review {
    background-color: #DBEAFE;
    color: #1E40AF;
    border: 1px solid #BFDBFE;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 700;
}
.badge-healthy {
    background-color: #DCFCE7;
    color: #166534;
    border: 1px solid #BBF7D0;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 700;
}

/* Section container card */
.panel-box {
    background-color: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 6px;
    padding: 1.1rem 1.25rem;
    margin-bottom: 1rem;
}
.panel-title {
    font-size: 0.98rem;
    font-weight: 700;
    color: #0F172A;
    margin-bottom: 0.2rem;
}
.panel-caption {
    font-size: 0.8rem;
    color: #64748B;
    margin-bottom: 0.85rem;
}

/* Tab styling */
.stTabs [data-baseweb="tab-list"] {
    gap: 6px;
    background-color: #FFFFFF;
    padding: 6px;
    border-radius: 6px;
    border: 1px solid #E2E8F0;
}
.stTabs [data-baseweb="tab"] {
    height: 38px;
    background-color: transparent;
    border-radius: 4px;
    color: #475569;
    font-weight: 600;
    font-size: 0.85rem;
    padding: 0 14px;
}
.stTabs [aria-selected="true"] {
    background-color: #0F172A !important;
    color: #FFFFFF !important;
}
</style>
"""
st.markdown(CUSTOM_CSS, unsafe_allow_html=True)

# Corporate Muted Palette for Charts (Zero Neon)
PALETTE = {
    "navy": "#1E3A8A",
    "slate": "#334155",
    "steel": "#475569",
    "muted_blue": "#2563EB",
    "muted_teal": "#0F766E",
    "muted_amber": "#B45309",
    "muted_red": "#B91C1C",
    "muted_green": "#15803D",
    "grid": "#E2E8F0",
    "bg": "#FFFFFF",
}


@st.cache_data(show_spinner=False)
def run_full_diagnostic_pipeline(raw_df: pd.DataFrame, col_overrides: dict = None):
    clean_df, funnel_stats = run_hygiene_funnel(raw_df, col_overrides=col_overrides)
    nlp_df = apply_dual_path_nlp(clean_df)
    scored_df, validation_metrics = score_dual_lexicon(nlp_df)
    div_df = audit_rating_divergence(scored_df)
    diag_df = classify_failure_modes(div_df)
    return diag_df, funnel_stats, validation_metrics


# -----------------------------------------------------------------------------
# SIDEBAR: DATA INGESTION & GLOBAL COMMAND FILTERS
# -----------------------------------------------------------------------------
with st.sidebar:
    view_mode = st.radio(
        "View",
        options=["Management summary", "Analyst detail"],
        index=0,
        horizontal=True,
        help="Management summary: plain-language overview for decision makers. Analyst detail: full diagnostics, filters and exports.",
    )
    analyst_mode = view_mode == "Analyst detail"
    st.markdown("---")
    st.markdown("### 1. Data Ingestion")
    data_source = st.radio(
        "Select Input Source",
        options=["Built-in QSR Multi-Brand Benchmark", "Upload Client Export (CSV / Excel / JSON)"],
        index=0,
    )

    uploaded_file = None
    if data_source == "Upload Client Export (CSV / Excel / JSON)":
        uploaded_file = st.file_uploader(
            "Upload Review Dataset",
            type=["csv", "xlsx", "xls", "json"],
            help="Schema-agnostic resolver auto-detects review text, star rating, timestamp, SKU, and outlet columns.",
        )

    if data_source == "Upload Client Export (CSV / Excel / JSON)" and uploaded_file is not None:
        raw_df = load_raw_file(uploaded_file.getvalue(), uploaded_file.name)
        st.success(f"Loaded {len(raw_df):,} raw rows from {uploaded_file.name}")
    else:
        raw_df = generate_qsr_benchmark_dataset()

    col_overrides = {"text": None, "rating": None, "timestamp": None, "sku": None, "outlet": None}
    if analyst_mode:
        # Optional manual column mapping override
        with st.expander("Schema Column Mapping (Optional)", expanded=False):
            cols_options = ["Auto-Detect"] + list(raw_df.columns)
            ov_text = st.selectbox("Review Text Column", cols_options, index=0)
            ov_rating = st.selectbox("Star Rating Column", cols_options, index=0)
            ov_ts = st.selectbox("Timestamp Column", cols_options, index=0)
            ov_sku = st.selectbox("Menu SKU Column", cols_options, index=0)
            ov_outlet = st.selectbox("Outlet / Branch Column", cols_options, index=0)

            col_overrides = {
                "text": None if ov_text == "Auto-Detect" else ov_text,
                "rating": None if ov_rating == "Auto-Detect" else ov_rating,
                "timestamp": None if ov_ts == "Auto-Detect" else ov_ts,
                "sku": None if ov_sku == "Auto-Detect" else ov_sku,
                "outlet": None if ov_outlet == "Auto-Detect" else ov_outlet,
            }

    try:
        full_df, funnel_stats, base_validation = run_full_diagnostic_pipeline(raw_df, col_overrides)
    except Exception as exc:
        st.error(f"Pipeline Error: {exc}")
        if not analyst_mode:
            st.info("Switch to Analyst detail at the top of this sidebar to map the columns manually.")
        st.stop()

    if funnel_stats.get("timestamps_synthetic"):
        st.warning("No date column found: dates are placeholders, so the shift heatmap and drift alerts are not meaningful. Map a timestamp column above.")

    st.markdown("---")
    st.markdown("### 2. Operational Slice Filters")
    all_outlets = sorted(full_df["outlet"].unique().tolist())
    selected_outlets = st.multiselect("Outlets / Brands", options=all_outlets, default=all_outlets)

    all_slots = [
        "Morning (06-11h)",
        "Lunch (11-15h)",
        "Afternoon (15-18h)",
        "Evening (18-22h)",
        "Late Night (22-06h)",
    ]
    present_slots = [s for s in all_slots if s in full_df["shift_slot"].unique()]
    selected_slots = st.multiselect("Shift Day-Parts", options=present_slots, default=present_slots)

    min_r, max_r = st.slider("Star Rating Range", 1.0, 5.0, (1.0, 5.0), step=0.5) if analyst_mode else (1.0, 5.0)

    use_ollama, ollama_model = False, "llama3.1:8b"
    if analyst_mode:
        st.markdown("---")
        st.markdown("### 3. Local AI Huddle Config")
        use_ollama = st.checkbox(
            "Enable On-Premise Ollama (Llama 3.1 8B)",
            value=False,
            help="Connects to local Ollama API at temperature=0.2. Falls back automatically to deterministic grounded synthesis if offline.",
        )
        ollama_model = st.text_input("Ollama Model Tag", value="llama3.1:8b", disabled=not use_ollama)


# Apply global slice filters
df = full_df[
    (full_df["outlet"].isin(selected_outlets))
    & (full_df["shift_slot"].isin(selected_slots))
    & (full_df["rating"] >= min_r)
    & (full_df["rating"] <= max_r)
].copy()

if df.empty:
    st.warning("No reviews match the current sidebar filter selection. Widen your Outlet, Shift, or Rating filters.")
    st.stop()

# Recompute slice-level diagnostics
_, validation_metrics = score_dual_lexicon(df)
sku_weekly_df, sku_drift_df = detect_temporal_drift(df, entity_col="sku", min_weekly_n=3, min_consecutive_weeks=3)
outlet_weekly_df, outlet_drift_df = detect_temporal_drift(df, entity_col="outlet", min_weekly_n=3, min_consecutive_weeks=3)
triage_df = build_sop_triage_matrix(df, drift_alerts_df=sku_drift_df)
outlet_shift_triage_df = build_outlet_shift_triage(df)
piv_rate, piv_vol = build_shift_heatmap(df)

if not analyst_mode:
    _tel = build_verified_telemetry_payload(
        df=df, funnel_stats=funnel_stats, validation_metrics=validation_metrics,
        triage_df=triage_df, sku_drift_df=sku_drift_df, outlet_drift_df=outlet_drift_df,
    )
    _brief, _ = synthesize_briefing_text(telemetry=_tel, use_ollama=False)
    render_management_summary(
        df, funnel_stats, triage_df, sku_drift_df, outlet_drift_df, sku_weekly_df,
        generate_shift_huddle_pdf(_tel, triage_df, _brief),
    )
    st.stop()

# -----------------------------------------------------------------------------
# TOP COMMAND HEADER
# -----------------------------------------------------------------------------
st.markdown(
    """
    <div class="command-header">
        <h1>Reading through the Stars — Hospitality & QSR Operational Triage Intelligence</h1>
        <p>Deterministic 6-Phase Diagnostic Engine • VADER Negation-Safe Polarity • 4-5★ Hidden Risk Auditor • Station SOP Triage</p>
    </div>
    """,
    unsafe_allow_html=True,
)

# -----------------------------------------------------------------------------
# EXECUTIVE BENTO KPI STRIP (6 CARDS)
# -----------------------------------------------------------------------------
hidden_risk_count = int((df["divergence_class"] == "Hidden_Risk").sum())
hidden_risk_pct = round(hidden_risk_count / len(df) * 100.0, 1)
mismatch_count = int((df["divergence_class"] == "Rating_Mismatch").sum())
critical_lanes = int((triage_df["Triage Tier"] == "CRITICAL").sum())
caution_lanes = int((triage_df["Triage Tier"] == "CAUTION").sum())
drift_count = len(sku_drift_df) + len(outlet_drift_df)

c1, c2, c3, c4, c5, c6 = st.columns(6)
with c1:
    st.markdown(
        f"""
        <div class="bento-card">
            <div class="bento-label">Verified Clean Reviews</div>
            <div class="bento-value">{len(df):,}</div>
            <div class="bento-sub">Funnel Retention: {funnel_stats['retention_pct']}% ({funnel_stats['raw_total']:,} raw)</div>
        </div>
        """,
        unsafe_allow_html=True,
    )
with c2:
    st.markdown(
        f"""
        <div class="bento-card">
            <div class="bento-label">Aggregate Star Rating</div>
            <div class="bento-value">{df['rating'].mean():.2f} ★</div>
            <div class="bento-sub">{funnel_stats['scale_detected']}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )
with c3:
    st.markdown(
        f"""
        <div class="bento-card">
            <div class="bento-label">VADER Mean Polarity</div>
            <div class="bento-value">{validation_metrics['mean_vader_compound']:+.3f}</div>
            <div class="bento-sub">r = {validation_metrics['vader_pearson_r']:.3f} vs TextBlob r = {validation_metrics['textblob_pearson_r']:.3f}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )
with c4:
    st.markdown(
        f"""
        <div class="bento-card" style="border-left: 4px solid #B91C1C;">
            <div class="bento-label">4-5★ Hidden Risk</div>
            <div class="bento-value" style="color: #991B1B;">{hidden_risk_count}</div>
            <div class="bento-sub">{hidden_risk_pct}% polite ratings w/ defect text</div>
        </div>
        """,
        unsafe_allow_html=True,
    )
with c5:
    st.markdown(
        f"""
        <div class="bento-card" style="border-left: 4px solid #B45309;">
            <div class="bento-label">Active Drift Alerts</div>
            <div class="bento-value" style="color: #92400E;">{drift_count}</div>
            <div class="bento-sub">{len(sku_drift_df)} SKU • {len(outlet_drift_df)} Outlet (≥3 wk slide)</div>
        </div>
        """,
        unsafe_allow_html=True,
    )
with c6:
    st.markdown(
        f"""
        <div class="bento-card" style="border-left: 4px solid #1E3A8A;">
            <div class="bento-label">SOP Triage Lanes</div>
            <div class="bento-value">{critical_lanes} CRIT / {caution_lanes} CAUT</div>
            <div class="bento-sub">{mismatch_count} accidental 1-2★ mismatches</div>
        </div>
        """,
        unsafe_allow_html=True,
    )

st.markdown("<div style='height: 14px;'></div>", unsafe_allow_html=True)

# -----------------------------------------------------------------------------
# 5-TAB INTERACTIVE BENTO COMMAND SUITE
# -----------------------------------------------------------------------------
tab1, tab2, tab3, tab4, tab5 = st.tabs([
    "1. Executive Overview & Hygiene",
    "2. Temporal & SKU Drift",
    "3. Shift Bottlenecks & SOP Triage",
    "4. 4-5★ Hidden Risk Explorer",
    "5. Shift Huddle PDF & Exports",
])

# =============================================================================
# TAB 1: EXECUTIVE OVERVIEW & 6-STAGE HYGIENE FUNNEL
# =============================================================================
with tab1:
    col_left, col_right = st.columns([1.25, 1])

    with col_left:
        st.markdown('<div class="panel-box">', unsafe_allow_html=True)
        st.markdown('<div class="panel-title">6-Mode Operational Failure Concentration</div>', unsafe_allow_html=True)
        st.markdown(
            '<div class="panel-caption">Total complaint mentions vs. negative sentiment concentration (%) across hospitality failure modes.</div>',
            unsafe_allow_html=True,
        )

        fig_modes = go.Figure()
        fig_modes.add_trace(
            go.Bar(
                x=triage_df["Failure Mode"],
                y=triage_df["Mentions"],
                name="Total Mentions",
                marker_color=PALETTE["slate"],
                text=triage_df["Mentions"],
                textposition="outside",
            )
        )
        fig_modes.add_trace(
            go.Bar(
                x=triage_df["Failure Mode"],
                y=triage_df["Negative Mentions"],
                name="Negative Mentions (VADER < -0.05)",
                marker_color=PALETTE["muted_red"],
                text=triage_df["Negative Share (%)"].apply(lambda x: f"{x}%"),
                textposition="outside",
            )
        )
        fig_modes.update_layout(
            barmode="group",
            plot_bgcolor=PALETTE["bg"],
            paper_bgcolor=PALETTE["bg"],
            margin=dict(l=10, r=10, t=20, b=10),
            height=340,
            legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
            xaxis=dict(showgrid=False, title=""),
            yaxis=dict(showgrid=True, gridcolor=PALETTE["grid"], title="Review Count"),
        )
        st.plotly_chart(fig_modes, use_container_width=True)
        st.markdown("</div>", unsafe_allow_html=True)

    with col_right:
        st.markdown('<div class="panel-box">', unsafe_allow_html=True)
        st.markdown('<div class="panel-title">Phase 1: 6-Stage Data Hygiene Funnel & Lexicon Benchmark</div>', unsafe_allow_html=True)
        st.markdown(
            '<div class="panel-caption">Deterministic audit of purged noise rows prior to NLP scoring.</div>',
            unsafe_allow_html=True,
        )

        funnel_df = pd.DataFrame({
            "Hygiene Stage": [
                "1. Raw Ingested Records",
                "2. Purged Rating-Only Blanks (<2 chars)",
                "3. Purged Retry Duplicates (Text+Date)",
                "4. Purged Non-Latin / Encoding Noise (<40% ASCII)",
                "5. Purged Malformed Timestamps / Out-of-Bounds",
                "6. Verified Clean Operational Corpus",
            ],
            "Row Count": [
                funnel_stats["raw_total"],
                -funnel_stats["dropped_blank_text"],
                -funnel_stats["dropped_duplicates"],
                -funnel_stats["dropped_non_latin_noise"],
                -(funnel_stats["dropped_bad_timestamp"] + funnel_stats["dropped_bad_rating"]),
                funnel_stats["retained_clean"],
            ],
        })
        st.dataframe(funnel_df, use_container_width=True, hide_index=True, height=245)

        st.markdown(
            f"**Dual-Lexicon Cross-Validation:** VADER Compound achieves **$r = {validation_metrics['vader_pearson_r']:.3f}$** "
            f"Pearson correlation with star ratings vs. TextBlob **$r = {validation_metrics['textblob_pearson_r']:.3f}$** "
            f"(**{validation_metrics['vader_lift_pct']:+.1f}%** correlation advantage; "
            f"**{validation_metrics['lexicon_agreement_pct']:.1f}%** polarity band agreement)."
        )
        st.markdown("</div>", unsafe_allow_html=True)

    # Outlet Comparison Summary Table
    st.markdown('<div class="panel-box">', unsafe_allow_html=True)
    st.markdown('<div class="panel-title">Outlet / Brand Operational Scoreboard</div>', unsafe_allow_html=True)
    outlet_summary = (
        df.groupby("outlet", as_index=False)
        .agg(
            Clean_Reviews=("review_id", "count"),
            Avg_Star_Rating=("rating", "mean"),
            Mean_VADER_Polarity=("vader_compound", "mean"),
            Negative_Share_Pct=("sentiment_label", lambda s: (s == "Negative").mean() * 100.0),
            Hidden_Risk_Count=("divergence_class", lambda s: (s == "Hidden_Risk").sum()),
            Defect_Mentions=("has_operational_defect", "sum"),
        )
        .sort_values("Mean_VADER_Polarity", ascending=True)
    )
    outlet_summary["Avg_Star_Rating"] = outlet_summary["Avg_Star_Rating"].round(2)
    outlet_summary["Mean_VADER_Polarity"] = outlet_summary["Mean_VADER_Polarity"].round(3)
    outlet_summary["Negative_Share_Pct"] = outlet_summary["Negative_Share_Pct"].round(1)
    outlet_summary.columns = [
        "Outlet / Brand",
        "Clean Reviews",
        "Avg Star Rating",
        "Mean VADER Polarity",
        "Negative Share (%)",
        "4-5★ Hidden Risk",
        "Defect Mentions",
    ]
    st.dataframe(outlet_summary, use_container_width=True, hide_index=True)
    st.markdown("</div>", unsafe_allow_html=True)

# =============================================================================
# TAB 2: TEMPORAL & SKU DRIFT DETECTOR
# =============================================================================
with tab2:
    st.markdown('<div class="panel-box">', unsafe_allow_html=True)
    st.markdown('<div class="panel-title">Consecutive Multi-Week Quality Slide Alerts (L ≥ 3 Weeks, n ≥ 3/wk)</div>', unsafe_allow_html=True)
    st.markdown(
        '<div class="panel-caption">Automatically flags any menu SKU or outlet experiencing monotonic weekly sentiment erosion before star ratings collapse.</div>',
        unsafe_allow_html=True,
    )

    combined_drifts = pd.concat([sku_drift_df, outlet_drift_df], ignore_index=True)
    if combined_drifts.empty:
        st.info("No SKU or Outlet met the >=3 consecutive declining weeks threshold (with n >= 3 weekly reviews) in this slice.")
    else:
        st.dataframe(
            combined_drifts.rename(columns={
                "entity_type": "Scope",
                "entity_name": "Menu SKU / Outlet",
                "consecutive_weeks": "Consecutive Weeks",
                "window": "ISO Week Window",
                "start_sentiment": "Start VADER",
                "end_sentiment": "End VADER",
                "net_erosion": "Net Erosion (Δ)",
                "trajectory": "Weekly Trajectory",
                "total_mentions": "Window Reviews",
            }),
            use_container_width=True,
            hide_index=True,
        )
    st.markdown("</div>", unsafe_allow_html=True)

    c_drift1, c_drift2 = st.columns([1.3, 1])
    with c_drift1:
        st.markdown('<div class="panel-box">', unsafe_allow_html=True)
        st.markdown('<div class="panel-title">Weekly Menu SKU Sentiment Trajectory</div>', unsafe_allow_html=True)
        top_skus = (
            df["sku"].value_counts().head(6).index.tolist()
        )
        selected_skus = st.multiselect(
            "Select Menu SKUs to Plot",
            options=sorted(df["sku"].unique().tolist()),
            default=top_skus,
        )
        plot_sku_df = sku_weekly_df[sku_weekly_df["sku"].isin(selected_skus)]
        if not plot_sku_df.empty:
            fig_sku = px.line(
                plot_sku_df,
                x="iso_year_week",
                y="mean_sentiment",
                color="sku",
                markers=True,
                color_discrete_sequence=[
                    "#1E3A8A", "#B91C1C", "#0F766E", "#B45309", "#475569", "#6D28D9"
                ],
                labels={"iso_year_week": "ISO Calendar Week", "mean_sentiment": "Mean VADER Polarity", "sku": "Menu SKU"},
            )
            fig_sku.add_hline(y=0.0, line_dash="dash", line_color="#94A3B8")
            fig_sku.update_layout(
                plot_bgcolor=PALETTE["bg"],
                paper_bgcolor=PALETTE["bg"],
                margin=dict(l=10, r=10, t=15, b=10),
                height=340,
                xaxis=dict(showgrid=False),
                yaxis=dict(showgrid=True, gridcolor=PALETTE["grid"], range=[-1.0, 1.0]),
            )
            st.plotly_chart(fig_sku, use_container_width=True)
        st.markdown("</div>", unsafe_allow_html=True)

    with c_drift2:
        st.markdown('<div class="panel-box">', unsafe_allow_html=True)
        st.markdown('<div class="panel-title">Weekly Outlet Sentiment Trendline</div>', unsafe_allow_html=True)
        if not outlet_weekly_df.empty:
            fig_out = px.line(
                outlet_weekly_df,
                x="iso_year_week",
                y="mean_sentiment",
                color="outlet",
                markers=True,
                color_discrete_sequence=[
                    "#0F172A", "#1D4ED8", "#0F766E", "#B45309", "#B91C1C"
                ],
                labels={"iso_year_week": "ISO Calendar Week", "mean_sentiment": "Mean VADER Polarity", "outlet": "Outlet"},
            )
            fig_out.add_hline(y=0.0, line_dash="dash", line_color="#94A3B8")
            fig_out.update_layout(
                plot_bgcolor=PALETTE["bg"],
                paper_bgcolor=PALETTE["bg"],
                margin=dict(l=10, r=10, t=15, b=10),
                height=385,
                xaxis=dict(showgrid=False),
                yaxis=dict(showgrid=True, gridcolor=PALETTE["grid"], range=[-1.0, 1.0]),
            )
            st.plotly_chart(fig_out, use_container_width=True)
        st.markdown("</div>", unsafe_allow_html=True)

# =============================================================================
# TAB 3: SHIFT BOTTLENECKS & RULE-GROUNDED SOP TRIAGE MATRIX
# =============================================================================
with tab3:
    col_hm, col_sev = st.columns([1.2, 1])

    with col_hm:
        st.markdown('<div class="panel-box">', unsafe_allow_html=True)
        st.markdown('<div class="panel-title">Shift-Slot Accountability Heatmap (Day of Week × Shift Slot)</div>', unsafe_allow_html=True)
        st.markdown(
            '<div class="panel-caption">Negative review concentration (%) across operational day-parts to pinpoint kitchen & packing bottlenecks.</div>',
            unsafe_allow_html=True,
        )
        if not piv_rate.empty:
            fig_hm = go.Figure(
                data=go.Heatmap(
                    z=piv_rate.values,
                    x=piv_rate.columns.tolist(),
                    y=piv_rate.index.tolist(),
                    colorscale=[
                        [0.0, "#F1F5F9"],
                        [0.3, "#CBD5E1"],
                        [0.6, "#F59E0B"],
                        [1.0, "#991B1B"],
                    ],
                    zmin=0,
                    zmax=max(60.0, float(piv_rate.max().max()) if not piv_rate.isna().all().all() else 60.0),
                    text=piv_rate.fillna(0).map(lambda v: f"{v:.1f}%").values,
                    texttemplate="%{text}",
                    textfont={"size": 11, "color": "#0F172A"},
                    colorbar=dict(title="Neg %"),
                )
            )
            fig_hm.update_layout(
                plot_bgcolor=PALETTE["bg"],
                paper_bgcolor=PALETTE["bg"],
                margin=dict(l=10, r=10, t=15, b=10),
                height=340,
                yaxis=dict(autorange="reversed"),
            )
            st.plotly_chart(fig_hm, use_container_width=True)
        st.markdown("</div>", unsafe_allow_html=True)

    with col_sev:
        st.markdown('<div class="panel-box">', unsafe_allow_html=True)
        st.markdown('<div class="panel-title">Station Bottleneck Severity Timeline (Gantt View)</div>', unsafe_allow_html=True)
        st.markdown(
            '<div class="panel-caption">Active operational failure windows by station and negative concentration severity.</div>',
            unsafe_allow_html=True,
        )
        gantt_rows = []
        for mode_key in ["cold_food", "service_delay", "packaging", "missing_items", "stale_food", "rude_staff"]:
            col_m = f"mode_{mode_key}"
            sub_m = df[df[col_m]]
            if sub_m.empty:
                continue
            neg_pct = round((sub_m["sentiment_label"] == "Negative").mean() * 100.0, 1)
            tier = "CRITICAL" if (neg_pct >= 50 and len(sub_m) >= 5) else ("CAUTION" if neg_pct >= 30 else ("REVIEW" if neg_pct >= 15 else "HEALTHY"))
            gantt_rows.append({
                "Station / Failure": sub_m["primary_failure_mode"].iloc[0],
                "Start": sub_m["_parsed_dt"].min(),
                "Finish": sub_m["_parsed_dt"].max() + pd.Timedelta(hours=12),
                "Severity Tier": tier,
                "Mentions": len(sub_m),
            })
        if gantt_rows:
            gantt_df = pd.DataFrame(gantt_rows)
            fig_gantt = px.timeline(
                gantt_df,
                x_start="Start",
                x_end="Finish",
                y="Station / Failure",
                color="Severity Tier",
                color_discrete_map={
                    "CRITICAL": "#991B1B",
                    "CAUTION": "#B45309",
                    "REVIEW": "#1D4ED8",
                    "HEALTHY": "#15803D",
                },
                hover_data=["Mentions"],
            )
            fig_gantt.update_yaxes(autorange="reversed")
            fig_gantt.update_layout(
                plot_bgcolor=PALETTE["bg"],
                paper_bgcolor=PALETTE["bg"],
                margin=dict(l=10, r=10, t=15, b=10),
                height=340,
                xaxis=dict(showgrid=True, gridcolor=PALETTE["grid"]),
            )
            st.plotly_chart(fig_gantt, use_container_width=True)
        st.markdown("</div>", unsafe_allow_html=True)

    # Full SOP Triage Matrix Table
    st.markdown('<div class="panel-box">', unsafe_allow_html=True)
    st.markdown('<div class="panel-title">Phase 5: Deterministic Rule-Grounded SOP Triage Matrix</div>', unsafe_allow_html=True)
    st.dataframe(triage_df, use_container_width=True, hide_index=True)

    with st.expander("Drill-Down: Granular (Outlet × Shift Slot × Failure Mode) Triage Matrix", expanded=False):
        st.dataframe(outlet_shift_triage_df, use_container_width=True, hide_index=True)
    st.markdown("</div>", unsafe_allow_html=True)

# =============================================================================
# TAB 4: 4-5★ HIDDEN RISK & RATING-SENTIMENT DIVERGENCE EXPLORER
# =============================================================================
with tab4:
    col_sc, col_tbl = st.columns([1, 1.35])

    with col_sc:
        st.markdown('<div class="panel-box">', unsafe_allow_html=True)
        st.markdown('<div class="panel-title">Rating-Sentiment Divergence Quadrant</div>', unsafe_allow_html=True)
        st.markdown(
            '<div class="panel-caption">Isolates polite 4-5★ Hidden Risks (bottom-right) and accidental 1-2★ Mismatches (top-left).</div>',
            unsafe_allow_html=True,
        )
        fig_div = px.scatter(
            df,
            x="rating",
            y="vader_compound",
            color="divergence_class",
            color_discrete_map={
                "Hidden_Risk": "#B91C1C",
                "Rating_Mismatch": "#B45309",
                "Aligned": "#64748B",
            },
            hover_data=["outlet", "sku", "shift_slot", "matched_failure_modes"],
            opacity=0.78,
            labels={"rating": "Customer Star Rating (1-5★)", "vader_compound": "VADER Compound Polarity (-1 to +1)", "divergence_class": "Audit Class"},
        )
        fig_div.add_hline(y=-0.05, line_dash="dash", line_color="#991B1B")
        fig_div.add_hline(y=0.05, line_dash="dash", line_color="#15803D")
        fig_div.add_vline(x=3.5, line_dash="dot", line_color="#94A3B8")
        fig_div.update_layout(
            plot_bgcolor=PALETTE["bg"],
            paper_bgcolor=PALETTE["bg"],
            margin=dict(l=10, r=10, t=15, b=10),
            height=380,
            xaxis=dict(showgrid=True, gridcolor=PALETTE["grid"], dtick=1),
            yaxis=dict(showgrid=True, gridcolor=PALETTE["grid"], range=[-1.05, 1.05]),
        )
        st.plotly_chart(fig_div, use_container_width=True)
        st.markdown("</div>", unsafe_allow_html=True)

    with col_tbl:
        st.markdown('<div class="panel-box">', unsafe_allow_html=True)
        st.markdown('<div class="panel-title">Divergence Audit Log (CRM Recovery & Aggregator Dispute Queue)</div>', unsafe_allow_html=True)
        div_filter = st.radio(
            "Filter Audit Class",
            options=["Hidden_Risk (4-5★ w/ Negative Text)", "Rating_Mismatch (1-2★ w/ Positive Text)", "All Reviews"],
            horizontal=True,
        )
        if div_filter.startswith("Hidden_Risk"):
            view_df = df[df["divergence_class"] == "Hidden_Risk"].sort_values("vader_compound", ascending=True)
        elif div_filter.startswith("Rating_Mismatch"):
            view_df = df[df["divergence_class"] == "Rating_Mismatch"].sort_values("vader_compound", ascending=False)
        else:
            view_df = df.sort_values("_parsed_dt", ascending=False)

        display_cols = view_df[[
            "review_id", "outlet", "sku", "rating", "vader_compound", "divergence_class", "shift_slot", "matched_failure_modes", "raw_text"
        ]].rename(columns={
            "review_id": "ID",
            "outlet": "Outlet",
            "sku": "SKU",
            "rating": "Stars",
            "vader_compound": "VADER",
            "divergence_class": "Audit Class",
            "shift_slot": "Shift",
            "matched_failure_modes": "Detected Defects",
            "raw_text": "Customer Review Text",
        })
        st.dataframe(display_cols, use_container_width=True, hide_index=True, height=345)
        st.markdown("</div>", unsafe_allow_html=True)

# =============================================================================
# TAB 5: 1-PAGE PRINTABLE SHIFT HUDDLE PDF & ONE-CLICK TRIAGE EXPORTS
# =============================================================================
with tab5:
    telemetry_payload = build_verified_telemetry_payload(
        df=df,
        funnel_stats=funnel_stats,
        validation_metrics=validation_metrics,
        triage_df=triage_df,
        sku_drift_df=sku_drift_df,
        outlet_drift_df=outlet_drift_df,
    )
    brief_text, engine_used = synthesize_briefing_text(
        telemetry=telemetry_payload,
        use_ollama=use_ollama,
        model_name=ollama_model,
    )
    pdf_bytes = generate_shift_huddle_pdf(telemetry_payload, triage_df, brief_text)

    col_b1, col_b2 = st.columns([1.35, 1])

    with col_b1:
        st.markdown('<div class="panel-box">', unsafe_allow_html=True)
        st.markdown('<div class="panel-title">Phase 6: Zero-Hallucination Branch Manager Shift Huddle Brief</div>', unsafe_allow_html=True)
        st.caption(f"Synthesis Engine: {engine_used}")
        st.text_area("Grounded Executive Huddle Narrative", value=brief_text, height=360)
        st.markdown("</div>", unsafe_allow_html=True)

    with col_b2:
        st.markdown('<div class="panel-box">', unsafe_allow_html=True)
        st.markdown('<div class="panel-title">One-Click Deliverables & Triage Exports</div>', unsafe_allow_html=True)
        st.markdown(
            '<div class="panel-caption">Export the printable 1-page Shift Huddle PDF or full diagnostic datasets for store managers and CRM recovery workflows.</div>',
            unsafe_allow_html=True,
        )

        st.download_button(
            label="Download 1-Page Shift Huddle Brief (PDF)",
            data=pdf_bytes,
            file_name="Shift_Huddle_Brief_Reading_Through_The_Stars.pdf",
            mime="application/pdf",
            use_container_width=True,
        )

        # Excel multi-tab export
        xlsx_buf = io.BytesIO()
        with pd.ExcelWriter(xlsx_buf, engine="openpyxl") as writer:
            triage_df.to_excel(writer, sheet_name="SOP_Triage_Matrix", index=False)
            df[df["divergence_class"] == "Hidden_Risk"].to_excel(writer, sheet_name="Hidden_Risk_4_5_Stars", index=False)
            if not sku_drift_df.empty:
                sku_drift_df.to_excel(writer, sheet_name="SKU_Drift_Alerts", index=False)
            df.to_excel(writer, sheet_name="Full_Scored_Corpus", index=False)

        st.download_button(
            label="Download Complete Triage Workbook (XLSX)",
            data=xlsx_buf.getvalue(),
            file_name="QSR_Operational_Triage_Workbook.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            use_container_width=True,
        )

        st.download_button(
            label="Download Scored Reviews & Defects (CSV)",
            data=df.to_csv(index=False).encode("utf-8"),
            file_name="Scored_Reviews_Operational_Triage.csv",
            mime="text/csv",
            use_container_width=True,
        )

        st.markdown("---")
        with st.expander("Inspect Verified JSON Telemetry Payload", expanded=False):
            st.json(telemetry_payload)
        st.markdown("</div>", unsafe_allow_html=True)
