import re
import numpy as np
import pandas as pd

FAILURE_MODES = {
    "cold_food": {
        "label": "Cold Food",
        "station": "Hot-Hold / Oven-to-Dispatch Staging",
        "patterns": [
            r"\bcold\b", r"\blukewarm\b", r"\btepid\b", r"\bnot hot\b",
            r"\bwasn't hot\b", r"\bwasnt hot\b", r"\bmelted\b", r"\bfrozen\b",
            r"\bstone cold\b", r"\bice cold\b", r"\bcooled down\b",
        ],
    },
    "service_delay": {
        "label": "Service Delay",
        "station": "Kitchen Make-Line & Expeditor Dispatch",
        "patterns": [
            r"\bslow\b", r"\bwait\b", r"\bwaited\b", r"\bwaiting\b", r"\blate\b",
            r"\btook forever\b", r"\bdelay\b", r"\bdelayed\b", r"\bhours\b",
            r"\b45 min\b", r"\b50 min\b", r"\b60 min\b", r"\b1 hour\b", r"\btoo long\b",
        ],
    },
    "packaging": {
        "label": "Packaging Spills",
        "station": "Expeditor Packing & Lid-Crimping Table",
        "patterns": [
            r"\bpackaging\b", r"\bpackage\b", r"\bspilled\b", r"\bspill\b",
            r"\bleaked\b", r"\bleaking\b", r"\bleak\b", r"\bcrushed\b",
            r"\bmessy\b", r"\btorn\b", r"\bburst\b", r"\blid\b", r"\bfoil\b",
        ],
    },
    "missing_items": {
        "label": "Missing Items",
        "station": "Final Bag Check & Order Assembly",
        "patterns": [
            r"\bmissing\b", r"\bforgot\b", r"\bforgotten\b", r"\bnot included\b",
            r"\bwrong item\b", r"\bwrong order\b", r"\bincomplete\b", r"\bno dip\b",
            r"\bno sauce\b", r"\bno cutlery\b", r"\babsent\b",
        ],
    },
    "stale_food": {
        "label": "Stale / Freshness",
        "station": "Prep Line & Hold-Time Rotation",
        "patterns": [
            r"\bstale\b", r"\bsoggy\b", r"\bhard\b", r"\bold\b", r"\bdry\b",
            r"\brubbery\b", r"\bundercooked\b", r"\bovercooked\b", r"\bnot fresh\b",
            r"\bburnt\b", r"\bsour\b",
        ],
    },
    "rude_staff": {
        "label": "Staff Behavior",
        "station": "Front-of-House / Counter & Shift Lead",
        "patterns": [
            r"\brude\b", r"\bimpolite\b", r"\bunhelpful\b", r"\battitude\b",
            r"\bignored\b", r"\barrogant\b", r"\bdisrespectful\b", r"\bunfriendly\b",
        ],
    },
}


def audit_rating_divergence(df: pd.DataFrame) -> pd.DataFrame:
    """
    1. Rating-Sentiment Divergence Auditor:
       - Hidden_Risk: R_i >= 4.0 AND P_i < -0.05
       - Rating_Mismatch: R_i <= 2.0 AND P_i > +0.05
       - Aligned: Otherwise
    """
    out = df.copy()
    cond_hidden = (out["rating"] >= 4.0) & (out["vader_compound"] < -0.05)
    cond_mismatch = (out["rating"] <= 2.0) & (out["vader_compound"] > 0.05)

    out["divergence_class"] = np.select(
        [cond_hidden, cond_mismatch],
        ["Hidden_Risk", "Rating_Mismatch"],
        default="Aligned",
    )
    out["divergence_gap"] = (
        ((out["rating"] - 1.0) / 4.0 * 2.0 - 1.0) - out["vader_compound"]
    ).round(3)
    return out


def classify_failure_modes(df: pd.DataFrame) -> pd.DataFrame:
    """
    3. 6-Mode Operational Root-Cause Classifier:
       Scans Path B lexical stream (and Path A fallback) across the 6 hospitality failure modes.
    """
    out = df.copy()
    compiled = {
        mode: [re.compile(pat, re.IGNORECASE) for pat in meta["patterns"]]
        for mode, meta in FAILURE_MODES.items()
    }

    mode_hits = {mode: [] for mode in FAILURE_MODES}
    primary_modes = []
    all_modes_list = []

    for text_b, text_a in zip(out["path_b_lexical_text"], out["path_a_sentiment_text"]):
        combined = f"{text_b} {text_a.lower()}"
        matched = []
        for mode, regex_list in compiled.items():
            hit = any(rx.search(combined) for rx in regex_list)
            mode_hits[mode].append(hit)
            if hit:
                matched.append(FAILURE_MODES[mode]["label"])
        all_modes_list.append(", ".join(matched) if matched else "None")
        primary_modes.append(matched[0] if matched else "General / Other")

    for mode, hits in mode_hits.items():
        out[f"mode_{mode}"] = hits

    out["matched_failure_modes"] = all_modes_list
    out["primary_failure_mode"] = primary_modes
    out["has_operational_defect"] = out["primary_failure_mode"] != "General / Other"
    return out


