import { buildGiftApiUrl } from "@/lib/api-config";
import { customFetch } from "@/lib/custom-fetch";

export type CampaignPaymentCheckout = {
  campaignId?: string;
  razorpayKeyId: string;
  razorpayOrderId: string;
  amountInPaise: number;
  currency: string;
};

export function isApiSuccessResponse(res: unknown): boolean {
  if (!res || typeof res !== "object") return false;
  const record = res as Record<string, unknown>;
  if (record.success === true) return true;
  if (record.status === true) return true;
  if (record.status === "true") return true;
  return false;
}

export function getApiResponseMessage(res: unknown, fallback: string): string {
  if (!res || typeof res !== "object") return fallback;
  const message = (res as Record<string, unknown>).message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

export function unwrapCampaignPaymentData(res: unknown): CampaignPaymentCheckout | null {
  if (!res || typeof res !== "object") return null;
  const data = (res as Record<string, unknown>).data;
  if (!data || typeof data !== "object") return null;

  const record = data as Record<string, unknown>;
  const razorpayKeyId = String(record.razorpayKeyId ?? "");
  const razorpayOrderId = String(record.razorpayOrderId ?? "");
  const amountInPaise = Number(record.amountInPaise);

  if (!razorpayKeyId || !razorpayOrderId || !Number.isFinite(amountInPaise) || amountInPaise <= 0) {
    return null;
  }

  return {
    campaignId: record.campaignId != null ? String(record.campaignId) : undefined,
    razorpayKeyId,
    razorpayOrderId,
    amountInPaise,
    currency: typeof record.currency === "string" ? record.currency : "INR",
  };
}

export function unwrapCampaignIdFromResponse(res: unknown): string | undefined {
  const payment = unwrapCampaignPaymentData(res);
  if (payment?.campaignId) return payment.campaignId;

  if (!res || typeof res !== "object") return undefined;
  const data = (res as Record<string, unknown>).data;

  if (Array.isArray(data)) {
    const first = data[0];
    if (first && typeof first === "object") {
      const record = first as Record<string, unknown>;
      if (record.campaignId != null) return String(record.campaignId);
      if (record._id != null) return String(record._id);
    }
    return undefined;
  }

  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (record.campaignId != null) return String(record.campaignId);
    if (record._id != null) return String(record._id);
  }

  return undefined;
}

export function buildCampaignRequestBody(
  payload: Record<string, unknown>,
  excelFile: File | null,
  extra?: Record<string, unknown>,
): BodyInit {
  const merged = { ...payload, ...extra };

  if (!excelFile) {
    return JSON.stringify(merged);
  }

  const formData = new FormData();
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === null) continue;
    if (key === "recipients") {
      formData.append(key, JSON.stringify(value));
      continue;
    }
    if (typeof value === "boolean") {
      formData.append(key, value ? "true" : "false");
      continue;
    }
    formData.append(key, String(value));
  }
  formData.append("excelFile", excelFile, excelFile.name);
  return formData;
}

export async function saveCampaignDraft(
  payload: Record<string, unknown>,
  excelFile: File | null,
) {
  return customFetch(buildGiftApiUrl("/campaign/createCampaign"), {
    method: "POST",
    body: buildCampaignRequestBody(payload, excelFile, { isDraft: true }),
  });
}

export async function createCampaignRecord(
  payload: Record<string, unknown>,
  excelFile: File | null,
) {
  return customFetch(buildGiftApiUrl("/campaign/createCampaign"), {
    method: "POST",
    body: buildCampaignRequestBody(payload, excelFile),
  });
}

export async function requestCampaignPaymentOrder(
  campaignId: string,
  payload: Record<string, unknown>,
  excelFile: File | null,
) {
  const withRecipientsRes = await customFetch(buildGiftApiUrl("/campaign/createCampaign"), {
    method: "POST",
    body: buildCampaignRequestBody(payload, excelFile, { campaignId }),
  });

  if (isApiSuccessResponse(withRecipientsRes) && unwrapCampaignPaymentData(withRecipientsRes)) {
    return withRecipientsRes;
  }

  const initRes = await customFetch(buildGiftApiUrl("/campaign/createCampaign"), {
    method: "POST",
    body: buildCampaignRequestBody(payload, excelFile, { campaignId, initPayment: true }),
  });

  if (isApiSuccessResponse(initRes) && unwrapCampaignPaymentData(initRes)) {
    return initRes;
  }

  return withRecipientsRes;
}

export async function confirmCampaignPayment(
  payload: Record<string, unknown>,
  campaignId: string,
  razorpayResponse: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  },
  excelFile: File | null,
) {
  return customFetch(buildGiftApiUrl("/campaign/createCampaign"), {
    method: "POST",
    body: buildCampaignRequestBody(payload, excelFile, {
      campaignId,
      razorpay_payment_id: razorpayResponse.razorpay_payment_id,
      razorpay_order_id: razorpayResponse.razorpay_order_id,
      razorpay_signature: razorpayResponse.razorpay_signature,
    }),
  });
}
