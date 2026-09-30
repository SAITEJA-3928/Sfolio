"use client";

import * as React from "react";
import { ListFilter, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type TableColumnFilterOption<T extends string = string> = {
  value: T;
  label: string;
};

type TableColumnFilterProps<T extends string> = {
  title: string;
  value: T;
  options: TableColumnFilterOption<T>[];
  onChange: (value: T) => void;
  defaultValue?: T;
  align?: "start" | "center" | "end";
  scrollable?: boolean;
};

export function TableColumnFilter<T extends string>({
  title,
  value,
  options,
  onChange,
  defaultValue,
  align = "start",
  scrollable = false,
}: TableColumnFilterProps<T>) {
  const [open, setOpen] = React.useState(false);
  const resolvedDefault = defaultValue ?? options[0]?.value;
  const isActive = resolvedDefault !== undefined && value !== resolvedDefault;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground",
            isActive && "text-primary",
          )}
          aria-label={`Filter ${title}`}
        >
          <ListFilter className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        sideOffset={8}
        collisionPadding={scrollable ? 16 : undefined}
        className={cn(
          scrollable
            ? "z-[9999] w-64 overflow-visible rounded-xl border border-border bg-popover p-0 shadow-md"
            : "w-44 rounded-xl border border-border p-0 shadow-md",
        )}
      >
        <p className="border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
        <div
          className={cn(
            scrollable && "max-h-[min(15rem,var(--radix-popover-content-available-height,15rem))] overflow-y-auto",
          )}
        >
          <ul className="p-1" role="listbox" aria-label={title}>
            {options.map((option) => {
              const selected = value === option.value;
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors",
                      scrollable ? "text-xs leading-snug" : "text-sm",
                      selected
                        ? "bg-primary/10 text-foreground"
                        : "text-foreground hover:bg-muted/60",
                    )}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        selected ? "bg-primary" : "bg-transparent",
                      )}
                      aria-hidden
                    />
                    {option.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function TableHeaderWithFilter({
  children,
  filter,
}: {
  children: React.ReactNode;
  filter?: React.ReactNode;
}) {
  return (
    <div className="inline-flex items-center gap-1">
      {children}
      {filter}
    </div>
  );
}

export type HeaderFilterOption = TableColumnFilterOption<string>;

type TableHeaderFilterProps = {
  title: string;
  value: string;
  onChange: (value: string) => void;
  options: HeaderFilterOption[];
  activeWhen?: (value: string) => boolean;
  clearValue?: string;
  align?: "start" | "center" | "end";
  scrollable?: boolean;
};

export function TableHeaderFilter({
  title,
  value,
  onChange,
  options,
  activeWhen,
  clearValue,
  align = "start",
  scrollable = false,
}: TableHeaderFilterProps) {
  const isActive = activeWhen ? activeWhen(value) : false;
  const resolvedClearValue = clearValue ?? options[0]?.value;

  return (
    <div className="flex items-center gap-1.5">
      <TableColumnFilter
        title={title}
        value={value}
        options={options}
        onChange={onChange}
        defaultValue={resolvedClearValue}
        align={align}
        scrollable={scrollable}
      />
      {isActive && resolvedClearValue !== undefined ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
          onClick={() => onChange(resolvedClearValue)}
          aria-label={`Clear ${title} filter`}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
