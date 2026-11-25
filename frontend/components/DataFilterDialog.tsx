import { useEffect, useRef, useState } from "react";
import { RotateCcw, Upload, X } from "lucide-react";
import type { ColumnMapping } from "../engine/types";

interface DataFilterDialogProps {
  open: boolean;
  onClose: () => void;
  sourceLabel: string;
  isCustomDataset: boolean;
  onUploadFile: (file: File) => Promise<void>;
  onResetBenchmark: () => void;
  columns: string[];
  colOverrides: Partial<ColumnMapping>;
  onChangeOverrides: (next: Partial<ColumnMapping>) => void;
  allOutlets: string[];
  selectedOutlets: string[];
  onChangeOutlets: (next: string[]) => void;
  allSlots: string[];
  selectedSlots: string[];
  onChangeSlots: (next: string[]) => void;
  ratingRange: [number, number];
  onChangeRatingRange: (next: [number, number]) => void;
  pipelineError: string | null;
}

export function DataFilterDialog({
  open,
  onClose,
  sourceLabel,
  isCustomDataset,
  onUploadFile,
  onResetBenchmark,
  columns,
  colOverrides,
  onChangeOverrides,
  allOutlets,
  selectedOutlets,
  onChangeOutlets,
  allSlots,
  selectedSlots,
  onChangeSlots,
  ratingRange,
  onChangeRatingRange,
  pipelineError,
}: DataFilterDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    setLoading(true);
    try {
      await onUploadFile(file);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to parse file.");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  const toggleItem = (list: string[], item: string, setter: (v: string[]) => void) => {
    if (list.includes(item)) {
      if (list.length > 1) setter(list.filter((x) => x !== item));
    } else {
      setter([...list, item]);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="app-dialog"
      aria-labelledby="data-filter-title"
      {...({ closedby: "any" } as Record<string, unknown>)}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="flex max-h-[85dvh] flex-col">
        <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-5 py-4">
          <div>
            <h2 id="data-filter-title" className="text-base font-semibold text-[var(--text-primary)]">
              Dataset & Operational Slice Filters
            </h2>
            <p className="text-xs text-[var(--text-muted)]">Active source: {sourceLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dataset and filters"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
          >
            <X size={18} strokeWidth={1.6} />
          </button>
        </div>

        <div className="flex flex-col gap-6 overflow-y-auto p-5">
          {/* Ingestion */}
          <section>
            <h3 className="mb-2 text-sm font-medium text-[var(--text-primary)]">
              Input Dataset
            </h3>
            <div className="flex flex-wrap items-center gap-2.5">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,.json"
                onChange={handleFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-xs font-medium transition-opacity hover:opacity-90"
                style={{ backgroundColor: "var(--accent-ink)", color: "var(--accent-ink-fg)" }}
              >
                <Upload size={14} strokeWidth={1.6} />
                <span>{loading ? "Loading..." : "Upload CSV, Excel, or JSON"}</span>
              </button>

              {isCustomDataset && (
                <button
                  type="button"
                  onClick={onResetBenchmark}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
                >
                  <RotateCcw size={13} strokeWidth={1.6} />
                  <span>Restore QSR Benchmark</span>
                </button>
              )}
            </div>
            {(uploadError || pipelineError) && (
              <div
                className="mt-2.5 rounded-lg px-3 py-2 text-xs"
                style={{ backgroundColor: "var(--status-crit-bg)", color: "var(--status-crit-fg)" }}
              >
                {uploadError ?? pipelineError}
              </div>
            )}
          </section>

          {/* Column Overrides */}
          {columns.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-medium text-[var(--text-primary)]">
                Schema Column Mapping
              </h3>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {(
                  [
                    ["text", "Review Text"],
                    ["rating", "Star Rating"],
                    ["timestamp", "Timestamp"],
                    ["sku", "Menu SKU"],
                    ["outlet", "Outlet / Brand"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
                    <span>{label}</span>
                    <select
                      value={colOverrides[key] ?? ""}
                      onChange={(e) =>
                        onChangeOverrides({
                          ...colOverrides,
                          [key]: e.target.value || null,
                        })
                      }
                      className="h-9 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 text-xs text-[var(--text-primary)]"
                    >
                      <option value="">Auto-Detect</option>
                      {columns.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </section>
          )}

          {/* Outlets */}
          {allOutlets.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium text-[var(--text-primary)]">Outlets / Brands</h3>
                <button
                  type="button"
                  onClick={() => onChangeOutlets(allOutlets)}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  Select all
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {allOutlets.map((o) => {
                  const active = selectedOutlets.includes(o);
                  return (
                    <button
                      key={o}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleItem(selectedOutlets, o, onChangeOutlets)}
                      className="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors"
                      style={{
                        backgroundColor: active ? "var(--accent-ink)" : "var(--bg-surface)",
                        color: active ? "var(--accent-ink-fg)" : "var(--text-secondary)",
                        borderColor: active ? "var(--accent-ink)" : "var(--border-hairline)",
                      }}
                    >
                      {o}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Shift Slots */}
          {allSlots.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium text-[var(--text-primary)]">Shift Day-Parts</h3>
                <button
                  type="button"
                  onClick={() => onChangeSlots(allSlots)}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  Select all
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {allSlots.map((slot) => {
                  const active = selectedSlots.includes(slot);
                  return (
                    <button
                      key={slot}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleItem(selectedSlots, slot, onChangeSlots)}
                      className="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors"
                      style={{
                        backgroundColor: active ? "var(--accent-ink)" : "var(--bg-surface)",
                        color: active ? "var(--accent-ink-fg)" : "var(--text-secondary)",
                        borderColor: active ? "var(--accent-ink)" : "var(--border-hairline)",
                      }}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Star Rating Range */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium text-[var(--text-primary)]">
                Star Rating Filter
              </h3>
              <span className="font-mono-num text-xs text-[var(--text-muted)]">
                {ratingRange[0].toFixed(1)}★ to {ratingRange[1].toFixed(1)}★
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
                <span>Minimum</span>
                <select
                  value={ratingRange[0]}
                  onChange={(e) => {
                    const min = Number(e.target.value);
                    onChangeRatingRange([min, Math.max(min, ratingRange[1])]);
                  }}
                  className="h-9 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 text-xs text-[var(--text-primary)]"
                >
                  {[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((v) => (
                    <option key={v} value={v}>
                      {v.toFixed(1)} ★
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
                <span>Maximum</span>
                <select
                  value={ratingRange[1]}
                  onChange={(e) => {
                    const max = Number(e.target.value);
                    onChangeRatingRange([Math.min(ratingRange[0], max), max]);
                  }}
                  className="h-9 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 text-xs text-[var(--text-primary)]"
                >
                  {[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((v) => (
                    <option key={v} value={v}>
                      {v.toFixed(1)} ★
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
        </div>

        <div className="flex justify-end border-t border-[var(--border-hairline)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg px-4 text-xs font-medium"
            style={{ backgroundColor: "var(--accent-ink)", color: "var(--accent-ink-fg)" }}
          >
            Done
          </button>
        </div>
      </div>
    </dialog>
  );
}
