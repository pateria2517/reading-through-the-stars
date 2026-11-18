import pandas as pd
from src.diagnostic_analytics import FAILURE_MODES

SOP_PLAYBOOK = {
    "Cold Food": {
        "CRITICAL": "Immediate audit of hot-holding cabinets, heat-lamp calibration, and insulated thermal pouch staging before rider pickup.",
        "CAUTION": "Adjust peak-hour oven-to-bag staging timing; require thermal liner verification on delivery orders.",
        "REVIEW": "Track weekly cold-food mentions by delivery partner transit window.",
        "HEALTHY": "Maintain baseline hot-holding temperatures and dispatch handoff SLA.",
    },
    "Service Delay": {
        "CRITICAL": "Deploy dedicated peak-hour expeditor; separate aggregator vs. dine-in make-line tickets and audit KDS prep bottlenecks.",
        "CAUTION": "Rebalance shift-lead prep staging 30 minutes ahead of peak rush window.",
        "REVIEW": "Monitor ticket completion times during weekend dinner transitions.",
        "HEALTHY": "Maintain current make-line staffing and prep par levels.",
    },
    "Packaging Spills": {
        "CRITICAL": "Mandate double-lid crimping, tamper-evident liquid seals, and upright corrugated tray dividers at packing station.",
        "CAUTION": "Retrain weekend packing crew on foil double-wrapping and sauce cup placement.",
        "REVIEW": "Inspect batch lid tolerances from packaging supplier during weekly stock check.",
        "HEALTHY": "Maintain current packaging assembly checklist.",
    },
    "Missing Items": {
        "CRITICAL": "Enforce mandatory 2-point visual + receipt highlight check by expeditor before sealing every delivery bag.",
        "CAUTION": "Place dip/cutlery verification sticker on outer bag seal during high-volume shifts.",
        "REVIEW": "Audit combo modifier tickets for frequently omitted add-ons.",
        "HEALTHY": "Maintain current order verification sign-off.",
    },
    "Stale / Freshness": {
        "CRITICAL": "Audit prep-holding timers immediately; discard expired batch pans and tighten FIFO batch-size par levels.",
        "CAUTION": "Reduce batch holding window by 20 minutes during afternoon/off-peak transitions.",
        "REVIEW": "Verify vendor ingredient freshness logs upon morning receiving.",
        "HEALTHY": "Maintain standard FIFO batch rotation.",
    },
    "Staff Behavior": {
        "CRITICAL": "Immediate branch manager floor coaching on guest recovery protocol, counter tone, and escalation handling.",
        "CAUTION": "Conduct pre-shift hospitality briefing focused on peak-queue communication.",
        "REVIEW": "Review counter/handoff staffing ratios during rush periods.",
        "HEALTHY": "Recognize high-performing front-of-house shift crew.",
    },
}


def assign_triage_tier(neg_share: float, total_mentions: int, has_drift: bool = False) -> str:
    """
    Deterministic 4-lane SOP Triage Matrix:
      - CRITICAL: Negative Share >= 50% (with >= 5 mentions)
      - CAUTION:  Negative Share 30%-49% (or >= 50% with < 5 mentions, or emerging drift)
      - REVIEW:   Negative Share 15%-29%
      - HEALTHY:  Negative Share < 15%
    """
    if neg_share >= 50.0 and total_mentions >= 5:
        return "CRITICAL"
    elif (30.0 <= neg_share < 50.0) or (neg_share >= 50.0 and total_mentions < 5) or has_drift:
        return "CAUTION"
    elif 15.0 <= neg_share < 30.0:
        return "REVIEW"
    return "HEALTHY"


def build_sop_triage_matrix(df: pd.DataFrame, drift_alerts_df: pd.DataFrame = None) -> pd.DataFrame:
    """Generates the failure-mode and outlet/shift SOP Triage Matrix."""
    rows = []
    drift_entities = set()
    if drift_alerts_df is not None and not drift_alerts_df.empty:
        drift_entities = set(drift_alerts_df["entity_name"].tolist())

    # 1. Global Failure Mode Rollup
    for mode_key, meta in FAILURE_MODES.items():
        col = f"mode_{mode_key}"
        if col not in df.columns:
            continue
        sub = df[df[col]]
        mentions = len(sub)
        if mentions == 0:
            neg_count = 0
            neg_share = 0.0
            mean_sent = 0.0
            top_outlet = "N/A"
            top_shift = "N/A"
        else:
            neg_count = int((sub["sentiment_label"] == "Negative").sum())
            neg_share = round(neg_count / mentions * 100.0, 1)
            mean_sent = round(float(sub["vader_compound"].mean()), 3)
            top_outlet = sub["outlet"].value_counts().index[0]
            top_shift = sub["shift_slot"].value_counts().index[0]

        tier = assign_triage_tier(neg_share, mentions)
        label = meta["label"]
        sop_action = SOP_PLAYBOOK.get(label, {}).get(tier, "Monitor during weekly operations huddle.")

        rows.append({
            "Failure Mode": label,
            "Responsible Station": meta["station"],
            "Mentions": mentions,
            "Negative Mentions": neg_count,
            "Negative Share (%)": neg_share,
            "Mean Sentiment": mean_sent,
            "Primary Outlet Hotspot": top_outlet,
            "Peak Shift Hotspot": top_shift,
            "Triage Tier": tier,
            "Automated SOP Action": sop_action,
        })

    triage_df = pd.DataFrame(rows)
    tier_rank = {"CRITICAL": 0, "CAUTION": 1, "REVIEW": 2, "HEALTHY": 3}
    triage_df["_rank"] = triage_df["Triage Tier"].map(tier_rank)
    triage_df = triage_df.sort_values(["_rank", "Negative Share (%)", "Mentions"], ascending=[True, False, False]).drop(columns=["_rank"]).reset_index(drop=True)
    return triage_df


def build_outlet_shift_triage(df: pd.DataFrame) -> pd.DataFrame:
    """Granular (Outlet x Shift x Failure Mode) triage table for operational drill-down."""
    records = []
    for mode_key, meta in FAILURE_MODES.items():
        col = f"mode_{mode_key}"
        if col not in df.columns:
            continue
        sub = df[df[col]]
        if sub.empty:
            continue
        grouped = sub.groupby(["outlet", "shift_slot"], as_index=False).agg(
            mentions=("review_id", "count"),
            neg_mentions=("sentiment_label", lambda s: (s == "Negative").sum()),
            mean_sentiment=("vader_compound", "mean"),
        )
        for _, r in grouped.iterrows():
            neg_share = round(r["neg_mentions"] / r["mentions"] * 100.0, 1)
            tier = assign_triage_tier(neg_share, int(r["mentions"]))
            label = meta["label"]
            records.append({
                "Outlet": r["outlet"],
                "Shift Slot": r["shift_slot"],
                "Failure Mode": label,
                "Station": meta["station"],
                "Mentions": int(r["mentions"]),
                "Neg Share (%)": neg_share,
                "Mean Sentiment": round(float(r["mean_sentiment"]), 3),
                "Triage Tier": tier,
                "SOP Action": SOP_PLAYBOOK.get(label, {}).get(tier, ""),
            })

    out_df = pd.DataFrame(records)
    if out_df.empty:
        return out_df
    tier_rank = {"CRITICAL": 0, "CAUTION": 1, "REVIEW": 2, "HEALTHY": 3}
    out_df["_rank"] = out_df["Triage Tier"].map(tier_rank)
    out_df = out_df.sort_values(["_rank", "Neg Share (%)", "Mentions"], ascending=[True, False, False]).drop(columns=["_rank"]).reset_index(drop=True)
    return out_df
