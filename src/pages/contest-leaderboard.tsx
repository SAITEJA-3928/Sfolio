import * as React from "react";
import { Layout } from "@/components/layout";
import { Badge, Button, Card, Input } from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  DownloadCloud,
  Gift,
  Medal,
  Search,
  Trophy,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { buildAuthApiUrl } from "@/lib/api-config";
import { customFetch } from "@/lib/custom-fetch";
import {
  type Contest,
  type ContestStatus,
  mapContestFromApi,
} from "@/lib/contest-store";
import { exportToExcel } from "@/lib/export-to-excel";
import { useBuyMetal, useListUsers } from "@/lib/api-client-react";
import { formatAmount } from "@/utils/formatAmount";
import { TablePaginationFooter } from "@/components/table-pagination-footer";
import { bindTablePaginationFooter, useTablePagination } from "@/lib/table-pagination";
import { getSortToggleClass, SortDirectionIcon, useTableSort } from "@/lib/table-sort";

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

type LeaderboardEntry = {
  _id: string;
  userId?: {
    _id?: string;
    name?: string;
    phone?: string;
    email?: string;
  };
  activityCount?: number;
  goalCount?: number;
  isWinner?: boolean;
  referralCount?: number;
  lastActivityAt?: string;
  createdAt?: string;
  updatedAt?: string;
  rank?: number;
  score?: number;
  sipCount?: number;
  totalPurchaseAmount?: number;
  transactionCount?: number;
};

type LeaderboardApiResponse = {
  message?: string;
  data?: {
    leaderboard?: LeaderboardEntry[];
  };
};

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asOptionalFiniteNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeLeaderboardUser(
  value: unknown,
): NonNullable<LeaderboardEntry["userId"]> | undefined {
  if (value == null) return undefined;

  if (typeof value === "string") {
    const id = value.trim();
    return id ? { _id: id } : undefined;
  }

  if (typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;
  const id = asOptionalString(record._id) ?? asOptionalString(record.id);
  const name = asOptionalString(record.name);
  const email = asOptionalString(record.email);
  const phone = asOptionalString(record.phone);

  if (!id && !name && !email && !phone) return undefined;

  return { _id: id, name, email, phone };
}

function normalizeLeaderboardEntry(value: unknown, index: number): LeaderboardEntry | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const userId = normalizeLeaderboardUser(record.userId);
  const id =
    asOptionalString(record._id) ??
    asOptionalString(record.id) ??
    userId?._id ??
    `leaderboard-${index}`;

  return {
    _id: id,
    userId,
    activityCount: asOptionalFiniteNumber(record.activityCount),
    goalCount: asOptionalFiniteNumber(record.goalCount),
    isWinner: record.isWinner === true,
    referralCount: asOptionalFiniteNumber(record.referralCount),
    lastActivityAt: asOptionalString(record.lastActivityAt),
    createdAt: asOptionalString(record.createdAt),
    updatedAt: asOptionalString(record.updatedAt),
    rank: asOptionalFiniteNumber(record.rank),
    score: asOptionalFiniteNumber(record.score),
    sipCount: asOptionalFiniteNumber(record.sipCount),
    totalPurchaseAmount: asOptionalFiniteNumber(record.totalPurchaseAmount),
    transactionCount: asOptionalFiniteNumber(record.transactionCount),
  };
}

function normalizeLeaderboardEntries(payload: unknown): LeaderboardEntry[] {
  let list: unknown[] = [];

  if (Array.isArray(payload)) {
    list = payload;
  } else if (payload && typeof payload === "object") {
    const raw = payload as Record<string, unknown>;
    if (Array.isArray(raw.data)) {
      list = raw.data;
    } else if (raw.data && typeof raw.data === "object") {
      const dataObj = raw.data as Record<string, unknown>;
      if (Array.isArray(dataObj.leaderboard)) {
        list = dataObj.leaderboard;
      } else if (Array.isArray(dataObj.data)) {
        list = dataObj.data;
      }
    } else if (Array.isArray(raw.leaderboard)) {
      list = raw.leaderboard;
    }
  }

  return list
    .map((item, index) => normalizeLeaderboardEntry(item, index))
    .filter((entry): entry is LeaderboardEntry => entry !== null);
}

