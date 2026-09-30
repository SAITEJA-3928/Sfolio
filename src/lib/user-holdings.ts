export type MetalHolding = {
  totalGrams?: number;
  lockedGrams?: number;
  unlockedGrams?: number;
  investedAmount?: number;
  lockedAmount?: number;
  unlockedAmount?: number;
  currentValue?: number;
  livePrice?: number;
};

export type FolioHoldings = {
  gold?: MetalHolding;
  silver?: MetalHolding;
};

export type UserSipInstallment = {
  id: string;
  _id?: string;
  masterSipId?: string;
  metalType?: string;
  type?: string;
  sipAmount?: number;
  frequency?: string;
  status?: string;
  startDate?: string;
  nextExecutionDate?: string;
  totalInstallments?: number | null;
  completedInstallments?: number;
  missedInstallments?: number;
  paymentGateway?: string | null;
  paymentMethod?: string | null;
  debitMode?: string | null;
  lastExecutionStatus?: string | null;
  lastFailureReason?: string | null;
  isPayNowEnabled?: boolean;
  isActive?: boolean;
  reminderSentAt?: string | null;
  graceReminderSentAt?: string | null;
  missedAt?: string | null;
  lastMissedExecutionDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type UserSipRecord = {
  id: string;
  _id?: string;
  metalType?: string;
  type?: string;
  sipType?: string;
  sipAmount?: number;
  bonusAmount?: number;
  frequency?: string;
  status?: string;
  isActive?: boolean;
  startDate?: string;
  nextExecutionDate?: string;
  totalInstallments?: number | null;
  completedInstallments?: number;
  missedInstallments?: number;
  paymentGateway?: string;
  paymentMethod?: string;
  stepUpEnabled?: boolean;
  stepUp?: {
    type?: string | null;
    value?: number;
    previousAmount?: number;
    newAmount?: number;
    lastStepUpDate?: string | null;
  };
  goalId?:
    | { _id?: string; name?: string; targetAmount?: number; targetDate?: string }
    | string
    | null;
  currentSipExecutionId?: string | null;
  sipManagers?: UserSipInstallment[];
  createdAt?: string;
  updatedAt?: string;
};

export type SipSummary = {
  ACTIVE?: number;
  PAUSED?: number;
  CANCELLED?: number;
  COMPLETED?: number;
  [status: string]: number | undefined;
};

export type UserHoldingsRecord = {
  _id?: string;
  userId?: string;

  name?: string;
  email?: string;
  phone?: string;
  giftFolio?: FolioHoldings;
  goalFolio?: FolioHoldings;
  goldFolio?: FolioHoldings;
  growFolio?: FolioHoldings;
  totalHoldings?: FolioHoldings;
  totalMissedInstallments?: number;
  missedInstallments?: number;
  missedSips?: number;
  missedSipCount?: number;
  lastUnlockCheckedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

/** Normalized wallet/holdings payload used by the admin UI. */
export type NormalizedUserHoldings = {
  holdings: UserHoldingsRecord | null;
  masterSipCount: number;
  sipSummary: SipSummary;
  sips: UserSipRecord[];
};

export const FOLIO_SECTIONS = [
  { key: "goldFolio", label: "Gold Folio" },
  { key: "giftFolio", label: "Gift Folio" },
  { key: "goalFolio", label: "Goal Folio" },
  { key: "growFolio", label: "Grow Folio" },
] as const;

export type FolioSectionKey = (typeof FOLIO_SECTIONS)[number]["key"];

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isHoldingsRecord(value: unknown): value is UserHoldingsRecord {
  if (!isObject(value)) return false;
  return (
    "goldFolio" in value ||
    "growFolio" in value ||
    "giftFolio" in value ||
    "goalFolio" in value ||
    "totalHoldings" in value
  );
}

function pickHoldingsRecord(value: unknown): UserHoldingsRecord | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return isHoldingsRecord(first) ? first : null;
  }
  return isHoldingsRecord(value) ? value : null;
}

function asSipSummary(value: unknown): SipSummary {
  if (!isObject(value)) return {};
  const summary: SipSummary = {};
  for (const [key, raw] of Object.entries(value)) {
    const amount = Number(raw);
    if (Number.isFinite(amount)) summary[key] = amount;
  }
  return summary;
}

