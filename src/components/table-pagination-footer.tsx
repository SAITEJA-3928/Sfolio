import * as React from "react";
import { Button } from "@/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  TABLE_PAGE_SIZE_OPTIONS,
} from "@/lib/table-pagination";

type TablePaginationFooterProps = {
  totalItems: number;
  pageSize: number;
  onPageSizeChange: (pageSize: number) => void;
  currentPage: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
  pageSizeOptions?: readonly number[];
  itemLabel?: string;
  summary?: React.ReactNode;
  className?: string;
  disablePrevious?: boolean;
  disableNext?: boolean;
};

export function TablePaginationFooter({
  totalItems,
  pageSize,
  onPageSizeChange,
  currentPage,
  totalPages,
  onPrevious,
  onNext,
  pageSizeOptions = TABLE_PAGE_SIZE_OPTIONS,
  itemLabel = "entries",
  summary,
  className,
  disablePrevious,
  disableNext,
}: TablePaginationFooterProps) {
  const startIndex = (currentPage - 1) * pageSize;
  const showingFrom = totalItems === 0 ? 0 : startIndex + 1;
  const showingTo = Math.min(startIndex + pageSize, totalItems);

  const defaultSummary = (
    <>
      Showing {showingFrom} to {showingTo} of {totalItems} {itemLabel}
    </>
  );

  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-t border-white/5 p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <p>{summary ?? defaultSummary}</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap">Rows per page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger className="h-8 w-[4.75rem] bg-transparent px-2.5" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {pageSizeOptions.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="cursor-pointer"
            disabled={disablePrevious ?? currentPage <= 1}
            onClick={onPrevious}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="cursor-pointer"
            disabled={disableNext ?? currentPage >= totalPages}
            onClick={onNext}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

