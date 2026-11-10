import { authorizedFetch } from '../http/authorizedFetch'
import { LocalStorageAuthSessionStore } from '../storage/LocalStorageAuthSessionStore'

export interface MeetingActionEvidence { segment_id: string; quote: string; speaker: string; start_ms: number; end_ms: number }
export interface MeetingActionDraft { title: string; description: string; assignee_id: number | null; due_at: string | null }
export interface MeetingActionProposal {
  id: string
  analysis_id: string
  candidate: { title: string; description: string; kind: string; owner_text: string; deadline_text: string; evidence: MeetingActionEvidence[]; verification: string; review_reason: string }
  draft: MeetingActionDraft
  status: 'proposed' | 'created' | 'linked' | 'dismissed'
  version: number
  task_id: string | null
  task_key: string | null
  task_status: string | null
  task_deleted: boolean
  source_hash: string
}
export interface MeetingActionAnalysis { id: string; status: 'queued' | 'running' | 'ready' | 'failed'; error: string | null; source_hash: string; rejected_count: number }
export interface MeetingActionReview {
  analysis: MeetingActionAnalysis | null
  proposals: MeetingActionProposal[]
  members: Array<{ user_id: number; full_name: string }>
  current_source_hash: string
}
export interface TaskMeetingSource { meeting_id: string; title: string; proposal_id: string; evidence: MeetingActionEvidence[] }
const store = new LocalStorageAuthSessionStore()
const request = async <T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> => {
  const response = await authorizedFetch(store, `/api/v1/meeting-actions${path}`, { method, signal, body: body === undefined ? undefined : JSON.stringify(body) })
  return response.json() as Promise<T>
}
export const meetingActionsApi = {
  capabilities: (signal?: AbortSignal) => request<{ enabled: boolean }>('/capabilities', 'GET', undefined, signal),
  review: (meeting: string, board: string, signal?: AbortSignal) => request<MeetingActionReview>(`?${new URLSearchParams({ meeting_id: meeting, board_id: board })}`, 'GET', undefined, signal),
  start: (meeting: string, board: string) => request<MeetingActionAnalysis>('', 'POST', { meeting_id: meeting, board_id: board }),
  decide: (proposal: MeetingActionProposal, action: 'save' | 'dismiss' | 'create' | 'link', draft: MeetingActionDraft, reviewed: boolean, taskId?: string) => request<MeetingActionProposal>(`/proposals/${encodeURIComponent(proposal.id)}/decision`, 'POST', { action, version: proposal.version, draft, source_reviewed: reviewed, task_id: taskId || null }),
  sources: (task: string, signal?: AbortSignal) => request<TaskMeetingSource[]>(`/tasks/${encodeURIComponent(task)}/sources`, 'GET', undefined, signal),
}
