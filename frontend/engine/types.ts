export type TriageTier = "CRITICAL" | "CAUTION" | "REVIEW" | "HEALTHY";
export type SentimentLabel = "Positive" | "Neutral" | "Negative";
export type DivergenceClass = "Hidden_Risk" | "Rating_Mismatch" | "Aligned";

export type FailureModeKey =
  | "cold_food"
  | "service_delay"
  | "packaging"
  | "missing_items"
  | "stale_food"
  | "rude_staff";

export interface ColumnMapping {
  text: string | null;
  rating: string | null;
  timestamp: string | null;
  sku: string | null;
  outlet: string | null;
}

export interface FunnelStats {
  rawTotal: number;
  resolvedColumns: ColumnMapping;
  scaleDetected: string;
  timestampsSynthetic: boolean;
  droppedBlankText: number;
  droppedDuplicates: number;
  droppedNonLatinNoise: number;
  droppedBadTimestamp: number;
  droppedBadRating: number;
  retainedClean: number;
  retentionPct: number;
}

export interface ProcessedReview {
  reviewId: string;
  rawText: string;
  rawRating: unknown;
  rating: number;
  outlet: string;
  sku: string;
  parsedTs: number;
  isoDate: string;
  dayOfWeek: string;
  dayNum: number; // 0 = Mon ... 6 = Sun
  hour: number;
  isWeekend: boolean;
  shiftSlot: string;
  isoYearWeek: string;
  pathASentimentText: string;
  pathBLexicalText: string;
  vaderCompound: number;
  vaderPos: number;
  vaderNeg: number;
  vaderNeu: number;
  sentimentLabel: SentimentLabel;
  baselinePolarity: number;
  baselineSubjectivity: number;
  baselineLabel: SentimentLabel;
  lexiconAgreement: boolean;
  divergenceClass: DivergenceClass;
  divergenceGap: number;
  divergenceSource: string;
  modes: Record<FailureModeKey, boolean>;
  matchedFailureModes: string;
  primaryFailureMode: string;
  hasOperationalDefect: boolean;
}

export interface ValidationMetrics {
  vaderPearsonR: number;
  baselinePearsonR: number;
  vaderLiftPct: number;
  lexiconAgreementPct: number;
  meanVaderCompound: number;
  meanSubjectivity: number;
}

export interface WeeklyEntityMetric {
  entity: string;
  isoYearWeek: string;
  reviewCount: number;
  meanSentiment: number;
  meanRating: number;
  negShare: number;
}

export interface DriftAlert {
  entityType: "SKU" | "OUTLET";
  entityName: string;
  consecutiveWeeks: number;
  window: string;
  startSentiment: number;
  endSentiment: number;
  netErosion: number;
  trajectory: string;
  totalMentions: number;
}

export interface TriageRow {
  modeKey: FailureModeKey;
  failureMode: string;
  responsibleStation: string;
  mentions: number;
  negativeMentions: number;
  negativeSharePct: number;
  meanSentiment: number;
  primaryOutletHotspot: string;
  peakShiftHotspot: string;
  triageTier: TriageTier;
  automatedSopAction: string;
}

export interface OutletShiftTriageRow {
  outlet: string;
  shiftSlot: string;
  failureMode: string;
  station: string;
  mentions: number;
  negSharePct: number;
  meanSentiment: number;
  triageTier: TriageTier;
  sopAction: string;
}

export interface ShiftHeatmapCell {
  day: string;
  shiftSlot: string;
  negRate: number | null;
  negVol: number;
  totalVol: number;
}

export interface OutletSummaryRow {
  outlet: string;
  cleanReviews: number;
  avgStarRating: number;
  meanVaderPolarity: number;
  negativeSharePct: number;
  hiddenRiskCount: number;
  defectMentions: number;
  defectRatePct: number;
  isDrifting: boolean;
}

export interface StationTimelineRow {
  modeKey: FailureModeKey;
  stationFailure: string;
  startTs: number;
  endTs: number;
  severityTier: TriageTier;
  mentions: number;
  negPct: number;
}

export interface VerifiedTelemetryPayload {
  hygieneSummary: {
    rawReviews: number;
    cleanReviews: number;
    retentionPct: number;
    scaleDetected: string;
  };
  headlineKpis: {
    meanStarRating: number;
    meanVaderPolarity: number;
    vaderPearsonR: number;
    baselinePearsonR: number;
    hiddenRiskCount: number;
    hiddenRiskPct: number;
    ratingMismatchCount: number;
  };
  priorityTriageLanes: TriageRow[];
  skuDriftAlerts: DriftAlert[];
  outletDriftAlerts: DriftAlert[];
  sampleHiddenRiskReviews: Array<{
    outlet: string;
    sku: string;
    rating: number;
    vaderCompound: number;
    shift: string;
    defect: string;
    excerpt: string;
  }>;
}
