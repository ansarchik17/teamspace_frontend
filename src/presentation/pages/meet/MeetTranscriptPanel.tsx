import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown, X } from 'lucide-react'
import {
  meetApi,
  type MeetTranscriptChunk,
} from '../../../infrastructure/meet/meetApi'
import {
  TRANSCRIPT_POLL_MS,
  TRANSCRIPT_RETRY_MS,
  countNew,
  formatOffset,
  isLowConfidence,
  languageBadge,
  orderedChunks,
  speakerOf,
} from './meetTranscript'

/** Distance from the bottom (px) at which the list still follows new phrases. */
const FOLLOW_THRESHOLD = 48

export function TranscriptLine({
  chunk,
  offsetMs,
  active = false,
  onSeek,
  avatar,
  continued = false,
  text,
}: {
  chunk: MeetTranscriptChunk
  offsetMs: number
  active?: boolean
  onSeek?: () => void
  avatar?: { initials: string; tone: number }
  continued?: boolean
  text?: ReactNode
}) {
  const { t } = useTranslation('shell')
  const low = isLowConfidence(chunk)
  const badge = languageBadge(chunk)
  const time = formatOffset(offsetMs)
  const timestamp = onSeek ? (
    <button type="button" className="meet-transcript-time" onClick={onSeek}
      aria-label={t('meet.recordDetails.seek', { time })}>{time}</button>
  ) : <span className="meet-transcript-time">{time}</span>
  const content = <>
      <div className="meet-transcript-meta">
        <span className="meet-transcript-speaker">
          {speakerOf(chunk) || t('meet.captions.speakerUnknown')}
        </span>
        {timestamp}
        {badge && <span className="meet-transcript-lang">{badge}</span>}
      </div>
      <p>{text ?? chunk.transcript.trim()}</p>
    </>
  return (
    <li
      className={
        'meet-transcript-line' +
        (low ? ' is-unsure' : '') +
        (active ? ' is-active' : '') +
        (continued ? ' is-continuation' : '')
      }
      title={low ? t('meet.captions.unsure') : undefined}
    >
      {avatar ? <>
        {!continued && <span className="meet-record-avatar" data-tone={avatar.tone % 3} aria-hidden="true">{avatar.initials}</span>}
        <div className="meet-record-turn-content">
          <div className={`meet-record-speaker${continued ? ' meet-record-speaker--hidden' : ''}`}>
            {speakerOf(chunk) || t('meet.captions.speakerUnknown')}
          </div>
          <div className="meet-record-phrase">
            {timestamp}
            <p>{text ?? chunk.transcript.trim()}</p>
            {badge && <span className="meet-transcript-lang">{badge}</span>}
          </div>
        </div>
      </> : content}
    </li>
  )
}

/**
 * Live speech-to-text of the current call. QMeet's LiveKit agent cuts every
 * participant's microphone by pauses and stores each phrase on the meeting, so
 * the same rows later make up the transcript of the meeting record. The
 * workspace proxy forwards no WebSocket, hence polling while the panel is open.
 */
export default function MeetTranscriptPanel({
  meetingId,
  onClose,
}: {
  meetingId: string
  onClose: () => void
}) {
  const { t } = useTranslation('shell')
  const [chunks, setChunks] = useState<MeetTranscriptChunk[]>([])
  const [loaded, setLoaded] = useState(false)
  const [restricted, setRestricted] = useState(false)
  const [failed, setFailed] = useState(false)
  const [unseen, setUnseen] = useState(0)
  const listRef = useRef<HTMLOListElement>(null)
  const follow = useRef(true)
  const shown = useRef<MeetTranscriptChunk[]>([])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    const schedule = (ms: number) => {
      if (!cancelled) timer = setTimeout(() => void poll(), ms)
    }
    const poll = async () => {
      if (document.visibilityState === 'hidden') {
        schedule(TRANSCRIPT_POLL_MS)
        return
      }
      controller = new AbortController()
      try {
        const meeting = await meetApi.meeting(meetingId, controller.signal)
        if (cancelled) return
        const next = orderedChunks(meeting.chunks)
        setRestricted(Boolean(meeting.transcript_restricted))
        setFailed(false)
        setLoaded(true)
        const previous = shown.current
        const added = countNew(previous, next)
        if (added > 0 || previous.length !== next.length) {
          shown.current = next
          setChunks(next)
          if (!follow.current && added > 0) setUnseen((value) => value + added)
        }
        schedule(TRANSCRIPT_POLL_MS)
      } catch {
        if (cancelled) return
        setFailed(true)
        setLoaded(true)
        schedule(TRANSCRIPT_RETRY_MS)
      }
    }
    void poll()
    return () => {
      cancelled = true
      clearTimeout(timer)
      controller?.abort()
    }
  }, [meetingId])

  const scrollToEnd = useCallback(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
    follow.current = true
    setUnseen(0)
  }, [])

  // Follow new phrases only while the reader is at the bottom; the counter of
  // unseen phrases is raised by the poll, never while following.
  useLayoutEffect(() => {
    const list = listRef.current
    if (follow.current && list) list.scrollTop = list.scrollHeight
  }, [chunks])

  const onScroll = () => {
    const list = listRef.current
    if (!list) return
    follow.current =
      list.scrollHeight - list.scrollTop - list.clientHeight < FOLLOW_THRESHOLD
    if (follow.current) setUnseen(0)
  }

  return (
    <aside
      className="meet-transcript-panel"
      aria-label={t('meet.captions.title')}
    >
      <header>
        <h3>{t('meet.captions.title')}</h3>
        <button
          type="button"
          className="meet-transcript-close"
          aria-label={t('meet.captions.hide')}
          title={t('meet.captions.hide')}
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </header>
      <p className="meet-transcript-hint">{t('meet.captions.hint')}</p>
      {failed && (
        <p className="meet-transcript-state is-error" role="status">
          {t('meet.captions.error')}
        </p>
      )}
      {restricted ? (
        <p className="meet-transcript-state">{t('meet.captions.restricted')}</p>
      ) : chunks.length === 0 ? (
        <p className="meet-transcript-state" role="status">
          {loaded ? t('meet.captions.empty') : t('meet.captions.loading')}
        </p>
      ) : (
        <ol
          ref={listRef}
          className="meet-transcript-list"
          onScroll={onScroll}
          aria-live="polite"
          aria-relevant="additions"
        >
          {chunks.map((chunk) => (
            <TranscriptLine
              key={`${chunk.track_sid}:${chunk.track_sequence}`}
              chunk={chunk}
              offsetMs={chunk.start_ms}
            />
          ))}
        </ol>
      )}
      {unseen > 0 && (
        <button
          type="button"
          className="meet-transcript-unseen"
          onClick={scrollToEnd}
        >
          <ArrowDown size={14} />
          {t('meet.captions.newPhrases', { count: unseen })}
        </button>
      )}
    </aside>
  )
}
