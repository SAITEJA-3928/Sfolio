import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  normalizeAdminUserHoldingsResponse,
  type FolioSectionKey,
  type UserSipRecord,
} from "@/lib/user-holdings";
import {
  buildAdminUsersApiUrl,
  buildAssetApiUrl,
  buildAuthApiUrl,
  buildGiftApiUrl,
  buildReportsApiUrl,
  buildSettlementApiUrl,
  buildTransactionsApiUrl,
} from "@/lib/api-config";
import { customFetch, type CustomFetchOptions } from "@/lib/custom-fetch";
export type { UserSipRecord } from "@/lib/user-holdings";

type QueryParams = Record<string, string | number | boolean | null | undefined>;
type ApiRequestOptions = Omit<CustomFetchOptions, "method" | "body" | "headers">;

function sendJsonApiRequest<T>(
  method: "POST" | "PATCH" | "PUT",
  url: string,
  body?: unknown,
  options?: ApiRequestOptions,
): Promise<T> {
  return customFetch<T>(url, {
    ...options,
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function apiPost<T>(url: string, body?: unknown, options?: ApiRequestOptions) {
  return sendJsonApiRequest<T>("POST", url, body, options);
}

function apiPatch<T>(url: string, body: unknown, options?: ApiRequestOptions) {
  return sendJsonApiRequest<T>("PATCH", url, body, options);
}

function apiPostWithoutBody<T>(url: string) {
  return customFetch<T>(url, { method: "POST" });
}

function withQuery(url: string, params?: QueryParams) {
  if (!params) return url;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `${url}?${query}` : url;
}

function unwrapData<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return ("data" in record ? record.data : value) as T;
}

function useApiQuery<T>(
  queryKey: readonly unknown[],
  url: string,
  options?: { refetchOnMount?: boolean },
) {
  return useQuery({
    queryKey: [...queryKey],
    queryFn: async () => {
      const result = await customFetch<T>(url, { method: "GET" });
      return unwrapData(result);
    },
    ...(options?.refetchOnMount === undefined ? {} : { refetchOnMount: options.refetchOnMount }),
  });
}

const ADMIN_USERS_ENDPOINT = buildAdminUsersApiUrl("/admin/getAdminUsers");
const WALLET_HOLDINGS_ENDPOINT = buildAdminUsersApiUrl("wallet/admin/userHoldings");
const ADMIN_TRANSACTIONS_ENDPOINT = buildTransactionsApiUrl(
  "/transaction/getTransactionsForAdmin",
);
const CREATE_INVOICE_ENDPOINT = buildSettlementApiUrl("payment/createInvoice");
const VERIFY_KYC_ENDPOINT = buildAdminUsersApiUrl("/admin/verifykyc");
const USER_STATUS_UPDATE_ENDPOINT = buildAdminUsersApiUrl("/admin/userStatusUpdate");

export const adminUsersQueryKey = [ADMIN_USERS_ENDPOINT] as const;
export const walletInfoQueryKey = [WALLET_HOLDINGS_ENDPOINT] as const;
export const adminTransactionsQueryKey = [ADMIN_TRANSACTIONS_ENDPOINT] as const;
export const userTransactionsQueryKey = (userId: string) =>
  [ADMIN_TRANSACTIONS_ENDPOINT, userId] as const;
const ADMIN_REPORTS_ENDPOINT = buildAuthApiUrl("/admin/getAdminReports");
const HOLDINGS_ENDPOINT = buildAuthApiUrl("admin/userHoldings");
const DASHBOARD_METRICS_ENDPOINT = buildAuthApiUrl("admin/dashboard/metrics");
const TRANSACTION_TRENDS_ENDPOINT = buildAssetApiUrl("/transaction/admin/trends");
const DISTRIBUTION_REPORT_ENDPOINT = buildReportsApiUrl("/reports/distribution");
const CAMPAIGNS_ENDPOINT = buildAuthApiUrl("/corporate/campaigns");
const GIFTS_ENDPOINT = buildGiftApiUrl("gifts/getAdminGifts");
const RESEND_GIFT_ENDPOINT = buildAssetApiUrl("/gift/resend");
const CANCEL_GIFT_ENDPOINT = buildAssetApiUrl("/gift/cancel");
const RETRY_TRANSACTION_ENDPOINT = buildAssetApiUrl("/transaction/retry");
const REFUND_TRANSACTION_ENDPOINT = buildAssetApiUrl("/transaction/refund");
const UPDATE_SELL_TRANSACTION_STATUS_ENDPOINT = buildAssetApiUrl(
  "/transaction/updateSellTransactionStatus",
);
const FAIL_SELL_TRANSACTION_ENDPOINT = buildAdminUsersApiUrl("/admin/updateSellTransaction");
const UPLOAD_BULK_PAYMENT_EXCEL_ENDPOINT = buildAssetApiUrl(
  "/transaction/updateSellTransactionsFromExcel",
);
const BUY_METAL_ENDPOINT = buildAssetApiUrl("/transaction/buyMetal");
const SEND_BUY_OTP_ENDPOINT = buildAuthApiUrl("/admin/buyMetal/sendOtp");
const VERIFY_BUY_OTP_ENDPOINT = buildAuthApiUrl("/admin/buyMetal/verifyOtp");
const SEND_SELL_OTP_ENDPOINT = buildAuthApiUrl("/admin/sellMetal/sendOtp");
const VERIFY_SELL_OTP_ENDPOINT = buildAuthApiUrl("/admin/sellMetal/verifyOtp");
const SEND_REFUND_OTP_ENDPOINT = buildAuthApiUrl("/admin/refundTransaction/sendOtp");
const VERIFY_REFUND_OTP_ENDPOINT = buildAuthApiUrl("/admin/refundTransaction/verifyOtp");
const SELL_METAL_ENDPOINT = buildAssetApiUrl("/transaction/sellMetal");
const VOUCHER_REWARDS_ENDPOINT = buildAssetApiUrl("/transaction/getVoucherRewards");
const CREATE_VOUCHER_BATCH_ENDPOINT = buildAssetApiUrl("/transaction/createVoucherBatch");
const PROVIDER_MISSING_TRANSACTIONS_ENDPOINT = buildTransactionsApiUrl(
  "/transaction/getCashfreeMissingTransactions",
);
const WALLET_BALANCE_ENDPOINT = buildAuthApiUrl("/corporate/wallet/balance");
const WALLET_TRANSACTIONS_ENDPOINT = buildAuthApiUrl("/corporate/wallet/transactions");

export function useGetDashboardMetrics(
  timePeriod: string,
  fromDate?: string,
  toDate?: string,
) {
  return useQuery({
    queryKey: [DASHBOARD_METRICS_ENDPOINT, timePeriod, fromDate, toDate] as const,
    enabled: Boolean(timePeriod && fromDate && toDate),
    queryFn: async ({ queryKey }) => {
      const period = String(queryKey[1]);
      const from = String(queryKey[2]);
      const to = String(queryKey[3]);
      const result = await apiPost(DASHBOARD_METRICS_ENDPOINT, {
        fromDate: from,
        toDate: to,
        timePeriod: Number(period),
      });
      return unwrapData(result);
    },
  });
}

export function useGetTransactionTrends() {
  return useApiQuery<unknown[]>([TRANSACTION_TRENDS_ENDPOINT], TRANSACTION_TRENDS_ENDPOINT);
}

export function useGetDistributionReport() {
  return useApiQuery<Record<string, unknown>>(
    [DISTRIBUTION_REPORT_ENDPOINT],
    DISTRIBUTION_REPORT_ENDPOINT,
  );
}

export function useListCampaigns(params?: QueryParams) {
  const url = withQuery(CAMPAIGNS_ENDPOINT, params);
  return useApiQuery<Record<string, unknown>>([CAMPAIGNS_ENDPOINT, params ?? null], url);
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ data }: { data: Record<string, unknown> }) =>
      apiPost(CAMPAIGNS_ENDPOINT, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CAMPAIGNS_ENDPOINT] });
    },
  });
}

