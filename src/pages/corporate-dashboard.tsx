import * as React from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { Wallet, Gift, Users, TrendingUp, CheckCircle2, Clock, ArrowUpRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { Link } from "wouter";
import { getUserDisplayName, readStoredUser } from "@/context/auth";

const COMPANY = {
  plan: "Enterprise",
  walletBalance: 15450000,
  totalCampaigns: 5,
  activeCampaigns: 2,
  totalRecipients: 1050,
  giftsRedeemed: 490,
  giftsDistributed: 590,
  redemptionRate: 83.1,
  totalSpent: 9550000,
  budgetAllocated: 25000000,
};

const RECENT_CAMPAIGNS = [
  { id: "c1", name: "Diwali 2024 – Employee Gifts", status: "Completed", redeemed: 423, total: 500, amount: 2115000 },
  { id: "c2", name: "Q3 Performance Recognition", status: "Active", redeemed: 67, total: 150, amount: 335000 },
  { id: "c3", name: "New Year 2025 – Team Gifts", status: "Scheduled", redeemed: 0, total: 200, amount: 0 },
];

const STATUS_COLORS: Record<string, string> = {
  Completed: "text-emerald-700 bg-emerald-50 border-emerald-200",
  Active:    "text-blue-700 bg-blue-50 border-blue-200",
  Scheduled: "text-amber-700 bg-amber-50 border-amber-200",
};

function StatCard({ icon: Icon, label, value, sub, accent }: any) {
  return (
    <Card className="hover:border-primary/40 transition-colors">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={`p-2.5 rounded-xl ${accent ?? "bg-primary/10"}`}>
            <Icon className="w-5 h-5 text-primary" />
          </div>
        </div>
        <p className="text-2xl font-bold text-foreground mb-0.5">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function CorporateDashboard() {
  const displayName = getUserDisplayName(readStoredUser(), "Corporate User");
  const pct = Math.round((COMPANY.giftsRedeemed / COMPANY.giftsDistributed) * 100);

  return (
    <Layout title="Corporate Overview">
      {/* Company banner */}
      <div className="mb-8 rounded-2xl p-6 flex items-center justify-between"
        style={{ background: "linear-gradient(120deg, hsl(152,69%,35%) 0%, hsl(152,55%,45%) 100%)" }}>
        <div>
          <p className="text-white/70 text-sm mb-1">Logged in as</p>
          <h2 className="text-white text-2xl font-bold">{displayName}</h2>
          <span className="inline-block mt-2 text-xs font-semibold px-3 py-1 rounded-full bg-white/20 text-white">
            {COMPANY.plan} Plan
          </span>
        </div>
        <div className="text-right">
          <p className="text-white/70 text-sm mb-1">Available Credit</p>
          <p className="text-white text-3xl font-bold">{formatCurrency(COMPANY.walletBalance)}</p>
          <Link href="/corporate/reports"
            className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-white/80 hover:text-white transition-colors">
            Reports <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <StatCard icon={Gift}     label="Gifts Distributed" value={COMPANY.giftsDistributed.toLocaleString()} sub={`${COMPANY.giftsRedeemed} redeemed`} />
        <StatCard icon={CheckCircle2} label="Redemption Rate"  value={`${pct}%`} sub="84.5% platform avg" />
        <StatCard icon={Users}    label="Total Recipients"  value={COMPANY.totalRecipients.toLocaleString()} sub={`Across ${COMPANY.totalCampaigns} campaigns`} />
        <StatCard icon={Wallet}   label="Budget Utilised"   value={formatCurrency(COMPANY.totalSpent)} sub={`of ${formatCurrency(COMPANY.budgetAllocated)}`} />
      </div>

      {/* Budget bar */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Budget Utilisation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">Spent: <strong className="text-foreground">{formatCurrency(COMPANY.totalSpent)}</strong></span>
            <span className="text-muted-foreground">Total: <strong className="text-foreground">{formatCurrency(COMPANY.budgetAllocated)}</strong></span>
          </div>
          <div className="h-3 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.round((COMPANY.totalSpent / COMPANY.budgetAllocated) * 100)}%`,
                background: "linear-gradient(90deg, hsl(152,69%,35%), hsl(38,92%,50%))"
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            {Math.round((COMPANY.totalSpent / COMPANY.budgetAllocated) * 100)}% of annual budget used
          </p>
        </CardContent>
      </Card>

      {/* Recent campaigns */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Campaigns</CardTitle>
          <Link href="/corporate/campaigns"
            className="text-sm font-medium text-primary hover:underline flex items-center gap-1">
            View All <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {RECENT_CAMPAIGNS.map(c => {
              const redeemPct = c.total > 0 ? Math.round((c.redeemed / c.total) * 100) : 0;
              return (
                <div key={c.id} className="flex items-center gap-4 p-4 rounded-xl bg-muted/40 border border-border">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                      <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_COLORS[c.status]}`}>
                        {c.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${redeemPct}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{c.redeemed}/{c.total} redeemed</span>
                    </div>
                  </div>
                  {c.amount > 0 && (
                    <p className="text-sm font-semibold text-foreground shrink-0">{formatCurrency(c.amount)}</p>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </Layout>
  );
}
