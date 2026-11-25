import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Download,
  MoreHorizontal,
  ShieldAlert,
  Star,
} from "lucide-react";
import { KpiCard } from "../components/KpiCard";
import { DataTable, type ColumnDef } from "../components/DataTable";
import { DivergenceBadge, TierBadge } from "../components/TierBadge";
import { GroupedBarChart, SmoothLineChart } from "../components/Charts";
import type {
  DriftAlert,
  FunnelStats,
  OutletSummaryRow,
  ProcessedReview,
  TriageRow,
  ValidationMetrics,
} from "../engine/types";

interface OverviewViewProps {
  mode: "management" | "analyst";
  reviews: ProcessedReview[];
  funnelStats: FunnelStats;
  validationMetrics: ValidationMetrics;
  triageRows: TriageRow[];
  outletSummary: OutletSummaryRow[];
  skuDrifts: DriftAlert[];
  outletDrifts: DriftAlert[];
  onInspectTriage: (row: TriageRow) => void;
  onInspectReview: (review: ProcessedReview) => void;
  onDownloadPdf: () => void;
}

const SLOT_PLAIN: Record<string, string> = {
  "Morning (06-11h)": "mornings (6-11am)",
  "Lunch (11-15h)": "lunchtime (11am-3pm)",
  "Afternoon (15-18h)": "afternoons (3-6pm)",
  "Evening (18-22h)": "evenings (6-10pm)",
  "Late Night (22-06h)": "late nights (10pm-6am)",
};

