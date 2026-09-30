import * as React from "react";
import { Bell, Search } from "lucide-react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Button, Card, Input } from "@/components/ui";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { NotificationPopup } from "@/components/notificationPopup";
import SelectionFeedback from "@/components/ui/SelectionFeedback";
import { TablePaginationFooter } from "@/components/table-pagination-footer";
import { useListAdminUserHoldings } from "@/lib/api-client-react";
import { exportToExcel } from "@/lib/export-to-excel";
import {
  createPersistedSearchTermKey,
  usePersistedSearchTerm,
} from "@/lib/persisted-page-filters";
import { getSelectionRowClass, triggerSelectionFeedback } from "@/lib/selection-feedback";
import { bindTablePaginationFooter, useTablePagination } from "@/lib/table-pagination";
import { getSortToggleClass, SortDirectionIcon, useTableSort } from "@/lib/table-sort";
import {
  type FolioSectionKey,
  formatHoldingsGrams,
  getFolioHoldings,
  getMetalCurrentValue,
  getTotalCurrentValue,
  getTotalHoldings,
getTotalInvested,
  resolveHoldingsUserId,
  resolveHoldingsUserProfile,
  unwrapAdminUserHoldingsList,
  type UserHoldingsRecord,
} from "@/lib/user-holdings";
import { cn, formatCurrency } from "@/lib/utils";
import goldImage from "@/assets/gold.png";
import silverImage from "@/assets/silver.png";

type HoldingsSortKey =
  | "name"
  | "invested"
  | "portfolio"
  | "pnl"
  | "missedSips"
  | "giftFolio"
  | "goalFolio"
  | "goldFolio"
  | "growFolio";
type NotificationMode = "individual" | "all";

type FolioMetal = {
  grams: number;
  value: number;
};

type FolioHoldingRow = {
  gold: FolioMetal;
  silver: FolioMetal;
};

type HoldingsRow = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  giftFolio: FolioHoldingRow;
  goalFolio: FolioHoldingRow;
  goldFolio: FolioHoldingRow;
  growFolio: FolioHoldingRow;
  invested: number;
  portfolio: number;
  pnl: number;
  pnlPercent: number;
  missedSips: number;
};

type NotificationRecipient = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
};

const TOOLTIP_CLASS =
  "bg-gray-700 text-white text-xs px-3 py-2 rounded-md shadow-lg animate-in fade-in zoom-in-95 duration-200";

const HOLDINGS_TABLE_COLUMNS = 11;
const HOLDINGS_EXPORT_COLUMNS = [
  { header: "Name", key: "name", width: 25 },
  { header: "Email", key: "email", width: 30 },
  { header: "Phone Number", key: "phone", width: 18 },
  { header: "GoldFolio Gold (gm)", key: "goldFolioGoldGrams", width: 18 },
  { header: "GoldFolio Gold Value", key: "goldFolioGoldValue", width: 20 },
  { header: "GoldFolio Silver (gm)", key: "goldFolioSilverGrams", width: 20 },
  { header: "GoldFolio Silver Value", key: "goldFolioSilverValue", width: 20 },
  { header: "GrowFolio Gold (gm)", key: "growFolioGoldGrams", width: 18 },
  { header: "GrowFolio Gold Value", key: "growFolioGoldValue", width: 20 },
  { header: "GrowFolio Silver (gm)", key: "growFolioSilverGrams", width: 20 },
  { header: "GrowFolio Silver Value", key: "growFolioSilverValue", width: 20 },
  { header: "GoalFolio Gold (gm)", key: "goalFolioGoldGrams", width: 18 },
  { header: "GoalFolio Gold Value", key: "goalFolioGoldValue", width: 20 },
  { header: "GoalFolio Silver (gm)", key: "goalFolioSilverGrams", width: 20 },
  { header: "GoalFolio Silver Value", key: "goalFolioSilverValue", width: 20 },
  { header: "GiftFolio Gold (gm)", key: "giftFolioGoldGrams", width: 18 },
  { header: "GiftFolio Gold Value", key: "giftFolioGoldValue", width: 20 },
  { header: "GiftFolio Silver (gm)", key: "giftFolioSilverGrams", width: 20 },
  { header: "GiftFolio Silver Value", key: "giftFolioSilverValue", width: 20 },
  { header: "Total Invested", key: "invested", width: 20 },
  { header: "Portfolio", key: "portfolio", width: 20 },
  { header: "P&L (%)", key: "pnlPercent", width: 14 },
  { header: "P&L (₹)", key: "pnl", width: 18 },
  { header: "Missed SIPs", key: "missedSips", width: 14 },
] as const;

