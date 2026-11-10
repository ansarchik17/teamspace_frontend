import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Check, ExternalLink, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import type { Board, BoardTask } from '../../../domain/entities/board/BoardModels'
import { HttpBoardRepository } from '../../../infrastructure/repositories/HttpBoardRepository'
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore'
import { meetingActionsApi, type MeetingActionDraft, type MeetingActionProposal, type MeetingActionReview } from '../../../infrastructure/meet/meetingActionsApi'
import { canCommitProposal, isoDateTime, localDateTime, meetingTaskURL, possiblySimilarTaskTitles } from './meetingActionsUtils'
import { formatOffset } from './meetTranscript'
import './meetActions.css'

const repository = new HttpBoardRepository(new LocalStorageAuthSessionStore())
const message = (error: unknown) => error instanceof Error ? error.message : String(error)

function ProposalCard({ proposal, review, boardId, tasks, onChange, onSeek }: {
  proposal: MeetingActionProposal; review: MeetingActionReview; boardId: string; tasks: BoardTask[]; onChange: () => Promise<void>; onSeek: (segment: string) => void
}) {
  const { t } = useTranslation('shell')
  const [draft, setDraft] = useState<MeetingActionDraft>(proposal.draft)
  const [reviewed, setReviewed] = useState(false)
  const [taskId, setTaskId] = useState('')
  const [taskQuery, setTaskQuery] = useState('')
  const [foundTasks, setFoundTasks] = useState<BoardTask[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const stale = proposal.source_hash !== review.current_source_hash
  const terminal = proposal.status !== 'proposed'
  const similar = tasks.filter(task => possiblySimilarTaskTitles(draft.title, task.title)).slice(0, 4)
  useEffect(() => {
    let active = true
    if (!taskQuery.trim()) return
    const timer = setTimeout(() => {
      void repository.searchTasks({ boardId, q: taskQuery.trim(), limit: 30 }).then(next => { if (active) setFoundTasks(next) }).catch(err => { if (active) setError(message(err)) })
    }, 300)
    return () => { active = false; clearTimeout(timer) }
  }, [taskQuery, boardId])
  const submit = async (action: 'save' | 'dismiss' | 'create' | 'link') => {
    if (busy) return
    setBusy(true); setError('')
    try { await meetingActionsApi.decide(proposal, action, draft, reviewed, taskId); await onChange() }
    catch (err) { setError(message(err)) }
    finally { setBusy(false) }
  }
  return <article className="meet-action-card" aria-busy={busy}>
    <div className="meet-action-card-header">
      <strong>{proposal.candidate.title}</strong>
      <span className={`meet-action-badge ${proposal.candidate.verification === 'uncertain' ? 'is-uncertain' : ''}`}>{t(proposal.candidate.verification === 'uncertain' ? 'meet.taskActions.clarify' : 'meet.taskActions.candidate')}</span>
    </div>
    {proposal.candidate.review_reason && <p className="meet-action-reason">{proposal.candidate.review_reason}</p>}
    <details className="meet-action-evidence" open>
      <summary>{t('meet.taskActions.evidence')}</summary>
      {proposal.candidate.evidence.map((evidence, index) => <blockquote key={`${evidence.segment_id}:${index}`}>
        <button type="button" onClick={() => onSeek(evidence.segment_id)}>{formatOffset(evidence.start_ms)} · {evidence.speaker}</button>
        <p>{evidence.quote}</p>
      </blockquote>)}
    </details>
    {terminal ? <div className="meet-action-result">
      {proposal.status === 'dismissed' ? t('meet.taskActions.dismissed') : proposal.task_id && <>
        <Check size={16} /><Link to={meetingTaskURL(boardId, proposal.task_id)}>{proposal.task_key || t('meet.taskActions.openTask')} <ExternalLink size={13} /></Link>
        <span>{proposal.task_deleted ? t('meet.taskActions.taskDeleted') : proposal.task_status}</span>
      </>}
    </div> : <>
      {stale && <p className="meet-action-warning" role="status">{t('meet.taskActions.stale')}</p>}
      {similar.length > 0 && <div className="meet-action-warning"><p>{t('meet.taskActions.similar')}</p>{similar.map(task => <p key={task.id}><Link className="underline" to={meetingTaskURL(boardId, task.id)}>{task.taskKey} · {task.title}</Link></p>)}</div>}
      <label className="meet-action-field">{t('meet.taskActions.title')}<input aria-label={t('meet.taskActions.title')} maxLength={300} value={draft.title} disabled={busy} onChange={event => { setDraft({ ...draft, title: event.target.value }); setReviewed(false) }} /></label>
      <label className="meet-action-field">{t('meet.taskActions.description')}<textarea aria-label={t('meet.taskActions.description')} rows={3} maxLength={12000} value={draft.description} disabled={busy} onChange={event => { setDraft({ ...draft, description: event.target.value }); setReviewed(false) }} /></label>
      <div className="meet-action-fields">
        <label className="meet-action-field">{t('meet.taskActions.assignee')}
          <select aria-label={t('meet.taskActions.assignee')} disabled={busy} value={draft.assignee_id ?? ''} onChange={event => { setDraft({ ...draft, assignee_id: event.target.value ? Number(event.target.value) : null }); setReviewed(false) }}>
            <option value="">{t('meet.taskActions.unassigned')}</option>
            {review.members.map(member => <option key={member.user_id} value={member.user_id}>{member.full_name || `#${member.user_id}`}</option>)}
          </select>
          {proposal.candidate.owner_text && <small>{t('meet.taskActions.said')}: {proposal.candidate.owner_text}</small>}
        </label>
        <label className="meet-action-field">{t('meet.taskActions.due')}
          <input aria-label={t('meet.taskActions.due')} type="datetime-local" value={localDateTime(draft.due_at)} disabled={busy} onChange={event => { setDraft({ ...draft, due_at: isoDateTime(event.target.value) }); setReviewed(false) }} />
          <small>{proposal.candidate.deadline_text ? `${t('meet.taskActions.said')}: ${proposal.candidate.deadline_text}` : t('meet.taskActions.noDue')}</small>
        </label>
      </div>
      <label className="meet-action-confirm"><input type="checkbox" checked={reviewed} disabled={busy || stale} onChange={event => setReviewed(event.target.checked)} /><span>{t('meet.taskActions.confirm')}</span></label>
      <div className="meet-action-buttons">
        <button type="button" className="meet-action-primary" disabled={busy || !canCommitProposal(proposal, review.current_source_hash, reviewed, draft)} onClick={() => void submit('create')}>{t('meet.taskActions.create')}</button>
        <button type="button" disabled={busy || !draft.title.trim()} onClick={() => void submit('save')}>{t('meet.taskActions.save')}</button>
        <button type="button" disabled={busy} onClick={() => void submit('dismiss')}>{t('meet.taskActions.dismiss')}</button>
      </div>
      <details className="meet-action-existing"><summary>{t('meet.taskActions.existing')}</summary>
        <label className="meet-action-field">{t('meet.taskActions.searchTask')}<input value={taskQuery} onChange={event => { setTaskQuery(event.target.value); setFoundTasks(null); setTaskId('') }} /></label>
        <label className="meet-action-field">{t('meet.taskActions.chooseTask')}<select aria-label={t('meet.taskActions.chooseTask')} value={taskId} disabled={busy} onChange={event => setTaskId(event.target.value)}>
          <option value="">{t('meet.taskActions.chooseTask')}</option>
          {(taskQuery.trim() ? foundTasks ?? [] : tasks).map(task => <option value={task.id} key={task.id}>{task.taskKey} {task.title}</option>)}
        </select></label>
        <button type="button" disabled={busy || !taskId || !canCommitProposal(proposal, review.current_source_hash, reviewed, draft)} onClick={() => void submit('link')}>{t('meet.taskActions.link')}</button>
      </details>
    </>}
    {busy && <span className="meet-action-progress" role="status"><Loader2 size={15} className="animate-spin" />{t('meet.taskActions.saving')}</span>}
    {error && <p className="meet-action-error" role="alert">{error}</p>}
  </article>
}

export default function MeetActionsPanel({ meetingId, onSeek }: { meetingId: string; onSeek: (segment: string) => void }) {
  const { t } = useTranslation('shell')
  const [enabled, setEnabled] = useState(false)
  const [boards, setBoards] = useState<Board[]>([])
  const [boardId, setBoardId] = useState('')
  const [review, setReview] = useState<MeetingActionReview | null>(null)
  const [tasks, setTasks] = useState<BoardTask[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const epoch = useRef(0)
  useEffect(() => {
    const controller = new AbortController()
    void meetingActionsApi.capabilities(controller.signal).then(async capability => {
      if (!capability.enabled || controller.signal.aborted) return
      setEnabled(true)
      const next = await repository.listBoards()
      if (!controller.signal.aborted) setBoards(next)
    }).catch(err => { if (!controller.signal.aborted) setError(message(err)) })
    return () => { controller.abort() }
  }, [])
  useEffect(() => {
    const current = ++epoch.current
    setReview(null); setTasks([]); setError('')
    if (!boardId) return
    setBusy(true)
    const controller = new AbortController()
    void Promise.all([meetingActionsApi.review(meetingId, boardId, controller.signal), repository.getBoard(boardId)]).then(([next, board]) => {
      if (current === epoch.current && !controller.signal.aborted) { setReview(next); setTasks(board.columns.flatMap(column => column.tasks)) }
    }).catch(err => { if (!controller.signal.aborted) setError(message(err)) }).finally(() => { if (current === epoch.current && !controller.signal.aborted) setBusy(false) })
    return () => controller.abort()
  }, [meetingId, boardId])
  const refresh = async () => {
    const current = epoch.current
    const next = await meetingActionsApi.review(meetingId, boardId)
    if (current === epoch.current) setReview(next)
  }
  const working = review?.analysis?.status === 'queued' || review?.analysis?.status === 'running'
  useEffect(() => {
    if (!working || !boardId) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try { const next = await meetingActionsApi.review(meetingId, boardId, controller.signal); if (!controller.signal.aborted) { setReview(next); setError('') } }
      catch (err) { if (!controller.signal.aborted) setError(message(err)) }
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 4000)
    }
    timer = setTimeout(() => void poll(), 2500)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [working, meetingId, boardId])
  const start = async () => {
    const current = epoch.current
    setBusy(true); setError('')
    try { await meetingActionsApi.start(meetingId, boardId); if (current === epoch.current) await refresh() }
    catch (err) { if (current === epoch.current) setError(message(err)) }
    finally { if (current === epoch.current) setBusy(false) }
  }
  if (!enabled) return null
  return <section className="meet-actions-panel" aria-label={t('meet.taskActions.heading')}>
    <div className="meet-actions-heading"><Sparkles size={18} /><h3>{t('meet.taskActions.heading')}</h3></div>
    <p className="meet-action-help">{t('meet.taskActions.intro')}</p>
    <div className="meet-action-controls">
      <label className="meet-action-field">{t('meet.taskActions.board')}<select aria-label={t('meet.taskActions.board')} value={boardId} disabled={busy} onChange={event => setBoardId(event.target.value)}>
        <option value="">{t('meet.taskActions.chooseBoard')}</option>
        {boards.map(board => <option key={board.id} value={board.id}>{board.name}</option>)}
      </select></label>
      <button type="button" className="meet-action-primary" disabled={!boardId || busy || working || Boolean(review?.analysis && review.analysis.status === 'ready' && review.analysis.source_hash === review.current_source_hash)} onClick={() => void start()}>
        {busy || working ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}{t('meet.taskActions.analyze')}
      </button>
      <button type="button" disabled={!boardId || busy} aria-label={t('meet.taskActions.refresh')} onClick={() => { void refresh().catch(err => setError(message(err))) }}><RefreshCw size={16} /></button>
    </div>
    {working && <p className="meet-action-help" role="status">{t('meet.taskActions.processing')}</p>}
    {review?.analysis?.status === 'failed' && <p className="meet-action-error" role="alert">{review.analysis.error || t('meet.taskActions.failed')}</p>}
    {error && <p className="meet-action-error" role="alert">{error}</p>}
    {review?.analysis?.status === 'ready' && !review.proposals.some(proposal => proposal.status === 'proposed' && proposal.source_hash === review.current_source_hash) && <p className="meet-action-help">{t('meet.taskActions.empty')}</p>}
    {review?.proposals.map(proposal => <ProposalCard key={`${proposal.id}:${proposal.version}`} proposal={proposal} review={review} boardId={boardId} tasks={tasks} onChange={refresh} onSeek={onSeek} />)}
  </section>
}
