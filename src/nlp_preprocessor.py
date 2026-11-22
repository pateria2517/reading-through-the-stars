import re
import pandas as pd

# 108 conversational filler stop-words (O(1) hash-set lookup), explicitly excluding negations & operational nouns
STOPWORDS_108 = frozenset({
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and",
    "any", "are", "as", "at", "be", "because", "been", "before", "being", "below",
    "between", "both", "but", "by", "can", "could", "did", "do", "does", "doing",
    "down", "during", "each", "few", "for", "from", "further", "had", "has", "have",
    "having", "he", "her", "here", "hers", "herself", "him", "himself", "his", "how",
    "i", "if", "in", "into", "is", "it", "its", "itself", "just", "me", "more",
    "most", "my", "myself", "now", "of", "off", "on", "once", "only", "or", "other",
    "our", "ours", "ourselves", "out", "over", "own", "same", "she", "should", "so",
    "some", "such", "than", "that", "the", "their", "theirs", "them", "themselves",
    "then", "there", "these", "they", "this", "those", "through", "to", "too", "under",
    "until", "up", "very", "was", "we", "were", "what", "when", "where", "which",
    "while", "who", "whom", "why", "will", "with", "would", "you", "your", "yours",
    "yourself", "yourselves", "also", "really", "actually", "basically", "literally",
    "got", "get", "ordered", "order", "food", "restaurant", "place", "went", "came",
})

PROTECTED_TOKENS = frozenset({
    "not", "no", "never", "hardly", "barely", "neither", "nor", "nothing", "nowhere",
    "packaging", "package", "rider", "delivery", "crust", "lid", "foil", "bag", "box",
    "cold", "hot", "warm", "lukewarm", "tepid", "stale", "soggy", "missing", "forgot",
    "spilled", "leaked", "crushed", "torn", "late", "slow", "rude", "staff", "manager",
})


def preprocess_dual_path(text: str) -> tuple[str, str]:
    """
    Splits review text into two specialized streams:
      Path A (Sentiment-Preserving): Retains ALL-CAPS emphasis, exclamation intensity, and negations.
      Path B (Lexical Root-Cause): Normalizes casing, removes 108 conversational fillers via O(1) lookup,
                                   and protects operational nouns and negation modifiers.
    """
    if not isinstance(text, str):
        return "", ""

    # Path A: Clean whitespace/URLs while keeping ALL-CAPS, punctuation (!!!), and negations intact
    path_a = re.sub(r"http\S+|www\.\S+", "", text)
    path_a = re.sub(r"\s+", " ", path_a).strip()

    # Path B: Lowercase, tokenize, O(1) stopword filter while preserving protected operational/negation words
    lowered = re.sub(r"[^a-z0-9\s'-]", " ", path_a.lower())
    tokens = lowered.split()
    filtered_tokens = [
        tok for tok in tokens
        if (tok in PROTECTED_TOKENS) or (tok not in STOPWORDS_108 and len(tok) > 1)
    ]
    path_b = " ".join(filtered_tokens)

    return path_a, path_b


def apply_dual_path_nlp(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    results = out["raw_text"].apply(preprocess_dual_path)
    out["path_a_sentiment_text"] = [r[0] for r in results]
    out["path_b_lexical_text"] = [r[1] for r in results]
    return out