function normalizeSearchValue(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function formatMetalAmount(value: number) {
  return Number.isFinite(value) ? formatCurrency(value) : "-";
}

function toHoldingsRow(record: UserHoldingsRecord): HoldingsRow | null {
  const id = resolveHoldingsUserId(record);
  if (!id) return null;

  const profile = resolveHoldingsUserProfile(record);
  const total = getTotalHoldings(record);

  const extractFolio = (key: FolioSectionKey): FolioHoldingRow => {
    const folio = getFolioHoldings(record, key);
    return {
      gold: {
        grams: Number(folio?.gold?.totalGrams ?? 0) || 0,
        value: getMetalCurrentValue(folio?.gold),
      },
      silver: {
        grams: Number(folio?.silver?.totalGrams ?? 0) || 0,
        value: getMetalCurrentValue(folio?.silver),
      },
    };
  };

  const invested = getTotalInvested(total);
  const portfolio = getTotalCurrentValue(total);
  const pnl = portfolio - invested;
  const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;
  const missedSips = Number(
    record.totalMissedInstallments ??
      record.missedInstallments ??
      record.missedSips ??
      record.missedSipCount ??
      0,
  );

  return {
    id,
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    giftFolio: extractFolio("giftFolio"),
    goalFolio: extractFolio("goalFolio"),
    goldFolio: extractFolio("goldFolio"),
    growFolio: extractFolio("growFolio"),
    invested,
    portfolio,
    pnl,
    pnlPercent,
    missedSips: Number.isFinite(missedSips) ? missedSips : 0,
  };
}

function buildHoldingsRows(data: unknown): HoldingsRow[] {
  const seen = new Set<string>();
  const rows: HoldingsRow[] = [];

  for (const record of unwrapAdminUserHoldingsList(data)) {
    const row = toHoldingsRow(record);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    rows.push(row);
  }

  return rows;
}

function getHoldingSearchRank(row: HoldingsRow, term: string): number | null {
  const name = normalizeSearchValue(row.name);
  const email = normalizeSearchValue(row.email);
  const phone = normalizeSearchValue(row.phone);
  const userId = normalizeSearchValue(row.id);

  const phoneTerm = digitsOnly(term);
  const looksLikeEmail = term.includes("@") || term.includes(".");
  const looksLikePhone =
    phoneTerm.length > 0 && phoneTerm.length === term.replace(/\s+/g, "").length;

  if (!looksLikeEmail && !looksLikePhone) {
    const searchWords = term.split(/\s+/).filter(Boolean);
    const nameWords = name.split(/\s+/).filter(Boolean);

    if (
      searchWords.length > 0 &&
      searchWords.every((word) => nameWords.some((nameWord) => nameWord.startsWith(word)))
    ) {
      return name.startsWith(term) ? 0 : 1;
    }

    if (searchWords.length > 0 && searchWords.every((word) => name.includes(word))) {
      return 2;
    }

    if (userId.includes(term)) return 5;
  }

  if (looksLikeEmail && email.includes(term)) return 3;
  if (looksLikePhone && digitsOnly(phone).includes(phoneTerm)) return 4;
  return null;
}

function filterHoldingsRows(rows: HoldingsRow[], searchTerm: string) {
  const term = normalizeSearchValue(searchTerm);
  if (!term) return rows;

  return rows
    .map((row) => ({ row, rank: getHoldingSearchRank(row, term) }))
    .filter((item): item is { row: HoldingsRow; rank: number } => item.rank !== null)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        normalizeSearchValue(a.row.name).localeCompare(normalizeSearchValue(b.row.name)),
    )
    .map((item) => item.row);
}

