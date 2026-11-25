import { LEXICON, scoreVader } from "./vader";
import type { ProcessedReview, SentimentLabel, ValidationMetrics } from "./types";

const HOSPITALITY_LEXICON_UPDATES: Record<string, number> = {
  soggy: -2.4,
  lukewarm: -1.8,
  tepid: -1.8,
  spilled: -2.6,
  leaked: -2.5,
  leaking: -2.5,
  crushed: -2.3,
  missing: -2.2,
  forgot: -1.9,
  undercooked: -2.6,
  overcooked: -2.1,
  rubbery: -2.2,
  stale: -2.5,
  "stone cold": -3.1,
  "ice cold": -3.0,
  unhelpful: -2.1,
  "piping hot": 2.4,
  crispy: 1.6,
  fresh: 1.8,
};

let lexiconInitialized = false;
function ensureHospitalityLexicon() {
  if (lexiconInitialized) return;
  Object.assign(LEXICON, HOSPITALITY_LEXICON_UPDATES);
  lexiconInitialized = true;
}

// General-purpose unigram baseline lexicon (mirrors standard general-domain polarity baseline
// without hospitality operational boosts or negation-intensifier heuristics)
const BASELINE_POLARITY_LEX: Record<string, [number, number]> = {
  awesome: [1.0, 1.0],
  exceptional: [0.85, 0.9],
  great: [0.8, 0.75],
  excellent: [1.0, 1.0],
  amazing: [0.6, 0.9],
  wonderful: [1.0, 1.0],
  best: [1.0, 0.3],
  good: [0.7, 0.6],
  nice: [0.6, 1.0],
  delicious: [1.0, 1.0],
  tasty: [0.7, 0.7],
  loved: [0.7, 0.8],
  love: [0.5, 0.6],
  friendly: [0.375, 0.5],
  polite: [0.5, 0.6],
  attentive: [0.5, 0.7],
  clean: [0.367, 0.7],
  neatly: [0.4, 0.6],
  quick: [0.333, 0.5],
  fast: [0.2, 0.6],
  super: [0.333, 0.667],
  hot: [0.25, 0.85],
  warm: [0.6, 0.6],
  generous: [0.6, 0.7],
  flavorful: [0.5, 0.7],
  decent: [0.167, 0.667],
  cold: [-0.6, 1.0],
  slow: [-0.3, 0.4],
  late: [-0.3, 0.6],
  terrible: [-1.0, 1.0],
  horrible: [-1.0, 1.0],
  worst: [-1.0, 1.0],
  bad: [-0.7, 0.667],
  disappointed: [-0.75, 0.75],
  unacceptable: [-0.8, 0.9],
  rude: [-0.3, 0.6],
  messy: [-0.5, 0.7],
  ruined: [-0.8, 0.8],
  dry: [-0.067, 0.467],
  hard: [-0.292, 0.542],
  stale: [-0.5, 0.5],
};

function scoreBaselineLexicon(text: string): { polarity: number; subjectivity: number } {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  if (words.length === 0) return { polarity: 0, subjectivity: 0 };

  let polSum = 0;
  let subSum = 0;
  let hits = 0;
  for (let i = 0; i < words.length; i++) {
    const entry = BASELINE_POLARITY_LEX[words[i]];
    if (entry) {
      let [p, s] = entry;
      // Basic immediate "not" inversion
      if (i > 0 && (words[i - 1] === "not" || words[i - 1] === "no")) {
        p = -p * 0.5;
      }
      polSum += p;
      subSum += s;
      hits++;
    }
  }
  if (hits === 0) return { polarity: 0, subjectivity: 0 };
  const polarity = Math.max(-1, Math.min(1, polSum / hits));
  const subjectivity = Math.max(0, Math.min(1, subSum / hits));
  return {
    polarity: Math.round(polarity * 10000) / 10000,
    subjectivity: Math.round(subjectivity * 10000) / 10000,
  };
}

export function classifyPolarityBand(compound: number, deadband = 0.05): SentimentLabel {
  if (compound > deadband) return "Positive";
  if (compound < -deadband) return "Negative";
  return "Neutral";
}

function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den > 1e-9 ? num / den : 0;
}

export function scoreDualLexicon<T extends { pathASentimentText: string; rating: number }>(
  items: T[]
): {
  scored: Array<
    T & {
      vaderCompound: number;
      vaderPos: number;
      vaderNeg: number;
      vaderNeu: number;
      sentimentLabel: SentimentLabel;
      baselinePolarity: number;
      baselineSubjectivity: number;
      baselineLabel: SentimentLabel;
      lexiconAgreement: boolean;
    }
  >;
  metrics: ValidationMetrics;
} {
  ensureHospitalityLexicon();

  const scored = items.map((item) => {
    const vs = scoreVader(item.pathASentimentText);
    const vaderCompound = Math.round(vs.compound * 10000) / 10000;
    const sentimentLabel = classifyPolarityBand(vaderCompound);

    const base = scoreBaselineLexicon(item.pathASentimentText);
    const baselineLabel = classifyPolarityBand(base.polarity);

    return {
      ...item,
      vaderCompound,
      vaderPos: Math.round(vs.pos * 10000) / 10000,
      vaderNeg: Math.round(vs.neg * 10000) / 10000,
      vaderNeu: Math.round(vs.neu * 10000) / 10000,
      sentimentLabel,
      baselinePolarity: base.polarity,
      baselineSubjectivity: base.subjectivity,
      baselineLabel,
      lexiconAgreement: sentimentLabel === baselineLabel,
    };
  });

  const metrics = computeValidationMetrics(scored);
  return { scored, metrics };
}

export function computeValidationMetrics(
  rows: Array<
    Pick<
      ProcessedReview,
      "rating" | "vaderCompound" | "baselinePolarity" | "baselineSubjectivity" | "lexiconAgreement"
    >
  >
): ValidationMetrics {
  if (rows.length === 0) {
    return {
      vaderPearsonR: 0,
      baselinePearsonR: 0,
      vaderLiftPct: 0,
      lexiconAgreementPct: 0,
      meanVaderCompound: 0,
      meanSubjectivity: 0,
    };
  }
  const ratings = rows.map((r) => r.rating);
  const vaders = rows.map((r) => r.vaderCompound);
  const bases = rows.map((r) => r.baselinePolarity);

  const rVader = pearsonCorrelation(ratings, vaders);
  const rBase = pearsonCorrelation(ratings, bases);
  const liftPct = Math.abs(rBase) > 1e-6 ? ((rVader - rBase) / Math.abs(rBase)) * 100 : 0;

  let agreeCount = 0;
  let vaderSum = 0;
  let subSum = 0;
  for (const r of rows) {
    if (r.lexiconAgreement) agreeCount++;
    vaderSum += r.vaderCompound;
    subSum += r.baselineSubjectivity;
  }

  return {
    vaderPearsonR: Math.round(rVader * 1000) / 1000,
    baselinePearsonR: Math.round(rBase * 1000) / 1000,
    vaderLiftPct: Math.round(liftPct * 10) / 10,
    lexiconAgreementPct: Math.round((agreeCount / rows.length) * 1000) / 10,
    meanVaderCompound: Math.round((vaderSum / rows.length) * 1000) / 1000,
    meanSubjectivity: Math.round((subSum / rows.length) * 1000) / 1000,
  };
}
