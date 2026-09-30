import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Search, DownloadCloud, Eye } from "lucide-react";
import { exportToExcel } from "@/lib/export-to-excel";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableHeaderFilter } from "@/components/table-header-filter";
import ImagePreviewModal from "@/components/ui/ImagePreviewModal";
import { getSortToggleClass, SortDirectionIcon, useTableSort } from "@/lib/table-sort";
import { customFetch } from "@/lib/custom-fetch";
import { buildAuthApiUrl, buildAssetApiUrl } from "@/lib/api-config";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";
import { TablePaginationFooter } from "@/components/table-pagination-footer";
import { bindTablePaginationFooter, useTablePagination } from "@/lib/table-pagination";
import { usePersistedSearchTerm, createPersistedSearchTermKey } from "@/lib/persisted-page-filters";

const PAGE_TABS = ["Offer Users", "Influencers"] as const;
type PageTab = (typeof PAGE_TABS)[number];

const INFLUENCERS_TAB_PARAM = "influencers";

function getInitialOfferUsersTab(): PageTab {
  if (typeof window === "undefined") return "Offer Users";

  const tab = new URLSearchParams(window.location.search).get("tab");
  if (tab === INFLUENCERS_TAB_PARAM || tab === "Influencers") return "Influencers";
  return "Offer Users";
}

function syncOfferUsersTabToUrl(tab: PageTab) {
  if (typeof window === "undefined") return;

  const params = new URLSearchParams(window.location.search);
  if (tab === "Influencers") {
    params.set("tab", INFLUENCERS_TAB_PARAM);
  } else {
    params.delete("tab");
  }

  const query = params.toString();
  window.history.replaceState({}, "", query ? `?${query}` : window.location.pathname);
}

type OfferUser = {
  userId: string;
  name?: string;
  phone?: string;
  offerType?: string;
  offerUsedAt?: string;
  createdAt?: string;
  hasUsedOffer?: boolean;
};

type InfluencerReferral = {
  name: string;
  referralCode: string;
  transactionCount: number;
};

type InfluencerTransaction = {
  id: string;
  userId?: string;
  userName?: string;
  userPhone?: string;
  userEmail?: string;
  referredBy?: string;
  merchantTransactionId?: string;
  razorpayPaymentId?: string;
  externalPaymentId?: string;
  transactionType?: string;
  metalType?: string;
  amount?: number;
  status?: string;
  invoiceNumber?: string;
  invoiceUrl?: string;
  failureReason?: string;
  createdAt?: string;
  executedAt?: string;
};

type OfferUserSortKey = "name" | "phone" | "offerType" | "createdAt";
type InfluencerSortKey = "user" | "transaction" | "invoice" | "metal" | "amount" | "date";

const OFFER_TYPE_FILTER_OPTIONS = [
  { value: "all", label: "All offers" },
  { value: "FIRST_TRANSACTION", label: "First transaction" },
  { value: "ONE_PERCENT_OFFER", label: "One percent offer" },
  { value: "REFERRAL_BONUS", label: "Referral bonus" },
  { value: "SIP_OFFER", label: "SIP offer" },
] as const;

type OfferTypeFilter = (typeof OFFER_TYPE_FILTER_OPTIONS)[number]["value"];

const OFFER_USERS_ENDPOINT = buildAuthApiUrl("/admin/getFirstGoldOfferUsedUsers");
const OFFER_USERS_QUERY_KEY = [OFFER_USERS_ENDPOINT] as const;

const SELECTED_USER_STORAGE_KEY = "gfolio-admin:selected-user";

const exportTooltipClassName =
  "bg-gray-700 text-white text-xs px-3 py-2 rounded-md shadow-lg animate-in fade-in zoom-in-95 duration-200";


function storeSelectedOfferUser(user: OfferUser) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    SELECTED_USER_STORAGE_KEY,
    JSON.stringify({
      id: user.userId,
      name: user.name,
      phone: user.phone,
    }),
  );
}

function storeSelectedInfluencerUser(userId: string, user?: Pick<InfluencerTransaction, "userName" | "userPhone" | "userEmail">) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    SELECTED_USER_STORAGE_KEY,
    JSON.stringify({
      id: userId,
      name: user?.userName,
      phone: user?.userPhone,
      email: user?.userEmail,
    }),
  );
}

