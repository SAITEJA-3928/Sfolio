import { exportToExcel } from "@/lib/export-to-excel";
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useSearch } from "wouter";
import { Layout } from "@/components/layout";
import { Card, Input, Badge, Button } from "@/components/ui";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ImagePreviewModal, { type PreviewImageItem } from "@/components/ui/ImagePreviewModal";
import {
  formatDocumentGroupLabel,
  getKycDocumentPreviewImages,
  groupKycDocuments,
  type KycDocumentGroup,
} from "@/lib/kyc-documents";
import { CalendarIcon, Search, Filter, Eye, UserRoundCheck, UserRoundX, Bell, DownloadCloud, FileText, } from "lucide-react";
import { customFetch } from "@/lib/custom-fetch";
import { formatDateTime, formatDateTimeParts } from "@/lib/utils";
import { buildAdminUsersApiUrl } from "@/lib/api-config";
import panIcon from "@/assets/pan icon.png";
import aadharIcon from "@/assets/aadhar icon.png";
import { useQueryClient } from "@tanstack/react-query";
import MuiTooltip from "@mui/material/Tooltip";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { DateRangePicker } from "@/components/ui/date-picker";
import digiLockerIcon from "../assets/Digilocker.png";
import cashfreeIcon from "../assets/cashfree logo.png";
import { TableHeaderFilter } from "@/components/table-header-filter";
import { getSortToggleClass, SortDirectionIcon, useTableSort } from "@/lib/table-sort";
import { formatDateInputValue, getInitialDateRangeFromSearch, isDateInRange} from "@/lib/date-range";
import { getDateRangeFromTimePeriod, parseTimePeriodFromSearch } from "@/lib/time-period";
import SelectionFeedback from "@/components/ui/SelectionFeedback";
import { getSelectionRowClass, triggerSelectionFeedback } from "@/lib/selection-feedback";
import { TablePaginationFooter } from "@/components/table-pagination-footer";
import { DEFAULT_TABLE_PAGE_SIZE } from "@/lib/table-pagination";
import { usePersistedSearchTerm, usePersistedDateRange, createPersistedSearchTermKey, createPersistedDateRangeKey, } from "@/lib/persisted-page-filters";


type AdminUser = {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  kycVerified?: string;
  kycComments?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  documents?: unknown[];
  gender?: string;
  state?: string;
  city?: string;
  referredBy?: string;
  panNumber?: string;
  dob?: string;
  address?: string;
  pincode?: string;
  country?: string;
  nomineeDetails?: unknown[];
};
type UsersSortKey = "name" | "phone" | "referredBy" | "createdAt" | "updatedAt";

const KYC_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "approved", label: "Approved" },
  { value: "pending", label: "Pending" },
  { value: "rejected", label: "Rejected" },
  { value: "suspended", label: "Suspended" },
] as const;
const ACTIVE_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
] as const;

const SELECTED_USER_STORAGE_KEY = "gfolio-admin:selected-user";
const NOTIFICATION_RECIPIENTS_STORAGE_KEY = "gfolio-admin:notification-recipients";
const NOTIFICATION_RETURN_PATH_STORAGE_KEY = "gfolio-admin:notification-return-path";
const USERS_NOTIFICATION_SELECTION_STORAGE_KEY = "gfolio-admin:users-notification-selection";
const USERS_RESET_SELECTION_FLAG = "gfolio-admin:users-reset-selection";
const ADMIN_USERS_ENDPOINT = buildAdminUsersApiUrl("/admin/getAdminUsers");
const ADMIN_USERS_QUERY_KEY = [ADMIN_USERS_ENDPOINT] as const;
const normalizeSearchValue = (value: unknown) =>
  String(value ?? "").trim().toLowerCase();
const digitsOnly = (value: string) => value.replace(/\D/g, "");
const uniqueById = (users: AdminUser[]) =>
  Array.from(new Map(users.map((user) => [user.id, user])).values());
function isDigiLockerVerifiedComment(comments?: string) {
  return comments?.trim().toLowerCase() === "verified via digilocker";
}

function isCashfreeVerifiedComment(comments?: string) {
  return comments?.trim().toLowerCase() === "verified via cashfree";
}

function getUserSearchRank(user: AdminUser, term: string) {
  const name = normalizeSearchValue(user.name);
  const email = normalizeSearchValue(user.email);
  const phone = normalizeSearchValue(user.phone);
  const referredBy = normalizeSearchValue(user.referredBy);
  const searchWords = term.split(/\s+/).filter(Boolean);
  const nameWords = name.split(/\s+/).filter(Boolean);
  const phoneTerm = digitsOnly(term);
  const compactTerm = term.replace(/\s+/g, "");
  const looksLikeEmail = term.includes("@") || term.includes(".");
  const looksLikePhone = phoneTerm.length > 0 && phoneTerm.length === compactTerm.length;
  if (!looksLikeEmail && !looksLikePhone && nameWords.length === 0) {
    return null;
  }
  if (
    searchWords.length > 0 &&
    searchWords.every((searchWord) =>
      nameWords.some((nameWord) => nameWord.startsWith(searchWord))
    )
  ) {
    return name.startsWith(term) ? 0 : 1;
  }
  if (
    searchWords.length > 0 &&
    searchWords.every((searchWord) => name.includes(searchWord))
  ) {
    return 2;
  }
  if (looksLikeEmail) {
    return email.includes(term) ? 3 : null;
  }
  if (referredBy.includes(term)) {
    return 4;
  }
  return looksLikePhone && digitsOnly(phone).includes(phoneTerm) ? 5 : null;
}
const DOCUMENT_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "hasDocuments", label: "Has Documents" },
  { value: "noDocuments", label: "No Documents" },
] as const;

const USERS_SEARCH_DEBOUNCE_MS = 100;
const ADMIN_USERS_FETCH_ALL_LIMIT = 100;
const ADMIN_USERS_MAX_FETCH_PAGES = 2000;

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

type AdminUsersFetchFilters = {
  search?: string;
  fromDate?: string;
  toDate?: string;
  kyc?: string;
  documentFilter?: string;
  activeFilter?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
};


