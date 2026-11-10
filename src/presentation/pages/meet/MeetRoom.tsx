import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import useMeetWindow from './useMeetWindow'
import { Room, RoomEvent, Track, type Participant } from 'livekit-client'
import {
  Captions,
  CaptionsOff,
  Copy,
  Maximize2,
  PictureInPicture2,
  Expand,
  Shrink,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Video,
  VideoOff,
} from 'lucide-react'
import {
  meetApi,
  type MeetSession,
  type MeetWaitingRequest,
} from '../../../infrastructure/meet/meetApi'
import { meetErrorMessage, meetLink } from './meetUtils'
import MeetTranscriptPanel from './MeetTranscriptPanel'

const CAPTIONS_KEY = 'meet.captions.open'
const readCaptionsPreference = () => {
  try {
    return window.localStorage.getItem(CAPTIONS_KEY) === '1'
  } catch {
    return false
  }
}
const saveCaptionsPreference = (open: boolean) => {
  try {
    window.localStorage.setItem(CAPTIONS_KEY, open ? '1' : '0')
  } catch {
    /* private mode or blocked storage: the toggle still works for this call */
  }
}

const MediaViewContext = createContext('full')

function TrackMedia({
  track,
  muted = false,
  video = false,
  mirror = false,
}: {
  track: Track
  muted?: boolean
  video?: boolean
  mirror?: boolean
}) {
  const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null)
  const view = useContext(MediaViewContext)
  const attachmentView = video ? view : 'audio'
  useEffect(() => {
    const element = ref.current
    if (!element) return
    track.attach(element)
    return () => {
      track.detach(element)
    }
    // Reattach video after moving between documents so LiveKit recalculates PiP visibility.
  }, [track, attachmentView])
  return video ? (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      style={{ transform: mirror ? 'scaleX(-1)' : undefined }}
    />
  ) : (
    <audio ref={ref} autoPlay />
  )
}

function ParticipantTile({
  participant,
  local,
}: {
  participant: Participant
  local: boolean
}) {
  const camera = participant.getTrackPublication(Track.Source.Camera)
  const name = participant.name || participant.identity
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
  return (
    <div
      className={
        'meet-video-tile' + (participant.isSpeaking ? ' is-speaking' : '')
      }
    >
      {camera?.track && !camera.isMuted ? (
        <TrackMedia track={camera.track} video muted={local} mirror={local} />
      ) : (
        <div className="meet-avatar">{initials}</div>
      )}
      <div className="meet-participant-label">
        <span>
          {name}
          {local ? ' (вы)' : ''}
        </span>
        {participant.isMicrophoneEnabled ? (
          <Mic size={14} />
        ) : (
          <MicOff size={14} />
        )}
      </div>
    </div>
  )
}

