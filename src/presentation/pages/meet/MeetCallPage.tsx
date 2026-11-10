import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Mic, MicOff, Video, VideoOff } from 'lucide-react'
import { meetApi, type MeetSession } from '../../../infrastructure/meet/meetApi'
import { HttpError } from '../../../infrastructure/http/HttpError'
import MeetAccountGate from './MeetAccountGate'
import { meetErrorMessage } from './meetUtils'
import { CallManagerContext } from '../../calls/callManagerShared'
import { useMeetCall } from './meetCallShared'
import './meet.css'

function MeetLobby({ meetingId }: { meetingId: string }) {
  const navigate = useNavigate()
  const workspaceCall = useContext(CallManagerContext)?.isBusy
  const { activeCall, start, restore } = useMeetCall()
  const [microphone, setMicrophone] = useState(false)
  const [camera, setCamera] = useState(false)
  const [busy, setBusy] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('Видеовстреча')
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const setSession = useCallback(
    (session: MeetSession) => {
      if (mounted.current) start({ session, title, microphone, camera })
    },
    [start, title, microphone, camera],
  )
  useEffect(() => {
    let cancelled = false
    void meetApi
      .meeting(meetingId)
      .then((meeting) => {
        if (!cancelled) setTitle(meeting.title || 'Видеовстреча')
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [meetingId])
  useEffect(() => {
    if (!waiting) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const result = await meetApi.joinStatus(meetingId)
        if (cancelled) return
        if (result.status === 'admitted') {
          const joined = await meetApi.join(meetingId)
          if (!cancelled) {
            setSession(joined)
            setWaiting(false)
          }
          return
        }
        if (result.status === 'denied') {
          setWaiting(false)
          setError('Организатор отклонил запрос на вход.')
          return
        }
      } catch (err) {
        if (!cancelled) {
          setWaiting(false)
          setError(meetErrorMessage(err))
        }
        return
      }
      if (!cancelled) timer = setTimeout(() => void poll(), 3000)
    }
    void poll()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [waiting, meetingId, setSession])
  const join = async () => {
    if (workspaceCall) return
    setBusy(true)
    setError('')
    try {
      setSession(await meetApi.join(meetingId))
    } catch (err) {
      if (err instanceof HttpError && err.status === 403) {
        try {
          const request = await meetApi.requestJoin(meetingId)
          if (request.status === 'admitted')
            setSession(await meetApi.join(meetingId))
          else if (request.status === 'denied')
            setError('Организатор отклонил запрос на вход.')
          else setWaiting(true)
        } catch (requestError) {
          setError(meetErrorMessage(requestError))
        }
      } else setError(meetErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  if (activeCall)
    return (
      <div className="meet-page">
        <div className="meet-gate">
          <h1>Встреча продолжается</h1>
          <p>{activeCall.title}</p>
          <button className="meet-button primary" onClick={restore}>
            Развернуть встречу
          </button>
          <p className="meet-caption">
            Чтобы войти в другую встречу, сначала завершите текущую.
          </p>
        </div>
      </div>
    )
  return (
    <div className="meet-page">
      <button className="meet-button" onClick={() => navigate('/meet')}>
        <ArrowLeft size={16} />
        Все встречи
      </button>
      <div className="meet-lobby">
        <div className="meet-lobby-preview">
          <div className="meet-avatar">
            <Video size={42} />
          </div>
          <p>Камера {camera ? 'включится при входе' : 'выключена'}</p>
          <div className="meet-actions">
            <button
              className="meet-control"
              aria-label={
                microphone ? 'Выключить микрофон' : 'Включить микрофон'
              }
              aria-pressed={microphone}
              onClick={() => setMicrophone((value) => !value)}
            >
              {microphone ? <Mic /> : <MicOff />}
            </button>
            <button
              className="meet-control"
              aria-label={camera ? 'Выключить камеру' : 'Включить камеру'}
              aria-pressed={camera}
              onClick={() => setCamera((value) => !value)}
            >
              {camera ? <Video /> : <VideoOff />}
            </button>
          </div>
        </div>
        <div className="meet-lobby-content">
          <div className="meet-eyebrow">MEET</div>
          <h1>{title}</h1>
          <p>
            {waiting
              ? 'Запрос отправлен. Ожидаем допуска организатора.'
              : 'Готовы присоединиться? Камера и микрофон включатся только после входа, если вы их выбрали.'}
          </p>
          {workspaceCall && (
            <p className="meet-error" role="status">
              Сначала завершите текущий звонок Workspace.
            </p>
          )}
          {error && (
            <p className="meet-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="meet-button primary"
            disabled={busy || waiting || Boolean(workspaceCall)}
            onClick={() => void join()}
          >
            {busy
              ? 'Подключаемся…'
              : waiting
                ? 'Ожидаем организатора…'
                : 'Присоединиться'}
          </button>
          {waiting && (
            <p role="status" className="meet-caption">
              Можно вернуться к списку встреч, чтобы прекратить ожидание.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function MeetCallPage() {
  const { meetingId } = useParams<{ meetingId: string }>()
  if (!meetingId) return null
  return (
    <MeetAccountGate>
      <MeetLobby key={meetingId} meetingId={meetingId} />
    </MeetAccountGate>
  )
}