export function useListGifts(params?: QueryParams) {
  const url = withQuery(GIFTS_ENDPOINT, params);
  return useApiQuery<Record<string, unknown>>([GIFTS_ENDPOINT, params ?? null], url);
}

export function useResendGift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ giftId }: { giftId: string }) =>
      apiPostWithoutBody(withQuery(RESEND_GIFT_ENDPOINT, { giftId })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [GIFTS_ENDPOINT] });
    },
  });
}

export function useCancelGift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ giftId }: { giftId: string }) =>
      apiPostWithoutBody(withQuery(CANCEL_GIFT_ENDPOINT, { giftId })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [GIFTS_ENDPOINT] });
    },
  });
}

export function useListUsers(params?: QueryParams) {
  const url = withQuery(ADMIN_USERS_ENDPOINT, params);
  return useApiQuery<Record<string, unknown>>([ADMIN_USERS_ENDPOINT, params ?? null], url);
}

export function fetchAdminUser(userId: string, searchHint?: string) {
  const url = withQuery(ADMIN_USERS_ENDPOINT, {
    page: 1,
    limit: 1,
    userId,
    search: searchHint?.trim() || undefined,
  });

  return customFetch<Record<string, unknown>>(url, { method: "GET" });
}

function readStoredAdminUser(userId: string) {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem("gfolio-admin:selected-user");
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const selectedId = parsed.id ?? parsed._id;
    if (String(selectedId) !== userId) return null;

    return parsed;
  } catch {
    return null;
  }
}

