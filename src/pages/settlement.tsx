import * as React from "react";
import { ChevronDown, ChevronRight, Download, DownloadCloud, Eye, Search, ArrowRightLeft, CheckCheck } from "lucide-react";
import { Layout } from "@/components/layout";
import { Badge, Button, Card, Input } from "@/components/ui";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { exportToExcel } from "@/lib/export-to-excel";
import { SingleDatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ImagePreviewModal from "@/components/ui/ImagePreviewModal";
import {
  fetchAllSettlements,
  fetchPaymentSettlementAmount,
  fetchSettlementByDate,
  getAmountFromResponse,
  submitSettlement,
} from "@/lib/custom-fetch";
import { getSortToggleClass, SortDirectionIcon, useTableSort } from "@/lib/table-sort";
import { formatCurrency, cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { getTodayDateInputValue } from "@/lib/date-range";
import { TablePaginationFooter } from "@/components/table-pagination-footer";
import { bindTablePaginationFooter, useTablePagination } from "@/lib/table-pagination";
import {
  usePersistedSearchTerm,
  usePersistedDateValue,
  createPersistedSearchTermKey,
  createPersistedDateValueKey,
} from "@/lib/persisted-page-filters";
import { downloadPlatformFeeInvoice, shouldShowPlatformFeeInvoiceActions } from "@/lib/platform-fee-invoice";

type SettlementTransaction = {
  id: string;
  userId?: string;
  userName?: string;
  user?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  providerId?: string;
  merchantTransactionId?: string;
  razorpayPaymentId?: string;
  transactionType?: string;
  type?: string;
  amount?: number;
  totalPaidAmount?: number;
  platformFee?: number;
  platformFeeInvoiceUrl?: string;
  status?: string;
  metalType?: string;
  createdAt?: string;
  executedAt?: string;
  failureReason?: string;
  referenceId?: string;
  invoiceNumber?: string;
  invoiceUrl?: string;
  externalPaymentId?: string;
};

type SettlementSortKey = "transaction" | "invoice" | "metal" | "amount" | "date";

const SETTLEMENT_TABS = ["Settlement", "Settled"] as const;
type SettlementTab = (typeof SETTLEMENT_TABS)[number];

type AllSettlementRecord = {
  id: string;
  settlementOnDate: string;
  settlementForDate: string;
  totalAmount: number;
  utrId: string;
  type: string;
  transactionIds: string[];
  settledBy?: string;
  isActive?: boolean;
};

/** Use UTC calendar parts so `YYYY-MM-DDT00:00:00.000Z` maps to that same calendar date in the date input. */
function isoToDateInputValue(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return getTodayDateInputValue();
  const y = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${month}-${day}`;
}

function formatSettlementTableDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function dateInputToUtcStartMs(yyyyMmDd: string) {
  const parts = yyyyMmDd.split("-").map(Number);
  const [y, m, d] = parts;
  if (!y || !m || !d) return Number.NaN;
  return Date.UTC(y, m - 1, d);
}

function settledDateUtcMidnightMs(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return Number.NaN;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function isAllSettlementInDateRange(row: AllSettlementRecord, from: string, to: string) {
  const t = settledDateUtcMidnightMs(row.settlementOnDate);
  if (Number.isNaN(t)) return true;
  if (from) {
    const fromMs = dateInputToUtcStartMs(from);
    if (!Number.isNaN(fromMs) && t < fromMs) return false;
  }
  if (to) {
    const toMs = dateInputToUtcStartMs(to);
    if (!Number.isNaN(toMs) && t > toMs) return false;
  }
  return true;
}

function settledRowMatchesSearch(row: AllSettlementRecord, normalizedTerm: string) {
  if (!normalizedTerm) return true;
  const fields = [
    row.id,
    row.utrId,
    row.type,
    row.settledBy,
    String(row.totalAmount),
    formatSettlementTableDate(row.settlementOnDate),
    row.settlementOnDate ? isoToDateInputValue(row.settlementOnDate) : "",
    row.transactionIds.join(" "),
  ]
    .map(normalizeSearchValue)
    .filter(Boolean);
  return fields.some((value) => value.includes(normalizedTerm));
}

function normalizeSettlementRow(value: unknown): AllSettlementRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const rawId = record._id ?? record.id;
  if (typeof rawId !== "string") return null;
  const idsRaw = record.transactionIds;
  const transactionIds = Array.isArray(idsRaw)
    ? idsRaw.filter((x): x is string => typeof x === "string")
    : [];
  const totalRaw = record.totalAmount;
  const totalAmount =
    typeof totalRaw === "number" ? totalRaw : Number.isFinite(Number(totalRaw)) ? Number(totalRaw) : 0;

  return {
    id: rawId,
    settlementOnDate: typeof record.settlementOnDate === "string" ? record.settlementOnDate : "",
    totalAmount,
    utrId: typeof record.utrId === "string" ? record.utrId : String(record.utrId ?? ""),
    type: typeof record.type === "string" ? record.type : "",
    transactionIds,
    settledBy: typeof record.settledBy === "string" ? record.settledBy : undefined,
    isActive: typeof record.isActive === "boolean" ? record.isActive : undefined,
    settlementForDate:
      typeof record.settlementForDate === "string"
        ? record.settlementForDate
        : "",
  };
}
function normalizeTransaction(value: unknown): SettlementTransaction | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const rawId = record.id ?? record._id;
  if (typeof rawId !== "string") return null;

  const user = record.user && typeof record.user === "object" ? (record.user as Record<string, unknown>) : undefined;

  return {
    id: rawId,
    userId: typeof record.userId === "string" ? record.userId : undefined,
    userName: typeof user?.name === "string" ? user.name : undefined,
    user: user
      ? {
        name: typeof user.name === "string" ? user.name : undefined,
        email: typeof user.email === "string" ? user.email : undefined,
        phone: typeof user.phone === "string" ? user.phone : undefined,
      }
      : undefined,
    providerId: typeof record.providerId === "string" ? record.providerId : undefined,
    merchantTransactionId: typeof record.merchantTransactionId === "string" ? record.merchantTransactionId : undefined,
    razorpayPaymentId: typeof record.razorpayPaymentId === "string" ? record.razorpayPaymentId : undefined,
    transactionType:
      typeof record.transactionType === "string"
        ? record.transactionType
        : typeof record.type === "string"
          ? record.type
          : undefined,
    type:
      typeof record.transactionType === "string"
        ? record.transactionType
        : typeof record.type === "string"
          ? record.type
          : undefined,
    amount:
      typeof record.totalAmount === "number"
        ? record.totalAmount
        : typeof record.amount === "number"
          ? record.amount
          : undefined,
    totalPaidAmount:
      typeof record.totalPaidAmount === "number" ? record.totalPaidAmount : undefined,
    platformFee: typeof record.platformFee === "number" ? record.platformFee : undefined,
    platformFeeInvoiceUrl:
      typeof record.platformFeeInvoiceUrl === "string" ? record.platformFeeInvoiceUrl : undefined,
    status: typeof record.status === "string" ? record.status : undefined,
    metalType: typeof record.metalType === "string" ? record.metalType : undefined,
    createdAt:
      typeof record.createdAt === "string"
        ? record.createdAt
        : typeof record.executedAt === "string"
          ? record.executedAt
          : undefined,
    executedAt: typeof record.executedAt === "string" ? record.executedAt : undefined,
    failureReason: typeof record.failureReason === "string" ? record.failureReason : undefined,
    referenceId:
      typeof record.merchantTransactionId === "string"
        ? record.merchantTransactionId
        : typeof record.externalPaymentId === "string"
          ? record.externalPaymentId
          : typeof record.invoiceNumber === "string"
            ? record.invoiceNumber
            : undefined,
    invoiceNumber: typeof record.invoiceNumber === "string" ? record.invoiceNumber : undefined,
    invoiceUrl: typeof record.invoiceUrl === "string" ? record.invoiceUrl : undefined,
    externalPaymentId: typeof record.externalPaymentId === "string" ? record.externalPaymentId : undefined,
  };
}


function normalizeSearchValue(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function formatTransactionType(type?: string) {
  return String(type ?? "-").replace(/_/g, " ").toUpperCase();
}

function formatTransactionDateTime(value?: string) {
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

function statusBadgeVariant(status?: string) {
  const normalized = normalizeSearchValue(status);
  if (normalized.includes("success") || normalized.includes("complete") || normalized.includes("paid")) return "success";
  if (normalized.includes("pending") || normalized.includes("processing")) return "warning";
  if (normalized.includes("fail") || normalized.includes("cancel") || normalized.includes("refund")) return "destructive";
  return "outline";
}

function PlatformFeeCell({
  txn,
  onPreview,
}: {
  txn: SettlementTransaction;
  onPreview: (url: string | null, label?: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <p className="text-sm text-foreground">
        {typeof txn.platformFee === "number" ? formatCurrency(txn.platformFee) : "-"}
      </p>
      {shouldShowPlatformFeeInvoiceActions(txn) ? (
        <>
          <button
            type="button"
            onClick={() => {
              onPreview(txn.platformFeeInvoiceUrl ?? null, `Platform Fee - ${txn.id}`);
            }}
            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
            title="Preview platform fee invoice"
            aria-label={`Preview platform fee invoice for ${txn.id}`}
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void downloadPlatformFeeInvoice(txn)}
            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
            title="Download platform fee invoice"
            aria-label={`Download platform fee invoice for ${txn.id}`}
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </>
      ) : null}
    </div>
  );
}

function SettlementTransactionsDetailTable({
  rows,
  onPreviewInvoice,
}: {
  rows: SettlementTransaction[];
  onPreviewInvoice: (url: string | null, label?: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-muted-foreground">
        No matching transactions found for this settlement on the settled date.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <table className="w-full text-left text-sm text-foreground">
        <thead className="bg-muted text-sm  text-muted-foreground">
          <tr>
            <th className="w-[170px] px-3 py-3 font-medium">Transaction Content</th>
            <th className="w-[120px] px-4 py-3 font-medium">Invoice</th>
            <th className="w-[120px] px-4 py-3 font-medium">Metal Type</th>
            <th className="w-[120px] px-4 py-3 font-medium">Amount</th>
            <th className="w-[140px] px-4 py-3 font-medium">Total Paid Amount</th>
            <th className="w-[120px] px-4 py-3 font-medium">Platform Fee</th>
            <th className="w-[120px] px-4 py-3 font-medium">Status</th>
            <th className="w-[160px] px-4 py-3 font-medium">Date & Time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((txn) => {
            const transactionId = txn.razorpayPaymentId ?? txn.merchantTransactionId ?? txn.id;
            return (
              <tr
                key={`${transactionId}-${txn.createdAt ?? txn.executedAt ?? txn.id}`}
                className="border-b border-border transition-colors last:border-0 hover:bg-muted"
              >
                <td className="w-[170px] px-3 py-3">
                  <p className="max-w-[140px] truncate font-mono text-sm text-muted-foreground" title={transactionId}>
                    {transactionId}
                  </p>
                  <p className="font-mono text-sm text-muted-foreground">
                    {formatTransactionType(txn.transactionType ?? txn.type)}
                  </p>
                </td>
                <td className="px-4 py-3">
                  {txn.invoiceUrl && txn.invoiceNumber ? (
                    <button
                      type="button"
                      onClick={() => onPreviewInvoice(txn.invoiceUrl ?? null, txn.invoiceNumber)}
                      className="inline-flex cursor-pointer items-center gap-1 font-mono text-sm text-muted-foreground hover:opacity-80"
                      title={txn.invoiceUrl}
                    >
                      {txn.invoiceNumber}
                      <Eye className="h-3.5 w-4 text-primary" />
                    </button>
                  ) : (
                    <p className="font-mono text-sm text-muted-foreground">{txn.invoiceNumber ?? "-"}</p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <p className="font-mono text-sm text-muted-foreground">{txn.metalType ?? "-"}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="font-bold text-foreground">
                    {typeof txn.amount === "number" ? formatCurrency(txn.amount) : "-"}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-sm text-foreground">
                    {typeof txn.totalPaidAmount === "number" ? formatCurrency(txn.totalPaidAmount) : "-"}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <PlatformFeeCell txn={txn} onPreview={onPreviewInvoice} />
                </td>
                <td className="px-4 py-3">
                  <Badge variant={statusBadgeVariant(txn.status)} className="capitalize text-sm">
                    {String(txn.status ?? "unknown").toUpperCase()}
                  </Badge>
                  {txn.failureReason ? (
                    <p className="mt-1 max-w-[150px] truncate text-sm text-destructive" title={txn.failureReason}>
                      {txn.failureReason}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  <p>{formatTransactionDateTime(txn.createdAt ?? txn.executedAt)}</p>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function matchesSearch(txn: SettlementTransaction, term: string) {
  if (!term) return true;
  return [
    txn.id,
    txn.userId,
    txn.userName,
    txn.user?.name,
    txn.user?.email,
    txn.user?.phone,
    txn.providerId,
    txn.referenceId,
    txn.invoiceNumber,
    txn.externalPaymentId,
    txn.merchantTransactionId,
    txn.razorpayPaymentId,
    txn.transactionType ?? txn.type,
    txn.metalType,
  ]
    .map(normalizeSearchValue)
    .some((value) => value.includes(term));
}

function getLoggedInUserId() {
  if (typeof window === "undefined") return "";

  const directId = window.localStorage.getItem("id");
  if (directId) return directId;

  const rawUser = window.localStorage.getItem("user");
  if (!rawUser) return "";

  try {
    const parsed = JSON.parse(rawUser) as Record<string, unknown>;
    const nestedUser = parsed.user && typeof parsed.user === "object" ? (parsed.user as Record<string, unknown>) : undefined;
    const id =
      parsed.id ??
      parsed._id ??
      parsed.userId ??
      nestedUser?.id ??
      nestedUser?._id ??
      nestedUser?.userId;

    return typeof id === "string" ? id : "";
  } catch {
    return "";
  }
}
const getInitialTab = (): SettlementTab => {
  if (typeof window === "undefined") return "Settlement";

  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab");

  return tab === "Settled" ? "Settled" : "Settlement";
};




export default function SettlementPage() {
  const [activeTab, setActiveTab] = React.useState<SettlementTab>(getInitialTab);
  const [selectedDate, setSelectedDate] = usePersistedDateValue(
    createPersistedDateValueKey("settlement"),
    getTodayDateInputValue,
  );
  const [transactions, setTransactions] = React.useState<SettlementTransaction[]>([]);
  const [totalTransactions, setTotalTransactions] = React.useState(0);
  const [totalAmount, setTotalAmount] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isError, setIsError] = React.useState(false);
  const [searchTerm, setSearchTerm] = usePersistedSearchTerm(createPersistedSearchTermKey("settlement"));
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [previewLabel, setPreviewLabel] = React.useState<string | undefined>(undefined);
  const [settlementOpen, setSettlementOpen] = React.useState(false);
  const [utrNumber, setUtrNumber] = React.useState("");
  const [isSubmittingSettlement, setIsSubmittingSettlement] = React.useState(false);
  const [settlementError, setSettlementError] = React.useState("");
  const { sortKey, sortDirection, directionFactor, handleSort } =
    useTableSort<SettlementSortKey>();
  const [editableAmount, setEditableAmount] = React.useState("");
  const [existingSettlement, setExistingSettlement] = React.useState<any>(null);
  const [pinnedTransactionIds, setPinnedTransactionIds] = React.useState<string[] | null>(null);
  const [allSettlements, setAllSettlements] = React.useState<AllSettlementRecord[]>([]);
  const [allSettlementsLoading, setAllSettlementsLoading] = React.useState(false);
  const [allSettlementsError, setAllSettlementsError] = React.useState(false);
  const [settledDateFrom, setSettledDateFrom] = usePersistedDateValue(createPersistedDateValueKey("settlement-settled-from"));
  const [settledDateTo, setSettledDateTo] = usePersistedDateValue(createPersistedDateValueKey("settlement-settled-to"));
  const [settledSearchTerm, setSettledSearchTerm] = usePersistedSearchTerm(createPersistedSearchTermKey("settlement-settled"));
  const [expandedSettlementId, setExpandedSettlementId] = React.useState<string | null>(null);
  const [razorpayAmount, setRazorpayAmount] = React.useState(0);
  const [settlementDetailLoadingId, setSettlementDetailLoadingId] = React.useState<string | null>(null);
  const [settlementTxnBySettlementId, setSettlementTxnBySettlementId] = React.useState<
    Record<string, SettlementTransaction[]>
  >({});
  const loadSettlement = React.useCallback(async () => {
    setIsLoading(true);
    setIsError(false);

    try {
      const [settlementResult, paymentAmountResult] = await Promise.allSettled([
        fetchSettlementByDate(selectedDate),
        fetchPaymentSettlementAmount(selectedDate, selectedDate),
      ]);

      const paymentAmount =
        paymentAmountResult.status === "fulfilled" ? paymentAmountResult.value : 0;
      setRazorpayAmount(paymentAmount);

      if (settlementResult.status === "rejected") {
        setTransactions([]);
        setTotalTransactions(0);
        setTotalAmount(0);
        setUtrNumber("");
        setEditableAmount(paymentAmount > 0 ? paymentAmount.toFixed(2) : "0.00");
        setExistingSettlement(null);
        setIsError(true);
        return;
      }

      const data = settlementResult.value.data;
      const list = (Array.isArray(data?.transactions) ? data.transactions : [])
        .map(normalizeTransaction)
        .filter((txn): txn is SettlementTransaction => txn !== null);

      setTransactions(list);
      setTotalTransactions(
        typeof data?.totalTransactions === "number" ? data.totalTransactions : list.length);
      const amount = typeof data?.totalAmount === "number" ? data.totalAmount : 0;
      setTotalAmount(amount);
      setExistingSettlement(data ?? null);
      setUtrNumber(typeof data?.utrId === "string" ? data.utrId : "");

      const amountForField =
        typeof data?.utrId === "string" && data.utrId
          ? getAmountFromResponse(data)
          : amount;

      setEditableAmount(amountForField.toFixed(2));
    } catch {
      setTransactions([]);
      setTotalTransactions(0);
      setTotalAmount(0);
      setUtrNumber("");
      setEditableAmount("0.00");
      setExistingSettlement(null);
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate]);
  const handleTabChange = (tab: SettlementTab) => {
    setActiveTab(tab);

    const params = new URLSearchParams(window.location.search);
    params.set("tab", tab);

    window.history.replaceState({}, "", `?${params.toString()}`);
  };
  const loadAllSettlements = React.useCallback(async () => {
    setAllSettlementsLoading(true);
    setAllSettlementsError(false);
    try {
      const response = await fetchAllSettlements();
      const raw = response.data?.settlements;
      const list = (Array.isArray(raw) ? raw : [])
        .map(normalizeSettlementRow)
        .filter((row): row is AllSettlementRecord => row !== null)
        .sort((a, b) => new Date(b.settlementOnDate).getTime() - new Date(a.settlementOnDate).getTime());
      setAllSettlements(list);
    } catch {
      setAllSettlements([]);
      setAllSettlementsError(true);
    } finally {
      setAllSettlementsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (activeTab !== "Settled") return;
    void loadAllSettlements();
  }, [activeTab, loadAllSettlements]);

  React.useEffect(() => {
    if (activeTab === "Settled") return;
    setExpandedSettlementId(null);
    setSettlementDetailLoadingId(null);
    setSettledSearchTerm("");
  }, [activeTab]);

  const dateFilteredSettlements = React.useMemo(() => {
    if (!settledDateFrom && !settledDateTo) return allSettlements;
    return allSettlements.filter((row) => isAllSettlementInDateRange(row, settledDateFrom, settledDateTo));
  }, [allSettlements, settledDateFrom, settledDateTo]);

  const filteredAllSettlements = React.useMemo(() => {
    const term = normalizeSearchValue(settledSearchTerm);
    if (!term) return dateFilteredSettlements;
    return dateFilteredSettlements.filter((row) => settledRowMatchesSearch(row, term));
  }, [dateFilteredSettlements, settledSearchTerm]);

  React.useEffect(() => {
    if (activeTab !== "Settlement") return;
    void loadSettlement();
  }, [activeTab, loadSettlement]);

  const scopedTransactions = React.useMemo(() => {
    if (!pinnedTransactionIds?.length) return transactions;
    const idSet = new Set(pinnedTransactionIds);
    return transactions.filter((txn) => idSet.has(txn.id));
  }, [transactions, pinnedTransactionIds]);

  const displayTotalAmount = React.useMemo(() => {
    if (!pinnedTransactionIds?.length) return totalAmount;
    return scopedTransactions.reduce((sum, txn) => sum + Number(txn.amount ?? 0), 0);
  }, [pinnedTransactionIds, scopedTransactions, totalAmount]);

  const displayTotalTransactions = pinnedTransactionIds?.length
    ? scopedTransactions.length
    : totalTransactions;

  const filteredTransactions = React.useMemo(() => {
    const term = normalizeSearchValue(searchTerm);
    return scopedTransactions.filter((txn) => matchesSearch(txn, term));
  }, [searchTerm, scopedTransactions]);
  const sortedTransactions = React.useMemo(() => {
    if (!sortKey) return filteredTransactions;

    return [...filteredTransactions].sort((a, b) => {
      if (sortKey === "transaction") {
        const aValue = normalizeSearchValue(a.razorpayPaymentId ?? a.merchantTransactionId ?? a.id);
        const bValue = normalizeSearchValue(b.razorpayPaymentId ?? b.merchantTransactionId ?? b.id);
        return aValue.localeCompare(bValue) * directionFactor;
      }
      if (sortKey === "invoice") {
        return normalizeSearchValue(a.invoiceNumber).localeCompare(normalizeSearchValue(b.invoiceNumber)) * directionFactor;
      }
      if (sortKey === "metal") {
        return normalizeSearchValue(a.metalType).localeCompare(normalizeSearchValue(b.metalType)) * directionFactor;
      }
      if (sortKey === "amount") {
        return (Number(a.amount ?? 0) - Number(b.amount ?? 0)) * directionFactor;
      }
      const aValue = new Date(a.createdAt ?? a.executedAt ?? 0).getTime();
      const bValue = new Date(b.createdAt ?? b.executedAt ?? 0).getTime();
      return (aValue - bValue) * directionFactor;
    });
  }, [directionFactor, filteredTransactions, sortKey]);

  const pagination = useTablePagination(sortedTransactions);

  React.useEffect(() => {
    pagination.resetPage();
  }, [pagination.resetPage, pinnedTransactionIds, searchTerm, selectedDate]);

  const handleOpenSettlementFromAll = React.useCallback((row: AllSettlementRecord) => {
    const dateVal = row.settlementForDate
      ? isoToDateInputValue(row.settlementForDate)
      : getTodayDateInputValue();
    setActiveTab("Settlement");
    setPinnedTransactionIds(row.transactionIds.length ? row.transactionIds : null);
    setSelectedDate(dateVal);
    setSearchTerm("");
    setExpandedSettlementId(null);
  }, []);

  const toggleSettledRowExpand = React.useCallback(
    async (row: AllSettlementRecord) => {
      if (expandedSettlementId === row.id) {
        setExpandedSettlementId(null);
        return;
      }
      setExpandedSettlementId(row.id);

      if (settlementTxnBySettlementId[row.id]) return;

      setSettlementDetailLoadingId(row.id);
      try {
        const dateVal = row.settlementForDate
          ? isoToDateInputValue(row.settlementForDate)
          : getTodayDateInputValue();

        const response = await fetchSettlementByDate(dateVal);

        const data = response.data;

        const list = (Array.isArray(data?.transactions) ? data.transactions : [])
          .map(normalizeTransaction)
          .filter((txn): txn is SettlementTransaction => txn !== null);

        setSettlementTxnBySettlementId((prev) => ({
          ...prev,
          [row.id]: list,
        }));
      } catch {
        setSettlementTxnBySettlementId((prev) => ({
          ...prev,
          [row.id]: [],
        }));

      } finally {
        setSettlementDetailLoadingId(null);
      }
    },
    [expandedSettlementId, settlementTxnBySettlementId],
  );

  const handleSettlementOpenChange = (open: boolean) => {
    setSettlementOpen(open);

    if (open) {
      const existingUtr =
        typeof existingSettlement?.utrId === "string"
          ? existingSettlement.utrId
          : "";

      setUtrNumber(existingUtr);

      const amountForField =
        existingUtr && existingSettlement
          ? getAmountFromResponse(existingSettlement)
          : totalAmount;

      setEditableAmount(amountForField.toFixed(2));
      setSettlementError("");
    } else {
      setSettlementError("");
    }
  };
  const settlementDate = selectedDate
    ? new Date(new Date(selectedDate).setDate(new Date(selectedDate).getDate() + 1))
      .toISOString().split("T")[0] : "";

  const handleSubmitSettlement = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedUtrNumber = utrNumber.trim();

    if (!trimmedUtrNumber) {
      setSettlementError("UTR Number is required.");
      return;
    }

    if (!editableAmount || Number(editableAmount) <= 0) {
      setSettlementError("Total amount is required.");
      return;
    }

    if (!selectedDate) {
      setSettlementError("Settlement date is required.");
      return;
    }


    const transactionIds = transactions.map((txn) => txn.id);
    if (transactionIds.length === 0) {
      setSettlementError("No transactions available for settlement.");
      return;
    }

    setIsSubmittingSettlement(true);
    setSettlementError("");

    try {
      await submitSettlement({
        utrId: trimmedUtrNumber,
        totalAmount: Number(editableAmount || 0),
        settlementForDate: selectedDate,
        settlementOnDate: settlementDate,
        transactionIds,
      });

      toast({
        title: "Success",
        description: "Settlement submitted successfully.",
      });

      handleSettlementOpenChange(false);
      void loadSettlement();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to submit settlement.";

      setSettlementError(message);
    } finally {
      setIsSubmittingSettlement(false);
    }
  };

  const exportSettlementToExcel = React.useCallback(async () => {
    const rowsToExport = filteredTransactions.map((txn) => {
      const transactionId = txn.razorpayPaymentId ?? txn.merchantTransactionId ?? txn.id;

      return {
        transactionId,
        transactionType: formatTransactionType(txn.transactionType ?? txn.type),
        invoiceNumber: txn.invoiceNumber ?? "-",
        metalType: txn.metalType ?? "-",
        amount: typeof txn.amount === "number" ? txn.amount : null,
        totalPaidAmount: typeof txn.totalPaidAmount === "number" ? txn.totalPaidAmount : null,
        platformFee: typeof txn.platformFee === "number" ? txn.platformFee : null,
        status: txn.status ?? "-",
        dateTime: formatTransactionDateTime(txn.createdAt ?? txn.executedAt),
      };
    });

    await exportToExcel({
      fileName: `settlement-${selectedDate}.xlsx`,
      sheetName: "Settlement",
      columns: [
        { header: "Transaction Content", key: "transactionId", width: 30 },
        { header: "Transaction Type", key: "transactionType", width: 22 },
        { header: "Invoice", key: "invoiceNumber", width: 20 },
        { header: "Metal Type", key: "metalType", width: 15 },
        { header: "Amount", key: "amount", width: 18 },
        { header: "Total Paid Amount", key: "totalPaidAmount", width: 20 },
        { header: "Platform Fee", key: "platformFee", width: 18 },
        { header: "Status", key: "status", width: 18 },
        { header: "Date & Time", key: "dateTime", width: 25 },
      ],
      rows: rowsToExport,
    });
  }, [filteredTransactions, selectedDate]);

  return (
    <>
      <Layout title="Settlement">
        <div className="flex h-[calc(100vh-7.5rem)] flex-col gap-4">
          <div className="flex w-fit items-center gap-1 rounded-xl border border-border bg-muted p-1">
            {SETTLEMENT_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => handleTabChange(tab)}
                className={cn(
                  "rounded-lg px-4 py-2 text-sm font-semibold transition-all",
                  activeTab === tab
                    ? "border border-border bg-card text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === "Settlement" && (
            <Card className="flex min-h-0 flex-1 flex-col">
              {pinnedTransactionIds?.length ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2 text-sm">
                  <p className="text-muted-foreground">
                    Showing <span className="font-medium text-foreground">{pinnedTransactionIds.length}</span> transaction
                    {pinnedTransactionIds.length === 1 ? "" : "s"} from this settlement (calendar date{" "}
                    <span className="font-medium text-foreground">{selectedDate}</span>).
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={() => setPinnedTransactionIds(null)}>
                    Show all for this date
                  </Button>
                </div>
              ) : null}
              <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex w-full items-center gap-2 lg:max-w-xl lg:flex-1">
                  <div className="relative w-full sm:w-[180px]">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Search..."
                      className="pl-8"
                    />
                  </div>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:flex-nowrap lg:justify-end">
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleSettlementOpenChange(true)}
                      disabled={
                        isLoading ||
                        isError ||
                        displayTotalAmount <= 0 ||
                        Boolean(pinnedTransactionIds?.length)
                      }
                      className="flex items-center gap-2"
                    >
                      <CheckCheck className="h-4 w-4" />
                      Settlement
                    </Button>
                  </div>
                  <SingleDatePicker
                    value={selectedDate}
                    onChange={(value) => {
                      setPinnedTransactionIds(null);
                      setSelectedDate(value);
                    }}
                  />
                  <div className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm sm:w-[170px]">
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">Razorpay Amount</p>
                    <p className="truncate font-semibold text-foreground">{formatCurrency(razorpayAmount)}</p>
                  </div>
                  <div className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm sm:w-[170px]">
                    <p className="text-[10px] font-semibold uppercase text-muted-foreground">Total Amount</p>
                    <p className="truncate font-semibold text-foreground">{formatCurrency(displayTotalAmount)}</p>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex cursor-pointer transition-all duration-200 hover:scale-105">
                          <Button
                            type="button"
                            variant="outline"
                            className="gap-2 cursor-pointer relative"
                            onClick={() => void exportSettlementToExcel()}
                            disabled={isLoading || isError || filteredTransactions.length === 0}
                            aria-label="Export All"
                          >
                            <DownloadCloud className="h-4 w-4" />
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent
                        side="bottom"
                        align="end"
                        sideOffset={8}
                        avoidCollisions={true}
                        collisionPadding={{ right: 32, left: 16 }}
                        className="bg-gray-700 text-white text-xs px-3 py-2 rounded-md shadow-lg animate-in fade-in zoom-in-95 duration-200"
                      >
                        Export All
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full text-left text-sm text-foreground">
                  <thead className="bg-muted text-sm  text-muted-foreground">
                    <tr>
                      {/* <th className="w-[190px] px-4 py-4 font-medium">User</th> */}
                      <th className="w-[170px] px-3 py-4 font-medium">
                        <button type="button" onClick={() => handleSort("transaction")} className={getSortToggleClass(sortKey === "transaction")}>
                          Transaction Content <SortDirectionIcon active={sortKey === "transaction"} direction={sortDirection} />
                        </button>
                      </th>
                      <th className="w-[120px] px-4 py-4 font-medium">
                        <button type="button" onClick={() => handleSort("invoice")} className={getSortToggleClass(sortKey === "invoice")}>
                          Invoice <SortDirectionIcon active={sortKey === "invoice"} direction={sortDirection} />
                        </button>
                      </th>
                      <th className="w-[120px] px-4 py-4 font-medium">
                        <button type="button" onClick={() => handleSort("metal")} className={getSortToggleClass(sortKey === "metal")}>
                          Metal Type <SortDirectionIcon active={sortKey === "metal"} direction={sortDirection} />
                        </button>
                      </th>
                      <th className="w-[120px] px-4 py-4 font-medium">
                        <button type="button" onClick={() => handleSort("amount")} className={getSortToggleClass(sortKey === "amount")}>
                          Amount <SortDirectionIcon active={sortKey === "amount"} direction={sortDirection} />
                        </button>
                      </th>
                      <th className="w-[140px] px-4 py-4 font-medium">Total Paid Amount</th>
                      <th className="w-[120px] px-4 py-4 font-medium">Platform Fee</th>
                      <th className="w-[120px] px-4 py-4 font-medium">
                        {/* <button type="button" onClick={() => handleSort("status")} className={getSortToggleClass(sortKey === "status")}> */}
                        Status
                        {/* </button> */}
                      </th>
                      <th className="w-[160px] px-4 py-4 font-medium">
                        <button type="button" onClick={() => handleSort("date")} className={getSortToggleClass(sortKey === "date")}>
                          Date & Time <SortDirectionIcon active={sortKey === "date"} direction={sortDirection} />
                        </button>
                      </th>
                    </tr>
                  </thead>
                    <tbody key={`${selectedDate}|${searchTerm}|${pagination.currentPage}|${pinnedTransactionIds?.join(",") ?? ""}`}>
                    {isLoading ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">
                          Loading settlement transactions...
                        </td>
                      </tr>
                    ) : isError ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-10 text-center text-sm text-destructive">
                          Failed to load settlement data.
                        </td>
                      </tr>
                    ) : sortedTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">
                          No settlement transactions found.
                        </td>
                      </tr>
                    ) : (
                      pagination.pagedItems.map((txn) => {
                        const transactionId = txn.razorpayPaymentId ?? txn.merchantTransactionId ?? txn.id;
                        const displayUserName = txn.userName ?? txn.user?.name ?? "-";

                        return (
                          <tr
                            key={`${transactionId}-${txn.createdAt ?? txn.executedAt ?? txn.id}`}
                            className="border-b border-border transition-colors hover:bg-muted"
                          >
                            {/* <td className="w-[190px] px-4 py-4 font-medium text-foreground">
                            <p className="max-w-[170px] truncate" title={displayUserName}>
                              {displayUserName}
                            </p>
                          </td> */}
                            <td className="w-[170px] px-3 py-4">
                              <p className="max-w-[140px] truncate font-mono text-sm text-muted-foreground" title={transactionId}>
                                {transactionId}
                              </p>
                              <p className="font-mono text-sm text-muted-foreground">
                                {formatTransactionType(txn.transactionType ?? txn.type)}
                              </p>
                            </td>
                            <td className="px-4 py-4">
                              {txn.invoiceUrl && txn.invoiceNumber ? (
                                <button
                                  onClick={() => {
                                    setPreviewUrl(txn.invoiceUrl ?? null);
                                    setPreviewLabel(txn.invoiceNumber);
                                  }}
                                  className="inline-flex cursor-pointer items-center gap-1 font-mono text-sm text-muted-foreground hover:opacity-80"
                                  title={txn.invoiceUrl}
                                >
                                  {txn.invoiceNumber}
                                  <Eye className="h-3.5 w-4 text-primary" />
                                </button>
                              ) : (
                                <p className="font-mono text-sm text-muted-foreground">{txn.invoiceNumber ?? "-"}</p>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              <p className="font-mono text-sm text-muted-foreground">{txn.metalType ?? "-"}</p>
                            </td>
                            <td className="px-4 py-4">
                              <p className="font-bold text-foreground">
                                {typeof txn.amount === "number" ? formatCurrency(txn.amount) : "-"}
                              </p>
                            </td>
                            <td className="px-4 py-4">
                              <p className="text-foreground">
                                {typeof txn.totalPaidAmount === "number" ? formatCurrency(txn.totalPaidAmount) : "-"}
                              </p>
                            </td>
                            <td className="px-4 py-4">
                              <PlatformFeeCell
                                txn={txn}
                                onPreview={(url, label) => {
                                  setPreviewUrl(url);
                                  setPreviewLabel(label);
                                }}
                              />
                            </td>
                            <td className="px-4 py-4">
                              <Badge variant={statusBadgeVariant(txn.status)} className="capitalize text-sm">
                                {String(txn.status ?? "unknown").toUpperCase()}
                              </Badge>
                              {txn.failureReason && (
                                <p className="mt-1 max-w-[150px] truncate text-sm text-destructive" title={txn.failureReason}>
                                  {txn.failureReason}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-4 text-sm text-muted-foreground">
                              <p>{formatTransactionDateTime(txn.createdAt ?? txn.executedAt)}</p>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <TablePaginationFooter {...bindTablePaginationFooter(pagination)} />
            </Card>
          )}

          {activeTab === "Settled" && (
            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border p-4">
                <div className="relative w-full max-w-md">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={settledSearchTerm}
                    onChange={(event) => setSettledSearchTerm(event.target.value)}
                    placeholder="Search by UTR, type, amount, settled by, or transaction id…"
                    className="pl-10"
                    aria-label="Search settled records"
                  />
                </div>

              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full min-w-[840px] text-left text-sm text-foreground">
                  <thead className="bg-muted text-sm  text-muted-foreground">
                    <tr>
                      <th className="w-[20px] px-4 py-3 font-medium normal-case"> </th>
                      <th className="px-4 py-3 font-medium">Settled date</th>
                      <th className="px-4 py-3 font-medium">UTR</th>
                      <th className="px-4 py-3 font-medium"> Transactions</th>
                      <th className="px-4 py-3 font-medium">Total amount</th>

                    </tr>
                  </thead>
                  <tbody>
                    {allSettlementsLoading ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                          Loading settlements…
                        </td>
                      </tr>
                    ) : allSettlementsError ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-sm text-destructive">
                          Failed to load settlements.
                        </td>
                      </tr>
                    ) : allSettlements.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                          No settlements found.
                        </td>
                      </tr>
                    ) : dateFilteredSettlements.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                          No settlements match the selected dates.
                        </td>
                      </tr>
                    ) : filteredAllSettlements.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                          No settlements match your search.
                        </td>
                      </tr>
                    ) : (
                      filteredAllSettlements.filter(
                        (row) =>
                          expandedSettlementId === null ||
                          expandedSettlementId === row.id
                      ).map((row) => (
                        <React.Fragment key={row.id}>
                          <tr
                            tabIndex={0}
                            role="row"
                            onClick={() => void toggleSettledRowExpand(row)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                void toggleSettledRowExpand(row);
                              }
                            }}
                            className={cn(
                              "cursor-pointer border-b border-border transition-colors hover:bg-muted",
                              expandedSettlementId === row.id && "bg-muted/40",
                            )}
                          >
                            <td className="w-[20px] " onClick={(event) => event.stopPropagation()}>
                              <div className="flex ">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 shrink-0"
                                  aria-expanded={expandedSettlementId === row.id}
                                  aria-label={expandedSettlementId === row.id ? "Collapse transactions" : "Expand transactions"}
                                  onClick={() => void toggleSettledRowExpand(row)}
                                >
                                  {expandedSettlementId === row.id ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                </Button>

                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {formatSettlementTableDate(row.settlementOnDate)}
                            </td>
                            <td className="px-4 py-3 font-mono text-sm text-muted-foreground">{row.utrId || "—"}</td>

                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              <p className="truncate" title={row.transactionIds.join(", ")}>
                                {row.transactionIds.length}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-sm font-bold text-foreground">{formatCurrency(row.totalAmount)}</td>
                          </tr>
                          {expandedSettlementId === row.id ? (
                            <tr className="border-b border-border bg-muted/30">
                              <td colSpan={5} className="p-0">
                                <div className="p-4" onClick={(event) => event.stopPropagation()}>
                                  {settlementDetailLoadingId === row.id ? (
                                    <p className="py-6 text-center text-sm text-muted-foreground">Loading transactions…</p>
                                  ) : (
                                    <SettlementTransactionsDetailTable
                                      rows={settlementTxnBySettlementId[row.id] ?? []}
                                      onPreviewInvoice={(url, label) => {
                                        setPreviewUrl(url);
                                        setPreviewLabel(label);
                                      }}
                                    />
                                  )}
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </React.Fragment>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </Layout>
      <Dialog open={settlementOpen} onOpenChange={handleSettlementOpenChange}>
        <DialogContent className="max-w-md gap-0 overflow-hidden rounded-[24px] border-border bg-card p-0 shadow-2xl shadow-black/50">
          <form onSubmit={handleSubmitSettlement}>
            <DialogHeader className="border-b border-border px-5 py-4 text-left">
              <DialogTitle>Settlement</DialogTitle>
              <DialogDescription>
                Enter the settlement UTR for the selected date.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 px-5 py-4">
              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                UTR Number
                <Input
                  value={utrNumber}
                  onChange={(event) => {
                    setUtrNumber(event.target.value);
                    setSettlementError("");
                  }}
                  placeholder="Enter UTR Number"

                  autoFocus
                />
              </label>

              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                Total Amount
                <Input
                  value={editableAmount}
                  onChange={(event) => {
                    const value = event.target.value;

                    if (/^\d*\.?\d{0,2}$/.test(value)) {
                      setEditableAmount(value);
                      setSettlementError("");
                    }
                  }}
                  placeholder="Enter amount"
                  className="font-semibold"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                Settlement On Date
                <Input type="date" value={settlementDate} readOnly />
              </label>

              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                Settlement For Date
                <Input type="date" value={selectedDate} readOnly className="bg-muted" />
              </label>

              {settlementError && (
                <p className="text-sm font-medium text-destructive">{settlementError}</p>
              )}
            </div>

            <DialogFooter className="border-t border-border px-5 py-3.5 sm:justify-end sm:space-x-0">
              <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleSettlementOpenChange(false)}
                  disabled={isSubmittingSettlement}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmittingSettlement}
                >
                  {isSubmittingSettlement
                    ? existingSettlement?.utrId
                      ? "Updating..."
                      : "Submitting..."
                    : existingSettlement?.utrId
                      ? "Update"
                      : "Submit"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ImagePreviewModal url={previewUrl} label={previewLabel} onClose={() => setPreviewUrl(null)} />
    </>
  );
}
