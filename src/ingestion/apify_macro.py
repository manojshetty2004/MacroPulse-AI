import os
import pandas as pd

from dotenv import load_dotenv
from apify_client import ApifyClient
from sqlalchemy import create_engine, inspect

from project_paths import DATABASE_URL, DATA_DIR

load_dotenv()

APIFY_TOKEN = os.getenv("APIFY_TOKEN")

engine = create_engine(DATABASE_URL)

MACRO_EVENT_COLUMNS = ["event_name", "event_time", "actual", "forecast", "previous"]


def _export_macro_events(df=None):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if df is None:
        if inspect(engine).has_table("macro_events"):
            df = pd.read_sql_table("macro_events", engine)
        else:
            df = pd.DataFrame(columns=MACRO_EVENT_COLUMNS)
    df.to_csv(DATA_DIR / "macro_events.csv", index=False)


def _parse_number(value):
    if value is None:
        return None

    if isinstance(value, (int, float)):
        return float(value)

    value = (
        str(value)
        .replace(",", "")
        .replace("%", "")
        .strip()
    )

    if value.lower() in ["", "none", "n/a", "na"]:
        return None

    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _col(df, *names):
    for name in names:
        if name in df.columns:
            return df[name]

    return pd.Series([None] * len(df))


def _to_macro_events(df):

    return pd.DataFrame({
        "event_name": _col(df, "title"),
        "event_time": _col(df, "timestamp", "datetimeISO", "date"),

        "actual": _col(
            df,
            "actualNumeric",
            "actual"
        ).map(_parse_number),

        "forecast": _col(
            df,
            "forecastNumeric",
            "forecast"
        ).map(_parse_number),

        "previous": _col(
            df,
            "previousNumeric",
            "previous"
        ).map(_parse_number),
    })


def get_macro_events():

    if not APIFY_TOKEN:
        raise ValueError(
            "APIFY_TOKEN is not set. Add it to your .env file or environment before running the scraper."
        )

    client = ApifyClient(token=APIFY_TOKEN)

    ACTOR_ID = "scrapemint/forexfactory-economic-calendar"

    months = [
        ("2026-04-01", "2026-04-30"),
        ("2026-05-01", "2026-05-31"),
        ("2026-06-01", "2026-06-30"),
        ("2026-07-01", "2026-07-31"),
        ("2026-08-01", "2026-08-31"),
        ("2026-09-01", "2026-09-30"),
    ]

    all_items = []

    for start_date, end_date in months:

        run_input = {
            "range": "custom",
            "startDate": start_date,
            "endDate": end_date,
            "currencies": [
                "USD",
                "EUR",
                "GBP",
                "JPY"
            ],
            "impactLevels": [
                "high",
                "medium",
                "low"
            ],
            "includeDetail": True,
            "maxEvents": 1000
        }

        print(
            f"Scraping {start_date} -> {end_date}"
        )

        run = client.actor(
            ACTOR_ID
        ).call(
            run_input=run_input
        )

        if run is None:
            print(f"No Apify run returned for {start_date} -> {end_date}; skipping.")
            continue

        dataset_id = None
        if isinstance(run, dict):
            dataset_id = run.get("defaultDatasetId") or run.get("default_dataset_id")
        else:
            dataset_id = getattr(run, "default_dataset_id", None)

        if not dataset_id:
            print(
                f"Apify run for {start_date} -> {end_date} did not return a dataset_id; skipping."
            )
            continue

        items = list(
            client.dataset(
                dataset_id
            ).iterate_items()
        )

        print(
            f"Collected {len(items)} rows"
        )

        all_items.extend(items)

    if not all_items:
        print("No macro events found")
        _export_macro_events()
        return pd.DataFrame()

    raw_df = pd.DataFrame(all_items)

    print(
        "\nRaw Columns:"
    )
    print(
        raw_df.columns.tolist()
    )

    df = _to_macro_events(raw_df)

    df = df.dropna(
        subset=["event_name"]
    )

    df = df.drop_duplicates()

    print(
        f"\nFinal Rows: {len(df)}"
    )

    df.to_sql(
        "macro_events",
        engine,
        if_exists="replace",
        index=False
    )
    _export_macro_events(df)

    print(
        f"Saved macro_events table and {DATA_DIR / 'macro_events.csv'}"
    )

    return df


if __name__ == "__main__":

    df = get_macro_events()

    print("\nSample:")
    print(df.head())

    print("\nActual Values:")
    print(df["actual"].notna().sum())

    print("\nForecast Values:")
    print(df["forecast"].notna().sum())