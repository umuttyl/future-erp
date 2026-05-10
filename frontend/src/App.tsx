import { Navigate, Route, Routes } from "react-router-dom";

import { NlpAssistantBubble } from "./components/NlpAssistantBubble";
import { RequireAuth } from "./components/RequireAuth";
import { AppShell } from "./layout/AppShell";
import AdminPage from "./pages/Admin";
import { AiAnalysisPage } from "./pages/AiAnalysis";
import { DashboardPage } from "./pages/Dashboard";
import { FinancePage } from "./pages/Finance";
import { HrPage } from "./pages/Hr";
import LoginPage from "./pages/Login";
import { SalesPage } from "./pages/Sales";
import SignupPage from "./pages/Signup";
import { StockPage } from "./pages/Stock";

function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="satis" element={<Navigate to="/sales" replace />} />
            <Route path="stok" element={<Navigate to="/stock" replace />} />
            <Route path="finans" element={<Navigate to="/finance" replace />} />
            <Route path="sales" element={<SalesPage />} />
            <Route path="stock" element={<StockPage />} />
            <Route path="finance" element={<FinancePage />} />
            <Route path="ai" element={<AiAnalysisPage />} />
            <Route path="hr" element={<HrPage />} />
            <Route path="admin" element={<AdminPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <NlpAssistantBubble />
    </>
  );
}

export default App;