function appendAdminUsersFilterParam(
  params: URLSearchParams,
  key: string,
  value?: string,
) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "all") return;
  params.set(key, trimmed);
}

async function fetchAdminUsers(
  page: number,
  limit: number,
  filters: AdminUsersFetchFilters = {},
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
  appendAdminUsersFilterParam(params, "kyc", filters.kyc);
  appendAdminUsersFilterParam(params, "documentFilter", filters.documentFilter);
  appendAdminUsersFilterParam(params, "activeFilter", filters.activeFilter);
  if (filters.sortBy) {
    params.set("sortBy", filters.sortBy);
  }
  if (filters.sortOrder) {
    params.set("sortOrder", filters.sortOrder);
  }

  return customFetch<{ users?: unknown[]; total?: number; page?: number; limit?: number }>(
    `${ADMIN_USERS_ENDPOINT}?${params.toString()}`,
    { method: "GET" },
  );
}

async function fetchAllMatchingAdminUsers(filters: AdminUsersFetchFilters) {
  const firstResponse = await fetchAdminUsers(1, ADMIN_USERS_FETCH_ALL_LIMIT, filters);
  const firstPage = parseAdminUsersListResponse(firstResponse, 1, ADMIN_USERS_FETCH_ALL_LIMIT);
  const totalPages = Math.min(
    firstPage.totalPages ??
      Math.max(1, Math.ceil((firstPage.total || firstPage.users.length) / ADMIN_USERS_FETCH_ALL_LIMIT)),
    ADMIN_USERS_MAX_FETCH_PAGES,
  );

  if (totalPages <= 1) {
    return uniqueById(firstPage.users);
  }

  const remainingPageNumbers = Array.from({ length: totalPages - 1 }, (_, index) => index + 2);
  const remainingUsers = await Promise.all(
    remainingPageNumbers.map(async (page) => {
      const response = await fetchAdminUsers(page, ADMIN_USERS_FETCH_ALL_LIMIT, filters);
      return parseAdminUsersListResponse(response, page, ADMIN_USERS_FETCH_ALL_LIMIT).users;
    }),
  );

  return uniqueById([...firstPage.users, ...remainingUsers.flat()]);
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

function readAdminUsersPagination(source: unknown): Record<string, unknown> | null {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const record = source as Record<string, unknown>;
  if (!record.pagination || typeof record.pagination !== "object" || Array.isArray(record.pagination)) {
    return null;
  }
  return record.pagination as Record<string, unknown>;
}

function readAdminUsersTotal(source: unknown): number | undefined {
  if (!source || typeof source !== "object" || Array.isArray(source)) return undefined;
  const record = source as Record<string, unknown>;
  const pagination = readAdminUsersPagination(source);

  return (
    asNonNegativeInt(record.total) ??
    asNonNegativeInt(record.totalCount) ??
    asNonNegativeInt(record.totalUsers) ??
    asNonNegativeInt(record.count) ??
    (pagination
      ? asNonNegativeInt(pagination.totalUsers) ??
        asNonNegativeInt(pagination.total) ??
        asNonNegativeInt(pagination.totalCount) ??
        asNonNegativeInt(pagination.count)
      : undefined)
  );
}

function parseAdminUsersListResponse(
  data: unknown,
  requestedPage: number,
  requestedLimit: number,
) {
  const root = data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
  const payload = unwrapPayload(data);
  const record =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  const pagination = readAdminUsersPagination(record) ?? readAdminUsersPagination(root);
  const users = normalizeUsers(data);
  const reportedTotal = readAdminUsersTotal(record) ?? readAdminUsersTotal(root);
  const page =
    asNonNegativeInt(pagination?.currentPage) ??
    asNonNegativeInt(record?.page) ??
    asNonNegativeInt(root.page) ??
    requestedPage;
  const limit =
    asNonNegativeInt(pagination?.limit) ??
    asNonNegativeInt(record?.limit) ??
    asNonNegativeInt(root.limit) ??
    requestedLimit;
  const reportedTotalPages = asNonNegativeInt(pagination?.totalPages);
  const hasNextPage =
    typeof pagination?.hasNextPage === "boolean" ? pagination.hasNextPage : undefined;

  return {
    users,
    total: reportedTotal ?? 0,
    page,
    limit,
    totalPages: reportedTotalPages,
    hasReportedTotal: reportedTotal !== undefined,
    hasMore: hasNextPage ?? users.length >= requestedLimit,
  };
}

function normalizeUser(value: unknown): AdminUser | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const rawId = record.id ?? record._id;
  if (rawId == null) return null;

  const id = typeof rawId === "string" ? rawId : String(rawId);

  return {
    id,
    name: typeof record.name === "string" ? record.name : undefined,
    email: typeof record.email === "string" ? record.email : undefined,
    phone: typeof record.phone === "string" ? record.phone : undefined,
    role: typeof record.role === "string" ? record.role : undefined,
    kycVerified:
      typeof record.kycVerified === "string"
        ? record.kycVerified
        : typeof record.kycStatus === "string"
          ? record.kycStatus
          : undefined,
    kycComments:
      typeof record.kycComments === "string"
        ? record.kycComments
        : typeof record.comments === "string"
          ? record.comments
          : undefined,
    isActive: typeof record.isActive === "boolean" ? record.isActive : undefined,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : undefined,
    updatedAt:
      typeof record.updatedAt === "string"
        ? record.updatedAt
        : record.updatedAt instanceof Date
          ? record.updatedAt.toISOString()
          : undefined,
    documents: Array.isArray(record.documents) ? record.documents : undefined,
    gender: typeof record.gender === "string" ? record.gender : undefined,
    state: typeof record.state === "string" ? record.state : undefined,
    city: typeof record.city === "string" ? record.city : undefined,
    referredBy:
      typeof record.referredBy === "string" && record.referredBy.trim()
        ? record.referredBy.trim()
        : undefined,
    panNumber: typeof record.panNumber === "string" ? record.panNumber : undefined,
    dob:
      typeof record.dob === "string"
        ? record.dob
        : record.dob instanceof Date
          ? record.dob.toISOString()
          : undefined,
    address: typeof record.address === "string" ? record.address : undefined,
    pincode: typeof record.pincode === "string" ? record.pincode : undefined,
    country: typeof record.country === "string" ? record.country : undefined,
    nomineeDetails: Array.isArray(record.nomineeDetails) ? record.nomineeDetails : undefined,
  };
}