type AdminUser = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
};

function mapAdminUsersFromApiResponse(payload: unknown): AdminUser[] {
  const raw = payload as
    | AdminUser[]
    | {
        data?: AdminUser[] | { users?: AdminUser[]; data?: AdminUser[] };
        users?: AdminUser[];
      }
    | undefined;

  let users: unknown[] = [];

  if (Array.isArray(raw)) {
    users = raw;
  } else if (raw && typeof raw === "object") {
    if (Array.isArray(raw.users)) {
      users = raw.users;
    } else if (Array.isArray(raw.data)) {
      users = raw.data;
    } else if (raw.data && typeof raw.data === "object") {
      if (Array.isArray(raw.data.users)) {
        users = raw.data.users;
      } else if (Array.isArray(raw.data.data)) {
        users = raw.data.data;
      }
    }
  }

  return users
    .map((item): AdminUser | null => {
      if (!item || typeof item !== "object") return null;

      const user = item as Record<string, unknown>;
      const id = String(user.id ?? user._id ?? "");

      if (!id) return null;

      return {
        id,
        name: typeof user.name === "string" ? user.name : undefined,
        email: typeof user.email === "string" ? user.email : undefined,
        phone: typeof user.phone === "string" ? user.phone : undefined,
      };
    })
    .filter((user): user is AdminUser => user !== null);
}

