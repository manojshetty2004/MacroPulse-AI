"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Download,
  ExternalLink,
  FileText,
  Globe2,
  Info,
  Newspaper,
  ShieldAlert,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { DriversChart, ScoreChart } from "@/components/charts";
import {
  ApiErrorState,
  ApiLoadingState,
  Card,
  CardHeading,
  EmptyState,
  MetricCard,
  Pill,
  RangeButtons,
  SectionTitle,
} from "@/components/ui";
import {
  formatDate,
  formatValue,
  type ApiSummary,
  type DailyFeature,
  type MacroEvent,
  type MarkdownReport,
  type NewsItem,
  type Page,
  type ReportListResponse,
} from "@/lib/api";
import { useApiResource } from "@/lib/use-api";

type Range = "1W" | "1M" | "3M" | "1Y" | "ALL";

function useFilteredFeatures(resource: ReturnType<typeof useApiResource<Page<DailyFeature>>>, range: Range) {
  return useMemo(() => {
    if (resource.status !== "success") return [];
    const descending = [...resource.data.items].sort((a, b) => b.date.localeCompare(a.date));
    if (range === "ALL" || descending.length === 0) return descending.reverse();
    const days = { "1W": 7, "1M": 31, "3M": 93, "1Y": 366 }[range];
    const newest = new Date(`${descending[0].date}T12:00:00Z`).getTime();
    return descending
      .filter((row) => newest - new Date(`${row.date}T12:00:00Z`).getTime() <= days * 86_400_000)
      .reverse();
  }, [range, resource]);
}

function ApiBlock<T>({
  state,
  loadingLabel,
  emptyTitle,
  emptyText,
  showError = true,
  children,
}: {
  state: ReturnType<typeof useApiResource<T>>;
  loadingLabel: string;
  emptyTitle: string;
  emptyText: string;
  showError?: boolean;
  children: (data: T) => ReactNode;
}) {
  if (state.status === "loading") return <ApiLoadingState label={loadingLabel} />;
  if (state.status === "error") return showError
    ? <ApiErrorState error={state.error.message} onRetry={state.reload} />
    : <p role="status" className="px-3 py-2 text-[10px] text-[#d6ad6a]">Data unavailable · see source status above</p>;
  if (Array.isArray(state.data) && state.data.length === 0) {
    return <EmptyState title={emptyTitle} text={emptyText} />;
  }
  if ("items" in (state.data as object) && Array.isArray((state.data as { items?: unknown }).items)) {
    if ((state.data as { items: unknown[] }).items.length === 0) {
      return <EmptyState title={emptyTitle} text={emptyText} />;
    }
  }
  return children(state.data);
}

function SimpleTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-y border-[#25292e] bg-[#15181d]">
            {headers.map((header) => (
              <th key={header} className="whitespace-nowrap px-3 py-[10px] text-[9px] font-medium uppercase tracking-[.09em] text-[#7c828c] first:pl-4">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function EventRows({ items }: { items: MacroEvent[] }) {
  return (
    <SimpleTable headers={["Event time", "Release", "Actual", "Forecast", "Previous"]}>
      {items.map((event, index) => (
        <tr key={`${event.event_time}-${event.event_name}-${index}`} className="border-b border-[#22262b] last:border-0 hover:bg-white/[.018]">
          <td className="whitespace-nowrap px-3 py-3 pl-4 text-[10px] tabular-nums text-[#9499a1]">{event.event_time ?? "Time not reported"}</td>
          <td className="min-w-[190px] px-3 text-[11px] text-[#deddd8]">{event.event_name ?? "Unnamed release"}</td>
          {[event.actual, event.forecast, event.previous].map((value, valueIndex) => (
            <td key={valueIndex} className="whitespace-nowrap px-3 text-[10px] tabular-nums text-[#a9adb4]">{formatValue(value, 4)}</td>
          ))}
        </tr>
      ))}
    </SimpleTable>
  );
}

function HeadlineList({ items }: { items: NewsItem[] }) {
  return (
    <div className="divide-y divide-[#24282d]">
      {items.map((item) => (
        <article key={item.id ?? `${item.title}-${item.published_date}`} className="flex flex-wrap items-start gap-3 px-4 py-4 sm:items-center sm:px-5">
          <div className="min-w-[110px] flex-1 sm:flex-none sm:w-[140px]">
            <span className="block text-[9px] text-[#7c828c]">{formatDate(item.published_date)}</span>
            {item.url ? (
              <a className="mt-1.5 inline-flex items-center gap-1 text-[9px] text-[#9da4ae] hover:text-[#c5f36a]" href={item.url} target="_blank" rel="noreferrer">
                Open source <ExternalLink size={10} />
              </a>
            ) : <span className="mt-1.5 block text-[9px] text-[#747b84]">Source unavailable</span>}
          </div>
          <p className="min-w-[190px] flex-[2] text-[11px] leading-[1.7] text-[#d3d2cc]">{item.title ?? "Untitled article"}</p>
        </article>
      ))}
    </div>
  );
}

function NumericDrivers({ feature }: { feature: DailyFeature }) {
  const rows = [
    { name: "Inflation", value: feature.inflation, icon: <TrendingUp size={13} /> },
    { name: "Employment", value: feature.employment, icon: <Users size={13} /> },
    { name: "Growth", value: feature.growth, icon: <Activity size={13} /> },
    { name: "Rates", value: feature.rates, icon: <Zap size={13} /> },
    { name: "Other", value: feature.other, icon: <Globe2 size={13} /> },
    { name: "News sentiment", value: feature.sentiment, icon: <Newspaper size={13} /> },
  ];
  return (
    <div className="mt-3 divide-y divide-[#25292e]">
      {rows.map((row) => (
        <div key={row.name} className="flex items-center justify-between py-3 text-[10px]">
          <span className="flex items-center gap-2 text-[#a9abb0]">{row.icon}<span>{row.name}</span></span>
          <span className="font-mono text-[#d7d5cf]">{formatValue(row.value, 4)}</span>
        </div>
      ))}
    </div>
  );
}

function SourceNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-[#2b2d31] bg-[#15171b] px-3 py-2.5 text-[10px] leading-[1.7] text-[#90949c]">
      <Info size={13} className="mt-0.5 shrink-0 text-[#b9a16c]" />
      <p>{children}</p>
    </div>
  );
}

function ApiConnectionBadge({ status }: { status: "loading" | "success" | "error" }) {
  const label = status === "loading" ? "Checking API" : status === "error" ? "API unavailable" : "API connected";
  const tone = status === "success" ? "green" : status === "error" ? "amber" : "muted";
  return <Pill tone={tone}>{label}</Pill>;
}

export function DashboardPage() {
  const summary = useApiResource<ApiSummary>("/api/v1/summary");
  const features = useApiResource<Page<DailyFeature>>("/api/v1/features?limit=100");
  const events = useApiResource<Page<MacroEvent>>("/api/v1/events?limit=5");
  const news = useApiResource<Page<NewsItem>>("/api/v1/news?limit=3");
  const [range, setRange] = useState<Range>("ALL");
  const chartRows = useFilteredFeatures(features, range);

  return (
    <>
      <SectionTitle eyebrow="MACRO OVERVIEW" title="A clearer view of the macro picture." description="The latest data available from this project’s local sources." actions={<ApiConnectionBadge status={summary.status} />} />
      <SourceNote>Only data returned by the local FastAPI service is shown. The existing project contains no market-price feed; missing values remain unavailable.</SourceNote>

      <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <ApiBlock state={summary} loadingLabel="Loading latest macro score" emptyTitle="No summary" emptyText="The API did not return a summary.">
          {(data) => <MetricCard label="Latest macro score" value={formatValue(data.latest_feature?.macro_score)} note={data.latest_feature ? `Feature date · ${formatDate(data.latest_feature.date)}` : "No dated feature row"} icon={<Globe2 size={14} />} />}
        </ApiBlock>
        <ApiBlock state={summary} loadingLabel="Loading news coverage" emptyTitle="No summary" emptyText="The API did not return a summary." showError={false}>
          {(data) => <MetricCard label="Dated feature rows" value={data.daily_features.records?.toLocaleString() ?? "Not reported"} note={data.daily_features.available ? "Source · daily_features.csv" : "Feature export unavailable"} icon={<BarChart3 size={14} />} />}
        </ApiBlock>
        <ApiBlock state={summary} loadingLabel="Loading event coverage" emptyTitle="No summary" emptyText="The API did not return a summary." showError={false}>
          {(data) => <MetricCard label="Stored macro events" value={data.macro_events.records?.toLocaleString() ?? "Not reported"} note={data.macro_events.available ? "Source · macro_events table" : "Event table unavailable"} icon={<CalendarDays size={14} />} />}
        </ApiBlock>
        <ApiBlock state={summary} loadingLabel="Loading news coverage" emptyTitle="No summary" emptyText="The API did not return a summary." showError={false}>
          {(data) => <MetricCard label="Stored news records" value={data.news.records?.toLocaleString() ?? "Not reported"} note={data.news.available ? "Source · news table" : "News table unavailable"} icon={<Newspaper size={14} />} />}
        </ApiBlock>
      </div>

      <div className="mt-4 grid grid-cols-1 items-start gap-4 2xl:grid-cols-[minmax(0,1.7fr)_minmax(290px,.8fr)]">
        <div className="space-y-4">
          <Card className="p-4 sm:p-[19px]">
            <CardHeading title="Macro score history" hint="Values read from daily_features.csv · no interpolation" right={<RangeButtons selected={range} onChange={setRange} />} />
            <ApiBlock state={features} loadingLabel="Loading daily feature history" emptyTitle="No feature history yet" emptyText="The API returned no rows from data/daily_features.csv.">
              {(data) => {
                const rows = chartRows;
                const latest = data.items[0];
                return <>
                  <div className="mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-[25px] tracking-[-.05em] text-[#eeede8]">{formatValue(latest?.macro_score)}</span>
                    <span className="text-[10px] text-[#858b94]">{latest ? formatDate(latest.date) : "No latest date"}</span>
                  </div>
                  {rows.length < 2 && <p className="mt-2 text-[10px] text-[#8b9099]">A line trend needs at least two recorded dates. Showing the available observation without inventing history.</p>}
                  <div className="mt-3 h-[220px] w-full sm:h-[245px]"><ScoreChart data={rows} /></div>
                </>;
              }}
            </ApiBlock>
          </Card>

          <Card className="overflow-hidden">
            <div className="p-4 pb-3 sm:px-[19px]"><CardHeading title="Recent macro events" hint="Actual rows from the macro_events table" right={<Link href="/calendar" className="text-[10px] text-[#858b94] hover:text-[#c5f36a]">Open calendar <ArrowRight size={11} className="inline" /></Link>} /></div>
            <ApiBlock state={events} loadingLabel="Loading stored macro events" emptyTitle="No macro events recorded" emptyText="The macro_events table currently has no rows.">
              {(data) => <EventRows items={data.items} />}
            </ApiBlock>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4 sm:p-[18px]">
            <CardHeading title="Latest feature breakdown" hint="Stored values for the latest available date" />
            <ApiBlock state={features} loadingLabel="Loading feature values" emptyTitle="No feature values" emptyText="A breakdown will appear when daily_features.csv contains data." showError={false}>
              {(data) => data.items.length > 0 ? <>
                <p className="mt-3 text-[10px] text-[#818791]">{formatDate(data.items[0].date)}</p>
                <NumericDrivers feature={data.items[0]} />
              </> : <EmptyState title="No feature values" text="A breakdown will appear when daily_features.csv contains data." />}
            </ApiBlock>
          </Card>
          <Card className="overflow-hidden">
            <div className="p-4 pb-3 sm:px-[18px]"><CardHeading title="Latest stored headlines" hint="Article metadata from the news table" right={<Link href="/sentiment" className="text-[10px] text-[#858b94] hover:text-[#c5f36a]">All news <ArrowRight size={11} className="inline" /></Link>} /></div>
            <ApiBlock state={news} loadingLabel="Loading stored news" emptyTitle="No news records" emptyText="No news articles are present in the connected database.">
              {(data) => <HeadlineList items={data.items} />}
            </ApiBlock>
          </Card>
          <Card className="p-4">
            <CardHeading title="Market data availability" hint="Source capability, not a market quote" />
            <p className="mt-3 text-[10px] leading-[1.8] text-[#92969e]">This backend has no market-price table or market-data endpoint. Quotes and returns are not available.</p>
            <Link href="/markets" className="mt-3 inline-flex items-center gap-1 text-[10px] text-[#c5f36a]">View market data status <ArrowRight size={11} /></Link>
          </Card>
        </div>
      </div>
    </>
  );
}

export function MarketsPage() {
  const summary = useApiResource<ApiSummary>("/api/v1/summary");
  return (
    <>
      <SectionTitle eyebrow="DATA AVAILABILITY" title="Market prices are not connected." description="This page reports the current data boundary instead of presenting invented quotes." actions={<Pill tone="muted">No market feed</Pill>} />
      <Card className="p-5 sm:p-8">
        <ApiBlock state={summary} loadingLabel="Checking available data sources" emptyTitle="Source status unavailable" emptyText="The API returned no source summary.">
          {(data) => <>
            <EmptyState title="No market-price data in this project" text="The connected Python backend provides macro event records, news metadata, daily macro features, and Markdown reports. It does not provide instrument prices, currency quotes, market returns, or a live market-data feed." />
            <div className="mx-auto mt-3 grid max-w-[720px] grid-cols-1 gap-3 sm:grid-cols-3">
              <MetricCard label="Macro event rows" value={data.macro_events.records?.toLocaleString() ?? "Not reported"} note={data.macro_events.available ? "Database source available" : "Database table unavailable"} icon={<CalendarDays size={14} />} />
              <MetricCard label="News rows" value={data.news.records?.toLocaleString() ?? "Not reported"} note={data.news.available ? "Database source available" : "Database table unavailable"} icon={<Newspaper size={14} />} />
              <MetricCard label="Daily feature rows" value={data.daily_features.records?.toLocaleString() ?? "Not reported"} note={data.daily_features.available ? "CSV source available" : "Feature export unavailable"} icon={<BarChart3 size={14} />} />
            </div>
            {data.latest_feature && <p className="mt-5 text-center text-[10px] text-[#888e97]">The latest macro feature is dated {formatDate(data.latest_feature.date)} and is not a market price.</p>}
          </>}
        </ApiBlock>
      </Card>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-[18px]"><CardHeading title="Available source files" hint="Existing backend outputs" /><ul className="mt-3 space-y-2 text-[10px] text-[#a0a4aa]"><li className="flex items-center gap-2"><CalendarDays size={13} /> SQLite · macro_events</li><li className="flex items-center gap-2"><Newspaper size={13} /> SQLite · news</li><li className="flex items-center gap-2"><TrendingUp size={13} /> CSV · daily_features.csv</li><li className="flex items-center gap-2"><FileText size={13} /> Markdown · macro outlook and evaluation</li></ul></Card>
        <Card className="p-[18px]"><CardHeading title="When prices become available" hint="No inferred or sample series are shown here" /><p className="mt-3 text-[10px] leading-[1.8] text-[#92969e]">A market table and a documented API endpoint would be required before this view could show an instrument value or price chart.</p><Link href="/reports" className="mt-3 inline-flex items-center gap-1 text-[10px] text-[#c5f36a]">Review source inventory <ArrowRight size={11} /></Link></Card>
      </div>
    </>
  );
}

export function CalendarPage() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [search, setSearch] = useState("");
  const query = new URLSearchParams({ limit: "100" });
  if (startDate) query.set("start_date", startDate);
  if (endDate) query.set("end_date", endDate);
  const events = useApiResource<Page<MacroEvent>>(`/api/v1/events?${query.toString()}`);
  const visibleEvents = useMemo(() => {
    if (events.status !== "success") return [];
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return events.data.items;
    return events.data.items.filter((event) => (event.event_name ?? "").toLocaleLowerCase().includes(needle));
  }, [events, search]);

  return (
    <>
      <SectionTitle eyebrow="MACRO EVENTS · SOURCE DATABASE" title="Economic calendar." description="Stored economic-event records from the project SQLite database." actions={<ApiConnectionBadge status={events.status} />} />
      <SourceNote>The database does not contain currency or impact fields. This calendar shows the recorded event name, timestamp, actual, forecast, and previous values as stored.</SourceNote>
      <Card className="mt-5 overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 p-4 sm:px-5">
          <div><CardHeading title="Recorded macro events" hint={events.status === "success" ? `${events.data.pagination.total} matching database rows` : "Dates are inclusive; filters query the API."} /></div>
          <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-[minmax(160px,220px)_minmax(130px,160px)_minmax(130px,160px)]">
            <label className="text-[9px] text-[#848a93]">Search event<input aria-label="Search event names" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter event names" className="mt-1 block h-8 w-full rounded border border-[#30343a] bg-[#101215] px-2 text-[10px] text-[#ddd] outline-none focus:border-[#758a58]" /></label>
            <label className="text-[9px] text-[#848a93]">From<input aria-label="Start date" type="date" value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} className="mt-1 block h-8 w-full rounded border border-[#30343a] bg-[#101215] px-2 text-[10px] text-[#ddd] outline-none focus:border-[#758a58]" /></label>
            <label className="text-[9px] text-[#848a93]">To<input aria-label="End date" type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} className="mt-1 block h-8 w-full rounded border border-[#30343a] bg-[#101215] px-2 text-[10px] text-[#ddd] outline-none focus:border-[#758a58]" /></label>
          </div>
        </div>
        <ApiBlock state={events} loadingLabel="Loading events from the database" emptyTitle="No macro events recorded" emptyText="The API returned no events for this date range.">
          {() => visibleEvents.length ? <EventRows items={visibleEvents} /> : <EmptyState title="No events match these filters" text="Adjust the name or date filters to see matching records." />}
        </ApiBlock>
      </Card>
    </>
  );
}

export function SentimentPage() {
  const news = useApiResource<Page<NewsItem>>("/api/v1/news?limit=100");
  const features = useApiResource<Page<DailyFeature>>("/api/v1/features?limit=100");
  const [range, setRange] = useState<Range>("ALL");
  const chartRows = useFilteredFeatures(features, range);
  const latest = features.status === "success" ? features.data.items[0] : null;

  return (
    <>
      <SectionTitle eyebrow="NEWS & DAILY SENTIMENT FEATURE" title="Stored news and sentiment." description="Headline metadata comes from SQLite; sentiment history comes from the daily feature CSV." actions={<ApiConnectionBadge status={news.status === "error" || features.status === "error" ? "error" : news.status === "loading" || features.status === "loading" ? "loading" : "success"} />} />
      <SourceNote>The backend calculates daily sentiment with a basic positive/negative keyword count. It does not provide per-article sentiment scores or a trained sentiment classifier.</SourceNote>
      <div className="mt-5 grid grid-cols-1 items-start gap-4 2xl:grid-cols-[minmax(0,1.55fr)_minmax(290px,.75fr)]">
        <div className="space-y-4">
          <Card className="p-4 sm:p-[19px]">
            <CardHeading title="Daily sentiment feature" hint="The exact sentiment column from daily_features.csv" right={<RangeButtons selected={range} onChange={setRange} />} />
            <ApiBlock state={features} loadingLabel="Loading daily sentiment feature" emptyTitle="No sentiment history" emptyText="No daily feature rows are present in the connected CSV.">
              {(data) => <>
                <div className="mt-5 text-[24px] tracking-[-.05em] text-[#eeede8]">{formatValue(data.items[0]?.sentiment)}</div>
                {chartRows.length < 2 && <p className="mt-2 text-[10px] text-[#8b9099]">Only recorded dates are plotted; additional history is needed for a trend line.</p>}
                <div className="mt-3 h-[230px]"><DriversChart data={chartRows} /></div>
              </>}
            </ApiBlock>
          </Card>
          <Card className="overflow-hidden">
            <div className="p-4 sm:px-5"><CardHeading title="Stored news articles" hint={news.status === "success" ? `${news.data.pagination.total} database records` : "Metadata only; article bodies are not exposed by the API."} /></div>
            <ApiBlock state={news} loadingLabel="Loading news metadata" emptyTitle="No news records" emptyText="The connected news table currently has no rows.">
              {(data) => <HeadlineList items={data.items} />}
            </ApiBlock>
          </Card>
        </div>
        <div className="space-y-4">
          <Card className="p-[17px]">
            <CardHeading title="Latest feature components" hint={latest ? formatDate(latest.date) : "Values are loaded from the feature CSV"} />
            <ApiBlock state={features} loadingLabel="Loading daily features" emptyTitle="No component values" emptyText="The CSV contains no dated feature rows." showError={false}>
              {(data) => data.items.length > 0 ? <NumericDrivers feature={data.items[0]} /> : <EmptyState title="No component values" text="The CSV contains no dated feature rows." />}
            </ApiBlock>
          </Card>
          <Card className="p-[17px]">
            <CardHeading title="How the source score is produced" hint="From the existing Python feature pipeline" />
            <p className="mt-3 text-[10px] leading-[1.8] text-[#9699a0]">Daily sentiment is the mean keyword-count score for news stories with parseable publication dates. Undated stories are excluded from daily sentiment. The stored sentiment value is not a probability or a market-return estimate.</p>
            <Link href="/reports" className="mt-3 inline-flex items-center gap-1 text-[10px] text-[#c5f36a]">Review source and limitations <ArrowRight size={11} /></Link>
          </Card>
        </div>
      </div>
    </>
  );
}

export function ModelPage() {
  const summary = useApiResource<ApiSummary>("/api/v1/summary");
  const report = useApiResource<MarkdownReport>("/api/v1/reports/evaluation_report.md");
  return (
    <>
      <SectionTitle eyebrow="MODEL STATUS · SOURCE REPORT" title="Model readiness." description="The evaluation state and report are read from the current backend outputs." actions={<Pill tone="muted">No forecasts inferred</Pill>} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,.85fr)]">
        <Card className="p-5 sm:p-7">
          <ApiBlock state={report} loadingLabel="Loading evaluation report" emptyTitle="Evaluation report unavailable" emptyText="The API returned no evaluation report.">
            {(data) => <>
              <span className="inline-flex rounded border border-[#cb9a3d35] bg-[#cb9a3d12] px-2 py-1 text-[10px] text-[#dec27c]">Source · {data.filename}</span>
              <h2 className="mt-4 text-[16px] font-medium text-[#e6e5df]">Current evaluation report</h2>
              <pre data-testid="evaluation-report" className="mt-3 whitespace-pre-wrap break-words rounded-md border border-[#292d32] bg-[#101215] p-4 font-sans text-[11px] leading-[1.8] text-[#a6a8ae]">{data.content}</pre>
            </>}
          </ApiBlock>
        </Card>
        <Card className="p-[18px]">
          <CardHeading title="Current data coverage" hint="Live counts from the summary API" />
          <ApiBlock state={summary} loadingLabel="Loading model data coverage" emptyTitle="Coverage unavailable" emptyText="The API did not return its source summary.">
            {(data) => <div className="mt-3 divide-y divide-[#25292e]">
              {[
                ["Daily feature rows", data.daily_features.records, data.daily_features.available],
                ["Macro event rows", data.macro_events.records, data.macro_events.available],
                ["News rows", data.news.records, data.news.available],
              ].map(([label, count, available]) => <div key={String(label)} className="flex items-center justify-between gap-2 py-3 text-[10px]"><span className="text-[#a9adb4]">{label}</span><span className={available ? "text-[#d7d5cf]" : "text-[#d6ad6a]"}>{available ? Number(count).toLocaleString() : "Unavailable"}</span></div>)}
              <div className="flex items-center justify-between gap-2 py-3 text-[10px]"><span className="text-[#a9adb4]">Latest feature date</span><span className="text-[#d7d5cf]">{formatDate(data.latest_feature?.date)}</span></div>
            </div>}
          </ApiBlock>
          <SourceNote>Metrics, coefficients, feature importance, and forecast results appear only if they exist in the backend report. This page does not estimate missing results.</SourceNote>
        </Card>
      </div>
    </>
  );
}

