import io
import json
import requests
import pandas as pd
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable


def build_verified_telemetry_payload(
    df: pd.DataFrame,
    funnel_stats: dict,
    validation_metrics: dict,
    triage_df: pd.DataFrame,
    sku_drift_df: pd.DataFrame,
    outlet_drift_df: pd.DataFrame,
) -> dict:
    """Constructs the strict, deterministic JSON telemetry payload for briefing synthesis."""
    hidden_risk_df = df[df["divergence_class"] == "Hidden_Risk"]
    mismatch_df = df[df["divergence_class"] == "Rating_Mismatch"]

    top_hidden_examples = []
    for _, row in hidden_risk_df.sort_values("vader_compound").drop_duplicates(subset=["raw_text"]).head(3).iterrows():
        top_hidden_examples.append({
            "outlet": row["outlet"],
            "sku": row["sku"],
            "rating": float(row["rating"]),
            "vader_compound": float(row["vader_compound"]),
            "shift": row["shift_slot"],
            "defect": row["matched_failure_modes"],
            "excerpt": row["raw_text"][:160],
        })

    critical_and_caution = triage_df[triage_df["Triage Tier"].isin(["CRITICAL", "CAUTION"])].to_dict(orient="records")

    return {
        "hygiene_summary": {
            "raw_reviews": funnel_stats["raw_total"],
            "clean_reviews": funnel_stats["retained_clean"],
            "retention_pct": funnel_stats["retention_pct"],
            "scale_detected": funnel_stats["scale_detected"],
        },
        "headline_kpis": {
            "mean_star_rating": round(float(df["rating"].mean()), 2) if len(df) else 0.0,
            "mean_vader_polarity": validation_metrics["mean_vader_compound"],
            "vader_pearson_r": validation_metrics["vader_pearson_r"],
            "textblob_pearson_r": validation_metrics["textblob_pearson_r"],
            "hidden_risk_count": int(len(hidden_risk_df)),
            "hidden_risk_pct": round(len(hidden_risk_df) / len(df) * 100.0, 1) if len(df) else 0.0,
            "rating_mismatch_count": int(len(mismatch_df)),
        },
        "priority_triage_lanes": critical_and_caution,
        "sku_drift_alerts": sku_drift_df.to_dict(orient="records") if not sku_drift_df.empty else [],
        "outlet_drift_alerts": outlet_drift_df.to_dict(orient="records") if not outlet_drift_df.empty else [],
        "sample_hidden_risk_reviews": top_hidden_examples,
    }


