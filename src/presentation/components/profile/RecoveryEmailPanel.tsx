import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { HttpRecoveryRepository, type RecoveryEmailState } from '../../../infrastructure/repositories/HttpRecoveryRepository'
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore'
import { getErrorMessage } from '../../../shared/utils/getErrorMessage'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'

const field = 'mt-1 h-11 w-full rounded-md border border-slate-400 bg-white px-3 text-sm focus:outline-2 focus:outline-blue-600 disabled:opacity-60'
export default function RecoveryEmailPanel() {
  const { t } = useTranslation('recovery')
  const repo = useMemo(() => new HttpRecoveryRepository(new LocalStorageAuthSessionStore()), [])
  const [state, setState] = useState<RecoveryEmailState | null>(null)
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState<'bind' | 'remove' | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const abort = new AbortController()
    void repo.state(abort.signal).then(setState).catch(e => { if (!abort.signal.aborted) setError(getErrorMessage(e, t('loadFailed'))) }).finally(() => { if (!abort.signal.aborted) setLoading(false) })
    return () => abort.abort()
  }, [repo, t])
  useEffect(() => { if (!state?.pending) return; const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [state?.pending])
  const pending = action === null ? state?.pending : null
  const seconds = state?.pending ? Math.max(0, Math.ceil((Date.parse(state.pending.retry_at) - now) / 1000)) : 0
  const expired = pending ? Date.parse(pending.expires_at) <= now : false
  const run = async (confirm: boolean) => {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setError(''); setMessage('')
    try {
      if (confirm && pending) {
        await repo.confirm(pending.id, code, password)
        setPassword(''); setCode(''); setAction(null); setMessage(t('saved'))
        setState(current => current ? { ...current, pending: null } : current)
        const next = await repo.state(); setState(next)
      } else {
        const purpose = action ?? state?.pending?.purpose ?? 'bind'
        const destination = purpose === 'remove' ? '' : action ? email : state?.pending?.email ?? email
        const next = await repo.sendCode(destination, purpose, password)
        setState(current => ({ email: current?.email ?? null, verified_at: current?.verified_at ?? null, pending: next }))
        setAction(null); setCode(''); setNow(Date.now()); setMessage(t('codeSent', { email: next.email }))
      }
    } catch (e) { setError(getErrorMessage(e, t('failed'))) }
    finally { busyRef.current = false; setBusy(false) }
  }
  const choose = (next: 'bind' | 'remove') => { setAction(next); setPassword(''); setCode(''); setEmail(''); setError(''); setMessage('') }
  const submit = (e: FormEvent) => { e.preventDefault(); void run(Boolean(pending)) }
  return <div className="py-5 last:pb-0">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><MaterialSymbol name="alternate_email" size={20} /></span>
        <div className="min-w-0 flex-1"><h4 className="text-sm font-semibold text-slate-900">{t('emailTitle')}</h4><p className="mt-1 break-words text-sm text-slate-600">{loading ? t('loading') : state?.email ?? t('notLinked')}</p></div>
      </div>
      <div className="flex flex-wrap gap-2 pl-14 sm:pl-0">
        <button type="button" className={`${AXIS_UI.secondaryButton} !h-10`} disabled={loading || busy || !state} onClick={() => choose('bind')}>{state?.email ? t('replace') : t('link')}</button>
        {state?.email && <button type="button" className={`${AXIS_UI.secondaryButton} !h-10`} disabled={busy} onClick={() => choose('remove')}>{t('unlink')}</button>}
      </div>
    </div>
    <p className="mt-3 text-sm text-slate-600">{t('emailDescription')}</p>
    {(action || pending) && <form onSubmit={submit} className="mt-4 space-y-3 rounded-lg bg-slate-50 p-4">
      {action === 'bind' && <label className="block text-sm font-medium">{t('personalEmail')}<input type="email" autoComplete="email" maxLength={254} required value={email} onChange={e => setEmail(e.target.value)} disabled={busy} className={field} /></label>}
      {action === 'remove' && <p className="text-sm">{t('removeDescription', { email: state?.email })}</p>}
      {pending && <p className="text-sm">{t(pending.purpose === 'remove' ? 'removeCodeDescription' : 'codeDescription', { email: pending.email })}</p>}
      <label className="block text-sm font-medium">{t('currentPassword')}<input type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={e => setPassword(e.target.value)} disabled={busy} className={field} /></label>
      {pending && <label className="block text-sm font-medium">{t('code')}<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} disabled={busy || expired} className={field} /></label>}
      {expired && <p role="status" className="text-sm text-amber-800">{t('codeExpired')}</p>}
      <div className="flex flex-wrap gap-3">
        <button className={`${AXIS_UI.primaryButton} !h-10`} disabled={busy || Boolean(pending && expired)}>{busy ? t('working') : pending ? t('confirm') : t('sendCode')}</button>
        {pending && <button type="button" className={`${AXIS_UI.secondaryButton} !h-10`} disabled={busy || seconds > 0 || !password} onClick={() => void run(false)}>{seconds > 0 ? t('resendIn', { seconds }) : t('resend')}</button>}
        {action && <button type="button" className={`${AXIS_UI.secondaryButton} !h-10`} disabled={busy} onClick={() => { setAction(null); setPassword(''); setCode('') }}>{t('cancel')}</button>}
      </div>
    </form>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="mt-3 text-sm text-green-800">{message}</p>}
    {!loading && !state && <button type="button" className={`${AXIS_UI.secondaryButton} mt-3`} onClick={() => { setLoading(true); setError(''); void repo.state().then(setState).catch(e => setError(getErrorMessage(e, t('loadFailed')))).finally(() => setLoading(false)) }}>{t('retry')}</button>}
  </div>
}
