import random
from datetime import datetime, timedelta
import pandas as pd


def generate_qsr_benchmark_dataset(seed: int = 42) -> pd.DataFrame:
    """
    Generates a realistic 650-row multi-brand QSR & Casual Dining benchmark dataset
    (Domino's, Starbucks, California Burrito, Thyme & Whisk) across 6 ISO weeks,
    embedding realistic 4-5★ Hidden Risks, 3+ week SKU drift (Margherita Pizza),
    weekend packaging surges, morning barista rush delays, and hygiene noise rows.
    """
    rng = random.Random(seed)
    base_start = datetime(2026, 9, 28, 8, 0, 0)  # Monday start of 6-week window

    records = []

    # 1. Domino's — Margherita Pizza 4-Week Quality Slide (Friday/Saturday Evening cold food)
    weekly_margherita_templates = [
        # Week 0 (Strong)
        [
            (5, "Margherita Pizza arrived piping hot and super crispy, awesome crust!", 19, 4),
            (5, "Fresh cheese and hot Margherita Pizza delivered right on time.", 20, 5),
            (4, "Good Margherita Pizza, warm and tasty as expected.", 13, 2),
            (5, "Loved the Margherita Pizza and garlic bread, fresh from the oven.", 19, 3),
        ],
        # Week 1 (Slight dip)
        [
            (4, "Margherita Pizza tasted good, though slightly warm instead of hot.", 20, 4),
            (5, "Great flavor on the Margherita Pizza, fast delivery.", 19, 5),
            (4, "Nice Margherita Pizza, crust was decent.", 14, 1),
            (3, "Margherita Pizza was a bit lukewarm by the time it arrived.", 21, 5),
        ],
        # Week 2 (Noticeable erosion)
        [
            (3, "Margherita Pizza arrived lukewarm and the cheese had hardened.", 20, 4),
            (4, "Love the brand, 4 stars, but the Margherita Pizza arrived cold on Friday night.", 21, 4),
            (2, "Cold Margherita Pizza after waiting 50 minutes during dinner rush.", 20, 5),
            (4, "Tasty toppings on Margherita Pizza, just wish it wasn't tepid.", 19, 5),
        ],
        # Week 3 (Severe cold food slide)
        [
            (2, "Margherita Pizza was STONE COLD when delivered! Totally unacceptable.", 20, 4),
            (4, "Giving 4 stars for the polite rider, but Margherita Pizza arrived stone cold.", 21, 5),
            (1, "Ice cold Margherita Pizza, had to reheat the whole box.", 20, 5),
            (2, "Cold food again! Margherita Pizza lost all heat during dispatch.", 19, 4),
        ],
        # Week 4 (Continued slide)
        [
            (1, "STONE COLD Margherita Pizza and soggy crust, worst Friday order yet.", 20, 4),
            (2, "Margherita Pizza arrived cold and late, very disappointed.", 21, 5),
            (4, "Great staff as always, 4 stars, though Margherita Pizza was cold on arrival.", 20, 5),
            (1, "Frozen cold Margherita Pizza, completely ruined dinner.", 19, 4),
        ],
    ]

    for wk_idx, templates in enumerate(weekly_margherita_templates):
        for _ in range(3):
            for rating, text, hr, dow in templates:
                dt = base_start + timedelta(weeks=wk_idx, days=dow, hours=hr - 8, minutes=rng.randint(0, 55))
                records.append({
                    "outlet": "Domino's - Indiranagar",
                    "menu_item": "Margherita Pizza",
                    "rating": rating,
                    "review_text": text,
                    "timestamp": dt.strftime("%Y-%m-%d %H:%M:%S"),
                })

    # 2. California Burrito — Weekend Packaging Spills & Leaks (4-5★ Hidden Risks + Critical Packaging)
    cb_weekend_issues = [
        (5, "Great taste as always, 5 stars, but the burrito foil tore and salsa leaked everywhere in the bag!"),
        (4, "Delicious Paneer Burrito, giving 4 stars, however the salsa lid wasn't crimped and spilled all over."),
        (2, "Packaging completely crushed and leaked gravy across the entire delivery bag. Messy!"),
        (1, "Foil torn and salsa spilled everywhere, terrible packaging on Saturday night."),
        (4, "Love California Burrito! 4 stars, just fix your leaky salsa lids because it spilled in transit."),
        (2, "Missing dip and torn burrito wrapper, food was messy inside the box."),
    ]
    cb_weekday_good = [
        (5, "Fresh Paneer Burrito and crispy nachos, neatly packed and delivered fast!"),
        (5, "Best burrito bowl in town, generous portions and clean packaging."),
        (4, "Very fresh ingredients and quick lunch service."),
        (5, "Super tasty Chicken Burrito Bowl, hot and well sealed."),
    ]
    for wk_idx in range(6):
        # Weekend spikes (Fri/Sat/Sun)
        for dow in [4, 5, 6]:
            for _ in range(3):
                rating, text = rng.choice(cb_weekend_issues)
                dt = base_start + timedelta(weeks=wk_idx, days=dow, hours=rng.randint(11, 13), minutes=rng.randint(0, 59))
                records.append({
                    "outlet": "California Burrito - Koramangala",
                    "menu_item": "Paneer Burrito",
                    "rating": rating,
                    "review_text": text,
                    "timestamp": dt.strftime("%Y-%m-%d %H:%M:%S"),
                })
        # Weekday smooth ops
        for dow in [0, 1, 2, 3]:
            for _ in range(3):
                rating, text = rng.choice(cb_weekday_good)
                dt = base_start + timedelta(weeks=wk_idx, days=dow, hours=rng.randint(4, 9), minutes=rng.randint(0, 59))
                records.append({
                    "outlet": "California Burrito - Koramangala",
                    "menu_item": "Chicken Burrito Bowl",
                    "rating": rating,
                    "review_text": text,
                    "timestamp": dt.strftime("%Y-%m-%d %H:%M:%S"),
                })

    # 3. Starbucks — Morning Peak (07:00-11:00) Barista Bottleneck & Missing Items
    sb_morning_rush = [
        (2, "Waited 35 minutes for a single Iced Caramel Macchiato during morning rush, super slow service!"),
        (4, "Coffee tastes great as usual, 4 stars, but morning queue took forever and they forgot my napkin."),
        (1, "Horrible morning delay, mobile orders backed up and barista was rude when asked."),
        (3, "Caffe Latte was lukewarm after waiting 25 minutes at the counter."),
        (5, "Love my morning Cold Brew, quick pickup before office!"),
        (5, "Great espresso and friendly greeting from the morning team."),
    ]
    for wk_idx in range(6):
        for dow in range(7):
            for _ in range(4):
                rating, text = rng.choice(sb_morning_rush)
                hr = rng.choice([7, 8, 9, 10])
                dt = base_start + timedelta(weeks=wk_idx, days=dow, hours=hr - 8, minutes=rng.randint(0, 59))
                records.append({
                    "outlet": "Starbucks - HSR Layout",
                    "menu_item": "Iced Caramel Macchiato",
                    "rating": rating,
                    "review_text": text,
                    "timestamp": dt.strftime("%Y-%m-%d %H:%M:%S"),
                })

    # 4. Thyme & Whisk — High-Rated Flagship (4.65 baseline) with subtle Evening Service Delay & Freshness alerts
    tw_reviews = [
        (5, "Exceptional ambiance, piping hot Hyderabadi Biryani and attentive hospitality!"),
        (5, "Hands down the best Butter Chicken and garlic naan in Bengaluru. Fresh and flavorful."),
        (5, "Wonderful family dinner, staff was super polite and food arrived fresh."),
        (4, "Food was delicious, 4 stars, though Saturday dinner table service was slow and we waited 40 minutes."),
        (5, "Amazing desserts and main course, 5 stars, only complaint is the fries were a bit soggy and stale."),
        (2, "Bread felt stale and dry tonight, not up to their usual high standard."),
        (1, "Awesome food and super fast service!"),  # Accidental 1★ Rating_Mismatch
    ]
    for wk_idx in range(6):
        for dow in range(7):
            for _ in range(3):
                rating, text = rng.choice(tw_reviews)
                hr = rng.choice([13, 14, 19, 20, 21])
                dt = base_start + timedelta(weeks=wk_idx, days=dow, hours=hr - 8, minutes=rng.randint(0, 59))
                records.append({
                    "outlet": "Thyme & Whisk - Flagship",
                    "menu_item": "Hyderabadi Biryani",
                    "rating": rating,
                    "review_text": text,
                    "timestamp": dt.strftime("%Y-%m-%d %H:%M:%S"),
                })

    # 5. Add Hygiene Funnel test cases (blank ratings, exact duplicates, non-Latin noise) so Phase 1 metrics demonstrate real filtering
    records.extend([
        {"outlet": "Domino's - Indiranagar", "menu_item": "", "rating": 5, "review_text": "", "timestamp": "2026-10-05 19:10:00"},
        {"outlet": "Domino's - Indiranagar", "menu_item": "", "rating": 4, "review_text": " ", "timestamp": "2026-10-06 20:10:00"},
        {"outlet": "Starbucks - HSR Layout", "menu_item": "", "rating": 5, "review_text": "★★★★★", "timestamp": "2026-10-07 09:15:00"},
        # Exact duplicate retry
        records[0].copy(),
        records[1].copy(),
    ])

    return pd.DataFrame(records)
