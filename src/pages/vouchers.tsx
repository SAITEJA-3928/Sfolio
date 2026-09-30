import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { Input, Badge, Button, Card } from "@/components/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {  Eye, EyeOff,Search, Ticket, Plus, ChevronDown, ChevronRight, Trash2, Download, } from "lucide-react";
import { useCreateVoucherBatch, useGetVoucherRewards } from "@/lib/api-client-react";
import { cn, formatDateTimeParts } from "@/lib/utils";
import { getSortToggleClass, SortDirectionIcon, useTableSort } from "@/lib/table-sort";
import { toast } from "@/hooks/use-toast";
import { TableHeaderFilter } from "@/components/table-header-filter";
import { TablePaginationFooter } from "@/components/table-pagination-footer";
import { bindTablePaginationFooter, useTablePagination } from "@/lib/table-pagination";
import {
  usePersistedSearchTerm,
  createPersistedSearchTermKey,
  usePersistedDateRange,
  createPersistedDateRangeKey,
} from "@/lib/persisted-page-filters";
import { DateRangePicker, SingleDatePicker } from "@/components/ui/date-picker";
import {
  isDateInRange,
  parseDateInputValue,
} from "@/lib/date-range";

type VoucherItem = {
  id: string;
  voucherCode: string;
  pin: string;
  metalType: string;
  rewardAmount: number;
  startDate?: string;
  endDate?: string;
  redeemDate?: string;
  name?: string;
  email?: string;
  isRedeemed: boolean;
};

type VoucherSubBatchGroup = {
  id: string;
  subBatchId: string;
  metalType: string;
  rewardAmount: number;
  redeemedAmount: number;
  quantity: number;
  availableCount: number;
  redeemedCount: number;
  startDate?: string;
  endDate?: string;
  vouchers: VoucherItem[];
};

type VoucherBatchGroup = {
  batchId: string;
  batchName?: string;
  batchLabel: string;
  batchNumber: number;
  metalType: string;
  redeemedAmount: number;
  quantity: number;
  availableCount: number;
  redeemedCount: number;
  subBatches: VoucherSubBatchGroup[];
  vouchers: VoucherItem[];
};

type VoucherBatchRow = {
  id: string;
  metalType: string;
  amount: string;
  quantity: string;
  startDate: string;
  endDate: string;
};

type BatchSortKey = "batch" | "metalType" | "amount" | "quantity";

const BATCH_TABLE_COLUMN_COUNT = 7;

const METAL_TYPE_OPTIONS = [
  { value: "GOLD", label: "Gold" },
  { value: "SILVER", label: "Silver" },
] as const;

function createBatchRow(dates?: { startDate?: string; endDate?: string }): VoucherBatchRow {
  return {
    id: crypto.randomUUID(),
    metalType: "GOLD",
    amount: "",
    quantity: "",
    startDate: dates?.startDate ?? "",
    endDate: dates?.endDate ?? "",
  };
}
function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number>>,
) {
  const escapeCell = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text)
      ? `"${text.replace(/"/g, '""')}"`
      : text;
  };

  const csv = [headers, ...rows]
    .map((row) => row.map(escapeCell).join(","))
    .join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();

  link.remove();
  URL.revokeObjectURL(url);
}

function formatVoucherUserLabel(voucher: VoucherItem) {
  const name = voucher.name?.trim();
  const email = voucher.email?.trim();

  if (name && email) return `${name} (${email})`;
  if (name) return name;
  if (email) return email;

  return "-";
}

function formatCsvDate(value?: string) {
  if (!value?.trim()) return "-";

  const parts = formatDateTimeParts(value);

  if (!parts) return value.trim();

  return parts.time
    ? `${parts.date} ${parts.time}`
    : parts.date;
}

