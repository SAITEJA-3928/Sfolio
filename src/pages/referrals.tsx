import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Badge, Button, Card, Input } from "@/components/ui";
import { Checkbox } from "@/components/ui/checkbox";
import { TooltipProvider } from "@/components/ui/tooltip";
import SelectionFeedback from "@/components/ui/SelectionFeedback";
import { getSelectionRowClass, triggerSelectionFeedback } from "@/lib/selection-feedback";
import { TablePaginationFooter } from "@/components/table-pagination-footer";
import { getSortToggleClass, SortDirectionIcon, useTableSort } from "@/lib/table-sort";
import { DEFAULT_TABLE_PAGE_SIZE } from "@/lib/table-pagination";
import { cn, formatCurrency } from "@/lib/utils";
import { customFetch } from "@/lib/custom-fetch";
import { buildAuthApiUrl } from "@/lib/api-config";
import { exportToExcel } from "@/lib/export-to-excel";
import {
  createPersistedDateRangeKey,
  createPersistedSearchTermKey,
  usePersistedDateRange,
  usePersistedSearchTerm,
} from "@/lib/persisted-page-filters";

type ReferralPerson = {
  id?: string;
  name?: string;
  phone?: string;
  email?: string;
};

type ReceiverReward = {
  credited?: boolean;
  rewardType?: string;
  rewardAmount?: number;
  rewardStatus?: string;
  rewardedAt?: string | null;
};

type ReferralReceiver = {
  id: string;
  name?: string;
  phone?: string;
  email?: string;
  createdAt?: string | null;
  currentStatus?: string;
  reward?: ReceiverReward;
};

type ReferralGroup = {
  referralCode: string;
  sender?: ReferralPerson;
  totalReferrals: number;
  totalRewardAmount: number;
  receivers: ReferralReceiver[];
};

type ReferralSortKey = "referrer" | "referralCode" | "receivers" | "totalReward";

const ADMIN_REFERRAL_DASHBOARD_ENDPOINT = buildAuthApiUrl("/referral/admin/dashboard");
const REFERRALS_SEARCH_DEBOUNCE_MS = 100;
const REFERRALS_EXPORT_FETCH_LIMIT = 100;
const REFERRALS_EXPORT_MAX_PAGES = 2000;

function normalizeSearchValue(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function unwrapData(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return "data" in record ? record.data : value;
}

function asNumber(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizePerson(value: unknown): ReferralPerson | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return {
    id: asOptionalString(record._id) ?? asOptionalString(record.id),
    name: asOptionalString(record.name),
    phone: asOptionalString(record.phone),
    email: asOptionalString(record.email),
  };
}

function normalizeReward(value: unknown): ReceiverReward | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return {
    credited: typeof record.credited === "boolean" ? record.credited : undefined,
    rewardType: asOptionalString(record.rewardType),
    rewardAmount: asNumber(record.rewardAmount),
    rewardStatus: asOptionalString(record.rewardStatus),
    rewardedAt:
      typeof record.rewardedAt === "string" || record.rewardedAt === null
        ? (record.rewardedAt as string | null)
        : undefined,
  };
}

function normalizeReceiver(value: unknown, index: number): ReferralReceiver | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id =
    asOptionalString(record._id) ??
    asOptionalString(record.id) ??
    `receiver-${index}`;

  return {
    id,
    name: asOptionalString(record.name),
    phone: asOptionalString(record.phone),
    email: asOptionalString(record.email),
    createdAt:
      typeof record.createdAt === "string" || record.createdAt === null
        ? (record.createdAt as string | null)
        : undefined,
    currentStatus: asOptionalString(record.currentStatus),
    reward: normalizeReward(record.reward),
  };
}

