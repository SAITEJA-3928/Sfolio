import * as React from "react";
import { Layout } from "@/components/layout";
import { Card, Badge, Input } from "@/components/ui";
import { CampaignsTablePanel } from "@/pages/campaigns";
import { Search } from "lucide-react";
import { TableHeaderFilter } from "@/components/table-header-filter";
import { getSortToggleClass, SortDirectionIcon, useTableSort } from "@/lib/table-sort";
import { useListGifts } from "@/lib/api-client-react";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";
import { TablePaginationFooter } from "@/components/table-pagination-footer";
import { bindTablePaginationFooter, useTablePagination } from "@/lib/table-pagination";
import { usePersistedSearchTerm, createPersistedSearchTermKey } from "@/lib/persisted-page-filters";

const PAGE_TABS = ["Gifts", "Campaign"] as const;
type PageTab = (typeof PAGE_TABS)[number];
const CAMPAIGN_TAB_PARAM = "campaign";
function getInitialGiftsPageTab(): PageTab {
  if (typeof window === "undefined") return "Gifts";

  const tab = new URLSearchParams(window.location.search).get("tab");
  if (tab === CAMPAIGN_TAB_PARAM || tab === "Campaign") return "Campaign";
  return "Gifts";
}
function syncGiftsPageTabToUrl(tab: PageTab) {
  if (typeof window === "undefined") return;

  const params = new URLSearchParams(window.location.search);
  if (tab === "Campaign") {
    params.set("tab", CAMPAIGN_TAB_PARAM);
  } else {
    params.delete("tab");
  }

  const query = params.toString();
  window.history.replaceState({}, "", query ? `?${query}` : window.location.pathname);
}

const GIFTS_CAMPAIGN_COLUMN_WIDTHS = [
  "4%",
  "24%",
  "12%",
  "16%",
  "14%",
  "10%",
  "20%",
] as const;

const GIFT_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "PENDING", label: "Pending" },
  // { value: "TRANSFER_IN_PROGRESS", label: "In Progress" },
  // { value: "CONFIRMED", label: "Confirmed" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
  // { value: "FAILED", label: "Failed" },
] as const;

type GiftStatusFilter = (typeof GIFT_STATUS_FILTER_OPTIONS)[number]["value"];
type GiftSortKey = "sender" | "recipient" | "amount" | "metal" | "status" | "date";

function normalizeFilterValue(value?: string) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");
}

function getMetalFilterValue(value?: string) {
  const normalized = normalizeFilterValue(value);
  if (!normalized) return "";
  if (normalized.includes("gold")) return "gold";
  if (normalized.includes("silver")) return "silver";
  return normalized;
}

