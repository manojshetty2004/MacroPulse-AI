import { expect, test, type Page, type Route } from "@playwright/test";

const API = "http://127.0.0.1:8000/api/v1";

// These fixtures exist only inside the browser test network routes. The UI itself
// reads API responses and never imports this test data.
const features = [
  { date: "2024-10-01", inflation: 0.01, employment: 0.02, growth: -0.01, rates: 0, other: 0.01, sentiment: -0.1, macro_score: 0.01 },
  { date: "2025-07-01", inflation: -0.02, employment: 0.03, growth: 0.02, rates: -0.01, other: 0, sentiment: 0.2, macro_score: 0.04 },
  { date: "2026-06-30", inflation: -0.03, employment: -0.1, growth: 0.01, rates: 0, other: -0.2, sentiment: 0.1, macro_score: -0.01 },
  { date: "2026-07-01", inflation: -0.05333333333333338, employment: -0.1694915254237288, growth: -0.013369154752357934, rates: 0, other: -0.42008620689655174, sentiment: 0, macro_score: -0.23619401350942013 },
];
const events = [
  { event_name: "Consumer Confidence", event_time: "2026-07-01T00:00:00", actual: 33.8, forecast: 34.1, previous: 33.6 },
  { event_name: "Nationwide HPI m/m", event_time: "2026-07-01T01:00:00", actual: 0, forecast: 0.1, previous: -0.6 },
  { event_name: "Spanish Manufacturing PMI", event_time: "2026-07-01T02:15:00", actual: 49.7, forecast: 51, previous: 51.2 },
];
const news = [
  { id: 1, title: "Federal Reserve Interest Rates Analysis: 2026 FOMC Policy Shift & Market Outlook", published_date: null, url: "https://example.invalid/source" },
  { id: 2, title: "United States Fed Funds Interest Rate", published_date: "2026-07-01", url: null },
];
const outlook = "# Macro Outlook\n\n- Latest data date: 2026-07-01\n- Current regime: Neutral\n- Macro score: -0.236\n";
const evaluation = "# Model Evaluation Report\n\n## Status: Not evaluated\n\nWalk-forward evaluation requires at least 4 valid daily feature rows; only 1 are available.\n";
const summary = {
  read_only: true,
  database: "available",
  macro_events: { available: true, records: 25 },
  news: { available: true, records: 60 },
  daily_features: { available: true, records: 1 },
  latest_feature: features.at(-1),
  reports: ["macro_outlook.md", "evaluation_report.md"],
};

function pageResponse(items: unknown[], limit = 100) {
  return { items, pagination: { total: items.length, limit, offset: 0 } };
}

async function mockApi(page: Page, overrides: Record<string, unknown> = {}) {
  const seen: string[] = [];
  await page.route(`${API}/**`, async (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/v1", "");
    seen.push(`${path}${url.search}`);
    if (path in overrides) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(overrides[path]) });
    } else if (path === "/summary") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(summary) });
    } else if (path === "/features") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(pageResponse([...features].reverse())) });
    } else if (path === "/events") {
      const start = url.searchParams.get("start_date");
      const end = url.searchParams.get("end_date");
      const filtered = events.filter((event) => {
        const day = event.event_time.slice(0, 10);
        return (!start || day >= start) && (!end || day <= end);
      });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(pageResponse(filtered)) });
    } else if (path === "/news") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(pageResponse(news)) });
    } else if (path === "/reports") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [
        { filename: "macro_outlook.md", description: "Current descriptive macro outlook", available: true, modified_at: "2026-07-01T00:00:00Z", bytes: outlook.length },
        { filename: "evaluation_report.md", description: "Model evaluation and readiness report", available: true, modified_at: "2026-07-01T00:00:00Z", bytes: evaluation.length },
      ] }) });
    } else if (path === "/reports/macro_outlook.md") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ filename: "macro_outlook.md", description: "Current descriptive macro outlook", modified_at: "2026-07-01T00:00:00Z", content: outlook }) });
    } else if (path === "/reports/evaluation_report.md") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ filename: "evaluation_report.md", description: "Model evaluation and readiness report", modified_at: "2026-07-01T00:00:00Z", content: evaluation }) });
    } else {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { code: "not_found", message: "Not found" } }) });
    }
  });
  return seen;
}

const routes = [
  { path: "/", heading: "A clearer view of the macro picture." },
  { path: "/markets", heading: "Market prices are not connected." },
  { path: "/calendar", heading: "Economic calendar." },
  { path: "/sentiment", heading: "Stored news and sentiment." },
  { path: "/model", heading: "Model readiness." },
  { path: "/reports", heading: "Research and provenance." },
];

test("all six routes load from the API without demo or market quotes", async ({ page }) => {
  const seen = await mockApi(page);
  for (const route of routes) {
    await page.goto(route.path);
    await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
    await expect(page.getByText("Could not load this data")).toHaveCount(0);
    await expect(page.getByText("103.84", { exact: true })).toHaveCount(0);
  }
  expect(seen.some((path) => path.startsWith("/summary"))).toBeTruthy();
  expect(seen.some((path) => path.startsWith("/features"))).toBeTruthy();
  expect(seen.some((path) => path.startsWith("/events"))).toBeTruthy();
  expect(seen.some((path) => path.startsWith("/news"))).toBeTruthy();
  expect(seen.some((path) => path.startsWith("/reports"))).toBeTruthy();
  await page.goto("/markets");
  await expect(page.getByText("No market-price data in this project")).toBeVisible();
});

