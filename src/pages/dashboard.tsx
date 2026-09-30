import * as React from "react";
import { useLocation, useSearch } from "wouter";
import type { DateRange } from "react-day-picker";
import {
  appendTimePeriodParam,
  buildDashboardPathWithTimePeriod,
  getDateRangeFromTimePeriod,
  getInitialDashboardTimePeriod,
} from "@/lib/time-period";
import { formatDateInputValue } from "@/lib/date-range";
import { FAILED_TRANSACTION_STATUS_FILTER } from "@/lib/transaction-filters";
import { Layout } from "@/components/layout";
import { useGetDashboardMetrics } from "@/lib/api-client-react";
import {
  extractMetalHoldings,
  MetalHoldingsSection,
} from "@/components/dashboard/MetalHoldingsSection";
import { LiveMetalPricesToolbar } from "@/components/dashboard/LiveMetalPricesToolbar";
import { SummaryMetricCard } from "@/components/dashboard/SummaryMetricCard";
import { TransactionChart } from "@/components/dashboard/TransactionChart";
import { Wallet, Users, ArrowRightLeft, Gift } from "lucide-react";
import { transformTrends } from "@/lib/data-transformers";
function responseMatchesRequest(
  data: { fromDate?: string; toDate?: string; timePeriod?: string } | null | undefined,
  fromDate?: string,
  toDate?: string,
  timePeriod?: string,
) {
  if (!data) return false;
  if (data.fromDate && fromDate && data.fromDate !== fromDate) return false;
  if (data.toDate && toDate && data.toDate !== toDate) return false;
  if (data.timePeriod && timePeriod && !String(data.timePeriod).startsWith(timePeriod)) {
    return false;
  }
  return true;
}
function numberValue(...values: unknown[]) {
  for (const value of values) {
    const amount = Number(value);
    if (Number.isFinite(amount)) return amount;
  }

  return 0;
}

