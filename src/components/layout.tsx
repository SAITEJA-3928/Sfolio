import * as React from "react";
import { Link, useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  ArrowRightLeft,
  HandCoins,
  Bell,
  BarChart3,
  LogOut,
  Briefcase,
  Wallet,
  LayoutGrid,
  Menu,
  X,
  HelpCircle,
  Gift,
  UserPlus,
  CheckCheck,
  FileText,
  Share2,
  Trophy,
  Ticket,
} from "lucide-react";
import logo from "@/assets/logo.png";
import { cn } from "@/lib/utils";
import { useRole, type Role } from "@/context/role";
import {
  getUserDisplayName,
  getUserInitials,
  getUserRoleLabel,
  useAuth,
} from "@/context/auth";
import { customFetch } from "@/lib/custom-fetch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LiveMetalPricesBar } from "@/components/layout/LiveMetalPricesBar";
const ADMIN_NAV = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/" },
  { icon: Users, label: "User Management", href: "/users" },
  { icon: ArrowRightLeft, label: "Transactions", href: "/transactions" },
  { icon: HandCoins, label: "Sell Transactions", href: "/selltransactions" },
  { icon: Briefcase, label: "Gifting Operations", href: "/gifts" },
  { icon: Wallet, label: "Holdings", href: "/holdings" },
  { icon: CheckCheck, label: "Settlement", href: "/settlement" },
  { icon: Trophy, label: "Contests", href: "/contests" },
  { icon: FileText, label: "Augmont", href: "/augmont" },
  { icon: BarChart3, label: "Reports", href: "/reports" },
  { icon: Bell, label: "Notifications", href: "/notifications/create" },
  { icon: UserPlus, label: "Create Admin", href: "/createAdmin" },
  { icon: Ticket, label: "Vouchers", href: "/vouchers" },
  { icon: Gift, label: "Offer Users", href: "/offer-users" },
  { icon: Share2, label: "Referrals", href: "/referrals" },
  { icon: Users, label: "Account Deletion Management ", href: "/deleteusers" },
  { icon: HelpCircle, label: "FAQ ", href: "/faqQuestions" },


];

const CORPORATE_NAV = [
  { icon: LayoutGrid, label: "Dashboard", href: "/corporate" },
  { icon: Briefcase, label: "Campaigns", href: "/corporate/campaigns" },
  { icon: Wallet, label: "Reports", href: "/corporate/reports" },
  { icon: Ticket, label: "Vouchers", href: "/corporate/vouchers" },
];

const MARKETING_NAV = [
  { icon: Bell, label: "Notifications", href: "/notifications" },
];

const ROLE_HOME: Record<Role, string> = {
  admin: "/",
  corporate: "/corporate",
  marketing: "/notifications",
};
const SIDEBAR_SCROLL_STORAGE_KEY = "gfolio-admin:sidebar-scroll";

const MOCK_ALERTS = [
  {
    id: "1",
    type: "high_value_transaction",
    message: "Large withdrawal request of Rs 5,00,000 pending approval",
    severity: "warning",
    timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  },
  {
    id: "2",
    type: "failed_transaction",
    message: "Payment gateway integration experienced 5 timeouts",
    severity: "critical",
    timestamp: new Date(Date.now() - 65 * 60 * 1000).toISOString(),
  },
  {
    id: "3",
    type: "kyc_pending",
    message: "127 KYC verifications pending for more than 48 hours",
    severity: "warning",
    timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "4",
    type: "settlement",
    message: "Settlement of Rs 23,40,000 is pending beyond SLA",
    severity: "critical",
    timestamp: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
  },
];

const ALERT_ACTIONS: Record<string, string> = {
  high_value_transaction: "Review Transaction",
  failed_transaction: "View Gateway Logs",
  kyc_pending: "Go to KYC Queue",
  settlement: "View Settlement",
};

const ALERT_ROUTES: Record<string, string> = {
  high_value_transaction: "/transactions",
  failed_transaction: "/transactions",
  kyc_pending: "/users",
  settlement: "/settlement",
};

