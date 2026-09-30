import { Card, CardContent } from "@/components/ui";
import { ArrowUpRight } from "lucide-react";
import { Link } from "wouter";

type Props = {
  title: string;
  value: string | number;
  href?: string;
};

export function ActionCard({ title, value, href }: Props) {
  const content = (
    <Card className="hover:border-primary/40 cursor-pointer">
      <CardContent className="p-5 flex justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}