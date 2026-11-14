import { lazy, type ReactNode, useEffect, useMemo, useState, useRef } from 'react'

import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { AuthSessionStore } from '../../domain/services/AuthSessionStore'
import { createAuthController } from '../auth/createAuthController'
import AppLoader from '../../shared/ui/AppLoader'
import { hideAppSplash } from '../../shared/ui/axisSplash'
import { isLocalDevHost } from '../../shared/auth/isLocalDevHost'
import { handoffToTenantWorkspace, isTenantWorkspaceHost } from '../../shared/auth/tenantWorkspace'

const MeetGuestPage = lazy(() => import('../pages/meet/MeetGuestPage'))
const OnboardingFirstLoginGate = lazy(() => import('../components/profile/OnboardingFirstLoginGate'))

interface ProtectedRouteProps {
  children?: ReactNode
}

interface AuthResponseDto {
  access_token: string
  refresh_token: string
  token_type?: string
  expires_in?: number
  expires_at?: string
  must_change_password?: boolean
  cannot_skip_password_change?: boolean
}

function redirectToKeycloakSsoCheck(target: string): void {
  if (typeof window === 'undefined') {
    return
  }

  const params = new URLSearchParams()
  if (target.trim()) {
    params.set('redirect', target)
  }

  const query = params.toString()
  window.location.assign(query ? `/api/v1/auth/keycloak/sso-check?${query}` : '/api/v1/auth/keycloak/sso-check')
}

async function restoreSessionFromAuthCookies(sessionStore: AuthSessionStore): Promise<void> {
  if (sessionStore.getTokens()) {
    return
  }

  const response = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
    },
    credentials: 'include',
  })

  if (!response.ok) {
    return
  }

  const data = (await response.json()) as AuthResponseDto
  if (!data.access_token) {
    return
  }

  const expiresIn = data.expires_in && data.expires_in > 0 ? data.expires_in : 86400
  sessionStore.setTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token || '',
    tokenType: data.token_type || 'Bearer',
    expiresIn,
    expiresAt: data.expires_at || new Date(Date.now() + expiresIn * 1000).toISOString(),
    mustChangePassword: data.must_change_password,
    cannotSkipPasswordChange: data.cannot_skip_password_change,
  })
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const location = useLocation()
  const guestMeetingId = /^\/meet\/([a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})\/?$/i.exec(location.pathname)?.[1]?.toLowerCase()
  const { authController, sessionStore } = useMemo(() => createAuthController(), [])
  const [isChecking, setIsChecking] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [shouldRunSsoCheck, setShouldRunSsoCheck] = useState(false)
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false)
  const hasInjectedRef = useRef(false)


  useEffect(() => {
    let isCancelled = false
    let handoffStarted = false

    // Check for token in URL (for mobile/embedded integration)
    const searchParams = new URLSearchParams(location.search)
    const tokenFromUrl = searchParams.get('token') || searchParams.get('accessToken')
    const refreshTokenFromUrl = searchParams.get('refreshToken') || searchParams.get('refresh_token') || ''
    const tokenTypeFromUrl = searchParams.get('tokenType') || searchParams.get('token_type') || 'Bearer'
    const expiresInFromUrl = Number(searchParams.get('expiresIn') || searchParams.get('expires_in') || 86400)
    const expiresAtFromUrl = searchParams.get('expiresAt') || searchParams.get('expires_at') || ''

    const hasInjectedTokens = !!tokenFromUrl && !hasInjectedRef.current
    
    if (hasInjectedTokens) {
      hasInjectedRef.current = true
      try {
        const expiresIn = Number.isFinite(expiresInFromUrl) && expiresInFromUrl > 0 ? expiresInFromUrl : 86400
        const tokens = {
          accessToken: tokenFromUrl,
          refreshToken: refreshTokenFromUrl,
          tokenType: tokenTypeFromUrl,
          expiresIn,
          expiresAt: expiresAtFromUrl || new Date(Date.now() + expiresIn * 1000).toISOString(),
        }

        sessionStore.setTokens(tokens)

        // Clean up URL
        const params = new URLSearchParams(window.location.search)
        params.delete('token')
        params.delete('accessToken')
        params.delete('refreshToken')
        params.delete('refresh_token')
        params.delete('tokenType')
        params.delete('token_type')
        params.delete('expiresIn')
        params.delete('expires_in')
        params.delete('expiresAt')
        params.delete('expires_at')
        const newSearch = params.toString()
        const newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '')
        window.history.replaceState({}, '', newUrl)
      } catch (e) {
        console.error('Failed to inject token from URL', e)
      }
    }
    
    // Only try to restore from cookies if we don't have injected tokens
    const restorePromise = hasInjectedTokens 
      ? Promise.resolve() 
      : restoreSessionFromAuthCookies(sessionStore)

    restorePromise
      .catch((error: unknown) => {
        console.warn('Failed to restore session from auth cookies', error)
      })
      .then(() => authController.bootstrap(hasInjectedTokens))
      .then(async (model) => {
        if (!isCancelled) {
          const authenticated = hasInjectedTokens || model.isAuthenticated
          if (authenticated) {
            try {
              handoffStarted = await handoffToTenantWorkspace(sessionStore)
              if (handoffStarted || isCancelled) return
            } catch (error) {
              console.warn('Tenant workspace handoff unavailable', error)
            }
          }
          setIsAuthenticated(authenticated)
          setRequiresPasswordChange(Boolean(model.requiresOnboardingPasswordChange))
          if (!authenticated && !hasInjectedTokens && !sessionStore.getTokens()) {
            setShouldRunSsoCheck(true)
          }
        }
      })
      .finally(() => {
        if (!isCancelled && !handoffStarted) {
          setIsChecking(false)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [authController, sessionStore, location.pathname])

  const willRedirectToSso = !isChecking && !isAuthenticated && !guestMeetingId && shouldRunSsoCheck && !isLocalDevHost() && !isTenantWorkspaceHost()

  useEffect(() => {
    // Keep the splash while leaving for SSO; otherwise the app (or the login redirect) is ready.
    if (!isChecking && !willRedirectToSso) hideAppSplash()
  }, [isChecking, willRedirectToSso])

  if (isChecking) {
    return (
      <main className="min-h-screen w-full grid place-items-center px-4 py-6">
        <AppLoader />
      </main>
    )
  }

  if (!isAuthenticated) {
    if (guestMeetingId) return <MeetGuestPage key={guestMeetingId} meetingId={guestMeetingId} />
    const returnTo = `${location.pathname}${location.search}${location.hash}`
    if (shouldRunSsoCheck && !isLocalDevHost() && !isTenantWorkspaceHost()) {
      redirectToKeycloakSsoCheck(returnTo)
      return null
    }
    return <Navigate to="/login" replace state={{ from: returnTo }} />
  }

  if (requiresPasswordChange) {
    return <OnboardingFirstLoginGate
      sessionStore={sessionStore}
      onPasswordChanged={async () => {
        const model = await authController.bootstrap(true)
        setIsAuthenticated(model.isAuthenticated)
        if (model.requiresOnboardingPasswordChange) throw new Error()
        setRequiresPasswordChange(false)
      }}
      onLogout={() => {
        if (isLocalDevHost()) {
          void authController.logout().finally(() => window.location.assign(`${import.meta.env.BASE_URL}login`))
        } else {
          sessionStore.clearTokens()
          window.location.assign('/api/v1/auth/keycloak/logout')
        }
      }}
    />
  }

  return (
    <>
      {children ?? <Outlet />}
    </>
  )
}
