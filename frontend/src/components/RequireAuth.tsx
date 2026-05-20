import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'

export function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        Yükleniyor…
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  // Manager ilk girişte onboarding tamamlanmadıysa wizard'a yönlendir.
  const isOnboardingRoute = location.pathname === '/onboarding'
  if (user.role === 'manager' && !user.onboarding_completed && !isOnboardingRoute) {
    return <Navigate to="/onboarding" replace />
  }

  return <Outlet />
}
