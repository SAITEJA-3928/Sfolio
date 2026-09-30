import * as React from "react";
import type { DateRange } from "react-day-picker";
import { motion } from "framer-motion";
import { CalendarIcon, DownloadCloud, Eye, FilePlus, Mail, MoreHorizontal, Search, Download, Repeat, RefreshCw } from "lucide-react";
import { TableHeaderFilter } from "@/components/table-header-filter";
import { Link, useLocation, useSearch } from "wouter";
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
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { formatAmount } from "@/utils/formatAmount";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DateRangePicker, SingleDatePicker } from "@/components/ui/date-picker";
import {
  useCreateInvoice,
  useSendBuyOtp,
  useVerifyBuyOtp,
  useSendRefundOtp,
  useVerifyRefundOtp,
  useCompleteSellTransaction,
  useFailSellTransaction,
  useListAdminTransactions,
  useListUsers,
  useProviderMissingTransactions,
  useRefundTransaction,
  useRetryTransaction,
  useUploadBulkPaymentExcel,
} from "@/lib/api-client-react";
import { formatCurrency, cn, formatDateTimeParts } from "@/lib/utils";
import { getSortToggleClass, SortDirectionIcon, useTableSort } from "@/lib/table-sort";
import ImagePreviewModal from "@/components/ui/ImagePreviewModal";
import { exportBulkPaymentExcel, exportToExcel } from "@/lib/export-to-excel";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getDateRangeFromTimePeriod,
  parseTimePeriodFromSearch,
} from "@/lib/time-period";
import {
  FAILED_TRANSACTION_STATUS_FILTER,
  isFailedTransactionStatusFilter,
  isPendingOrFailedTransactionStatus,
} from "@/lib/transaction-filters";
import {
  formatDateInputValue,
  formatDateRangeLabel,
  getCurrentDateRange,
  getInitialDateRange,
  getTodayDateInputValue,
  isDateInRange,
  isSameCalendarDay,
  parseDateInputValue,
} from "@/lib/date-range";
import { readLoggedInUserEmail } from "@/lib/session-user";
import {
  usePersistedSearchTerm,
  usePersistedDateRange,
  createPersistedSearchTermKey,
  createPersistedDateRangeKey,
} from "@/lib/persisted-page-filters";
import SelectionFeedback from "@/components/ui/SelectionFeedback";
import { TablePaginationFooter } from "@/components/table-pagination-footer";
import { DEFAULT_TABLE_PAGE_SIZE,bindTablePaginationFooter, useTablePagination } from "@/lib/table-pagination";

import {
  triggerSelectionFeedback,
  getSelectionRowClass,
} from "@/lib/selection-feedback";
import { downloadPlatformFeeInvoice, shouldShowPlatformFeeInvoiceActions } from "@/lib/platform-fee-invoice";
import { downloadInvoice } from "@/lib/invoice-download";

type TransactionItem = {
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
  type?: string;
  transactionType?: string;
  frequency?: string;
  amount?: number;
  totalPaidAmount?: number;
  platformFee?: number;
  platformFeeInvoiceUrl?: string;
  status?: string;
  orderStatus?: string;
  paymentMethod?: string;
  razorpayPaymentMethod?: string;
  normalizedPaymentMethod?: string;
  metalType?: string;
  createdAt?: string;
  executedAt?: string;
  failureReason?: string;
  // settlementMessage?: string;
  referenceId?: string;
  invoiceNumber?: string;
  invoiceUrl?: string;
  investedAmount?: number;
  totalTaxAmount?: string;
  externalPaymentId?: string;
  normalizedMetalType?: string;
  normalizedStatus?: string;
  bankDetails?: BankDetail[];
  utrNumber?: string;
  settlementDate?: string;
  isRedeem?: boolean;
  shippingCharges?: number;
  metalWeightInGrams?: number;
  metalDetails?: TransactionMetalDetail[];
};

type BankDetail = {
  bankName?: string;
  accountNumber?: string;
  accountHolderName?: string;
  ifscCode?: string;
  bankBranch?: string;
};

type TransactionMetalDetail = {
  metalType?: string;
  metalWeightInGrams?: number;
};

type TransactionListResponse = {
  transactions?: unknown[];
  data?: unknown[];
  total?: number;
  page?: number;
  limit?: number;
};
const TRANSACTIONS_SEARCH_DEBOUNCE_MS = 100;
const AUDIT_OTP_RESEND_COOLDOWN_SECONDS = 60;

function formatOtpCountdown(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

type AdminTransactionsFetchFilters = {
  type?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
  status?: string;
  metalType?: string;
  transactionDirection?: string;
  isRedeem?: boolean;
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

function asNonNegativeInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.floor(parsed);
  }
  return undefined;
}

function readAdminTransactionsPagination(source: unknown): Record<string, unknown> | null {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const record = source as Record<string, unknown>;
  if (!record.pagination || typeof record.pagination !== "object" || Array.isArray(record.pagination)) {
    return null;
  }
  return record.pagination as Record<string, unknown>;
}

function readAdminTransactionsTotal(source: unknown): number | undefined {
  if (!source || typeof source !== "object" || Array.isArray(source)) return undefined;
  const record = source as Record<string, unknown>;
  const pagination = readAdminTransactionsPagination(source);

  return (
    asNonNegativeInt(record.total) ??
    asNonNegativeInt(record.totalCount) ??
    asNonNegativeInt(record.totalTransactions) ??
    asNonNegativeInt(record.count) ??
    (pagination
      ? asNonNegativeInt(pagination.totalTransactions) ??
      asNonNegativeInt(pagination.totalUsers) ??
      asNonNegativeInt(pagination.total) ??
      asNonNegativeInt(pagination.totalCount) ??
      asNonNegativeInt(pagination.count)
      : undefined)
  );
}

function parseAdminTransactionsListResponse(
  data: unknown,
  requestedPage: number,
  requestedLimit: number,
) {
  const root = data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
  const pagination = readAdminTransactionsPagination(root);
  const transactions = unwrapTransactions(data as TransactionListResponse);
  const reportedTotal = readAdminTransactionsTotal(root);
  const page =
    asNonNegativeInt(pagination?.currentPage) ??
    asNonNegativeInt(root.page) ??
    requestedPage;
  const limit =
    asNonNegativeInt(pagination?.limit) ??
    asNonNegativeInt(root.limit) ??
    requestedLimit;
  const reportedTotalPages = asNonNegativeInt(pagination?.totalPages);
  const hasNextPage =
    typeof pagination?.hasNextPage === "boolean" ? pagination.hasNextPage : undefined;

  return {
    transactions,
    total: reportedTotal ?? transactions.length,
    page,
    limit,
    totalPages: reportedTotalPages,
    hasReportedTotal: reportedTotal !== undefined,
    hasMore: hasNextPage ?? transactions.length >= requestedLimit,
  };
}

function mapTransactionSortKeyToApi(sortKey: TransactionSortKey | null) {
  if (!sortKey) return undefined;
  if (sortKey === "date") return "createdAt";
  if (sortKey === "amount") return "amount";
  if (sortKey === "status") return "status";
  if (sortKey === "metal") return "metalType";
  if (sortKey === "utr") return "utrNumber";
  if (sortKey === "settlementDate") return "settlementDate";
  if (sortKey === "transaction") return "merchantTransactionId";
  return undefined;
}

type ProviderMissingTransaction = {
  cashfreePaymentId: string;
  cashfreeOrderId?: string;
  amount?: number;
  metalType?: string;
  currency?: string;
  status?: string;
  method?: string;
  email?: string;
  contact?: string;
  description?: string;
  createdAt?: string;
  userId?: string;
  userName?: string;
  userPhone?: string;
  userEmail?: string;
  transactionType?: string;
  notesType?: string;
  transactionId?: string;
  sipId?: string;
};

const TRANSACTION_TABS = ["Transactions", "Audit"] as const;
type TransactionPageTab = (typeof TRANSACTION_TABS)[number];
const PROVIDER_PENDING_TAB_QUERY = "provider-pending";

function getInitialTransactionPageTab(): TransactionPageTab {
  if (typeof window === "undefined") return "Transactions";

  const tab = new URLSearchParams(window.location.search).get("tab");
  return tab === PROVIDER_PENDING_TAB_QUERY ? "Audit" : "Transactions";
}

function syncTransactionPageTabToUrl(tab: TransactionPageTab) {
  const params = new URLSearchParams(window.location.search);

  if (tab === "Audit") {
    params.set("tab", PROVIDER_PENDING_TAB_QUERY);
  } else {
    params.delete("tab");
  }

  const query = params.toString();
  const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState({}, "", nextUrl);
}

type TransactionSortKey = "user" | "transaction" | "invoice" | "metal" | "method" | "amount" | "status" | "date" | "settlementDate" | "utr";
type ProviderMissingSortKey = "user" | "transactionType" | "metal" | "method" | "amount" | "date";

const AUDIT_TRANSACTION_TYPE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "BUY", label: "Buy" },
  { value: "MANUAL_SIP", label: "Manual SIP" },
  { value: "GIFTCARDACCEPT", label: "Gift Card Accept" },
  { value: "CONTEST_REWARD", label: "Contest Reward" },
  { value: "REFERRAL_REWARD", label: "Referral Reward" },
  { value: "VOUCHER_REWARD", label: "Voucher Reward" },
  { value: "BONUS", label: "Bonus" },
];

function getInitialStatusFilter() {
  if (typeof window === "undefined") return "all";
  const statusFilter = window.location.search ? new URLSearchParams(window.location.search).get("statusFilter") : null;
  const normalizedStatus = getStatusFilterValue(statusFilter ?? undefined);
  return normalizedStatus || "success";
}


const BUY_GROUP_TRANSACTION_TYPES = new Set(["BUY", "MANUAL_SIP", "SIP", "BONUS"]);


const SELL_GROUP_TRANSACTION_TYPES = new Set(["SELL"]);

const GIFT_CARD_BUY_TRANSACTION_TYPE = "GIFTCARDBUY";

function isGiftCardBuyTransaction(txn: Pick<TransactionItem, "transactionType" | "type">) {
  return normalizeTxnTypeForKind(txn.transactionType ?? txn.type) === GIFT_CARD_BUY_TRANSACTION_TYPE;
}

function isPhysicalRedeemTransaction(txn: Pick<TransactionItem, "isRedeem">) {
  return txn.isRedeem === true;
}

function resolveTransactionMetalType(record: Record<string, unknown>) {
  if (typeof record.metalType === "string" && record.metalType.trim()) {
    return record.metalType;
  }

  const gift =
    record.gift && typeof record.gift === "object"
      ? (record.gift as Record<string, unknown>)
      : undefined;
  if (typeof gift?.metalType === "string" && gift.metalType.trim()) {
    return gift.metalType;
  }

  if (typeof record.paymentMethod === "string" && record.paymentMethod.trim()) {
    return record.paymentMethod;
  }

  return undefined;
}

function formatTransactionMetalType(txn: Pick<TransactionItem, "metalType">) {
  if (!txn.metalType) return "-";
  const filterValue = getMetalFilterValue(txn.metalType);
  return METAL_TYPE_DISPLAY_LABELS[filterValue] ?? txn.metalType;
}

function normalizeMetalDetails(value: unknown): TransactionMetalDetail[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const details = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const metalType = typeof record.metalType === "string" ? record.metalType : undefined;
      const metalWeightInGrams =
        typeof record.metalWeightInGrams === "number" ? record.metalWeightInGrams : undefined;

      if (!metalType && metalWeightInGrams == null) return null;
      return { metalType, metalWeightInGrams };
    })
    .filter((item): item is TransactionMetalDetail => item !== null);

  return details.length > 0 ? details : undefined;
}

function resolveTransactionMetalWeight(
  txn: Pick<TransactionItem, "metalWeightInGrams" | "metalDetails">,
) {
  if (typeof txn.metalWeightInGrams === "number" && txn.metalWeightInGrams > 0) {
    return txn.metalWeightInGrams;
  }

  if (!txn.metalDetails?.length) return undefined;

  const total = txn.metalDetails.reduce(
    (sum, item) => sum + Number(item.metalWeightInGrams || 0),
    0,
  );

  return total > 0 ? total : undefined;
}

function formatMetalQuantity(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "-";
  return `${value.toFixed(4)} gm`;
}

function formatTransactionInvoiceNumber(
  txn: Pick<TransactionItem, "invoiceNumber" | "transactionType" | "type">,
) {
  if (isGiftCardBuyTransaction(txn)) return "-";
  return txn.invoiceNumber ?? "-";
}

type TransactionDirectionFilter = "all" | "buy" | "sell";

const ORDER_TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "buy", label: "Buy" },
  { value: "sell", label: "Sell" },
] as const;
const BUY_TRANSACTION_TYPE_OPTIONS = [
  { value: "MANUAL_SIP", label: "Manual SIP" },
  { value: "BUY", label: "Buy" },
  { value: "GIFTCARDACCEPT", label: "Gift Card Accept" },
  { value: "CONTEST_REWARD", label: "Contest Reward" },
  { value: "REFERRAL_REWARD", label: "Referral Reward" },
  { value: "VOUCHER_REWARD", label: "Voucher Reward" },
  { value: "BONUS", label: "Bonus" },
] as const;
const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "success", label: "Successful" },
  { value: "processing", label: "Processing" },
  { value: "pending", label: "Pending" },
  { value: "refund", label: "Refunded" },
  { value: "failed", label: "Failed" },
] as const;

const SELL_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "success", label: "Success" },
  { value: "failed", label: "Failed" },
] as const;

const REDEMPTION_ORDER_STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "packed_not_dispatched", label: "Packed but not Dispatched" },
  { value: "dispatched_not_delivered", label: "Dispatched but not Delivered" },
  { value: "rto", label: "Return To Origin" },
  { value: "re_dispatched", label: "Re-Dispatched" },
  { value: "delivered", label: "Delivered to Client" },
  { value: "cancelled", label: "Cancelled" },
] as const;

type RedemptionOrderStatus = Exclude<
  (typeof REDEMPTION_ORDER_STATUS_OPTIONS)[number]["value"],
  "all"
>;

const REDEMPTION_ORDER_STATUS_LABELS = Object.fromEntries(
  REDEMPTION_ORDER_STATUS_OPTIONS.filter((option) => option.value !== "all").map((option) => [
    option.value,
    option.label,
  ]),
) as Record<RedemptionOrderStatus, string>;

const REDEMPTION_ORDER_STATUS_EXACT_ALIASES: Record<string, RedemptionOrderStatus> = {
  pending: "pending",
  created: "pending",
  processing: "processing",
  rto: "rto",
  delivered: "delivered",
  "delivered to client": "delivered",
  cancelled: "cancelled",
  canceled: "cancelled",
  failed: "cancelled",
  confirmed: "packed_not_dispatched",
  shipped: "dispatched_not_delivered",
  redispatched: "re_dispatched",
  "re dispatched": "re_dispatched",
};

type RedemptionOrderStatusRule = {
  status: RedemptionOrderStatus;
  matches: (value: string) => boolean;
};

const REDEMPTION_ORDER_STATUS_PHRASE_RULES: RedemptionOrderStatusRule[] = [
  {
    status: "packed_not_dispatched",
    matches: (value) =>
      value.includes("packed") && value.includes("not") && value.includes("dispatch"),
  },
  {
    status: "dispatched_not_delivered",
    matches: (value) =>
      value.includes("dispatch") && value.includes("not") && value.includes("deliver"),
  },
  {
    status: "re_dispatched",
    matches: (value) => value.includes("re dispatched") || value.includes("redispatched"),
  },
  {
    status: "delivered",
    matches: (value) => value.includes("deliver") && value.includes("client"),
  },
  {
    status: "processing",
    matches: (value) => value.includes("process"),
  },
  {
    status: "cancelled",
    matches: (value) => value.includes("cancel"),
  },
  {
    status: "packed_not_dispatched",
    matches: (value) => value.includes("confirm"),
  },
  {
    status: "dispatched_not_delivered",
    matches: (value) => value.includes("ship"),
  },
];

type SellStatusFilter = (typeof SELL_STATUS_FILTER_OPTIONS)[number]["value"];
type RedemptionOrderStatusFilter = (typeof REDEMPTION_ORDER_STATUS_OPTIONS)[number]["value"];

const tooltipContentClassName =
  "bg-gray-700 text-white text-xs px-3 py-2 rounded-md shadow-lg animate-in fade-in zoom-in-95 duration-200";

const sellActionMenuContentClassName =
  "min-w-[10rem] rounded-xl border border-border bg-popover p-1 shadow-md";

const sellActionMenuItemClassName =
  "cursor-pointer rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted/60 focus:bg-muted/60 focus:text-foreground data-[highlighted]:bg-muted/60 data-[highlighted]:text-foreground";

function getSellStatusActionButtonClassName(status: string) {
  const variant = statusBadgeVariant(status, true, false);
  if (variant === "warning") {
    return "border-[var(--color-amber-500)] bg-amber-500/10 text-[var(--color-amber-500)] hover:bg-amber-500/20";
  }
  return undefined;
}

function normalizeTxnTypeForKind(value?: string) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function parseTransactionDirectionFilterFromSearch(search: string): TransactionDirectionFilter {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const raw =
    params.get("transactionTypeFilter") ?? params.get("transactionType") ?? params.get("type");
  if (!raw) return "all";
  const v = raw.trim().toLowerCase();
  if (v === "buy") return "buy";
  if (v === "sell") return "sell";
  if (v === "all") return "all";
  return "all";
}

function getInitialTransactionDirectionFilter(): TransactionDirectionFilter {
  if (typeof window === "undefined") return "all";
  return parseTransactionDirectionFilterFromSearch(window.location.search);
}

function txnMatchesDirectionFilter(txn: TransactionItem, filter: TransactionDirectionFilter) {
  if (filter === "all") return true;
  const kind = normalizeTxnTypeForKind(txn.transactionType ?? txn.type);
  if (!kind) return false;
  if (filter === "buy") return BUY_GROUP_TRANSACTION_TYPES.has(kind);
  if (filter === "sell") return SELL_GROUP_TRANSACTION_TYPES.has(kind);
  return true;
}
function resolveAdminTransactionApiType(
  sellOnly: boolean,
  txnDirectionFilter: TransactionDirectionFilter,
) {
  if (sellOnly || txnDirectionFilter === "sell") return "SELL";
  return undefined;
}
function unwrapUsers(data: unknown): unknown[] {
  if (!data || typeof data !== "object") return [];
  const record = data as Record<string, unknown>;
  if (Array.isArray(record.users)) return record.users;
  if (record.data && typeof record.data === "object" && Array.isArray((record.data as Record<string, unknown>).users)) {
    return (record.data as Record<string, unknown>).users as unknown[];
  }
  return [];
}

