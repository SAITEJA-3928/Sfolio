import * as React from "react";
import { Layout } from "@/components/layout";
import { Card, Button } from "@/components/ui";
import { Download, Eye, Loader2, Trash2 } from "lucide-react";
import {
  useDeleteAugmontMonthlyInvoice,
  useGenerateAugmontMonthlyInvoice,
  useMonthlyAugmontInvoices,
  buildAugmontInvoiceTableRows,
  canGenerateAugmontInvoice,
  downloadAugmontMonthlyInvoice,
  getAugmontInvoiceYears,
  getMonthlyInvoicePeriodKey,
  isCurrentAugmontInvoiceMonth,
  mapAugmontMonthlyInvoicesByPeriod,
  resolveAugmontMonthlyInvoiceUrl,
  toAugmontMonthlyInvoice,
} from "@/lib/augmont-monthly-invoice";
import { getSortToggleClass, SortDirectionIcon, useTableSort } from "@/lib/table-sort";
import { TablePaginationFooter } from "@/components/table-pagination-footer";
import { bindTablePaginationFooter, useTablePagination } from "@/lib/table-pagination";
import ImagePreviewModal from "@/components/ui/ImagePreviewModal";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { ApiError } from "@/lib/custom-fetch";

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    const data = error.data;
    if (data && typeof data === "object") {
      const record = data as Record<string, unknown>;
      if (typeof record.message === "string" && record.message.trim()) {
        return record.message;
      }
    }
    if (error.message.trim()) return error.message;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

function formatInvoiceAmount(value?: number) {
  return typeof value === "number" ? formatCurrency(value) : "—";
}