function downloadVoucherBatchCsv(
  batch: VoucherBatchGroup,
  vouchers: VoucherItem[],
) {
  const headers = [
    "User",
    "Metal Type",
    "Voucher",
    "Pin",
    "Amount",
    "Start Date",
    "End Date",
    "Status",
    "Redeem Date",
  ];

  const rows = vouchers.map((voucher) => [
    formatVoucherUserLabel(voucher),
    formatDisplayValue(voucher.metalType),
    formatDisplayValue(voucher.voucherCode),
    formatDisplayValue(voucher.pin),
    Number.isFinite(voucher.rewardAmount)
      ? voucher.rewardAmount
      : "-",
    formatCsvDate(voucher.startDate),
    formatCsvDate(voucher.endDate),
    formatStatusLabel(voucher.isRedeemed),
    voucher.isRedeemed
      ? formatCsvDate(voucher.redeemDate)
      : "-",
  ]);

  const safeLabel = batch.batchLabel
    .replace(/[^\w-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  const filename =
    `vouchers_${safeLabel || batch.batchId}_${batch.batchId}.csv`;

  downloadCsv(filename, headers, rows);
}
function normalizeSearchValue(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function unwrapPayload(data: unknown): unknown {
  if (data == null) return null;
  if (typeof data !== "object") return data;
  const record = data as Record<string, unknown>;
  return "data" in record ? record.data ?? null : data;
}

function asOptionalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseBatchNumber(batchId: string): number {
  const asNumber = Number(batchId);
  if (Number.isInteger(asNumber) && asNumber >= 0) return asNumber;

  const match = batchId.match(/^BATCH[_-]?0*(\d+)$/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const value = Number(match[1]);
  return Number.isInteger(value) ? value : Number.MAX_SAFE_INTEGER;
}

function normalizeBatchId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return asOptionalString(value);
}

function normalizeRedeemedBy(value: unknown): { name?: string; email?: string } | null {
  if (value == null || value === "") return null;

  if (typeof value === "string") {
    return null;
  }

  const record = asRecord(value);
  if (!record) return null;

  const name = asOptionalString(record.name);
  const email = asOptionalString(record.email);
  if (!name && !email) return null;

  return { name, email };
}

function isTruthyFlag(value: unknown): boolean {
  return value === true || value === 1 || value === "true" || value === "1";
}
function MaskedPinCell({ pin }: { pin: string }) {
  const [visible, setVisible] = useState(false);
  const displayPin = formatDisplayValue(pin);

  if (displayPin === "-") {
    return <span className="font-mono text-sm text-muted-foreground">-</span>;
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-sm">
        {visible ? displayPin : "****"}
      </span>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => setVisible(!visible)}
      >
        {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}
function normalizeVoucherItem(
  value: unknown,
  index: number,
  batchId: string,
  subBatchId?: string,
): VoucherItem | null {
  const record = asRecord(value);
  if (!record) return null;

  const voucherCode = asOptionalString(record.voucherCode) ?? "";
  const pin = asOptionalString(record.pin) ?? "";

  if (!voucherCode && !pin) return null;

  const redeemedBy = normalizeRedeemedBy(record.redeemedBy);
  const redeemDate = asOptionalString(record.redeemDate);
  const isRedeemed =
    isTruthyFlag(record.isRedeemed) || Boolean(redeemDate) || redeemedBy != null;
  const name = redeemedBy?.name;
  const email = redeemedBy?.email;
  const resolvedSubBatchId = subBatchId ?? normalizeBatchId(record.subBatchId);
  const rewardAmount = asFiniteNumber(record.rewardAmount ?? record.amount) ?? 0;

  return {
    id: `${batchId}-${resolvedSubBatchId || "sub"}-${voucherCode || pin || index}`,
    voucherCode: voucherCode || "-",
    pin: pin || "-",
    metalType: asOptionalString(record.metalType) ?? "-",
    rewardAmount,
    startDate: asOptionalString(record.startDate),
    endDate: asOptionalString(record.endDate),
    redeemDate,
    name,
    email,
    isRedeemed,
  };
}

function pickEarliestDate(values: Array<string | undefined>) {
  const times = values
    .map((value) => (value ? new Date(value).getTime() : Number.NaN))
    .filter((time) => Number.isFinite(time));
  if (times.length === 0) return undefined;
  return new Date(Math.min(...times)).toISOString();
}

function pickLatestDate(values: Array<string | undefined>) {
  const times = values
    .map((value) => (value ? new Date(value).getTime() : Number.NaN))
    .filter((time) => Number.isFinite(time));
  if (times.length === 0) return undefined;
  return new Date(Math.max(...times)).toISOString();
}

function summarizeVouchers(vouchers: VoucherItem[]) {
  const metalTypes = [
    ...new Set(vouchers.map((voucher) => voucher.metalType).filter((value) => value && value !== "-")),
  ];
  const amounts = [
    ...new Set(vouchers.map((voucher) => voucher.rewardAmount).filter((value) => Number.isFinite(value))),
  ];
  const redeemed = vouchers.filter((voucher) => voucher.isRedeemed);

  return {
    metalType: metalTypes.join(", ") || "-",
    rewardAmount: amounts.length === 1 ? amounts[0] : 0,
    quantity: vouchers.length,
    availableCount: vouchers.filter((voucher) => !voucher.isRedeemed).length,
    redeemedCount: redeemed.length,
    redeemedAmount: redeemed.reduce((sum, voucher) => sum + voucher.rewardAmount, 0),
    startDate: pickEarliestDate(vouchers.map((voucher) => voucher.startDate)),
    endDate: pickLatestDate(vouchers.map((voucher) => voucher.endDate)),
  };
}

function voucherMatchesTerm(voucher: VoucherItem, term: string) {
  if (!term) return true;
  return [
    voucher.voucherCode,
    voucher.pin,
    voucher.metalType,
    String(voucher.rewardAmount),
    voucher.name,
    voucher.email,
    formatStatusLabel(voucher.isRedeemed),
  ]
    .map(normalizeSearchValue)
    .some((value) => value.includes(term));
}

function normalizeSubBatchGroup(
  value: unknown,
  index: number,
  batchId: string,
): VoucherSubBatchGroup | null {
  const record = asRecord(value);
  if (!record) return null;

  const subBatchId = normalizeBatchId(record.subBatchId) ?? String(index + 1);
  const vouchers = Array.isArray(record.vouchers)
    ? record.vouchers
      .map((item, voucherIndex) => normalizeVoucherItem(item, voucherIndex, batchId, subBatchId))
      .filter((item): item is VoucherItem => item !== null)
    : [];

  const summary = summarizeVouchers(vouchers);

  return {
    id: `${batchId}-${subBatchId}`,
    subBatchId,
    metalType: asOptionalString(record.metalType) ?? summary.metalType,
    rewardAmount: asFiniteNumber(record.rewardAmount ?? record.amount) ?? summary.rewardAmount,
    redeemedAmount: asFiniteNumber(record.redeemedAmount) ?? summary.redeemedAmount,
    quantity: asFiniteNumber(record.quantity) ?? summary.quantity,
    availableCount:
      asFiniteNumber(record.notRedeemedCount ?? record.availableCount) ?? summary.availableCount,
    redeemedCount: asFiniteNumber(record.redeemedCount) ?? summary.redeemedCount,
    startDate: asOptionalString(record.startDate) ?? summary.startDate,
    endDate: asOptionalString(record.endDate) ?? summary.endDate,
    vouchers,
  };
}

function normalizeBatchGroup(value: unknown): VoucherBatchGroup | null {
  const record = asRecord(value);
  if (!record) return null;

  const batchId = normalizeBatchId(record.batchId);
  if (!batchId) return null;

  let subBatches: VoucherSubBatchGroup[] = [];

  if (Array.isArray(record.subBatches)) {
    subBatches = record.subBatches
      .map((item, index) => normalizeSubBatchGroup(item, index, batchId))
      .filter((item): item is VoucherSubBatchGroup => item !== null)
      .sort((a, b) => Number(a.subBatchId) - Number(b.subBatchId));
  } else if (Array.isArray(record.vouchers)) {
    const grouped = new Map<string, VoucherItem[]>();
    record.vouchers.forEach((item, index) => {
      const voucherRecord = asRecord(item);
      const subBatchId = normalizeBatchId(voucherRecord?.subBatchId) ?? "1";
      const voucher = normalizeVoucherItem(item, index, batchId, subBatchId);
      if (!voucher) return;
      const current = grouped.get(subBatchId) ?? [];
      current.push(voucher);
      grouped.set(subBatchId, current);
    });

    subBatches = [...grouped.entries()]
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([subBatchId, vouchers]) => {
        const summary = summarizeVouchers(vouchers);
        return {
          id: `${batchId}-${subBatchId}`,
          subBatchId,
          ...summary,
          vouchers,
        };
      });
  }

  const allVouchers = subBatches.flatMap((subBatch) => subBatch.vouchers);
  const summary = summarizeVouchers(allVouchers);
  const batchNumber = parseBatchNumber(batchId);
  const batchName = asOptionalString(record.batchName);

  return {
    batchId,
    batchName,
    batchNumber,
    batchLabel: batchName ?? batchId,
    metalType: asOptionalString(record.metalType) ?? summary.metalType,
    redeemedAmount: asFiniteNumber(record.redeemedAmount) ?? summary.redeemedAmount,
    quantity: asFiniteNumber(record.quantity) ?? summary.quantity,
    availableCount:
      asFiniteNumber(record.notRedeemedCount ?? record.availableCount) ?? summary.availableCount,
    redeemedCount: asFiniteNumber(record.redeemedCount) ?? summary.redeemedCount,
    subBatches,
    vouchers: allVouchers,
  };
}

function normalizeBatchGroups(data: unknown): VoucherBatchGroup[] {
  const payload = unwrapPayload(data);
  if (payload == null) return [];

  let list: unknown[] | null = null;

  if (Array.isArray(payload)) {
    list = payload;
  } else if (typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.batches)) {
      list = record.batches;
    } else if (Array.isArray(record.rewards)) {
      list = record.rewards;
    } else if (Array.isArray(record.data)) {
      list = record.data;
    }
  }

  if (list) {
    return list
      .map(normalizeBatchGroup)
      .filter((batch): batch is VoucherBatchGroup => batch !== null)
      .sort((a, b) => {
        if (a.batchNumber !== b.batchNumber) return a.batchNumber - b.batchNumber;
        return normalizeSearchValue(a.batchId).localeCompare(normalizeSearchValue(b.batchId));
      });
  }

  const single = normalizeBatchGroup(payload);
  return single ? [single] : [];
}

function formatAmount(amount: number) {
  if (!Number.isFinite(amount)) return "-";
  return `₹${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

function formatDisplayValue(value: unknown) {
  if (value == null) return "-";
  const text = String(value).trim();
  return text.length > 0 ? text : "-";
}

function DateTimeCell({ value }: { value?: string }) {
  if (!value || !value.trim()) return <span>-</span>;
  const parts = formatDateTimeParts(value);
  if (!parts) return <span>-</span>;

  return (
    <div className="flex flex-col gap-0.5 leading-tight">
      <span>{parts.date}</span>
      <span className="text-muted-foreground">{parts.time}</span>
    </div>
  );
}

function getStartOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function getMinDateForEnd(startDate?: string) {
  const today = getStartOfToday();
  const start = parseDateInputValue(startDate ?? "");
  if (!start) return today;
  start.setHours(0, 0, 0, 0);
  const dayAfterStart = new Date(start);
  dayAfterStart.setDate(dayAfterStart.getDate() + 1);
  return dayAfterStart.getTime() > today.getTime() ? dayAfterStart : today;
}

function formatStatusLabel(isRedeemed: boolean) {
  return isRedeemed ? "Redeemed" : "Pending";
}

const VOUCHER_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "pending", label: "Pending" },
  { value: "redeemed", label: "Redeemed" },
] as const;

type VoucherStatusFilter = (typeof VOUCHER_STATUS_FILTER_OPTIONS)[number]["value"];

function voucherMatchesStatus(voucher: VoucherItem, status: VoucherStatusFilter) {
  if (status === "all") return true;
  if (status === "redeemed") return voucher.isRedeemed;
  return !voucher.isRedeemed;
}

function statusBadgeVariant(isRedeemed: boolean): "success" | "warning" {
  return isRedeemed ? "success" : "warning";
}

function RedeemedByCell({ name, email }: { name?: string; email?: string }) {
  if (!name && !email) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }

  const initial = String(name ?? email ?? "?").charAt(0).toUpperCase();

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 font-bold text-primary">
        {initial}
      </div>
      <div className="min-w-0">
        <p className="truncate font-semibold text-foreground">{formatDisplayValue(name)}</p>
        <p className="truncate text-xs text-muted-foreground">{formatDisplayValue(email)}</p>
      </div>
    </div>
  );
}

type VoucherSortKey = "status";

function VoucherDetailsTable({
  rows,
  statusFilter,
  onStatusFilterChange,
}: {
  rows: VoucherItem[];
  statusFilter: VoucherStatusFilter;
  onStatusFilterChange: (value: string) => void;
}) {
  const { sortKey, sortDirection, directionFactor, handleSort } =
    useTableSort<VoucherSortKey>();

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;

    return [...rows].sort((a, b) => {
      if (sortKey === "status") {
        return (
          Number(a.isRedeemed) - Number(b.isRedeemed)
        ) * directionFactor;
      }
      return 0;
    });
  }, [directionFactor, rows, sortKey]);

  if (rows.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-muted-foreground">
        No vouchers found in this batch.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <table className="w-full min-w-[1020px] text-left text-sm text-foreground">
        <thead className="table-head-sticky">
          <tr>
            <th className="px-4 py-3 font-medium">USER</th>
            <th className="px-4 py-3 font-medium">METAL TYPE</th>
            <th className="px-4 py-3 font-medium">VOUCHER CODE</th>
            <th className="px-4 py-3 font-medium">PIN</th>
            <th className="px-4 py-3 font-medium">AMOUNT</th>
            <th className="px-4 py-3 font-medium">START DATE</th>
            <th className="px-4 py-3 font-medium">END DATE</th>
            <th className="px-4 py-3 font-medium">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleSort("status")}
                  className={getSortToggleClass(sortKey === "status")}
                >
                  STATUS{" "}
                  <SortDirectionIcon active={sortKey === "status"} direction={sortDirection} />
                </button>
                <TableHeaderFilter
                  title="Status"
                  value={statusFilter}
                  onChange={onStatusFilterChange}
                  options={[...VOUCHER_STATUS_FILTER_OPTIONS]}
                  activeWhen={(value) => value !== "all"}
                  clearValue="all"
                />
              </div>
            </th>
            <th className="px-4 py-3 font-medium">REDEEM DATE</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((voucher) => (
            <tr
              key={voucher.id}
              className="border-b border-border transition-colors last:border-0 hover:bg-muted"
            >
              <td className="px-4 py-3">
                <RedeemedByCell name={voucher.name} email={voucher.email} />
              </td>
                <td className="px-4 py-3 font-mono text-sm text-muted-foreground">
                {formatDisplayValue(voucher.metalType)}
              </td>
              <td className="px-4 py-3 font-mono text-sm text-muted-foreground">
                {formatDisplayValue(voucher.voucherCode)}
              </td>
              <td className="px-4 py-3 font-mono text-sm text-muted-foreground">
                <MaskedPinCell pin={voucher.pin} />
              </td>
              <td className="px-4 py-3 text-sm font-bold text-foreground">
                {formatAmount(voucher.rewardAmount)}
              </td>
              
              <td className="px-4 py-3 text-sm text-muted-foreground">
                <DateTimeCell value={voucher.startDate} />
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground">
                <DateTimeCell value={voucher.endDate} />
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground">
                <Badge
                  variant={statusBadgeVariant(voucher.isRedeemed)}
                  className="uppercase"
                >
                  {formatStatusLabel(voucher.isRedeemed)}
                </Badge>
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground">
                {voucher.isRedeemed ? <DateTimeCell value={voucher.redeemDate} /> : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function VouchersPage() {
  const [searchTerm, setSearchTerm] = usePersistedSearchTerm(
    createPersistedSearchTermKey("vouchers"),
  );
  const [dateRange, setDateRange] = usePersistedDateRange(
    createPersistedDateRangeKey("vouchers"),
  );
  const [statusFilter, setStatusFilter] = useState<VoucherStatusFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [batchName, setBatchName] = useState("");
  const [rows, setRows] = useState<VoucherBatchRow[]>(() => [createBatchRow()]);
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const { sortKey, sortDirection, directionFactor, handleSort } =
    useTableSort<BatchSortKey>();

  const { data, isLoading, isFetching, isError, refetch } = useGetVoucherRewards();
  const createMutation = useCreateVoucherBatch();

  const batchGroups = useMemo(() => normalizeBatchGroups(data ?? null), [data]);

  const filteredBatches = useMemo(() => {
    const term = normalizeSearchValue(searchTerm);

    return batchGroups.filter((batch) => {
      if (
        dateRange?.from &&
        !batch.vouchers.some((voucher) => isDateInRange(voucher.startDate, dateRange))
      ) {
        return false;
      }
      if (
        statusFilter !== "all" &&
        !batch.vouchers.some((voucher) => voucherMatchesStatus(voucher, statusFilter))
      ) {
        return false;
      }
      if (!term) return true;

      const batchMatches = [
        batch.batchLabel,
        batch.batchName,
        batch.batchId,
        batch.metalType,
        String(batch.redeemedAmount),
        String(batch.quantity),
        String(batch.availableCount),
      ]
        .map(normalizeSearchValue)
        .some((value) => value.includes(term));

      if (batchMatches) return true;

      return batch.vouchers.some((voucher) => voucherMatchesTerm(voucher, term));
    });
  }, [batchGroups, dateRange, searchTerm, statusFilter]);

  const sortedBatches = useMemo(() => {
    if (!sortKey) return filteredBatches;

    return [...filteredBatches].sort((a, b) => {
      if (sortKey === "batch") {
        if (a.batchNumber !== b.batchNumber) {
          return (a.batchNumber - b.batchNumber) * directionFactor;
        }
        return (
          normalizeSearchValue(a.batchLabel).localeCompare(normalizeSearchValue(b.batchLabel)) *
          directionFactor
        );
      }
      if (sortKey === "metalType") {
        return (
          normalizeSearchValue(a.metalType).localeCompare(normalizeSearchValue(b.metalType)) *
          directionFactor
        );
      }
      if (sortKey === "amount") {
        return (a.redeemedAmount - b.redeemedAmount) * directionFactor;
      }
      if (sortKey === "quantity") {
        return (a.quantity - b.quantity) * directionFactor;
      }
      return 0;
    });
  }, [directionFactor, filteredBatches, sortKey]);

  const pagination = useTablePagination(sortedBatches);

  useEffect(() => {
    pagination.resetPage();
    setExpandedBatchId(null);
  }, [pagination.resetPage, searchTerm, dateRange, sortKey, sortDirection]);

  useEffect(() => {
    pagination.resetPage();
    if (
      expandedBatchId &&
      !filteredBatches.some((batch) => batch.batchId === expandedBatchId)
    ) {
      setExpandedBatchId(null);
    }
  }, [expandedBatchId, filteredBatches, pagination.resetPage, statusFilter]);

  const toggleBatchExpand = useCallback((batchId: string) => {
    setExpandedBatchId((current) => (current === batchId ? null : batchId));
  }, []);

  const visibleBatches = useMemo(() => {
    if (expandedBatchId) {
      return sortedBatches.filter((batch) => batch.batchId === expandedBatchId);
    }
    return pagination.pagedItems;
  }, [expandedBatchId, pagination.pagedItems, sortedBatches]);

  const updateRow = (id: string, key: keyof Omit<VoucherBatchRow, "id">, value: string) => {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, [key]: value } : row)),
    );
  };

  const resetCreateForm = () => {
    setBatchName("");
    setRows([createBatchRow()]);
  };

  const handleAddRow = () => {
    setRows((current) => {
      const lastRow = current[current.length - 1];

      return [
        ...current,
        createBatchRow({
          startDate: lastRow?.startDate || "",
          endDate: lastRow?.endDate || "",
        }),
      ];
    });
  };

  const handleRemoveRow = (id: string) => {
    setRows((current) => (current.length <= 1 ? current : current.filter((row) => row.id !== id)));
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (!open && createMutation.isPending) return;
    setCreateOpen(open);
    if (!open) {
      resetCreateForm();
    }
  };

  const handleSubmit = async () => {
    const trimmedBatchName = batchName.trim();
    if (!trimmedBatchName) {
      toast({
        title: "Missing batch name",
        description: "Enter a name for this voucher batch.",
      });
      return;
    }

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const rowLabel = `sub-batch ${index + 1}`;

      if (!row.metalType?.trim()) {
        toast({
          title: "Missing metal type",
          description: `Select a metal type for ${rowLabel}.`,
        });
        return;
      }

      const amount = Number(row.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        toast({
          title: "Invalid amount",
          description: `Enter a valid positive amount for ${rowLabel}.`,
        });
        return;
      }

      const quantity = Number(row.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
        toast({
          title: "Invalid quantity",
          description: `Enter a quantity between 1 and 1000 for ${rowLabel}.`,
        });
        return;
      }

      if (!row.startDate?.trim()) {
        toast({
          title: "Missing start date",
          description: `Select a start date for ${rowLabel}.`,
        });
        return;
      }

      if (!row.endDate?.trim()) {
        toast({
          title: "Missing end date",
          description: `Select an end date for ${rowLabel}.`,
        });
        return;
      }

      const start = parseDateInputValue(row.startDate);
      const end = parseDateInputValue(row.endDate);
      if (!start || !end || end.getTime() <= start.getTime()) {
        toast({
          title: "Invalid date range",
          description: `End date must be after the start date for ${rowLabel}.`,
        });
        return;
      }
    }

    try {
      const subBatches = rows.map((row) => ({
        metalType: row.metalType.trim(),
        rewardAmount: Number(row.amount),
        quantity: Number(row.quantity),
        startDate: row.startDate.trim(),
        endDate: row.endDate.trim(),
      }));

      await createMutation.mutateAsync({
        batchName: trimmedBatchName,
        subBatches,
      });

      const voucherCount = subBatches.reduce((total, subBatch) => total + subBatch.quantity, 0);
      toast({
        title: "Voucher batch created",
        description: `${voucherCount} voucher${voucherCount === 1 ? "" : "s"} created across ${subBatches.length} sub-batch${subBatches.length === 1 ? "" : "es"}.`,
      });
      setCreateOpen(false);
      resetCreateForm();
      setExpandedBatchId(null);
      await refetch();
    } catch (error) {
      toast({
        title: "Create failed",
        description: error instanceof Error ? error.message : "Failed to create voucher batch.",
        variant: "destructive",
      });
    }
  };

  return (
    <Layout title="Vouchers">
      <Card className="flex h-[calc(100vh-7.5rem)] flex-col">
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm lg:flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by batch, code, pin, metal..."
              className="pl-10"
            />
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
            <DateRangePicker
              value={dateRange}
              onChange={setDateRange}
              calendarClassName="[--cell-size:1.55rem]"
            />
            <Button
              size="sm"
              className={cn(
                "shrink-0 cursor-pointer gap-2 !text-white [&_svg]:!stroke-white [&_svg]:!text-white",
              )}
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4 shrink-0 !stroke-white !text-white" />
              Create Voucher
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[860px] text-left text-sm text-foreground">
            <thead className="table-head-sticky">
              <tr>
                <th className="w-[44px] px-4 py-3 font-medium normal-case"> </th>
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    onClick={() => handleSort("batch")}
                    className={getSortToggleClass(sortKey === "batch")}
                  >
                    Batch{" "}
                    <SortDirectionIcon active={sortKey === "batch"} direction={sortDirection} />
                  </button>
                </th>
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    onClick={() => handleSort("metalType")}
                    className={getSortToggleClass(sortKey === "metalType")}
                  >
                    Metal Type{" "}
                    <SortDirectionIcon
                      active={sortKey === "metalType"}
                      direction={sortDirection}
                    />
                  </button>
                </th>
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    onClick={() => handleSort("amount")}
                    className={getSortToggleClass(sortKey === "amount")}
                  >
                    Redeemed Amount{" "}
                    <SortDirectionIcon active={sortKey === "amount"} direction={sortDirection} />
                  </button>
                </th>
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    onClick={() => handleSort("quantity")}
                    className={getSortToggleClass(sortKey === "quantity")}
                  >
                    Quantity{" "}
                    <SortDirectionIcon active={sortKey === "quantity"} direction={sortDirection} />
                  </button>
                </th>
                <th className="px-4 py-3 font-medium">Pending</th>
                <th className="w-[52px] px-4 py-3 font-medium">
                  Download Voucher
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading || isFetching ? (
                <tr>
                  <td
                    colSpan={BATCH_TABLE_COLUMN_COUNT}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    Loading voucher batches...
                  </td>
                </tr>
              ) : isError ? (
                <tr>
                  <td
                    colSpan={BATCH_TABLE_COLUMN_COUNT}
                    className="px-4 py-10 text-center text-sm text-destructive"
                  >
                    Failed to load voucher batches.
                  </td>
                </tr>
              ) : batchGroups.length === 0 ? (
                <tr>
                  <td
                    colSpan={BATCH_TABLE_COLUMN_COUNT}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    No voucher batches found.
                  </td>
                </tr>
              ) : filteredBatches.length === 0 ? (
                <tr>
                  <td
                    colSpan={BATCH_TABLE_COLUMN_COUNT}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    No batches match your filters.
                  </td>
                </tr>
              ) : (
                visibleBatches.map((batch) => {
                  const isExpanded = expandedBatchId === batch.batchId;
                  const term = normalizeSearchValue(searchTerm);
                  const detailVouchers = batch.vouchers.filter((voucher) => {
                    if (!voucherMatchesStatus(voucher, statusFilter)) return false;
                    if (term.length === 0) return true;
                    return voucherMatchesTerm(voucher, term);
                  });
                  return (
                    <Fragment key={batch.batchId}>
                      <tr
                        tabIndex={0}
                        role="row"
                        onClick={() => toggleBatchExpand(batch.batchId)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleBatchExpand(batch.batchId);
                          }
                        }}
                        className={cn(
                          "cursor-pointer border-b border-border transition-colors hover:bg-muted",
                          isExpanded && "bg-muted/40",
                        )}
                      >
                        <td className="w-[44px] px-4 py-3" onClick={(event) => event.stopPropagation()}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            aria-expanded={isExpanded}
                            aria-label={isExpanded ? "Collapse batch vouchers" : "Expand batch vouchers"}
                            onClick={() => toggleBatchExpand(batch.batchId)}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-muted-foreground">
                          <p className="truncate font-semibold text-foreground">
                            {formatDisplayValue(batch.batchLabel)}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {formatDisplayValue(batch.metalType)}
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-foreground">
                          {formatAmount(batch.redeemedAmount)}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {formatDisplayValue(batch.quantity)}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {formatDisplayValue(batch.availableCount)}
                        </td>
                        <td
                          className="w-[52px] px-4 py-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            aria-label={`Download vouchers for ${batch.batchLabel}`}
                            onClick={() => downloadVoucherBatchCsv(batch, batch.vouchers)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="border-b border-border bg-muted/30">
                          <td colSpan={BATCH_TABLE_COLUMN_COUNT} className="p-0">
                            <div className="p-4" onClick={(event) => event.stopPropagation()}>
                              <VoucherDetailsTable
                                rows={detailVouchers}
                                statusFilter={statusFilter}
                                onStatusFilterChange={(value) =>
                                  setStatusFilter(value as VoucherStatusFilter)
                                }
                              />
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!expandedBatchId ? (
          <TablePaginationFooter
            {...bindTablePaginationFooter(pagination)}
            itemLabel="batches"
          />
        ) : null}
      </Card>

      <Dialog open={createOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="flex max-h-[85vh] w-[min(1100px,calc(100vw-2rem))] max-w-[1100px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1100px]"
          closeDisabled={createMutation.isPending}
          onInteractOutside={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            if (createMutation.isPending) event.preventDefault();
          }}
        >
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4 text-left">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Ticket className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle>Create Voucher Batch</DialogTitle>
                <DialogDescription>
                  Name this batch, then add sub-batches. Each row creates vouchers for one sub-batch.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
            <div className="mb-4 w-100">
              <label htmlFor="voucher-batch-name" className="mb-1.5 block text-sm font-medium text-foreground">
                Batch Name
              </label>
              <Input
                id="voucher-batch-name"
                value={batchName}
                onChange={(event) => setBatchName(event.target.value)}
                placeholder="Diwali Gold Silver Voucher Batch"
                className="h-10 rounded-xl border-border bg-background"
                disabled={createMutation.isPending}
              />
            </div>

            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full min-w-[980px] text-left text-sm text-foreground">
                <thead className="table-head-sticky">
                  <tr>
                    <th className="px-3 py-3 text-left font-medium">Metal Type</th>
                    <th className="px-3 py-3 text-left font-medium">Amount</th>
                    <th className="px-3 py-3 text-left font-medium">Quantity</th>
                    <th className="px-3 py-3 text-left font-medium">Start Date</th>
                    <th className="px-3 py-3 text-left font-medium">End Date</th>
                    <th className="w-[52px] px-3 py-3 text-left font-medium">
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-3 align-middle">
                        <Select
                          value={row.metalType}
                          onValueChange={(value) => updateRow(row.id, "metalType", value)}
                        >
                          <SelectTrigger className="h-10 w-full min-w-[120px] rounded-xl border-border bg-background">
                            <SelectValue placeholder="Select metal" />
                          </SelectTrigger>
                          <SelectContent>
                            {METAL_TYPE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                            ₹
                          </span>
                          <Input
                            type="number"
                            min="1"
                            step="0.01"
                            value={row.amount}
                            onChange={(event) => updateRow(row.id, "amount", event.target.value)}
                            placeholder="1000"
                            className="h-10 w-full min-w-[120px] rounded-xl border-border bg-background pl-7"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <Input
                          type="number"
                          min="1"
                          max="1000"
                          step="1"
                          value={row.quantity}
                          onChange={(event) =>
                            updateRow(row.id, "quantity", event.target.value.replace(/[^\d]/g, ""))
                          }
                          placeholder="100"
                          className="h-10 w-full min-w-[100px] rounded-xl border-border bg-background"
                        />
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <SingleDatePicker
                          value={row.startDate}
                          onChange={(value) => {
                            setRows((current) =>
                              current.map((item) => {
                                if (item.id !== row.id) return item;
                                const end = parseDateInputValue(item.endDate);
                                const nextStart = parseDateInputValue(value);
                                const shouldClearEnd = Boolean(
                                  end && nextStart && end.getTime() < nextStart.getTime(),
                                );
                                return {
                                  ...item,
                                  startDate: value,
                                  endDate: shouldClearEnd ? "" : item.endDate,
                                };
                              }),
                            );
                          }}
                          className="h-10 w-full min-w-[160px]"
                          disabled={{ before: getStartOfToday() }}
                        />
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <SingleDatePicker
                          value={row.endDate}
                          onChange={(value) => updateRow(row.id, "endDate", value)}
                          className="h-10 w-full min-w-[160px]"
                          disabled={{ before: getMinDateForEnd(row.startDate) }}
                        />
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemoveRow(row.id)}
                          disabled={createMutation.isPending || rows.length <= 1}
                          aria-label="Remove sub-batch"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Button
              type="button"
              variant="outline"
              className="mt-4 gap-2 cursor-pointer"
              onClick={handleAddRow}
              disabled={createMutation.isPending}
            >
              <Plus className="h-4 w-4" />
              Add Sub-batch
            </Button>
          </div>

          <DialogFooter className="shrink-0 border-t border-border px-5 py-3.5 sm:justify-end sm:space-x-0">
            <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
              <Button
                variant="outline"
                className="cursor-pointer"
                onClick={() => handleDialogOpenChange(false)}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="default"
                className="cursor-pointer gap-2"
                onClick={handleSubmit}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