def synthesize_briefing_text(
    telemetry: dict,
    use_ollama: bool = False,
    ollama_url: str = "http://localhost:11434/api/generate",
    model_name: str = "llama3.1:8b",
) -> tuple[str, str]:
    """
    Synthesizes the Branch Manager Shift Huddle narrative.
    - If use_ollama=True and local Ollama is reachable, queries Llama 3.1 8B at temperature=0.2
      with strict JSON grounding.
    - Otherwise (or on fallback), generates a 100% deterministic, zero-hallucination rule-grounded brief.
    """
    if use_ollama:
        prompt = (
            "You are a QSR Operations Consulting Director. Write a crisp, factual 1-page Branch Manager "
            "Shift Huddle Brief strictly using ONLY the verified JSON telemetry below. "
            "Do NOT invent any numbers, outlets, or menu items not present in the JSON. "
            "Structure into: (1) Executive Operational Pulse, (2) Priority Station Interventions, "
            "(3) 4-5 Star Hidden Risk & Quality Drift Warnings, and (4) Shift-Lead Pre-Rush Checklist.\n\n"
            f"VERIFIED TELEMETRY JSON:\n{json.dumps(telemetry, indent=2)}"
        )
        try:
            resp = requests.post(
                ollama_url,
                json={
                    "model": model_name,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.2, "num_predict": 650},
                },
                timeout=12,
            )
            if resp.status_code == 200:
                text = resp.json().get("response", "").strip()
                if text:
                    return text, f"On-Premise Ollama ({model_name}, temp=0.2)"
        except Exception:
            pass

    kpis = telemetry["headline_kpis"]
    hyg = telemetry["hygiene_summary"]
    lanes = telemetry["priority_triage_lanes"]
    sku_drifts = telemetry["sku_drift_alerts"]
    outlet_drifts = telemetry["outlet_drift_alerts"]
    hidden_ex = telemetry["sample_hidden_risk_reviews"]

    lines = [
        "1. EXECUTIVE OPERATIONAL PULSE",
        f"- Analyzed {hyg['clean_reviews']:,} verified reviews (from {hyg['raw_reviews']:,} raw records; {hyg['retention_pct']}% hygiene retention).",
        f"- Aggregate Rating: {kpis['mean_star_rating']:.2f} / 5.00 ★ | Mean VADER Polarity: {kpis['mean_vader_polarity']:+.3f} (Empirical Pearson r = {kpis['vader_pearson_r']:.3f} vs. TextBlob r = {kpis['textblob_pearson_r']:.3f}).",
        f"- 4-5★ Hidden Risk Blind Spot: {kpis['hidden_risk_count']} reviews ({kpis['hidden_risk_pct']}%) awarded 4-5 stars while reporting negative operational defects in text.",
        "",
        "2. PRIORITY STATION INTERVENTIONS (CRITICAL & CAUTION LANES)",
    ]

    if lanes:
        for item in lanes:
            lines.append(
                f"- [{item['Triage Tier']}] {item['Failure Mode']} ({item['Mentions']} mentions, {item['Negative Share (%)']}% negative) | "
                f"Hotspot: {item['Primary Outlet Hotspot']} during {item['Peak Shift Hotspot']} -> SOP: {item['Automated SOP Action']}"
            )
    else:
        lines.append("- All six operational stations are currently within HEALTHY or REVIEW thresholds (<30% negative concentration).")

    lines.append("")
    lines.append("3. CONSECUTIVE MULTI-WEEK QUALITY DRIFT WARNINGS")
    if sku_drifts or outlet_drifts:
        for d in sku_drifts:
            lines.append(
                f"- [SKU DRIFT] {d['entity_name']}: {d['consecutive_weeks']}-week monotonic slide ({d['window']}) "
                f"from {d['start_sentiment']:+.3f} to {d['end_sentiment']:+.3f} ({d['trajectory']})."
            )
        for d in outlet_drifts:
            lines.append(
                f"- [OUTLET DRIFT] {d['entity_name']}: {d['consecutive_weeks']}-week monotonic slide ({d['window']}) "
                f"from {d['start_sentiment']:+.3f} to {d['end_sentiment']:+.3f} ({d['trajectory']})."
            )
    else:
        lines.append("- Zero menu SKUs or outlets triggered a >=3-week consecutive sentiment slide alert.")

    lines.append("")
    lines.append("4. VERIFIED 4-5★ HIDDEN RISK CUSTOMER SIGNALS")
    if hidden_ex:
        for ex in hidden_ex:
            excerpt_clean = ex["excerpt"].replace('"', "'")
            lines.append(
                f"- {ex['outlet']} | {ex['sku']} | {ex['rating']:.1f}★ (VADER {ex['vader_compound']:+.3f}) | "
                f"Shift: {ex['shift']} | Defect: {ex['defect']} -> \"{excerpt_clean}\""
            )
    else:
        lines.append("- No 4-5★ Hidden Risk contradictions detected in the filtered dataset.")

    return "\n".join(lines), "Deterministic Grounded Synthesis Engine (Zero-Hallucination)"


def _pdf_safe(text) -> str:
    return str(text).replace("\u2605", "*").replace("\u2192", "->").replace("\u2014", "-")


