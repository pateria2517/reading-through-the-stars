import type {
  DriftAlert,
  FunnelStats,
  ProcessedReview,
  TriageRow,
  ValidationMetrics,
  VerifiedTelemetryPayload,
} from "./types";

export function buildVerifiedTelemetryPayload(params: {
  df: ProcessedReview[];
  funnelStats: FunnelStats;
  validationMetrics: ValidationMetrics;
  triageRows: TriageRow[];
  skuDrifts: DriftAlert[];
  outletDrifts: DriftAlert[];
}): VerifiedTelemetryPayload {
  const { df, funnelStats, validationMetrics, triageRows, skuDrifts, outletDrifts } = params;

  const hiddenRisk = df
    .filter((r) => r.divergenceClass === "Hidden_Risk")
    .sort((a, b) => a.vaderCompound - b.vaderCompound);
  const mismatch = df.filter((r) => r.divergenceClass === "Rating_Mismatch");

  const seenText = new Set<string>();
  const sampleHiddenRiskReviews: VerifiedTelemetryPayload["sampleHiddenRiskReviews"] = [];
  for (const r of hiddenRisk) {
    if (seenText.has(r.rawText)) continue;
    seenText.add(r.rawText);
    sampleHiddenRiskReviews.push({
      outlet: r.outlet,
      sku: r.sku,
      rating: r.rating,
      vaderCompound: r.vaderCompound,
      shift: r.shiftSlot,
      defect: r.matchedFailureModes,
      excerpt: r.rawText.slice(0, 160),
    });
    if (sampleHiddenRiskReviews.length >= 3) break;
  }

  const meanRating =
    df.length > 0 ? Math.round((df.reduce((s, r) => s + r.rating, 0) / df.length) * 100) / 100 : 0;

  return {
    hygieneSummary: {
      rawReviews: funnelStats.rawTotal,
      cleanReviews: funnelStats.retainedClean,
      retentionPct: funnelStats.retentionPct,
      scaleDetected: funnelStats.scaleDetected,
    },
    headlineKpis: {
      meanStarRating: meanRating,
      meanVaderPolarity: validationMetrics.meanVaderCompound,
      vaderPearsonR: validationMetrics.vaderPearsonR,
      baselinePearsonR: validationMetrics.baselinePearsonR,
      hiddenRiskCount: hiddenRisk.length,
      hiddenRiskPct: df.length > 0 ? Math.round((hiddenRisk.length / df.length) * 1000) / 10 : 0,
      ratingMismatchCount: mismatch.length,
    },
    priorityTriageLanes: triageRows.filter(
      (t) => t.triageTier === "CRITICAL" || t.triageTier === "CAUTION"
    ),
    skuDriftAlerts: skuDrifts,
    outletDriftAlerts: outletDrifts,
    sampleHiddenRiskReviews,
  };
}

