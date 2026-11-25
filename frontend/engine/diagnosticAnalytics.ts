import { DAY_ORDER, SHIFT_SLOTS } from "./schemaResolver";
import type {
  DivergenceClass,
  DriftAlert,
  FailureModeKey,
  ProcessedReview,
  ShiftHeatmapCell,
  WeeklyEntityMetric,
} from "./types";

export const FAILURE_MODES: Record<
  FailureModeKey,
  { label: string; station: string; patterns: RegExp[] }
> = {
  cold_food: {
    label: "Cold Food",
    station: "Hot-Hold / Oven-to-Dispatch Staging",
    patterns: [
      /\bcold\b/i, /\blukewarm\b/i, /\btepid\b/i, /\bnot hot\b/i,
      /\bwasn't hot\b/i, /\bwasnt hot\b/i, /\bmelted\b/i, /\bfrozen\b/i,
      /\bstone cold\b/i, /\bice cold\b/i, /\bcooled down\b/i,
    ],
  },
  service_delay: {
    label: "Service Delay",
    station: "Kitchen Make-Line & Expeditor Dispatch",
    patterns: [
      /\bslow\b/i, /\bwait\b/i, /\bwaited\b/i, /\bwaiting\b/i, /\blate\b/i,
      /\btook forever\b/i, /\bdelay\b/i, /\bdelayed\b/i, /\bhours\b/i,
      /\b45 min\b/i, /\b50 min\b/i, /\b60 min\b/i, /\b1 hour\b/i, /\btoo long\b/i,
    ],
  },
  packaging: {
    label: "Packaging Spills",
    station: "Expeditor Packing & Lid-Crimping Table",
    patterns: [
      /\bpackaging\b/i, /\bpackage\b/i, /\bspilled\b/i, /\bspill\b/i,
      /\bleaked\b/i, /\bleaking\b/i, /\bleak\b/i, /\bcrushed\b/i,
      /\bmessy\b/i, /\btorn\b/i, /\bburst\b/i, /\blid\b/i, /\bfoil\b/i,
    ],
  },
  missing_items: {
    label: "Missing Items",
    station: "Final Bag Check & Order Assembly",
    patterns: [
      /\bmissing\b/i, /\bforgot\b/i, /\bforgotten\b/i, /\bnot included\b/i,
      /\bwrong item\b/i, /\bwrong order\b/i, /\bincomplete\b/i, /\bno dip\b/i,
      /\bno sauce\b/i, /\bno cutlery\b/i, /\babsent\b/i,
    ],
  },
  stale_food: {
    label: "Stale / Freshness",
    station: "Prep Line & Hold-Time Rotation",
    patterns: [
      /\bstale\b/i, /\bsoggy\b/i, /\bhard\b/i, /\bold\b/i, /\bdry\b/i,
      /\brubbery\b/i, /\bundercooked\b/i, /\bovercooked\b/i, /\bnot fresh\b/i,
      /\bburnt\b/i, /\bsour\b/i,
    ],
  },
  rude_staff: {
    label: "Staff Behavior",
    station: "Front-of-House / Counter & Shift Lead",
    patterns: [
      /\brude\b/i, /\bimpolite\b/i, /\bunhelpful\b/i, /\battitude\b/i,
      /\bignored\b/i, /\barrogant\b/i, /\bdisrespectful\b/i, /\bunfriendly\b/i,
    ],
  },
};

const BENIGN_PHRASES =
  /cold brew|cold coffee|cold drink|cold beverage|iced|worth the wait|short wait|hard to beat|hard to resist|hard to find a better|good old|old school|old classic|old favou?rite|dry rub|dry fruit|(?:clean|great|good|neat|neatly|excellent|secure|secured|perfect|nice|sturdy|tight|well)\s+(?:packaging|package|packed|lid|foil)/gi;

const NEGATORS = new Set([
  "not", "no", "never", "without", "hardly", "nor",
  "wasnt", "isnt", "didnt", "dont", "doesnt", "zero", "nothing",
]);

