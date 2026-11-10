import type { MeetingActionDraft, MeetingActionProposal } from '../../../infrastructure/meet/meetingActionsApi'

export function localDateTime(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
export function isoDateTime(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}
export function canCommitProposal(proposal: MeetingActionProposal, hash: string, reviewed: boolean, draft: MeetingActionDraft): boolean {
  return proposal.status === 'proposed' && proposal.source_hash === hash && reviewed && draft.title.trim().length > 0 && draft.title.trim().length <= 300
}
export function meetingSourceURL(meetingId: string, offset?: number, segmentId?: string): string {
  const params = new URLSearchParams({ record: meetingId })
  if (offset !== undefined) params.set('at', String(Math.max(0, offset)))
  if (segmentId) params.set('segment', segmentId)
  return `/meet?${params}`
}
export function meetingTaskURL(boardId: string, taskId: string): string {
  return `/board?${new URLSearchParams({ boardId, task: taskId })}`
}

// A review hint, never proof that two actions are the same task.
export function possiblySimilarTaskTitles(left: string, right: string): boolean {
  const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const a = normalize(left), b = normalize(right)
  if (!a || !b) return false
  if (a === b) return true
  const stop = new Set(['и', 'в', 'для', 'на', 'по', 'с', 'к', 'до', 'and', 'the']) // i18n-ignore: linguistic matching tokens, not UI text
  const tokens = (value: string) => new Set(value.split(' ').filter(word => word.length > 1 && !stop.has(word)))
  const aa = tokens(a), bb = tokens(b)
  if (Math.min(aa.size, bb.size) < 2) return false
  const shared = [...aa].filter(word => bb.has(word)).length
  return shared / new Set([...aa, ...bb]).size >= 0.6
}
