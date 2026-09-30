import goldImage from "@/assets/gold.png";
import silverImage from "@/assets/silver.png";
import {
  extractAugmontMetalPrices,
  fetchHistoricalMetalPrices,
  fetchLiveMetalPrices,
  formatMetalPriceChangeAmount,
  formatMetalPricePerGram,
  getMetalPriceChange,
  getPreviousDayComparisonDate,
  historicalMetalPricesQueryKey,
  METAL_PRICES_QUERY_KEY,
  type MetalPriceChange,
  type LiveMetalPrices,
} from "@/lib/metal-prices";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Loader2, Minus } from "lucide-react";

type Metal = "Gold" | "Silver";

const METAL_THEMES = {
  Gold: {
    imageSrc: goldImage,
    chip: "bg-amber-500/10 ring-amber-500/20",
    label: "text-amber-800 dark:text-amber-300",
  },
  Silver: {
    imageSrc: silverImage,
    chip: "bg-slate-500/10 ring-slate-500/20",
    label: "text-slate-700 dark:text-slate-300",
  },
} as const;

function PriceChangeBadge({
  change,
  label,
}: {
  change: MetalPriceChange | null;
  label: "Buy" | "Sell";
}) {
  if (!change) {
    return null;
  }

  const formattedChange = formatMetalPriceChangeAmount(change);
  if (!formattedChange) {
    return null;
  }

  const Icon =
    change.direction === "up"
      ? ArrowUpRight
      : change.direction === "down"
        ? ArrowDownRight
        : Minus;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
        change.direction === "up" && "bg-emerald-500/10 text-emerald-600",
        change.direction === "down" && "bg-red-500/10 text-red-600",
        change.direction === "flat" && "bg-muted text-muted-foreground"
      )}
      title={`${label} change vs previous day`}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span>{formattedChange}</span>
    </span>
  );
}

function MetalPriceValue({
  value,
  isLoading,
}: {
  value: number | null;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Loading price" />;
  }

  return <span className="font-semibold tabular-nums">{formatMetalPricePerGram(value)}</span>;
}
function formatMobilePriceValue(value: number | null, isLoading: boolean) {
  if (isLoading) return "...";
  return formatMetalPricePerGram(value);
}

function MobilePriceChangeText({ change }: { change: MetalPriceChange | null }) {
  const formattedChange = formatMetalPriceChangeAmount(change);
  if (!formattedChange || !change) {
    return null;
  }

  const Icon =
    change.direction === "up"
      ? ArrowUpRight
      : change.direction === "down"
        ? ArrowDownRight
        : Minus;

  return (
    <span
      className={cn(
        "ml-1 inline-flex items-center gap-0.5 tabular-nums",
        change.direction === "up" && "text-emerald-600",
        change.direction === "down" && "text-red-600",
        change.direction === "flat" && "text-muted-foreground"
      )}
    >
      <Icon className="h-2.5 w-2.5 shrink-0" />
      <span>{formattedChange}</span>
    </span>
  );
}

function MobileMetalPricesColumn({
  metal,
  buy,
  sell,
  buyChange,
  sellChange,
  isLoadingPrices,
  align = "left",
}: {
  metal: Metal;
  buy: number | null;
  sell: number | null;
  buyChange: MetalPriceChange | null;
  sellChange: MetalPriceChange | null;
  isLoadingPrices: boolean;
  align?: "left" | "right";
}) {
  const labelClass = metal === "Gold" ? "text-amber-800 dark:text-amber-300" : "text-slate-700 dark:text-slate-300";

  return (
    <div className={cn(align === "right" && "text-right")}>
      <p className={cn("text-sm font-bold leading-none", labelClass)}>{metal}</p>
      <p className="mt-2 text-xs leading-relaxed text-foreground">
        Buy: {formatMobilePriceValue(buy, isLoadingPrices)}
        <MobilePriceChangeText change={buyChange} />
      </p>
      <p className="mt-1 text-xs leading-relaxed text-foreground">
        sell: {formatMobilePriceValue(sell, isLoadingPrices)}
        <MobilePriceChangeText change={sellChange} />
      </p>
    </div>
  );
}

function MobileMetalPricesContent({
  prices,
  goldBuyChange,
  goldSellChange,
  silverBuyChange,
  silverSellChange,
  isLoadingPrices,
}: {
  prices: LiveMetalPrices;
  goldBuyChange: MetalPriceChange | null;
  goldSellChange: MetalPriceChange | null;
  silverBuyChange: MetalPriceChange | null;
  silverSellChange: MetalPriceChange | null;
  isLoadingPrices: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 px-3 py-3">
      <MobileMetalPricesColumn
        metal="Gold"
        buy={prices.goldBuy}
        sell={prices.goldSell}
        buyChange={goldBuyChange}
        sellChange={goldSellChange}
        isLoadingPrices={isLoadingPrices}
        align="left"
      />
      <MobileMetalPricesColumn
        metal="Silver"
        buy={prices.silverBuy}
        sell={prices.silverSell}
        buyChange={silverBuyChange}
        sellChange={silverSellChange}
        isLoadingPrices={isLoadingPrices}
        align="right"
      />
    </div>
  );
}

