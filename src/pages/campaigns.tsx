import * as React from "react";
import { Layout } from "@/components/layout";
import { Badge, Button, Card, Input } from "@/components/ui";
import { TableHeaderFilter, TableHeaderWithFilter } from "@/components/table-header-filter";
import { useLocation } from "wouter";
import { ChevronDown, ChevronRight, Plus, Search } from "lucide-react";
import { formatDateRangeValue } from "@/lib/date-range";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";
import { buildGiftApiUrl } from "@/lib/api-config";
import { customFetch } from "@/lib/custom-fetch";
import {
  confirmCampaignPayment,
  createCampaignRecord,
  getApiResponseMessage as getCampaignApiMessage,
  isApiSuccessResponse as isCampaignApiSuccess,
  requestCampaignPaymentOrder,
  unwrapCampaignIdFromResponse,
  unwrapCampaignPaymentData,
} from "@/lib/campaign-payment";
import { openCampaignRazorpayCheckout } from "@/lib/razorpay-checkout";
import { getSortToggleClass, SortDirectionIcon, useTableSort } from "@/lib/table-sort";
import { toast } from "@/hooks/use-toast";
import { TablePaginationFooter } from "@/components/table-pagination-footer";
import { bindTablePaginationFooter, useTablePagination } from "@/lib/table-pagination";
import { usePersistedSearchTerm, createPersistedSearchTermKey } from "@/lib/persisted-page-filters";

const PAGE_SIZE = 20;
const CAMPAIGN_TABLE_COLUMN_COUNT_FULL = 8;
const CAMPAIGN_TABLE_COLUMN_COUNT_EMBEDDED = 7;

type CampaignSortKey = "name" | "status" | "scheduledDate" | "recipients" | "totalAmount";

type CampaignStatusFilter = "all" | "draft" | "pending" | "success";

const CAMPAIGN_STATUS_FILTER_OPTIONS: { value: CampaignStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "pending", label: "Pending" },
  { value: "success", label: "Success" },
];


type CampaignRecipientRow = {
  empId: string;
  name: string;
  email: string;
  mobile: string;
  panNumber: string;
  amount: number;
  customFields?: Record<string, string>;
};

type CampaignListItem = {
  id: string;
  name: string;
  status: string;
  scheduledDate?: string;
  createdAt?: string;
  uploadedBy: string;
  excelFileName: string;
  uploadedAt?: string;
  totalRecipients: number;
  totalBudget: number;
  giftAmount: number;
  assetType: string;
  searchText: string;
};

function pickNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function resolveUploadedBy(item: Record<string, unknown>): string {
  const createdBy =
    typeof item.createdBy === "string"
      ? item.createdBy.trim()
      : "";
  if (createdBy) return createdBy;

  const fromApi = pickNonEmptyString(
    item.uploadedBy,
    item.uploadedByName,
    item.createdByName,
    item.updatedBy,
    item.uploaderName,
  );
  if (fromApi) return fromApi;

  const createdByValue = item.createdBy;
  if (createdByValue && typeof createdByValue === "object") {
    const user = createdByValue as Record<string, unknown>;
    const populatedName = pickNonEmptyString(user.name, user.userName, user.fullName, user.email);
    if (populatedName) return populatedName;
  }
  return "";
}

function resolveExcelFileName(item: Record<string, unknown>): string {
  return pickNonEmptyString(
    item.excelFileName,
    item.uploadedExcelFile,
    item.uploadedExcelFileName,
    item.excelFile,
    item.uploadedExcel,
  );
}

function resolveUploadedAt(item: Record<string, unknown>): string | undefined {
  const raw =
    item.uploadedAt ??
    item.uploadedExcelAt ??
    item.excelUploadedAt ??
    item.uploadedExcelDate;

  if (typeof raw === "string" && raw.trim()) {
    return raw;
  }

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString();
  }

  return undefined;
}

function isApiSuccessResponse(res: unknown): boolean {
  if (!res || typeof res !== "object") return false;
  const record = res as Record<string, unknown>;
  if (record.success === true) return true;
  if (record.status === true) return true;
  if (record.status === "true") return true;
  return false;
}

