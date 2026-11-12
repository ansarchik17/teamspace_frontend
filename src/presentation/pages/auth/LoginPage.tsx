import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { hideAppSplash, showAppSplash } from '../../../shared/ui/axisSplash'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LoginUseCase } from '../../../application/use-cases/auth/LoginUseCase'
import { HttpAuthRepository } from '../../../infrastructure/repositories/HttpAuthRepository'
import { consumeAuthFlashNotice, type AuthFlashNotice } from '../../../shared/auth/authFlashNotice'
import { isTenantWorkspaceHost, platformLoginUrl } from '../../../shared/auth/tenantWorkspace'
import { corporateLoginAvailable, loginOrganization } from '../../../shared/auth/corporateLogin'
import { ArrowUp, CircleAlert, ClipboardList, Headset, Info, PanelsTopLeft, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react'
import EdoIcon from '../../../shared/ui/icons/EdoIcon'
import { getErrorMessage } from '../../../shared/utils/getErrorMessage'
import { createAuthController } from '../../auth/createAuthController'
import { LoginForm, type PasswordLoginSubmitOptions } from '../../components/auth/LoginForm'
import type { AuthViewModel } from '../../view-models/AuthViewModel'
import '@fontsource/inter/800.css'
import './LoginPage.css'
import LanguageSwitcher from '../../../shared/ui/LanguageSwitcher'

const emptyModel: AuthViewModel = {
  isAuthenticated: false,
  userId: null,
  email: '',
  name: '',
  expiresInSeconds: 0,
  role: '',
  avatarUrl: '',
  language: null,
}

const heroPrompts = ['first', 'second', 'third', 'fourth'] as const

const ecosystemApps = [
  { key: 'whiteboard', label: 'Whiteboard', icon: PanelsTopLeft },
  { key: 'ai', label: 'AI', icon: Sparkles },
  { key: 'iform', label: 'iForm', icon: ClipboardList },
  { key: 'edo', label: '', icon: EdoIcon },
  { key: 'senimdesk', label: 'SenimDesk', icon: Headset },
  { key: 'beketos', label: 'BeketOS', icon: ShieldCheck },
] as const

function TypingPrompt({ prompts }: { prompts: string[] }) {
  const [state, setState] = useState({ index: 0, length: 0, deleting: false })
  const reducedMotion = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, [])
  const current = prompts[state.index % prompts.length] ?? ''

  useEffect(() => {
    if (reducedMotion || !current) return
    const typed = state.length >= current.length
    const delay = state.deleting ? 24 : typed ? 1800 : 52
    const timer = window.setTimeout(() => {
      setState((value) => {
        if (value.deleting) {
          return value.length <= 0 ? { index: value.index + 1, length: 0, deleting: false } : { ...value, length: value.length - 1 }
        }
        return value.length >= current.length ? { ...value, deleting: true } : { ...value, length: value.length + 1 }
      })
    }, delay)
    return () => window.clearTimeout(timer)
  }, [current, reducedMotion, state])

  return (
    <span className="axis-login-typing">
      <span className="sr-only">{prompts[0]}</span>
      <span aria-hidden="true">{reducedMotion ? prompts[0] : current.slice(0, state.length)}</span>
      <span className="axis-login-caret" aria-hidden="true" />
    </span>
  )
}

const noticeIcon = { info: Info, warning: TriangleAlert, error: CircleAlert } as const

const noticeClass: Record<AuthFlashNotice['kind'], string> = {
  info: 'is-info',
  warning: 'is-warning',
  error: 'is-error',
}

