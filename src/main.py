from __future__ import annotations

import math
import os
from datetime import date, datetime
from typing import Any

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator

if __package__:
    from .briefing_generator import build_verified_telemetry_payload, synthesize_briefing_text
    from .diagnostic_analytics import (
        FAILURE_MODES,
        audit_rating_divergence,
        build_shift_heatmap,
        classify_failure_modes,
        detect_temporal_drift,
    )
    from .ingestion_hygiene import run_hygiene_funnel
    from .nlp_preprocessor import apply_dual_path_nlp
    from .sample_data import generate_qsr_benchmark_dataset
    from .sentiment_engine import score_dual_lexicon
    from .sop_triage import build_outlet_shift_triage, build_sop_triage_matrix
else:
    from briefing_generator import build_verified_telemetry_payload, synthesize_briefing_text
    from diagnostic_analytics import (
        FAILURE_MODES,
        audit_rating_divergence,
        build_shift_heatmap,
        classify_failure_modes,
        detect_temporal_drift,
    )
    from ingestion_hygiene import run_hygiene_funnel
    from nlp_preprocessor import apply_dual_path_nlp
    from sample_data import generate_qsr_benchmark_dataset
    from sentiment_engine import score_dual_lexicon
    from sop_triage import build_outlet_shift_triage, build_sop_triage_matrix

SHIFT_SLOTS = [
    "Morning (06-11h)",
    "Lunch (11-15h)",
    "Afternoon (15-18h)",
    "Evening (18-22h)",
    "Late Night (22-06h)",
]
DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
MODE_BY_LABEL = {meta["label"]: key for key, meta in FAILURE_MODES.items()}


