export type InvoiceDownloadTransaction = {
  id: string;
  invoiceNumber?: string;
  invoiceUrl?: string;
};

export function getInvoiceFileName(txn: InvoiceDownloadTransaction, contentType?: string | null) {
  const invoiceId = txn.invoiceNumber ?? txn.id;
  const safeInvoiceId = invoiceId.replace(/[\\/:*?"<>|]+/g, "-");
  const extension = contentType?.includes("pdf") ? "pdf" : "pdf";
  return `${safeInvoiceId}.${extension}`;
}

export function getInvoiceDownloadUrl(txn: InvoiceDownloadTransaction) {
  if (txn.invoiceUrl?.trim()) {
    try {
      return new URL(txn.invoiceUrl, window.location.origin).toString();
    } catch {
      return txn.invoiceUrl;
    }
  }

  if (!txn.invoiceNumber?.trim()) return null;

  const apiBase = String(import.meta.env.VITE_AUTH_API || "").replace(/\/+$/, "");
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const baseUrl = apiBase || origin;
  return `${baseUrl}/payment/api/v1/payment/invoices/${encodeURIComponent(txn.invoiceNumber)}`;
}

export async function downloadInvoice(txn: InvoiceDownloadTransaction) {
  try {
    const invoiceUrl = getInvoiceDownloadUrl(txn);
    if (!invoiceUrl) return false;

    const response = await fetch(invoiceUrl, {
      credentials: "include",
      headers: {
        accept: "application/pdf",
      },
    });

    if (!response.ok) {
      console.error("Invoice download API failed:", response.status, response.statusText, invoiceUrl);
      return false;
    }

    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = getInvoiceFileName(txn, blob.type);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      window.URL.revokeObjectURL(blobUrl);
    }, 100);

    return true;
  } catch (error) {
    console.error("Invoice download failed:", error);
    return false;
  }
}
