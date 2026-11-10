import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { i18n } from '../../../shared/i18n'
import { createAuthController } from '../../auth/createAuthController'
import { RestoreAuthCallbackSessionUseCase } from '../../../application/use-cases/auth/RestoreAuthCallbackSessionUseCase'
import { SsoE2eeBootstrapUseCase } from '../../../application/use-cases/auth/SsoE2eeBootstrapUseCase'
import { HttpAuthRepository } from '../../../infrastructure/repositories/HttpAuthRepository'
import { IndexedDbKeyStore } from '../../../infrastructure/storage/IndexedDbKeyStore'
import { WebDeviceSessionStore } from '../../../infrastructure/storage/WebDeviceSessionStore'
import { hideAppSplash, showAppSplash } from '../../../shared/ui/axisSplash'

const fallbackRedirect = '/'
const egovStartUrl = 'https://alem-workspace.gov.kz/api/v1/auth/egov/start?lang=ru'

function debugAuthStorageSnapshot(stage: string): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const cookieNames = document.cookie
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => item.split('=')[0])

    console.debug('[auth-callback]', stage, {
      route: `${window.location.pathname}${window.location.search}${window.location.hash}`,
      localStorageKeys: Object.keys(window.localStorage),
      sessionStorageKeys: Object.keys(window.sessionStorage),
      cookieNames,
    })
  } catch (error) {
    console.debug('[auth-callback]', stage, { debugError: error })
  }
}

function toRouterRedirect(value: string | null): string {
  const redirect = (value || '').trim()
  if (!redirect || redirect.startsWith('//')) {
    return fallbackRedirect
  }

  try {
    const parsed = redirect.startsWith('http')
      ? new URL(redirect)
      : new URL(redirect, window.location.origin)

    if (parsed.origin !== window.location.origin) {
      return fallbackRedirect
    }

    const path = parsed.pathname === '/web' ? '/web/' : parsed.pathname
    if (path === '/' || path === '/web/') {
      return fallbackRedirect
    }
    if (path.startsWith('/web/')) {
      return path.slice('/web'.length) + parsed.search + parsed.hash
    }
    if (path.startsWith('/')) {
      return path + parsed.search + parsed.hash
    }
  } catch {
    return fallbackRedirect
  }

  return fallbackRedirect
}

const EGOV_ERROR_CODES = [
  'EGOV_ACCESS_DENIED',
  'EGOV_INVALID_CALLBACK',
  'EGOV_INVALID_STATE',
  'EGOV_STATE_EXPIRED',
  'EGOV_SERVICE_UNAVAILABLE',
  'EGOV_USER_CONFLICT',
  'EGOV_IIN_MISSING',
  'EGOV_LEGAL_NOT_SUPPORTED',
  'EGOV_INVALID_GRANT',
  'EGOV_INVALID_CLIENT',
  'EGOV_REDIRECT_MISMATCH',
  'EGOV_INVALID_TOKEN',
  'EGOV_PROFILE_INCOMPLETE',
  'EGOV_IDP_ERROR',
] as const

type EgovErrorCode = (typeof EGOV_ERROR_CODES)[number]

const isEgovErrorCode = (code: string | null): code is EgovErrorCode =>
  Boolean(code) && (EGOV_ERROR_CODES as readonly string[]).includes(code as string)

function getEgovErrorMessage(code: string | null): string {
  return isEgovErrorCode(code) ? i18n.t(`auth:egov.${code}`) : i18n.t('auth:egov.default')
}

function decodeMessageParam(value: string | null): string {
  const raw = (value || '').trim()
  if (!raw) return ''

  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function normalizeErrorMessage(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''

  const duplicateTitle = 'Ошибка входа' // i18n-ignore
  if (trimmed.startsWith(`${duplicateTitle} ${duplicateTitle}`)) {
    return trimmed.replace(`${duplicateTitle} ${duplicateTitle}`, duplicateTitle).trim()
  }
  if (trimmed.startsWith(`${duplicateTitle}: ${duplicateTitle}`)) {
    return trimmed.replace(`${duplicateTitle}: ${duplicateTitle}`, duplicateTitle).trim()
  }
  return trimmed
}

export default function AuthCallbackPage() {
  const { t } = useTranslation(['auth', 'common'])
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { authController, sessionStore } = useMemo(() => createAuthController(), [])
  const [error, setError] = useState('')

  // The splash covers the whole sign-in hand-off; only an error needs this page's own UI.
  useEffect(() => {
    if (error) hideAppSplash()
    else showAppSplash(t('callback.finishing'))
  }, [error, t])

  useEffect(() => {
    let isCancelled = false
    const redirectTo = toRouterRedirect(searchParams.get('redirect'))
    debugAuthStorageSnapshot('before_hydrate')

    // Handle eGov (or other SSO) error redirects: ?login=error&error=EGOV_*&message=...
    const loginResult = searchParams.get('login')
    const errorCode = searchParams.get('error')
    const errorMessage = decodeMessageParam(searchParams.get('message'))
    if (loginResult === 'error') {
      const msg = normalizeErrorMessage(errorMessage) || getEgovErrorMessage(errorCode)
      setError(msg)
      return
    }

    // First hydrate localStorage from HttpOnly cookies (set by Keycloak/eGov callback),
    // THEN bootstrap the auth model — this prevents the "No refresh token" error.
    new RestoreAuthCallbackSessionUseCase(new HttpAuthRepository(), sessionStore).execute()
      .catch(() => {/* ignore, bootstrap will handle unauthenticated state */})
      .then(() => authController.bootstrap(true))
      .then(async (model) => {
        if (isCancelled) return
        debugAuthStorageSnapshot('after_bootstrap')
        if (model.isAuthenticated) {
          // Perform E2EE bootstrap for SSO session
          const e2eeBootstrap = new SsoE2eeBootstrapUseCase(
            new HttpAuthRepository(),
            sessionStore,
            new IndexedDbKeyStore(),
            new WebDeviceSessionStore(),
          )
          await e2eeBootstrap.execute()
          navigate(redirectTo, { replace: true })
          return
        }
        navigate('/login', { replace: true })
      })
      .catch(() => {
        if (isCancelled) return
        debugAuthStorageSnapshot('bootstrap_failed')
        setError(i18n.t('auth:callback.failed'))
        navigate('/login', { replace: true })
      })

    return () => {
      isCancelled = true
    }
  }, [authController, sessionStore, navigate, searchParams])

  return (
    <main className="min-h-screen w-full grid place-items-center px-4 py-6">
      <section className="w-full max-w-115 rounded-2xl border border-[#e5e7eb] bg-white p-8 shadow-[0_8px_20px_rgba(17,24,39,0.06)] flex flex-col items-center gap-5">
        {error ? (
          <>
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-50 border border-red-100">
              <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <div className="text-center">
              <h1 className="m-0 text-xl font-bold text-[#1c1c1e] mb-2">{t('callback.errorTitle')}</h1>
              <p className="text-sm text-[#6b7280] leading-relaxed">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                window.location.href = egovStartUrl
              }}
              className="mt-2 h-11 w-full max-w-72 rounded-lg bg-[#2458D3] text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-[#082EA8] active:scale-[0.99]"
            >
              {t('callback.retry')}
            </button>
          </>
        ) : (
          <>
            <svg className="animate-spin h-9 w-9 text-[#2458D3]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <div className="text-center">
              <h1 className="m-0 text-xl font-bold text-[#1c1c1e] mb-1">{t('callback.finishing')}</h1>
              <p className="text-sm text-[#6b7280]">{t('callback.wait')}</p>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