test("calendar date and name filters only show matching API records", async ({ page }) => {
  const seen = await mockApi(page);
  await page.goto("/calendar");
  await expect(page.getByText("Consumer Confidence")).toBeVisible();
  await page.getByLabel("Start date").fill("2026-07-02");
  await expect(page.getByText("No macro events recorded")).toBeVisible();
  await expect.poll(() => seen.some((path) => path.includes("start_date=2026-07-02"))).toBeTruthy();
  await page.getByLabel("Start date").fill("2026-07-01");
  await page.getByLabel("Search event names").fill("Nationwide");
  await expect(page.getByText("Nationwide HPI m/m")).toBeVisible();
  await expect(page.getByText("Consumer Confidence")).toHaveCount(0);
  await page.getByLabel("Search event names").fill("no such release");
  await expect(page.getByText("No events match these filters")).toBeVisible();
  await page.getByLabel("Search event names").fill("");
  await page.getByLabel("Start date").fill("");
  await page.getByLabel("End date").fill("2026-06-30");
  await expect(page.getByText("No macro events recorded")).toBeVisible();
  await expect.poll(() => seen.some((path) => path.includes("end_date=2026-06-30"))).toBeTruthy();
});

test("chart range filters update accessible plotted observation counts", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  const chart = page.getByTestId("macro-score-chart");
  await expect(chart).toHaveAttribute("aria-label", /4 recorded daily observations/);
  await expect(chart.locator("svg")).toBeVisible();
  for (const [range, count] of [["1W", 2], ["1M", 2], ["3M", 2], ["1Y", 3], ["ALL", 4]] as const) {
    const button = page.getByRole("button", { name: range });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(chart).toHaveAttribute("aria-label", new RegExp(`${count} recorded daily observations?`));
  }
  await page.getByRole("link", { name: "News sentiment" }).first().click();
  const sentiment = page.getByTestId("sentiment-chart");
  await expect(sentiment).toHaveAttribute("aria-label", /4 recorded daily observations/);
  await expect(sentiment.locator("svg")).toBeVisible();
});

test("news links and exact source reports render from API responses", async ({ page }) => {
  await mockApi(page);
  await page.goto("/sentiment");
  await expect(page.getByText(news[0].title)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open source" }).first()).toHaveAttribute("href", news[0].url!);
  await page.goto("/model");
  await expect(page.getByTestId("evaluation-report")).toContainText("Not evaluated");
  await page.goto("/reports");
  await expect(page.getByTestId("report-macro_outlook.md")).toContainText("2026-07-01");
  await expect(page.getByTestId("report-evaluation_report.md")).toContainText("Not evaluated");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download current outlook" }).click();
  expect((await download).suggestedFilename()).toBe("macro_outlook.md");
});

test("empty database responses use explicit empty states", async ({ page }) => {
  await mockApi(page);
  await page.route(`${API}/events**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(pageResponse([])) }));
  await page.route(`${API}/news**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(pageResponse([])) }));
  await page.route(`${API}/features**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(pageResponse([])) }));
  await page.goto("/calendar");
  await expect(page.getByText("No macro events recorded")).toBeVisible();
  await page.goto("/sentiment");
  await expect(page.getByText("No news records")).toBeVisible();
  await expect(page.getByText("No sentiment history")).toBeVisible();
});

test("loading, backend errors, and retry are visible and recover", async ({ page }) => {
  await mockApi(page);
  let calls = 0;
  await page.route(`${API}/features**`, async (route) => {
    calls += 1;
    if (calls === 1) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "unavailable", message: "Backend is offline for this test." } }) });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(pageResponse([...features].reverse())) });
    }
  });
  await page.goto("/sentiment");
  await expect(page.getByText("Loading daily sentiment feature")).toBeVisible();
  await expect(page.getByText("Backend is offline for this test.").first()).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).first().click();
  await expect(page.getByTestId("sentiment-chart")).toBeVisible();
  expect(calls).toBe(2);
});

test("all API failures show backend error states instead of invented values", async ({ page }) => {
  await page.route(`${API}/**`, (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "database_unavailable", message: "Project database is unavailable." } }) }));
  for (const route of routes) {
    await page.goto(route.path);
    await expect(page.getByText("Could not load this data").first()).toBeVisible();
    await expect(page.getByText("Could not reach the API")).toHaveCount(0);
  }
});

test("global search, notification disclosure, and mobile navigation work", async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Search pages" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Search pages" })).toHaveCount(0);
  await page.getByRole("button", { name: "Search pages" }).click();
  await page.getByLabel("Search page routes").fill("calendar");
  await expect(page.getByRole("link", { name: "Economic calendar" })).toBeVisible();
  await page.getByRole("link", { name: "Economic calendar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Economic calendar." })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Markets" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Market prices are not connected." })).toBeVisible();
  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(page.getByText("The connected API does not provide notifications.")).toBeVisible();
});

test("desktop layout has no horizontal overflow", async ({ page }) => {
  test.setTimeout(60_000);
  await mockApi(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(route.path);
      await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    }
  }
});