export function normalizeUserSipInstallment(
  raw: unknown,
  index = 0,
): UserSipInstallment | null {
  if (!isObject(raw)) return null;

  const id =
    raw.id != null
      ? String(raw.id)
      : raw._id != null
        ? String(raw._id)
        : `installment-${index}`;

  return {
    id,
    _id: raw._id != null ? String(raw._id) : undefined,
    masterSipId:
      raw.masterSipId != null ? String(raw.masterSipId) : undefined,
    metalType: raw.metalType != null ? String(raw.metalType) : undefined,
    type: raw.type != null ? String(raw.type) : undefined,
    sipAmount: Number(raw.sipAmount ?? 0),
    frequency: raw.frequency != null ? String(raw.frequency) : undefined,
    status: raw.status != null ? String(raw.status) : undefined,
    startDate: raw.startDate != null ? String(raw.startDate) : undefined,
    nextExecutionDate:
      raw.nextExecutionDate != null ? String(raw.nextExecutionDate) : undefined,
    totalInstallments:
      raw.totalInstallments == null ? null : Number(raw.totalInstallments),
    completedInstallments: Number(raw.completedInstallments ?? 0),
    missedInstallments: Number(raw.missedInstallments ?? 0),
    paymentGateway:
      raw.paymentGateway == null ? null : String(raw.paymentGateway),
    paymentMethod:
      raw.paymentMethod == null ? null : String(raw.paymentMethod),
    debitMode: raw.debitMode == null ? null : String(raw.debitMode),
    lastExecutionStatus:
      raw.lastExecutionStatus == null
        ? null
        : String(raw.lastExecutionStatus),
    lastFailureReason:
      raw.lastFailureReason == null ? null : String(raw.lastFailureReason),
    isPayNowEnabled:
      typeof raw.isPayNowEnabled === "boolean"
        ? raw.isPayNowEnabled
        : typeof raw.payNowEnabled === "boolean"
          ? raw.payNowEnabled
          : undefined,
    isActive: typeof raw.isActive === "boolean" ? raw.isActive : undefined,
    reminderSentAt:
      raw.reminderSentAt == null ? null : String(raw.reminderSentAt),
    graceReminderSentAt:
      raw.graceReminderSentAt == null
        ? null
        : String(raw.graceReminderSentAt),
    missedAt: raw.missedAt == null ? null : String(raw.missedAt),
    lastMissedExecutionDate:
      raw.lastMissedExecutionDate == null
        ? null
        : String(raw.lastMissedExecutionDate),
    createdAt: raw.createdAt != null ? String(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt != null ? String(raw.updatedAt) : undefined,
  };
}

export function normalizeUserSipRecord(raw: unknown, index = 0): UserSipRecord | null {
  if (!isObject(raw)) return null;

  const id =
    raw.id != null
      ? String(raw.id)
      : raw._id != null
        ? String(raw._id)
        : `sip-${index}`;

  const type = raw.type != null ? String(raw.type) : undefined;
  const typeUpper = String(type ?? "").toUpperCase();
  const sipType =
    raw.sipType != null
      ? String(raw.sipType)
      : typeUpper === "MANUAL"
        ? "Manual SIP"
        : typeUpper
          ? "Auto SIP"
          : undefined;

  const sipManagers = Array.isArray(raw.sipManagers)
    ? raw.sipManagers
        .map((item, installmentIndex) =>
          normalizeUserSipInstallment(item, installmentIndex),
        )
        .filter((item): item is UserSipInstallment => item !== null)
    : [];

  return {
    ...(raw as UserSipRecord),
    id,
    _id: raw._id != null ? String(raw._id) : undefined,
    type,
    sipType,
    sipAmount: Number(raw.sipAmount ?? 0),
    bonusAmount:
      raw.bonusAmount == null ? undefined : Number(raw.bonusAmount),
    completedInstallments: Number(raw.completedInstallments ?? 0),
    missedInstallments: Number(raw.missedInstallments ?? 0),
    metalType: raw.metalType != null ? String(raw.metalType) : undefined,
    frequency: raw.frequency != null ? String(raw.frequency) : undefined,
    status: raw.status != null ? String(raw.status) : undefined,
    startDate: raw.startDate != null ? String(raw.startDate) : undefined,
    nextExecutionDate:
      raw.nextExecutionDate != null ? String(raw.nextExecutionDate) : undefined,
    isActive: typeof raw.isActive === "boolean" ? raw.isActive : undefined,
    paymentGateway:
      raw.paymentGateway != null ? String(raw.paymentGateway) : undefined,
    paymentMethod:
      raw.paymentMethod != null ? String(raw.paymentMethod) : undefined,
    currentSipExecutionId:
      raw.currentSipExecutionId == null
        ? null
        : String(raw.currentSipExecutionId),
    sipManagers,
  };
}

function collectRawSips(root: Record<string, unknown>): unknown[] {
  if (Array.isArray(root.sipDetails)) return root.sipDetails;
  if (Array.isArray(root.sips)) return root.sips;

  if (Array.isArray(root.data)) {
    const first = root.data[0];
    if (isObject(first)) {
      if (Array.isArray(first.sipDetails)) return first.sipDetails;
      if (Array.isArray(first.sips)) return first.sips;
    }
  }

  if (isObject(root.data)) {
    if (Array.isArray(root.data.sipDetails)) return root.data.sipDetails;
    if (Array.isArray(root.data.sips)) return root.data.sips;
  }

  return [];
}

/**
 * Accepts the full userHoldings API envelope (or already-normalized /
 * partially unwrapped shapes) and returns a stable UI payload.
 *
 * API shape:
 * {
 *   success, message, count,
 *   data: [ UserHoldingsRecord ],
 *   masterSipCount,
 *   sipSummary: { ACTIVE, PAUSED, CANCELLED, COMPLETED },
 *   sipDetails: [ ... ]
 * }
 */
export function normalizeAdminUserHoldingsResponse(
  raw: unknown,
): NormalizedUserHoldings {
  if (Array.isArray(raw)) {
    return {
      holdings: pickHoldingsRecord(raw),
      masterSipCount: 0,
      sipSummary: {},
      sips: [],
    };
  }

  if (!isObject(raw)) {
    return {
      holdings: null,
      masterSipCount: 0,
      sipSummary: {},
      sips: [],
    };
  }

  // Already normalized by a previous call.
  if ("holdings" in raw && ("sips" in raw || "sipSummary" in raw)) {
    const existing = raw as Partial<NormalizedUserHoldings>;
    return {
      holdings: existing.holdings ?? null,
      masterSipCount: Number(existing.masterSipCount ?? 0) || 0,
      sipSummary: asSipSummary(existing.sipSummary),
      sips: Array.isArray(existing.sips)
        ? existing.sips
            .map((item, index) => normalizeUserSipRecord(item, index))
            .filter((sip): sip is UserSipRecord => sip !== null)
        : [],
    };
  }

  const holdings =
    pickHoldingsRecord(raw.data) ??
    (isHoldingsRecord(raw) ? (raw as UserHoldingsRecord) : null);

  const sips = collectRawSips(raw)
    .map((item, index) => normalizeUserSipRecord(item, index))
    .filter((sip): sip is UserSipRecord => sip !== null);

  const sipSummary = asSipSummary(raw.sipSummary);
  const masterSipCount =
    Number(raw.masterSipCount) ||
    sips.length ||
    Object.values(sipSummary).reduce<number>(
      (sum, value) => sum + (Number(value) || 0),
      0,
    );

  return {
    holdings,
    masterSipCount,
    sipSummary,
    sips,
  };
}

export function unwrapUserHoldings(data: unknown): UserHoldingsRecord | null {
  return normalizeAdminUserHoldingsResponse(data).holdings;
}

export function resolveHoldingsUserId(record: UserHoldingsRecord): string {
  const raw = record.userId ?? record.user;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (raw && typeof raw === "object") {
    const id = raw._id ?? raw.id;
    if (id != null && String(id).trim()) return String(id).trim();
  }
  if (record._id != null && String(record._id).trim()) return String(record._id).trim();
  return "";
}

export function resolveHoldingsUserProfile(record: UserHoldingsRecord): {
  name?: string;
  email?: string;
  phone?: string;
} {
  const populated =
    record.user && typeof record.user === "object"
      ? record.user
      : record.userId && typeof record.userId === "object"
        ? record.userId
        : undefined;

  return {
    name:
      (typeof record.name === "string" && record.name) ||
      (typeof populated?.name === "string" ? populated.name : undefined),
    email:
      (typeof record.email === "string" && record.email) ||
      (typeof populated?.email === "string" ? populated.email : undefined),
    phone:
      (typeof record.phone === "string" && record.phone) ||
      (typeof populated?.phone === "string" ? populated.phone : undefined),
  };
}

export function unwrapAdminUserHoldingsList(data: unknown): UserHoldingsRecord[] {
  if (Array.isArray(data)) {
    return data.filter(
      (item): item is UserHoldingsRecord =>
        !!item && typeof item === "object" && ("userId" in item || "totalHoldings" in item),
    );
  }

  if (!isObject(data)) return [];

  const payload = Array.isArray(data.data) ? data.data : null;
  if (!payload) return [];

  return payload.filter(
    (item): item is UserHoldingsRecord =>
      !!item && typeof item === "object" && ("userId" in item || "totalHoldings" in item),
  );
}

export function extractUserSips(data: unknown): UserSipRecord[] {
  return normalizeAdminUserHoldingsResponse(data).sips;
}

export function getSipSummary(data: unknown): SipSummary {
  return normalizeAdminUserHoldingsResponse(data).sipSummary;
}

export function getTotalHoldings(record: UserHoldingsRecord | null | undefined) {
  return record?.totalHoldings ?? null;
}

export function getFolioHoldings(
  record: UserHoldingsRecord | null | undefined,
  key: FolioSectionKey,
) {
  return record?.[key];
}

export function getMetalCurrentValue(holding?: MetalHolding) {
  if (typeof holding?.currentValue === "number") return holding.currentValue;
  return (Number(holding?.lockedAmount) || 0) + (Number(holding?.unlockedAmount) || 0);
}

export function sumFolioInvested(folio?: FolioHoldings) {
  return (
    (Number(folio?.gold?.investedAmount) || 0) +
    (Number(folio?.silver?.investedAmount) || 0)
  );
}

export function sumFolioCurrentValue(folio?: FolioHoldings) {
  return getMetalCurrentValue(folio?.gold) + getMetalCurrentValue(folio?.silver);
}

export function getTotalInvested(total?: FolioHoldings | null) {
  return sumFolioInvested(total ?? undefined);
}

export function getTotalCurrentValue(total?: FolioHoldings | null) {
  return sumFolioCurrentValue(total ?? undefined);
}

export function formatHoldingsGrams(value?: number) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return `${Math.abs(amount).toFixed(4)} gm`;
}
