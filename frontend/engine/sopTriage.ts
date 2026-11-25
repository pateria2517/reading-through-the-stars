import { FAILURE_MODES } from "./diagnosticAnalytics";
import type {
  FailureModeKey,
  OutletShiftTriageRow,
  ProcessedReview,
  StationTimelineRow,
  TriageRow,
  TriageTier,
} from "./types";

const SOP_PLAYBOOK: Record<string, Record<TriageTier, string>> = {
  "Cold Food": {
    CRITICAL:
      "Immediate audit of hot-holding cabinets, heat-lamp calibration, and insulated thermal pouch staging before rider pickup.",
    CAUTION:
      "Adjust peak-hour oven-to-bag staging timing; require thermal liner verification on delivery orders.",
    REVIEW: "Track weekly cold-food mentions by delivery partner transit window.",
    HEALTHY: "Maintain baseline hot-holding temperatures and dispatch handoff SLA.",
  },
  "Service Delay": {
    CRITICAL:
      "Deploy dedicated peak-hour expeditor; separate aggregator vs. dine-in make-line tickets and audit KDS prep bottlenecks.",
    CAUTION: "Rebalance shift-lead prep staging 30 minutes ahead of peak rush window.",
    REVIEW: "Monitor ticket completion times during weekend dinner transitions.",
    HEALTHY: "Maintain current make-line staffing and prep par levels.",
  },
  "Packaging Spills": {
    CRITICAL:
      "Mandate double-lid crimping, tamper-evident liquid seals, and upright corrugated tray dividers at packing station.",
    CAUTION: "Retrain weekend packing crew on foil double-wrapping and sauce cup placement.",
    REVIEW: "Inspect batch lid tolerances from packaging supplier during weekly stock check.",
    HEALTHY: "Maintain current packaging assembly checklist.",
  },
  "Missing Items": {
    CRITICAL:
      "Enforce mandatory 2-point visual and receipt highlight check by expeditor before sealing every delivery bag.",
    CAUTION: "Place dip and cutlery verification sticker on outer bag seal during high-volume shifts.",
    REVIEW: "Audit combo modifier tickets for frequently omitted add-ons.",
    HEALTHY: "Maintain current order verification sign-off.",
  },
  "Stale / Freshness": {
    CRITICAL:
      "Audit prep-holding timers immediately; discard expired batch pans and tighten FIFO batch-size par levels.",
    CAUTION: "Reduce batch holding window by 20 minutes during afternoon and off-peak transitions.",
    REVIEW: "Verify vendor ingredient freshness logs upon morning receiving.",
    HEALTHY: "Maintain standard FIFO batch rotation.",
  },
  "Staff Behavior": {
    CRITICAL:
      "Immediate branch manager floor coaching on guest recovery protocol, counter tone, and escalation handling.",
    CAUTION: "Conduct pre-shift hospitality briefing focused on peak-queue communication.",
    REVIEW: "Review counter and handoff staffing ratios during rush periods.",
    HEALTHY: "Recognize high-performing front-of-house shift crew.",
  },
};

const TIER_RANK: Record<TriageTier, number> = {
  CRITICAL: 0,
  CAUTION: 1,
  REVIEW: 2,
  HEALTHY: 3,
};

export function assignTriageTier(
  negShare: number,
  totalMentions: number,
  hasDrift = false
): TriageTier {
  if (negShare >= 50.0 && totalMentions >= 5) return "CRITICAL";
  if ((negShare >= 30.0 && negShare < 50.0) || (negShare >= 50.0 && totalMentions < 5) || hasDrift) {
    return "CAUTION";
  }
  if (negShare >= 15.0 && negShare < 30.0) return "REVIEW";
  return "HEALTHY";
}

function topKey(counts: Map<string, number>): string {
  let best = "N/A";
  let bestVal = -1;
  for (const [k, v] of counts.entries()) {
    if (v > bestVal) {
      bestVal = v;
      best = k;
    }
  }
  return best;
}

