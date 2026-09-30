import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { heicTo, isHeic } from "heic-to";
import { customFetch } from "@/lib/custom-fetch";

export type PreviewImageItem = {
  url: string;
  label?: string;
};

interface ImagePreviewModalProps {
  url?: string | null;
  images?: PreviewImageItem[];
  label?: string;
  onClose: () => void;
}

function getUrlPathname(sourceUrl: string) {
  try {
    return decodeURIComponent(new URL(sourceUrl, window.location.origin).pathname);
  } catch {
    return sourceUrl;
  }
}
function hasHeicOrHeifExtension(sourceUrl: string) {
  return /\.hei[cf]$/i.test(getUrlPathname(sourceUrl));
}

function isHeicOrHeifMimeType(type: string) {
  const normalized = type.toLowerCase();
  return (
    normalized.includes("heic") ||
    normalized.includes("heif")
  );
}

function resolveHeicOrHeifMime(blob: Blob, sourceUrl: string) {
  if (isHeicOrHeifMimeType(blob.type)) return blob.type.toLowerCase();
  const pathname = getUrlPathname(sourceUrl).toLowerCase();
  if (pathname.endsWith(".heif")) return "image/heif";
  return "image/heic";
}

function detectMimeFromBytes(header: Uint8Array): string | null {
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    header.length >= 8 &&
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    header.length >= 4 &&
    header[0] === 0x25 &&
    header[1] === 0x50 &&
    header[2] === 0x44 &&
    header[3] === 0x46
  ) {
    return "application/pdf";
  }
  if (
    header.length >= 6 &&
    header[0] === 0x47 &&
    header[1] === 0x49 &&
    header[2] === 0x46
  ) {
    return "image/gif";
  }
  if (
    header.length >= 12 &&
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

async function preparePreviewBlob(
  blob: Blob,
  sourceUrl: string,
): Promise<{ blob: Blob; type: string }> {
  const header = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const magicType = detectMimeFromBytes(header);

  // File may be renamed .heic/.heif but still be a normal PNG/JPEG.
  if (magicType && magicType !== "application/pdf" && magicType.startsWith("image/")) {
    const typed =
      blob.type === magicType ? blob : new Blob([blob], { type: magicType });
    return { blob: typed, type: magicType };
  }

  if (magicType === "application/pdf") {
    const typed =
      blob.type === magicType ? blob : new Blob([blob], { type: magicType });
    return { blob: typed, type: magicType };
  }

  const looksHeicOrHeif =
    isHeicOrHeifMimeType(blob.type) ||
    hasHeicOrHeifExtension(sourceUrl) ||
    (await isHeic(blob));

  if (!looksHeicOrHeif) {
    return {
      blob,
      type: blob.type || "application/octet-stream",
    };
  }

  const heicMime = resolveHeicOrHeifMime(blob, sourceUrl);
  const typedHeic =
    blob.type.toLowerCase() === heicMime
      ? blob
      : new Blob([blob], { type: heicMime });

  const pngBlob = await heicTo({
    blob: typedHeic,
    type: "image/png",
    quality: 0.92,
  });

  const result = pngBlob instanceof Blob ? pngBlob : new Blob([pngBlob], { type: "image/png" });
  return {
    blob: result.type ? result : new Blob([result], { type: "image/png" }),
    type: "image/png",
  };
}

function shouldRenderAsImage(blobType: string) {
  return blobType.startsWith("image/");
}

function PreviewImageItem({ url, label }: PreviewImageItem) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [blobType, setBlobType] = useState<string>("");
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!url) {
      setBlobUrl(null);
      setBlobType("");
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;

    setHasError(false);
    setIsLoading(true);
    setBlobUrl(null);
    setBlobType("");

    customFetch<Blob>(url, {
      method: "GET",
      responseType: "blob",
      headers: { web: "true" },
    })
      .then(async (blob) => {
        if (cancelled) return;

        const prepared = await preparePreviewBlob(blob, url);
        if (cancelled) return;

        objectUrl = URL.createObjectURL(prepared.blob);
        setBlobType(prepared.type);
        setBlobUrl(objectUrl);
      })
      .catch(() => {
        if (cancelled) return;
        setHasError(true);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return (
    <div className="flex min-h-[240px] flex-1 flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3">
      {label ? <p className="text-sm font-medium capitalize text-gray-700">{label}</p> : null}
      <div className="flex flex-1 items-center justify-center">
        {isLoading && <p className="text-sm text-gray-500">Loading...</p>}
        {hasError && (
          <p className="text-sm text-red-500">Unable to load or convert document.</p>
        )}
        {blobUrl && !hasError &&
          (shouldRenderAsImage(blobType) ? (
            <img
              src={blobUrl}
              alt={label ?? "Document preview"}
              className="max-h-[min(50vh,420px)] max-w-full object-contain"
              onError={() => setHasError(true)}
            />
          ) : (
            <iframe
              src={blobUrl}
              title={label ?? "Document"}
              className="h-[min(50vh,420px)] w-full border-0"
            />
          ))}
      </div>
    </div>
  );
}

export default function ImagePreviewModal({
  url,
  images,
  label = "Preview",
  onClose,
}: ImagePreviewModalProps) {
  const previewItems =
    images && images.length > 0
      ? images
      : url
        ? [{ url, label }]
        : [];

  if (previewItems.length === 0) return null;

  const isMulti = previewItems.length > 1;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[min(90vh,800px)] w-[min(95vw,1000px)] flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
          <h1 className="text-xl font-semibold capitalize text-primary">{label}</h1>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 transition-colors hover:text-gray-700"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div
          className={`grid max-h-[calc(min(90vh,800px)-53px)] gap-4 overflow-auto bg-gray-50 p-4 ${
            isMulti ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
          }`}
        >
          {previewItems.map((item, index) => (
            <PreviewImageItem key={`${item.url}-${index}`} url={item.url} label={item.label} />
          ))}
        </div>
      </div>
    </div>
  );
}