export function useAdminUser(userId?: string) {
  return useQuery({
    queryKey: [...adminUsersQueryKey, "detail", userId ?? null],
    enabled: Boolean(userId),
    queryFn: () => {
      const stored = userId ? readStoredAdminUser(userId) : null;
      const searchHint =
        typeof stored?.phone === "string" && stored.phone.trim()
          ? stored.phone.trim()
          : typeof stored?.email === "string" && stored.email.trim()
            ? stored.email.trim()
            : undefined;

      return fetchAdminUser(userId as string, searchHint);
    },
    staleTime: 30_000,
  });
}

export type AdminTransactionsFilter = {
  type?: string;
  targetUserId?: string;
  status?: string;
};

export function fetchAdminTransactions(filter?: AdminTransactionsFilter) {
  const body: Record<string, unknown> = {};
  if (filter?.type) body.type = filter.type;
  if (filter?.targetUserId) body.targetUserId = filter.targetUserId;
  if (filter?.status) body.status = filter.status;

  return apiPost<{ transactions?: unknown[]; data?: unknown[] }>(
    ADMIN_TRANSACTIONS_ENDPOINT,
    Object.keys(body).length > 0 ? body : undefined,
  );
}

export function fetchUserTransactions(targetUserId: string, status?: string) {
  const body: Record<string, unknown> = { targetUserId };
  if (status) body.status = status;

  return apiPost<{ transactions?: unknown[]; data?: unknown[] }>(
    ADMIN_TRANSACTIONS_ENDPOINT,
    body,
  );
}

export function useListAdminTransactions(filter?: AdminTransactionsFilter) {
  return useQuery({
    queryKey: [
      ADMIN_TRANSACTIONS_ENDPOINT,
      filter?.type ?? null,
      filter?.targetUserId ?? null,
      filter?.status ?? null,
    ],
    queryFn: () => fetchAdminTransactions(filter),
  });
}

export function useUserTransactions(
  userId: string | undefined,
  filter?: Pick<AdminTransactionsFilter, "status">,
) {
  return useQuery({
    queryKey: [ADMIN_TRANSACTIONS_ENDPOINT, userId ?? null, filter?.status ?? null],
    queryFn: () => fetchUserTransactions(userId!, filter?.status),
    enabled: Boolean(userId),
  });
}

export function useVerifyKyc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      targetUserId,
      kycStatus,
      comments = "",
    }: {
      targetUserId: string;
      kycStatus: "approved" | "rejected" | "suspended";
      comments?: string;
    }) => apiPatch(VERIFY_KYC_ENDPOINT, { targetUserId, kycStatus, comments }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminUsersQueryKey });
    },
  });
}

export function useCreateHolding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ data }: { data: Record<string, unknown> }) =>
      apiPost(HOLDINGS_ENDPOINT, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: walletInfoQueryKey });
    },
  });
}