export function OverviewView({
  mode,
  reviews,
  funnelStats,
  validationMetrics,
  triageRows,
  outletSummary,
  skuDrifts,
  outletDrifts,
  onInspectTriage,
  onInspectReview,
  onDownloadPdf,
}: OverviewViewProps) {
  const [chartLeftTab, setChartLeftTab] = useState<"weekly" | "hygiene">("weekly");
  const [chartRightTab, setChartRightTab] = useState<"modes" | "outlets">("modes");
  const [tableTab, setTableTab] = useState<"triage" | "outlets" | "hidden">("triage");

  const stats = useMemo(() => {
    const n = reviews.length;
    const avgRating = n > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / n : 0;
    const happy = reviews.filter((r) => r.rating >= 4.0);
    const hidden = reviews.filter((r) => r.divergenceClass === "Hidden_Risk");
    const hiddenPct = n > 0 ? (hidden.length / n) * 100 : 0;
    const hiddenOfHappy = happy.length > 0 ? (hidden.length / happy.length) * 100 : 0;
    const criticalCount = triageRows.filter((t) => t.triageTier === "CRITICAL").length;
    const cautionCount = triageRows.filter((t) => t.triageTier === "CAUTION").length;
    const driftCount = skuDrifts.length + outletDrifts.length;
    return {
      n,
      avgRating,
      happyCount: happy.length,
      hiddenCount: hidden.length,
      hiddenPct,
      hiddenOfHappy,
      criticalCount,
      cautionCount,
      openIssues: criticalCount + cautionCount,
      driftCount,
    };
  }, [reviews, triageRows, skuDrifts, outletDrifts]);

  const weeklySeries = useMemo(() => {
    const byWeek = new Map<
      string,
      { count: number; vaderSum: number; normRatingSum: number; negCount: number }
    >();
    for (const r of reviews) {
      let b = byWeek.get(r.isoYearWeek);
      if (!b) {
        b = { count: 0, vaderSum: 0, normRatingSum: 0, negCount: 0 };
        byWeek.set(r.isoYearWeek, b);
      }
      b.count++;
      b.vaderSum += r.vaderCompound;
      b.normRatingSum += ((r.rating - 1) / 4) * 2 - 1;
      if (r.sentimentLabel === "Negative") b.negCount++;
    }
    const weeks = Array.from(byWeek.keys()).sort();
    return {
      labels: weeks,
      series: [
        {
          id: "vader",
          label: "Mean VADER Polarity",
          color: "var(--accent-ink)",
          values: weeks.map((w) => {
            const b = byWeek.get(w)!;
            return Math.round((b.vaderSum / b.count) * 1000) / 1000;
          }),
        },
        {
          id: "ratingNorm",
          label: "Star Rating Sentiment",
          color: "#dca3b1",
          values: weeks.map((w) => {
            const b = byWeek.get(w)!;
            return Math.round((b.normRatingSum / b.count) * 1000) / 1000;
          }),
        },
      ],
    };
  }, [reviews]);

  const failureBarGroups = useMemo(() => {
    const shortMode: Record<string, string> = {
      "Cold Food": "Cold Food",
      "Service Delay": "Delay",
      "Packaging Spills": "Packaging",
      "Missing Items": "Missing",
      "Stale / Freshness": "Freshness",
      "Staff Behavior": "Staff",
    };
    return triageRows.map((t) => ({
      label: shortMode[t.failureMode] ?? t.failureMode,
      values: [
        { name: "Negative", value: t.negativeMentions, color: "var(--accent-ink)" },
        { name: "Total Mentions", value: t.mentions, color: "var(--chart-bar-mid)" },
        {
          name: "Non-Negative",
          value: Math.max(0, t.mentions - t.negativeMentions),
          color: "#c5ccfa",
        },
      ],
    }));
  }, [triageRows]);

  const outletBarGroups = useMemo(() => {
    return outletSummary.map((o) => ({
      label: o.outlet.split(" - ")[0],
      values: [
        { name: "Defect Mentions", value: o.defectMentions, color: "var(--accent-ink)" },
        { name: "Clean Reviews", value: o.cleanReviews, color: "var(--chart-bar-mid)" },
        { name: "4-5★ Hidden Risk", value: o.hiddenRiskCount, color: "#c5ccfa" },
      ],
    }));
  }, [outletSummary]);

  const triageColumns: ColumnDef<TriageRow>[] = [
    {
      key: "failureMode",
      header: "Failure Mode",
      sortable: true,
      sortValue: (r) => r.failureMode,
      render: (r) => (
        <div>
          <div className="font-medium text-[var(--text-primary)]">{r.failureMode}</div>
          <div className="text-xs text-[var(--text-muted)]">{r.responsibleStation}</div>
        </div>
      ),
    },
    {
      key: "mentions",
      header: "Mentions",
      type: "number",
      align: "right",
      sortable: true,
      sortValue: (r) => r.mentions,
      render: (r) => <span className="font-mono-num">{r.mentions}</span>,
    },
    {
      key: "negShare",
      header: "Neg Share",
      type: "number",
      align: "right",
      sortable: true,
      sortValue: (r) => r.negativeSharePct,
      render: (r) => <span className="font-mono-num">{r.negativeSharePct.toFixed(1)}%</span>,
    },
    {
      key: "hotspot",
      header: "Primary Hotspot",
      sortable: true,
      sortValue: (r) => r.primaryOutletHotspot,
      render: (r) => (
        <div>
          <div className="text-[var(--text-primary)]">{r.primaryOutletHotspot}</div>
          <div className="text-xs text-[var(--text-muted)]">{r.peakShiftHotspot}</div>
        </div>
      ),
    },
    {
      key: "tier",
      header: "Triage Tier",
      sortable: true,
      sortValue: (r) => r.triageTier,
      render: (r) => <TierBadge tier={r.triageTier} />,
    },
    {
      key: "action",
      header: "Action",
      align: "right",
      render: (r) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onInspectTriage(r);
          }}
          aria-label={`Inspect ${r.failureMode} SOP details`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
        >
          <MoreHorizontal size={16} strokeWidth={1.6} />
        </button>
      ),
    },
  ];

  const outletColumns: ColumnDef<OutletSummaryRow>[] = [
    {
      key: "outlet",
      header: "Outlet / Brand",
      sortable: true,
      sortValue: (r) => r.outlet,
      render: (r) => <span className="font-medium text-[var(--text-primary)]">{r.outlet}</span>,
    },
    {
      key: "cleanReviews",
      header: "Reviews",
      type: "number",
      align: "right",
      sortable: true,
      sortValue: (r) => r.cleanReviews,
      render: (r) => <span className="font-mono-num">{r.cleanReviews}</span>,
    },
    {
      key: "avgRating",
      header: "Avg Rating",
      type: "number",
      align: "right",
      sortable: true,
      sortValue: (r) => r.avgStarRating,
      render: (r) => <span className="font-mono-num">{r.avgStarRating.toFixed(2)} ★</span>,
    },
    {
      key: "meanVader",
      header: "VADER Mean",
      type: "number",
      align: "right",
      sortable: true,
      sortValue: (r) => r.meanVaderPolarity,
      render: (r) => (
        <span className="font-mono-num">
          {r.meanVaderPolarity >= 0 ? "+" : ""}
          {r.meanVaderPolarity.toFixed(3)}
        </span>
      ),
    },
    {
      key: "negShare",
      header: "Negative %",
      type: "number",
      align: "right",
      sortable: true,
      sortValue: (r) => r.negativeSharePct,
      render: (r) => <span className="font-mono-num">{r.negativeSharePct.toFixed(1)}%</span>,
    },
    {
      key: "hiddenRisk",
      header: "Hidden Risk",
      type: "number",
      align: "right",
      sortable: true,
      sortValue: (r) => r.hiddenRiskCount,
      render: (r) => <span className="font-mono-num">{r.hiddenRiskCount}</span>,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      sortValue: (r) => (r.defectRatePct >= 50 ? "CRITICAL" : r.defectRatePct >= 30 || r.isDrifting ? "CAUTION" : "HEALTHY"),
      render: (r) => (
        <TierBadge
          tier={
            r.defectRatePct >= 50
              ? "CRITICAL"
              : r.defectRatePct >= 30 || r.isDrifting
                ? "CAUTION"
                : "HEALTHY"
          }
        />
      ),
    },
  ];

  const hiddenReviews = useMemo(
    () =>
      reviews
        .filter((r) => r.divergenceClass === "Hidden_Risk")
        .sort((a, b) => a.vaderCompound - b.vaderCompound)
        .slice(0, 12),
    [reviews]
  );

  const hiddenColumns: ColumnDef<ProcessedReview>[] = [
    {
      key: "id",
      header: "ID",
      sortable: true,
      sortValue: (r) => r.reviewId,
      render: (r) => <span className="font-mono-num text-xs text-[var(--text-muted)]">{r.reviewId}</span>,
    },
    {
      key: "outlet",
      header: "Outlet",
      sortable: true,
      sortValue: (r) => r.outlet,
      render: (r) => <span className="font-medium">{r.outlet}</span>,
    },
    {
      key: "sku",
      header: "Menu SKU",
      sortable: true,
      sortValue: (r) => r.sku,
      render: (r) => r.sku,
    },
    {
      key: "rating",
      header: "Stars",
      type: "number",
      align: "right",
      sortable: true,
      sortValue: (r) => r.rating,
      render: (r) => <span className="font-mono-num">{r.rating.toFixed(1)} ★</span>,
    },
    {
      key: "vader",
      header: "VADER",
      type: "number",
      align: "right",
      sortable: true,
      sortValue: (r) => r.vaderCompound,
      render: (r) => <span className="font-mono-num">{r.vaderCompound.toFixed(3)}</span>,
    },
    {
      key: "class",
      header: "Audit Class",
      render: (r) => <DivergenceBadge cls={r.divergenceClass} />,
    },
  ];

  if (mode === "management") {
    const verdictStatus =
      stats.criticalCount > 0
        ? { label: "Action needed", tier: "CRITICAL" as const }
        : stats.openIssues > 0 || stats.driftCount > 0
          ? { label: "Keep an eye on this", tier: "CAUTION" as const }
          : { label: "Looking healthy", tier: "HEALTHY" as const };

    let verdictHeadline = `Customers rate you ${stats.avgRating.toFixed(1)} out of 5`;
    if (stats.hiddenCount > 0 && stats.hiddenOfHappy >= 3) {
      verdictHeadline += `, and about 1 in ${Math.max(2, Math.round(100 / stats.hiddenOfHappy))} of your 4-5 star reviews still describes a problem.`;
    } else if (stats.criticalCount > 0) {
      verdictHeadline += `, with ${stats.criticalCount} recurring problem areas needing attention.`;
    } else {
      verdictHeadline += ".";
    }

    const topPriorities = triageRows
      .filter((t) => t.triageTier !== "HEALTHY")
      .slice(0, 3);

    const quotes = reviews
      .filter((r) => r.divergenceClass === "Hidden_Risk")
      .sort((a, b) => a.vaderCompound - b.vaderCompound)
      .filter((r, idx, arr) => arr.findIndex((x) => x.rawText === r.rawText) === idx)
      .slice(0, 3);

    return (
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            variant="hero"
            value={`${stats.avgRating.toFixed(2)} / 5`}
            label={`Average rating across ${stats.n.toLocaleString()} reviews`}
            progressPct={(stats.avgRating / 5) * 100}
            progressRightLabel={`${Math.round((stats.avgRating / 5) * 100)}%`}
            icon={<Star size={18} strokeWidth={1.6} />}
          />
          <KpiCard
            variant="periwinkle"
            value={`${stats.hiddenOfHappy.toFixed(0)}%`}
            label="Happy 4-5 star ratings hiding a problem"
            progressPct={stats.hiddenOfHappy}
            progressRightLabel={`${stats.hiddenCount} of ${stats.happyCount}`}
            icon={<ShieldAlert size={18} strokeWidth={1.6} />}
          />
          <KpiCard
            variant="slate"
            value={String(stats.openIssues)}
            label="Problem areas to fix"
            progressPct={triageRows.length ? (stats.openIssues / triageRows.length) * 100 : 0}
            progressRightLabel={`${stats.criticalCount} urgent`}
            icon={<ClipboardList size={18} strokeWidth={1.6} />}
          />
          <KpiCard
            variant="rose"
            value={String(stats.driftCount)}
            label="Dishes or outlets sliding 3+ weeks"
            progressPct={Math.min(100, stats.driftCount * 25)}
            progressRightLabel={`${skuDrifts.length} SKU / ${outletDrifts.length} outlet`}
            icon={<AlertTriangle size={18} strokeWidth={1.6} />}
          />
        </div>

        <section className="flex flex-col justify-between gap-4 rounded-[14px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-card)] sm:flex-row sm:items-center">
          <div>
            <div className="mb-2">
              <TierBadge tier={verdictStatus.tier} />
            </div>
            <h2 className="text-lg font-semibold leading-snug text-[var(--text-primary)]">
              {verdictHeadline}
            </h2>
          </div>
          <button
            type="button"
            onClick={onDownloadPdf}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--accent-ink)", color: "var(--accent-ink-fg)" }}
          >
            <Download size={16} strokeWidth={1.6} />
            <span>Download one-page brief (PDF)</span>
          </button>
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <section className="rounded-[14px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-card)]">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              Top priorities this week
            </h3>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Biggest recurring complaints, who owns the fix, and the first step.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              {topPriorities.length === 0 ? (
                <div className="rounded-xl bg-[var(--bg-subtle)] p-4 text-sm text-[var(--text-secondary)]">
                  No recurring problem areas found in this selection.
                </div>
              ) : (
                topPriorities.map((p) => (
                  <div
                    key={p.modeKey}
                    className="rounded-xl border border-[var(--border-hairline)] p-4 transition-colors hover:bg-[var(--bg-subtle)]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-[var(--text-primary)]">{p.failureMode}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono-num text-xs text-[var(--text-muted)]">
                          {p.negativeMentions} complaints ({p.negativeSharePct.toFixed(0)}%)
                        </span>
                        <TierBadge tier={p.triageTier} />
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-[var(--text-secondary)]">
                      Worst at {p.primaryOutletHotspot} during{" "}
                      {SLOT_PLAIN[p.peakShiftHotspot] ?? p.peakShiftHotspot}. Owner:{" "}
                      {p.responsibleStation}.
                    </div>
                    <div className="mt-1.5 text-sm text-[var(--text-primary)]">
                      {p.automatedSopAction}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-[14px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-card)]">
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              In customers&apos; own words
            </h3>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              High star ratings that still report an operational defect.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              {quotes.length === 0 ? (
                <div className="rounded-xl bg-[var(--bg-subtle)] p-4 text-sm text-[var(--text-secondary)]">
                  No 4-5 star hidden complaints in this selection.
                </div>
              ) : (
                quotes.map((q) => (
                  <button
                    key={q.reviewId}
                    type="button"
                    onClick={() => onInspectReview(q)}
                    className="rounded-xl border border-[var(--border-hairline)] p-4 text-left transition-colors hover:bg-[var(--bg-subtle)]"
                  >
                    <p className="text-sm leading-relaxed text-[var(--text-primary)]">
                      &ldquo;{q.rawText}&rdquo;
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[var(--text-muted)]">
                      <span className="font-mono-num">{q.rating.toFixed(0)} stars</span>
                      <span>{q.outlet}</span>
                      <span>{q.matchedFailureModes}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>
        </div>

        <section className="rounded-[14px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-card)]">
          <h3 className="mb-3 text-base font-semibold text-[var(--text-primary)]">
            How each outlet is doing
          </h3>
          <DataTable
            caption="Outlet performance summary"
            columns={outletColumns}
            rows={outletSummary}
            rowKey={(r) => r.outlet}
          />
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Row 1: 4-Card KPI Strip matching design reference */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          variant="hero"
          value={stats.n.toLocaleString()}
          label="Verified Clean Reviews"
          progressPct={funnelStats.retentionPct}
          progressRightLabel={`${funnelStats.retentionPct}%`}
          icon={<CheckCircle2 size={18} strokeWidth={1.6} />}
        />
        <KpiCard
          variant="periwinkle"
          value={`${stats.avgRating.toFixed(2)} ★`}
          label="Aggregate Star Rating"
          progressPct={(stats.avgRating / 5) * 100}
          progressRightLabel={`${Math.round((stats.avgRating / 5) * 100)}%`}
          icon={<Star size={18} strokeWidth={1.6} />}
        />
        <KpiCard
          variant="slate"
          value={String(stats.hiddenCount)}
          label="4-5★ Hidden Risk"
          progressPct={stats.hiddenOfHappy}
          progressRightLabel={`${stats.hiddenPct.toFixed(1)}%`}
          icon={<ShieldAlert size={18} strokeWidth={1.6} />}
        />
        <KpiCard
          variant="rose"
          value={String(stats.openIssues + stats.driftCount)}
          label="Active Triage & Drift Alerts"
          progressPct={Math.min(100, ((stats.openIssues + stats.driftCount) / 8) * 100)}
          progressRightLabel={`${stats.criticalCount} Crit / ${stats.driftCount} Drift`}
          icon={<AlertTriangle size={18} strokeWidth={1.6} />}
        />
      </div>

      {/* Row 2: Two side-by-side chart panels */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <section className="rounded-[14px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-card)] lg:col-span-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Sentiment Trajectory
            </h2>
            <div
              role="tablist"
              aria-label="Sentiment trajectory view"
              className="inline-flex items-center gap-1 rounded-lg bg-[var(--bg-subtle)] p-1"
            >
              {(
                [
                  ["weekly", "Weekly"],
                  ["hygiene", "Hygiene"],
                ] as const
              ).map(([id, lbl]) => {
                const selected = chartLeftTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setChartLeftTab(id)}
                    className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: selected ? "var(--accent-ink)" : "transparent",
                      color: selected ? "var(--accent-ink-fg)" : "var(--text-muted)",
                    }}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
          </div>

          {chartLeftTab === "weekly" ? (
            <>
              <SmoothLineChart
                labels={weeklySeries.labels}
                series={weeklySeries.series}
                yMin={-1}
                yMax={1}
                yTickFormatter={(v) => v.toFixed(1)}
                valueFormatter={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(3)}`}
                zeroLine
              />
              <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-[var(--text-muted)]">
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: "var(--accent-ink)" }}
                  />
                  Mean VADER ({validationMetrics.meanVaderCompound >= 0 ? "+" : ""}
                  {validationMetrics.meanVaderCompound.toFixed(3)})
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#dca3b1]" />
                  Star Rating Sentiment
                </span>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2.5">
              {[
                ["Raw Ingested Records", funnelStats.rawTotal, false],
                ["Purged Blank Rows (<2 chars)", -funnelStats.droppedBlankText, true],
                ["Purged Retry Duplicates", -funnelStats.droppedDuplicates, true],
                ["Purged Non-Latin Noise", -funnelStats.droppedNonLatinNoise, true],
                [
                  "Purged Invalid Dates / Ratings",
                  -(funnelStats.droppedBadTimestamp + funnelStats.droppedBadRating),
                  true,
                ],
                ["Verified Clean Corpus", funnelStats.retainedClean, false],
              ].map(([label, count, isDrop]) => (
                <div
                  key={String(label)}
                  className="flex items-center justify-between border-b border-[var(--border-hairline)] py-2 text-sm last:border-b-0"
                >
                  <span className="text-[var(--text-secondary)]">{label}</span>
                  <span
                    className="font-mono-num font-medium"
                    style={{
                      color: isDrop ? "var(--status-crit-fg)" : "var(--text-primary)",
                    }}
                  >
                    {Number(count).toLocaleString()}
                  </span>
                </div>
              ))}
              <div className="mt-1 rounded-lg bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                VADER Pearson r ={" "}
                <span className="font-mono-num font-medium text-[var(--text-primary)]">
                  {validationMetrics.vaderPearsonR.toFixed(3)}
                </span>{" "}
                vs Baseline r ={" "}
                <span className="font-mono-num font-medium text-[var(--text-primary)]">
                  {validationMetrics.baselinePearsonR.toFixed(3)}
                </span>{" "}
                ({validationMetrics.vaderLiftPct >= 0 ? "+" : ""}
                {validationMetrics.vaderLiftPct.toFixed(1)}% lift)
              </div>
            </div>
          )}
        </section>

        <section className="rounded-[14px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-card)] lg:col-span-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Operational Summary
            </h2>
            <div
              role="tablist"
              aria-label="Operational summary view"
              className="inline-flex items-center gap-1 rounded-lg bg-[var(--bg-subtle)] p-1"
            >
              {(
                [
                  ["modes", "Failure Modes"],
                  ["outlets", "Outlets"],
                ] as const
              ).map(([id, lbl]) => {
                const selected = chartRightTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setChartRightTab(id)}
                    className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: selected ? "var(--accent-ink)" : "transparent",
                      color: selected ? "var(--accent-ink-fg)" : "var(--text-muted)",
                    }}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
          </div>

          <GroupedBarChart
            groups={chartRightTab === "modes" ? failureBarGroups : outletBarGroups}
          />
          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-[var(--text-muted)]">
            {chartRightTab === "modes" ? (
              <>
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: "var(--accent-ink)" }}
                  />
                  Negative
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: "var(--chart-bar-mid)" }}
                  />
                  Total Mentions
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#c5ccfa]" />
                  Non-Negative
                </span>
              </>
            ) : (
              <>
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: "var(--accent-ink)" }}
                  />
                  Defect Mentions
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: "var(--chart-bar-mid)" }}
                  />
                  Clean Reviews
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#c5ccfa]" />
                  4-5★ Hidden Risk
                </span>
              </>
            )}
          </div>
        </section>
      </div>

      {/* Row 3: Full-width Data Table */}
      <section className="rounded-[14px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            {tableTab === "triage"
              ? "SOP Triage Matrix"
              : tableTab === "outlets"
                ? "Outlet Scoreboard"
                : "Top 4-5★ Hidden Risk Signals"}
          </h2>
          <div
            role="tablist"
            aria-label="Table dataset view"
            className="inline-flex items-center gap-1 rounded-lg bg-[var(--bg-subtle)] p-1"
          >
            {(
              [
                ["triage", "SOP Triage"],
                ["outlets", "Outlets"],
                ["hidden", "Hidden Risk"],
              ] as const
            ).map(([id, lbl]) => {
              const selected = tableTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setTableTab(id)}
                  className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: selected ? "var(--accent-ink)" : "transparent",
                    color: selected ? "var(--accent-ink-fg)" : "var(--text-muted)",
                  }}
                >
                  {lbl}
                </button>
              );
            })}
          </div>
        </div>

        {tableTab === "triage" && (
          <DataTable
            caption="6-mode operational root-cause SOP triage matrix"
            columns={triageColumns}
            rows={triageRows}
            rowKey={(r) => r.modeKey}
            onRowClick={onInspectTriage}
          />
        )}
        {tableTab === "outlets" && (
          <DataTable
            caption="Outlet operational scoreboard"
            columns={outletColumns}
            rows={outletSummary}
            rowKey={(r) => r.outlet}
          />
        )}
        {tableTab === "hidden" && (
          <DataTable
            caption="Highest-severity 4-5 star hidden risk reviews"
            columns={hiddenColumns}
            rows={hiddenReviews}
            rowKey={(r) => r.reviewId}
            onRowClick={onInspectReview}
          />
        )}
      </section>
    </div>
  );
}