function extractReferralGroups(data: unknown): ReferralGroup[] {
  const payload = unwrapData(data);
  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  const referrals = Array.isArray(record.referrals)
    ? record.referrals
    : Array.isArray(payload)
      ? payload
      : [];

  return referrals
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const referral = item as Record<string, unknown>;
      const referralCode = asOptionalString(referral.referralCode);
      if (!referralCode) return null;

      const receivers = Array.isArray(referral.receivers)
        ? referral.receivers
          .map(normalizeReceiver)
          .filter((receiver): receiver is ReferralReceiver => receiver !== null)
        : [];

      return {
        referralCode,
        sender: normalizePerson(referral.sender),
        totalReferrals: asNumber(referral.totalReferrals),
        totalRewardAmount: asNumber(referral.totalRewardAmount),
        receivers,
      } satisfies ReferralGroup;
    })
    .filter((item): item is ReferralGroup => item !== null)
}

type AdminReferralFetchFilters = {
  search?: string;
  fromDate?: string;
  toDate?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
};

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = React.useState(value);

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [value, delayMs]);

  return debouncedValue;
}

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function fetchAdminReferralDashboardPage(
  page: number,
  limit: number,
  filters: AdminReferralFetchFilters = {},
) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  const trimmedSearch = filters.search?.trim();
  if (trimmedSearch) {
    params.set("search", trimmedSearch);
  }
  if (filters.fromDate) {
    params.set("fromDate", filters.fromDate);
  }
  if (filters.toDate) {
    params.set("toDate", filters.toDate);
  }
  if (filters.sortBy) {
    params.set("sortBy", filters.sortBy);
  }
  if (filters.sortOrder) {
    params.set("sortOrder", filters.sortOrder);
  }
  return customFetch<unknown>(
    `${ADMIN_REFERRAL_DASHBOARD_ENDPOINT}?${params.toString()}`,
    { method: "GET" },
  );
}

async function fetchAllMatchingReferralGroups(filters: AdminReferralFetchFilters = {}) {
  const firstResponse = await fetchAdminReferralDashboardPage(
    1,
    REFERRALS_EXPORT_FETCH_LIMIT,
    filters,
  );
  const firstGroups = extractReferralGroups(firstResponse);
  const payload = unwrapData(firstResponse);
  const reportedTotal =
    payload && typeof payload === "object"
      ? asNumber((payload as Record<string, unknown>).total)
      : 0;
  const totalPages = Math.min(
    Math.max(
      1,
      Math.ceil((reportedTotal || firstGroups.length) / REFERRALS_EXPORT_FETCH_LIMIT),
    ),
    REFERRALS_EXPORT_MAX_PAGES,
  );

  if (totalPages <= 1) {
    return firstGroups;
  }

  const remainingPageNumbers = Array.from({ length: totalPages - 1 }, (_, index) => index + 2);
  const remainingGroups = await Promise.all(
    remainingPageNumbers.map(async (page) => {
      const response = await fetchAdminReferralDashboardPage(
        page,
        REFERRALS_EXPORT_FETCH_LIMIT,
        filters,
      );
      return extractReferralGroups(response);
    }),
  );

  return [...firstGroups, ...remainingGroups.flat()];
}

function formatStatusLabel(value?: string) {
  return String(value ?? "-").replace(/_/g, " ").toUpperCase();
}

function statusBadgeVariant(status?: string) {
  const normalized = normalizeSearchValue(status);
  if (normalized.includes("kyc") && normalized.includes("complete")) {
    return "warning" as const;
  }
  if (
    normalized.includes("success") ||
    normalized.includes("complete") ||
    normalized.includes("credited") ||
    normalized.includes("active") ||
    normalized.includes("paid")
  ) {
    return "success" as const;
  }
  if (
    normalized.includes("pending") ||
    normalized.includes("processing") ||
    normalized.includes("registered")
  ) {
    return "warning" as const;
  }
  if (
    normalized.includes("fail") ||
    normalized.includes("cancel") ||
    normalized.includes("reject") ||
    normalized.includes("expired")
  ) {
    return "destructive" as const;
  }
  return "outline" as const;
}

function formatReferralDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
}