export type UpdateUserStatusPayload = {
  targetUserId: string;
  isActive: boolean;
};

export function useUpdateUserStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ targetUserId, isActive }: UpdateUserStatusPayload) =>
      apiPost<{ message?: string; user?: { isActive?: boolean } }>(
        USER_STATUS_UPDATE_ENDPOINT,
        { targetUserId, isActive },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminUsersQueryKey });
    },
  });
}

export function useGetAdminReports(params?: QueryParams) {
  const url = withQuery(ADMIN_REPORTS_ENDPOINT, params);
  return useApiQuery<Record<string, unknown>>([ADMIN_REPORTS_ENDPOINT, params ?? null], url);
}

export function useListHoldings(params?: QueryParams) {
  const url = withQuery(HOLDINGS_ENDPOINT, params);
  return useApiQuery<Record<string, unknown>>([HOLDINGS_ENDPOINT, params ?? null], url);
}

export function useRetryTransaction() {
  return useMutation({
    mutationFn: async ({ txnId }: { txnId: string }) =>
      apiPostWithoutBody(withQuery(RETRY_TRANSACTION_ENDPOINT, { txnId })),
  });
}

export function useRefundTransaction() {
  return useMutation({
    mutationFn: async ({ txnId }: { txnId: string }) =>
      apiPostWithoutBody(withQuery(REFUND_TRANSACTION_ENDPOINT, { txnId })),
  });
}

const ADMIN_REFUND_TRANSACTION_ENDPOINT = buildAssetApiUrl(
  "/transaction/adminRefundTransaction",
);

export function useAdminRefundTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ transactionId }: { transactionId: string }) =>
      apiPost<{ message?: string; success?: boolean }>(
        ADMIN_REFUND_TRANSACTION_ENDPOINT,
        { transactionId },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [PROVIDER_MISSING_TRANSACTIONS_ENDPOINT],
      });
      void queryClient.invalidateQueries({ queryKey: adminTransactionsQueryKey });
    },
  });
}

export type UpdateSellTransactionStatusPayload = {
  transactionId: string;
  status: "SUCCESS" | "PENDING" | "PROCESSING" | "FAILED";
  failureReason?: string;
  utrNumber?: string;
  settlementDate?: string;
};

export type CreateInvoicePayload = {
  transactionId: string;
  externalPaymentId?: string;
  merchantTransactionId?: string;
};

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateInvoicePayload) =>
      apiPost<{ message?: string; success?: boolean }>(CREATE_INVOICE_ENDPOINT, payload, {
        responseType: "json",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminTransactionsQueryKey });
    },
  });
}

export function useCompleteSellTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      transactionId,
      status = "SUCCESS",
      failureReason,
      utrNumber,
      settlementDate,
    }: UpdateSellTransactionStatusPayload) =>
      apiPost<{ message?: string; success?: boolean }>(
        UPDATE_SELL_TRANSACTION_STATUS_ENDPOINT,
        { transactionId, status, failureReason, utrNumber, settlementDate },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [ADMIN_TRANSACTIONS_ENDPOINT] });
    },
  });
}

export type FailSellTransactionPayload = {
  transactionId: string;
  status: "FAILED" | "PENDING";
};

export function useFailSellTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ transactionId, status }: FailSellTransactionPayload) =>
      apiPost<{ message?: string; success?: boolean }>(FAIL_SELL_TRANSACTION_ENDPOINT, {
        transactionId,
        status,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [ADMIN_TRANSACTIONS_ENDPOINT] });
    },
  });
}

export function useUploadBulkPaymentExcel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file }: { file: File }) => {
      const formData = new FormData();
      formData.append("file", file, file.name);

      return customFetch<{ message?: string; success?: boolean }>(
        UPLOAD_BULK_PAYMENT_EXCEL_ENDPOINT,
        {
          method: "POST",
          body: formData,
        },
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [ADMIN_TRANSACTIONS_ENDPOINT] });
    },
  });
}

export type ProviderMissingTransactionsResponse = {
  success?: boolean;
  message?: string;
  totalMissingTransactions?: number;
  data?: unknown[];
};

