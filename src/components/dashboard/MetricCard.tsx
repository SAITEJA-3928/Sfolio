import { Card, CardContent } from "@/components/ui";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

type Props = {
  title: string;
  value: React.ReactNode;
  icon: React.ElementType;
  onClick?: () => void;
  className?: string;
};

export function MetricCard({ title, value, change, icon: Icon, onClick, className }: Props) {
  const isPositive = change >= 0;

  return (
    <Card onClick={onClick} className={className}>
      <CardContent className="p-6">
        <div className="flex justify-between mb-4">
          <div className="p-3 rounded-xl bg-primary/10 text-primary">
            <Icon className="w-6 h-6" />
          </div>
        </div>

        <p className="text-sm text-muted-foreground">{title}</p>
        <h3 className="text-xl font-bold">{value}</h3>
      </CardContent>
    </Card>
  );
}