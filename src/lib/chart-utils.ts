export const toChartNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;

  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const roundValue = (value: unknown) =>
  Math.round(toChartNumber(value) * 100) / 100;

export const formatAxisValue = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);

export const parseChartDate = (value: unknown): Date | null => {
  if (typeof value !== "string") return null;

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const fallback = new Date(`${value} ${new Date().getFullYear()}`);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
};

export const getDateParts = (value: unknown) => {
  const date = parseChartDate(value);
  if (!date) return { day: "", month: "" };

  return {
    day: date.toLocaleDateString("en-US", { day: "2-digit" }),
    month: date.toLocaleDateString("en-US", { month: "short" }),
  };
};

export const formatDayLabel = (value: unknown) => {
  if (typeof value !== "string") return "";

  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }

  return value.slice(0, 3);
};

export const getMonthTicks = (trends: { date: string }[]) => {
  const seen = new Set<string>();
  const ticks: string[] = [];

  trends.forEach((t) => {
    const date = parseChartDate(t.date);
    if (!date) return;

    const key = `${date.getFullYear()}-${date.getMonth()}`;
    if (!seen.has(key)) {
      seen.add(key);
      ticks.push(t.date);
    }
  });

  return ticks;
};

export const getEvenlySpacedTicks = (
  data: { date: string }[],
  maxTicks: number,
): string[] => {
  if (data.length === 0) return [];
  if (data.length <= maxTicks) return data.map((item) => item.date);

  const lastIndex = data.length - 1;
  const step = lastIndex / (maxTicks - 1);
  const indices = Array.from({ length: maxTicks }, (_, i) =>
    i === maxTicks - 1 ? lastIndex : Math.round(i * step),
  );

  return [...new Set(indices)].map((index) => data[index].date);
};