def detect_temporal_drift(
    df: pd.DataFrame,
    entity_col: str = "sku",
    min_weekly_n: int = 3,
    min_consecutive_weeks: int = 3,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    2. Consecutive Temporal & SKU/Outlet Drift Detector:
       Tracks weekly mean sentiment P_{k,w} across ISO calendar weeks w (requiring n_{k,w} >= 3)
       and triggers a Quality Slide Alert whenever monotonic erosion persists for L >= 3 consecutive
       transitions (i.e., P_{k,t} > P_{k,t+1} > P_{k,t+2} > P_{k,t+3}, or >= 3 consecutive declining weeks).
    """
    weekly = (
        df.groupby([entity_col, "iso_year_week"], as_index=False)
        .agg(
            review_count=("vader_compound", "count"),
            mean_sentiment=("vader_compound", "mean"),
            mean_rating=("rating", "mean"),
            neg_share=("sentiment_label", lambda s: (s == "Negative").mean() * 100.0),
        )
        .sort_values([entity_col, "iso_year_week"])
    )
    weekly["mean_sentiment"] = weekly["mean_sentiment"].round(3)
    weekly["mean_rating"] = weekly["mean_rating"].round(2)
    weekly["neg_share"] = weekly["neg_share"].round(1)

    valid_weekly = weekly[weekly["review_count"] >= min_weekly_n].copy()

    drift_alerts = []
    for entity, grp in valid_weekly.groupby(entity_col):
        grp = grp.sort_values("iso_year_week").reset_index(drop=True)
        if len(grp) < min_consecutive_weeks:
            continue

        scores = grp["mean_sentiment"].tolist()
        weeks = grp["iso_year_week"].tolist()

        # Find longest strictly decreasing run
        best_run_start = 0
        best_run_len = 1
        cur_start = 0
        cur_len = 1

        for i in range(1, len(scores)):
            if scores[i] < scores[i - 1]:
                cur_len += 1
                if cur_len > best_run_len:
                    best_run_len = cur_len
                    best_run_start = cur_start
            else:
                cur_start = i
                cur_len = 1

        # Trigger if >= min_consecutive_weeks points show monotonic slide
        if best_run_len >= min_consecutive_weeks:
            slide_slice = grp.iloc[best_run_start : best_run_start + best_run_len]
            start_val = slide_slice["mean_sentiment"].iloc[0]
            end_val = slide_slice["mean_sentiment"].iloc[-1]
            delta = round(end_val - start_val, 3)
            trajectory = " → ".join([f"{v:+.3f}" for v in slide_slice["mean_sentiment"]])
            drift_alerts.append({
                "entity_type": entity_col.upper(),
                "entity_name": entity,
                "consecutive_weeks": best_run_len,
                "window": f"{slide_slice['iso_year_week'].iloc[0]} to {slide_slice['iso_year_week'].iloc[-1]}",
                "start_sentiment": start_val,
                "end_sentiment": end_val,
                "net_erosion": delta,
                "trajectory": trajectory,
                "total_mentions": int(slide_slice["review_count"].sum()),
            })

    alerts_df = pd.DataFrame(drift_alerts)
    if not alerts_df.empty:
        alerts_df = alerts_df.sort_values(["consecutive_weeks", "net_erosion"], ascending=[False, True]).reset_index(drop=True)

    return weekly, alerts_df


def build_shift_heatmap(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Cross-tabulates negative concentration (%) and negative review volume across Day of Week x Shift Slot."""
    day_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    slot_order = [
        "Morning (06-11h)",
        "Lunch (11-15h)",
        "Afternoon (15-18h)",
        "Evening (18-22h)",
        "Late Night (22-06h)",
    ]

    sub = df[df["day_of_week"].isin(day_order) & df["shift_slot"].isin(slot_order)].copy()
    if sub.empty:
        return pd.DataFrame(), pd.DataFrame()

    sub["is_neg"] = (sub["sentiment_label"] == "Negative").astype(int)

    piv_rate = (
        sub.pivot_table(index="day_of_week", columns="shift_slot", values="is_neg", aggfunc="mean")
        .reindex(index=day_order, columns=slot_order)
        * 100.0
    ).round(1)

    piv_vol = (
        sub.pivot_table(index="day_of_week", columns="shift_slot", values="is_neg", aggfunc="sum")
        .reindex(index=day_order, columns=slot_order)
        .fillna(0)
        .astype(int)
    )

    return piv_rate, piv_vol
