import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { buildSettlementApiUrl } from "@/lib/api-config";
import { customFetch } from "@/lib/custom-fetch";

const GENERATE_AUGMONT_MONTHLY_INVOICE_ENDPOINT = buildSettlementApiUrl(
  "payment/generateAugmontMonthlyInvoice",
);
const MONTHLY_AUGMONT_INVOICES_ENDPOINT = buildSettlementApiUrl("payment/monthlyAugmontInvoices");
const AUGMONT_MONTHLY_INVOICE_DOWNLOAD_ENDPOINT = buildSettlementApiUrl(
  "payment/augmontMonthlyInvoice",
);
const DELETE_AUGMONT_MONTHLY_INVOICE_ENDPOINT = buildSettlementApiUrl(
  "payment/deleteAugmontMonthlyInvoice",
);

export type GenerateAugmontMonthlyInvoicePayload = {
  month: string;
  year: string;
};

export type AugmontMonthlyInvoiceRecord = {
  _id?: string;
  invoiceNumber: string;
  month: number;
  year: number;
  startDate?: string;
  endDate?: string;
  grandTotal?: number;
  totalTransactionAmount?: number;
  commissionPercentage?: number;
  commissionAmount?: number;
  gstPercentage?: number;
  gstAmount?: number;
  invoiceUrl?: string;
  fileName?: string;
  filePath?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
};

type MonthlyAugmontInvoicesResponse = {
  status?: string;
  results?: number;
  data?: AugmontMonthlyInvoiceRecord[];
};

type GenerateAugmontMonthlyInvoiceResponse = {
  message?: string;
  data?: {
    invoiceNumber?: string;
    invoiceUrl?: string;
    grandTotal?: number;
    totalTransactionAmount?: number;
    commissionAmount?: number;
    bonusAmount?: number;
  };
};

type DeleteAugmontMonthlyInvoiceResponse = {
  status?: number;
  message?: string;
  data?: Record<string, never>;
};

function unwrapAugmontResponseData(value: unknown) {
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return "data" in record ? record.data : value;
}

function normalizeAugmontMonthlyInvoiceRecords(value: unknown): AugmontMonthlyInvoiceRecord[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (invoice): invoice is AugmontMonthlyInvoiceRecord =>
      Boolean(invoice) &&
      typeof invoice === "object" &&
      typeof (invoice as AugmontMonthlyInvoiceRecord).invoiceNumber === "string" &&
      (invoice as AugmontMonthlyInvoiceRecord).invoiceNumber.trim().length > 0 &&
      typeof (invoice as AugmontMonthlyInvoiceRecord).month === "number" &&
      typeof (invoice as AugmontMonthlyInvoiceRecord).year === "number",
  );
}

function getAugmontMonthlyInvoiceDownloadUrl(invoiceNumber: string) {
  return `${AUGMONT_MONTHLY_INVOICE_DOWNLOAD_ENDPOINT}/${encodeURIComponent(invoiceNumber.trim())}`;
}

async function fetchMonthlyAugmontInvoices(year: string | number) {
  const normalizedYear = Number(year);
  if (!Number.isFinite(normalizedYear) || normalizedYear <= 0) {
    return [] as AugmontMonthlyInvoiceRecord[];
  }

  const url = `${MONTHLY_AUGMONT_INVOICES_ENDPOINT}?year=${encodeURIComponent(String(normalizedYear))}`;
  const response = await customFetch<MonthlyAugmontInvoicesResponse | AugmontMonthlyInvoiceRecord[]>(
    url,
    {
      method: "GET",
      responseType: "json",
    },
  );

  if (Array.isArray(response)) {
    return normalizeAugmontMonthlyInvoiceRecords(response);
  }

  const unwrapped = unwrapAugmontResponseData(response);
  if (Array.isArray(unwrapped)) {
    return normalizeAugmontMonthlyInvoiceRecords(unwrapped);
  }

  return normalizeAugmontMonthlyInvoiceRecords(response?.data);
}

async function generateAugmontMonthlyInvoice(payload: GenerateAugmontMonthlyInvoicePayload) {
  return customFetch<GenerateAugmontMonthlyInvoiceResponse>(
    GENERATE_AUGMONT_MONTHLY_INVOICE_ENDPOINT,
    {
      method: "POST",
      body: JSON.stringify(payload),
      responseType: "json",
    },
  );
}

