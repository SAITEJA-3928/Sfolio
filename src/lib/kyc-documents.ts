export type KycDocumentSide = {
  url: string;
  side?: string;
};

export type KycDocumentGroup = {
  id: string;
  label: string;
  sides: KycDocumentSide[];
};

export type KycDocumentPreviewImage = {
  url: string;
  label?: string;
};

const SIDE_ORDER: Record<string, number> = {
  front: 0,
  back: 1,
};

function sortBySide(a: KycDocumentSide, b: KycDocumentSide) {
  const aOrder = SIDE_ORDER[String(a.side ?? "").toLowerCase()] ?? 2;
  const bOrder = SIDE_ORDER[String(b.side ?? "").toLowerCase()] ?? 2;
  return aOrder - bOrder;
}

function resolveDocumentUrl(doc: Record<string, unknown>) {
  const raw = doc.mediaUrl ?? doc.url;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

/** Group documents by docType; each type can have front and/or back sides. */
export function groupKycDocuments(documents: unknown): KycDocumentGroup[] {
  if (!Array.isArray(documents)) return [];

  const groups = new Map<string, KycDocumentSide[]>();

  documents.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const doc = item as Record<string, unknown>;
    const url = resolveDocumentUrl(doc);
    if (!url) return;

    const docType = String(doc.docType ?? doc.type ?? doc.title ?? `document-${index}`)
      .trim()
      .toLowerCase();
    const side = typeof doc.side === "string" ? doc.side.toLowerCase() : undefined;
    const existing = groups.get(docType) ?? [];
    existing.push({ url, side });
    groups.set(docType, existing);
  });

  return Array.from(groups.entries()).map(([docType, sides]) => ({
    id: docType,
    label: docType,
    sides: [...sides].sort(sortBySide),
  }));
}

export function formatDocumentSideLabel(side?: string) {
  if (!side) return undefined;
  return side.charAt(0).toUpperCase() + side.slice(1);
}

export function formatDocumentGroupLabel(label: string) {
  const normalized = label.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return "Document";
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getKycDocumentPreviewImages(
  group: KycDocumentGroup,
): KycDocumentPreviewImage[] {
  const sides = group.sides.filter((side) => Boolean(side.url?.trim()));
  if (sides.length === 0) return [];

  const sorted = [...sides].sort(sortBySide);

  if (sorted.length === 1) {
    return [{ url: sorted[0].url }];
  }

  return sorted.map((side) => ({
    url: side.url,
    // label: formatDocumentSideLabel(side.side),
  }));
}
