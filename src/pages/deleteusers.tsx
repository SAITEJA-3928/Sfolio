import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Card, Button, Input } from "@/components/ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Eye, Search, Trash2 } from "lucide-react";
import { customFetch } from "@/lib/custom-fetch";
import { buildAdminUsersApiUrl } from "@/lib/api-config";
import { toast } from "@/hooks/use-toast";
import { getSortToggleClass, SortDirectionIcon, useTableSort } from "@/lib/table-sort";
import { TablePaginationFooter } from "@/components/table-pagination-footer";
import { bindTablePaginationFooter, useTablePagination } from "@/lib/table-pagination";
import {
  createPersistedSearchTermKey,
  usePersistedSearchTerm,
} from "@/lib/persisted-page-filters";

const DELETE_REQUESTS_ENDPOINT = buildAdminUsersApiUrl("/admin/getDeleteUserRequests");
const PROCESS_DELETE_API = buildAdminUsersApiUrl("/admin/processDeleteUserRequest");

const DELETE_REQUESTS_QUERY_KEY = [DELETE_REQUESTS_ENDPOINT] as const;
const DELETE_USERS_TABLE_COL_SPAN = 4;
const tooltipContentClassName =
  "bg-gray-700 text-white text-xs px-3 py-2 rounded-md shadow-lg animate-in fade-in zoom-in-95 duration-200";

type DeleteRequest = {
  id: string;
  userId: string;
  email: string;
  phone: string;
  reason: string;
};

type DeleteUsersSortKey = "email" | "phone" | "reason";

async function fetchDeleteRequests() {
  return customFetch<{ requests?: unknown[]; total?: number; data?: unknown }>(
    DELETE_REQUESTS_ENDPOINT,
    { method: "GET" },
  );
}

async function processDeleteUser(targetUserId: string) {
  return customFetch(PROCESS_DELETE_API, {
    method: "POST",
    body: JSON.stringify({ targetUserId }),
  });
}

function unwrapData(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const record = data as Record<string, unknown>;
  if ("data" in record && record.data) return record.data;
  if ("requests" in record && record.requests) return record.requests;
  return data;
}

function normalizeRequest(value: unknown): DeleteRequest | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const rawId = record.id ?? record._id ?? record.userId;
  if (typeof rawId !== "string") return null;

  return {
    id: rawId,
    userId: typeof record.userId === "string" ? record.userId : rawId,
    email: typeof record.email === "string" ? record.email : "",
    phone: typeof record.phone === "string" ? record.phone : "",
    reason:
      typeof record.reason === "string"
        ? record.reason
        : typeof record.Reason === "string"
          ? record.Reason
          : "",
  };
}

function extractRequests(data: unknown): DeleteRequest[] {
  const payload = unwrapData(data);
  if (!payload) return [];

  if (Array.isArray(payload)) {
    return payload.map(normalizeRequest).filter((request): request is DeleteRequest => request !== null);
  }

  if (typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.requests)) {
      return record.requests.map(normalizeRequest).filter((request): request is DeleteRequest => request !== null);
    }
    if (Array.isArray(record.data)) {
      return record.data.map(normalizeRequest).filter((request): request is DeleteRequest => request !== null);
    }
    const single = normalizeRequest(payload);
    return single ? [single] : [];
  }

  return [];
}

function truncate(text: string, maxLength = 100): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: "base" });
}