async function deleteAugmontMonthlyInvoice(invoiceNumber: string) {
  const normalizedInvoiceNumber = invoiceNumber.trim();
  if (!normalizedInvoiceNumber) {
    throw new Error("Invoice number is required.");
  }

  return customFetch<DeleteAugmontMonthlyInvoiceResponse>(
    `${DELETE_AUGMONT_MONTHLY_INVOICE_ENDPOINT}/${encodeURIComponent(normalizedInvoiceNumber)}`,
    {
      method: "DELETE",
      responseType: "json",
    },
  );
}

async function fetchAugmontMonthlyInvoiceBlob(invoiceUrl: string) {
  return customFetch<Blob>(invoiceUrl, {
    method: "GET",
    responseType: "blob",
    headers: { web: "true" },
  });
}

const monthlyAugmontInvoicesQueryKey = (year: string) =>
  [MONTHLY_AUGMONT_INVOICES_ENDPOINT, year] as const;

export function useMonthlyAugmontInvoices(year: string) {
  return useQuery({
    queryKey: monthlyAugmontInvoicesQueryKey(year),
    enabled: Boolean(year),
    queryFn: async () => fetchMonthlyAugmontInvoices(year),
  });
}

export function useGenerateAugmontMonthlyInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: generateAugmontMonthlyInvoice,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: monthlyAugmontInvoicesQueryKey(variables.year),
      });
    },
  });
}

export function useDeleteAugmontMonthlyInvoice(year: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAugmontMonthlyInvoice,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: monthlyAugmontInvoicesQueryKey(year),
      });
    },
  });
}

export const AUGMONT_INVOICE_START_YEAR = 2026;
export const AUGMONT_2026_FIRST_MONTH = 5;

export type AugmontMonthlyInvoice = {
  invoiceNumber: string;
  invoiceUrl?: string;
  fileName?: string;
};

export const MONTH_NAME_TO_NUMBER: Record<string, number> = {
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
};

const MONTH_NUMBER_TO_NAME = Object.fromEntries(
  Object.entries(MONTH_NAME_TO_NUMBER).map(([monthKey, monthNumber]) => [monthNumber, monthKey]),
) as Record<number, string>;

