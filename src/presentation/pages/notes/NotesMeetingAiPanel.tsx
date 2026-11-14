import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Note, NoteFolder } from '../../../domain/entities/Note'
import { HttpError } from '../../../infrastructure/http/HttpError'
import { HttpAlemAiRepository } from '../../../infrastructure/repositories/HttpAlemAiRepository'
import { HttpNoteRepository } from '../../../infrastructure/repositories/HttpNoteRepository'
import type {
  MeetingAiAnalyzeJob,
  MeetingAiAnalyzeJobActionItem,
  MeetingAiLanguage,
} from '../alemai/meeting-ai/types'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import { bid } from './noteDocumentUtils'
import { normalizeMeetingJobResult } from './meetingAiResultUtils'
import MeetingAudioNoteView from './MeetingAudioNoteView'
import { useTranslation } from 'react-i18next'
import { nt } from './notesText'
import { formatDate as formatSharedDate } from '../../../shared/i18n'

const c = {
  border: '#DDE3EE',
  text: '#0A1628',
  muted: '#8497B4',
  brand: '#2458D3',
  danger: '#DC2626',
  success: '#15803D',
}

const POLL_MS = 2500
const ACTIVE = new Set(['queued', 'running'])

const statusLabel: Record<string, string> = {
  queued: nt('meeting.t00'),
  running: nt('meeting.t01'),
  completed: nt('meeting.t02'),
  failed: nt('meeting.t03'),
}

