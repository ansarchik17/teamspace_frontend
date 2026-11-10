import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldCheck, Video } from 'lucide-react'
import { meetApi } from '../../../infrastructure/meet/meetApi'
import { HttpError } from '../../../infrastructure/http/HttpError'

import { meetErrorMessage } from './meetUtils'
import MeetPageSkeleton from './MeetSkeleton'

export default function MeetAccountGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation('shell')
  const [state, setState] = useState<'loading' | 'ready' | 'link' | 'error'>(
    'loading',
  )
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let cancelled = false
    void meetApi
      .me()
      .then(() => {
        if (!cancelled) setState('ready')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const needsLink =
          err instanceof HttpError && err.code === 'meet_account_link_required'
        // A migration step is not a failed form submission.
        setError(needsLink ? '' : meetErrorMessage(err))
        setState(needsLink ? 'link' : 'error')
      })
    return () => {
      cancelled = true
    }
  }, [retry])
  if (state === 'ready') return children
  if (state === 'loading') return <MeetPageSkeleton label={t('meet.loading')} />
  return (
    <div className="meet-page">
      <div className="meet-gate">
        <div className="meet-brand-icon">
          <Video size={28} />
        </div>
        <h1>Meet</h1>
        {state === 'link' ? (
          <>
            <h2>{t('meet.accountLink.title')}</h2>
            <p>{t('meet.accountLink.description')}</p>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                if (busy) return
                setBusy(true)
                setError('')
                void meetApi
                  .link(email, password)
                  .then(() => {
                    setPassword('')
                    setState('loading')
                    setRetry((value) => value + 1)
                  })
                  .catch((err: unknown) => {
                    setPassword('')
                    setError(meetErrorMessage(err))
                    if (
                      err instanceof HttpError &&
                      err.code === 'meet_account_sso_link_required'
                    ) setState('error')
                  })
                  .finally(() => setBusy(false))
              }}
            >
              <label>
                {t('meet.accountLink.email')}
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={busy}
                />
              </label>
              <label>
                {t('meet.accountLink.password')}
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={200}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={busy}
                />
              </label>
              {error && (
                <p className="meet-error" role="alert">
                  {error}
                </p>
              )}
              <button className="meet-button primary" disabled={busy}>
                {t(busy ? 'meet.accountLink.linking' : 'meet.accountLink.submit')}
              </button>
            </form>
            <p className="meet-caption">
              <ShieldCheck size={15} /> {t('meet.accountLink.passwordPrivacy')}
            </p>
          </>
        ) : (
          <>
            <p className="meet-error" role="alert">
              {error}
            </p>
            <button
              className="meet-button"
              onClick={() => {
                setState('loading')
                setRetry((value) => value + 1)
              }}
            >
              {t('meet.accountLink.retry')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
