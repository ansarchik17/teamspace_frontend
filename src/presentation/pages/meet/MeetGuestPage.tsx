import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Mic, MicOff, Video, VideoOff, ShieldCheck } from 'lucide-react'
import {
  meetGuestApi,
  type MeetGuestState,
} from '../../../infrastructure/meet/meetGuestApi'
import { HttpError } from '../../../infrastructure/http/HttpError'
import MeetCallProvider from './MeetCallProvider'
import { useMeetCall } from './meetCallShared'
import { meetErrorMessage } from './meetUtils'
import './meet.css'

function GuestLobby({
  meetingId,
  revision,
  resumeSession,
}: {
  meetingId: string
  revision: number
  resumeSession: boolean
}) {
  const { start, activeCall, restore } = useMeetCall()
  const [name, setName] = useState('')
  const [guest, setGuest] = useState<MeetGuestState['guest']>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [microphone, setMicrophone] = useState(false)
  const [camera, setCamera] = useState(false)
  const mounted = useRef(true)
  const joinRef = useRef(false)
  const media = useRef({ microphone, camera })
  media.current = { microphone, camera }
  const waiting = guest?.status === 'pending'
  const denied = guest?.status === 'denied'
  const joining = guest?.status === 'admitted'
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setGuest(null)
    setError('')
    // Leaving must not reconnect automatically if logout failed on the network.
    if (!resumeSession) {
      setLoading(false)
      return () => controller.abort()
    }
    void meetGuestApi
      .session(meetingId, controller.signal)
      .then(({ guest }) => {
        if (controller.signal.aborted) return
        setGuest(guest)
        if (guest) setName(guest.name)
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(meetErrorMessage(err))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [meetingId, revision, resumeSession])

  // Serial polling avoids overlapping token requests and stops on unmount/admission.
  useEffect(() => {
    if (!guest || denied || activeCall || joinRef.current) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const state = await meetGuestApi.status(meetingId, controller.signal)
        if (controller.signal.aborted) return
        if (!state.guest) {
          setGuest(null)
          return
        }
        if (state.guest.status === 'denied') {
          setGuest(state.guest)
          return
        }
        if (state.guest.status === 'admitted') {
          joinRef.current = true
          try {
            const session = await meetGuestApi.join(
              meetingId,
              controller.signal,
            )
            if (!controller.signal.aborted)
              start({
                session,
                title: 'Видеовстреча',
                ...media.current,
                guest: true,
              })
          } finally {
            joinRef.current = false
          }
          return
        }
        timer = setTimeout(() => void poll(), 3000)
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(meetErrorMessage(err))
          setGuest(null)
        }
      }
    }
    void poll()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [guest, denied, activeCall, meetingId, start])

  const requestJoin = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || waiting || loading || denied) return
    setBusy(true)
    setError('')
    try {
      const state = await meetGuestApi.requestJoin(meetingId, name.trim())
      if (mounted.current) {
        setGuest(state.guest)
        if (state.guest) setName(state.guest.name)
      }
    } catch (err) {
      if (mounted.current)
        setError(
          err instanceof HttpError && err.status === 404
            ? 'Встреча не найдена или уже завершена. Проверьте ссылку у организатора.'
            : meetErrorMessage(err),
        )
    } finally {
      if (mounted.current) setBusy(false)
    }
  }
  return (
    <main className="meet-page meet-guest-page">
      <header className="meet-guest-header">
        <Link
          to={`/meet/${encodeURIComponent(meetingId)}`}
          className="meet-guest-brand"
          aria-label="UniteSpace Meet"
        >
          <img
            src={`${import.meta.env.BASE_URL}unitespace-mark.svg`}
            alt=""
          />
          <span>
            UniteSpace <span>Meet</span>
          </span>
        </Link>
        {!activeCall && (
          <Link
            className="meet-button"
            to="/login"
            state={{ from: `/meet/${meetingId}` }}
          >
            Войти в аккаунт
          </Link>
        )}
      </header>
      {activeCall ? (
        <div className="meet-guest-active meet-gate">
          <Video size={26} />
          <h1>Вы во встрече</h1>
          <p>Встреча продолжается в отдельном окне.</p>
          <button className="meet-button primary" onClick={restore}>
            Развернуть встречу
          </button>
        </div>
      ) : (
        <div className="meet-lobby meet-guest-lobby">
          <div className="meet-lobby-preview meet-guest-preview">
            <div className="meet-avatar">
              {name.trim() ? (
                name
                  .trim()
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join('')
                  .toUpperCase()
              ) : (
                <Video size={32} />
              )}
            </div>
            <p>Камера {camera ? 'включится при входе' : 'выключена'}</p>
            <div className="meet-actions">
              <button
                type="button"
                className={'meet-control' + (!microphone ? ' off' : '')}
                aria-pressed={microphone}
                aria-label={
                  microphone ? 'Выключить микрофон' : 'Включить микрофон'
                }
                onClick={() => setMicrophone((value) => !value)}
              >
                {microphone ? <Mic /> : <MicOff />}
              </button>
              <button
                type="button"
                className={'meet-control' + (!camera ? ' off' : '')}
                aria-pressed={camera}
                aria-label={camera ? 'Выключить камеру' : 'Включить камеру'}
                onClick={() => setCamera((value) => !value)}
              >
                {camera ? <Video /> : <VideoOff />}
              </button>
            </div>
          </div>
          <div className="meet-lobby-content meet-guest-content">
            <div className="meet-eyebrow">ВХОД ПО ПРИГЛАШЕНИЮ</div>
            <h1>
              {denied
                ? 'Вход не разрешён'
                : waiting
                  ? 'Ожидаем организатора'
                  : joining
                    ? 'Подключаемся к встрече'
                    : 'Присоединиться к встрече'}
            </h1>
            <p role={waiting ? 'status' : undefined}>
              {denied
                ? 'Организатор отклонил ваш запрос. Свяжитесь с ним, чтобы получить доступ.'
                : waiting
                  ? `${guest.name}, ваш запрос отправлен. Организатор впустит вас во встречу.`
                  : joining
                    ? 'Организатор разрешил вход. Подключаем вас к встрече…'
                    : 'Введите имя, чтобы организатор и участники узнали вас. Аккаунт не нужен.'}
            </p>
            <form onSubmit={(event) => void requestJoin(event)}>
              <label htmlFor="meet-guest-name">Ваше имя</label>
              <input
                id="meet-guest-name"
                autoComplete="name"
                placeholder="Например, Айдана"
                minLength={2}
                maxLength={100}
                required
                value={name}
                disabled={loading || busy || Boolean(guest)}
                onChange={(event) => setName(event.target.value)}
              />
              {error && (
                <p className="meet-error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="meet-button primary"
                type="submit"
                disabled={
                  loading || busy || Boolean(guest) || name.trim().length < 2
                }
              >
                {loading
                  ? 'Загружаем…'
                  : busy
                    ? 'Отправляем запрос…'
                    : waiting
                      ? 'Ожидаем допуска…'
                      : denied
                        ? 'Запрос отклонён'
                        : joining
                          ? 'Подключаемся…'
                          : 'Попросить войти'}
              </button>
            </form>
            <div className="meet-guest-privacy">
              <ShieldCheck size={16} />
              <span>
                Камера и микрофон включатся только после допуска, если вы их
                выбрали.
              </span>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

export default function MeetGuestPage({ meetingId }: { meetingId: string }) {
  const [revision, setRevision] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState('')
  const [hasLeft, setHasLeft] = useState(false)
  return (
    <MeetCallProvider
      onLeave={() => {
        setHasLeft(true)
        setLeaving(true)
        void meetGuestApi
          .leave(meetingId)
          .then(() => setLeaveError(''))
          .catch((err) => setLeaveError(meetErrorMessage(err)))
          .finally(() => {
            setRevision((value) => value + 1)
            setLeaving(false)
          })
      }}
    >
      {leaving ? (
        <main className="meet-page meet-guest-page">
          <div className="meet-gate">
            <p role="status">Выходим из встречи…</p>
          </div>
        </main>
      ) : (
        <GuestLobby
          key={meetingId}
          meetingId={meetingId}
          revision={revision}
          resumeSession={!hasLeft}
        />
      )}
      {leaveError && (
        <p className="meet-error" role="alert">
          {leaveError}
        </p>
      )}
    </MeetCallProvider>
  )
}
