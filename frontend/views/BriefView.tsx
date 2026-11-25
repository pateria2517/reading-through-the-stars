import { useState } from "react";
import { Check, Copy, Download, FileSpreadsheet, FileText } from "lucide-react";
import {
  downloadReviewsCsv,
  downloadShiftHuddlePdf,
  downloadTriageWorkbookXlsx,
} from "../engine/briefingGenerator";
import type {
  DriftAlert,
  ProcessedReview,
  TriageRow,
  VerifiedTelemetryPayload,
} from "../engine/types";

interface BriefViewProps {
  telemetry: VerifiedTelemetryPayload;
  briefText: string;
  briefEngine: string;
  triageRows: TriageRow[];
  reviews: ProcessedReview[];
  skuDrifts: DriftAlert[];
  useOllama: boolean;
  ollamaModel: string;
  onChangeUseOllama: (enabled: boolean) => void;
  onChangeOllamaModel: (model: string) => void;
}

export function BriefView({
  telemetry,
  briefText,
  briefEngine,
  triageRows,
  reviews,
  skuDrifts,
  useOllama,
  ollamaModel,
  onChangeUseOllama,
  onChangeOllamaModel,
}: BriefViewProps) {
  const [editableBrief, setEditableBrief] = useState(briefText);
  const [prevSource, setPrevSource] = useState(briefText);
  const [modelDraft, setModelDraft] = useState(ollamaModel);
  const [prevModel, setPrevModel] = useState(ollamaModel);
  const [copied, setCopied] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [busyExport, setBusyExport] = useState<string | null>(null);

  if (briefText !== prevSource) {
    setPrevSource(briefText);
    setEditableBrief(briefText);
  }
  if (ollamaModel !== prevModel) {
    setPrevModel(ollamaModel);
    setModelDraft(ollamaModel);
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(editableBrief);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const handlePdf = async () => {
    setBusyExport("pdf");
    try {
      await downloadShiftHuddlePdf(telemetry, triageRows, editableBrief);
    } finally {
      setBusyExport(null);
    }
  };

  const handleXlsx = async () => {
    setBusyExport("xlsx");
    try {
      await downloadTriageWorkbookXlsx({ triageRows, reviews, skuDrifts });
    } finally {
      setBusyExport(null);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <section className="rounded-[14px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-card)] lg:col-span-7">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Branch Manager Shift Huddle Brief
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Grounded narrative derived strictly from verified slice telemetry.
            </p>
            <p aria-live="polite" className="mt-1 text-xs text-[var(--text-muted)]">
              Synthesis engine: {briefEngine}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)]"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? "Copied" : "Copy text"}</span>
          </button>
        </div>

        <div className="mb-3 flex flex-wrap items-end gap-3 border-b border-[var(--border-hairline)] pb-3">
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={useOllama}
              onChange={(event) => onChangeUseOllama(event.target.checked)}
            />
            Enable on-premise Ollama
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
            Ollama model tag
            <input
              type="text"
              value={modelDraft}
              disabled={!useOllama}
              onChange={(event) => setModelDraft(event.target.value)}
              onBlur={() => {
                const nextModel = modelDraft.trim();
                if (useOllama && nextModel && nextModel !== ollamaModel) {
                  onChangeOllamaModel(nextModel);
                }
              }}
              className="h-8 w-48 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2 text-xs text-[var(--text-primary)] disabled:opacity-50"
            />
          </label>
        </div>

        <textarea
          value={editableBrief}
          onChange={(e) => setEditableBrief(e.target.value)}
          aria-label="Shift huddle brief text"
          rows={18}
          className="w-full resize-y rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-4 font-mono-num text-xs leading-relaxed text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:outline-none"
        />
      </section>

      <section className="flex flex-col gap-4 rounded-[14px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-card)] lg:col-span-5">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Deliverables & Triage Exports
          </h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Generate a printable 1-page Shift Huddle PDF or export full diagnostic workbooks in-browser.
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={handlePdf}
            disabled={busyExport !== null}
            className="flex h-11 items-center justify-between rounded-xl px-4 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: "var(--accent-ink)", color: "var(--accent-ink-fg)" }}
          >
            <span className="flex items-center gap-2.5">
              <FileText size={16} strokeWidth={1.6} />
              <span>
                {busyExport === "pdf"
                  ? "Generating PDF..."
                  : "Download 1-Page Shift Huddle Brief (PDF)"}
              </span>
            </span>
            <Download size={15} strokeWidth={1.6} />
          </button>

          <button
            type="button"
            onClick={handleXlsx}
            disabled={busyExport !== null}
            className="flex h-11 items-center justify-between rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)] disabled:opacity-60"
          >
            <span className="flex items-center gap-2.5">
              <FileSpreadsheet size={16} strokeWidth={1.6} />
              <span>
                {busyExport === "xlsx"
                  ? "Building Workbook..."
                  : "Download Complete Triage Workbook (XLSX)"}
              </span>
            </span>
            <Download size={15} strokeWidth={1.6} />
          </button>

          <button
            type="button"
            onClick={() => downloadReviewsCsv(reviews)}
            className="flex h-11 items-center justify-between rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)]"
          >
            <span className="flex items-center gap-2.5">
              <Download size={16} strokeWidth={1.6} />
              <span>Download Scored Reviews & Defects (CSV)</span>
            </span>
            <span className="font-mono-num text-xs text-[var(--text-muted)]">
              {reviews.length} rows
            </span>
          </button>
        </div>

        <div className="border-t border-[var(--border-hairline)] pt-4">
          <button
            type="button"
            onClick={() => setShowJson((v) => !v)}
            aria-expanded={showJson}
            className="text-xs font-medium text-[var(--text-secondary)] underline underline-offset-4 hover:text-[var(--text-primary)]"
          >
            {showJson ? "Hide verified telemetry JSON" : "Inspect verified telemetry JSON"}
          </button>

          {showJson && (
            <pre className="mt-3 max-h-[260px] overflow-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-subtle)] p-3 font-mono-num text-[11px] text-[var(--text-secondary)]">
              {JSON.stringify(telemetry, null, 2)}
            </pre>
          )}
        </div>
      </section>
    </div>
  );
}