function normalizeSearchValue(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function mapRecipientFromApi(
  recipient: Record<string, unknown>,
  giftAmount: number,
): CampaignRecipientRow {
  const knownKeys = new Set([
    "empId",
    "empid",
    "employeeId",
    "name",
    "recipientName",
    "email",
    "recipientEmail",
    "mobile",
    "recipientMobile",
    "phone",
    "panNumber",
    "pan",
    "amount",
  ]);
  const customFields: Record<string, string> = {};
  for (const [key, value] of Object.entries(recipient)) {
    if (knownKeys.has(key)) continue;
    customFields[key] = value == null ? "" : String(value);
  }

  return {
    empId: String(recipient.empId ?? recipient.empid ?? recipient.employeeId ?? ""),
    name: String(recipient.name ?? recipient.recipientName ?? ""),
    email: String(recipient.email ?? recipient.recipientEmail ?? ""),
    mobile: String(recipient.mobile ?? recipient.recipientMobile ?? recipient.phone ?? ""),
    panNumber: String(recipient.panNumber ?? recipient.pan ?? ""),
    amount: Number(recipient.amount) || giftAmount,
    customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
  };
}

function unwrapCampaignRecipients(campaign: Record<string, unknown>): CampaignRecipientRow[] {
  const giftAmount = Number(campaign.giftAmount) || 0;
  const recipients = Array.isArray(campaign.recipients) ? campaign.recipients : [];

  return recipients
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((recipient) => mapRecipientFromApi(recipient, giftAmount));
}

function buildCampaignSearchText(
  item: Record<string, unknown>,
  recipients: Record<string, unknown>[],
): string {
  const giftAmount = Number(item.giftAmount) || 0;
  const recipientFields = recipients.flatMap((recipient) => {
    const mapped = mapRecipientFromApi(recipient, giftAmount);
    return [
      mapped.empId,
      mapped.name,
      mapped.email,
      mapped.mobile,
      mapped.panNumber,
      String(mapped.amount),
    ];
  });

  return [
    item.campaignName,
    item.status,
    item.scheduledDate,
    item.assetType,
    item.totalAmount,
    item.totalUsers,
    item.giftAmount,
    resolveUploadedBy(item),
    resolveExcelFileName(item),
    resolveUploadedAt(item),
    ...recipientFields,
  ]
    .map(normalizeSearchValue)
    .filter(Boolean)
    .join(" ");
}

function mapCampaignFromApi(item: Record<string, unknown>): CampaignListItem {
  const recipients = Array.isArray(item.recipients)
    ? item.recipients.filter(
      (entry): entry is Record<string, unknown> => !!entry && typeof entry === "object",
    )
    : [];

  return {
    id: String(item._id ?? ""),
    name: String(item.campaignName ?? ""),
    status: String(item.status ?? "Pending"),
    scheduledDate:
      typeof item.scheduledDate === "string"
        ? item.scheduledDate
        : item.scheduledDate instanceof Date
          ? item.scheduledDate.toISOString()
          : undefined,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : undefined,
    totalRecipients: typeof item.totalUsers === "number" ? item.totalUsers : recipients.length,
    totalBudget:
      typeof item.totalAmount === "number"
        ? item.totalAmount
        : Number(item.totalAmount) || 0,
    giftAmount:
      typeof item.giftAmount === "number" ? item.giftAmount : Number(item.giftAmount) || 0,
    assetType: typeof item.assetType === "string" ? item.assetType : "-",
    uploadedBy: resolveUploadedBy(item),
    excelFileName: resolveExcelFileName(item),
    uploadedAt: resolveUploadedAt(item),
    searchText: buildCampaignSearchText(item, recipients),
  };
}

function campaignMatchesSearch(campaign: CampaignListItem, normalizedTerm: string) {
  if (!normalizedTerm) return true;
  return campaign.searchText.includes(normalizedTerm);
}

function normalizeCampaignStatus(status: string) {
  return status.trim().toLowerCase();
}

function formatCampaignScheduledDate(value?: string): string {
  if (!value?.trim()) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return formatDateRangeValue(date);
}

function getScheduledDateSortValue(value?: string): number {
  if (!value?.trim()) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function campaignMatchesStatusFilter(
  campaign: CampaignListItem,
  statusFilter: CampaignStatusFilter,
) {
  if (statusFilter === "all") return true;

  const normalized = normalizeCampaignStatus(campaign.status);
  if (statusFilter === "draft") return normalized === "draft";
  if (statusFilter === "pending") return normalized === "pending";
  if (statusFilter === "success") {
    return (
      normalized === "success" ||
      normalized === "completed" ||
      normalized === "approved"
    );
  }

  return true;
}

async function fetchCampaigns(): Promise<CampaignListItem[]> {
  const res = await customFetch(buildGiftApiUrl("/campaign/getCampaigns"), { method: "GET" });
  if (!isApiSuccessResponse(res)) return [];

  const data = (res as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];

  return data.map((item) =>
    mapCampaignFromApi(
      item && typeof item === "object" ? (item as Record<string, unknown>) : {},
    ),
  );
}

function getStatusVariant(status: string): "success" | "warning" | "default" {
  const normalized = normalizeCampaignStatus(status);
  if (normalized === "completed" || normalized === "success" || normalized === "approved") {
    return "success";
  }
  if (normalized === "pending" || normalized === "draft") return "warning";
  return "default";
}

function isDraftStatus(status: string): boolean {
  return status.trim().toLowerCase() === "draft";
}

function getApiResponseMessage(res: unknown, fallback: string): string {
  if (!res || typeof res !== "object") return fallback;
  const message = (res as Record<string, unknown>).message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

function unwrapCampaignFromResponse(res: unknown): Record<string, unknown> | null {
  if (!res || typeof res !== "object") return null;
  const record = res as Record<string, unknown>;
  const data = record.data;

  if (Array.isArray(data)) {
    const first = data[0];
    return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
  }

  if (data && typeof data === "object") {
    return data as Record<string, unknown>;
  }

  return null;
}

function buildCreateCampaignPayload(
  campaign: Record<string, unknown>,
  campaignId: string,
): Record<string, unknown> {
  const giftAmount = Number(campaign.giftAmount) || 0;
  const recipients = Array.isArray(campaign.recipients) ? campaign.recipients : [];

  return {
    campaignId,
    campaignName: String(campaign.campaignName ?? ""),
    assetType: String(campaign.assetType ?? "GOLD"),
    scheduledDate:
      campaign.scheduledDate != null && campaign.scheduledDate !== ""
        ? new Date(String(campaign.scheduledDate)).toISOString()
        : null,
    recipients: recipients
      .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
      .map((recipient) => ({
        empId: String(recipient.empId ?? recipient.empid ?? recipient.employeeId ?? ""),
        name: String(recipient.name ?? recipient.recipientName ?? ""),
        email: String(recipient.email ?? recipient.recipientEmail ?? ""),
        mobile: String(recipient.mobile ?? recipient.recipientMobile ?? recipient.phone ?? ""),
        panNumber: String(recipient.panNumber ?? recipient.pan ?? ""),
        amount: Number(recipient.amount) || giftAmount,
      })),
  };
}

function CampaignRecipientsDetailTable({ rows }: { rows: CampaignRecipientRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-muted-foreground">
        No participants found for this campaign.
      </p>
    );
  }

  const extraColumns = Array.from(
    rows.reduce((set, row) => {
      for (const key of Object.keys(row.customFields ?? {})) set.add(key);
      return set;
    }, new Set<string>()),
  );

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border bg-card">
      <table className="min-w-[1200px] table-fixed text-left text-sm text-foreground">
        <thead className="bg-muted text-sm  text-muted-foreground">
          <tr>
            <th className="px-3 py-3 font-medium">Employee Id</th>
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="w-[260px] px-4 py-3 font-medium">Email</th>
            <th className="w-[160px] px-4 py-3 font-medium">Phone Number</th>
            <th className="px-4 py-3 font-medium">Pan Number</th>
            {extraColumns.map((column) => (
              <th key={column} className="px-4 py-3 font-medium">
                {column}
              </th>
            ))}
            <th className="px-4 py-3 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((recipient, index) => (
            <tr
              key={`${recipient.empId}-${recipient.email}-${index}`}
              className="border-b border-border transition-colors last:border-0 hover:bg-muted"
            >
              <td className="px-3 py-3 text-muted-foreground">{recipient.empId || "—"}</td>
              <td className="px-4 py-3 text-foreground">{recipient.name || "—"}</td>
              <td className="break-all px-4 py-3 text-muted-foreground">{recipient.email || "—"}</td>
              <td className="break-all px-4 py-3 text-muted-foreground">{recipient.mobile || "—"}</td>
              <td className="px-4 py-3 text-muted-foreground">{recipient.panNumber || "—"}</td>
              {extraColumns.map((column) => (
                <td key={`${recipient.empId}-${recipient.email}-${index}-${column}`} className="px-4 py-3 text-muted-foreground">
                  {recipient.customFields?.[column] || "—"}
                </td>
              ))}
              <td className="px-4 py-3 text-right font-semibold text-foreground">
                {formatCurrency(recipient.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type CampaignsTablePanelProps = {
  /** When true, hides create/pay actions (e.g. Gifts page tab). */
  embedded?: boolean;
  /** Optional column widths (must match column count). Amount column should be last. */
  columnWidths?: readonly string[];
};

const DEFAULT_EMBEDDED_COLUMN_WIDTHS = ["4%", "24%", "12%", "16%", "14%", "10%", "20%"] as const;
const DEFAULT_FULL_COLUMN_WIDTHS = ["3rem", "18%", "10%", "14%", "12%", "10%"] as const;

export function CampaignsTablePanel({
  embedded = false,
  columnWidths,
}: CampaignsTablePanelProps) {
  const [, navigate] = useLocation();
  const campaignTableColumnCount = embedded
    ? CAMPAIGN_TABLE_COLUMN_COUNT_EMBEDDED
    : CAMPAIGN_TABLE_COLUMN_COUNT_FULL;
  const resolvedColumnWidths = React.useMemo(() => {
    if (columnWidths?.length === campaignTableColumnCount) {
      return columnWidths;
    }
    if (embedded) {
      return DEFAULT_EMBEDDED_COLUMN_WIDTHS;
    }
    return DEFAULT_FULL_COLUMN_WIDTHS;
  }, [campaignTableColumnCount, columnWidths, embedded]);
  const usesExplicitFullWidthColumns =
    resolvedColumnWidths.length === campaignTableColumnCount;
  const [campaigns, setCampaigns] = React.useState<CampaignListItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [searchTerm, setSearchTerm] = usePersistedSearchTerm(
    createPersistedSearchTermKey(embedded ? "gifts-campaign" : "campaigns"),
  );
  const [statusFilter, setStatusFilter] = React.useState<CampaignStatusFilter>("all");
  const [payingCampaignId, setPayingCampaignId] = React.useState<string | null>(null);
  const [expandedCampaignId, setExpandedCampaignId] = React.useState<string | null>(null);
  const [recipientsByCampaignId, setRecipientsByCampaignId] = React.useState<
    Record<string, CampaignRecipientRow[]>
  >({});
  const [campaignDetailLoadingId, setCampaignDetailLoadingId] = React.useState<string | null>(null);
  const { sortKey, sortDirection, directionFactor, handleSort } =
    useTableSort<CampaignSortKey>();

  const loadCampaigns = React.useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const list = await fetchCampaigns();
      setCampaigns(list);
    } catch (err) {
      console.error("Error fetching campaigns:", err);
      setLoadError(err instanceof Error ? err.message : "Failed to load campaigns");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  const filteredCampaigns = React.useMemo(() => {
    const term = normalizeSearchValue(searchTerm);
    return campaigns.filter((campaign) => {
      if (!campaignMatchesStatusFilter(campaign, statusFilter)) return false;
      if (term && !campaignMatchesSearch(campaign, term)) return false;
      return true;
    });
  }, [campaigns, searchTerm, statusFilter]);

  const sortedCampaigns = React.useMemo(() => {
    if (!sortKey) return filteredCampaigns;

    return [...filteredCampaigns].sort((a, b) => {
      if (sortKey === "name") {
        return a.name.localeCompare(b.name) * directionFactor;
      }
      if (sortKey === "status") {
        return a.status.localeCompare(b.status) * directionFactor;
      }
      if (sortKey === "scheduledDate") {
        return (
          (getScheduledDateSortValue(a.scheduledDate) - getScheduledDateSortValue(b.scheduledDate)) *
          directionFactor
        );
      }
      if (sortKey === "recipients") {
        return (a.totalRecipients - b.totalRecipients) * directionFactor;
      }
      if (sortKey === "totalAmount") {
        return (a.totalBudget - b.totalBudget) * directionFactor;
      }
      return 0;
    });
  }, [filteredCampaigns, directionFactor, sortKey]);

  const pagination = useTablePagination(sortedCampaigns);

  const visibleCampaigns = React.useMemo(
    () =>
      pagination.pagedItems.filter(
        (campaign) => expandedCampaignId === null || expandedCampaignId === campaign.id,
      ),
    [expandedCampaignId, pagination.pagedItems],
  );

  React.useEffect(() => {
    pagination.resetPage();
  }, [pagination.resetPage, sortKey, sortDirection, searchTerm, statusFilter]);

  const toggleCampaignRowExpand = React.useCallback(
    async (campaign: CampaignListItem) => {
      if (expandedCampaignId === campaign.id) {
        setExpandedCampaignId(null);
        return;
      }

      setExpandedCampaignId(campaign.id);

      if (recipientsByCampaignId[campaign.id]) return;

      setCampaignDetailLoadingId(campaign.id);
      try {
        const detailRes = await customFetch(
          buildGiftApiUrl(`/campaign/getCampaigns/${campaign.id}`),
          { method: "GET" },
        );

        if (!isApiSuccessResponse(detailRes)) {
          setRecipientsByCampaignId((prev) => ({ ...prev, [campaign.id]: [] }));
          return;
        }

        const campaignData = unwrapCampaignFromResponse(detailRes);
        const recipients = campaignData ? unwrapCampaignRecipients(campaignData) : [];
        setRecipientsByCampaignId((prev) => ({ ...prev, [campaign.id]: recipients }));
      } catch {
        setRecipientsByCampaignId((prev) => ({ ...prev, [campaign.id]: [] }));
      } finally {
        setCampaignDetailLoadingId(null);
      }
    },
    [expandedCampaignId, recipientsByCampaignId],
  );

  const handlePayCampaign = async (campaign: CampaignListItem) => {
    setPayingCampaignId(campaign.id);
    try {
      const detailRes = await customFetch(
        buildGiftApiUrl(`/campaign/getCampaigns/${campaign.id}`),
        { method: "GET" },
      );

      if (!isApiSuccessResponse(detailRes)) {
        toast({
          title: "Error",
          description: getApiResponseMessage(detailRes, "Failed to load campaign"),
          variant: "destructive",
        });
        return;
      }

      const campaignData = unwrapCampaignFromResponse(detailRes);
      if (!campaignData) {
        toast({
          title: "Error",
          description: "Campaign details were not found",
          variant: "destructive",
        });
        return;
      }

      const payload = buildCreateCampaignPayload(campaignData, campaign.id);
      const recipientList = payload.recipients;

      if (!Array.isArray(recipientList) || recipientList.length === 0) {
        toast({
          title: "Error",
          description: "This campaign has no participants to pay for",
          variant: "destructive",
        });
        return;
      }

      let paymentRes = await createCampaignRecord(payload, null);
      if (!isCampaignApiSuccess(paymentRes)) {
        toast({
          title: "Error",
          description: getCampaignApiMessage(paymentRes, "Could not start payment"),
          variant: "destructive",
        });
        return;
      }

      let campaignIdForPayment = unwrapCampaignIdFromResponse(paymentRes) ?? campaign.id;
      let payment = unwrapCampaignPaymentData(paymentRes);

      if (!payment) {
        paymentRes = await requestCampaignPaymentOrder(campaign.id, payload, null);
        if (!isCampaignApiSuccess(paymentRes)) {
          toast({
            title: "Error",
            description: getCampaignApiMessage(paymentRes, "Could not start payment"),
            variant: "destructive",
          });
          return;
        }
        campaignIdForPayment = unwrapCampaignIdFromResponse(paymentRes) ?? campaignIdForPayment;
        payment = unwrapCampaignPaymentData(paymentRes);
      }

      if (!payment) {
        toast({
          title: "Success",
          description: getCampaignApiMessage(paymentRes, "Campaign payment completed"),
        });
        await loadCampaigns();
        return;
      }

      await openCampaignRazorpayCheckout(
        {
          razorpayKeyId: payment.razorpayKeyId,
          razorpayOrderId: payment.razorpayOrderId,
          amountInPaise: payment.amountInPaise,
          currency: payment.currency,
          campaignName: campaign.name,
        },
        {
          onSuccess: async (razorpayResponse) => {
            try {
              const confirmRes = await confirmCampaignPayment(
                payload,
                payment.campaignId ?? campaignIdForPayment,
                razorpayResponse,
                null,
              );

              if (!isCampaignApiSuccess(confirmRes)) {
                toast({
                  title: "Error",
                  description: getCampaignApiMessage(confirmRes, "Could not confirm campaign payment"),
                  variant: "destructive",
                });
                return;
              }

              toast({
                title: "Success",
                description: getCampaignApiMessage(confirmRes, "Campaign payment completed"),
              });
              await loadCampaigns();
            } catch (confirmError: unknown) {
              toast({
                title: "Error",
                description:
                  confirmError instanceof Error
                    ? confirmError.message
                    : "Could not confirm payment",
                variant: "destructive",
              });
            }
          },
          onDismiss: () => {
            toast({
              title: "Payment pending",
              description: "Complete payment later to activate this campaign.",
            });
          },
        },
      );
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Payment failed",
        variant: "destructive",
      });
    } finally {
      setPayingCampaignId(null);
    }
  };

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center lg:flex-1">
              <div className="relative w-full max-w-md flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by campaign name, status, amount, or participant…"
                  className="pl-10"
                  aria-label="Search campaigns"
                />
              </div>
            </div>
            {!embedded ? (
              <Button
                variant="default"
                className="gap-2 shrink-0 cursor-pointer border-primary-border bg-primary !text-white hover:bg-primary/90 [&_svg]:!stroke-white [&_svg]:!text-white"
                onClick={() => navigate("/corporate/campaigns/create")}
              >
                <Plus className="h-4 w-4 shrink-0 stroke-[2.5] !stroke-white !text-white" aria-hidden />
                Create Campaign
              </Button>
            ) : null}
          </div>

        <div className="min-h-0 w-full flex-1 overflow-x-auto overflow-y-auto">
  <table className="min-w-[900px] table-fixed text-left text-sm text-foreground">
              <colgroup>
                {usesExplicitFullWidthColumns
                  ? resolvedColumnWidths.map((width, index) => (
                      <col key={index} style={{ width }} />
                    ))
                  : (
                    <>
                      {resolvedColumnWidths.map((width, index) => (
                        <col key={index} style={{ width }} />
                      ))}
                      <col />
                      {!embedded ? <col style={{ width: "11rem" }} /> : null}
                    </>
                  )}
              </colgroup>
              <thead className="bg-muted text-sm  text-muted-foreground">
                <tr>
                  <th className="px-2 py-3 font-medium normal-case"> </th>
                  <th className="px-4 py-3 ps-2 font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort("name")}
                      className={`cursor-pointer ${getSortToggleClass(sortKey === "name")}`}
                    >
                      Campaign Name{" "}
                      <SortDirectionIcon active={sortKey === "name"} direction={sortDirection} />
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium normal-case">Uploaded By</th>
                  <th className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort("scheduledDate")}
                      className={`cursor-pointer ${getSortToggleClass(sortKey === "scheduledDate")}`}
                    >
                      Schedule Date{" "}
                      <SortDirectionIcon
                        active={sortKey === "scheduledDate"}
                        direction={sortDirection}
                      />
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort("recipients")}
                      className={`cursor-pointer ${getSortToggleClass(sortKey === "recipients")}`}
                    >
                      Participants{" "}
                      <SortDirectionIcon
                        active={sortKey === "recipients"}
                        direction={sortDirection}
                      />
                    </button>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <TableHeaderWithFilter
                      filter={
                        <TableHeaderFilter
                          title="Status"
                          value={statusFilter}
                          clearValue="all"
                          activeWhen={(value) => value !== "all"}
                          options={CAMPAIGN_STATUS_FILTER_OPTIONS}
                          onChange={setStatusFilter}
                        />
                      }
                    >
                      <button
                        type="button"
                        onClick={() => handleSort("status")}
                        className={`cursor-pointer ${getSortToggleClass(sortKey === "status")}`}
                      >
                        Status{" "}
                        <SortDirectionIcon active={sortKey === "status"} direction={sortDirection} />
                      </button>
                    </TableHeaderWithFilter>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort("totalAmount")}
                      className={`w-full cursor-pointer text-left ${getSortToggleClass(sortKey === "totalAmount")}`}
                    >
                      Amount{" "}
                      <SortDirectionIcon
                        active={sortKey === "totalAmount"}
                        direction={sortDirection}
                      />
                    </button>
                  </th>
                  {!embedded ? (
                    <th className="px-4 py-3 pe-6 text-right font-medium normal-case">Actions</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {isLoading && campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={campaignTableColumnCount} className="px-4 py-10 text-center text-muted-foreground">
                      Loading campaigns...
                    </td>
                  </tr>
                ) : loadError && campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={campaignTableColumnCount} className="px-4 py-10 text-center text-destructive">
                      {loadError}
                    </td>
                  </tr>
                ) : campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={campaignTableColumnCount} className="px-4 py-10 text-center text-muted-foreground">
                      No campaigns found.
                    </td>
                  </tr>
                ) : filteredCampaigns.length === 0 ? (
                  <tr>
                    <td colSpan={campaignTableColumnCount} className="px-4 py-10 text-center text-muted-foreground">
                      No campaigns match your search or status filter.
                    </td>
                  </tr>
                ) : (
                  visibleCampaigns.map((campaign) => (
                  
                    <React.Fragment key={campaign.id}>
                      <tr
                        tabIndex={0}
                        role="row"
                        onClick={() => void toggleCampaignRowExpand(campaign)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            void toggleCampaignRowExpand(campaign);
                          }
                        }}
                        className={cn(
                          "cursor-pointer border-b border-border transition-colors hover:bg-muted",
                          expandedCampaignId === campaign.id && "bg-muted/40",
                        )}
                      >
                        <td className="px-2 py-3" onClick={(event) => event.stopPropagation()}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 cursor-pointer"
                            aria-expanded={expandedCampaignId === campaign.id}
                            aria-label={
                              expandedCampaignId === campaign.id
                                ? "Collapse participants"
                                : "Expand participants"
                            }
                            onClick={() => void toggleCampaignRowExpand(campaign)}
                          >
                            {expandedCampaignId === campaign.id ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </td>
                        <td className="px-4 py-3 ps-2 font-medium text-foreground">{campaign.name}</td>
                        <td className="truncate px-4 py-3 text-foreground" title={campaign.uploadedBy || undefined}>
                          {campaign.uploadedBy || "—"}
                        </td>
                        <td
                          className="px-4 py-3 text-muted-foreground whitespace-nowrap"
                          title={campaign.scheduledDate ? formatDateTime(campaign.scheduledDate) : undefined}
                        >
                          {formatCampaignScheduledDate(campaign.scheduledDate)}
                        </td>
                        <td className="px-4 py-3 text-foreground">{campaign.totalRecipients}</td>
                        <td className="px-4 py-3">
                          <Badge variant={getStatusVariant(campaign.status)} className="capitalize">
                            {campaign.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-semibold text-foreground whitespace-nowrap">
                          {formatCurrency(campaign.totalBudget)}
                        </td>
                        {!embedded ? (
                          <td
                            className="px-4 py-3 pe-6 text-right whitespace-nowrap"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {isDraftStatus(campaign.status) ? (
                              <Button
                                type="button"
                                size="sm"
                                className="h-8 px-3 cursor-pointer"
                                variant="default"
                                disabled={payingCampaignId === campaign.id}
                                onClick={() => void handlePayCampaign(campaign)}
                              >
                                {payingCampaignId === campaign.id ? "Paying..." : "Pay"}
                              </Button>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                        ) : null}
                      </tr>
                      {expandedCampaignId === campaign.id ? (
                        <tr className="border-b border-border bg-muted/30">
                          <td colSpan={campaignTableColumnCount} className="p-0">
                            <div className="p-4" onClick={(event) => event.stopPropagation()}>
                              {campaignDetailLoadingId === campaign.id ? (
                                <p className="py-6 text-center text-sm text-muted-foreground">
                                  Loading participants…
                                </p>
                              ) : (
                                <CampaignRecipientsDetailTable
                                  rows={recipientsByCampaignId[campaign.id] ?? []}
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

          {campaigns.length > 0 ? (
            <TablePaginationFooter
              {...bindTablePaginationFooter(pagination)}
              itemLabel="campaigns"
              className="border-border px-4 sm:px-6"
              disableNext={expandedCampaignId !== null}
            />
          ) : null}
        </Card>
  );
}

export default function CampaignsList() {
  return (
    <Layout title="Corporate Campaigns">
      <div className="flex h-[calc(100vh-7.5rem)] flex-col overflow-hidden">
        <CampaignsTablePanel />
      </div>
    </Layout>
  );
}
