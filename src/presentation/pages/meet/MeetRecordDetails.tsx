import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarDays, Check, ChevronDown, ChevronUp, Clock3, Copy, Download, FileText, Search, Users, X } from 'lucide-react'
import { meetApi, type MeetMeeting } from '../../../infrastructure/meet/meetApi'
import AppModal from '../../../shared/ui/AppModal'
import { TranscriptLine } from './MeetTranscriptPanel'
import { activeChunkIndex, formatOffset, orderedChunks, playbackSeconds, speakerOf, transcriptToText } from './meetTranscript'
import { transcriptMatches } from './meetTranscriptSearch'
import './meetRecordDetails.css'
import MeetActionsPanel from './MeetActionsPanel'

const fileNameOf = (title: string, startedAt: string) => {
  const safe = title.replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').trim().slice(0, 80)
  return `${safe || 'meet'} ${startedAt.slice(0, 10)}.txt`
}

function HighlightedText({ text, query, firstMatch, selected }: {
  text: string
  query: string
  firstMatch: number
  selected: number
}) {
  const parts: ReactNode[] = []
  let cursor = 0
  transcriptMatches(text, query).forEach((range, index) => {
    parts.push(text.slice(cursor, range.start))
    const match = firstMatch + index
    parts.push(<mark key={range.start} data-transcript-match={match} className={selected === match ? 'is-current' : undefined}>{text.slice(range.start, range.end)}</mark>)
    cursor = range.end
  })
  parts.push(text.slice(cursor))
  return <>{parts}</>
}

