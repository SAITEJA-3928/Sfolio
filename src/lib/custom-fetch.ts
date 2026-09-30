import { buildAuthApiUrl, buildSettlementApiUrl } from "@/lib/api-config";

export type CustomFetchOptions = RequestInit & {
  responseType?: "json" | "text" | "blob" | "auto";
  skipAuthRefresh?: boolean;
};

export type ErrorType<T = unknown> = ApiError<T>;

export type BodyType<T> = T;

export type AuthTokenGetter = () => Promise<string | null> | string | null;
export type UnauthorizedHandler = (
  response: Response,
  requestInfo: { method: string; url: string },
) => Promise<boolean> | boolean;

const NO_BODY_STATUS = new Set([204, 205, 304]);
const DEFAULT_JSON_ACCEPT = "application/json, application/problem+json";

let baseUrl: string | null = null;
let authTokenGetter: AuthTokenGetter | null = null;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setBaseUrl(url: string | null): void {
  baseUrl = url ? url.replace(/\/+$/, "") : null;
}

export function setAuthTokenGetter(getter: AuthTokenGetter | null): void {
  authTokenGetter = getter;
}

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

function isRequest(input: RequestInfo | URL): input is Request {
  return typeof Request !== "undefined" && input instanceof Request;
}

function resolveMethod(input: RequestInfo | URL, explicitMethod?: string): string {
  if (explicitMethod) return explicitMethod.toUpperCase();
  if (isRequest(input)) return input.method.toUpperCase();
  return "GET";
}

function isUrl(input: RequestInfo | URL): input is URL {
  return typeof URL !== "undefined" && input instanceof URL;
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (isUrl(input)) return input.toString();
  return input.url;
}

function applyBaseUrl(input: RequestInfo | URL): RequestInfo | URL {
  if (!baseUrl) return input;
  const url = resolveUrl(input);
  if (!url.startsWith("/")) return input;

  let normalizedUrl = url;
  try {
    const basePath = new URL(baseUrl).pathname.replace(/\/+$/, "");
    if (/\/api(?:\/v\d+)?$/i.test(basePath) && url.startsWith("/api/")) {
      normalizedUrl = url.slice(4);
    }
  } catch {
    // Ignore invalid base URLs and fall back to direct concatenation.
  }

  const absolute = `${baseUrl}${normalizedUrl}`;
  if (typeof input === "string") return absolute;
  if (isUrl(input)) return new URL(absolute);
  return new Request(absolute, input as Request);
}

