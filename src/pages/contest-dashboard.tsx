import * as React from "react";
import type { DateRange } from "react-day-picker";
import { Layout } from "@/components/layout";
import { TableHeaderFilter } from "@/components/table-header-filter";
import { TablePaginationFooter } from "@/components/table-pagination-footer";
import { Badge, Button, Card, Input } from "@/components/ui";
import {
  Eye,
  Pencil,
  Plus,
  Search,
  Trash2,
  Trophy,
  DownloadCloud,
} from "lucide-react";
import { useLocation, useParams } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { buildAuthApiUrl } from "@/lib/api-config";
import { customFetch } from "@/lib/custom-fetch";
import { cn, formatCurrency } from "@/lib/utils";
import { DateRangePicker } from "@/components/ui/date-picker";
import { formatDateDisplayValue, isDateInRange } from "@/lib/date-range";
import { exportToExcel } from "@/lib/export-to-excel";
import { bindTablePaginationFooter, useTablePagination } from "@/lib/table-pagination";
import { getSortToggleClass, SortDirectionIcon, useTableSort } from "@/lib/table-sort";
import {
  type Contest,
  type ContestStatus,
  deleteContest,
  mapContestFromApi,
} from "@/lib/contest-store";

type DeleteContestApiResponse = {
  message?: string;
};

type ContestTransactionUser = {
  _id: string;
  name: string;
  phone: string;
  email: string;
};

type ContestTransaction = {
  _id: string;
  userId: string;
  metalType: string;
  totalPaidAmount: number;
  totalAmount: number;
  investedAmount: number;
  metalWeightInGrams: number;
  pricePerGram: number;
  transactionType: string;
  status: string;
  invoiceNumber: string;
  invoiceUrl: string;
  goalId: string;
  executedAt: string;
  createdAt: string;
  contestActivityDate: string;
  user: ContestTransactionUser;
};

type ContestTransactionSummary = {
  totalAmount: number;
  transactionCount: number;
  uniqueUserCount: number;
};

type ContestTransactionsApiResponse = {
  status?: number;
  message?: string;
  data?: {
    contest?: Record<string, unknown>;
    total?: number;
    page?: number;
    limit?: number;
    summary?: ContestTransactionSummary;
    transactions?: ContestTransaction[];
  };
};

type AdminContestsApiResponse = {
  message?: string;
  data?: {
    contests?: unknown[];
    total?: number;
  };
  contests?: unknown[];
};

function unwrapAdminContests(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.contests)) return record.contests;
  if (Array.isArray(record.data)) return record.data;
  if (record.data && typeof record.data === "object") {
    const data = record.data as Record<string, unknown>;
    if (Array.isArray(data.contests)) return data.contests;
  }
  return [];
}

async function fetchAdminContests() {
  return customFetch<AdminContestsApiResponse>(
    buildAuthApiUrl("/contest/adminContestList?page=1&limit=1000"),
    { method: "GET" },
  );
}

async function fetchContestTransactions(contestId: string) {
  return customFetch<ContestTransactionsApiResponse>(
    buildAuthApiUrl(`/contest/admin/${encodeURIComponent(contestId)}/transactions`),
    { method: "GET" },
  );
}

const STATUS_DISPLAY: Record<ContestStatus, { label: string; className: string }> = {
  active: { label: "LIVE", className: "bg-emerald-500/10 text-emerald-600" },
  ended: { label: "ENDED", className: "bg-emerald-100/70 text-emerald-800/60" },
  finalized: { label: "ENDED", className: "bg-emerald-100/70 text-emerald-800/60" },
  draft: { label: "DRAFT", className: "bg-slate-500/10 text-slate-600" },
  upcoming: { label: "UPCOMING", className: "bg-sky-500/10 text-sky-600" },
};

