import type * as React from "react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";

type SummaryMetric = {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  tone?: "primary" | "destructive" | "foreground";
  onMetricSelect?: () => void;
};

type SummaryMetricCardProps = {
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  metrics: [SummaryMetric, SummaryMetric];
  progress?: number;
  onClick?: () => void;
  className?: string;
};

const toneClass = {
  primary: "text-primary",
  destructive: "text-destructive",
  foreground: "text-foreground",
};

function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function SummaryMetricCard({
  title,
  subtitle,
  icon: Icon,
  metrics,
  progress,
  onClick,
  className,
}: SummaryMetricCardProps) {
  const progressValue = typeof progress === "number" ? clampProgress(progress) : null;

  return (
    <Card
      onClick={onClick}
      className={cn(
        "rounded-xl border-border bg-card p-3 text-card-foreground shadow-sm transition-shadow hover:shadow-md",
        onClick && "cursor-pointer",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold leading-tight text-foreground">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-[11px] font-medium leading-snug text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 divide-x divide-border">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            role={metric.onMetricSelect ? "button" : undefined}
            tabIndex={metric.onMetricSelect ? 0 : undefined}
            onClick={(event) => {
              if (!metric.onMetricSelect) return;
              event.stopPropagation();
              metric.onMetricSelect();
            }}
            onKeyDown={(event) => {
              if (!metric.onMetricSelect) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                metric.onMetricSelect();
              }
            }}
            className={cn(
              "flex flex-col items-center px-1.5 text-center first:pl-0 last:pr-0",
              metric.onMetricSelect && "cursor-pointer rounded-md outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <p className="text-[11px] font-medium leading-tight text-muted-foreground">{metric.label}</p>
            <div className={cn("mt-2 text-lg font-bold leading-none", toneClass[metric.tone ?? "foreground"])}>
              {metric.value}
            </div>
            {metric.detail ? (
              <div className="mt-1.5 text-[11px] font-medium leading-tight text-muted-foreground">{metric.detail}</div>
            ) : null}
          </div>
        ))}
      </div>

      {progressValue !== null ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-primary/10">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${progressValue}%` }}
          />
        </div>
      ) : null}
    </Card>
  );
}
