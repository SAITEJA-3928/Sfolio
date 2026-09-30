import * as React from "react";
import { Layout } from "@/components/layout";
import { TransactionsListView } from "@/pages/transactions";
import { cn } from "@/lib/utils";

const TABS = [
  {
    key: "Sell",
    label: "Sell Transactions",
    title: "Sell Transactions",
  },
  {
    key: "Physical",
    label: "Metals Redemption",
    title: "Metals Redemption",
    queryValue: "physical",
  },
] as const;

type SellTransactionTab = (typeof TABS)[number]["key"];

const getTabFromUrl = (): SellTransactionTab => {
  if (typeof window === "undefined") return "Sell";

  const tab = new URLSearchParams(window.location.search).get("tab");
  return tab === "physical" ? "Physical" : "Sell";
};

const updateTabInUrl = (tab: SellTransactionTab) => {
  const params = new URLSearchParams(window.location.search);

  if (tab === "Physical") {
    params.set("tab", "physical");
  } else {
    params.delete("tab");
  }

  const query = params.toString();

  window.history.replaceState(
    {},
    "",
    query ? `${window.location.pathname}?${query}` : window.location.pathname,
  );
};

export default function SellTransactionsList() {
  const [activeTab, setActiveTab] =
    React.useState<SellTransactionTab>(getTabFromUrl);

  const activeTabConfig = TABS.find((tab) => tab.key === activeTab)!;

  const handleTabChange = React.useCallback(
    (tab: SellTransactionTab) => {
      setActiveTab(tab);
      updateTabInUrl(tab);
    },
    [],
  );

  const tabs = (
    <div className="flex w-fit items-center gap-1 rounded-xl border border-border bg-muted p-1">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => handleTabChange(tab.key)}
          className={cn(
            "cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition-all",
            activeTab === tab.key
              ? "border border-border bg-card text-primary shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  return (
    <Layout title={activeTabConfig.title}>
      <div className="flex h-[calc(100dvh-5.25rem)] flex-col gap-4">
        <TransactionsListView
          sellOnly
          embedded
          physicalOnly={activeTab === "Physical"}
          headerStart={tabs}
        />
      </div>
    </Layout>
  );
}