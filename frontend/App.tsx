import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Clock,
  FileText,
  LayoutGrid,
  Menu,
  Moon,
  ShieldAlert,
  SlidersHorizontal,
  Sun,
  TrendingUp,
} from "lucide-react";
import { analyzeDataset, fetchBenchmark, type AnalysisResult } from "./api";
import { parseUploadedFile } from "./engine/ingestionHygiene";
import { downloadShiftHuddlePdf } from "./engine/briefingGenerator";
import type { ColumnMapping, ProcessedReview, TriageRow } from "./engine/types";
import { useColorScheme } from "./hooks/useColorScheme";
import { BrandMark } from "./components/BrandMark";
import { MobileNavDrawer, type NavItem } from "./components/MobileNavDrawer";
import { DataFilterDialog } from "./components/DataFilterDialog";
import { InspectDialog } from "./components/InspectDialog";
import { OverviewView } from "./views/OverviewView";
import { DriftView } from "./views/DriftView";
import { TriageView } from "./views/TriageView";
import { HiddenRiskView } from "./views/HiddenRiskView";
import { BriefView } from "./views/BriefView";

type PageId = "overview" | "drift" | "triage" | "risk" | "brief";

const PAGE_TITLES: Record<PageId, string> = {
  overview: "Dashboard",
  drift: "Drift Monitor",
  triage: "Shift Triage",
  risk: "Hidden Risk",
  brief: "Shift Brief",
};

