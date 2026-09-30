export type PlatformFeeInvoiceTransaction = {
  id: string;
  platformFee?: number;
  platformFeeInvoiceUrl?: string;
};

export function shouldShowPlatformFeeInvoiceActions(txn: PlatformFeeInvoiceTransaction) {
  return (
    typeof txn.platformFee === "number" &&
    txn.platformFee > 0 &&
    Boolean(txn.platformFeeInvoiceUrl?.trim())
  );
}

export function getPlatformFeeInvoiceDownloadUrl(txn: PlatformFeeInvoiceTransaction) {
  if (!txn.platformFeeInvoiceUrl?.trim()) return null;

  try {
    return new URL(txn.platformFeeInvoiceUrl, window.location.origin).toString();
  } catch {
    return txn.platformFeeInvoiceUrl;
  }
}

function getPlatformFeeInvoiceFileName(txn: PlatformFeeInvoiceTransaction, contentType?: string | null) {
  const extension = contentType?.includes("pdf") ? "pdf" : "pdf";
  return `platform-fee-${txn.id}.${extension}`;
}

export async function downloadPlatformFeeInvoice(txn: PlatformFeeInvoiceTransaction) {
  try {
    const invoiceUrl = getPlatformFeeInvoiceDownloadUrl(txn);
    if (!invoiceUrl) return false;

    const response = await fetch(invoiceUrl, {
      credentials: "include",
      headers: {
        accept: "application/pdf",
      },
    });

    if (!response.ok) {
      console.error(
        "Platform fee invoice download failed:",
        response.status,
        response.statusText,
        invoiceUrl,
      );
      return false;
    }

    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = getPlatformFeeInvoiceFileName(txn, blob.type);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      window.URL.revokeObjectURL(blobUrl);
    }, 100);

    return true;
  } catch (error) {
    console.error("Platform fee invoice download failed:", error);
    return false;
  }
}