function mergeHeaders(...sources: Array<HeadersInit | undefined>): Headers {
  const headers = new Headers();

  for (const source of sources) {
    if (!source) continue;
    new Headers(source).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return headers;
}

function getMediaType(headers: Headers): string | null {
  const value = headers.get("content-type");
  return value ? value.split(";", 1)[0].trim().toLowerCase() : null;
}

function isJsonMediaType(mediaType: string | null): boolean {
  return mediaType === "application/json" || Boolean(mediaType?.endsWith("+json"));
}

function isTextMediaType(mediaType: string | null): boolean {
  return Boolean(
    mediaType &&
      (mediaType.startsWith("text/") ||
        mediaType === "application/xml" ||
        mediaType === "text/xml" ||
        mediaType.endsWith("+xml") ||
        mediaType === "application/x-www-form-urlencoded"),
  );
}

function hasNoBody(response: Response, method: string): boolean {
  if (method === "HEAD") return true;
  if (NO_BODY_STATUS.has(response.status)) return true;
  if (response.headers.get("content-length") === "0") return true;
  if (response.body === null) return true;
  return false;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function getStringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;

  const candidate = (value as Record<string, unknown>)[key];
  if (typeof candidate !== "string") return undefined;

  const trimmed = candidate.trim();
  return trimmed === "" ? undefined : trimmed;
}

function truncate(text: string, maxLength = 300): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function buildErrorMessage(response: Response, data: unknown): string {
  if (typeof data === "string") {
    const text = data.trim();
    return text ? truncate(text) : response.statusText;
  }

  const title = getStringField(data, "title");
  const detail = getStringField(data, "detail");
  const message =
    getStringField(data, "message") ??
    getStringField(data, "error_description") ??
    getStringField(data, "error");

  if (title && detail) return `${title} - ${detail}`;
  if (detail) return detail;
  if (message) return message;
  if (title) return title;

  return response.statusText;
}

function shouldDispatchUnauthorized(response: Response, requestUrl: string): boolean {
  if (response.status !== 401) return false;

  const url = response.url || requestUrl;
  return !/\/auth\/(?:adminlogin|authenticate)(?:[/?#]|$)/i.test(url);
}

export class ApiError<T = unknown> extends Error {
  readonly name = "ApiError";
  readonly status: number;
  readonly statusText: string;
  readonly data: T | null;
  readonly headers: Headers;
  readonly response: Response;
  readonly method: string;
  readonly url: string;

  constructor(
    response: Response,
    data: T | null,
    requestInfo: { method: string; url: string },
  ) {
    super(buildErrorMessage(response, data));
    Object.setPrototypeOf(this, new.target.prototype);

    this.status = response.status;
    this.statusText = response.statusText;
    this.data = data;
    this.headers = response.headers;
    this.response = response;
    this.method = requestInfo.method;
    this.url = response.url || requestInfo.url;
  }
}

export class ResponseParseError extends Error {
  readonly name = "ResponseParseError";
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  readonly response: Response;
  readonly method: string;
  readonly url: string;
  readonly rawBody: string;
  readonly cause: unknown;

  constructor(
    response: Response,
    rawBody: string,
    cause: unknown,
    requestInfo: { method: string; url: string },
  ) {
    super(
      `Failed to parse response from ${requestInfo.method} ${response.url || requestInfo.url} ` +
        `(${response.status} ${response.statusText}) as JSON`,
    );
    Object.setPrototypeOf(this, new.target.prototype);

    this.status = response.status;
    this.statusText = response.statusText;
    this.headers = response.headers;
    this.response = response;
    this.method = requestInfo.method;
    this.url = response.url || requestInfo.url;
    this.rawBody = rawBody;
    this.cause = cause;
  }
}

async function parseJsonBody(
  response: Response,
  requestInfo: { method: string; url: string },
): Promise<unknown> {
  const raw = await response.text();
  const normalized = stripBom(raw);

  if (normalized.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(normalized);
  } catch (cause) {
    throw new ResponseParseError(response, raw, cause, requestInfo);
  }
}

async function parseErrorBody(response: Response, method: string): Promise<unknown> {
  if (hasNoBody(response, method)) {
    return null;
  }

  const mediaType = getMediaType(response.headers);

  if (mediaType && !isJsonMediaType(mediaType) && !isTextMediaType(mediaType)) {
    return typeof response.blob === "function" ? response.blob() : response.text();
  }

  const raw = await response.text();
  const normalized = stripBom(raw);
  const trimmed = normalized.trim();

  if (trimmed === "") {
    return null;
  }

  if (isJsonMediaType(mediaType) || looksLikeJson(normalized)) {
    try {
      return JSON.parse(normalized);
    } catch {
      return raw;
    }
  }

  return raw;
}

function inferResponseType(response: Response): "json" | "text" | "blob" {
  const mediaType = getMediaType(response.headers);

  if (isJsonMediaType(mediaType)) return "json";
  if (isTextMediaType(mediaType) || mediaType == null) return "text";
  return "blob";
}

async function parseSuccessBody(
  response: Response,
  responseType: "json" | "text" | "blob" | "auto",
  requestInfo: { method: string; url: string },
): Promise<unknown> {
  if (hasNoBody(response, requestInfo.method)) {
    return null;
  }

  const effectiveType = responseType === "auto" ? inferResponseType(response) : responseType;

  switch (effectiveType) {
    case "json":
      return parseJsonBody(response, requestInfo);

    case "text": {
      const text = await response.text();
      return text === "" ? null : text;
    }

    case "blob":
      if (typeof response.blob !== "function") {
        throw new TypeError(
          'Blob responses are not supported in this runtime. Use responseType "json" or "text" instead.',
        );
      }
      return response.blob();
  }
}

export async function customFetch<T = unknown>(
  input: RequestInfo | URL,
  options: CustomFetchOptions = {},
): Promise<T> {
  input = applyBaseUrl(input);
  const {
    responseType = "auto",
    headers: headersInit,
    skipAuthRefresh = false,
    ...init
  } = options;

  const method = resolveMethod(input, init.method);

  if (init.body != null && (method === "GET" || method === "HEAD")) {
    throw new TypeError(`customFetch: ${method} requests cannot have a body.`);
  }

  const headers = mergeHeaders(isRequest(input) ? input.headers : undefined, headersInit);
  if (!headers.has("web")) {
  headers.set("web", "true"); 
}
  if (
    typeof init.body === "string" &&
    !headers.has("content-type") &&
    looksLikeJson(init.body)
  ) {
    headers.set("content-type", "application/json");
  }

  if (responseType === "json" && !headers.has("accept")) {
    headers.set("accept", DEFAULT_JSON_ACCEPT);
  }

  if (authTokenGetter && !headers.has("authorization")) {
    const token = await authTokenGetter();
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }
  }

  const requestInfo = { method, url: resolveUrl(input) };

  const response = await fetch(input, {
    ...init,
    method,
    headers,
    credentials: init.credentials ?? "include",
  });

  if (!response.ok) {
    let authRefreshAttempted = false;

    if (
      !skipAuthRefresh &&
      unauthorizedHandler &&
      shouldDispatchUnauthorized(response, requestInfo.url)
    ) {
      authRefreshAttempted = true;
      const refreshed = await unauthorizedHandler(response.clone(), requestInfo);
      if (refreshed) {
        return customFetch<T>(input, {
          ...options,
          skipAuthRefresh: true,
        });
      }
    }

    const errorData = await parseErrorBody(response, method);

    if (!authRefreshAttempted && shouldDispatchUnauthorized(response, requestInfo.url)) {
      window.dispatchEvent(new Event("gfolio:unauthorized"));
    }

    throw new ApiError(response, errorData, requestInfo);
  }

  return (await parseSuccessBody(response, responseType, requestInfo)) as T;
}

export type SettlementDayResponse = {
  status?: number;
  message?: string;
  data?: {
    message?: string;
    selectedDate?: string;
    totalTransactions?: number;
    transactions?: unknown[];
    totalAmount?: number;
    settlementAmount?: number;
    utrId?: string | null;
  };
};

export type PaymentSettlementResponse = {
  status?: boolean;
  message?: string;
  data?: {
    amount?: number | string;
    totalAmount?: number | string;
    items?: Array<{
      amount?: number | string;
      totalAmount?: number | string;
    }>;
  };
};

export type AllSettlementsApiResponse = {
  status?: number;
  message?: string;
  data?: {
    message?: string;
    totalSettlements?: number;
    settlements?: unknown[];
  };
};

function readNumericAmount(value: unknown): number {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

export function getAmountFromResponse(data: unknown): number {
  if (!data || typeof data !== "object") return 0;
  const record = data as Record<string, unknown>;
  const directAmount = readNumericAmount(record.totalAmount ?? record.amount);
  if (directAmount > 0) return directAmount;

  const items = record.items;
  if (Array.isArray(items) && items.length > 0) {
    return items.reduce((sum, item) => {
      if (!item || typeof item !== "object") return sum;
      const itemRecord = item as Record<string, unknown>;
      return sum + readNumericAmount(itemRecord.amount ?? itemRecord.totalAmount);
    }, 0);
  }

  return directAmount;
}

export async function fetchSettlementByDate(settlementForDate: string) {
  return customFetch<SettlementDayResponse>(buildAuthApiUrl("/admin/getAllTransactionsOnDate"), {
    method: "POST",
    body: JSON.stringify({ settlementForDate }),
    responseType: "json",
  });
}

export async function fetchPaymentSettlementAmount(startDate: string, endDate: string) {
  // Function to subtract one day
  const getPreviousDate = (dateString: string) => {
    const date = new Date(dateString);
    date.setDate(date.getDate() + 1);

    // format back to YYYY-MM-DD
    return date.toISOString().split("T")[0];
  };

  const response = await customFetch<PaymentSettlementResponse>(
    buildSettlementApiUrl("payment/settlement"),
    {
      method: "POST",
      body: JSON.stringify({
        startDate: getPreviousDate(startDate),
        endDate: getPreviousDate(endDate),
      }),
      responseType: "json",
    },
  );

  return getAmountFromResponse(response.data);
}

export async function fetchAllSettlements() {
  return customFetch<AllSettlementsApiResponse>(buildAuthApiUrl("/admin/getAllSettlements"), {
    method: "GET",
    responseType: "json",
  });
}

export async function submitSettlement(payload: {
  utrId: string;
  totalAmount: number;
  settledDate: string;
  transactionIds: string[];
}) {
  return customFetch(buildAuthApiUrl("admin/createSettlement"), {
    method: "POST",
    body: JSON.stringify(payload),
    responseType: "json",
  });
}
