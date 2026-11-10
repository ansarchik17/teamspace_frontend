import type { BoardTask } from '../../../domain/entities/board/BoardModels'
import type { AssignmentCommand, AssignmentCompletion, PendingAssignmentCommand } from '../../../domain/entities/AssignmentCompletion'

const terminal = new Set(['completed', 'closed', 'cancelled'])
export const assignmentStatus = (task: BoardTask) => task.sourceStatus || 'unknown'
export const isActiveAssignment = (task: BoardTask) => ['assigned', 'in_progress'].includes(assignmentStatus(task))
export const canCompleteAssignment = (task: BoardTask) => isActiveAssignment(task) && Boolean(task.sourceOrganizationId && task.sourceAssignmentId && task.sourceDocumentId) && Number.isSafeInteger(task.sourceRevision) && task.sourceRevision! > 0 && task.sourceRevision! < Number.MAX_SAFE_INTEGER

export const isOverdueAssignment = (task: BoardTask, now = new Date()): boolean => {
  if (!isActiveAssignment(task) || !/^\d{4}-\d{2}-\d{2}$/.test(task.sourceDueDate || '') || !task.sourceTimezone) return false
  const date = new Date(`${task.sourceDueDate}T12:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== task.sourceDueDate) return false
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: task.sourceTimezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value
    return task.sourceDueDate! < `${part('year')}-${part('month')}-${part('day')}`
  } catch { return false }
}

export const safeAssignmentUrl = (value?: string): string | null => {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash ? url.href : null
  } catch { return null }
}

// Use the existing same-origin Workspace handoff, preserving the current tenant
// and authenticating the document entry instead of trusting a snapshot's host.
export const assignmentDocumentRoute = (documentId?: string): string | null =>
  documentId?.trim() ? `/eps?document=${encodeURIComponent(documentId)}` : null

export const projectionCaughtUp = (task: BoardTask, pending: PendingAssignmentCommand) => pending.phase === 'confirmed' && Boolean(pending.confirmedRevision) && (task.sourceRevision || 0) >= pending.confirmedRevision! && terminal.has(assignmentStatus(task))
export const validAssignmentResult = (value: string) => Boolean(value.trim()) && Array.from(value).length <= 20000
export const createAssignmentCommand = (task: BoardTask, result: string): AssignmentCommand => {
  if (!canCompleteAssignment(task) || !validAssignmentResult(result)) throw new Error('Invalid assignment command')
  return { command_id: crypto.randomUUID(), expected_revision: task.sourceRevision!, result_comment: result }
}

export const validCompletionReceipt = (result: AssignmentCompletion, task: BoardTask, command: AssignmentCommand): boolean => {
  const receipt = result?.receipt
  return result?.confirmed === true && typeof result.projection_pending === 'boolean' && result.task_id === task.id && Boolean(receipt) && receipt.command_id === command.command_id && receipt.assignment_id === task.sourceAssignmentId && receipt.document_id === task.sourceDocumentId && receipt.organization_id === task.sourceOrganizationId && receipt.expected_revision === command.expected_revision && receipt.revision === command.expected_revision + 1 && receipt.status === 'completed' && ['completed', 'duplicate'].includes(receipt.outcome) && typeof receipt.actor_sub === 'string' && Boolean(receipt.actor_sub) && typeof receipt.identity_issuer === 'string' && receipt.identity_issuer.startsWith('https://') && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(receipt.event_id) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(receipt.completed_at) && Number.isFinite(Date.parse(receipt.completed_at))
}

export function canCompleteWithAccess(access: { active: boolean; managed: boolean; permissions: string[] } | null): boolean {
  return Boolean(access?.active && (!access.managed || (['assignment.read', 'assignment.complete'].every(code => access.permissions.includes(code)) && ['document.read','document.read_department','document.read_all'].some(code => access.permissions.includes(code)))))
}
export function canStartNewAssignmentCommand(task: BoardTask, pending: PendingAssignmentCommand | undefined): boolean {
  return Boolean(pending?.phase === 'conflict' && canCompleteAssignment(task) && task.sourceRevision !== pending.command.expected_revision)
}
