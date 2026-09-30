import * as React from "react";

export const TABLE_PAGE_SIZE_OPTIONS = [20, 50, 75, 100] as const;

export type TablePageSize = (typeof TABLE_PAGE_SIZE_OPTIONS)[number];

export const DEFAULT_TABLE_PAGE_SIZE: TablePageSize = 20;

export const PREVIEW_TABLE_PAGE_SIZE_OPTIONS = [20, 25, 50, 75, 100] as const;

export const DEFAULT_PREVIEW_TABLE_PAGE_SIZE = 20;

export type UseTablePaginationOptions = {
  initialPageSize?: number;
};

export type TablePaginationState<T> = {
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  pageSize: number;
  setPageSize: React.Dispatch<React.SetStateAction<number>>;
  totalItems: number;
  totalPages: number;
  currentPage: number;
  startIndex: number;
  pagedItems: T[];
  handlePageSizeChange: (size: number) => void;
  goToPreviousPage: () => void;
  goToNextPage: () => void;
  resetPage: () => void;
};

export function useTablePagination<T>(
  items: readonly T[],
  options?: UseTablePaginationOptions,
): TablePaginationState<T> {
  const initialPageSize = options?.initialPageSize ?? DEFAULT_TABLE_PAGE_SIZE;
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(initialPageSize);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;

  const pagedItems = React.useMemo(
    () => items.slice(startIndex, startIndex + pageSize) as T[],
    [items, pageSize, startIndex],
  );

  React.useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const handlePageSizeChange = React.useCallback((size: number) => {
    setPageSize(size);
    setPage(1);
  }, []);

  const goToPreviousPage = React.useCallback(() => {
    setPage((current) => Math.max(1, current - 1));
  }, []);

  const goToNextPage = React.useCallback(() => {
    setPage((current) => Math.min(totalPages, current + 1));
  }, [totalPages]);

  const resetPage = React.useCallback(() => {
    setPage(1);
  }, []);

  return {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalItems,
    totalPages,
    currentPage,
    startIndex,
    pagedItems,
    handlePageSizeChange,
    goToPreviousPage,
    goToNextPage,
    resetPage,
  };
}

export function usePreviewTablePagination<T>(items: readonly T[]) {
  return useTablePagination(items, { initialPageSize: DEFAULT_PREVIEW_TABLE_PAGE_SIZE });
}

export type TablePaginationFooterBinding = {
  totalItems: number;
  pageSize: number;
  onPageSizeChange: (pageSize: number) => void;
  currentPage: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
};

export function bindTablePaginationFooter<T>(
  pagination: TablePaginationState<T>,
): TablePaginationFooterBinding {
  return {
    totalItems: pagination.totalItems,
    pageSize: pagination.pageSize,
    onPageSizeChange: pagination.handlePageSizeChange,
    currentPage: pagination.currentPage,
    totalPages: pagination.totalPages,
    onPrevious: pagination.goToPreviousPage,
    onNext: pagination.goToNextPage,
  };
}
