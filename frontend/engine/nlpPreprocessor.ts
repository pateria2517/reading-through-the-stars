export const STOPWORDS_108 = new Set<string>([
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
]);

export const PROTECTED_TOKENS = new Set<string>([
  "not", "no", "never", "hardly", "barely", "neither", "nor", "nothing", "nowhere",
  "packaging", "package", "rider", "delivery", "crust", "lid", "foil", "bag", "box",
  "cold", "hot", "warm", "lukewarm", "tepid", "stale", "soggy", "missing", "forgot",
  "spilled", "leaked", "crushed", "torn", "late", "slow", "rude", "staff", "manager",
]);

export function preprocessDualPath(text: string): { pathA: string; pathB: string } {
  if (!text) return { pathA: "", pathB: "" };
  const pathA = text
    .replace(/http\S+|www\.\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const lowered = pathA.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ");
  const tokens = lowered.split(/\s+/).filter(Boolean);
  const filtered = tokens.filter(
    (tok) => PROTECTED_TOKENS.has(tok) || (!STOPWORDS_108.has(tok) && tok.length > 1)
  );
  return { pathA, pathB: filtered.join(" ") };
}
