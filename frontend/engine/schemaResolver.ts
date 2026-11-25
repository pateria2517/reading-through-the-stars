import type { ColumnMapping } from "./types";

const COLUMN_SYNONYMS: Record<keyof ColumnMapping, string[]> = {
  text: [
    "review_text",
    "review",
    "text",
    "comment",
    "feedback",
    "comments",
    "body",
    "content",
    "description",
    "customer_review",
  ],
  rating: ["rating", "stars", "star_rating", "score", "rate", "overall_rating", "review_rating"],
  timestamp: [
    "timestamp",
    "date",
    "review_date",
    "created_at",
    "time",
    "datetime",
    "order_date",
    "submitted_at",
    "posted_on",
    "posted",
    "review_time",
    "date_time",
    "reviewed_on",
    "review_posted",
  ],
  sku: ["sku", "item", "menu_item", "product", "dish", "food_item", "product_name", "item_name"],
  outlet: ["outlet", "branch", "store", "location", "restaurant", "brand", "city", "outlet_name", "store_name"],
};

export const DEFAULT_SKU_DICTIONARY: Record<string, string[]> = {
  "Margherita Pizza": ["margherita", "margarita", "cheese pizza"],
  "Pepperoni Pizza": ["pepperoni"],
  "Farmhouse Pizza": ["farmhouse", "veggie pizza"],
  "Garlic Breadsticks": ["garlic bread", "breadsticks", "stuffed garlic"],
  "Peri-Peri Chicken Burger": ["peri-peri", "peri peri", "chicken burger", "burger"],
  "Crispy Fries": ["fries", "french fries"],
  "Chicken Burrito Bowl": ["burrito bowl", "rice bowl"],
  "Paneer Burrito": ["paneer burrito", "burrito", "wrap"],
  "Salsa & Nachos": ["salsa", "nachos", "guacamole", "chips"],
  "Iced Caramel Macchiato": ["macchiato", "caramel", "iced coffee"],
  "Caffe Latte": ["latte", "cappuccino", "espresso"],
  "Cold Brew": ["cold brew", "americano"],
  "Hyderabadi Biryani": ["biryani", "raita", "salan"],
  "Butter Chicken": ["butter chicken", "naan", "dal makhani"],
};

export const SHIFT_SLOTS = [
  "Morning (06-11h)",
  "Lunch (11-15h)",
  "Afternoon (15-18h)",
  "Evening (18-22h)",
  "Late Night (22-06h)",
] as const;

export const DAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