function formatMetalLabel(value?: string) {
  const normalized = getMetalFilterValue(value);
  if (!normalized) return "-";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

const normalizeStatus = (status?: string) => status?.trim().toUpperCase() ?? "";

const getBadgeVariant = (status: string) => {
  switch (status) {
    case "ACCEPTED":
      return "success";
    case "CONFIRMED":
    case "TRANSFER_IN_PROGRESS":
      return "default";
    case "PENDING":
      return "warning";
    case "REJECTED":
    case "FAILED":
    case "CANCELLED":
      return "destructive";
    default:
      return "default";
  }
};


function GiftsTablePanel() {
  const [statusFilter, setStatusFilter] = React.useState<GiftStatusFilter>("all");
  const [metalTypeFilter, setMetalTypeFilter] = React.useState("all");
  const [search, setSearch] = usePersistedSearchTerm(createPersistedSearchTermKey("gifts"));
  const { sortKey, sortDirection, directionFactor, handleSort } =
    useTableSort<GiftSortKey>();

  const { data: giftsData, isLoading } = useListGifts();

  const handleStatusFilterChange = React.useCallback((value: string) => {
    setStatusFilter(value as GiftStatusFilter);
  }, []);
  const handleMetalFilterChange = React.useCallback((value: string) => {
    setMetalTypeFilter(value);
  }, []);

  const gifts =
    giftsData?.gifts?.map((g: any) => ({
      id: g._id,
      senderName: g.senderName,
      recipientName: g.receiverName,
      mobile: g.receiverMobileNumber,
      amount: g.amount,
      metalType: typeof g.metalType === "string" ? g.metalType : undefined,
      normalizedMetalType: getMetalFilterValue(g.metalType),
      status: normalizeStatus(g.status),
      createdAt: g.createdAt,
    })) || [];


  const filteredGifts = gifts.filter((g: any) => {
    const q = search.trim().toLowerCase();
    const matchesStatus = statusFilter === "all" || g.status === statusFilter;
    const matchesMetal =
      metalTypeFilter === "all" || g.normalizedMetalType === metalTypeFilter;
    const matchesSearch =
      !q ||
      g.id?.toLowerCase().includes(q) ||
      g.senderName?.toLowerCase().includes(q) ||
      g.recipientName?.toLowerCase().includes(q) ||
      g.mobile?.includes(q);

    return matchesStatus && matchesMetal && matchesSearch;
  });

  const metalTypeOptions = React.useMemo(() => {
    const options = new Set<string>();
    for (const gift of gifts) {
      if (gift.normalizedMetalType) options.add(gift.normalizedMetalType);
    }
    return Array.from(options).sort();
  }, [gifts]);

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
  const sortedGifts = React.useMemo(() => {
    if (!sortKey) return filteredGifts;

    return [...filteredGifts].sort((a: any, b: any) => {
      if (sortKey === "sender") {
        return String(a.senderName ?? "").localeCompare(String(b.senderName ?? "")) * directionFactor;
      }
      if (sortKey === "recipient") {
        return String(a.recipientName ?? "").localeCompare(String(b.recipientName ?? "")) * directionFactor;
      }
      if (sortKey === "amount") {
        return (Number(a.amount ?? 0) - Number(b.amount ?? 0)) * directionFactor;
      }
      if (sortKey === "metal") {
        return String(a.normalizedMetalType ?? "").localeCompare(String(b.normalizedMetalType ?? "")) *
          directionFactor;
      }
      if (sortKey === "status") {
        return String(a.status ?? "").localeCompare(String(b.status ?? "")) * directionFactor;
      }
      const aValue = new Date(a.createdAt ?? 0).getTime();
      const bValue = new Date(b.createdAt ?? 0).getTime();
      return (aValue - bValue) * directionFactor;
    });
  }, [directionFactor, filteredGifts, sortKey]);

  const pagination = useTablePagination(sortedGifts);

  React.useEffect(() => {
    pagination.resetPage();
  }, [pagination.resetPage, statusFilter, metalTypeFilter, search]);

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-white/5 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by ID, sender, recipient, mobile..."
                className="pl-10"
                aria-label="Search gifts"
              />
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted text-sm  text-muted-foreground">
              <tr>
                <th className="px-6 py-4 font-medium">
                  <button type="button" onClick={() => handleSort("sender")} className={getSortToggleClass(sortKey === "sender")}>
                    Sender <SortDirectionIcon active={sortKey === "sender"} direction={sortDirection} />
                  </button>
                </th>
                <th className="px-6 py-4 font-medium">
                  <button type="button" onClick={() => handleSort("recipient")} className={getSortToggleClass(sortKey === "recipient")}>
                    Recipient <SortDirectionIcon active={sortKey === "recipient"} direction={sortDirection} />
                  </button>
                </th>
                <th className="px-6 py-4 font-medium">
                  <button type="button" onClick={() => handleSort("amount")} className={getSortToggleClass(sortKey === "amount")}>
                    Amount <SortDirectionIcon active={sortKey === "amount"} direction={sortDirection} />
                  </button>
                </th>
                <th className="px-6 py-4 font-medium">
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => handleSort("metal")} className={getSortToggleClass(sortKey === "metal")}>
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
                <th className="px-6 py-4 font-medium">
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => handleSort("status")} className={getSortToggleClass(sortKey === "status")}>
                      Status <SortDirectionIcon active={sortKey === "status"} direction={sortDirection} />
                    </button>
                    <TableHeaderFilter
                      title="Status"
                      value={statusFilter}
                      onChange={handleStatusFilterChange}
                      options={[...GIFT_STATUS_FILTER_OPTIONS]}
                      activeWhen={(value) => value !== "all"}
                      clearValue="all"
                    />
                  </div>
                </th>
                <th className="px-6 py-4 font-medium">
                  <button type="button" onClick={() => handleSort("date")} className={getSortToggleClass(sortKey === "date")}>
                    Created <SortDirectionIcon active={sortKey === "date"} direction={sortDirection} />
                  </button>
                </th>
              </tr>
            </thead>

            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="text-center py-10">
                    Loading...
                  </td>
                </tr>
              ) : pagination.pagedItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10">
                    No gifts found
                  </td>
                </tr>
              ) : (
                pagination.pagedItems.map((gift: any) => (
                  <tr
                    key={gift.id}
                    className="border-b border-border hover:bg-muted transition-colors"
                  >
                    <td className="px-6 py-4 font-medium">
                      {gift.senderName}
                    </td>

                    <td className="px-6 py-4">
                      <div>{gift.recipientName}</div>
                      <div className="text-xs text-muted-foreground">
                        {gift.mobile}
                      </div>
                    </td>

                    <td className="px-6 py-4 font-semibold">
                      {formatCurrency(gift.amount)}
                    </td>

                    <td className="px-6 py-4 capitalize text-foreground">
                      {formatMetalLabel(gift.metalType)}
                    </td>

                    <td className="px-6 py-4">
                      <Badge
                        variant={getBadgeVariant(gift.status)}
                        className="capitalize"
                      >
                        {gift.status.replaceAll("_", " ").toLowerCase()}
                      </Badge>
                    </td>

                    <td className="whitespace-nowrap px-6 py-4 text-sm text-muted-foreground">
                      {gift.createdAt ? formatDateTime(gift.createdAt) : "-"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <TablePaginationFooter
          {...bindTablePaginationFooter(pagination)}
          itemLabel="gifts"
          className="border-white/5"
        />
    </Card>
  );
}
export default function GiftsList() {
  const [activeTab, setActiveTab] = React.useState<PageTab>(getInitialGiftsPageTab);

  const handleTabChange = React.useCallback((tab: PageTab) => {
    setActiveTab(tab);
    syncGiftsPageTabToUrl(tab);
  }, []);

  return (
    <Layout title="Gifting Operations">
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
              aria-current={activeTab === tab ? "page" : undefined}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "Gifts" ? (
          <GiftsTablePanel />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <CampaignsTablePanel embedded columnWidths={GIFTS_CAMPAIGN_COLUMN_WIDTHS} />
          </div>
        )}
      </div>
    </Layout>
  );
}
