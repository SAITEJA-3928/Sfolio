import * as React from "react";
import type { DateRange } from "react-day-picker";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Badge, Button, Card } from "@/components/ui";
import { DateRangePicker } from "@/components/ui/date-picker";
import { TableHeaderFilter } from "@/components/table-header-filter";
import {
  Activity,
  BellRing,
  Mail,
  MessageSquare,
  Smartphone,
} from "lucide-react";
import { customFetch } from "@/lib/custom-fetch";
import { buildNotificationApiUrl } from "@/lib/api-config";
import { getSortToggleClass, SortDirectionIcon, useTableSort } from "@/lib/table-sort";
import { formatDateTime } from "@/lib/utils";
import { formatDateInputValue } from "@/lib/date-range";
import { useLocation } from "wouter";
import { TablePaginationFooter } from "@/components/table-pagination-footer";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  bindTablePaginationFooter,
  useTablePagination,
} from "@/lib/table-pagination";

type NotificationLogItem = {
  id: string;
  templateId?: string;
  templateName?: string;
  recipient?: string;
  channel?: string;
  deliveryChannel?: string;
  route?: string;
  content?: string;
  status?: string;
  scheduledAt?: string;
  sentAt?: string;
  deliveredAt?: string;
};

type NotificationLogsResult = {
  logs: NotificationLogItem[];
  total: number;
  page: number;
  limit: number;
  serverPaginated: boolean;
};

type NotificationSortKey = "template" | "channel" | "status" | "sentAt";

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "sent", label: "Sent" },
  { value: "delivered", label: "Delivered" },
];

const NOTIFICATION_LOGS_ENDPOINT = buildNotificationApiUrl("/notifications/getnotifications");
const NOTIFICATION_LOGS_QUERY_KEY = [NOTIFICATION_LOGS_ENDPOINT] as const;

function normalizeNotificationLogs(value: unknown): NotificationLogsResult {
  const empty: NotificationLogsResult = {
    logs: [],
    total: 0,
    page: 1,
    limit: 10,
    serverPaginated: false,
  };

  if (Array.isArray(value)) {
    const logs = value as NotificationLogItem[];
    return {
      logs,
      total: logs.length,
      page: 1,
      limit: logs.length || 10,
      serverPaginated: false,
    };
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const rawLogs = Array.isArray(record.logs)
      ? (record.logs as NotificationLogItem[])
      : Array.isArray(record.data)
        ? (record.data as NotificationLogItem[])
        : [];
    const pagination =
      record.pagination && typeof record.pagination === "object"
        ? (record.pagination as Record<string, unknown>)
        : null;
    const serverPaginated =
      typeof pagination?.page === "number" && typeof pagination?.limit === "number";

    return {
      logs: rawLogs,
      total:
        typeof pagination?.total === "number"
          ? pagination.total
          : typeof record.total === "number"
            ? record.total
            : rawLogs.length,
      page:
        typeof pagination?.page === "number"
          ? pagination.page
          : typeof record.page === "number"
            ? record.page
            : 1,
      limit:
        typeof pagination?.limit === "number"
          ? pagination.limit
          : typeof record.limit === "number"
            ? record.limit
            : rawLogs.length || 10,
      serverPaginated,
    };
  }

  return empty;
}

function normalizeChannel(value?: string) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "gmail") return "email";
  return normalized;
}

function formatChannelLabel(value?: string) {
  const channel = normalizeChannel(value);
  if (!channel) return "-";
  if (channel === "sms") return "SMS";
  if (channel === "email") return "Email";
  if (channel === "push") return "Push";
  if (channel === "whatsapp") return "WhatsApp";
  return channel.charAt(0).toUpperCase() + channel.slice(1);
}

