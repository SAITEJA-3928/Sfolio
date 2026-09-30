import * as React from "react";
import { Layout } from "@/components/layout";
import { Badge, Button, Card } from "@/components/ui";
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Banknote,
  ChevronDown,
  Clock,
  FileText,
  Globe,
  ListChecks,
  Pencil,
  Scale,
  ShieldCheck,
  ShieldX,
  TrendingUp,
  Trophy,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import { useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { type Contest, type ContestStatus, loadContests } from "@/lib/contest-store";

const STATUS_DISPLAY: Record<ContestStatus, { label: string; className: string }> = {
  active: { label: "LIVE", className: "bg-emerald-500/10 text-emerald-600" },
  ended: { label: "ENDED", className: "bg-emerald-100/70 text-emerald-800/60" },
  finalized: { label: "ENDED", className: "bg-emerald-100/70 text-emerald-800/60" },
  draft: { label: "DRAFT", className: "bg-slate-500/10 text-slate-600" },
  upcoming: { label: "UPCOMING", className: "bg-sky-500/10 text-sky-600" },
};

function getStatusDisplay(status?: string): { label: string; className: string } {
  if (!status) {
    return { label: "UNKNOWN", className: "bg-slate-500/10 text-slate-600" };
  }
  const key = status.toLowerCase() as ContestStatus;
  return (
    STATUS_DISPLAY[key] ?? {
      label: status.toUpperCase(),
      className: "bg-slate-500/10 text-slate-600",
    }
  );
}

type RuleSectionId =
  | "general"
  | "eligibility"
  | "scoring"
  | "participation"
  | "disqualification"
  | "payout";

const SIDEBAR_SECTIONS: { id: RuleSectionId; label: string; icon: typeof ListChecks }[] = [
  { id: "general", label: "General Rules", icon: ListChecks },
  { id: "eligibility", label: "Eligibility Criteria", icon: UserCheck },
  { id: "scoring", label: "Scoring & Ranking", icon: Trophy },
  { id: "participation", label: "Participation Rules", icon: Users },
  { id: "disqualification", label: "Disqualification", icon: ShieldX },
  { id: "payout", label: "Payout Rules", icon: Banknote },
];

type RuleRow = {
  title: string;
  description: string;
  icon: typeof ListChecks;
};

const RULE_SECTIONS: Record<
  RuleSectionId,
  { title: string; description: string; rules: RuleRow[] }
> = {
  general: {
    title: "General Rules",
    description: "Basic rules and guidelines for the contest.",
    rules: [
      {
        title: "Fair Play",
        description:
          "All participants must trade fairly. Any unfair advantage, manipulation, or cheating is strictly prohibited.",
        icon: ShieldCheck,
      },
      {
        title: "One Account Policy",
        description: "Participants are allowed to register and participate with only one account.",
        icon: UserCheck,
      },
      {
        title: "Compliance",
        description: "All trades must comply with applicable laws and platform policies.",
        icon: BadgeCheck,
      },
      {
        title: "Rule Updates",
        description: "We reserve the right to update or modify rules at any time without prior notice.",
        icon: Clock,
      },
    ],
  },
  eligibility: {
    title: "Eligibility Criteria",
    description: "Who can participate and what is required to qualify.",
    rules: [
      {
        title: "Verified Accounts",
        description:
          "Only KYC-verified participants with a valid account are eligible to join this contest.",
        icon: BadgeCheck,
      },
      {
        title: "Minimum Activity",
        description:
          "Participants must have at least one completed transaction to qualify for the leaderboard.",
        icon: FileText,
      },
      {
        title: "Age Requirement",
        description:
          "Participants must be at least 18 years old at the time of registration to be eligible.",
        icon: UserCheck,
      },
      {
        title: "Regional Availability",
        description: "The contest is open to participants in supported regions only.",
        icon: Globe,
      },
    ],
  },
  scoring: {
    title: "Scoring & Ranking",
    description: "How points are earned and rankings are calculated.",
    rules: [
      {
        title: "Net Profit Percentage",
        description:
          "Participants are ranked based on net profit percentage earned during the contest period.",
        icon: TrendingUp,
      },
      {
        title: "Tiebreaker",
        description:
          "In case of a tie, higher total returns will be ranked higher.",
        icon: Scale,
      },
      {
        title: "Leaderboard Updates",
        description: "Leaderboard is updated every 15 minutes.",
        icon: Clock,
      },
    ],
  },
  participation: {
    title: "Participation Rules",
    description: "Guidelines participants must follow while taking part.",
    rules: [
      {
        title: "One Account Per Participant",
        description: "Only one account per participant is permitted across the platform.",
        icon: Users,
      },
      {
        title: "Fair Trading",
        description:
          "Manipulative, abusive, or automated trading practices are strictly prohibited.",
        icon: ShieldCheck,
      },
      {
        title: "Transaction Requirement",
        description: "A minimum of 1 completed transaction is required to remain eligible.",
        icon: FileText,
      },
    ],
  },
  disqualification: {
    title: "Disqualification",
    description: "Circumstances under which a participant can be disqualified.",
    rules: [
      {
        title: "Violation of Rules",
        description:
          "Any violation of contest rules may lead to immediate disqualification.",
        icon: ShieldX,
      },
      {
        title: "Fraudulent Activity",
        description:
          "Fraudulent, automated, or duplicate participation results in disqualification.",
        icon: Ban,
      },
      {
        title: "Forfeiture of Rewards",
        description: "Disqualified participants forfeit any accrued prizes or rewards.",
        icon: XCircle,
      },
    ],
  },
  payout: {
    title: "Payout Rules",
    description: "How and when prizes are distributed to winners.",
    rules: [
      {
        title: "Prize Distribution",
        description:
          "Prizes are credited to verified bank accounts within 7 business days of confirmation.",
        icon: Banknote,
      },
      {
        title: "Tax Deductions",
        description: "Prizes are subject to applicable TDS and other statutory deductions.",
        icon: FileText,
      },
      {
        title: "Winner Notification",
        description: "Winners are notified via their registered email address and phone number.",
        icon: Users,
      },
    ],
  },
};

function ContestSelector({
  contests,
  selected,
  onSelect,
}: {
  contests: Contest[];
  selected: Contest;
  onSelect: (contest: Contest) => void;
}) {
  const statusConfig = getStatusDisplay(selected.status);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-border bg-background px-3.5 shadow-sm transition-colors hover:bg-muted"
          aria-label={`Switch contest (currently ${selected.name})`}
        >
          <Trophy className="h-4 w-4 shrink-0 text-primary" />
          <span className="max-w-[10rem] truncate text-sm font-semibold text-foreground">
            {selected.name}
          </span>
          <Badge className={cn("shrink-0", statusConfig.className)}>{statusConfig.label}</Badge>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[14rem]">
        {contests.map((contest) => {
          const config = getStatusDisplay(contest.status);
          return (
            <DropdownMenuItem
              key={contest.id}
              className="cursor-pointer gap-2"
              onSelect={() => onSelect(contest)}
            >
              <Trophy className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate">{contest.name}</span>
              <Badge className={cn("shrink-0", config.className)}>{config.label}</Badge>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function formatLastUpdated(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  const day = date.getDate();
  const month = date.toLocaleString("en-GB", { month: "short" });
  const year = date.getFullYear();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const hours24 = date.getHours();
  const ampm = hours24 >= 12 ? "PM" : "AM";
  const hours = hours24 % 12 || 12;
  return `${day} ${month} ${year}, ${hours}:${minutes} ${ampm}`;
}

export default function ManageRules() {
  const [, navigate] = useLocation();
  const [contests] = React.useState<Contest[]>(() => loadContests());
  const [selectedContest, setSelectedContest] = React.useState<Contest>(
    () => loadContests()[0],
  );
  const [activeSection, setActiveSection] = React.useState<RuleSectionId>("general");

  const section = RULE_SECTIONS[activeSection];

  return (
    <Layout title="Manage Rules">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <button
            type="button"
            onClick={() => navigate("/contests")}
            className="mb-4 inline-flex cursor-pointer items-center text-sm font-medium text-primary hover:underline"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Contest Dashboard
          </button>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Contest Dashboard &gt; Manage Rules
          </p>
          <h1 className="text-xl font-bold text-foreground">Manage Rules</h1>
          <p className="text-sm text-muted-foreground">
            Review and manage the rules and eligibility criteria for this contest.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ContestSelector
            contests={contests}
            selected={selectedContest}
            onSelect={setSelectedContest}
          />
          <Button className="h-11 cursor-pointer gap-2 rounded-xl px-4 shadow-none">
            <Pencil className="h-4 w-4" />
            Edit Rules
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)_20rem]">
        <Card className="h-fit">
          <div className="p-3">
            {SIDEBAR_SECTIONS.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    isActive
                      ? "sidebar-active font-semibold"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isActive ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  {item.label}
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="h-fit">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-foreground">{section.title}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{section.description}</p>
          </div>
          <div className="px-6 pb-6">
            <div className="divide-y divide-border">
              {section.rules.map((rule) => (
                <div key={rule.title} className="flex items-start gap-4 py-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <rule.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">{rule.title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                      {rule.description}
                    </p>
                  </div>
                  <Badge className="shrink-0 bg-emerald-500/10 text-emerald-600">Active</Badge>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="h-fit">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-foreground">Overview</h2>
            </div>
            <div className="px-6 pb-6">
              <div className="divide-y divide-border">
                <div className="flex items-center justify-between gap-3 py-3 first:pt-0">
                  <p className="text-sm text-muted-foreground">Total Rules</p>
                  <p className="text-sm font-semibold text-foreground">18</p>
                </div>
                <div className="flex items-center justify-between gap-3 py-3">
                  <p className="text-sm text-muted-foreground">Active Rules</p>
                  <p className="text-sm font-semibold text-foreground">18</p>
                </div>
                <div className="flex items-center justify-between gap-3 py-3">
                  <p className="text-sm text-muted-foreground">Last Updated</p>
                  <p className="text-right text-sm font-semibold text-foreground">
                    {formatLastUpdated(selectedContest.updatedAt)}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 py-3">
                  <p className="text-sm text-muted-foreground">Updated By</p>
                  <p className="text-sm font-semibold text-foreground">Super Admin</p>
                </div>
              </div>
            </div>
          </Card>

          <div className="rounded-xl border border-amber-200/70 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-900">Important</p>
                <p className="mt-0.5 text-sm leading-relaxed text-amber-800">
                  Changes made to rules will be applicable to all participants immediately.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