def generate_shift_huddle_pdf(telemetry: dict, triage_df: pd.DataFrame, brief_text: str) -> bytes:
    """Renders a crisp, printable 1-Page Branch Manager Shift Huddle PDF in corporate slate/charcoal styling."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=32,
        rightMargin=32,
        topMargin=28,
        bottomMargin=24,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "HuddleTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=15,
        textColor=colors.HexColor("#0F172A"),
        spaceAfter=2,
    )
    subtitle_style = ParagraphStyle(
        "HuddleSub",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        textColor=colors.HexColor("#475569"),
        spaceAfter=8,
    )
    sec_style = ParagraphStyle(
        "SecHeader",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=10,
        textColor=colors.HexColor("#1E3A8A"),
        spaceBefore=8,
        spaceAfter=4,
    )
    body_style = ParagraphStyle(
        "BodyTextCustom",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.6,
        leading=10,
        textColor=colors.HexColor("#1E293B"),
        spaceAfter=2,
    )

    story = []
    story.append(Paragraph("READING THROUGH THE STARS - BRANCH MANAGER SHIFT HUDDLE BRIEF", title_style))
    story.append(
        Paragraph(
            "Hospitality & QSR Operational Triage Intelligence | Deterministic Telemetry & Station SOP Action Sheet",
            subtitle_style,
        )
    )
    story.append(HRFlowable(width="100%", thickness=1.2, color=colors.HexColor("#1E3A8A"), spaceAfter=8))

    kpis = telemetry["headline_kpis"]
    hyg = telemetry["hygiene_summary"]
    kpi_data = [
        ["CLEAN REVIEWS", "AVG STAR RATING", "VADER POLARITY", "VADER vs TB (r)", "4-5* HIDDEN RISK"],
        [
            f"{hyg['clean_reviews']:,} ({hyg['retention_pct']}%)",
            f"{kpis['mean_star_rating']:.2f} / 5.00",
            f"{kpis['mean_vader_polarity']:+.3f}",
            f"{kpis['vader_pearson_r']:.3f} vs {kpis['textblob_pearson_r']:.3f}",
            f"{kpis['hidden_risk_count']} ({kpis['hidden_risk_pct']}%)",
        ],
    ]
    kpi_table = Table(kpi_data, colWidths=[106, 106, 106, 106, 106])
    kpi_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E293B")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 7.2),
            ("BACKGROUND", (0, 1), (-1, 1), colors.HexColor("#F8FAFC")),
            ("TEXTCOLOR", (0, 1), (-1, 1), colors.HexColor("#0F172A")),
            ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 1), (-1, 1), 9.5),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("GRID", (0, 0), (-1, -1), 0.6, colors.HexColor("#CBD5E1")),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ])
    )
    story.append(kpi_table)
    story.append(Spacer(1, 8))

    story.append(Paragraph("6-MODE OPERATIONAL ROOT-CAUSE & STATION SOP TRIAGE MATRIX", sec_style))
    triage_rows = [["FAILURE MODE", "TIER", "MENTIONS", "NEG %", "HOTSPOT SHIFT", "MANDATORY SOP INTERVENTION"]]
    for _, r in triage_df.iterrows():
        triage_rows.append([
            r["Failure Mode"],
            r["Triage Tier"],
            str(r["Mentions"]),
            f"{r['Negative Share (%)']}%",
            r["Peak Shift Hotspot"],
            Paragraph(r["Automated SOP Action"], ParagraphStyle("Cell", fontName="Helvetica", fontSize=7.2, leading=9)),
        ])

    t_table = Table(triage_rows, colWidths=[82, 54, 48, 44, 88, 214])
    t_style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F172A")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 7.2),
        ("FONTSIZE", (0, 1), (-1, -1), 7.5),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    for idx, (_, r) in enumerate(triage_df.iterrows(), start=1):
        tier = r["Triage Tier"]
        if tier == "CRITICAL":
            t_style.append(("TEXTCOLOR", (1, idx), (1, idx), colors.HexColor("#991B1B")))
            t_style.append(("FONTNAME", (1, idx), (1, idx), "Helvetica-Bold"))
            t_style.append(("BACKGROUND", (0, idx), (-1, idx), colors.HexColor("#FEF2F2")))
        elif tier == "CAUTION":
            t_style.append(("TEXTCOLOR", (1, idx), (1, idx), colors.HexColor("#92400E")))
            t_style.append(("FONTNAME", (1, idx), (1, idx), "Helvetica-Bold"))
            t_style.append(("BACKGROUND", (0, idx), (-1, idx), colors.HexColor("#FFFBEB")))
        elif tier == "REVIEW":
            t_style.append(("TEXTCOLOR", (1, idx), (1, idx), colors.HexColor("#1E40AF")))
            t_style.append(("FONTNAME", (1, idx), (1, idx), "Helvetica-Bold"))
        else:
            t_style.append(("TEXTCOLOR", (1, idx), (1, idx), colors.HexColor("#166534")))

    t_table.setStyle(TableStyle(t_style))
    story.append(t_table)
    story.append(Spacer(1, 8))

    story.append(Paragraph("DIAGNOSTIC FINDINGS & PRE-SHIFT BRIEFING NOTES", sec_style))
    skipping = False
    for line in brief_text.split("\n"):
        clean_line = _pdf_safe(line.strip())
        if not clean_line:
            continue
        clean_line = clean_line.replace("3. CONSECUTIVE", "2. CONSECUTIVE").replace("4. VERIFIED", "3. VERIFIED")
        if clean_line.startswith("2. PRIORITY STATION"):
            skipping = True  # already shown in the triage matrix above
            continue
        if skipping and clean_line[0].isdigit() and "." in clean_line[:3]:
            skipping = False
        if skipping:
            continue
        if clean_line[0].isdigit() and "." in clean_line[:3]:
            story.append(Paragraph(f"<b>{clean_line}</b>", body_style))
        else:
            safe_line = clean_line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            story.append(Paragraph(safe_line, body_style))

    doc.build(story)
    return buf.getvalue()
