import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { HttpInvitationRepository, invitationTokenFromHash, type InvitationPreview } from '../../../infrastructure/repositories/HttpInvitationRepository'
import { HttpError } from '../../../infrastructure/http/HttpError'
import { createAuthController } from '../../auth/createAuthController'
import { hideAppSplash } from '../../../shared/ui/axisSplash'
import { rememberedInvitation, rememberInvitation, forgetInvitation } from '../../../shared/auth/invitationReturn'
import { useNoReferrer } from '../../../shared/auth/useNoReferrer'
import AppButton from '../../../shared/ui/AppButton'
import './organizationInvitations.css'

export default function InvitationJoinPage() {
  const { t } = useTranslation('invitations')
  const location = useLocation(); const navigate = useNavigate()
  const token = useMemo(() => invitationTokenFromHash(location.hash) ?? (location.hash ? null : rememberedInvitation()), [location.hash])
  const { authController, sessionStore } = useMemo(() => createAuthController(), [])
  const repo = useMemo(() => new HttpInvitationRepository(sessionStore), [sessionStore])
  const [preview, setPreview] = useState<InvitationPreview | null>(null)
  const [identity, setIdentity] = useState<{ name: string; email: string } | null>(null)
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const busyRef = useRef(false)
  const [error, setError] = useState(''); const [code, setCode] = useState(''); const [codeSent, setCodeSent] = useState(false)
  const [retryAt, setRetryAt] = useState(0); const [seconds, setSeconds] = useState(0)
  const [done, setDone] = useState(false); const [activationPending, setActivationPending] = useState(false)
  const [fields, setFields] = useState({ first_name: '', last_name: '', iin: '', username: '', password: '', confirm: '' })
  const mounted = useRef(true)
  useNoReferrer()
  useEffect(() => { mounted.current = true; hideAppSplash(); return () => { mounted.current = false } }, [])
  useEffect(() => {
    const abort = new AbortController(); setLoading(true); setError(''); setPreview(null); setDone(false); setCode(''); setCodeSent(false)
    if (!token) { setError(t('invalid')); setLoading(false); return () => abort.abort() }
    Promise.all([repo.preview(token, abort.signal), authController.bootstrap(true)]).then(([invite, model]) => {
      if (!abort.signal.aborted) { setPreview(invite); setIdentity(model.isAuthenticated ? { name: model.name, email: model.email } : null) }
    }).catch((cause: unknown) => { if (!abort.signal.aborted) setError(cause instanceof HttpError && [400, 403, 404, 409].includes(cause.status) ? t('invalid') : t('error')) })
      .finally(() => { if (!abort.signal.aborted) setLoading(false) })
    return () => abort.abort()
  }, [token, repo, authController, t])
  useEffect(() => { const tick = () => setSeconds(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000))); tick(); const interval = window.setInterval(tick, 1000); return () => window.clearInterval(interval) }, [retryAt])
  const run = async (operation: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setError('')
    try { await operation() } catch (cause) {
      if (!mounted.current) return
      if (cause instanceof HttpError && cause.code === 'INVITATION_ACTIVATION_PENDING') { setDone(true); setActivationPending(true) }
      else if (cause instanceof HttpError && cause.code === 'INVITATION_REGISTRATION_LOGIN' && cause.details && typeof cause.details === 'object' && 'username' in cause.details && typeof cause.details.username === 'string') { setFields(current => ({ ...current, username: String((cause.details as { username: string }).username) })); setError(t('resumeLogin')) }
      else setError(cause instanceof HttpError && cause.status < 500 ? cause.message : t('error'))
    } finally { busyRef.current = false; if (mounted.current) setBusy(false) }
  }
  const submit = () => void run(async () => {
    if (!token) return
    if (identity) { await repo.accept(token, code); await authController.bootstrap(true) }
    else {
      if (fields.password !== fields.confirm) { setError(t('passwordMismatch')); return }
      await repo.register({ token, code, username: fields.username, password: fields.password, first_name: fields.first_name, last_name: fields.last_name, iin: fields.iin })
    }
    if (mounted.current) { forgetInvitation(); setDone(true); window.history.replaceState(window.history.state, '', window.location.pathname) }
  })
  return <main className="invitation-join"><section className="invitation-card" aria-busy={loading}>
    <span className="invitation-brand">UniteSpace</span>
    {loading ? <p role="status">{t('loading')}</p> : done ? <>
      <h1>{activationPending ? t('activationTitle') : identity ? t('joined') : t('registered')}</h1>
      <p>{activationPending ? t('activationDescription') : identity ? t('joinedDescription') : t('registeredDescription')}</p>
      <AppButton onClick={() => navigate(identity ? '/workspace' : '/login', { replace: true })}>{identity ? t('openWorkspace') : t('login')}</AppButton>
    </> : <>
      <h1>{preview ? t('joinTitle', { company: preview.organization_name }) : t('invitationTitle')}</h1>
      {preview && <><p>{t('joinDescription')}</p>
        {identity ? <p className="invitation-identity">{t('signedIn', { name: identity.name, email: identity.email })}</p> : <AppButton variant="secondary" disabled={busy} onClick={() => { if (token && rememberInvitation(token)) navigate('/login', { state: { from: '/join' } }); else setError(t('storageUnavailable')) }}>{t('haveAccount')}</AppButton>}
        <form className="invitation-form" onSubmit={event => { event.preventDefault(); submit() }}>
          <div className="invitation-verification"><p>{t('verifyDescription', { email: preview.email_hint })}</p>
            <AppButton variant="secondary" disabled={busy || seconds > 0} onClick={() => void run(async () => { if (token) { const result = await repo.sendCode(token); if (mounted.current) { setCodeSent(true); setRetryAt(Date.now() + result.retry_after * 1000) } } })}>{seconds > 0 ? t('resendAfter', { seconds }) : codeSent ? t('resendCode') : t('sendCode')}</AppButton>
            {codeSent && <p role="status">{t('codeSent')}</p>}
            <label>{t('code')}<input inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6} value={code} disabled={busy} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
          </div>
          {!identity && <><div className="invitation-fields">{(['first_name', 'last_name', 'iin', 'username', 'password', 'confirm'] as const).map(name => <label key={name}>{t(`fields.${name}`)}<input name={name} type={name === 'password' || name === 'confirm' ? 'password' : 'text'} autoComplete={name === 'first_name' ? 'given-name' : name === 'last_name' ? 'family-name' : name === 'password' || name === 'confirm' ? 'new-password' : 'off'} required minLength={name === 'password' || name === 'confirm' ? 8 : name === 'username' ? 3 : undefined} maxLength={name === 'iin' ? 12 : name === 'password' || name === 'confirm' ? 128 : 50} inputMode={name === 'iin' ? 'numeric' : undefined} pattern={name === 'iin' ? '[0-9]{12}' : name === 'username' ? '[^\\s]+' : undefined} value={fields[name]} disabled={busy} onChange={event => setFields(current => ({ ...current, [name]: event.target.value }))} /></label>)}</div><p className="invitation-help">{t('accountHelp')}</p></>}
          <AppButton type="submit" isLoading={busy} disabled={code.length !== 6}>{identity ? t('accept') : t('registerAndJoin')}</AppButton>
        </form>
      </>}
      {error && <p role="alert" className="invitation-error">{error}</p>}
      {!preview && <Link to="/login">{t('login')}</Link>}
    </>}
  </section></main>
}
