import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { DataTable, type ColumnDef } from "../components/DataTable";
import { TierBadge } from "../components/TierBadge";
import { ShiftHeatmap, StationVolumeBreakdown } from "../components/Charts";
import type {
  OutletShiftTriageRow,
  ShiftHeatmapCell,
  TriageRow,
} from "../engine/types";

interface TriageViewProps {
  heatmapCells: ShiftHeatmapCell[];
  triageRows: TriageRow[];
  outletShiftRows: OutletShiftTriageRow[];
  onInspectTriage: (row: TriageRow) => void;
}

export function TriageView({
  heatmapCells,
  triageRows,
  outletShiftRows,
  onInspectTriage,
}: TriageViewProps) {
  const [showGranular, setShowGranular] = useState(false);

  const triageCols: ColumnDef<TriageRow>[] = [
    {
      key: "mode",
      header: "Failure Mode",
      sortable: true,
      sortValue: (r) => r.failureMode,
      render: (r) => (
        <div>
          <div className="font-medium">{r.failureMode}</div>
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
      key: "negPct",
      header: "Neg %",
      type: "number",
      align: "right",
      sortable: true,
      sortValue: (r) => r.negativeSharePct,
      render: (r) => <span className="font-mono-num">{r.negativeSharePct.toFixed(1)}%</span>,
    },
    {
      key: "hotspot",
      header: "Hotspot",
      sortable: true,
      sortValue: (r) => r.primaryOutletHotspot,
      render: (r) => (
        <div>
          <div>{r.primaryOutletHotspot}</div>
          <div className="text-xs text-[var(--text-muted)]">{r.peakShiftHotspot}</div>
        </div>
      ),
    },
    {
      key: "tier",
      header: "Tier",
      sortable: true,
      sortValue: (r) => r.triageTier,
      render: (r) => <TierBadge tier={r.triageTier} />,
    },
    {
      key: "sop",
      header: "SOP Action",
      render: (r) => (
        <span className="line-clamp-2 max-w-[340px] text-xs text-[var(--text-secondary)]">
          {r.automatedSopAction}
        </span>
      ),
    },
  ];

  const granularCols: ColumnDef<OutletShiftTriageRow>[] = [
    {
      key: "outlet",
      header: "Outlet",
      sortable: true,
      sortValue: (r) => r.outlet,
      render: (r) => <span className="font-medium">{r.outlet}</span>,
    },
    {
      key: "shift",
      header: "Shift Slot",
      sortable: true,
      sortValue: (r) => r.shiftSlot,
      render: (r) => r.shiftSlot,
    },
    {
      key: "mode",
      header: "Failure Mode",
      sortable: true,
      sortValue: (r) => r.failureMode,
      render: (r) => r.failureMode,
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
      key: "negPct",
      header: "Neg %",
      type: "number",
      align: "right",
      sortable: true,
      sortValue: (r) => r.negSharePct,
      render: (r) => <span className="font-mono-num">{r.negSharePct.toFixed(1)}%</span>,
    },
    {
      key: "tier",
      header: "Tier",
      sortable: true,
      sortValue: (r) => r.triageTier,
      render: (r) => <TierBadge tier={r.triageTier} />,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <section className="rounded-[14px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-card)] lg:col-span-7">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Shift-Slot Accountability Heatmap
          </h2>
          <p className="mt-0.5 mb-4 text-xs text-[var(--text-muted)]">
            Negative review concentration (%) across day-parts to pinpoint kitchen and packing bottlenecks.
          </p>
          <ShiftHeatmap cells={heatmapCells} />
        </section>

        <section className="rounded-[14px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-card)] lg:col-span-5">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Failure Volume by Station
          </h2>
          <p className="mt-0.5 mb-4 text-xs text-[var(--text-muted)]">
            Mentions ranked by volume, split into negative complaints and non-negative mentions.
          </p>
          <StationVolumeBreakdown rows={triageRows} onSelectRow={onInspectTriage} />
        </section>
      </div>

      <section className="rounded-[14px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-card)]">
        <h2 className="mb-3 text-base font-semibold text-[var(--text-primary)]">
          Rule-Grounded SOP Triage Matrix
        </h2>
        <DataTable
          caption="Rule-grounded SOP triage matrix"
          columns={triageCols}
          rows={triageRows}
          rowKey={(r) => r.modeKey}
          onRowClick={onInspectTriage}
        />

        <div className="mt-4 border-t border-[var(--border-hairline)] pt-4">
          <button
            type="button"
            onClick={() => setShowGranular((v) => !v)}
            aria-expanded={showGranular}
            className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-primary)] hover:opacity-80"
          >
            {showGranular ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            <span>
              Granular Outlet × Shift × Failure Mode Breakdown ({outletShiftRows.length} rows)
            </span>
          </button>

          {showGranular && (
            <div className="mt-4">
              <DataTable
                caption="Granular outlet, shift slot, and failure mode triage table"
                columns={granularCols}
                rows={outletShiftRows}
                rowKey={(r, i) => `${r.outlet}-${r.shiftSlot}-${r.failureMode}-${i}`}
                maxHeightClass="max-h-[420px]"
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
