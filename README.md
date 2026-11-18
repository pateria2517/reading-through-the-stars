# Reading through the Stars — Hospitality & QSR Operational Triage Intelligence Platform

A deterministic, 6-phase Python diagnostic engine and 5-tab Streamlit Bento Command Suite built for QSR chains, cloud kitchens, and hospitality operators.

## Architecture Overview
- `src/schema_resolver.py`: Zero-config column resolution, 90th-percentile ($P_{90}$) scale normalization onto $[1.0, 5.0]$, menu SKU extraction, and shift slot derivation.
- `src/ingestion_hygiene.py`: Multi-format ingestion (`.csv`, `.xlsx`, `.json`) and deterministic 6-stage data hygiene funnel.
- `src/nlp_preprocessor.py`: Negation-safe dual-path NLP preprocessing (Path A sentiment-preserving stream + Path B $O(1)$ stopword-filtered lexical root-cause stream).
- `src/sentiment_engine.py`: VADER compound polarity (`±0.05` deadband) cross-validated against TextBlob polarity & subjectivity with live Pearson $r$ benchmarking.
- `src/diagnostic_analytics.py`: 4-5★ Hidden Risk & Rating Mismatch divergence auditor, $\ge 3$-week consecutive SKU/outlet drift detector, 6-mode root-cause classifier, and Day × Shift heatmap builder.
- `src/sop_triage.py`: Deterministic 4-lane (`CRITICAL` / `CAUTION` / `REVIEW` / `HEALTHY`) SOP triage matrix.
- `src/briefing_generator.py`: Zero-hallucination grounded narrative synthesis (with optional local Ollama Llama 3.1 8B support) and 1-page printable Branch Manager Shift Huddle PDF generator.
- `app.py`: 5-tab interactive Streamlit Command Suite styled in a flat, high-contrast corporate palette (no gradients, no neon colors).

## Quickstart
```bash
pip install -r requirements.txt
streamlit run app.py
```