export function buildSopTriageMatrix(rows: ProcessedReview[]): TriageRow[] {
  const modeKeys = Object.keys(FAILURE_MODES) as FailureModeKey[];
  const out: TriageRow[] = [];

  for (const modeKey of modeKeys) {
    const meta = FAILURE_MODES[modeKey];
    const sub = rows.filter((r) => r.modes[modeKey]);
    const mentions = sub.length;

    let negCount = 0;
    let negShare = 0;
    let meanSent = 0;
    let topOutlet = "N/A";
    let topShift = "N/A";

    if (mentions > 0) {
      let vaderSum = 0;
      const outletCounts = new Map<string, number>();
      const shiftCounts = new Map<string, number>();

      for (const r of sub) {
        if (r.sentimentLabel === "Negative") negCount++;
        vaderSum += r.vaderCompound;
        outletCounts.set(r.outlet, (outletCounts.get(r.outlet) ?? 0) + 1);
        shiftCounts.set(r.shiftSlot, (shiftCounts.get(r.shiftSlot) ?? 0) + 1);
      }

      negShare = Math.round((negCount / mentions) * 1000) / 10;
      meanSent = Math.round((vaderSum / mentions) * 1000) / 1000;
      topOutlet = topKey(outletCounts);
      topShift = topKey(shiftCounts);
    }

    const tier = assignTriageTier(negShare, mentions);
    const sopAction =
      SOP_PLAYBOOK[meta.label]?.[tier] ?? "Monitor during weekly operations huddle.";

    out.push({
      modeKey,
      failureMode: meta.label,
      responsibleStation: meta.station,
      mentions,
      negativeMentions: negCount,
      negativeSharePct: negShare,
      meanSentiment: meanSent,
      primaryOutletHotspot: topOutlet,
      peakShiftHotspot: topShift,
      triageTier: tier,
      automatedSopAction: sopAction,
    });
  }

  out.sort((a, b) => {
    if (TIER_RANK[a.triageTier] !== TIER_RANK[b.triageTier]) {
      return TIER_RANK[a.triageTier] - TIER_RANK[b.triageTier];
    }
    if (b.negativeSharePct !== a.negativeSharePct) {
      return b.negativeSharePct - a.negativeSharePct;
    }
    return b.mentions - a.mentions;
  });

  return out;
}

export function buildOutletShiftTriage(rows: ProcessedReview[]): OutletShiftTriageRow[] {
  const modeKeys = Object.keys(FAILURE_MODES) as FailureModeKey[];
  const records: OutletShiftTriageRow[] = [];

  for (const modeKey of modeKeys) {
    const meta = FAILURE_MODES[modeKey];
    const groups = new Map<
      string,
      { outlet: string; shiftSlot: string; mentions: number; neg: number; vaderSum: number }
    >();

    for (const r of rows) {
      if (!r.modes[modeKey]) continue;
      const key = `${r.outlet}|||${r.shiftSlot}`;
      let g = groups.get(key);
      if (!g) {
        g = { outlet: r.outlet, shiftSlot: r.shiftSlot, mentions: 0, neg: 0, vaderSum: 0 };
        groups.set(key, g);
      }
      g.mentions++;
      if (r.sentimentLabel === "Negative") g.neg++;
      g.vaderSum += r.vaderCompound;
    }

    for (const g of groups.values()) {
      const negShare = Math.round((g.neg / g.mentions) * 1000) / 10;
      const tier = assignTriageTier(negShare, g.mentions);
      records.push({
        outlet: g.outlet,
        shiftSlot: g.shiftSlot,
        failureMode: meta.label,
        station: meta.station,
        mentions: g.mentions,
        negSharePct: negShare,
        meanSentiment: Math.round((g.vaderSum / g.mentions) * 1000) / 1000,
        triageTier: tier,
        sopAction: SOP_PLAYBOOK[meta.label]?.[tier] ?? "",
      });
    }
  }

  records.sort((a, b) => {
    if (TIER_RANK[a.triageTier] !== TIER_RANK[b.triageTier]) {
      return TIER_RANK[a.triageTier] - TIER_RANK[b.triageTier];
    }
    if (b.negSharePct !== a.negSharePct) return b.negSharePct - a.negSharePct;
    return b.mentions - a.mentions;
  });

  return records;
}

export function buildStationTimeline(rows: ProcessedReview[]): StationTimelineRow[] {
  const modeKeys: FailureModeKey[] = [
    "cold_food",
    "service_delay",
    "packaging",
    "missing_items",
    "stale_food",
    "rude_staff",
  ];
  const out: StationTimelineRow[] = [];

  for (const modeKey of modeKeys) {
    const sub = rows.filter((r) => r.modes[modeKey]);
    if (sub.length === 0) continue;

    let minTs = Infinity;
    let maxTs = -Infinity;
    let negCount = 0;
    for (const r of sub) {
      if (r.parsedTs < minTs) minTs = r.parsedTs;
      if (r.parsedTs > maxTs) maxTs = r.parsedTs;
      if (r.sentimentLabel === "Negative") negCount++;
    }
    const negPct = Math.round((negCount / sub.length) * 1000) / 10;
    const tier = assignTriageTier(negPct, sub.length);

    out.push({
      modeKey,
      stationFailure: FAILURE_MODES[modeKey].label,
      startTs: minTs,
      endTs: maxTs + 12 * 3600 * 1000,
      severityTier: tier,
      mentions: sub.length,
      negPct,
    });
  }

  return out;
}
