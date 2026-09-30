export const FAILED_TRANSACTION_STATUS_FILTER = "pending-failed";

export function isFailedTransactionStatusFilter(statusFilter: string) {
  return statusFilter === FAILED_TRANSACTION_STATUS_FILTER;
}

export function isPendingOrFailedTransactionStatus(status: string) {
  return status === "pending" || status === "failed";
}

export function mapStatusFilterToApiStatus(statusFilter: string): string | undefined {
  if (statusFilter === "refund") return "refunded";
  return undefined;
}

export const TRANSACTION_STATUS_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "success", label: "Successful" },
  { value: "processing", label: "Processing" },
  { value: "pending", label: "Pending" },
  { value: "refund", label: "Refunded" },
  { value: "failed", label: "Failed" },
] as const;
