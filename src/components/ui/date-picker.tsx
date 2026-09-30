import * as React from "react";
import type { DateRange, Matcher } from "react-day-picker";
import { CalendarIcon } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  formatDateDisplayValue,
  formatDateInputValue,
  formatDateRangeLabel,
  parseDateInputValue,
  parseFlexibleDateInput,
} from "@/lib/date-range";

function getCalendarMonth(date?: Date) {
  return date ?? new Date();
}

function toCalendarRange(range?: DateRange): DateRange | undefined {
  if (!range?.from) return undefined;
  return {
    from: range.from,
    to: range.to ?? range.from,
  };
}

function finalizeDateRange(range?: DateRange): DateRange | undefined {
  if (!range?.from) return undefined;
  return {
    from: range.from,
    to: range.to ?? range.from,
  };
}

type DateRangePickerProps = {
  value?: DateRange;
  onChange: (value?: DateRange) => void;
  numberOfMonths?: number;
  className?: string;
  calendarClassName?: string;
};

export function DateRangePicker({
  value,
  onChange,
  numberOfMonths = 2,
  className,
  calendarClassName,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [month, setMonth] = React.useState(() => getCalendarMonth(value?.from));
  const label = formatDateRangeLabel(value);
  const hasDateRange = Boolean(value?.from);
  const isRangeSelected =
    value?.from &&
    value?.to &&
    value.from.getTime() !== value.to.getTime();
  const calendarSelected = React.useMemo(() => toCalendarRange(value), [value]);

  React.useEffect(() => {
    if (value?.from) {
      setMonth(getCalendarMonth(value.from));
    }
  }, [value?.from?.getTime(), value?.to?.getTime()]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      const finalized = finalizeDateRange(value);
      if (finalized && !value?.to) {
        onChange(finalized);
      }
      if (finalized?.from) {
        setMonth(getCalendarMonth(finalized.from));
      }
      return;
    }

    if (value?.from) {
      setMonth(getCalendarMonth(value.from));
    }
  };

  const handleRangeSelect = (range: DateRange | undefined) => {
    if (!range?.from) {
      onChange(undefined);
      return;
    }

    onChange(range);
    setMonth(getCalendarMonth(range.from));
  };

  const hasCustomWidth = Boolean(className && /\bw-(?:\[|\d|\w+)/.test(className));

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-11 justify-between gap-2 rounded-xl border-border bg-background px-3 text-left text-sm font-normal shadow-none transition-all duration-300 hover:bg-muted",
            !hasCustomWidth && (isRangeSelected ? "w-[260px]" : "w-[180px]"),
            className,
          )}
          aria-label={hasDateRange ? `Selected date range ${label}` : "Select date range"}
        >
          <span className={hasDateRange ? "truncate text-foreground" : "truncate text-muted-foreground"}>
            {label}
          </span>
          <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-auto max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl p-0"
        sideOffset={8}
      >
        <Calendar
          mode="range"
          month={month}
          onMonthChange={setMonth}
          defaultMonth={getCalendarMonth(value?.from)}
          selected={calendarSelected}
          onSelect={handleRangeSelect}
          numberOfMonths={numberOfMonths}
          className={cn("rounded-xl p-4 [--cell-size:2.55rem]", calendarClassName)}
          classNames={{
            months: "relative flex flex-col gap-6 md:flex-row",
            month: "flex min-w-[13rem] flex-col gap-4",
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

type SingleDatePickerProps = {
  value: string;
  /** Supports both `(value)` and `(value, date)` handlers, including `setState`. */
  onChange: (value: string, date?: Date) => void;
  className?: string;
  calendarClassName?: string;
  popoverClassName?: string;
  contentSide?: "top" | "right" | "bottom" | "left";
  avoidCollisions?: boolean;
  fixedWeeks?: boolean;
  disabled?: Matcher | Matcher[];
};

export function SingleDatePicker({
  value,
  onChange,
  className,
  calendarClassName,
  popoverClassName,
  contentSide = "bottom",
  avoidCollisions = true,
  fixedWeeks = false,
  disabled,
}: SingleDatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selectedDateValue = React.useMemo(
    () => parseFlexibleDateInput(value) ?? parseDateInputValue(value),
    [value],
  );
  const selectedDateLabel =
    selectedDateValue != null
      ? formatDateDisplayValue(formatDateInputValue(selectedDateValue))
      : "dd/mm/yyyy";
  const [textValue, setTextValue] = React.useState(
    selectedDateValue ? selectedDateLabel : "",
  );
  const [month, setMonth] = React.useState(() => getCalendarMonth(selectedDateValue));

  React.useEffect(() => {
    setTextValue(selectedDateValue ? selectedDateLabel : "");
  }, [selectedDateLabel, selectedDateValue]);

  React.useEffect(() => {
    if (selectedDateValue) {
      setMonth(selectedDateValue);
    }
  }, [selectedDateValue?.getTime()]);
  const emitChange = (date: Date) => {
    const nextValue = formatDateInputValue(date);
    onChange(nextValue, date);
    setTextValue(formatDateDisplayValue(nextValue));
    setMonth(date);
    setOpen(false);
  };

  const commitTextValue = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      setTextValue(selectedDateValue ? selectedDateLabel : "");
      return;
    }

    const date = parseFlexibleDateInput(trimmed);
    if (!date) {
      setTextValue(selectedDateValue ? selectedDateLabel : "");
      return;
    }

    emitChange(date);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen && selectedDateValue) {
      setMonth(selectedDateValue);
    }
  };

  const isFullWidth = Boolean(className?.includes("w-full"));

  return (
    <div className={cn("relative", isFullWidth ? "w-full" : undefined)}>
      <Input
        type="text"
        value={textValue}
        placeholder="dd/mm/yyyy"
        className={cn(
          "h-11 rounded-xl border-border bg-background pr-10 text-sm shadow-none",
          !isFullWidth && "sm:w-[230px]",
          className,
        )}
        aria-label={`Selected date ${selectedDateLabel}`}
        onChange={(event) => setTextValue(event.target.value)}
        onBlur={() => commitTextValue(textValue)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitTextValue(textValue);
          }
        }}
        onPaste={(event) => {
          const text = event.clipboardData.getData("text");
          const date = parseFlexibleDateInput(text);
          if (!date) return;
          event.preventDefault();
          emitChange(date);
        }}
      />
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Open calendar"
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side={contentSide}
          sideOffset={8}
          avoidCollisions={avoidCollisions}
          className={cn(
            "w-auto max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl p-0",
            popoverClassName,
          )}
        >
          <Calendar
            mode="single"
            required
            month={month}
            onMonthChange={setMonth}
            defaultMonth={getCalendarMonth(selectedDateValue)}
            selected={selectedDateValue}
            disabled={disabled}
            onSelect={(date) => {
              if (!date) return;
              emitChange(date);
            }}
            fixedWeeks={fixedWeeks}
            numberOfMonths={1}
            className={cn("rounded-xl p-4 [--cell-size:2rem]", calendarClassName)}
            classNames={{
              months: "relative flex flex-col gap-6",
              month: "flex min-w-[13rem] flex-col gap-4",
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