function normalizeSearchValue(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function resolveOfferType(record: Record<string, unknown>): string | undefined {
  if (typeof record.offerType === "string" && record.offerType.trim()) {
    return record.offerType.trim();
  }
  if (typeof record.offer === "string" && record.offer.trim()) {
    return record.offer.trim();
  }
  if (record.offer && typeof record.offer === "object") {
    const offer = record.offer as Record<string, unknown>;
    if (typeof offer.type === "string" && offer.type.trim()) return offer.type.trim();
    if (typeof offer.name === "string" && offer.name.trim()) return offer.name.trim();
  }
  return undefined;
}

/** Stable filter key — matches displayed uppercase offer labels. */
function getOfferTypeFilterKey(value?: string) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

function formatOfferTypeFilterLabel(key: string) {
  if (key === "all") return "All offers";
  return key.replace(/_/g, " ");
}

function formatTransactionType(type?: string) {
  return String(type ?? "-").replace(/_/g, " ").toUpperCase();
}

function unwrapPayload(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const record = data as Record<string, unknown>;
  return "data" in record ? record.data : data;
}

function normalizeOfferUser(value: unknown): OfferUser | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const userId = record.userId;
  if (typeof userId !== "string") return null;

  return {
    userId,
    name: typeof record.name === "string" ? record.name : undefined,
    phone: typeof record.phone === "string" ? record.phone : undefined,
    offerType: resolveOfferType(record),
    offerUsedAt: typeof record.offerUsedAt === "string" ? record.offerUsedAt : undefined,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : undefined,
    hasUsedOffer: typeof record.hasUsedOffer === "boolean" ? record.hasUsedOffer : undefined,
  };
}

function normalizeInfluencerReferral(value: unknown): InfluencerReferral | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const referralCode = typeof record.referralCode === "string" ? record.referralCode.trim() : "";
  if (!name || !referralCode) return null;
  return { name, referralCode,transactionCount: typeof record.transactionCount === "number" ? record.transactionCount : 0 };
}

function extractInfluencerReferrals(data: unknown): InfluencerReferral[] {
  const payload = unwrapPayload(data);
  if (!Array.isArray(payload)) return [];
  return payload
    .map(normalizeInfluencerReferral)
    .filter((item): item is InfluencerReferral => item !== null);
}

function normalizeInfluencerTransaction(value: unknown): InfluencerTransaction | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const rawId = record._id ?? record.id;
  if (typeof rawId !== "string") return null;

  const userRaw = record.userId;
  const user =
    userRaw && typeof userRaw === "object" ? (userRaw as Record<string, unknown>) : undefined;

  const amount =
    typeof record.totalAmount === "number"
      ? record.totalAmount
      : typeof record.totalPaidAmount === "number"
        ? record.totalPaidAmount
        : typeof record.investedAmount === "number"
          ? record.investedAmount
          : undefined;

  const userId =
    typeof userRaw === "string"
      ? userRaw
      : typeof user?._id === "string"
        ? user._id
        : typeof user?.id === "string"
          ? user.id
          : undefined;

  return {
    id: rawId,
    userId,
    userName: typeof user?.name === "string" ? user.name : undefined,
    userPhone: typeof user?.phone === "string" ? user.phone : undefined,
    userEmail: typeof user?.email === "string" ? user.email : undefined,
    referredBy: typeof user?.referredBy === "string" ? user.referredBy : undefined,
    merchantTransactionId:
      typeof record.merchantTransactionId === "string" ? record.merchantTransactionId : undefined,
    razorpayPaymentId:
      typeof record.razorpayPaymentId === "string" ? record.razorpayPaymentId : undefined,
    externalPaymentId:
      typeof record.externalPaymentId === "string" ? record.externalPaymentId : undefined,
    transactionType:
      typeof record.transactionType === "string"
        ? record.transactionType
        : typeof record.type === "string"
          ? record.type
          : undefined,
    metalType: typeof record.metalType === "string" ? record.metalType : undefined,
    amount,
    status: typeof record.status === "string" ? record.status : undefined,
    invoiceNumber: typeof record.invoiceNumber === "string" ? record.invoiceNumber : undefined,
    invoiceUrl: typeof record.invoiceUrl === "string" ? record.invoiceUrl : undefined,
    failureReason: typeof record.failureReason === "string" ? record.failureReason : undefined,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : undefined,
    executedAt: typeof record.executedAt === "string" ? record.executedAt : undefined,
  };
}

function extractInfluencerTransactions(data: unknown): InfluencerTransaction[] {
  const payload = unwrapPayload(data);
  if (!payload) return [];

  const list = Array.isArray(payload)
    ? payload
    : typeof payload === "object" && payload !== null
      ? (() => {
        const record = payload as Record<string, unknown>;
        if (Array.isArray(record.transactions)) return record.transactions;
        if (Array.isArray(record.data)) return record.data;
        return [payload];
      })()
      : [];

  return list
    .map(normalizeInfluencerTransaction)
    .filter((txn): txn is InfluencerTransaction => txn !== null);
}