function formatCurrencyAmount(value?: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

function formatActivityDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function RankCell({ rank }: { rank?: number }) {
  if (rank === 1) return <Medal className="h-5 w-5 fill-amber-400 text-amber-500" aria-label="Rank 1" />;
  if (rank === 2) return <Medal className="h-5 w-5 fill-slate-300 text-slate-400" aria-label="Rank 2" />;
  if (rank === 3) return <Medal className="h-5 w-5 fill-orange-400 text-orange-600" aria-label="Rank 3" />;
  return <span className="font-semibold tabular-nums text-foreground">{rank ?? "—"}</span>;
}

function LeaderboardUserCell({
  entry,
  onOpenUser,
}: {
  entry: LeaderboardEntry;
  onOpenUser: (userId: string) => void;
}) {
  const displayName = String(entry.userId?.name ?? "Unknown user");
  const userId = entry.userId?._id;
  const email = entry.userId?.email ? String(entry.userId.email) : undefined;

  return (
    <td className="px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 font-bold text-primary">
          {String(displayName).charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            {userId ? (
              <button
                type="button"
                className="cursor-pointer truncate font-semibold text-muted-foreground transition-colors hover:text-primary"
                onClick={() => onOpenUser(userId)}
              >
                {displayName}
              </button>
            ) : (
              <p className="truncate font-semibold text-muted-foreground">{displayName}</p>
            )}
            {entry.isWinner ? (
              <Badge className="shrink-0 bg-primary/10 text-primary">Winner</Badge>
            ) : null}
          </div>
          {email ? (
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          ) : null}
        </div>
      </div>
    </td>
  );
}

type LeaderboardSortKey =
  | "rank"
  | "participant"
  | "phone"
  | "purchaseAmount"
  | "referralCount"
  | "transactions"
  | "lastActivity";

function ContestSelector({
  contests,
  selected,
  onSelect,
  isLoading,
}: {
  contests: Contest[];
  selected: Contest | null;
  onSelect: (contest: Contest) => void;
  isLoading?: boolean;
}) {
  const statusConfig = selected ? getStatusDisplay(selected.status) : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={isLoading || contests.length === 0}
          className="flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-border bg-background px-4 text-xs shadow-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          aria-label={
            selected
              ? `Switch contest (currently ${selected.name})`
              : "Select contest"
          }
        >
          <Trophy className="h-4 w-4 shrink-0 text-primary" />
          <span className="max-w-[10rem] truncate text-sm font-semibold text-foreground">
            {isLoading
              ? "Loading contests..."
              : selected?.name ?? (contests.length === 0 ? "No contests" : "Select contest")}
          </span>
          {statusConfig ? (
            <Badge className={cn("shrink-0", statusConfig.className)}>{statusConfig.label}</Badge>
          ) : null}
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[22.5rem] min-w-[14rem] overflow-y-auto">
        {contests.length === 0 ? (
          <DropdownMenuItem disabled className="text-muted-foreground">
            No contests available
          </DropdownMenuItem>
        ) : (
          contests.map((contest) => {
            const config = getStatusDisplay(contest.status);
            return (
              <DropdownMenuItem
                key={contest.id}
                className="cursor-pointer gap-2"
                onSelect={() => onSelect(contest)}
              >
                <Trophy className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate">{contest.name}</span>
                <Badge className={cn("shrink-0", config.className)}>{config.label}</Badge>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type RewardRow = {
  id: string;
  userId: string;
  amount: string;
};

function createRewardRow(userId = "", amount = ""): RewardRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    amount,
  };
}

export default function ViewLeaderboard() {
  const [, navigate] = useLocation();
  const [contests, setContests] = React.useState<Contest[]>([]);
  const [selectedContest, setSelectedContest] = React.useState<Contest | null>(null);
  const [isLoadingContests, setIsLoadingContests] = React.useState(true);
  const [contestsError, setContestsError] = React.useState<string | null>(null);
  const [leaderboard, setLeaderboard] = React.useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [rewardOpen, setRewardOpen] = React.useState(false);
  const { sortKey, sortDirection, directionFactor, handleSort } =
    useTableSort<LeaderboardSortKey>();
  const [rewardUserSearch, setRewardUserSearch] = React.useState("");
  const [rewardRows, setRewardRows] = React.useState<RewardRow[]>(() => [createRewardRow()]);
  const [activeRewardRowId, setActiveRewardRowId] = React.useState<string>("");
  const [rewardUserPickerRowId, setRewardUserPickerRowId] = React.useState<string | null>(null);
  const [rewardMetalType, setRewardMetalType] = React.useState<"GOLD" | "SILVER">("GOLD");
  const { mutateAsync: buyMetal, isPending: isRewarding } = useBuyMetal();
  const { data: adminUsersData, isLoading: isLoadingAdminUsers } = useListUsers({
    page: 1,
    limit: 1000,
  });

  const isReferralContest = selectedContest?.rankingCriteria === "MAXIMUM_REFERRAL_COUNT";

  const adminUsers = React.useMemo(
    () => mapAdminUsersFromApiResponse(adminUsersData),
    [adminUsersData],
  );

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
        setSelectedContest((current) => {
          if (current && mapped.some((contest) => contest.id === current.id)) {
            return mapped.find((contest) => contest.id === current.id) ?? mapped[0] ?? null;
          }
          return mapped[0] ?? null;
        });
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to fetch contests", error);
        setContests([]);
        setSelectedContest(null);
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
    if (!selectedContest?.id) {
      setLeaderboard([]);
      setIsLoading(false);
      setLoadError(null);
      return;
    }

    const loadLeaderboard = async () => {
      setIsLoading(true);
      setLoadError(null);
      try {
        const response = await customFetch<LeaderboardApiResponse>(
          buildAuthApiUrl(
            `/contest/admin/${encodeURIComponent(selectedContest.id)}/leaderboard`,
          ),
          { method: "GET" },
        );

        setLeaderboard(normalizeLeaderboardEntries(response));
      } catch (error) {
        console.error(error);
        setLeaderboard([]);
        setLoadError(error instanceof Error ? error.message : "Failed to load leaderboard");
      } finally {
        setIsLoading(false);
      }
    };

    void loadLeaderboard();
  }, [selectedContest?.id]);

  const filteredLeaderboard = React.useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return leaderboard;

    return leaderboard.filter((entry) => {
      const name = String(entry.userId?.name ?? "").toLowerCase();
      const email = String(entry.userId?.email ?? "").toLowerCase();
      const phone = String(entry.userId?.phone ?? "").toLowerCase();
      return name.includes(query) || email.includes(query) || phone.includes(query);
    });
  }, [leaderboard, searchTerm]);

  const sortedLeaderboard = React.useMemo(() => {
    if (!sortKey) return filteredLeaderboard;

    return [...filteredLeaderboard].sort((a, b) => {
      if (sortKey === "rank") {
        return (
          ((a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER)) *
          directionFactor
        );
      }
      if (sortKey === "participant") {
        return (
          String(a.userId?.name ?? "").localeCompare(String(b.userId?.name ?? ""), undefined, {
            sensitivity: "base",
          }) * directionFactor
        );
      }
      if (sortKey === "phone") {
        return (
          String(a.userId?.phone ?? "").localeCompare(String(b.userId?.phone ?? ""), undefined, {
            sensitivity: "base",
          }) * directionFactor
        );
      }
      if (sortKey === "purchaseAmount") {
        return ((a.totalPurchaseAmount ?? 0) - (b.totalPurchaseAmount ?? 0)) * directionFactor;
      }
      if (sortKey === "referralCount") {
        return ((a.referralCount ?? 0) - (b.referralCount ?? 0)) * directionFactor;
      }
      if (sortKey === "transactions") {
        return ((a.transactionCount ?? 0) - (b.transactionCount ?? 0)) * directionFactor;
      }
      const aTime = new Date(a.lastActivityAt ?? a.updatedAt ?? a.createdAt ?? 0).getTime();
      const bTime = new Date(b.lastActivityAt ?? b.updatedAt ?? b.createdAt ?? 0).getTime();
      return (aTime - bTime) * directionFactor;
    });
  }, [directionFactor, filteredLeaderboard, sortKey]);

  const pagination = useTablePagination(sortedLeaderboard);
  const tableColumnCount = isReferralContest ? 7 : 6;

  React.useEffect(() => {
    pagination.resetPage();
  }, [pagination.resetPage, searchTerm, sortKey, sortDirection, selectedContest?.id]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
  };

  const handleExport = React.useCallback(async () => {
    if (sortedLeaderboard.length === 0 || !selectedContest) return;
    await exportToExcel({
      fileName: `leaderboard-${String(selectedContest.name ?? "contest").replace(/\s+/g, "-").toLowerCase()}.xlsx`,
      sheetName: "Leaderboard",
      columns: [
        { header: "Rank", key: "rank", width: 8 },
        { header: "Participant", key: "participant", width: 24 },
        { header: "Email", key: "email", width: 30 },
        { header: "Phone", key: "phone", width: 16 },
        { header: "Purchase Amount", key: "purchaseAmount", width: 16 },
        { header: "Referral Count", key: "referralCount", width: 16 },
        { header: "Transactions", key: "transactions", width: 12 },
        { header: "Last Activity", key: "lastActivity", width: 20 },
      ],
      rows: sortedLeaderboard.map((entry) => ({
        rank: entry.rank ?? "",
        participant: entry.userId?.name ?? "Unknown user",
        email: entry.userId?.email ?? "",
        phone: entry.userId?.phone ?? "",
        purchaseAmount: entry.totalPurchaseAmount ?? 0,
        referralCount: entry.referralCount ?? 0,
        transactions: entry.transactionCount ?? 0,
        lastActivity: formatActivityDate(entry.lastActivityAt),
      })),
    });
  }, [selectedContest, sortedLeaderboard]);

  const adminUsersById = React.useMemo(
    () => new Map(adminUsers.map((user) => [user.id, user])),
    [adminUsers],
  );

  const resetRewardForm = React.useCallback(() => {
    const firstRow = createRewardRow();
    setRewardRows([firstRow]);
    setActiveRewardRowId(firstRow.id);
    setRewardUserPickerRowId(null);
    setRewardUserSearch("");
    setRewardMetalType("GOLD");
  }, []);

  const handleRewardOpenChange = (open: boolean) => {
    if (!open && isRewarding) return;
    setRewardOpen(open);
    if (open) {
      setRewardUserSearch("");
      setRewardUserPickerRowId(null);
      const firstRow = rewardRows[0] ?? createRewardRow();
      if (!rewardRows.length) {
        setRewardRows([firstRow]);
      }
      setActiveRewardRowId(firstRow.id);
      return;
    }
    resetRewardForm();
  };

  const updateRewardRow = (rowId: string, patch: Partial<Omit<RewardRow, "id">>) => {
    setRewardRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
    );
  };

  const handleAddRewardRow = () => {
    const nextRow = createRewardRow();
    setRewardRows((prev) => [...prev, nextRow]);
    setActiveRewardRowId(nextRow.id);
    setRewardUserPickerRowId(null);
    setRewardUserSearch("");
  };

  const handleAssignRewardUser = (rowId: string, userId: string) => {
    updateRewardRow(rowId, { userId });
    setActiveRewardRowId(rowId);
    setRewardUserPickerRowId(null);
    setRewardUserSearch("");
  };

  const getRewardUserLabel = (userId: string) => {
    const user = adminUsersById.get(userId);
    if (!user) return "";
    return user.name || user.email || user.phone || user.id;
  };

  const openRewardUserPicker = (rowId: string) => {
    setActiveRewardRowId(rowId);
    setRewardUserPickerRowId(rowId);
    setRewardUserSearch("");
  };

  React.useEffect(() => {
    if (!rewardUserPickerRowId) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(`[data-reward-user-picker="${rewardUserPickerRowId}"]`)) {
        return;
      }
      setRewardUserPickerRowId(null);
      setRewardUserSearch("");
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [rewardUserPickerRowId]);

  const handleRemoveRewardRow = (rowId: string) => {
    setRewardRows((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((row) => row.id !== rowId);
      if (activeRewardRowId === rowId) {
        setActiveRewardRowId(next[0]?.id ?? "");
      }
      return next;
    });
    if (rewardUserPickerRowId === rowId) {
      setRewardUserPickerRowId(null);
      setRewardUserSearch("");
    }
  };

  const filteredRewardUsers = React.useMemo(() => {
    const query = rewardUserSearch.trim().toLowerCase();

    if (!query) {
      return adminUsers;
    }

    return adminUsers.filter((user) => {
      const name = String(user.name ?? "").toLowerCase();
      const email = String(user.email ?? "").toLowerCase();
      const phone = String(user.phone ?? "").toLowerCase();

      return (
        name.includes(query) ||
        email.includes(query) ||
        phone.includes(query)
      );
    });
  }, [adminUsers, rewardUserSearch]);

  const handleSubmitReward = async () => {
    if (!selectedContest?.id) {
      toast({
        title: "Missing contest",
        description: "Select a contest before rewarding participants.",
        variant: "destructive",
      });
      return;
    }

    const preparedRows = rewardRows.map((row) => ({
      ...row,
      amountValue: Number(String(row.amount ?? "").replace(/,/g, "")),
    }));

    const invalidRow = preparedRows.find(
      (row) => !row.userId || !Number.isFinite(row.amountValue) || row.amountValue <= 0,
    );
    if (invalidRow) {
      toast({
        title: "Invalid reward details",
        description: "Select a participant and enter a valid amount for each row.",
        variant: "destructive",
      });
      return;
    }

    try {
      for (const row of preparedRows) {
        await buyMetal({
          payload: {
            user: row.userId,
            amount: row.amountValue,
            metalType: rewardMetalType,
            isReward: true,
            contestId: selectedContest.id,
          },
        });
      }

      toast({
        title: "Success",
        description:
          preparedRows.length === 1
            ? "Contest reward purchased successfully."
            : `${preparedRows.length} contest rewards purchased successfully.`,
      });
      handleRewardOpenChange(false);
    } catch (error) {
      toast({
        title: "Reward failed",
        description: error instanceof Error ? error.message : "Failed to purchase contest reward.",
        variant: "destructive",
      });
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
    <Layout title="View Leaderboard">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <button
            type="button"
            onClick={() => navigate("/contests")}
            className="mb-4 inline-flex cursor-pointer items-center text-sm font-medium text-primary hover:underline"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Contest Dashboard
          </button>
          <h1 className="text-xl font-bold text-foreground">View Leaderboard</h1>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="default"
            className="shrink-0 cursor-pointer gap-2 !text-white [&_svg]:!stroke-white [&_svg]:!text-white"
            onClick={() => handleRewardOpenChange(true)}
            disabled={!selectedContest}
          >
            <Gift className="h-4 w-4 shrink-0 !stroke-white !text-white" aria-hidden />
            Reward
          </Button>
          <ContestSelector
            contests={contests}
            selected={selectedContest}
            onSelect={setSelectedContest}
            isLoading={isLoadingContests}
          />
        </div>
      </div>

      <Card className="flex flex-col overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Leaderboard</h2>
          </div>
          <div className="flex w-full flex-wrap items-center justify-end gap-2 lg:w-auto">
            <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) => handleSearchChange(event.target.value)}
                placeholder="Search participant..."
                className="w-full pl-10"
                aria-label="Search participants"
              />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 cursor-pointer"
                    onClick={() => void handleExport()}
                    disabled={sortedLeaderboard.length === 0}
                    aria-label="Export leaderboard"
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
            <table className="w-full min-w-[900px] text-sm text-foreground">
              <thead className="bg-muted text-sm  text-muted-foreground">
                <tr>
                  <th className="px-6 py-4 text-left font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort("rank")}
                      className={`${getSortToggleClass(sortKey === "rank")} `}
                    >
                      Rank{" "}
                      <SortDirectionIcon active={sortKey === "rank"} direction={sortDirection} />
                    </button>
                  </th>
                  <th className="px-4 py-4 text-left font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort("participant")}
                      className={`${getSortToggleClass(sortKey === "participant")} `}
                    >
                      Participant{" "}
                      <SortDirectionIcon
                        active={sortKey === "participant"}
                        direction={sortDirection}
                      />
                    </button>
                  </th>
                  <th className="px-4 py-4 text-left font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort("phone")}
                      className={`${getSortToggleClass(sortKey === "phone")} `}
                    >
                      Phone{" "}
                      <SortDirectionIcon active={sortKey === "phone"} direction={sortDirection} />
                    </button>
                  </th>
                  <th className="px-4 py-4 text-left font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort("purchaseAmount")}
                      className={`${getSortToggleClass(sortKey === "purchaseAmount")} `}
                    >
                      Purchase Amount{" "}
                      <SortDirectionIcon
                        active={sortKey === "purchaseAmount"}
                        direction={sortDirection}
                      />
                    </button>
                  </th>
                  {isReferralContest ? (
                    <th className="px-4 py-4 text-left font-medium">
                      <button
                        type="button"
                        onClick={() => handleSort("referralCount")}
                        className={`${getSortToggleClass(sortKey === "referralCount")} `}
                      >
                        Referral Count{" "}
                        <SortDirectionIcon
                          active={sortKey === "referralCount"}
                          direction={sortDirection}
                        />
                      </button>
                    </th>
                  ) : null}
                  <th className="px-4 py-4 text-left font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort("transactions")}
                      className={`${getSortToggleClass(sortKey === "transactions")} `}
                    >
                      Transactions{" "}
                      <SortDirectionIcon
                        active={sortKey === "transactions"}
                        direction={sortDirection}
                      />
                    </button>
                  </th>
                  <th className="px-4 py-4 pe-6 text-left font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort("lastActivity")}
                      className={`${getSortToggleClass(sortKey === "lastActivity")} `}
                    >
                      Last Activity{" "}
                      <SortDirectionIcon
                        active={sortKey === "lastActivity"}
                        direction={sortDirection}
                      />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoadingContests ? (
                  <tr>
                    <td colSpan={tableColumnCount} className="px-4 py-10 text-center text-muted-foreground">
                      Loading contests...
                    </td>
                  </tr>
                ) : contestsError ? (
                  <tr>
                    <td colSpan={tableColumnCount} className="px-4 py-10 text-center text-destructive">
                      {contestsError}
                    </td>
                  </tr>
                ) : !selectedContest ? (
                  <tr>
                    <td colSpan={tableColumnCount} className="px-4 py-10 text-center text-muted-foreground">
                      No contests available.
                    </td>
                  </tr>
                ) : isLoading ? (
                  <tr>
                    <td colSpan={tableColumnCount} className="px-4 py-10 text-center text-muted-foreground">
                      Loading leaderboard...
                    </td>
                  </tr>
                ) : loadError ? (
                  <tr>
                    <td colSpan={tableColumnCount} className="px-4 py-10 text-center text-destructive">
                      {loadError}
                    </td>
                  </tr>
                ) : leaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={tableColumnCount} className="px-4 py-10 text-center text-muted-foreground">
                      No leaderboard entries.
                    </td>
                  </tr>
                ) : sortedLeaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={tableColumnCount} className="px-4 py-10 text-center text-muted-foreground">
                      No participants match your search.
                    </td>
                  </tr>
                ) : (
                  pagination.pagedItems.map((entry) => (
                    <tr
                      key={entry._id || `${entry.rank ?? "x"}-${entry.userId?._id ?? entry.userId?.phone ?? "row"}`}
                      className="border-b border-border transition-colors hover:bg-muted"
                    >
                      <td className="px-6 py-3">
                        <RankCell rank={entry.rank} />
                      </td>
                      <LeaderboardUserCell
                        entry={entry}
                        onOpenUser={(userId) =>
                          navigate(`/users/${encodeURIComponent(userId)}?from=contest-leaderboard`)
                        }
                      />
                      <td className="px-4 py-3 text-muted-foreground">
                        {entry.userId?.phone ?? "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-foreground">
                        {formatCurrencyAmount(entry.totalPurchaseAmount)}
                      </td>
                      {isReferralContest ? (
                        <td className="px-4 py-3 tabular-nums text-foreground">
                          {entry.referralCount ?? 0}
                        </td>
                      ) : null}
                      <td className="px-4 py-3 tabular-nums text-foreground">
                        {entry.transactionCount ?? 0}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 pe-6 text-muted-foreground">
                        {formatActivityDate(entry.lastActivityAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <TablePaginationFooter
            {...bindTablePaginationFooter(pagination)}
            itemLabel="participants"
          />
        </>
      </Card>

      <Dialog open={rewardOpen} onOpenChange={handleRewardOpenChange}>
        <DialogContent  className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-2xl"
          closeDisabled={isRewarding}
          onEscapeKeyDown={(event) => {
            if (isRewarding) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (isRewarding) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Reward Participants</DialogTitle>
            <DialogDescription>
              Search and select users, enter amounts, and purchase rewards for{" "}
              {selectedContest?.name ?? "this contest"}.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Metal Type</label>
              <Select
                value={rewardMetalType}
                onValueChange={(value) => setRewardMetalType(value as "GOLD" | "SILVER")}
              >
                <SelectTrigger className="h-11 w-full rounded-xl border-border bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GOLD">Gold</SelectItem>
                  <SelectItem value="SILVER">Silver</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              {rewardRows.map((row) => {
                const selectedUser = row.userId ? adminUsersById.get(row.userId) : undefined;
                const isActiveRow = activeRewardRowId === row.id;
                const isUserPickerOpen = rewardUserPickerRowId === row.id;
                const selectedUserLabel = getRewardUserLabel(row.userId);

                return (
                  <div
                    key={row.id}
                    className={cn(
                      "rounded-xl border p-4 transition-colors",
                      isActiveRow ? "border-primary/40 bg-primary/5" : "border-border",
                    )}
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        className="cursor-pointer text-left text-sm font-medium text-foreground"
                        onClick={() => setActiveRewardRowId(row.id)}
                      >
                        Reward
                      </button>
                      {rewardRows.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 cursor-pointer text-destructive hover:text-destructive"
                          onClick={() => handleRemoveRewardRow(row.id)}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div
                        className="space-y-2"
                        data-reward-user-picker={row.id}
                      >
                        <label className="text-sm font-medium text-foreground">Selected User</label>
                        <Input
                          value={isUserPickerOpen ? rewardUserSearch : selectedUserLabel}
                          onChange={(event) => {
                            setActiveRewardRowId(row.id);
                            setRewardUserPickerRowId(row.id);
                            setRewardUserSearch(event.target.value);
                          }}
                          onFocus={() => openRewardUserPicker(row.id)}
                placeholder="Search by name, email or phone..."
    className="h-11 rounded-xl"
               disabled={isLoadingAdminUsers}
                          autoComplete="off"
     />
                        {isUserPickerOpen ? (
              <div className="max-h-60 space-y-1.5 overflow-y-auto rounded-xl border border-border bg-background p-2 shadow-sm">
                            {isLoadingAdminUsers ? (
                              <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                                Loading users...
                              </p>
                            ) : filteredRewardUsers.length === 0 ? (
                              <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                                No users found
                              </p>
                            ) : (
                              filteredRewardUsers.map((user) => {
                                const isSelected = row.userId === user.id;

                                return (
                                  <button
                                    key={user.id}
                                    type="button"
                                    onClick={() => handleAssignRewardUser(row.id, user.id)}
                                    className={cn(
                                      "w-full cursor-pointer rounded-lg border px-3 py-2.5 text-left transition-colors",
                                      isSelected
                                        ? "border-primary/40 bg-primary/5"
                                        : "border-transparent hover:bg-muted",
                                    )}
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-foreground">
                                          {user.name || user.email || user.phone || user.id}
                                        </p>
                                        <div className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
                                          {user.email ? (
                                            <p className="truncate">{user.email}</p>
                                          ) : null}
                                          {user.phone ? (
                                            <p className="truncate">{user.phone}</p>
                                          ) : null}
                                        </div>
                                      </div>
                                      {isSelected ? (
                                        <Check className="h-4 w-4 shrink-0 text-primary" />
                                      ) : null}
                                    </div>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        ) : null}
                        {selectedUser && !isUserPickerOpen ? (
                          <div className="space-y-0.5 text-xs text-muted-foreground">
                            {selectedUser.email ? <p className="truncate">{selectedUser.email}</p> : null}
                            {selectedUser.phone ? <p className="truncate">{selectedUser.phone}</p> : null}
                          </div>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Amount</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                            ₹
                          </span>
                          <Input
                            type="text"
                            inputMode="numeric"
                            placeholder="Enter amount"
                            value={formatAmount(row.amount)}
                            className="h-11 pl-8"
                            onChange={(event) =>
                              updateRewardRow(row.id, { amount: formatAmount(event.target.value) })
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter className="gap-2 border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer"
              onClick={() => handleRewardOpenChange(false)}
              disabled={isRewarding}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="cursor-pointer"
              onClick={() => void handleSubmitReward()}
              disabled={isRewarding || isLoadingAdminUsers || adminUsers.length === 0}
            >
              {isRewarding ? "Buying..." : "Buy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
    </TooltipProvider>
  );
}
