import * as React from "react";
import { Layout } from "@/components/layout";
import { Badge, Button, Card } from "@/components/ui";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  ArrowLeft,
  BellRing,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  EyeOff,
  FileText,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
  Users,
  X,
} from "lucide-react";
import Tooltip from "@mui/material/Tooltip";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { cn, formatDateTime } from "@/lib/utils";
import { getTodayDateInputValue, parseDateInputValue } from "@/lib/date-range";
import { useLocation } from "wouter";
import { useRole } from "@/context/role";
import { customFetch } from "@/lib/custom-fetch";
import { buildAdminUsersApiUrl, buildAssetApiUrl, buildNotificationApiUrl } from "@/lib/api-config";
import { toast } from "@/hooks/use-toast";
import { MOBILE_NOTIFICATION_ROUTES } from "@/constants/mobile-notification-routes";
import { SingleDatePicker } from "@/components/ui/date-picker";
import { TablePaginationFooter } from "@/components/table-pagination-footer";
import { bindTablePaginationFooter, useTablePagination } from "@/lib/table-pagination";
import { getSortToggleClass, SortDirectionIcon, useTableSort } from "@/lib/table-sort";
import {
  applyTemplateVariables,
  extractTemplateVariables,
  formatTemplateVariableLabel,
  NotificationHtmlTemplateDesigner,
  wrapNotificationTemplatePreview,
} from "@/components/notification-html-template-designer";

type NotificationTemplate = {
  _id: string;
  templateName: string;
  htmlTemplate: string;
  variables: string[];
  route?: string;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type CreateNotificationTab = "send" | "templates";
type TemplateSortKey = "name" | "variables" | "status" | "createdAt" | "updatedAt";

const CREATE_NOTIFICATION_TABS = [
  { id: "send", label: "Create Notification" },
  { id: "templates", label: "Template" },
] as const satisfies ReadonlyArray<{ id: CreateNotificationTab; label: string }>;

const NOTIFICATION_RECIPIENTS_STORAGE_KEY = "gfolio-admin:notification-recipients";
const NOTIFICATION_RETURN_PATH_STORAGE_KEY = "gfolio-admin:notification-return-path";
const USERS_NOTIFICATION_SELECTION_STORAGE_KEY = "gfolio-admin:users-notification-selection";

function getInitialCreateNotificationTab(): CreateNotificationTab {
  if (typeof window === "undefined") return "send";

  const tab = new URLSearchParams(window.location.search).get("tab");
  return tab === "templates" ? "templates" : "send";
}

function syncCreateNotificationTabToUrl(tab: CreateNotificationTab) {
  const params = new URLSearchParams(window.location.search);

  if (tab === "templates") {
    params.set("tab", "templates");
  } else {
    params.delete("tab");
  }

  const query = params.toString();
  const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState({}, "", nextUrl);
}

const EMPTY_TEMPLATE_FORM = {
  templateId: "",
  name: "",
  content: "",
  route: "",
  active: true,
};

const primaryActionButtonClassName =
  "cursor-pointer gap-2 !text-white [&_svg]:!stroke-white [&_svg]:!text-white";

const primaryActionIconClassName = "h-4 w-4 shrink-0 !stroke-white !text-white";

function getTemplateVariableNames(template: NotificationTemplate) {
  const htmlTokens = extractTemplateVariables(template.htmlTemplate);
  if (htmlTokens.length === 0) {
    return template.variables;
  }

  const seen = new Set<string>();
  const merged: string[] = [];

  for (const token of htmlTokens) {
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(token);
  }

  for (const variable of template.variables) {
    const key = variable.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(variable);
  }

  return merged;
}

function getNormalizedTemplateVariableKeys(template: NotificationTemplate) {
  return new Set(
    getTemplateVariableNames(template).map((variable) => variable.toLowerCase())
  );
}

function templateUsesLiveMetalPrices(template: NotificationTemplate) {
  const variables = getNormalizedTemplateVariableKeys(template);
  return variables.has("goldprice") || variables.has("silverprice");
}

function templateUsesMetalDropComparison(template: NotificationTemplate) {
  const variables = getNormalizedTemplateVariableKeys(template);
  return variables.has("golddrop") || variables.has("silverdrop");
}

function isLiveMetalPriceVariable(variable: string) {
  const normalized = variable.toLowerCase();
  return normalized === "goldprice" || normalized === "silverprice";
}

function isMetalDropVariable(variable: string) {
  const normalized = variable.toLowerCase();
  return normalized === "golddrop" || normalized === "silverdrop";
}

function getEditableTemplateVariables(template: NotificationTemplate) {
  return getTemplateVariableNames(template).filter(
    (variable) => variable.toLowerCase() !== "name"
  );
}

function buildTemplateVariableState(
  template: NotificationTemplate,
  currentValues: Record<string, string> = {}
) {
  const variableNames = getEditableTemplateVariables(template);

  return Object.fromEntries(
    variableNames.map((variable) => {
      const existingValue =
        currentValues[variable] ??
        Object.entries(currentValues).find(
          ([key]) => key.toLowerCase() === variable.toLowerCase()
        )?.[1] ??
        "";

      return [variable, existingValue];
    })
  );
}

function buildTemplateDataPayload(
  variableNames: string[],
  values: Record<string, string>
) {
  return Object.fromEntries(
    variableNames.map((variable) => {
      const value =
        values[variable] ??
        Object.entries(values).find(
          ([key]) => key.toLowerCase() === variable.toLowerCase()
        )?.[1] ??
        "";

      return [variable, value.trim()];
    })
  );
}

type MetalPriceRow = {
  providerName?: string;
  metalType?: string;
  priceData?: Record<string, unknown>;
};

const GET_METAL_PRICES_ENDPOINT = buildAssetApiUrl("/services/getMetalPrices");
const GET_HISTORICAL_METAL_PRICES_ENDPOINT = buildAssetApiUrl(
  "/services/getHistoricalMetalPrices"
);
function parsePositiveNumber(...candidates: unknown[]) {
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return null;
}

function formatMetalPrice(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "";
  return value.toFixed(2);
}

function formatMetalPriceChange(historicalRate: number, liveRate: number) {
  const change = liveRate - historicalRate;
  if (!Number.isFinite(change)) return "";
  if (change === 0) return "0.00";

  const sign = change > 0 ? "+" : "-";
  return `${sign}${formatMetalPrice(Math.abs(change))}`;
}

function findMetalPriceRow(rows: MetalPriceRow[], metalType: "GOLD" | "SILVER") {
  const matchesType = (row: MetalPriceRow) => row.metalType?.toUpperCase() === metalType;

  return (
    rows.find((row) => row.providerName === "AUGMONT" && matchesType(row)) ??
    rows.find(matchesType)
  );
}

function readMetalPriceSource(row: MetalPriceRow | undefined) {
  if (!row?.priceData || typeof row.priceData !== "object") {
    return undefined;
  }

  const priceData = row.priceData;
  const nestedData = priceData.data;
  if (nestedData && typeof nestedData === "object") {
    return nestedData as Record<string, unknown>;
  }

  const resultData = (priceData.result as Record<string, unknown> | undefined)?.data;
  if (resultData && typeof resultData === "object") {
    return resultData as Record<string, unknown>;
  }

  return priceData;
}

function extractLiveMetalPrice(
  source: Record<string, unknown> | undefined,
  metal: "gold" | "silver"
) {
  if (!source) return null;

  const rates =
    source.rates && typeof source.rates === "object"
      ? (source.rates as Record<string, unknown>)
      : undefined;

  if (metal === "gold") {
    return parsePositiveNumber(
      source.buyGoldRate,
      rates?.gBuy,
      source.gBuy,
      source.saleGoldRate,
      rates?.gSell
    );
  }

  return parsePositiveNumber(
    source.buySilverRate,
    rates?.sBuy,
    source.sBuy,
    source.saleSilverRate,
    rates?.sSell,
    source.silverPricePerGram
  );
}

function extractHistoricalBuyRate(metalPayload: unknown) {
  if (!metalPayload || typeof metalPayload !== "object") {
    return null;
  }

  const metal = metalPayload as Record<string, unknown>;
  const entryLists = [metal.data, (metal.result as Record<string, unknown> | undefined)?.data];
  let firstEntry: Record<string, unknown> | undefined;

  for (const entries of entryLists) {
    if (!Array.isArray(entries) || entries.length === 0) continue;
    const candidate = entries[0];
    if (candidate && typeof candidate === "object") {
      firstEntry = candidate as Record<string, unknown>;
      break;
    }
  }

  if (!firstEntry) {
    return null;
  }

  return parsePositiveNumber(
    firstEntry.buyRate,
    firstEntry.sellRate,
    firstEntry.buySilverRate,
    firstEntry.buyGoldRate
  );
}

function assignTemplateVariableValue(
  values: Record<string, string>,
  template: NotificationTemplate,
  variable: string,
  value: string
) {
  const next = { ...values, [variable]: value };

  for (const token of extractTemplateVariables(template.htmlTemplate)) {
    if (token.toLowerCase() === variable.toLowerCase()) {
      next[token] = value;
    }
  }

  for (const token of template.variables ?? []) {
    if (token.toLowerCase() === variable.toLowerCase()) {
      next[token] = value;
    }
  }

  return next;
}

function normalizeMetalPriceRows(value: unknown): MetalPriceRow[] {
  if (Array.isArray(value)) {
    return value as MetalPriceRow[];
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.data)) {
      return record.data as MetalPriceRow[];
    }
  }

  return [];
}

async function fetchLiveMetalPrices() {
  const response = await customFetch<{ data?: MetalPriceRow[] }>(GET_METAL_PRICES_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });

  return normalizeMetalPriceRows(response);
}

type HistoricalMetalPriceEntry = {
  date?: string;
  type?: string;
  buyRate?: string;
  sellRate?: string;
};

type HistoricalMetalPrices = {
  goldBuyRate: number | null;
  silverBuyRate: number | null;
};

async function fetchHistoricalMetalPrices(date: string): Promise<HistoricalMetalPrices> {
  const response = await customFetch<{
    success?: boolean;
    data?: {
      gold?: { data?: HistoricalMetalPriceEntry[] };
      silver?: { data?: HistoricalMetalPriceEntry[] };
    };
  }>(GET_HISTORICAL_METAL_PRICES_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ date }),
  });

  return {
    goldBuyRate: extractHistoricalBuyRate(response?.data?.gold),
    silverBuyRate: extractHistoricalBuyRate(response?.data?.silver),
  };
}

