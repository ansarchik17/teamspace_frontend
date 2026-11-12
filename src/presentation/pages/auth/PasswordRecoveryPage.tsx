import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { HttpRecoveryRepository, recoveryTokenFromHash } from '../../../infrastructure/repositories/HttpRecoveryRepository'
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore'
import { getErrorMessage } from '../../../shared/utils/getErrorMessage'
import LanguageSwitcher from '../../../shared/ui/LanguageSwitcher'
import { hideAppSplash } from '../../../shared/ui/axisSplash'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import { useNoReferrer } from '../../../shared/auth/useNoReferrer'

const field = 'mt-2 h-12 w-full rounded-lg border border-slate-400 px-3 focus:outline-2 focus:outline-blue-600'
export default function PasswordRecoveryPage() {
  const { t } = useTranslation('recovery')
  const location = useLocation()
  const token = recoveryTokenFromHash(location.hash)
  const invalidHash = Boolean(location.hash) && !token
  const repo = useMemo(() => new HttpRecoveryRepository(new LocalStorageAuthSessionStore()), [])
  const [valid, setValid] = useState(false)
  const [checking, setChecking] = useState(Boolean(token))
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [done, setDone] = useState<'requested' | 'completed' | null>(null)
  const [error, setError] = useState('')
  const [previewVersion, setPreviewVersion] = useState(0)
  useEffect(() => { setDone(null); setPassword(''); setRepeat(''); setError('') }, [location.hash])
  useNoReferrer()
  useEffect(() => { hideAppSplash() }, [])
  useEffect(() => {
    if (!token) return
    const abort = new AbortController()
    setChecking(true); setValid(false); setError('')
    void repo.preview(token, abort.signal).then(() => { if (!abort.signal.aborted) setValid(true) }).catch(e => { if (!abort.signal.aborted) setError(getErrorMessage(e, t('invalidLink'))) }).finally(() => { if (!abort.signal.aborted) setChecking(false) })
    return () => abort.abort()
  }, [repo, token, t, previewVersion])
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (busyRef.current) return
    setError('')
    if (token && password !== repeat) { setError(t('mismatch')); return }
    busyRef.current = true; setBusy(true)
    try {
      if (token) {
        await repo.complete(token, password)
        setPassword(''); setRepeat(''); setDone('completed')
        window.history.replaceState(window.history.state, '', window.location.pathname)
      } else { await repo.request(login); setDone('requested') }
    } catch (e) { setError(getErrorMessage(e, t('failed'))) }
    finally { busyRef.current = false; setBusy(false) }
  }
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-5">
    <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="mb-6 flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2 text-lg font-bold text-slate-900"><img src={`${import.meta.env.BASE_URL}unitespace-mark.svg`} alt="" className="h-7 w-7 shrink-0" />UniteSpace</span><LanguageSwitcher persist={false} /></div>
      <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
      {done ? <p role="status" className="mt-4 text-slate-700">{t(done === 'completed' ? 'completed' : 'requested')}</p> : <>
        <p className="mt-3 text-sm text-slate-600">{t(token ? 'newPasswordDescription' : 'requestDescription')}</p>
        {checking && <p role="status" className="mt-4">{t('checking')}</p>}
        {invalidHash && <p role="alert" className="mt-4 text-red-700">{t('invalidLink')}</p>}
        {(!token && !invalidHash || token && valid) && <form className="mt-5 space-y-4" onSubmit={submit}>
          {token ? <>
            <label className="block text-sm font-medium">{t('newPassword')}<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} disabled={busy} className={field} /></label>
            <label className="block text-sm font-medium">{t('repeatPassword')}<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={repeat} onChange={e => setRepeat(e.target.value)} disabled={busy} className={field} /></label>
          </> : <label className="block text-sm font-medium">{t('login')}<input autoComplete="username" required maxLength={254} value={login} onChange={e => setLogin(e.target.value)} disabled={busy} className={field} /></label>}
          <button disabled={busy} className={`${AXIS_UI.primaryButton} w-full`}>{busy ? t('working') : t(token ? 'savePassword' : 'requestLink')}</button>
        </form>}
      </>}
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      {token && !valid && !checking && !done && <button type="button" className={`${AXIS_UI.secondaryButton} mt-4`} onClick={() => setPreviewVersion(v => v + 1)}>{t('retry')}</button>}
      {(invalidHash || token && !valid && !checking) && !done && <Link to="/recover" className="mt-4 block text-sm font-medium text-blue-700" onClick={() => { setError(''); setDone(null) }}>{t('requestAgain')}</Link>}
      <Link to="/login" className="mt-6 block text-center text-sm font-medium text-blue-700 hover:underline">{t('backToLogin')}</Link>
    </section>
  </main>
}