function sortHoldingsRows(
  rows: HoldingsRow[],
  sortKey: HoldingsSortKey | null,
  directionFactor: number,
) {
  if (!sortKey) return rows;

  const sortValue = (row: HoldingsRow): number => {
    switch (sortKey) {
      case "invested":
        return row.invested;
      case "portfolio":
        return row.portfolio;
      case "pnl":
        return row.pnl;
      case "missedSips":
        return row.missedSips;
      case "giftFolio":
        return row.giftFolio.gold.value + row.giftFolio.silver.value;
      case "goalFolio":
        return row.goalFolio.gold.value + row.goalFolio.silver.value;
      case "goldFolio":
        return row.goldFolio.gold.value + row.goldFolio.silver.value;
      case "growFolio":
        return row.growFolio.gold.value + row.growFolio.silver.value;
      default:
        return 0;
    }
  };

  return [...rows].sort((a, b) => {
    if (sortKey === "name") {
      return (
        normalizeSearchValue(a.name).localeCompare(normalizeSearchValue(b.name)) * directionFactor
      );
    }
    return (sortValue(a) - sortValue(b)) * directionFactor;
  });
}

function toNotificationRecipient(row: HoldingsRow): NotificationRecipient {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
  };
}

function SortableHeader({
  label,
  active,
  direction,
  onClick,
  className,
  align = "left",
  rowSpan,
}: {
  label: string;
  active: boolean;
  direction: "asc" | "desc" | null;
  onClick: () => void;
  className?: string;
  align?: "left" | "center";
  rowSpan?: number;
}) {
  return (
    <th
      className={cn("px-4 py-4 font-medium", align === "center" && "text-center", className)}
      rowSpan={rowSpan}
    >
      <button type="button" onClick={onClick} className={getSortToggleClass(active)}>
        {label} <SortDirectionIcon active={active} direction={direction} />
      </button>
    </th>
  );
}

function FolioMetalLine({
  icon,
  grams,
  value,
}: {
  icon: React.ReactNode;
  grams: number;
  value: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
      <div className="min-w-0 text-left">
        <p className="whitespace-nowrap text-xs text-foreground">{formatHoldingsGrams(grams)}</p>
        <p className="whitespace-nowrap text-[11px] text-muted-foreground">
          {formatMetalAmount(value)}
        </p>
      </div>
    </div>
  );
}

function FolioCell({
  folio,
  className,
}: {
  folio: FolioHoldingRow;
  className?: string;
}) {
  const hasAnything = folio.gold.grams > 0 || folio.silver.grams > 0;
  if (!hasAnything) {
    return (
      <td className={cn("whitespace-nowrap px-4 py-3 text-center text-xs text-muted-foreground", className)}>
        —
      </td>
    );
  }
  return (
    <td className={cn("whitespace-nowrap px-4 py-3", className)}>
      <div className="flex flex-col items-start gap-2">
        <FolioMetalLine
          icon={<GoldIcon />}
          grams={folio.gold.grams}
          value={folio.gold.value}
        />
        <FolioMetalLine
          icon={<SilverIcon />}
          grams={folio.silver.grams}
          value={folio.silver.value}
        />
      </div>
    </td>
  );
}

function GoldIcon() {
  return (
    <img
      src={goldImage}
      alt="Gold"
      className="h-4 w-4 object-contain"
      aria-hidden
    />
  );
}

function SilverIcon() {
  return (
    <img
      src={silverImage}
      alt="Silver"
      className="h-4 w-4 object-contain"
      aria-hidden
    />
  );
}

function PnLCell({ pnl, pnlPercent }: { pnl: number; pnlPercent: number }) {
  const isProfit = pnl > 0;
  const isLoss = pnl < 0;
  const color = isProfit ? "text-green-600" : isLoss ? "text-red-500" : "text-muted-foreground";
  const arrow = isProfit ? "↑" : isLoss ? "↓" : "";

  return (
    <td className="whitespace-nowrap px-4 py-4 text-center">
      <p className={cn("font-medium", color)}>
        {arrow} {isProfit || isLoss ? `${Math.abs(pnlPercent).toFixed(2)}%` : "0.00%"}
      </p>
      <p className={cn("mt-1 text-xs", color)}>
        {isProfit || isLoss ? `${isProfit ? "+" : "-"}${formatCurrency(Math.abs(pnl))}` : formatCurrency(0)}
      </p>
    </td>
  );
}

