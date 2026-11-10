import type { PendingAssignmentCommand } from '../../domain/entities/AssignmentCompletion'
import { AUTH_SESSION_CLEARED_EVENT } from '../../shared/auth/authSessionEvents'

const prefix = 'superapp.odo.commands.'
const memory = new Map<string, Record<string, PendingAssignmentCommand>>()
if (typeof window !== 'undefined') window.addEventListener(AUTH_SESSION_CLEARED_EVENT, () => {
  memory.clear()
  try { Object.keys(window.sessionStorage).filter(key => key.startsWith(prefix)).forEach(key => window.sessionStorage.removeItem(key)) } catch { /* Storage can be disabled. */ }
})

// Store only the immutable user command, scoped by employee AND company.
// Never store access tokens or substitute another employee on a retry.
export class AssignmentCommandJournal {
  private key: string
  constructor(userId: number, organizationId: string) { this.key = `${prefix}${userId}.${organizationId}` }
  read(): Record<string, PendingAssignmentCommand> {
    if (memory.has(this.key)) return Object.fromEntries(Object.entries(memory.get(this.key)!).map(([id, entry]) => [id, entry.phase === 'pending' ? { ...entry, phase: 'uncertain' as const } : entry]))
    try {
      const raw = window.sessionStorage.getItem(this.key)
      const values = raw ? JSON.parse(raw) as Record<string, PendingAssignmentCommand> : {}
      const safe: Record<string, PendingAssignmentCommand> = {}
      for (const [id, entry] of Object.entries(values)) {
        if (entry?.taskId !== id || typeof entry.assignmentId !== 'string' || typeof entry.command?.command_id !== 'string' || !Number.isSafeInteger(entry.command.expected_revision) || entry.command.expected_revision <= 0 || typeof entry.command.result_comment !== 'string' || Array.from(entry.command.result_comment).length > 20000 || !['pending', 'uncertain', 'confirmed', 'conflict', 'denied', 'invalid'].includes(entry.phase)) continue
        safe[id] = { ...entry, phase: entry.phase === 'pending' ? 'uncertain' : entry.phase }
      }
      memory.set(this.key, safe)
      return { ...safe }
    } catch { return {} }
  }
  write(values: Record<string, PendingAssignmentCommand>): void {
    memory.set(this.key, { ...values })
    try { window.sessionStorage.setItem(this.key, JSON.stringify(values)) } catch { /* Keep the command in memory when browser storage is unavailable. */ }
  }
}