function extractAugmontMetalPrices(rows: MetalPriceRow[]) {
  const goldRow = findMetalPriceRow(rows, "GOLD");
  const silverRow = findMetalPriceRow(rows, "SILVER");

  return {
    goldPrice: extractLiveMetalPrice(readMetalPriceSource(goldRow), "gold"),
    silverPrice: extractLiveMetalPrice(readMetalPriceSource(silverRow), "silver"),
  };
}

function applyLiveMetalPricesToVariables(
  template: NotificationTemplate,
  currentValues: Record<string, string>,
  prices: { goldPrice: number | null; silverPrice: number | null }
) {
  let next = { ...currentValues };

  for (const variable of getEditableTemplateVariables(template)) {
    const normalized = variable.toLowerCase();

    if (normalized === "goldprice" && prices.goldPrice != null) {
      next = assignTemplateVariableValue(
        next,
        template,
        variable,
        formatMetalPrice(prices.goldPrice)
      );
    }

    if (normalized === "silverprice" && prices.silverPrice != null) {
      next = assignTemplateVariableValue(
        next,
        template,
        variable,
        formatMetalPrice(prices.silverPrice)
      );
    }
  }

  return next;
}

function applyPriceDropToVariables(
  template: NotificationTemplate,
  currentValues: Record<string, string>,
  livePrices: { goldPrice: number | null; silverPrice: number | null },
  historicalPrices: HistoricalMetalPrices
) {
  let next = applyLiveMetalPricesToVariables(template, currentValues, livePrices);

  for (const variable of getEditableTemplateVariables(template)) {
    const normalized = variable.toLowerCase();

    if (
      normalized === "golddrop" &&
      historicalPrices.goldBuyRate != null &&
      livePrices.goldPrice != null
    ) {
      next = assignTemplateVariableValue(
        next,
        template,
        variable,
        formatMetalPriceChange(historicalPrices.goldBuyRate, livePrices.goldPrice)
      );
    }

    if (
      normalized === "silverdrop" &&
      historicalPrices.silverBuyRate != null &&
      livePrices.silverPrice != null
    ) {
      next = assignTemplateVariableValue(
        next,
        template,
        variable,
        formatMetalPriceChange(historicalPrices.silverBuyRate, livePrices.silverPrice)
      );
    }
  }

  return next;
}

type AdminUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  state: string;
  city: string;
  gender: string;
  kycVerified: string;
  purchaseMade?: boolean;
  firstPurchaseOnly?: boolean;
  noSip?: boolean;
  noOfferOpted?: boolean;
  referralReward?: boolean;
  lastPurchaseDate?: string;
  lastPurchaseIn7Days?: boolean;
  lastPurchaseIn30Days?: boolean;
  lastPurchaseIn60Days?: boolean;
  lastPurchaseIn90Days?: boolean;
};
type TriStateFilter = "" | "yes" | "no";
type TriStateControlProps = {
  label: string;
  value: TriStateFilter;
  onChange: (value: TriStateFilter) => void;
  compact?: boolean;
};
type AudienceFilterSectionProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  className?: string;
  children: React.ReactNode;
};
const normalizeSearchValue = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

function readAdminTextField(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function unwrapAdminUsersResponse(data: unknown): unknown[] {
  if (!data || typeof data !== "object") return [];

  const record = data as Record<string, unknown>;
  if (Array.isArray(record.users)) return record.users;

  if (
    record.data &&
    typeof record.data === "object" &&
    Array.isArray((record.data as Record<string, unknown>).users)
  ) {
    return (record.data as Record<string, unknown>).users as unknown[];
  }

  if (Array.isArray(data)) return data;

  return [];
}

function normalizeAdminUser(value: unknown): AdminUser | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const rawId = record.id ?? record._id;
  if (rawId == null) return null;

  return {
    id: String(rawId),
    name: readAdminTextField(record.name),
    email: readAdminTextField(record.email),
    phone: readAdminTextField(record.phone),
    state: readAdminTextField(record.state),
    city: readAdminTextField(record.city),
    gender: readAdminTextField(record.gender),
    kycVerified:
      typeof record.kycVerified === "string"
        ? record.kycVerified
        : typeof record.kycStatus === "string"
          ? record.kycStatus
          : "",
    purchaseMade: typeof record.purchaseMade === "boolean" ? record.purchaseMade : undefined,
    firstPurchaseOnly:
      typeof record.firstPurchaseOnly === "boolean" ? record.firstPurchaseOnly : undefined,
    noSip: typeof record.noSip === "boolean" ? record.noSip : undefined,
    noOfferOpted: typeof record.noOfferOpted === "boolean" ? record.noOfferOpted : undefined,
    referralReward:
      typeof record.referralReward === "boolean" ? record.referralReward : undefined,
    lastPurchaseDate:
      typeof record.lastPurchaseDate === "string" ? record.lastPurchaseDate : undefined,
    lastPurchaseIn7Days:
      typeof record.lastPurchaseIn7Days === "boolean" ? record.lastPurchaseIn7Days : undefined,
    lastPurchaseIn30Days:
      typeof record.lastPurchaseIn30Days === "boolean" ? record.lastPurchaseIn30Days : undefined,
    lastPurchaseIn60Days:
      typeof record.lastPurchaseIn60Days === "boolean" ? record.lastPurchaseIn60Days : undefined,
    lastPurchaseIn90Days:
      typeof record.lastPurchaseIn90Days === "boolean" ? record.lastPurchaseIn90Days : undefined,
  };
}

function normalizeAdminUsers(users: unknown[]): AdminUser[] {
  return users
    .map(normalizeAdminUser)
    .filter((user): user is AdminUser => user !== null);
}

const digitsOnly = (value: string) => value.replace(/\D/g, "");
const NONE_ROUTE_VALUE = "__none__";
const CUSTOM_TEMPLATE_VALUE = "__custom__";
const TEMPLATE_MULTILINE_VARIABLES = new Set(["title", "content"]);
const GET_NOTIFICATION_TEMPLATES_ENDPOINT = buildNotificationApiUrl(
  "/notificationTemplates/getTemplates"
);
const CREATE_NOTIFICATION_TEMPLATE_ENDPOINT = buildNotificationApiUrl(
  "/notificationTemplates/createTemplate"
);
const GET_TEMPLATE_BY_ID_ENDPOINT = buildNotificationApiUrl(
  "/notificationTemplates/getTemplateById"
);
const UPDATE_NOTIFICATION_TEMPLATE_ENDPOINT = buildNotificationApiUrl(
  "/notificationTemplates/updateTemplate"
);
const DELETE_NOTIFICATION_TEMPLATE_ENDPOINT = buildNotificationApiUrl(
  "/notificationTemplates/deleteTemplate"
);

async function fetchNotificationTemplateById(templateId: string) {
  const response = await customFetch<{
    status?: string;
    data?: NotificationTemplate;
  }>(GET_TEMPLATE_BY_ID_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ templateId }),
  });

  if (!response?.data) {
    throw new Error("Template not found.");
  }

  return response.data;
}

const matchesTriState = (value: boolean, filter: TriStateFilter) =>
  filter === "" || (filter === "yes" ? value : !value);

const getKycStatus = (user: AdminUser) =>
  normalizeSearchValue(user.kycVerified);

const matchesKycFilter = (user: AdminUser, filter: TriStateFilter) => {
  if (filter === "") return true;

  const kycStatus = getKycStatus(user);
  const isApproved = kycStatus === "approved" || kycStatus === "verified";
  const isPending = kycStatus === "pending" || kycStatus === "";

  if (filter === "yes") return isApproved;
  if (filter === "no") return isPending && !isApproved;

  return true;
};

const getLastPurchaseInPeriod = (user: AdminUser, days: string) => {
  if (days === "7") return user.lastPurchaseIn7Days ?? false;
  if (days === "30") return user.lastPurchaseIn30Days ?? false;
  if (days === "60") return user.lastPurchaseIn60Days ?? false;
  if (days === "90") return user.lastPurchaseIn90Days ?? false;
  return false;
};

const matchesAudienceFilters = (
  user: AdminUser,
  filters: {
    gender: string;
    state: { name: string } | null;
    city: string;
    kycCompletedFilter: TriStateFilter;
    purchaseMadeFilter: TriStateFilter;
    firstPurchaseOnlyFilter: TriStateFilter;
    noSipFilter: TriStateFilter;
    noOfferFilter: TriStateFilter;
    referralRewardFilter: TriStateFilter;
    lastPurchaseDays: string;
    lastPurchaseFilter: TriStateFilter;
  }
) => {
  if (
    filters.gender &&
    normalizeSearchValue(user.gender) !== normalizeSearchValue(filters.gender)
  ) {
    return false;
  }

  if (
    filters.state &&
    normalizeSearchValue(user.state) !== normalizeSearchValue(filters.state.name)
  ) {
    return false;
  }

  if (filters.city && normalizeSearchValue(user.city) !== normalizeSearchValue(filters.city)) {
    return false;
  }

  if (!matchesKycFilter(user, filters.kycCompletedFilter)) return false;
  if (!matchesTriState(user.purchaseMade ?? false, filters.purchaseMadeFilter)) return false;
  if (!matchesTriState(user.firstPurchaseOnly ?? false, filters.firstPurchaseOnlyFilter)) {
    return false;
  }
  if (!matchesTriState(user.noSip ?? false, filters.noSipFilter)) return false;
  if (!matchesTriState(user.noOfferOpted ?? false, filters.noOfferFilter)) return false;
  if (!matchesTriState(user.referralReward ?? false, filters.referralRewardFilter)) return false;

  if (filters.lastPurchaseDays && filters.lastPurchaseFilter) {
    const purchasedInPeriod = getLastPurchaseInPeriod(user, filters.lastPurchaseDays);
    if (!matchesTriState(purchasedInPeriod, filters.lastPurchaseFilter)) {
      return false;
    }
  }

  return true;
};

const isUnnamedRecipient = (user: AdminUser) => !user.name.trim();

const getRecipientSortLabel = (user: AdminUser) =>
  user.name.trim() || user.email.trim() || user.phone.trim() || user.id;

const compareRecipients = (
  a: AdminUser,
  b: AdminUser,
  rankA?: number,
  rankB?: number
) => {
  if (rankA != null && rankB != null && rankA !== rankB) {
    return rankA - rankB;
  }

  const aUnnamed = isUnnamedRecipient(a);
  const bUnnamed = isUnnamedRecipient(b);
  if (aUnnamed !== bUnnamed) return aUnnamed ? 1 : -1;

  return getRecipientSortLabel(a).localeCompare(getRecipientSortLabel(b));
};

