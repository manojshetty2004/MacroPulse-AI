"""Read-only HTTP API for the project's existing macro data and reports.

Run from the repository root with ``uvicorn src.api:app``. This module intentionally
does not import the ingestion/model pipeline or ``project_paths``: those modules can
create, copy, or rewrite files. SQLite connections use ``mode=ro`` and query-only
mode; CSV and Markdown endpoints only read files.
"""

from __future__ import annotations

import csv
import os
import re
import sqlite3
from contextlib import closing
from datetime import date, datetime
from pathlib import Path
from typing import Annotated, Any, Literal
from urllib.parse import urlsplit, urlunsplit

from fastapi import FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException


# Keep paths anchored to this file and avoid project_paths' import-time side effects.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
REPORTS_DIR = PROJECT_ROOT / "reports"
DATABASE_PATH = DATA_DIR / "macro_data.db"
FEATURES_PATH = DATA_DIR / "daily_features.csv"

# These are the actual report names written by this project's feature/model pipeline.
REPORT_FILES: dict[str, str] = {
    "macro_outlook.md": "Current descriptive macro outlook",
    "evaluation_report.md": "Model evaluation and readiness report",
}

FEATURE_COLUMNS = (
    "date",
    "inflation",
    "employment",
    "growth",
    "rates",
    "other",
    "sentiment",
    "macro_score",
)
EVENT_COLUMNS = ("event_name", "event_time", "actual", "forecast", "previous")
NEWS_COLUMNS = ("id", "title", "content", "published_date", "url")


def _cors_origins() -> list[str]:
    """Return explicit browser origins; never enable a wildcard origin."""
    configured = os.environ.get(
        "MACROPULSE_CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    )
    origins = [origin.strip().rstrip("/") for origin in configured.split(",") if origin.strip()]
    if not origins or "*" in origins:
        raise RuntimeError(
            "MACROPULSE_CORS_ORIGINS must contain explicit frontend origins; '*' is not allowed."
        )
    return origins


app = FastAPI(
    title="MacroPulse AI Data API",
    summary="Read-only API for the existing macro database, feature export, and reports.",
    description=(
        "Serves only records and artifacts already present in this repository. "
        "The API does not run data collection, train a model, write to SQLite, "
        "or return upstream API credentials."
    ),
    version="1.0.0",
    contact={"name": "MacroPulse AI project"},
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=False,
    allow_methods=["GET", "HEAD", "OPTIONS"],
    allow_headers=["Accept", "Content-Type"],
)


class ErrorDetail(BaseModel):
    """Safe, consistent API error detail."""

    code: str
    message: str


class ErrorResponse(BaseModel):
    """Error envelope used for HTTP and request-validation failures."""

    error: ErrorDetail


class HealthResponse(BaseModel):
    """API and read-only SQLite availability."""

    status: Literal["ok", "degraded"]
    database: Literal["available", "unavailable"]
    read_only: Literal[True] = True


class Pagination(BaseModel):
    """Pagination metadata shared by list responses."""

    total: int = Field(ge=0)
    limit: int = Field(ge=1, le=100)
    offset: int = Field(ge=0)


class MacroEvent(BaseModel):
    """A record from the SQLite ``macro_events`` table."""

    model_config = ConfigDict(extra="forbid")

    event_name: str | None
    event_time: str | None
    actual: float | None
    forecast: float | None
    previous: float | None


class EventListResponse(BaseModel):
    """Page of actual macro-event records."""

    items: list[MacroEvent]
    pagination: Pagination


class NewsItem(BaseModel):
    """Safe news metadata from the SQLite ``news`` table (article body omitted)."""

    id: int | None
    title: str | None
    published_date: str | None
    url: str | None = Field(
        description="Source URL without its query string or fragment, to avoid leaking signed URL parameters."
    )


class NewsListResponse(BaseModel):
    """Page of news metadata; article body text is intentionally not exposed."""

    items: list[NewsItem]
    pagination: Pagination


class DailyFeature(BaseModel):
    """A row from the existing ``data/daily_features.csv`` export."""

    model_config = ConfigDict(extra="forbid")

    date: date
    inflation: float
    employment: float
    growth: float
    rates: float
    other: float
    sentiment: float
    macro_score: float


class FeatureListResponse(BaseModel):
    """Page of validated daily feature rows."""

    items: list[DailyFeature]
    pagination: Pagination
    sort: Literal["date_desc"] = "date_desc"


class DatasetStatus(BaseModel):
    """Availability and record count for one actual project source."""

    available: bool
    records: int | None = None


class SummaryResponse(BaseModel):
    """Current source availability and the latest real feature row, if present."""

    read_only: Literal[True] = True
    database: Literal["available", "unavailable"]
    macro_events: DatasetStatus
    news: DatasetStatus
    daily_features: DatasetStatus
    latest_feature: DailyFeature | None
    reports: list[str]


class ReportSummary(BaseModel):
    """Metadata for one allow-listed Markdown report."""

    filename: str
    description: str
    available: bool
    modified_at: datetime | None = None
    bytes: int | None = Field(default=None, ge=0)


class ReportListResponse(BaseModel):
    """Availability metadata for the pipeline's actual Markdown reports."""

    items: list[ReportSummary]


class MarkdownReport(BaseModel):
    """The exact UTF-8 body and metadata for one existing Markdown report."""

    filename: str
    description: str
    modified_at: datetime
    content: str


def _open_database() -> sqlite3.Connection:
    """Open the existing project database without creating or changing it."""
    if not DATABASE_PATH.is_file():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "database_unavailable", "message": "The project database is not available."},
        )
    try:
        connection = sqlite3.connect(
            f"{DATABASE_PATH.as_uri()}?mode=ro",
            uri=True,
            timeout=5,
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA query_only = ON")
        return connection
    except sqlite3.Error as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "database_unavailable", "message": "The project database could not be read."},
        ) from exc