function ReferralReceiversDetailTable({ rows }: { rows: ReferralReceiver[] }) {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-muted-foreground">
        No receivers found for this referral code.
      </p>
    );
  }

  const showReward = rows.some((receiver) => typeof receiver.reward?.rewardAmount === "number");
  const showRewardedAt = rows.some(
    (receiver) => typeof receiver.reward?.rewardedAt === "string" && receiver.reward.rewardedAt.trim(),
  );

  return (
    <div className="rounded-lg border border-border bg-card">
      <table className="w-full text-left text-sm text-foreground">
        <thead className="table-head-sticky">
          <tr>
            <th className="w-[190px] px-3 py-3 font-medium">Receiver</th>
            <th className="w-[140px] px-4 py-3 font-medium">Phone</th>
            <th className="w-[220px] px-4 py-3 font-medium">Email</th>
            <th className="w-[140px] px-4 py-3 font-medium">Status</th>
            <th className="w-[180px] px-4 py-3 font-medium">Registered At</th>
            {showReward ? <th className="w-[120px] px-4 py-3 font-medium">Reward</th> : null}
            {showRewardedAt ? <th className="w-[180px] px-4 py-3 font-medium">Rewarded At</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((receiver) => {
            const rewardAmount =
              typeof receiver.reward?.rewardAmount === "number" ? receiver.reward.rewardAmount : null;
            const rewardedAt =
              typeof receiver.reward?.rewardedAt === "string" && receiver.reward.rewardedAt.trim()
                ? receiver.reward.rewardedAt
                : null;

            return (
              <tr
                key={receiver.id}
                className="border-b border-border transition-colors last:border-0 hover:bg-muted"
              >
                <td className="w-[190px] px-3 py-3 font-medium text-foreground">
                  {receiver.id && !receiver.id.startsWith("receiver-") ? (
                    <Link href={`/users/${receiver.id}?from=referrals`}>
                      <p
                        className="max-w-[170px] truncate cursor-pointer transition-colors hover:text-primary"
                        title={receiver.name ?? "-"}
                      >
                        {receiver.name ?? "-"}
                      </p>
                    </Link>
                  ) : (
                    <p className="max-w-[170px] truncate" title={receiver.name ?? "-"}>
                      {receiver.name ?? "-"}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <p className="font-mono text-sm text-muted-foreground">{receiver.phone ?? "-"}</p>
                </td>
                <td className="px-4 py-3">
                  <p
                    className="max-w-[200px] truncate font-mono text-sm text-muted-foreground"
                    title={receiver.email ?? "-"}
                  >
                    {receiver.email ?? "-"}
                  </p>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <Badge variant={statusBadgeVariant(receiver.currentStatus)}>
                    {formatStatusLabel(receiver.currentStatus)}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  <p>{formatReferralDateTime(receiver.createdAt)}</p>
                </td>
                {showReward ? (
                  <td className="px-4 py-3">
                    {rewardAmount != null ? (
                      <p className="font-bold text-foreground">{formatCurrency(rewardAmount)}</p>
                    ) : null}
                  </td>
                ) : null}
                {showRewardedAt ? (
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {rewardedAt ? <p>{formatReferralDateTime(rewardedAt)}</p> : null}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ReferralsPage() {
  const [searchTerm, setSearchTerm] = usePersistedSearchTerm(
    createPersistedSearchTermKey("referrals"),
  );
  const [dateRange, setDateRange] = usePersistedDateRange(
    createPersistedDateRangeKey("referrals"),
  );
  const [expandedReferralCode, setExpandedReferralCode] = React.useState<string | null>(null);
  const { sortKey, sortDirection, handleSort } = useTableSort<ReferralSortKey>();
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<number>(DEFAULT_TABLE_PAGE_SIZE);
  const debouncedSearchTerm = useDebouncedValue(searchTerm, REFERRALS_SEARCH_DEBOUNCE_MS);
  const fromDate = dateRange?.from ? formatDateInputValue(dateRange.from) : undefined;
  const toDate = dateRange?.to
    ? formatDateInputValue(dateRange.to)
    : dateRange?.from
      ? formatDateInputValue(dateRange.from)
      : undefined;
  const isSearchDebouncing =
    searchTerm.trim() !== debouncedSearchTerm.trim() && searchTerm.trim().length > 0;
  const adminReferralFetchFilters = React.useMemo<AdminReferralFetchFilters>(
    () => ({
      search: debouncedSearchTerm,
      fromDate,
      toDate,
      sortBy: sortKey ?? undefined,
      sortOrder: sortKey ? sortDirection : undefined,
    }),
    [debouncedSearchTerm, fromDate, toDate, sortKey, sortDirection],
  );
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [
      "referral-admin-dashboard",
      currentPage,
      pageSize,
      adminReferralFetchFilters,
    ],
    queryFn: () =>fetchAdminReferralDashboardPage(currentPage, pageSize, adminReferralFetchFilters),placeholderData: (previousData) => previousData,
  });

  const referralGroups = React.useMemo(() => extractReferralGroups(data), [data]);
  const totalRecords = React.useMemo(() => {
    const payload = unwrapData(data);

    if (!payload || typeof payload !== "object") {
      return 0;
    }

    return asNumber((payload as Record<string, unknown>).total);
  }, [data]);

  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const visibleRows = referralGroups;
  const isReferralLoading = isLoading || isSearchDebouncing;

  React.useEffect(() => {
    setCurrentPage(1);
    setExpandedReferralCode(null);
  }, [debouncedSearchTerm, dateRange, sortKey, sortDirection]);

  const toggleReferralExpand = React.useCallback((referralCode: string) => {
    setExpandedReferralCode((current) => (current === referralCode ? null : referralCode));
  }, []);

  const [selectedReferralCodes, setSelectedReferralCodes] = React.useState<string[]>([]);
  const [transferAnimation, setTransferAnimation] = React.useState(false);
  const [downloadBounce, setDownloadBounce] = React.useState(false);
  const [showDownloadHint, setShowDownloadHint] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);

  const allVisibleSelected =
    visibleRows.length > 0 &&
    visibleRows.every((row) => selectedReferralCodes.includes(row.referralCode));

  const clearSelectionFeedback = React.useCallback(() => {
    setSelectedReferralCodes([]);
    setTransferAnimation(false);
    setShowDownloadHint(false);
  }, []);

  const toggleReferralSelection = React.useCallback((referralCode: string) => {
    setSelectedReferralCodes((current) => {
      const alreadySelected = current.includes(referralCode);
      if (!alreadySelected) {
        triggerSelectionFeedback({
          setTransferAnimation,
          setShowDownloadHint,
        });
      }
      return alreadySelected
        ? current.filter((code) => code !== referralCode)
        : [...current, referralCode];
    });
  }, []);

  const toggleAllVisibleReferrals = React.useCallback(
    (checked: boolean) => {
      if (checked) {
        triggerSelectionFeedback({
          setTransferAnimation,
          setShowDownloadHint,
        });
      }
      const visibleCodes = visibleRows.map((row) => row.referralCode);
      setSelectedReferralCodes((current) => {
        if (checked) return [...new Set([...current, ...visibleCodes])];
        return current.filter((code) => !visibleCodes.includes(code));
      });
    },
    [visibleRows],
  );

  React.useEffect(() => {
    setSelectedReferralCodes([]);
  }, [debouncedSearchTerm, dateRange, sortKey, sortDirection]);

  const exportReferralsToExcel = React.useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const fetchedGroups = await fetchAllMatchingReferralGroups(adminReferralFetchFilters);
      const selectedSet =
        selectedReferralCodes.length > 0 ? new Set(selectedReferralCodes) : null;
      const groupsToExport = selectedSet
        ? fetchedGroups.filter((group) => selectedSet.has(group.referralCode))
        : fetchedGroups;

      const rows: Record<string, unknown>[] = [];
      groupsToExport.forEach((group) => {
        const referrerName = group.sender?.name ?? "-";
        const referrerPhone = group.sender?.phone ?? "-";
        const referrerEmail = group.sender?.email ?? "-";
        const totalReferrals = group.totalReferrals || group.receivers.length;
        const totalReward =
          typeof group.totalRewardAmount === "number" ? group.totalRewardAmount : null;

        if (group.receivers.length === 0) {
          rows.push({
            referrerName,
            referrerPhone,
            referrerEmail,
            referralCode: group.referralCode,
            totalReferrals,
            totalReward,
            receiverName: "-",
            receiverPhone: "-",
            receiverEmail: "-",
            receiverStatus: "-",
            registeredAt: "-",
            rewardAmount: null,
            rewardStatus: "-",
            rewardedAt: "-",
          });
          return;
        }

        group.receivers.forEach((receiver) => {
          rows.push({
            referrerName,
            referrerPhone,
            referrerEmail,
            referralCode: group.referralCode,
            totalReferrals,
            totalReward,
            receiverName: receiver.name ?? "-",
            receiverPhone: receiver.phone ?? "-",
            receiverEmail: receiver.email ?? "-",
            receiverStatus: formatStatusLabel(receiver.currentStatus),
            registeredAt: formatReferralDateTime(receiver.createdAt),
            rewardAmount:
              typeof receiver.reward?.rewardAmount === "number"
                ? receiver.reward.rewardAmount
                : null,
            rewardStatus: formatStatusLabel(receiver.reward?.rewardStatus),
            rewardedAt: formatReferralDateTime(receiver.reward?.rewardedAt ?? null),
          });
        });
      });

      await exportToExcel({
        fileName: "referrals.xlsx",
        sheetName: "Referrals",
        columns: [
          { header: "Referrer Name", key: "referrerName", width: 25 },
          { header: "Referrer Phone", key: "referrerPhone", width: 18 },
          { header: "Referrer Email", key: "referrerEmail", width: 30 },
          { header: "Referral Code", key: "referralCode", width: 18 },
          { header: "Total Referrals", key: "totalReferrals", width: 16 },
          { header: "Total Reward", key: "totalReward", width: 16 },
          { header: "Receiver Name", key: "receiverName", width: 25 },
          { header: "Receiver Phone", key: "receiverPhone", width: 18 },
          { header: "Receiver Email", key: "receiverEmail", width: 30 },
          { header: "Receiver Status", key: "receiverStatus", width: 18 },
          { header: "Registered At", key: "registeredAt", width: 25 },
          { header: "Reward Amount", key: "rewardAmount", width: 16 },
          { header: "Reward Status", key: "rewardStatus", width: 16 },
          { header: "Rewarded At", key: "rewardedAt", width: 25 },
        ],
        rows,
      });

      clearSelectionFeedback();
    } finally {
      setIsExporting(false);
    }
  }, [adminReferralFetchFilters, clearSelectionFeedback, isExporting, selectedReferralCodes]);
  return (
    <Layout title="Referrals">
      <div className="flex h-[calc(100vh-7.5rem)] flex-col gap-4">
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-4">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by name, referral code, phone, email, or receiver…"
                className="pl-10"
                aria-label="Search referrals"
              />
            </div>
            <TooltipProvider delayDuration={200}>
              <SelectionFeedback
                transferAnimation={transferAnimation}
                downloadBounce={downloadBounce}
                showDownloadHint={showDownloadHint}
                selectedCount={selectedReferralCodes.length}
                disabled={isReferralLoading || isError || isExporting || totalRecords === 0}
                onExport={() => void exportReferralsToExcel()}
                onAnimationComplete={() => {
                  setTransferAnimation(false);
                  setDownloadBounce((prev) => !prev);
                }}
              />
            </TooltipProvider>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[880px] text-left text-sm text-foreground">
              <thead className="table-head-sticky">
                <tr>
                  <th className="w-12 px-4 py-3 font-medium">
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={(checked) => toggleAllVisibleReferrals(Boolean(checked))}
                      aria-label="Select all referrals for download"
                    />
                  </th>
                  <th className="w-[20px] px-4 py-3 font-medium normal-case"> </th>
                  <th className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort("referrer")}
                      className={getSortToggleClass(sortKey === "referrer")}
                    >
                      Referrer{" "}
                      <SortDirectionIcon active={sortKey === "referrer"} direction={sortDirection} />
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort("referralCode")}
                      className={getSortToggleClass(sortKey === "referralCode")}
                    >
                      Referral code{" "}
                      <SortDirectionIcon
                        active={sortKey === "referralCode"}
                        direction={sortDirection}
                      />
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort("receivers")}
                      className={getSortToggleClass(sortKey === "receivers")}
                    >
                      Receivers{" "}
                      <SortDirectionIcon active={sortKey === "receivers"} direction={sortDirection} />
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort("totalReward")}
                      className={getSortToggleClass(sortKey === "totalReward")}
                    >
                      Total reward{" "}
                      <SortDirectionIcon
                        active={sortKey === "totalReward"}
                        direction={sortDirection}
                      />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {isReferralLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      Loading referrals…
                    </td>
                  </tr>
                ) : isError ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-destructive">
                      Failed to load referrals.
                      <Button
                        type="button"
                        variant="link"
                        className="ml-2 h-auto p-0"
                        onClick={() => void refetch()}
                      >
                        Retry
                      </Button>
                    </td>
                  </tr>
                ) : referralGroups.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      No referrals match your search or filters.
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((row) => {
                    const isSelected = selectedReferralCodes.includes(row.referralCode);
                    return (
                      <React.Fragment key={row.referralCode}>
                        <tr
                          tabIndex={0}
                          role="row"
                          onClick={() => toggleReferralExpand(row.referralCode)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              toggleReferralExpand(row.referralCode);
                            }
                          }}
                          className={cn(
                            "cursor-pointer border-b border-border transition-colors hover:bg-muted",
                            expandedReferralCode === row.referralCode && "bg-muted/40",
                            getSelectionRowClass(isSelected),
                          )}
                        >
                          <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleReferralSelection(row.referralCode)}
                              aria-label={`Select referral ${row.referralCode} for download`}
                            />
                          </td>
                          <td className="w-[20px]" onClick={(event) => event.stopPropagation()}>
                            <div className="flex">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                aria-expanded={expandedReferralCode === row.referralCode}
                                aria-label={
                                  expandedReferralCode === row.referralCode
                                    ? "Collapse receivers"
                                    : "Expand receivers"
                                }
                                onClick={() => toggleReferralExpand(row.referralCode)}
                              >
                                {expandedReferralCode === row.referralCode ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </td>
                          <td
                            className="px-4 py-3 text-sm text-muted-foreground"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {row.sender?.id ? (
                              <Link href={`/users/${row.sender.id}?from=referrals`}>
                                <p
                                  className="truncate cursor-pointer font-medium text-muted-foreground transition-colors hover:text-primary"
                                  title={row.sender.name ?? "-"}
                                >
                                  {row.sender.name ?? "-"}
                                </p>
                              </Link>
                            ) : (
                              <p className="truncate" title={row.sender?.name ?? "-"}>
                                {row.sender?.name ?? "-"}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-sm text-muted-foreground">
                            {row.referralCode || "—"}
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {row.totalReferrals || row.receivers.length}
                          </td>
                          <td className="px-4 py-3 text-sm font-bold text-foreground">
                            {formatCurrency(row.totalRewardAmount)}
                          </td>
                        </tr>
                        {expandedReferralCode === row.referralCode ? (
                          <tr className="border-b border-border bg-muted/30">
                            <td colSpan={6} className="p-0">
                              <div className="p-4" onClick={(event) => event.stopPropagation()}>
                                <ReferralReceiversDetailTable rows={row.receivers} />
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {!expandedReferralCode ? (
            <TablePaginationFooter
              totalItems={totalRecords}
              pageSize={pageSize}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setCurrentPage(1);
              }}
              currentPage={currentPage}
              totalPages={totalPages}
              onPrevious={() => setCurrentPage((page) => Math.max(1, page - 1))}
              onNext={() => setCurrentPage((page) => page + 1)}
              disablePrevious={isReferralLoading || currentPage <= 1}
              disableNext={isReferralLoading || currentPage >= totalPages}
              itemLabel="referrals"
            />
          ) : null}
        </Card>
      </div>
    </Layout>
  );
}