export function getAugmontMonthDisplayName(monthNumber: number) {
  if (!Number.isFinite(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", { month: "long" }).format(
    new Date(2000, monthNumber - 1, 1),
  );
}

export type AugmontMonthlyInvoiceRow = {
  monthKey: string;
  monthNumber: number;
  month: string;
};

export function getAugmontInvoiceYears(
  startYear = AUGMONT_INVOICE_START_YEAR,
  endYear = new Date().getFullYear(),
) {
  const years: string[] = [];

  for (let year = endYear; year >= startYear; year -= 1) {
    years.push(String(year));
  }

  return years;
}

export function getMonthlyInvoicePeriodKey(year: string, monthKey: string) {
  const month = MONTH_NAME_TO_NUMBER[monthKey];
  return month ? `${year}-${month}` : "";
}

export function getMonthlyInvoicePeriodKeyFromNumber(year: string | number, month: number) {
  const monthKey = MONTH_NUMBER_TO_NAME[month];
  return monthKey ? getMonthlyInvoicePeriodKey(String(year), monthKey) : "";
}

export function isCurrentAugmontInvoiceMonth(year: string, monthNumber: number) {
  const now = new Date();
  return year === String(now.getFullYear()) && monthNumber === now.getMonth() + 1;
}

export function getAugmontYearMonthRange(year: string) {
  const parsedYear = Number(year);

  if (parsedYear === AUGMONT_INVOICE_START_YEAR) {
    return { minMonth: AUGMONT_2026_FIRST_MONTH, maxMonth: 12 };
  }

  return { minMonth: 1, maxMonth: 12 };
}

export function isFutureAugmontInvoiceMonth(year: string, monthNumber: number) {
  const parsedYear = Number(year);
  if (!Number.isFinite(parsedYear)) return false;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (parsedYear > currentYear) return true;
  if (parsedYear < currentYear) return false;

  return monthNumber > currentMonth;
}

export function isEligibleAugmontInvoiceMonth(year: string, monthNumber: number) {
  const { minMonth, maxMonth } = getAugmontYearMonthRange(year);
  return monthNumber >= minMonth && monthNumber <= maxMonth;
}

export function canGenerateAugmontInvoice(year: string, monthNumber: number) {
  if (!isEligibleAugmontInvoiceMonth(year, monthNumber)) return false;
  if (isCurrentAugmontInvoiceMonth(year, monthNumber)) return false;
  if (isFutureAugmontInvoiceMonth(year, monthNumber)) return false;
  return true;
}

export function buildEligibleAugmontInvoiceRows(year: string): AugmontMonthlyInvoiceRow[] {
  return Object.entries(MONTH_NAME_TO_NUMBER)
    .map(([monthKey, monthNumber]) => ({
      monthKey,
      monthNumber,
      month: getAugmontMonthDisplayName(monthNumber),
    }))
    .filter(
      (row) =>
        isEligibleAugmontInvoiceMonth(year, row.monthNumber) &&
        !isFutureAugmontInvoiceMonth(year, row.monthNumber),
    )
    .sort((a, b) => a.monthNumber - b.monthNumber);
}

export type AugmontInvoiceTableRow = {
  id: string;
  monthKey: string;
  monthNumber: number;
  monthLabel: string;
  periodKey: string;
  record?: AugmontMonthlyInvoiceRecord;
};

export function toAugmontMonthlyInvoice(record: AugmontMonthlyInvoiceRecord): AugmontMonthlyInvoice {
  return {
    invoiceNumber: record.invoiceNumber,
    invoiceUrl: record.invoiceUrl,
    fileName: record.fileName,
  };
}

export function buildAugmontInvoiceTableRows(
  year: string,
  invoices: AugmontMonthlyInvoiceRecord[],
): AugmontInvoiceTableRow[] {
  const recordByPeriod = new Map(
    invoices.map((invoice) => [
      getMonthlyInvoicePeriodKeyFromNumber(invoice.year, invoice.month),
      invoice,
    ]),
  );

  return buildEligibleAugmontInvoiceRows(year).map((row) => {
    const periodKey = getMonthlyInvoicePeriodKey(year, row.monthKey);

    return {
      id: periodKey || `${year}-${row.monthNumber}`,
      monthKey: row.monthKey,
      monthNumber: row.monthNumber,
      monthLabel: row.month,
      periodKey,
      record: periodKey ? recordByPeriod.get(periodKey) : undefined,
    };
  });
}

export function getAugmontMonthlyInvoiceUrl(invoiceNumber?: string | null) {
  if (!invoiceNumber?.trim()) return null;
  return getAugmontMonthlyInvoiceDownloadUrl(invoiceNumber);
}

export function resolveAugmontMonthlyInvoiceUrl(invoice: AugmontMonthlyInvoice) {
  const invoiceUrl = invoice.invoiceUrl?.trim();
  if (invoiceUrl) return invoiceUrl;

  return getAugmontMonthlyInvoiceUrl(invoice.invoiceNumber);
}

export function mapAugmontMonthlyInvoicesByPeriod(
  invoices: AugmontMonthlyInvoiceRecord[],
): Record<string, AugmontMonthlyInvoice> {
  return invoices.reduce<Record<string, AugmontMonthlyInvoice>>((accumulator, invoice) => {
    const periodKey = getMonthlyInvoicePeriodKeyFromNumber(invoice.year, invoice.month);
    if (!periodKey) return accumulator;

    accumulator[periodKey] = {
      invoiceNumber: invoice.invoiceNumber,
      invoiceUrl: typeof invoice.invoiceUrl === "string" ? invoice.invoiceUrl : undefined,
      fileName: typeof invoice.fileName === "string" ? invoice.fileName : undefined,
    };
    return accumulator;
  }, {});
}

function getAugmontMonthlyInvoiceFileName(
  invoice: AugmontMonthlyInvoice,
  contentType?: string | null,
) {
  if (invoice.fileName?.trim()) return invoice.fileName.trim();

  const safeInvoiceNumber = invoice.invoiceNumber.replace(/[\\/:*?"<>|]+/g, "-");
  const extension = contentType?.includes("pdf") ? "pdf" : "pdf";
  return `augmont-monthly-invoice-${safeInvoiceNumber}.${extension}`;
}

export function getAugmontMonthlyInvoiceDownloadFileName(invoice: AugmontMonthlyInvoice) {
  return getAugmontMonthlyInvoiceFileName(invoice, "application/pdf");
}

export async function downloadAugmontMonthlyInvoice(invoice: AugmontMonthlyInvoice) {
  try {
    const invoiceUrl = resolveAugmontMonthlyInvoiceUrl(invoice);
    if (!invoiceUrl) return false;

    const blob = await fetchAugmontMonthlyInvoiceBlob(invoiceUrl);

    const contentType = blob.type?.toLowerCase() ?? "";
    if (!contentType.includes("pdf") && !contentType.includes("octet-stream")) {
      return false;
    }

    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = getAugmontMonthlyInvoiceFileName(invoice, blob.type);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      window.URL.revokeObjectURL(blobUrl);
    }, 100);

    return true;
  } catch (error) {
    console.error("Augmont monthly invoice download failed:", error);
    return false;
  }
}