def _require_columns(connection: sqlite3.Connection, table: str, expected: tuple[str, ...]) -> None:
    """Check a real table against the columns the API reads, without assuming extra columns."""
    try:
        actual = {row["name"] for row in connection.execute(f"PRAGMA table_info({table})")}
    except sqlite3.Error as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "schema_unavailable", "message": "The required database schema could not be read."},
        ) from exc
    missing = set(expected) - actual
    if missing:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "schema_mismatch", "message": f"The {table} table is missing required columns."},
        )


def _feature_rows() -> list[DailyFeature]:
    """Read and validate the existing daily-features CSV without modifying it."""
    if not FEATURES_PATH.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "features_not_found", "message": "The daily feature CSV is not available."},
        )
    try:
        with FEATURES_PATH.open("r", encoding="utf-8-sig", newline="") as source:
            reader = csv.DictReader(source)
            if reader.fieldnames is None or set(FEATURE_COLUMNS) - set(reader.fieldnames):
                raise ValueError("The CSV header does not match the project's daily feature schema.")
            rows: list[DailyFeature] = []
            for line_number, row in enumerate(reader, start=2):
                if None in row:
                    raise ValueError(f"CSV row {line_number} has more values than the header.")
                rows.append(DailyFeature.model_validate({key: row[key] for key in FEATURE_COLUMNS}))
            return rows
    except (OSError, UnicodeError, csv.Error, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "features_unreadable", "message": "The daily feature CSV is malformed or unreadable."},
        ) from exc
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "features_unreadable", "message": "The daily feature CSV contains an invalid row."},
        ) from exc


def _safe_source_url(raw_url: str | None) -> str | None:
    """Retain the source host and path while removing userinfo, query strings, and fragments."""
    if not raw_url:
        return None
    try:
        parts = urlsplit(raw_url.strip())
        if parts.scheme.lower() not in {"http", "https"} or not parts.hostname:
            return None
        host = parts.hostname
        if parts.port is not None:
            host = f"{host}:{parts.port}"
        return urlunsplit((parts.scheme.lower(), host, parts.path, "", ""))
    except ValueError:
        return None


def _table_count(connection: sqlite3.Connection, table: str, columns: tuple[str, ...]) -> int:
    _require_columns(connection, table, columns)
    try:
        return int(connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
    except sqlite3.Error as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "database_unavailable", "message": "Project records could not be read."},
        ) from exc


