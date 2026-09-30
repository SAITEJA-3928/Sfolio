export type ContestStatus = "active" | "ended" | "finalized" | "draft" | "upcoming";
export type ContestRankingCriteria =
  | "MAXIMUM_TRANSACTION_COUNT"
  | "MAXIMUM_SIP_COUNT"
  | "MAXIMUM_GOAL_COUNT"
  | "MAXIMUM_BUY_COUNT"
  | "MAXIMUM_GOAL_AMOUNT"
  | "MAXIMUM_SIP_AMOUNT"
  | "MAXIMUM_TRANSACTION_AMOUNT"
  | "MAXIMUM_BUY_AMOUNT"
  | "MAXIMUM_REFERRAL_COUNT";

export function isCountBasedRankingCriteria(criteria?: string): boolean {
  if (!criteria) return false;
  const upper = criteria.toUpperCase();
  return upper.endsWith("_COUNT") || upper.includes("COUNT");
}

export type Contest = {
  id: string;
  name: string;
  description: string;
  rankingCriteria: ContestRankingCriteria;
  isCount?: boolean;
  iscount?: boolean;
  startDate: string;
  endDate: string;
  maxWinners: number;
  bannerKey?: boolean | string;
  pointsPerUnit?: number;
  status: ContestStatus;
  paused: boolean;
  participants: number;
  transactions: number;
  totalInvestment: number;
  createdAt: string;
  updatedAt: string;
};

export type ContestInput = {
  name: string;
  description: string;
  rankingCriteria: ContestRankingCriteria;
  isCount?: boolean;
  iscount?: boolean;
  startDate: string;
  endDate: string;
  maxWinners: number;
  bannerKey?: boolean | string;
  pointsPerUnit?: number;
  status: ContestStatus;
};

const CONTEST_STORAGE_KEY = "gfolio-admin:contests";

const RANKING_CRITERIA: ContestRankingCriteria[] = [
  "MAXIMUM_TRANSACTION_COUNT",
  "MAXIMUM_SIP_COUNT",
  "MAXIMUM_GOAL_COUNT",
  "MAXIMUM_BUY_COUNT",
  "MAXIMUM_GOAL_AMOUNT",
  "MAXIMUM_SIP_AMOUNT",
  "MAXIMUM_TRANSACTION_AMOUNT",
  "MAXIMUM_BUY_AMOUNT",
  "MAXIMUM_REFERRAL_COUNT",
];

function toIsoDate(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return "";
}

export function normalizeContestStatus(value: unknown): ContestStatus {
  const status = String(value ?? "").trim().toLowerCase();
  if (status === "live" || status === "active") return "active";
  if (status === "draft") return "draft";
  if (status === "upcoming") return "upcoming";
  if (status === "finalized" || status === "winner_announced") return "finalized";
  if (status === "ended" || status === "completed" || status === "cancelled") return "ended";
  return "draft";
}

function normalizeRankingCriteria(value: unknown): ContestRankingCriteria {
  const criteria = String(value ?? "").trim().toUpperCase();
  return RANKING_CRITERIA.includes(criteria as ContestRankingCriteria)
    ? (criteria as ContestRankingCriteria)
    : "MAXIMUM_TRANSACTION_AMOUNT";
}

function isContestRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const rawId = record.id ?? record._id;
  return (typeof rawId === "string" || typeof rawId === "number") && typeof record.name === "string";
}

export function mapContestFromApi(value: unknown): Contest | null {
  if (!isContestRecord(value)) return null;
  const record = value;
  const rawId = record.id ?? record._id;
  const rankingCriteria = normalizeRankingCriteria(record.rankingCriteria);
  const isCount =
    typeof record.isCount === "boolean"
      ? record.isCount
      : isCountBasedRankingCriteria(rankingCriteria);

  return {
    id: String(rawId),
    name: record.name,
    description: typeof record.description === "string" ? record.description : "",
    rankingCriteria,
    isCount,
    iscount: isCount,
    startDate: toIsoDate(record.startDate),
    endDate: toIsoDate(record.endDate),
    maxWinners: Number.isFinite(Number(record.maxWinners)) ? Number(record.maxWinners) : 0,
    status: normalizeContestStatus(record.status),
    paused: record.isActive === false || Boolean(record.paused),
    participants: Number.isFinite(Number(record.participants)) ? Number(record.participants) : 0,
    transactions: Number.isFinite(Number(record.transactions)) ? Number(record.transactions) : 0,
    totalInvestment: Number.isFinite(Number(record.totalInvestment))
      ? Number(record.totalInvestment)
      : 0,
    createdAt: toIsoDate(record.createdAt) || new Date().toISOString(),
    updatedAt: toIsoDate(record.updatedAt) || new Date().toISOString(),
  };
}

function normalizeContest(value: unknown): Contest | null {
  return mapContestFromApi(value);
}

export function loadContests(): Contest[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CONTEST_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeContest).filter((contest): contest is Contest => contest !== null);
  } catch {
    return [];
  }
}

export function saveContests(contests: Contest[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CONTEST_STORAGE_KEY, JSON.stringify(contests));
}

export function getContestById(id: string): Contest | undefined {
  return loadContests().find((contest) => contest.id === id);
}

export function createContest(
  input: ContestInput,
  statusOverride?: ContestStatus,
  contestId?: string,
): Contest {
  const contests = loadContests();
  const now = new Date().toISOString();
  const isCount = isCountBasedRankingCriteria(input.rankingCriteria);
  const contest: Contest = {
    ...input,
    id: contestId ?? `contest-${Date.now()}`,
    status: statusOverride ?? input.status,
    isCount,
    iscount: isCount,
    bannerKey: input.bannerKey ?? true,
    pointsPerUnit: input.pointsPerUnit ?? 100,
    paused: false,
    participants: 0,
    transactions: 0,
    totalInvestment: 0,
    createdAt: now,
    updatedAt: now,
  };
  saveContests([contest, ...contests]);
  return contest;
}

export function deleteContest(id: string): boolean {
  const contests = loadContests();
  const remainingContests = contests.filter((contest) => contest.id !== id);
  if (remainingContests.length === contests.length) return false;
  saveContests(remainingContests);
  return true;
}

export function updateContest(
  id: string,
  patch: Partial<Omit<Contest, "id" | "createdAt">>,
): Contest | undefined {
  const contests = loadContests();
  const index = contests.findIndex((contest) => contest.id === id);
  if (index === -1) return undefined;
  const updatedCriteria = patch.rankingCriteria ?? contests[index].rankingCriteria;
  const isCount = isCountBasedRankingCriteria(updatedCriteria);
  const updated: Contest = {
    ...contests[index],
    ...patch,
    isCount,
    iscount: isCount,
    updatedAt: new Date().toISOString(),
  };
  contests[index] = updated;
  saveContests(contests);
  return updated;
}
