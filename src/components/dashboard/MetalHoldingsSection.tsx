import {
  MetalHoldingsMetricCard,
  type MetalHoldingsStats,
} from "@/components/dashboard/MetalHoldingsMetricCard";

export type { MetalHoldingsStats };

type MetalSummary = {
  totalGrams?: number;
  investedAmount?: number;
};

export function extractMetalHoldings(summary: unknown): MetalHoldingsStats {
  const record =
    summary && typeof summary === "object" ? (summary as MetalSummary) : {};

  return {
    totalAmount: Number(record.investedAmount) || 0,
    totalQuantity: Number(record.totalGrams) || 0,
  };
}

type MetalHoldingsSectionProps = {
  goldHoldings: MetalHoldingsStats;
  silverHoldings: MetalHoldingsStats;
  onClick?: () => void;
};

export function MetalHoldingsSection({
  goldHoldings,
  silverHoldings,
  onClick,
}: MetalHoldingsSectionProps) {
  return (
    <div className="mb-6 grid gap-6 lg:grid-cols-2">
      <div onClick={onClick} className="cursor-pointer">
        <MetalHoldingsMetricCard
          metal="Gold"
          holdings={goldHoldings}
        />
      </div>

      <div onClick={onClick} className="cursor-pointer">
        <MetalHoldingsMetricCard
          metal="Silver"
          holdings={silverHoldings}
        />
      </div>
    </div>
  );
}
