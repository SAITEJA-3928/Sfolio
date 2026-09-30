import * as React from "react";
import type { DateRange } from "react-day-picker";
import { formatDateInputValue, parseDateInputValue } from "@/lib/date-range";

const PERSISTED_FILTER_PREFIXES = [
  "gfolio-admin:search-term:",
  "gfolio-admin:date-range:",
  "gfolio-admin:date-value:",
] as const;

export const PERSISTED_SEARCH_KEY_PREFIX = PERSISTED_FILTER_PREFIXES[0];
export const PERSISTED_DATE_RANGE_KEY_PREFIX = PERSISTED_FILTER_PREFIXES[1];
export const PERSISTED_DATE_VALUE_KEY_PREFIX = PERSISTED_FILTER_PREFIXES[2];

const EMPTY_DATE_RANGE_MARKER = "__none__";

function clearAllPersistedFilters() {
  if (typeof window === "undefined") return;
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const key = sessionStorage.key(i);
    if (key && PERSISTED_FILTER_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      sessionStorage.removeItem(key);
    }
  }
}

function isPageReload() {
  if (typeof window === "undefined") return false;
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return nav?.type === "reload";
}

if (isPageReload()) {
  clearAllPersistedFilters();
}

export function createPersistedSearchTermKey(page: string) {
  return `${PERSISTED_SEARCH_KEY_PREFIX}${page}`;
}

export function createPersistedDateRangeKey(page: string) {
  return `${PERSISTED_DATE_RANGE_KEY_PREFIX}${page}`;
}

export function createPersistedDateValueKey(page: string) {
  return `${PERSISTED_DATE_VALUE_KEY_PREFIX}${page}`;
}

export function readPersistedSearchTerm(storageKey: string) {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(storageKey) ?? "";
}

export function writePersistedSearchTerm(storageKey: string, value: string) {
  if (typeof window === "undefined") return;
  if (value.trim()) {
    sessionStorage.setItem(storageKey, value);
  } else {
    sessionStorage.removeItem(storageKey);
  }
}

export function usePersistedSearchTerm(storageKey: string) {
  const [searchTerm, setSearchTermState] = React.useState(() => readPersistedSearchTerm(storageKey));

  const setSearchTerm = React.useCallback(
    (value: React.SetStateAction<string>) => {
      setSearchTermState((prev) => {
        const next = typeof value === "function" ? value(prev) : value;
        writePersistedSearchTerm(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  return [searchTerm, setSearchTerm] as const;
}

type PersistedDateRangePayload = {
  from: string;
  to?: string;
};

function serializeDateRange(range: DateRange) {
  return JSON.stringify({
    from: formatDateInputValue(range.from!),
    to: range.to ? formatDateInputValue(range.to) : undefined,
  } satisfies PersistedDateRangePayload);
}

function deserializeDateRange(raw: string): DateRange | undefined {
  if (raw === EMPTY_DATE_RANGE_MARKER) return undefined;

  try {
    const parsed = JSON.parse(raw) as PersistedDateRangePayload;
    const from = parseDateInputValue(parsed.from);
    if (!from) return undefined;
    const to = parsed.to ? parseDateInputValue(parsed.to) : undefined;
    return { from, to: to ?? from };
  } catch {
    return undefined;
  }
}

function readPersistedDateRange(
  storageKey: string,
  fallback?: () => DateRange | undefined,
): DateRange | undefined {
  if (typeof window === "undefined") {
    return fallback?.();
  }

  const raw = sessionStorage.getItem(storageKey);
  if (raw === null) {
    return fallback?.();
  }

  return deserializeDateRange(raw);
}

function writePersistedDateRange(storageKey: string, value: DateRange | undefined) {
  if (typeof window === "undefined") return;
  if (!value?.from) {
    sessionStorage.setItem(storageKey, EMPTY_DATE_RANGE_MARKER);
    return;
  }
  sessionStorage.setItem(storageKey, serializeDateRange(value));
}

export function usePersistedDateRange(
  storageKey: string,
  fallback?: () => DateRange | undefined,
) {
  const [dateRange, setDateRangeState] = React.useState<DateRange | undefined>(() =>
    readPersistedDateRange(storageKey, fallback),
  );

  const setDateRange = React.useCallback(
    (value: React.SetStateAction<DateRange | undefined>) => {
      setDateRangeState((prev) => {
        const next = typeof value === "function" ? value(prev) : value;
        writePersistedDateRange(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  return [dateRange, setDateRange] as const;
}

function readPersistedDateValue(storageKey: string, fallback?: () => string): string {
  if (typeof window === "undefined") {
    return fallback?.() ?? "";
  }

  const raw = sessionStorage.getItem(storageKey);
  if (raw === null) {
    return fallback?.() ?? "";
  }

  return raw;
}

function writePersistedDateValue(storageKey: string, value: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(storageKey, value);
}

export function usePersistedDateValue(storageKey: string, fallback?: () => string) {
  const [dateValue, setDateValueState] = React.useState(() => readPersistedDateValue(storageKey, fallback));

  const setDateValue = React.useCallback(
    (value: React.SetStateAction<string>) => {
      setDateValueState((prev) => {
        const next = typeof value === "function" ? value(prev) : value;
        writePersistedDateValue(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  return [dateValue, setDateValue] as const;
}
