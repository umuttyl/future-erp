import { Navigate, Route, Routes } from 'react-router-dom'

import { RequireAuth } from './components/RequireAuth'
import { NlpAssistantBubble } from './components/NlpAssistantBubble'
import { AppShell } from './layout/AppShell'
import { AiAnalysisPage } from './pages/AiAnalysis'
import AdminPage from './pages/Admin'
import { DashboardPage } from './pages/Dashboard'
import { FinancePage } from './pages/Finance'
import LoginPage from './pages/Login'
import SignupPage from './pages/Signup'
import { SalesPage } from './pages/Sales'
import { StockPage } from './pages/Stock'

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
            <Route path="sales" element={<SalesPage />} />
            <Route path="stock" element={<StockPage />} />
            <Route path="finance" element={<FinancePage />} />
            <Route path="ai" element={<AiAnalysisPage />} />
            <Route path="admin" element={<AdminPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <NlpAssistantBubble />
    </>
  )
}

export default App
