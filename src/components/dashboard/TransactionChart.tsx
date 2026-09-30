import {
  BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { ChartXAxisTick } from "@/components/charts/ChartXAxisTick";
import { useIsMobile } from "@/hooks/use-mobile";
import { getEvenlySpacedTicks, getMonthTicks } from "@/lib/chart-utils";
import { formatDateDisplayValue } from "@/lib/date-range";
import { usesMonthChartTicks } from "@/lib/time-period";

const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
  },
  itemStyle: { color: "#111827" },
};

function formatCurrencyAxis(value: number) {
  if (value >= 10000000) {
    return `${(value / 10000000).toFixed(1).replace(".0", "")}Cr`;
  }
  if (value >= 100000) {
    return `${(value / 100000).toFixed(1).replace(".0", "")}L`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1).replace(".0", "")}K`;
  }
  return String(value);
}

const PERIOD_LABELS: Record<string, string> = {
  "10": "Last 10 Days",
  "30": "Last 30 Days",
  "90": "Last 90 Days",
};

function getChartLayout(timePeriod: string, isMobile: boolean) {
  if (timePeriod === "30") {
    return {
      margin: { top: 10, right: isMobile ? 8 : 20, left: 0, bottom: 8 },
      xAxisHeight: isMobile ? 40 : 56,
    };
  }

  if (usesMonthChartTicks(timePeriod)) {
    return {
      margin: { top: 10, right: isMobile ? 8 : 20, left: 0, bottom: 8 },
      xAxisHeight: isMobile ? 32 : 36,
    };
  }

  return {
    margin: { top: 10, right: isMobile ? 8 : 20, left: 0, bottom: 8 },
    xAxisHeight: isMobile ? 28 : 32,
  };
}
const MOBILE_TICK_COUNTS: Record<string, number> = {
  "10": 10,
  "30": 6,
  "90": 4,
};

function getTickConfig(
  timePeriod: string,
  data: Array<{ date: string }>,
  isMobile: boolean,
) {
  if (!isMobile) {
    return {
      ticks: usesMonthChartTicks(timePeriod)
        ? getMonthTicks(data)
        : data.map((item) => item.date),
    };
  }

  const maxTicks = MOBILE_TICK_COUNTS[timePeriod] ?? 5;
  return { ticks: getEvenlySpacedTicks(data, maxTicks) };
}

type Props = {
  data: Array<{ date: string; volume: number; transactions?: number }>;
  timePeriod: string;
};

export function TransactionChart({ data, timePeriod }: Props) {
  const isMobile = useIsMobile();
  const { ticks } = getTickConfig(timePeriod, data, isMobile);
  const periodLabel = PERIOD_LABELS[timePeriod] ?? `Last ${timePeriod} Days`;
  const { margin, xAxisHeight } = getChartLayout(timePeriod, isMobile);

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle>Transaction Volume ({periodLabel})</CardTitle>
      </CardHeader>

      <CardContent>
        <div className="h-[280px] w-full min-w-0 overflow-hidden">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={margin}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis
                dataKey="date"
                ticks={ticks}
                interval={0}
                height={xAxisHeight}
                stroke="#9ca3af"
                tickLine={false}
                axisLine={false}
                fontSize={12}
                tick={(props) => (
                  <ChartXAxisTick {...props} timePeriod={timePeriod} isMobile={isMobile} />
                )}
              />
              <YAxis
                tickFormatter={formatCurrencyAxis}
                stroke="#16a34a"
                tickLine={false}
                axisLine={false}
                fontSize={12}
              />
              <RechartsTooltip
                {...TOOLTIP_STYLE}
                cursor={{ fill: "rgba(22,163,74,0.08)" }}
                labelFormatter={(label) =>
                  typeof label === "string" ? formatDateDisplayValue(label) : String(label)
                }
                formatter={(value) => `₹${Number(value).toLocaleString("en-IN")}`}
              />
              <Bar
                dataKey="volume"
                name="Volume"
                fill="#16a34a"
                radius={[6, 6, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