function unwrapPayload(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const record = data as Record<string, unknown>;
  return "data" in record ? record.data : data;
}

function normalizeUsers(data: unknown): AdminUser[] {
  const payload = unwrapPayload(data);
  if (!payload) return [];

  if (Array.isArray((payload as { users?: unknown }).users)) {
    return uniqueById(
      (payload as { users: unknown[] }).users
        .map(normalizeUser)
        .filter((user): user is AdminUser => user !== null)
    );
  }

  if (Array.isArray(payload)) {
    return uniqueById(
      payload
        .map(normalizeUser)
        .filter((user): user is AdminUser => user !== null)
    );
  }

  const single = normalizeUser(payload);
  return single ? [single] : [];
}

function kycBadgeVariant(value?: string) {
  if (value === "approved" || value === "verified") return "success";
  if (value === "pending") return "warning";
  return "destructive";
}

function isPendingKycStatus(value?: string) {
  const normalized = normalizeSearchValue(value);
  return normalized === "pending";
}

function isUserActive(user: AdminUser) {
  return user.isActive !== false;
}

function hasUploadedDocuments(user: AdminUser) {
  return Array.isArray(user.documents) && user.documents.length > 0;
}

function comparePendingUsersWithDocumentsFirst(a: AdminUser, b: AdminUser) {
  const aHasDocs = hasUploadedDocuments(a) ? 1 : 0;
  const bHasDocs = hasUploadedDocuments(b) ? 1 : 0;
  return bHasDocs - aHasDocs;
}

function storeSelectedUser(user: AdminUser) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(SELECTED_USER_STORAGE_KEY, JSON.stringify(user));
}
function readUsersNotificationSelection() {
  if (typeof window === "undefined") return [];

  const raw = window.sessionStorage.getItem(USERS_NOTIFICATION_SELECTION_STORAGE_KEY);
  if (!raw) return [];

  try {
    const ids = JSON.parse(raw);
    if (Array.isArray(ids) && ids.every((id) => typeof id === "string" && id.trim())) {
      return ids;
    }
  } catch (error) {
    console.error("Failed to parse stored user notification selection", error);
  }

  return [];
}

function writeUsersNotificationSelection(userIds: string[]) {
  if (typeof window === "undefined") return;

  if (userIds.length > 0) {
    window.sessionStorage.setItem(
      USERS_NOTIFICATION_SELECTION_STORAGE_KEY,
      JSON.stringify(userIds),
    );
    return;
  }

  window.sessionStorage.removeItem(USERS_NOTIFICATION_SELECTION_STORAGE_KEY);
}

function consumeUsersSelectionReset() {
  if (typeof window === "undefined") return false;
  if (!window.sessionStorage.getItem(USERS_RESET_SELECTION_FLAG)) return false;

  window.sessionStorage.removeItem(USERS_RESET_SELECTION_FLAG);
  window.sessionStorage.removeItem(USERS_NOTIFICATION_SELECTION_STORAGE_KEY);
  return true;
}

function isPageReload() {
  if (typeof window === "undefined") return false;
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return nav?.type === "reload";
}

if (isPageReload()) {
  writeUsersNotificationSelection([]);
}

function isAadharDocument(docType: string) {
  const normalized = docType.toLowerCase();
  return normalized.includes("aadhar") || normalized.includes("aadhaar");
}

function getDocumentIcon(docType: string) {
  return isAadharDocument(docType) ? aadharIcon : panIcon;
}
function hasBothKycDocuments(user: AdminUser) {
  const groups = groupKycDocuments(user.documents);

  const hasAadhar = groups.some((group) => isAadharDocument(group.label));
  const hasPan = groups.some(
    (group) => normalizeSearchValue(group.label).includes("pan")
  );

  return hasAadhar && hasPan;
}

function DateTimeCell({ value }: { value?: string }) {
  if (!value) return <span>-</span>;
  const parts = formatDateTimeParts(value);
  if (!parts) return <span>-</span>;
  return (
    <div className="flex flex-col items-left leading-tight gap-0.5">
      <span>{parts.date}</span>
      <span className="text-md text-muted-foreground">{parts.time}</span>
    </div>
  );
}