export function synthesizeBriefingText(telemetry: VerifiedTelemetryPayload): string {
  const kpis = telemetry.headlineKpis;
  const hyg = telemetry.hygieneSummary;
  const lanes = telemetry.priorityTriageLanes;
  const skuDrifts = telemetry.skuDriftAlerts;
  const outletDrifts = telemetry.outletDriftAlerts;
  const hiddenEx = telemetry.sampleHiddenRiskReviews;

  const lines: string[] = [
    "EXECUTIVE OPERATIONAL PULSE",
    `- Analyzed ${hyg.cleanReviews.toLocaleString()} verified reviews (from ${hyg.rawReviews.toLocaleString()} raw records, ${hyg.retentionPct}% hygiene retention).`,
    `- Aggregate Rating: ${kpis.meanStarRating.toFixed(2)} / 5.00 | Mean VADER Polarity: ${kpis.meanVaderPolarity >= 0 ? "+" : ""}${kpis.meanVaderPolarity.toFixed(3)} (Pearson r = ${kpis.vaderPearsonR.toFixed(3)} vs Baseline r = ${kpis.baselinePearsonR.toFixed(3)}).`,
    `- 4-5 Star Hidden Risk: ${kpis.hiddenRiskCount} reviews (${kpis.hiddenRiskPct}%) awarded 4-5 stars while reporting operational defects in text.`,
    "",
    "PRIORITY STATION INTERVENTIONS (CRITICAL & CAUTION LANES)",
  ];

  if (lanes.length > 0) {
    for (const item of lanes) {
      lines.push(
        `- [${item.triageTier}] ${item.failureMode} (${item.mentions} mentions, ${item.negativeSharePct}% negative) | Hotspot: ${item.primaryOutletHotspot} during ${item.peakShiftHotspot} -> SOP: ${item.automatedSopAction}`
      );
    }
  } else {
    lines.push(
      "- All six operational stations are within HEALTHY or REVIEW thresholds (<30% negative concentration)."
    );
  }

  lines.push("", "CONSECUTIVE MULTI-WEEK QUALITY DRIFT WARNINGS");
  if (skuDrifts.length > 0 || outletDrifts.length > 0) {
    for (const d of skuDrifts) {
      lines.push(
        `- [SKU DRIFT] ${d.entityName}: ${d.consecutiveWeeks}-week monotonic slide (${d.window}) from ${d.startSentiment >= 0 ? "+" : ""}${d.startSentiment.toFixed(3)} to ${d.endSentiment >= 0 ? "+" : ""}${d.endSentiment.toFixed(3)} (${d.trajectory}).`
      );
    }
    for (const d of outletDrifts) {
      lines.push(
        `- [OUTLET DRIFT] ${d.entityName}: ${d.consecutiveWeeks}-week monotonic slide (${d.window}) from ${d.startSentiment >= 0 ? "+" : ""}${d.startSentiment.toFixed(3)} to ${d.endSentiment >= 0 ? "+" : ""}${d.endSentiment.toFixed(3)} (${d.trajectory}).`
      );
    }
  } else {
    lines.push("- Zero menu SKUs or outlets triggered a 3+ week consecutive sentiment slide alert.");
  }

  lines.push("", "VERIFIED 4-5 STAR HIDDEN RISK SIGNALS");
  if (hiddenEx.length > 0) {
    for (const ex of hiddenEx) {
      lines.push(
        `- ${ex.outlet} | ${ex.sku} | ${ex.rating.toFixed(1)} stars (VADER ${ex.vaderCompound >= 0 ? "+" : ""}${ex.vaderCompound.toFixed(3)}) | Shift: ${ex.shift} | Defect: ${ex.defect} -> "${ex.excerpt.replace(/"/g, "'")}"`
      );
    }
  } else {
    lines.push("- No 4-5 star Hidden Risk contradictions detected in the active filter slice.");
  }

  return lines.join("\n");
}