function getStatusDisplay(status?: string): { label: string; className: string } {
  if (!status) {
    return { label: "UNKNOWN", className: "bg-slate-500/10 text-slate-600" };
  }
  const key = status.toLowerCase() as ContestStatus;
  return (
    STATUS_DISPLAY[key] ?? {
      label: status.toUpperCase(),
      className: "bg-slate-500/10 text-slate-600",
    }
  );
}

const RANKING_CRITERIA_LABELS: Record<string, string> = {
  MAXIMUM_TRANSACTION_COUNT: "Maximum Transaction Count",
  MAXIMUM_SIP_COUNT: "Maximum SIP Count",
  MAXIMUM_GOAL_COUNT: "Maximum Goal Count",
  MAXIMUM_BUY_COUNT: "Maximum Buy Count",
  MAXIMUM_GOAL_AMOUNT: "Maximum Goal Amount",
  MAXIMUM_SIP_AMOUNT: "Maximum SIP Amount",
  MAXIMUM_TRANSACTION_AMOUNT: "Maximum Transaction Amount",
  MAXIMUM_BUY_AMOUNT: "Maximum Buy Amount",
  MAXIMUM_REFERRAL_COUNT: "Maximum Referral Count",
};

function getRankingCriteriaLabel(criteria?: string): string {
  if (!criteria) return "—";
  return (
    RANKING_CRITERIA_LABELS[criteria] ??
    criteria
      .toLowerCase()
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

const RANKING_CRITERIA_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  ...Object.entries(RANKING_CRITERIA_LABELS).map(([value, label]) => ({ value, label })),
] as const;

type RankingCriteriaFilterOption = (typeof RANKING_CRITERIA_FILTER_OPTIONS)[number]["value"];
type ContestSortKey =
  | "name"
  | "rankingCriteria"
  | "maxWinners"
  | "participants"
  | "totalInvestment"
  | "startDate"
  | "endDate";

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All Contests" },
  { value: "live", label: "Live" },
  { value: "ended", label: "Ended" },
  { value: "draft", label: "Draft" },
  { value: "upcoming", label: "Upcoming" },
] as const;

type StatusFilterOption = (typeof STATUS_FILTER_OPTIONS)[number]["value"];

function contestMatchesStatus(contest: Contest, filter: StatusFilterOption): boolean {
  if (filter === "all") return true;
  if (filter === "live") return contest.status === "active";
  if (filter === "ended") return contest.status === "ended" || contest.status === "finalized";
  return contest.status === filter;
}

const ACTION_ICON_CLASS = "h-8 w-8 shrink-0 cursor-pointer";

