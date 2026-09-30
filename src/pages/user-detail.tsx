import * as React from "react";
import { useState } from "react";
import ImagePreviewModal, { type PreviewImageItem } from "@/components/ui/ImagePreviewModal";
import {
  formatDocumentGroupLabel,
  getKycDocumentPreviewImages,
  groupKycDocuments,
} from "@/lib/kyc-documents";
import { useParams, Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import {
  Card,
  CardContent,
  Badge,
  Button,
} from "@/components/ui";
import { formatAmount } from "@/utils/formatAmount";
import { ArrowLeft, Bell, CheckCircle, XCircle, ShieldCheck, Mail, Phone, MapPin, Eye, Download, IdCard, Calendar, User, Users2, Lock, Search, ChevronDown, ChevronRight } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import goldImage from "@/assets/gold.png";
import silverImage from "@/assets/silver.png";
import {
  FOLIO_SECTIONS,
  formatHoldingsGrams,
  getFolioHoldings,
  getSipSummary,
  getTotalCurrentValue,
  getTotalHoldings,
  getTotalInvested,
  extractUserSips,
  unwrapUserHoldings,
  type FolioHoldings,
  type MetalHolding,
  type UserSipInstallment,
  type UserSipRecord,
} from "@/lib/user-holdings";

import { isDateInRange } from "@/lib/date-range";
import { DateRangePicker } from "@/components/ui/date-picker";
import type { DateRange } from "react-day-picker";

const USER_DETAIL_FOLIO_SECTIONS = FOLIO_SECTIONS.filter(
  ({ key }) => key === "goldFolio" || key === "growFolio",
);
import { downloadInvoice } from "@/lib/invoice-download";
import { Textarea } from "@/components/ui/textarea";
import {
  useSendBuyOtp,
  useVerifyBuyOtp,
  useSendSellOtp,
  useVerifySellOtp,
  useAdminUser,
  useUpdateUserStatus,
  useUserTransactions,
  useVerifyKyc,
  useGetWalletInfo,
} from "@/lib/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { TableHeaderFilter } from "@/components/table-header-filter";
import { getSortToggleClass, SortDirectionIcon, useTableSort } from "@/lib/table-sort";
import { readLoggedInUserEmail } from "@/lib/session-user";
import { resolvePanNumberDisplay } from "@/utils/decrypt-pan";
import { mapStatusFilterToApiStatus, TRANSACTION_STATUS_FILTER_OPTIONS } from "@/lib/transaction-filters";
import { bindTablePaginationFooter, useTablePagination } from "@/lib/table-pagination";
import { TablePaginationFooter } from "@/components/table-pagination-footer";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type UserDocument =
  | string
  | {
    _id?: string;
    status?: string;
    docType?: string;
    side?: string;
    documentGroupId?: string;
    fileName?: string;
    mediaUrl?: string;
    url?: string;
    name?: string;
    type?: string;
    title?: string;
  };

type DocumentEntry = KycDocumentGroup;

const SELECTED_USER_STORAGE_KEY = "gfolio-admin:selected-user";
const NOTIFICATION_RECIPIENTS_STORAGE_KEY = "gfolio-admin:notification-recipients";
const NOTIFICATION_RETURN_PATH_STORAGE_KEY = "gfolio-admin:notification-return-path";

type UserTransaction = {
  id: string;
  transactionType?: string;
  type?: string;
  frequency?: string;
  amount?: number;
  status?: string;
  metalType?: string;
  metalWeightInGrams?: number;
  createdAt?: string;
  executedAt?: string;
  failureReason?: string;
  invoiceNumber?: string;
  invoiceUrl?: string;
  razorpayPaymentId?: string;
  merchantTransactionId?: string;
  paymentMethod?: string;
  normalizedMetalType?: string;
  normalizedStatus?: string;
  normalizedPaymentMethod?: string;
};

type TransactionDirectionFilter = "all" | "buy" | "sell";

const BUY_GROUP_TRANSACTION_TYPES = new Set(["BUY", "MANUAL_SIP", "SIP", "BONUS"]);
const SELL_GROUP_TRANSACTION_TYPES = new Set(["SELL"]);

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

const TRANSACTION_MODE_OPTIONS = [
  { value: "CASH", label: "Cash" },
  { value: "ONLINE", label: "Online" },
] as const;

const OTP_RESEND_COOLDOWN_SECONDS = 60;

function formatOtpCountdown(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

const TRANSACTION_TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  ...BUY_TRANSACTION_TYPE_OPTIONS,
];

const STATUS_FILTER_OPTIONS = TRANSACTION_STATUS_FILTER_OPTIONS;

type TransactionListResponse = {
  transactions?: unknown[];
  data?: unknown[];
};

type UserTransactionSortKey =
  | "transaction"
  | "invoice"
  | "metal"
  | "method"
  | "weight"
  | "amount"
  | "status"
  | "date";

type UserSipSortKey =
  | "completed"
  | "missed"
  | "amount"
  | "installments"
  | "createdDate";

const SIP_TRANSACTION_TYPES = new Set(["SIP", "MANUAL_SIP"]);

function normalizeSearchValue(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function unwrapTransactions(payload: TransactionListResponse): unknown[] {
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.transactions)) return payload.transactions;
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

function normalizeUserTransaction(value: unknown): UserTransaction | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const rawId = record.id ?? record._id;
  const id =
    typeof rawId === "string"
      ? rawId
      : rawId != null
        ? String(rawId)
        : "";
  if (!id) return null;

  const invoice = record.invoice && typeof record.invoice === "object"
    ? (record.invoice as Record<string, unknown>)
    : undefined;

  const paymentMethod =
    typeof record.razorpayPaymentMethod === "string" && record.razorpayPaymentMethod.trim()
      ? record.razorpayPaymentMethod.trim()
      : typeof record.paymentMethod === "string" && record.paymentMethod.trim()
        ? record.paymentMethod.trim()
        : typeof record.payment_method === "string" && record.payment_method.trim()
          ? (record.payment_method as string).trim()
          : undefined;

  return {
    id,
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
    frequency: resolveTransactionFrequency(record),
    amount:
      typeof record.totalAmount === "number"
        ? record.totalAmount
        : typeof record.amount === "number"
          ? record.amount
          : undefined,
    status: typeof record.status === "string" ? record.status : undefined,
    paymentMethod,
    normalizedPaymentMethod: normalizeSearchValue(paymentMethod),
    metalType: typeof record.metalType === "string" ? record.metalType : undefined,
    metalWeightInGrams:
      typeof record.metalWeightInGrams === "number" ? record.metalWeightInGrams : undefined,
    createdAt:
      typeof record.createdAt === "string"
        ? record.createdAt
        : typeof record.executedAt === "string"
          ? record.executedAt
          : undefined,
    executedAt: typeof record.executedAt === "string" ? record.executedAt : undefined,
    failureReason: typeof record.failureReason === "string" ? record.failureReason : undefined,
    invoiceNumber:
      typeof record.invoiceNumber === "string"
        ? record.invoiceNumber
        : typeof invoice?.invoiceNumber === "string"
          ? invoice.invoiceNumber
          : undefined,
    invoiceUrl:
      typeof record.invoiceUrl === "string"
        ? record.invoiceUrl
        : typeof invoice?.url === "string"
          ? invoice.url
          : typeof invoice?.invoiceUrl === "string"
            ? invoice.invoiceUrl
            : undefined,
    razorpayPaymentId: typeof record.razorpayPaymentId === "string" ? record.razorpayPaymentId : undefined,
    merchantTransactionId:
      typeof record.merchantTransactionId === "string" ? record.merchantTransactionId : undefined,
    normalizedMetalType: getMetalFilterValue(
      typeof record.metalType === "string" ? record.metalType : undefined,
    ),
    normalizedStatus: getStatusFilterValue(typeof record.status === "string" ? record.status : undefined),
  };
}

function formatTransactionType(type?: string) {
  return String(type ?? "-").replace(/_/g, " ").toUpperCase();
}

function formatMetalWeightInGrams(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "-";
  return `${value.toFixed(4)} gm`;
}

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

function normalizeTxnTypeForKind(value?: string) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeFilterValue(value?: string) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");
}

function getStatusFilterValue(status?: string) {
  const normalized = normalizeFilterValue(status);
  if (!normalized) return "";
  if (normalized.includes("success") || normalized.includes("complete") || normalized.includes("paid")) {
    return "success";
  }
  if (normalized.includes("pending") || normalized.includes("processing") || normalized.includes("in progress")) {
    return "pending";
  }
  if (normalized.includes("refund")) return "refund";
  if (normalized.includes("failed") || normalized.includes("error") || normalized.includes("cancel")) {
    return "failed";
  }
  return normalized;
}

function getMetalFilterValue(value?: string) {
  const normalized = normalizeFilterValue(value);
  if (!normalized) return "";
  if (normalized.includes("gold")) return "gold";
  if (normalized.includes("silver")) return "silver";
  return normalized;
}

function txnMatchesDirectionFilter(txn: UserTransaction, filter: TransactionDirectionFilter) {
  if (filter === "all") return true;
  const kind = normalizeTxnTypeForKind(txn.transactionType ?? txn.type);
  if (!kind) return false;
  if (filter === "buy") return BUY_GROUP_TRANSACTION_TYPES.has(kind);
  if (filter === "sell") return SELL_GROUP_TRANSACTION_TYPES.has(kind);
  return true;
}

