import * as React from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RoleProvider, useRole, normalizeRole, type Role } from "@/context/role";
import { AuthProvider, useAuth } from "@/context/auth";
import NotFound from "@/pages/not-found";

import Dashboard from "@/pages/dashboard";
import CorporateDashboard from "@/pages/corporate-dashboard";
import Login from "@/pages/login";
import ForgotPassword from "@/pages/forgotpassword";
import ResetPassword from "@/pages/reset-password";
import CreatePassword from "@/pages/create-password";
import UsersList from "@/pages/users";
import UserDetail from "@/pages/user-detail";
import GiftsList from "@/pages/gifts";
import CreateAdmin from "@/pages/create-admin";
import TransactionsList from "@/pages/transactions";
import SellTransactionsList from "@/pages/sell-transactions";
import CampaignsList from "@/pages/campaigns";
import CorporateWallet from "@/pages/wallet";
import Reports from "@/pages/reports";
import CreateCampaign from "@/pages/create-campaign";
import DeleteedUsers from "@/pages/deleteusers";
import CreateNotification from "@/pages/create-notification";
import NotificationsList from "@/pages/notifications";
import FaqQuestions from "@/pages/faqQuestions";
import OfferUsersPage from "@/pages/offer-users";
import HoldingsPage from "@/pages/holdings";
import SettlementPage from "@/pages/settlement";
import Augmont from "@/pages/augmont";
import ReferralsPage from "@/pages/referrals";
import ContestDashboard from "@/pages/contest-dashboard";
import CreateContest from "@/pages/create-contest";
import ViewLeaderboard from "@/pages/contest-leaderboard";
import ManageRules from "@/pages/contest-rules";
import VouchersPage from "@/pages/vouchers";
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

const ROLE_HOME: Record<Role, string> = {
  admin: "/",
  corporate: "/corporate",
  marketing: "/notifications",
};
function ProtectedRoute({
 component: Component,
  roles,
}: { component: React.ComponentType;
  roles?: readonly Role[];
}) {
  const { isAuthenticated } = useAuth();
  const { role } = useRole();
  const [, navigate] = useLocation();
  const isRoleAllowed = !roles || roles.includes(role);

  React.useEffect(() => {
    if (!isAuthenticated) {
navigate("/login", { replace: true });
      return;
    }
    if (!isRoleAllowed) {
      navigate(ROLE_HOME[role], { replace: true });
    }
  }, [isAuthenticated, isRoleAllowed, navigate, role]);

  if (!isAuthenticated || !isRoleAllowed) return null;
  return <Component />;
}

function withAuthRoute(Component: React.ComponentType, roles?: readonly Role[]) {
  function AuthenticatedRoute() {
    return <ProtectedRoute component={Component} roles={roles} />;
  }

  return AuthenticatedRoute;
}

const DashboardPage = withAuthRoute(Dashboard, ["admin"]);
const UsersListPage = withAuthRoute(UsersList, ["admin"]);
const UserDetailPage = withAuthRoute(UserDetail, ["admin"]);
const GiftsListPage = withAuthRoute(GiftsList, ["admin"]);
const CreateAdminPage = withAuthRoute(CreateAdmin, ["admin"]);
const SellTransactionsPage = withAuthRoute(SellTransactionsList, ["admin"]);
const TransactionsListPage = withAuthRoute(TransactionsList, ["admin"]);
const CreateNotificationPage = withAuthRoute(CreateNotification, ["admin","marketing"]);
const NotificationsRoutePage = withAuthRoute(NotificationsList, ["marketing"]);
const ReportsPage = withAuthRoute(Reports, ["admin"]);
const DeleteedUsersPage = withAuthRoute(DeleteedUsers, ["admin"]);
const FaqQuestionsPage = withAuthRoute(FaqQuestions, ["admin"]);
const OfferUsersPageRoute = withAuthRoute(OfferUsersPage, ["admin"]);
const HoldingsPageRoute = withAuthRoute(HoldingsPage, ["admin"]);
const SettlementPageRoute = withAuthRoute(SettlementPage, ["admin"]);
const AugmontPageRoute = withAuthRoute(Augmont, ["admin"]);
const ReferralsPageRoute = withAuthRoute(ReferralsPage, ["admin"]);
const ContestDashboardPage = withAuthRoute(ContestDashboard, ["admin"]);
const CreateContestPage = withAuthRoute(CreateContest, ["admin"]);
const ViewLeaderboardPage = withAuthRoute(ViewLeaderboard, ["admin"]);
const ManageRulesPage = withAuthRoute(ManageRules, ["admin"]);
const AdminVouchersPageRoute = withAuthRoute(VouchersPage, ["admin"]);
const CreateCampaignAdminPage = withAuthRoute(CreateCampaign, ["admin"]);

