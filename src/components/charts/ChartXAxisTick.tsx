import { formatDayLabel, getDateParts } from "@/lib/chart-utils";

export function ChartXAxisTick({ x, y, payload, timePeriod, isMobile }: any) {
  const fontSize = isMobile ? 10 : 12;

  if (timePeriod === "10") {
    return (
      <text x={x} y={y + 12} textAnchor="middle" fill="#9ca3af" fontSize={fontSize}>
        {formatDayLabel(payload?.value)}
      </text>
    );
  }

  if (timePeriod === "30") {
    const { day, month } = getDateParts(payload?.value);

    if (isMobile) {
      return (
        <text x={x} y={y + 12} textAnchor="middle" fill="#9ca3af" fontSize={fontSize}>
          {day} {month}
        </text>
      );
    }

    return (
      <text x={x} y={y + 4} textAnchor="middle" fill="#9ca3af" fontSize={fontSize}>
        <tspan x={x}>{day}</tspan>
        <tspan x={x} dy="14">{month}</tspan>
      </text>
    );
  }

  const { month } = getDateParts(payload?.value);

  return (
    <text x={x} y={y + 12} textAnchor="middle" fill="#9ca3af" fontSize={fontSize}>
      {month}
    </text>
  );
}