function formatTransactionTypeDisplay(type?: string, frequency?: string) {
  const base = formatTransactionType(type);
  const kind = normalizeTxnTypeForKind(type);
  if (!SIP_TRANSACTION_TYPES.has(kind) || !frequency) return base;
  return `${base} (${formatTransactionType(frequency)})`;
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
function formatDate(value?: string): string {
  if (!value) return "-";
  const dateValue = value.trim();
  // DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = dateValue.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    return `${day}/${month}/${year}`;
  }
  // YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = dateValue.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (ymdMatch) {
    const [, year, month, day] = ymdMatch;
    return `${day}/${month}/${year}`;
  }

  const isoMatch = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day}/${month}/${year}`;
  }
  return "-";
}

function transactionStatusBadgeVariant(status?: string) {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized.includes("success") || normalized.includes("complete") || normalized.includes("paid")) {
    return "success";
  }
  if (normalized.includes("pending") || normalized.includes("processing")) {
    return "warning";
  }
  if (normalized.includes("failed") || normalized.includes("error") || normalized.includes("cancel")) {
    return "destructive";
  }
  return "outline";
}

function getDocumentEntries(profile: any): DocumentEntry[] {
  const documents: UserDocument[] = Array.isArray(profile?.documents)
    ? profile.documents
    : Array.isArray(profile?.kycDocuments)
      ? profile.kycDocuments
      : [];

  return groupKycDocuments(documents).map((group) => ({
    ...group,
    label: formatDocumentGroupLabel(group.label),
  }));
}

function unwrapProfile(data: unknown): any {
  if (!data || typeof data !== "object") return data;

  const record = data as Record<string, unknown>;
  if ("data" in record && record.data) return record.data;
  if ("user" in record && record.user) return record.user;

  return data;
}

function normalizeUser(value: unknown): any | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const rawId = record.id ?? record._id;

  if (rawId == null) return null;

  const id = typeof rawId === "string" ? rawId : String(rawId);
  const dob =
    typeof record.dob === "string"
      ? record.dob
      : record.dob instanceof Date
        ? record.dob.toISOString()
        : undefined;

  return {
    id,
    ...record,
    _id: id,
    dob,
    panNumber: typeof record.panNumber === "string" ? record.panNumber : undefined,
    address: typeof record.address === "string" ? record.address : undefined,
    city: typeof record.city === "string" ? record.city : undefined,
    state: typeof record.state === "string" ? record.state : undefined,
    pincode: typeof record.pincode === "string" ? record.pincode : undefined,
    country: typeof record.country === "string" ? record.country : undefined,
  };
}

function extractUsers(data: unknown): any[] {
  const payload = unwrapProfile(data);
  if (!payload) return [];

  if (Array.isArray(payload)) {
    return payload.map(normalizeUser).filter(Boolean);
  }

  if (typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.users)) {
      return record.users.map(normalizeUser).filter(Boolean);
    }
    if (record.data && typeof record.data === "object" && Array.isArray((record.data as Record<string, unknown>).users)) {
      return ((record.data as Record<string, unknown>).users as unknown[]).map(normalizeUser).filter(Boolean);
    }
    const single = normalizeUser(payload);
    return single ? [single] : [];
  }

  return [];
}

function readSelectedUser(id?: string): any | null {
  if (typeof window === "undefined" || !id) return null;

  try {
    const raw = window.sessionStorage.getItem(SELECTED_USER_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const selected = unwrapProfile(parsed);
    const selectedId = selected?.id ?? selected?._id;

    return selectedId === id ? selected : null;
  } catch {
    return null;
  }
}

function kycBadgeVariant(value?: string) {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized === "approved" || normalized === "verified") return "success";
  if (normalized === "pending" || normalized === "in_review" || normalized === "review") return "warning";
  if (normalized === "rejected" || normalized === "declined" || normalized === "inactive") return "destructive";
  return "outline";
}

function SummaryStatCard({
  metrics,
  isLoading,
  onClick,
  className,
  large,
  actions,
  threeColumn,
}: {
  metrics: Array<{ title: string; total: string }>;
  isLoading: boolean;
  onClick?: () => void;
  className?: string;
  large?: boolean;
  actions?: React.ReactNode;
  threeColumn?: boolean;
}) {
  return (
    <Card
      className={`cursor-pointer border-border bg-white text-black transition-colors hover:ring-1 hover:ring-primary/40 ${className ?? ""}`}
      role={onClick ? "link" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <CardContent
        className={cn(
          "grid gap-x-3 gap-y-0 p-2.5",
          threeColumn
            ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
            : "[grid-template-columns:repeat(auto-fit,minmax(7.5rem,1fr))]",
        )}
      >
        {metrics.map((metric, index) => {
          const alignEnd = large && index === metrics.length - 1;
          return (
            <div
              key={metric.title}
              className={cn(
                "min-w-0",
                threeColumn && index === 1
                  ? "text-center"
                  : alignEnd && "text-right",
              )}
            >
              <p
                className={cn(
                  "mb-0 leading-none text-black/60",
                  large ? "text-xs" : "text-[11px]",
                )}
              >
                {metric.title}
              </p>
              <h3
                className={cn(
                  "mt-1 font-bold leading-tight tabular-nums whitespace-nowrap text-black",
                  large ? "text-lg" : "text-sm",
                )}
              >
                {isLoading ? "—" : metric.total}
              </h3>
            </div>
          );
        })}
        {actions ? (
          <div
            className="flex items-center justify-end gap-2"
            onClick={(event) => event.stopPropagation()}
          >
            {actions}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function FolioMetalStat({
  label,
  iconSrc,
  holding,
}: {
  label: string;
  iconSrc: string;
  holding?: MetalHolding;
}) {
  const lockedGrams = Number(holding?.lockedGrams) || 0;
  const currentValue = Number(holding?.currentValue);
  const hasCurrentValue = Number.isFinite(currentValue);

  return (
    <div className="flex h-full min-h-0 flex-col justify-between rounded-lg border border-border/70 bg-muted/40 px-3.5 py-3">
      <div className="mb-2 flex items-center gap-2">
        <img src={iconSrc} alt="" className="h-5 w-5 shrink-0 object-contain" aria-hidden />
        <span className="text-sm font-semibold text-black">{label}</span>
      </div>
      <dl className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <dt className="shrink-0 text-sm text-black/55">Weight</dt>
          <dd className="text-sm font-semibold tabular-nums whitespace-nowrap text-black">
            {formatHoldingsGrams(holding?.totalGrams)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="inline-flex shrink-0 items-center gap-1 text-sm text-black/55">
            <Lock className="h-3.5 w-3.5" aria-hidden />
            Locked
          </dt>
          <dd className="text-sm font-semibold tabular-nums whitespace-nowrap text-black">
            {formatHoldingsGrams(lockedGrams)}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="shrink-0 text-sm text-black/55">Current Value</dt>
          <dd className="text-sm font-semibold tabular-nums whitespace-nowrap text-black">
            {hasCurrentValue ? formatCurrency(currentValue) : "—"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function FolioHoldingsCard({
  label,
  folio,
  onClick,
}: {
  label: string;
  folio?: FolioHoldings;
  onClick?: () => void;
}) {
  return (
    <Card
      className="h-full cursor-pointer border-border bg-white text-black transition-colors hover:ring-1 hover:ring-primary/40"
      role={onClick ? "link" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <CardContent className="flex h-full flex-col p-4">
        <p className="mb-3 shrink-0 text-sm font-semibold text-black">{label}</p>
        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-2 gap-2.5">
          <FolioMetalStat label="Gold" iconSrc={goldImage} holding={folio?.gold} />
          <FolioMetalStat label="Silver" iconSrc={silverImage} holding={folio?.silver} />
        </div>
      </CardContent>
    </Card>
  );
}

function toTitleCaseLabel(value?: string) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[_-]+/g, " ")
    .toLowerCase();
  if (!normalized) return "-";
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatSipAmount(value?: number) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "₹0";
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

function formatSipNextDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatSipStatusLabel(status?: string) {
  const normalized = String(status ?? "").trim().toUpperCase();
  if (normalized === "PENDING_MANDATE") return "Payment Pending";
  if (normalized === "PAUSED") return "Paused";
  if (normalized === "CANCELLED") return "Cancelled";
  if (normalized === "COMPLETED") return "Completed";
  if (normalized === "MISSED") return "Missed";
  if (normalized === "ACTIVE") return "Active";
  return toTitleCaseLabel(status) || "Active";
}

function sipStatusBadgeClass(status?: string) {
  const normalized = String(status ?? "").trim().toUpperCase();
  if (normalized === "ACTIVE") return "bg-emerald-50 text-emerald-700";
  if (normalized === "PAUSED") return "bg-amber-50 text-amber-700";
  if (normalized === "PENDING_MANDATE") return "bg-orange-50 text-orange-700";
  if (normalized === "CANCELLED" || normalized === "MISSED") {
    return "bg-red-50 text-red-700";
  }
  if (normalized === "COMPLETED") return "bg-sky-50 text-sky-700";
  return "bg-muted text-muted-foreground";
}

function isSilverMetal(metalType?: string) {
  const normalized = String(metalType ?? "").trim().toUpperCase();
  return normalized.includes("SILVER") || normalized.startsWith("S");
}

function matchesSipMetalFilter(metalType: string | undefined, filter: string) {
  if (filter === "all") return true;
  const isSilver = isSilverMetal(metalType);
  if (filter === "silver") return isSilver;
  if (filter === "gold") return !isSilver;
  return true;
}

function matchesSipStatusFilter(status: string | undefined, filter: string) {
  if (filter === "all") return true;
  return String(status ?? "").trim().toUpperCase() === filter.toUpperCase();
}

function getSipTypeKey(sip: UserSipRecord) {
  const raw = String(sip.sipType || sip.type || "")
    .trim()
    .replace(/\s*SIP$/i, "");
  const normalized = raw.toUpperCase();
  if (!normalized || normalized === "AUTO") return "auto";
  if (normalized === "MANUAL") return "manual";
  return normalized.toLowerCase();
}

function getSipFrequencyKey(sip: UserSipRecord) {
  return normalizeSearchValue(sip.frequency) || "unknown";
}

function matchesSipTypeFilter(sip: UserSipRecord, filter: string) {
  if (filter === "all") return true;
  return getSipTypeKey(sip) === filter;
}

function matchesSipFrequencyFilter(sip: UserSipRecord, filter: string) {
  if (filter === "all") return true;
  return getSipFrequencyKey(sip) === filter;
}

const SIP_METAL_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "gold", label: "Gold" },
  { value: "silver", label: "Silver" },
] as const;

const SIP_TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "auto", label: "Auto" },
  { value: "manual", label: "Manual" },
] as const;

const SIP_FREQUENCY_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const;

const SIP_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "COMPLETED", label: "Completed" },
] as const;
function UserSipCard({
  sip,
}: {
  sip: UserSipRecord;
}) {
  const isSilver = isSilverMetal(sip.metalType);
  const metalLabel = isSilver ? "Silver" : "Gold";
  const frequencyLabel = toTitleCaseLabel(sip.frequency);
  const completedInstallments = Number(sip.completedInstallments ?? 0);
  const missedInstallments = Number(sip.missedInstallments ?? 0);
  const installmentCount =
    sip.sipManagers?.length && sip.sipManagers.length > 0
      ? sip.sipManagers.length
      : completedInstallments;
  const rawTypeLabel =
    sip.sipType ||
    (String(sip.type ?? "").toUpperCase() === "MANUAL" ? "Manual" : "Auto");
  const sipTypeLabel = rawTypeLabel.replace(/\s*SIP$/i, "") || "Auto";

  const stats = [
    { label: "Type", value: sipTypeLabel },
    { label: "Frequency", value: frequencyLabel },
    { label: "Completed", value: String(completedInstallments), tabular: true },
    {
      label: "Missed",
      value: String(missedInstallments),
      tabular: true,
      alert: missedInstallments > 0,
    },
  ] as const;



  return (
    <Card className="h-full overflow-hidden rounded-lg border border-[#E8E8E8] bg-white text-black shadow-none">
      <CardContent className="flex h-full flex-col gap-2 p-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#F5F5F5]">
            <img
              src={isSilver ? silverImage : goldImage}
              alt=""
              className="h-4 w-4 object-contain"
              aria-hidden
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold leading-4 text-black">
              {metalLabel} SIP
            </p>
            <div className="mt-1 flex min-h-4 items-center gap-1.5">
              <span
                className={`inline-flex h-4 items-center rounded-full px-1.5 text-[9px] font-medium leading-none ${sipStatusBadgeClass(sip.status)}`}
              >
                {formatSipStatusLabel(sip.status)}
              </span>
              <span className="truncate text-[10px] leading-none text-black/45">
                {frequencyLabel}
              </span>
            </div>
          </div>

          <div className="w-[4.25rem] shrink-0 text-right">
            <p className="truncate text-[13px] font-semibold tabular-nums leading-4 text-black">
              {formatSipAmount(sip.sipAmount)}
            </p>
            <p className="mt-1 truncate text-[10px] leading-none text-black/45 tabular-nums">
              {installmentCount} inst.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 overflow-hidden rounded-md border border-[#EEEEEE] bg-[#EEEEEE] gap-px">
          {stats.map((stat) => (
            <div key={stat.label} className="min-w-0 bg-[#F7F7F7] px-2 py-1.5">
              <p className="text-[9px] font-medium uppercase tracking-wide text-black/40">
                {stat.label}
              </p>
              <p
                className={`mt-0.5 truncate text-[11px] font-semibold leading-4 ${
                  "tabular" in stat && stat.tabular ? "tabular-nums" : ""
                } ${"alert" in stat && stat.alert ? "text-red-600" : "text-black"}`}
              >
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-auto flex min-h-4 items-center justify-between gap-2 border-t border-[#EDEDED] pt-2">
          <p className="text-[10px] text-black/45">Next SIP</p>
          <p className="truncate text-[10px] font-semibold tabular-nums text-black">
            {formatSipNextDate(sip.nextExecutionDate)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function SipInstallmentsDetailTable({
  installments,
}: {
  installments: UserSipInstallment[];
}) {
  if (installments.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-muted-foreground">
        No installments found for this SIP.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <table className="w-full min-w-[760px] text-left text-sm text-foreground">
        <thead className="table-head-sticky">
          <tr>
            <th className="w-[110px] px-3 py-3 font-medium">Installment</th>
            <th className="w-[110px] px-4 py-3 font-medium">Status</th>
            <th className="w-[110px] px-4 py-3 font-medium">Amount</th>
            <th className="w-[110px] px-4 py-3 font-medium">Frequency</th>
            <th className="w-[120px] px-4 py-3 font-medium">Execution</th>
            <th className="w-[120px] px-4 py-3 font-medium">Next date</th>
            <th className="w-[90px] px-4 py-3 font-medium">Missed</th>
            <th className="w-[120px] px-4 py-3 font-medium">Payment</th>
          </tr>
        </thead>
        <tbody>
          {installments.map((installment, index) => {
            const missed = Number(installment.missedInstallments ?? 0);
            return (
              <tr
                key={installment.id || installment._id || `installment-${index}`}
                className="border-b border-border transition-colors last:border-0 hover:bg-muted"
              >
                <td className="px-3 py-3">
                  <p className="font-medium text-foreground">#{index + 1}</p>
                  <p
                    className="max-w-[100px] truncate font-mono text-xs text-muted-foreground"
                    title={installment.id}
                  >
                    {installment.id}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${sipStatusBadgeClass(installment.status)}`}
                  >
                    {formatSipStatusLabel(installment.status)}
                  </span>
                  {installment.lastFailureReason ? (
                    <p
                      className="mt-1 max-w-[140px] truncate text-sm text-destructive"
                      title={installment.lastFailureReason}
                    >
                      {installment.lastFailureReason}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <p className="font-bold text-foreground">
                    {formatSipAmount(installment.sipAmount)}
                  </p>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {toTitleCaseLabel(installment.frequency)}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {installment.lastExecutionStatus
                    ? toTitleCaseLabel(installment.lastExecutionStatus)
                    : "-"}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {formatSipNextDate(installment.nextExecutionDate)}
                </td>
                <td
                  className={cn(
                    "px-4 py-3 text-sm tabular-nums",
                    missed > 0 ? "text-destructive" : "text-foreground",
                  )}
                >
                  {missed}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {toTitleCaseLabel(
                    installment.paymentMethod || installment.debitMode || undefined,
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
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
const USER_TRANSACTIONS_SEARCH_DEBOUNCE_MS = 500;
function mapUserTransactionSortKeyToApi(sortKey: UserTransactionSortKey | null) {
  if (!sortKey) return undefined;
  if (sortKey === "date") return "createdAt";
  if (sortKey === "amount") return "amount";
  if (sortKey === "status") return "status";
  if (sortKey === "metal") return "metalType";
  if (sortKey === "transaction") return "merchantTransactionId";
  return undefined;
}
export default function UserDetail() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { data: userData, isLoading: isUserLoading } = useAdminUser(id);
  const {
    data: walletInfo,
    isLoading: isWalletLoading,
    refetch: refetchWalletInfo,
  } = useGetWalletInfo(id);
  const holdings = React.useMemo(() => unwrapUserHoldings(walletInfo), [walletInfo]);
  const sips = React.useMemo(() => extractUserSips(walletInfo), [walletInfo]);
  const sipSummary = React.useMemo(() => getSipSummary(walletInfo), [walletInfo]);
  const [sipMetalFilter, setSipMetalFilter] = React.useState("all");
  const [sipTypeFilter, setSipTypeFilter] = React.useState("all");
  const [sipFrequencyFilter, setSipFrequencyFilter] = React.useState("all");
  const [sipStatusFilter, setSipStatusFilter] = React.useState("all");
  const [sipSearchTerm, setSipSearchTerm] = React.useState("");
  const [expandedSipId, setExpandedSipId] = React.useState<string | null>(null);
  const {
    sortKey: sipSortKey,
    sortDirection: sipSortDirection,
    directionFactor: sipSortFactor,
    handleSort: handleSipSort,
  } = useTableSort<UserSipSortKey>();
  const sipFrequencyFilterOptions = React.useMemo(() => {
    const options = new Set<string>(
      SIP_FREQUENCY_FILTER_OPTIONS.filter((option) => option.value !== "all").map(
        (option) => option.value,
      ),
    );
    for (const sip of sips) {
      const key = getSipFrequencyKey(sip);
      if (key && key !== "unknown") options.add(key);
    }
    return [
      { value: "all", label: "All" },
      ...Array.from(options)
        .sort()
        .map((value) => ({
          value,
          label: toTitleCaseLabel(value),
        })),
    ];
  }, [sips]);

  const hasActiveSipFilters =
    sipMetalFilter !== "all" ||
    sipTypeFilter !== "all" ||
    sipFrequencyFilter !== "all" ||
    sipStatusFilter !== "all" ||
    Boolean(sipSearchTerm);
  const filteredSips = React.useMemo(() => {
    const term = normalizeSearchValue(sipSearchTerm);
    return sips.filter((sip) => {
      if (!matchesSipMetalFilter(sip.metalType, sipMetalFilter)) return false;
      if (!matchesSipTypeFilter(sip, sipTypeFilter)) return false;
      if (!matchesSipFrequencyFilter(sip, sipFrequencyFilter)) return false;
      if (!matchesSipStatusFilter(sip.status, sipStatusFilter)) return false;
      if (!term) return true;
      const haystack = [
        sip.metalType,
        sip.type,
        sip.sipType,
        sip.frequency,
        sip.status,
        sip.paymentMethod,
        sip.paymentGateway,
        sip.id,
        sip._id,
        String(sip.sipAmount ?? ""),
      ]
        .map((value) => normalizeSearchValue(value))
        .join(" ");
      return haystack.includes(term);
    });
  }, [
    sips,
    sipMetalFilter,
    sipTypeFilter,
    sipFrequencyFilter,
    sipStatusFilter,
    sipSearchTerm,
  ]);
  const sortedSips = React.useMemo(() => {
    if (!sipSortKey) return filteredSips;

    return [...filteredSips].sort((a, b) => {
      if (sipSortKey === "missed") {
        return (
          (Number(a.missedInstallments ?? 0) - Number(b.missedInstallments ?? 0)) *
          sipSortFactor
        );
      }
      if (sipSortKey === "amount") {
        return (Number(a.sipAmount ?? 0) - Number(b.sipAmount ?? 0)) * sipSortFactor;
      }
      if (sipSortKey === "completed") {
        return (
          (Number(a.completedInstallments ?? 0) - Number(b.completedInstallments ?? 0)) *
          sipSortFactor
        );
      }
      if (sipSortKey === "installments") {
        return (
          (Number(a.sipManagers?.length ?? 0) - Number(b.sipManagers?.length ?? 0)) *
          sipSortFactor
        );
      }

      const aValue = new Date(a.createdAt ?? 0).getTime();
      const bValue = new Date(b.createdAt ?? 0).getTime();
      return (aValue - bValue) * sipSortFactor;
    });
  }, [filteredSips, sipSortFactor, sipSortKey]);
  const sipPagination = useTablePagination(sortedSips);
  const totalSipsCount = walletInfo?.masterSipCount ?? sips.length;
  const activeSipsCount = Number(sipSummary.ACTIVE ?? 0);
  const totalHoldings = React.useMemo(() => getTotalHoldings(holdings), [holdings]);
  const totalInvested = React.useMemo(() => getTotalInvested(totalHoldings), [totalHoldings]);
  const totalCurrentValue = React.useMemo(() => getTotalCurrentValue(totalHoldings), [totalHoldings]);
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [transactionPage, setTransactionPage] = React.useState(1);
  const [metalTypeFilter, setMetalTypeFilter] = React.useState("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = React.useState("all");
  const [txnDirectionFilter, setTxnDirectionFilter] = React.useState<TransactionDirectionFilter>("all");
  const [transactionTypeFilter, setTransactionTypeFilter] = React.useState("all");
  const [searchTerm, setSearchTerm] = React.useState("");
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>();
  const { sortKey, sortDirection, directionFactor, handleSort } =
    useTableSort<UserTransactionSortKey>();
  const debouncedTransactionSearch = useDebouncedValue(
    searchTerm,
    USER_TRANSACTIONS_SEARCH_DEBOUNCE_MS,
  );
  const transactionFromDate = dateRange?.from ? formatDateInputValue(dateRange.from) : undefined;
  const transactionToDate = dateRange?.to
    ? formatDateInputValue(dateRange.to)
    : dateRange?.from
      ? formatDateInputValue(dateRange.from)
      : undefined;
  const userTransactionApiSortBy = mapUserTransactionSortKeyToApi(sortKey);
  const userTransactionsFilter = React.useMemo(() => {
    const apiStatus = mapStatusFilterToApiStatus(statusFilter);
    return apiStatus ? { status: apiStatus } : undefined;
  }, [statusFilter]);
  const {
    data: userTransactionsResponse,
    isLoading: isTransactionsLoading,
    isError: isTransactionsError,
  } = useUserTransactions(id, userTransactionsFilter);
  const { mutateAsync: sendBuyOtp, isPending: isSendingBuyOtp } = useSendBuyOtp();
  const { mutateAsync: verifyBuyOtp, isPending: isVerifyingBuyOtp } = useVerifyBuyOtp();
  const { mutateAsync: sendSellOtp, isPending: isSendingSellOtp } = useSendSellOtp();
  const { mutateAsync: verifySellOtp, isPending: isVerifyingSellOtp } = useVerifySellOtp();
  const { mutateAsync: verifyKyc } = useVerifyKyc();
  const { mutateAsync: updateUserStatus, isPending: isUpdatingUserStatus } =
    useUpdateUserStatus();

  const userTransactions = React.useMemo(() => {
    if (!userTransactionsResponse) return [];
    return unwrapTransactions(userTransactionsResponse)
      .map(normalizeUserTransaction)
      .filter((txn): txn is UserTransaction => txn !== null);
  }, [userTransactionsResponse]);
  const [isUpdatingKyc, setIsUpdatingKyc] = React.useState(false);
  const [kycOverride, setKycOverride] = React.useState<string | null>(null);
  const [isActiveOverride, setIsActiveOverride] = React.useState<boolean | null>(null);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectComment, setRejectComment] = React.useState("");
  const [actionType, setActionType] = React.useState<"rejected" | "suspended" | null>(null);
  const [localProfile, setLocalProfile] = React.useState<any>(() => readSelectedUser(id));
  const params = new URLSearchParams(window.location.search);
  const from = params.get("from");
  const kycFilter = params.get("kycFilter") || sessionStorage.getItem("kycFilter") || "all";
  const [buyOpen, setBuyOpen] = React.useState(false);
  const [sellOpen, setSellOpen] = React.useState(false);
  const [buyAmount, setBuyAmount] = useState("");
  const [buyOtp, setBuyOtp] = useState("");
  const [buyOtpSent, setBuyOtpSent] = useState(false);
  const [buyOtpResendSeconds, setBuyOtpResendSeconds] = useState(0);
  const [sellGrams, setSellGrams] = useState("");
  const [sellOtp, setSellOtp] = useState("");
  const [sellOtpSent, setSellOtpSent] = useState(false);
  const [sellOtpResendSeconds, setSellOtpResendSeconds] = useState(0);
  const [cashfreeOrderId, setCashfreeOrderId] = useState("");
  const [cashfreePaymentId, setCashfreePaymentId] = useState("");
  const [transactionType, setTransactionType] = useState("");
  const [transactionMode, setTransactionMode] = useState("");
  const [selectedMetal, setSelectedMetal] = React.useState<
    "gold" | "silver" | null
  >("gold");
  const [sellMetalType, setSellMetalType] = React.useState<"gold" | "silver">("gold");
  // const [metalTypeFilter, setMetalTypeFilter] = React.useState("all");
  // const [txnDirectionFilter, setTxnDirectionFilter] = React.useState<TransactionDirectionFilter>("all");
  // const [transactionTypeFilter, setTransactionTypeFilter] = React.useState("all");
  // const [searchTerm, setSearchTerm] = React.useState("");
  // const [dateRange, setDateRange] = React.useState<DateRange | undefined>();
  React.useEffect(() => {
    if (buyOtpResendSeconds <= 0) return;

    const timer = window.setInterval(() => {
      setBuyOtpResendSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [buyOtpResendSeconds]);

  React.useEffect(() => {
    if (sellOtpResendSeconds <= 0) return;

    const timer = window.setInterval(() => {
      setSellOtpResendSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [sellOtpResendSeconds]);

  // const { sortKey, sortDirection, directionFactor, handleSort } =
  //   useTableSort<UserTransactionSortKey>();

  const metalTypeOptions = React.useMemo(() => {
    const options = new Set<string>();
    for (const txn of userTransactions) {
      if (txn.normalizedMetalType) options.add(txn.normalizedMetalType);
    }
    return Array.from(options).sort();
  }, [userTransactions]);

  const metalHeaderFilterOptions = React.useMemo(
    () => [
      { value: "all", label: "All" },
      ...metalTypeOptions.map((metal) => ({
        value: metal,
        label: metal.charAt(0).toUpperCase() + metal.slice(1),
      })),
    ],
    [metalTypeOptions],
  );

  const paymentMethodOptions = React.useMemo(() => {
    const options = new Set<string>();
    for (const txn of userTransactions) {
      if (txn.normalizedPaymentMethod) options.add(txn.normalizedPaymentMethod);
    }
    return Array.from(options).sort();
  }, [userTransactions]);

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

  const handleTransactionTypeFilterChange = React.useCallback((value: string) => {
    setTransactionTypeFilter(value);
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

  const filteredUserTransactions = React.useMemo(() => {
    const term = normalizeSearchValue(searchTerm);

    return userTransactions.filter((txn) => {
      const matchesStatus = statusFilter === "all" || txn.normalizedStatus === statusFilter;
      const matchesMetalType = metalTypeFilter === "all" || txn.normalizedMetalType === metalTypeFilter;
      const matchesPaymentMethod =
        paymentMethodFilter === "all" || txn.normalizedPaymentMethod === paymentMethodFilter;
      const matchesTxnDirection = txnMatchesDirectionFilter(txn, txnDirectionFilter);
      const matchesTransactionType =
        transactionTypeFilter === "all" ||
        normalizeTxnTypeForKind(txn.transactionType ?? txn.type) === transactionTypeFilter;
      const matchesDate = isDateInRange(txn.createdAt ?? txn.executedAt, dateRange);
      const matchesSearch =
        term.length === 0 ||
        normalizeSearchValue(txn.razorpayPaymentId).includes(term) ||
        normalizeSearchValue(txn.merchantTransactionId).includes(term) ||
        normalizeSearchValue(txn.id).includes(term) ||
        normalizeSearchValue(txn.invoiceNumber).includes(term) ||
        normalizeSearchValue(txn.metalType).includes(term) ||
        normalizeSearchValue(txn.paymentMethod).includes(term) ||
        normalizeSearchValue(txn.transactionType ?? txn.type).includes(term) ||
        normalizeSearchValue(txn.status).includes(term);

      return (
        matchesStatus &&
        matchesMetalType &&
        matchesPaymentMethod &&
        matchesTxnDirection &&
        matchesTransactionType &&
        matchesDate &&
        matchesSearch
      );
    });
  }, [
    userTransactions,
    statusFilter,
    metalTypeFilter,
    paymentMethodFilter,
    txnDirectionFilter,
    transactionTypeFilter,
    dateRange,
    searchTerm,
  ]);

  const sortedUserTransactions = React.useMemo(() => {
    if (!sortKey) return filteredUserTransactions;

    return [...filteredUserTransactions].sort((a, b) => {
      if (sortKey === "transaction") {
        const aValue = normalizeSearchValue(a.razorpayPaymentId ?? a.merchantTransactionId ?? a.id);
        const bValue = normalizeSearchValue(b.razorpayPaymentId ?? b.merchantTransactionId ?? b.id);
        return aValue.localeCompare(bValue) * directionFactor;
      }
      if (sortKey === "invoice") {
        const aValue = normalizeSearchValue(a.invoiceNumber);
        const bValue = normalizeSearchValue(b.invoiceNumber);
        return aValue.localeCompare(bValue) * directionFactor;
      }
      if (sortKey === "metal") {
        const aValue = normalizeSearchValue(a.metalType);
        const bValue = normalizeSearchValue(b.metalType);
        return aValue.localeCompare(bValue) * directionFactor;
      }
      if (sortKey === "method") {
        const aValue = normalizeSearchValue(a.paymentMethod);
        const bValue = normalizeSearchValue(b.paymentMethod);
        return aValue.localeCompare(bValue) * directionFactor;
      }
      if (sortKey === "weight") {
        const aValue = Number(a.metalWeightInGrams ?? 0);
        const bValue = Number(b.metalWeightInGrams ?? 0);
        return (aValue - bValue) * directionFactor;
      }
      if (sortKey === "amount") {
        const aValue = Number(a.amount ?? 0);
        const bValue = Number(b.amount ?? 0);
        return (aValue - bValue) * directionFactor;
      }
      if (sortKey === "status") {
        const aValue = normalizeSearchValue(a.status);
        const bValue = normalizeSearchValue(b.status);
        return aValue.localeCompare(bValue) * directionFactor;
      }
      const aValue = new Date(a.createdAt ?? a.executedAt ?? 0).getTime();
      const bValue = new Date(b.createdAt ?? b.executedAt ?? 0).getTime();
      return (aValue - bValue) * directionFactor;
    });
  }, [directionFactor, filteredUserTransactions, sortKey]);

  const transactionPagination = useTablePagination(sortedUserTransactions);

  React.useEffect(() => {
    transactionPagination.resetPage();
  }, [id, transactionPagination.resetPage]);

  React.useEffect(() => {
    transactionPagination.resetPage();
  }, [
    metalTypeFilter,
    paymentMethodFilter,
    sortKey,
    sortDirection,
    statusFilter,
    transactionPagination.resetPage,
    txnDirectionFilter,
    transactionTypeFilter,
    searchTerm,
    dateRange,
  ]);

  React.useEffect(() => {
    sipPagination.resetPage();
  }, [id, sipPagination.resetPage]);

  React.useEffect(() => {
    sipPagination.resetPage();
    setExpandedSipId(null);
  }, [
    sipMetalFilter,
    sipTypeFilter,
    sipFrequencyFilter,
    sipStatusFilter,
    sipSearchTerm,
    sipSortKey,
    sipSortDirection,
    sipPagination.resetPage,
  ]);

  React.useEffect(() => {
    setExpandedSipId(null);
  }, [id]);

  const toggleSipRowExpand = React.useCallback((sip: UserSipRecord) => {
    setExpandedSipId((current) => (current === sip.id ? null : sip.id));
  }, []);

const transactionsTab = params.get("tab");
const backUrl =
  from === "transactions"
    ? transactionsTab === "provider-pending"
      ? "/transactions?tab=provider-pending"
      : "/transactions"
    : from === "holdings"
      ? "/holdings"
      : from === "contest-leaderboard"
        ? "/contests/leaderboard"
        : from === "referrals"
          ? "/referrals"
          : from === "offer-influencers"
            ? "/offer-users?tab=influencers"
            : from === "offer-users"
              ? "/offer-users"
              : from === "deletion"
                ? `/deleteusers?kycFilter=${kycFilter}`
                : `/users?kycFilter=${kycFilter}`;


  const [previewImages, setPreviewImages] = useState<PreviewImageItem[]>([]);
  const [previewLabel, setPreviewLabel] = useState<string | undefined>(undefined);

  React.useEffect(() => {
    sessionStorage.setItem("kycFilter", kycFilter);
  }, [kycFilter]);

  React.useEffect(() => {
    const users = extractUsers(userData);
    const nextProfile =
      users.find((user) => user?.id === id || user?._id === id) ?? null;
    if (nextProfile) {
      setLocalProfile((prev: any) => ({
        ...(prev ?? {}),
        ...(nextProfile ?? {}),
      }));
      return;
    }

    if (!isUserLoading) {
      setLocalProfile(readSelectedUser(id));
    }
  }, [id, isUserLoading, userData]);

  const profile = React.useMemo(() => {
    const users = extractUsers(userData);
    const fetchedProfile = users.find((user) => user?.id === id || user?._id === id) ?? null;
    return fetchedProfile ?? localProfile ?? null;
  }, [id, localProfile, userData]);

  const nomineeProfile = React.useMemo(() => {
    const users = extractUsers(userData);

    const fetchedProfile =
      users.find((user) => user?.id === id || user?._id === id) ?? null;

    return (fetchedProfile ?? localProfile)?.nomineeDetails?.[0] ?? null;
  }, [id, localProfile, userData]);
  const encryptedPanSource =
    typeof profile?.encryptedPanNumber === "string"
      ? profile.encryptedPanNumber
      : typeof profile?.panNumber === "string"
        ? profile.panNumber
        : null;

  const [displayPanNumber, setDisplayPanNumber] = React.useState("—");

  React.useEffect(() => {
    let cancelled = false;

    void resolvePanNumberDisplay(encryptedPanSource).then((value) => {
      if (!cancelled) setDisplayPanNumber(value);
    });

    return () => {
      cancelled = true;
    };
  }, [encryptedPanSource]);

  const documents: UserDocument[] = Array.isArray(profile?.documents)
    ? profile.documents
    : Array.isArray(profile?.kycDocuments)
      ? profile.kycDocuments
      : [];
  const canApproveKyc = documents.length > 0;
  const documentEntries = React.useMemo(() => getDocumentEntries(profile), [profile]);
  const kycValue = kycOverride ?? profile?.kycVerified ?? profile?.kycStatus ?? "pending";
  const isUserActive = isActiveOverride ?? profile?.isActive ?? true;

  const normalizedStatus = String(kycValue).toLowerCase();

  const isPending = normalizedStatus === "pending";
  const isApproved = normalizedStatus === "approved";
  const isRejected = normalizedStatus === "rejected";
  const isSuspended = normalizedStatus === "suspended";
  // const canShowBuyButton = readLoggedInUserEmail() === "team@gfolio.in";
  const currentHost = window.location.hostname;
  const loggedInEmail = readLoggedInUserEmail();
  const canShowBuyButton =
    ((currentHost === "dev.gfolio.in" || currentHost === "localhost") &&
      loggedInEmail === "admin@mailinator.com") ||
    (currentHost === "admin.gfolio.in" &&
      loggedInEmail === "team@gfolio.in");
  const canApprove = (isPending || isSuspended) && canApproveKyc;
  const canReject = isPending;
  const canSuspend = isApproved;
  const handleOpenDocumentGroup = (group: DocumentEntry) => {
    const images = getKycDocumentPreviewImages(group);
    if (images.length === 0) return;

    setPreviewImages(images);
    setPreviewLabel(formatDocumentGroupLabel(group.label));
  };
  const handleOpenDocument = (url: string | null, invoiceNumber?: string) => {
    if (!url) return;
    setPreviewImages([{ url, label: invoiceNumber ?? "Invoice" }]);
    setPreviewLabel(invoiceNumber ?? "Invoice");
  };
  const handleDownloadDocument = async (txn: UserTransaction) => {
    const success = await downloadInvoice(txn);
    if (!success) {
      toast({
        title: "Download failed",
        description: "Unable to download invoice.",
        variant: "destructive",
      });
    }
  };
  const resetBuyForm = () => {
    setBuyAmount("");
    setCashfreeOrderId("");
    setCashfreePaymentId("");
    setSelectedMetal("gold");
    setTransactionType("");
    setTransactionMode("");
    setBuyOtp("");
    setBuyOtpSent(false);
    setBuyOtpResendSeconds(0);
  };

  const handleBuyMetal = () => {
    resetBuyForm();
    setBuyOpen(true);
  };
  const handleOpenSell = () => {
    setSellMetalType("gold");
    setSellGrams("");
    setSellOtp("");
    setSellOtpSent(false);
    setSellOtpResendSeconds(0);
    setSellOpen(true);
  };
  const handleSendSellOtp = async () => {
    if (!sellGrams.trim()) return;

    const grams = Number(Number(sellGrams).toFixed(4));
    if (!Number.isFinite(grams) || grams <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid grams",
        description: "Enter a valid amount in grams.",
      });
      return;
    }

    try {
      await sendSellOtp();
      setSellOtp("");
      setSellOtpSent(true);
      setSellOtpResendSeconds(OTP_RESEND_COOLDOWN_SECONDS);
      toast({ title: "OTP sent", description: "Enter the OTP to confirm the sell." });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "OTP failed",
        description: error instanceof Error ? error.message : "Failed to send OTP.",
      });
    }
  };
  const handleVerifySellOtp = async () => {
    if (!id || !sellOtp.trim() || !sellGrams.trim()) return;

    const grams = Number(Number(sellGrams).toFixed(4));
    if (!Number.isFinite(grams) || grams <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid grams",
        description: "Enter a valid amount in grams.",
      });
      return;
    }

    try {
      await verifySellOtp({
        otp: sellOtp.trim(),
        targetUserId: id,
        grams,
        metalType: sellMetalType.toUpperCase(),
      });
      setSellOpen(false);
      setSellGrams("");
      setSellOtp("");
      setSellOtpSent(false);
      setSellOtpResendSeconds(0);
      void refetchWalletInfo();
      toast({ title: "Success", description: "Metal sold successfully." });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Verification failed",
        description: error instanceof Error ? error.message : "Failed to verify OTP or sell metal.",
      });
    }
  };
  const navigateToHoldings = React.useCallback(() => {
    if (!id) return;
    navigate(`/holdings?userId=${encodeURIComponent(id)}`);
  }, [id, navigate]);
  const navigateToNotifications = React.useCallback(() => {
    if (!id || typeof window === "undefined") return;

    window.sessionStorage.setItem(NOTIFICATION_RECIPIENTS_STORAGE_KEY, JSON.stringify([id]));
    window.sessionStorage.setItem(
      NOTIFICATION_RETURN_PATH_STORAGE_KEY,
      `/users/${encodeURIComponent(id)}`,
    );
    navigate("/notifications/create");
  }, [id, navigate]);
  const requiresCashfreeIds =
    transactionMode === "ONLINE" &&
    (transactionType === "BUY" || transactionType === "MANUAL_SIP");

  const buildBuyMetalPayload = (): Record<string, unknown> | null => {
    const isOnlineMode = transactionMode === "ONLINE";
    const trimmedOrderId = cashfreeOrderId.trim();
    const trimmedPaymentId = cashfreePaymentId.trim();

    if (
      !selectedMetal ||
      !buyAmount ||
      !transactionMode ||
      (requiresCashfreeIds && (!trimmedOrderId || !trimmedPaymentId)) ||
      !id
    ) {
      return null;
    }

    const payload: Record<string, unknown> = {
      amount: buyAmount.replace(/,/g, ""),
      metalType: selectedMetal.toUpperCase(),
      user: id,
      transactionType: transactionType || null,
      transactionMode,
      isAudit: false,
    };

    if (isOnlineMode) {
      payload.cashfreeOrderId = trimmedOrderId || null;
      payload.cashfreePaymentId = trimmedPaymentId || null;
    }

    return payload;
  };

  const handleSendBuyOtp = async () => {
    if (!buildBuyMetalPayload()) return;

    try {
      await sendBuyOtp();
      setBuyOtp("");
      setBuyOtpSent(true);
      setBuyOtpResendSeconds(OTP_RESEND_COOLDOWN_SECONDS);
      toast({ title: "OTP sent", description: "Enter the OTP to confirm the buy." });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "OTP failed",
        description: error instanceof Error ? error.message : "Failed to send OTP.",
      });
    }
  };

  const handleVerifyBuyOtp = async () => {
    if (!buyOtp.trim()) return;

    const payload = buildBuyMetalPayload();
    if (!payload) return;

    try {
      const res = await verifyBuyOtp({ otp: buyOtp.trim(), payload });
      setBuyOpen(false);
      resetBuyForm();
      void refetchWalletInfo();
      toast({
        title: "Success",
        description: res?.message || "Metal purchased successfully",
      });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Verification failed",
        description: error instanceof Error ? error.message : "Failed to verify OTP or purchase metal",
      });
    }
  };

  const handleKycAction = (kycStatus: "approved" | "rejected" | "suspended", comments = "") => {
    if (!id) return;

    setIsUpdatingKyc(true);
    void verifyKyc({ targetUserId: id, kycStatus, comments })
      .then((updatedProfile: unknown) => {
        setKycOverride(kycStatus);
        setLocalProfile((prev: any) => ({
          ...(prev ?? {}),
          ...(unwrapProfile(updatedProfile) ?? updatedProfile ?? {}),
          kycVerified: kycStatus,
          kycStatus,
        }));
      })
      .catch(() => {
        setKycOverride(kycStatus);
        setLocalProfile((prev: any) => ({
          ...prev,
          kycVerified: kycStatus,
          kycStatus,
        }));
      })
      .finally(() => {
        setIsUpdatingKyc(false);
      });
  };

  const handleActiveStatusToggle = (checked: boolean) => {
    if (!id || isUpdatingUserStatus) return;

    void updateUserStatus({ targetUserId: id, isActive: checked })
      .then((response) => {
        setIsActiveOverride(checked);
        setLocalProfile((prev: any) => ({
          ...(prev ?? {}),
          isActive: checked,
        }));
        toast({
          title: "Success",
          description: response?.message || `User ${checked ? "activated" : "deactivated"} successfully`,
        });
      })
      .catch((error: unknown) => {
        toast({
          variant: "destructive",
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to update account status",
        });
      });
  };

  return (
    <>
      <Layout title="User Profile">
        <div className="mb-6">
          <Link
            href={backUrl}
            className="inline-flex items-center text-sm text-primary hover:underline"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Link>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SummaryStatCard
              large
              metrics={[
                {
                  title: "Total Invested",
                  total: totalHoldings ? formatCurrency(totalInvested) : "—",
                },
                {
                  title: "Current Value",
                  total: totalHoldings ? formatCurrency(totalCurrentValue) : "—",
                },
              ]}
              isLoading={isWalletLoading}
              onClick={navigateToHoldings}
            />
            <SummaryStatCard
              large
              metrics={[
                {
                  title: "Total Gold",
                  total:
                    totalHoldings?.gold?.totalGrams !== undefined
                      ? formatHoldingsGrams(totalHoldings.gold.totalGrams)
                      : "—",
                },
                {
                  title: "Total Silver",
                  total:
                    totalHoldings?.silver?.totalGrams !== undefined
                      ? formatHoldingsGrams(totalHoldings.silver.totalGrams)
                      : "—",
                },
              ]}
              isLoading={isWalletLoading}
              onClick={navigateToHoldings}
              threeColumn
              actions={
                isApproved && canShowBuyButton ? (
                  <>
              <Button size="sm" className="h-10 px-6 text-base cursor-pointer" onClick={handleBuyMetal}>
                Buy
              </Button>
              <Button size="sm"
                      variant="outline"
                      className="h-10 px-6 text-base cursor-pointer"
                      onClick={handleOpenSell}
                    >
                      Sell
                    </Button>
                  </>
                ) : null
              }
            />
          </div>

          <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-3">
            <Card className="h-full">
              <CardContent className="p-6 text-center pt-8">
                <div className="w-24 h-24 mx-auto rounded-full bg-primary/20 flex items-center justify-center text-primary text-3xl font-bold mb-4">
                  {String(profile?.name ?? "?").charAt(0).toUpperCase()}
                </div>
                <h2 className="text-xl font-bold text-foreground">{profile?.name ?? "Unknown User"}</h2>
                <p className="text-muted-foreground capitalize mb-4">
                  {profile?.role ? `${profile.role} Account` : "Account"}
                </p>
                <Badge
                  variant={kycBadgeVariant(kycValue)}
                  className={`px-4 py-1 text-sm ${String(kycValue).toLowerCase() === "suspended"
                    ? "border-gray-300 bg-gray-100 text-gray-700"
                    : ""
                    }`}
                >
                  KYC {String(kycValue).toUpperCase()}
                </Badge>
                <div className="mt-4 flex items-center justify-center gap-3">
                  <span className="text-sm text-muted-foreground">Account</span>
                  <Switch
                    checked={isUserActive}
                    onCheckedChange={handleActiveStatusToggle}
                    disabled={isUpdatingUserStatus}
                    aria-label="Toggle user active status"
                  />
                  <Badge variant={isUserActive ? "success" : "destructive"} className="px-3 py-0.5 text-xs">
                    {isUserActive ? "ACTIVE" : "INACTIVE"}
                  </Badge>
                </div>

                {documentEntries.length > 0 ? (
                  <div className="mt-auto space-y-4 pt-5">
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {documentEntries.map((document) => (
                        <Button
                          key={document.id}
                          variant="outline"
                          size="sm"
                          className="cursor-pointer bg-muted capitalize"
                          disabled={document.sides.length === 0}
                          onClick={() => handleOpenDocumentGroup(document)}
                        >
                          {document.label}
                        </Button>
                      ))}
                    </div>

                    {canApprove || canReject ? (
                      <div className="flex gap-2">
                        {canApprove ? (
                          <Button
                            className="h-10 flex-1 cursor-pointer bg-emerald-500 text-foreground shadow-emerald-500/20 hover:bg-emerald-600"
                            onClick={() => handleKycAction("approved")}
                            disabled={isUpdatingKyc || !canApproveKyc}
                          >
                            <CheckCircle className="mr-2 h-4 w-4" />
                            {isSuspended ? "Unsuspend" : "Approve"}
                          </Button>
                        ) : null}
                        {canReject ? (
                          <Button
                            variant="destructive"
                            className="h-10 flex-1 cursor-pointer"
                            onClick={() => {
                              setActionType("rejected");
                              setRejectOpen(true);
                            }}
                            disabled={isUpdatingKyc}
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Reject
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {isWalletLoading ? (
              <Card className="h-full border-border bg-white lg:col-span-2">
                <CardContent className="flex h-full items-center justify-center py-12 text-center text-sm text-black/60">
                  Loading holdings...
                </CardContent>
              </Card>
            ) : !holdings ? (
              <Card className="h-full border-border bg-white lg:col-span-2">
                <CardContent className="flex h-full items-center justify-center py-12 text-center text-sm text-black/60">
                  No holdings data available.
                </CardContent>
              </Card>
            ) : (
              USER_DETAIL_FOLIO_SECTIONS.map(({ key, label }) => (
                <FolioHoldingsCard
                  key={key}
                  label={label}
                  folio={getFolioHoldings(holdings, key)}
                  onClick={navigateToHoldings}
                />
              ))
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 items-stretch gap-6 lg:grid-cols-3">
          <Card className="h-full">
            <Tabs defaultValue="contact" className="flex h-full w-full flex-col p-3">
              <TabsList className="grid w-full grid-cols-2 rounded-t-lg">
                <TabsTrigger value="contact" className="text-sm font-medium">
                  Contact Information
                </TabsTrigger>
                <TabsTrigger value="nominee" className="text-sm font-medium">
                  Nominee Details
                </TabsTrigger>
              </TabsList>
              <TabsContent value="contact" className="m-0 flex-1">
                <CardContent className="space-y-5 p-6">
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <span className="break-all">{profile?.email ?? "—"}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Phone className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <span>{profile?.phone ?? "—"}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <span>{formatDate(profile?.dob)}</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
                    <span>
                      {[
                        profile?.address,
                        profile?.city,
                        profile?.state,
                        profile?.pincode,
                        profile?.country,
                      ]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <IdCard className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <span>{displayPanNumber}</span>
                  </div>
                </CardContent>
              </TabsContent>
              <TabsContent value="nominee" className="m-0 flex-1">
                <CardContent className="space-y-5 p-6">
                  <div className="flex items-center gap-3">
                    <User className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <span>{nomineeProfile?.name ?? "—"}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Phone className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <span>{nomineeProfile?.phone ?? "—"}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <span>{formatDate(nomineeProfile?.dateOfBirth)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Users2 className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <span>{nomineeProfile?.relationship ?? "—"}</span>
                  </div>
                </CardContent>
              </TabsContent>
            </Tabs>
          </Card>

          <div className="relative min-h-[20rem] lg:col-span-2 lg:min-h-0">
            <div className="flex h-full flex-col gap-3 rounded-xl border border-border bg-white p-4 lg:absolute lg:inset-0">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-black">Master SIPs</p>
                  {!isWalletLoading ? (
                    <p className="mt-0.5 text-xs text-black/55">
                      {totalSipsCount} total · {activeSipsCount} active
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={sipMetalFilter} onValueChange={setSipMetalFilter}>
                    <SelectTrigger className="h-8 w-[8.5rem] rounded-lg text-xs">
                      <SelectValue placeholder="Metal" />
                    </SelectTrigger>
                    <SelectContent>
                      {SIP_METAL_FILTER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={sipStatusFilter} onValueChange={setSipStatusFilter}>
                    <SelectTrigger className="h-8 w-[9.5rem] rounded-lg text-xs">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {SIP_STATUS_FILTER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {isWalletLoading ? (
                  <div className="flex h-full items-center justify-center py-8 text-sm text-black/60">
                    Loading SIPs...
                  </div>
                ) : sips.length === 0 ? (
                  <div className="flex h-full items-center justify-center py-8 text-sm text-black/60">
                    No SIPs found for this user.
                  </div>
                ) : filteredSips.length === 0 ? (
                  <div className="flex h-full items-center justify-center py-8 text-sm text-black/60">
                    No SIPs match the selected filters.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 items-stretch gap-2.5 sm:grid-cols-2">
                    {filteredSips.map((sip) => (
                      <UserSipCard key={sip.id} sip={sip} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {isTransactionsLoading ||
        isTransactionsError ||
        userTransactions.length > 0 ||
        isWalletLoading ||
        sips.length > 0 ? (
          <div className="mt-6 space-y-4">
            <Tabs defaultValue="transactions" className="w-full">
              <TabsList className="h-9 w-full justify-start rounded-lg sm:w-auto">
                <TabsTrigger value="transactions" className="px-4 text-sm">
                  Transactions
                </TabsTrigger>
                <TabsTrigger value="sips" className="px-4 text-sm">
                  SIPs
                  {!isWalletLoading ? (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      ({totalSipsCount})
                    </span>
                  ) : null}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="transactions" className="mt-4">
                <Card className="flex min-h-0 flex-col overflow-hidden">
                  <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border p-4">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Transactions</p>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
                      <div className="relative w-full sm:w-72">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={searchTerm}
                          onChange={(event) => setSearchTerm(event.target.value)}
                          placeholder="Search transactions..."
                          className="pl-10"
                          aria-label="Search transactions"
                        />
                      </div>
                      <DateRangePicker value={dateRange} onChange={setDateRange} />
                    </div>
                  </div>
                  <div className="max-h-[min(32rem,60vh)] min-h-0 flex-1 overflow-auto">
                    {isTransactionsLoading ? (
                      <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                        Loading transactions...
                      </p>
                    ) : isTransactionsError ? (
                      <p className="px-4 py-10 text-center text-sm text-destructive">
                        Failed to load transactions.
                      </p>
                    ) : (
                      <table className="w-full min-w-[1080px] text-left text-sm text-foreground">
                        <thead className="table-head-sticky">
                          <tr>
                            <th className="w-[190px] px-3 py-3 font-medium">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleSort("transaction")}
                                  className={getSortToggleClass(sortKey === "transaction")}
                                >
                                  Transaction Content{" "}
                                  <SortDirectionIcon
                                    active={sortKey === "transaction"}
                                    direction={sortDirection}
                                  />
                                </button>
                                <TableHeaderFilter
                                  title="Order type"
                                  value={txnDirectionFilter}
                                  onChange={handleOrderTypeFilterChange}
                                  options={[...ORDER_TYPE_FILTER_OPTIONS]}
                                  activeWhen={(value) => value !== "all"}
                                  clearValue="all"
                                />
                              </div>
                            </th>
                            <th className="w-[170px] whitespace-nowrap px-4 py-3 align-middle font-medium">
                              <div className="inline-flex items-center gap-1 whitespace-nowrap">
                                <span className="shrink-0">Transaction Type</span>
                                <TableHeaderFilter
                                  title="Transaction type"
                                  value={transactionTypeFilter}
                                  onChange={handleTransactionTypeFilterChange}
                                  options={TRANSACTION_TYPE_FILTER_OPTIONS}
                                  activeWhen={(value) => value !== "all"}
                                  clearValue="all"
                                />
                              </div>
                            </th>
                            <th className="w-[120px] px-4 py-3 font-medium">
                              <button
                                type="button"
                                onClick={() => handleSort("invoice")}
                                className={getSortToggleClass(sortKey === "invoice")}
                              >
                                Invoice{" "}
                                <SortDirectionIcon active={sortKey === "invoice"} direction={sortDirection} />
                              </button>
                            </th>
                            <th className="w-[140px] px-4 py-3 font-medium">
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
                                  value={metalTypeFilter}
                                  onChange={handleMetalFilterChange}
                                  options={metalHeaderFilterOptions}
                                  activeWhen={(value) => value !== "all"}
                                  clearValue="all"
                                />
                              </div>
                            </th>
                            <th className="w-[140px] px-4 py-3 font-medium">
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
                                  value={paymentMethodFilter}
                                  onChange={handlePaymentMethodFilterChange}
                                  options={paymentMethodHeaderFilterOptions}
                                  activeWhen={(value) => value !== "all"}
                                  clearValue="all"
                                />
                              </div>
                            </th>
                            <th className="w-[120px] px-4 py-3 font-medium">
                              <button
                                type="button"
                                onClick={() => handleSort("weight")}
                                className={getSortToggleClass(sortKey === "weight")}
                              >
                                Weight{" "}
                                <SortDirectionIcon active={sortKey === "weight"} direction={sortDirection} />
                              </button>
                            </th>
                            <th className="w-[120px] px-4 py-3 font-medium">
                              <button
                                type="button"
                                onClick={() => handleSort("amount")}
                                className={getSortToggleClass(sortKey === "amount")}
                              >
                                Amount{" "}
                                <SortDirectionIcon active={sortKey === "amount"} direction={sortDirection} />
                              </button>
                            </th>
                            <th className="w-[130px] px-4 py-3 font-medium">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleSort("status")}
                                  className={getSortToggleClass(sortKey === "status")}
                                >
                                  Status{" "}
                                  <SortDirectionIcon active={sortKey === "status"} direction={sortDirection} />
                                </button>
                                <TableHeaderFilter
                                  title="Status"
                                  value={statusFilter}
                                  onChange={handleStatusFilterChange}
                                  options={[...STATUS_FILTER_OPTIONS]}
                                  activeWhen={(value) => value !== "all"}
                                  clearValue="all"
                                  align="end"
                                  scrollable
                                />
                              </div>
                            </th>
                            <th className="w-[160px] px-4 py-3 font-medium">
                              <button
                                type="button"
                                onClick={() => handleSort("date")}
                                className={getSortToggleClass(sortKey === "date")}
                              >
                                Date & Time{" "}
                                <SortDirectionIcon active={sortKey === "date"} direction={sortDirection} />
                              </button>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedUserTransactions.length === 0 ? (
                            <tr>
                              <td
                                colSpan={9}
                                className="px-4 py-10 text-center text-sm text-muted-foreground"
                              >
                                No transactions found.
                              </td>
                            </tr>
                          ) : (
                            transactionPagination.pagedItems.map((txn) => {
                              const transactionId =
                                txn.razorpayPaymentId ?? txn.merchantTransactionId ?? txn.id;

                              return (
                                <tr
                                  key={`${txn.id}-${txn.createdAt ?? txn.executedAt ?? ""}`}
                                  className="border-b border-border transition-colors hover:bg-muted"
                                >
                                  <td className="w-[170px] px-3 py-3">
                                    <p
                                      className="max-w-[140px] truncate font-mono text-sm text-muted-foreground"
                                      title={transactionId}
                                    >
                                      {transactionId}
                                    </p>
                                  </td>
                                  <td className="whitespace-nowrap px-4 py-3 align-middle text-sm text-muted-foreground">
                                    {formatTransactionTypeDisplay(
                                      txn.transactionType ?? txn.type,
                                      txn.frequency,
                                    )}
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-1.5">
                                      <p
                                        className="max-w-[90px] truncate font-mono text-sm text-muted-foreground"
                                        title={txn.invoiceNumber}
                                      >
                                        {txn.invoiceNumber}
                                      </p>
                                      {txn.invoiceUrl ? (
                                        <>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                                            onClick={() =>
                                              handleOpenDocument(txn.invoiceUrl ?? null, txn.invoiceNumber)
                                            }
                                            aria-label={`Preview invoice ${txn.invoiceNumber ?? txn.id}`}
                                          >
                                            <Eye className="h-3.5 w-3.5" />
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                                            onClick={() => void handleDownloadDocument(txn)}
                                            aria-label={`Download invoice ${txn.invoiceNumber ?? txn.id}`}
                                          >
                                            <Download className="h-3.5 w-3.5" />
                                          </Button>
                                        </>
                                      ) : null}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <p className="font-mono text-sm text-muted-foreground">
                                      {txn.metalType ?? "-"}
                                    </p>
                                  </td>
                                  <td className="px-4 py-3">
                                    <p className="font-mono text-sm text-muted-foreground">
                                      {formatPaymentMethodLabel(txn.paymentMethod)}
                                    </p>
                                  </td>
                                  <td className="px-4 py-3">
                                    <p className="font-mono text-sm text-muted-foreground">
                                      {formatMetalWeightInGrams(txn.metalWeightInGrams)}
                                    </p>
                                  </td>
                                  <td className="px-4 py-3">
                                    <p className="font-bold text-foreground">
                                      {typeof txn.amount === "number" ? formatCurrency(txn.amount) : "-"}
                                    </p>
                                  </td>
                                  <td className="px-4 py-3">
                                    <Badge
                                      variant={transactionStatusBadgeVariant(txn.status)}
                                      className="capitalize"
                                    >
                                      {String(txn.status ?? "unknown").toUpperCase()}
                                    </Badge>
                                    {txn.failureReason ? (
                                      <p
                                        className="mt-1 max-w-[150px] truncate text-sm text-destructive"
                                        title={txn.failureReason}
                                      >
                                        {txn.failureReason}
                                      </p>
                                    ) : null}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-muted-foreground">
                                    <p>{formatTransactionDateTime(txn.createdAt ?? txn.executedAt)}</p>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    )}
                  </div>
                  {sortedUserTransactions.length > 0 ? (
                    <TablePaginationFooter {...bindTablePaginationFooter(transactionPagination)} />
                  ) : null}
                </Card>
              </TabsContent>

              <TabsContent value="sips" className="mt-4">
                <Card className="flex min-h-0 flex-col overflow-hidden">
                  <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border p-4">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Master SIPs</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {totalSipsCount} total · {activeSipsCount} active
                        {hasActiveSipFilters ? ` · ${filteredSips.length} shown` : ""}
                      </p>
                    </div>
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={sipSearchTerm}
                        onChange={(event) => setSipSearchTerm(event.target.value)}
                        placeholder="Search master SIPs…"
                        className="pl-10"
                        aria-label="Search SIPs"
                      />
                    </div>
                  </div>
                  <div className="max-h-[min(32rem,60vh)] min-h-0 flex-1 overflow-auto">
                    {isWalletLoading ? (
                      <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                        Loading SIPs...
                      </p>
                    ) : sips.length === 0 ? (
                      <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                        No SIPs found for this user.
                      </p>
                    ) : (
                      <table className="w-full min-w-[980px] text-left text-sm text-foreground">
                        <thead className="table-head-sticky">
                          <tr>
                            <th className="w-[20px] px-4 py-3 font-medium"> </th>
                            <th className="px-4 py-3 font-medium">
                              <div className="flex items-center gap-1">
                                Metal
                                <TableHeaderFilter
                                  title="Metal"
                                  value={sipMetalFilter}
                                  onChange={setSipMetalFilter}
                                  options={[...SIP_METAL_FILTER_OPTIONS]}
                                  activeWhen={(value) => value !== "all"}
                                  clearValue="all"
                                />
                              </div>
                            </th>
                            <th className="px-4 py-3 font-medium">
                              <div className="flex items-center gap-1">
                                Type
                                <TableHeaderFilter
                                  title="Type"
                                  value={sipTypeFilter}
                                  onChange={setSipTypeFilter}
                                  options={[...SIP_TYPE_FILTER_OPTIONS]}
                                  activeWhen={(value) => value !== "all"}
                                  clearValue="all"
                                />
                              </div>
                            </th>
                            <th className="px-4 py-3 font-medium">
                              <div className="flex items-center gap-1">
                                Frequency
                                <TableHeaderFilter
                                  title="Frequency"
                                  value={sipFrequencyFilter}
                                  onChange={setSipFrequencyFilter}
                                  options={sipFrequencyFilterOptions}
                                  activeWhen={(value) => value !== "all"}
                                  clearValue="all"
                                />
                              </div>
                            </th>
                            <th className="px-4 py-3 font-medium">
                              <div className="flex items-center gap-1">
                                Status
                                <TableHeaderFilter
                                  title="Status"
                                  value={sipStatusFilter}
                                  onChange={setSipStatusFilter}
                                  options={[...SIP_STATUS_FILTER_OPTIONS]}
                                  activeWhen={(value) => value !== "all"}
                                  clearValue="all"
                                  scrollable
                                />
                              </div>
                            </th>
                            <th className="px-4 py-3 font-medium">
                              <button
                                type="button"
                                onClick={() => handleSipSort("amount")}
                                className={getSortToggleClass(sipSortKey === "amount")}
                              >
                                Amount{" "}
                                <SortDirectionIcon
                                  active={sipSortKey === "amount"}
                                  direction={sipSortDirection}
                                />
                              </button>
                            </th>
                            <th className="px-4 py-3 font-medium">
                              <button
                                type="button"
                                onClick={() => handleSipSort("completed")}
                                className={getSortToggleClass(sipSortKey === "completed")}
                              >
                                Completed{" "}
                                <SortDirectionIcon
                                  active={sipSortKey === "completed"}
                                  direction={sipSortDirection}
                                />
                              </button>
                            </th>
                            <th className="px-4 py-3 font-medium">
                              <button
                                type="button"
                                onClick={() => handleSipSort("missed")}
                                className={getSortToggleClass(sipSortKey === "missed")}
                              >
                                Missed{" "}
                                <SortDirectionIcon
                                  active={sipSortKey === "missed"}
                                  direction={sipSortDirection}
                                />
                              </button>
                            </th>
                            <th className="px-4 py-3 font-medium">
                              <button
                                type="button"
                                onClick={() => handleSipSort("installments")}
                                className={getSortToggleClass(sipSortKey === "installments")}
                              >
                                Installments{" "}
                                <SortDirectionIcon
                                  active={sipSortKey === "installments"}
                                  direction={sipSortDirection}
                                />
                              </button>
                            </th>
                            {/* <th className="px-4 py-3 font-medium">Next SIP</th> */}
                            <th className="px-4 py-3 font-medium">
                              <button
                                type="button"
                                onClick={() => handleSipSort("createdDate")}
                                className={getSortToggleClass(sipSortKey === "createdDate")}
                              >
                                Created Date{" "}
                                <SortDirectionIcon
                                  active={sipSortKey === "createdDate"}
                                  direction={sipSortDirection}
                                />
                              </button>
                            </th>
                            <th className="px-4 py-3 font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredSips.length === 0 ? (
                            <tr>
                              <td
                                colSpan={11}
                                className="px-4 py-10 text-center text-sm text-muted-foreground"
                              >
                                No SIPs match the selected filters.
                              </td>
                            </tr>
                          ) : (
                            sipPagination.pagedItems
                              .filter(
                                (sip) =>
                                  expandedSipId === null || expandedSipId === sip.id,
                              )
                              .map((sip) => {
                              const isSilver = isSilverMetal(sip.metalType);
                              const installmentCount = sip.sipManagers?.length ?? 0;
                              const typeLabel = (
                                sip.sipType ||
                                (String(sip.type ?? "").toUpperCase() === "MANUAL"
                                  ? "Manual"
                                  : "Auto")
                              ).replace(/\s*SIP$/i, "");
                              const isExpanded = expandedSipId === sip.id;

                              return (
                                <React.Fragment key={sip.id}>
                                  <tr
                                    tabIndex={0}
                                    role="row"
                                    onClick={() => toggleSipRowExpand(sip)}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        toggleSipRowExpand(sip);
                                      }
                                    }}
                                    className={cn(
                                      "cursor-pointer border-b border-border transition-colors hover:bg-muted",
                                      isExpanded && "bg-muted/40",
                                    )}
                                  >
                                    <td
                                      className="w-[20px]"
                                      onClick={(event) => event.stopPropagation()}
                                    >
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 shrink-0"
                                        aria-expanded={isExpanded}
                                        aria-label={
                                          isExpanded
                                            ? "Collapse installments"
                                            : "Expand installments"
                                        }
                                        onClick={() => toggleSipRowExpand(sip)}
                                      >
                                        {isExpanded ? (
                                          <ChevronDown className="h-4 w-4" />
                                        ) : (
                                          <ChevronRight className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-2">
                                        <img
                                          src={isSilver ? silverImage : goldImage}
                                          alt=""
                                          className="h-4 w-4 object-contain"
                                          aria-hidden
                                        />
                                        <span className="font-medium text-foreground">
                                          {isSilver ? "Silver" : "Gold"}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-muted-foreground">
                                      {typeLabel || "-"}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-muted-foreground">
                                      {toTitleCaseLabel(sip.frequency)}
                                    </td>
                                    <td className="px-4 py-3">
                                      <span
                                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${sipStatusBadgeClass(sip.status)}`}
                                      >
                                        {formatSipStatusLabel(sip.status)}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm font-bold text-foreground">
                                      {formatSipAmount(sip.sipAmount)}
                                    </td>
                                    <td className="px-4 py-3 text-sm tabular-nums text-muted-foreground">
                                      {Number(sip.completedInstallments ?? 0)}
                                    </td>
                                    <td
                                      className={cn(
                                        "px-4 py-3 text-sm tabular-nums",
                                        Number(sip.missedInstallments ?? 0) > 0
                                          ? "text-destructive"
                                          : "text-muted-foreground",
                                      )}
                                    >
                                      {Number(sip.missedInstallments ?? 0)}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-muted-foreground">
                                      {installmentCount}
                                    </td>
                                    {/* <td className="px-4 py-3 text-sm text-muted-foreground">
                                      {formatSipNextDate(sip.nextExecutionDate)}
                                    </td> */}
                                    <td className="px-4 py-3 text-sm text-muted-foreground">
                                      {formatSipNextDate(sip.createdAt)}
                                    </td>
                                    <td
                                      className="px-4 py-3"
                                      onClick={(event) => event.stopPropagation()}
                                    >
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 cursor-pointer"
                                            aria-label="Send notification to user"
                                            onClick={navigateToNotifications}
                                          >
                                            <Bell className="h-4 w-4" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Send notification to user</TooltipContent>
                                      </Tooltip>
                                    </td>
                                  </tr>
                                  {isExpanded ? (
                                    <tr className="border-b border-border bg-muted/30">
                                      <td colSpan={11} className="p-0">
                                        <div
                                          className="p-4"
                                          onClick={(event) => event.stopPropagation()}
                                        >
                                          <SipInstallmentsDetailTable
                                            installments={sip.sipManagers ?? []}
                                          />
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
                    )}
                  </div>
                  {filteredSips.length > 0 && expandedSipId === null ? (
                    <TablePaginationFooter {...bindTablePaginationFooter(sipPagination)} />
                  ) : null}
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        ) : null}

        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {actionType === "suspended" ? "Suspend KYC" : "Reject KYC"}
              </DialogTitle>
              <DialogDescription>
                Add a comment before {actionType === "suspended" ? "suspending" : "rejecting"} this user.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Textarea
                value={rejectComment}
                onChange={(event) => setRejectComment(event.target.value)}
                placeholder="Enter comment"
                className="min-h-[120px]"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setRejectOpen(false);
                  setRejectComment("");
                }}
                disabled={isUpdatingKyc}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (!actionType) return;

                  handleKycAction(actionType, rejectComment.trim());

                  setRejectOpen(false);
                  setRejectComment("");
                  setActionType(null);
                }}
                disabled={isUpdatingKyc}
              >
                {actionType === "suspended" ? "Suspend" : "Reject"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog
          open={sellOpen}
          onOpenChange={(open) => {
            setSellOpen(open);
            if (!open) {
              setSellGrams("");
              setSellOtp("");
              setSellOtpSent(false);
              setSellOtpResendSeconds(0);
            }
          }}
        >
          <DialogContent
            className="max-w-md gap-6 p-6 sm:p-8"
            onPointerDownOutside={(event) => event.preventDefault()}
          >
            <DialogHeader className="space-y-2 pr-6">
              <DialogTitle className="text-xl sm:text-2xl">Sell metal</DialogTitle>
            </DialogHeader>

            {!sellOtpSent ? (
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Metal Type</label>
                  <Select
                    value={sellMetalType}
                    onValueChange={(value) => setSellMetalType(value as "gold" | "silver")}
                  >
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Select metal type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gold">Gold</SelectItem>
                      <SelectItem value="silver">Silver</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Grams</label>
                  <Input
                    className="h-12"
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9.]*"
                    placeholder="Enter grams"
                    value={sellGrams}
                    onChange={(event) =>
                      setSellGrams(event.target.value.replace(/[^0-9.]/g, ""))
                    }
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
                  value={sellOtp}
                  onChange={(value) => setSellOtp(value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  disabled={isVerifyingSellOtp}
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
                    {sellOtpResendSeconds > 0
                      ? `Resend OTP in ${formatOtpCountdown(sellOtpResendSeconds)}`
                      : "Didn't receive the OTP?"}
                  </span>
                  {sellOtpResendSeconds === 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto p-0 cursor-pointer"
                      onClick={() => void handleSendSellOtp()}
                      disabled={isSendingSellOtp || isVerifyingSellOtp}
                    >
                      {isSendingSellOtp ? "Sending..." : "Resend OTP"}
                    </Button>
                  ) : null}
                </div>
              </div>
            )}

            <DialogFooter className="grid grid-cols-2 gap-3 sm:flex">
              <Button
                variant="outline"
                className="h-11 w-full sm:w-auto sm:min-w-28 cursor-pointer"
                onClick={() => setSellOpen(false)}
                disabled={isSendingSellOtp || isVerifyingSellOtp}
              >
                Cancel
              </Button>
              {!sellOtpSent ? (
                <Button
                  className="h-11 w-full sm:min-w-32"
                  onClick={() => void handleSendSellOtp()}
                  disabled={!sellGrams || isSendingSellOtp}
                >
                  {isSendingSellOtp ? "Sending OTP..." : "Sell Metal"}
                </Button>
              ) : (
                <Button
                  className="h-11 w-full sm:min-w-32"
                  onClick={() => void handleVerifySellOtp()}
                  disabled={sellOtp.length !== 6 || isVerifyingSellOtp}
                >
                  {isVerifyingSellOtp ? "Verifying..." : "Verify OTP"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={buyOpen}
          onOpenChange={(open) => {
            setBuyOpen(open);
            if (!open) resetBuyForm();
          }}
        >
          <DialogContent onPointerDownOutside={(event) => event.preventDefault()}>
            <DialogHeader>
              <DialogTitle>Buy Metal</DialogTitle>
              <DialogDescription>
                {buyOtpSent
                  ? "Enter the OTP to confirm the purchase."
                  : "Select the metal and enter the details to buy."}
              </DialogDescription>
            </DialogHeader>

            {!buyOtpSent ? (
              <>
            <div className="space-y-2">
              <label className="text-sm font-medium">Metal Type</label>
              <Select
                value={selectedMetal ?? ""}
                onValueChange={(value) => setSelectedMetal(value as "gold" | "silver")}
              >
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Select metal type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gold">Gold</SelectItem>
                  <SelectItem value="silver">Silver</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Transaction Mode</label>
              <Select
                value={transactionMode}
                onValueChange={(value) => {
                  setTransactionMode(value);
                  if (value === "CASH") {
                    setCashfreeOrderId("");
                    setCashfreePaymentId("");
                  }
                }}
              >
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  {TRANSACTION_MODE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Transaction Type</label>
              <Select value={transactionType} onValueChange={setTransactionType}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {BUY_TRANSACTION_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>



            {/* Amount */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Amount
              </label>

              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  ₹
                </span>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="Enter amount"
                  value={formatAmount(buyAmount)}
                  className="h-12 pl-8"
                  onChange={(e) => setBuyAmount(formatAmount(e.target.value))}
                />
              </div>
            </div>

            {transactionMode === "ONLINE" ? (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Cashfree Order ID{requiresCashfreeIds ? " *" : ""}
                  </label>

                  <Input
                    type="text"
                    placeholder="Enter Cashfree Order ID"
                    value={cashfreeOrderId}
                    className="h-12"
                    onChange={(e) => setCashfreeOrderId(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Cashfree Payment ID{requiresCashfreeIds ? " *" : ""}
                  </label>

                  <Input
                    type="text"
                    placeholder="Enter Cashfree Payment ID"
                    value={cashfreePaymentId}
                    className="h-12"
                    onChange={(e) => setCashfreePaymentId(e.target.value)}
                  />
                </div>
              </>
            ) : null}
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
                      className="h-auto p-0 cursor-pointer"
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
                onClick={() => {
                  setBuyOpen(false);
                  resetBuyForm();
                }}
                disabled={isSendingBuyOtp || isVerifyingBuyOtp}
              >
                Cancel
              </Button>

              {!buyOtpSent ? (
                <Button
                  onClick={() => void handleSendBuyOtp()}
                  disabled={
                    !selectedMetal ||
                    !buyAmount ||
                    !transactionMode ||
                    (requiresCashfreeIds &&
                      (!cashfreeOrderId.trim() || !cashfreePaymentId.trim())) ||
                    isSendingBuyOtp
                  }
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
      </Layout>
      <ImagePreviewModal
        images={previewImages}
        label={previewLabel}
        onClose={() => {
          setPreviewImages([]);
          setPreviewLabel(undefined);
        }}
      />
    </>
  );
}
