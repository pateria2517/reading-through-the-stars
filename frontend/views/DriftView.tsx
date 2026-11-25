import { useMemo, useState } from "react";
import { DataTable, type ColumnDef } from "../components/DataTable";
import { SmoothLineChart } from "../components/Charts";
import type { DriftAlert, WeeklyEntityMetric } from "../engine/types";

interface DriftViewProps {
  skuWeekly: WeeklyEntityMetric[];
  outletWeekly: WeeklyEntityMetric[];
  skuDrifts: DriftAlert[];
  outletDrifts: DriftAlert[];
}

const LINE_COLORS = [
  "var(--accent-ink)",
  "#c5ccfa",
  "#dca3b1",
  "var(--text-secondary)",
  "#7c85e0",
  "#9ca3af",
];

export function DriftView({
  skuWeekly,
  outletWeekly,
  skuDrifts,
  outletDrifts,
}: DriftViewProps) {
  const allSkus = useMemo(
    () => Array.from(new Set(skuWeekly.map((w) => w.entity))).sort(),
    [skuWeekly]
  );

  const defaultSkus = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of skuWeekly) {
      counts.set(w.entity, (counts.get(w.entity) ?? 0) + w.reviewCount);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);
  }, [skuWeekly]);

  const [selectedSkus, setSelectedSkus] = useState<string[] | null>(null);
  const activeSkus = selectedSkus ?? defaultSkus;

  const toggleSku = (sku: string) => {
    const cur = activeSkus;
    if (cur.includes(sku)) {
      if (cur.length > 1) setSelectedSkus(cur.filter((s) => s !== sku));
    } else {
      setSelectedSkus([...cur, sku]);
    }
  };

  const combinedDrifts = useMemo(
    () => [...skuDrifts, ...outletDrifts],
    [skuDrifts, outletDrifts]
  );

  const skuWeeks = useMemo(
    () => Array.from(new Set(skuWeekly.map((w) => w.isoYearWeek))).sort(),
    [skuWeekly]
  );

  const skuSeries = useMemo(() => {
    return activeSkus.map((sku, idx) => {
      const byWk = new Map(
        skuWeekly.filter((w) => w.entity === sku).map((w) => [w.isoYearWeek, w.meanSentiment])
      );
      return {
        id: sku,
        label: sku,
        color: LINE_COLORS[idx % LINE_COLORS.length],
        values: skuWeeks.map((wk) => byWk.get(wk) ?? null),
      };
    });
  }, [activeSkus, skuWeekly, skuWeeks]);

  const outletNames = useMemo(
    () => Array.from(new Set(outletWeekly.map((w) => w.entity))).sort(),
    [outletWeekly]
  );
  const outletWeeks = useMemo(
    () => Array.from(new Set(outletWeekly.map((w) => w.isoYearWeek))).sort(),
    [outletWeekly]
  );

  const outletSeries = useMemo(() => {
    return outletNames.map((outlet, idx) => {
      const byWk = new Map(
        outletWeekly
          .filter((w) => w.entity === outlet)
          .map((w) => [w.isoYearWeek, w.meanSentiment])
      );
      return {
        id: outlet,
        label: outlet.split(" - ")[0],
        color: LINE_COLORS[idx % LINE_COLORS.length],
        values: outletWeeks.map((wk) => byWk.get(wk) ?? null),
      };
    });
  }, [outletNames, outletWeekly, outletWeeks]);

  const driftColumns: ColumnDef<DriftAlert>[] = [
    {
      key: "type",
      header: "Scope",
      sortable: true,
      sortValue: (r) => r.entityType,
      render: (r) => (
        <span className="rounded-md bg-[var(--bg-subtle)] px-2 py-0.5 text-xs font-mono-num">
          {r.entityType}
        </span>
      ),
    },
    {
      key: "name",
      header: "Menu SKU / Outlet",
      sortable: true,
      sortValue: (r) => r.entityName,
      render: (r) => <span className="font-medium text-[var(--text-primary)]">{r.entityName}</span>,
    },
    {
      key: "weeks",
      header: "Weeks",
      type: "number",
      align: "right",
      sortable: true,
      sortValue: (r) => r.consecutiveWeeks,
      render: (r) => <span className="font-mono-num">{r.consecutiveWeeks}</span>,
    },
    {
      key: "window",
      header: "ISO Window",
      render: (r) => <span className="font-mono-num text-xs">{r.window}</span>,
    },
    {
      key: "erosion",
      header: "Net Erosion",
      type: "number",
      align: "right",
      sortable: true,
      sortValue: (r) => r.netErosion,
      render: (r) => (
        <span className="font-mono-num font-medium" style={{ color: "var(--status-crit-fg)" }}>
          {r.netErosion.toFixed(3)}
        </span>
      ),
    },
    {
      key: "trajectory",
      header: "Weekly Trajectory",
      render: (r) => (
        <span className="font-mono-num text-xs text-[var(--text-secondary)]">{r.trajectory}</span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-[14px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          Consecutive Multi-Week Quality Slide Alerts
        </h2>
        <p className="mt-0.5 mb-4 text-xs text-[var(--text-muted)]">
          Flags any menu SKU or outlet with 3 or more consecutive declining weeks (n ≥ 3 reviews per week).
        </p>
        <DataTable
          caption="Consecutive multi-week quality drift alerts"
          columns={driftColumns}
          rows={combinedDrifts}
          rowKey={(r) => `${r.entityType}-${r.entityName}`}
          emptyMessage="No SKU or outlet triggered the 3+ consecutive declining weeks threshold in this slice."
        />
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <section className="rounded-[14px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-card)] lg:col-span-7">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Weekly Menu SKU Sentiment
            </h2>
            <span className="text-xs text-[var(--text-muted)]">Select SKUs to compare</span>
          </div>

          <div className="mb-4 flex flex-wrap gap-1.5">
            {allSkus.map((sku) => {
              const active = activeSkus.includes(sku);
              return (
                <button
                  key={sku}
                  type="button"
                  onClick={() => toggleSku(sku)}
                  aria-pressed={active}
                  className="rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: active ? "var(--accent-ink)" : "var(--bg-surface)",
                    color: active ? "var(--accent-ink-fg)" : "var(--text-secondary)",
                    borderColor: active ? "var(--accent-ink)" : "var(--border-hairline)",
                  }}
                >
                  {sku}
                </button>
              );
            })}
          </div>

          <SmoothLineChart
            labels={skuWeeks}
            series={skuSeries}
            yMin={-1}
            yMax={1}
            yTickFormatter={(v) => v.toFixed(1)}
            valueFormatter={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(3)}`}
            showArea={false}
            zeroLine
          />
        </section>

        <section className="rounded-[14px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-card)] lg:col-span-5">
          <h2 className="mb-4 text-base font-semibold text-[var(--text-primary)]">
            Weekly Outlet Trendline
          </h2>
          <SmoothLineChart
            labels={outletWeeks}
            series={outletSeries}
            yMin={-1}
            yMax={1}
            yTickFormatter={(v) => v.toFixed(1)}
            valueFormatter={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(3)}`}
            showArea={false}
            zeroLine
          />
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">
            {outletSeries.map((s) => (
              <span key={s.id} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
