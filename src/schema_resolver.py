import re
import pandas as pd
import numpy as np

COLUMN_SYNONYMS = {
    "text": ["review_text", "review", "text", "comment", "feedback", "comments", "body", "content", "description", "customer_review"],
    "rating": ["rating", "stars", "star_rating", "score", "rate", "overall_rating", "review_rating"],
    "timestamp": ["timestamp", "date", "review_date", "created_at", "time", "datetime", "order_date", "submitted_at"],
    "sku": ["sku", "item", "menu_item", "product", "dish", "food_item", "product_name", "item_name"],
    "outlet": ["outlet", "branch", "store", "location", "restaurant", "brand", "city", "outlet_name", "store_name"],
}

DEFAULT_SKU_DICTIONARY = {
    "Margherita Pizza": ["margherita", "margarita", "cheese pizza"],
    "Pepperoni Pizza": ["pepperoni"],
    "Farmhouse Pizza": ["farmhouse", "veggie pizza"],
    "Garlic Breadsticks": ["garlic bread", "breadsticks", "stuffed garlic"],
    "Peri-Peri Chicken Burger": ["peri-peri", "peri peri", "chicken burger", "burger"],
    "Crispy Fries": ["fries", "french fries"],
    "Chicken Burrito Bowl": ["burrito bowl", "rice bowl"],
    "Paneer Burrito": ["paneer burrito", "burrito", "wrap"],
    "Salsa & Nachos": ["salsa", "nachos", "guacamole", "chips"],
    "Iced Caramel Macchiato": ["macchiato", "caramel", "iced coffee"],
    "Caffe Latte": ["latte", "cappuccino", "espresso"],
    "Cold Brew": ["cold brew", "americano"],
    "Hyderabadi Biryani": ["biryani", "raita", "salan"],
    "Butter Chicken": ["butter chicken", "naan", "dal makhani"],
}


def resolve_columns(df: pd.DataFrame) -> dict:
    """Zero-config column resolution using multi-tier synonym matching and statistical heuristics."""
    cols_lower = {c.lower().strip(): c for c in df.columns}
    resolved = {"text": None, "rating": None, "timestamp": None, "sku": None, "outlet": None}

    # Tier 1: Exact or substring synonym match
    for target, synonyms in COLUMN_SYNONYMS.items():
        for syn in synonyms:
            if syn in cols_lower:
                resolved[target] = cols_lower[syn]
                break
        if resolved[target] is None:
            for syn in synonyms:
                for cl, orig in cols_lower.items():
                    if syn in cl and orig not in resolved.values():
                        resolved[target] = orig
                        break
                if resolved[target] is not None:
                    break

    # Tier 2: Statistical heuristics for missing text or rating
    if resolved["text"] is None:
        best_col, best_len = None, 0.0
        for col in df.columns:
            if col in resolved.values():
                continue
            if df[col].dtype == object:
                avg_len = df[col].dropna().astype(str).str.len().mean()
                if avg_len and avg_len > 15 and avg_len > best_len:
                    best_len = avg_len
                    best_col = col
        resolved["text"] = best_col

    if resolved["rating"] is None:
        for col in df.columns:
            if col in resolved.values():
                continue
            num_s = pd.to_numeric(df[col], errors="coerce").dropna()
            if len(num_s) > 0 and num_s.min() >= 0 and num_s.max() <= 100:
                if num_s.nunique() <= 20:
                    resolved["rating"] = col
                    break

    return resolved


def normalize_rating_scale(series: pd.Series) -> tuple[pd.Series, str]:
    """Computes P90 of incoming rating distribution to normalize 10-pt or 100-pt scales onto [1.0, 5.0]."""
    num = pd.to_numeric(series, errors="coerce")
    valid = num.dropna()
    if len(valid) == 0:
        return num, "Unknown"
    p90 = np.percentile(valid, 90)
    max_val = valid.max()

    if p90 > 10.0 or max_val > 10.0:
        # 100-point NPS / percentage scale -> [1.0, 5.0]
        scaled = 1.0 + (num / 100.0) * 4.0
        scale_label = "0-100 Scale (Normalized to 1-5★)"
    elif p90 > 5.0 or max_val > 5.0:
        # 10-point scale -> [1.0, 5.0]
        scaled = 1.0 + ((num - 1.0) / 9.0) * 4.0
        scaled = scaled.clip(1.0, 5.0)
        scale_label = "1-10 Scale (Normalized to 1-5★)"
    else:
        scaled = num
        scale_label = "Native 1-5★ Scale"

    return scaled.round(2), scale_label


def extract_sku(text: str, custom_dict: dict = None) -> str:
    """Scans review text against brand SKU dictionary when dedicated SKU column is absent."""
    if not isinstance(text, str) or not text.strip():
        return "General / Unspecified"
    sku_map = custom_dict if custom_dict else DEFAULT_SKU_DICTIONARY
    low = text.lower()
    for sku_name, keywords in sku_map.items():
        for kw in keywords:
            if re.search(rf"\b{re.escape(kw.lower())}\b", low):
                return sku_name
    return "General Menu"


def assign_shift_slot(hour: int) -> str:
    """Derives operational time_slot from 24-hour clock."""
    if 6 <= hour < 11:
        return "Morning (06-11h)"
    elif 11 <= hour < 15:
        return "Lunch (11-15h)"
    elif 15 <= hour < 18:
        return "Afternoon (15-18h)"
    elif 18 <= hour < 22:
        return "Evening (18-22h)"
    else:
        return "Late Night (22-06h)"


def derive_temporal_features(df: pd.DataFrame, ts_col: str) -> pd.DataFrame:
    """Parses timestamps and attaches day_of_week, hour, is_weekend, operational_slot, and iso_week."""
    out = df.copy()
    dt = pd.to_datetime(out[ts_col], errors="coerce")
    out["_parsed_dt"] = dt
    out["day_of_week"] = dt.dt.day_name()
    out["day_num"] = dt.dt.dayofweek
    out["hour"] = dt.dt.hour
    out["is_weekend"] = out["day_num"].isin([4, 5, 6])  # Fri, Sat, Sun QSR peak weekend
    out["shift_slot"] = out["hour"].apply(lambda h: assign_shift_slot(int(h)) if pd.notna(h) else "Unknown")
    iso = dt.dt.isocalendar()
    out["iso_year_week"] = iso["year"].astype(str) + "-W" + iso["week"].astype(str).str.zfill(2)
    return out
