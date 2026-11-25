function createRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatTs(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

export interface RawRecord {
  outlet: string;
  menu_item: string;
  rating: number;
  review_text: string;
  timestamp: string;
  [key: string]: unknown;
}

export function generateQsrBenchmarkDataset(seed = 42): RawRecord[] {
  const rng = createRng(seed);
  // Monday 2026-09-28 08:00:00 UTC
  const baseStartMs = Date.UTC(2026, 8, 28, 8, 0, 0);
  const HOUR = 3600 * 1000;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;

  const records: RawRecord[] = [];

  // 1. Domino's — Margherita Pizza 5-Week Quality Slide
  const weeklyMargheritaTemplates: Array<Array<[number, string, number, number]>> = [
    [
      [5, "Margherita Pizza arrived piping hot and super crispy, awesome crust!", 19, 4],
      [5, "Fresh cheese and hot Margherita Pizza delivered right on time.", 20, 5],
      [4, "Good Margherita Pizza, warm and tasty as expected.", 13, 2],
      [5, "Loved the Margherita Pizza and garlic bread, fresh from the oven.", 19, 3],
    ],
    [
      [4, "Margherita Pizza tasted good, though slightly warm instead of hot.", 20, 4],
      [5, "Great flavor on the Margherita Pizza, fast delivery.", 19, 5],
      [4, "Nice Margherita Pizza, crust was decent.", 14, 1],
      [3, "Margherita Pizza was a bit lukewarm by the time it arrived.", 21, 5],
    ],
    [
      [3, "Margherita Pizza arrived lukewarm and the cheese had hardened.", 20, 4],
      [4, "Love the brand, 4 stars, but the Margherita Pizza arrived cold on Friday night.", 21, 4],
      [2, "Cold Margherita Pizza after waiting 50 minutes during dinner rush.", 20, 5],
      [4, "Tasty toppings on Margherita Pizza, just wish it wasn't tepid.", 19, 5],
    ],
    [
      [2, "Margherita Pizza was STONE COLD when delivered! Totally unacceptable.", 20, 4],
      [4, "Giving 4 stars for the polite rider, but Margherita Pizza arrived stone cold.", 21, 5],
      [1, "Ice cold Margherita Pizza, had to reheat the whole box.", 20, 5],
      [2, "Cold food again! Margherita Pizza lost all heat during dispatch.", 19, 4],
    ],
    [
      [1, "STONE COLD Margherita Pizza and soggy crust, worst Friday order yet.", 20, 4],
      [2, "Margherita Pizza arrived cold and late, very disappointed.", 21, 5],
      [4, "Great staff as always, 4 stars, though Margherita Pizza was cold on arrival.", 20, 5],
      [1, "Frozen cold Margherita Pizza, completely ruined dinner.", 19, 4],
    ],
  ];

  weeklyMargheritaTemplates.forEach((templates, wkIdx) => {
    for (let rep = 0; rep < 3; rep++) {
      for (const [rating, text, hr, dow] of templates) {
        const ms =
          baseStartMs +
          wkIdx * WEEK +
          dow * DAY +
          (hr - 8) * HOUR +
          randInt(rng, 0, 55) * 60 * 1000;
        records.push({
          outlet: "Domino's - Indiranagar",
          menu_item: "Margherita Pizza",
          rating,
          review_text: text,
          timestamp: formatTs(ms),
        });
      }
    }
  });

  // 2. California Burrito — Weekend Packaging Spills & Leaks
  const cbWeekendIssues: Array<[number, string]> = [
    [5, "Great taste as always, 5 stars, but the burrito foil tore and salsa leaked everywhere in the bag!"],
    [4, "Delicious Paneer Burrito, giving 4 stars, however the salsa lid wasn't crimped and spilled all over."],
    [2, "Packaging completely crushed and leaked gravy across the entire delivery bag. Messy!"],
    [1, "Foil torn and salsa spilled everywhere, terrible packaging on Saturday night."],
    [4, "Love California Burrito! 4 stars, just fix your leaky salsa lids because it spilled in transit."],
    [2, "Missing dip and torn burrito wrapper, food was messy inside the box."],
  ];
  const cbWeekdayGood: Array<[number, string]> = [
    [5, "Fresh Paneer Burrito and crispy nachos, neatly packed and delivered fast!"],
    [5, "Best burrito bowl in town, generous portions and clean packaging."],
    [4, "Very fresh ingredients and quick lunch service."],
    [5, "Super tasty Chicken Burrito Bowl, hot and well sealed."],
  ];

  for (let wkIdx = 0; wkIdx < 6; wkIdx++) {
    for (const dow of [4, 5, 6]) {
      for (let rep = 0; rep < 3; rep++) {
        const [rating, text] = pick(rng, cbWeekendIssues);
        const ms =
          baseStartMs +
          wkIdx * WEEK +
          dow * DAY +
          randInt(rng, 11, 13) * HOUR +
          randInt(rng, 0, 59) * 60 * 1000;
        records.push({
          outlet: "California Burrito - Koramangala",
          menu_item: "Paneer Burrito",
          rating,
          review_text: text,
          timestamp: formatTs(ms),
        });
      }
    }
    for (const dow of [0, 1, 2, 3]) {
      for (let rep = 0; rep < 3; rep++) {
        const [rating, text] = pick(rng, cbWeekdayGood);
        const ms =
          baseStartMs +
          wkIdx * WEEK +
          dow * DAY +
          randInt(rng, 4, 9) * HOUR +
          randInt(rng, 0, 59) * 60 * 1000;
        records.push({
          outlet: "California Burrito - Koramangala",
          menu_item: "Chicken Burrito Bowl",
          rating,
          review_text: text,
          timestamp: formatTs(ms),
        });
      }
    }
  }

  // 3. Starbucks — Morning Peak Barista Bottleneck & Missing Items
  const sbMorningRush: Array<[number, string]> = [
    [2, "Waited 35 minutes for a single Iced Caramel Macchiato during morning rush, super slow service!"],
    [4, "Coffee tastes great as usual, 4 stars, but morning queue took forever and they forgot my napkin."],
    [1, "Horrible morning delay, mobile orders backed up and barista was rude when asked."],
    [3, "Caffe Latte was lukewarm after waiting 25 minutes at the counter."],
    [5, "Love my morning Cold Brew, quick pickup before office!"],
    [5, "Great espresso and friendly greeting from the morning team."],
  ];
  for (let wkIdx = 0; wkIdx < 6; wkIdx++) {
    for (let dow = 0; dow < 7; dow++) {
      for (let rep = 0; rep < 4; rep++) {
        const [rating, text] = pick(rng, sbMorningRush);
        const hr = pick(rng, [7, 8, 9, 10]);
        const ms =
          baseStartMs +
          wkIdx * WEEK +
          dow * DAY +
          (hr - 8) * HOUR +
          randInt(rng, 0, 59) * 60 * 1000;
        records.push({
          outlet: "Starbucks - HSR Layout",
          menu_item: "Iced Caramel Macchiato",
          rating,
          review_text: text,
          timestamp: formatTs(ms),
        });
      }
    }
  }

  // 4. Thyme & Whisk — Flagship with subtle Evening Service Delay & Freshness alerts
  const twReviews: Array<[number, string]> = [
    [5, "Exceptional ambiance, piping hot Hyderabadi Biryani and attentive hospitality!"],
    [5, "Hands down the best Butter Chicken and garlic naan in Bengaluru. Fresh and flavorful."],
    [5, "Wonderful family dinner, staff was super polite and food arrived fresh."],
    [4, "Food was delicious, 4 stars, though Saturday dinner table service was slow and we waited 40 minutes."],
    [5, "Amazing desserts and main course, 5 stars, only complaint is the fries were a bit soggy and stale."],
    [2, "Bread felt stale and dry tonight, not up to their usual high standard."],
    [1, "Awesome food and super fast service!"],
  ];
  for (let wkIdx = 0; wkIdx < 6; wkIdx++) {
    for (let dow = 0; dow < 7; dow++) {
      for (let rep = 0; rep < 3; rep++) {
        const [rating, text] = pick(rng, twReviews);
        const hr = pick(rng, [13, 14, 19, 20, 21]);
        const ms =
          baseStartMs +
          wkIdx * WEEK +
          dow * DAY +
          (hr - 8) * HOUR +
          randInt(rng, 0, 59) * 60 * 1000;
        records.push({
          outlet: "Thyme & Whisk - Flagship",
          menu_item: "Hyderabadi Biryani",
          rating,
          review_text: text,
          timestamp: formatTs(ms),
        });
      }
    }
  }

  // 5. Hygiene funnel test rows
  records.push(
    { outlet: "Domino's - Indiranagar", menu_item: "", rating: 5, review_text: "", timestamp: "2026-10-05 19:10:00" },
    { outlet: "Domino's - Indiranagar", menu_item: "", rating: 4, review_text: " ", timestamp: "2026-10-06 20:10:00" },
    { outlet: "Starbucks - HSR Layout", menu_item: "", rating: 5, review_text: "★★★★★", timestamp: "2026-10-07 09:15:00" },
    { ...records[0] },
    { ...records[1] }
  );

  return records;
}