export async function downloadShiftHuddlePdf(
  telemetry: VerifiedTelemetryPayload,
  triageRows: TriageRow[],
  briefText: string
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const kpis = telemetry.headlineKpis;
  const hyg = telemetry.hygieneSummary;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text("READING THROUGH THE STARS - SHIFT HUDDLE BRIEF", 36, 40);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    "Hospitality & QSR Operational Triage Intelligence | Deterministic Telemetry & Station SOP Sheet",
    36,
    55
  );
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(1);
  doc.line(36, 63, 559, 63);

  autoTable(doc, {
    startY: 74,
    margin: { left: 36, right: 36 },
    head: [["CLEAN REVIEWS", "AVG RATING", "VADER POLARITY", "VADER vs BASELINE (r)", "4-5* HIDDEN RISK"]],
    body: [
      [
        `${hyg.cleanReviews.toLocaleString()} (${hyg.retentionPct}%)`,
        `${kpis.meanStarRating.toFixed(2)} / 5.00`,
        `${kpis.meanVaderPolarity >= 0 ? "+" : ""}${kpis.meanVaderPolarity.toFixed(3)}`,
        `${kpis.vaderPearsonR.toFixed(3)} vs ${kpis.baselinePearsonR.toFixed(3)}`,
        `${kpis.hiddenRiskCount} (${kpis.hiddenRiskPct}%)`,
      ],
    ],
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], fontSize: 7.2, halign: "center" },
    bodyStyles: { fontSize: 9, fontStyle: "bold", halign: "center", textColor: [15, 23, 42] },
  });

  const afterKpiY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("6-MODE OPERATIONAL ROOT-CAUSE & STATION SOP TRIAGE MATRIX", 36, afterKpiY);

  autoTable(doc, {
    startY: afterKpiY + 8,
    margin: { left: 36, right: 36 },
    head: [["FAILURE MODE", "TIER", "MENTIONS", "NEG %", "HOTSPOT SHIFT", "MANDATORY SOP INTERVENTION"]],
    body: triageRows.map((r) => [
      r.failureMode,
      r.triageTier,
      String(r.mentions),
      `${r.negativeSharePct}%`,
      r.peakShiftHotspot,
      r.automatedSopAction,
    ]),
    theme: "grid",
    headStyles: { fillColor: [15, 23, 42], fontSize: 7.2 },
    bodyStyles: { fontSize: 7.5, textColor: [30, 41, 59] },
    columnStyles: {
      0: { cellWidth: 78 },
      1: { cellWidth: 54, fontStyle: "bold" },
      2: { cellWidth: 46, halign: "right" },
      3: { cellWidth: 40, halign: "right" },
      4: { cellWidth: 88 },
      5: { cellWidth: "auto" },
    },
  });

  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text("DIAGNOSTIC FINDINGS & PRE-SHIFT BRIEFING NOTES", 36, y);
  y += 14;

  doc.setFontSize(8);
  for (const rawLine of briefText.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("PRIORITY STATION")) continue;
    const isHeader =
      line === "EXECUTIVE OPERATIONAL PULSE" ||
      line === "CONSECUTIVE MULTI-WEEK QUALITY DRIFT WARNINGS" ||
      line === "VERIFIED 4-5 STAR HIDDEN RISK SIGNALS";
    doc.setFont("helvetica", isHeader ? "bold" : "normal");
    doc.setTextColor(isHeader ? 15 : 51, isHeader ? 23 : 65, isHeader ? 42 : 85);
    const wrapped = doc.splitTextToSize(line, 520) as string[];
    if (y + wrapped.length * 10 > 800) {
      doc.addPage();
      y = 40;
    }
    doc.text(wrapped, 36, y);
    y += wrapped.length * 10 + 3;
  }

  doc.save("Shift_Huddle_Brief_Reading_Through_The_Stars.pdf");
}

export async function downloadTriageWorkbookXlsx(params: {
  triageRows: TriageRow[];
  reviews: ProcessedReview[];
  skuDrifts: DriftAlert[];
}): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(params.triageRows),
    "SOP_Triage_Matrix"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      params.reviews
        .filter((r) => r.divergenceClass === "Hidden_Risk")
        .map((r) => ({
          ID: r.reviewId,
          Outlet: r.outlet,
          SKU: r.sku,
          Stars: r.rating,
          VADER: r.vaderCompound,
          Shift: r.shiftSlot,
          Defects: r.matchedFailureModes,
          Source: r.divergenceSource,
          Review: r.rawText,
        }))
    ),
    "Hidden_Risk_4_5_Stars"
  );
  if (params.skuDrifts.length > 0) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(params.skuDrifts),
      "SKU_Drift_Alerts"
    );
  }
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      params.reviews.map((r) => ({
        ID: r.reviewId,
        Date: r.isoDate,
        Outlet: r.outlet,
        SKU: r.sku,
        Shift: r.shiftSlot,
        Rating: r.rating,
        VADER: r.vaderCompound,
        Sentiment: r.sentimentLabel,
        Divergence: r.divergenceClass,
        Defects: r.matchedFailureModes,
        Review: r.rawText,
      }))
    ),
    "Full_Scored_Corpus"
  );

  XLSX.writeFile(wb, "QSR_Operational_Triage_Workbook.xlsx");
}

export function downloadReviewsCsv(reviews: ProcessedReview[]): void {
  const headers = [
    "review_id",
    "iso_date",
    "outlet",
    "sku",
    "shift_slot",
    "rating",
    "vader_compound",
    "sentiment_label",
    "divergence_class",
    "matched_failure_modes",
    "raw_text",
  ];
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.join(","),
    ...reviews.map((r) =>
      [
        r.reviewId,
        r.isoDate,
        r.outlet,
        r.sku,
        r.shiftSlot,
        r.rating,
        r.vaderCompound,
        r.sentimentLabel,
        r.divergenceClass,
        r.matchedFailureModes,
        r.rawText,
      ]
        .map(escape)
        .join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Scored_Reviews_Operational_Triage.csv";
  a.click();
  URL.revokeObjectURL(url);
}