def _available_reports() -> list[ReportSummary]:
    items: list[ReportSummary] = []
    for filename, description in REPORT_FILES.items():
        path = REPORTS_DIR / filename
        if path.is_file():
            try:
                stat_result = path.stat()
                items.append(
                    ReportSummary(
                        filename=filename,
                        description=description,
                        available=True,
                        modified_at=datetime.fromtimestamp(stat_result.st_mtime).astimezone(),
                        bytes=stat_result.st_size,
                    )
                )
            except OSError as exc:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail={"code": "report_unreadable", "message": "Report metadata could not be read."},
                ) from exc
        else:
            items.append(ReportSummary(filename=filename, description=description, available=False))
    return items


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Return a stable JSON error envelope without exposing internal exception details."""
    detail: Any = exc.detail
    if isinstance(detail, dict) and "code" in detail and "message" in detail:
        error = detail
    else:
        messages = {
            404: ("not_found", "The requested resource was not found."),
            405: ("method_not_allowed", "This endpoint is read-only and supports GET requests."),
        }
        code, message = messages.get(exc.status_code, ("http_error", "The request could not be completed."))
        error = {"code": code, "message": message}
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(error=ErrorDetail(**error)).model_dump(mode="json"),
        headers=exc.headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Request, _exc: RequestValidationError) -> JSONResponse:
    """Return actionable but non-sensitive validation errors."""
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content=ErrorResponse(
            error=ErrorDetail(code="validation_error", message="One or more request parameters are invalid.")
        ).model_dump(mode="json"),
    )


@app.get("/", tags=["system"], summary="API entry point")
def root() -> dict[str, str]:
    """List the versioned read-only routes and interactive API documentation."""
    return {
        "name": app.title,
        "docs": "/docs",
        "health": "/api/v1/health",
        "summary": "/api/v1/summary",
        "events": "/api/v1/events",
        "news": "/api/v1/news",
        "daily_features": "/api/v1/features",
        "reports": "/api/v1/reports",
    }


@app.get(
    "/api/v1/health",
    response_model=HealthResponse,
    responses={503: {"model": ErrorResponse, "description": "The existing SQLite database is unavailable."}},
    tags=["system"],
    summary="Check API and database availability",
)
def health() -> HealthResponse:
    """Check a read-only SQLite connection; never create a missing database."""
    try:
        with closing(_open_database()) as connection:
            connection.execute("SELECT 1").fetchone()
    except HTTPException:
        return HealthResponse(status="degraded", database="unavailable")
    return HealthResponse(status="ok", database="available")


@app.get(
    "/api/v1/summary",
    response_model=SummaryResponse,
    responses={503: {"model": ErrorResponse, "description": "A required existing source could not be read."}},
    tags=["data"],
    summary="Summarize actual source availability and latest feature",
)
def summary() -> SummaryResponse:
    """Summarize actual database, feature-CSV, and report availability."""
    latest_rows = _feature_rows()
    latest = max(latest_rows, key=lambda row: row.date, default=None)
    if DATABASE_PATH.is_file():
        with closing(_open_database()) as connection:
            event_count = _table_count(connection, "macro_events", EVENT_COLUMNS)
            news_count = _table_count(connection, "news", NEWS_COLUMNS)
        database_state: Literal["available", "unavailable"] = "available"
        events_available = news_available = True
    else:
        event_count = news_count = None
        database_state = "unavailable"
        events_available = news_available = False
    return SummaryResponse(
        database=database_state,
        macro_events=DatasetStatus(available=events_available, records=event_count),
        news=DatasetStatus(available=news_available, records=news_count),
        daily_features=DatasetStatus(available=True, records=len(latest_rows)),
        latest_feature=latest,
        reports=[report.filename for report in _available_reports() if report.available],
    )


@app.get(
    "/api/v1/events",
    response_model=EventListResponse,
    responses={
        422: {"model": ErrorResponse, "description": "Invalid pagination or date range."},
        503: {"model": ErrorResponse, "description": "The existing SQLite event table is unavailable."},
    },
    tags=["data"],
    summary="List stored macroeconomic events",
)
def list_events(
    start_date: Annotated[date | None, Query(description="Inclusive event date (YYYY-MM-DD).")]=None,
    end_date: Annotated[date | None, Query(description="Inclusive event date (YYYY-MM-DD).")]=None,
    limit: Annotated[int, Query(ge=1, le=100, description="Maximum rows per page.")]=50,
    offset: Annotated[int, Query(ge=0, le=100_000, description="Number of rows to skip.")]=0,
) -> EventListResponse:
    """Page through the existing ``macro_events`` table in event-time order."""
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "invalid_date_range", "message": "start_date must not be after end_date."},
        )
    clauses: list[str] = []
    params: list[Any] = []
    if start_date:
        clauses.append("substr(event_time, 1, 10) >= ?")
        params.append(start_date.isoformat())
    if end_date:
        clauses.append("substr(event_time, 1, 10) <= ?")
        params.append(end_date.isoformat())
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    with closing(_open_database()) as connection:
        _require_columns(connection, "macro_events", EVENT_COLUMNS)
        try:
            total = int(connection.execute(f"SELECT COUNT(*) FROM macro_events{where}", params).fetchone()[0])
            rows = connection.execute(
                "SELECT event_name, event_time, actual, forecast, previous "
                f"FROM macro_events{where} "
                "ORDER BY event_time ASC, event_name ASC LIMIT ? OFFSET ?",
                [*params, limit, offset],
            ).fetchall()
        except sqlite3.Error as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"code": "database_unavailable", "message": "Macro events could not be read."},
            ) from exc
    return EventListResponse(items=[MacroEvent.model_validate(dict(row)) for row in rows], pagination=Pagination(total=total, limit=limit, offset=offset))


@app.get(
    "/api/v1/news",
    response_model=NewsListResponse,
    responses={
        422: {"model": ErrorResponse, "description": "Invalid pagination or search query."},
        503: {"model": ErrorResponse, "description": "The existing SQLite news table is unavailable."},
    },
    tags=["data"],
    summary="Search and page through stored news metadata",
)
def list_news(
    q: Annotated[str | None, Query(min_length=1, max_length=120, description="Optional case-insensitive title/content search.")]=None,
    limit: Annotated[int, Query(ge=1, le=100, description="Maximum rows per page.")]=25,
    offset: Annotated[int, Query(ge=0, le=100_000, description="Number of rows to skip.")]=0,
) -> NewsListResponse:
    """Search news metadata. Article bodies and URL query strings are never returned."""
    clauses: list[str] = []
    params: list[Any] = []
    if q is not None:
        query = q.strip()
        if not query:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail={"code": "invalid_query", "message": "q must contain at least one non-whitespace character."},
            )
        escaped = re.sub(r"([%_\\])", r"\\\1", query)
        clauses.append("(title LIKE ? ESCAPE '\\' COLLATE NOCASE OR content LIKE ? ESCAPE '\\' COLLATE NOCASE)")
        params.extend((f"%{escaped}%", f"%{escaped}%"))
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    with closing(_open_database()) as connection:
        _require_columns(connection, "news", NEWS_COLUMNS)
        try:
            total = int(connection.execute(f"SELECT COUNT(*) FROM news{where}", params).fetchone()[0])
            rows = connection.execute(
                "SELECT id, title, published_date, url "
                f"FROM news{where} "
                "ORDER BY published_date DESC, id DESC LIMIT ? OFFSET ?",
                [*params, limit, offset],
            ).fetchall()
        except sqlite3.Error as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"code": "database_unavailable", "message": "News records could not be read."},
            ) from exc
    items = [
        NewsItem(
            id=row["id"],
            title=row["title"],
            published_date=row["published_date"],
            url=_safe_source_url(row["url"]),
        )
        for row in rows
    ]
    return NewsListResponse(items=items, pagination=Pagination(total=total, limit=limit, offset=offset))


@app.get(
    "/api/v1/features",
    response_model=FeatureListResponse,
    responses={
        404: {"model": ErrorResponse, "description": "The daily feature CSV does not exist."},
        422: {"model": ErrorResponse, "description": "Invalid pagination or date range."},
        503: {"model": ErrorResponse, "description": "The CSV schema or rows are invalid."},
    },
    tags=["data"],
    summary="Read actual daily features from the CSV export",
)
def list_features(
    start_date: Annotated[date | None, Query(description="Inclusive feature date (YYYY-MM-DD).")]=None,
    end_date: Annotated[date | None, Query(description="Inclusive feature date (YYYY-MM-DD).")]=None,
    limit: Annotated[int, Query(ge=1, le=100, description="Maximum rows per page.")]=100,
    offset: Annotated[int, Query(ge=0, le=100_000, description="Number of rows to skip.")]=0,
) -> FeatureListResponse:
    """Return only validated records found in the real daily feature CSV."""
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={"code": "invalid_date_range", "message": "start_date must not be after end_date."},
        )
    rows = _feature_rows()
    if start_date:
        rows = [row for row in rows if row.date >= start_date]
    if end_date:
        rows = [row for row in rows if row.date <= end_date]
    rows.sort(key=lambda row: row.date, reverse=True)
    total = len(rows)
    return FeatureListResponse(
        items=rows[offset : offset + limit],
        pagination=Pagination(total=total, limit=limit, offset=offset),
    )


@app.get(
    "/api/v1/reports",
    response_model=ReportListResponse,
    responses={503: {"model": ErrorResponse, "description": "A report could not be inspected."}},
    tags=["reports"],
    summary="List the pipeline's actual Markdown reports",
)
def list_reports() -> ReportListResponse:
    """Report availability for ``macro_outlook.md`` and ``evaluation_report.md`` only."""
    return ReportListResponse(items=_available_reports())


@app.get(
    "/api/v1/reports/{filename}",
    response_model=MarkdownReport,
    responses={
        404: {"model": ErrorResponse, "description": "The name is not allow-listed or the report does not exist."},
        503: {"model": ErrorResponse, "description": "The report is not readable UTF-8 Markdown."},
    },
    tags=["reports"],
    summary="Read one allow-listed Markdown report",
)
def read_report(filename: str) -> MarkdownReport:
    """Return the exact contents of one existing, allow-listed Markdown report."""
    if filename not in REPORT_FILES:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "report_not_found", "message": "The requested report is not available."},
        )
    path = REPORTS_DIR / filename
    try:
        content = path.read_text(encoding="utf-8")
        modified_at = datetime.fromtimestamp(path.stat().st_mtime).astimezone()
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "report_not_found", "message": "The requested report is not available."},
        ) from exc
    except (OSError, UnicodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "report_unreadable", "message": "The requested report could not be read."},
        ) from exc
    return MarkdownReport(
        filename=filename,
        description=REPORT_FILES[filename],
        modified_at=modified_at,
        content=content,
    )