async function fetchAdminNotifications(params: {
  page?: number;
  limit?: number;
  status?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  fromDate?: string;
  toDate?: string;
}) {
  const search = new URLSearchParams();
  if (params.page !== undefined) {
    search.set("page", String(params.page));
  }
  if (params.limit !== undefined) {
    search.set("limit", String(params.limit));
  }
  if (params.status && params.status !== "all") {
    search.set("status", params.status);
  }
  if (params.sortBy) {
    search.set("sortBy", params.sortBy);
    search.set("sortOrder", params.sortOrder ?? "desc");
  }
  if (params.fromDate) {
    search.set("fromDate", params.fromDate);
  }
  if (params.toDate) {
    search.set("toDate", params.toDate);
  }
  const query = search.toString();
  return customFetch(
    query ? `${NOTIFICATION_LOGS_ENDPOINT}?${query}` : NOTIFICATION_LOGS_ENDPOINT,
    {
      method: "GET",
    },
  );
}

export default function NotificationsList() {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_TABLE_PAGE_SIZE);
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(undefined);
  const { sortKey, sortDirection, handleSort } =
    useTableSort<NotificationSortKey>();

  const apiSortBy = sortKey ?? undefined;
  const fromDate = dateRange?.from ? formatDateInputValue(dateRange.from) : undefined;
  const toDate = dateRange?.to
    ? formatDateInputValue(dateRange.to)
    : dateRange?.from
      ? formatDateInputValue(dateRange.from)
      : undefined;

  const {
    data: logsData,
    isError: logsErr,
    isLoading: logsLoading,
    isFetching: logsFetching,
  } = useQuery({
    queryKey: [
      ...NOTIFICATION_LOGS_QUERY_KEY,
      page,
      pageSize,
      statusFilter,
      apiSortBy ?? null,
      sortDirection,
      fromDate ?? null,
      toDate ?? null,
    ],
    queryFn: () =>
      fetchAdminNotifications({
        page,
        limit: pageSize,
        status: statusFilter,
        sortBy: apiSortBy,
        sortOrder: apiSortBy ? sortDirection : undefined,
        fromDate,
        toDate,
      }),
    placeholderData: keepPreviousData,
  });

  const logs = React.useMemo(() => normalizeNotificationLogs(logsData), [logsData]);
  const serverLogs = logs.logs;
  // True only when the backend honored page/limit (it skips paging for the
  // marketing role or older builds and returns the full list instead).
  const serverPaginated = logs.serverPaginated;

  // Client-side pagination fallback when the backend returned the full list.
  const clientPagination = useTablePagination(serverLogs);

  React.useEffect(() => {
    clientPagination.resetPage();
  }, [statusFilter, sortKey, sortDirection, dateRange, clientPagination.resetPage]);

  const totalItems = serverPaginated ? logs.total : clientPagination.totalItems;
  const totalPages = serverPaginated
    ? Math.max(1, Math.ceil(logs.total / pageSize))
    : clientPagination.totalPages;
  const currentPage = serverPaginated
    ? Math.min(page, totalPages)
    : clientPagination.currentPage;
  const visibleLogs = serverPaginated ? serverLogs : clientPagination.pagedItems;

  React.useEffect(() => {
    if (serverPaginated && page > totalPages) {
      setPage(totalPages);
    }
  }, [serverPaginated, page, totalPages]);

  const handleStatusFilterChange = React.useCallback(
    (value: string) => {
      setStatusFilter(value);
      setPage(1);
      clientPagination.resetPage();
    },
    [clientPagination],
  );

  const handleDateRangeChange = React.useCallback(
    (value?: DateRange) => {
      setDateRange(value);
      setPage(1);
      clientPagination.resetPage();
    },
    [clientPagination],
  );

  const handlePageSizeChange = React.useCallback(
    (size: number) => {
      setPageSize(size);
      setPage(1);
      clientPagination.handlePageSizeChange(size);
    },
    [clientPagination],
  );

  const goToPreviousPage = React.useCallback(() => {
    if (!serverPaginated) {
      clientPagination.goToPreviousPage();
      return;
    }
    setPage((current) => Math.max(1, current - 1));
  }, [serverPaginated, clientPagination]);

  const goToNextPage = React.useCallback(() => {
    if (!serverPaginated) {
      clientPagination.goToNextPage();
      return;
    }
    setPage((current) => current + 1);
  }, [serverPaginated, clientPagination]);

  React.useEffect(() => {
    setPage(1);
  }, [sortKey, sortDirection, dateRange]);

  const getIcon = (channel: string) => {
    switch (normalizeChannel(channel)) {
      case "email": return <Mail className="w-4 h-4" />;
      case "sms": return <MessageSquare className="w-4 h-4" />;
      case "push": return <BellRing className="w-4 h-4" />;
      case "whatsapp": return <Smartphone className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  return (
    <Layout title="Notifications">
      <div className="flex h-[calc(100vh-7.5rem)] flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-foreground">Delivery Logs</h3>

          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker
              value={dateRange}
              onChange={handleDateRangeChange}
              calendarClassName="[--cell-size:1.55rem]"
            />
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer"
              onClick={() => navigate("/notifications/create")}
            >
              Create Notification
            </Button>
          </div>
        </div>

        <Card className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted text-sm  text-muted-foreground">
                <tr>
                  <th className="px-6 py-4 font-medium">
                    Template / Recipient
                  </th>
                  <th className="px-6 py-4 font-medium">
                    <button type="button" onClick={() => handleSort("channel")} className={getSortToggleClass(sortKey === "channel")}>
                      Channel <SortDirectionIcon active={sortKey === "channel"} direction={sortDirection} />
                    </button>
                  </th>
                  <th className="max-w-[320px] px-6 py-4 font-medium">Content</th>
                  <th className="px-6 py-4 font-medium">
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => handleSort("status")} className={getSortToggleClass(sortKey === "status")}>
                        Status <SortDirectionIcon active={sortKey === "status"} direction={sortDirection} />
                      </button>
                      <TableHeaderFilter
                        title="Status"
                        value={statusFilter}
                        onChange={handleStatusFilterChange}
                        options={STATUS_FILTER_OPTIONS}
                        activeWhen={(value) => value !== "all"}
                        clearValue="all"
                      />
                    </div>
                  </th>
                  <th className="px-6 py-4 font-medium">
                    Scheduled At
                  </th>
                  <th className="px-6 py-4 font-medium">
                    <button type="button" onClick={() => handleSort("sentAt")} className={getSortToggleClass(sortKey === "sentAt")}>
                      Created At <SortDirectionIcon active={sortKey === "sentAt"} direction={sortDirection} />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {logsLoading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-muted-foreground">
                      Loading notifications...
                    </td>
                  </tr>
                ) : logsErr ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-destructive">
                      Failed to load notifications.
                    </td>
                  </tr>
                ) : visibleLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-sm text-muted-foreground">
                      No notifications found.
                    </td>
                  </tr>
                ) : (
                  visibleLogs.map((log: any) => {
                    const recipientName = log.recipientName || "Unknown";
                    const notificationType = log.notificationType || "-";
                    const channel = log.deliveryChannel || log.channel || "-";
                    const content = String(log.content ?? "").trim();
                    const status = log.status ?? (log.viewed ? "delivered" : "sent");

                    return (
                      <tr key={log.notificationId} className="border-b border-border transition-colors hover:bg-muted">
                        <td className="px-6 py-4">
                          <p className="font-semibold text-foreground">{notificationType}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{recipientName}</p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5 capitalize text-muted-foreground">
                            {getIcon(channel)} {formatChannelLabel(channel)}
                          </div>
                        </td>
                        <td
                          className="max-w-[320px] px-6 py-4 text-muted-foreground"
                          title={content || undefined}
                        >
                          <p className="truncate">{content || "-"}</p>
                        </td>
                        <td className="px-6 py-4">
                          <Badge
                            variant={status === "delivered" ? "success" : "warning"}
                            className="capitalize"
                          >
                            {status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                          {log.scheduledAt ? formatDateTime(log.scheduledAt) : "-"}
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">
                          {log.createdAt ? formatDateTime(log.createdAt) : "-"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <TablePaginationFooter
            {...(!serverPaginated
              ? bindTablePaginationFooter(clientPagination)
              : {
                totalItems,
                pageSize,
                onPageSizeChange: handlePageSizeChange,
                currentPage,
                totalPages,
                onPrevious: goToPreviousPage,
                onNext: goToNextPage,
              })}
            disablePrevious={currentPage <= 1 || logsFetching}
            disableNext={currentPage >= totalPages || logsFetching}
            className="border-border"
          />
        </Card>
      </div>
    </Layout>
  );
}
