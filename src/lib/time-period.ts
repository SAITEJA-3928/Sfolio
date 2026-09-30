import type { DateRange } from "react-day-picker";

export const DASHBOARD_TIME_PERIODS = ["10", "30", "90"] as const;
export type DashboardTimePeriod = string;

const MAX_TIME_PERIOD_DAYS = 365;

export function isValidTimePeriod(value: string | null | undefined): value is string {
  if (value == null || value.trim() === "") return false;
  const days = Number(value);
  return Number.isInteger(days) && days >= 1 && days <= MAX_TIME_PERIOD_DAYS;
}

export function isDashboardTimePeriod(value: string | null | undefined): value is DashboardTimePeriod {
  return value === "10" || value === "30" || value === "90";
}
export function usesMonthChartTicks(timePeriod: string): boolean {
  const days = Number(timePeriod);
  return Number.isFinite(days) && days > 30;
}

export function parseTimePeriodFromSearch(search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const raw = params.get("timePeriod");
  return isValidTimePeriod(raw) ? raw : null;
}

export function getInitialDashboardTimePeriod(search = ""): string {
  const parsed = parseTimePeriodFromSearch(search);
  return parsed ?? "10";
}

export function buildDashboardPathWithTimePeriod(
  timePeriod: string,
  pathname = typeof window === "undefined" ? "/" : window.location.pathname,
) {
  const params = new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search,
  );

  if (isValidTimePeriod(timePeriod)) {
  params.set("timePeriod", timePeriod);
} else {
  params.delete("timePeriod");
}

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function appendTimePeriodParam(href: string, timePeriod: string): string {
  if (!isValidTimePeriod(timePeriod)) return href;

  const [path, existingQuery = ""] = href.split("?");
  const params = new URLSearchParams(existingQuery);
  params.set("timePeriod", timePeriod);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function getDateRangeFromTimePeriod(timePeriod: string): DateRange {
  const days = Number(timePeriod);
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  return { from, to };
}
