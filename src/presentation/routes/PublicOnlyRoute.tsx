import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { createAuthController } from '../auth/createAuthController'
import AppLoader from '../../shared/ui/AppLoader'
import { hideAppSplash } from '../../shared/ui/axisSplash'

interface PublicOnlyRouteProps {
  children?: ReactNode
}

export default function PublicOnlyRoute({ children }: PublicOnlyRouteProps) {
  const location = useLocation()
  const requested = (location.state as { from?: unknown } | null)?.from
  const redirect = typeof requested === 'string' && /^\/join(?:#|$)/.test(requested) ? requested : '/main/dashboard'
  const { authController } = useMemo(() => createAuthController(), [])
  const [isChecking, setIsChecking] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    let isCancelled = false

    authController
      .bootstrap()
      .then((model) => {
        if (!isCancelled) {
          setIsAuthenticated(model.isAuthenticated)
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsChecking(false)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [authController])

  useEffect(() => {
    // Signed-in users go on to the workspace, which hides the splash itself.
    if (!isChecking && !isAuthenticated) hideAppSplash()
  }, [isChecking, isAuthenticated])

  if (isChecking) {
    return (
      <main className="min-h-screen w-full grid place-items-center px-4 py-6">
        <AppLoader />
      </main>
    )
  }

  if (isAuthenticated) {
    return <Navigate to={redirect} replace />
  }

  return children ?? <Outlet />
}
