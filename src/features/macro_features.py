from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import create_engine, inspect

from project_paths import DATABASE_URL, DATA_DIR, REPORTS_DIR


engine = create_engine(DATABASE_URL)

FEATURE_COLUMNS = [
    "date",
    "inflation",
    "employment",
    "growth",
    "rates",
    "other",
    "sentiment",
    "macro_score",
]
MACRO_COLUMNS = ["event_name", "event_time", "actual", "forecast", "previous"]
NEWS_COLUMNS = ["title", "content", "published_date"]


def categorize_event(event_name: object) -> str:
    if pd.isna(event_name):
        return "other"

    event = str(event_name).lower()
    if any(term in event for term in ("cpi", "inflation", "ppi")):
        return "inflation"
    if any(term in event for term in ("employment", "payroll", "unemployment", "job")):
        return "employment"
    if any(
        term in event
        for term in ("manufacturing", "services", "consumer confidence", "gdp", "retail")
    ):
        return "growth"
    if any(term in event for term in ("rate", "fomc", "fed")):
        return "rates"
    return "other"


def sentiment_score(text: object) -> int:
    if pd.isna(text):
        return 0

    positive_words = (
        "growth",
        "strong",
        "bullish",
        "gain",
        "increase",
        "improve",
        "expansion",
        "recovery",
    )
    negative_words = (
        "recession",
        "weak",
        "decline",
        "bearish",
        "drop",
        "fall",
        "slowdown",
        "crisis",
    )
    content = str(text).lower()
    return sum(word in content for word in positive_words) - sum(
        word in content for word in negative_words
    )


def _read_table_or_empty(table_name: str, columns: list[str]) -> pd.DataFrame:
    if not inspect(engine).has_table(table_name):
        if table_name == "macro_events":
            raise RuntimeError(
                "The macro_events table is missing. Run macro event ingestion before feature engineering."
            )
        return pd.DataFrame(columns=columns)

    frame = pd.read_sql_table(table_name, engine)
    missing_columns = set(columns).difference(frame.columns)
    if missing_columns:
        raise ValueError(
            f"Table {table_name!r} is missing required columns: "
            f"{', '.join(sorted(missing_columns))}"
        )
    return frame


def build_features() -> pd.DataFrame:
    """Create daily macro/sentiment features, CSV export, and current outlook."""
    macro = _read_table_or_empty("macro_events", MACRO_COLUMNS)
    news = _read_table_or_empty("news", NEWS_COLUMNS)

    if macro.empty:
        raise RuntimeError(
            "No macro events are available. Ingest macro events before building features."
        )

    macro["event_time"] = pd.to_datetime(macro["event_time"], errors="coerce")
    macro["date"] = macro["event_time"].dt.normalize()
    macro = macro.dropna(subset=["date"]).copy()
    if macro.empty:
        raise ValueError("Macro events do not contain any parseable event dates.")

    for column in ("actual", "forecast", "previous"):
        macro[column] = pd.to_numeric(macro[column], errors="coerce")

    macro["surprise_pct"] = np.where(
        macro["forecast"].notna() & macro["forecast"].ne(0),
        (macro["actual"] - macro["forecast"]) / macro["forecast"].abs(),
        np.nan,
    )
    macro["category"] = macro["event_name"].apply(categorize_event)

    daily_macro = (
        macro.groupby(["date", "category"], as_index=False)["surprise_pct"]
        .mean()
        .pivot(index="date", columns="category", values="surprise_pct")
        .fillna(0)
        .reset_index()
    )

    for column in ("inflation", "employment", "growth", "rates", "other"):
        if column not in daily_macro.columns:
            daily_macro[column] = 0.0
    daily_macro["date"] = pd.to_datetime(daily_macro["date"]).dt.normalize()
    calendar_days = pd.date_range(
        daily_macro["date"].min(), daily_macro["date"].max(), freq="D"
    )
    daily_macro = (
        daily_macro.set_index("date")
        .reindex(calendar_days)
        .rename_axis("date")
        .reset_index()
    )
    daily_macro[["inflation", "employment", "growth", "rates", "other"]] = (
        daily_macro[["inflation", "employment", "growth", "rates", "other"]]
        .fillna(0.0)
    )

    if news.empty:
        daily_news = pd.DataFrame(columns=["date", "sentiment"])
    else:
        news["combined_text"] = (
            news["title"].fillna("").astype(str)
            + " "
            + news["content"].fillna("").astype(str)
        )
        news["sentiment"] = news["combined_text"].map(sentiment_score)
        news["published_date"] = pd.to_datetime(
            news["published_date"], errors="coerce", utc=True
        ).dt.tz_convert(None)

        # Untimestamped stories cannot be assigned reliably to a historical day.
        dated_news = news.dropna(subset=["published_date"]).copy()
        dated_news["date"] = dated_news["published_date"].dt.normalize()
        daily_news = (
            dated_news.groupby("date", as_index=False)["sentiment"].mean()
        )

    features = daily_macro.merge(daily_news, on="date", how="left")
    features["sentiment"] = features["sentiment"].fillna(0.0)
    features["macro_score"] = (
        features["inflation"]
        + features["growth"]
        + features["employment"]
        + features["rates"]
        + features["sentiment"] / 10
    ).clip(-1, 1)
    features = features.reindex(columns=FEATURE_COLUMNS).sort_values("date")
    features["date"] = features["date"].dt.strftime("%Y-%m-%d")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    features.to_csv(DATA_DIR / "daily_features.csv", index=False)
    features.to_sql("daily_features", engine, if_exists="replace", index=False)

    latest = features.iloc[-1]
    score = float(latest["macro_score"])
    outlook = "Bullish" if score > 0.25 else "Bearish" if score < -0.25 else "Neutral"
    outlook_path = Path(REPORTS_DIR) / "macro_outlook.md"
    outlook_path.write_text(
        "\n".join(
            [
                "# Macro Outlook",
                "",
                f"- Latest data date: {latest['date']}",
                f"- Current regime: {outlook}",
                f"- Macro score: {score:.3f}",
                "",
                "The score is a descriptive feature-engineering output, not a trading signal.",
                "It combines categorized macroeconomic surprises with a simple news keyword sentiment score.",
                "",
            ]
        ),
        encoding="utf-8",
    )

    print(f"Built {len(features)} daily feature rows")
    print(f"Saved {DATA_DIR / 'daily_features.csv'}")
    print(f"Saved {outlook_path}")
    return features


if __name__ == "__main__":
    build_features()
