"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate, type DailyFeature } from "@/lib/api";

type ChartKey = "macro_score" | "sentiment";

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="mb-2 text-[10px] text-[#898e97]">{formatDate(label)}</p>
      {payload.map((item) => (
        <p key={item.name} className="my-1 text-[11px]" style={{ color: item.color }}>
          {item.name}: <span className="text-[#f0eee9]">{item.value.toFixed(4)}</span>
        </p>
      ))}
    </div>
  );
}

function FeatureLineChart({ data, dataKey, name, color, testId }: {
  data: DailyFeature[];
  dataKey: ChartKey;
  name: string;
  color: string;
  testId: string;
}) {
  return (
    <div data-testid={testId} role="img" aria-label={`${name} chart showing ${data.length} recorded daily observations`} className="h-full w-full">
      {data.length === 0 ? (
        <p className="flex h-full items-center justify-center text-[11px] text-[#858b94]">No recorded points to plot.</p>
      ) : (
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={data} margin={{ top: 12, right: 10, left: -18, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#262a2f" strokeDasharray="3 5" />
            <XAxis
              dataKey="date"
              tickFormatter={(value: string) => formatDate(value)}
              tick={{ fill: "#727780", fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={24}
              dy={9}
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fill: "#727780", fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              width={42}
            />
            <ReferenceLine y={0} stroke="#454a50" strokeDasharray="3 4" />
            <Tooltip content={<ChartTooltip />} />
            <Line
              name={name}
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 1, fill: "#14171a" }}
              activeDot={{ r: 5, fill: color, stroke: "#101215", strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function ScoreChart({ data }: { data: DailyFeature[] }) {
  return <FeatureLineChart data={data} dataKey="macro_score" name="Macro score" color="#c5f36a" testId="macro-score-chart" />;
}

export function DriversChart({ data }: { data: DailyFeature[] }) {
  return <FeatureLineChart data={data} dataKey="sentiment" name="Daily sentiment feature" color="#7594ee" testId="sentiment-chart" />;
}
