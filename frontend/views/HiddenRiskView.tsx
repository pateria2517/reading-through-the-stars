import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { DataTable, type ColumnDef } from "../components/DataTable";
import { DivergenceBadge } from "../components/TierBadge";
import { DivergenceScatterChart } from "../components/Charts";
import type { DivergenceClass, ProcessedReview } from "../engine/types";

interface HiddenRiskViewProps {
  reviews: ProcessedReview[];
  onInspectReview: (review: ProcessedReview) => void;
}

export function HiddenRiskView({ reviews, onInspectReview }: HiddenRiskViewProps) {
  const [filterClass, setFilterClass] = useState<DivergenceClass | "ALL">("Hidden_Risk");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reviews
      .filter((r) => (filterClass === "ALL" ? true : r.divergenceClass === filterClass))
      .filter((r) =>
        q
          ? r.rawText.toLowerCase().includes(q) ||
            r.outlet.toLowerCase().includes(q) ||
            r.sku.toLowerCase().includes(q) ||
            r.matchedFailureModes.toLowerCase().includes(q)
          : true
      )
      .sort((a, b) => {
        if (filterClass === "Hidden_Risk") return a.vaderCompound - b.vaderCompound;
        if (filterClass === "Rating_Mismatch") return b.vaderCompound - a.vaderCompound;
        return b.parsedTs - a.parsedTs;
      });
  }, [reviews, filterClass, query]);

  const cols: ColumnDef<ProcessedReview>[] = [
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
      render: (r) => (
        <div>
          <div className="font-medium text-[var(--text-primary)]">{r.outlet}</div>
          <div className="text-xs text-[var(--text-muted)]">{r.sku}</div>
        </div>
      ),
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
      render: (r) => (
        <span className="font-mono-num">
          {r.vaderCompound >= 0 ? "+" : ""}
          {r.vaderCompound.toFixed(3)}
        </span>
      ),
    },
    {
      key: "class",
      header: "Audit Class",
      sortable: true,
      sortValue: (r) => r.divergenceClass,
      render: (r) => <DivergenceBadge cls={r.divergenceClass} />,
    },
    {
      key: "text",
      header: "Customer Review",
      render: (r) => (
        <div className="max-w-[360px]">
          <div className="line-clamp-2 text-xs text-[var(--text-primary)]">{r.rawText}</div>
          {r.matchedFailureModes !== "None" && (
            <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">
              Defects: {r.matchedFailureModes}
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      <section className="rounded-[14px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-card)] xl:col-span-5">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          Rating-Sentiment Divergence Quadrant
        </h2>
        <p className="mt-0.5 mb-3 text-xs text-[var(--text-muted)]">
          Isolates 4-5★ Hidden Risks (bottom-right) and 1-2★ Mismatches (top-left). Click any point to inspect.
        </p>
        <DivergenceScatterChart reviews={reviews} onSelectReview={onInspectReview} />
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--text-muted)]">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#dc2626]" />
            Hidden Risk
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#d97706]" />
            Rating Mismatch
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#9ca3af]" />
            Aligned
          </span>
        </div>
      </section>

      <section className="rounded-[14px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-card)] xl:col-span-7">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Divergence Audit Log
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              {filtered.length.toLocaleString()} matching records
            </p>
          </div>
          <div
            role="tablist"
            aria-label="Divergence class filter"
            className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-[var(--bg-subtle)] p-1"
          >
            {(
              [
                ["Hidden_Risk", "4-5★ Hidden Risk"],
                ["Rating_Mismatch", "1-2★ Mismatch"],
                ["ALL", "All Reviews"],
              ] as const
            ).map(([id, lbl]) => {
              const selected = filterClass === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setFilterClass(id)}
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

        <div className="relative mb-4">
          <Search
            size={15}
            strokeWidth={1.6}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reviews, outlets, SKUs, or defects"
            aria-label="Search audit log"
            className="h-9 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--border-strong)] focus:outline-none"
          />
        </div>

        <DataTable
          caption="Customer review divergence audit log"
          columns={cols}
          rows={filtered.slice(0, 150)}
          rowKey={(r) => r.reviewId}
          onRowClick={onInspectReview}
          maxHeightClass="max-h-[420px]"
        />
      </section>
    </div>
  );
}