export default function LoginPage() {
  const { t } = useTranslation(['auth', 'common', 'recovery'])
  const tenantLoginHost = isTenantWorkspaceHost()
  const navigate = useNavigate()
  const location = useLocation()
  const [, setModel] = useState<AuthViewModel>(emptyModel)
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [isLoadingLogin, setIsLoadingLogin] = useState(false)
  const [loginProgressLabel, setLoginProgressLabel] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<AuthFlashNotice | null>(() => consumeAuthFlashNotice())
  const requestedRedirectTo = (location.state as { from?: string } | null)?.from
  const redirectTo = requestedRedirectTo ?? '/main/dashboard'
  const organizationSlug = useMemo(() => new URLSearchParams(location.search).get('organization')?.trim() ?? '', [location.search])
  const [loginHint, setLoginHint] = useState('')
  const [corporateLogin, setCorporateLogin] = useState<{ organization: string; available: boolean } | null>(null)
  const corporateOrganization = loginOrganization(organizationSlug, loginHint, import.meta.env.VITE_TENANT_BASE_DOMAIN || 'teamspace.kz')
  const canUseCorporateLogin = !tenantLoginHost && corporateOrganization !== null && corporateLogin?.organization === corporateOrganization && corporateLogin.available
  const embeddedMessengerRedirectStartedRef = useRef(false)
  const { authController, sessionStore } = useMemo(() => createAuthController(), [])
  const passwordLoginUseCase = useMemo(() => new LoginUseCase(new HttpAuthRepository(), sessionStore), [sessionStore])

  useEffect(() => {
    if (tenantLoginHost) window.location.replace(platformLoginUrl())
  }, [tenantLoginHost])

  useEffect(() => {
    if (tenantLoginHost) return
    let isCancelled = false
    authController.bootstrap().then((nextModel) => {
      if (!isCancelled) {
        setModel(nextModel)
        if (nextModel.isAuthenticated) navigate(redirectTo, { replace: true })
      }
    }).finally(() => {
      if (!isCancelled) setIsBootstrapping(false)
    })
    return () => { isCancelled = true }
  }, [authController, navigate, redirectTo, tenantLoginHost])

  useEffect(() => {
    if (tenantLoginHost || !corporateOrganization) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void corporateLoginAvailable(corporateOrganization, controller.signal).then(available => {
        if (!controller.signal.aborted) setCorporateLogin({ organization: corporateOrganization, available })
      })
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [corporateOrganization, tenantLoginHost])

  const handlePasswordLogin = useCallback(async (login: string, password: string, _options: PasswordLoginSubmitOptions) => {
    setError('')
    setNotice(null)
    if (!login || !password) {
      setError(t('login.required'))
      return
    }
    try {
      setIsLoadingLogin(true)
      setLoginProgressLabel(t('login.signingIn'))
      await passwordLoginUseCase.execute(login, password)
      showAppSplash(t('login.openingWorkspace'))
      const nextModel = await authController.bootstrap()
      setModel(nextModel)
      navigate(redirectTo, { replace: true })
    } catch (loginError) {
      hideAppSplash()
      setError(getErrorMessage(loginError, t('login.failed')))
    } finally {
      setIsLoadingLogin(false)
      setLoginProgressLabel('')
    }
  }, [authController, navigate, passwordLoginUseCase, redirectTo, t])

  const handleKeycloakLogin = useCallback((loginHint?: string, providerOrganization?: string | null) => {
    const redirectPath = redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/'
    const redirect = redirectPath === '/' || redirectPath === '/web' ? '/web/' : redirectPath.startsWith('/web/') ? redirectPath : `/web${redirectPath}`
    const params = new URLSearchParams({ redirect, platform: 'web' })
    if (loginHint?.trim()) params.set('login_hint', loginHint.trim())
    if (providerOrganization || organizationSlug) params.set('organization', providerOrganization || organizationSlug)
    showAppSplash(t('login.goingToSso'))
    window.location.href = `/api/v1/auth/keycloak/login?${params.toString()}`
  }, [organizationSlug, redirectTo, t])

  const isEmbeddedMessengerRequest = useMemo(() => {
    if (!redirectTo.trim().startsWith('/')) return false
    try {
      const url = new URL(redirectTo, 'https://axis-workspace.kz')
      return (url.pathname === '/messenger' || url.pathname.startsWith('/messenger/')) && url.searchParams.get('embedded') === 'true'
    } catch { return false }
  }, [redirectTo])

  useEffect(() => {
    if (isBootstrapping || isLoadingLogin || !isEmbeddedMessengerRequest || embeddedMessengerRedirectStartedRef.current || isTenantWorkspaceHost()) return
    embeddedMessengerRedirectStartedRef.current = true
    handleKeycloakLogin()
  }, [handleKeycloakLogin, isBootstrapping, isEmbeddedMessengerRequest, isLoadingLogin])

  const NoticeIcon = notice ? noticeIcon[notice.kind] : null

  if (tenantLoginHost) return <main className="axis-login-page" role="status">{t('login.redirecting')}</main>

  return (
    <main className="axis-login-page">
      <div className="axis-login-shell">
        <aside className="axis-login-hero">
          <div className="axis-login-brand is-inverse"><img src={`${import.meta.env.BASE_URL}unitespace-mark.svg`} alt="" />UniteSpace</div>
          <div className="axis-login-hero-copy">
            <h2>{t('hero.title')}<br />{t('hero.titleSecond')}</h2>
            <p>{t('hero.subtitle')}</p>
          </div>

          <div className="axis-login-cards" aria-hidden="true">
            <div className="axis-login-card is-ai">
              <div className="axis-login-card-row">
                <span className="axis-login-card-icon"><Sparkles strokeWidth={1.9} /></span>
                <b>{t('hero.ai.title')}</b>
              </div>
              <div className="axis-login-ai-input">
                <TypingPrompt prompts={heroPrompts.map((key) => t(`hero.ai.prompts.${key}`))} />
                <span className="axis-login-ai-send"><ArrowUp strokeWidth={2.2} /></span>
              </div>
            </div>
          </div>

          <div className="axis-login-apps">
            <p>{t('hero.apps.label')}</p>
            <div className="axis-login-marquee">
              <ul className="axis-login-marquee-track">
                {[0, 1].map((copy) => ecosystemApps.map(({ key, label, icon: Icon }) => (
                  <li key={`${copy}-${key}`} aria-hidden={copy === 1 ? true : undefined}>
                    <Icon strokeWidth={1.8} aria-hidden="true" />
                    {key === 'edo' ? t('hero.apps.edo') : label}
                  </li>
                )))}
              </ul>
            </div>
          </div>
        </aside>

        <section className="axis-login-panel">
          <header className="axis-login-topbar">
            <div className="axis-login-brand axis-login-mobile-brand"><img src={`${import.meta.env.BASE_URL}unitespace-mark.svg`} alt="" />UniteSpace</div>
            <LanguageSwitcher persist={false} className="axis-login-language" />
          </header>

          <div className="axis-login-body">
            <div className="axis-login-column">
              <h1>{t('login.title')}</h1>
              <p className="axis-login-subtitle">{t('login.subtitle')}</p>

              {isBootstrapping ? (
                <div className="axis-bootstrap" role="status"><span className="axis-spinner" aria-hidden="true" />{t('login.checkingSession')}</div>
              ) : (
                <>
                  {notice && NoticeIcon ? (
                    <div className={`axis-notice ${noticeClass[notice.kind]}`} role="status">
                      <NoticeIcon size={20} strokeWidth={1.75} aria-hidden="true" />
                      <div><strong>{notice.title}</strong><span>{notice.message}</span></div>
                    </div>
                  ) : null}
                  <LoginForm
                    loading={isLoadingLogin}
                    loadingLabel={loginProgressLabel || t('login.signingIn')}
                    error={error}
                    onSubmit={handlePasswordLogin}
                    onLoginChange={setLoginHint}
                    onKeycloakLogin={canUseCorporateLogin ? (hint) => handleKeycloakLogin(hint, corporateOrganization) : undefined}
                  />
                  <Link to="/recover" className="mt-4 block text-center text-sm font-medium text-blue-700 hover:underline">{t('recovery:forgot')}</Link>
                </>
              )}

              <p className="axis-login-access-note">{t('login.noAccess')} <strong>{t('login.contactAdmin')}</strong></p>
            </div>
          </div>

          <footer className="axis-login-footer">© 2026 UniteSpace</footer>
        </section>
      </div>
    </main>
  )
}