const getRecipientSearchRank = (user: AdminUser, term: string) => {
  const name = normalizeSearchValue(user.name);
  const email = normalizeSearchValue(user.email);
  const phone = digitsOnly(user.phone);
  const searchWords = term.split(/\s+/).filter(Boolean);
  const nameWords = name.split(/\s+/).filter(Boolean);
  const phoneTerm = digitsOnly(term);
  const compactTerm = term.replace(/\s+/g, "");
  const looksLikeEmail = term.includes("@") || term.includes(".");
  const looksLikePhone = phoneTerm.length > 0 && phoneTerm.length === compactTerm.length;

  if (
    searchWords.length > 0 &&
    nameWords.length > 0 &&
    searchWords.every((searchWord) =>
      nameWords.some((nameWord) => nameWord.startsWith(searchWord))
    )
  ) {
    return name.startsWith(term) ? 0 : 1;
  }

  if (
    searchWords.length > 0 &&
    nameWords.length > 0 &&
    searchWords.every((searchWord) => name.includes(searchWord))
  ) {
    return 2;
  }

  if (looksLikeEmail && email.includes(term)) return 3;

  if (looksLikePhone && phone.includes(phoneTerm)) return 4;

  if (email.includes(term)) return 5;

  if (phoneTerm && phone.includes(phoneTerm)) return 6;

  return null;
};

function AudienceFilterSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TriStateFilter;
  onChange: (value: TriStateFilter) => void;
}) {
  return (
    <Select
      value={value || "any"}
      onValueChange={(next) => onChange(next === "any" ? "" : (next as TriStateFilter))}
    >
      <SelectTrigger
        className={cn(
          "h-8 rounded-md border-border bg-background text-xs",
          value && "border-primary/40 bg-primary/5 text-primary"
        )}
      >
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="any">{label}: Any</SelectItem>
        <SelectItem value="yes">{label}: Yes</SelectItem>
        <SelectItem value="no">{label}: No</SelectItem>
      </SelectContent>
    </Select>
  );
}

