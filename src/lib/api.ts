export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_MACROPULSE_API_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");

export interface Page<T> {
  items: T[];
  pagination: { total: number; limit: number; offset: number };
}

export interface DailyFeature {
  date: string;
  inflation: number;
  employment: number;
  growth: number;
  rates: number;
  other: number;
  sentiment: number;
  macro_score: number;
}

export interface MacroEvent {
  event_name: string | null;
  event_time: string | null;
  actual: number | null;
  forecast: number | null;
  previous: number | null;
}

export interface NewsItem {
  id: number | null;
  title: string | null;
  published_date: string | null;
  url: string | null;
}

export interface DatasetStatus {
  available: boolean;
  records: number | null;
}

export interface ApiSummary {
  read_only: true;
  database: "available" | "unavailable";
  macro_events: DatasetStatus;
  news: DatasetStatus;
  daily_features: DatasetStatus;
  latest_feature: DailyFeature | null;
  reports: string[];
}

export interface ReportSummary {
  filename: string;
  description: string;
  available: boolean;
  modified_at: string | null;
  bytes: number | null;
}

export interface ReportListResponse {
  items: ReportSummary[];
}

export interface MarkdownReport {
  filename: string;
  description: string;
  modified_at: string;
  content: string;
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string };
  detail?: string | { message?: string };
}

export class ApiRequestError extends Error {
  readonly status: number | null;
  readonly code: string;

  constructor(message: string, status: number | null, code: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

/** Fetch one JSON response from the configured FastAPI origin. */
export async function apiGet<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiRequestError(
      `Could not reach the API at ${API_BASE_URL}. Check that FastAPI is running and CORS allows this frontend origin.`,
      null,
      "network_error",
    );
  }

  if (!response.ok) {
    let body: ErrorEnvelope | null = null;
    try {
      body = (await response.json()) as ErrorEnvelope;
    } catch {
      // Keep a stable message when a proxy returns a non-JSON error response.
    }
    const detail = body?.error?.message ?? body?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : detail && typeof detail === "object" && "message" in detail
          ? detail.message
          : `The API request failed with HTTP ${response.status}.`;
    throw new ApiRequestError(
      message || `The API request failed with HTTP ${response.status}.`,
      response.status,
      body?.error?.code ?? "http_error",
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiRequestError("The API returned an invalid JSON response.", response.status, "invalid_json");
  }
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "Date unavailable";
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(parsed);
}

export function formatValue(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Not reported";
  return value.toFixed(digits);
}
