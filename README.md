# CrowdWisdomTrading Macro Agent

## Project Overview

This project collects economic-calendar events and macroeconomic news, builds daily
macro and sentiment features, trains a next-day macro-score forecasting model, and
generates Markdown and PNG reports. The macro score is an analytical proxy; it is not
an asset-return forecast or a trading recommendation.

## Architecture Diagram

```text
Apify ForexFactory Actor ─┐
                          ├─> SQLite + CSV exports ─> Daily features ─┬─> Macro outlook
Tavily economic news ─────┘                                         ├─> Random Forest validation
                                                                    │   ├─> Evaluation report
                                                                    │   ├─> Feature importance
                                                                    │   └─> Prediction chart
                                                                    └─> Macro sentiment chart
```

## Installation Steps

Use Python 3.10 or newer, then create and activate a virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Create a local `.env` from the example and fill in the API credentials:

```bash
cp .env.example .env
```

Do not commit `.env` or place real API keys in source control.

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `APIFY_TOKEN` | Yes | Authenticates runs of the Apify economic-calendar Actor. |
| `TAVILY_API_KEY` | Yes | Authenticates Tavily economic-news searches. |
| `EXA_API_KEY` | No | Reserved for a possible Exa integration; the current pipeline does not use it. |

## How to Run

From the project root:

```bash
python src/main.py
```

The pipeline creates `data/` and `reports/` if they do not already exist. It writes the
SQLite database and ingestion/feature CSVs under `data/`, and Markdown reports and
visualizations under `reports/`. Data and report paths are derived from the source
location, so the command does not depend on the shell's current directory.

## Data Sources

### Apify economic calendar

The ingestion module runs Actor
`scrapemint/forexfactory-economic-calendar` for the configured date ranges and
currencies. Normalized events are stored in the `macro_events` SQLite table and
exported to `data/macro_events.csv`.

### Tavily news

The pipeline uses Tavily's `search` endpoint with `search_depth="advanced"` and up to
20 results for queries about Federal Reserve rates, inflation/CPI, unemployment, GDP,
recession, oil prices, and market outlook. Titles, snippets/content, URLs, and available
publication dates are stored in the `news` table and exported to `data/news.csv`.
Sentiment is a transparent keyword count over article titles and content, not a
trained sentiment classifier.

## Assumptions and Limitations

- No trading logs, positions, transaction costs, or asset-price outcomes were supplied.
  The model therefore predicts the next day's constructed `macro_score`; it does not
  claim trading performance, profitability, or risk-adjusted returns.
- Macro surprises are computed as `(actual - forecast) / abs(forecast)` when a non-zero
  forecast exists. Missing surprise values and days without macro events are treated as
  neutral in the daily feature series.
- News without a parseable publication timestamp is excluded from dated daily sentiment
  rather than assigned an invented historical date.
- The keyword-based sentiment score, event-name categorization, and macro-score formula
  are intentionally simple assignment-level heuristics. They are not calibrated
  economic or investment signals.
- Walk-forward validation preserves time ordering, but the available history may be
  small. Reported model metrics should be interpreted accordingly.

## Read-only FastAPI API

`src/api.py` exposes the files and tables that already exist in this project. It reads
`data/macro_data.db` in SQLite read-only/query-only mode, reads the existing
`data/daily_features.csv`, and serves only `reports/macro_outlook.md` and
`reports/evaluation_report.md`. Starting the API does not run ingestion, create a
database, train a model, or write to source files. Missing data is reported as missing;
the API does not fill in records or model results. News responses contain metadata,
not article bodies, and source URLs have query strings and fragments removed.

Install project requirements once, from the repository root:

```bash
python3 -m venv venv  # Skip if your existing venv is already set up.
source venv/bin/activate
python -m pip install -r requirements.txt
```

Start the API from the repository root:

```bash
uvicorn src.api:app --reload --host 127.0.0.1 --port 8000
```

The local Next.js origins `http://localhost:3000` and
`http://127.0.0.1:3000` are allowed by default. Set an explicit comma-separated origin
list before starting Uvicorn if the frontend uses other local origins:

```bash
export MACROPULSE_CORS_ORIGINS="http://localhost:3000,http://127.0.0.1:3000"
```

API documentation is at `http://127.0.0.1:8000/docs`; the OpenAPI schema is at
`http://127.0.0.1:8000/openapi.json`.

| Method | Endpoint | Data returned |
|---|---|---|
| GET | `/api/v1/health` | API/database availability and read-only status |
| GET | `/api/v1/summary` | Actual table/CSV counts, latest daily-feature row, available report names |
| GET | `/api/v1/events` | `macro_events` rows; pagination and inclusive `start_date`/`end_date` filters |
| GET | `/api/v1/news` | News IDs, titles, publication dates, and sanitized source URLs; pagination and `q` search |
| GET | `/api/v1/features` | `daily_features.csv` rows; pagination and inclusive date filters |
| GET | `/api/v1/reports` | Availability and metadata for the two Markdown reports |
| GET | `/api/v1/reports/{filename}` | Exact Markdown for an existing allow-listed report |

Paginated endpoints accept `limit` (1–100) and `offset` (0 or greater). Read endpoints
return typed JSON; invalid parameters receive a documented HTTP 422 error envelope.
Only GET, HEAD, and CORS preflight requests are allowed by CORS; the HTTP API exposes no
write routes. Credentials are not loaded or returned by this module.

Run the API integration tests, which check each route against the current database,
CSV, and Markdown files and verify that SQLite writes are rejected:

```bash
source venv/bin/activate
python -m unittest discover -s tests -v
```

### Run the web app

Start the FastAPI service in the first terminal using the command above. In a second
terminal, from the project root, install the JavaScript dependencies and start Next.js:

```bash
npm ci
NEXT_PUBLIC_MACROPULSE_API_URL=http://127.0.0.1:8000 npm run dev
```

Open `http://localhost:3000`. To build and serve the production frontend:

```bash
npm run lint
npm run typecheck
npm run build
npm run start
```

To run the browser end-to-end suite, install its Chromium browser once, then run:

```bash
npx playwright install chromium
npm run test:e2e
```

Browser tests stub the API at the network boundary, so their results are repeatable
without reading or changing the local database. To check the UI against actual local
data, start FastAPI first and run `npm run dev`; the app displays loading, empty, and
backend-error states when its configured API is unavailable.