/** Finished-meeting details reuse the same phrase and recording timeline as live captions. */
export default function MeetRecordDetails({ meeting: initial, formatDate, onClose, initialOffset, initialSegment }: {
  meeting: MeetMeeting
  formatDate: (date: string) => string
  onClose: () => void
  initialOffset?: number
  initialSegment?: string
}) {
  const { t } = useTranslation('shell')
  const [meeting, setMeeting] = useState(initial)
  const [loading, setLoading] = useState(true)
  const [position, setPosition] = useState(0)
  const [query, setQuery] = useState('')
  const [matchIndex, setMatchIndex] = useState(0)
  const [notice, setNotice] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const readingRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const soughtInitial = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    meetApi.meeting(initial.id, controller.signal)
      .then((fresh) => { if (!controller.signal.aborted) setMeeting(fresh) })
      .catch(() => { /* Preserve the list's transcript when refreshing fails. */ })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [initial.id])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3500)
    return () => window.clearTimeout(timer)
  }, [notice])

  const chunks = useMemo(() => orderedChunks(meeting.chunks), [meeting.chunks])
  const groups = useMemo(() => {
    const result: { key: string; indexes: number[] }[] = []
    chunks.forEach((chunk, index) => {
      const previous = chunks[index - 1]
      const continued = previous
        && (previous.participant_identity || speakerOf(previous)) === (chunk.participant_identity || speakerOf(chunk))
        && chunk.start_ms - previous.end_ms < 30_000
      if (continued) result[result.length - 1].indexes.push(index)
      else result.push({ key: `${chunk.track_sid}:${chunk.track_sequence}`, indexes: [index] })
    })
    return result
  }, [chunks])
  const speakers = useMemo(() => [...new Set(chunks.map(chunk => chunk.participant_identity || speakerOf(chunk)))], [chunks])
  const recording = meeting.recording_url || null
  const active = recording ? activeChunkIndex(chunks, position) : -1
  const title = meeting.title || t('meet.meeting')
  const hasText = !meeting.transcript_restricted && (chunks.length > 0 || Boolean(meeting.transcript?.trim()))
  const text = hasText ? (chunks.length ? transcriptToText(chunks) : meeting.transcript) : ''
  const texts = useMemo(() => meeting.transcript_restricted ? [] : chunks.length ? chunks.map(chunk => chunk.transcript.trim()) : [meeting.transcript || ''], [chunks, meeting.transcript, meeting.transcript_restricted])
  const matches = useMemo(() => {
    let total = 0
    const offsets: number[] = []
    for (const value of texts) {
      offsets.push(total)
      total += transcriptMatches(value, query).length
    }
    return { total, offsets }
  }, [texts, query])
  const selectedMatch = matches.total ? matchIndex % matches.total : -1
  const elapsed = meeting.completed_at ? Date.parse(meeting.completed_at) - Date.parse(meeting.started_at) : null
  const duration = elapsed !== null && Number.isFinite(elapsed) && elapsed >= 0 ? formatOffset(elapsed) : null

  useLayoutEffect(() => {
    if (selectedMatch < 0) return
    const mark = readingRef.current?.querySelector<HTMLElement>(`[data-transcript-match="${selectedMatch}"]`)
    const body = readingRef.current?.closest('.ts-dialog__body')
    if (!mark || !body) return
    const group = mark.closest('details')
    if (group) group.open = true
    const toolbar = body.querySelector('.meet-record-toolbar')?.getBoundingClientRect().height ?? 0
    const top = mark.getBoundingClientRect().top - body.getBoundingClientRect().top
    body.scrollTo({ top: body.scrollTop + top - toolbar - 35, behavior: 'instant' })
  }, [selectedMatch, query])

  const seek = (seconds: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = seconds
    setPosition(seconds)
    void video.play().catch(() => { /* A seek still works when autoplay is blocked. */ })
  }
  const seekSegment = (segmentId: string) => {
    const index = chunks.findIndex(chunk => `${chunk.track_sid}:${chunk.track_sequence}` === segmentId)
    if (index < 0) return
    const seconds = recording ? playbackSeconds(chunks[index]) : null
    if (seconds !== null) seek(seconds)
    const line = readingRef.current?.querySelectorAll<HTMLElement>('.meet-transcript-line')[index]
    line?.closest('details')?.setAttribute('open', '')
    line?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  useEffect(() => {
    if ((initialOffset === undefined && !initialSegment) || soughtInitial.current || loading || !chunks.length) return
    soughtInitial.current = true
    if (initialSegment) {
      // A segment ID disambiguates simultaneous speakers. Never seek another
      // speaker's phrase when an exact source segment has disappeared.
      const frame = requestAnimationFrame(() => seekSegment(initialSegment))
      return () => cancelAnimationFrame(frame)
    }
    if (initialOffset === undefined) return
    const index = chunks.findIndex(chunk => chunk.start_ms >= initialOffset)
    const phrase = chunks[index < 0 ? chunks.length - 1 : index]
    const frame = requestAnimationFrame(() => seekSegment(`${phrase.track_sid}:${phrase.track_sequence}`))
    return () => cancelAnimationFrame(frame)
    // Apply a source link once after refreshing the transcript.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOffset, initialSegment, loading, chunks])
  const download = () => {
    if (!hasText) return
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = fileNameOf(title, meeting.started_at)
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const copy = async () => {
    if (!hasText) return
    try {
      await navigator.clipboard.writeText(text)
      setNotice(t('meet.recordDetails.copied'))
    } catch { setNotice(t('meet.recordDetails.copyFailed')) }
  }
  const changeQuery = (value: string) => { setQuery(value); setMatchIndex(0) }
  const move = (delta: number) => { if (matches.total) setMatchIndex(value => (value + delta + matches.total) % matches.total) }

  return (
    <AppModal title={title} onClose={onClose} maxWidth={920} className="meet-record-dialog"
      header={<>
        <span className="meet-record-document-icon" aria-hidden="true"><FileText size={26} /></span>
        <div className="meet-record-heading">
          <p className="meet-record-eyebrow">{t('meet.recordDetails.materials')}</p>
          <h2>{title}</h2>
          <div className="meet-record-metadata">
            <span><CalendarDays size={14} />{formatDate(meeting.started_at)}</span>
            {duration && <span><Clock3 size={14} />{duration}</span>}
            {hasText && speakers.length > 0 && <span><Users size={14} />{t('meet.recordDetails.participants', { count: speakers.length })}</span>}
          </div>
        </div>
        {hasText && <div className="meet-record-actions">
          <button type="button" className="meet-record-icon-button" onClick={() => void copy()} aria-label={t('meet.recordDetails.copy')} title={t('meet.recordDetails.copy')}><Copy size={16} /><span>{t('meet.recordDetails.copyButton')}</span></button>
          <button type="button" className="meet-record-download" onClick={download}><Download size={17} />{t('meet.recordDetails.download')}</button>
        </div>}
      </>}
      footer={<div className="meet-record-footer">
        <span className="meet-record-footer-label"><FileText size={14} />{hasText && chunks.length ? t('meet.recordDetails.phrases', { count: chunks.length }) : t('meet.recordDetails.transcript')}</span>
        <span className="meet-record-notice" role="status">{notice}</span>
        <button type="button" className="meet-record-close" onClick={onClose}>{t('meet.recordDetails.close')}</button>
      </div>}
    >
      {meeting.agenda && <details className="meet-record-agenda"><summary>{t('meet.recordDetails.agenda')}</summary><p>{meeting.agenda}</p></details>}
      {hasText && meeting.status === 'completed' && <MeetActionsPanel meetingId={meeting.id} onSeek={seekSegment} />}
      {recording && <section className="meet-record-media" aria-label={t('meet.recordDetails.recording')}>
        <h3>{t('meet.recordDetails.recording')}</h3>
        <video ref={videoRef} className="meet-record-video" src={recording} controls preload="metadata" onTimeUpdate={event => setPosition(event.currentTarget.currentTime)} />
      </section>}
      <div className="meet-record-toolbar">
        <h3>{t('meet.recordDetails.heading')}{hasText && chunks.length > 0 && <span className="meet-record-count">{chunks.length}</span>}</h3>
        {hasText && <div className="meet-record-search">
          <Search size={16} aria-hidden="true" />
          <input ref={searchRef} data-ui="bare" type="text" aria-label={t('meet.recordDetails.search')} placeholder={t('meet.recordDetails.search')} value={query} onChange={event => changeQuery(event.target.value)} onKeyDown={event => {
            if (event.key === 'Enter') { event.preventDefault(); move(event.shiftKey ? -1 : 1) }
            if (event.key === 'Escape' && query) { event.preventDefault(); event.stopPropagation(); changeQuery('') }
          }} />
          {query.trim() && <>
            <span className="meet-record-search-count" aria-live="polite">{matches.total ? `${selectedMatch + 1}/${matches.total}` : '0'}</span>
            <button type="button" disabled={!matches.total} aria-label={t('meet.recordDetails.previousMatch')} onClick={() => move(-1)}><ChevronUp size={14} /></button>
            <button type="button" disabled={!matches.total} aria-label={t('meet.recordDetails.nextMatch')} onClick={() => move(1)}><ChevronDown size={14} /></button>
            <button type="button" aria-label={t('meet.recordDetails.clearSearch')} onClick={() => { changeQuery(''); searchRef.current?.focus() }}><X size={14} /></button>
          </>}
        </div>}
      </div>
      {hasText && query.trim() && !matches.total && <p className="meet-record-no-matches" role="status">{t('meet.recordDetails.noMatches')}</p>}
      <div className="meet-record-reading" ref={readingRef}>
        {meeting.transcript_restricted ? <div className="meet-record-empty"><FileText size={28} aria-hidden="true" /><p>{t('meet.captions.restricted')}</p></div>
          : hasText ? <>
            {chunks.length > 0 ? <>
              <p className="meet-record-start">{t('meet.recordDetails.start')}</p>
              <ol className="meet-transcript-list meet-transcript-list--record">
                {groups.map(group => {
                  const chunk = chunks[group.indexes[0]]
                  const speaker = speakerOf(chunk) || t('meet.captions.speakerUnknown')
                  const avatar = { initials: speaker.split(/\s+/).slice(0, 2).map(part => part[0]).join(''), tone: speakers.indexOf(chunk.participant_identity || speakerOf(chunk)) }
                  const last = chunks[group.indexes[group.indexes.length - 1]]
                  return <li key={group.key} className="meet-record-group">
                    <details open>
                      <summary className="meet-record-group-toggle">
                        <span className="meet-record-avatar" data-tone={avatar.tone % 3} aria-hidden="true">{avatar.initials}</span>
                        <span className="meet-record-group-name">{speaker}</span>
                        <span className="meet-record-group-info">
                          <span>{t('meet.recordDetails.phrases', { count: group.indexes.length })}</span>
                          <span>{formatOffset(chunk.start_ms)}{last !== chunk && ` – ${formatOffset(last.start_ms)}`}</span>
                        </span>
                        <ChevronDown className="meet-record-group-chevron" size={16} aria-hidden="true" />
                      </summary>
                      <ol className="meet-record-group-lines">
                        {group.indexes.map(index => {
                          const phrase = chunks[index]
                          const seconds = recording ? playbackSeconds(phrase) : null
                          return <TranscriptLine key={`${phrase.track_sid}:${phrase.track_sequence}`} chunk={phrase} offsetMs={seconds !== null ? seconds * 1000 : phrase.start_ms} active={index === active} onSeek={seconds !== null ? () => seek(seconds) : undefined}
                            continued avatar={avatar}
                            text={<HighlightedText text={phrase.transcript.trim()} query={query} firstMatch={matches.offsets[index]} selected={selectedMatch} />} />
                        })}
                      </ol>
                    </details>
                  </li>
                })}
              </ol>
              <p className="meet-record-end"><Check size={12} />{t('meet.recordDetails.end')}</p>
            </> : <p className="meet-record-flat"><HighlightedText text={meeting.transcript} query={query} firstMatch={0} selected={selectedMatch} /></p>}
          </> : <div className="meet-record-empty" role="status"><FileText size={28} aria-hidden="true" /><p>{loading ? t('meet.recordDetails.loading') : t('meet.recordDetails.empty')}</p></div>}
      </div>
    </AppModal>
  )
}