function normalizeColKey(c: string): string {
  return c.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function toNumeric(val: unknown): number {
  if (typeof val === "number") return Number.isFinite(val) ? val : NaN;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return NaN;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

export function resolveColumns(rows: Record<string, unknown>[]): ColumnMapping {
  const resolved: ColumnMapping = { text: null, rating: null, timestamp: null, sku: null, outlet: null };
  if (rows.length === 0) return resolved;

  const columns = Object.keys(rows[0]);
  const colsLower = new Map<string, string>();
  for (const c of columns) {
    colsLower.set(normalizeColKey(c), c);
  }

  const used = () => new Set(Object.values(resolved).filter((v): v is string => v !== null));

  (Object.keys(COLUMN_SYNONYMS) as Array<keyof ColumnMapping>).forEach((target) => {
    for (const syn of COLUMN_SYNONYMS[target]) {
      const exact = colsLower.get(syn);
      if (exact) {
        resolved[target] = exact;
        break;
      }
    }
    if (resolved[target] === null) {
      for (const syn of COLUMN_SYNONYMS[target]) {
        for (const [cl, orig] of colsLower.entries()) {
          if (cl.includes(syn) && !used().has(orig)) {
            resolved[target] = orig;
            break;
          }
        }
        if (resolved[target] !== null) break;
      }
    }
  });

  // Mostly-numeric column is never review text
  if (resolved.text !== null) {
    const col = resolved.text;
    let numCount = 0;
    for (const r of rows) {
      if (!Number.isNaN(toNumeric(r[col]))) numCount++;
    }
    if (numCount / rows.length > 0.9) {
      resolved.text = null;
    }
  }

  if (resolved.text === null) {
    let bestCol: string | null = null;
    let bestLen = 0;
    for (const col of columns) {
      if (used().has(col)) continue;
      let sum = 0;
      let cnt = 0;
      let numCnt = 0;
      for (const r of rows) {
        const v = r[col];
        if (v !== null && v !== undefined && String(v).trim() !== "") {
          if (!Number.isNaN(toNumeric(v))) numCnt++;
          sum += String(v).length;
          cnt++;
        }
      }
      if (cnt > 0 && numCnt / cnt < 0.8) {
        const avg = sum / cnt;
        if (avg > 15 && avg > bestLen) {
          bestLen = avg;
          bestCol = col;
        }
      }
    }
    resolved.text = bestCol;
  }

  if (resolved.rating === null) {
    for (const col of columns) {
      if (used().has(col)) continue;
      const nums: number[] = [];
      for (const r of rows) {
        const n = toNumeric(r[col]);
        if (!Number.isNaN(n)) nums.push(n);
      }
      if (nums.length > 0) {
        let min = Infinity;
        let max = -Infinity;
        const uniq = new Set<number>();
        for (const n of nums) {
          if (n < min) min = n;
          if (n > max) max = n;
          uniq.add(n);
        }
        if (min >= 0 && max <= 100 && uniq.size <= 20) {
          resolved.rating = col;
          break;
        }
      }
    }
  }

  return resolved;
}

export function normalizeRatingScale(rawValues: unknown[]): { scaled: number[]; scaleLabel: string } {
  const nums = rawValues.map(toNumeric);
  const valid = nums.filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
  if (valid.length === 0) {
    return { scaled: nums, scaleLabel: "Unknown" };
  }

  const idx = 0.9 * (valid.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const p90 = valid[lo] + (valid[hi] - valid[lo]) * (idx - lo);
  const maxVal = valid[valid.length - 1];

  let scaleLabel = "Native 1-5★ Scale";
  const scaled = nums.map((n) => {
    if (Number.isNaN(n)) return NaN;
    if (p90 > 10 || maxVal > 10) {
      return Math.round((1.0 + (n / 100.0) * 4.0) * 100) / 100;
    }
    if (p90 > 5 || maxVal > 5) {
      const s = Math.min(5.0, Math.max(1.0, 1.0 + ((n - 1.0) / 9.0) * 4.0));
      return Math.round(s * 100) / 100;
    }
    return Math.round(n * 100) / 100;
  });

  if (p90 > 10 || maxVal > 10) scaleLabel = "0-100 Scale (Normalized to 1-5★)";
  else if (p90 > 5 || maxVal > 5) scaleLabel = "1-10 Scale (Normalized to 1-5★)";

  return { scaled, scaleLabel };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SKU_PATTERNS: Array<[string, RegExp[]]> = Object.entries(DEFAULT_SKU_DICTIONARY).map(
  ([skuName, kws]) => [
    skuName,
    kws.map((kw) => new RegExp(`\\b${escapeRegex(kw.toLowerCase())}\\b`, "i")),
  ]
);

export function extractSku(text: string): string {
  if (!text || !text.trim()) return "General / Unspecified";
  const low = text.toLowerCase();
  for (const [skuName, regexes] of SKU_PATTERNS) {
    for (const rx of regexes) {
      if (rx.test(low)) return skuName;
    }
  }
  return "General Menu";
}

export function assignShiftSlot(hour: number): string {
  if (hour >= 6 && hour < 11) return "Morning (06-11h)";
  if (hour >= 11 && hour < 15) return "Lunch (11-15h)";
  if (hour >= 15 && hour < 18) return "Afternoon (15-18h)";
  if (hour >= 18 && hour < 22) return "Evening (18-22h)";
  return "Late Night (22-06h)";
}

function parseDateValue(raw: unknown, dayFirst: boolean): number {
  if (raw === null || raw === undefined) return NaN;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? NaN : raw.getTime();
  if (typeof raw === "number") {
    // Excel serial date safeguard
    if (raw > 25000 && raw < 80000) {
      return Date.UTC(1899, 11, 30) + raw * 86400 * 1000;
    }
    return raw > 1e11 ? raw : raw * 1000;
  }

  const s = String(raw).trim();
  if (!s) return NaN;

  // ISO format YYYY-MM-DD HH:mm:ss or YYYY-MM-DDTHH:mm:ss
  const isoMatch = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (isoMatch) {
    const [, y, m, d, hh = "0", mm = "0", ss = "0"] = isoMatch;
    const ms = Date.UTC(+y, +m - 1, +d, +hh, +mm, +ss);
    return Number.isNaN(ms) ? NaN : ms;
  }

  // Slash or dash date DD/MM/YYYY or MM/DD/YYYY
  const slashMatch = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (slashMatch) {
    const [, aStr, bStr, yStr, hh = "0", mm = "0", ss = "0"] = slashMatch;
    const a = +aStr;
    const b = +bStr;
    const y = yStr.length === 2 ? 2000 + +yStr : +yStr;
    const day = dayFirst ? a : b;
    const month = dayFirst ? b : a;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return Date.UTC(y, month - 1, day, +hh, +mm, +ss);
    }
    return NaN;
  }

  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? NaN : parsed;
}

export function parseTimestamps(rawValues: unknown[]): number[] {
  let monthFirstNa = 0;
  let dayFirstNa = 0;
  const mf = rawValues.map((v) => {
    const t = parseDateValue(v, false);
    if (Number.isNaN(t)) monthFirstNa++;
    return t;
  });
  const df = rawValues.map((v) => {
    const t = parseDateValue(v, true);
    if (Number.isNaN(t)) dayFirstNa++;
    return t;
  });
  return dayFirstNa < monthFirstNa ? df : mf;
}

export function getTemporalMetadata(ms: number): {
  isoDate: string;
  dayOfWeek: string;
  dayNum: number;
  hour: number;
  isWeekend: boolean;
  shiftSlot: string;
  isoYearWeek: string;
} {
  const d = new Date(ms);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hour = d.getUTCHours();

  // JS getUTCDay: 0=Sun, 1=Mon..6=Sat -> convert to 0=Mon..6=Sun
  const dayNum = (d.getUTCDay() + 6) % 7;
  const dayOfWeek = DAY_ORDER[dayNum];
  const isWeekend = dayNum === 4 || dayNum === 5 || dayNum === 6;
  const shiftSlot = assignShiftSlot(hour);

  // ISO week calculation in UTC
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.getTime();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  }
  const isoWeek = 1 + Math.ceil((firstThursday - target.getTime()) / 604800000);
  const isoYear = new Date(firstThursday).getUTCFullYear();

  return {
    isoDate: `${year}-${month}-${day}`,
    dayOfWeek,
    dayNum,
    hour,
    isWeekend,
    shiftSlot,
    isoYearWeek: `${isoYear}-W${String(isoWeek).padStart(2, "0")}`,
  };
}