export function App() {
  const { resolvedScheme, toggleScheme } = useColorScheme();
  const [activePage, setActivePage] = useState<PageId>("overview");
  const [viewMode, setViewMode] = useState<"analyst" | "management">("analyst");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [dataDialogOpen, setDataDialogOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);

  const [rawRows, setRawRows] = useState<Record<string, unknown>[] | null>(null);
  const [sourceLabel, setSourceLabel] = useState("Loading benchmark...");
  const [isCustomDataset, setIsCustomDataset] = useState(false);
  const [colOverrides, setColOverrides] = useState<Partial<ColumnMapping>>({});

  const [selectedOutlets, setSelectedOutlets] = useState<string[] | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<string[] | null>(null);
  const [ratingRange, setRatingRange] = useState<[number, number]>([1.0, 5.0]);
  const [useOllama, setUseOllama] = useState(false);
  const [ollamaModel, setOllamaModel] = useState("llama3.1:8b");

  const [inspectedTriage, setInspectedTriage] = useState<TriageRow | null>(null);
  const [inspectedReview, setInspectedReview] = useState<ProcessedReview | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchBenchmark(controller.signal)
      .then((benchmark) => {
        setRawRows(benchmark.rows);
        setSourceLabel(benchmark.sourceLabel);
        setAnalysisError(null);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setAnalysisError(error instanceof Error ? error.message : "Could not load the benchmark.");
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!rawRows) return;
    const controller = new AbortController();
    setIsAnalyzing(true);
    setAnalysisError(null);
    analyzeDataset(
      {
        rows: rawRows,
        colOverrides,
        selectedOutlets,
        selectedSlots,
        ratingRange,
        useOllama,
        ollamaModel,
      },
      controller.signal
    )
      .then((result) => setAnalysisResult(result))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setAnalysisError(error instanceof Error ? error.message : "Analysis failed.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsAnalyzing(false);
      });
    return () => controller.abort();
  }, [rawRows, colOverrides, selectedOutlets, selectedSlots, ratingRange, useOllama, ollamaModel]);

  const pipelineResult = {
    reviews: analysisResult?.reviews ?? [],
    funnelStats: analysisResult?.funnelStats ?? {
      rawTotal: rawRows?.length ?? 0,
      resolvedColumns: { text: null, rating: null, timestamp: null, sku: null, outlet: null },
      scaleDetected: "Unknown",
      timestampsSynthetic: false,
      droppedBlankText: 0,
      droppedDuplicates: 0,
      droppedNonLatinNoise: 0,
      droppedBadTimestamp: 0,
      droppedBadRating: 0,
      retainedClean: 0,
      retentionPct: 0,
    },
    columns: analysisResult?.columns ?? (rawRows?.length ? Object.keys(rawRows[0]) : []),
    error: analysisError,
  };
  const allOutlets = analysisResult?.allOutlets ?? [];
  const allSlots = analysisResult?.allSlots ?? [];

  const activeOutlets = selectedOutlets ?? allOutlets;
  const activeSlots = selectedSlots ?? allSlots;

  const filteredReviews = analysisResult?.reviews ?? [];
  const validationMetrics = analysisResult?.validationMetrics ?? {
    vaderPearsonR: 0,
    baselinePearsonR: 0,
    vaderLiftPct: 0,
    lexiconAgreementPct: 0,
    meanVaderCompound: 0,
    meanSubjectivity: 0,
  };
  const skuDrift = {
    weekly: analysisResult?.skuWeekly ?? [],
    alerts: analysisResult?.skuDrifts ?? [],
  };
  const outletDrift = {
    weekly: analysisResult?.outletWeekly ?? [],
    alerts: analysisResult?.outletDrifts ?? [],
  };
  const triageRows = analysisResult?.triageRows ?? [];
  const outletShiftRows = analysisResult?.outletShiftRows ?? [];
  const heatmapCells = analysisResult?.heatmapCells ?? [];
  const outletSummary = analysisResult?.outletSummary ?? [];
  const telemetry = analysisResult?.telemetry ?? {
    hygieneSummary: { rawReviews: 0, cleanReviews: 0, retentionPct: 0, scaleDetected: "Unknown" },
    headlineKpis: {
      meanStarRating: 0,
      meanVaderPolarity: 0,
      vaderPearsonR: 0,
      baselinePearsonR: 0,
      hiddenRiskCount: 0,
      hiddenRiskPct: 0,
      ratingMismatchCount: 0,
    },
    priorityTriageLanes: [],
    skuDriftAlerts: [],
    outletDriftAlerts: [],
    sampleHiddenRiskReviews: [],
  };
  const briefText = analysisResult?.briefText ?? "";

  const handleUploadFile = useCallback(async (file: File) => {
    const rows = await parseUploadedFile(file);
    setAnalysisResult(null);
    setAnalysisError(null);
    setRawRows(rows);
    setSourceLabel(file.name);
    setIsCustomDataset(true);
    setColOverrides({});
    setSelectedOutlets(null);
    setSelectedSlots(null);
    setRatingRange([1.0, 5.0]);
  }, []);

  const handleResetBenchmark = useCallback(async () => {
    try {
      const benchmark = await fetchBenchmark();
      setAnalysisResult(null);
      setAnalysisError(null);
      setRawRows(benchmark.rows);
      setSourceLabel(benchmark.sourceLabel);
      setIsCustomDataset(false);
      setColOverrides({});
      setSelectedOutlets(null);
      setSelectedSlots(null);
      setRatingRange([1.0, 5.0]);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Could not restore the benchmark.");
    }
  }, []);

  const navItems: NavItem[] = [
    { id: "overview", label: "Dashboard", icon: <LayoutGrid size={18} strokeWidth={1.6} /> },
    { id: "drift", label: "Drift Monitor", icon: <TrendingUp size={18} strokeWidth={1.6} /> },
    { id: "triage", label: "Shift Triage", icon: <Clock size={18} strokeWidth={1.6} /> },
    { id: "risk", label: "Hidden Risk", icon: <ShieldAlert size={18} strokeWidth={1.6} /> },
    { id: "brief", label: "Shift Brief", icon: <FileText size={18} strokeWidth={1.6} /> },
  ];

  const alertItems = useMemo(() => {
    const crits = triageRows
      .filter((t) => t.triageTier === "CRITICAL")
      .map((t) => `${t.failureMode} at ${t.primaryOutletHotspot} (${t.negativeSharePct}% neg)`);
    const drifts = [...skuDrift.alerts, ...outletDrift.alerts].map(
      (d) => `${d.entityName}: ${d.consecutiveWeeks}-week slide (${d.netErosion.toFixed(2)})`
    );
    return [...crits, ...drifts];
  }, [triageRows, skuDrift.alerts, outletDrift.alerts]);

  const relatedReviews = useMemo(() => {
    if (!inspectedTriage) return [];
    return filteredReviews
      .filter((r) => r.modes[inspectedTriage.modeKey])
      .sort((a, b) => a.vaderCompound - b.vaderCompound);
  }, [inspectedTriage, filteredReviews]);

  return (
    <div className="flex min-h-dvh bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      {/* Desktop Left Icon Rail matching design reference */}
      <aside
        aria-label="Primary navigation"
        className="sticky top-0 hidden h-dvh w-[72px] shrink-0 flex-col items-center justify-between py-5 md:flex"
        style={{ backgroundColor: "var(--bg-rail)" }}
      >
        <div className="flex w-full flex-col items-center gap-8">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActivePage("overview");
            }}
            aria-label="Reading through the Stars home"
            className="focus-visible:outline-2 focus-visible:outline-white"
          >
            <BrandMark />
          </a>

          <nav className="flex w-full flex-col items-center gap-2">
            {navItems.map((item) => {
              const active = activePage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActivePage(item.id as PageId)}
                  aria-current={active ? "page" : undefined}
                  aria-label={item.label}
                  title={item.label}
                  className="relative flex h-11 w-full items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-white"
                  style={{ color: active ? "#ffffff" : "#7b808c" }}
                >
                  {active && (
                    <span
                      className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full"
                      style={{ backgroundColor: "var(--accent-periwinkle)" }}
                      aria-hidden="true"
                    />
                  )}
                  {item.icon}
                </button>
              );
            })}
          </nav>
        </div>

        <button
          type="button"
          onClick={() => setDataDialogOpen(true)}
          aria-label="Dataset and operational filters"
          title="Dataset & Filters"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-[#7b808c] transition-colors hover:bg-white/10 hover:text-white"
        >
          <SlidersHorizontal size={18} strokeWidth={1.6} />
        </button>
      </aside>

      {/* Mobile Swipeable Navigation Drawer */}
      <MobileNavDrawer
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        items={navItems}
        activeId={activePage}
        onSelect={(id) => setActivePage(id as PageId)}
        onOpenDataDrawer={() => setDataDialogOpen(true)}
        dataActionIcon={<SlidersHorizontal size={18} strokeWidth={1.6} />}
        viewMode={viewMode}
        onChangeViewMode={(mode) => {
          setViewMode(mode);
          if (mode === "management") setActivePage("overview");
        }}
      />

      {/* Main Content Shell */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          id="top"
          className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 sm:px-7"
        >
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={mobileNavOpen}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] md:hidden"
            >
              <Menu size={18} strokeWidth={1.6} />
            </button>

            <h1 className="truncate text-lg font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
              {PAGE_TITLES[activePage]}
            </h1>

            <span
              aria-live="polite"
              className="hidden rounded-md bg-[var(--bg-subtle)] px-2 py-0.5 font-mono-num text-xs text-[var(--text-muted)] sm:inline-block"
            >
              {isAnalyzing
                ? "Updating analysis..."
                : `${filteredReviews.length.toLocaleString()} reviews`}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div
              role="group"
              aria-label="View mode"
              className="hidden items-center gap-1 rounded-lg bg-[var(--bg-subtle)] p-1 sm:inline-flex"
            >
              {(
                [
                  ["analyst", "Analyst"],
                  ["management", "Summary"],
                ] as const
              ).map(([id, label]) => {
                const active = viewMode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setViewMode(id);
                      if (id === "management") setActivePage("overview");
                    }}
                    className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: active ? "var(--accent-ink)" : "transparent",
                      color: active ? "var(--accent-ink-fg)" : "var(--text-muted)",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setDataDialogOpen(true)}
              aria-label="Data and filters"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)]"
            >
              <SlidersHorizontal size={14} strokeWidth={1.6} />
              <span className="hidden sm:inline">Data & Filters</span>
            </button>

            <button
              type="button"
              onClick={toggleScheme}
              aria-label={
                resolvedScheme === "dark" ? "Switch to light theme" : "Switch to dark theme"
              }
              title={resolvedScheme === "dark" ? "Light theme" : "Dark theme"}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
            >
              {resolvedScheme === "dark" ? (
                <Sun size={17} strokeWidth={1.6} />
              ) : (
                <Moon size={17} strokeWidth={1.6} />
              )}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setAlertsOpen((v) => !v)}
                aria-expanded={alertsOpen}
                aria-label={`Operational alerts (${alertItems.length})`}
                className="relative flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
              >
                <Bell size={17} strokeWidth={1.6} />
                {alertItems.length > 0 && (
                  <span
                    className="absolute right-2 top-2 h-2 w-2 rounded-full"
                    style={{ backgroundColor: "var(--status-crit-dot)" }}
                    aria-hidden="true"
                  />
                )}
              </button>

              {alertsOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3 shadow-[var(--shadow-float)]">
                  <div className="mb-2 flex items-center justify-between text-xs font-semibold text-[var(--text-primary)]">
                    <span>Active Operational Alerts</span>
                    <span className="font-mono-num text-[var(--text-muted)]">
                      {alertItems.length}
                    </span>
                  </div>
                  {alertItems.length === 0 ? (
                    <div className="py-3 text-xs text-[var(--text-muted)]">
                      No critical stations or 3-week slides in this slice.
                    </div>
                  ) : (
                    <ul className="flex flex-col gap-1.5 text-xs text-[var(--text-secondary)]">
                      {alertItems.map((msg, i) => (
                        <li
                          key={i}
                          className="rounded-lg bg-[var(--bg-subtle)] px-2.5 py-2 leading-snug"
                        >
                          {msg}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="hidden items-center gap-2.5 pl-1 lg:flex">
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                Reading Stars
              </span>
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold"
                style={{
                  backgroundColor: "var(--accent-periwinkle-bg)",
                  color: "var(--text-primary)",
                }}
              >
                QS
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 sm:p-6 lg:p-7">
          {!analysisResult && !pipelineResult.error ? (
            <div
              role="status"
              className="rounded-[14px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-8 text-center text-sm text-[var(--text-secondary)]"
            >
              {rawRows ? "Analyzing the dataset..." : "Loading benchmark data..."}
            </div>
          ) : pipelineResult.error ? (
            <div
              role="alert"
              className="rounded-[14px] border p-6 text-sm"
              style={{
                backgroundColor: "var(--status-crit-bg)",
                borderColor: "var(--border-hairline)",
                color: "var(--status-crit-fg)",
              }}
            >
              <div className="font-semibold">Analysis Error</div>
              <p className="mt-1">{pipelineResult.error}</p>
              <button
                type="button"
                onClick={() => setDataDialogOpen(true)}
                className="mt-3 rounded-lg px-3 py-1.5 text-xs font-medium"
                style={{ backgroundColor: "var(--accent-ink)", color: "var(--accent-ink-fg)" }}
              >
                Open Column Mapping
              </button>
            </div>
          ) : (
            <>
              {pipelineResult.funnelStats.timestampsSynthetic && (
                <div
                  className="mb-4 rounded-xl border border-[var(--border-hairline)] px-4 py-3 text-xs"
                  style={{
                    backgroundColor: "var(--status-caut-bg)",
                    color: "var(--status-caut-fg)",
                  }}
                >
                  No timestamp column detected: dates are sequential placeholders, so the shift
                  heatmap and drift alerts are approximate. Map a timestamp column in Data & Filters.
                </div>
              )}

              {filteredReviews.length === 0 ? (
                <div className="rounded-[14px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-8 text-center">
                  <p className="text-sm text-[var(--text-secondary)]">
                    No reviews match the current Outlet, Shift, or Rating filters.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedOutlets(null);
                      setSelectedSlots(null);
                      setRatingRange([1.0, 5.0]);
                    }}
                    className="mt-3 rounded-lg px-3.5 py-2 text-xs font-medium"
                    style={{
                      backgroundColor: "var(--accent-ink)",
                      color: "var(--accent-ink-fg)",
                    }}
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                <>
                  {activePage === "overview" && (
                    <OverviewView
                      mode={viewMode}
                      reviews={filteredReviews}
                      funnelStats={pipelineResult.funnelStats}
                      validationMetrics={validationMetrics}
                      triageRows={triageRows}
                      outletSummary={outletSummary}
                      skuDrifts={skuDrift.alerts}
                      outletDrifts={outletDrift.alerts}
                      onInspectTriage={(r) => setInspectedTriage(r)}
                      onInspectReview={(r) => setInspectedReview(r)}
                      onDownloadPdf={() =>
                        void downloadShiftHuddlePdf(telemetry, triageRows, briefText)
                      }
                    />
                  )}
                  {activePage === "drift" && (
                    <DriftView
                      skuWeekly={skuDrift.weekly}
                      outletWeekly={outletDrift.weekly}
                      skuDrifts={skuDrift.alerts}
                      outletDrifts={outletDrift.alerts}
                    />
                  )}
                  {activePage === "triage" && (
                    <TriageView
                      heatmapCells={heatmapCells}
                      triageRows={triageRows}
                      outletShiftRows={outletShiftRows}
                      onInspectTriage={(r) => setInspectedTriage(r)}
                    />
                  )}
                  {activePage === "risk" && (
                    <HiddenRiskView
                      reviews={filteredReviews}
                      onInspectReview={(r) => setInspectedReview(r)}
                    />
                  )}
                  {activePage === "brief" && (
                    <BriefView
                      telemetry={telemetry}
                      briefText={briefText}
                      briefEngine={analysisResult?.briefEngine ?? "Deterministic grounded synthesis"}
                      triageRows={triageRows}
                      reviews={filteredReviews}
                      skuDrifts={skuDrift.alerts}
                      useOllama={useOllama}
                      ollamaModel={ollamaModel}
                      onChangeUseOllama={setUseOllama}
                      onChangeOllamaModel={setOllamaModel}
                    />
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>

      <DataFilterDialog
        open={dataDialogOpen}
        onClose={() => setDataDialogOpen(false)}
        sourceLabel={sourceLabel}
        isCustomDataset={isCustomDataset}
        onUploadFile={handleUploadFile}
        onResetBenchmark={handleResetBenchmark}
        columns={pipelineResult.columns}
        colOverrides={colOverrides}
        onChangeOverrides={setColOverrides}
        allOutlets={allOutlets}
        selectedOutlets={activeOutlets}
        onChangeOutlets={(v) => setSelectedOutlets(v)}
        allSlots={allSlots}
        selectedSlots={activeSlots}
        onChangeSlots={(v) => setSelectedSlots(v)}
        ratingRange={ratingRange}
        onChangeRatingRange={setRatingRange}
        pipelineError={pipelineResult.error}
      />

      <InspectDialog
        triageRow={inspectedTriage}
        review={inspectedReview}
        relatedReviews={relatedReviews}
        onClose={() => {
          setInspectedTriage(null);
          setInspectedReview(null);
        }}
      />
    </div>
  );
}
export default App;