export default function MeetRoom({
  session,
  title,
  restoreVersion,
  microphone,
  camera,
  guest = false,
  onLeave,
}: {
  session: MeetSession
  title: string
  restoreVersion: number
  microphone: boolean
  camera: boolean
  guest?: boolean
  onLeave: () => void
}) {
  const [room] = useState(
    () => new Room({
      adaptiveStream: true,
      dynacast: true,
      // Create peers with the server's ICE settings. The single-peer join path
      // applies them later via setConfiguration, which some WebViews reject.
      singlePeerConnection: false,
    }),
  )
  const [, render] = useState(0)
  const [status, setStatus] = useState('Подключаемся…')
  const [connected, setConnected] = useState(false)
  const view = useMeetWindow(
    session.meeting_id,
    connected,
    restoreVersion,
    guest,
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [waiting, setWaiting] = useState<MeetWaitingRequest[]>([])
  const [notice, setNotice] = useState('')
  const { t } = useTranslation('shell')
  // Guests join without a workspace session, so they cannot read the meeting API.
  const captionsAvailable = !guest
  const [captionsOpen, setCaptionsOpen] = useState(readCaptionsPreference)
  const toggleCaptions = () =>
    setCaptionsOpen((open) => {
      saveCaptionsPreference(!open)
      return !open
    })
  const showCaptions = captionsAvailable && captionsOpen && !view.compact
  const initialMedia = useRef({ microphone, camera })
  const canAdmit = session.role === 'organizer' || session.role === 'moderator'
  useEffect(() => {
    let cancelled = false
    const update = () => {
      if (!cancelled) render((value) => value + 1)
    }
    const mutations = [
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.ParticipantNameChanged,
      RoomEvent.ActiveSpeakersChanged,
    ] as const
    mutations.forEach((event) => room.on(event, update))
    room.on(RoomEvent.Reconnecting, () => {
      if (!cancelled) {
        setConnected(false)
        setStatus('Восстанавливаем соединение…')
      }
    })
    room.on(RoomEvent.Reconnected, () => {
      if (!cancelled) {
        setConnected(true)
        setStatus('На связи')
      }
    })
    room.on(RoomEvent.Disconnected, () => {
      if (!cancelled) {
        setConnected(false)
        setStatus('Соединение завершено')
      }
    })
    void (async () => {
      try {
        await Promise.resolve()
        if (cancelled) return
        await room.connect(session.livekit_url, session.participant_token)
        if (cancelled) {
          await room.disconnect()
          return
        }
        setConnected(true)
        setStatus('На связи')
        try {
          await room.localParticipant.setMicrophoneEnabled(
            initialMedia.current.microphone,
          )
          if (cancelled) {
            await room.disconnect()
            return
          }
          await room.localParticipant.setCameraEnabled(
            initialMedia.current.camera,
          )
        } catch (err) {
          if (!cancelled)
            setError(`Не удалось включить устройство: ${meetErrorMessage(err)}`)
        }
        if (cancelled) {
          await room.disconnect()
          return
        }
        update()
      } catch (err) {
        if (!cancelled) setError(meetErrorMessage(err))
      }
    })()
    return () => {
      cancelled = true
      room.removeAllListeners()
      void room.disconnect()
    }
  }, [room, session.livekit_url, session.participant_token])
  useEffect(() => {
    if (!canAdmit) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const rows = await meetApi.waiting(session.meeting_id)
        if (!cancelled)
          setWaiting(rows.filter((row) => row.status === 'pending'))
      } catch (err) {
        if (!cancelled) setError(meetErrorMessage(err))
      }
      if (!cancelled) timer = setTimeout(() => void poll(), 5000)
    }
    void poll()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [canAdmit, session.meeting_id])
  const action = async (work: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    try {
      await work()
      render((value) => value + 1)
    } catch (err) {
      setError(meetErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  const participants = [
    room.localParticipant,
    ...room.remoteParticipants.values(),
  ].filter((participant) => !participant.isAgent)
  const screens = participants
    .map((participant) => ({
      participant,
      publication: participant.getTrackPublication(Track.Source.ScreenShare),
    }))
    .filter(({ publication }) => publication?.track && !publication.isMuted)
  const featured =
    room.activeSpeakers.find(
      (participant) =>
        !participant.isAgent && participant !== room.localParticipant,
    ) ??
    participants.find((participant) => participant !== room.localParticipant) ??
    room.localParticipant
  const visibleParticipants = view.compact ? [featured] : participants
  const visibleScreens = view.compact ? screens.slice(0, 1) : screens
  const count = participants.length
  const participantWord =
    count % 10 === 1 && count % 100 !== 11
      ? 'участник'
      : count % 10 >= 2 &&
          count % 10 <= 4 &&
          (count % 100 < 12 || count % 100 > 14)
        ? 'участника'
        : 'участников'
  return createPortal(
    <MediaViewContext.Provider value={view.mode}>
      <section
        className={'meet-room' + (view.compact ? ' meet-room--compact' : '')}
        aria-label={title}
        role={view.compact ? 'region' : 'dialog'}
        aria-modal={view.compact ? undefined : true}
      >
        <header className="meet-room-header" {...view.dragHandlers}>
          <div>
            <h2>{title}</h2>
            <span
              className={
                'meet-room-status' + (connected ? ' is-connected' : '')
              }
              role="status"
            >
              {status} · {count} {participantWord}
            </span>
          </div>
          <div className="meet-room-window-actions">
            {view.compact ? (
              <button
                className="meet-control"
                aria-label="Развернуть встречу"
                title="Развернуть встречу"
                onClick={view.restore}
              >
                <Maximize2 size={18} />
              </button>
            ) : (
              <>
                <button
                  className="meet-control"
                  aria-label="Свернуть в окно"
                  title="Свернуть в окно"
                  onClick={() => void view.minimize()}
                >
                  <PictureInPicture2 size={18} />
                </button>
                <button
                  className="meet-control"
                  aria-label={
                    view.fullscreen
                      ? 'Выйти из полноэкранного режима'
                      : 'Во весь экран'
                  }
                  title="Во весь экран"
                  onClick={() => void view.toggleFullscreen()}
                >
                  {view.fullscreen ? (
                    <Shrink size={18} />
                  ) : (
                    <Expand size={18} />
                  )}
                </button>
              </>
            )}
            <button
              className="meet-button meet-invite-button"
              onClick={() =>
                void action(async () => {
                  await navigator.clipboard.writeText(
                    meetLink(session.meeting_id),
                  )
                  setNotice('Ссылка скопирована')
                })
              }
            >
              <Copy size={16} />
              Пригласить
            </button>
          </div>
        </header>
        {view.message && (
          <p className="meet-notice" role="status">
            {view.message}
          </p>
        )}
        {error && (
          <p className="meet-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="meet-notice">
            {notice}
          </p>
        )}
        {waiting.length > 0 && (
          <div className="meet-waiting-list">
            {waiting.map((request) => (
              <div key={request.id}>
                <span>{request.user.name} хочет присоединиться</span>
                <button
                  className="meet-button"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await meetApi.decide(
                        session.meeting_id,
                        request.id,
                        'deny',
                      )
                      setWaiting((rows) =>
                        rows.filter((row) => row.id !== request.id),
                      )
                    })
                  }
                >
                  Отклонить
                </button>
                <button
                  className="meet-button primary"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await meetApi.decide(
                        session.meeting_id,
                        request.id,
                        'admit',
                      )
                      setWaiting((rows) =>
                        rows.filter((row) => row.id !== request.id),
                      )
                    })
                  }
                >
                  Допустить
                </button>
              </div>
            ))}
          </div>
        )}
        <div
          className={
            'meet-room-body' + (showCaptions ? ' meet-room-body--captions' : '')
          }
        >
          <div
            className={
              'meet-room-stage' +
              (screens.length > 0 ? ' meet-room-stage--sharing' : '')
            }
          >
            {visibleScreens.map(({ participant, publication }) => (
              <div className="meet-screen-tile" key={participant.identity}>
                <TrackMedia track={publication!.track!} video muted />
                <span>Экран: {participant.name || participant.identity}</span>
              </div>
            ))}
            {(!view.compact || visibleScreens.length === 0) && (
              <div className="meet-video-grid">
                {visibleParticipants.map((participant) => (
                  <ParticipantTile
                    key={participant.identity}
                    participant={participant}
                    local={participant === room.localParticipant}
                  />
                ))}
              </div>
            )}
          </div>
          {showCaptions && (
            <MeetTranscriptPanel
              meetingId={session.meeting_id}
              onClose={toggleCaptions}
            />
          )}
        </div>
        <div className="meet-remote-audio" aria-hidden="true">
          {participants
            .filter((participant) => participant !== room.localParticipant)
            .flatMap((participant) =>
              [...participant.audioTrackPublications.values()]
                .filter((publication) => publication.track)
                .map((publication) => (
                  <TrackMedia
                    key={publication.trackSid}
                    track={publication.track!}
                  />
                )),
            )}
        </div>
        <footer className="meet-call-controls">
          <button
            className={
              'meet-control' +
              (!room.localParticipant.isMicrophoneEnabled ? ' off' : '')
            }
            aria-label={
              room.localParticipant.isMicrophoneEnabled
                ? 'Выключить микрофон'
                : 'Включить микрофон'
            }
            aria-pressed={room.localParticipant.isMicrophoneEnabled}
            title={
              room.localParticipant.isMicrophoneEnabled
                ? 'Выключить микрофон'
                : 'Включить микрофон'
            }
            disabled={busy || !connected}
            onClick={() =>
              void action(() =>
                room.localParticipant.setMicrophoneEnabled(
                  !room.localParticipant.isMicrophoneEnabled,
                ),
              )
            }
          >
            {room.localParticipant.isMicrophoneEnabled ? <Mic /> : <MicOff />}
          </button>
          <button
            className={
              'meet-control' +
              (!room.localParticipant.isCameraEnabled ? ' off' : '')
            }
            aria-label={
              room.localParticipant.isCameraEnabled
                ? 'Выключить камеру'
                : 'Включить камеру'
            }
            aria-pressed={room.localParticipant.isCameraEnabled}
            title={
              room.localParticipant.isCameraEnabled
                ? 'Выключить камеру'
                : 'Включить камеру'
            }
            disabled={busy || !connected}
            onClick={() =>
              void action(() =>
                room.localParticipant.setCameraEnabled(
                  !room.localParticipant.isCameraEnabled,
                ),
              )
            }
          >
            {room.localParticipant.isCameraEnabled ? <Video /> : <VideoOff />}
          </button>
          <button
            className="meet-control"
            aria-label={
              room.localParticipant.isScreenShareEnabled
                ? 'Остановить демонстрацию'
                : 'Демонстрация экрана'
            }
            title={
              room.localParticipant.isScreenShareEnabled
                ? 'Остановить демонстрацию'
                : 'Демонстрация экрана'
            }
            aria-pressed={room.localParticipant.isScreenShareEnabled}
            disabled={busy || !connected}
            onClick={() =>
              void action(() =>
                room.localParticipant.setScreenShareEnabled(
                  !room.localParticipant.isScreenShareEnabled,
                  { audio: true },
                ),
              )
            }
          >
            <MonitorUp />
          </button>
          {captionsAvailable && !view.compact && (
            <button
              className="meet-control meet-control--captions"
              aria-label={
                captionsOpen ? t('meet.captions.hide') : t('meet.captions.show')
              }
              title={
                captionsOpen ? t('meet.captions.hide') : t('meet.captions.show')
              }
              aria-pressed={captionsOpen}
              onClick={toggleCaptions}
            >
              {captionsOpen ? <Captions /> : <CaptionsOff />}
            </button>
          )}
          <button
            className="meet-control leave"
            aria-label="Покинуть встречу"
            title="Покинуть встречу"
            onClick={onLeave}
          >
            <PhoneOff />
          </button>
        </footer>
      </section>
    </MediaViewContext.Provider>,
    view.host,
  )
}