function timeAgo(timestamp: string): string {
  const now = Date.now();
  const past = new Date(timestamp).getTime();
  const diffMs = now - past;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
}

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const isMobile = useIsMobile();
  const [location] = useLocation();
  const [, navigate] = useLocation();
  const { role, unlockRole } = useRole();
  const { user, logout } = useAuth();
  const navRef = React.useRef<HTMLElement | null>(null);
  const navItems = role === "admin" ? ADMIN_NAV : role === "marketing" ? MARKETING_NAV : CORPORATE_NAV;
  const displayName = getUserDisplayName(
    user,
    role === "admin"
      ? "Admin User"
      : role === "marketing"
        ? "Notification User"
        : "Corporate User",
  );

  const userInitials = getUserInitials(
    displayName,
    role === "admin"
      ? "SA"
      : role === "marketing"
        ? "NU"
        : "CA"
  );
  const userLabel = getUserRoleLabel(user?.role, role);
  const userAvatarStyle =
    role === "admin"
      ? { background: "linear-gradient(135deg, hsl(152,69%,35%), hsl(38,92%,50%))" }
      : role === "marketing"
        ? { background: "linear-gradient(135deg, hsl(221,70%,50%), hsl(262,70%,55%))" }
        : { background: "linear-gradient(135deg, hsl(221,70%,50%), hsl(262,70%,55%))" };
  const scrollStorageKey = `${SIDEBAR_SCROLL_STORAGE_KEY}:${role}`;

  React.useEffect(() => {
    if (isMobile) return;
    const nav = navRef.current;
    if (!nav) return;

    const savedScrollTop = window.sessionStorage.getItem(scrollStorageKey);
    if (!savedScrollTop) return;

    nav.scrollTop = Number(savedScrollTop);
  }, [isMobile, scrollStorageKey]);

  const saveSidebarScroll = React.useCallback(() => {
    if (isMobile) return;
    const nav = navRef.current;
    if (!nav) return;

    window.sessionStorage.setItem(scrollStorageKey, String(nav.scrollTop));
  }, [isMobile, scrollStorageKey]);

  return (
    <div className="w-64 h-full bg-white border-r border-border flex flex-col">
      <div className="px-4 py-3 flex items-center justify-between border-b border-border">

        {/* LOGO */}
        <Link href={ROLE_HOME[role]} className="flex items-center">
          <div className="h-8 flex items-center">
            <img src={logo} alt="Gfolio logo" className="h-full w-auto object-contain" />
          </div>
        </Link>

        <button
          onClick={onClose}
          className="p-1 rounded-md hover:bg-muted transition lg:hidden"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>

      </div>

      <nav
        ref={navRef}
        className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto"
        onScroll={saveSidebarScroll}
      >
        <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {role === "admin"
            ? "Admin Portal"
            : role === "marketing"
              ? "Marketing Portal"
              : "Corporate Portal"}
        </p>
        {navItems.map((item) => {
          const isExactMatch = location === item.href;
          const isNestedMatch =
            item.href !== "/" &&
            item.href !== "/corporate" &&
            location.startsWith(`${item.href}/`) &&
            !(item.href === "/transactions" && location.startsWith("/selltransactions"));
          const isActive = isExactMatch || isNestedMatch;

          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => {
                saveSidebarScroll();
                onClose?.();
              }}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group",
                isActive ? "sidebar-active font-semibold" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon
                className={cn(
                  "flex-shrink-0",
                  isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                )}
                style={{ width: "1.1rem", height: "1.1rem" }}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 mt-auto border-t border-border space-y-1">
        <div className="flex items-center gap-3 p-3 bg-muted rounded-xl border border-border">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={userAvatarStyle}
          >
            {userInitials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate" title={displayName}>
              {displayName}
            </p>
            <p className="text-xs font-medium truncate" style={{ color: "hsl(152,69%,35%)" }}>
              {userLabel}
            </p>
          </div>
          <button
            className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
            onClick={async () => {
              try {
                await customFetch("/auth/logout", { method: "POST" });
              } catch { }
              unlockRole();
              logout();
              navigate("/login", { replace: true });
            }}
            type="button"
            aria-label="Logout"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function Header({ title, onMenuClick }: { title: string; onMenuClick: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex flex-col gap-2 border-b border-border bg-white/90 px-3 py-2 shadow-sm backdrop-blur-xl sm:px-4 md:h-20 md:flex-row md:items-center md:gap-3 md:py-0">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button
          className="p-1 lg:hidden"
          onClick={onMenuClick}
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="min-w-0 truncate text-sm font-semibold">{title}</h1>
        <Bell className="ml-auto h-5 w-5 shrink-0 md:hidden" />
      </div>

      <div className="flex w-full min-w-0 items-center gap-3 md:ml-auto md:w-auto">
        <LiveMetalPricesBar />
        <Bell className="hidden h-5 w-5 shrink-0 md:block" />
      </div>
    </header>
  );
}

export function Layout({ children, title }: { children: React.ReactNode; title: string }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="h-screen bg-background text-foreground flex overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block overflow-x-hidden">
        <Sidebar />
      </div>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex lg:hidden">

            <motion.div
              className="fixed inset-0 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", ease: "easeOut", duration: 0.25 }}
              className="relative w-64 bg-white h-full shadow-lg z-50 flex flex-col"
            >
              {/* SIDEBAR CONTENT */}
              <div className="flex-1 overflow-y-auto">
                <Sidebar onClose={() => setOpen(false)} />
              </div>
            </motion.div>

          </div>
        )}
      </AnimatePresence>

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {/* Pass control to Header */}
        <Header title={title} onMenuClick={() => setOpen(true)} />

        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
