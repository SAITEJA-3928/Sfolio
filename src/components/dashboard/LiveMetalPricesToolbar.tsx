import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DateRangePicker } from "@/components/ui/date-picker";
import type { DateRange } from "react-day-picker";

const TIME_PERIOD_OPTIONS = [
  { value: "10", label: "Last 10 Days" },
  { value: "30", label: "Last 30 Days" },
  { value: "90", label: "Last 90 Days" },
] as const;

type LiveMetalPricesToolbarProps = {
  timePeriod: string;
  dateRange?: DateRange;
  isTimePeriodDisabled?: boolean;
  onTimePeriodChange: (value: string) => void;
  onDateRangeChange: (value?: DateRange) => void;
};

export function LiveMetalPricesToolbar({
  timePeriod,
  dateRange,
  isTimePeriodDisabled = false,
  onTimePeriodChange,
  onDateRangeChange,
}: LiveMetalPricesToolbarProps) {
  const selectedLabel =
    TIME_PERIOD_OPTIONS.find((option) => option.value === timePeriod)?.label ??
    `Last ${timePeriod} Days`;

  return (
    <div className="mb-4 flex items-center gap-4 justify-end">
      <DateRangePicker value={dateRange} onChange={onDateRangeChange} />
      <Select
        value={timePeriod}
        onValueChange={onTimePeriodChange}
        disabled={isTimePeriodDisabled}
      >
        <SelectTrigger
          id="dashboard-time-period"
          className={cn(
            "h-10.5 w-auto min-w-[148px] rounded-lg border-border bg-background px-2.5 text-xs font-medium shadow-sm",
            "focus:border-primary focus:ring-2 focus:ring-primary/20",
            isTimePeriodDisabled ? "cursor-not-allowed opacity-70" : "cursor-pointer",
          )}
        >
          <SelectValue>{selectedLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent
          position="popper"
          align="end"
          sideOffset={4}
          collisionPadding={16}
          className="w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)]"
        >
          {TIME_PERIOD_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value} className="text-xs">
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
