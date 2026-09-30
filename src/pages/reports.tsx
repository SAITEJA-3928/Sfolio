import * as React from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from "@/components/ui";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DownloadCloud, TrendingUp, Receipt, FileText,
  IndianRupee, Percent, ArrowUpRight, CheckCircle2, Clock, AlertCircle,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useGetAdminReports, useGetDistributionReport } from "@/lib/api-client-react";
import { getSortToggleClass, SortDirectionIcon, useTableSort } from "@/lib/table-sort";
import { formatCurrency } from "@/lib/utils";

const TOOLTIP_STYLE = {
  contentStyle: { backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" },
  itemStyle: { color: "#111827" },
};

const MOCK_DIST: any = {
  totalGifts: 8420, totalValue: 42100000,
  byMonth: [
    { date: "Apr", gifts: 0 }, { date: "May", gifts: 0 }, { date: "Jun", gifts: 0 },
    { date: "Jul", gifts: 0 }, { date: "Aug", gifts: 0 }, { date: "Sep", gifts: 0 },
    { date: "Oct", gifts: 0 }, { date: "Nov", gifts: 0 }, { date: "Dec", gifts: 0 },
    { date: "Jan", gifts: 0 }, { date: "Feb", gifts: 0 }, { date: "Mar", gifts: 0 },
  ],
};

function normalizeDistributionReport(value: unknown) {
  if (!value || typeof value !== "object") {
    return MOCK_DIST;
  }

  const record = value as Record<string, unknown>;
  const totalGifts =
    typeof record.totalGifts === "number" ? record.totalGifts : MOCK_DIST.totalGifts;
  const totalValue =
    typeof record.totalValue === "number" ? record.totalValue : MOCK_DIST.totalValue;
  const byMonth = Array.isArray(record.byMonth) ? record.byMonth : MOCK_DIST.byMonth;

  return {
    ...MOCK_DIST,
    ...record,
    totalGifts,
    totalValue,
    byMonth,
  };
}


const TABS = ["Finance Report", "GST Filings"] as const;
type Tab = typeof TABS[number];

// ─── Status badge ────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  if (status === "Filed")
    return <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200"><CheckCircle2 className="w-3 h-3" />{status}</span>;
  if (status === "Pending")
    return <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200"><Clock className="w-3 h-3" />{status}</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200"><AlertCircle className="w-3 h-3" />{status}</span>;
}