async function fetchOfferUsers() {
  return customFetch<{ status?: boolean; count?: number; data?: unknown[] }>(OFFER_USERS_ENDPOINT, {
    method: "GET",
  });
}

async function fetchInfluencerReferrals() {
  return customFetch<unknown>(buildAssetApiUrl("/influencer/getReferralByName"), {
    method: "GET",
  });
}

async function fetchInfluencerTransactions(referralCode: string) {
  const params = new URLSearchParams({ referralCode: referralCode.trim() });
  return customFetch<unknown>(
    `${buildAssetApiUrl("/influencer/transactionSummary")}?${params.toString()}`,
    { method: "GET" },
  );
}

function matchesInfluencerSearch(txn: InfluencerTransaction, term: string) {
  if (!term) return true;
  return [
    txn.id,
    txn.userName,
    txn.userEmail,
    txn.referredBy,
    txn.merchantTransactionId,
    txn.razorpayPaymentId,
    txn.externalPaymentId,
    txn.transactionType,
    txn.metalType,
    txn.invoiceNumber,
    txn.status,
    String(txn.amount ?? ""),
  ]
    .map(normalizeSearchValue)
    .some((value) => value.includes(term));
}

export default function OfferUsersPage() {
  const [activeTab, setActiveTab] = React.useState<PageTab>(getInitialOfferUsersTab);

  const handleTabChange = React.useCallback((tab: PageTab) => {
    setActiveTab(tab);
    syncOfferUsersTabToUrl(tab);
  }, []);
  const [searchTerm, setSearchTerm] = usePersistedSearchTerm(createPersistedSearchTermKey("offer-users"));
  const [offerTypeFilter, setOfferTypeFilter] = React.useState<OfferTypeFilter>("all");
  const [influencerSearchTerm, setInfluencerSearchTerm] = usePersistedSearchTerm(createPersistedSearchTermKey("offer-users-influencers"));
  const [selectedReferralCode, setSelectedReferralCode] = React.useState("");
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [previewLabel, setPreviewLabel] = React.useState<string | undefined>(undefined);

  const { sortKey, sortDirection, directionFactor, handleSort } =
    useTableSort<OfferUserSortKey>();
  const {
    sortKey: influencerSortKey,
    sortDirection: influencerSortDirection,
    directionFactor: influencerDirectionFactor,
    handleSort: handleInfluencerSort,
  } = useTableSort<InfluencerSortKey>();

  const { data, isLoading, isError } = useQuery({
    queryKey: [...OFFER_USERS_QUERY_KEY],
    queryFn: fetchOfferUsers,
    enabled: activeTab === "Offer Users",
  });

  const {
    data: referralsData,
    isLoading: referralsLoading,
    isError: referralsError,
  } = useQuery({
    queryKey: ["influencer-referrals"],
    queryFn: fetchInfluencerReferrals,
    enabled: activeTab === "Influencers",
  });

  const influencerReferrals = React.useMemo(
    () => extractInfluencerReferrals(referralsData),
    [referralsData],
  );

  const selectedInfluencer = React.useMemo(
    () => influencerReferrals.find((item) => item.referralCode === selectedReferralCode),
    [influencerReferrals, selectedReferralCode],
  );

  React.useEffect(() => {
    if (activeTab !== "Influencers" || influencerReferrals.length === 0) return;
    const stillValid = influencerReferrals.some((item) => item.referralCode === selectedReferralCode);
    if (!stillValid) {
      setSelectedReferralCode(influencerReferrals[0].referralCode);
    }
  }, [activeTab, influencerReferrals, selectedReferralCode]);

  const {
    data: influencerData,
    isLoading: influencerLoading,
    isError: influencerError,
    refetch: refetchInfluencers,
  } = useQuery({
    queryKey: ["influencer-transaction-summary", selectedReferralCode],
    queryFn: () => fetchInfluencerTransactions(selectedReferralCode),
    enabled: activeTab === "Influencers" && selectedReferralCode.trim().length > 0,
  });

  const users = React.useMemo(() => {
    const payload = unwrapPayload(data);
    const items = Array.isArray(payload)
      ? payload
      : Array.isArray(data?.data)
        ? data.data
        : [];
    return items.map(normalizeOfferUser).filter((user): user is OfferUser => user !== null);
  }, [data]);

  const influencerTransactions = React.useMemo(
    () => extractInfluencerTransactions(influencerData),
    [influencerData],
  );

  const handleOfferTypeFilterChange = React.useCallback((value: string) => {
    setOfferTypeFilter(value as OfferTypeFilter);
  }, []);

const commission =
  ((unwrapPayload(influencerData) as any)?.commission as number) ?? 0;
  
  const filteredUsers = React.useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return users.filter((user) => {
      const matchesOfferType =
        offerTypeFilter === "all" || getOfferTypeFilterKey(user.offerType) === offerTypeFilter;
      if (!matchesOfferType) return false;

      if (!term) return true;

      const name = String(user.name ?? "").toLowerCase();
      const phone = String(user.phone ?? "").toLowerCase();
      const offerType = String(user.offerType ?? "").toLowerCase();
      const userId = user.userId.toLowerCase();
      return name.includes(term) || phone.includes(term) || offerType.includes(term) || userId.includes(term);
    });
  }, [users, searchTerm, offerTypeFilter]);

  const sortedUsers = React.useMemo(() => {
    if (!sortKey) return filteredUsers;
    return [...filteredUsers].sort((a, b) => {
      if (sortKey === "name") {
        return String(a.name ?? "").localeCompare(String(b.name ?? "")) * directionFactor;
      }
      if (sortKey === "phone") {
        return String(a.phone ?? "").localeCompare(String(b.phone ?? "")) * directionFactor;
      }
      if (sortKey === "offerType") {
        return String(a.offerType ?? "").localeCompare(String(b.offerType ?? "")) * directionFactor;
      }
      const aValue = new Date(a.createdAt ?? a.offerUsedAt ?? 0).getTime();
      const bValue = new Date(b.createdAt ?? b.offerUsedAt ?? 0).getTime();
      return (aValue - bValue) * directionFactor;
    });
  }, [directionFactor, filteredUsers, sortKey]);

  const offerPagination = useTablePagination(sortedUsers);

  React.useEffect(() => {
    offerPagination.resetPage();
  }, [offerPagination.resetPage, searchTerm, offerTypeFilter]);

  const filteredInfluencerRows = React.useMemo(() => {
    const term = normalizeSearchValue(influencerSearchTerm);
    return influencerTransactions.filter((txn) => matchesInfluencerSearch(txn, term));
  }, [influencerSearchTerm, influencerTransactions]);

  const sortedInfluencerRows = React.useMemo(() => {
    if (!influencerSortKey) return filteredInfluencerRows;
    return [...filteredInfluencerRows].sort((a, b) => {
      if (influencerSortKey === "user") {
        return normalizeSearchValue(a.userName).localeCompare(normalizeSearchValue(b.userName)) *
          influencerDirectionFactor;
      }
      if (influencerSortKey === "transaction") {
        const aValue = normalizeSearchValue(
          a.razorpayPaymentId ?? a.merchantTransactionId ?? a.externalPaymentId ?? a.id,
        );
        const bValue = normalizeSearchValue(
          b.razorpayPaymentId ?? b.merchantTransactionId ?? b.externalPaymentId ?? b.id,
        );
        return aValue.localeCompare(bValue) * influencerDirectionFactor;
      }
      if (influencerSortKey === "invoice") {
        return normalizeSearchValue(a.invoiceNumber).localeCompare(normalizeSearchValue(b.invoiceNumber)) *
          influencerDirectionFactor;
      }
      if (influencerSortKey === "metal") {
        return normalizeSearchValue(a.metalType).localeCompare(normalizeSearchValue(b.metalType)) *
          influencerDirectionFactor;
      }
      if (influencerSortKey === "amount") {
        return (Number(a.amount ?? 0) - Number(b.amount ?? 0)) * influencerDirectionFactor;
      }
      const aValue = new Date(a.createdAt ?? a.executedAt ?? 0).getTime();
      const bValue = new Date(b.createdAt ?? b.executedAt ?? 0).getTime();
      return (aValue - bValue) * influencerDirectionFactor;
    });
  }, [filteredInfluencerRows, influencerDirectionFactor, influencerSortKey]);

  const influencerTotalAmount = React.useMemo(
    () => influencerTransactions.reduce((sum, txn) => sum + Number(txn.amount ?? 0), 0),
    [influencerTransactions],
  );
  
  const influencerPagination = useTablePagination(sortedInfluencerRows);

  React.useEffect(() => {
    influencerPagination.resetPage();
  }, [activeTab, influencerPagination.resetPage, influencerSearchTerm, selectedReferralCode]);

  const exportOfferUsersToExcel = React.useCallback(async () => {
    await exportToExcel({
      fileName: "offer-users.xlsx",
      sheetName: "Offer Users",
      columns: [
        { header: "User", key: "name", width: 30 },
        { header: "Phone", key: "phone", width: 20 },
        { header: "Offer Type", key: "offerType", width: 20 },
        { header: "Created Date", key: "createdDate", width: 25 },
        { header: "Offer Status", key: "offerStatus", width: 18 },
      ],
      rows: sortedUsers.map((user) => ({
        name: user.name ?? "-",
        phone: user.phone ?? "-",
        offerType: user.offerType ?? "-",
        createdDate:
          user.createdAt || user.offerUsedAt
            ? formatDateTime(user.createdAt ?? user.offerUsedAt ?? "")
            : "-",
        offerStatus: user.hasUsedOffer ? "USED" : "NOT USED",
      })),
    });
  }, [sortedUsers]);

  const exportInfluencerTransactionsToExcel = React.useCallback(async () => {
    await exportToExcel({
      fileName: `influencer-transactions-${selectedReferralCode || "export"}.xlsx`,
      sheetName: "Influencer Transactions",
      columns: [
        { header: "User", key: "userName", width: 24 },
        { header: "Referred By", key: "referredBy", width: 16 },
        { header: "Transaction Id", key: "transactionId", width: 28 },
        { header: "Type", key: "transactionType", width: 14 },
        { header: "Invoice", key: "invoiceNumber", width: 18 },
        { header: "Metal", key: "metalType", width: 12 },
        { header: "Amount", key: "amount", width: 14 },
        { header: "Status", key: "status", width: 12 },
        { header: "Date", key: "date", width: 22 },
      ],
      rows: sortedInfluencerRows.map((txn) => ({
        userName: txn.userName ?? "-",
        referredBy: txn.referredBy ?? "-",
        transactionId:
          txn.razorpayPaymentId ?? txn.merchantTransactionId ?? txn.externalPaymentId ?? txn.id,
        transactionType: formatTransactionType(txn.transactionType),
        invoiceNumber: txn.invoiceNumber ?? "-",
        metalType: txn.metalType ?? "-",
        amount: typeof txn.amount === "number" ? txn.amount : "-",
        status: txn.status ?? "-",
        date: formatDateTime(txn.createdAt ?? txn.executedAt ?? ""),
      })),
    });
  }, [selectedInfluencer?.name, selectedReferralCode, sortedInfluencerRows]);

  return (
    <>
      <Layout title="Offer Users">
        <div className="flex h-[calc(100vh-7.5rem)] flex-col gap-4">
          <div className="flex w-fit items-center gap-1 rounded-xl border border-border bg-muted p-1">
            {PAGE_TABS.map((tab) => (
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

          {activeTab === "Offer Users" && (
            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="shrink-0 border-b border-white/5 p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative w-full sm:w-96">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search users by name or phone..."
                    className="pl-10"
                    aria-label="Search offer users"
                  />
                </div>

                <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
                <TooltipProvider delayDuration={200}>
                  <div className="inline-flex flex-nowrap items-center gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex cursor-pointer transition-all duration-200 hover:scale-105">
                            <Button
                              variant="outline"
                              className="h-10 px-6 rounded-full border-gray-200 hover:border-gray-300 transition-all duration-200 cursor-pointer"
                              onClick={exportOfferUsersToExcel}
                              disabled={sortedUsers.length === 0}
                            >
                              <DownloadCloud className="h-4 w-4" />
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent
                          side="bottom"
                          align="end"
                          sideOffset={8}
                          avoidCollisions
                          collisionPadding={{ right: 32, left: 16 }}
                          className={exportTooltipClassName}
                        >
                          Export All
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </TooltipProvider>
                </div>
                </div>
              </div>

              <div className="min-h-0 w-full flex-1 overflow-auto">
                <TooltipProvider delayDuration={200}>
                  <table className="min-w-[900px] w-full text-sm text-left">
                    <thead className="bg-muted text-sm  text-muted-foreground">
                      <tr>
                        <th className="bg-muted px-4 py-4 text-left font-medium uppercase">
                          <button
                            type="button"
                            onClick={() => handleSort("name")}
                            className={`${getSortToggleClass(sortKey === "name")} `}
                          >
                            User <SortDirectionIcon active={sortKey === "name"} direction={sortDirection} />
                          </button>
                        </th>
                        <th className="bg-muted px-4 py-4 text-left font-medium uppercase">
                          <button
                            type="button"
                            onClick={() => handleSort("phone")}
                            className={`${getSortToggleClass(sortKey === "phone")} `}
                          >
                            Phone <SortDirectionIcon active={sortKey === "phone"} direction={sortDirection} />
                          </button>
                        </th>
                        <th className="bg-muted px-4 py-4 text-left font-medium uppercase">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleSort("offerType")}
                              className={`${getSortToggleClass(sortKey === "offerType")} `}
                            >
                              Offer Type{" "}
                              <SortDirectionIcon active={sortKey === "offerType"} direction={sortDirection} />
                            </button>
                            <TableHeaderFilter
                              title="Offer type"
                              value={offerTypeFilter}
                              onChange={handleOfferTypeFilterChange}
                              options={[...OFFER_TYPE_FILTER_OPTIONS]}
                              activeWhen={(value) => value !== "all"}
                              clearValue="all"
                            />
                          </div>
                        </th>
                        <th className="bg-muted px-4 py-4 text-left font-medium uppercase">
                          <button
                            type="button"
                            onClick={() => handleSort("createdAt")}
                            className={`${getSortToggleClass(sortKey === "createdAt")} `}
                          >
                            Created <SortDirectionIcon active={sortKey === "createdAt"} direction={sortDirection} />
                          </button>
                        </th>
                        <th className="bg-muted px-4 py-4 text-left font-medium ">Offer Status</th>
                        <th className="bg-muted px-4 py-4 text-left font-medium ">Actions</th>
                      </tr>
                    </thead>
                    <tbody key={`${searchTerm}|${offerTypeFilter}|${offerPagination.currentPage}`}>
                      {isLoading ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                            Loading offer users...
                          </td>
                        </tr>
                      ) : isError ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center text-sm text-destructive">
                            Failed to load offer users.
                          </td>
                        </tr>
                      ) : offerPagination.pagedItems.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                            {users.length === 0
                              ? "No offer users found."
                              : "No offer users match your search or offer filter."}
                          </td>
                        </tr>
                      ) : (
                        offerPagination.pagedItems.map((user) => (
                          <tr
                            key={user.userId}
                            className="border-b border-border hover:bg-white/5 transition-colors"
                          >
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold shrink-0">
                                  {String(user.name ?? "?").charAt(0).toUpperCase()}
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <Link
                                    href={`/users/${user.userId}?from=offer-users`}
                                    onClick={() => storeSelectedOfferUser(user)}
                                    className="font-semibold text-muted-foreground truncate hover:text-primary"
                                  >
                                    {user.name ?? "-"}
                                  </Link>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-muted-foreground whitespace-nowrap">{user.phone ?? "-"}</td>
                            <td className="px-4 py-4 text-left">
                              <span className="text-muted-foreground">
                                {user.offerType
                                  ? formatOfferTypeFilterLabel(getOfferTypeFilterKey(user.offerType))
                                  : "-"}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-left text-muted-foreground whitespace-nowrap">
                              {user.createdAt || user.offerUsedAt
                                ? formatDateTime(user.createdAt ?? user.offerUsedAt ?? "")
                                : "-"}
                            </td>
                            <td className="px-4 py-4 text-left">
                              <span className="text-muted-foreground">
                                {user.hasUsedOffer ? "USED" : "NOT USED"}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-left whitespace-nowrap" onClick={(event) => event.stopPropagation()}>
                              <div className="inline-flex items-center justify-start gap-0.5 flex-nowrap">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 cursor-pointer" asChild>
                                      <Link href={`/users/${user.userId}?from=offer-users`} onClick={() => storeSelectedOfferUser(user)}>
                                        <Eye className="h-4 w-4" />
                                      </Link>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom" className={exportTooltipClassName}>
                                    View User Details
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </TooltipProvider>
              </div>

              <TablePaginationFooter {...bindTablePaginationFooter(offerPagination)} />
            </Card>
          )}

          {activeTab === "Influencers" && (
            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="p-6 border-b border-white/5 flex flex-col sm:flex-row gap-4 justify-between items-center">
                <div className="relative w-full sm:w-94">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search users by name or phone..."
                    className="pl-10"
                  />
                </div>

                <TooltipProvider delayDuration={200}>
                  <div className="inline-flex flex-nowrap items-center gap-2 w-full sm:w-auto">
                    <Select
                      value={selectedReferralCode}
                      onValueChange={(value) => {
                        setSelectedReferralCode(value);
                        // setInfluencerPage(1);
                      }}
                      disabled={referralsLoading || influencerReferrals.length === 0}
                    >
                      <SelectTrigger className="h-10 w-full sm:w-[220px]">
                        <SelectValue
                          placeholder={
                            referralsLoading
                              ? "Loading influencers..."
                              : referralsError
                                ? "Failed to load influencers"
                                : "Select influencer"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent className="max-h-72 overflow-y-auto w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)]">
                        {influencerReferrals.map((item) => (
                          <SelectItem key={item.referralCode} value={item.referralCode}>
                            {item.name} ( {item.referralCode})
                            <p className="mt-1 text-xs  text-foreground">
                            Transactions: {(item.transactionCount)}
                          </p>
                          </SelectItem>
                        ))}

                      </SelectContent>
                    </Select>
                   
                    <div className="hidden rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm sm:block sm:w-[170px]">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Total Amount</p>
                      <p className="truncate font-semibold text-foreground">
                        {formatCurrency(influencerTotalAmount)}
                      </p>
                    </div>
                      <div className="hidden rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm sm:block sm:w-[170px]">
                      <p className="text-[10px] font-semibold uppercase text-muted-foreground">Commission</p>
                      <p className="truncate font-semibold text-foreground">
                        {formatCurrency(commission)}
                      </p>
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex cursor-pointer transition-all duration-200 hover:scale-105">
                            <Button
                              variant="outline"
                              className="h-10 px-6 rounded-full border-gray-200 hover:border-gray-300 transition-all duration-200 cursor-pointer"
                              onClick={exportInfluencerTransactionsToExcel}
                              disabled={sortedInfluencerRows.length === 0}
                            >
                              <DownloadCloud className="h-4 w-4" />
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent
                          side="bottom"
                          align="end"
                          sideOffset={8}
                          avoidCollisions
                          collisionPadding={{ right: 32, left: 16 }}
                          className={exportTooltipClassName}
                        >
                          Export All
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </TooltipProvider>
              </div>

              <div className="min-h-0 w-full flex-1 overflow-x-auto">
                <TooltipProvider delayDuration={200}>
                  <table className="min-w-[900px] w-full text-sm ">
                    <thead className="bg-muted text-sm  text-muted-foreground">
                      <tr>
                        <th className="px-4 py-4 text-left font-medium uppercase">
                          <button
                            type="button"
                            onClick={() => handleInfluencerSort("user")}
                            className={`${getSortToggleClass(influencerSortKey === "user")} `}
                          >
                            User{" "}
                            <SortDirectionIcon
                              active={influencerSortKey === "user"}
                              direction={influencerSortDirection}
                            />
                          </button>
                        </th>
                        <th className="px-4 py-4 text-left font-medium uppercase">
                          <button
                            type="button"
                            onClick={() => handleInfluencerSort("transaction")}
                            className={`${getSortToggleClass(influencerSortKey === "transaction")} `}
                          >
                            Transaction{" "}
                            <SortDirectionIcon
                              active={influencerSortKey === "transaction"}
                              direction={influencerSortDirection}
                            />
                          </button>
                        </th>
                        <th className="px-4 py-4 text-left font-medium uppercase">
                          <button
                            type="button"
                            onClick={() => handleInfluencerSort("invoice")}
                            className={`${getSortToggleClass(influencerSortKey === "invoice")} `}
                          >
                            Invoice{" "}
                            <SortDirectionIcon
                              active={influencerSortKey === "invoice"}
                              direction={influencerSortDirection}
                            />
                          </button>
                        </th>
                        <th className="px-4 py-4 text-left font-medium uppercase">
                          <button
                            type="button"
                            onClick={() => handleInfluencerSort("metal")}
                            className={`${getSortToggleClass(influencerSortKey === "metal")} `}
                          >
                            Metal Type{" "}
                            <SortDirectionIcon
                              active={influencerSortKey === "metal"}
                              direction={influencerSortDirection}
                            />
                          </button>
                        </th>
                        <th className="px-4 py-4 text-left font-medium uppercase">
                          <button
                            type="button"
                            onClick={() => handleInfluencerSort("amount")}
                            className={`${getSortToggleClass(influencerSortKey === "amount")} `}
                          >
                            Amount{" "}
                            <SortDirectionIcon
                              active={influencerSortKey === "amount"}
                              direction={influencerSortDirection}
                            />
                          </button>
                        </th>
                        <th className="px-4 py-4 text-left font-medium ">Status</th>
                        <th className="px-4 py-4 text-left font-medium uppercase">
                          <button
                            type="button"
                            onClick={() => handleInfluencerSort("date")}
                            className={`${getSortToggleClass(influencerSortKey === "date")} `}
                          >
                            Created{" "}
                            <SortDirectionIcon
                              active={influencerSortKey === "date"}
                              direction={influencerSortDirection}
                            />
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {referralsLoading ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">
                            Loading influencers...
                          </td>
                        </tr>
                      ) : referralsError ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-10 text-center text-sm text-destructive">
                            Failed to load influencers.
                          </td>
                        </tr>
                      ) : influencerReferrals.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">
                            No influencers found.
                          </td>
                        </tr>
                      ) : !selectedReferralCode ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">
                            Select an influencer to view transactions.
                          </td>
                        </tr>
                      ) : influencerLoading ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">
                            Loading influencer transactions...
                          </td>
                        </tr>
                      ) : influencerError ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-10 text-center text-sm text-destructive">
                            Failed to load influencer transactions.
                            <Button
                              type="button"
                              variant="link"
                              className="ml-2 h-auto p-0"
                              onClick={() => void refetchInfluencers()}
                            >
                              Retry
                            </Button>
                          </td>
                        </tr>
                      ) : influencerPagination.pagedItems.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">
                            No transactions found for {selectedInfluencer?.name ?? "this influencer"}.
                          </td>
                        </tr>
                      ) : (
                        influencerPagination.pagedItems.map((txn) => {
                          const transactionId =
                            txn.razorpayPaymentId ??
                            txn.merchantTransactionId ??
                            txn.externalPaymentId ??
                            txn.id;
                          const userHref = txn.userId ? `/users/${txn.userId}?from=offer-influencers` : null;

                          return (
                            <tr
                              key={`${txn.id}-${txn.createdAt ?? txn.executedAt ?? ""}`}
                              className="border-b border-border hover:bg-white/5 transition-colors"
                            >
                              <td className="px-4 py-4">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold shrink-0">
                                    {String(txn.userName ?? "?").charAt(0).toUpperCase()}
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    {userHref ? (
                                      <Link
                                        href={userHref}
                                        onClick={() => storeSelectedInfluencerUser(txn.userId ?? "", txn)}
                                        className="font-semibold text-muted-foreground truncate hover:text-primary"
                                      >
                                        {txn.userName ?? "-"}
                                      </Link>
                                    ) : (
                                      <p className="font-semibold text-muted-foreground truncate">{txn.userName ?? "-"}</p>
                                    )}
                                    {txn.userEmail ? (
                                      <p className="text-xs text-gray truncate">{txn.userEmail}</p>
                                    ) : null}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-4 text-muted-foreground whitespace-nowrap">
                                <p className="truncate max-w-[200px]" title={transactionId}>
                                  {transactionId}
                                </p>
                                <p className="text-xs uppercase">{formatTransactionType(txn.transactionType)}</p>
                              </td>
                              <td className="px-4 py-4 text-muted-foreground whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <p className="truncate max-w-[120px]" title={txn.invoiceNumber}>
                                    {txn.invoiceNumber ?? "-"}
                                  </p>
                                  {txn.invoiceUrl && txn.invoiceNumber ? (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                                          onClick={() => {
                                            setPreviewUrl(txn.invoiceUrl ?? null);
                                            setPreviewLabel(txn.invoiceNumber);
                                          }}
                                          aria-label={`Preview invoice ${txn.invoiceNumber}`}
                                        >
                                          <Eye className="h-3.5 w-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent side="bottom" className={exportTooltipClassName}>
                                        View Invoice
                                      </TooltipContent>
                                    </Tooltip>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-4 py-4 text-left text-muted-foreground whitespace-nowrap">
                                {txn.metalType ?? "-"}
                              </td>
                              <td className="px-4 py-4 text-left text-muted-foreground whitespace-nowrap">
                                {typeof txn.amount === "number" ? formatCurrency(txn.amount) : "-"}
                              </td>
                              {/* <td className="px-4 py-4 text-muted-foreground whitespace-nowrap text-center">
                                {txn.referredBy ?? "-"}
                              </td> */}
                              <td className="px-4 py-4 text-left">
                                <span className="text-muted-foreground">
                                  {String(txn.status ?? "unknown").toUpperCase()}
                                </span>
                                {txn.failureReason ? (
                                  <p
                                    className="mt-1 max-w-[150px] truncate text-xs text-destructive"
                                    title={txn.failureReason}
                                  >
                                    {txn.failureReason}
                                  </p>
                                ) : null}
                              </td>
                              <td className="px-4 py-4 text-left text-muted-foreground whitespace-nowrap">
                                {formatDateTime(txn.createdAt ?? txn.executedAt ?? "")}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </TooltipProvider>
              </div>

              <TablePaginationFooter {...bindTablePaginationFooter(influencerPagination)} />
            </Card>
          )}
        </div>
      </Layout>
      <ImagePreviewModal url={previewUrl} label={previewLabel} onClose={() => setPreviewUrl(null)} />
    </>
  );
}