function unwrapTransactions(payload: TransactionListResponse | null | undefined): unknown[] {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.transactions)) return payload.transactions;
  if (payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
    const nested = payload.data as Record<string, unknown>;
    if (Array.isArray(nested.transactions)) return nested.transactions;
    if (Array.isArray(nested.data)) return nested.data as unknown[];
  }
  return [];
}

function resolveTransactionFrequency(record: Record<string, unknown>) {
  if (typeof record.frequency === "string") return record.frequency;

  const nestedSources = [record.sipId, record.masterSipId, record.sip, record.masterSip];
  for (const source of nestedSources) {
    if (source && typeof source === "object") {
      const nestedFrequency = (source as Record<string, unknown>).frequency;
      if (typeof nestedFrequency === "string") return nestedFrequency;
    }
  }

  return undefined;
}

function normalizeBankDetail(value: unknown): BankDetail | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;

  const bankName = typeof record.bankName === "string" ? record.bankName : undefined;
  const accountNumber =
    typeof record.accountNumber === "string"
      ? record.accountNumber
      : typeof record.accountNo === "string"
        ? record.accountNo
        : undefined;
  const accountHolderName =
    typeof record.accountHolderName === "string"
      ? record.accountHolderName
      : typeof record.accountName === "string"
        ? record.accountName
        : undefined;
  const ifscCode =
    typeof record.ifscCode === "string"
      ? record.ifscCode
      : typeof record.ifsc === "string"
        ? record.ifsc
        : undefined;
  const bankBranch =
    typeof record.bankBranch === "string"
      ? record.bankBranch
      : typeof record.branch === "string"
        ? record.branch
        : undefined;

  if (!bankName && !accountNumber && !accountHolderName && !ifscCode && !bankBranch) return null;
  return { bankName, accountNumber, accountHolderName, ifscCode, bankBranch };
}

function extractBankDetails(record: Record<string, unknown>): BankDetail[] {
  const candidates: unknown[] = [];

  for (const key of ["bankDetails", "banks", "bankAccounts", "bankAccountDetails", "payoutBankDetails"]) {
    const value = record[key];
    if (Array.isArray(value)) candidates.push(...value);
    else if (value && typeof value === "object") candidates.push(value);
  }

  if (record.user && typeof record.user === "object") {
    const userRecord = record.user as Record<string, unknown>;
    for (const key of ["bankDetails", "banks", "bankAccounts"]) {
      const value = userRecord[key];
      if (Array.isArray(value)) candidates.push(...value);
      else if (value && typeof value === "object") candidates.push(value);
    }
  }

  const normalized = candidates
    .map(normalizeBankDetail)
    .filter((item): item is BankDetail => item !== null);

  const seen = new Set<string>();
  return normalized.filter((item) => {
    const fingerprint = `${item.bankName ?? ""}|${item.accountNumber ?? ""}|${item.ifscCode ?? ""}`;
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}


function normalizeTransaction(value: unknown): TransactionItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const rawId = record.id ?? record._id;
  const id =
    typeof rawId === "string"
      ? rawId
      : rawId != null && typeof rawId === "object" && "_id" in rawId
        ? String((rawId as { _id?: unknown })._id ?? "")
        : rawId != null
          ? String(rawId)
          : "";
  if (!id) return null;

  const user = record.user && typeof record.user === "object" ? (record.user as Record<string, unknown>) : undefined;
  const taxes = record.taxes && typeof record.taxes === "object" ? (record.taxes as Record<string, unknown>) : undefined;
  const invoice = record.invoice && typeof record.invoice === "object" ? (record.invoice as Record<string, unknown>) : undefined;
  const invoiceNumber =
    typeof record.invoiceNumber === "string"
      ? record.invoiceNumber
      : typeof invoice?.invoiceNumber === "string"
        ? invoice.invoiceNumber
        : undefined;
  const invoiceUrl =
    typeof record.invoiceUrl === "string"
      ? record.invoiceUrl
      : typeof invoice?.url === "string"
        ? invoice.url
        : typeof invoice?.invoiceUrl === "string"
          ? invoice.invoiceUrl
          : undefined;

  return {
    id,
    userId:
      typeof record.userId === "string"
        ? record.userId
        : record.userId != null && typeof record.userId === "object" && "_id" in record.userId
          ? String((record.userId as { _id?: unknown })._id ?? "")
          : record.userId != null
            ? String(record.userId)
            : undefined,
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
    type:
      typeof record.transactionType === "string"
        ? record.transactionType
        : typeof record.type === "string"
          ? record.type
          : undefined,
    transactionType:
      typeof record.transactionType === "string"
        ? record.transactionType
        : typeof record.type === "string"
          ? record.type
          : undefined,
    frequency: resolveTransactionFrequency(record),
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
    orderStatus: typeof record.orderStatus === "string" ? record.orderStatus : undefined,
    paymentMethod: resolveTransactionPaymentMethod(record),
    razorpayPaymentMethod:
      typeof record.razorpayPaymentMethod === "string"
        ? record.razorpayPaymentMethod
        : undefined,
    normalizedPaymentMethod: normalizeSearchValue(resolveTransactionPaymentMethod(record)),
    metalType: resolveTransactionMetalType(record),
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
          : invoiceNumber,
    invoiceNumber,
    invoiceUrl,
    investedAmount: typeof record.investedAmount === "number" ? record.investedAmount : undefined,
    totalTaxAmount: typeof taxes?.totalTaxAmount === "string" ? taxes.totalTaxAmount : undefined,
    externalPaymentId: typeof record.externalPaymentId === "string" ? record.externalPaymentId : undefined,
    bankDetails: extractBankDetails(record),
    utrNumber: typeof record.utrNumber === "string" ? record.utrNumber : undefined,
    settlementDate:
      typeof record.settlementDate === "string"
        ? record.settlementDate
        : record.settlementDate instanceof Date
          ? record.settlementDate.toISOString()
          : undefined,
    normalizedMetalType: getMetalFilterValue(resolveTransactionMetalType(record)),
    normalizedStatus: getStatusFilterValue(typeof record.status === "string" ? record.status : undefined),
    isRedeem: record.isRedeem === true,
    shippingCharges:
      typeof record.shippingCharges === "number" ? record.shippingCharges : undefined,
    metalWeightInGrams:
      typeof record.metalWeightInGrams === "number" ? record.metalWeightInGrams : undefined,
    metalDetails: normalizeMetalDetails(record.metalDetails),
  };
}

function formatTransactionType(type?: string) {
  return String(type ?? "-").replace(/_/g, " ").toUpperCase();
}

const SIP_TRANSACTION_TYPES = new Set(["SIP", "MANUAL_SIP"]);

const TRANSACTION_TYPE_DISPLAY_LABELS: Record<string, string> = {
  SELL: "Sell",
  GIFTCARDBUY: "Gift Card Buy",
};

function formatTransactionTypeDisplay(
  type?: string,
  frequency?: string,
  isRedeem?: boolean,
) {
  if (isRedeem) return "Physical Redeem";
  const kind = normalizeTxnTypeForKind(type);
  const base = TRANSACTION_TYPE_DISPLAY_LABELS[kind] ?? formatTransactionType(type);
  if (!SIP_TRANSACTION_TYPES.has(kind) || !frequency) return base;
  return `${base} (${formatTransactionType(frequency)})`;
}

function normalizeFilterValue(value?: string) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");
}

