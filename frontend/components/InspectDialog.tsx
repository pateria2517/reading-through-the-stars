import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { DivergenceBadge, TierBadge } from "./TierBadge";
import type { ProcessedReview, TriageRow } from "../engine/types";

interface InspectDialogProps {
  triageRow: TriageRow | null;
  review: ProcessedReview | null;
  relatedReviews: ProcessedReview[];
  onClose: () => void;
}

export function InspectDialog({
  triageRow,
  review,
  relatedReviews,
  onClose,
}: InspectDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const open = triageRow !== null || review !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="app-dialog"
      aria-labelledby="inspect-dialog-title"
      {...({ closedby: "any" } as Record<string, unknown>)}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      {triageRow && (
        <div className="flex max-h-[82dvh] flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--border-hairline)] px-5 py-4">
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <TierBadge tier={triageRow.triageTier} />
                <span className="font-mono-num text-xs text-[var(--text-muted)]">
                  {triageRow.mentions} mentions, {triageRow.negativeSharePct}% negative
                </span>
              </div>
              <h2 id="inspect-dialog-title" className="text-base font-semibold text-[var(--text-primary)]">
                {triageRow.failureMode} — {triageRow.responsibleStation}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close inspection dialog"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex flex-col gap-4 overflow-y-auto p-5">
            <div className="rounded-xl bg-[var(--bg-subtle)] p-4">
              <div className="text-xs font-medium text-[var(--text-muted)]">Mandatory SOP Action</div>
              <p className="mt-1 text-sm leading-relaxed text-[var(--text-primary)]">
                {triageRow.automatedSopAction}
              </p>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--text-secondary)]">
                <span>Outlet hotspot: {triageRow.primaryOutletHotspot}</span>
                <span>Shift hotspot: {triageRow.peakShiftHotspot}</span>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-medium text-[var(--text-muted)]">
                Recent Matching Customer Signals
              </h3>
              <div className="flex flex-col gap-2">
                {relatedReviews.slice(0, 5).map((r) => (
                  <div
                    key={r.reviewId}
                    className="rounded-xl border border-[var(--border-hairline)] p-3 text-xs"
                  >
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-[var(--text-muted)]">
                      <span>
                        {r.outlet} ({r.sku})
                      </span>
                      <span className="font-mono-num">
                        {r.rating.toFixed(1)}★ | VADER {r.vaderCompound.toFixed(3)}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--text-primary)]">{r.rawText}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {review && !triageRow && (
        <div className="flex max-h-[82dvh] flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--border-hairline)] px-5 py-4">
            <div>
              <div className="mb-1.5 flex items-center gap-2">
                <DivergenceBadge cls={review.divergenceClass} />
                <span className="font-mono-num text-xs text-[var(--text-muted)]">
                  {review.reviewId}
                </span>
              </div>
              <h2 id="inspect-dialog-title" className="text-base font-semibold text-[var(--text-primary)]">
                {review.outlet} — {review.sku}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close review details"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex flex-col gap-4 overflow-y-auto p-5">
            <blockquote className="rounded-xl bg-[var(--bg-subtle)] p-4 text-sm leading-relaxed text-[var(--text-primary)]">
              &ldquo;{review.rawText}&rdquo;
            </blockquote>

            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
              <div className="rounded-xl border border-[var(--border-hairline)] p-3">
                <div className="text-[var(--text-muted)]">Star Rating</div>
                <div className="mt-1 font-mono-num text-base font-semibold">
                  {review.rating.toFixed(1)} ★
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border-hairline)] p-3">
                <div className="text-[var(--text-muted)]">VADER Compound</div>
                <div className="mt-1 font-mono-num text-base font-semibold">
                  {review.vaderCompound >= 0 ? "+" : ""}
                  {review.vaderCompound.toFixed(3)}
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border-hairline)] p-3">
                <div className="text-[var(--text-muted)]">Shift & Date</div>
                <div className="mt-1 font-medium">{review.shiftSlot}</div>
                <div className="font-mono-num text-[11px] text-[var(--text-muted)]">
                  {review.isoDate}
                </div>
              </div>
            </div>

            <div className="text-xs text-[var(--text-secondary)]">
              Detected failure modes:{" "}
              <span className="font-medium text-[var(--text-primary)]">
                {review.matchedFailureModes}
              </span>
              {review.divergenceSource ? ` (${review.divergenceSource})` : ""}
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
