# Reading through the Stars — Hospitality & QSR Operational Triage Intelligence Platform

A deterministic Python diagnostic engine for hospitality and QSR feedback, available through a Streamlit analyst interface and a Vite web dashboard.

## Architecture Overview
- `src/schema_resolver.py`: Zero-config column resolution, 90th-percentile ($P_{90}$) scale normalization onto $[1.0, 5.0]$, menu SKU extraction, and shift slot derivation.
- `src/ingestion_hygiene.py`: Multi-format ingestion (`.csv`, `.xlsx`, `.json`) and deterministic 6-stage data hygiene funnel.
- `src/nlp_preprocessor.py`: Negation-safe dual-path NLP preprocessing (Path A sentiment-preserving stream + Path B $O(1)$ stopword-filtered lexical root-cause stream).
- `src/sentiment_engine.py`: VADER compound polarity (`±0.05` deadband) cross-validated against TextBlob polarity & subjectivity with live Pearson $r$ benchmarking.
- `src/diagnostic_analytics.py`: 4-5★ Hidden Risk & Rating Mismatch divergence auditor, $\ge 3$-week consecutive SKU/outlet drift detector, 6-mode root-cause classifier, and Day × Shift heatmap builder.
- `src/sop_triage.py`: Deterministic 4-lane (`CRITICAL` / `CAUTION` / `REVIEW` / `HEALTHY`) SOP triage matrix.
- `src/briefing_generator.py`: Zero-hallucination grounded narrative synthesis (with optional local Ollama Llama 3.1 8B support) and 1-page printable Branch Manager Shift Huddle PDF generator.
- `app.py`: Interactive Streamlit analyst interface.
- `src/main.py`: ASGI API for benchmark data and the shared analysis workflow.
- `frontend/`: Vite dashboard; its browser requests use the same-origin `/api/v1` API routes.

## Run the Streamlit interface
```bash
pip install -r requirements.txt
streamlit run app.py
```

## Run the Vite dashboard and API locally

Start the API in one terminal:
```bash
pip install -r src/requirements.txt
uvicorn main:app --app-dir src --reload --port 8000
```

Start the frontend in another terminal:
```bash
npm ci
npm run dev
```

Vite proxies `/api` requests to the local API. In Vercel, the `frontend` service serves the Vite app, while `/api/...` is routed to the `api` service. The browser calls that public same-origin path directly, so no service binding is required.

The optional Ollama brief uses the API server's `OLLAMA_URL` environment variable (defaulting to the existing local Ollama endpoint). Configure that variable only when the server can reach the Ollama endpoint; the deterministic briefing remains available when Ollama is disabled or unreachable.