function NotifyButton({
  disabled,
  onClick,
  label = "Send Notification",
  ariaLabel = "Send notification",
  size = "icon",
}: {
  disabled?: boolean;
  onClick: () => void;
  label?: string;
  ariaLabel?: string;
  size?: "icon" | "default";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-pointer transition-all duration-200 hover:scale-105">
          <Button
            type="button"
            variant={size === "icon" ? "ghost" : "outline"}
            size={size === "icon" ? "icon" : "default"}
            className={cn(
              "cursor-pointer transition-all duration-200",
              size === "icon" ? "h-8 w-8 shrink-0" : "gap-2",
            )}
            onClick={onClick}
            disabled={disabled}
            aria-label={ariaLabel}
          >
            <Bell className="h-4 w-4" />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="end"
        sideOffset={size === "icon" ? 3 : 8}
        avoidCollisions
        collisionPadding={{ right: 32, left: 16 }}
        className={TOOLTIP_CLASS}
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function HoldingsUserCell({ user }: { user: HoldingsRow }) {
  const userHref = user.id ? `/users/${user.id}?from=holdings` : null;
  const displayName = user.name ?? "-";

  return (
    <td className="px-4 py-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 font-bold text-primary">
          {String(user.name ?? "?").charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          {userHref ? (
            <Link href={userHref}>
              <p className="cursor-pointer truncate font-semibold text-muted-foreground transition-colors hover:text-primary">
                {displayName}
              </p>
            </Link>
          ) : (
            <p className="truncate font-semibold text-muted-foreground">{displayName}</p>
          )}
          {user.email ? <p className="text-gray truncate text-xs">{user.email}</p> : null}
        </div>
      </div>
    </td>
  );
}

function TableStatusRow({ message, destructive = false }: { message: string; destructive?: boolean }) {
  return (
    <tr>
      <td
        colSpan={HOLDINGS_TABLE_COLUMNS}
        className={cn(
          "px-4 py-10 text-center text-sm",
          destructive ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {message}
      </td>
    </tr>
  );
}

export default function HoldingsPage() {
  const [searchTerm, setSearchTerm] = usePersistedSearchTerm(
    createPersistedSearchTermKey("holdings"),
  );
  const [transferAnimation, setTransferAnimation] = React.useState(false);
  const [downloadBounce, setDownloadBounce] = React.useState(false);
  const [showDownloadHint, setShowDownloadHint] = React.useState(false);
  const [selectedUserIds, setSelectedUserIds] = React.useState<string[]>([]);
  const [notificationOpen, setNotificationOpen] = React.useState(false);
  const [notificationMode, setNotificationMode] = React.useState<NotificationMode>("individual");
  const [notificationRecipients, setNotificationRecipients] = React.useState<NotificationRecipient[]>(
    [],
  );

const { sortKey, sortDirection, directionFactor, handleSort } = useTableSort<HoldingsSortKey>();
  const { data: holdingsData, isLoading, isError } = useListAdminUserHoldings();
  const holdingsRows = React.useMemo(
    () => buildHoldingsRows(holdingsData),
    [holdingsData],
  );

  const filteredUsers = React.useMemo(
    () => filterHoldingsRows(holdingsRows, searchTerm),
    [holdingsRows, searchTerm],
  );

  const sortedUsers = React.useMemo(
    () => sortHoldingsRows(filteredUsers, sortKey, directionFactor),
    [directionFactor, filteredUsers, sortKey],
  );

  const pagination = useTablePagination(sortedUsers);

  React.useEffect(() => {
    pagination.resetPage();
  }, [pagination.resetPage, searchTerm]);

  const allFilteredSelected =
    sortedUsers.length > 0 && sortedUsers.every((user) => selectedUserIds.includes(user.id));

  const clearSelectionFeedback = React.useCallback(() => {
    setSelectedUserIds([]);
    setTransferAnimation(false);
    setShowDownloadHint(false);
  }, []);

  const toggleUserSelection = React.useCallback((userId: string) => {
    setSelectedUserIds((current) => {
      const alreadySelected = current.includes(userId);
      if (!alreadySelected) {
        triggerSelectionFeedback({
          setTransferAnimation,
          setShowDownloadHint,
        });
      }
      return alreadySelected
        ? current.filter((id) => id !== userId)
        : [...current, userId];
    });
  }, []);

  const toggleAllFilteredUsers = React.useCallback(
    (checked: boolean) => {
      if (checked) {
        triggerSelectionFeedback({
          setTransferAnimation,
          setShowDownloadHint,
        });
      }
      setSelectedUserIds(checked ? sortedUsers.map((user) => user.id).filter(Boolean) : []);
    },
    [sortedUsers],
  );

  const exportHoldingsToExcel = React.useCallback(async () => {
    const rowsToExport =
      selectedUserIds.length === 0
        ? filteredUsers
        : filteredUsers.filter((user) => selectedUserIds.includes(user.id));

    await exportToExcel({
      fileName: "holdings.xlsx",
      sheetName: "Holdings",
      columns: [...HOLDINGS_EXPORT_COLUMNS],
      rows: rowsToExport.map((user) => ({
        name: user.name ?? "-",
        email: user.email ?? "-",
        phone: user.phone ?? "-",
        goldFolioGoldGrams: formatHoldingsGrams(user.goldFolio.gold.grams),
        goldFolioGoldValue: user.goldFolio.gold.value,
        goldFolioSilverGrams: formatHoldingsGrams(user.goldFolio.silver.grams),
        goldFolioSilverValue: user.goldFolio.silver.value,
        growFolioGoldGrams: formatHoldingsGrams(user.growFolio.gold.grams),
        growFolioGoldValue: user.growFolio.gold.value,
        growFolioSilverGrams: formatHoldingsGrams(user.growFolio.silver.grams),
        growFolioSilverValue: user.growFolio.silver.value,
        goalFolioGoldGrams: formatHoldingsGrams(user.goalFolio.gold.grams),
        goalFolioGoldValue: user.goalFolio.gold.value,
        goalFolioSilverGrams: formatHoldingsGrams(user.goalFolio.silver.grams),
        goalFolioSilverValue: user.goalFolio.silver.value,
        giftFolioGoldGrams: formatHoldingsGrams(user.giftFolio.gold.grams),
        giftFolioGoldValue: user.giftFolio.gold.value,
        giftFolioSilverGrams: formatHoldingsGrams(user.giftFolio.silver.grams),
        giftFolioSilverValue: user.giftFolio.silver.value,
        invested: user.invested,
        portfolio: user.portfolio,
        pnlPercent: Number(user.pnlPercent.toFixed(2)),
        pnl: user.pnl,
        missedSips: user.missedSips,
      })),
    });

    clearSelectionFeedback();
  }, [clearSelectionFeedback, filteredUsers, selectedUserIds]);

  const openIndividualNotification = React.useCallback((user: HoldingsRow) => {
    if (!user.id) return;
    setNotificationMode("individual");
    setNotificationRecipients([toNotificationRecipient(user)]);
    setNotificationOpen(true);
  }, []);

  const openBulkNotification = React.useCallback(() => {
    setNotificationMode("all");
    setNotificationRecipients(
      filteredUsers.map(toNotificationRecipient).filter((user) => Boolean(user.id)),
    );
    setNotificationOpen(true);
  }, [filteredUsers]);

  const emptyMessage = searchTerm.trim()
    ? "No users match this search."
    : "No holdings found.";

  return (
    <>
      <Layout title="Holdings">
        <Card className="flex h-[calc(100vh-7.5rem)] flex-col">
          <div className="flex flex-col items-center justify-between gap-4 border-b border-white/5 p-6 sm:flex-row">
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search users by name, email, or phone..."
                className="pl-10"
                aria-label="Search holdings users"
              />
            </div>

            <TooltipProvider delayDuration={200}>
              <div className="flex items-center gap-2">
                <NotifyButton
                  size="default"
                  onClick={openBulkNotification}
                  disabled={filteredUsers.length === 0 || selectedUserIds.length === 0}
                  ariaLabel="Send notification to selected users"
                />
                <SelectionFeedback
                  transferAnimation={transferAnimation}
                  downloadBounce={downloadBounce}
                  showDownloadHint={showDownloadHint}
                  selectedCount={selectedUserIds.length}
                  disabled={filteredUsers.length === 0}
                  onExport={exportHoldingsToExcel}
                  onAnimationComplete={() => {
                    setTransferAnimation(false);
                    setDownloadBounce((prev) => !prev);
                  }}
                />
              </div>
            </TooltipProvider>
          </div>

          <div className="min-h-0 w-full flex-1 overflow-x-auto overflow-y-auto">
            <TooltipProvider delayDuration={200}>
              <table className="min-w-[1100px] w-full text-sm">
                <thead className="table-head-sticky">
                  <tr>
                    <th className="w-12 px-4 py-4 font-medium">
                      <Checkbox
                        checked={allFilteredSelected}
                        onCheckedChange={(checked) => toggleAllFilteredUsers(Boolean(checked))}
                        aria-label="Select all filtered holdings users"
                      />
                    </th>
                    <SortableHeader
                      label="Name"
                      active={sortKey === "name"}
                      direction={sortDirection}
                      onClick={() => handleSort("name")}
                      className="text-left"
                    />
                    <SortableHeader
                      label="GoldFolio"
                      active={sortKey === "goldFolio"}
                      direction={sortDirection}
                      onClick={() => handleSort("goldFolio")}
                      className="border-l border-border"
                    />
                    <SortableHeader
                      label="GrowFolio"
                      active={sortKey === "growFolio"}
                      direction={sortDirection}
                      onClick={() => handleSort("growFolio")}
                      className="border-l border-border"
                    />
                    <SortableHeader
                      label="GoalFolio"
                      active={sortKey === "goalFolio"}
                      direction={sortDirection}
                      onClick={() => handleSort("goalFolio")}
                      className="border-l border-border"
                    />
                    <SortableHeader
                      label="GiftFolio"
                      active={sortKey === "giftFolio"}
                      direction={sortDirection}
                      onClick={() => handleSort("giftFolio")}
                      className="border-l border-border"
                    />
                    <SortableHeader
                      label="Total Invested"
                      active={sortKey === "invested"}
                      direction={sortDirection}
                      onClick={() => handleSort("invested")}
                      align="center"
                    />
                    <SortableHeader
                      label="Portfolio"
                      active={sortKey === "portfolio"}
                      direction={sortDirection}
                      onClick={() => handleSort("portfolio")}
                      align="center"
                    />
                    <SortableHeader
                      label="P&L"
                      active={sortKey === "pnl"}
                      direction={sortDirection}
                      onClick={() => handleSort("pnl")}
                      align="center"
                    />
                    <SortableHeader
                      label="Missed SIPs"
                      active={sortKey === "missedSips"}
                      direction={sortDirection}
                      onClick={() => handleSort("missedSips")}
                      align="center"
                    />
                    <th className="px-4 py-4 text-center font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <TableStatusRow message="Loading holdings..." />
                  ) : isError ? (
                    <TableStatusRow message="Failed to load holdings." destructive />
                  ) : pagination.pagedItems.length === 0 ? (
                    <TableStatusRow message={emptyMessage} />
                  ) : (
                    pagination.pagedItems.map((user) => (
                      <tr
                        key={user.id}
                        className={cn(
                          "border-b border-border transition-all duration-200",
                          getSelectionRowClass(selectedUserIds.includes(user.id)),
                        )}
                      >
                        <td className="px-4 py-4">
                          <Checkbox
                            checked={selectedUserIds.includes(user.id)}
                            onCheckedChange={() => toggleUserSelection(user.id)}
                            aria-label={`Select ${user.name ?? "user"} for notification`}
                          />
                        </td>
                        <HoldingsUserCell user={user} />
                        <FolioCell folio={user.goldFolio} className="border-l border-border" />
                        <FolioCell folio={user.growFolio} className="border-l border-border" />
                        <FolioCell folio={user.goalFolio} className="border-l border-border" />
                        <FolioCell folio={user.giftFolio} className="border-l border-border" />
                        <td className="whitespace-nowrap px-4 py-4 text-center font-medium text-foreground">
                          {formatCurrency(user.invested)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-center font-medium text-foreground">
                          {formatMetalAmount(user.portfolio)}
                        </td>
                        <PnLCell pnl={user.pnl} pnlPercent={user.pnlPercent} />
                        <td
                          className={cn(
                            "whitespace-nowrap px-4 py-4 text-center font-medium",
                            user.missedSips > 0 ? "text-red-500" : "text-muted-foreground",
                          )}
                        >
                          {user.missedSips}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-center">
                          <NotifyButton
                            onClick={() => openIndividualNotification(user)}
                            disabled={!user.id}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </TooltipProvider>
          </div>

          <TablePaginationFooter {...bindTablePaginationFooter(pagination)} />
        </Card>
      </Layout>

      <NotificationPopup
        open={notificationOpen}
        mode={notificationMode}
        recipients={notificationRecipients}
        initialSelectedRecipientIds={notificationMode === "all" ? selectedUserIds : undefined}
        onOpenChange={setNotificationOpen}
      />
    </>
  );
}