export default function Augmont() {
  const availableYears = React.useMemo(() => getAugmontInvoiceYears(), []);
  const [selectedYear, setSelectedYear] = React.useState(
    () => availableYears[0] ?? String(new Date().getFullYear()),
  );
  const {
    data: invoiceRecords = [],
    isLoading,
    isError,
    refetch,
  } = useMonthlyAugmontInvoices(selectedYear);
  const { mutateAsync: generateMonthlyInvoice, isPending: isGeneratingInvoice } =
    useGenerateAugmontMonthlyInvoice();
  const { mutateAsync: deleteMonthlyInvoice, isPending: isDeletingInvoice } =
    useDeleteAugmontMonthlyInvoice(selectedYear);
  const [generatingPeriodKey, setGeneratingPeriodKey] = React.useState<string | null>(null);
  const [deletingInvoiceNumber, setDeletingInvoiceNumber] = React.useState<string | null>(null);
  const [invoiceToDelete, setInvoiceToDelete] = React.useState<{
    invoiceNumber: string;
    monthLabel: string;
  } | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [previewLabel, setPreviewLabel] = React.useState("Augmont Monthly Invoice");

  const activeYear = selectedYear;
  const rows = React.useMemo(
    () => buildAugmontInvoiceTableRows(activeYear, invoiceRecords),
    [activeYear, invoiceRecords],
  );
  const { sortKey, sortDirection, directionFactor, handleSort } =
    useTableSort<"month" | "invoiceNumber" | "grandTotal">();
  const sortedRows = React.useMemo(() => {
    if (!sortKey) return rows;

    return [...rows].sort((a, b) => {
      if (sortKey === "month") {
        return (a.monthNumber - b.monthNumber) * directionFactor;
      }

      if (sortKey === "invoiceNumber") {
        const left = a.record?.invoiceNumber ?? "";
        const right = b.record?.invoiceNumber ?? "";
        return left.localeCompare(right) * directionFactor;
      }

      const left = a.record?.grandTotal ?? -1;
      const right = b.record?.grandTotal ?? -1;
      return (left - right) * directionFactor;
    });
  }, [directionFactor, rows, sortKey]);

  const pagination = useTablePagination(sortedRows);

  const handleGenerateMonthlyInvoice = React.useCallback(
    async (monthNumber: number, monthKey: string, year: string, monthLabel: string) => {
      const periodKey = getMonthlyInvoicePeriodKey(year, monthKey);
      setGeneratingPeriodKey(periodKey);

      try {
        const response = await generateMonthlyInvoice({
          month: String(monthNumber),
          year,
        });
        const responseData = response?.data;
        const invoiceNumber =
          responseData && typeof responseData.invoiceNumber === "string"
            ? responseData.invoiceNumber
            : "";

        if (!invoiceNumber) {
          throw new Error("Failed to generate invoice.");
        }

        await refetch();
        toast({
          title: "Invoice generated",
          description: `Monthly invoice ${invoiceNumber} created for ${monthLabel}.`,
        });
      } catch (error) {
        const refreshed = await refetch();
        const refreshedInvoice = periodKey
          ? mapAugmontMonthlyInvoicesByPeriod(refreshed.data ?? [])[periodKey]
          : undefined;

        if (refreshedInvoice) {
          toast({
            title: "Invoice already exists",
            description: `Monthly invoice ${refreshedInvoice.invoiceNumber} is already available.`,
          });
          return;
        }

        toast({
          variant: "destructive",
          title: "Invoice generation failed",
          description: getErrorMessage(error, "Failed to generate invoice."),
        });
      } finally {
        setGeneratingPeriodKey(null);
      }
    },
    [generateMonthlyInvoice, refetch],
  );

  const handlePreviewMonthlyInvoice = React.useCallback(
    (record: NonNullable<(typeof rows)[number]["record"]>, monthLabel: string) => {
      const invoice = toAugmontMonthlyInvoice(record);
      const previewInvoiceUrl = resolveAugmontMonthlyInvoiceUrl(invoice);
      if (!previewInvoiceUrl) {
        toast({
          variant: "destructive",
          title: "Invoice not found",
          description: "This invoice is no longer available. You can generate it again.",
        });
        return;
      }

      setPreviewUrl(previewInvoiceUrl);
      setPreviewLabel(`Augmont Monthly Invoice - ${monthLabel}`);
    },
    [],
  );

  const handleDownloadMonthlyInvoice = React.useCallback(
    async (record: NonNullable<(typeof rows)[number]["record"]>) => {
      const downloaded = await downloadAugmontMonthlyInvoice(toAugmontMonthlyInvoice(record));
      if (downloaded) return;

      toast({
        variant: "destructive",
        title: "Invoice download failed",
        description: "Unable to download this invoice. Please try again.",
      });
    },
    [],
  );

  const handleDeleteMonthlyInvoice = React.useCallback(async () => {
    if (!invoiceToDelete) return;

    setDeletingInvoiceNumber(invoiceToDelete.invoiceNumber);

    try {
      const response = await deleteMonthlyInvoice(invoiceToDelete.invoiceNumber);
      await refetch();
      toast({
        title: "Invoice deleted",
        description:
          response?.message ??
          `Monthly invoice ${invoiceToDelete.invoiceNumber} deleted successfully.`,
      });
      setInvoiceToDelete(null);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Invoice deletion failed",
        description: getErrorMessage(error, "Failed to delete invoice."),
      });
    } finally {
      setDeletingInvoiceNumber(null);
    }
  }, [deleteMonthlyInvoice, invoiceToDelete, refetch]);

  return (
    <Layout title="Augmont">
      <Card className="flex h-[calc(100vh-7.5rem)] flex-col">
        <div className="flex flex-col gap-4 border-b border-white/5 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-foreground">Monthly Invoices</h2>
            {isError && (
              <span className="text-xs text-destructive">Failed to load monthly invoices.</span>
            )}
          </div>
          <select
            value={activeYear}
            onChange={(event) => setSelectedYear(event.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground sm:w-auto"
          >
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div className="min-h-0 w-full flex-1 overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted text-sm  text-muted-foreground">
              <tr>
                <th className="px-4 py-4 ps-6 text-left font-medium uppercase">
                  <button
                    type="button"
                    onClick={() => handleSort("month")}
                    className={`${getSortToggleClass(sortKey === "month")} `}
                  >
                    Month <SortDirectionIcon active={sortKey === "month"} direction={sortDirection} />
                  </button>
                </th>
                <th className="px-4 py-4 text-left font-medium uppercase">
                  <button
                    type="button"
                    onClick={() => handleSort("invoiceNumber")}
                    className={`${getSortToggleClass(sortKey === "invoiceNumber")} `}
                  >
                    Invoice Number{" "}
                    <SortDirectionIcon active={sortKey === "invoiceNumber"} direction={sortDirection} />
                  </button>
                </th>
                <th className="px-4 py-4 text-left font-medium uppercase">
                  <button
                    type="button"
                    onClick={() => handleSort("grandTotal")}
                    className={`${getSortToggleClass(sortKey === "grandTotal")} `}
                  >
                    Grand Total{" "}
                    <SortDirectionIcon active={sortKey === "grandTotal"} direction={sortDirection} />
                  </button>
                </th>
                <th className="px-4 py-4 text-left font-medium">Invoice</th>
                <th className="px-4 py-4 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Loading monthly invoices...
                  </td>
                </tr>
              ) : sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No data found
                  </td>
                </tr>
              ) : (
                pagination.pagedItems.map((row) => {
                  const record = row.record;
                  const isRowGenerating =
                    generatingPeriodKey === row.periodKey && isGeneratingInvoice;
                  const isRowDeleting =
                    Boolean(record?.invoiceNumber) &&
                    deletingInvoiceNumber === record?.invoiceNumber &&
                    isDeletingInvoice;
                  const canGenerateInvoice = canGenerateAugmontInvoice(activeYear, row.monthNumber);

                  return (
                    <tr
                      key={row.id}
                      className="border-b border-border transition-all duration-200"
                    >
                      <td className="px-4 py-4 ps-6 font-medium text-muted-foreground">
                        {row.monthLabel}
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {record?.invoiceNumber ?? "—"}
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {formatInvoiceAmount(record?.grandTotal)}
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          {record ? (
                            <>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => handlePreviewMonthlyInvoice(record, row.monthLabel)}
                                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                                    aria-label={`View Augmont monthly invoice for ${row.monthLabel}`}
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" sideOffset={8}>
                                  View
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => void handleDownloadMonthlyInvoice(record)}
                                    className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                                    aria-label={`Download Augmont monthly invoice for ${row.monthLabel}`}
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" sideOffset={8}>
                                  Download
                                </TooltipContent>
                              </Tooltip>
                            </>
                          ) : canGenerateInvoice ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs"
                              disabled={isRowGenerating}
                              onClick={() =>
                                void handleGenerateMonthlyInvoice(
                                  row.monthNumber,
                                  row.monthKey,
                                  activeYear,
                                  row.monthLabel,
                                )
                              }
                            >
                              {isRowGenerating ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                "Generate"
                              )}
                            </Button>
                          ) : isCurrentAugmontInvoiceMonth(activeYear, row.monthNumber) ? (
                            <span className="text-xs text-muted-foreground">End of month</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {record ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                disabled={isRowDeleting}
                                onClick={() =>
                                  setInvoiceToDelete({
                                    invoiceNumber: record.invoiceNumber,
                                    monthLabel: row.monthLabel,
                                  })
                                }
                                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                                aria-label={`Delete Augmont monthly invoice for ${row.monthLabel}`}
                              >
                                {isRowDeleting ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5 !text-red-500" />
                                )}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" sideOffset={8}>
                              Delete
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <TablePaginationFooter {...bindTablePaginationFooter(pagination)} />
      </Card>

      <ImagePreviewModal
        url={previewUrl}
        label={previewLabel}
        onClose={() => setPreviewUrl(null)}
      />

      <ConfirmActionDialog
        open={Boolean(invoiceToDelete)}
        title="Delete Invoice"
        message={`Are you sure you want to delete invoice ${invoiceToDelete?.invoiceNumber ?? ""} for ${invoiceToDelete?.monthLabel ?? "this month"}?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isLoading={isDeletingInvoice}
        onOpenChange={(open) => {
          if (!open && !isDeletingInvoice) {
            setInvoiceToDelete(null);
          }
        }}
        onConfirm={() => void handleDeleteMonthlyInvoice()}
      />
    </Layout>
  );
}