function ReportPreview({ report, title }: { report: ReturnType<typeof useApiResource<MarkdownReport>>; title: string }) {
  return (
    <Card className="p-4 sm:p-[18px]">
      <CardHeading title={title} hint={report.status === "success" ? `Source · ${report.data.filename} · ${formatDate(report.data.modified_at)}` : "Exact contents of the existing Markdown file"} />
      <div className="mt-3">
        <ApiBlock state={report} loadingLabel={`Loading ${title.toLocaleLowerCase()}`} emptyTitle="Report unavailable" emptyText="The API returned no report content.">
          {(data) => <pre data-testid={`report-${data.filename}`} className="whitespace-pre-wrap break-words rounded-md border border-[#292d32] bg-[#101215] p-4 font-sans text-[10px] leading-[1.8] text-[#a2a5ac]">{data.content}</pre>}
        </ApiBlock>
      </div>
    </Card>
  );
}

function downloadReport(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ReportsPage() {
  const summary = useApiResource<ApiSummary>("/api/v1/summary");
  const reports = useApiResource<ReportListResponse>("/api/v1/reports");
  const outlook = useApiResource<MarkdownReport>("/api/v1/reports/macro_outlook.md");
  const evaluation = useApiResource<MarkdownReport>("/api/v1/reports/evaluation_report.md");
  return (
    <>
      <SectionTitle eyebrow="SOURCE DATA & REPORTS" title="Research and provenance." description="Dataset coverage is live; report text is served directly from the backend Markdown files." actions={outlook.status === "success" ? <button onClick={() => downloadReport(outlook.data.filename, outlook.data.content)} className="flex h-[34px] items-center gap-2 rounded-md border border-[#2b3036] bg-[#16191e] px-3 text-[10px] text-[#c7c7c1] hover:bg-[#1c2025]"><Download size={13} /> Download current outlook</button> : null} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ApiBlock state={summary} loadingLabel="Loading feature row count" emptyTitle="Summary unavailable" emptyText="The source summary is missing.">
          {(data) => <MetricCard label="Dated feature rows" value={data.daily_features.records?.toLocaleString() ?? "Not reported"} note="Source · daily_features.csv" icon={<BarChart3 size={14} />} />}
        </ApiBlock>
        <ApiBlock state={summary} loadingLabel="Loading latest feature date" emptyTitle="Summary unavailable" emptyText="The source summary is missing." showError={false}>
          {(data) => <MetricCard label="Latest feature date" value={data.latest_feature ? formatDate(data.latest_feature.date) : "No dated row"} note="Read from daily_features.csv" icon={<CalendarDays size={14} />} />}
        </ApiBlock>
        <ApiBlock state={summary} loadingLabel="Checking reports" emptyTitle="Summary unavailable" emptyText="The source summary is missing." showError={false}>
          {(data) => <MetricCard label="Available reports" value={String(data.reports.length)} note="Only files returned by the API" icon={<FileText size={14} />} />}
        </ApiBlock>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReportPreview report={outlook} title="Macro outlook" />
        <ReportPreview report={evaluation} title="Model evaluation" />
      </div>
      <Card className="mt-4 overflow-hidden">
        <div className="p-4 sm:px-5"><CardHeading title="Report inventory" hint="Availability and file metadata returned by the API" /></div>
        <ApiBlock state={reports} loadingLabel="Loading report inventory" emptyTitle="No reports listed" emptyText="The report API returned no allow-listed report files.">
          {(data) => <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr className="border-y border-[#282b30] bg-[#15181c] text-[9px] uppercase tracking-[.08em] text-[#7c828c]"><th className="px-4 py-2.5 font-medium">Filename</th><th className="px-4 py-2.5 font-medium">Description</th><th className="px-4 py-2.5 font-medium">Availability</th><th className="px-4 py-2.5 font-medium">Size</th></tr></thead><tbody>{data.items.map((item) => <tr key={item.filename} className="border-b border-[#24282d] last:border-0"><td className="whitespace-nowrap px-4 py-3 font-mono text-[9px] text-[#c6c7c2]">{item.filename}</td><td className="px-4 py-3 text-[10px] text-[#a1a4ab]">{item.description}</td><td className="px-4 py-3"><Pill tone={item.available ? "green" : "amber"}>{item.available ? "Available" : "Missing"}</Pill></td><td className="px-4 py-3 text-[10px] text-[#858b94]">{item.bytes === null ? "Not reported" : `${item.bytes.toLocaleString()} bytes`}</td></tr>)}</tbody></table></div>}
        </ApiBlock>
      </Card>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-[18px]"><CardHeading title="Project data sources" hint="Existing backend artifacts" /><ul className="mt-3 space-y-2 text-[10px] leading-[1.8] text-[#92969e]"><li><code>data/macro_data.db</code> · macro events and news tables</li><li><code>data/daily_features.csv</code> · daily feature output</li><li><code>reports/macro_outlook.md</code> · descriptive feature-engineering result</li><li><code>reports/evaluation_report.md</code> · validation availability and model metrics</li></ul></Card>
        <Card className="p-[18px]"><CardHeading title="Interpretation limits" hint="Source behavior" /><p className="mt-3 text-[10px] leading-[1.8] text-[#92969e]">Daily news sentiment is a keyword heuristic. Walk-forward model metrics are only reported when the available dated history is sufficient. No trading records, asset returns, or market price feed are available through this API.</p><div className="mt-3 flex items-start gap-2 text-[10px] text-[#92969e]"><ShieldAlert size={13} className="mt-0.5 shrink-0 text-[#bdac7c]" />This interface does not present macro scores as trading recommendations.</div></Card>
      </div>
    </>
  );
}
