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
