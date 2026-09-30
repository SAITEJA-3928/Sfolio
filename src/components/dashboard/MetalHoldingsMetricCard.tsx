import goldImage from "@/assets/gold.png";
import silverImage from "@/assets/silver.png";
import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";

type Metal = "Gold" | "Silver";

export type MetalHoldingsStats = {
  totalAmount: number;
  totalQuantity: number;
};

const METAL_THEMES = {
  Gold: {
    imageSrc: goldImage,
    chip: "bg-amber-500/10",
    label: "text-amber-800 dark:text-amber-300",
  },
  Silver: {
    imageSrc: silverImage,
    chip: "bg-slate-500/10",
    label: "text-slate-700 dark:text-slate-300",
  },
} as const;

type MetalHoldingsMetricCardProps = {
  metal: Metal;
  holdings: MetalHoldingsStats;
  className?: string;
};

function formatInrAmount(amount: number) {
  return `₹${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

function formatMetalQuantity(quantity: number) {
  return `${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(quantity)} g`;
}

function MetricColumn({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center px-1.5 text-center first:pl-0 last:pr-0 rounded-md hover:bg-muted/80 cursor-pointer transition-colors">
      <p className="text-[11px] font-medium leading-tight text-muted-foreground">{label} </p>
      <p className="mt-2 text-lg font-bold tabular-nums leading-none text-foreground">{value}</p>
    </div>
  );
}

export function MetalHoldingsMetricCard({ metal, holdings, className }: MetalHoldingsMetricCardProps) {
  const theme = METAL_THEMES[metal];

  return (
    <Card
      className={cn(
        "rounded-xl border-border bg-card p-3 text-card-foreground shadow-sm",
        className
      )}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            theme.chip
          )}
        >
          <img src={theme.imageSrc} alt={`${metal} icon`} className="h-6 w-6 object-contain" />
        </div>
        <div className="min-w-0">
          <h2 className={cn("text-base font-bold leading-tight", theme.label)}>{metal}</h2>
          <p className="mt-0.5 text-[11px] font-medium leading-snug text-muted-foreground">
            Platform holdings overview
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 divide-x divide-border">
        <MetricColumn
          label="Invested Amount"
          value={formatInrAmount(holdings.totalAmount)}
        />
        <MetricColumn
          label="Total Grams"
          value={formatMetalQuantity(holdings.totalQuantity)}
        />
      </div>
    </Card>
  );
}
