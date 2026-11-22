import numpy as np
import pandas as pd
from textblob import TextBlob

try:
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
except ImportError:
    from nltk.sentiment.vader import SentimentIntensityAnalyzer

_VADER = SentimentIntensityAnalyzer()

# Hospitality domain lexicon boost for VADER so QSR operational terms score with realistic severity
HOSPITALITY_LEXICON_UPDATES = {
    "soggy": -2.4,
    "lukewarm": -1.8,
    "tepid": -1.8,
    "spilled": -2.6,
    "leaked": -2.5,
    "leaking": -2.5,
    "crushed": -2.3,
    "missing": -2.2,
    "forgot": -1.9,
    "undercooked": -2.6,
    "overcooked": -2.1,
    "rubbery": -2.2,
    "stale": -2.5,
    "stone cold": -3.1,
    "ice cold": -3.0,
    "unhelpful": -2.1,
    "piping hot": 2.4,
    "crispy": 1.6,
    "fresh": 1.8,
}
_VADER.lexicon.update(HOSPITALITY_LEXICON_UPDATES)


def classify_polarity_band(compound: float, deadband: float = 0.05) -> str:
    """Strict ±0.05 deadband classification."""
    if compound > deadband:
        return "Positive"
    elif compound < -deadband:
        return "Negative"
    return "Neutral"


def score_dual_lexicon(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """
    Runs Primary Engine (VADER Compound Polarity on Path A) and
    Secondary Baseline (TextBlob Polarity & Subjectivity) in parallel.
    Computes empirical Pearson correlation with ground-truth star ratings.
    """
    out = df.copy()

    vader_compounds = []
    vader_pos = []
    vader_neg = []
    vader_neu = []
    tb_polarity = []
    tb_subjectivity = []

    for text in out["path_a_sentiment_text"]:
        vs = _VADER.polarity_scores(text)
        vader_compounds.append(round(vs["compound"], 4))
        vader_pos.append(round(vs["pos"], 4))
        vader_neg.append(round(vs["neg"], 4))
        vader_neu.append(round(vs["neu"], 4))

        tb = TextBlob(text).sentiment
        tb_polarity.append(round(tb.polarity, 4))
        tb_subjectivity.append(round(tb.subjectivity, 4))

    out["vader_compound"] = vader_compounds
    out["vader_pos"] = vader_pos
    out["vader_neg"] = vader_neg
    out["vader_neu"] = vader_neu
    out["sentiment_label"] = out["vader_compound"].apply(classify_polarity_band)

    out["textblob_polarity"] = tb_polarity
    out["textblob_subjectivity"] = tb_subjectivity
    out["tb_label"] = out["textblob_polarity"].apply(classify_polarity_band)
    out["lexicon_agreement"] = out["sentiment_label"] == out["tb_label"]

    # Empirical Pearson correlation against ground-truth star ratings
    r_vader = 0.0
    r_tb = 0.0
    if len(out) > 2 and out["rating"].std() > 0:
        if out["vader_compound"].std() > 0:
            r_vader = float(np.corrcoef(out["rating"], out["vader_compound"])[0, 1])
        if out["textblob_polarity"].std() > 0:
            r_tb = float(np.corrcoef(out["rating"], out["textblob_polarity"])[0, 1])

    lift_pct = ((r_vader - r_tb) / abs(r_tb) * 100.0) if abs(r_tb) > 1e-6 else 0.0

    validation_metrics = {
        "vader_pearson_r": round(r_vader, 3),
        "textblob_pearson_r": round(r_tb, 3),
        "vader_lift_pct": round(lift_pct, 1),
        "lexicon_agreement_pct": round(float(out["lexicon_agreement"].mean() * 100.0), 1) if len(out) else 0.0,
        "mean_vader_compound": round(float(out["vader_compound"].mean()), 3) if len(out) else 0.0,
        "mean_subjectivity": round(float(out["textblob_subjectivity"].mean()), 3) if len(out) else 0.0,
    }

    return out, validation_metrics
