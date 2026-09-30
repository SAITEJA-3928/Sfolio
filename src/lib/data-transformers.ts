import { roundValue } from "./chart-utils";

export const transformTrends = (data: any[] = []) =>
  data.map((trend) => ({
    ...trend,
    volume: roundValue(trend.volume),
  }));