// ─── Summary KPI ─────────────────────────────────────────────────────────────
function KPI({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground mb-1">{label}</p>
        <p className={`text-2xl font-bold ${color ?? "text-foreground"}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

const MONTH_ORDER = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function numberValue(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const escapeCell = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const csv = [headers, ...rows]
    .map((row) => row.map(escapeCell).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function normalizeAdminReports(value: unknown) {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const yearly = record.yearly && typeof record.yearly === "object"
    ? (record.yearly as Record<string, unknown>)
    : {};
  const years = Object.keys(yearly).sort((a, b) => Number(b) - Number(a));

  return {
    overall: record.overall && typeof record.overall === "object"
      ? (record.overall as Record<string, unknown>)
      : {},
    yearly,
    years,
  };
}

function getFinanceRows(yearRecord: Record<string, unknown> | undefined, selectedYear: string) {
  const months = yearRecord?.months && typeof yearRecord.months === "object"
    ? (yearRecord.months as Record<string, unknown>)
    : {};

  return Object.entries(months)
    .map(([month, value]) => {
      const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
      return {
        month: `${month} ${selectedYear}`,
        monthKey: month,
        txnVolume: numberValue(record.txnVolume),
        txns: numberValue(record.txnsCount),
        platformFee: numberValue(record.platformFee),
        // taxableValue: numberValue(record.taxableValue),
        // totalTaxLiability: numberValue(record.totalTaxLiability),
        // sellGrossRevenue: numberValue(record.sellGrossRevenue),
      };
    })
    .sort((a, b) => MONTH_ORDER.indexOf(a.monthKey) - MONTH_ORDER.indexOf(b.monthKey));
}



// ─── Finance Report tab ───────────────────────────────────────────────────────
function FinanceTab({ selectedYear, setSelectedYear }: { selectedYear: string; setSelectedYear: React.Dispatch<React.SetStateAction<string>> }) {
  const { data, isLoading, isError } = useGetAdminReports();
  const report = React.useMemo(() => normalizeAdminReports(data), [data]);

  React.useEffect(() => {
    if (report.years.length === 0) return;

    // if current selected year not available
    if (!report.years.includes(selectedYear)) {
      setSelectedYear(report.years[0]);
    }
  }, [report.years, selectedYear, setSelectedYear]);

  const activeYear = selectedYear;
  const { sortKey, sortDirection, directionFactor, handleSort } =
    useTableSort<"month" | "volume" | "count" | "fee">();
  const yearRecord = report.yearly[activeYear] && typeof report.yearly[activeYear] === "object"
    ? (report.yearly[activeYear] as Record<string, unknown>)
    : undefined;
  const rows = React.useMemo(() => getFinanceRows(yearRecord, activeYear), [activeYear, yearRecord]);
  const sortedRows = React.useMemo(() => {
    if (!sortKey) return rows;

    return [...rows].sort((a, b) => {
      if (sortKey === "month") {
        return (MONTH_ORDER.indexOf(a.monthKey) - MONTH_ORDER.indexOf(b.monthKey)) * directionFactor;
      }
      if (sortKey === "volume") return (a.txnVolume - b.txnVolume) * directionFactor;
      if (sortKey === "count") return (a.txns - b.txns) * directionFactor;
      return (a.platformFee - b.platformFee) * directionFactor;
    });
  }, [directionFactor, rows, sortKey]);
  console.log("yearRecord", yearRecord, rows);
  const totals = yearRecord ?? report.overall;

  const chartData = MONTH_ORDER.map((month) => {
    const found = rows.find((r) => r.monthKey === month);

    return {
      month,
      "Gross Revenue": found
        ? Math.round(found.txnVolume)
        : 0,

      "Platform Fee": found
        ? Math.round(found.platformFee)
        : 0,
    };
  });
  const handleDownloadReport = () => {
    downloadCsv(
      `finance-report-${activeYear}.csv`,
      ["Month", "Txn Volume", "# Txns", "Platform Fee"],

      sortedRows.map((row) => [
        row.month,

        `${Number(row.txnVolume).toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,

        row.txns,

        `${Number(row.platformFee).toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
      ])
    );
  };
  const formatCurrencyAxis = (value) => {
    if (value >= 10000000) {
      return `${(value / 10000000).toFixed(1).replace(".0", "")}Cr`;
    }

    if (value >= 100000) {
      return `${(value / 100000).toFixed(1).replace(".0", "")}L`;
    }

    if (value >= 1000) {
      return `${(value / 1000).toFixed(1).replace(".0", "")}K`;
    }

    return value;
  };

  return (
    <>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
        <KPI label="Gross Revenue" value={formatCurrency(numberValue(totals.grossRevenue))} sub={activeYear ? `FY ${activeYear}` : "No year data"} />
        <KPI label="Platform Fee" value={formatCurrency(numberValue(totals.platformMargin))} sub="total platform margin" />
        <KPI label="Sell Gross Revenue" value={formatCurrency(numberValue(totals.sellGrossRevenue))} sub={activeYear ? `FY ${activeYear}` : "No year data"} />
        {/* <KPI label="Net Revenue" value={formatCurrency(fin.totals.netRevenue)} sub="after gateway" color="text-primary" />
        <KPI label="Gateway Costs" value={formatCurrency(fin.totals.gatewayCost)} sub="0% of gross" color="text-red-600" /> */}
      </div>
      <Card className="mb-8">
        <CardHeader className="flex flex-row items-center justify-between [&>h3]:hidden">
          <div className="flex flex-col gap-1">
            <CardTitle>Revenue Trend{activeYear ? ` (FY ${activeYear})` : ""}</CardTitle>
            {isError && <span className="text-xs text-destructive">Failed to load finance report.</span>}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={activeYear}
              onChange={(event) => setSelectedYear(event.target.value)}
              className="h-8 rounded-lg border border-border bg-white px-3 text-xs font-medium text-foreground"
            >
              {report.years.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex cursor-pointer transition-all duration-200 hover:scale-105">
                    <Button
                      variant="outline"
                      className="gap-2 h-12 px-6 rounded-full text-base cursor-pointer transition-all duration-200"
                      onClick={handleDownloadReport}
                      disabled={rows.length === 0}
                    >
                      <DownloadCloud className="w-4 h-4" />
                    </Button>
                  </span>
                </TooltipTrigger>

                <TooltipContent
                  side="top"
                  sideOffset={8}
                  className="bg-gray-700 text-white text-xs px-3 py-2 rounded-md shadow-lg animate-in fade-in zoom-in-95 duration-200"
                >
                  Export P&L
                </TooltipContent>
              </Tooltip>
            </TooltipProvider> </div>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }} barGap={8}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false}
                />    <XAxis dataKey="month" stroke="#9ca3af" tickLine={false} axisLine={false} fontSize={12}
                />

                {/* Gross Revenue Axis */}
                <YAxis
                  yAxisId="left"
                  tickFormatter={formatCurrencyAxis} stroke="#16a34a" tickLine={false} axisLine={false} fontSize={12} />

                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={formatCurrencyAxis}
                  stroke="#F59E0B"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                />
                <RechartsTooltip {...TOOLTIP_STYLE}
                  cursor={{ fill: "rgba(22,163,74,0.08)" }}
                  formatter={(value) => `₹${Number(value).toLocaleString("en-IN")}`}
                />
                <Legend />
                <Bar
                  yAxisId="left"
                  dataKey="Gross Revenue"
                  fill="#16a34a"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={40}
                />
                <Bar
                  yAxisId="right"
                  dataKey="Platform Fee"
                  fill="#F59E0B"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Monthly Finance Breakdown</CardTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex cursor-pointer transition-all duration-200 hover:scale-105">
                  <Button
                    variant="outline"
                    className="gap-2 h-12 px-6 rounded-full text-base cursor-pointer transition-all duration-200"
                    onClick={handleDownloadReport}
                    disabled={rows.length === 0}
                  >
                    <DownloadCloud className="w-4 h-4" />
                  </Button>
                </span>
              </TooltipTrigger>

              <TooltipContent
                side="top"
                sideOffset={8}
                className="bg-gray-700 text-white text-xs px-3 py-2 rounded-md shadow-lg animate-in fade-in zoom-in-95 duration-200"
              >
                Export Report
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="table-head-sticky">
                <tr className="border-b border-border  bg-muted/40">
                  <th className="px-4 py-3  text-left text-xs font-medium text-muted-foreground whitespace-nowrap">
                    <button type="button" onClick={() => handleSort("month")} className={getSortToggleClass(sortKey === "month")}>
                      Month <SortDirectionIcon active={sortKey === "month"} direction={sortDirection} />
                    </button>
                  </th>
                  <th className="px-4 py-3  text-left text-xs font-medium text-muted-foreground whitespace-nowrap">
                    <button type="button" onClick={() => handleSort("volume")} className={getSortToggleClass(sortKey === "volume")}>
                      Transaction Volume <SortDirectionIcon active={sortKey === "volume"} direction={sortDirection} />
                    </button>
                  </th>
                  <th className="px-4 py-3  text-left text-xs font-medium text-muted-foreground whitespace-nowrap">
                    <button type="button" onClick={() => handleSort("count")} className={getSortToggleClass(sortKey === "count")}>
                      Transaction Count <SortDirectionIcon active={sortKey === "count"} direction={sortDirection} />
                    </button>
                  </th>
                  <th className="px-4 py-3  text-left text-xs font-medium text-muted-foreground whitespace-nowrap">
                    <button type="button" onClick={() => handleSort("fee")} className={getSortToggleClass(sortKey === "fee")}>
                      Platform Fee (1.5%) <SortDirectionIcon active={sortKey === "fee"} direction={sortDirection} />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-6 text-center text-muted-foreground"
                    >
                      Loading finance report...
                    </td>
                  </tr>
                ) : !rows ||
                  rows.length === 0 ||
                  rows.every(
                    (r: any) =>
                      r.txnVolume === 0 &&
                      r.txns === 0 &&
                      r.platformFee === 0
                  ) ? (
                  <tr>
                    <td colSpan={4}
                      className="px-4 py-6 text-center text-muted-foreground">
                      No data found
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((r: any, i: number) => (
                    <tr
                      key={i}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-left  text-muted-foreground">
                        {r.month}</td>
                      <td className="px-4 py-3 text-left text-muted-foreground">
                        {formatCurrency(r.txnVolume)}
                      </td>
                      <td className="px-4 py-3 text-left text-muted-foreground">
                        {r.txns.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-medium text-left  text-muted-foreground">
                        {formatCurrency(r.platformFee)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}



function GSTTab({ selectedYear, setSelectedYear }: { selectedYear: string; setSelectedYear: React.Dispatch<React.SetStateAction<string>> }) {
  const { data, isLoading } = useGetAdminReports();
  const report = React.useMemo(() => normalizeAdminReports(data), [data]);
  const activeYear = selectedYear;
  const { sortKey, sortDirection, directionFactor, handleSort } =
    useTableSort<"month" | "fee" | "taxable" | "tax">();

  const yearRecord =
    report.yearly?.[activeYear] &&
      typeof report.yearly[activeYear] === "object"
      ? (report.yearly[activeYear] as Record<string, any>)
      : {};

  const months =
    yearRecord?.months &&
      typeof yearRecord.months === "object"
      ? yearRecord.months
      : {};

  const gstRows = Object.entries(months)
    .map(([month, value]: any) => ({
      month: `${month} ${activeYear}`,
      platformFee: numberValue(value?.platformFee),
      taxableValue: numberValue(value?.taxableValue),
      totalTaxLiability: numberValue(value?.totalTaxLiability),
    }))
    .sort(
      (a: any, b: any) =>
        MONTH_ORDER.indexOf(a.month.split(" ")[0]) -
        MONTH_ORDER.indexOf(b.month.split(" ")[0])
    );
  const sortedGstRows = React.useMemo(() => {
    if (!sortKey) return gstRows;

    return [...gstRows].sort((a: any, b: any) => {
      if (sortKey === "month") {
        return (MONTH_ORDER.indexOf(a.month.split(" ")[0]) - MONTH_ORDER.indexOf(b.month.split(" ")[0])) * directionFactor;
      }
      if (sortKey === "fee") return (a.platformFee - b.platformFee) * directionFactor;
      if (sortKey === "taxable") return (a.taxableValue - b.taxableValue) * directionFactor;
      return (a.totalTaxLiability - b.totalTaxLiability) * directionFactor;
    });
  }, [directionFactor, gstRows, sortKey]);

  const totals = {
    totalTaxableValue: numberValue(yearRecord?.totalTaxableValue),
    totalTaxLiability: numberValue(yearRecord?.totalTaxLiability),
  };

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        <KPI label="Total Taxable Value" value={formatCurrency(totals.totalTaxableValue)} sub={activeYear ? `FY ${activeYear}` : ""} />
        {/* <KPI label="IGST Collected" value={formatCurrency(gst.totals.igst)} sub="Inter-state supply" />
        <KPI label="CGST + SGST" value={formatCurrency(gst.totals.cgst + gst.totals.sgst)} sub="Intra-state supply" /> */}
        <KPI label="Total Tax Liability" value={formatCurrency(totals.totalTaxLiability)} sub={activeYear ? `FY ${activeYear}` : ""} />
      </div>



      <Card>
        <CardContent className="p-0">
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="table-head-sticky">
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">
                    <button type="button" onClick={() => handleSort("month")} className={getSortToggleClass(sortKey === "month")}>
                      Month <SortDirectionIcon active={sortKey === "month"} direction={sortDirection} />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">
                    <button type="button" onClick={() => handleSort("fee")} className={getSortToggleClass(sortKey === "fee")}>
                      Platform Fee <SortDirectionIcon active={sortKey === "fee"} direction={sortDirection} />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">
                    <button type="button" onClick={() => handleSort("taxable")} className={getSortToggleClass(sortKey === "taxable")}>
                      Taxable Value <SortDirectionIcon active={sortKey === "taxable"} direction={sortDirection} />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">
                    <button type="button" onClick={() => handleSort("tax")} className={getSortToggleClass(sortKey === "tax")}>
                      Total Tax Liability <SortDirectionIcon active={sortKey === "tax"} direction={sortDirection} />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-6 text-center text-muted-foreground"
                    >
                      Loading GST report...
                    </td>
                  </tr>
                ) : sortedGstRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                      No data found
                    </td>
                  </tr>
                ) : (
                  sortedGstRows.map((r: any, i: number) => (
                    <tr
                      key={i}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-foreground">{r.month}</td>
                      <td className="px-4 py-3 font-medium text-amber-700">
                        {formatCurrency(r.platformFee)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatCurrency(r.taxableValue)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-primary">
                        {formatCurrency(r.totalTaxLiability)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

            </table>
          </div>
        </CardContent>
      </Card>

      {/* <p className="text-xs text-muted-foreground mt-3 text-center">
        GST applicable at 18% on platform service fees · GSTIN: 27AABCG1234F1Z5 · Registered: Maharashtra
      </p> */}
    </>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Reports() {
  const [activeTab, setActiveTab] = React.useState<Tab>("Finance Report");
  const currentYear = new Date().getFullYear().toString();
  const [selectedYear, setSelectedYear] = React.useState(currentYear);
  // const { data: distData, isError: distErr } = useGetDistributionReport();
  // const dist = React.useMemo(
  //   () => normalizeDistributionReport(distData && !distErr ? distData : MOCK_DIST),
  //   [distData, distErr],
  // );

  return (
    <Layout title="Reports">
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-8 p-1 bg-muted rounded-xl w-fit border border-border">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === tab
              ? "bg-white text-primary shadow-sm border border-border"
              : "text-muted-foreground hover:text-foreground"
              }`}
          >
            {/* {tab === "Overview"       && <TrendingUp className="w-3.5 h-3.5" />} */}
            {tab === "Finance Report" && <IndianRupee className="w-3.5 h-3.5" />}
            {tab === "GST Filings" && <Receipt className="w-3.5 h-3.5" />}
            {tab}
          </button>
        ))}
      </div>

      {/* {activeTab === "Overview"       && <OverviewTab dist={dist} />} */}
      {activeTab === "Finance Report" && (<FinanceTab selectedYear={selectedYear} setSelectedYear={setSelectedYear} />
      )}
      {activeTab === "GST Filings" && (
        <GSTTab selectedYear={selectedYear} setSelectedYear={setSelectedYear}
        />
      )}
    </Layout>
  );
}
