import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export type SortDirection = "asc" | "desc";

export function useTableSort<TSortKey extends string>(
  initialKey: TSortKey | null = null,
  initialDirection: SortDirection = "asc",
) {
  const [sortKey, setSortKey] = React.useState<TSortKey | null>(initialKey);
  const [sortDirection, setSortDirection] =
    React.useState<SortDirection>(initialDirection);

  const sortKeyRef = React.useRef(sortKey);
  const sortDirectionRef = React.useRef(sortDirection);
  sortKeyRef.current = sortKey;
  sortDirectionRef.current = sortDirection;

  const handleSort = React.useCallback((key: TSortKey) => {
    const currentKey = sortKeyRef.current;
    const currentDirection = sortDirectionRef.current;

    if (currentKey !== key) {
      setSortKey(key);
      setSortDirection("asc");
      return;
    }
    if (currentDirection === "asc") {
      setSortDirection("desc");
      return;
    }
    setSortKey(null);
    setSortDirection("asc");
  }, []);

  const directionFactor = sortDirection === "asc" ? 1 : -1;

  return {
    sortKey,
    sortDirection,
    directionFactor,
    handleSort,
    setSortKey,
    setSortDirection,
  };
}

export function getSortToggleClass(active: boolean) {
  return `inline-flex cursor-pointer items-center gap-1 hover:text-foreground transition-colors ${
    active ? "text-foreground" : ""
  }`;
}

type SortDirectionIconProps = {
  active: boolean;
  direction: SortDirection;
  className?: string;
};

export function SortDirectionIcon({
  active,
  direction,
  className = "h-3.5 w-3.5",
}: SortDirectionIconProps) {
  if (!active) return null;

  const Icon = direction === "asc" ? ChevronUp : ChevronDown;

  return React.createElement(Icon, {
    className,
    "aria-hidden": true,
  });
}
