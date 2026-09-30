import { customFetch } from "@/lib/custom-fetch";
import { buildAssetApiUrl } from "@/lib/api-config";

export type MetalPriceRow = {
  providerName?: string;
  metalType?: string;
  priceData?: Record<string, unknown>;
};

export type LiveMetalPrices = {
  goldBuy: number | null;
  goldSell: number | null;
  silverBuy: number | null;
  silverSell: number | null;
};

const GET_METAL_PRICES_ENDPOINT = buildAssetApiUrl("/services/getMetalPrices");
const GET_HISTORICAL_METAL_PRICES_ENDPOINT = buildAssetApiUrl(
  "/services/getHistoricalMetalPrices"
);
export const METAL_PRICES_QUERY_KEY = [GET_METAL_PRICES_ENDPOINT] as const;

export type HistoricalMetalPrices = {
  goldBuyRate: number | null;
  goldSellRate: number | null;
  silverBuyRate: number | null;
  silverSellRate: number | null;
};

export type MetalPriceChange = {
  amount: number;
  direction: "up" | "down" | "flat";
};

function parsePositiveNumber(...candidates: unknown[]) {
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return null;
}

function formatIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getPreviousDayComparisonDate(referenceDate = new Date()) {
  const previousDay = new Date(referenceDate);
  previousDay.setDate(previousDay.getDate() - 1);
  return formatIsoDate(previousDay);
}

export function historicalMetalPricesQueryKey(date: string) {
  return [...METAL_PRICES_QUERY_KEY, "historical", date] as const;
}

function normalizeMetalPriceRows(value: unknown): MetalPriceRow[] {
  if (Array.isArray(value)) {
    return value as MetalPriceRow[];
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.data)) {
      return record.data as MetalPriceRow[];
    }
  }

  return [];
}

export async function fetchLiveMetalPrices() {
  const response = await customFetch<{ data?: MetalPriceRow[] }>(GET_METAL_PRICES_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });

  return normalizeMetalPriceRows(response);
}

function findMetalPriceRow(rows: MetalPriceRow[], metalType: "GOLD" | "SILVER") {
  const matchesType = (row: MetalPriceRow) => row.metalType?.toUpperCase() === metalType;

  return (
    rows.find((row) => row.providerName === "AUGMONT" && matchesType(row)) ??
    rows.find(matchesType)
  );
}

function readMetalPriceSource(row: MetalPriceRow | undefined) {
  if (!row?.priceData || typeof row.priceData !== "object") {
    return undefined;
  }

  const priceData = row.priceData;
  const nestedData = priceData.data;
  if (nestedData && typeof nestedData === "object") {
    return nestedData as Record<string, unknown>;
  }

  const resultData = (priceData.result as Record<string, unknown> | undefined)?.data;
  if (resultData && typeof resultData === "object") {
    return resultData as Record<string, unknown>;
  }

  return priceData;
}

function extractLiveMetalBuyRate(
  source: Record<string, unknown> | undefined,
  metal: "gold" | "silver"
) {
  if (!source) return null;

  const rates =
    source.rates && typeof source.rates === "object"
      ? (source.rates as Record<string, unknown>)
      : undefined;

  if (metal === "gold") {
    return parsePositiveNumber(source.buyGoldRate, rates?.gBuy, source.gBuy);
  }

  return parsePositiveNumber(
    source.buySilverRate,
    rates?.sBuy,
    source.sBuy,
    source.silverPricePerGram
  );
}

function extractLiveMetalSellRate(
  source: Record<string, unknown> | undefined,
  metal: "gold" | "silver"
) {
  if (!source) return null;

  const rates =
    source.rates && typeof source.rates === "object"
      ? (source.rates as Record<string, unknown>)
      : undefined;

  if (metal === "gold") {
    return parsePositiveNumber(source.saleGoldRate, rates?.gSell, source.gSell);
  }

  return parsePositiveNumber(source.saleSilverRate, rates?.sSell, source.sSell);
}

function extractHistoricalEntry(metalPayload: unknown) {
  if (!metalPayload || typeof metalPayload !== "object") {
    return null;
  }

  const metal = metalPayload as Record<string, unknown>;
  const entryLists = [metal.data, (metal.result as Record<string, unknown> | undefined)?.data];

  for (const entries of entryLists) {
    if (!Array.isArray(entries) || entries.length === 0) continue;
    const candidate = entries[0];
    if (candidate && typeof candidate === "object") {
      return candidate as Record<string, unknown>;
    }
  }

  return null;
}

function extractHistoricalRates(metalPayload: unknown) {
  const entry = extractHistoricalEntry(metalPayload);
  if (!entry) {
    return { buyRate: null, sellRate: null };
  }

  return {
    buyRate: parsePositiveNumber(entry.buyRate, entry.buyGoldRate, entry.buySilverRate),
    sellRate: parsePositiveNumber(entry.sellRate, entry.saleGoldRate, entry.saleSilverRate),
  };
}

export function extractAugmontMetalPrices(rows: MetalPriceRow[]): LiveMetalPrices {
  const goldRow = findMetalPriceRow(rows, "GOLD");
  const silverRow = findMetalPriceRow(rows, "SILVER");
  const goldSource = readMetalPriceSource(goldRow);
  const silverSource = readMetalPriceSource(silverRow);

  return {
    goldBuy: extractLiveMetalBuyRate(goldSource, "gold"),
    goldSell: extractLiveMetalSellRate(goldSource, "gold"),
    silverBuy: extractLiveMetalBuyRate(silverSource, "silver"),
    silverSell: extractLiveMetalSellRate(silverSource, "silver"),
  };
}

export async function fetchHistoricalMetalPrices(date: string): Promise<HistoricalMetalPrices> {
  const response = await customFetch<{
    success?: boolean;
    data?: {
      gold?: { data?: unknown[] };
      silver?: { data?: unknown[] };
    };
  }>(GET_HISTORICAL_METAL_PRICES_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ date }),
  });

  const goldRates = extractHistoricalRates(response?.data?.gold);
  const silverRates = extractHistoricalRates(response?.data?.silver);

  return {
    goldBuyRate: goldRates.buyRate,
    goldSellRate: goldRates.sellRate,
    silverBuyRate: silverRates.buyRate,
    silverSellRate: silverRates.sellRate,
  };
}

export function getMetalPriceChange(
  historicalRate: number | null | undefined,
  liveRate: number | null | undefined
): MetalPriceChange | null {
  if (historicalRate == null || liveRate == null) {
    return null;
  }

  const amount = liveRate - historicalRate;
  if (!Number.isFinite(amount)) {
    return null;
  }

  if (amount === 0) {
    return { amount: 0, direction: "flat" };
  }

  return {
    amount,
    direction: amount > 0 ? "up" : "down",
  };
}

export function formatMetalPriceChangeAmount(change: MetalPriceChange | null) {
  if (!change) return null;

  if (change.amount === 0) {
    return "0.00";
  }

  const sign = change.direction === "up" ? "+" : "-";
  return `${sign}${Math.abs(change.amount).toFixed(2)}`;
}

export function formatMetalPricePerGram(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return "-";
  }

  return `₹${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}/g`;
}
