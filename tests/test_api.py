"""Integration tests for the read-only API against the repository's real artifacts."""

from __future__ import annotations

import csv
import sqlite3
import unittest
from contextlib import closing

from fastapi.testclient import TestClient

from src import api


class MacroAPIIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(api.app)

    def test_root_lists_api_routes(self) -> None:
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["summary"], "/api/v1/summary")
        self.assertEqual(response.json()["daily_features"], "/api/v1/features")

    def test_health_checks_the_existing_read_only_database(self) -> None:
        response = self.client.get("/api/v1/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {"status": "ok", "database": "available", "read_only": True},
        )

    def test_summary_reflects_actual_database_csv_and_report(self) -> None:
        response = self.client.get("/api/v1/summary")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        with closing(api._open_database()) as connection:
            event_count = connection.execute("SELECT COUNT(*) FROM macro_events").fetchone()[0]
            news_count = connection.execute("SELECT COUNT(*) FROM news").fetchone()[0]
        with api.FEATURES_PATH.open(encoding="utf-8", newline="") as source:
            feature_rows = list(csv.DictReader(source))
        feature_count = len(feature_rows)
        self.assertEqual(body["macro_events"]["records"], event_count)
        self.assertEqual(body["news"]["records"], news_count)
        self.assertEqual(body["daily_features"]["records"], feature_count)
        latest_csv_row = max(feature_rows, key=lambda row: row["date"])
        self.assertEqual(body["latest_feature"]["date"], latest_csv_row["date"])
        self.assertEqual(body["latest_feature"]["macro_score"], float(latest_csv_row["macro_score"]))
        self.assertIn("macro_outlook.md", body["reports"])
        self.assertTrue(body["read_only"])

    def test_events_return_real_schema_and_support_filters_and_pagination(self) -> None:
        response = self.client.get("/api/v1/events", params={"limit": 2})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        with closing(api._open_database()) as connection:
            event_count = connection.execute("SELECT COUNT(*) FROM macro_events").fetchone()[0]
        self.assertEqual(body["pagination"]["total"], event_count)
        self.assertEqual(len(body["items"]), 2)
        self.assertEqual(
            set(body["items"][0]),
            {"event_name", "event_time", "actual", "forecast", "previous"},
        )
        filtered = self.client.get(
            "/api/v1/events", params={"start_date": "2026-07-01", "end_date": "2026-07-01"}
        )
        self.assertEqual(filtered.status_code, 200)
        with closing(api._open_database()) as connection:
            actual_date_count = connection.execute(
                "SELECT COUNT(*) FROM macro_events WHERE substr(event_time, 1, 10) = ?",
                ("2026-07-01",),
            ).fetchone()[0]
        self.assertEqual(filtered.json()["pagination"]["total"], actual_date_count)

    def test_news_is_searchable_and_never_returns_article_bodies(self) -> None:
        response = self.client.get("/api/v1/news", params={"q": "Federal Reserve", "limit": 2})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertGreaterEqual(body["pagination"]["total"], 1)
        self.assertLessEqual(len(body["items"]), 2)
        for item in body["items"]:
            self.assertEqual(set(item), {"id", "title", "published_date", "url"})
            if item["url"]:
                self.assertNotIn("?", item["url"])
                self.assertNotIn("#", item["url"])
        self.assertNotIn("APIFY_TOKEN", response.text)
        self.assertNotIn("TAVILY_API_KEY", response.text)

    def test_features_match_actual_csv_rows(self) -> None:
        response = self.client.get("/api/v1/features")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        with api.FEATURES_PATH.open(encoding="utf-8", newline="") as source:
            real_rows = list(csv.DictReader(source))
        self.assertEqual(body["pagination"]["total"], len(real_rows))
        self.assertEqual(len(body["items"]), len(real_rows))
        self.assertEqual(body["items"][0]["date"], real_rows[-1]["date"])
        self.assertEqual(body["items"][0]["macro_score"], float(real_rows[-1]["macro_score"]))

    def test_report_inventory_and_bodies_match_allowlisted_files(self) -> None:
        response = self.client.get("/api/v1/reports")
        self.assertEqual(response.status_code, 200)
        items = {item["filename"]: item for item in response.json()["items"]}
        self.assertEqual(set(items), set(api.REPORT_FILES))
        for filename, summary in items.items():
            self.assertEqual(summary["available"], (api.REPORTS_DIR / filename).is_file())
            if summary["available"]:
                report_response = self.client.get(f"/api/v1/reports/{filename}")
                self.assertEqual(report_response.status_code, 200)
                self.assertEqual(
                    report_response.json()["content"],
                    (api.REPORTS_DIR / filename).read_text(encoding="utf-8"),
                )
        traversal = self.client.get("/api/v1/reports/../../.env")
        self.assertEqual(traversal.status_code, 404)

    def test_validation_errors_are_documented_and_consistent(self) -> None:
        invalid_limit = self.client.get("/api/v1/events", params={"limit": 101})
        self.assertEqual(invalid_limit.status_code, 422)
        self.assertEqual(invalid_limit.json()["error"]["code"], "validation_error")
        invalid_range = self.client.get(
            "/api/v1/features", params={"start_date": "2026-07-02", "end_date": "2026-07-01"}
        )
        self.assertEqual(invalid_range.status_code, 422)
        self.assertEqual(invalid_range.json()["error"]["code"], "invalid_date_range")
        invalid_news_query = self.client.get("/api/v1/news", params={"q": "   "})
        self.assertEqual(invalid_news_query.status_code, 422)

    def test_cors_allows_the_local_nextjs_origin_and_only_safe_methods(self) -> None:
        response = self.client.options(
            "/api/v1/summary",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["access-control-allow-origin"], "http://localhost:3000")
        self.assertIn("GET", response.headers["access-control-allow-methods"])
        self.assertNotIn("POST", response.headers["access-control-allow-methods"])

    def test_database_connections_reject_write_statements(self) -> None:
        with closing(api._open_database()) as connection:
            with self.assertRaises(sqlite3.OperationalError):
                connection.execute("CREATE TABLE api_must_not_write (id INTEGER)")

    def test_openapi_lists_every_data_endpoint(self) -> None:
        response = self.client.get("/openapi.json")
        self.assertEqual(response.status_code, 200)
        paths = response.json()["paths"]
        for path in (
            "/api/v1/health",
            "/api/v1/summary",
            "/api/v1/events",
            "/api/v1/news",
            "/api/v1/features",
            "/api/v1/reports",
            "/api/v1/reports/{filename}",
        ):
            self.assertIn(path, paths)
            self.assertIn("get", paths[path])


if __name__ == "__main__":
    unittest.main()