export function useProviderMissingTransactions(
  fromDate?: string,
  toDate?: string,
  enabled = true,
) {
  return useQuery({
    queryKey: [PROVIDER_MISSING_TRANSACTIONS_ENDPOINT, fromDate, toDate] as const,
    queryFn: async () =>
      customFetch<ProviderMissingTransactionsResponse>(
        withQuery(PROVIDER_MISSING_TRANSACTIONS_ENDPOINT, { fromDate, toDate }),
        { method: "GET" },
      ),
    enabled,
  });
}

export function useGetWalletBalance() {
  return useApiQuery<Record<string, unknown>>([WALLET_BALANCE_ENDPOINT], WALLET_BALANCE_ENDPOINT);
}

export function useGetWalletTransactions() {
  return useApiQuery<unknown[]>([WALLET_TRANSACTIONS_ENDPOINT], WALLET_TRANSACTIONS_ENDPOINT);
}

export function useBuyMetal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ payload }: { payload: Record<string, unknown> }) =>
      apiPost<{ message?: string }>(BUY_METAL_ENDPOINT, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminUsersQueryKey });
      void queryClient.invalidateQueries({ queryKey: walletInfoQueryKey });
      void queryClient.invalidateQueries({ queryKey: [PROVIDER_MISSING_TRANSACTIONS_ENDPOINT] });
      void queryClient.invalidateQueries({ queryKey: [ADMIN_TRANSACTIONS_ENDPOINT] });
    },
  });
}

export function useSendBuyOtp() {
  return useMutation({
    mutationFn: async () => apiPost<{ message?: string }>(SEND_BUY_OTP_ENDPOINT),
  });
}

export function useVerifyBuyOtp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      otp,
      payload,
    }: {
      otp: string;
      payload: Record<string, unknown>;
    }) =>
      apiPost<{ message?: string }>(VERIFY_BUY_OTP_ENDPOINT, {
        otp,
        ...payload,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminUsersQueryKey });
      void queryClient.invalidateQueries({ queryKey: walletInfoQueryKey });
      void queryClient.invalidateQueries({ queryKey: [PROVIDER_MISSING_TRANSACTIONS_ENDPOINT] });
      void queryClient.invalidateQueries({ queryKey: [ADMIN_TRANSACTIONS_ENDPOINT] });
    },
  });
}

export function useSendSellOtp() {
  return useMutation({
    mutationFn: async () => apiPost<{ message?: string }>(SEND_SELL_OTP_ENDPOINT),
  });
}

export function useVerifySellOtp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      otp,
      targetUserId,
      grams,
      metalType,
    }: {
      otp: string;
      targetUserId: string;
      grams: number;
      metalType: string;
    }) =>
      apiPost<{ message?: string }>(VERIFY_SELL_OTP_ENDPOINT, {
        otp,
        targetUserId,
        grams,
        metalType,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminUsersQueryKey });
      void queryClient.invalidateQueries({ queryKey: walletInfoQueryKey });
      void queryClient.invalidateQueries({ queryKey: [ADMIN_TRANSACTIONS_ENDPOINT] });
    },
  });
}

export function useSendRefundOtp() {
  return useMutation({
    mutationFn: async () => apiPost<{ message?: string }>(SEND_REFUND_OTP_ENDPOINT),
  });
}

export function useVerifyRefundOtp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      otp,
      transactionId,
    }: {
      otp: string;
      transactionId: string;
    }) =>
      apiPost<{ message?: string; success?: boolean }>(VERIFY_REFUND_OTP_ENDPOINT, {
        otp,
        transactionId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [PROVIDER_MISSING_TRANSACTIONS_ENDPOINT],
      });
      void queryClient.invalidateQueries({ queryKey: adminTransactionsQueryKey });
    },
  });
}