const CorporateDashboardPage = withAuthRoute(CorporateDashboard, ["corporate"]);
const CampaignsListPage = withAuthRoute(CampaignsList, ["corporate"]);
const CorporateWalletPage = withAuthRoute(CorporateWallet, ["corporate"]);
const CorporateVouchersPageRoute = withAuthRoute(VouchersPage, ["corporate"]);
const CreateCampaignCorporatePage = withAuthRoute(CreateCampaign, ["corporate"]);

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/forgotpassword" component={ForgotPassword} />
      <Route path="/resetpassword" component={ResetPassword} />
      <Route path="/createpassword" component={CreatePassword} />
      <Route path="/" component={DashboardPage} />
      <Route path="/users" component={UsersListPage} />
      <Route path="/users/:id" component={UserDetailPage} />
      <Route path="/gifts" component={GiftsListPage} />
      <Route path="/createAdmin" component={CreateAdminPage} />
      <Route path="/vouchers" component={AdminVouchersPageRoute} />
      <Route path="/selltransactions" component={SellTransactionsPage} />
      <Route path="/transactions" component={TransactionsListPage} />
      <Route path="/corporate" component={CorporateDashboardPage} />
      <Route path="/corporate/campaigns" component={CampaignsListPage} />
      <Route path="/corporate/reports" component={CorporateWalletPage} />
      <Route path="/corporate/vouchers" component={CorporateVouchersPageRoute} />
      <Route path="/notifications" component={NotificationsRoutePage} />
      <Route path="/notifications/create" component={CreateNotificationPage} />
      <Route path="/reports" component={ReportsPage} />
      <Route path="/corporate/campaigns/create" component={CreateCampaignCorporatePage} />
      <Route path="/campaigns/create" component={CreateCampaignAdminPage} />
      <Route path="/deleteusers" component={DeleteedUsersPage} />
      <Route path="/faqQuestions" component={FaqQuestionsPage} />
      <Route path="/offer-users" component={OfferUsersPageRoute} />
      <Route path="/holdings" component={HoldingsPageRoute} />
      <Route path="/settlement" component={SettlementPageRoute} />
      <Route path="/augmont" component={AugmontPageRoute} />
      <Route path="/referrals" component={ReferralsPageRoute} />
      <Route path="/contests" component={ContestDashboardPage} />
      <Route path="/contests/create" component={CreateContestPage} />
      <Route path="/contests/leaderboard" component={ViewLeaderboardPage} />
      <Route path="/contests/rules" component={ManageRulesPage} />
      <Route path="/contests/:contestId" component={ContestDashboardPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function UnauthorizedHandler() {
  const { logout } = useAuth();
  const { unlockRole } = useRole();
  const [, navigate] = useLocation();

  React.useEffect(() => {
    const handleUnauthorized = () => {
      try {
        sessionStorage.removeItem("gfolio-admin:selected-user");
      } catch {}
      unlockRole();
      logout();
      navigate("/login", { replace: true });
    };

    window.addEventListener("gfolio:unauthorized", handleUnauthorized as EventListener);
    return () =>
      window.removeEventListener("gfolio:unauthorized", handleUnauthorized as EventListener);
  }, [logout, navigate, unlockRole]);

  return null;
}

function SyncRoleFromSession() {
  const { isAuthenticated, user } = useAuth();
  const { role, lockRole } = useRole();

  React.useEffect(() => {
    if (!isAuthenticated) return;

    const nextRole = normalizeRole(user?.role);
    if (!nextRole || nextRole === role) return;

    lockRole(nextRole);
  }, [isAuthenticated, lockRole, role, user?.role]);

  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <RoleProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <UnauthorizedHandler />
              <SyncRoleFromSession />
              <Router />
            </WouterRouter>
          </RoleProvider>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
