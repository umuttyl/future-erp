import { Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from './layout/AppShell'
import { NlpAssistantBubble } from './components/NlpAssistantBubble'
import { AiAnalysisPage } from './pages/AiAnalysis'
import { DashboardPage } from './pages/Dashboard'
import { FinancePage } from './pages/Finance'
import { SalesPage } from './pages/Sales'
import { StockPage } from './pages/Stock'

function App() {
  return (
    <>
      <AppShell>
        <Routes>
          <Route index element={<DashboardPage />} />
          <Route path="/sales" element={<SalesPage />} />
          <Route path="/stock" element={<StockPage />} />
          <Route path="/finance" element={<FinancePage />} />
          <Route path="/ai" element={<AiAnalysisPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
      <NlpAssistantBubble />
    </>
  )
}

export default App
