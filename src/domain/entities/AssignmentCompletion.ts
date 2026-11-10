export interface AssignmentCommand {
  command_id: string
  expected_revision: number
  result_comment: string
}

export interface AssignmentCompletion {
  confirmed: true
  projection_pending: boolean
  task_id: string
  receipt: {
    command_id: string
    organization_id: string
    identity_issuer: string
    actor_sub: string
    assignment_id: string
    document_id: string
    expected_revision: number
    revision: number
    status: 'completed'
    event_id: string
    completed_at: string
    outcome: 'completed' | 'duplicate'
  }
}

export type AssignmentCommandPhase = 'pending' | 'uncertain' | 'confirmed' | 'conflict' | 'denied' | 'invalid'
export interface PendingAssignmentCommand {
  taskId: string
  assignmentId: string
  command: AssignmentCommand
  phase: AssignmentCommandPhase
  confirmedRevision?: number
}
