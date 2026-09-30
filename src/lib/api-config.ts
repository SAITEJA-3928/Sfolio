type ServiceConfig = {
  baseUrl: string;
  prefix: string;
};

function trimTrailingSlash(value?: string) {
  if (!value) return "";
  return value.replace(/\/+$/, "");
}

function ensureLeadingSlash(value: string) {
  return value.startsWith("/") ? value : `/${value}`;
}

function normalizePrefix(value: string) {
  const normalized = ensureLeadingSlash(value)
    .replace(/\/+/g, "/")
    .replace(/\/+$/, "");
  return normalized === "/" ? "" : normalized;
}

function isLocal() {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "localhost";
}

const API_PREFIX = normalizePrefix(
  import.meta.env.VITE_API_PATH_PREFIX ||
    import.meta.env.VITE_AUTH_API_PATH_PREFIX ||
    "/api/v1"
);

const DEV_BASE = import.meta.env.VITE_AUTH_API || "";


function createServiceConfig(
  localBaseUrl: string | undefined,
  fallbackLocalBaseUrl: string,
  servicePath: string
): ServiceConfig {
  const baseUrl = isLocal()
    ? trimTrailingSlash(localBaseUrl) || fallbackLocalBaseUrl
    : `${trimTrailingSlash(DEV_BASE) || window.location.origin}${ensureLeadingSlash(servicePath)}`;

  return {
    baseUrl,
    prefix: API_PREFIX,
  };
}

export const authApiConfig = createServiceConfig(
  import.meta.env.VITE_AUTH_API_BASE_URL,
  "http://localhost:5001",
  "/user"
);

export const notificationApiConfig = createServiceConfig(
  import.meta.env.VITE_NOTIFICATION_API_BASE_URL,
  "http://localhost:5005",
  "/notification"
);

export const assetApiConfig = createServiceConfig(
  import.meta.env.VITE_ASSET_API_BASE_URL,
  "http://localhost:5004",
  "/asset"
);

export const giftApiConfig = createServiceConfig(
  import.meta.env.VITE_GIFT_API_BASE_URL,
  "http://localhost:5002",
  "/gift"
);
export const paymentApiConfig = createServiceConfig(
  import.meta.env.VITE_PAYMENT_API_BASE_URL,
  "http://localhost:5003",
  "/payment"
);

export const defaultApiConfig = authApiConfig;
export const adminUsersApiConfig = authApiConfig;
export const transactionsApiConfig = assetApiConfig;
export const reportsApiConfig = notificationApiConfig;
export const campaignApiConfig = giftApiConfig;
export const settlementApiConfig = paymentApiConfig;

function joinUrl(baseUrl: string, prefix: string, path: string) {
  return `${trimTrailingSlash(baseUrl)}${normalizePrefix(prefix)}${ensureLeadingSlash(path)}`;
}

export function buildAuthApiUrl(path: string) {
  return joinUrl(authApiConfig.baseUrl, authApiConfig.prefix, path);
}

export function buildNotificationApiUrl(path: string) {
  return joinUrl(notificationApiConfig.baseUrl, notificationApiConfig.prefix, path);
}

export function buildAssetApiUrl(path: string) {
  return joinUrl(assetApiConfig.baseUrl, assetApiConfig.prefix, path);
}

export function buildGiftApiUrl(path: string) {
  return joinUrl(giftApiConfig.baseUrl, giftApiConfig.prefix, path);
}

export function buildDefaultApiUrl(path: string) {
  return buildAuthApiUrl(path);
}

export function buildAdminUsersApiUrl(path: string) {
  return buildAuthApiUrl(path);
}

export function buildTransactionsApiUrl(path: string) {
  return buildAssetApiUrl(path);
}

export function buildReportsApiUrl(path: string) {
  return buildNotificationApiUrl(path);
}

export function buildSettlementApiUrl(path: string) {
  return joinUrl(settlementApiConfig.baseUrl, settlementApiConfig.prefix, path);
}