function normalizeSearchValue(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function getNameSearchRank(name: string, term: string) {
  const searchWords = term.split(/\s+/).filter(Boolean);
  const nameWords = name.split(/\s+/).filter(Boolean);

  if (searchWords.length === 0 || nameWords.length === 0) return null;

  if (
    searchWords.every((searchWord) =>
      nameWords.some((nameWord) => nameWord.startsWith(searchWord))
    )
  ) {
    return name.startsWith(term) ? 0 : 1;
  }

  if (searchWords.every((searchWord) => name.includes(searchWord))) {
    return 2;
  }

  return null;
}

function getTransactionSearchRank(txn: TransactionItem, term: string, fallbackUserName: string) {
  const userName = normalizeSearchValue(txn.userName ?? txn.user?.name ?? fallbackUserName);
  const userNameRank = getNameSearchRank(userName, term);
  if (userNameRank !== null) return userNameRank;

  const userContactFields = [
    normalizeSearchValue(txn.user?.email),
    normalizeSearchValue(txn.user?.phone),
  ].filter(Boolean);

  if (userContactFields.some((field) => field.startsWith(term))) return 3;
  if (userContactFields.some((field) => field.includes(term))) return 4;

  const transactionFields = [
    txn.id,
    txn.userId,
    txn.providerId,
    txn.referenceId,
    txn.invoiceNumber,
    txn.externalPaymentId,
    txn.merchantTransactionId,
    txn.transactionType ?? txn.type,
    txn.metalType ?? txn.paymentMethod,
    txn.paymentMethod,
    txn.razorpayPaymentMethod,
    txn.utrNumber,
    typeof txn.amount === "number" ? String(txn.amount) : "",
  ].map(normalizeSearchValue).filter(Boolean);


  if (transactionFields.some((field) => field.startsWith(term))) return 5;
  if (transactionFields.some((field) => field.includes(term))) return 6;

  return null;
}

function getStatusFilterValue(status?: string) {
  const raw = String(status ?? "").trim().toLowerCase();
  if (raw === FAILED_TRANSACTION_STATUS_FILTER || raw === "pending failed") {
    return FAILED_TRANSACTION_STATUS_FILTER;
  }

  const normalized = normalizeFilterValue(status);
  if (!normalized) return "";
  if (
    normalized.includes("success") ||
    normalized.includes("complete") ||
    normalized.includes("paid")
  ) {
    return "success";
  }
  if (normalized.includes("process")) return "processing";
  if (normalized.includes("refund")) return "refund";
  if (normalized.includes("pending") || normalized.includes("in progress")) {
    return "pending";
  }
  if (
    normalized.includes("failed") ||
    normalized.includes("error") ||
    normalized.includes("cancel")
  ) {
    return "failed";
  }
  return normalized;
}

function normalizeRedemptionOrderStatus(orderStatus?: string): RedemptionOrderStatusFilter | "" {
  const normalized = normalizeFilterValue(orderStatus);
  if (!normalized) return "";
  if (normalized === "all") return "all";

  const exactMatch = REDEMPTION_ORDER_STATUS_EXACT_ALIASES[normalized];
  if (exactMatch) return exactMatch;

  for (const rule of REDEMPTION_ORDER_STATUS_PHRASE_RULES) {
    if (rule.matches(normalized)) return rule.status;
  }
  return "";
}

function formatRedemptionOrderStatusLabel(orderStatus?: string) {
  const key = normalizeRedemptionOrderStatus(orderStatus);
  if (key && key !== "all") {
    return REDEMPTION_ORDER_STATUS_LABELS[key];
  }
  return orderStatus?.trim() || "Unknown";
}

function resolveTransactionStatusValue(
  txn: TransactionItem,
  physicalOnly: boolean,
): string | undefined {
  if (physicalOnly && isPhysicalRedeemTransaction(txn)) {
    return txn.orderStatus;
  }
  return txn.status;
}

function transactionMatchesStatusFilter(
  txn: TransactionItem,
  statusFilter: string,
  sellOnly: boolean,
  physicalOnly = false,
) {
  if (statusFilter === "all") return true;

  if (physicalOnly && isPhysicalRedeemTransaction(txn)) {
    return normalizeRedemptionOrderStatus(txn.orderStatus) === statusFilter;
  }

  if (isFailedTransactionStatusFilter(statusFilter)) {
    const status = sellOnly
      ? getSellStatusFilterValue(txn.status)
      : txn.normalizedStatus ?? "";
    return isPendingOrFailedTransactionStatus(status);
  }

  return sellOnly
    ? getSellStatusFilterValue(txn.status) === statusFilter
    : (txn.normalizedStatus ?? "") === statusFilter;
}

function getSellStatusFilterValue(status?: string): SellStatusFilter | "" {
  const normalized = normalizeFilterValue(status);
  if (!normalized) return "";
  if (normalized === "all") return "all";
  if (normalized.includes("pending")) {
    return "pending";
  }
  if (
    normalized.includes("complete") ||
    normalized.includes("success") ||
    normalized.includes("paid")
  ) {
    return "success";
  }
  if (normalized.includes("failed") ||
    normalized.includes("error") || normalized.includes("cancel")
  ) {
    return "failed";
  }
  return "";
}

function belongsOnSellTransactionsTable(txn: TransactionItem) {
  if (!isPhysicalRedeemTransaction(txn)) return true;
  return getSellStatusFilterValue(txn.status) === "failed";
}

function getInitialSellStatusFilter(): SellStatusFilter {
  if (typeof window === "undefined") return "pending";
  const statusFilter = new URLSearchParams(window.location.search).get("statusFilter");
  const normalized = getSellStatusFilterValue(statusFilter ?? undefined);
  if (normalized) return normalized;
  return "pending";
}

function getMetalFilterValue(value?: string) {
  const normalized = normalizeFilterValue(value).replace(/\s+/g, "");
  if (!normalized) return "";
  if (normalized.includes("goldandsilver") || normalized === "both") return "both";
  if (normalized.includes("gold")) return "gold";
  if (normalized.includes("silver")) return "silver";
  return normalized;
}

const METAL_TYPE_DISPLAY_LABELS: Record<string, string> = {
  gold: "Gold",
  silver: "Silver",
  both: "Gold & Silver",
};

function formatPaymentMethodLabel(value?: string) {
  if (!value) return "-";
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-") return "-";
  const upper = trimmed.toUpperCase();
  if (upper === "UPI") return "UPI";
  return trimmed
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isMetalTypeValue(value?: string) {
  const v = getMetalFilterValue(value);
  return v === "gold" || v === "silver" || v === "both";
}

function resolveTransactionPaymentMethod(record: Record<string, unknown>) {
  if (typeof record.razorpayPaymentMethod === "string" && record.razorpayPaymentMethod.trim()) {
    return record.razorpayPaymentMethod.trim();
  }
  if (typeof record.paymentMethod === "string" && record.paymentMethod.trim()) {
    const pm = record.paymentMethod.trim();
    if (!isMetalTypeValue(pm)) return pm;
  }
  if (typeof record.payment_method === "string" && (record.payment_method as string).trim()) {
    return (record.payment_method as string).trim();
  }
  return undefined;
}

function formatTransactionDateTime(value?: string) {
  const parts = value ? formatDateTimeParts(value) : null;
  if (!parts) return "-";
  return `${parts.date}, ${parts.time}`;
}

function TransactionDateTimeCell({ value }: { value?: string }) {
  if (!value) return <span>-</span>;
  const parts = formatDateTimeParts(value);
  if (!parts) return <span>-</span>;
  return (
    <div className="flex flex-col leading-tight gap-0.5">
      <span>{parts.date}</span>
      <span className="text-muted-foreground">{parts.time}</span>
    </div>
  );
}

function formatSettlementDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

const formatScheduleDate = formatSettlementDate;

function formatBulkPaymentFileDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function unwrapProviderMissingTransactions(data: unknown): unknown[] {
  if (!data) return [];
  const record = data as Record<string, unknown>;
  return (record.data as unknown[]) ?? [];
}

function normalizeProviderMissingTransaction(value: unknown): ProviderMissingTransaction | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;

  const cashfreePaymentId =
    typeof record.cashfreePaymentId === "string" ? record.cashfreePaymentId : undefined;
  if (!cashfreePaymentId) return null;

  const matchedUser =
    record.matchedUser && typeof record.matchedUser === "object"
      ? (record.matchedUser as Record<string, unknown>)
      : undefined;
  const cashfreeDetails =
    record.cashfreeAllDetails && typeof record.cashfreeAllDetails === "object"
      ? (record.cashfreeAllDetails as Record<string, unknown>)
      : undefined;
  const eventDetails =
    cashfreeDetails?.event_details && typeof cashfreeDetails.event_details === "object"
      ? (cashfreeDetails.event_details as Record<string, unknown>)
      : undefined;
  const paymentDetails =
    cashfreeDetails?.payment_details && typeof cashfreeDetails.payment_details === "object"
      ? (cashfreeDetails.payment_details as Record<string, unknown>)
      : undefined;
  const createdAt =
    typeof record.paymentTime === "string"
      ? record.paymentTime
      : typeof eventDetails?.event_time === "string"
        ? eventDetails.event_time
        : undefined;
  const notes =
    record.notes && typeof record.notes === "object"
      ? (record.notes as Record<string, unknown>)
      : undefined;
  const orderTags =
    record.orderTags && typeof record.orderTags === "object"
      ? (record.orderTags as Record<string, unknown>)
      : undefined;
  const existingTransaction =
    record.existingTransaction && typeof record.existingTransaction === "object"
      ? (record.existingTransaction as Record<string, unknown>)
      : undefined;
  const existingTransactionId =
    existingTransaction?._id != null
      ? String(existingTransaction._id)
      : existingTransaction?.id != null
        ? String(existingTransaction.id)
        : undefined;
  const readTrimmedString = (value: unknown) => {
    if (value == null) return undefined;
    const trimmed = String(value).trim();
    return trimmed ? trimmed : undefined;
  };
  const resolveSipIdFromSource = (source?: Record<string, unknown>) => {
    if (!source) return undefined;
    const sip = readTrimmedString(source["sipId"]);
    if (sip) return sip;
    return readTrimmedString(source["masterSipId"]);
  };
  const cashfreeOrderTags =
    cashfreeDetails &&
      typeof (cashfreeDetails as Record<string, unknown>).order_tags === "object" &&
      (cashfreeDetails as Record<string, unknown>).order_tags !== null
      ? ((cashfreeDetails as Record<string, unknown>).order_tags as Record<string, unknown>)
      : undefined;
  const sipId =
    resolveSipIdFromSource(record) ??
    resolveSipIdFromSource(existingTransaction) ??
    resolveSipIdFromSource(orderTags) ??
    resolveSipIdFromSource(notes) ??
    resolveSipIdFromSource(cashfreeOrderTags);
  const resolveMetalTypeFromSource = (source?: Record<string, unknown>) => {
    if (!source) return undefined;
    const raw =
      readTrimmedString(source["metalType"]) ??
      readTrimmedString(source["metal_type"]) ??
      readTrimmedString(source["metaltype"]) ??
      readTrimmedString(source["MetalType"]);
    return raw ? raw.toUpperCase() : undefined;
  };
  const metalType =
    readTrimmedString(record["metalType"])?.toUpperCase() ??
    resolveMetalTypeFromSource(existingTransaction) ??
    resolveMetalTypeFromSource(orderTags) ??
    resolveMetalTypeFromSource(cashfreeOrderTags) ??
    resolveMetalTypeFromSource(notes) ??
    undefined;

  return {
    cashfreePaymentId,
    cashfreeOrderId: (record.cashfreeOrderId as string) ?? "-",
    amount: typeof record.orderAmount === "number" ? record.orderAmount : undefined,
    metalType,
    currency: (record.paymentCurrency as string) ?? "-",
    status: (record.paymentStatus as string) ?? "-",
    method:
      (record.paymentMethod as string) ??
      (paymentDetails?.payment_group as string) ??
      "-",
    email: (record.customerEmail as string) ?? (matchedUser?.email as string) ?? "-",
    contact: (record.customerPhone as string) ?? (matchedUser?.phone as string) ?? "-",
    description: (record.cashfreeOrderId as string) ?? "-",
    createdAt: createdAt ?? "-",
    userId:
      matchedUser?.userId != null
        ? String(matchedUser.userId)
        : record.userId != null
          ? String(record.userId)
          : "-",
    userName: (record.customerName as string) ?? (matchedUser?.name as string) ?? "-",
    userPhone: (record.customerPhone as string) ?? (matchedUser?.phone as string) ?? "-",
    userEmail: (record.customerEmail as string) ?? (matchedUser?.email as string) ?? "-",
    transactionType:
      readTrimmedString(record["transactionType"]) ??
      readTrimmedString(orderTags?.["transactionType"]) ??
      readTrimmedString(cashfreeOrderTags?.["transactionType"]) ??
      readTrimmedString(existingTransaction?.["transactionType"]) ??
      readTrimmedString(orderTags?.["type"]) ??
      "-",
    notesType:
      (notes?.type as string) ??
      (orderTags?.type as string) ??
      "-",
    transactionId: existingTransactionId,
    sipId,
  };
}

function isCampaignProviderPending(item: ProviderMissingTransaction) {
  return normalizeSearchValue(item.notesType).toUpperCase() === "CAMPAIGN";
}

function providerMissingMatchesSearch(item: ProviderMissingTransaction, term: string) {
  const fields = [
    item.cashfreePaymentId,
    item.cashfreeOrderId,
    item.transactionId,
    item.userName,
    item.userEmail,
    item.userPhone,
    item.contact,
    item.email,
    item.description,
    item.sipId,
    item.metalType,
    item.method,
  ].map(normalizeSearchValue);

  return fields.some((field) => field.includes(term));
}

function redemptionOrderStatusBadgeVariant(orderStatus?: string) {
  const status = normalizeRedemptionOrderStatus(orderStatus);
  switch (status) {
    case "delivered":
      return "success";
    case "pending":
    case "processing":
      return "warning";
    case "cancelled":
    case "rto":
      return "destructive";
    default:
      return "outline";
  }
}

function statusBadgeVariant(status?: string, sellOnly = false, physicalOnly = false) {
  if (physicalOnly) {
    return redemptionOrderStatusBadgeVariant(status);
  }
  if (sellOnly) {
    const normalized = getSellStatusFilterValue(status);
    if (normalized === "success") return "success";
    if (normalized === "pending") return "warning";
    if (normalized === "failed") return "destructive";
    return "outline";
  }
  const normalized = getStatusFilterValue(status);
  if (normalized === "success") return "success";
  if (normalized === "processing" || normalized === "pending") return "warning";
  if (normalized === "failed") return "destructive";
  return "outline";
}

function hasInvoice(txn: TransactionItem) {
  return Boolean(txn.invoiceNumber?.trim() || txn.invoiceUrl?.trim());
}

function canCreateInvoice(txn: TransactionItem) {
  if (isGiftCardBuyTransaction(txn)) return false;
  if (hasInvoice(txn)) return false;
  return getStatusFilterValue(txn.status) === "success";
}

function getCreateInvoicePayload(txn: TransactionItem) {
  const payload: {
    transactionId: string;
    externalPaymentId?: string;
    merchantTransactionId?: string;
  } = { transactionId: txn.id };

  if (txn.razorpayPaymentId) {
    payload.externalPaymentId = txn.razorpayPaymentId;
  }

  if (txn.merchantTransactionId) {
    payload.merchantTransactionId = txn.merchantTransactionId;
  }

  return payload;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function canCompleteSellTransaction(txn: TransactionItem) {
  const normalized = getSellStatusFilterValue(txn.status);
  return normalized === "pending" || normalized === "failed";
}

function canMarkSellTransactionFailed(txn: TransactionItem) {
  const normalized = getSellStatusFilterValue(txn.status);
  if (normalized === "failed") return false;
  if (normalized === "pending" || normalized === "success") return true;
  const raw = normalizeFilterValue(txn.status);
  return raw.includes("process");
}

function canMarkSellTransactionPending(txn: TransactionItem) {
  const normalized = getSellStatusFilterValue(txn.status);
  return normalized === "failed" || normalized === "success";
}

function hasSellTransactionActions(txn: TransactionItem) {
  return (
    canCompleteSellTransaction(txn) ||
    canMarkSellTransactionFailed(txn) ||
    canMarkSellTransactionPending(txn)
  );
}

function isSuccessfulSellTransaction(txn: TransactionItem) {
  return getSellStatusFilterValue(txn.status) === "success";
}

function shouldShowSellPayoutFields(txn: TransactionItem, statusFilter: string) {
  if (statusFilter === "success") return true;
  if (statusFilter === "all") return isSuccessfulSellTransaction(txn);
  return false;
}

async function downloadSelectedInvoices(transactions: TransactionItem[]) {
  if (transactions.length === 0) {
    toast({
      variant: "destructive",
      title: "No invoices selected",
    });
    return;
  }

  let successCount = 0;
  let failedCount = 0;

  for (const txn of transactions) {
    const success = await downloadInvoice(txn);
    if (success) {
      successCount++;
    } else {
      failedCount++;
    }
  }

  if (successCount > 0) {
    toast({
      title: "Download Successful",
      description: `${successCount} invoice${successCount > 1 ? "s" : ""} downloaded successfully`,
    });
  }

  if (failedCount > 0) {
    toast({
      variant: "destructive",
      title: "Download Failed",
      description: `${failedCount} invoice${failedCount > 1 ? "s" : ""} failed to download`,
    });
  }
}

function ProviderMissingTransactionsPanel() {
  const { mutateAsync: sendBuyOtp, isPending: isSendingBuyOtp } = useSendBuyOtp();
  const { mutateAsync: verifyBuyOtp, isPending: isVerifyingBuyOtp } = useVerifyBuyOtp();
  const { mutateAsync: sendRefundOtp, isPending: isSendingRefundOtp } = useSendRefundOtp();
  const { mutateAsync: verifyRefundOtp, isPending: isVerifyingRefundOtp } = useVerifyRefundOtp();
  const { sortKey, sortDirection, directionFactor, handleSort } =
    useTableSort<ProviderMissingSortKey>();
  const [searchTerm, setSearchTerm] = usePersistedSearchTerm(createPersistedSearchTermKey("transactions-provider-pending"));
  const [dateRange, setDateRange] = usePersistedDateRange(
    createPersistedDateRangeKey("transactions-provider-pending"),
    () => (typeof window === "undefined" ? getCurrentDateRange() : getInitialDateRange(window.location.search)),
  );
  const [buyOpen, setBuyOpen] = React.useState(false);
  const [buyAmount, setBuyAmount] = React.useState("");
  const [buyOtp, setBuyOtp] = React.useState("");
  const [buyOtpSent, setBuyOtpSent] = React.useState(false);
  const [buyOtpResendSeconds, setBuyOtpResendSeconds] = React.useState(0);
  const [buyMetalType, setBuyMetalType] = React.useState("GOLD");
  const [selectedPending, setSelectedPending] =
    React.useState<ProviderMissingTransaction | null>(null);
  const pendingBuyRef = React.useRef<ProviderMissingTransaction | null>(null);
  const buyAmountInputRef = React.useRef<HTMLInputElement | null>(null);
  const [cashfreeOrderId, setCashfreeOrderId] = React.useState<string | null>(null);
  const [cashfreePaymentId, setCashfreePaymentId] = React.useState<string | null>(null);
  const [transactionType, setTransactionType] = React.useState("");
  const [refundingItemKey, setRefundingItemKey] = React.useState<string | null>(null);
  const [refundOpen, setRefundOpen] = React.useState(false);
  const [refundOtp, setRefundOtp] = React.useState("");
  const [refundOtpSent, setRefundOtpSent] = React.useState(false);
  const [refundOtpResendSeconds, setRefundOtpResendSeconds] = React.useState(0);
  const [selectedRefund, setSelectedRefund] =
    React.useState<ProviderMissingTransaction | null>(null);
  const pendingRefundRef = React.useRef<ProviderMissingTransaction | null>(null);
  const [auditTransactionTypeFilter, setAuditTransactionTypeFilter] = React.useState("all");
  const [auditMetalTypeFilter, setAuditMetalTypeFilter] = React.useState("all");
  const [auditPaymentMethodFilter, setAuditPaymentMethodFilter] = React.useState("all");
  React.useEffect(() => {
    if (buyOtpResendSeconds <= 0) return;

    const timer = window.setInterval(() => {
      setBuyOtpResendSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [buyOtpResendSeconds]);
  React.useEffect(() => {
    if (refundOtpResendSeconds <= 0) return;

    const timer = window.setInterval(() => {
      setRefundOtpResendSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [refundOtpResendSeconds]);

  const currentHost = window.location.hostname;
  const loggedInEmail = readLoggedInUserEmail();
  const canShowAuditActionButton =
    ((currentHost === "dev.gfolio.in" || currentHost === "localhost") &&
      loggedInEmail === "admin@mailinator.com") ||
    (currentHost === "admin.gfolio.in" &&
      loggedInEmail === "team@gfolio.in");
  const auditTableColSpan = canShowAuditActionButton ? 9 : 8;

  const fromDate = dateRange?.from ? formatDateInputValue(dateRange.from) : undefined;
  const toDate = dateRange?.to
    ? formatDateInputValue(dateRange.to)
    : dateRange?.from
      ? formatDateInputValue(dateRange.from)
      : undefined;

  const {
    data: providerMissingResponse,
    isLoading,
    isError,
    refetch: refetchProviderPending,
  } = useProviderMissingTransactions(fromDate, toDate);

  const resetAuditBuyForm = () => {
    pendingBuyRef.current = null;
    setBuyOpen(false);
    setBuyAmount("");
    setBuyOtp("");
    setBuyOtpSent(false);
    setBuyOtpResendSeconds(0);
    setSelectedPending(null);
    setCashfreeOrderId("");
    setCashfreePaymentId("");
    setTransactionType("");
  };

  const handleOpenBuy = (item: ProviderMissingTransaction) => {
    pendingBuyRef.current = item;
    setSelectedPending(item);
    setBuyMetalType(item.metalType?.trim().toUpperCase() || "GOLD");
    setTransactionType(item.transactionType?.trim().toUpperCase() ?? "");
    setBuyAmount(
      typeof item.amount === "number" && item.amount > 0
        ? Number(item.amount).toLocaleString("en-IN")
        : "",
    );
    setCashfreeOrderId(item.cashfreeOrderId ?? "");
    setCashfreePaymentId(item.cashfreePaymentId ?? "");
    setBuyOtp("");
    setBuyOtpSent(false);
    setBuyOtpResendSeconds(0);
    setBuyOpen(true);
  };

  const buildAuditBuyPayload = () => {
    const pending = pendingBuyRef.current ?? selectedPending;

    if (!pending?.cashfreePaymentId) {
      toast({
        title: "Missing payment",
        description: "Could not read Cashfree payment details for this row.",
        variant: "destructive",
      });
      return null;
    }

    if (!pending.userId) {
      toast({
        title: "Cannot buy metal",
        description: "This payment is not linked to a user account.",
        variant: "destructive",
      });
      return null;
    }

    if (!buyAmount.trim()) {
      toast({
        title: "Missing amount",
        description: "Enter a purchase amount.",
        variant: "destructive",
      });
      return null;
    }

    if (!transactionType.trim()) {
      toast({
        title: "Missing transaction type",
        description: "Select a transaction type before submitting.",
        variant: "destructive",
      });
      return null;
    }

    const amountValue = Number(buyAmount.replace(/,/g, ""));
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      toast({
        title: "Invalid amount",
        description: "Enter a valid purchase amount.",
        variant: "destructive",
      });
      return null;
    }

    const normalizedBuyTransactionType = transactionType.trim().toUpperCase();

    const payload: {
      amount: number;
      metalType: string;
      cashfreePaymentId: string;
      cashfreeOrderId?: string;
      user: string;
      transactionType: string | null;
      isAudit: boolean;
      sipId?: string;
      transactionId?: string;
    } = {
      amount: amountValue,
      metalType: buyMetalType,
      cashfreePaymentId: pending.cashfreePaymentId,
      user: pending.userId,
      transactionType: transactionType || null,
      isAudit: true,
    };

    if (pending.cashfreeOrderId) {
      payload.cashfreeOrderId = pending.cashfreeOrderId;
    }

    if (normalizedBuyTransactionType === "MANUAL_SIP" && pending.sipId) {
      payload.sipId = pending.sipId;
    }

    if (normalizedBuyTransactionType === "BUY" && pending.transactionId) {
      payload.transactionId = pending.transactionId;
    }

    return payload;
  };

  const isManualSipBuy = transactionType.trim().toUpperCase() === "MANUAL_SIP";
  const selectedSipId = selectedPending?.sipId ?? pendingBuyRef.current?.sipId ?? "";
  const isBuyTransactionType = transactionType.trim().toUpperCase() === "BUY";
  const selectedTransactionId =
    selectedPending?.transactionId ?? pendingBuyRef.current?.transactionId ?? "";

  const handleSendBuyOtp = async () => {
    if (!buildAuditBuyPayload()) return;

    try {
      await sendBuyOtp();
      setBuyOtp("");
      setBuyOtpSent(true);
      setBuyOtpResendSeconds(AUDIT_OTP_RESEND_COOLDOWN_SECONDS);
      toast({ title: "OTP sent", description: "Enter the OTP to confirm the buy." });
    } catch (error: unknown) {
      toast({
        title: "OTP failed",
        description: error instanceof Error ? error.message : "Failed to send OTP.",
        variant: "destructive",
      });
    }
  };

  const handleVerifyBuyOtp = async () => {
    if (!buyOtp.trim()) return;

    const payload = buildAuditBuyPayload();
    if (!payload) return;

    try {
      const response = await verifyBuyOtp({ otp: buyOtp.trim(), payload });
      toast({
        title: "Success",
        description: response?.message ?? "Metal purchased successfully.",
      });
      resetAuditBuyForm();
      void refetchProviderPending();
    } catch (error: unknown) {
      toast({
        title: "Verification failed",
        description: error instanceof Error ? error.message : "Failed to verify OTP or purchase metal.",
        variant: "destructive",
      });
    }
  };

  const resetAuditRefundForm = () => {
    pendingRefundRef.current = null;
    setRefundOpen(false);
    setRefundOtp("");
    setRefundOtpSent(false);
    setRefundOtpResendSeconds(0);
    setSelectedRefund(null);
    setRefundingItemKey(null);
  };

  const handleOpenRefund = (item: ProviderMissingTransaction) => {
    if (!item.transactionId) {
      toast({
        title: "Cannot refund",
        description: "No transaction found in DB for this row.",
        variant: "destructive",
      });
      return;
    }

    pendingRefundRef.current = item;
    setSelectedRefund(item);
    setRefundOtp("");
    setRefundOtpSent(false);
    setRefundOtpResendSeconds(0);
    setRefundOpen(true);
  };

  const handleSendRefundOtp = async () => {
    const pending = pendingRefundRef.current ?? selectedRefund;

    if (!pending?.transactionId) {
      toast({
        title: "Cannot refund",
        description: "No transaction found in DB for this row.",
        variant: "destructive",
      });
      return;
    }

    try {
      await sendRefundOtp();
      setRefundOtp("");
      setRefundOtpSent(true);
      setRefundOtpResendSeconds(AUDIT_OTP_RESEND_COOLDOWN_SECONDS);
      toast({ title: "OTP sent", description: "Enter the OTP to confirm the refund." });
    } catch (error: unknown) {
      toast({
        title: "OTP failed",
        description: error instanceof Error ? error.message : "Failed to send OTP.",
        variant: "destructive",
      });
    }
  };

  const handleVerifyRefundOtp = async () => {
    if (!refundOtp.trim()) return;

    const pending = pendingRefundRef.current ?? selectedRefund;

    if (!pending?.transactionId) {
      toast({
        title: "Cannot refund",
        description: "No transaction found in DB for this row.",
        variant: "destructive",
      });
      return;
    }

    const refundingKey = pending.transactionId ?? pending.cashfreePaymentId;
    setRefundingItemKey(refundingKey);

    try {
      const response = await verifyRefundOtp({
        otp: refundOtp.trim(),
        transactionId: pending.transactionId,
      });
      toast({
        title: "Refund initiated",
        description: response?.message ?? "Refund initiated successfully.",
      });
      resetAuditRefundForm();
      void refetchProviderPending();
    } catch (error: unknown) {
      toast({
        title: "Verification failed",
        description:
          error instanceof Error ? error.message : "Failed to verify OTP or initiate refund.",
        variant: "destructive",
      });
      setRefundingItemKey(null);
    }
  };

  const missingTransactions = React.useMemo(() => {
    return unwrapProviderMissingTransactions(providerMissingResponse)
      .map(normalizeProviderMissingTransaction)
      .filter((item): item is ProviderMissingTransaction => item !== null);
  }, [providerMissingResponse]);

  const filteredMissingTransactions = React.useMemo(() => {
    const term = normalizeSearchValue(searchTerm);
    return missingTransactions.filter((item) => {
      const matchesSearch = !term || providerMissingMatchesSearch(item, term);
      const matchesTransactionType =
        auditTransactionTypeFilter === "all" ||
        normalizeSearchValue(item.transactionType).toUpperCase() === auditTransactionTypeFilter;
      const matchesMetalType =
        auditMetalTypeFilter === "all" ||
        getMetalFilterValue(item.metalType) === auditMetalTypeFilter;
      const matchesPaymentMethod =
        auditPaymentMethodFilter === "all" ||
        normalizeSearchValue(item.method) === auditPaymentMethodFilter;
      return matchesSearch && matchesTransactionType && matchesMetalType && matchesPaymentMethod;
    });
  }, [
    auditMetalTypeFilter,
    auditPaymentMethodFilter,
    auditTransactionTypeFilter,
    missingTransactions,
    searchTerm,
  ]);

  const sortedMissingTransactions = React.useMemo(() => {
    if (!sortKey) return filteredMissingTransactions;

    return [...filteredMissingTransactions].sort((a, b) => {
      if (sortKey === "user") {
        const aValue = normalizeSearchValue(a.userName ?? a.email ?? a.contact ?? "");
        const bValue = normalizeSearchValue(b.userName ?? b.email ?? b.contact ?? "");
        return aValue.localeCompare(bValue) * directionFactor;
      }
      if (sortKey === "amount") {
        return (Number(a.amount ?? 0) - Number(b.amount ?? 0)) * directionFactor;
      }
      if (sortKey === "transactionType") {
        return (
          normalizeSearchValue(a.transactionType).localeCompare(
            normalizeSearchValue(b.transactionType),
          ) * directionFactor
        );
      }
      if (sortKey === "metal") {
        return (
          normalizeSearchValue(a.metalType).localeCompare(normalizeSearchValue(b.metalType)) *
          directionFactor
        );
      }
      if (sortKey === "method") {
        return (
          normalizeSearchValue(a.method).localeCompare(normalizeSearchValue(b.method)) *
          directionFactor
        );
      }
      const aTime = new Date(a.createdAt ?? 0).getTime();
      const bTime = new Date(b.createdAt ?? 0).getTime();
      return (aTime - bTime) * directionFactor;
    });
  }, [directionFactor, filteredMissingTransactions, sortKey]);

  const pagination = useTablePagination(sortedMissingTransactions);

  const auditMetalTypeOptions = React.useMemo(() => {
    const options = new Set<string>();
    for (const item of missingTransactions) {
      const metalValue = getMetalFilterValue(item.metalType);
      if (metalValue) options.add(metalValue);
    }
    return [
      { value: "all", label: "All" },
      ...Array.from(options)
        .sort()
        .map((metal) => ({
          value: metal,
          label: METAL_TYPE_DISPLAY_LABELS[metal] ?? metal.charAt(0).toUpperCase() + metal.slice(1),
        })),
    ];
  }, [missingTransactions]);

  const auditPaymentMethodOptions = React.useMemo(() => {
    const options = new Set<string>();
    for (const item of missingTransactions) {
      const methodValue = normalizeSearchValue(item.method);
      if (methodValue && methodValue !== "-") options.add(methodValue);
    }
    return [
      { value: "all", label: "All" },
      ...Array.from(options)
        .sort()
        .map((method) => ({
          value: method,
          label: formatPaymentMethodLabel(method),
        })),
    ];
  }, [missingTransactions]);

  const showAuditSipIdColumn = React.useMemo(() => {
    if (auditTransactionTypeFilter === "MANUAL_SIP") return true;
    return filteredMissingTransactions.some(
      (item) =>
        normalizeSearchValue(item.transactionType).toUpperCase() === "MANUAL_SIP",
    );
  }, [auditTransactionTypeFilter, filteredMissingTransactions]);

  const auditEmptyColSpan = auditTableColSpan + (showAuditSipIdColumn ? 1 : 0);

  React.useEffect(() => {
    pagination.resetPage();
  }, [
    auditMetalTypeFilter,
    auditPaymentMethodFilter,
    auditTransactionTypeFilter,
    dateRange,
    pagination.resetPage,
    searchTerm,
    sortKey,
    sortDirection,
  ]);

  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm lg:flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search cashfree payment id, user, email, phone..."
            className="pl-10"
          />
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
          <DateRangePicker
            value={dateRange}
            onChange={setDateRange}
            calendarClassName="[--cell-size:1.55rem]"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-[1454px] w-full text-sm text-left">
          <thead className="table-head-sticky">
            <tr>
              <th className="px-4 py-4 ps-6 font-medium w-[190px]">
                <button
                  type="button"
                  onClick={() => handleSort("user")}
                  className={getSortToggleClass(sortKey === "user")}
                >
                  User <SortDirectionIcon active={sortKey === "user"} direction={sortDirection} />
                </button>
              </th>
              <th className="px-4 py-4 font-medium w-[200px]">Cashfree Payment ID</th>
              <th className="px-4 py-4 font-medium w-[120px]">Cashfree Order ID</th>
              <th className="px-4 py-4 font-medium w-[170px]">Transaction ID</th>
              <th className="px-4 py-4 font-medium w-[150px]">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleSort("transactionType")}
                    className={getSortToggleClass(sortKey === "transactionType")}
                  >
                    Transaction Type{" "}
                    <SortDirectionIcon
                      active={sortKey === "transactionType"}
                      direction={sortDirection}
                    />
                  </button>
                  <TableHeaderFilter
                    title="Transaction type"
                    value={auditTransactionTypeFilter}
                    onChange={setAuditTransactionTypeFilter}
                    options={AUDIT_TRANSACTION_TYPE_OPTIONS}
                    activeWhen={(value) => value !== "all"}
                    clearValue="all"
                  />
                </div>
              </th>
              <th className="px-4 py-4 font-medium w-[140px]">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleSort("metal")}
                    className={getSortToggleClass(sortKey === "metal")}
                  >
                    Metal Type{" "}
                    <SortDirectionIcon active={sortKey === "metal"} direction={sortDirection} />
                  </button>
                  <TableHeaderFilter
                    title="Metal type"
                    value={auditMetalTypeFilter}
                    onChange={setAuditMetalTypeFilter}
                    options={auditMetalTypeOptions}
                    activeWhen={(value) => value !== "all"}
                    clearValue="all"
                  />
                </div>
              </th>
              <th className="px-4 py-4 font-medium w-[140px]">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleSort("method")}
                    className={getSortToggleClass(sortKey === "method")}
                  >
                    Payment Method{" "}
                    <SortDirectionIcon active={sortKey === "method"} direction={sortDirection} />
                  </button>
                  <TableHeaderFilter
                    title="Payment method"
                    value={auditPaymentMethodFilter}
                    onChange={setAuditPaymentMethodFilter}
                    options={auditPaymentMethodOptions}
                    activeWhen={(value) => value !== "all"}
                    clearValue="all"
                  />
                </div>
              </th>
              <th className="px-4 py-4 font-medium w-[120px]">
                <button
                  type="button"
                  onClick={() => handleSort("amount")}
                  className={getSortToggleClass(sortKey === "amount")}
                >
                  Amount <SortDirectionIcon active={sortKey === "amount"} direction={sortDirection} />
                </button>
              </th>
              {showAuditSipIdColumn ? (
                <th className="px-4 py-4 font-medium w-[140px]">SIP ID</th>
              ) : null}
              <th className="px-4 py-4 font-medium w-[170px]">
                <button
                  type="button"
                  onClick={() => handleSort("date")}
                  className={getSortToggleClass(sortKey === "date")}
                >
                  Date &amp; Time{" "}
                  <SortDirectionIcon active={sortKey === "date"} direction={sortDirection} />
                </button>
              </th>
              {canShowAuditActionButton ? (
                <th className="px-4 py-4 font-medium text-right w-[100px]">Actions</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={auditEmptyColSpan} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Loading provider missing transactions...
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={auditEmptyColSpan} className="px-4 py-10 text-center text-sm text-destructive">
                  Failed to load provider missing transactions.
                </td>
              </tr>
            ) : pagination.pagedItems.length === 0 ? (
              <tr>
                <td colSpan={auditEmptyColSpan} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No provider missing transactions found.
                </td>
              </tr>
            ) : (
              pagination.pagedItems.map((item) => {
                const displayUserName = item.userName ?? item.email ?? item.contact ?? "-";
                const userHref = item.userId
                  ? `/users/${item.userId}?from=transactions&tab=${PROVIDER_PENDING_TAB_QUERY}`
                  : null;

                return (
                  <tr
                    key={item.cashfreePaymentId}
                    className="border-b border-border hover:bg-muted transition-colors"
                  >
                    <td className="px-4 py-4 ps-6">
                      {userHref ? (
                        <Link href={userHref}>
                          <p className="font-medium truncate max-w-[190px] cursor-pointer hover:text-primary transition-colors">
                            {displayUserName}
                          </p>
                          <p className="text-xs text-muted-foreground truncate max-w-[190px]">
                            {item.userPhone ?? item.contact ?? item.userEmail ?? item.email ?? "-"}
                          </p>
                        </Link>
                      ) : (
                        <div>
                          <p className="font-medium truncate max-w-[190px]">{displayUserName}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[190px]">
                            {item.userPhone ?? item.contact ?? item.userEmail ?? item.email ?? "-"}
                          </p>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-muted-foreground">
                      {item.cashfreePaymentId}
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-muted-foreground">
                      {item.cashfreeOrderId}
                    </td>
                    <td
                      className="px-4 py-4 font-mono text-xs text-muted-foreground max-w-[170px] truncate"
                      title={item.transactionId ?? undefined}
                    >
                      {item.transactionId ?? "-"}
                    </td>
                    <td className="px-4 py-4 font-medium text-foreground">
                      {item.transactionType ?? "-"}
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-muted-foreground">
                      {(() => {
                        const metalFilterValue = getMetalFilterValue(item.metalType);
                        return (
                          METAL_TYPE_DISPLAY_LABELS[metalFilterValue] ?? item.metalType ?? "-"
                        );
                      })()}
                    </td>
                    <td className="px-4 py-4 font-mono text-xs text-muted-foreground">
                      {formatPaymentMethodLabel(item.method)}
                    </td>
                    <td className="px-4 py-4 font-bold text-foreground">
                      {typeof item.amount === "number" ? formatCurrency(item.amount) : "-"}
                    </td>
                    {showAuditSipIdColumn ? (
                      <td
                        className="px-4 py-4 font-mono text-xs text-muted-foreground max-w-[140px] truncate"
                        title={item.sipId ?? undefined}
                      >
                        {item.sipId ?? "-"}
                      </td>
                    ) : null}
                    <td className="px-4 py-4 text-muted-foreground">
                      <TransactionDateTimeCell value={item.createdAt} />
                    </td>
                    {canShowAuditActionButton ? (
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        {isCampaignProviderPending(item) ? (
                          <span className="text-xs text-muted-foreground">-</span>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              size="sm"
                              className="cursor-pointer"
                              disabled={!item.userId || isSendingBuyOtp || isVerifyingBuyOtp}
                              onClick={() => handleOpenBuy(item)}
                            >
                              Buy
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="cursor-pointer"
                              disabled={
                                !item.transactionId ||
                                isSendingRefundOtp ||
                                isVerifyingRefundOtp
                              }
                              onClick={() => handleOpenRefund(item)}
                            >
                              Refund
                            </Button>
                          </div>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={buyOpen}
        onOpenChange={(open) => {
          if (!open) {
            resetAuditBuyForm();
            return;
          }
          setBuyOpen(true);
        }}
      >
        <DialogContent
          onPointerDownOutside={(event) => event.preventDefault()}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            requestAnimationFrame(() => {
              const input = buyAmountInputRef.current;
              if (!input) return;
              input.focus();
              const len = input.value.length;
              input.setSelectionRange(len, len);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Buy Metal</DialogTitle>
            <DialogDescription>
              {buyOtpSent
                ? "Enter the OTP to confirm the purchase."
                : `Enter amount to buy ${buyMetalType.toLowerCase()}.`}
            </DialogDescription>
          </DialogHeader>
          {!buyOtpSent ? (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Metal Type</label>
                <Input
                  type="text"
                  value={buyMetalType}
                  readOnly
                  className="h-12 bg-muted"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Transaction Type</label>
                <Select value={transactionType} onValueChange={setTransactionType}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      ...BUY_TRANSACTION_TYPE_OPTIONS,
                      ...(transactionType &&
                        !BUY_TRANSACTION_TYPE_OPTIONS.some((option) => option.value === transactionType)
                        ? [{ value: transactionType, label: transactionType.replace(/_/g, " ") }]
                        : []),
                    ].map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* Amount */}
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  ₹
                </span>
                <Input
                  ref={buyAmountInputRef}
                  type="text"
                  inputMode="decimal"
                  placeholder="Enter amount"
                  value={formatAmount(buyAmount)}
                  className="h-12 pl-8"
                  onFocus={(event) => {
                    const len = event.currentTarget.value.length;
                    event.currentTarget.setSelectionRange(len, len);
                  }}
                  onChange={(event) => {
                    setBuyAmount(formatAmount(event.target.value));
                  }}
                />
              </div>

              {/* Cashfree Order ID */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Cashfree Order ID
                </label>
                <Input
                  type="text"
                  value={cashfreeOrderId || ""}
                  readOnly
                  className="h-12 bg-muted"
                />
              </div>

              {/* Cashfree Payment ID */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Cashfree Payment ID
                </label>
                <Input
                  type="text"
                  value={cashfreePaymentId || ""}
                  readOnly
                  className="h-12 bg-muted"
                />
              </div>
            </>
          ) : (
            <div className="rounded-xl border bg-muted/30 px-4 py-6 sm:px-6">
              <div className="mb-5 text-center">
                <p className="text-sm font-semibold text-foreground">Enter verification code</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Enter the 6-digit OTP sent to the admin phone number.
                </p>
              </div>
              <InputOTP
                maxLength={6}
                value={buyOtp}
                onChange={(value) => setBuyOtp(value.replace(/\D/g, ""))}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                disabled={isVerifyingBuyOtp}
                className="w-full justify-center"
              >
                <InputOTPGroup className="gap-2 sm:gap-3">
                  {Array.from({ length: 6 }, (_, index) => (
                    <InputOTPSlot
                      key={index}
                      index={index}
                      className="h-12 w-10 rounded-lg border text-lg font-semibold sm:h-14 sm:w-12 sm:text-xl"
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              <div className="mt-4 flex items-center justify-center gap-2 text-sm">
                <span className="text-muted-foreground">
                  {buyOtpResendSeconds > 0
                    ? `Resend OTP in ${formatOtpCountdown(buyOtpResendSeconds)}`
                    : "Didn't receive the OTP?"}
                </span>
                {buyOtpResendSeconds === 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto p-0 text-primary cursor-pointer"
                    onClick={() => void handleSendBuyOtp()}
                    disabled={isSendingBuyOtp || isVerifyingBuyOtp}
                  >
                    {isSendingBuyOtp ? "Sending..." : "Resend OTP"}
                  </Button>
                ) : null}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={resetAuditBuyForm}
              disabled={isSendingBuyOtp || isVerifyingBuyOtp}
            >
              Cancel
            </Button>
            {!buyOtpSent ? (
              <Button
                onClick={() => void handleSendBuyOtp()}
                disabled={!buyAmount || !transactionType || isSendingBuyOtp}
              >
                {isSendingBuyOtp ? "Sending OTP..." : "Buy"}
              </Button>
            ) : (
              <Button
                onClick={() => void handleVerifyBuyOtp()}
                disabled={buyOtp.length !== 6 || isVerifyingBuyOtp}
              >
                {isVerifyingBuyOtp ? "Verifying..." : "Verify OTP"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={refundOpen}
        onOpenChange={(open) => {
          if (!open) {
            resetAuditRefundForm();
            return;
          }
          setRefundOpen(true);
        }}
      >
        <DialogContent onPointerDownOutside={(event) => event.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Refund Transaction</DialogTitle>
            <DialogDescription>
              {refundOtpSent
                ? "Enter the OTP to confirm the refund."
                : "Send an OTP to confirm this refund."}
            </DialogDescription>
          </DialogHeader>
          {!refundOtpSent ? (
            <div className="space-y-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Transaction ID</label>
                <Input
                  type="text"
                  value={selectedRefund?.transactionId ?? ""}
                  readOnly
                  className="h-12 bg-muted font-mono text-xs"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Amount</label>
                <Input
                  type="text"
                  value={
                    typeof selectedRefund?.amount === "number"
                      ? formatCurrency(selectedRefund.amount)
                      : "-"
                  }
                  readOnly
                  className="h-12 bg-muted"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Cashfree Order ID</label>
                <Input
                  type="text"
                  value={selectedRefund?.cashfreeOrderId ?? ""}
                  readOnly
                  className="h-12 bg-muted"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Cashfree Payment ID</label>
                <Input
                  type="text"
                  value={selectedRefund?.cashfreePaymentId ?? ""}
                  readOnly
                  className="h-12 bg-muted"
                />
              </div>
            </div>
          ) : (
            <div className="rounded-xl border bg-muted/30 px-4 py-6 sm:px-6">
              <div className="mb-5 text-center">
                <p className="text-sm font-semibold text-foreground">Enter verification code</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Enter the 6-digit OTP sent to the admin phone number.
                </p>
              </div>
              <InputOTP
                maxLength={6}
                value={refundOtp}
                onChange={(value) => setRefundOtp(value.replace(/\D/g, ""))}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                disabled={isVerifyingRefundOtp}
                className="w-full justify-center"
              >
                <InputOTPGroup className="gap-2 sm:gap-3">
                  {Array.from({ length: 6 }, (_, index) => (
                    <InputOTPSlot
                      key={index}
                      index={index}
                      className="h-12 w-10 rounded-lg border text-lg font-semibold sm:h-14 sm:w-12 sm:text-xl"
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
              <div className="mt-4 flex items-center justify-center gap-2 text-sm">
                <span className="text-muted-foreground">
                  {refundOtpResendSeconds > 0
                    ? `Resend OTP in ${formatOtpCountdown(refundOtpResendSeconds)}`
                    : "Didn't receive the OTP?"}
                </span>
                {refundOtpResendSeconds === 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-auto p-0 text-primary cursor-pointer"
                    onClick={() => void handleSendRefundOtp()}
                    disabled={isSendingRefundOtp || isVerifyingRefundOtp}
                  >
                    {isSendingRefundOtp ? "Sending..." : "Resend OTP"}
                  </Button>
                ) : null}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={resetAuditRefundForm}
              disabled={isSendingRefundOtp || isVerifyingRefundOtp}
            >
              Cancel
            </Button>
            {!refundOtpSent ? (
              <Button
                onClick={() => void handleSendRefundOtp()}
                disabled={!selectedRefund?.transactionId || isSendingRefundOtp}
              >
                {isSendingRefundOtp ? "Sending OTP..." : "Send OTP"}
              </Button>
            ) : (
              <Button
                onClick={() => void handleVerifyRefundOtp()}
                disabled={refundOtp.length !== 6 || isVerifyingRefundOtp}
              >
                {isVerifyingRefundOtp
                  ? "Refunding..."
                  : refundingItemKey !== null
                    ? "Refunding..."
                    : "Verify OTP"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TablePaginationFooter
        {...bindTablePaginationFooter(pagination)}
      />
    </Card>
  );
}

export type TransactionsListViewProps = {
  sellOnly?: boolean;
  embedded?: boolean;
  physicalOnly?: boolean;
  headerStart?: React.ReactNode;
};

export function TransactionsListView({
  sellOnly = false,
  embedded = false,
  physicalOnly = false,
  headerStart,
}: TransactionsListViewProps) {
  const { data: usersData } = useListUsers({ page: 1, limit: 1000 });
  const [location] = useLocation();
  const search = useSearch();
  const [searchTerm, setSearchTerm] = usePersistedSearchTerm(createPersistedSearchTermKey("transactions"));
  const [dateRange, setDateRange] = usePersistedDateRange(
    createPersistedDateRangeKey("transactions"),
    () =>
      sellOnly
        ? undefined
        : typeof window === "undefined"
          ? getCurrentDateRange()
          : getInitialDateRange(window.location.search),
  );
  const [statusFilter, setStatusFilter] = React.useState(() =>
    sellOnly ? getInitialSellStatusFilter() : getInitialStatusFilter() || "success",
  );
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_TABLE_PAGE_SIZE);
  const [stablePagination, setStablePagination] = React.useState<{
    total: number;
    totalPages: number;
    hasMore: boolean;
  } | null>(null);
  const [metalTypeFilter, setMetalTypeFilter] = React.useState("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = React.useState("all");
  const [txnDirectionFilter, setTxnDirectionFilter] = React.useState<TransactionDirectionFilter>(() =>
    sellOnly ? "sell" : getInitialTransactionDirectionFilter(),
  );
  const { sortKey, sortDirection, directionFactor, handleSort } =
    useTableSort<TransactionSortKey>();
  const fromDate = dateRange?.from ? formatDateInputValue(dateRange.from) : undefined;
  const toDate = dateRange?.to
    ? formatDateInputValue(dateRange.to)
    : dateRange?.from
      ? formatDateInputValue(dateRange.from)
      : undefined;
  const debouncedSearchTerm = useDebouncedValue(searchTerm, TRANSACTIONS_SEARCH_DEBOUNCE_MS);
  const isSearchDebouncing =
    searchTerm.trim() !== debouncedSearchTerm.trim() && searchTerm.trim().length > 0;
  const apiSortBy = mapTransactionSortKeyToApi(sortKey);
  const adminTransactionsFetchFilters = React.useMemo<AdminTransactionsFetchFilters>(
    () => ({
      type: resolveAdminTransactionApiType(sellOnly, txnDirectionFilter),
      search: debouncedSearchTerm,
      fromDate,
      toDate,
      status:
        statusFilter === "all" || isFailedTransactionStatusFilter(statusFilter)
          ? undefined
          : statusFilter,
      metalType: metalTypeFilter,
      transactionDirection: sellOnly ? "sell" : txnDirectionFilter,
      isRedeem: physicalOnly ? true : undefined,
      sortBy: apiSortBy,
      sortOrder: apiSortBy ? sortDirection : undefined,
    }),
    [
      apiSortBy,
      debouncedSearchTerm,
      fromDate,
      metalTypeFilter,
      physicalOnly,
      sellOnly,
      sortDirection,
      statusFilter,
      toDate,
      txnDirectionFilter,
    ],
  );
  const transactionsListFiltersKey = React.useMemo(
    () =>
      [
        debouncedSearchTerm.trim(),
        fromDate ?? "",
        toDate ?? "",
        statusFilter,
        metalTypeFilter,
        paymentMethodFilter,
        txnDirectionFilter,
        sellOnly ? "sell" : "all",
        physicalOnly ? "physical" : "all",
        pageSize,
        apiSortBy ?? "",
        sortDirection,
      ].join("|"),
    [
      apiSortBy,
      debouncedSearchTerm,
      fromDate,
      metalTypeFilter,
      paymentMethodFilter,
      pageSize,
      physicalOnly,
      sellOnly,
      sortDirection,
      statusFilter,
      toDate,
      txnDirectionFilter,
    ],
  );
  const {
    data: transactionsResponse,
    isLoading,
    isError,
    refetch: refetchTransactions,
  } = useListAdminTransactions(sellOnly ? { type: "SELL" } : undefined);
  const { mutate: retryTxn } = useRetryTransaction();
  const { mutate: refundTxn } = useRefundTransaction();
  const { mutate: completeSellTxn, isPending: isCompletingSell } = useCompleteSellTransaction();
  const { mutate: failSellTxn, isPending: isFailingSell } = useFailSellTransaction();
  const { mutateAsync: createInvoice, isPending: isCreatingInvoice } = useCreateInvoice();
  const { mutateAsync: uploadBulkPaymentExcel, isPending: isUploadingBulkPaymentExcel } = useUploadBulkPaymentExcel();
  // const [metalTypeFilter, setMetalTypeFilter] = React.useState("all");
  const [transferAnimation, setTransferAnimation] = React.useState(false);
  const [downloadBounce, setDownloadBounce] = React.useState(false);
  const [showDownloadHint, setShowDownloadHint] = React.useState(false);
  // const [txnDirectionFilter, setTxnDirectionFilter] = React.useState<TransactionDirectionFilter>(() =>
  //   sellOnly ? "sell" : getInitialTransactionDirectionFilter(),
  // );
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [previewLabel, setPreviewLabel] = React.useState<string | undefined>(undefined);
  const [selectedTransactionIds, setSelectedTransactionIds] = React.useState<string[]>([]);
  const [activeBankIndexByTxnId, setActiveBankIndexByTxnId] = React.useState<Record<string, number>>({});
  const [completingSellTxnId, setCompletingSellTxnId] = React.useState<string | null>(null);
  const [sellCompleteOpen, setSellCompleteOpen] = React.useState(false);
  const [sellCompleteTxn, setSellCompleteTxn] = React.useState<TransactionItem | null>(null);
  const [sellCompleteUtr, setSellCompleteUtr] = React.useState("");
  const [sellCompleteDate, setSellCompleteDate] = React.useState(() => getTodayDateInputValue());
  const [sellCompleteError, setSellCompleteError] = React.useState("");
  const [sellCompleteStep, setSellCompleteStep] = React.useState<1 | 2>(1);
  const [sellFailOpen, setSellFailOpen] = React.useState(false);
  const [sellFailTxn, setSellFailTxn] = React.useState<TransactionItem | null>(null);
  const [sellFailError, setSellFailError] = React.useState("");
  const [sellFailStep, setSellFailStep] = React.useState<1 | 2>(1);
  const [failingSellTxnId, setFailingSellTxnId] = React.useState<string | null>(null);
  const [sellPendingOpen, setSellPendingOpen] = React.useState(false);
  const [sellPendingTxn, setSellPendingTxn] = React.useState<TransactionItem | null>(null);
  const [sellPendingError, setSellPendingError] = React.useState("");
  const [sellPendingStep, setSellPendingStep] = React.useState<1 | 2>(1);
  const [pendingSellTxnId, setPendingSellTxnId] = React.useState<string | null>(null);
  const [creatingInvoiceTxnId, setCreatingInvoiceTxnId] = React.useState<string | null>(null);
  // const { sortKey, sortDirection, directionFactor, handleSort } =
  //   useTableSort<TransactionSortKey>();
  const userNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const user of unwrapUsers(usersData)) {
      if (!user || typeof user !== "object") continue;
      const record = user as Record<string, unknown>;
      const rawId = record.id ?? record._id;
      if (typeof rawId !== "string") continue;
      map.set(
        rawId,
        typeof record.name === "string"
          ? record.name
          : typeof record.email === "string"
            ? record.email
            : typeof record.phone === "string"
              ? record.phone
              : rawId,
      );
    }
    return map;
  }, [usersData]);

  const {
    transactions: fetchedTransactionsRaw,
    total: parsedTotalTransactions,
    totalPages: reportedTotalPages,
    hasMore: parsedHasMore,
    hasReportedTotal,
  } = React.useMemo(
    () => parseAdminTransactionsListResponse(transactionsResponse, page, pageSize),
    [transactionsResponse, page, pageSize],
  );
  const isLegacyFullListResponse =
    fetchedTransactionsRaw.length > pageSize && reportedTotalPages === undefined;
  const isServerPaginatedResponse =
    hasReportedTotal &&
    reportedTotalPages !== undefined &&
    fetchedTransactionsRaw.length <= pageSize &&
    parsedTotalTransactions > fetchedTransactionsRaw.length;

  const resetTransactionsPage = React.useCallback(() => {
    setPage(1);
  }, []);

  React.useEffect(() => {
    setStablePagination(null);
    setSelectedTransactionIds([]);
  }, [transactionsListFiltersKey]);

  React.useEffect(() => {
    resetTransactionsPage();
  }, [sortKey, sortDirection, resetTransactionsPage]);

  React.useEffect(() => {
    resetTransactionsPage();
  }, [
    debouncedSearchTerm,
    searchTerm,
    dateRange,
    metalTypeFilter,
    paymentMethodFilter,
    resetTransactionsPage,
    statusFilter,
    txnDirectionFilter,
  ]);

  React.useEffect(() => {
    if (search && !sellOnly) {
      resetTransactionsPage();
    }
  }, [resetTransactionsPage, search, sellOnly]);

  React.useEffect(() => {
    if (!hasReportedTotal) return;

    setStablePagination({
      total: parsedTotalTransactions,
      totalPages: reportedTotalPages ?? Math.max(1, Math.ceil(parsedTotalTransactions / pageSize)),
      hasMore: parsedHasMore,
    });
  }, [hasReportedTotal, parsedHasMore, parsedTotalTransactions, reportedTotalPages, pageSize]);

  const totalTransactions = hasReportedTotal
    ? parsedTotalTransactions
    : stablePagination?.total ?? parsedTotalTransactions;
  const totalPages = Math.max(
    1,
    hasReportedTotal
      ? reportedTotalPages ?? Math.ceil(totalTransactions / pageSize)
      : stablePagination?.totalPages ?? Math.max(1, Math.ceil(totalTransactions / pageSize)),
  );
  const currentPage = Math.min(page, totalPages);
  const canGoNext = isLegacyFullListResponse
    ? currentPage < totalPages
    : hasReportedTotal
      ? parsedHasMore
      : stablePagination?.hasMore ?? parsedHasMore;

  React.useEffect(() => {
    if (hasReportedTotal && page > totalPages) {
      setPage(totalPages);
    }
  }, [hasReportedTotal, page, totalPages]);

  const transactions = React.useMemo(() => {
    if (!transactionsResponse) return [];
    return unwrapTransactions(transactionsResponse)
      .map(normalizeTransaction)
      .filter((txn): txn is TransactionItem => txn !== null);
  }, [transactionsResponse]);

  const clientFilteredTransactions = React.useMemo(() => {
    const term = normalizeSearchValue(debouncedSearchTerm);

    const filtered = transactions
      .map((txn) => {
        const fallbackUserName = userNameById.get(txn.userId ?? "") ?? "";
        const searchRank = term.length === 0 ? 0 : getTransactionSearchRank(txn, term, fallbackUserName);
        return { txn, searchRank };
      })
      .filter(({ txn, searchRank }) => {
        const normalizedMetalType = txn.normalizedMetalType ?? "";
        const normalizedPaymentMethod = txn.normalizedPaymentMethod ?? "";
        const matchesSearch = searchRank !== null;
        const matchesStatus = transactionMatchesStatusFilter(
          txn,
          statusFilter,
          sellOnly || txnDirectionFilter === "sell",
          physicalOnly,
        );
        const matchesMetalType = metalTypeFilter === "all" || normalizedMetalType === metalTypeFilter;
        const matchesPaymentMethod =
          paymentMethodFilter === "all" || normalizedPaymentMethod === paymentMethodFilter;
        const matchesDate = isDateInRange(txn.createdAt ?? txn.executedAt, dateRange);
        const matchesTxnDirection = txnMatchesDirectionFilter(txn, txnDirectionFilter);
        const matchesPhysicalScope = physicalOnly
          ? isPhysicalRedeemTransaction(txn)
          : sellOnly
            ? belongsOnSellTransactionsTable(txn)
            : true;

        return (
          matchesSearch &&
          matchesStatus &&
          matchesMetalType &&
          matchesPaymentMethod &&
          matchesDate &&
          matchesTxnDirection &&
          matchesPhysicalScope
        );
      });

    if (!term) return filtered.map(({ txn }) => txn);

    return filtered
      .sort((a, b) => {
        const firstRank = a.searchRank ?? Number.MAX_SAFE_INTEGER;
        const secondRank = b.searchRank ?? Number.MAX_SAFE_INTEGER;
        if (firstRank !== secondRank) return firstRank - secondRank;
        const firstTime = new Date(a.txn.createdAt ?? a.txn.executedAt ?? 0).getTime();
        const secondTime = new Date(b.txn.createdAt ?? b.txn.executedAt ?? 0).getTime();
        return secondTime - firstTime;
      })
      .map(({ txn }) => txn);
  }, [
    dateRange,
    debouncedSearchTerm,
    metalTypeFilter,
    paymentMethodFilter,
    physicalOnly,
    sellOnly,
    statusFilter,
    transactions,
    txnDirectionFilter,
    userNameById,
  ]);
  const orderedTransactions = React.useMemo(() => {
    return [...transactions].sort((a, b) => {
      const aTime = new Date(a.createdAt ?? a.executedAt ?? 0).getTime();
      const bTime = new Date(b.createdAt ?? b.executedAt ?? 0).getTime();
      if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
      if (Number.isNaN(aTime)) return 1;
      if (Number.isNaN(bTime)) return -1;
      if (aTime !== bTime) return bTime - aTime;
      return String(b.id).localeCompare(String(a.id));
    });
  }, [transactions]);

  const metalTypeOptions = React.useMemo(() => {
    const options = new Set<string>();
    for (const txn of clientFilteredTransactions) {
      const metalValue = txn.normalizedMetalType;
      if (metalValue) {
        options.add(metalValue);
      }
    }
    return Array.from(options).sort();
  }, [clientFilteredTransactions]);

  const paymentMethodOptions = React.useMemo(() => {
    const options = new Set<string>();
    for (const txn of clientFilteredTransactions) {
      const methodValue = txn.normalizedPaymentMethod;
      if (methodValue) {
        options.add(methodValue);
      }
    }
    return Array.from(options).sort();
  }, [clientFilteredTransactions]);

  const metalHeaderFilterOptions = React.useMemo(
    () => {
      if (physicalOnly) {
        return [
          { value: "all", label: "All" },
          { value: "gold", label: "Gold" },
          { value: "silver", label: "Silver" },
          { value: "both", label: "Both" },
        ];
      }

      return [
        { value: "all", label: "All" },
        ...metalTypeOptions.map((metal) => ({
          value: metal,
          label: METAL_TYPE_DISPLAY_LABELS[metal] ?? metal.charAt(0).toUpperCase() + metal.slice(1),
        })),
      ];
    },
    [metalTypeOptions, physicalOnly],
  );

  const paymentMethodHeaderFilterOptions = React.useMemo(
    () => [
      { value: "all", label: "All" },
      ...paymentMethodOptions.map((method) => ({
        value: method,
        label: formatPaymentMethodLabel(method),
      })),
    ],
    [paymentMethodOptions],
  );

  const handleOrderTypeFilterChange = React.useCallback((value: string) => {
    setTxnDirectionFilter(value as TransactionDirectionFilter);
  }, []);

  const handleMetalFilterChange = React.useCallback((value: string) => {
    setMetalTypeFilter(value);
  }, []);

  const handlePaymentMethodFilterChange = React.useCallback((value: string) => {
    setPaymentMethodFilter(value);
  }, []);

  const handleStatusFilterChange = React.useCallback((value: string) => {
    setStatusFilter(value);
  }, []);

  React.useEffect(() => {
    if (sellOnly) {
      setTxnDirectionFilter("sell");
    } else {
      setTxnDirectionFilter(parseTransactionDirectionFilterFromSearch(search));
    }
    const timePeriod = parseTimePeriodFromSearch(search);
    const params = new URLSearchParams(search);
    const fromDateParam = params.get("fromDate");
    const toDateParam = params.get("toDate");
    if (fromDateParam && toDateParam) {
      const from = parseDateInputValue(fromDateParam);
      const to = parseDateInputValue(toDateParam);
      if (from && to) {
        setDateRange({ from, to });
      }
    } else if (timePeriod) {
      setDateRange(getDateRangeFromTimePeriod(timePeriod));
    }
    const statusParam = params.get("statusFilter");
    if (statusParam) {
      if (physicalOnly) {
        const normalized = normalizeRedemptionOrderStatus(statusParam);
        if (normalized) setStatusFilter(normalized);
      } else if (sellOnly) {
        const normalized = getSellStatusFilterValue(statusParam);
        if (normalized) setStatusFilter(normalized);
      } else {
        const normalized = getStatusFilterValue(statusParam);
        if (normalized) setStatusFilter(normalized);
      }
    }
  }, [physicalOnly, search, sellOnly]);

  React.useEffect(() => {
    setMetalTypeFilter("all");
    setPaymentMethodFilter("all");
    if (physicalOnly) {
      setStatusFilter("all");
    }
  }, [physicalOnly]);



  const filteredTransactions = React.useMemo(() => {
    const term = normalizeSearchValue(searchTerm);

    const filtered = orderedTransactions.map((txn) => {
      const fallbackUserName = userNameById.get(txn.userId ?? "") ?? "";
      const searchRank = term.length === 0 ? 0 : getTransactionSearchRank(txn, term, fallbackUserName);
      return { txn, searchRank };
    })
      .filter(({ txn, searchRank }) => {
        const normalizedMetalType = txn.normalizedMetalType ?? "";
        const matchesSearch = searchRank !== null;

        const matchesStatus = transactionMatchesStatusFilter(txn, statusFilter, sellOnly, physicalOnly);
        const matchesMetalType = metalTypeFilter === "all" || normalizedMetalType === metalTypeFilter;
        const matchesDate = isDateInRange(txn.createdAt ?? txn.executedAt, dateRange);
        const matchesTxnDirection = txnMatchesDirectionFilter(txn, txnDirectionFilter);
        const matchesPhysicalScope = physicalOnly
          ? isPhysicalRedeemTransaction(txn)
          : sellOnly
            ? belongsOnSellTransactionsTable(txn)
            : true;
        return (
          matchesSearch &&
          matchesStatus &&
          matchesMetalType &&
          matchesDate &&
          matchesTxnDirection &&
          matchesPhysicalScope
        );
      });
    if (!term) return filtered.map(({ txn }) => txn);
    return filtered
      .sort((a, b) => {
        const firstRank = a.searchRank ?? Number.MAX_SAFE_INTEGER;
        const secondRank = b.searchRank ?? Number.MAX_SAFE_INTEGER;
        if (firstRank !== secondRank) return firstRank - secondRank;
        const firstTime = new Date(a.txn.createdAt ?? a.txn.executedAt ?? 0).getTime();
        const secondTime = new Date(b.txn.createdAt ?? b.txn.executedAt ?? 0).getTime();
        return secondTime - firstTime;
      })
      .map(({ txn }) => txn);
  }, [dateRange, metalTypeFilter, orderedTransactions, physicalOnly, searchTerm, sellOnly, statusFilter, txnDirectionFilter, userNameById]);
  const sortedTransactions = React.useMemo(() => {
    if (!sortKey) return filteredTransactions;

    return [...filteredTransactions].sort((a, b) => {
      const aFallbackName = userNameById.get(a.userId ?? "") ?? "";
      const bFallbackName = userNameById.get(b.userId ?? "") ?? "";
      if (sortKey === "user") {
        const aValue = normalizeSearchValue(a.userName ?? a.user?.name ?? aFallbackName);
        const bValue = normalizeSearchValue(b.userName ?? b.user?.name ?? bFallbackName);
        return aValue.localeCompare(bValue) * directionFactor;
      }
      if (sortKey === "transaction") {
        const aValue = normalizeSearchValue(a.razorpayPaymentId ?? a.merchantTransactionId ?? a.id);
        const bValue = normalizeSearchValue(b.razorpayPaymentId ?? b.merchantTransactionId ?? b.id);
        return aValue.localeCompare(bValue) * directionFactor;
      }
      if (sortKey === "utr") {
        const aValue = normalizeSearchValue(a.utrNumber);
        const bValue = normalizeSearchValue(b.utrNumber);

        return aValue.localeCompare(bValue) * directionFactor;
      }
      if (sortKey === "settlementDate") {
        const aValue = a.settlementDate
          ? new Date(a.settlementDate).getTime()
          : 0;

        const bValue = b.settlementDate
          ? new Date(b.settlementDate).getTime()
          : 0;

        return (aValue - bValue) * directionFactor;
      }
      if (sortKey === "invoice") {
        const aValue = normalizeSearchValue(a.invoiceNumber);
        const bValue = normalizeSearchValue(b.invoiceNumber);
        return aValue.localeCompare(bValue) * directionFactor;
      }
      if (sortKey === "metal") {
        const aValue = normalizeSearchValue(a.metalType ?? a.paymentMethod);
        const bValue = normalizeSearchValue(b.metalType ?? b.paymentMethod);
        return aValue.localeCompare(bValue) * directionFactor;
      }
      if (sortKey === "method") {
        const aValue = normalizeSearchValue(a.paymentMethod ?? a.razorpayPaymentMethod);
        const bValue = normalizeSearchValue(b.paymentMethod ?? b.razorpayPaymentMethod);
        return aValue.localeCompare(bValue) * directionFactor;
      }
      if (sortKey === "amount") {
        const aValue = Number(a.amount ?? 0);
        const bValue = Number(b.amount ?? 0);
        return (aValue - bValue) * directionFactor;
      }
      if (sortKey === "status") {
        const aValue = normalizeSearchValue(resolveTransactionStatusValue(a, physicalOnly));
        const bValue = normalizeSearchValue(resolveTransactionStatusValue(b, physicalOnly));
        return aValue.localeCompare(bValue) * directionFactor;
      }
      const aValue = new Date(a.createdAt ?? a.executedAt ?? 0).getTime();
      const bValue = new Date(b.createdAt ?? b.executedAt ?? 0).getTime();
      return (aValue - bValue) * directionFactor;
    });
  }, [directionFactor, filteredTransactions, physicalOnly, sortKey, userNameById]);

  const pagination = useTablePagination(sortedTransactions);

  React.useEffect(() => {
    pagination.resetPage();
  }, [dateRange, metalTypeFilter, pagination.resetPage, searchTerm, statusFilter, txnDirectionFilter]);

  React.useEffect(() => {
    if (search && !sellOnly) {
      pagination.resetPage();
    }
  }, [pagination.resetPage, search, sellOnly]);

  const allFilteredSelected =
    sortedTransactions.length > 0 && sortedTransactions.every((txn) => selectedTransactionIds.includes(txn.id));
  const selectedTransactions = React.useMemo(() => {
    const selectedSet = new Set(selectedTransactionIds);
    return orderedTransactions.filter((txn) => selectedSet.has(txn.id));
  }, [orderedTransactions, selectedTransactionIds]);
  const selectedInvoiceTransactions = React.useMemo(
    () => selectedTransactions.filter((txn) => Boolean(txn.invoiceUrl || txn.invoiceNumber)),
    [selectedTransactions],
  );
  const selectedCreateInvoiceTransaction = React.useMemo(() => {
    const eligible = selectedTransactions.filter(canCreateInvoice);
    return eligible.length === 1 ? eligible[0] : null;
  }, [selectedTransactions]);

  // const handleCreateInvoiceForTransaction = React.useCallback(
  //   async (txn: TransactionItem) => {
  //     if (!canCreateInvoice(txn)) {
  //       toast({
  //         variant: "destructive",
  //         title: "Cannot create invoice",
  //         description: "Invoices can only be created for successful transactions without an invoice.",
  //       });
  //       return;
  //     }

  //     setCreatingInvoiceTxnId(txn.id);
  //     try {
  //       const response = await createInvoice(getCreateInvoicePayload(txn));
  //       toast({
  //         title: "Invoice created",
  //         description: response?.message ?? "Invoice created successfully.",
  //       });
  //       await refetchTransactions();
  //     } catch (error) {
  //       toast({
  //         variant: "destructive",
  //         title: "Invoice creation failed",
  //         description: getErrorMessage(error, "Failed to create invoice."),
  //       });
  //     } finally {
  //       setCreatingInvoiceTxnId(null);
  //     }
  //   },
  //   [createInvoice, refetchTransactions],
  // );

  // const handleCreateInvoiceFromSelection = React.useCallback(async () => {
  //   if (!selectedCreateInvoiceTransaction) {
  //     toast({
  //       variant: "destructive",
  //       title: "Select one eligible transaction",
  //       description:
  //         selectedTransactions.length === 0
  //           ? "Select a successful transaction without an invoice."
  //           : "Select exactly one successful transaction that does not already have an invoice.",
  //     });
  //     return;
  //   }

  //   await handleCreateInvoiceForTransaction(selectedCreateInvoiceTransaction);
  //   setSelectedTransactionIds([]);
  // }, [
  //   handleCreateInvoiceForTransaction,
  //   selectedCreateInvoiceTransaction,
  //   selectedTransactions.length,
  // ]);

  const toggleTransactionSelection = React.useCallback((transactionId: string) => {
    const alreadySelected =
      selectedTransactionIds.includes(transactionId);

    if (!alreadySelected) {
      triggerSelectionFeedback({
        setTransferAnimation,
        setShowDownloadHint,
      });
    }
    setSelectedTransactionIds((current) =>
      current.includes(transactionId)
        ? current.filter((id) => id !== transactionId)
        : [...current, transactionId],
    );
  }, [
    selectedTransactionIds,
  ]);

  const toggleAllFilteredTransactions = React.useCallback((checked: boolean) => {
    if (checked) {
      triggerSelectionFeedback({
        setTransferAnimation,
        setShowDownloadHint,
      });
    }
    const filteredIds = sortedTransactions.map((txn) => txn.id);
    setSelectedTransactionIds((current) => {
      if (checked) return [...new Set([...current, ...filteredIds])];
      return current.filter((id) => !filteredIds.includes(id));
    });
  }, [sortedTransactions]);

  const handleRetry = (id: string) => {
    retryTxn({ txnId: id });
    alert(`Retrying transaction ${id}`);
  };


  const resetSellCompleteDialog = React.useCallback(() => {
    setSellCompleteTxn(null);
    setSellCompleteUtr("");
    setSellCompleteDate(getTodayDateInputValue());
    setSellCompleteError("");
    setSellCompleteStep(1);
    setCompletingSellTxnId(null);
  }, []);

  const handleSellCompleteOpenChange = React.useCallback(
    (open: boolean) => {
      setSellCompleteOpen(open);
      if (!open) resetSellCompleteDialog();
    },
    [resetSellCompleteDialog],
  );

  const handleOpenCompleteSell = React.useCallback((txn: TransactionItem) => {
    if (!canCompleteSellTransaction(txn)) return;
    setSellCompleteTxn(txn);
    setSellCompleteUtr("");
    setSellCompleteDate(getTodayDateInputValue());
    setSellCompleteError("");
    setSellCompleteOpen(true);
  }, []);

  const resetSellFailDialog = React.useCallback(() => {
    setSellFailTxn(null);
    setSellFailError("");
    setSellFailStep(1);
    setFailingSellTxnId(null);
  }, []);

  const handleSellFailOpenChange = React.useCallback(
    (open: boolean) => {
      setSellFailOpen(open);
      if (!open) resetSellFailDialog();
    },
    [resetSellFailDialog],
  );

  const handleOpenFailSell = React.useCallback((txn: TransactionItem) => {
    if (!canMarkSellTransactionFailed(txn)) return;
    setSellFailTxn(txn);
    setSellFailError("");
    setSellFailStep(1);
    setSellFailOpen(true);
  }, []);

  const executeFailSell = React.useCallback(() => {
    if (!sellFailTxn) return;

    setSellFailError("");
    setFailingSellTxnId(sellFailTxn.id);
    failSellTxn(
      { transactionId: sellFailTxn.id, status: "FAILED" },
      {
        onSuccess: (response) => {
          toast({
            title: "Transaction marked as failed",
            description:
              response && typeof response === "object" && typeof response.message === "string"
                ? response.message
                : undefined,
          });
          handleSellFailOpenChange(false);
        },
        onError: (error: unknown) => {
          const message =
            error instanceof Error ? error.message : "Could not mark sell transaction as failed.";
          setSellFailError(message);
          toast({
            title: "Failed",
            description: message,
            variant: "destructive",
          });
        },
        onSettled: () => setFailingSellTxnId(null),
      },
    );
  }, [failSellTxn, handleSellFailOpenChange, sellFailTxn]);

  const handleSubmitFailSell = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!sellFailTxn) return;
      setSellFailError("");
      setSellFailStep(2);
    },
    [sellFailTxn],
  );

  const handleConfirmFailSell = React.useCallback(() => {
    executeFailSell();
  }, [executeFailSell]);

  const resetSellPendingDialog = React.useCallback(() => {
    setSellPendingTxn(null);
    setSellPendingError("");
    setSellPendingStep(1);
    setPendingSellTxnId(null);
  }, []);

  const handleSellPendingOpenChange = React.useCallback(
    (open: boolean) => {
      setSellPendingOpen(open);
      if (!open) resetSellPendingDialog();
    },
    [resetSellPendingDialog],
  );

  const handleOpenPendingSell = React.useCallback((txn: TransactionItem) => {
    if (!canMarkSellTransactionPending(txn)) return;
    setSellPendingTxn(txn);
    setSellPendingError("");
    setSellPendingStep(1);
    setSellPendingOpen(true);
  }, []);

  const executePendingSell = React.useCallback(() => {
    if (!sellPendingTxn) return;

    setSellPendingError("");
    setPendingSellTxnId(sellPendingTxn.id);
    failSellTxn(
      {
        transactionId: sellPendingTxn.id,
        status: "PENDING",
      },
      {
        onSuccess: (response) => {
          toast({
            title: "Transaction marked as pending",
            description:
              response && typeof response === "object" && typeof response.message === "string"
                ? response.message
                : undefined,
          });
          handleSellPendingOpenChange(false);
        },
        onError: (error: unknown) => {
          const message =
            error instanceof Error ? error.message : "Could not mark sell transaction as pending.";
          setSellPendingError(message);
          toast({
            title: "Failed",
            description: message,
            variant: "destructive",
          });
        },
        onSettled: () => setPendingSellTxnId(null),
      },
    );
  }, [failSellTxn, handleSellPendingOpenChange, sellPendingTxn]);

  const handleSubmitPendingSell = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!sellPendingTxn) return;
      setSellPendingError("");
      setSellPendingStep(2);
    },
    [sellPendingTxn],
  );

  const handleConfirmPendingSell = React.useCallback(() => {
    executePendingSell();
  }, [executePendingSell]);

  const executeCompleteSell = React.useCallback(() => {
    if (!sellCompleteTxn) return;

    setSellCompleteError("");
    setCompletingSellTxnId(sellCompleteTxn.id);
    completeSellTxn(
      {
        transactionId: sellCompleteTxn.id,
        status: "SUCCESS",
        utrNumber: sellCompleteUtr.trim(),
        settlementDate: sellCompleteDate,
      },
      {
        onSuccess: (response) => {
          toast({
            title: "Payout recorded",
            description:
              response && typeof response === "object" && typeof response.message === "string"
                ? response.message
                : undefined,
          });
          handleSellCompleteOpenChange(false);
        },
        onError: (error: unknown) => {
          const message =
            error instanceof Error ? error.message : "Could not complete sell transaction.";
          setSellCompleteError(message);
          toast({
            title: "Failed",
            description: message,
            variant: "destructive",
          });
        },
        onSettled: () => setCompletingSellTxnId(null),
      },
    );
  }, [
    completeSellTxn,
    handleSellCompleteOpenChange,
    sellCompleteDate,
    sellCompleteTxn,
    sellCompleteUtr,
  ]);

  const handleSubmitCompleteSell = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!sellCompleteTxn) return;

      const trimmedUtr = sellCompleteUtr.trim();
      if (!trimmedUtr) {
        setSellCompleteError("UTR number is required.");
        return;
      }

      if (!sellCompleteDate) {
        setSellCompleteError("Settlement date is required.");
        return;
      }

      setSellCompleteError("");
      setSellCompleteStep(2);
    },
    [sellCompleteDate, sellCompleteTxn, sellCompleteUtr],
  );

  const handleConfirmCompleteSell = React.useCallback(() => {
    executeCompleteSell();
  }, [executeCompleteSell]);



  const dateRangeLabel = formatDateRangeLabel(dateRange);
  const hasDateRange = Boolean(dateRange?.from);
  const isDefaultDateRange = isSameCalendarDay(dateRange?.from, new Date()) && isSameCalendarDay(dateRange?.to, new Date());
  const showSellSettlementColumns =
    sellOnly && !physicalOnly && (statusFilter === "success" || statusFilter === "all");
  const tableColSpan = sellOnly
    ? physicalOnly
      ? 9
      : showSellSettlementColumns
        ? 13
        : 11
    : 12;
  const sellTableMinWidth = showSellSettlementColumns ? "min-w-[1580px]" : "min-w-[1380px]";

  const exportTransactionsToExcel = React.useCallback(async () => {
    const transactionsToExport =
      selectedTransactionIds.length > 0
        ? filteredTransactions.filter((txn) => selectedTransactionIds.includes(txn.id))
        : filteredTransactions;

    await exportToExcel({
      fileName: physicalOnly
        ? "physical-gold-silver-transactions.xlsx"
        : sellOnly
          ? "sell-transactions.xlsx"
          : "transactions.xlsx",
      sheetName: "Transactions",
      columns: sellOnly
        ? physicalOnly
          ? [
            { header: "User", key: "user", width: 25 },
            { header: "Transaction ID", key: "transactionId", width: 30 },
            { header: "Transaction Type", key: "transactionType", width: 22 },
            { header: "Metal Type", key: "metalType", width: 15 },
            { header: "Metal Quantity", key: "metalQuantity", width: 18 },
            { header: "Amount", key: "amount", width: 18 },
            { header: "Shipping Fees", key: "shippingCharges", width: 18 },
            { header: "Status", key: "status", width: 18 },
            { header: "Date & Time", key: "dateTime", width: 25 },
          ]
          : [
            { header: "User", key: "user", width: 25 },
            { header: "Transaction ID", key: "transactionId", width: 30 },
            { header: "Transaction Type", key: "transactionType", width: 22 },
            { header: "Metal Type", key: "metalType", width: 15 },
            { header: "Amount", key: "amount", width: 18 },
            { header: "Total Paid Amount", key: "totalPaidAmount", width: 20 },
            { header: "Platform Fee", key: "platformFee", width: 18 },
            { header: "Status", key: "status", width: 18 },
            ...(showSellSettlementColumns
              ? [
                { header: "UTR Number", key: "utrNumber", width: 22 },
                { header: "Settlement Date", key: "settlementDate", width: 18 },
              ]
              : []),
            { header: "Date & Time", key: "dateTime", width: 25 },
          ]
        : [
          { header: "User", key: "user", width: 25 },
          { header: "Transaction ID", key: "transactionId", width: 30 },
          { header: "Transaction Type", key: "transactionType", width: 22 },
          { header: "Invoice Number", key: "invoiceNumber", width: 20 },
          { header: "Metal Type", key: "metalType", width: 15 },
          { header: "Payment Method", key: "paymentMethod", width: 15 },
          { header: "Amount", key: "amount", width: 18 },
          { header: "Total Paid Amount", key: "totalPaidAmount", width: 20 },
          { header: "Platform Fee", key: "platformFee", width: 18 },
          { header: "Status", key: "status", width: 18 },
          { header: "Date & Time", key: "dateTime", width: 25 },
        ],
      rows: transactionsToExport.map((txn) => {
        const baseRow = {
          user: txn.userName ?? txn.user?.name ?? "-",
          transactionId:
            txn.razorpayPaymentId ??
            txn.merchantTransactionId ??
            txn.id,
          invoiceNumber: formatTransactionInvoiceNumber(txn),
          metalType: formatTransactionMetalType(txn),
          paymentMethod: formatPaymentMethodLabel(txn.paymentMethod ?? txn.razorpayPaymentMethod),
          amount: typeof txn.amount === "number" ? txn.amount : null,
          totalPaidAmount: typeof txn.totalPaidAmount === "number" ? txn.totalPaidAmount : null,
          platformFee: typeof txn.platformFee === "number" ? txn.platformFee : null,
          shippingCharges:
            typeof txn.shippingCharges === "number" ? txn.shippingCharges : null,
          metalQuantity: resolveTransactionMetalWeight(txn) ?? null,
          status: physicalOnly
            ? formatRedemptionOrderStatusLabel(txn.orderStatus)
            : resolveTransactionStatusValue(txn, false) ?? "-",
          dateTime: formatTransactionDateTime(txn.createdAt ?? txn.executedAt),
          transactionType: formatTransactionTypeDisplay(
            txn.transactionType ?? txn.type,
            txn.frequency,
            txn.isRedeem,
          ),
        };

        if (!sellOnly) return baseRow;

        if (physicalOnly) return baseRow;

        return {
          ...baseRow,
          ...(showSellSettlementColumns
            ? {
              utrNumber: shouldShowSellPayoutFields(txn, statusFilter)
                ? txn.utrNumber ?? "-"
                : "-",
              settlementDate: shouldShowSellPayoutFields(txn, statusFilter)
                ? formatSettlementDate(txn.settlementDate)
                : "-",
            }
            : {}),
        };
      }),
    });
    setSelectedTransactionIds([]);
    setTransferAnimation(false);
    setShowDownloadHint(false);

  }, [filteredTransactions, physicalOnly, selectedTransactionIds, sellOnly, showSellSettlementColumns, statusFilter]);

  const exportSellBulkPaymentToExcel = React.useCallback(async () => {
    const isExportingSelection =
      selectedTransactionIds.length > 0 && !allFilteredSelected;
    const statusFilteredSellBulkPaymentTransactions = orderedTransactions.filter(
      (txn) =>
        !isPhysicalRedeemTransaction(txn) &&
        transactionMatchesStatusFilter(txn, statusFilter, true, false),
    );
    const transactionsToExport =
      (isExportingSelection
        ? orderedTransactions.filter((txn) =>
          selectedTransactionIds.includes(txn.id)
        )
        : statusFilteredSellBulkPaymentTransactions
      ).filter((txn) => {
        const activeBank = (txn.bankDetails ?? [])[
          (activeBankIndexByTxnId[txn.id] ?? 0) % (txn.bankDetails?.length || 1)
        ];
        return activeBank?.accountNumber?.trim() &&
          activeBank?.accountHolderName?.trim() &&
          activeBank?.ifscCode?.trim();
      });

    await exportBulkPaymentExcel({
      fileName: `BLKPAY_${formatBulkPaymentFileDate()}.xlsx`,
      rows: transactionsToExport.map((txn) => {
        const bankDetails = txn.bankDetails ?? [];
        const activeBankIndex =
          bankDetails.length > 0
            ? (activeBankIndexByTxnId[txn.id] ?? 0) % bankDetails.length
            : 0;
        const activeBank = bankDetails[activeBankIndex];
        const amount =
          typeof txn.amount === "number" && Number.isFinite(txn.amount)
            ? Number(txn.amount.toFixed(2))
            : null;

        return {
          beneficiaryName:
            activeBank?.accountHolderName &&
              isNaN(Number(activeBank.accountHolderName))
              ? activeBank.accountHolderName
              : txn.user?.name ?? "",
          beneficiaryAccountNumber: activeBank?.accountNumber ?? "",
          ifsc: activeBank?.ifscCode ?? "",
          transactionType: "NEFT",
          debitAccountNumber: "10270643120",
          transactionDate: formatSettlementDate(new Date().toISOString()),
          amount,
          currency: "INR",
          beneficiaryEmailId: txn.user?.email ?? "",
          remarks: "Sell by GFolio",
          customHeader1: txn.id,
        };
      }),
    });
    setSelectedTransactionIds([]);
    setTransferAnimation(false);
    setShowDownloadHint(false);
  }, [activeBankIndexByTxnId, allFilteredSelected, orderedTransactions, selectedTransactionIds, statusFilter]);

  const handleBulkPaymentExcelUpload = React.useCallback(
    async (file: File) => {
      try {
        const response = await uploadBulkPaymentExcel({ file });
        toast({
          title: "Excel uploaded",
          description:
            response && typeof response === "object" && typeof response.message === "string"
              ? response.message
              : file.name,
        });
      } catch (error) {
        toast({
          title: "Upload failed",
          description: getErrorMessage(error, "Could not upload Excel file."),
          variant: "destructive",
        });
      }
    },
    [uploadBulkPaymentExcel],
  );

  const exportButton = (
    <TooltipProvider>
      <Tooltip open={showDownloadHint ? true : undefined}>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-pointer transition-all duration-200 hover:scale-105">
            <motion.div
              animate={
                downloadBounce
                  ? {
                    scale: [1, 1.08, 1],
                    y: [0, -3, 0],
                  }
                  : { scale: 1, y: 0 }
              }
              transition={{
                duration: 0.22,
                ease: "easeOut",
              }}
            >
              <Button
                type="button"
                size="sm"
                variant="default"
                className={cn(
                  "relative shrink-0 cursor-pointer gap-2 bg-primary !text-white hover:bg-primary/90",
                  "[&_svg]:!stroke-white [&_svg]:!text-white",
                  "disabled:bg-primary disabled:!text-white",
                )}
                onClick={exportSellBulkPaymentToExcel}
                disabled={filteredTransactions.length === 0}
                aria-label={selectedTransactionIds.length > 0 ? "Click to Download" : "Export All"}
              >
                <DownloadCloud className="h-4 w-4 shrink-0 !stroke-white !text-white" />
                Export
                {selectedTransactionIds.length > 0 ? (
                  <span className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white">
                    {selectedTransactionIds.length}
                  </span>
                ) : null}
              </Button>
            </motion.div>
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
          {selectedTransactionIds.length > 0 ? "Click to Download" : "Export All"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  const headerBar = (
    <div
      className={cn(
        "flex shrink-0 items-center gap-3",
        headerStart && sellOnly && !physicalOnly ? "justify-between" : "justify-start",
      )}
    >
      {headerStart}
      {sellOnly && !physicalOnly ? exportButton : null}
    </div>
  );

  const card = (
    <Card
      className={cn(
        "flex flex-col min-h-0",
        embedded ? "flex-1" : sellOnly ? "h-[calc(100dvh-5.25rem)]" : "h-[calc(100vh-7.5rem)]",
      )}
    >
      <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm lg:flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search..."
            className="pl-10"
          />
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:flex-wrap lg:justify-end">
          <DateRangePicker
            value={dateRange}
            onChange={setDateRange}
            calendarClassName="[--cell-size:1.55rem]"
          />
          <SelectionFeedback
            transferAnimation={transferAnimation}
            downloadBounce={downloadBounce}
            showDownloadHint={showDownloadHint}
            selectedCount={selectedTransactionIds.length}
            disabled={filteredTransactions.length === 0}
            onExport={exportTransactionsToExcel}
            onUploadExcel={sellOnly && !physicalOnly ? handleBulkPaymentExcelUpload : undefined}
            uploadDisabled={isUploadingBulkPaymentExcel}
            isUploadingExcel={isUploadingBulkPaymentExcel}
            uploadTooltip="Upload bulk UTR Excel"
            onAnimationComplete={() => {
              setTransferAnimation(false);
              setDownloadBounce((prev) => !prev);
            }}
          />

        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table
          className={cn(
            "w-full text-sm text-left",
            sellOnly ? sellTableMinWidth : "min-w-[1300px]",
          )}
        >
          <thead className="table-head-sticky">
            <tr>
              <th className="px-4 py-4 ps-6 font-medium text-left w-12">
                <Checkbox
                  checked={allFilteredSelected}
                  onCheckedChange={(checked) => toggleAllFilteredTransactions(Boolean(checked))}
                  aria-label="Select all transactions for download"
                />
              </th>
              <th className="px-4 py-4 font-medium w-[190px]">
                <button type="button" onClick={() => handleSort("user")} className={getSortToggleClass(sortKey === "user")}>
                  User <SortDirectionIcon active={sortKey === "user"} direction={sortDirection} />
                </button>
              </th>
              {sellOnly && !physicalOnly ? (
                <th className="px-3 py-3 font-medium w-[220px]">Bank Details</th>
              ) : null}
              <th
                className={cn(
                  "px-3 font-medium",
                  sellOnly ? "py-3 w-[240px]" : "py-4 w-[190px]",
                )}
              >
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleSort("transaction")}
                    className={getSortToggleClass(sortKey === "transaction")}
                  >
                    Transaction Content <SortDirectionIcon active={sortKey === "transaction"} direction={sortDirection} />
                  </button>
                  {!sellOnly ? (
                    <TableHeaderFilter
                      title="Order type"
                      value={txnDirectionFilter}
                      onChange={handleOrderTypeFilterChange}
                      options={[...ORDER_TYPE_FILTER_OPTIONS]}
                      activeWhen={(value) => value !== "all"}
                      clearValue="all"
                    />
                  ) : null}
                </div>
              </th>
              {!sellOnly ? (
                <th className="px-4 py-4 font-medium w-[120px]">
                  <button
                    type="button"
                    onClick={() => handleSort("invoice")}
                    className={getSortToggleClass(sortKey === "invoice")}
                  >
                    Invoice <SortDirectionIcon active={sortKey === "invoice"} direction={sortDirection} />
                  </button>
                </th>
              ) : null}
              <th className="px-4 py-4 font-medium w-[140px]">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleSort("metal")}
                    className={getSortToggleClass(sortKey === "metal")}
                  >
                    Metal Type <SortDirectionIcon active={sortKey === "metal"} direction={sortDirection} />
                  </button>
                  <TableHeaderFilter
                    title="Metal type"
                    value={metalTypeFilter}
                    onChange={handleMetalFilterChange}
                    options={metalHeaderFilterOptions}
                    activeWhen={(value) => value !== "all"}
                    clearValue="all"
                  />
                </div>
              </th>
              {!sellOnly ? (
                <th className="px-4 py-4 font-medium w-[140px]">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleSort("method")}
                      className={getSortToggleClass(sortKey === "method")}
                    >
                      Payment Method <SortDirectionIcon active={sortKey === "method"} direction={sortDirection} />
                    </button>
                    <TableHeaderFilter
                      title="Payment method"
                      value={paymentMethodFilter}
                      onChange={handlePaymentMethodFilterChange}
                      options={paymentMethodHeaderFilterOptions}
                      activeWhen={(value) => value !== "all"}
                      clearValue="all"
                    />
                  </div>
                </th>
              ) : null}
              {sellOnly && physicalOnly ? (
                <th className="px-4 py-4 font-medium w-[130px]">Metal Quantity</th>
              ) : null}
              <th className="px-4 py-4 font-medium w-[120px]">
                <button type="button" onClick={() => handleSort("amount")} className={getSortToggleClass(sortKey === "amount")}>
                  Amount <SortDirectionIcon active={sortKey === "amount"} direction={sortDirection} />
                </button>
              </th>
              {sellOnly && physicalOnly ? (
                <th className="px-4 py-4 font-medium w-[130px]">Shipping Fees</th>
              ) : !sellOnly || !physicalOnly ? (
                <>
                  <th className="px-4 py-4 font-medium w-[140px]">Total Paid Amount</th>
                  <th className="px-4 py-4 font-medium w-[120px]">Platform Fee</th>
                </>
              ) : null}
              <th className="px-4 py-4 font-medium w-[130px]">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleSort("status")}
                    className={getSortToggleClass(sortKey === "status")}
                  >
                    {physicalOnly ? "Order Status" : "Status"}{" "}
                    <SortDirectionIcon active={sortKey === "status"} direction={sortDirection} />
                  </button>
                  <TableHeaderFilter
                    title={physicalOnly ? "Order status" : "Status"}
                    value={statusFilter}
                    onChange={handleStatusFilterChange}
                    scrollable={physicalOnly}
                    options={
                      physicalOnly
                        ? [...REDEMPTION_ORDER_STATUS_OPTIONS]
                        : sellOnly
                          ? [...SELL_STATUS_FILTER_OPTIONS]
                          : [...STATUS_FILTER_OPTIONS]
                    }
                    activeWhen={(value) =>
                      physicalOnly ? value !== "all" : sellOnly ? value !== "pending" : value !== "success"
                    }
                    clearValue={physicalOnly ? "all" : sellOnly ? "pending" : "success"}
                  />
                </div>
              </th>

              {showSellSettlementColumns ? (
                <>
                  <th className="px-3 py-3 font-medium w-[140px]">
                    <button
                      type="button"
                      onClick={() => handleSort("utr")}
                      className={getSortToggleClass(sortKey === "utr")}
                    >
                      UTR Number{" "}
                      <SortDirectionIcon
                        active={sortKey === "utr"}
                        direction={sortDirection}
                      />
                    </button>
                  </th>
                  <th className="px-3 py-3 font-medium w-[120px]">
                    <button
                      type="button"
                      onClick={() => handleSort("settlementDate")}
                      className={getSortToggleClass(sortKey === "settlementDate")}
                    >
                      Settlement Date{" "}
                      <SortDirectionIcon
                        active={sortKey === "settlementDate"}
                        direction={sortDirection}
                      />
                    </button>
                  </th>
                </>
              ) : null}
              <th className="px-4 py-4 font-medium w-[160px]">
                <button type="button" onClick={() => handleSort("date")} className={getSortToggleClass(sortKey === "date")}>
                  Date & Time <SortDirectionIcon active={sortKey === "date"} direction={sortDirection} />
                </button>
              </th>
              {sellOnly && !physicalOnly ? (
                <th className="px-4 py-4 font-medium w-[80px] text-right">Actions</th>
              ) : null}
            </tr>
          </thead>

          <tbody key={`${searchTerm}|${dateRangeLabel}|${statusFilter}|${metalTypeFilter}|${paymentMethodFilter}|${txnDirectionFilter}|${pagination.currentPage}`}>
            {isLoading ? (
              <tr>
                <td colSpan={tableColSpan} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Loading transactions...
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={tableColSpan} className="px-4 py-10 text-center text-sm text-destructive">
                  Failed to load transactions.
                </td>
              </tr>
            ) : filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan={tableColSpan} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No{" "}
                  {physicalOnly
                    ? "physical gold & silver transactions"
                    : sellOnly
                      ? "sell transactions"
                      : "transactions"}{" "}
                  found.
                </td>
              </tr>
            ) : (
              pagination.pagedItems.map((txn) => {
                const transactionId = txn.razorpayPaymentId ?? txn.merchantTransactionId ?? txn.id;
                const displayUserName = txn.userName ?? txn.user?.name ?? userNameById.get(txn.userId ?? "") ?? "-";
                const userHref = txn.userId ? `/users/${txn.userId}?from=transactions` : null;
                const bankDetails = txn.bankDetails ?? [];
                const activeBankIndex =
                  bankDetails.length > 0
                    ? (activeBankIndexByTxnId[txn.id] ?? 0) % bankDetails.length
                    : 0;
                const activeBank = bankDetails[activeBankIndex];

                return (
                  <tr
                    key={`${transactionId}-${txn.createdAt ?? txn.executedAt ?? txn.id}-${pagination.currentPage}-${statusFilter}-${metalTypeFilter}-${paymentMethodFilter}-${txnDirectionFilter}`}
                    className={cn(
                      "border-b border-border transition-all duration-200",
                      getSelectionRowClass(selectedTransactionIds.includes(txn.id)),
                    )}
                  >
                    <td className={cn("ps-6", sellOnly ? "px-3 py-2.5" : "px-4 py-4")}>
                      <Checkbox
                        checked={selectedTransactionIds.includes(txn.id)}
                        onCheckedChange={() => toggleTransactionSelection(txn.id)}
                        aria-label={`Select transaction ${transactionId} for download`}
                      />
                    </td>
                    <td
                      className={cn(
                        "font-medium text-foreground",
                        sellOnly ? "px-3 py-2.5 max-w-[160px]" : "px-4 py-4 w-[120px]",
                      )}
                    >
                      {userHref ? (
                        <Link href={userHref}>
                          <p
                            className={cn(
                              "cursor-pointer hover:text-primary transition-colors",
                              sellOnly ? "break-words leading-snug" : "truncate max-w-[170px]",
                            )}
                            title={displayUserName}
                          >
                            {displayUserName}
                          </p>
                        </Link>
                      ) : (
                        <p
                          className={cn(sellOnly ? "break-words leading-snug" : "truncate max-w-[170px]")}
                          title={displayUserName}
                        >
                          {displayUserName}
                        </p>
                      )}
                    </td>
                    {sellOnly && !physicalOnly ? (
                      <td className="px-3 py-2.5 align-top">
                        {bankDetails.length > 0 ? (
                          <div className="space-y-1.5 text-xs">
                            <div className="grid grid-cols-[74px_1fr] items-start gap-x-2">
                              <div className="flex items-center gap-1">
                                <span className="font-medium text-foreground">
                                  {activeBank?.bankName || "—"}
                                </span>

                              </div>
                            </div>
                            <div className="grid grid-cols-[74px_1fr] items-start gap-x-2">
                              <span className="font-mono text-foreground">
                                {(activeBank?.accountNumber)}
                              </span>
                            </div>
                            <div className="grid grid-cols-[74px_1fr] items-start gap-x-2">
                              <span className="font-mono text-foreground">
                                {activeBank?.ifscCode || "—"}
                              </span>
                            </div>
                            <div className="grid grid-cols-[74px_1fr] items-start gap-x-2">
                              <span className="font-mono text-foreground">
                                {activeBank?.bankBranch || "—"}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    ) : null}

                    <td className={cn(sellOnly ? "px-3 py-2.5 align-top" : "px-3 py-4 w-[170px]")}>
                      <p
                        className={cn(
                          "font-mono text-xs text-muted-foreground",
                          sellOnly
                            ? "max-w-[220px] break-all whitespace-normal leading-snug"
                            : "max-w-[140px] truncate",
                        )}
                        title={transactionId}
                      >
                        {transactionId}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatTransactionTypeDisplay(
                          txn.transactionType ?? txn.type,
                          txn.frequency,
                          txn.isRedeem,
                        )}
                      </p>
                    </td>
                    {!sellOnly ? (
                      <td className="px-4 py-4">
                        {isGiftCardBuyTransaction(txn) ? (
                          <p className="font-mono text-xs text-muted-foreground">-</p>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <p
                              className="max-w-[90px] truncate font-mono text-xs text-muted-foreground"
                              title={txn.invoiceNumber}
                            >
                              {txn.invoiceNumber}
                            </p>
                            {hasInvoice(txn) ? (
                              <>
                                {txn.invoiceUrl && (
                                  <>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
                                          onClick={() => {
                                            setPreviewUrl(txn.invoiceUrl ?? null);
                                            setPreviewLabel(txn.invoiceNumber);
                                          }}
                                          aria-label={`Preview invoice ${txn.invoiceNumber}`}
                                        >
                                          <Eye className="h-3.5 w-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent
                                        side="top"
                                        sideOffset={8}
                                        className={tooltipContentClassName}
                                      >
                                        Preview invoice
                                      </TooltipContent>
                                    </Tooltip>

                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                                          onClick={() => void downloadInvoice(txn)}
                                          aria-label={`Download invoice ${txn.invoiceNumber ?? txn.id}`}
                                        >
                                          <Download className="h-3.5 w-3.5" />
                                        </Button>
                                      </TooltipTrigger>

                                      <TooltipContent
                                        side="top"
                                        sideOffset={8}
                                        className={tooltipContentClassName}
                                      >
                                        Download invoice
                                      </TooltipContent>
                                    </Tooltip>
                                  </>
                                )}
                              </>
                            ) :
                              "-"}
                          </div>
                        )}
                      </td>
                    ) : null}
                    <td className={cn(sellOnly ? "px-3 py-2.5" : "px-4 py-4")}>
                      <p className="font-mono text-xs text-muted-foreground">
                        {formatTransactionMetalType(txn)}
                      </p>
                    </td>
                    {!sellOnly ? (
                      <td className="px-4 py-4">
                        <p className="font-mono text-xs text-muted-foreground">
                          {formatPaymentMethodLabel(txn.paymentMethod ?? txn.razorpayPaymentMethod)}
                        </p>
                      </td>
                    ) : null}
                    {sellOnly && physicalOnly ? (
                      <td className={cn(sellOnly ? "px-3 py-2.5 whitespace-nowrap" : "px-4 py-4")}>
                        <p className="font-mono text-xs text-muted-foreground">
                          {formatMetalQuantity(resolveTransactionMetalWeight(txn))}
                        </p>
                      </td>
                    ) : null}
                    <td className={cn(sellOnly ? "px-3 py-2.5 whitespace-nowrap" : "px-4 py-4")}>
                      <p className="font-bold text-foreground">
                        {typeof txn.amount === "number" ? formatCurrency(txn.amount) : "-"}
                      </p>
                    </td>
                    {sellOnly && physicalOnly ? (
                      <td className={cn(sellOnly ? "px-3 py-2.5 whitespace-nowrap" : "px-4 py-4")}>
                        <p className="text-foreground">
                          {typeof txn.shippingCharges === "number"
                            ? formatCurrency(txn.shippingCharges)
                            : "-"}
                        </p>
                      </td>
                    ) : (
                      <>
                        <td className={cn(sellOnly ? "px-3 py-2.5 whitespace-nowrap" : "px-4 py-4")}>
                          <p className=" text-foreground">
                            {typeof txn.totalPaidAmount === "number" ? formatCurrency(txn.totalPaidAmount) : "-"}
                          </p>
                        </td>
                        <td className={cn(sellOnly ? "px-3 py-2.5 whitespace-nowrap" : "px-4 py-4")}>
                          <div className="flex items-center gap-1.5">
                            <p className="text-foreground">
                              {typeof txn.platformFee === "number" ? formatCurrency(txn.platformFee) : "-"}
                            </p>
                            {shouldShowPlatformFeeInvoiceActions(txn) ? (
                              <>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                                      onClick={() => {
                                        setPreviewUrl(txn.platformFeeInvoiceUrl ?? null);
                                        setPreviewLabel(`Platform Fee - ${txn.id}`);
                                      }}
                                      aria-label={`Preview platform fee invoice for ${txn.id}`}
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="top"
                                    sideOffset={8}
                                    className={tooltipContentClassName}
                                  >
                                    Preview platform fee invoice
                                  </TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                                      onClick={() => void downloadPlatformFeeInvoice(txn)}
                                      aria-label={`Download platform fee invoice for ${txn.id}`}
                                    >
                                      <Download className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="top"
                                    sideOffset={8}
                                    className={tooltipContentClassName}
                                  >
                                    Download platform fee invoice
                                  </TooltipContent>
                                </Tooltip>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </>
                    )}

                    <td className={cn(sellOnly ? "px-3 py-2.5" : "px-4 py-4")}>
                      <Badge
                        variant={statusBadgeVariant(
                          resolveTransactionStatusValue(txn, physicalOnly),
                          sellOnly,
                          physicalOnly,
                        )}
                        className={physicalOnly ? "normal-case" : "capitalize"}
                      >
                        {physicalOnly
                          ? formatRedemptionOrderStatusLabel(resolveTransactionStatusValue(txn, physicalOnly))
                          : String(resolveTransactionStatusValue(txn, physicalOnly) ?? "unknown").toUpperCase()}
                      </Badge>
                      {/* {txn.failureReason && (
                            <p className="mt-1 max-w-[150px] truncate text-[10px] text-red-400" title={txn.failureReason}>
                              {txn.failureReason}
                            </p>
                          )} */}
                    </td>

                    {showSellSettlementColumns ? (
                      <>
                        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                          {shouldShowSellPayoutFields(txn, statusFilter) ? (
                            <p className="max-w-[140px] truncate" title={txn.utrNumber}>
                              {txn.utrNumber || "—"}
                            </p>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                          {shouldShowSellPayoutFields(txn, statusFilter)
                            ? formatSettlementDate(txn.settlementDate)
                            : "—"}
                        </td>
                      </>
                    ) : null}
                    <td className={cn("text-muted-foreground", sellOnly ? "px-3 py-2.5" : "px-4 py-4")}>
                      <TransactionDateTimeCell value={txn.createdAt ?? txn.executedAt} />
                    </td>
                    {sellOnly && !physicalOnly ? (
                      <td className="px-3 py-2.5 text-left">
                        {hasSellTransactionActions(txn) ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0 cursor-pointer"
                                disabled={
                                  (isCompletingSell && completingSellTxnId === txn.id) ||
                                  (isFailingSell && failingSellTxnId === txn.id) ||
                                  (isFailingSell && pendingSellTxnId === txn.id)
                                }
                                aria-label={`Open actions for sell transaction ${txn.id}`}
                              >
                                <MoreHorizontal className="h-5 w-5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className={sellActionMenuContentClassName}>
                              {canCompleteSellTransaction(txn) ? (
                                <DropdownMenuItem
                                  className={sellActionMenuItemClassName}
                                  onSelect={() => handleOpenCompleteSell(txn)}
                                >
                                  Process Deposit
                                </DropdownMenuItem>
                              ) : null}
                              {canMarkSellTransactionPending(txn) ? (
                                <DropdownMenuItem
                                  className={sellActionMenuItemClassName}
                                  onSelect={() => handleOpenPendingSell(txn)}
                                >
                                  Mark as Pending
                                </DropdownMenuItem>
                              ) : null}
                              {canMarkSellTransactionFailed(txn) ? (
                                <DropdownMenuItem
                                  className={sellActionMenuItemClassName}
                                  onSelect={() => handleOpenFailSell(txn)}
                                >
                                  Mark as Failed
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <TablePaginationFooter {...bindTablePaginationFooter(pagination)} />
    </Card>
  );

  const previewModal = (
    <ImagePreviewModal
      url={previewUrl}
      label={previewLabel}
      onClose={() => setPreviewUrl(null)}
    />
  );

  const sellCompleteDialog = sellOnly ? (
    <Dialog open={sellCompleteOpen} onOpenChange={handleSellCompleteOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden rounded-[24px] border-border bg-card p-0 shadow-2xl shadow-black/50">
        {sellCompleteStep === 1 ? (
          <form onSubmit={handleSubmitCompleteSell}>
            <DialogHeader className="border-b border-border px-5 py-4 text-left">
              <DialogTitle>Confirm Bank Payout</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 px-5 py-4">
              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                UTR Number
                <Input
                  value={sellCompleteUtr}
                  onChange={(event) => {
                    setSellCompleteUtr(event.target.value);
                    setSellCompleteError("");
                  }}
                  placeholder="Enter UTR Number"
                  autoFocus
                />
              </label>

              <label className="grid gap-1.5 text-sm font-medium text-foreground">
                Settlement Date
                <SingleDatePicker
                  value={sellCompleteDate}
                  onChange={(value) => {
                    setSellCompleteDate(value);
                    setSellCompleteError("");
                  }}
                  className="w-full sm:w-full"
                />
              </label>

              {sellCompleteError ? (
                <p className="text-sm font-medium text-destructive">{sellCompleteError}</p>
              ) : null}
            </div>

            <DialogFooter className="border-t border-border px-5 py-3.5 sm:justify-end sm:space-x-0">
              <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleSellCompleteOpenChange(false)}
                  disabled={isCompletingSell}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isCompletingSell}>
                  Continue
                </Button>
              </div>
            </DialogFooter>
          </form>
        ) : (
          <>
            <DialogHeader className="border-b border-border px-5 py-4 text-left">
              <DialogTitle>Confirm Bank Payout</DialogTitle>
              <DialogDescription>
                Please review the payout details before completing this step.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 px-5 py-4 text-sm">
              <div>
                <p className="text-muted-foreground">UTR Number</p>
                <p className="font-medium text-foreground">{sellCompleteUtr.trim()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Settlement Date</p>
                <p className="font-medium text-foreground">
                  {formatSettlementDate(sellCompleteDate)}
                </p>
              </div>
              <p className="pt-1 text-muted-foreground">
                Are you sure you want to record this bank payout?
              </p>
              {sellCompleteError ? (
                <p className="text-sm font-medium text-destructive">{sellCompleteError}</p>
              ) : null}
            </div>

            <DialogFooter className="border-t border-border px-5 py-3.5 sm:justify-end sm:space-x-0">
              <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSellCompleteStep(1);
                    setSellCompleteError("");
                  }}
                  disabled={isCompletingSell}
                >
                  Back
                </Button>
                <Button type="button" onClick={handleConfirmCompleteSell} disabled={isCompletingSell}>
                  {isCompletingSell ? "Recording payout..." : "Confirm Payout"}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  ) : null;

  const sellFailDialog = sellOnly ? (
    <Dialog open={sellFailOpen} onOpenChange={handleSellFailOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden rounded-[24px] border-border bg-card p-0 shadow-2xl shadow-black/50">
        {sellFailStep === 1 ? (
          <form onSubmit={handleSubmitFailSell}>
            <DialogHeader className="border-b border-border px-5 py-4 text-left">
              <DialogTitle>Mark Transaction as Failed</DialogTitle>
              <DialogDescription>
                You are about to mark this sell transaction as failed.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 px-5 py-4 text-sm">
              <div>
                <p className="text-muted-foreground">Transaction ID</p>
                <p className="font-medium break-all text-foreground">{sellFailTxn?.id ?? "—"}</p>
              </div>
              <p className="text-muted-foreground">
                Continue to confirm this action.
              </p>
              {sellFailError ? (
                <p className="text-sm font-medium text-destructive">{sellFailError}</p>
              ) : null}
            </div>

            <DialogFooter className="border-t border-border px-5 py-3.5 sm:justify-end sm:space-x-0">
              <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleSellFailOpenChange(false)}
                  disabled={isFailingSell}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="destructive" disabled={isFailingSell}>
                  Continue
                </Button>
              </div>
            </DialogFooter>
          </form>
        ) : (
          <>
            <DialogHeader className="border-b border-border px-5 py-4 text-left">
              <DialogTitle>Mark Transaction as Failed</DialogTitle>
              <DialogDescription>
                Please confirm before completing this step.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 px-5 py-4 text-sm">
              <div>
                <p className="text-muted-foreground">Transaction ID</p>
                <p className="font-medium break-all text-foreground">{sellFailTxn?.id ?? "—"}</p>
              </div>
              <p className="pt-1 text-muted-foreground">
                Are you sure you want to mark this transaction as failed?
              </p>
              {sellFailError ? (
                <p className="text-sm font-medium text-destructive">{sellFailError}</p>
              ) : null}
            </div>

            <DialogFooter className="border-t border-border px-5 py-3.5 sm:justify-end sm:space-x-0">
              <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSellFailStep(1);
                    setSellFailError("");
                  }}
                  disabled={isFailingSell}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleConfirmFailSell}
                  disabled={isFailingSell}
                >
                  {isFailingSell ? "Marking as failed..." : "Mark as Failed"}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  ) : null;

  const sellPendingDialog = sellOnly ? (
    <Dialog open={sellPendingOpen} onOpenChange={handleSellPendingOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden rounded-[24px] border-border bg-card p-0 shadow-2xl shadow-black/50">
        {sellPendingStep === 1 ? (
          <form onSubmit={handleSubmitPendingSell}>
            <DialogHeader className="border-b border-border px-5 py-4 text-left">
              <DialogTitle>Mark Transaction as Pending</DialogTitle>
              <DialogDescription>
                You are about to mark this sell transaction as pending.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 px-5 py-4 text-sm">
              <div>
                <p className="text-muted-foreground">Transaction ID</p>
                <p className="font-medium break-all text-foreground">{sellPendingTxn?.id ?? "—"}</p>
              </div>
              <p className="text-muted-foreground">
                Continue to confirm this action.
              </p>
              {sellPendingError ? (
                <p className="text-sm font-medium text-destructive">{sellPendingError}</p>
              ) : null}
            </div>

            <DialogFooter className="border-t border-border px-5 py-3.5 sm:justify-end sm:space-x-0">
              <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleSellPendingOpenChange(false)}
                  disabled={isFailingSell}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="outline"
                  className={getSellStatusActionButtonClassName("PENDING")}
                  disabled={isFailingSell}
                >
                  Continue
                </Button>
              </div>
            </DialogFooter>
          </form>
        ) : (
          <>
            <DialogHeader className="border-b border-border px-5 py-4 text-left">
              <DialogTitle>Mark Transaction as Pending</DialogTitle>
              <DialogDescription>
                Please confirm before completing this step.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 px-5 py-4 text-sm">
              <div>
                <p className="text-muted-foreground">Transaction ID</p>
                <p className="font-medium break-all text-foreground">{sellPendingTxn?.id ?? "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Status</p>
                <p className="font-medium text-foreground">PENDING</p>
              </div>
              <p className="pt-1 text-muted-foreground">
                Are you sure you want to mark this transaction as pending?
              </p>
              {sellPendingError ? (
                <p className="text-sm font-medium text-destructive">{sellPendingError}</p>
              ) : null}
            </div>

            <DialogFooter className="border-t border-border px-5 py-3.5 sm:justify-end sm:space-x-0">
              <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSellPendingStep(1);
                    setSellPendingError("");
                  }}
                  disabled={isFailingSell}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={getSellStatusActionButtonClassName("PENDING")}
                  onClick={handleConfirmPendingSell}
                  disabled={isFailingSell}
                >
                  {isFailingSell ? "Marking as pending..." : "Mark as Pending"}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  ) : null;

  if (embedded) {
    return (
      <>
        {sellOnly ? headerBar : null}
        {card}
        {previewModal}
        {sellCompleteDialog}
        {sellFailDialog}
        {sellPendingDialog}
      </>
    );
  }

  return (
    <>
      <Layout title={sellOnly ? "Sell Transactions" : "Transaction Management"}>
        {sellOnly ? headerBar : null}
        {card}
      </Layout>
      {previewModal}
      {sellCompleteDialog}
      {sellFailDialog}
      {sellPendingDialog}
    </>
  );
}

export default function TransactionsList() {
  const [activeTab, setActiveTab] = React.useState<TransactionPageTab>(getInitialTransactionPageTab);

  const handleTabChange = (tab: TransactionPageTab) => {
    setActiveTab(tab);
    syncTransactionPageTabToUrl(tab);
  };

  return (
    <Layout title="Transaction Management">
      <div className="flex h-[calc(100vh-7.5rem)] flex-col gap-4">
        <div className="flex w-fit items-center gap-1 rounded-xl border border-border bg-muted p-1">
          {TRANSACTION_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => handleTabChange(tab)}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-semibold transition-all cursor-pointer",
                activeTab === tab
                  ? "border border-border bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "Transactions" && <TransactionsListView embedded />}
        {activeTab === "Audit" && <ProviderMissingTransactionsPanel />}
      </div>
    </Layout>
  );
}