function normalizeSearchValue(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export default function DeleteUsers() {
  const queryClient = useQueryClient();
  const [deleteRequest, setDeleteRequest] = React.useState<DeleteRequest | null>(null);
  const [searchTerm, setSearchTerm] = usePersistedSearchTerm(
    createPersistedSearchTermKey("delete-users"),
  );
  const { sortKey, sortDirection, directionFactor, handleSort } = useTableSort<DeleteUsersSortKey>();

  const { data: requestsData, isLoading, error } = useQuery({
    queryKey: DELETE_REQUESTS_QUERY_KEY,
    queryFn: fetchDeleteRequests,
  });

  const requests = React.useMemo(
    () => extractRequests(requestsData),
    [requestsData],
  );

  const filteredRequests = React.useMemo(() => {
    const term = normalizeSearchValue(searchTerm);
    if (!term) return requests;

    return requests.filter((request) => {
      const email = normalizeSearchValue(request.email);
      const phone = normalizeSearchValue(request.phone);
      const reason = normalizeSearchValue(request.reason);
      return email.includes(term) || phone.includes(term) || reason.includes(term);
    });
  }, [requests, searchTerm]);

  const sortedRequests = React.useMemo(() => {
    if (!sortKey) return filteredRequests;

    return [...filteredRequests].sort((left, right) => {
      if (sortKey === "email") return compareText(left.email, right.email) * directionFactor;
      if (sortKey === "phone") return compareText(left.phone, right.phone) * directionFactor;
      return compareText(left.reason, right.reason) * directionFactor;
    });
  }, [directionFactor, filteredRequests, sortKey]);

  const pagination = useTablePagination(sortedRequests);

  React.useEffect(() => {
    pagination.resetPage();
  }, [pagination.resetPage, searchTerm, sortKey, sortDirection]);

  const deleteMutation = useMutation({
    mutationFn: processDeleteUser,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: DELETE_REQUESTS_QUERY_KEY });
      setDeleteRequest(null);
      toast({
        title: "Account deleted",
        description: "The user account was deleted successfully.",
      });
    },
    onError: (err) => {
      console.error(err);
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Failed to delete user.",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (userId?: string) => {
    if (!userId) return;
    deleteMutation.mutate(userId);
  };

  return (
    <Layout title="Delete User Requests">
      <Card className="flex h-[calc(100vh-7.5rem)] flex-col">
        <div className="flex flex-col gap-4 border-b border-white/5 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by email, phone, or reason..."
              className="pl-10"
            />
          </div>
        </div>

        <div className="min-h-0 w-full flex-1 overflow-auto">
          <TooltipProvider delayDuration={200}>
            <table className="w-full min-w-[760px] text-sm">
              <thead className="table-head-sticky">
                <tr>
                  <th className="px-4 py-4 text-left font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort("email")}
                      className={getSortToggleClass(sortKey === "email")}
                    >
                      Email <SortDirectionIcon active={sortKey === "email"} direction={sortDirection} />
                    </button>
                  </th>
                  <th className="px-4 py-4 text-left font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort("phone")}
                      className={getSortToggleClass(sortKey === "phone")}
                    >
                      Mobile Number <SortDirectionIcon active={sortKey === "phone"} direction={sortDirection} />
                    </button>
                  </th>
                  <th className="px-4 py-4 text-left font-medium">
                    <button
                      type="button"
                      onClick={() => handleSort("reason")}
                      className={getSortToggleClass(sortKey === "reason")}
                    >
                      Reason <SortDirectionIcon active={sortKey === "reason"} direction={sortDirection} />
                    </button>
                  </th>
                  <th className="px-4 py-4 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={DELETE_USERS_TABLE_COL_SPAN} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      Loading requests...
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={DELETE_USERS_TABLE_COL_SPAN} className="px-4 py-10 text-center text-sm text-destructive">
                      Failed to load requests. Please try again.
                    </td>
                  </tr>
                ) : pagination.pagedItems.length === 0 ? (
                  <tr>
                    <td colSpan={DELETE_USERS_TABLE_COL_SPAN} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      {searchTerm.trim()
                        ? "No delete requests match this search."
                        : "No delete requests found."}
                    </td>
                  </tr>
                ) : (
                  pagination.pagedItems.map((request) => (
                    <tr key={request.id} className="border-b border-border transition-all duration-200 hover:bg-white/5">
                      <td className="px-4 py-4 font-medium">
                        <span className="block truncate" title={request.email}>
                          {request.email || "-"}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-muted-foreground">
                        {request.phone || "-"}
                      </td>
                      <td className="px-4 py-4" title={request.reason}>
                        <span className="line-clamp-2">
                          {request.reason ? truncate(request.reason) : "-"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-0.5 flex-nowrap">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0 cursor-pointer"
                                asChild
                              >
                                <Link href={`/users/${request.userId}?from=deletion`}>
                                  <Eye className="h-4 w-4" />
                                  <span className="sr-only">View details</span>
                                </Link>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className={tooltipContentClassName}>
                              View User Details
                            </TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0 cursor-pointer"
                                disabled={deleteMutation.isPending}
                                onClick={() => setDeleteRequest(request)}
                              >
                                <Trash2 className="h-4 w-4 !text-red-500" />
                                <span className="sr-only">Delete account</span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className={tooltipContentClassName}>
                              Delete Account
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

        <TablePaginationFooter {...bindTablePaginationFooter(pagination)} />
      </Card>

      <AlertDialog
        open={Boolean(deleteRequest)}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setDeleteRequest(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete
              {deleteRequest?.email ? ` ${deleteRequest.email}` : " this user"}.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                handleDelete(deleteRequest?.userId);
              }}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