export default function UsersList() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [suspendOpen, setSuspendOpen] = React.useState(false);
  const [suspendComment, setSuspendComment] = React.useState("");
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null);
  const [kycFilter, setKycFilter] = React.useState("all");
  const isAutomaticKycFilter = React.useRef(true);
  const [previewImages, setPreviewImages] = useState<PreviewImageItem[]>([]);
  const [previewLabel, setPreviewLabel] = useState<string | undefined>(undefined);
  const [selectedNotificationUsers, setSelectedNotificationUsers] = React.useState<string[]>(() => {
    if (typeof window !== "undefined" && window.sessionStorage.getItem(USERS_RESET_SELECTION_FLAG)) {
      return [];
    }
    return readUsersNotificationSelection();
  });
  const [selectAllMatchingFilters, setSelectAllMatchingFilters] = React.useState(false);
  const [excludedNotificationUsers, setExcludedNotificationUsers] = React.useState<string[]>([]);
  const [isResolvingRecipients, setIsResolvingRecipients] = React.useState(false);
  const { sortKey, sortDirection, handleSort } =
    useTableSort<UsersSortKey>();

  const handleOpenDocumentGroup = (group: KycDocumentGroup) => {
    const images = getKycDocumentPreviewImages(group);
    if (images.length === 0) return;

    setPreviewImages(images);
    setPreviewLabel(formatDocumentGroupLabel(group.label));
  };

  const closeDocumentPreview = () => {
    setPreviewImages([]);
    setPreviewLabel(undefined);
  };

  const handleSuspendUser = async () => {
    if (!selectedUserId) return;

    try {
      await customFetch("/admin/verifykyc", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetUserId: selectedUserId,
          kycStatus: "suspended",
          comments: suspendComment,
        }),
      });

      setSuspendOpen(false);
      setSuspendComment("");
      setSelectedUserId(null);

      queryClient.invalidateQueries({ queryKey: [...ADMIN_USERS_QUERY_KEY] });
    } catch (err) {
      console.error(err);
    }
  };
  const [roleFilter, setRoleFilter] = React.useState("all");
  const [activeFilter, setActiveFilter] = React.useState("all");
  const [documentFilter, setDocumentFilter] = React.useState("all");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_TABLE_PAGE_SIZE);
  const [searchTerm, setSearchTerm] = usePersistedSearchTerm(createPersistedSearchTermKey("users"));
  const [dateRange, setDateRange] = usePersistedDateRange(
    createPersistedDateRangeKey("users"),
    () => (typeof window === "undefined" ? undefined : getInitialDateRangeFromSearch(window.location.search)),
  );
  const fromDate = dateRange?.from ? formatDateInputValue(dateRange.from) : undefined;
  const toDate = dateRange?.to ? formatDateInputValue(dateRange.to) : dateRange?.from ? formatDateInputValue(dateRange.from) : undefined;
  const serverDateFilterActive = Boolean(fromDate && toDate);
  const serverKycFilterActive = kycFilter !== "all";
  const serverDocumentFilterActive = documentFilter !== "all";
  const serverActiveFilterActive = activeFilter !== "all";
  const debouncedSearchTerm = useDebouncedValue(searchTerm, USERS_SEARCH_DEBOUNCE_MS);
  const serverSearchActive = debouncedSearchTerm.trim().length > 0;
  const isSearchDebouncing =searchTerm.trim() !== debouncedSearchTerm.trim() && searchTerm.trim().length > 0;
  const adminUsersFetchFilters = React.useMemo<AdminUsersFetchFilters>(
    () => ({
      search: debouncedSearchTerm,
      fromDate,
      toDate,
      kyc: kycFilter,
      documentFilter,
      activeFilter,
      sortBy: sortKey ?? undefined,
      sortOrder: sortKey ? sortDirection : undefined,
    }),
    [
      debouncedSearchTerm,
      fromDate,
      toDate,
      kycFilter,
      documentFilter,
      activeFilter,
      sortKey,
      sortDirection,
    ],
  );
  const usersListFiltersKey = React.useMemo(
    () =>
      [
        debouncedSearchTerm.trim(),
        fromDate ?? "",
        toDate ?? "",
        kycFilter,
        documentFilter,
        activeFilter,
        pageSize,
        sortKey ?? "",
        sortDirection,
      ].join("|"),
    [
      debouncedSearchTerm,
      fromDate,
      toDate,
      kycFilter,
      documentFilter,
      activeFilter,
      pageSize,
      sortKey,
      sortDirection,
    ],
  );
  const [stablePagination, setStablePagination] = React.useState<{
    total: number;
    totalPages: number;
    hasMore: boolean;
  } | null>(null);
  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: [
      ...ADMIN_USERS_QUERY_KEY,
      page,
      pageSize,
      adminUsersFetchFilters,
    ],
    queryFn: () => fetchAdminUsers(page, pageSize, adminUsersFetchFilters),
    placeholderData: keepPreviousData,
  });
  const {
    users: fetchedUsers,
    total: parsedTotalUsers,
    totalPages: reportedTotalPages,
    hasMore: parsedHasMore,
    hasReportedTotal,
  } = React.useMemo(
    () => parseAdminUsersListResponse(data, page, pageSize),
    [data, page, pageSize],
  );

  const resetUsersPage = React.useCallback(() => {
    setPage(1);
  }, []);

  React.useEffect(() => {
    setStablePagination(null);
    setSelectedNotificationUsers([]);
    setSelectAllMatchingFilters(false);
    setExcludedNotificationUsers([]);
  }, [usersListFiltersKey]);

  React.useEffect(() => {
    resetUsersPage();
  }, [sortKey, sortDirection, resetUsersPage]);

  React.useEffect(() => {
    if (!hasReportedTotal) return;

    setStablePagination({
      total: parsedTotalUsers,
      totalPages: reportedTotalPages ?? Math.max(1, Math.ceil(parsedTotalUsers / pageSize)),
      hasMore: parsedHasMore,
    });
  }, [hasReportedTotal, parsedTotalUsers, reportedTotalPages, parsedHasMore, pageSize]);

  const totalUsers = hasReportedTotal
    ? parsedTotalUsers
    : stablePagination?.total ?? parsedTotalUsers;
  const totalPages = Math.max(
    1,
    hasReportedTotal
      ? reportedTotalPages ?? Math.ceil(totalUsers / pageSize)
      : stablePagination?.totalPages ?? Math.max(1, Math.ceil(totalUsers / pageSize)),
  );
  const canGoNext = hasReportedTotal
    ? parsedHasMore
    : stablePagination?.hasMore ?? parsedHasMore;
  const currentPage = Math.min(page, totalPages);

  React.useEffect(() => {
    if (hasReportedTotal && page > totalPages) {
      setPage(totalPages);
    }
  }, [hasReportedTotal, page, totalPages]);

  const users = fetchedUsers;
  const [transferAnimation, setTransferAnimation] = React.useState(false);
  const [downloadBounce, setDownloadBounce] = React.useState(false);
  const [showDownloadHint, setShowDownloadHint] = React.useState(false);

  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const kycParam = urlParams.get("kycFilter");

    if (kycParam && ['approved', 'pending', 'rejected', 'suspended', 'all'].includes(kycParam)) {
      isAutomaticKycFilter.current = false;
      setKycFilter(kycParam);
    }
  }, []);

  React.useEffect(() => {
    const timePeriod = parseTimePeriodFromSearch(search);
    if (timePeriod) {
      setDateRange(getDateRangeFromTimePeriod(timePeriod));
    }
  }, [search]);

  React.useEffect(() => {
    if (!consumeUsersSelectionReset()) return;

    setSelectedNotificationUsers([]);
    setSelectAllMatchingFilters(false);
    setExcludedNotificationUsers([]);
    writeUsersNotificationSelection([]);
    setTransferAnimation(false);
    setShowDownloadHint(false);
  }, [search]);

  React.useEffect(() => {
    sessionStorage.setItem("kycFilter", kycFilter);
  }, [kycFilter]);


  const handleUnsuspendUser = async (userId: string) => {
    try {
      await customFetch("/admin/verifykyc", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetUserId: userId,
          kycStatus: "approved", 
          comments: "Unsuspended by admin",
        }),
      });

      queryClient.invalidateQueries({ queryKey: [...ADMIN_USERS_QUERY_KEY] });
    } catch (err) {
      console.error(err);
    }
  };

  const filteredUsers = React.useMemo(() => {
    const term = normalizeSearchValue(searchTerm);
    const searchableUsers = users.filter((user) => {
      const role = normalizeSearchValue(user.role);
      const matchesRole =
        roleFilter === "all" || role === roleFilter;
      if (serverSearchActive) {
        return matchesRole;
      }
      const searchRank = term.length === 0 ? 0 : getUserSearchRank(user, term);
      const matchesSearch = searchRank !== null;
      return matchesSearch && matchesRole;
    });
    const baseFiltered = searchableUsers.filter((user) => {
      const kyc = normalizeSearchValue(user.kycVerified);
      const matchesKyc =
        serverKycFilterActive ||
        kycFilter === "all" ||
        (kycFilter === "approved" && (kyc === "approved" || kyc === "verified")) ||
        (kycFilter === "pending" && isPendingKycStatus(user.kycVerified)) ||
        (kycFilter === "rejected" && kyc === "rejected") ||
        (kycFilter === "suspended" && kyc === "suspended");
      const matchesActive =
        serverActiveFilterActive ||
        activeFilter === "all" ||
        (activeFilter === "active" && isUserActive(user)) ||
        (activeFilter === "inactive" && !isUserActive(user));
      const matchesDocuments =
        serverDocumentFilterActive ||
        documentFilter === "all" ||
        (documentFilter === "hasDocuments" && hasBothKycDocuments(user)) ||
        (documentFilter === "noDocuments" && !hasUploadedDocuments(user));
      const dateToFilter = kycFilter === "approved" ? user.createdAt : user.updatedAt;
      const matchesDate =
        serverDateFilterActive || isDateInRange(dateToFilter, dateRange);
      return matchesKyc && matchesActive && matchesDocuments && matchesDate;
    });
    const filtered = baseFiltered;
    if (serverSearchActive || !term) return filtered;
    return filtered.sort((a, b) => {
      const firstRank = getUserSearchRank(a, term) ?? Number.MAX_SAFE_INTEGER;
      const secondRank = getUserSearchRank(b, term) ?? Number.MAX_SAFE_INTEGER;
      return (firstRank - secondRank || normalizeSearchValue(a.name).localeCompare(normalizeSearchValue(b.name))
      );
    });
  }, [
    users,
    searchTerm,
    serverSearchActive,
    serverDateFilterActive,
    serverKycFilterActive,
    serverDocumentFilterActive,
    serverActiveFilterActive,
    kycFilter,
    roleFilter,
    activeFilter,
    documentFilter,
    dateRange,
  ]);

  const displayedUsers = React.useMemo(() => {
    if (kycFilter !== "pending" || sortKey) return filteredUsers;
    return [...filteredUsers].sort(comparePendingUsersWithDocumentsFirst);
  }, [filteredUsers, kycFilter, sortKey]);

  const isNotificationUserSelected = React.useCallback(
    (userId: string) =>
      selectAllMatchingFilters
        ? !excludedNotificationUsers.includes(userId)
        : selectedNotificationUsers.includes(userId),
    [excludedNotificationUsers, selectAllMatchingFilters, selectedNotificationUsers],
  );

  const resolveSelectedUserIds = React.useCallback(async () => {
    if (selectAllMatchingFilters) {
      const allUsers = await fetchAllMatchingAdminUsers(adminUsersFetchFilters);
      const excluded = new Set(excludedNotificationUsers);
      return allUsers.map((user) => user.id).filter((id) => !excluded.has(id));
    }
    return selectedNotificationUsers;
  }, [
    adminUsersFetchFilters,
    excludedNotificationUsers,
    selectAllMatchingFilters,
    selectedNotificationUsers,
  ]);

  const allFilteredSelected =
    totalUsers > 0 &&
    selectAllMatchingFilters &&
    excludedNotificationUsers.length === 0;

  const selectedUsersCount = selectAllMatchingFilters
    ? Math.max(0, totalUsers - excludedNotificationUsers.length)
    : selectedNotificationUsers.length;

  const exportTooltipText = React.useMemo(() => {
    if (selectedUsersCount === 0) {
      return "Export All";
    }

    if (allFilteredSelected) {
      return "Export All";
    }

    return "Export Selected Users";
  }, [selectedUsersCount, allFilteredSelected]);

  const handleKycFilterChange = React.useCallback((value: string) => {
    isAutomaticKycFilter.current = false;
    setKycFilter(value);
    resetUsersPage();
  }, [resetUsersPage]);

  const handleActiveFilterChange = React.useCallback((value: string) => {
    setActiveFilter(value);
    resetUsersPage();
  }, [resetUsersPage]);

  const handleDocumentFilterChange = React.useCallback((value: string) => {
    setDocumentFilter(value);
    resetUsersPage();
  }, [resetUsersPage]);

  const cycleKycFilter = React.useCallback(() => {
    isAutomaticKycFilter.current = false;
    setKycFilter((current) => {
      if (current === "all") return "approved";
      if (current === "approved") return "pending";
      if (current === "pending") return "rejected";
      if (current === "rejected") return "suspended";
      return "all";
    });
  }, []);

  const cycleRoleFilter = React.useCallback(() => {
    setRoleFilter((current) => {
      if (current === "all") return "admin";
      if (current === "admin") return "corporate";
      if (current === "corporate") return "user";
      return "all";
    });
  }, []);

  const toggleNotificationUser = React.useCallback((userId: string) => {
    if (selectAllMatchingFilters) {
      setExcludedNotificationUsers((current) => {
        const isExcluded = current.includes(userId);
        if (!isExcluded) {
          triggerSelectionFeedback({
            setTransferAnimation,
            setShowDownloadHint,
          });
        }
        return isExcluded
          ? current.filter((id) => id !== userId)
          : [...current, userId];
      });
      return;
    }

    setSelectedNotificationUsers((current) => {
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
  }, [selectAllMatchingFilters]);

  const toggleAllFilteredNotificationUsers = React.useCallback((checked: boolean) => {
    if (!checked) {
      setSelectAllMatchingFilters(false);
      setExcludedNotificationUsers([]);
      setSelectedNotificationUsers([]);
      return;
    }

    triggerSelectionFeedback({
      setTransferAnimation,
      setShowDownloadHint,
    });
    setSelectAllMatchingFilters(true);
    setExcludedNotificationUsers([]);
    setSelectedNotificationUsers([]);
  }, []);

  const navigateToCreateNotification = React.useCallback((userIds: string[]) => {
    if (userIds.length === 0) return;

    if (typeof window !== "undefined") {
      writeUsersNotificationSelection(selectedNotificationUsers);
      window.sessionStorage.setItem(
        NOTIFICATION_RECIPIENTS_STORAGE_KEY,
        JSON.stringify(userIds),
      );
      window.sessionStorage.setItem(NOTIFICATION_RETURN_PATH_STORAGE_KEY, "/users");
    }
    navigate("/notifications/create");
  }, [navigate, selectedNotificationUsers]);

  React.useEffect(() => {
    writeUsersNotificationSelection(selectedNotificationUsers);
  }, [selectedNotificationUsers]);

  const openIndividualNotification = React.useCallback((user: AdminUser) => {
    navigateToCreateNotification([user.id]);
  }, [navigateToCreateNotification]);

  const openBulkNotification = React.useCallback(async () => {
    if (selectedUsersCount === 0) return;

    setIsResolvingRecipients(true);
    try {
      const userIds = await resolveSelectedUserIds();
      navigateToCreateNotification(userIds);
    } catch (error) {
      console.error("Failed to resolve notification recipients", error);
    } finally {
      setIsResolvingRecipients(false);
    }
  }, [navigateToCreateNotification, resolveSelectedUserIds, selectedUsersCount]);

  React.useEffect(() => {
    resetUsersPage();
  }, [search, searchTerm, debouncedSearchTerm, kycFilter, roleFilter, activeFilter, documentFilter, dateRange, resetUsersPage]);

  const isUsersLoading = isLoading || isSearchDebouncing;

  const kycFilterLabel = kycFilter === "all"
    ? "KYC Status"
    : `KYC: ${kycFilter.charAt(0).toUpperCase()}${kycFilter.slice(1)}`;

  const roleFilterLabel = roleFilter === "all"
    ? "Role"
    : `Role: ${roleFilter.charAt(0).toUpperCase()}${roleFilter.slice(1)}`;

  const handleExportUsers = React.useCallback(async () => {
    let usersToExport: AdminUser[];

    if (selectedUsersCount === 0 || allFilteredSelected) {
      usersToExport = await fetchAllMatchingAdminUsers(adminUsersFetchFilters);
      if (selectAllMatchingFilters && excludedNotificationUsers.length > 0) {
        const excluded = new Set(excludedNotificationUsers);
        usersToExport = usersToExport.filter((user) => !excluded.has(user.id));
      }
    } else if (selectAllMatchingFilters) {
      const allUsers = await fetchAllMatchingAdminUsers(adminUsersFetchFilters);
      const excluded = new Set(excludedNotificationUsers);
      usersToExport = allUsers.filter((user) => !excluded.has(user.id));
    } else {
      const visibleSelected = filteredUsers.filter((user) =>
        selectedNotificationUsers.includes(user.id),
      );
      usersToExport =
        visibleSelected.length === selectedNotificationUsers.length
          ? visibleSelected
          : (await fetchAllMatchingAdminUsers(adminUsersFetchFilters)).filter((user) =>
            selectedNotificationUsers.includes(user.id),
          );
    }

    await exportToExcel({
      fileName: "gfolio-users.xlsx",
      sheetName: "Users",
      columns: [
        { header: "Name", key: "name", width: 25 },
        { header: "Email", key: "email", width: 30 },
        { header: "Phone", key: "phone", width: 18 },
        { header: "Role", key: "role", width: 15 },
        { header: "Referred By", key: "referredBy", width: 20 },
        { header: "KYC", key: "kyc", width: 15 },
        { header: "Status", key: "status", width: 12 },
        { header: "Created", key: "created", width: 25 },
        { header: "Updated", key: "updated", width: 25 },
        { header: "State", key: "state", width: 20 },
        { header: "City", key: "city", width: 20 },
      ],
      rows: usersToExport.map((user) => ({
        name: user.name ?? "-",
        email: user.email ?? "-",
        phone: user.phone ?? "-",
        role: user.role ?? "-",
        referredBy: user.referredBy ?? "-",
        kyc: user.kycVerified ?? "-",
        status: isUserActive(user) ? "Active" : "Inactive",
        created: user.createdAt ? formatDateTime(user.createdAt) : "-",
        updated: user.updatedAt ? formatDateTime(user.updatedAt) : "-",
        state: user.state ?? "-",
        city: user.city ?? "-",
      })),
    });
    setSelectedNotificationUsers([]);
    setTransferAnimation(false);
    setShowDownloadHint(false);

  }, [adminUsersFetchFilters, allFilteredSelected, excludedNotificationUsers, filteredUsers, selectAllMatchingFilters, selectedNotificationUsers, selectedUsersCount]);
  return (
    <>
      <Layout title="User Management">
        <Card className="flex h-[calc(100vh-7.5rem)] flex-col">
          <div className="p-6 border-b border-white/5 flex flex-col sm:flex-row gap-4 justify-between items-center">
            <div className="relative w-full sm:w-94">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search users by name, email, or phone..."
                className="pl-10"
              />
            </div>
            <TooltipProvider delayDuration={200}>
              <div className="relative inline-flex flex-nowrap items-center gap-2 w-full sm:w-auto">
                <DateRangePicker value={dateRange} onChange={setDateRange} />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex cursor-pointer transition-all duration-200 hover:scale-105">
                      <Button
                        variant="outline"
                        className="relative gap-2 transition-all duration-200"
                        onClick={openBulkNotification}
                        disabled={filteredUsers.length === 0 || selectedUsersCount === 0 || isResolvingRecipients}
                        aria-label={
                          selectedUsersCount > 0
                            ? `Send notification to ${selectedUsersCount} selected users`
                            : "Send notification to selected users"
                        }
                      >
                        <Bell className="h-4 w-4 cursor-pointer" />
                        {selectedUsersCount > 0 ? (
                          <span className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white">
                            {selectedUsersCount}
                          </span>
                        ) : null}
                      </Button>
                    </span>
                  </TooltipTrigger>

                  <TooltipContent
                    side="bottom"
                    sideOffset={8}
                    className="bg-gray-700 text-white text-xs px-3 py-2 rounded-md shadow-lg animate-in fade-in zoom-in-95 duration-200"
                  >
                    {selectedUsersCount > 0
                      ? `Send Notification (${selectedUsersCount})`
                      : "Send Notification"}
                  </TooltipContent>
                </Tooltip>
                <SelectionFeedback
                  transferAnimation={transferAnimation}
                  downloadBounce={downloadBounce}
                  showDownloadHint={showDownloadHint}
                  selectedCount={selectedUsersCount}
                  disabled={filteredUsers.length === 0}
                  onExport={handleExportUsers}
                  onAnimationComplete={() => {
                    setTransferAnimation(false);
                    setDownloadBounce((prev) => !prev);
                  }}
                />
              </div>
            </TooltipProvider>
          </div>

          <div className="min-h-0 w-full flex-1 overflow-auto">
            <TooltipProvider delayDuration={200}>
              <table className="min-w-[1240px] w-full text-sm ">
                <thead className="table-head-sticky">
                  <tr>
                    <th className="w-12 px-4 py-4 ps-6 text-left font-medium">
                      <Checkbox
                        checked={allFilteredSelected}
                        disabled={totalUsers === 0}
                        onCheckedChange={(checked) => {
                          toggleAllFilteredNotificationUsers(Boolean(checked));
                        }}
                        aria-label="Select all filtered users for notification"
                      />
                    </th>
                    <th className="px-4 py-4 text-left font-medium">
                      <button
                        type="button"
                        onClick={() => handleSort("name")}
                        className={`${getSortToggleClass(sortKey === "name")} `}
                      >
                        User <SortDirectionIcon active={sortKey === "name"} direction={sortDirection} />
                      </button>
                    </th>
                    <th className="px-4 py-4 font-medium">
                      <button
                        type="button"
                        onClick={() => handleSort("phone")}
                        className={`${getSortToggleClass(sortKey === "phone")} `}
                      >
                        Phone <SortDirectionIcon active={sortKey === "phone"} direction={sortDirection} />
                      </button>
                    </th>
                    <th className="px-4 py-4 font-medium">Role</th>
                    <th className="px-4 py-4 font-medium">
                      <button
                        type="button"
                        onClick={() => handleSort("referredBy")}
                        className={`${getSortToggleClass(sortKey === "referredBy")} `}
                      >
                        Referred By <SortDirectionIcon active={sortKey === "referredBy"} direction={sortDirection} />
                      </button>
                    </th>
                    <th className="w-[130px] px-4 py-4 font-medium">
                      <div className="flex items-center gap-1 ">
                        <span>KYC</span>
                        <TableHeaderFilter
                          title="KYC status"
                          value={kycFilter}
                          onChange={handleKycFilterChange}
                          options={[...KYC_FILTER_OPTIONS]}
                          activeWhen={(value) => value !== "all"}
                          clearValue="all"
                        />
                      </div>
                    </th>
                    <th className="w-[170px] px-4 py-4 font-medium">
                      <div className="flex items-center gap-1 ">
                        <span>Documents</span>
                        <TableHeaderFilter
                          title="Documents"
                          value={documentFilter}
                          onChange={handleDocumentFilterChange}
                          options={[...DOCUMENT_FILTER_OPTIONS]}
                          activeWhen={(value) => value !== "all"}
                          clearValue="all"
                        />
                      </div>
                    </th>
                    <th className="w-[130px] px-4 py-4 font-medium">
                      <div className="flex items-center gap-1 ">
                        <span>Status</span>
                        <TableHeaderFilter
                          title="Status"
                          value={activeFilter}
                          onChange={handleActiveFilterChange}
                          options={[...ACTIVE_FILTER_OPTIONS]}
                          activeWhen={(value) => value !== "all"}
                          clearValue="all"
                        />
                      </div>
                    </th>
                    <th className="px-4 py-4 font-medium">
                      <button
                        type="button"
                        onClick={() => handleSort("createdAt")}
                        className={`${getSortToggleClass(sortKey === "createdAt")} `}
                      >
                        Created At<SortDirectionIcon active={sortKey === "createdAt"} direction={sortDirection} />
                      </button>
                    </th>
                    <th className="px-4 py-4 font-medium">
                      <button
                        type="button"
                        onClick={() => handleSort("updatedAt")}
                        className={`${getSortToggleClass(sortKey === "updatedAt")} `}
                      >
                        Updated At<SortDirectionIcon active={sortKey === "updatedAt"} direction={sortDirection} />
                      </button>
                    </th>
                    <th className="px-4 py-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isUsersLoading ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-10 text-center text-sm text-muted-foreground">
                        Loading users...
                      </td>
                    </tr>
                  ) : isError ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-10 text-center text-sm text-destructive">
                        Failed to load users.
                      </td>
                    </tr>
                  ) : displayedUsers.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-10 text-center text-sm text-muted-foreground">
                        No users found.
                      </td>
                    </tr>
                  ) : (
                    displayedUsers.map((user) => (
                      <tr
                        key={user.id}
                        className={`border-b border-border transition-all duration-200 ${getSelectionRowClass(
                          isNotificationUserSelected(user.id),
                        )}`}
                      >
                        <td className="px-4 py-4 ps-6" onClick={(event) => event.stopPropagation()}>
                          <Checkbox
                            checked={isNotificationUserSelected(user.id)}
                            onCheckedChange={() => toggleNotificationUser(user.id)}
                            aria-label={`Select ${user.name ?? "user"} for notification`}
                          />
                        </td>

                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3 min-w-0">

                            {/* Avatar */}
                            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold shrink-0">
                              {String(user.name ?? "?").charAt(0).toUpperCase()}
                            </div>

                            {/* Name + Email */}
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2 min-w-0">
                                <Link
                                  href={`/users/${user.id}`}
                                  onClick={() => storeSelectedUser(user)}
                                  className="font-semibold text-muted-foreground truncate hover:text-primary"
                                >
                                  {user.name ?? "-"}
                                </Link>

                                <div className="flex items-center gap-1 h-6">
                                  {user.kycVerified === "approved" &&
                                    isDigiLockerVerifiedComment(user.kycComments) && (
                                      <img
                                        src={digiLockerIcon}
                                        alt="DigiLocker Verified"
                                        className="w-4 h-4 contain rounded"
                                      />
                                    )}
                                  {user.kycVerified === "approved" &&
                                    isCashfreeVerifiedComment(user.kycComments) && (
                                      <img
                                        src={cashfreeIcon}
                                        alt="Cashfree Verified"
                                        className="w-4 h-4 contain rounded"
                                      />
                                    )}
                                </div>
                              </div>

                              {user.email && (
                                <Link
                                  href={`/users/${user.id}`}
                                  onClick={() => storeSelectedUser(user)}
                                  className="text-xs text-gray truncate"
                                >
                                  {user.email}
                                </Link>
                              )}
                            </div>

                          </div>
                        </td>

                        <td className="px-4 py-4 text-muted-foreground whitespace-nowrap">{user.phone ?? "-"}</td>
                        <td className="px-4 py-4 text-center">
                          <Badge variant={user.role === "corporate" ? "success" : "default"}>
                            {String(user.role ?? "user").toUpperCase()}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 text-muted-foreground whitespace-nowrap text-center">
                          {user.referredBy ?? "-"}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <Badge variant={kycBadgeVariant(user.kycVerified)}>
                            {String(user.kycVerified ?? "unknown").toUpperCase()}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 text-left">
                          <div className="flex flex-wrap justify-start gap-3">
                            {groupKycDocuments(user.documents).length > 0 ? (
                              groupKycDocuments(user.documents).map((group) => (
                                <MuiTooltip key={group.id} title={group.label}>
                                  <div
                                    className="flex cursor-pointer items-center gap-1 capitalize hover:opacity-80"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleOpenDocumentGroup(group);
                                    }}
                                  >
                                    <img
                                      src={getDocumentIcon(group.label)}
                                      alt={group.label}
                                      className="h-6 w-6"
                                    />
                                    {formatDocumentGroupLabel(group.label)}
                                  </div>
                                </MuiTooltip>
                              ))
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <Badge variant={isUserActive(user) ? "success" : "destructive"}>
                            {isUserActive(user) ? "ACTIVE" : "INACTIVE"}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 text-center text-muted-foreground">
                          <DateTimeCell value={user.createdAt} />
                        </td>
                        <td className="px-4 py-4 text-center text-muted-foreground">
                          <DateTimeCell value={user.updatedAt} />
                        </td>

                        <td className="px-4 py-4 text-right whitespace-nowrap" onClick={(event) => event.stopPropagation()}>
                          <div className="inline-flex items-center justify-end gap-0.5 flex-nowrap">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 shrink-0 cursor-pointer"
                                  asChild
                                >
                                  <Link href={`/users/${user.id}`} onClick={() => storeSelectedUser(user)}>
                                    <Eye className="h-4 w-4" />
                                  </Link>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="bg-gray-700 text-white text-xs px-3 py-2 rounded-md shadow-lg animate-in fade-in zoom-in-95 duration-200" >View User Details</TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 shrink-0 cursor-pointer"
                                  aria-label="Send notification"
                                  onClick={() => openIndividualNotification(user)}
                                >
                                  <Bell className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="bg-gray-700 text-white text-xs px-3 py-2 rounded-md shadow-lg animate-in fade-in zoom-in-95 duration-200">Send Notification</TooltipContent>
                            </Tooltip>

                            {user.kycVerified !== "suspended" ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 shrink-0 cursor-pointer"
                                    aria-label="Suspend KYC"
                                    onClick={() => {
                                      setSelectedUserId(user.id);
                                      setSuspendOpen(true);
                                    }}
                                  >
                                    <UserRoundX className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent
                                  side="bottom"
                                  align="end"
                                  sideOffset={8}
                                  avoidCollisions={true}
                                  collisionPadding={{ right: 32, left: 16 }}
                                  className="bg-gray-700 text-white text-xs px-3 py-2 rounded-md shadow-lg animate-in fade-in zoom-in-95 duration-200"
                                >
                                  Suspend KYC
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0 cursor-pointer"
                                    aria-label="Unsuspend KYC"
                                    onClick={() => handleUnsuspendUser(user.id)}
                                  >
                                    <UserRoundCheck className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="bg-gray-700 text-white text-xs px-3 py-2 rounded-md shadow-lg animate-in fade-in zoom-in-95 duration-200">Unsuspend KYC</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </TooltipProvider>
          </div>

          <TablePaginationFooter
            totalItems={totalUsers}
            pageSize={pageSize}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            currentPage={currentPage}
            totalPages={totalPages}
            onPrevious={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => current + 1)}
            disableNext={!canGoNext}
            itemLabel="users"
          />
        </Card>
        <Dialog open={suspendOpen} onOpenChange={setSuspendOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Suspend KYC</DialogTitle>
              <DialogDescription>
                Add a comment before suspending this user.
              </DialogDescription>
            </DialogHeader>

            <Textarea
              value={suspendComment}
              onChange={(e) => setSuspendComment(e.target.value)}
              placeholder="Enter comment"
              className="min-h-[120px]"
            />

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSuspendOpen(false);
                  setSuspendComment("");
                }}
              >
                Cancel
              </Button>

              <Button variant="destructive" onClick={handleSuspendUser}>
                Suspend
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Layout>
      <ImagePreviewModal
        images={previewImages}
        label={previewLabel}
        onClose={closeDocumentPreview}
      />
    </>
  );
}
