import * as React from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from "@/components/ui";
import { Wallet as WalletIcon, ArrowUpRight, ArrowDownRight, Plus, History } from "lucide-react";
import { useGetWalletBalance, useGetWalletTransactions } from "@/lib/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";

const MOCK_WALLET = {
  balance: 15450000,
  totalAdded: 25000000,
  totalSpent: 9550000,
  pendingAmount: 500000,
  departmentAllocations: [
    { department: "Sales", allocated: 5000000, spent: 4800000 },
    { department: "HR & Ops", allocated: 2000000, spent: 500000 },
    { department: "Engineering", allocated: 3000000, spent: 2500000 },
  ]
};

const MOCK_TXNS = [
  { id: "WT-001", type: "credit", amount: 5000000, description: "Bank Transfer - Q1 Budget", balance: 15450000, createdAt: "2024-02-20T10:00:00Z" },
  { id: "WT-002", type: "debit", amount: 250000, description: "Campaign: Spot Awards", balance: 10450000, createdAt: "2024-02-18T14:30:00Z" },
];

export default function CorporateWallet() {
  const { data: walletData, isError: isWalletError } = useGetWalletBalance();
  const { data: txnsData, isError: isTxnsError } = useGetWalletTransactions();

  const wallet = (walletData && !isWalletError) ? walletData : MOCK_WALLET;
  const txns = (txnsData && !isTxnsError) ? txnsData : MOCK_TXNS;

  return (
    <Layout title="Reports">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Main Balance Card */}
        <Card className="col-span-2 bg-gradient-to-br from-[#1A1505] to-[#0A0A0A] border-primary/20 relative overflow-hidden">
          <div className="absolute right-0 top-0 p-8 opacity-60">
            <WalletIcon className="h-36 w-36 text-emerald-900" />
          </div>
          <CardContent className="relative p-6">
            <p className="text-white font-medium mb-2 uppercase tracking-wider text-md">Available Credit</p>
            <h2 className="text-5xl font-bold text-white  tracking-tight">{formatCurrency(wallet.balance)}</h2>
            

          </CardContent>
        </Card>

        {/* Stats Column */}
        <div className="space-y-6">
          <Card>
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <ArrowUpRight className="w-6 h-6 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Added</p>
                <p className="text-xl font-bold text-foreground">{formatCurrency(wallet.totalAdded)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                <History className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Spent</p>
                <p className="text-xl font-bold text-foreground">{formatCurrency(wallet.totalSpent)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Allocations */}
        <Card>
          <CardHeader>
            <CardTitle>Department Allocations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {wallet.departmentAllocations.map(dept => {
              const percent = (dept.spent / dept.allocated) * 100;
              return (
                <div key={dept.department}>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-medium text-foreground">{dept.department}</span>
                    <span className="text-muted-foreground">{formatCurrency(dept.spent)} / {formatCurrency(dept.allocated)}</span>
                  </div>
                  <div className="w-full h-2.5 bg-background rounded-full overflow-hidden border border-border">
                    <div 
                      className={`h-full rounded-full ${percent > 90 ? 'bg-red-500' : 'bg-primary'}`} 
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Transaction History */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Wallet Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {txns.map(txn => (
                <div key={txn.id} className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/50">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${txn.type === 'credit' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                      {txn.type === 'credit' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{txn.description}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(txn.createdAt)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${txn.type === 'credit' ? 'text-emerald-500' : 'text-foreground'}`}>
                      {txn.type === 'credit' ? '+' : '-'}{formatCurrency(txn.amount)}
                    </p>
                    <p className="text-xs text-muted-foreground">Bal: {formatCurrency(txn.balance)}</p>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="ghost" className="w-full mt-4 text-primary hover:text-primary hover:bg-primary/10">View All Transactions</Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
