import type { DateRange } from "react-day-picker";
import { getDateRangeFromTimePeriod, parseTimePeriodFromSearch } from "@/lib/time-period";

export function formatDateRangeValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${day}/${month}/${year}`;
}

export function formatDateRangeLabel(range?: DateRange) {
  if (!range?.from) return "dd/mm/yyyy";
  if (!range.to) return `${formatDateRangeValue(range.from)} - Select end`;
  if (isSameCalendarDay(range.from, range.to)) return formatDateRangeValue(range.from);
  return `${formatDateRangeValue(range.from)} - ${formatDateRangeValue(range.to)}`;
}

export function getCurrentDateRange(): DateRange {
  const today = new Date();
  return { from: today, to: today };
}

export function getInitialDateRange(search: string): DateRange {
  return getInitialDateRangeFromSearch(search) ?? getCurrentDateRange();
}

export function getInitialDateRangeFromSearch(search: string): DateRange | undefined {
  const timePeriod = parseTimePeriodFromSearch(search);
  if (timePeriod) return getDateRangeFromTimePeriod(timePeriod);
  return undefined;
}

export function getTodayDateInputValue() {
  return formatDateInputValue(new Date());
}

export function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateInputValue(value: any) {
  if (!value || typeof value !== "string") {
    return undefined;
  }
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function formatDateDisplayValue(value: string) {
  const date = parseDateInputValue(value);
  if (!date) return "dd/mm/yyyy";
  return formatDateRangeValue(date);
}

function getLocalDayTime(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function isSameCalendarDay(first?: Date, second?: Date) {
  if (!first || !second) return false;
  return getLocalDayTime(first) === getLocalDayTime(second);
}

export function isDateInRange(value: string | undefined, range?: DateRange) {
  if (!range?.from) return true;
  if (!value) return false;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const valueDay = getLocalDayTime(date);
  const fromDay = getLocalDayTime(range.from);
  const toDay = getLocalDayTime(range.to ?? range.from);

  return valueDay >= Math.min(fromDay, toDay) && valueDay <= Math.max(fromDay, toDay);
}
/** Parses pasted/copied date text: `yyyy-mm-dd`, `dd/mm/yyyy`, `dd-mm-yyyy`, `dd.mm.yyyy`. */
export function parseFlexibleDateInput(value: any | Date): Date | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }
  if (!value || typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const iso = parseDateInputValue(trimmed);
  if (iso) return iso;

  const match = trimmed.match(
    /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/,
  );
  if (!match) return undefined;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (!day || !month || !year || month > 12 || day > 31) return undefined;

  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined;
  }
  return date;
}
