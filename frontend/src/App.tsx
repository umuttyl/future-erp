import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { ErrorBoundary } from "./components/ErrorBoundary";
import { NlpAssistantBubble } from "./components/NlpAssistantBubble";
import { RequireAuth } from "./components/RequireAuth";
import { LoadingState } from "./components/ui/LoadingState";
import { AppShell } from "./layout/AppShell";

// Lazy-loaded pages — each gets its own JS chunk
const LoginPage      = lazy(() => import("./pages/Login"));
const SignupPage      = lazy(() => import("./pages/Signup"));
const OnboardingPage  = lazy(() => import("./pages/Onboarding"));
const DashboardPage   = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.DashboardPage })));
const SalesPage       = lazy(() => import("./pages/Sales").then((m) => ({ default: m.SalesPage })));
const StockPage       = lazy(() => import("./pages/Stock").then((m) => ({ default: m.StockPage })));
const FinancePage     = lazy(() => import("./pages/Finance").then((m) => ({ default: m.FinancePage })));
const CustomersPage   = lazy(() => import("./pages/Customers").then((m) => ({ default: m.CustomersPage })));
const SuppliersPage   = lazy(() => import("./pages/Suppliers").then((m) => ({ default: m.SuppliersPage })));
const OrdersPage      = lazy(() => import("./pages/Orders").then((m) => ({ default: m.OrdersPage })));
const AiAnalysisPage  = lazy(() => import("./pages/AiAnalysis").then((m) => ({ default: m.AiAnalysisPage })));
const HrPage          = lazy(() => import("./pages/Hr").then((m) => ({ default: m.HrPage })));
const SettingsPage    = lazy(() => import("./pages/Settings"));
const AdminPage       = lazy(() => import("./pages/Admin"));

function App() {
  return (
    <>
      <ErrorBoundary>
      <Suspense fallback={<LoadingState label={false} />}>
        <Routes>
          <Route path="/login"  element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route element={<RequireAuth />}>
            {/* Onboarding sihirbazi — tam ekran, sidebar yok. */}
            <Route path="onboarding" element={<OnboardingPage />} />

            {/* Tüm korumalı sayfalar */}
            <Route element={<AppShell />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard"  element={<DashboardPage />} />
              <Route path="satis"      element={<Navigate to="/sales"    replace />} />
              <Route path="stok"       element={<Navigate to="/stock"    replace />} />
              <Route path="finans"     element={<Navigate to="/finance"  replace />} />
              <Route path="sales"      element={<SalesPage />} />
              <Route path="stock"      element={<StockPage />} />
              <Route path="finance"    element={<FinancePage />} />
              <Route path="customers"  element={<CustomersPage />} />
              <Route path="suppliers"  element={<SuppliersPage />} />
              <Route path="orders"     element={<OrdersPage />} />
              <Route path="ai"         element={<AiAnalysisPage />} />
              <Route path="hr"         element={<HrPage />} />
              <Route path="settings"   element={<SettingsPage />} />
              <Route path="admin"      element={<AdminPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      </ErrorBoundary>
      <NlpAssistantBubble />
    </>
  );
}

export default App;