function MetalPriceSection({
  metal,
  buy,
  sell,
  buyChange,
  sellChange,
  isLoadingPrices = false,
}: {
  metal: Metal;
  buy: number | null;
  sell: number | null;
  buyChange: MetalPriceChange | null;
  sellChange: MetalPriceChange | null;
  isLoadingPrices?: boolean;
}) {
  const theme = METAL_THEMES[metal];

  return (
    <div className="flex shrink-0 items-center gap-2 px-3 py-2">
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md ring-1 ring-inset",
          theme.chip
        )}
      >
        <img src={theme.imageSrc} alt={`${metal} icon`} className="h-5 w-5 object-contain" />
      </div>
      <div>
        <p className={cn("text-[10px] font-bold uppercase leading-none tracking-wide", theme.label)}>
          {metal}
        </p>
        <p className="mt-1 whitespace-nowrap text-[10px] leading-tight text-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="font-semibold text-emerald-500">BUY</span>
            <MetalPriceValue value={buy} isLoading={isLoadingPrices} />
            <PriceChangeBadge change={buyChange} label="Buy" />
          </span>
          <span className="mx-2 text-muted-foreground">·</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="font-semibold text-amber-500">SELL</span>
            <MetalPriceValue value={sell} isLoading={isLoadingPrices} />
            <PriceChangeBadge change={sellChange} label="Sell" />
          </span>
        </p>
      </div>
    </div>
  );
}

function DesktopMetalPricesContent({
  prices,
  goldBuyChange,
  goldSellChange,
  silverBuyChange,
  silverSellChange,
  isLoadingPrices = false,
}: {
  prices: LiveMetalPrices;
  goldBuyChange: MetalPriceChange | null;
  goldSellChange: MetalPriceChange | null;
  silverBuyChange: MetalPriceChange | null;
  silverSellChange: MetalPriceChange | null;
  isLoadingPrices?: boolean;
}) {
  return (
    <div className="flex shrink-0 overflow-hidden rounded-lg border border-border bg-muted/30">
      <MetalPriceSection
        metal="Gold"
        buy={prices.goldBuy}
        sell={prices.goldSell}
        buyChange={goldBuyChange}
        sellChange={goldSellChange}
        isLoadingPrices={isLoadingPrices}
      />
      <div className="w-px shrink-0 self-stretch bg-border" aria-hidden="true" />
      <MetalPriceSection
        metal="Silver"
        buy={prices.silverBuy}
        sell={prices.silverSell}
        buyChange={silverBuyChange}
        sellChange={silverSellChange}
        isLoadingPrices={isLoadingPrices}
      />
    </div>
  );
}

export function LiveMetalPricesBar() {
  const comparisonDate = getPreviousDayComparisonDate();
  const {
    data: metalPriceRows,
    isLoading: isLoadingLive,
    isFetching: isFetchingLive,
  } = useQuery({
    queryKey: [...METAL_PRICES_QUERY_KEY],
    queryFn: fetchLiveMetalPrices,
    refetchInterval: 60_000,
  });

  const { data: historicalPrices } = useQuery({
    queryKey: historicalMetalPricesQueryKey(comparisonDate),
    queryFn: () => fetchHistoricalMetalPrices(comparisonDate),
    enabled: Boolean(comparisonDate),
  });

  const isLoadingLivePrices = isLoadingLive || (isFetchingLive && !metalPriceRows);
  const prices = extractAugmontMetalPrices(metalPriceRows ?? []);
  const goldBuyChange = getMetalPriceChange(historicalPrices?.goldBuyRate, prices.goldBuy);
  const goldSellChange = getMetalPriceChange(historicalPrices?.goldSellRate, prices.goldSell);
  const silverBuyChange = getMetalPriceChange(historicalPrices?.silverBuyRate, prices.silverBuy);
  const silverSellChange = getMetalPriceChange(historicalPrices?.silverSellRate, prices.silverSell);

  return (
    <div className="flex w-full min-w-0 flex-col md:w-auto">
      <div className="w-full md:hidden">
        <MobileMetalPricesContent
          prices={prices}
          goldBuyChange={goldBuyChange}
          goldSellChange={goldSellChange}
          silverBuyChange={silverBuyChange}
          silverSellChange={silverSellChange}
          isLoadingPrices={isLoadingLivePrices}
        />
      </div>

      <div className="hidden min-w-0 items-center md:flex">
        <DesktopMetalPricesContent
          prices={prices}
          goldBuyChange={goldBuyChange}
          goldSellChange={goldSellChange}
          silverBuyChange={silverBuyChange}
          silverSellChange={silverSellChange}
          isLoadingPrices={isLoadingLivePrices}
        />
      </div>
    </div>
  );
}
