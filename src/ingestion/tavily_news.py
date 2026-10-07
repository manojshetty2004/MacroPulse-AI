import os
import pandas as pd
from dotenv import load_dotenv
from tavily import TavilyClient
from sqlalchemy import create_engine, inspect, text

from project_paths import DATABASE_URL, DATA_DIR

load_dotenv()

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")

engine = create_engine(DATABASE_URL)


def _export_news():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if inspect(engine).has_table("news"):
        df = pd.read_sql_table("news", engine)
    else:
        df = pd.DataFrame(columns=["title", "content", "url", "published_date"])
    df.to_csv(DATA_DIR / "news.csv", index=False)


def get_macro_news():

    if not TAVILY_API_KEY:
        raise ValueError(
            "TAVILY_API_KEY is not set. Add it to your .env file or environment before fetching news."
        )

    client = TavilyClient(api_key=TAVILY_API_KEY)

    print("Fetching macro news...")

    response = client.search(
        query="""
        Federal Reserve interest rates,
        inflation,
        CPI,
        unemployment,
        GDP,
        recession,
        oil prices,
        stock market outlook
        """,
        search_depth="advanced",
        max_results=20
    )

    news_data = []

    for item in response.get("results", []):

        news_data.append({
            "title": item.get("title"),
            "content": item.get("content"),
            "url": item.get("url"),
            "published_date": item.get("published_date")
        })

    if not news_data:
        print("No news found")
        _export_news()
        return pd.DataFrame()

    df = pd.DataFrame(news_data)

    print(f"Collected {len(df)} news articles")

    with engine.connect() as conn:
        news_columns = {
            row[1] for row in conn.execute(text("PRAGMA table_info(news)")).fetchall()
        }
        if news_columns and "url" not in news_columns:
            conn.execute(text("ALTER TABLE news ADD COLUMN url TEXT"))
            conn.commit()

    df.to_sql(
        "news",
        engine,
        if_exists="append",
        index=False
    )
    _export_news()

    print(f"Saved to database and {DATA_DIR / 'news.csv'}")

    return df


def get_news():
    """Fetch macro news using the Tavily integration."""
    return get_macro_news()


if __name__ == "__main__":
    df = get_news()
    print(df.head())