class ColumnOverrides(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str | None = None
    rating: str | None = None
    timestamp: str | None = None
    sku: str | None = None
    outlet: str | None = None


class AnalysisRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    rows: list[dict[str, Any]] = Field(min_length=1)
    col_overrides: ColumnOverrides = Field(default_factory=ColumnOverrides, alias="colOverrides")
    selected_outlets: list[str] | None = Field(default=None, alias="selectedOutlets")
    selected_slots: list[str] | None = Field(default=None, alias="selectedSlots")
    rating_range: tuple[float, float] = Field(default=(1.0, 5.0), alias="ratingRange")
    use_ollama: bool = Field(default=False, alias="useOllama")
    ollama_model: str = Field(default="llama3.1:8b", alias="ollamaModel", min_length=1, max_length=120)

    @model_validator(mode="after")
    def validate_rating_range(self) -> AnalysisRequest:
        minimum, maximum = self.rating_range
        if minimum < 1.0 or maximum > 5.0 or minimum > maximum:
            raise ValueError("Rating range must be ordered and within 1.0 to 5.0.")
        return self


def _native(value: Any) -> Any:
    if value is None or value is pd.NA or value is pd.NaT:
        return None
    if isinstance(value, (pd.Timestamp, datetime, date)):
        return value.isoformat()
    if isinstance(value, np.generic):
        return _native(value.item())
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {str(key): _native(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_native(item) for item in value]
    return str(value)


def _records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    return [
        {str(key): _native(value) for key, value in row.items()}
        for row in frame.to_dict(orient="records")
    ]


def _review_records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    reviews = []
    for row in frame.to_dict(orient="records"):
        parsed = pd.Timestamp(row["_parsed_dt"])
        modes = {key: bool(row[f"mode_{key}"]) for key in FAILURE_MODES}
        reviews.append(
            {
                "reviewId": str(row["review_id"]),
                "rawText": str(row["raw_text"]),
                "rawRating": _native(row["raw_rating"]),
                "rating": float(row["rating"]),
                "outlet": str(row["outlet"]),
                "sku": str(row["sku"]),
                "parsedTs": int(parsed.value // 1_000_000),
                "isoDate": parsed.date().isoformat(),
                "dayOfWeek": str(row["day_of_week"]),
                "dayNum": int(row["day_num"]),
                "hour": int(row["hour"]),
                "isWeekend": bool(row["is_weekend"]),
                "shiftSlot": str(row["shift_slot"]),
                "isoYearWeek": str(row["iso_year_week"]),
                "pathASentimentText": str(row["path_a_sentiment_text"]),
                "pathBLexicalText": str(row["path_b_lexical_text"]),
                "vaderCompound": float(row["vader_compound"]),
                "vaderPos": float(row["vader_pos"]),
                "vaderNeg": float(row["vader_neg"]),
                "vaderNeu": float(row["vader_neu"]),
                "sentimentLabel": str(row["sentiment_label"]),
                "baselinePolarity": float(row["textblob_polarity"]),
                "baselineSubjectivity": float(row["textblob_subjectivity"]),
                "baselineLabel": str(row["tb_label"]),
                "lexiconAgreement": bool(row["lexicon_agreement"]),
                "divergenceClass": str(row["divergence_class"]),
                "divergenceGap": float(row["divergence_gap"]),
                "divergenceSource": str(row["divergence_source"]),
                "modes": modes,
                "matchedFailureModes": str(row["matched_failure_modes"]),
                "primaryFailureMode": str(row["primary_failure_mode"]),
                "hasOperationalDefect": bool(row["has_operational_defect"]),
            }
        )
    return reviews


def _funnel_stats(stats: dict[str, Any]) -> dict[str, Any]:
    resolved = stats["resolved_columns"]
    return {
        "rawTotal": int(stats["raw_total"]),
        "resolvedColumns": {key: _native(resolved.get(key)) for key in ("text", "rating", "timestamp", "sku", "outlet")},
        "scaleDetected": str(stats["scale_detected"]),
        "timestampsSynthetic": bool(stats["timestamps_synthetic"]),
        "droppedBlankText": int(stats["dropped_blank_text"]),
        "droppedDuplicates": int(stats["dropped_duplicates"]),
        "droppedNonLatinNoise": int(stats["dropped_non_latin_noise"]),
        "droppedBadTimestamp": int(stats["dropped_bad_timestamp"]),
        "droppedBadRating": int(stats["dropped_bad_rating"]),
        "retainedClean": int(stats["retained_clean"]),
        "retentionPct": float(stats["retention_pct"]),
    }


def _validation_metrics(metrics: dict[str, Any]) -> dict[str, float]:
    return {
        "vaderPearsonR": float(metrics["vader_pearson_r"]),
        "baselinePearsonR": float(metrics["textblob_pearson_r"]),
        "vaderLiftPct": float(metrics["vader_lift_pct"]),
        "lexiconAgreementPct": float(metrics["lexicon_agreement_pct"]),
        "meanVaderCompound": float(metrics["mean_vader_compound"]),
        "meanSubjectivity": float(metrics["mean_subjectivity"]),
    }


def _weekly_records(frame: pd.DataFrame, entity_col: str) -> list[dict[str, Any]]:
    return [
        {
            "entity": str(row[entity_col]),
            "isoYearWeek": str(row["iso_year_week"]),
            "reviewCount": int(row["review_count"]),
            "meanSentiment": float(row["mean_sentiment"]),
            "meanRating": float(row["mean_rating"]),
            "negShare": float(row["neg_share"]),
        }
        for row in frame.to_dict(orient="records")
    ]


def _drift_records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    return [
        {
            "entityType": str(row["entity_type"]),
            "entityName": str(row["entity_name"]),
            "consecutiveWeeks": int(row["consecutive_weeks"]),
            "window": str(row["window"]),
            "startSentiment": float(row["start_sentiment"]),
            "endSentiment": float(row["end_sentiment"]),
            "netErosion": float(row["net_erosion"]),
            "trajectory": str(row["trajectory"]),
            "totalMentions": int(row["total_mentions"]),
        }
        for row in frame.to_dict(orient="records")
    ]


def _triage_records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    return [
        {
            "modeKey": MODE_BY_LABEL[str(row["Failure Mode"])],
            "failureMode": str(row["Failure Mode"]),
            "responsibleStation": str(row["Responsible Station"]),
            "mentions": int(row["Mentions"]),
            "negativeMentions": int(row["Negative Mentions"]),
            "negativeSharePct": float(row["Negative Share (%)"]),
            "meanSentiment": float(row["Mean Sentiment"]),
            "primaryOutletHotspot": str(row["Primary Outlet Hotspot"]),
            "peakShiftHotspot": str(row["Peak Shift Hotspot"]),
            "triageTier": str(row["Triage Tier"]),
            "automatedSopAction": str(row["Automated SOP Action"]),
        }
        for row in frame.to_dict(orient="records")
    ]


def _outlet_shift_records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    return [
        {
            "outlet": str(row["Outlet"]),
            "shiftSlot": str(row["Shift Slot"]),
            "failureMode": str(row["Failure Mode"]),
            "station": str(row["Station"]),
            "mentions": int(row["Mentions"]),
            "negSharePct": float(row["Neg Share (%)"]),
            "meanSentiment": float(row["Mean Sentiment"]),
            "triageTier": str(row["Triage Tier"]),
            "sopAction": str(row["SOP Action"]),
        }
        for row in frame.to_dict(orient="records")
    ]


def _heatmap_records(
    frame: pd.DataFrame,
    rate_pivot: pd.DataFrame,
    volume_pivot: pd.DataFrame,
) -> list[dict[str, Any]]:
    if frame.empty or rate_pivot.empty:
        return []

    total_volume = frame.groupby(["day_of_week", "shift_slot"]).size()
    cells = []
    for day in DAY_ORDER:
        for slot in SHIFT_SLOTS:
            rate = rate_pivot.at[day, slot] if day in rate_pivot.index and slot in rate_pivot.columns else np.nan
            volume = volume_pivot.at[day, slot] if day in volume_pivot.index and slot in volume_pivot.columns else 0
            total = total_volume.get((day, slot), 0)
            cells.append(
                {
                    "day": day,
                    "shiftSlot": slot,
                    "negRate": None if pd.isna(rate) else float(rate),
                    "negVol": int(volume) if not pd.isna(volume) else 0,
                    "totalVol": int(total),
                }
            )
    return cells


def _outlet_summary(frame: pd.DataFrame, outlet_drifts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    drifting = {item["entityName"] for item in outlet_drifts}
    rows = []
    for outlet, group in frame.groupby("outlet"):
        count = len(group)
        defect_count = int(group["has_operational_defect"].sum())
        rows.append(
            {
                "outlet": str(outlet),
                "cleanReviews": count,
                "avgStarRating": round(float(group["rating"].mean()), 2),
                "meanVaderPolarity": round(float(group["vader_compound"].mean()), 3),
                "negativeSharePct": round(float((group["sentiment_label"] == "Negative").mean()) * 100.0, 1),
                "hiddenRiskCount": int((group["divergence_class"] == "Hidden_Risk").sum()),
                "defectMentions": defect_count,
                "defectRatePct": round(defect_count / count * 100.0, 1),
                "isDrifting": str(outlet) in drifting,
            }
        )
    return sorted(rows, key=lambda row: row["meanVaderPolarity"])


def _telemetry_payload(
    telemetry: dict[str, Any],
    triage_rows: list[dict[str, Any]],
    sku_drifts: list[dict[str, Any]],
    outlet_drifts: list[dict[str, Any]],
) -> dict[str, Any]:
    hygiene = telemetry["hygiene_summary"]
    kpis = telemetry["headline_kpis"]
    return {
        "hygieneSummary": {
            "rawReviews": int(hygiene["raw_reviews"]),
            "cleanReviews": int(hygiene["clean_reviews"]),
            "retentionPct": float(hygiene["retention_pct"]),
            "scaleDetected": str(hygiene["scale_detected"]),
        },
        "headlineKpis": {
            "meanStarRating": float(kpis["mean_star_rating"]),
            "meanVaderPolarity": float(kpis["mean_vader_polarity"]),
            "vaderPearsonR": float(kpis["vader_pearson_r"]),
            "baselinePearsonR": float(kpis["textblob_pearson_r"]),
            "hiddenRiskCount": int(kpis["hidden_risk_count"]),
            "hiddenRiskPct": float(kpis["hidden_risk_pct"]),
            "ratingMismatchCount": int(kpis["rating_mismatch_count"]),
        },
        "priorityTriageLanes": [
            row for row in triage_rows if row["triageTier"] in {"CRITICAL", "CAUTION"}
        ],
        "skuDriftAlerts": sku_drifts,
        "outletDriftAlerts": outlet_drifts,
        "sampleHiddenRiskReviews": [
            {
                "outlet": str(row["outlet"]),
                "sku": str(row["sku"]),
                "rating": float(row["rating"]),
                "vaderCompound": float(row["vader_compound"]),
                "shift": str(row["shift"]),
                "defect": str(row["defect"]),
                "excerpt": str(row["excerpt"]),
            }
            for row in telemetry["sample_hidden_risk_reviews"]
        ],
    }


def _analyze(request: AnalysisRequest) -> dict[str, Any]:
    raw_frame = pd.DataFrame(request.rows)
    try:
        clean_frame, funnel_stats = run_hygiene_funnel(
            raw_frame,
            col_overrides=request.col_overrides.model_dump(exclude_none=True),
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    preprocessed = apply_dual_path_nlp(clean_frame)
    scored, _ = score_dual_lexicon(preprocessed)
    audited = audit_rating_divergence(scored)
    full_frame = classify_failure_modes(audited)

    all_outlets = sorted(full_frame["outlet"].dropna().astype(str).unique().tolist())
    all_slots = [slot for slot in SHIFT_SLOTS if slot in set(full_frame["shift_slot"].tolist())]
    filtered = full_frame
    if request.selected_outlets is not None:
        filtered = filtered[filtered["outlet"].isin(request.selected_outlets)]
    if request.selected_slots is not None:
        filtered = filtered[filtered["shift_slot"].isin(request.selected_slots)]
    minimum, maximum = request.rating_range
    filtered = filtered[filtered["rating"].between(minimum, maximum)].copy()

    _, metrics = score_dual_lexicon(filtered)
    sku_weekly, sku_drift_frame = detect_temporal_drift(
        filtered,
        entity_col="sku",
        min_weekly_n=3,
        min_consecutive_weeks=3,
    )
    outlet_weekly, outlet_drift_frame = detect_temporal_drift(
        filtered,
        entity_col="outlet",
        min_weekly_n=3,
        min_consecutive_weeks=3,
    )
    triage_frame = build_sop_triage_matrix(filtered, drift_alerts_df=sku_drift_frame)
    outlet_shift_frame = build_outlet_shift_triage(filtered)
    rate_pivot, volume_pivot = build_shift_heatmap(filtered)

    triage_rows = _triage_records(triage_frame)
    sku_drifts = _drift_records(sku_drift_frame)
    outlet_drifts = _drift_records(outlet_drift_frame)
    telemetry_raw = build_verified_telemetry_payload(
        df=filtered,
        funnel_stats=funnel_stats,
        validation_metrics=metrics,
        triage_df=triage_frame,
        sku_drift_df=sku_drift_frame,
        outlet_drift_df=outlet_drift_frame,
    )
    brief_text, brief_engine = synthesize_briefing_text(
        telemetry=telemetry_raw,
        use_ollama=request.use_ollama,
        ollama_url=os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate"),
        model_name=request.ollama_model,
    )

    return {
        "columns": [str(column) for column in raw_frame.columns],
        "allOutlets": all_outlets,
        "allSlots": all_slots,
        "reviews": _review_records(filtered),
        "funnelStats": _funnel_stats(funnel_stats),
        "validationMetrics": _validation_metrics(metrics),
        "skuWeekly": _weekly_records(sku_weekly, "sku"),
        "outletWeekly": _weekly_records(outlet_weekly, "outlet"),
        "skuDrifts": sku_drifts,
        "outletDrifts": outlet_drifts,
        "triageRows": triage_rows,
        "outletShiftRows": _outlet_shift_records(outlet_shift_frame),
        "heatmapCells": _heatmap_records(filtered, rate_pivot, volume_pivot),
        "outletSummary": _outlet_summary(filtered, outlet_drifts),
        "telemetry": _telemetry_payload(telemetry_raw, triage_rows, sku_drifts, outlet_drifts),
        "briefText": brief_text,
        "briefEngine": brief_engine,
    }


app = FastAPI(title="Reading through the Stars API", version="1.0.0")


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/v1/benchmark")
def benchmark() -> dict[str, Any]:
    frame = generate_qsr_benchmark_dataset()
    return {
        "sourceLabel": "QSR Multi-Brand Benchmark",
        "rows": _records(frame),
    }


@app.post("/api/v1/analyze")
def analyze(request: AnalysisRequest) -> dict[str, Any]:
    return _analyze(request)