function tagText(text: string, patterns: RegExp[]): boolean {
  const cleaned = text.replace(BENIGN_PHRASES, " ");
  const flat = cleaned.replace(/n['’]t/gi, "nt");

  for (const rx of patterns) {
    const flags = rx.flags.includes("g") ? rx.flags : `${rx.flags}g`;
    const globalRx = new RegExp(rx.source, flags);
    let m: RegExpExecArray | null;
    while ((m = globalRx.exec(flat)) !== null) {
      const firstWord = m[0].toLowerCase().split(/\s+/)[0];
      if (NEGATORS.has(firstWord)) return true;

      const beforeTokens = (flat.slice(0, m.index).toLowerCase().match(/[a-z']+/g) ?? []).slice(-3);
      if (beforeTokens.some((w) => NEGATORS.has(w))) continue;
      return true;
    }
  }
  return false;
}

export function auditAndClassifyReviews(
  scored: Array<Omit<ProcessedReview, "divergenceClass" | "divergenceGap" | "divergenceSource" | "modes" | "matchedFailureModes" | "primaryFailureMode" | "hasOperationalDefect">>
): ProcessedReview[] {
  const modeKeys = Object.keys(FAILURE_MODES) as FailureModeKey[];

  return scored.map((row) => {
    let divergenceClass: DivergenceClass = "Aligned";
    if (row.rating >= 4.0 && row.vaderCompound < -0.05) {
      divergenceClass = "Hidden_Risk";
    } else if (row.rating <= 2.0 && row.vaderCompound > 0.05) {
      divergenceClass = "Rating_Mismatch";
    }

    const divergenceGap =
      Math.round((((row.rating - 1.0) / 4.0) * 2.0 - 1.0 - row.vaderCompound) * 1000) / 1000;

    const modes = {} as Record<FailureModeKey, boolean>;
    const matchedLabels: string[] = [];
    const lowerA = row.pathASentimentText.toLowerCase();

    for (const key of modeKeys) {
      const hit = tagText(lowerA, FAILURE_MODES[key].patterns);
      modes[key] = hit;
      if (hit) matchedLabels.push(FAILURE_MODES[key].label);
    }

    const matchedFailureModes = matchedLabels.length > 0 ? matchedLabels.join(", ") : "None";
    const primaryFailureMode = matchedLabels.length > 0 ? matchedLabels[0] : "General / Other";
    const hasOperationalDefect = primaryFailureMode !== "General / Other";

    let divergenceSource = divergenceClass === "Hidden_Risk" ? "Negative text polarity" : "";
    if (divergenceClass === "Aligned" && row.rating >= 4.0 && hasOperationalDefect) {
      divergenceClass = "Hidden_Risk";
      divergenceSource = "Defect keyword in 4-5 star review";
    }

    return {
      ...row,
      divergenceClass,
      divergenceGap,
      divergenceSource,
      modes,
      matchedFailureModes,
      primaryFailureMode,
      hasOperationalDefect,
    };
  });
}

function isoWeekMondayMs(isoYearWeek: string): number {
  const m = /^(\d{4})-W(\d{2})$/.exec(isoYearWeek);
  if (!m) return NaN;
  const year = Number(m[1]);
  const week = Number(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const week1Mon = jan4.getTime() - jan4Day * 86400000;
  return week1Mon + (week - 1) * 7 * 86400000;
}

export function detectTemporalDrift(
  rows: ProcessedReview[],
  entityField: "sku" | "outlet",
  minWeeklyN = 3,
  minConsecutiveWeeks = 3,
  minTotalDrop = 0.10
): { weekly: WeeklyEntityMetric[]; alerts: DriftAlert[] } {
  const buckets = new Map<
    string,
    { entity: string; isoYearWeek: string; count: number; vaderSum: number; ratingSum: number; negCount: number }
  >();

  for (const r of rows) {
    const entity = r[entityField];
    const key = `${entity}|||${r.isoYearWeek}`;
    let b = buckets.get(key);
    if (!b) {
      b = { entity, isoYearWeek: r.isoYearWeek, count: 0, vaderSum: 0, ratingSum: 0, negCount: 0 };
      buckets.set(key, b);
    }
    b.count++;
    b.vaderSum += r.vaderCompound;
    b.ratingSum += r.rating;
    if (r.sentimentLabel === "Negative") b.negCount++;
  }

  const weekly: WeeklyEntityMetric[] = Array.from(buckets.values())
    .map((b) => ({
      entity: b.entity,
      isoYearWeek: b.isoYearWeek,
      reviewCount: b.count,
      meanSentiment: Math.round((b.vaderSum / b.count) * 1000) / 1000,
      meanRating: Math.round((b.ratingSum / b.count) * 100) / 100,
      negShare: Math.round((b.negCount / b.count) * 1000) / 10,
    }))
    .sort((a, b) =>
      a.entity === b.entity
        ? a.isoYearWeek.localeCompare(b.isoYearWeek)
        : a.entity.localeCompare(b.entity)
    );

  const byEntity = new Map<string, WeeklyEntityMetric[]>();
  for (const w of weekly) {
    if (w.reviewCount < minWeeklyN) continue;
    const list = byEntity.get(w.entity) ?? [];
    list.push(w);
    byEntity.set(w.entity, list);
  }

  const alerts: DriftAlert[] = [];
  for (const [entity, grp] of byEntity.entries()) {
    if (grp.length < minConsecutiveWeeks) continue;
    let bestStart = 0;
    let bestLen = 1;
    let curStart = 0;
    let curLen = 1;

    for (let i = 1; i < grp.length; i++) {
      const prevMs = isoWeekMondayMs(grp[i - 1].isoYearWeek);
      const currMs = isoWeekMondayMs(grp[i].isoYearWeek);
      const isContiguous = Math.round((currMs - prevMs) / 86400000) === 7;
      if (grp[i].meanSentiment < grp[i - 1].meanSentiment && isContiguous) {
        curLen++;
        if (curLen > bestLen) {
          bestLen = curLen;
          bestStart = curStart;
        }
      } else {
        curStart = i;
        curLen = 1;
      }
    }

    if (bestLen >= minConsecutiveWeeks) {
      const slice = grp.slice(bestStart, bestStart + bestLen);
      const startVal = slice[0].meanSentiment;
      const endVal = slice[slice.length - 1].meanSentiment;
      if (startVal - endVal < minTotalDrop) continue;

      const delta = Math.round((endVal - startVal) * 1000) / 1000;
      const trajectory = slice
        .map((s) => `${s.meanSentiment >= 0 ? "+" : ""}${s.meanSentiment.toFixed(3)}`)
        .join(" -> ");
      const totalMentions = slice.reduce((acc, s) => acc + s.reviewCount, 0);

      alerts.push({
        entityType: entityField === "sku" ? "SKU" : "OUTLET",
        entityName: entity,
        consecutiveWeeks: bestLen,
        window: `${slice[0].isoYearWeek} to ${slice[slice.length - 1].isoYearWeek}`,
        startSentiment: startVal,
        endSentiment: endVal,
        netErosion: delta,
        trajectory,
        totalMentions,
      });
    }
  }

  alerts.sort((a, b) =>
    b.consecutiveWeeks !== a.consecutiveWeeks
      ? b.consecutiveWeeks - a.consecutiveWeeks
      : a.netErosion - b.netErosion
  );

  return { weekly, alerts };
}

export function buildShiftHeatmap(rows: ProcessedReview[]): ShiftHeatmapCell[] {
  const cells: ShiftHeatmapCell[] = [];
  for (const day of DAY_ORDER) {
    for (const shiftSlot of SHIFT_SLOTS) {
      let totalVol = 0;
      let negVol = 0;
      for (const r of rows) {
        if (r.dayOfWeek === day && r.shiftSlot === shiftSlot) {
          totalVol++;
          if (r.sentimentLabel === "Negative") negVol++;
        }
      }
      cells.push({
        day,
        shiftSlot,
        negRate: totalVol > 0 ? Math.round((negVol / totalVol) * 1000) / 10 : null,
        negVol,
        totalVol,
      });
    }
  }
  return cells;
}
