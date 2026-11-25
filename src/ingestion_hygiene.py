import io
import json
import re
import pandas as pd

if __package__:
    from .schema_resolver import (
        derive_temporal_features,
        extract_sku,
        normalize_rating_scale,
        parse_timestamps,
        resolve_columns,
    )
else:
    from schema_resolver import (
        derive_temporal_features,
        extract_sku,
        normalize_rating_scale,
        parse_timestamps,
        resolve_columns,
    )


def load_raw_file(file_bytes: bytes, filename: str) -> pd.DataFrame:
    """Multi-format ingestion supporting .csv, .xlsx, .xls, and .json."""
    fname = filename.lower()
    if fname.endswith(".csv"):
        try:
            return pd.read_csv(io.BytesIO(file_bytes))
        except UnicodeDecodeError:
            return pd.read_csv(io.BytesIO(file_bytes), encoding="latin-1")
    elif fname.endswith((".xlsx", ".xls")):
        return pd.read_excel(io.BytesIO(file_bytes))
    elif fname.endswith(".json"):
        raw = json.loads(file_bytes.decode("utf-8", errors="replace"))
        if isinstance(raw, list):
            return pd.DataFrame(raw)
        elif isinstance(raw, dict):
            for k in ["reviews", "data", "records", "items"]:
                if k in raw and isinstance(raw[k], list):
                    return pd.DataFrame(raw[k])
            return pd.DataFrame([raw])
    raise ValueError(f"Unsupported file format: {filename}. Upload CSV, Excel, or JSON.")


def _ascii_alpha_ratio(text: str) -> float:
    if not text:
        return 0.0
    non_space = re.sub(r"\s+", "", text)
    if len(non_space) == 0:
        return 0.0
    ascii_alpha = sum(1 for ch in non_space if ("a" <= ch.lower() <= "z"))
    return ascii_alpha / len(non_space)


def run_hygiene_funnel(
    df_raw: pd.DataFrame,
    col_overrides: dict = None,
    custom_sku_dict: dict = None,
) -> tuple[pd.DataFrame, dict]:
    """
    Executes the deterministic 6-Stage Data Hygiene Funnel:
      Stage 1: Schema resolution & scale normalization
      Stage 2: Rating-only blank rows (< 2 characters of text)
      Stage 3: Exact & retry-submission duplicates (normalized text + date composite key)
      Stage 4: Non-Latin script noise & encoding corruption (< 40% ASCII alphabetic ratio)
      Stage 5: Malformed or unparseable timestamps
      Stage 6: Out-of-bounds rating corruption (< 1.0 or > 5.0 after normalization)
    """
    raw_count = len(df_raw)
    resolved = resolve_columns(df_raw)
    if col_overrides:
        for k, v in col_overrides.items():
            if v and v in df_raw.columns:
                resolved[k] = v

    if not resolved["text"] or not resolved["rating"]:
        raise ValueError(
            "Could not automatically detect Review Text or Star Rating columns. "
            "Please map them manually in the sidebar."
        )

    work = pd.DataFrame()
    work["raw_text"] = df_raw[resolved["text"]].fillna("").astype(str)
    work["raw_rating"] = df_raw[resolved["rating"]]
    work["rating"], scale_info = normalize_rating_scale(work["raw_rating"])

    timestamps_synthetic = not resolved["timestamp"]
    if resolved["timestamp"]:
        work["raw_timestamp"] = parse_timestamps(df_raw[resolved["timestamp"]])
    else:
        # Fallback synthetic sequential dates if dataset has no timestamp column
        work["raw_timestamp"] = pd.date_range(end=pd.Timestamp.today(), periods=len(df_raw), freq="h")

    if resolved["outlet"]:
        work["outlet"] = df_raw[resolved["outlet"]].fillna("Main Outlet").astype(str).str.strip()
    else:
        work["outlet"] = "Flagship Outlet"

    has_explicit_sku = resolved["sku"] is not None
    if has_explicit_sku:
        work["sku"] = df_raw[resolved["sku"]].fillna("").astype(str).str.strip()
    else:
        work["sku"] = ""

    funnel_stats = {
        "raw_total": raw_count,
        "resolved_columns": resolved,
        "scale_detected": scale_info,
        "timestamps_synthetic": timestamps_synthetic,
        "dropped_blank_text": 0,
        "dropped_duplicates": 0,
        "dropped_non_latin_noise": 0,
        "dropped_bad_timestamp": 0,
        "dropped_bad_rating": 0,
        "retained_clean": 0,
        "retention_pct": 0.0,
    }

    # Stage 2: Rating-only blank rows (< 2 characters of stripped text)
    mask_blank = work["raw_text"].str.strip().str.len() < 2
    funnel_stats["dropped_blank_text"] = int(mask_blank.sum())
    work = work[~mask_blank].copy()

    # Stage 3: Exact & retry-submission duplicates (text + date composite key)
    dt_temp = pd.to_datetime(work["raw_timestamp"], errors="coerce")
    date_key = dt_temp.dt.strftime("%Y-%m-%d").fillna("NO_DATE")
    text_key = work["raw_text"].str.strip().str.lower().str.replace(r"\s+", " ", regex=True)
    work["_dedup_key"] = text_key + "||" + date_key + "||" + work["outlet"].str.lower()
    mask_dup = work.duplicated(subset=["_dedup_key"], keep="first")
    funnel_stats["dropped_duplicates"] = int(mask_dup.sum())
    work = work[~mask_dup].drop(columns=["_dedup_key"]).copy()

    # Stage 4: Non-Latin script noise & encoding corruption (< 40% ASCII alphabetic ratio)
    ratios = work["raw_text"].apply(_ascii_alpha_ratio)
    mask_noise = ratios < 0.40
    funnel_stats["dropped_non_latin_noise"] = int(mask_noise.sum())
    work = work[~mask_noise].copy()

    # Stage 5: Malformed or unparseable timestamps
    work = derive_temporal_features(work, "raw_timestamp")
    mask_bad_ts = work["_parsed_dt"].isna()
    funnel_stats["dropped_bad_timestamp"] = int(mask_bad_ts.sum())
    work = work[~mask_bad_ts].copy()

    # Stage 6: Out-of-bounds rating corruption
    mask_bad_rating = work["rating"].isna() | (work["rating"] < 1.0) | (work["rating"] > 5.0)
    funnel_stats["dropped_bad_rating"] = int(mask_bad_rating.sum())
    work = work[~mask_bad_rating].copy()

    # Fill or extract SKU
    if has_explicit_sku:
        empty_sku = work["sku"].str.len() == 0
        work.loc[empty_sku, "sku"] = work.loc[empty_sku, "raw_text"].apply(
            lambda t: extract_sku(t, custom_sku_dict)
        )
    else:
        work["sku"] = work["raw_text"].apply(lambda t: extract_sku(t, custom_sku_dict))

    work = work.sort_values("_parsed_dt").reset_index(drop=True)
    work["review_id"] = [f"REV-{i+1:05d}" for i in range(len(work))]

    funnel_stats["retained_clean"] = len(work)
    funnel_stats["retention_pct"] = round((len(work) / raw_count * 100.0) if raw_count > 0 else 0.0, 1)

    return work, funnel_stats