const formatDate = (v?: string) => {
  if (!v) return ''
  const d = new Date(v)
  return Number.isNaN(d.getTime())
    ? ''
    : formatSharedDate(d, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const actionItemText = (item: string | MeetingAiAnalyzeJobActionItem) => {
  if (typeof item === 'string') return item
  const parts = [item.task, item.owner ? `(${item.owner})` : '', item.deadline ? nt('meeting.until', { date: item.deadline }) : ''].filter(Boolean)
  return parts.join(' ')
}

interface NotesMeetingAiPanelProps {
  repository: HttpAlemAiRepository
  notesRepo: HttpNoteRepository
  onNoteCreated: (note: Note) => void
  showError: (message: string) => void
  showSuccess: (message: string) => void
}

export default function NotesMeetingAiPanel({
  repository,
  notesRepo,
  onNoteCreated,
  showError,
  showSuccess,
}: NotesMeetingAiPanelProps) {
  useTranslation('notes')
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [lang, setLang] = useState<MeetingAiLanguage>('ru')
  const [model, setModel] = useState('')
  const [jobs, setJobs] = useState<MeetingAiAnalyzeJob[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [loadingJobs, setLoadingJobs] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [creatingNote, setCreatingNote] = useState(false)
  const savePending = useRef(false)
  const [folders, setFolders] = useState<NoteFolder[]>([])
  const [folderId, setFolderId] = useState('')
  const [pinned, setPinned] = useState(false)
  const actionsRef = useRef<HTMLDetailsElement | null>(null)
  const [isRec, setIsRec] = useState(false)
  const [recSec, setRecSec] = useState(0)
  const mrRef = useRef<MediaRecorder | null>(null)
  const stRef = useRef<MediaStream | null>(null)
  const chRef = useRef<Blob[]>([])
  const tmRef = useRef<number | null>(null)

  const selectedJob = useMemo(
    () => jobs.find((j) => j.job_id === selectedJobId) ?? null,
    [jobs, selectedJobId],
  )

  useEffect(() => {
    let cancelled = false
    void notesRepo.listFolders().then((list) => { if (!cancelled) setFolders(list) }).catch(() => {
      if (!cancelled) showError(nt('meeting.t04'))
    })
    return () => { cancelled = true }
  }, [notesRepo, showError])

  useEffect(() => {
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (actionsRef.current && (event instanceof KeyboardEvent ? event.key === 'Escape' : !actionsRef.current.contains(event.target as Node))) actionsRef.current.open = false
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close) }
  }, [])

  const sortJobs = useCallback((list: MeetingAiAnalyzeJob[]) => (
    list.sort(
      (a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime(),
    )
  ), [])

  const mergeJob = useCallback((existing: MeetingAiAnalyzeJob | undefined, job: MeetingAiAnalyzeJob): MeetingAiAnalyzeJob => {
    if (!existing) return job
    return {
      ...existing,
      ...job,
      filename: job.filename ?? existing.filename,
      error: job.error ?? existing.error ?? null,
      result: job.result ?? existing.result ?? null,
    }
  }, [])

  const mergeJobLists = useCallback((incoming: MeetingAiAnalyzeJob[], current: MeetingAiAnalyzeJob[] = []) => {
    const currentById = new Map(current.map((job) => [job.job_id, job]))
    const merged = incoming.map((job) => mergeJob(currentById.get(job.job_id), job))
    const incomingIds = new Set(incoming.map((job) => job.job_id))
    for (const job of current) {
      if (!incomingIds.has(job.job_id)) merged.push(job)
    }
    return sortJobs(merged)
  }, [mergeJob, sortJobs])

  const upsertJob = useCallback((job: MeetingAiAnalyzeJob) => {
    setJobs((prev) => {
      const next = prev.some((j) => j.job_id === job.job_id)
        ? prev.map((j) => (j.job_id === job.job_id ? mergeJob(j, job) : j))
        : [job, ...prev]
      return sortJobs(next)
    })
  }, [mergeJob, sortJobs])

  const loadJobs = useCallback(async () => {
    setLoadingJobs(true)
    try {
      const list = await repository.listMeetingAnalyzeJobs()
      setJobs((prev) => mergeJobLists(list, prev))
      setSelectedJobId((prev) => prev ?? list[0]?.job_id ?? null)
    } catch (e) {
      showError(e instanceof Error ? e.message : nt('meeting.t05'))
    } finally {
      setLoadingJobs(false)
    }
  }, [mergeJobLists, repository, showError])

  useEffect(() => {
    void loadJobs()
  }, [loadJobs])

  const selectedJobActive = Boolean(selectedJob && ACTIVE.has(selectedJob.status))
  useEffect(() => {
    if (!selectedJobId || !selectedJobActive) return
    let cancelled = false
    let pending = false
    const tick = async () => {
      if (pending) return
      pending = true
      try {
        const fresh = await repository.getMeetingAnalyzeJob(selectedJobId)
        if (!cancelled) upsertJob(fresh)
      } catch {
        /* ignore transient poll errors */
      } finally {
        pending = false
      }
    }

    void tick()
    const id = window.setInterval(() => void tick(), POLL_MS)
    return () => { cancelled = true; window.clearInterval(id) }
  }, [selectedJobActive, repository, selectedJobId, upsertJob])

  const needsJobDetails = selectedJob?.status === 'completed' && !selectedJob.result
  useEffect(() => {
    if (!selectedJobId || !needsJobDetails) return

    let cancelled = false

    const loadJobDetails = async () => {
      try {
        const fresh = await repository.getMeetingAnalyzeJob(selectedJobId)
        if (!cancelled) upsertJob(fresh)
      } catch {
        /* ignore detail fetch errors and keep list view fallback */
      }
    }

    void loadJobDetails()
    return () => {
      cancelled = true
    }
  }, [needsJobDetails, repository, selectedJobId, upsertJob])

  const clearRecTimer = () => {
    if (tmRef.current !== null) {
      window.clearInterval(tmRef.current)
      tmRef.current = null
    }
  }

  const stopStream = () => {
    stRef.current?.getTracks().forEach((t) => t.stop())
    stRef.current = null
  }

  const startAnalyze = async (targetFile?: File | null) => {
    if (submitting) return
    const audio = targetFile ?? file
    if (!audio) {
      showError(nt('meeting.t06'))
      return
    }
    setSubmitting(true)
    try {
      const created = await repository.startMeetingAnalyzeAsync(audio, {
        reportLanguage: lang,
        model: model.trim() || undefined,
      })
      const job: MeetingAiAnalyzeJob = {
        job_id: created.job_id,
        status: created.status,
        created_at: created.created_at,
        updated_at: created.updated_at,
        filename: audio.name,
        result: null,
        error: null,
      }
      upsertJob(job)
      setSelectedJobId(job.job_id)
      showSuccess(nt('meeting.t07'))
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) {
        showError(nt('meeting.t08'))
      } else {
        showError(e instanceof Error ? e.message : nt('meeting.t09'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const startRecording = async () => {
    if (isRec || submitting) return
    if (!('mediaDevices' in navigator) || !('MediaRecorder' in window)) {
      showError(nt('meeting.t10'))
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stRef.current = stream
      chRef.current = []
      setRecSec(0)
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : undefined
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      mrRef.current = rec
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chRef.current.push(e.data)
      }
      rec.onstop = () => {
        const blob = new Blob(chRef.current, { type: rec.mimeType || 'audio/webm' })
        const recorded = new File([blob], `meeting-${Date.now()}.webm`, { type: blob.type || 'audio/webm' })
        setFile(recorded)
        setIsRec(false)
        clearRecTimer()
        stopStream()
        void startAnalyze(recorded)
      }
      rec.start(1000)
      setIsRec(true)
      tmRef.current = window.setInterval(() => setRecSec((s) => s + 1), 1000)
    } catch {
      showError(nt('meeting.t11'))
      setIsRec(false)
      clearRecTimer()
      stopStream()
    }
  }

  const stopRecording = () => {
    const rec = mrRef.current
    if (rec && rec.state !== 'inactive') {
      rec.stop()
      return
    }
    setIsRec(false)
    clearRecTimer()
    stopStream()
  }

  useEffect(() => () => {
    // Leaving the page must release the microphone without submitting an upload.
    if (mrRef.current) {
      mrRef.current.onstop = null
      if (mrRef.current.state !== 'inactive') mrRef.current.stop()
    }
    stopStream()
    clearRecTimer()
  }, [])

  const displayResult = useMemo(
    () => normalizeMeetingJobResult(selectedJob?.result),
    [selectedJob?.result],
  )

  const createNoteFromJob = async () => {
    if (!displayResult || !selectedJob || selectedJob.status !== 'completed' || savePending.current) return
    const { summaryText, transcriptText, actionItems, topics, decisions, openQuestions, risks } = displayResult
    const blocks: Array<{ id: string; type: 'paragraph'; runs: Array<{ text: string; marks?: string[] }> }> = []
    if (summaryText) {
      blocks.push({ id: bid('p'), type: 'paragraph', runs: [{ text: summaryText, marks: ['bold'] }] })
    }
    if (transcriptText) {
      blocks.push({ id: bid('p'), type: 'paragraph', runs: [{ text: transcriptText }] })
    }
    if (actionItems.length) {
      const lines = actionItems.map((item, i) => `${i + 1}. ${actionItemText(item)}`).join('\n')
      blocks.push({
        id: bid('p'),
        type: 'paragraph',
        runs: [{ text: `${nt('meeting.nextSteps')}\n${lines}` }],
      })
    }
    for (const [heading, lines] of [[nt('meeting.t12'), topics], [nt('meeting.t13'), decisions], [nt('meeting.t14'), openQuestions], [nt('meeting.t15'), risks]] as const) {
      if (lines.length) blocks.push({ id: bid('p'), type: 'paragraph', runs: [{ text: `${heading}:\n${lines.join('\n')}` }] })
    }
    if (!blocks.length) {
      showError(nt('meeting.t16'))
      return
    }

    savePending.current = true
    setCreatingNote(true)
    try {
      const titleBase = selectedJob?.filename?.replace(/\.[^.]+$/, '') || nt('meeting.t17')
      const plain = blocks.map((block) => block.runs.map((run) => run.text).join('')).join('\n\n')
      const note = await notesRepo.saveMeetingResult(selectedJob.job_id, {
        title: titleBase.slice(0, 120),
        content: plain,
        type: 'rich',
        content_doc: { type: 'doc', version: 1, blocks },
        folder_id: folderId || null,
        is_pinned: pinned,
        is_archived: false,
      })
      showSuccess(nt('meeting.t18'))
      onNoteCreated(note)
    } catch (e) {
      showError(e instanceof Error ? e.message : nt('meeting.t19'))
    } finally {
      savePending.current = false
      setCreatingNote(false)
    }
  }

  const mm = Math.floor(recSec / 60).toString().padStart(2, '0')
  const ss = (recSec % 60).toString().padStart(2, '0')
  const showAudioNoteView = selectedJob?.status === 'completed' && displayResult

  return (
    <div className="meeting-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="meeting-header" style={{ padding: '14px 20px', borderBottom: `1px solid ${c.border}`, background: '#fff' }}>
        <div className="meeting-header-row" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              flexShrink: 0,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #2458D3 0%, #1565C0 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
            }}
          >
            <MaterialSymbol name="mic" size={22} />
          </div>
          <div className="meeting-heading">
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 750, color: c.text }}>{nt('meeting.t20')}</h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: c.muted }}>
              {nt('meeting.t21')}
            </p>
          </div>
          <div className="meeting-header-actions" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
            <label style={{ height: 36, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0 10px', border: `1px solid ${c.border}`, borderRadius: 9, background: '#fff', color: '#52698f', fontSize: 12 }}><MaterialSymbol name="folder" size={18} /><select aria-label={nt('meeting.t22')} value={folderId} disabled={creatingNote} onChange={(event) => setFolderId(event.target.value)} style={{ maxWidth: 140, background: 'transparent', border: 0, color: 'inherit', font: 'inherit' }}><option value="">{nt('meeting.t23')}</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
            <button type="button" className="action-icon" aria-label={nt('meeting.t24')} aria-pressed={pinned} disabled={creatingNote} data-tooltip={nt('meeting.t25')} onClick={() => setPinned((value) => !value)}><MaterialSymbol name="push_pin" size={19} color={pinned ? '#1467F5' : '#6078a1'} /></button>
            <details className="notes-more-actions" ref={actionsRef}><summary aria-label={nt('meeting.t28')}><MaterialSymbol name="more_horiz" size={19} color="#6078a1" /></summary><div className="notes-extra-actions">
              <button type="button" disabled={!showAudioNoteView || creatingNote} onClick={() => { actionsRef.current!.open = false; void createNoteFromJob() }}><MaterialSymbol name="description" size={18} />{nt('meeting.t29')}</button>
            </div></details>
          </div>
        </div>
      </div>

      <div className="meeting-body" style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'clamp(240px, 38%, 320px) minmax(0, 1fr)' }}>
        <aside className="meeting-sidebar" style={{ borderRight: `1px solid ${c.border}`, padding: 16, overflowY: 'auto', minHeight: 0, background: '#fff' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', marginBottom: 10 }}>
            {nt('meeting.t30')}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".mp3,.wav,.ogg,.webm,.mp4,.m4a,audio/*"
            style={{ display: 'none' }}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />

          <div
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                fileRef.current?.click()
              }
            }}
            style={{
              width: '100%',
              border: `2px dashed ${file ? '#DBEAFE' : c.border}`,
              borderRadius: 12,
              minHeight: 120,
              padding: '18px 12px',
              background: file ? '#EEF2FF' : '#fff',
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            <MaterialSymbol name={file ? 'audio_file' : 'upload'} size={22} color={file ? c.brand : c.muted} />
            <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color: file ? c.brand : c.text }}>
              {file ? file.name : nt('meeting.t31')}
            </div>
            {file ? (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); setFile(null) }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    setFile(null)
                  }
                }}
                style={{ display: 'inline-block', marginTop: 4, color: c.muted, fontSize: 11, cursor: 'pointer', textDecoration: 'underline' }}
              >
                {nt('meeting.t32')}
              </span>
            ) : (
              <div style={{ fontSize: 11, color: c.muted, marginTop: 4 }}>mp3 · wav · webm · m4a</div>
            )}
          </div>

          <div
            style={{
              marginTop: 10,
              border: `2px dashed ${isRec ? '#FECACA' : c.border}`,
              borderRadius: 12,
              minHeight: 104,
              padding: '14px 12px',
              textAlign: 'center',
              background: isRec ? '#FEF2F2' : '#fff',
            }}
          >
            <button
              type="button"
              onClick={() => (isRec ? stopRecording() : void startRecording())}
              disabled={submitting}
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                border: 0,
                cursor: submitting ? 'not-allowed' : 'pointer',
                background: isRec ? '#EF4444' : '#F1F5F9',
                color: isRec ? '#fff' : c.muted,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MaterialSymbol name={isRec ? 'stop' : 'mic'} size={22} />
            </button>
            <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: isRec ? c.danger : c.text }}>
              {isRec ? nt('meeting.recording', { time: `${mm}:${ss}` }) : nt('meeting.t33')}
            </div>
          </div>

          <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase' }}>{nt('meeting.t34')}</label>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as MeetingAiLanguage)}
              style={{ border: `1px solid ${c.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
            >
              <option value="ru">{nt('meeting.t35')}</option>
              <option value="kk">{nt('meeting.t36')}</option>
            </select>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={nt('meeting.t37')}
              style={{ border: `1px solid ${c.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
            />
          </div>

          <button
            type="button"
            className="primary-btn"
            disabled={!file || submitting || isRec}
            onClick={() => void startAnalyze()}
            style={{
              width: '100%',
              marginTop: 12,
              justifyContent: 'center',
              opacity: !file || submitting || isRec ? 0.6 : 1,
              cursor: !file || submitting || isRec ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? nt('meeting.t38') : nt('meeting.t39')}
          </button>

          <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase' }}>{nt('meeting.t40')}</span>
          </div>

          <div style={{ marginTop: 8, display: 'grid', gap: 0 }}>
            {jobs.length ? jobs.map((job) => {
              const active = job.job_id === selectedJobId
              const statusColor =
                job.status === 'completed' ? c.success : job.status === 'failed' ? c.danger : c.brand
              return (
                <button
                  key={job.job_id}
                  type="button"
                  onClick={() => setSelectedJobId(job.job_id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: 0,
                    borderBottom: `1px solid ${c.border}`,
                    borderRadius: active ? 8 : 0,
                    padding: '10px 12px',
                    background: active ? '#EEF4FF' : '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: c.text,
                      lineHeight: 1.35,
                      wordBreak: 'break-word',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {job.filename || nt('meeting.t41')}
                  </div>
                  <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                    <span style={{ color: statusColor, fontWeight: 700 }}>{statusLabel[job.status] ?? job.status}</span>
                    <span style={{ color: c.muted }}>{formatDate(job.updated_at || job.created_at)}</span>
                  </div>
                </button>
              )
            }) : (
              <div style={{ fontSize: 12, color: c.muted, padding: '8px 0' }}>
                {loadingJobs ? nt('meeting.t42') : nt('meeting.t43')}
              </div>
            )}
          </div>
        </aside>

        <section className="meeting-result" style={{ minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }}>
          {!selectedJob ? (
            <div className="meeting-empty" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: c.muted, padding: '48px 24px' }}>
              <div style={{ maxWidth: 470 }}>
                <div style={{ width: 82, height: 82, margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 18, background: '#F0F5FF', color: '#5485F5' }}><MaterialSymbol name="description" size={42} color="currentColor" /></div>
                <h3 style={{ margin: 0, color: c.text, fontSize: 22, lineHeight: 1.3, fontWeight: 750 }}>{nt('meeting.t44')}<br />{nt('meeting.t45')}</h3>
                <p style={{ margin: '16px auto 0', maxWidth: 440, color: '#8497B4', fontSize: 14, lineHeight: 1.55 }}>{nt('meeting.t46')}</p>
                <div className="meeting-features" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginTop: 46 }}>
                  {[['chat', nt('meeting.t47'), nt('meeting.t48')], ['description', nt('meeting.t49'), nt('meeting.t50')], ['check', nt('meeting.t51'), nt('meeting.t52')]].map(([icon, title, subtitle], index) => (
                    <div key={title} style={{ padding: '0 18px', borderLeft: index ? `1px solid ${c.border}` : 0, color: '#7186aa', fontSize: 12, lineHeight: 1.45 }}>
                      <span style={{ width: 38, height: 38, margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, background: '#EEF4FF' }}><MaterialSymbol name={icon} size={19} color="#3977F6" /></span>
                      <strong style={{ display: 'block', color: '#6078a1' }}>{title}</strong>{subtitle}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : showAudioNoteView ? (
            <MeetingAudioNoteView
              job={selectedJob}
              result={displayResult}
              repository={repository}
              onCreateNote={() => void createNoteFromJob()}
              creatingNote={creatingNote}
            />
          ) : (
            <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{selectedJob.filename || nt('meeting.t53')}</h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: c.muted }}>
                  {statusLabel[selectedJob.status] ?? selectedJob.status}
                  {ACTIVE.has(selectedJob.status) ? ` ${nt('meeting.t54')}` : ''}
                </p>
              </div>

              {selectedJob.status === 'failed' && (
                <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: '#FEF2F2', color: c.danger, fontSize: 13 }}>
                  {selectedJob.error || nt('meeting.t55')}
                </div>
              )}

              {ACTIVE.has(selectedJob.status) && (
                <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: '#EEF2FF', color: c.brand, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                  {nt('meeting.t56')}
                </div>
              )}

              {selectedJob.status === 'completed' && !displayResult && (
                <div style={{ marginTop: 20, color: c.muted, fontSize: 13 }}>{nt('meeting.t57')}</div>
              )}
            </div>
          )}
        </section>
      </div>
          <footer className="meeting-footer" style={{ minHeight: 64, borderTop: `1px solid ${c.border}`, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <MaterialSymbol name="cloud" size={18} color="#6078a1" />
            <span style={{ color: '#8497B4', fontSize: 12 }}>{nt('meeting.t58')}</span>
            <button type="button" disabled={submitting || creatingNote || isRec} onClick={() => { setSelectedJobId(null); setFile(null); if (fileRef.current) fileRef.current.value = '' }} style={{ marginLeft: 'auto', height: 40, padding: '0 18px', border: `1px solid ${c.border}`, borderRadius: 10, background: '#fff', color: '#52698f', fontSize: 12, fontWeight: 650, cursor: 'pointer' }}>{nt('meeting.t59')}</button>
            <button type="button" disabled={!showAudioNoteView || creatingNote} onClick={() => void createNoteFromJob()} style={{ height: 40, padding: '0 20px', border: 0, borderRadius: 10, background: '#1467F5', color: '#fff', fontSize: 12, fontWeight: 650, cursor: showAudioNoteView ? 'pointer' : 'not-allowed', opacity: showAudioNoteView ? 1 : .5 }}>{creatingNote ? nt('meeting.t60') : nt('meeting.t61')}</button>
          </footer>
    </div>
  )
}
