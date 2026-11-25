import Papa from "papaparse";
import { auditAndClassifyReviews } from "./diagnosticAnalytics";
import { preprocessDualPath } from "./nlpPreprocessor";
import {
  extractSku,
  getTemporalMetadata,
  normalizeRatingScale,
  parseTimestamps,
  resolveColumns,
} from "./schemaResolver";
import { scoreDualLexicon } from "./sentimentEngine";
import type { ColumnMapping, FunnelStats, ProcessedReview, ValidationMetrics } from "./types";

function asciiAlphaRatio(text: string): number {
  if (!text) return 0;
  const nonSpace = text.replace(/\s+/g, "");
  if (nonSpace.length === 0) return 0;
  let ascii = 0;
  for (let i = 0; i < nonSpace.length; i++) {
    const code = nonSpace.charCodeAt(i);
    if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) ascii++;
  }
  return ascii / nonSpace.length;
}

export async function parseUploadedFile(file: File): Promise<Record<string, unknown>[]> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".csv")) {
    const text = await file.text();
    const res = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });
    if (res.errors.length > 0 && res.data.length === 0) {
      throw new Error(`CSV parse error: ${res.errors[0].message}`);
    }
    return res.data;
  }

  if (name.endsWith(".json")) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") {
      for (const k of ["reviews", "data", "records", "items"]) {
        if (Array.isArray(parsed[k])) return parsed[k];
      }
      return [parsed];
    }
    throw new Error("Unsupported JSON structure.");
  }

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const firstSheet = wb.SheetNames[0];
    if (!firstSheet) throw new Error("Workbook contains no sheets.");
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[firstSheet], {
      defval: "",
    });
  }

  throw new Error(`Unsupported file format (${file.name}). Upload CSV, Excel, or JSON.`);
}

export function runFullDiagnosticPipeline(
  rawRows: Record<string, unknown>[],
  colOverrides?: Partial<ColumnMapping>
): {
  reviews: ProcessedReview[];
  funnelStats: FunnelStats;
  validationMetrics: ValidationMetrics;
  columns: string[];
} {
  const columns = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
  const resolved = resolveColumns(rawRows);
  if (colOverrides) {
    (Object.keys(colOverrides) as Array<keyof ColumnMapping>).forEach((k) => {
      const v = colOverrides[k];
      if (v && columns.includes(v)) resolved[k] = v;
    });
  }

  if (!resolved.text || !resolved.rating) {
    throw new Error(
      "Could not detect Review Text or Star Rating columns automatically. Map them manually in the Data & Filters drawer."
    );
  }

  const rawTotal = rawRows.length;
  const { scaled: scaledRatings, scaleLabel } = normalizeRatingScale(
    rawRows.map((r) => r[resolved.rating!])
  );

  const timestampsSynthetic = !resolved.timestamp;
  const nowMs = Date.now();
  const parsedTimestamps = resolved.timestamp
    ? parseTimestamps(rawRows.map((r) => r[resolved.timestamp!]))
    : rawRows.map((_, i) => nowMs - (rawTotal - 1 - i) * 3600 * 1000);

  const funnelStats: FunnelStats = {
    rawTotal,
    resolvedColumns: resolved,
    scaleDetected: scaleLabel,
    timestampsSynthetic,
    droppedBlankText: 0,
    droppedDuplicates: 0,
    droppedNonLatinNoise: 0,
    droppedBadTimestamp: 0,
    droppedBadRating: 0,
    retainedClean: 0,
    retentionPct: 0,
  };

  const seenDedup = new Set<string>();
  interface CleanSeed {
    rawText: string;
    rawRating: unknown;
    rating: number;
    outlet: string;
    sku: string;
    parsedTs: number;
    isoDate: string;
    dayOfWeek: string;
    dayNum: number;
    hour: number;
    isWeekend: boolean;
    shiftSlot: string;
    isoYearWeek: string;
  }

  const clean: CleanSeed[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const rawText = String(row[resolved.text] ?? "");
    const rawRating = row[resolved.rating];
    const rating = scaledRatings[i];
    const outlet = resolved.outlet
      ? String(row[resolved.outlet] ?? "Main Outlet").trim() || "Main Outlet"
      : "Flagship Outlet";
    const explicitSku = resolved.sku ? String(row[resolved.sku] ?? "").trim() : "";

    // Stage 2: Blank text (< 2 chars)
    if (rawText.trim().length < 2) {
      funnelStats.droppedBlankText++;
      continue;
    }

    // Stage 3: Duplicates (normalized text + date + outlet)
    const ts = parsedTimestamps[i];
    const dateKey = Number.isNaN(ts)
      ? "NO_DATE"
      : new Date(ts).toISOString().slice(0, 10);
    const textKey = rawText.trim().toLowerCase().replace(/\s+/g, " ");
    const dedupKey = `${textKey}||${dateKey}||${outlet.toLowerCase()}`;
    if (seenDedup.has(dedupKey)) {
      funnelStats.droppedDuplicates++;
      continue;
    }
    seenDedup.add(dedupKey);

    // Stage 4: Non-Latin / encoding noise (< 40% ASCII alpha ratio)
    if (asciiAlphaRatio(rawText) < 0.4) {
      funnelStats.droppedNonLatinNoise++;
      continue;
    }

    // Stage 5: Malformed timestamp
    if (Number.isNaN(ts)) {
      funnelStats.droppedBadTimestamp++;
      continue;
    }

    // Stage 6: Out-of-bounds rating
    if (Number.isNaN(rating) || rating < 1.0 || rating > 5.0) {
      funnelStats.droppedBadRating++;
      continue;
    }

    const temporal = getTemporalMetadata(ts);
    const sku = explicitSku || extractSku(rawText);

    clean.push({
      rawText,
      rawRating,
      rating,
      outlet,
      sku,
      parsedTs: ts,
      ...temporal,
    });
  }

  clean.sort((a, b) => a.parsedTs - b.parsedTs);

  const enriched = clean.map((item, idx) => {
    const { pathA, pathB } = preprocessDualPath(item.rawText);
    return {
      ...item,
      reviewId: `REV-${String(idx + 1).padStart(5, "0")}`,
      pathASentimentText: pathA,
      pathBLexicalText: pathB,
    };
  });

  const { scored, metrics } = scoreDualLexicon(enriched);
  const reviews = auditAndClassifyReviews(scored);

  funnelStats.retainedClean = reviews.length;
  funnelStats.retentionPct =
    rawTotal > 0 ? Math.round((reviews.length / rawTotal) * 1000) / 10 : 0;

  return {
    reviews,
    funnelStats,
    validationMetrics: metrics,
    columns,
  };
}
