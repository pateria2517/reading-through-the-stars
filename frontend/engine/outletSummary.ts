import type { DriftAlert, OutletSummaryRow, ProcessedReview } from "./types";

export function buildOutletSummary(
  rows: ProcessedReview[],
  outletDrifts: DriftAlert[]
): OutletSummaryRow[] {
  const driftingOutlets = new Set(outletDrifts.map((d) => d.entityName));
  const map = new Map<
    string,
    {
      count: number;
      ratingSum: number;
      vaderSum: number;
      negCount: number;
      hiddenCount: number;
      defectCount: number;
    }
  >();

  for (const r of rows) {
    let g = map.get(r.outlet);
    if (!g) {
      g = { count: 0, ratingSum: 0, vaderSum: 0, negCount: 0, hiddenCount: 0, defectCount: 0 };
      map.set(r.outlet, g);
    }
    g.count++;
    g.ratingSum += r.rating;
    g.vaderSum += r.vaderCompound;
    if (r.sentimentLabel === "Negative") g.negCount++;
    if (r.divergenceClass === "Hidden_Risk") g.hiddenCount++;
    if (r.hasOperationalDefect) g.defectCount++;
  }

  return Array.from(map.entries())
    .map(([outlet, g]) => ({
      outlet,
      cleanReviews: g.count,
      avgStarRating: Math.round((g.ratingSum / g.count) * 100) / 100,
      meanVaderPolarity: Math.round((g.vaderSum / g.count) * 1000) / 1000,
      negativeSharePct: Math.round((g.negCount / g.count) * 1000) / 10,
      hiddenRiskCount: g.hiddenCount,
      defectMentions: g.defectCount,
      defectRatePct: Math.round((g.defectCount / g.count) * 1000) / 10,
      isDrifting: driftingOutlets.has(outlet),
    }))
    .sort((a, b) => a.meanVaderPolarity - b.meanVaderPolarity);
}
