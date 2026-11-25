import { useId, useMemo, useState } from "react";
import type { ProcessedReview, ShiftHeatmapCell, TriageRow } from "../engine/types";
import { DAY_ORDER, SHIFT_SLOTS } from "../engine/schemaResolver";

export interface LineSeries {
  id: string;
  label: string;
  color: string;
  values: Array<number | null>;
}

interface SmoothLineChartProps {
  labels: string[];
  series: LineSeries[];
  yMin: number;
  yMax: number;
  yTickFormatter?: (v: number) => string;
  valueFormatter?: (v: number) => string;
  height?: number;
  showArea?: boolean;
  zeroLine?: boolean;
}

function catmullRomPath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export function SmoothLineChart({
  labels,
  series,
  yMin,
  yMax,
  yTickFormatter = (v) => v.toFixed(1),
  valueFormatter = (v) => v.toFixed(2),
  height = 250,
  showArea = true,
  zeroLine = false,
}: SmoothLineChartProps) {
  const gradId = useId();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const width = 620;
  const padL = 44;
  const padR = 18;
  const padT = 18;
  const padB = 30;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const yTicks = useMemo(() => {
    const count = 5;
    return Array.from({ length: count }, (_, i) => yMin + ((yMax - yMin) * i) / (count - 1));
  }, [yMin, yMax]);

  const toX = (i: number) =>
    labels.length <= 1 ? padL + plotW / 2 : padL + (i / (labels.length - 1)) * plotW;
  const toY = (v: number) => padT + plotH - ((v - yMin) / Math.max(yMax - yMin, 1e-6)) * plotH;

  const activeIdx = hoverIdx !== null && hoverIdx < labels.length ? hoverIdx : null;

  return (
    <div className="relative w-full select-none">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block w-full h-auto overflow-visible"
        role="img"
        aria-label="Trend line chart"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          {series.map((s, idx) => (
            <linearGradient key={s.id} id={`${gradId}-${idx}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={idx === 0 ? "0.14" : "0.08"} />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {yTicks.map((t, i) => {
          const y = toY(t);
          return (
            <g key={i}>
              <line
                x1={padL}
                x2={width - padR}
                y1={y}
                y2={y}
                stroke="var(--border-hairline)"
                strokeWidth="1"
              />
              <text
                x={padL - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--text-muted)"
                className="font-mono-num"
              >
                {yTickFormatter(t)}
              </text>
            </g>
          );
        })}

        {zeroLine && yMin < 0 && yMax > 0 && (
          <line
            x1={padL}
            x2={width - padR}
            y1={toY(0)}
            y2={toY(0)}
            stroke="var(--border-strong)"
            strokeDasharray="4 4"
            strokeWidth="1"
          />
        )}

        {labels.map((lbl, i) => (
          <g key={lbl}>
            <line
              x1={toX(i)}
              x2={toX(i)}
              y1={padT}
              y2={padT + plotH}
              stroke="var(--border-hairline)"
              strokeOpacity="0.45"
              strokeWidth="1"
            />
            <text
              x={toX(i)}
              y={height - 8}
              textAnchor="middle"
              fontSize="11"
              fill="var(--text-muted)"
              className="font-mono-num"
            >
              {lbl.replace(/^\d{4}-/, "")}
            </text>
          </g>
        ))}

        {series.map((s, sIdx) => {
          const pts: Array<{ x: number; y: number }> = [];
          s.values.forEach((v, i) => {
            if (v !== null && !Number.isNaN(v)) {
              pts.push({ x: toX(i), y: toY(v) });
            }
          });
          if (pts.length === 0) return null;
          const lineD = catmullRomPath(pts);
          const areaD = `${lineD} L ${pts[pts.length - 1].x.toFixed(1)} ${(padT + plotH).toFixed(1)} L ${pts[0].x.toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;

          return (
            <g key={s.id}>
              {showArea && pts.length > 1 && (
                <path d={areaD} fill={`url(#${gradId}-${sIdx})`} />
              )}
              <path
                d={lineD}
                fill="none"
                stroke={s.color}
                strokeWidth={sIdx === 0 ? 2.25 : 1.75}
                strokeLinecap="round"
              />
              {pts.map((p, idx) => (
                <circle
                  key={idx}
                  cx={p.x}
                  cy={p.y}
                  r={activeIdx !== null ? 3 : 2.5}
                  fill="var(--bg-surface)"
                  stroke={s.color}
                  strokeWidth="1.75"
                />
              ))}
            </g>
          );
        })}

        {activeIdx !== null && (
          <g>
            <line
              x1={toX(activeIdx)}
              x2={toX(activeIdx)}
              y1={padT}
              y2={padT + plotH}
              stroke="var(--text-primary)"
              strokeOpacity="0.28"
              strokeWidth="1"
            />
            {series.map((s) => {
              const v = s.values[activeIdx];
              if (v === null || Number.isNaN(v)) return null;
              return (
                <circle
                  key={s.id}
                  cx={toX(activeIdx)}
                  cy={toY(v)}
                  r="5"
                  fill="var(--bg-surface)"
                  stroke={s.color}
                  strokeWidth="2.5"
                />
              );
            })}
          </g>
        )}

        {labels.map((lbl, i) => {
          const xStart = i === 0 ? padL : (toX(i - 1) + toX(i)) / 2;
          const xEnd = i === labels.length - 1 ? width - padR : (toX(i) + toX(i + 1)) / 2;
          return (
            <rect
              key={`hit-${lbl}`}
              x={xStart}
              y={padT}
              width={Math.max(12, xEnd - xStart)}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
            />
          );
        })}
      </svg>

      {activeIdx !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-xs shadow-[var(--shadow-float)]"
          style={{
            left: `${Math.min(72, Math.max(8, (toX(activeIdx) / width) * 100))}%`,
            transform: activeIdx > labels.length / 2 ? "translateX(-100%)" : "translateX(8px)",
          }}
        >
          <div className="mb-1 font-medium text-[var(--text-primary)]">{labels[activeIdx]}</div>
          {series.map((s) => {
            const v = s.values[activeIdx];
            if (v === null || Number.isNaN(v)) return null;
            return (
              <div key={s.id} className="flex items-center justify-between gap-4 py-0.5">
                <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  {s.label}
                </span>
                <span className="font-mono-num font-medium text-[var(--text-primary)]">
                  {valueFormatter(v)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export interface BarGroupItem {
  label: string;
  values: Array<{ name: string; value: number; color: string }>;
}

export function GroupedBarChart({
  groups,
  height = 250,
}: {
  groups: BarGroupItem[];
  height?: number;
}) {
  const [hoverGroup, setHoverGroup] = useState<number | null>(null);
  const width = 560;
  const padL = 38;
  const padR = 14;
  const padT = 18;
  const padB = 42;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxVal = useMemo(() => {
    let m = 10;
    for (const g of groups) {
      for (const v of g.values) {
        if (v.value > m) m = v.value;
      }
    }
    return Math.ceil(m / 10) * 10;
  }, [groups]);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxVal * f));
  const groupW = groups.length > 0 ? plotW / groups.length : plotW;

  return (
    <div className="relative w-full select-none">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block w-full h-auto overflow-visible"
        role="img"
        aria-label="Grouped bar chart"
        onMouseLeave={() => setHoverGroup(null)}
      >
        {yTicks.map((t) => {
          const y = padT + plotH - (t / maxVal) * plotH;
          return (
            <g key={t}>
              <line
                x1={padL}
                x2={width - padR}
                y1={y}
                y2={y}
                stroke="var(--border-hairline)"
                strokeWidth="1"
              />
              <text
                x={padL - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--text-muted)"
                className="font-mono-num"
              >
                {t}
              </text>
            </g>
          );
        })}

        {groups.map((g, gIdx) => {
          const cx = padL + gIdx * groupW + groupW / 2;
          const barCount = g.values.length;
          const barW = Math.min(18, Math.max(10, (groupW * 0.62) / Math.max(barCount, 1)));
          const gap = 5;
          const totalBarsW = barCount * barW + (barCount - 1) * gap;
          const startX = cx - totalBarsW / 2;

          return (
            <g
              key={g.label}
              onMouseEnter={() => setHoverGroup(gIdx)}
              style={{ opacity: hoverGroup === null || hoverGroup === gIdx ? 1 : 0.62 }}
            >
              {g.values.map((v, bIdx) => {
                const barH = Math.max(2, (v.value / maxVal) * plotH);
                const x = startX + bIdx * (barW + gap);
                const y = padT + plotH - barH;
                return (
                  <rect
                    key={v.name}
                    x={x}
                    y={y}
                    width={barW}
                    height={barH}
                    rx={Math.min(6, barW / 2)}
                    fill={v.color}
                  />
                );
              })}
              <text
                x={cx}
                y={height - 14}
                textAnchor="middle"
                fontSize="10.5"
                fill="var(--text-muted)"
              >
                {g.label.length > 13 ? `${g.label.slice(0, 12)}…` : g.label}
              </text>
            </g>
          );
        })}
      </svg>

      {hoverGroup !== null && groups[hoverGroup] && (
        <div className="pointer-events-none absolute right-3 top-2 z-10 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-xs shadow-[var(--shadow-float)]">
          <div className="mb-1 font-medium text-[var(--text-primary)]">
            {groups[hoverGroup].label}
          </div>
          {groups[hoverGroup].values.map((v) => (
            <div key={v.name} className="flex items-center justify-between gap-4 py-0.5">
              <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: v.color }} />
                {v.name}
              </span>
              <span className="font-mono-num font-medium text-[var(--text-primary)]">
                {v.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ShiftHeatmap({ cells }: { cells: ShiftHeatmapCell[] }) {
  const shortSlot: Record<string, string> = {
    "Morning (06-11h)": "Morning",
    "Lunch (11-15h)": "Lunch",
    "Afternoon (15-18h)": "Afternoon",
    "Evening (18-22h)": "Evening",
    "Late Night (22-06h)": "Late Night",
  };

  const cellStyle = (rate: number | null) => {
    if (rate === null) {
      return { bg: "var(--bg-subtle)", fg: "var(--text-muted)" };
    }
    if (rate >= 50) return { bg: "var(--status-crit-bg)", fg: "var(--status-crit-fg)" };
    if (rate >= 30) return { bg: "var(--status-caut-bg)", fg: "var(--status-caut-fg)" };
    if (rate >= 15) return { bg: "var(--accent-periwinkle-bg)", fg: "var(--text-primary)" };
    return { bg: "var(--bg-subtle)", fg: "var(--text-secondary)" };
  };

  const lookup = new Map<string, ShiftHeatmapCell>();
  for (const c of cells) lookup.set(`${c.day}|||${c.shiftSlot}`, c);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[500px]">
        <div className="grid grid-cols-[96px_repeat(5,minmax(0,1fr))] gap-1.5 pb-2 text-xs font-medium text-[var(--text-muted)]">
          <div />
          {SHIFT_SLOTS.map((slot) => (
            <div key={slot} className="text-center">
              {shortSlot[slot] ?? slot}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          {DAY_ORDER.map((day) => (
            <div key={day} className="grid grid-cols-[96px_repeat(5,minmax(0,1fr))] items-center gap-1.5">
              <div className="text-xs font-medium text-[var(--text-secondary)]">
                {day.slice(0, 3)}
              </div>
              {SHIFT_SLOTS.map((slot) => {
                const c = lookup.get(`${day}|||${slot}`);
                const st = cellStyle(c?.negRate ?? null);
                return (
                  <div
                    key={slot}
                    title={
                      c && c.totalVol > 0
                        ? `${day} ${slot}: ${c.negRate}% negative (${c.negVol}/${c.totalVol} reviews)`
                        : `${day} ${slot}: no reviews`
                    }
                    className="flex h-9 items-center justify-center rounded-lg text-xs font-mono-num font-medium"
                    style={{ backgroundColor: st.bg, color: st.fg }}
                  >
                    {c && c.negRate !== null ? `${c.negRate.toFixed(0)}%` : "—"}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function StationVolumeBreakdown({
  rows,
  onSelectRow,
}: {
  rows: TriageRow[];
  onSelectRow?: (row: TriageRow) => void;
}) {
  const sorted = useMemo(
    () => [...rows].filter((r) => r.mentions > 0).sort((a, b) => b.mentions - a.mentions),
    [rows]
  );

  if (sorted.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-[var(--text-muted)]">
        No station mentions in this slice.
      </div>
    );
  }

  const maxMentions = Math.max(...sorted.map((r) => r.mentions), 1);

  return (
    <div className="flex flex-col gap-3.5">
      {sorted.map((r) => {
        const negWidthPct = (r.negativeMentions / maxMentions) * 100;
        const nonNegCount = Math.max(0, r.mentions - r.negativeMentions);
        const nonNegWidthPct = (nonNegCount / maxMentions) * 100;

        return (
          <button
            key={r.modeKey}
            type="button"
            onClick={onSelectRow ? () => onSelectRow(r) : undefined}
            className="group flex w-full flex-col gap-1.5 rounded-lg p-1 text-left transition-colors hover:bg-[var(--bg-subtle)]"
          >
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium text-[var(--text-primary)]">{r.failureMode}</span>
              <span className="font-mono-num text-[var(--text-muted)]">
                <span className="font-medium text-[var(--text-primary)]">
                  {r.negativeMentions}
                </span>{" "}
                / {r.mentions} ({r.negativeSharePct.toFixed(0)}% neg)
              </span>
            </div>

            <div
              className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--bg-subtle)]"
              title={`${r.failureMode}: ${r.negativeMentions} negative, ${nonNegCount} non-negative (${r.mentions} total)`}
            >
              {negWidthPct > 0 && (
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${negWidthPct}%`,
                    backgroundColor: "var(--accent-ink)",
                  }}
                />
              )}
              {nonNegWidthPct > 0 && (
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${nonNegWidthPct}%`,
                    backgroundColor: "#c5ccfa",
                  }}
                />
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
              <span>{r.responsibleStation}</span>
              <span>Peak: {r.peakShiftHotspot.split(" (")[0]}</span>
            </div>
          </button>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-hairline)] pt-2.5 text-xs text-[var(--text-muted)]">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: "var(--accent-ink)" }}
            />
            Negative
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#c5ccfa]" />
            Non-Negative
          </span>
        </div>
        <span className="font-mono-num text-[11px]">Scale: 0 to {maxMentions} mentions</span>
      </div>
    </div>
  );
}

export function DivergenceScatterChart({
  reviews,
  onSelectReview,
}: {
  reviews: ProcessedReview[];
  onSelectReview: (r: ProcessedReview) => void;
}) {
  const [hovered, setHovered] = useState<ProcessedReview | null>(null);
  const width = 540;
  const height = 310;
  const padL = 46;
  const padR = 16;
  const padT = 16;
  const padB = 34;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const toX = (rating: number) => padL + ((rating - 0.7) / 4.6) * plotW;
  const toY = (vader: number) => padT + plotH - ((vader + 1.05) / 2.1) * plotH;

  // Deterministic micro-jitter based on reviewId index so integer star ratings separate cleanly
  const points = useMemo(() => {
    return reviews.slice(0, 500).map((r, i) => {
      const jitter = (((i * 37) % 19) - 9) * 0.022;
      return {
        review: r,
        x: toX(r.rating + jitter),
        y: toY(r.vaderCompound),
      };
    });
  }, [reviews]);

  const colorMap: Record<string, string> = {
    Hidden_Risk: "#dc2626",
    Rating_Mismatch: "#d97706",
    Aligned: "#9ca3af",
  };

  return (
    <div className="relative w-full select-none">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block w-full h-auto overflow-visible"
        role="img"
        aria-label="Rating versus sentiment divergence scatter plot"
        onMouseLeave={() => setHovered(null)}
      >
        {[-1, -0.5, 0, 0.5, 1].map((v) => {
          const y = toY(v);
          return (
            <g key={v}>
              <line
                x1={padL}
                x2={width - padR}
                y1={y}
                y2={y}
                stroke="var(--border-hairline)"
                strokeWidth="1"
              />
              <text
                x={padL - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--text-muted)"
                className="font-mono-num"
              >
                {v.toFixed(1)}
              </text>
            </g>
          );
        })}

        {[1, 2, 3, 4, 5].map((star) => (
          <text
            key={star}
            x={toX(star)}
            y={height - 10}
            textAnchor="middle"
            fontSize="11"
            fill="var(--text-muted)"
            className="font-mono-num"
          >
            {star}★
          </text>
        ))}

        {/* Quadrant thresholds */}
        <line
          x1={padL}
          x2={width - padR}
          y1={toY(-0.05)}
          y2={toY(-0.05)}
          stroke="#dc2626"
          strokeOpacity="0.45"
          strokeDasharray="4 4"
        />
        <line
          x1={padL}
          x2={width - padR}
          y1={toY(0.05)}
          y2={toY(0.05)}
          stroke="#16a34a"
          strokeOpacity="0.45"
          strokeDasharray="4 4"
        />
        <line
          x1={toX(3.5)}
          x2={toX(3.5)}
          y1={padT}
          y2={padT + plotH}
          stroke="var(--border-strong)"
          strokeDasharray="3 3"
        />

        {/* Quadrant labels */}
        <text x={toX(4.9)} y={toY(-0.92)} textAnchor="end" fontSize="10" fill="#dc2626">
          Hidden Risk zone
        </text>
        <text x={toX(1.0)} y={toY(0.92)} textAnchor="start" fontSize="10" fill="#d97706">
          Mismatch zone
        </text>

        {points.map(({ review, x, y }) => {
          const isSpecial = review.divergenceClass !== "Aligned";
          return (
            <circle
              key={review.reviewId}
              cx={x}
              cy={y}
              r={isSpecial ? 4.2 : 3}
              fill={colorMap[review.divergenceClass]}
              fillOpacity={isSpecial ? 0.85 : 0.35}
              className="cursor-pointer"
              onMouseEnter={() => setHovered(review)}
              onClick={() => onSelectReview(review)}
            />
          );
        })}
      </svg>

      {hovered && (
        <div className="pointer-events-none absolute right-3 top-2 z-10 max-w-[260px] rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3 text-xs shadow-[var(--shadow-float)]">
          <div className="font-medium text-[var(--text-primary)]">
            {hovered.outlet} ({hovered.rating}★, VADER {hovered.vaderCompound.toFixed(2)})
          </div>
          <div className="mt-1 line-clamp-3 text-[var(--text-secondary)]">{hovered.rawText}</div>
        </div>
      )}
    </div>
  );
}