function formatInrNumber(amount: number) {
  return `₹${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

export default function Dashboard() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const timePeriod = getInitialDashboardTimePeriod(search);
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(() =>
    getDateRangeFromTimePeriod(timePeriod),
  );

  React.useEffect(() => {
    setDateRange(getDateRangeFromTimePeriod(timePeriod));
  }, [timePeriod]);
  const fromDate = dateRange?.from ? formatDateInputValue(dateRange.from) : undefined;
  const toDate = dateRange?.to
    ? formatDateInputValue(dateRange.to)
    : dateRange?.from
      ? formatDateInputValue(dateRange.from)
      : undefined;

  const { data, isFetching, isPending } = useGetDashboardMetrics(
    timePeriod,
    fromDate,
    toDate,
  );

  const handleTimePeriodChange = (nextPeriod: string) => {
    navigate(buildDashboardPathWithTimePeriod(nextPeriod), { replace: true });
  };

  const dashboardData = responseMatchesRequest(data, fromDate, toDate, timePeriod)
 ? data : undefined;
  const metrics = dashboardData?.metrics;
  const isLoadingMetrics = isPending || (isFetching && !dashboardData);

  const trends = transformTrends(dashboardData?.transactionTrends || []);

  const goldHoldings = extractMetalHoldings(metrics?.goldSummary);
  const silverHoldings = extractMetalHoldings(metrics?.silverSummary);

  const buyAmount = numberValue(metrics?.totalAmount?.buyAmount);
  const sellAmount = numberValue(metrics?.totalAmount?.sellAmount);
  const activeUsers = numberValue(metrics?.completedKyc?.value);
  const revenue = numberValue(metrics?.revenue?.value);
  const pendingKyc = numberValue(metrics?.pendingKyc?.value);
  const successfulTransactions = numberValue(metrics?.successfulTransactions?.value);
  const failedTransactions = numberValue(metrics?.failedTransactions?.value);
  const pendingTransactions = numberValue(metrics?.pendingTransactions?.value);
  const platformFee = numberValue(metrics?.platformFee?.value);

  const totalFailedTransaction = failedTransactions + pendingTransactions;
  const totalTransactions = successfulTransactions + totalFailedTransaction;
  const successRate =
    totalTransactions > 0
      ? Math.round((successfulTransactions / totalTransactions) * 100)
      : 0;
  const handleNavigation = (href: string) => {
    navigate(appendTimePeriodParam(href, timePeriod));
  };
  const buildSellTransactionsHref = () => {
    const params = new URLSearchParams();
    params.set("statusFilter", "pending");
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    return `/selltransactions?${params.toString()}`;
  };
const clearUsersStateAndNavigate = (href: string) => {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem("gfolio-admin:users-notification-selection");
    sessionStorage.removeItem("gfolio-admin:selected-user");
    sessionStorage.setItem("gfolio-admin:users-reset-selection", "1");
  }
  handleNavigation(href);
};
  return (
    <Layout title="Dashboard Overview">
      <LiveMetalPricesToolbar
        timePeriod={timePeriod}
        dateRange={dateRange}
        isTimePeriodDisabled={isFetching}
        onTimePeriodChange={handleTimePeriodChange}
        onDateRangeChange={setDateRange}
      />

      <div className="grid min-w-0 gap-6 lg:grid-cols-2 mb-8">
        <SummaryMetricCard
          title="Volume"
          subtitle="Trading volume overview"
          icon={Wallet}
          metrics={[
            {
              label: "Total Buy Value",
              value: formatInrNumber(buyAmount),
              onMetricSelect: () => handleNavigation("/transactions?transactionTypeFilter=buy"),
            },
            {
              label: "Total Sell Value",
              value: formatInrNumber(sellAmount),
              onMetricSelect: () => handleNavigation(buildSellTransactionsHref()),
            },
          ]}
          onClick={() => handleNavigation("/selltransactions")}
        />

        <SummaryMetricCard
          title="Users"
          subtitle="User verification overview"
          icon={Users}
          metrics={[
            {
              label: "KYC Completed Users",
              value: formatCount(activeUsers),
              detail: (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                  Verified
                </span>
              ),
              onMetricSelect: () =>
                clearUsersStateAndNavigate("/users?kycFilter=approved"),
            },
            {
              label: "Pending Users",
              value: formatCount(pendingKyc),
              detail: (
                <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-700">
                  Pending
                </span>
              ),
              onMetricSelect: () =>
                clearUsersStateAndNavigate("/users?kycFilter=pending"),
            },
          ]}
          onClick={() => clearUsersStateAndNavigate("/users?kycFilter=all")}
        />

        <SummaryMetricCard
          title="Transactions"
          subtitle="Transaction success overview"
          icon={ArrowRightLeft}
          metrics={[
            {
              label: "Successful Transactions",
              value: formatCount(successfulTransactions),
              detail: (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                  {successRate}% Success Rate
                </span>
              ),
              onMetricSelect: () => handleNavigation("/transactions?statusFilter=success"),
            },
            {
              label: "Incomplete Transactions",
              value: formatCount(totalFailedTransaction),
              detail: (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                  Incomplete
                </span>
              ),
              onMetricSelect: () =>
                handleNavigation(`/transactions?statusFilter=${FAILED_TRANSACTION_STATUS_FILTER}`),
            },
          ]}
          onClick={() => handleNavigation("/transactions")}
        />

        <SummaryMetricCard
          title="Revenue"
          subtitle="Revenue distribution overview"
          icon={Gift}
          metrics={[
            {
              label: "Platform Fee Revenue",
              value: formatInrNumber(platformFee),
              onMetricSelect: () => handleNavigation("/gifts"),
              detail: (
                <>
                  <span>of total revenue</span>
                </>
              ),
            },
            {
              label: "Gifting Revenue",
              value: formatInrNumber(revenue),
              onMetricSelect: () => handleNavigation("/gifts"),
              detail: (
                <>
                  <span>of total revenue</span>
                </>
              ),
            },
          ]}
        />
      </div>

      <MetalHoldingsSection
        goldHoldings={goldHoldings}
        silverHoldings={silverHoldings}
        onClick={() => navigate("/holdings")}
      />

      <div className="min-w-0">
        <TransactionChart data={trends} timePeriod={timePeriod} />
      </div>
    </Layout>
  );
}
