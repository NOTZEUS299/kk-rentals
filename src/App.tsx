import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { I18nProvider } from "@/i18n";
import { SessionProvider } from "@/session";
import { AppLayout } from "@/layouts/app-layout";
import { AuthLayout } from "@/layouts/auth-layout";
import { ListSkeleton } from "@/components/ui";
import { ToastProvider } from "@/components/toast";

// route-level code splitting keeps the initial bundle small
const LoginPage = lazy(() => import("@/pages/auth/login"));
const OnboardingPage = lazy(() => import("@/pages/onboarding"));
const DashboardPage = lazy(() => import("@/pages/dashboard"));
const PartiesPage = lazy(() => import("@/pages/parties/list"));
const NewPartyPage = lazy(() => import("@/pages/parties/new"));
const EditPartyPage = lazy(() => import("@/pages/parties/edit"));
const ItemsPage = lazy(() => import("@/pages/items/list"));
const NewItemPage = lazy(() => import("@/pages/items/new"));
const EditItemPage = lazy(() => import("@/pages/items/edit"));
const ChallansPage = lazy(() => import("@/pages/challans/list"));
const NewChallanPage = lazy(() => import("@/pages/challans/new"));
const ChallanDetailPage = lazy(() => import("@/pages/challans/detail"));
const DriversPage = lazy(() => import("@/pages/drivers/list"));
const NewDriverPage = lazy(() => import("@/pages/drivers/new"));
const EditDriverPage = lazy(() => import("@/pages/drivers/edit"));
const BillingPage = lazy(() => import("@/pages/billing/list"));
const LedgerPage = lazy(() => import("@/pages/billing/ledger"));
const ReportsPage = lazy(() => import("@/pages/reports/index"));
const ItemLedgerPage = lazy(() => import("@/pages/reports/item-ledger"));
const DayBookPage = lazy(() => import("@/pages/reports/day-book"));
const OutstandingPage = lazy(() => import("@/pages/reports/outstanding"));
const DueOnRentPage = lazy(() => import("@/pages/reports/due-on-rent"));
const MonthlyActivityPage = lazy(
  () => import("@/pages/reports/monthly-activity"),
);

export default function App() {
  return (
    <I18nProvider>
      <ToastProvider>
      <SessionProvider>
        <BrowserRouter>
          <Suspense fallback={<div className="mx-auto w-full max-w-4xl px-4 pt-18"><ListSkeleton /></div>}>
            <Routes>
              <Route element={<AuthLayout />}>
                <Route path="/login" element={<LoginPage />} />
              </Route>
              <Route path="/onboarding" element={<OnboardingPage />} />
              <Route element={<AppLayout />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/parties" element={<PartiesPage />} />
                <Route path="/parties/new" element={<NewPartyPage />} />
                <Route path="/parties/:id" element={<EditPartyPage />} />
                <Route path="/items" element={<ItemsPage />} />
                <Route path="/items/new" element={<NewItemPage />} />
                <Route path="/items/:id" element={<EditItemPage />} />
                <Route path="/challans" element={<ChallansPage />} />
                <Route path="/challans/new" element={<NewChallanPage />} />
                <Route path="/challans/:id" element={<ChallanDetailPage />} />
                <Route path="/drivers" element={<DriversPage />} />
                <Route path="/drivers/new" element={<NewDriverPage />} />
                <Route path="/drivers/:id" element={<EditDriverPage />} />
                <Route path="/billing" element={<BillingPage />} />
                <Route path="/billing/:partyId" element={<LedgerPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/reports/item-ledger" element={<ItemLedgerPage />} />
                <Route path="/reports/day-book" element={<DayBookPage />} />
                <Route
                  path="/reports/outstanding"
                  element={<OutstandingPage />}
                />
                <Route
                  path="/reports/due-on-rent"
                  element={<DueOnRentPage />}
                />
                <Route
                  path="/reports/monthly-activity"
                  element={<MonthlyActivityPage />}
                />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </SessionProvider>
      </ToastProvider>
    </I18nProvider>
  );
}