function TriStateControl({ label, value, onChange, compact = false }: TriStateControlProps) {
  const options: { value: TriStateFilter; label: string }[] = [
    { value: "yes", label: "Yes" },
    { value: "no", label: "No" },
  ];

  return (
    <div className="min-w-0 space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      <div className="flex items-center gap-1.5">
        <div className="grid w-30 shrink-0 grid-cols-2 rounded-lg border border-border bg-background p-0.5">
          {options.map((option) => (
            <button
              key={`${label}-${option.value || "any"}`}
              type="button"
              onClick={() => onChange(value === option.value ? "" : option.value)}
              className={`${compact ? "h-7 px-1.5" : "h-8 px-2"} rounded-md text-xs font-medium transition-colors ${value === option.value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label={`Clear ${label} filter`}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
          >
            ✕
          </button>
        ) : null}
      </div>
    </div>
  );
}

function AudienceFilterSection({
  icon,
  title,
  description,
  className = "",
  children,
}: AudienceFilterSectionProps) {
  return (
    <div className={`rounded-2xl border border-border bg-muted/20 p-3 ${className}`}>
      <div className="mb-3 flex items-start gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background text-primary">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

const fieldLabelClass = "text-sm font-medium text-foreground";
const fieldControlClass = "mt-1.5 h-10 rounded-lg border-border bg-background";
const sectionTitleClass = "text-sm font-semibold text-foreground";
const sectionHintClass = "text-xs text-muted-foreground";

function getTodayStartDate() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

const TODAY_START_DATE = getTodayStartDate();

type NotificationFormErrors = {
  deliveryChannel?: string;
  scheduledDate?: string;
  priceDropDate?: string;
  content?: string;
  recipients?: string;
  templateVariables?: Record<string, string>;
};

function getCurrentTimeInputValue() {
  const now = new Date();
  return String(now.getHours()).padStart(2, "0");
}

function buildScheduledDateTime(dateValue: unknown, timeValue: string) {
  const date =
    dateValue instanceof Date
      ? dateValue
      : parseDateInputValue(String(dateValue ?? ""));
  const hours = Number(timeValue);

  if (
    !date ||
    Number.isNaN(date.getTime()) ||
    !timeValue.trim() ||
    !Number.isInteger(hours) ||
    hours < 0 ||
    hours > 23
  ) {
    return null;
  }

  const scheduledDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  scheduledDate.setHours(hours, 0, 0, 0);
  return scheduledDate;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1.5 text-sm text-destructive">{message}</p>;
}

function hasFormErrors(errors: NotificationFormErrors) {
  if (
    errors.deliveryChannel ||
    errors.scheduledDate ||
    errors.priceDropDate ||
    errors.content ||
    errors.recipients
  ) {
    return true;
  }

  return Boolean(errors.templateVariables && Object.keys(errors.templateVariables).length > 0);
}

function getTemplateVariableValue(
  variable: string,
  values: Record<string, string>
) {
  return (
    values[variable] ??
    Object.entries(values).find(([key]) => key.toLowerCase() === variable.toLowerCase())?.[1]
  );
}

function validateNotificationForm({
  selectedDeliveryChannel,
  isCustomNotification,
  needsComparisonDate,
  needsLiveMetalPrices,
  selectedDate,
  selectedTime,
  priceDropDate,
  selectedUsers,
  activeTemplateVariables,
  templateVariables,
  content,
}: {
  selectedDeliveryChannel: string;
  isCustomNotification: boolean;
  needsComparisonDate: boolean;
  needsLiveMetalPrices: boolean;
  selectedDate: unknown;
  selectedTime: string;
  priceDropDate: string;
  selectedUsers: string[];
  activeTemplateVariables: string[];
  templateVariables: Record<string, string>;
  content: string;
}): NotificationFormErrors {
  const errors: NotificationFormErrors = {};

  if (!selectedDeliveryChannel) {
    errors.deliveryChannel = "Select a delivery channel.";
  }

  if (isCustomNotification) {
    if (!selectedDate) {
      errors.scheduledDate = "Select a scheduled date.";
    }

    const scheduledDate = buildScheduledDateTime(selectedDate, selectedTime);
    if (scheduledDate && scheduledDate < new Date()) {
      errors.scheduledDate = "Scheduled date cannot be in the past.";
    }

    if (!content.trim()) {
      errors.content = "Enter message content.";
    }
  } else {
    if (needsComparisonDate && !priceDropDate.trim()) {
      errors.priceDropDate = "Select a comparison date.";
    }

    const templateVariableErrors: Record<string, string> = {};

    for (const variable of activeTemplateVariables) {
      const value = getTemplateVariableValue(variable, templateVariables);

      if (isMetalDropVariable(variable)) {
        if (needsComparisonDate && !value?.trim()) {
          templateVariableErrors[variable] = !priceDropDate.trim()
            ? `Select a comparison date to calculate ${formatTemplateVariableLabel(variable).toLowerCase()}.`
            : `Unable to calculate ${formatTemplateVariableLabel(variable).toLowerCase()}.`;
        }
        continue;
      }

      if (isLiveMetalPriceVariable(variable)) {
        if (needsLiveMetalPrices && !value?.trim()) {
          templateVariableErrors[variable] =
            `Load live prices to fill ${formatTemplateVariableLabel(variable).toLowerCase()}.`;
        }
        continue;
      }

      if (!value?.trim()) {
        templateVariableErrors[variable] =
          `Enter ${formatTemplateVariableLabel(variable).toLowerCase()}.`;
      }
    }

    if (Object.keys(templateVariableErrors).length > 0) {
      errors.templateVariables = templateVariableErrors;
    }
  }

  if (selectedUsers.length === 0) {
    errors.recipients = "Select at least one recipient.";
  }

  return errors;
}

function FormField({
  label,
  children,
  className,
  error,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  error?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label className={fieldLabelClass}>{label}</label>
      {children}
      <FieldError message={error} />
    </div>
  );
}

export default function CreateNotification() {
  const [, navigate] = useLocation();
  const { role } = useRole();
  const showNotificationsBackButton = role === "marketing";
  const [activeTab, setActiveTab] = React.useState<CreateNotificationTab>(getInitialCreateNotificationTab);

  const handleTabChange = React.useCallback((tab: CreateNotificationTab) => {
    setActiveTab(tab);
    syncCreateNotificationTabToUrl(tab);
  }, []);
  const [templateDialogOpen, setTemplateDialogOpen] = React.useState(false);
  const [templateDialogMode, setTemplateDialogMode] = React.useState<"create" | "edit">("create");
  const [templateForm, setTemplateForm] = React.useState(EMPTY_TEMPLATE_FORM);
  const [isSavingTemplate, setIsSavingTemplate] = React.useState(false);
  const [isLoadingTemplate, setIsLoadingTemplate] = React.useState(false);
  const [deleteTemplate, setDeleteTemplate] = React.useState<NotificationTemplate | null>(null);
  const [isDeletingTemplate, setIsDeletingTemplate] = React.useState(false);
  const {
    sortKey: templateSortKey,
    sortDirection: templateSortDirection,
    directionFactor: templateDirectionFactor,
    handleSort: handleTemplateSort,
  } = useTableSort<TemplateSortKey>();

  const [selectedUsers, setSelectedUsers] = React.useState<string[]>([]);
  const [pinnedRecipientIds, setPinnedRecipientIds] = React.useState<string[]>([]);
  const [notificationReturnPath, setNotificationReturnPath] = React.useState<string | null>(null);
  const [selectedNotificationType, setSelectedNotificationType] = React.useState("");
  const [selectedDeliveryChannel, setSelectedDeliveryChannel] = React.useState("");
  const [selectedRoute, setSelectedRoute] = React.useState("");
  const [selectedTemplateId, setSelectedTemplateId] = React.useState(CUSTOM_TEMPLATE_VALUE);
  const [templates, setTemplates] = React.useState<NotificationTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = React.useState(false);
  const [templateVariables, setTemplateVariables] = React.useState<Record<string, string>>({});
  const [content, setContent] = React.useState("");
  const ADMIN_USERS_ENDPOINT = buildAdminUsersApiUrl("/admin/getAdminUsers");
  const [adminUsers, setAdminUsers] = React.useState<AdminUser[]>([]);
  const [selectedDate, setSelectedDate] = React.useState<any>(new Date());
  const [selectedTime, setSelectedTime] = React.useState(getCurrentTimeInputValue);
  const [recipientSearch, setRecipientSearch] = React.useState("");
  const [isSending, setIsSending] = React.useState(false);
  const [isLoadingMetalPrices, setIsLoadingMetalPrices] = React.useState(false);
  const [priceDropDate, setPriceDropDate] = React.useState("");
  const [isLoadingHistoricalPrices, setIsLoadingHistoricalPrices] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<NotificationFormErrors>({});
  const [gender, setGender] = React.useState("");
  const [kycCompletedFilter, setKycCompletedFilter] = React.useState<TriStateFilter>("");
  const [purchaseMadeFilter, setPurchaseMadeFilter] = React.useState<TriStateFilter>("");
  const [lastPurchaseDays, setLastPurchaseDays] = React.useState("");
  const [lastPurchaseFilter, setLastPurchaseFilter] = React.useState<TriStateFilter>("");
  const [firstPurchaseOnlyFilter, setFirstPurchaseOnlyFilter] = React.useState<TriStateFilter>("");
  const [noSipFilter, setNoSipFilter] = React.useState<TriStateFilter>("");
  const [noOfferFilter, setNoOfferFilter] = React.useState<TriStateFilter>("");
  const [referralRewardFilter, setReferralRewardFilter] = React.useState<TriStateFilter>("");
  // const [year, setYear] = React.useState("");
  const [state, setState] = React.useState<any>(null);
  const [city, setCity] = React.useState("");
  const [statesList, setStatesList] = React.useState<any[]>([]);
  const [citiesList, setCitiesList] = React.useState<any[]>([]);
  const [stateSearch, setStateSearch] = React.useState("");
  const [citySearch, setCitySearch] = React.useState("");
  const [isStateOpen, setIsStateOpen] = React.useState(false);
  const [isCityOpen, setIsCityOpen] = React.useState(false);
  const [showFilters, setShowFilters] = React.useState(false);
  const [messageSetupCollapsed, setMessageSetupCollapsed] = React.useState(false);

  const [showPreview, setShowPreview] = React.useState(true);
  const stateDropdownRef = React.useRef<HTMLDivElement>(null);
  const cityDropdownRef = React.useRef<HTMLDivElement>(null);
  // const years = React.useMemo(() => {
  //   const currentYear = new Date().getFullYear();
  //   return Array.from({ length: 60 }, (_, i) => String(currentYear - i));
  // }, []);

  const filteredStates = React.useMemo(() => {
    if (!stateSearch) return statesList;

    return statesList.filter((s: any) =>
      s.name.toLowerCase().includes(stateSearch.toLowerCase())
    );
  }, [statesList, stateSearch]);
  const filteredCities = React.useMemo(() => {
    if (!state) return [];

    return citiesList.filter(
      (c: any) => c.stateId === state.id
    );
  }, [citiesList, state]);
  const filteredCitiesSearch = React.useMemo(() => {
    if (!citySearch) return filteredCities;

    return filteredCities.filter((c: any) =>
      c.name.toLowerCase().includes(citySearch.toLowerCase())
    );
  }, [filteredCities, citySearch]);

  const filteredUsers = React.useMemo(() => {
    const term = normalizeSearchValue(recipientSearch);
    const audienceFilters = {
      gender,
      state,
      city,
      kycCompletedFilter,
      purchaseMadeFilter,
      firstPurchaseOnlyFilter,
      noSipFilter,
      noOfferFilter,
      referralRewardFilter,
      lastPurchaseDays,
      lastPurchaseFilter,
    };

    let users = adminUsers.filter((user) => matchesAudienceFilters(user, audienceFilters));

    if (!term) return users;

    return users
      .map((user) => ({
        user,
        rank: getRecipientSearchRank(user, term),
      }))
      .filter((item): item is { user: AdminUser; rank: number } => item.rank !== null)
      .sort((a, b) => compareRecipients(a.user, b.user, a.rank, b.rank))
      .map((item) => item.user);
  }, [
    adminUsers,
    recipientSearch,
    gender,
    state,
    city,
    kycCompletedFilter,
    purchaseMadeFilter,
    firstPurchaseOnlyFilter,
    noSipFilter,
    noOfferFilter,
    referralRewardFilter,
    lastPurchaseDays,
    lastPurchaseFilter,
  ]);

  const pinnedRecipients = React.useMemo(() => {
    if (pinnedRecipientIds.length === 0) return [];

    const usersById = new Map(adminUsers.map((user) => [user.id, user]));
    return pinnedRecipientIds
      .map((id) => usersById.get(id))
      .filter((user): user is AdminUser => user !== undefined);
  }, [adminUsers, pinnedRecipientIds]);

  const listedRecipients = React.useMemo(() => {
    const pinnedIds = new Set(pinnedRecipientIds);

    return filteredUsers
      .filter((user) => !pinnedIds.has(user.id))
      .sort((a, b) => {
        const aSelected = selectedUsers.includes(a.id);
        const bSelected = selectedUsers.includes(b.id);
        if (aSelected === bSelected) return 0;
        return aSelected ? -1 : 1;
      });
  }, [filteredUsers, pinnedRecipientIds, selectedUsers]);

  const sortedTemplates = React.useMemo(() => {
    if (!templateSortKey) return templates;

    return [...templates].sort((a, b) => {
      if (templateSortKey === "name") {
        return a.templateName.localeCompare(b.templateName) * templateDirectionFactor;
      }
      if (templateSortKey === "variables") {
        return (
          ((a.variables?.length ?? 0) - (b.variables?.length ?? 0)) * templateDirectionFactor
        );
      }
      if (templateSortKey === "status") {
        const aStatus = a.active === false ? "inactive" : "active";
        const bStatus = b.active === false ? "inactive" : "active";
        return aStatus.localeCompare(bStatus) * templateDirectionFactor;
      }
      if (templateSortKey === "createdAt") {
        const aTime = new Date(a.createdAt ?? 0).getTime();
        const bTime = new Date(b.createdAt ?? 0).getTime();
        return (aTime - bTime) * templateDirectionFactor;
      }
      const aTime = new Date(a.updatedAt ?? 0).getTime();
      const bTime = new Date(b.updatedAt ?? 0).getTime();
      return (aTime - bTime) * templateDirectionFactor;
    });
  }, [templateDirectionFactor, templateSortKey, templates]);

  const templatePagination = useTablePagination(sortedTemplates);

  const activeRecipientFilterCount = React.useMemo(() => {
    return [
      gender,
      state ? "state" : "",
      city,
      kycCompletedFilter,
      purchaseMadeFilter,
      lastPurchaseDays && lastPurchaseFilter ? "lastPurchase" : "",
      firstPurchaseOnlyFilter,
      noSipFilter,
      noOfferFilter,
      referralRewardFilter,
    ].filter(Boolean).length;
  }, [
    gender,
    state,
    city,
    kycCompletedFilter,
    purchaseMadeFilter,
    lastPurchaseDays,
    lastPurchaseFilter,

    firstPurchaseOnlyFilter,
    noSipFilter,
    noOfferFilter,
    referralRewardFilter,
  ]);

  const clearRecipientFilters = () => {
    setGender("");
    setState(null);
    setCity("");
    setKycCompletedFilter("");
    setPurchaseMadeFilter("");
    setLastPurchaseDays("");
    setLastPurchaseFilter("");
    setFirstPurchaseOnlyFilter("");
    setNoSipFilter("");
    setNoOfferFilter("");
    setReferralRewardFilter("");
    setStateSearch("");
    setCitySearch("");
    setIsStateOpen(false);
    setIsCityOpen(false);
  };

  const clearFieldError = React.useCallback((field: keyof NotificationFormErrors) => {
    setFieldErrors((current) => {
      if (field === "templateVariables") {
        if (!current.templateVariables) return current;
        const next = { ...current };
        delete next.templateVariables;
        return next;
      }

      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }, []);

  const clearTemplateVariableError = React.useCallback((variable: string) => {
    setFieldErrors((current) => {
      if (!current.templateVariables?.[variable]) return current;

      const nextTemplateVariables = { ...current.templateVariables };
      delete nextTemplateVariables[variable];

      const next = { ...current };
      if (Object.keys(nextTemplateVariables).length === 0) {
        delete next.templateVariables;
      } else {
        next.templateVariables = nextTemplateVariables;
      }

      return next;
    });
  }, []);

  const toggleRecipient = (id: string) => {
    const next = selectedUsers.includes(id)
      ? selectedUsers.filter((userId) => userId !== id)
      : [...selectedUsers, id];

    setSelectedUsers(next);
    if (next.length > 0) {
      clearFieldError("recipients");
    }
  };

  const resetForm = () => {
    setSelectedUsers([]);
    setPinnedRecipientIds([]);
    setSelectedNotificationType("");
    setSelectedDeliveryChannel("");
    setSelectedRoute("");
    setSelectedTemplateId(CUSTOM_TEMPLATE_VALUE);
    setTemplateVariables({});
    setContent("");
    setSelectedDate(new Date());
    setSelectedTime(getCurrentTimeInputValue());
    setPriceDropDate("");
    setRecipientSearch("");
    setFieldErrors({});

    // filters
    setGender("");
    setState(null);
    setCity("");
    setKycCompletedFilter("");
    setPurchaseMadeFilter("");
    setLastPurchaseDays("");
    setLastPurchaseFilter("");
    setFirstPurchaseOnlyFilter("");
    setNoSipFilter("");
    setNoOfferFilter("");
    setReferralRewardFilter("");

    // search inputs
    setStateSearch("");
    setCitySearch("");

    // dropdown states
    setIsStateOpen(false);
    setIsCityOpen(false);
  };

  const activeTemplates = React.useMemo(
    () => templates.filter((item) => item.active !== false),
    [templates]
  );

  const selectedTemplate = React.useMemo(
    () =>
      selectedTemplateId === CUSTOM_TEMPLATE_VALUE
        ? null
        : activeTemplates.find((item) => item._id === selectedTemplateId) ?? null,
    [selectedTemplateId, activeTemplates]
  );

  const isCustomNotification = !selectedTemplate;
  const needsLiveMetalPrices = Boolean(
    selectedTemplate && templateUsesLiveMetalPrices(selectedTemplate)
  );
  const needsComparisonDate = Boolean(
    selectedTemplate && templateUsesMetalDropComparison(selectedTemplate)
  );

  const activeTemplateVariables = React.useMemo(() => {
    if (!selectedTemplate) return [];
    return getEditableTemplateVariables(selectedTemplate);
  }, [selectedTemplate]);

  const renderedTemplateContent = React.useMemo(() => {
    if (!selectedTemplate) return "";
    return applyTemplateVariables(selectedTemplate.htmlTemplate, {
      ...templateVariables,
      ...(selectedRoute.trim() ? { route: selectedRoute.trim() } : {}),
    });
  }, [selectedTemplate, templateVariables, selectedRoute]);

  const templatePreviewDocument = React.useMemo(() => {
    if (!selectedTemplate) return "";
    return wrapNotificationTemplatePreview(renderedTemplateContent);
  }, [selectedTemplate, renderedTemplateContent]);

  const handleTemplateChange = (value: string) => {
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.content;
      delete next.scheduledDate;
      delete next.templateVariables;
      return next;
    });

    if (value === CUSTOM_TEMPLATE_VALUE) {
      setSelectedTemplateId(CUSTOM_TEMPLATE_VALUE);
      setTemplateVariables({});
      setPriceDropDate("");
      setContent("");
      return;
    }

    const template = activeTemplates.find((item) => item._id === value);
    if (!template) return;

    setSelectedTemplateId(value);
    setTemplateVariables(buildTemplateVariableState(template));
    setPriceDropDate("");
    setSelectedDeliveryChannel("");
    setSelectedRoute("");
    setContent("");
  };

  const loadLiveMetalPrices = React.useCallback(
    async (template: NotificationTemplate, comparisonDate = priceDropDate) => {
      const shouldLoadLivePrices = templateUsesLiveMetalPrices(template);
      const shouldLoadDropComparison =
        templateUsesMetalDropComparison(template) && Boolean(comparisonDate);

      if (!shouldLoadLivePrices && !shouldLoadDropComparison) {
        return;
      }

      setIsLoadingMetalPrices(true);
      try {
        let livePrices = { goldPrice: null as number | null, silverPrice: null as number | null };

        if (shouldLoadLivePrices || shouldLoadDropComparison) {
          const rows = await fetchLiveMetalPrices();
          livePrices = extractAugmontMetalPrices(rows);
        }

        if (shouldLoadDropComparison) {
          setIsLoadingHistoricalPrices(true);
          const historicalPrices = await fetchHistoricalMetalPrices(comparisonDate);
          setTemplateVariables((current) =>
            applyPriceDropToVariables(template, current, livePrices, historicalPrices)
          );
        } else if (shouldLoadLivePrices) {
          setTemplateVariables((current) =>
            applyLiveMetalPricesToVariables(template, current, livePrices)
          );
        }
      } catch (error) {
        toast({
          title: "Failed to load metal prices",
          description: error instanceof Error ? error.message : "Could not fetch metal prices.",
          variant: "destructive",
        });
      } finally {
        setIsLoadingMetalPrices(false);
        setIsLoadingHistoricalPrices(false);
      }
    },
    [priceDropDate]
  );

  const handlePriceDropDateChange = React.useCallback(
    (date: string) => {
      setPriceDropDate(date);
      clearFieldError("priceDropDate");

      if (!selectedTemplate || !templateUsesMetalDropComparison(selectedTemplate) || !date) {
        return;
      }

      void loadLiveMetalPrices(selectedTemplate, date);
    },
    [clearFieldError, loadLiveMetalPrices, selectedTemplate]
  );

  const updateTemplateVariable = (variable: string, value: string) => {
    if (value.trim()) {
      clearTemplateVariableError(variable);
    }

    setTemplateVariables((current) => {
      const next = { ...current, [variable]: value };
      const htmlToken = selectedTemplate
        ? extractTemplateVariables(selectedTemplate.htmlTemplate).find(
          (token) => token.toLowerCase() === variable.toLowerCase()
        )
        : undefined;

      if (htmlToken && htmlToken !== variable) {
        next[htmlToken] = value;
      }

      return next;
    });
  };

  const loadTemplates = React.useCallback(async () => {
    setIsLoadingTemplates(true);
    try {
      const res = await customFetch<{
        status?: string;
        data?: NotificationTemplate[];
      }>(GET_NOTIFICATION_TEMPLATES_ENDPOINT, { method: "GET" });

      const items = Array.isArray(res?.data) ? res.data : [];
      setTemplates(items);
    } catch (err) {
      console.error("Failed to fetch templates", err);
      toast({
        title: "Failed to load templates",
        description: err instanceof Error ? err.message : "Could not fetch notification templates.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingTemplates(false);
    }
  }, []);

  const resetTemplateForm = React.useCallback(() => {
    setTemplateForm({ ...EMPTY_TEMPLATE_FORM });
    setTemplateDialogMode("create");
  }, []);

  const openCreateTemplate = React.useCallback(() => {
    setTemplateDialogMode("create");
    setTemplateForm({ ...EMPTY_TEMPLATE_FORM });
    setTemplateDialogOpen(true);
  }, []);

  const openEditTemplate = React.useCallback(async (templateId: string) => {
    setTemplateDialogMode("edit");
    setIsLoadingTemplate(true);
    setTemplateDialogOpen(true);

    try {
      const template = await fetchNotificationTemplateById(templateId);
      setTemplateForm({
        templateId: template._id,
        name: template.templateName,
        content: template.htmlTemplate,
        route: "",
        active: template.active !== false,
      });
    } catch (error) {
      setTemplateDialogOpen(false);
      resetTemplateForm();
      toast({
        title: "Failed to load template",
        description: error instanceof Error ? error.message : "Could not fetch template details.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingTemplate(false);
    }
  }, [resetTemplateForm]);

  const handleDeleteTemplate = async (templateId: string) => {
    setIsDeletingTemplate(true);
    try {
      const response = await customFetch<{ message?: string }>(DELETE_NOTIFICATION_TEMPLATE_ENDPOINT, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ templateId }),
      });

      toast({
        title: "Template deleted",
        description: response?.message ?? "Template deleted successfully.",
      });

      if (templateForm.templateId === templateId) {
        setTemplateDialogOpen(false);
        resetTemplateForm();
      }

      if (selectedTemplateId === templateId) {
        setSelectedTemplateId(CUSTOM_TEMPLATE_VALUE);
        setTemplateVariables({});
      }

      await loadTemplates();
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Failed to delete notification template.",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsDeletingTemplate(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateForm.name.trim()) {
      toast({ title: "Missing name", description: "Enter a template name." });
      return;
    }

    if (!templateForm.content.trim()) {
      toast({ title: "Missing template", description: "Add HTML template content." });
      return;
    }

    const htmlTemplate = templateForm.content.trim();
    const isEditing = templateDialogMode === "edit" && Boolean(templateForm.templateId);
    const payload = {
      templateName: templateForm.name.trim(),
      htmlTemplate,
      variables: extractTemplateVariables(htmlTemplate),
      route: templateForm.route.trim(),
      ...(isEditing
        ? {
          templateId: templateForm.templateId,
          active: templateForm.active,
        }
        : {}),
    };

    const endpoint = isEditing
      ? UPDATE_NOTIFICATION_TEMPLATE_ENDPOINT
      : CREATE_NOTIFICATION_TEMPLATE_ENDPOINT;

    setIsSavingTemplate(true);
    try {
      const response = await customFetch<{
        status?: string;
        data?: { templateName?: string };
      }>(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      toast({
        title: isEditing ? "Template updated" : "Template saved",
        description:
          response?.data?.templateName
            ? `Template "${response.data.templateName}" ${isEditing ? "updated" : "created"} successfully.`
            : `Notification template ${isEditing ? "updated" : "created"} successfully.`,
      });

      setTemplateDialogOpen(false);
      resetTemplateForm();
      await loadTemplates();
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Failed to save notification template.",
        variant: "destructive",
      });
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const SEND_NOTIFICATION_ENDPOINT = buildNotificationApiUrl("/notifications/send");
  const handleSend = async () => {
    const senderId = localStorage.getItem("id");
    const nextFieldErrors = validateNotificationForm({
      selectedDeliveryChannel,
      isCustomNotification,
      needsComparisonDate,
      needsLiveMetalPrices,
      selectedDate,
      selectedTime,
      priceDropDate,
      selectedUsers,
      activeTemplateVariables,
      templateVariables,
      content,
    });

    if (hasFormErrors(nextFieldErrors)) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    setFieldErrors({});

    const resolvedRoute = selectedRoute.trim();

    const templateData = selectedTemplate
      ? buildTemplateDataPayload(activeTemplateVariables, templateVariables)
      : {};
    const scheduledDateTime = selectedTime.trim()
      ? buildScheduledDateTime(selectedDate, selectedTime)
      : null;

    const payload = selectedTemplate
      ? {
        templateName: selectedTemplate.templateName,
        deliveryChannel: selectedDeliveryChannel,
        recipientId: selectedUsers,
        senderId,
        ...(resolvedRoute ? { route: resolvedRoute } : {}),
        templateData: resolvedRoute
          ? { ...templateData, route: resolvedRoute }
          : templateData,
      }
      : {
        deliveryChannel: selectedDeliveryChannel,
        notificationType: selectedNotificationType,
        senderId,
        recipientId: selectedUsers,
        content: content.trim(),
        ...(resolvedRoute ? { route: resolvedRoute } : {}),
        ...(scheduledDateTime ? { scheduledAt: scheduledDateTime.toISOString() } : {}),
        scheduledBy: senderId,
      };

    try {
      setIsSending(true);

      const res: any = await customFetch(SEND_NOTIFICATION_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      toast({
        title: "Success",
        description: res?.message || "Notification sent successfully",
      });

      // reset after success
      resetForm();
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(USERS_NOTIFICATION_SELECTION_STORAGE_KEY);
      }

    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to send notification",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const raw = window.sessionStorage.getItem(NOTIFICATION_RECIPIENTS_STORAGE_KEY);
    const returnPath = window.sessionStorage.getItem(NOTIFICATION_RETURN_PATH_STORAGE_KEY);
    if (!raw && !returnPath) return;

    window.sessionStorage.removeItem(NOTIFICATION_RECIPIENTS_STORAGE_KEY);
    window.sessionStorage.removeItem(NOTIFICATION_RETURN_PATH_STORAGE_KEY);

    if (returnPath) {
      setNotificationReturnPath(returnPath);
    }

    if (!raw) return;

    try {
      const ids = JSON.parse(raw);
      if (Array.isArray(ids) && ids.every((id) => typeof id === "string" && id.trim())) {
        setSelectedUsers(ids);
        setPinnedRecipientIds(ids);
      }
    } catch (error) {
      console.error("Failed to parse stored notification recipients", error);
    }
  }, []);

  React.useEffect(() => {
    if (!selectedTemplate || !templateUsesLiveMetalPrices(selectedTemplate)) return;
    void loadLiveMetalPrices(selectedTemplate);
  }, [loadLiveMetalPrices, selectedTemplate?._id]);

  React.useEffect(() => {
    const fetchUsers = async () => {
      try {
        const firstPageUrl = new URL(ADMIN_USERS_ENDPOINT, window.location.origin);
        firstPageUrl.searchParams.set("page", "1");
        firstPageUrl.searchParams.set("limit", "100");

        const firstPage: any = await customFetch(firstPageUrl.toString(), { method: "GET" });
        const allUsers = [...unwrapAdminUsersResponse(firstPage)];
        const totalPages = Number(firstPage?.pagination?.totalPages ?? 1);

        for (let page = 2; page <= totalPages; page += 1) {
          const pageUrl = new URL(ADMIN_USERS_ENDPOINT, window.location.origin);
          pageUrl.searchParams.set("page", String(page));
          pageUrl.searchParams.set("limit", "100");

          const response: any = await customFetch(pageUrl.toString(), { method: "GET" });
          allUsers.push(...unwrapAdminUsersResponse(response));
        }

        setAdminUsers(normalizeAdminUsers(allUsers));

      } catch (err) {
        console.error("Failed to fetch users", err);
      }
    };

    fetchUsers();
  }, []);

  React.useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  React.useEffect(() => {
    templatePagination.resetPage();
  }, [templates.length, templatePagination.resetPage]);

  React.useEffect(() => {
    const fetchStates = async () => {
      try {
        const res: any = await customFetch(
          "/classification/getValues",
          {
            method: "POST",
            body: JSON.stringify({ type: "STATE" }),
            headers: { "Content-Type": "application/json" },
          }
        );

        const states = res?.data?.[0]?.metadata?.states || [];
        setStatesList(states);

      } catch (err) {
        console.error("Failed to fetch states", err);
      }
    };

    fetchStates();
  }, []);

  React.useEffect(() => {
    if (!state) {
      setCitiesList([]);
      setCity("");
      return;
    }

    const fetchCities = async () => {
      try {
        const res: any = await customFetch(
          "/classification/getValues",
          {
            method: "POST",
            body: JSON.stringify({
              type: "CITY",
              stateId: state.id,
            }),
            headers: { "Content-Type": "application/json" },
          }
        );

        const cities =
          res?.data?.[0]?.metadata?.cities || [];

        setCitiesList(cities);

      } catch (err) {
        console.error("Failed to fetch cities", err);
      }
    };

    fetchCities();
  }, [state]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (stateDropdownRef.current && !stateDropdownRef.current.contains(target)) {
        setIsStateOpen(false);
      }

      if (cityDropdownRef.current && !cityDropdownRef.current.contains(target)) {
        setIsCityOpen(false);
      }

    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);
  const isEditingTemplate = templateDialogMode === "edit";

  return (
    <Layout title="Create Notification">
      <div className="flex h-[calc(100vh-7.5rem)] min-h-0 flex-col gap-4 overflow-hidden">
        {showNotificationsBackButton ? (
          <button
            type="button"
            onClick={() => navigate("/notifications")}
            className="inline-flex w-fit items-center text-sm text-primary transition-colors hover:underline"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Notifications
          </button>
        ) : null}

        {notificationReturnPath ? (
          <button
            type="button"
            onClick={() => navigate(notificationReturnPath)}
            className="inline-flex w-fit items-center text-sm text-primary transition-colors hover:underline"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Users
          </button>
        ) : null}

        <div className="flex w-fit items-center gap-1 rounded-xl border border-border bg-muted p-1">
          {CREATE_NOTIFICATION_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                "cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition-all",
                activeTab === tab.id
                  ? "border border-border bg-card text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "send" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="min-h-0 flex-1 overflow-y-auto pb-24 lg:overflow-hidden lg:pb-0">
              <div
                className={cn(
                  "grid min-h-0 lg:h-full lg:overflow-hidden",
                  messageSetupCollapsed
                    ? "lg:grid-cols-1"
                    : "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
                )}
              >
                <div
                  className={cn(
                    "space-y-6 border-b border-border p-5 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r",
                    messageSetupCollapsed && "hidden"
                  )}
                >
                  <div>
                    <p className={sectionTitleClass}>Message setup</p>
                    <p className={sectionHintClass}>Choose a template and configure delivery details.</p>
                  </div>

                  <FormField label="Template">
                    <Select
                      value={selectedTemplateId}
                      onValueChange={handleTemplateChange}
                      disabled={isLoadingTemplates}
                    >
                      <SelectTrigger className={fieldControlClass}>
                        <SelectValue
                          placeholder={isLoadingTemplates ? "Loading templates..." : "Select template"}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={CUSTOM_TEMPLATE_VALUE}>Custom notification</SelectItem>
                        {activeTemplates.map((template) => (
                          <SelectItem key={template._id} value={template._id}>
                            {template.templateName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="Delivery Channel" error={fieldErrors.deliveryChannel}>
                      <Select
                        value={selectedDeliveryChannel}
                        onValueChange={(value) => {
                          setSelectedDeliveryChannel(value);
                          clearFieldError("deliveryChannel");
                        }}
                      >
                        <SelectTrigger
                          aria-invalid={Boolean(fieldErrors.deliveryChannel)}
                          className={cn(fieldControlClass, fieldErrors.deliveryChannel && "border-destructive")}
                        >
                          <SelectValue placeholder="Select channel" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="push">Push</SelectItem>
                          <SelectItem value="sms">SMS</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormField>

                    <FormField label="Route">
                      <Select
                        value={selectedRoute || NONE_ROUTE_VALUE}
                        onValueChange={(value) =>
                          setSelectedRoute(value === NONE_ROUTE_VALUE ? "" : value)
                        }
                      >
                        <SelectTrigger className={fieldControlClass}>
                          <SelectValue placeholder="Route" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72 w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)]">
                          <SelectItem value={NONE_ROUTE_VALUE}>None</SelectItem>
                          {MOBILE_NOTIFICATION_ROUTES.map((route) => (
                            <SelectItem key={route} value={route} className="max-w-full">
                              {route}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormField>
                  </div>

                  {isCustomNotification ? (
                    <div className="space-y-4 rounded-lg border border-border/70 bg-muted/15 p-4">
                      <div className="grid gap-4 sm:grid-cols-3">
                        <FormField label="Notification Type">
                          <Select value={selectedNotificationType} onValueChange={setSelectedNotificationType}>
                            <SelectTrigger className={fieldControlClass}>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="System generated">System generated</SelectItem>
                              <SelectItem value="Reminder">Reminder</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormField>

                        <FormField label="Scheduled Date" error={fieldErrors.scheduledDate}>
                          <div className="mt-1.5 w-full">
                            <SingleDatePicker
                              value={selectedDate}
                              disabled={{ before: TODAY_START_DATE }}
                              onChange={(value) => {
                                setSelectedDate(value);
                                clearFieldError("scheduledDate");
                              }}
                              className={cn("w-full", fieldErrors.scheduledDate && "rounded-xl border border-destructive")}
                            />
                          </div>
                        </FormField>

                        <FormField label="Scheduled Time">
                          <Input
                            type="text"
                            value={selectedTime}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="HH"
                            onChange={(event) => {
                              const value = event.target.value.replace(/\D/g, "");
                              if (value === "" || (Number(value) >= 0 && Number(value) <= 23)) {
                                setSelectedTime(value);
                              }
                              clearFieldError("scheduledDate");
                            }}
                            className={cn(
                              fieldControlClass,
                              fieldErrors.scheduledDate && "border-destructive",
                            )}
                            aria-label="Scheduled time"
                          />
                        </FormField>
                      </div>

                      <FormField label="Content" error={fieldErrors.content}>
                        <Textarea
                          value={content}
                          onChange={(e) => {
                            setContent(e.target.value);
                            if (e.target.value.trim()) {
                              clearFieldError("content");
                            }
                          }}
                          placeholder="Enter message..."
                          aria-invalid={Boolean(fieldErrors.content)}
                          className={cn(
                            "mt-1.5 min-h-[140px] resize-none rounded-lg border-border bg-background",
                            fieldErrors.content && "border-destructive"
                          )}
                        />
                      </FormField>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-lg border border-border/70 bg-muted/15 p-4">
                        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className={sectionTitleClass}>Template fields</p>
                            <p className={sectionHintClass}>
                              {selectedTemplate?.templateName}
                              {(needsLiveMetalPrices || needsComparisonDate) &&
                                (isLoadingMetalPrices || isLoadingHistoricalPrices)
                                ? " · Loading prices..."
                                : ""}
                            </p>
                          </div>

                          {needsLiveMetalPrices ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0 cursor-pointer gap-2"
                              onClick={() => void loadLiveMetalPrices(selectedTemplate)}
                              disabled={isLoadingMetalPrices}
                            >
                              <RefreshCw className={cn("h-4 w-4", isLoadingMetalPrices && "animate-spin")} />
                              Refresh prices
                            </Button>
                          ) : null}
                        </div>

                        {activeTemplateVariables.length === 0 ? (
                          <p className={sectionHintClass}>
                            No manual fields required. Recipient name is added automatically for each user.
                          </p>
                        ) : (
                          <div className="grid gap-4 sm:grid-cols-2">
                            {activeTemplateVariables.map((variable) => (
                              <React.Fragment key={variable}>
                                <FormField
                                  label={formatTemplateVariableLabel(variable)}
                                  error={fieldErrors.templateVariables?.[variable]}
                                  className={
                                    TEMPLATE_MULTILINE_VARIABLES.has(variable) ? "sm:col-span-2" : undefined
                                  }
                                >
                                  {TEMPLATE_MULTILINE_VARIABLES.has(variable) ? (
                                    <Textarea
                                      value={templateVariables[variable] ?? ""}
                                      onChange={(event) => updateTemplateVariable(variable, event.target.value)}
                                      placeholder={`Enter ${formatTemplateVariableLabel(variable).toLowerCase()}`}
                                      aria-invalid={Boolean(fieldErrors.templateVariables?.[variable])}
                                      className={cn(
                                        "mt-1.5 resize-none rounded-xl border-border bg-background",
                                        variable === "title" ? "min-h-[80px]" : "min-h-[120px]",
                                        fieldErrors.templateVariables?.[variable] && "border-destructive"
                                      )}
                                    />
                                  ) : (
                                    <Input
                                      value={templateVariables[variable] ?? ""}
                                      onChange={(event) => updateTemplateVariable(variable, event.target.value)}
                                      placeholder={`Enter ${formatTemplateVariableLabel(variable).toLowerCase()}`}
                                      aria-invalid={Boolean(fieldErrors.templateVariables?.[variable])}
                                      className={cn(
                                        fieldControlClass,
                                        fieldErrors.templateVariables?.[variable] && "border-destructive"
                                      )}
                                      readOnly={
                                        (isLiveMetalPriceVariable(variable) && needsLiveMetalPrices) ||
                                        (isMetalDropVariable(variable) && needsComparisonDate)
                                      }
                                    />
                                  )}
                                </FormField>
                                {needsComparisonDate &&
                                  variable.toLowerCase() === "content" ? (
                                  <FormField
                                    label="Comparison Date"
                                    error={fieldErrors.priceDropDate}
                                    className="sm:col-span-2"
                                  >
                                    <div className="mt-1.5 w-full">
                                      <SingleDatePicker
                                        value={priceDropDate}
                                        onChange={(value) => handlePriceDropDateChange(value)}
                                        className={cn(
                                          "w-full",
                                          fieldErrors.priceDropDate && "rounded-xl border border-destructive"
                                        )}
                                      />
                                    </div>
                                  </FormField>
                                ) : null}
                              </React.Fragment>
                            ))}
                            {needsComparisonDate &&
                              !activeTemplateVariables.some(
                                (variable) => variable.toLowerCase() === "content"
                              ) ? (
                              <FormField
                                label="Comparison Date"
                                error={fieldErrors.priceDropDate}
                                className="sm:col-span-2"
                              >
                                <div className="mt-1.5 w-full">
                                  <SingleDatePicker
                                    value={priceDropDate}
                                    onChange={(value) => handlePriceDropDateChange(value)}
                                    className={cn(
                                      "w-full",
                                      fieldErrors.priceDropDate && "rounded-xl border border-destructive"
                                    )}
                                  />
                                </div>
                              </FormField>
                            ) : null}
                          </div>
                        )}
                      </div>

                      <div className="rounded-lg border border-border/70 bg-muted/15 p-4">
                        <button
                          type="button"
                          onClick={() => setShowPreview((current) => !current)}
                          className="flex w-full cursor-pointer items-center justify-between gap-2 text-left"
                        >
                          <div className="flex items-center gap-2">
                            {showPreview ? (
                              <Eye className="h-4 w-4 text-primary" />
                            ) : (
                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span className={sectionTitleClass}>Preview</span>
                          </div>
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 text-muted-foreground transition-transform",
                              showPreview && "rotate-180"
                            )}
                          />
                        </button>
                        {showPreview ? (
                          <div className="mt-3 overflow-hidden rounded-lg border border-border bg-[#f4f9f7]">
                            <iframe
                              title="Notification template preview"
                              srcDoc={templatePreviewDocument}
                              className="h-[220px] w-full bg-[#f4f9f7]"
                              sandbox=""
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>

                <div className="relative flex min-h-0 flex-col overflow-hidden lg:min-h-0">
                  <button
                    type="button"
                    onClick={() => setMessageSetupCollapsed((current) => !current)}
                    title={messageSetupCollapsed ? "Show message setup" : "Hide message setup"}
                    aria-label={messageSetupCollapsed ? "Show message setup" : "Hide message setup"}
                    className="absolute -left-[14px] top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md transition-colors hover:bg-muted hover:text-foreground lg:inline-flex"
                  >
                    {messageSetupCollapsed ? (
                      <ChevronsRight className="h-4 w-4" />
                    ) : (
                      <ChevronsLeft className="h-4 w-4" />
                    )}
                  </button>
                  <div className="shrink-0 space-y-2 border-b border-border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className={sectionTitleClass}>Recipients</p>
                        <p className={sectionHintClass}>
                          {selectedUsers.length} selected · {filteredUsers.length} matching
                        </p>
                        <FieldError message={fieldErrors.recipients} />
                      </div>

                      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                        <Checkbox
                          checked={
                            filteredUsers.length > 0 &&
                            filteredUsers.every((user) => selectedUsers.includes(user.id))
                          }
                          onCheckedChange={(checked) => {
                            if (checked) {
                              const allIds = filteredUsers.map((user) => user.id);
                              setSelectedUsers((prev) => [...new Set([...prev, ...allIds])]);
                              clearFieldError("recipients");
                            } else {
                              const ids = filteredUsers.map((user) => user.id);
                              setSelectedUsers((prev) => prev.filter((id) => !ids.includes(id)));
                            }
                          }}
                        />
                        Select all
                      </label>
                    </div>

                    <div className="flex gap-2">
                      <div className="relative min-w-0 flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={recipientSearch}
                          onChange={(e) => setRecipientSearch(e.target.value)}
                          placeholder="Search by name, email, or phone"
                          className="h-10 rounded-lg border-border bg-background pl-9"
                        />
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setShowFilters((current) => {
                            const next = !current;
                            if (!next) {
                              setIsStateOpen(false);
                              setIsCityOpen(false);
                            }
                            return next;
                          });
                        }}
                        className={cn(
                          "h-10 shrink-0 rounded-lg",
                          (showFilters || activeRecipientFilterCount > 0) &&
                          "border-primary/40 bg-primary/5 text-primary"
                        )}
                      >
                        <SlidersHorizontal className="mr-2 h-4 w-4" />
                        Filters
                        {activeRecipientFilterCount > 0 ? (
                          <span className="ml-2 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                            {activeRecipientFilterCount}
                          </span>
                        ) : null}
                      </Button>

                      {activeRecipientFilterCount > 0 ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={clearRecipientFilters}
                          className="h-10 shrink-0 rounded-lg"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="relative flex min-h-0 flex-1 overflow-hidden">
                    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-2">
                      {pinnedRecipientIds.length > 0 ? (
                        <div className="mb-3 space-y-1.5">
                          <div className="flex items-center gap-2 px-1">
                            <Users className="h-3.5 w-3.5 text-primary" />
                            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                              Selected from Users
                            </p>
                          </div>
                          {pinnedRecipients.length === 0 ? (
                            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
                              Loading {pinnedRecipientIds.length} selected{" "}
                              {pinnedRecipientIds.length === 1 ? "user" : "users"}...
                            </div>
                          ) : (
                            pinnedRecipients.map((user) => (
                              <label
                                key={user.id}
                                className={cn(
                                  "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
                                  selectedUsers.includes(user.id)
                                    ? "border-primary/30 bg-primary/5"
                                    : "border-border bg-background hover:bg-muted/50",
                                )}
                              >
                                <Checkbox
                                  checked={selectedUsers.includes(user.id)}
                                  onCheckedChange={() => toggleRecipient(user.id)}
                                />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{user.name || "Unnamed user"}</p>
                                  <p className="truncate text-xs text-muted-foreground">{user.email || user.phone}</p>
                                </div>
                              </label>
                            ))
                          )}
                        </div>
                      ) : null}

                      {adminUsers.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
                          No users available.
                        </div>
                      ) : listedRecipients.length === 0 && pinnedRecipients.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
                          No users match the current search or filters.
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {listedRecipients.map((user) => (
                            <label
                              key={user.id}
                              className={cn(
                                "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
                                selectedUsers.includes(user.id)
                                  ? "border-primary/30 bg-primary/5"
                                  : "border-border bg-background hover:bg-muted/50"
                              )}
                            >
                              <Checkbox
                                checked={selectedUsers.includes(user.id)}
                                onCheckedChange={() => toggleRecipient(user.id)}
                              />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{user.name || "Unnamed user"}</p>
                                <p className="truncate text-xs text-muted-foreground">{user.email || user.phone}</p>
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    {showFilters ? (
                      <div
                        className={cn(
                          "flex shrink-0 flex-col border-l border-border bg-card shadow-lg",
                          messageSetupCollapsed ? "w-[min(30rem,55%)]" : "w-[min(17rem,42%)]"
                        )}
                      >
                        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
                          <div>
                            <p className="text-sm font-semibold text-foreground">Filters</p>
                            <p className="text-xs text-muted-foreground">{filteredUsers.length} matching</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setShowFilters(false);
                              setIsStateOpen(false);
                              setIsCityOpen(false);
                            }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            aria-label="Close filters"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                          <Select
                            value={gender || "ALL"}
                            onValueChange={(value) => setGender(value === "ALL" ? "" : value)}
                          >
                            <SelectTrigger
                              className={cn(
                                "h-8 rounded-md border-border bg-background text-xs",
                                gender && "border-primary/40 bg-primary/5 text-primary"
                              )}
                            >
                              <SelectValue placeholder="Gender" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ALL">Any gender</SelectItem>
                              <SelectItem value="MALE">Male</SelectItem>
                              <SelectItem value="FEMALE">Female</SelectItem>
                            </SelectContent>
                          </Select>

                          <div className="relative" ref={stateDropdownRef}>
                            <Input
                              value={stateSearch}
                              onChange={(e) => {
                                const value = e.target.value;
                                setStateSearch(value);
                                if (state && value !== state.name) {
                                  setState(null);
                                  setCity("");
                                  setCitySearch("");
                                }
                                setIsStateOpen(true);
                              }}
                              onFocus={() => setIsStateOpen(true)}
                              placeholder="Any state"
                              className={cn(
                                "h-8 rounded-md border-border bg-background pr-8 text-xs",
                                stateSearch.trim() &&
                                "border-primary/40 bg-primary/5 text-primary"
                              )}
                            />
                            {state ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setState(null);
                                  setStateSearch("");
                                  setCity("");
                                  setCitySearch("");
                                }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-destructive"
                              >
                                ✕
                              </button>
                            ) : null}
                            {isStateOpen ? (
                              <div className="absolute z-20 mt-1 max-h-32 w-full overflow-y-auto rounded-lg border bg-background shadow-md">
                                {filteredStates.map((s: any) => (
                                  <div
                                    key={s.id}
                                    className="cursor-pointer px-2.5 py-1.5 text-xs hover:bg-muted"
                                    onClick={() => {
                                      setState(s);
                                      setStateSearch(s.name);
                                      setIsStateOpen(false);
                                      setCity("");
                                      setCitySearch("");
                                    }}
                                  >
                                    {s.name}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>

                          <div className="relative" ref={cityDropdownRef}>
                            <Input
                              value={citySearch}
                              onChange={(e) => {
                                setCity("");
                                setCitySearch(e.target.value);
                                setIsCityOpen(true);
                              }}
                              onFocus={() => setIsCityOpen(true)}
                              placeholder={state ? "Any city" : "State first"}
                              disabled={!state}
                              className={cn(
                                "h-8 rounded-md border-border bg-background pr-8 text-xs",
                                citySearch.trim() &&
                                "border-primary/40 bg-primary/5 text-primary"
                              )}
                            />
                            {city ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setCity("");
                                  setCitySearch("");
                                }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-destructive"
                              >
                                ✕
                              </button>
                            ) : null}
                            {isCityOpen && state ? (
                              <div className="absolute z-20 mt-1 max-h-32 w-full overflow-y-auto rounded-lg border bg-background shadow-md">
                                {filteredCitiesSearch.map((c: any) => (
                                  <div
                                    key={c.id}
                                    className="cursor-pointer px-2.5 py-1.5 text-xs hover:bg-muted"
                                    onClick={() => {
                                      setCity(c.name);
                                      setCitySearch(c.name);
                                      setIsCityOpen(false);
                                    }}
                                  >
                                    {c.name}
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>

                          <AudienceFilterSelect
                            label="KYC"
                            value={kycCompletedFilter}
                            onChange={setKycCompletedFilter}
                          />
                          <AudienceFilterSelect
                            label="Purchase"
                            value={purchaseMadeFilter}
                            onChange={setPurchaseMadeFilter}
                          />
                          <AudienceFilterSelect
                            label="First purchase"
                            value={firstPurchaseOnlyFilter}
                            onChange={setFirstPurchaseOnlyFilter}
                          />
                          <AudienceFilterSelect
                            label="No SIP"
                            value={noSipFilter}
                            onChange={setNoSipFilter}
                          />
                          <AudienceFilterSelect
                            label="No offers"
                            value={noOfferFilter}
                            onChange={setNoOfferFilter}
                          />
                          <AudienceFilterSelect
                            label="Referral reward"
                            value={referralRewardFilter}
                            onChange={setReferralRewardFilter}
                          />
                          <Select
                            value={lastPurchaseDays || "ALL"}
                            onValueChange={(value) => {
                              const selectedValue = value === "ALL" ? "" : value;
                              setLastPurchaseDays(selectedValue);
                              if (!selectedValue) {
                                setLastPurchaseFilter("");
                              }
                            }}
                          >
                            <SelectTrigger
                              className={cn(
                                "h-8 rounded-md border-border bg-background text-xs",
                                lastPurchaseDays && "border-primary/40 bg-primary/5 text-primary"
                              )}
                            >
                              <SelectValue placeholder="Last purchase" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ALL">Last purchase: Any</SelectItem>
                              <SelectItem value="7">Last 7 days</SelectItem>
                              <SelectItem value="30">Last 30 days</SelectItem>
                              <SelectItem value="60">Last 60 days</SelectItem>
                              <SelectItem value="90">Last 90 days</SelectItem>
                            </SelectContent>
                          </Select>
                          {lastPurchaseDays ? (
                            <AudienceFilterSelect
                              label="Purchased in period"
                              value={lastPurchaseFilter}
                              onChange={setLastPurchaseFilter}
                            />
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div
              className={cn(
                "flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 sm:flex-nowrap",
                "fixed inset-x-0 bottom-0 z-40 bg-card/95 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] backdrop-blur-sm",
                "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
                "lg:static lg:z-auto lg:bg-muted/20 lg:pb-3 lg:shadow-none lg:backdrop-blur-none",
              )}
            >
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 cursor-pointer whitespace-nowrap"
                onClick={resetForm}
              >
                Reset
              </Button>
              <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-2">
                <Button
                  className={cn(
                    "shrink-0 whitespace-nowrap",
                    primaryActionButtonClassName
                  )}
                  onClick={handleSend}
                  disabled={isSending}
                >
                  <Send className={primaryActionIconClassName} />
                  {isSending ? "Sending..." : "Send"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "templates" && (
          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-border p-6">
              <h3 className="text-lg font-semibold text-foreground">Notification Templates</h3>
              <Button
                size="sm"
                className={cn("shrink-0", primaryActionButtonClassName)}
                onClick={openCreateTemplate}
              >
                <Plus className={primaryActionIconClassName} />
                Create Template
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted text-sm  text-muted-foreground">
                  <tr>
                    <th className="px-6 py-4 font-medium">
                      <button
                        type="button"
                        onClick={() => handleTemplateSort("name")}
                        className={getSortToggleClass(templateSortKey === "name")}
                      >
                        Template Name{" "}
                        <SortDirectionIcon
                          active={templateSortKey === "name"}
                          direction={templateSortDirection}
                        />
                      </button>
                    </th>
                    <th className="w-[280px] max-w-[280px] px-6 py-4 font-medium">
                      <button
                        type="button"
                        onClick={() => handleTemplateSort("variables")}
                        className={getSortToggleClass(templateSortKey === "variables")}
                      >
                        Variables{" "}
                        <SortDirectionIcon
                          active={templateSortKey === "variables"}
                          direction={templateSortDirection}
                        />
                      </button>
                    </th>
                    <th className="px-6 py-4 font-medium">
                      <button
                        type="button"
                        onClick={() => handleTemplateSort("status")}
                        className={getSortToggleClass(templateSortKey === "status")}
                      >
                        Status{" "}
                        <SortDirectionIcon
                          active={templateSortKey === "status"}
                          direction={templateSortDirection}
                        />
                      </button>
                    </th>
                    <th className="px-6 py-4 font-medium">
                      <button
                        type="button"
                        onClick={() => handleTemplateSort("createdAt")}
                        className={getSortToggleClass(templateSortKey === "createdAt")}
                      >
                        Created At{" "}
                        <SortDirectionIcon
                          active={templateSortKey === "createdAt"}
                          direction={templateSortDirection}
                        />
                      </button>
                    </th>
                    <th className="px-6 py-4 font-medium">
                      <button
                        type="button"
                        onClick={() => handleTemplateSort("updatedAt")}
                        className={getSortToggleClass(templateSortKey === "updatedAt")}
                      >
                        Updated At{" "}
                        <SortDirectionIcon
                          active={templateSortKey === "updatedAt"}
                          direction={templateSortDirection}
                        />
                      </button>
                    </th>
                    <th className="px-6 py-4 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingTemplates ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-sm text-muted-foreground">
                        Loading templates...
                      </td>
                    </tr>
                  ) : sortedTemplates.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-sm text-muted-foreground">
                        No templates found. Create one to get started.
                      </td>
                    </tr>
                  ) : (
                    templatePagination.pagedItems.map((template) => {
                      const status = template.active === false ? "inactive" : "active";

                      return (
                        <tr
                          key={template._id}
                          className="border-b border-border transition-colors hover:bg-muted"
                        >
                          <td className="px-6 py-4">
                            <p className="font-semibold text-foreground">{template.templateName}</p>
                          </td>
                          <td className="w-[280px] max-w-[280px] px-6 py-4 align-top text-muted-foreground">
                            {template.variables?.length ? (
                              <div className="flex max-w-[248px] flex-wrap gap-1.5">
                                {template.variables.map((variable) => (
                                  <span
                                    key={variable}
                                    className="inline-flex max-w-full break-all rounded-md border border-border bg-muted/40 px-2 py-0.5 font-mono text-xs leading-snug text-foreground"
                                  >
                                    {`{{${variable}}}`}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <Badge
                              variant={status === "active" ? "success" : "secondary"}
                              className="capitalize"
                            >
                              {status}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                            {template.createdAt ? formatDateTime(template.createdAt) : "-"}
                          </td>
                          <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                            {template.updatedAt ? formatDateTime(template.updatedAt) : "-"}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip title="Edit Template" placement="bottom">
                                <span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="cursor-pointer"
                                    onClick={() => void openEditTemplate(template._id)}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                </span>
                              </Tooltip>
                              <Tooltip title="Delete Template" placement="bottom">
                                <span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="cursor-pointer"
                                    onClick={() => setDeleteTemplate(template)}
                                  >
                                    <Trash2 className="h-4 w-4 !text-red-500" />
                                  </Button>
                                </span>
                              </Tooltip>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <TablePaginationFooter
              {...bindTablePaginationFooter(templatePagination)}
              className="border-border"
            />
          </Card>
        )}
      </div>

      <Dialog
        open={templateDialogOpen}
        onOpenChange={(open) => {
          setTemplateDialogOpen(open);
          if (!open) resetTemplateForm();
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto rounded-[24px]">
          <DialogHeader>
            <DialogTitle>{isEditingTemplate ? "Edit Template" : "Create Template"}</DialogTitle>

          </DialogHeader>

          <div className="space-y-4 py-2">
            {isLoadingTemplate ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                Loading template...
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Template Name</label>
                  <Input
                    value={templateForm.name}
                    onChange={(event) =>
                      setTemplateForm((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="e.g. Gold price drop alert"
                    className="h-11 rounded-xl border-border bg-background"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Route</label>
                  <Select
                    value={templateForm.route || NONE_ROUTE_VALUE}
                    onValueChange={(value) =>
                      setTemplateForm((current) => ({
                        ...current,
                        route: value === NONE_ROUTE_VALUE ? "" : value,
                      }))
                    }
                  >
                    <SelectTrigger className="h-11 rounded-xl border-border bg-background">
                      <SelectValue placeholder="Select route" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72 w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)]">
                      <SelectItem value={NONE_ROUTE_VALUE}>None</SelectItem>
                      {MOBILE_NOTIFICATION_ROUTES.map((route) => (
                        <SelectItem key={route} value={route} className="max-w-full">
                          {route}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {templateDialogOpen ? (
                  <NotificationHtmlTemplateDesigner
                    key={templateForm.templateId || "new-template"}
                    value={templateForm.content}
                    onChange={(content) =>
                      setTemplateForm((current) => ({ ...current, content }))
                    }
                  />
                ) : null}
              </>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              variant="outline"
              className="cursor-pointer"
              onClick={() => setTemplateDialogOpen(false)}
              disabled={isSavingTemplate}
            >
              Cancel
            </Button>
            <Button
              className={primaryActionButtonClassName}
              onClick={() => void handleSaveTemplate()}
              disabled={isSavingTemplate || isLoadingTemplate}
            >
              <FileText className={primaryActionIconClassName} />
              {isSavingTemplate
                ? "Saving..."
                : isEditingTemplate
                  ? "Update Template"
                  : "Save as Draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={Boolean(deleteTemplate)}
        title="Delete Template"
        message={`Are you sure you want to delete ${deleteTemplate?.templateName ?? "this template"}?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isLoading={isDeletingTemplate}
        onOpenChange={(open) => {
          if (!open && !isDeletingTemplate) {
            setDeleteTemplate(null);
          }
        }}
        onConfirm={async () => {
          if (!deleteTemplate) return;

          try {
            await handleDeleteTemplate(deleteTemplate._id);
            setDeleteTemplate(null);
          } catch {
            // Error toast is handled in handleDeleteTemplate.
          }
        }}
      />
    </Layout>
  );
}
