import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { showAppSplash } from '../../../shared/ui/axisSplash'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { HttpError } from '../../../infrastructure/http/HttpError'
import { useCallManager } from '../../calls/useCallManager'
import { useTranslation } from 'react-i18next'
import { i18n } from '../../../shared/i18n'

type PageState = 'loading' | 'connected' | 'forbidden' | 'notfound' | 'error'

const pageShellStyle: CSSProperties = {
  minHeight: 'calc(100vh - 96px)',
  display: 'grid',
  placeItems: 'center',
  padding: '32px 20px',
  background:
    'radial-gradient(circle at top, rgba(47,75,226,0.24), transparent 30%), linear-gradient(180deg, #0B0D10 0%, #111827 100%)',
}

const cardStyle: CSSProperties = {
  width: 'min(100%, 560px)',
  borderRadius: 28,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(10, 14, 22, 0.82)',
  boxShadow: '0 28px 70px rgba(0, 0, 0, 0.32)',
  padding: '32px 28px',
  backdropFilter: 'blur(20px)',
}

const primaryButtonStyle: CSSProperties = {
  border: 'none',
  borderRadius: 14,
  background: '#2458D3',
  color: '#FFFFFF',
  padding: '12px 18px',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
}

const secondaryButtonStyle: CSSProperties = {
  border: '1px solid rgba(148, 163, 184, 0.35)',
  borderRadius: 14,
  background: 'rgba(255,255,255,0.04)',
  color: '#E2E8F0',
  padding: '12px 18px',
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
}

export default function CalendarCallPage() {
  const { t } = useTranslation('calendar')
  const navigate = useNavigate()
  const location = useLocation()
  const { roomName } = useParams<{ roomName: string }>()
  const { currentCall, joinCalendarCall } = useCallManager()
  const [state, setState] = useState<PageState>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [retryNonce, setRetryNonce] = useState(0)
  const startedRef = useRef(false)
  const wasConnectedRef = useRef(false)
  const returnedAfterHangupRef = useRef(false)

  useEffect(() => {
    if (currentCall && currentCall.roomName === roomName && currentCall.roomConnected) {
      wasConnectedRef.current = true
      return
    }

    if (
      !wasConnectedRef.current ||
      returnedAfterHangupRef.current ||
      currentCall?.roomName === roomName
    ) {
      return
    }

    returnedAfterHangupRef.current = true
    const historyIndex = (window.history.state as { idx?: number } | null)?.idx
    if (typeof historyIndex === 'number' && historyIndex > 0) {
      navigate(-1)
    } else {
      navigate('/calendar', { replace: true })
    }
  }, [currentCall?.roomConnected, currentCall?.roomName, navigate, roomName])

  useEffect(() => {
    if (!roomName) {
      navigate('/calendar', { replace: true })
      return
    }

    if (currentCall?.roomName === roomName && currentCall.roomConnected) {
      setState('connected')
      return
    }

    if (startedRef.current) {
      return
    }
    startedRef.current = true
    setState('loading')
    setErrorMessage('')

    void joinCalendarCall({ roomName })
      .then(() => {
        setState('connected')
      })
      .catch((error: unknown) => {
        startedRef.current = false

        if (error instanceof HttpError) {
          if (error.status === 401) {
            showAppSplash(i18n.t('calendar:call.redirecting'))
            navigate('/login', {
              replace: true,
              state: { from: `${location.pathname}${location.search}${location.hash}` },
            })
            return
          }
          if (error.status === 403) {
            setState('forbidden')
            return
          }
          if (error.status === 404) {
            setState('notfound')
            return
          }
        }

        setErrorMessage(
          error instanceof Error && error.message
            ? error.message
            : i18n.t('calendar:call.connectFailed'),
        )
        setState('error')
      })
  }, [
    currentCall?.roomConnected,
    currentCall?.roomName,
    joinCalendarCall,
    location.hash,
    location.pathname,
    location.search,
    navigate,
    retryNonce,
    roomName,
  ])

  const handleRetry = () => {
    startedRef.current = false
    setState('loading')
    setErrorMessage('')
    setRetryNonce((value) => value + 1)
  }

  const title =
    state === 'forbidden'
      ? t('call.title.forbidden')
      : state === 'notfound'
        ? t('call.title.notFound')
        : state === 'error'
          ? t('call.title.error')
          : state === 'connected'
            ? t('call.title.connected')
            : t('call.title.loading')

  const description =
    state === 'forbidden'
      ? t('call.description.forbidden')
      : state === 'notfound'
        ? t('call.description.notFound')
        : state === 'error'
          ? errorMessage || t('call.description.error')
          : state === 'connected'
            ? t('call.description.connected')
            : t('call.description.loading')

  return (
    <main style={pageShellStyle}>
      <section style={cardStyle}>
        {state === 'loading' ? (
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: '50%',
              border: '3px solid rgba(96,165,250,0.18)',
              borderTopColor: '#60A5FA',
              animation: 'calendar-call-spin 900ms linear infinite',
              marginBottom: 18,
            }}
          />
        ) : null}
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#DBEAFE' }}>
          Calendar Meeting
        </div>
        <h1 style={{ margin: '14px 0 0', fontSize: 28, lineHeight: 1.15, color: '#F8FAFC' }}>{title}</h1>
        <p style={{ margin: '14px 0 0', fontSize: 15, lineHeight: 1.6, color: '#94A3B8' }}>{description}</p>

        <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {state === 'error' ? (
            <button type="button" onClick={handleRetry} style={primaryButtonStyle}>
              {t('page.retry')}
            </button>
          ) : null}
          {state === 'connected' ? (
            <button type="button" onClick={handleRetry} style={primaryButtonStyle}>
              {t('call.reconnect')}
            </button>
          ) : null}
          {(state === 'forbidden' || state === 'notfound' || state === 'error' || state === 'connected') ? (
            <button type="button" onClick={() => navigate('/calendar')} style={secondaryButtonStyle}>
              {t('call.openCalendar')}
            </button>
          ) : null}
        </div>

        {roomName ? (
          <div style={{ marginTop: 22, fontSize: 13, color: '#64748B' }}>
            room: <code style={{ color: '#DBEAFE' }}>{roomName}</code>
          </div>
        ) : null}
        <style>{`
          @keyframes calendar-call-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </section>
    </main>
  )
}
