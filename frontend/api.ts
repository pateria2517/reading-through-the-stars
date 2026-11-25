import type {
  ColumnMapping,
  DriftAlert,
  FunnelStats,
  OutletShiftTriageRow,
  OutletSummaryRow,
  ProcessedReview,
  ShiftHeatmapCell,
  TriageRow,
  ValidationMetrics,
  VerifiedTelemetryPayload,
  WeeklyEntityMetric,
} from "./engine/types";

export interface BenchmarkPayload {
  sourceLabel: string;
  rows: Record<string, unknown>[];
}

export interface AnalysisInput {
  rows: Record<string, unknown>[];
  colOverrides: Partial<ColumnMapping>;
  selectedOutlets: string[] | null;
  selectedSlots: string[] | null;
  ratingRange: [number, number];
  useOllama: boolean;
  ollamaModel: string;
}

export interface AnalysisResult {
  columns: string[];
  allOutlets: string[];
  allSlots: string[];
  reviews: ProcessedReview[];
  funnelStats: FunnelStats;
  validationMetrics: ValidationMetrics;
  skuWeekly: WeeklyEntityMetric[];
  outletWeekly: WeeklyEntityMetric[];
  skuDrifts: DriftAlert[];
  outletDrifts: DriftAlert[];
  triageRows: TriageRow[];
  outletShiftRows: OutletShiftTriageRow[];
  heatmapCells: ShiftHeatmapCell[];
  outletSummary: OutletSummaryRow[];
  telemetry: VerifiedTelemetryPayload;
  briefText: string;
  briefEngine: string;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, init);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`The analysis service returned an invalid response (${response.status}).`);
  }

  if (!response.ok) {
    const body = payload as { detail?: unknown } | null;
    const detail = body?.detail;
    const message = typeof detail === "string"
      ? detail
      : Array.isArray(detail)
        ? detail.map((item) => {
            if (item && typeof item === "object" && "msg" in item) {
              return String(item.msg);
            }
            return String(item);
          }).join("; ")
        : `Analysis request failed (${response.status}).`;
    throw new Error(message);
  }

  return payload as T;
}

export function fetchBenchmark(signal?: AbortSignal): Promise<BenchmarkPayload> {
  return requestJson<BenchmarkPayload>("/benchmark", { signal });
}

export function analyzeDataset(
  input: AnalysisInput,
  signal?: AbortSignal
): Promise<AnalysisResult> {
  return requestJson<AnalysisResult>("/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
}