export default function ContestDashboard() {
  const { contestId } = useParams<{ contestId?: string }>();
  const [, navigate] = useLocation();
  const [contests, setContests] = React.useState<Contest[]>([]);
  const [isLoadingContests, setIsLoadingContests] = React.useState(true);
  const [contestsError, setContestsError] = React.useState<string | null>(null);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilterOption>("all");
  const [rankingCriteriaFilter, setRankingCriteriaFilter] =
    React.useState<RankingCriteriaFilterOption>("all");
  const [dateRange, setDateRange] = React.useState<DateRange>();
  const { sortKey, sortDirection, directionFactor, handleSort } = useTableSort<ContestSortKey>();
  const [viewingContest, setViewingContest] = React.useState<Contest | null>(null);

  const selectedContest = React.useMemo(() => {
    const byId = contestId
      ? contests.find((contest) => contest.id === contestId)
      : undefined;
    return byId ?? contests[0];
  }, [contestId, contests]);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoadingContests(true);
    setContestsError(null);

    fetchAdminContests()
      .then((response) => {
        if (cancelled) return;
        const mapped = unwrapAdminContests(response)
          .map(mapContestFromApi)
          .filter((contest): contest is Contest => contest !== null);
        setContests(mapped);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to fetch contests", error);
        setContests([]);
        setContestsError(error instanceof Error ? error.message : "Failed to load contests");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingContests(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!selectedContest?.id) return;
    let cancelled = false;
    fetchContestTransactions(selectedContest.id)
      .then((response) => {
        if (cancelled) return;
        const summary = response.data?.summary ?? null;
        if (summary) {
          setContests((current) =>
            current.map((contest) =>
              contest.id === selectedContest.id
                ? {
                    ...contest,
                    participants: summary.uniqueUserCount ?? contest.participants,
                    transactions: summary.transactionCount ?? contest.transactions,
                    totalInvestment: summary.totalAmount ?? contest.totalInvestment,
                  }
                : contest,
            ),
          );
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to fetch contest transactions", err);
      });
    return () => { cancelled = true; };
  }, [selectedContest?.id]);

  const filteredContests = React.useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const filtered = contests.filter((contest) => {
      const matchesStatus = contestMatchesStatus(contest, statusFilter);
      const matchesRanking =
        rankingCriteriaFilter === "all" || contest.rankingCriteria === rankingCriteriaFilter;
      const matchesSearch =
        !term ||
        String(contest.name ?? "")
          .toLowerCase()
          .includes(term) ||
        getRankingCriteriaLabel(contest.rankingCriteria).toLowerCase().includes(term);
      const matchesDate = isDateInRange(contest.startDate, dateRange);
      return matchesStatus && matchesRanking && matchesSearch && matchesDate;
    });

    if (!sortKey) {
      return [...filtered].sort(
        (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
      );
    }

    return [...filtered].sort((a, b) => {
      if (sortKey === "name") {
        return String(a.name ?? "").localeCompare(String(b.name ?? "")) * directionFactor;
      }
      if (sortKey === "rankingCriteria") {
        return (
          getRankingCriteriaLabel(a.rankingCriteria).localeCompare(
            getRankingCriteriaLabel(b.rankingCriteria),
          ) * directionFactor
        );
      }
      if (sortKey === "maxWinners") {
        return (a.maxWinners - b.maxWinners) * directionFactor;
      }
      if (sortKey === "participants") {
        return (a.participants - b.participants) * directionFactor;
      }
      if (sortKey === "totalInvestment") {
        return (a.totalInvestment - b.totalInvestment) * directionFactor;
      }
      if (sortKey === "startDate") {
        return (
          (new Date(a.startDate).getTime() - new Date(b.startDate).getTime()) * directionFactor
        );
      }
      return (new Date(a.endDate).getTime() - new Date(b.endDate).getTime()) * directionFactor;
    });
  }, [contests, searchTerm, statusFilter, rankingCriteriaFilter, dateRange, sortKey, directionFactor]);

  const pagination = useTablePagination(filteredContests);

  React.useEffect(() => {
    pagination.resetPage();
  }, [searchTerm, statusFilter, rankingCriteriaFilter, dateRange, sortKey, sortDirection, pagination.resetPage]);

  const handleStatusFilterChange = React.useCallback((value: string) => {
    setStatusFilter(value as StatusFilterOption);
  }, []);

  const handleRankingCriteriaFilterChange = React.useCallback((value: string) => {
    setRankingCriteriaFilter(value as RankingCriteriaFilterOption);
  }, []);

  const handleEditContest = (contest: Contest) => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("gfolio-admin:edit-contest", JSON.stringify(contest));
    }
    navigate(`/contests/create?edit=true&id=${contest.id}`);
  };

  const handleViewContest = (contest: Contest) => {
    setViewingContest(contest);
  };

  const handleDeleteContest = async (contest: Contest) => {
    try {
      const response = await customFetch<DeleteContestApiResponse>(
        buildAuthApiUrl(`/contest/delete/${encodeURIComponent(contest.id)}`),
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ contestId: contest.id }),
        },
      );
      deleteContest(contest.id);
      setContests((current) => current.filter((item) => item.id !== contest.id));
      setViewingContest((current) => (current?.id === contest.id ? null : current));
      toast({
        title: "Success",
        description: response.message || "Contest deleted successfully",
      });
    } catch (err) {
      console.error(err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to delete contest",
        variant: "destructive",
      });
    }
  };

  const handleExportContests = React.useCallback(async () => {
    if (filteredContests.length === 0) return;
    await exportToExcel({
      fileName: "gfolio-contests.xlsx",
      sheetName: "Contests",
      columns: [
        { header: "Contest Name", key: "name", width: 28 },
        { header: "Status", key: "status", width: 12 },
        { header: "Ranking Criteria", key: "rankingCriteria", width: 28 },
        { header: "Max Winners", key: "maxWinners", width: 14 },
        { header: "Participants", key: "participants", width: 14 },
        // { header: "Total Investment", key: "totalInvestment", width: 18 },
        { header: "Start Date", key: "startDate", width: 16 },
        { header: "End Date", key: "endDate", width: 16 },
      ],
      rows: filteredContests.map((contest) => ({
        name: contest.name,
        status: getStatusDisplay(contest.status).label,
        rankingCriteria: getRankingCriteriaLabel(contest.rankingCriteria),
        maxWinners: contest.maxWinners,
        participants: contest.participants,
        // totalInvestment: contest.totalInvestment,
        startDate: contest.startDate ? formatDateDisplayValue(contest.startDate) : "-",
        endDate: contest.endDate ? formatDateDisplayValue(contest.endDate) : "-",
      })),
    });
  }, [filteredContests]);

  const renderActionButtons = (contest: Contest) => {
    return (
      <div className="inline-flex items-center justify-end gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={ACTION_ICON_CLASS}
              aria-label={`View ${contest.name}`}
              onClick={() => handleViewContest(contest)}
            >
              <Eye className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            className="rounded-md bg-gray-700 px-3 py-2 text-xs text-white shadow-lg"
          >
            View Contest
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={ACTION_ICON_CLASS}
              aria-label={`Edit ${contest.name}`}
              onClick={() => handleEditContest(contest)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            className="rounded-md bg-gray-700 px-3 py-2 text-xs text-white shadow-lg"
          >
            Edit Contest
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={ACTION_ICON_CLASS}
              aria-label={`Delete ${contest.name}`}
              onClick={() => void handleDeleteContest(contest)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            align="end"
            className="rounded-md bg-gray-700 px-3 py-2 text-xs text-white shadow-lg"
          >
            Delete Contest
          </TooltipContent>
        </Tooltip>
      </div>
    );
  };

  return (
    <TooltipProvider delayDuration={200}>
    <Layout title="Contest Dashboard">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-xl font-bold text-foreground">Contest Dashboard</h1>
          {/* <p className="text-sm text-muted-foreground">
            Keep a clear view of participation, performance, and the rules behind every contest.
          </p> */}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          <Button
            type="button"
            size="sm"
            className={cn(
              "shrink-0 cursor-pointer gap-2 !text-white [&_svg]:!stroke-white [&_svg]:!text-white",
            )}
            onClick={() => navigate("/contests/create")}
          >
            <Plus className="h-4 w-4 shrink-0 !stroke-white !text-white" aria-hidden />
            Create Contest
          </Button>
          <Button
            type="button"
            variant="outline"
            className="cursor-pointer gap-2"
            onClick={() => navigate("/contests/leaderboard")}
          >
            <Trophy className="h-4 w-4 shrink-0" aria-hidden />
            View Leaderboard
          </Button>
        </div>
      </div>

      <Card className="flex flex-col overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Contest List</h2>
            {/* <p className="mt-0.5 text-xs text-muted-foreground">
              All contests created and managed by you.
            </p> */}
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
              <div className="relative min-w-0 flex-1 sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search contests..."
                  className="w-full pl-10"
                  aria-label="Search contests"
                />
              </div>
              <DateRangePicker value={dateRange} onChange={setDateRange} />
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 cursor-pointer"
                      onClick={() => void handleExportContests()}
                      disabled={filteredContests.length === 0}
                      aria-label="Export contests"
                    >
                      <DownloadCloud className="h-4 w-4" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="rounded-md bg-gray-700 px-3 py-2 text-xs text-white shadow-lg">
                  Export
                </TooltipContent>
              </Tooltip>
            </div>
        </div>

        <>
            <div className="min-h-0 w-full flex-1 overflow-auto">
              <table className="w-full min-w-[1120px] text-sm text-foreground">
                <thead className="bg-muted text-sm  text-muted-foreground">
                  <tr>
                    <th className="px-6 py-4 text-left font-medium">
                      <button
                        type="button"
                        onClick={() => handleSort("name")}
                        className={`${getSortToggleClass(sortKey === "name")} `}
                      >
                        Contest Name{" "}
                        <SortDirectionIcon active={sortKey === "name"} direction={sortDirection} />
                      </button>
                    </th>
                    <th className="px-4 py-4 text-left font-medium">
                      <div className="flex items-center gap-1 ">
                        <button
                          type="button"
                          onClick={() => handleSort("rankingCriteria")}
                          className={`${getSortToggleClass(sortKey === "rankingCriteria")} `}
                        >
                          Ranking Criteria{" "}
                          <SortDirectionIcon
                            active={sortKey === "rankingCriteria"}
                            direction={sortDirection}
                          />
                        </button>
                        <TableHeaderFilter
                          title="Ranking Criteria"
                          value={rankingCriteriaFilter}
                          onChange={handleRankingCriteriaFilterChange}
                          options={[...RANKING_CRITERIA_FILTER_OPTIONS]}
                          activeWhen={(value) => value !== "all"}
                          clearValue="all"
                          scrollable
                        />
                      </div>
                    </th>
                    <th className="px-4 py-4 text-left font-medium">
                      <button
                        type="button"
                        onClick={() => handleSort("maxWinners")}
                        className={`${getSortToggleClass(sortKey === "maxWinners")} `}
                      >
                        Max Winners{" "}
                        <SortDirectionIcon
                          active={sortKey === "maxWinners"}
                          direction={sortDirection}
                        />
                      </button>
                    </th>
                    <th className="px-4 py-4 text-left font-medium">
                      <div className="flex items-center gap-1 ">
                        <span>Status</span>
                        <TableHeaderFilter
                          title="Status"
                          value={statusFilter}
                          onChange={handleStatusFilterChange}
                          options={[...STATUS_FILTER_OPTIONS]}
                          activeWhen={(value) => value !== "all"}
                          clearValue="all"
                        />
                      </div>
                    </th>
                    {/* <th className="px-4 py-4 text-left uppercase">
                      <button
                        type="button"
                        onClick={() => handleSort("participants")}
                        className={`${getSortToggleClass(sortKey === "participants")} uppercase`}
                      >
                        Participants{" "}
                        <SortDirectionIcon
                          active={sortKey === "participants"}
                          direction={sortDirection}
                        />
                      </button>
                    </th> */}
                    {/* <th className="px-4 py-4 text-left uppercase">
                      <button
                        type="button"
                        onClick={() => handleSort("totalInvestment")}
                        className={`${getSortToggleClass(sortKey === "totalInvestment")} uppercase`}
                      >
                        Total Investment{" "}
                        <SortDirectionIcon
                          active={sortKey === "totalInvestment"}
                          direction={sortDirection}
                        />
                      </button>
                    </th> */}
                    <th className="px-4 py-4 text-left font-medium">
                      <button
                        type="button"
                        onClick={() => handleSort("startDate")}
                        className={`${getSortToggleClass(sortKey === "startDate")} `}
                      >
                        Start Date{" "}
                        <SortDirectionIcon
                          active={sortKey === "startDate"}
                          direction={sortDirection}
                        />
                      </button>
                    </th>
                    <th className="px-4 py-4 text-left font-medium">
                      <button
                        type="button"
                        onClick={() => handleSort("endDate")}
                        className={`${getSortToggleClass(sortKey === "endDate")} `}
                      >
                        End Date{" "}
                        <SortDirectionIcon
                          active={sortKey === "endDate"}
                          direction={sortDirection}
                        />
                      </button>
                    </th>
                    <th className="px-4 py-4 pe-6 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingContests ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                        Loading contests...
                      </td>
                    </tr>
                  ) : contestsError ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-destructive">
                        {contestsError}
                      </td>
                    </tr>
                  ) : contests.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                        No contests found.
                      </td>
                    </tr>
                  ) : filteredContests.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                        No contests match your search or filters.
                      </td>
                    </tr>
                  ) : (
                    pagination.pagedItems.map((contest) => (
                      <tr
                        key={contest.id}
                        tabIndex={0}
                        role="row"
                        onClick={() => navigate(`/contests/${contest.id}`)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            navigate(`/contests/${contest.id}`);
                          }
                        }}
                        className="cursor-pointer border-b border-border transition-colors hover:bg-muted"
                      >
                        <td className="px-6 py-3 text-foreground">{contest.name}</td>

                        <td className="px-4 py-3 text-muted-foreground">
                          {getRankingCriteriaLabel(contest.rankingCriteria)}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {(contest.maxWinners ?? 0).toLocaleString("en-IN")}
                        </td>
                        {/* <td className="px-4 py-3 tabular-nums">
                          {contest.participants.toLocaleString("en-IN")}
                        </td> */}
                        {/* <td className="px-4 py-3 tabular-nums">
                          {formatCurrency(contest.totalInvestment)}
                        </td> */}
                        <td className="px-4 py-3">
                          {(() => {
                            const statusConfig = getStatusDisplay(contest.status);
                            return (
                              <Badge className={cn(statusConfig.className)}>
                                {statusConfig.label}
                              </Badge>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                          {contest.startDate ? formatDateDisplayValue(contest.startDate) : "—"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                          {contest.endDate ? formatDateDisplayValue(contest.endDate) : "—"}
                        </td>
                        <td
                          className="px-4 py-3 pe-6 text-right whitespace-nowrap"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {renderActionButtons(contest)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <TablePaginationFooter
              {...bindTablePaginationFooter(pagination)}
              itemLabel="contests"
            />
          </>
      </Card>

      <Dialog
        open={viewingContest !== null}
        onOpenChange={(open) => !open && setViewingContest(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewingContest?.name}</DialogTitle>
            <DialogDescription>Contest details</DialogDescription>
          </DialogHeader>
          {viewingContest ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                {(() => {
                  const statusConfig = getStatusDisplay(viewingContest.status);
                  return (
                    <Badge className={cn(statusConfig.className)}>
                      {statusConfig.label}
                    </Badge>
                  );
                })()}
                {viewingContest.paused ? (
                  <span className="text-xs font-medium text-muted-foreground">Paused</span>
                ) : null}
              </div>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Description
                  </p>
                  <p className="mt-1 text-foreground">{viewingContest.description || "-"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Ranking Criteria
                  </p>
                  <p className="mt-1 font-medium text-foreground">
                    {getRankingCriteriaLabel(viewingContest.rankingCriteria)}
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Start Date
                    </p>
                    <p className="mt-1 font-medium text-foreground">
                      {viewingContest.startDate ? formatDateDisplayValue(viewingContest.startDate) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      End Date
                    </p>
                    <p className="mt-1 font-medium text-foreground">
                      {viewingContest.endDate ? formatDateDisplayValue(viewingContest.endDate) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Max Winners
                    </p>
                    <p className="mt-1 font-medium text-foreground">{viewingContest.maxWinners}</p>
                  </div>
                  <div>
                    {/* <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Total Investment
                    </p> */}
                    {/* <p className="mt-1 font-medium text-foreground">
                      {formatCurrency(viewingContest.totalInvestment)}
                    </p> */}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </Layout>
    </TooltipProvider>
  );
}