export function useSellMetal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      targetUserId,
      grams,
      metalType,
    }: {
      targetUserId: string;
      grams: number;
      metalType: string;
    }) =>
      apiPost<{ message?: string }>(SELL_METAL_ENDPOINT, {
        targetUserId,
        grams,
        metalType,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminUsersQueryKey });
      void queryClient.invalidateQueries({ queryKey: walletInfoQueryKey });
      void queryClient.invalidateQueries({ queryKey: [ADMIN_TRANSACTIONS_ENDPOINT] });
    },
  });
}
export type CreateVoucherSubBatchPayload = {
  metalType: string;
  rewardAmount: number;
  quantity: number;
  startDate: string;
  endDate: string;
};

export type CreateVoucherBatchPayload = {
  batchName: string;
  subBatches: CreateVoucherSubBatchPayload[];
};

function buildCreateVoucherSubBatchPayload(
payload: CreateVoucherSubBatchPayload,
  index: number,
): CreateVoucherSubBatchPayload {
  const rowLabel = `sub-batch ${index + 1}`;
  const metalType = payload.metalType?.trim?.() ?? "";
  const startDate = payload.startDate?.trim?.() ?? "";
  const endDate = payload.endDate?.trim?.() ?? "";
  const rewardAmount = Number(payload.rewardAmount);
  const quantity = Number(payload.quantity);

  if (!metalType) {
    throw new Error(`metalType is required for ${rowLabel}`);
  }
  if (!Number.isFinite(rewardAmount) || rewardAmount <= 0) {
    throw new Error(`rewardAmount must be a positive number for ${rowLabel}`);
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error(`quantity must be a positive integer for ${rowLabel}`);
  }
  if (!startDate) {
    throw new Error(`startDate is required for ${rowLabel}`);
  }
  if (!endDate) {
    throw new Error(`endDate is required for ${rowLabel}`);
  }

  return {
    metalType,
    rewardAmount,
    quantity,
    startDate,
    endDate,
  };
}

function buildCreateVoucherBatchPayload(payload: CreateVoucherBatchPayload): CreateVoucherBatchPayload {
  const batchName = payload.batchName?.trim?.() ?? "";
  if (!batchName) {
    throw new Error("batchName is required");
  }
  if (!Array.isArray(payload.subBatches) || payload.subBatches.length === 0) {
    throw new Error("At least one sub-batch is required");
  }

  return {
    batchName,
    subBatches: payload.subBatches.map((subBatch, index) =>
      buildCreateVoucherSubBatchPayload(subBatch, index),
    ),
  };
}

export function useGetVoucherRewards() {
  return useApiQuery<unknown[]>([VOUCHER_REWARDS_ENDPOINT], VOUCHER_REWARDS_ENDPOINT, {
    refetchOnMount: false,
  });
}

export function useCreateVoucherBatch() {
  return useMutation({
    mutationFn: async (payload: CreateVoucherBatchPayload) =>
      apiPost<{ message?: string }>(
        CREATE_VOUCHER_BATCH_ENDPOINT,
        buildCreateVoucherBatchPayload(payload),
      ),
  });
}

export function useGetWalletInfo(userId?: string) {
  return useQuery({
    queryKey: [WALLET_HOLDINGS_ENDPOINT, userId],
    enabled: Boolean(userId),
    queryFn: async () => fetchAdminUserHoldings(userId as string),
  });
}

export type UserSipsResponse = {
  totalSips: number;
  activeSips: number;
  sips: UserSipRecord[];
};

export type AdminUserHoldingsFilter = {
  folioType?: FolioSectionKey;
};

export function useListAdminUserHoldings(filter?: AdminUserHoldingsFilter) {
  return useQuery({
    queryKey: [...walletInfoQueryKey, filter?.folioType ?? null] as const,
    queryFn: () => fetchAllAdminUserHoldings(filter),
    staleTime: 60_000,
  });
}

export async function fetchAllAdminUserHoldings(filter?: AdminUserHoldingsFilter) {
  const body = filter?.folioType ? { folioType: filter.folioType } : undefined;
  const result = await apiPost<unknown>(WALLET_HOLDINGS_ENDPOINT, body);
  return unwrapData(result);
}

export async function fetchAdminUserHoldings(userId: string) {
  const result = await apiPost<unknown>(WALLET_HOLDINGS_ENDPOINT, {
    targetUserId: userId,
  });
  return normalizeAdminUserHoldingsResponse(result);
}
