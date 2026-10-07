from dotenv import load_dotenv
import os
from sqlalchemy import create_engine
from sqlalchemy import text

from project_paths import DATABASE_URL

#load environment variables

load_dotenv()

APIFY_TOKEN = os.getenv("APIFY_TOKEN")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")

#create database engine

engine = create_engine(DATABASE_URL)

#create database tables

with engine.connect() as conn:

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS macro_events (
            id INTEGER PRIMARY KEY,
            event_name TEXT,
            event_time TEXT,
            actual REAL,
            forecast REAL,
            previous REAL
        )
    """))

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS news (
            id INTEGER PRIMARY KEY,
            title TEXT,
            content TEXT,
            url TEXT,
            published_date TEXT
        )
    """))

    news_columns = {
        row[1] for row in conn.execute(text("PRAGMA table_info(news)")).fetchall()
    }
    if "url" not in news_columns:
        conn.execute(text("ALTER TABLE news ADD COLUMN url TEXT"))

    conn.commit()

print("Database Ready")