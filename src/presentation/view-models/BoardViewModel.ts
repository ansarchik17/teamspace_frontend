import { formatDate } from '../../shared/i18n'
import { bt } from '../components/board/boardText'
import type {
  Board,
  BoardComment,
  BoardDetails,
  BoardHistory,
  BoardLabel,
  BoardMember,
  BoardTask,
  BoardUser,
  BoardWorklog,
  OrgAccessUser,
  OrgKanbanStats,
  BoardStats,
  BoardAttachment,
} from '../../domain/entities/board/BoardModels'

export interface BoardOptionViewModel {
  id: string
  name: string
  ownerId: number
  ownerFullName: string
  createdAt: string
  updatedAt: string
  nextDueAt: string
  progress?: {
    totalTasks: number
    completedTasks: number
    completionPercent: number
  }
}

export interface BoardUserViewModel {
  id: number
  fullName: string
  email: string
  avatarUrl: string
  initials: string
  firstName?: string
  lastName?: string
  username?: string
  role?: string
  teamRole?: string
  availabilityStatus?: string
}

export interface BoardTaskViewModel {
  id: string
  boardId: string
  taskNumber: number
  taskKey: string
  link: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  priorityLabel: string
  priorityClassName: string
  assigneeIds: number[]
  dueAt: string
  dueAtLabel: string
  sprintId: string
  goalId?: string
  projectId?: string
  timeSpentLabel: string
  attachmentsCount: number
  originalEstimateSec?: number
  attachments?: BoardAttachment[]
  createdBy: number
  createdAt: string
  updatedAt: string
  status?: string
  labels: Array<{ id: string; name: string; color: string }>
  parentId?: string
  subtasks: BoardTaskViewModel[]
}

export interface BoardColumnViewModel {
  id: string
  name: string
  key: string
  position: number
  tasks: BoardTaskViewModel[]
  totalTasks: number
}

export interface BoardSprintViewModel {
  id: string
  name: string
  status: string
  goalId?: string
  projectId?: string
  startDate: string
  endDate: string
}

export interface BoardGoalViewModel {
  id: string
  name: string
  description?: string
  taskCount: number
  completedTasks: number
  activeTasks: number
  overdueTasks: number
  projectCount: number
  sprintCount: number
  completionPercent: number
  topProjectName?: string
  predictionLabel?: string
  nextActionLabel?: string
}

export interface BoardProjectViewModel {
  id: string
  goalId?: string
  name: string
  description?: string
  status: string
  taskCount: number
}

export interface BoardMemberViewModel {
  userId: number
  role: string
  teamRole?: string
  name: string
  initials: string
  avatarUrl?: string
}

export interface BoardLabelViewModel {
  id: string
  name: string
  color: string
}

export interface BoardCommentViewModel {
  id: string
  userId: number
  authorName: string
  content: string
  attachmentUrl: string
  createdAt: string
  createdAtLabel: string
}

export interface OrgStatsViewModel {
  stateBodyId: number
  summary: Array<{ status: string; count: number }>
  projects: Array<{ boardName: string; totalTasks: number; statuses: Array<{ status: string; count: number }> }>
  closedBy: Array<{ userId: number; fullName: string; closedCount: number }>
}

export interface OrgAccessUserViewModel {
  userId: number
  fullName: string
  createdAtLabel: string
}

export interface BoardActivityViewModel {
  worklogs: Array<{
    id: string
    userId: number
    comment: string
    createdAt: string
    createdAtLabel: string
    timeSpentLabel: string
  }>
  history: Array<{
    id: string
    action: string
    details: string
    createdAt: string
    createdAtLabel: string
    userId?: number
    userName: string
  }>
}

export interface BoardDetailsViewModel {
  boardId: string
  ownerId: number
  boardName: string
  columns: BoardColumnViewModel[]
  sprints: BoardSprintViewModel[]
  goals: BoardGoalViewModel[]
  projects: BoardProjectViewModel[]
  members: BoardMemberViewModel[]
  totalTasks: number
  background: {
    imageUrl: string
    mode: string
    presetHex: string
    presetId: string
  } | null
}

const dateTimeFormatter = { format: (date: Date) => formatDate(date, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }

const shortDateFormatter = { format: (date: Date) => formatDate(date, {
  day: '2-digit',
  month: 'short',
}) }

const secondsToLabel = (seconds: number): string => {
  if (!seconds || seconds <= 0) {
    return bt('time.zero')
  }

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (!hours) {
    return bt('time.minutes', { minutes })
  }

  return minutes ? bt('time.hoursMinutes', { hours, minutes }) : bt('time.hours', { hours })
}

const priorityMeta: Record<BoardTask['priority'], { label: string; className: string }> = {
  low: { get label() { return bt('priority.low') }, className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  medium: { get label() { return bt('priority.medium') }, className: 'bg-amber-50 text-amber-700 border border-amber-200' },
  high: { get label() { return bt('priority.high') }, className: 'bg-orange-50 text-orange-700 border border-orange-200' },
  critical: { get label() { return bt('priority.critical') }, className: 'bg-red-50 text-red-700 border border-red-200' },
}

const toInitials = (value: string): string => {
  const parts = value.split(' ').filter(Boolean)
  if (!parts.length) return '??'
  return parts.slice(0, 2).map((item) => item[0]?.toUpperCase() ?? '').join('')
}

const toDateLabel = (value: string): string => {
  if (!value) {
    return bt('list.noDue')
  }

  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) {
    return bt('list.noDue')
  }

  return shortDateFormatter.format(date)
}

const historyActionLabels = {
  get created() { return bt('history.actions.created') },
  get updated() { return bt('history.actions.updated') },
  get moved() { return bt('history.actions.moved') },
  get assigned() { return bt('history.actions.assigned') },
  get unassigned() { return bt('history.actions.unassigned') },
  get deleted() { return bt('history.actions.deleted') },
  get file_attached() { return bt('history.actions.file_attached') },
  get file_removed() { return bt('history.actions.file_removed') },
  get worklog_added() { return bt('history.actions.worklog_added') },
  get comment_added() { return bt('history.actions.comment_added') },
  get subtask_created() { return bt('history.actions.subtask_created') },
  get checklist_created() { return bt('history.actions.checklist_created') },
  get checklist_updated() { return bt('history.actions.checklist_updated') },
  get checklist_deleted() { return bt('history.actions.checklist_deleted') },
  get attachment_created() { return bt('history.actions.attachment_created') },
  get attachment_deleted() { return bt('history.actions.attachment_deleted') },
  get comment_updated() { return bt('history.actions.comment_updated') },
  get comment_deleted() { return bt('history.actions.comment_deleted') },
  get label_added() { return bt('history.actions.label_added') },
  get label_removed() { return bt('history.actions.label_removed') },
} as const

const toHistoryActionLabel = (action: string): string => {
  const label = historyActionLabels[action as keyof typeof historyActionLabels]
  if (label) return label
  const readable = action.replace(/[_-]+/g, ' ').trim()
  return readable ? readable.charAt(0).toUpperCase() + readable.slice(1) : bt('history.event')
}

const historyPayloadKeys = ['title', 'text', 'file_name', 'filename', 'original_name', 'name', 'content']

const readHistoryPayloadName = (value?: string): string | null => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed.startsWith('{')) return null
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    for (const key of historyPayloadKeys) {
      const candidate = parsed[key]
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
    }
    if (typeof parsed.url === 'string') {
      return parsed.url.split('/').pop()?.replace(/^\d+_/, '') || ''
    }
    return ''
  } catch {
    for (const key of historyPayloadKeys) {
      const match = trimmed.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`))
      if (match?.[1]) return match[1]
    }
    const url = trimmed.match(/"url"\s*:\s*"([^"]+)"/)
    if (url?.[1]) return url[1].split('/').pop()?.replace(/^\d+_/, '') || ''
    return ''
  }
}

const fieldLabels: Record<string, string> = {
  get title() { return bt('history.fields.title') },
  get description() { return bt('history.fields.description') },
  get priority() { return bt('history.fields.priority') },
  get due_at() { return bt('history.fields.due_at') },
  get assignee_id() { return bt('history.fields.assignee_id') },
  get status() { return bt('history.fields.status') },
  get column_id() { return bt('history.fields.column_id') },
  get label_id() { return bt('history.fields.label_id') },
  get sprint_id() { return bt('history.fields.sprint_id') },
  get parent_id() { return bt('history.fields.parent_id') },
}

const workflowStatusLabels: Record<string, string> = {
  get TODO() { return bt('status.TODO') },
  get 'TO DO'() { return bt('status.TODO') },
  get 'К ВЫПОЛНЕНИЮ'() { return bt('status.TODO') }, // i18n-ignore
  get IN_PROGRESS() { return bt('status.IN_PROGRESS') },
  get 'IN PROGRESS'() { return bt('status.IN_PROGRESS') },
  get 'В РАБОТЕ'() { return bt('status.IN_PROGRESS') }, // i18n-ignore
  get TEST() { return bt('status.TEST') },
  get 'НА ПРОВЕРКЕ'() { return bt('status.TEST') }, // i18n-ignore
  get 'В ПРОЦЕССЕ ПРОВЕРКИ'() { return bt('status.TEST') }, // i18n-ignore
  get DONE() { return bt('status.DONE') },
  get 'ГОТОВО'() { return bt('status.DONE') }, // i18n-ignore
  get COMPLETED() { return bt('status.DONE') },
}

const priorityLabels: Record<string, string> = {
  get low() { return bt('priority.low') },
  get medium() { return bt('priority.medium') },
  get high() { return bt('priority.high') },
  get urgent() { return bt('priority.urgent') },
}

const normalizeHistoryToken = (value: string): string =>
  value
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toUpperCase()

const toLocalizedWorkflowLabel = (value: string): string => {
  const normalized = normalizeHistoryToken(value)
  return workflowStatusLabels[normalized] ?? value
}

const toLocalizedPriorityLabel = (value: string): string => {
  const normalized = value.trim().toLowerCase()
  return priorityLabels[normalized] ?? value
}

const toHistoryValueLabel = (
  fieldName: string | undefined,
  value: string | undefined,
  userNamesById?: Map<number, string>,
): string => {
  if (!value) return ''

  const trimmedValue = value.trim()
  if (!trimmedValue) return ''

  if (/^\d+$/.test(trimmedValue) && userNamesById) {
    const name = userNamesById.get(Number(trimmedValue))
    if (name) return name
  }

  if (fieldName === 'due_at') {
    return toDateLabel(trimmedValue)
  }

  if (fieldName === 'priority') {
    return toLocalizedPriorityLabel(trimmedValue)
  }

  if (fieldName === 'status' || fieldName === 'column_id') {
    return toLocalizedWorkflowLabel(trimmedValue)
  }

  return toLocalizedWorkflowLabel(trimmedValue)
}

const formatHistoryTransition = (
  fieldName: string | undefined,
  oldValue: string | undefined,
  newValue: string | undefined,
  userNamesById?: Map<number, string>,
): string => {
  const from = toHistoryValueLabel(fieldName, oldValue, userNamesById) || '—'
  const to = toHistoryValueLabel(fieldName, newValue, userNamesById) || '—'
  return `${from} -> ${to}`
}

const formatHistoryDetailsText = (
  details: string | undefined,
  fieldName: string | undefined,
  userNamesById?: Map<number, string>,
): string => {
  if (!details) return ''

  const parts = details
    .split(/\s*->\s*/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length === 2) {
    return formatHistoryTransition(fieldName, parts[0], parts[1], userNamesById)
  }

  if (parts.length === 3) {
    const inferredLabel = fieldName ? (fieldLabels[fieldName] ?? fieldName) : parts[0]
    return `${inferredLabel}: ${formatHistoryTransition(fieldName, parts[1], parts[2], userNamesById)}`
  }

  return toHistoryValueLabel(fieldName, details, userNamesById)
}

const toHistoryDetails = (item: BoardHistory, userNamesById?: Map<number, string>): string => {
  const payloadName = readHistoryPayloadName(item.newValue) ?? readHistoryPayloadName(item.oldValue) ?? readHistoryPayloadName(item.details)
  if (payloadName !== null) {
    if (item.action === 'created') return ''
    return payloadName ? `«${payloadName}»` : ''
  }
  const fieldName = item.fieldName ? (fieldLabels[item.fieldName] || item.fieldName) : ''
  const oldV = toHistoryValueLabel(item.fieldName, item.oldValue, userNamesById)
  const newV = toHistoryValueLabel(item.fieldName, item.newValue, userNamesById)
  const displayDetails = formatHistoryDetailsText(item.details, item.fieldName, userNamesById)
  const fallback = displayDetails || [fieldName, oldV, newV].filter(Boolean).join(' -> ')

  switch (item.action) {
    case 'created':
      return fallback || bt('history.text.created')
    case 'updated':
      if (fieldName && (oldV || newV)) {
        return `${fieldName}: ${formatHistoryTransition(item.fieldName, item.oldValue, item.newValue, userNamesById)}`
      }
      return (displayDetails && fieldName) ? `${fieldName}: ${displayDetails}` : (fallback || bt('history.text.updated'))
    case 'moved': {
      if (oldV || newV) {
        return bt('history.text.column', { value: formatHistoryTransition(item.fieldName, item.oldValue, item.newValue, userNamesById) })
      }
      return displayDetails ? bt('history.text.column', { value: displayDetails }) : bt('history.text.columnChanged')
    }
    case 'assigned':
      return displayDetails ? bt('history.text.assigned', { value: displayDetails }) : (newV ? bt('history.text.assigned', { value: newV }) : bt('history.text.assignedEmpty'))
    case 'unassigned':
      return displayDetails ? bt('history.text.unassigned', { value: displayDetails }) : (oldV ? bt('history.text.unassigned', { value: oldV }) : bt('history.text.unassignedEmpty'))
    case 'deleted':
      return fallback || bt('history.text.deleted')
    case 'file_attached':
      return fallback || bt('history.text.fileAttached')
    case 'file_removed':
      return fallback || bt('history.text.fileRemoved')
    case 'worklog_added':
      return fallback || bt('history.text.worklogAdded')
    case 'comment_added':
      return fallback || bt('history.text.commentAdded')
    case 'subtask_created':
      return fallback || bt('history.text.subtaskCreated')
    default:
      return fallback || bt('history.text.noDetails')
  }
}

const toTaskViewModel = (task: BoardTask): BoardTaskViewModel => {
  const meta = priorityMeta[task.priority] ?? priorityMeta.medium

  return {
    id: task.id,
    boardId: task.boardId,
    taskNumber: task.taskNumber,
    taskKey: task.taskKey,
    link: task.link,
    title: task.title,
    description: task.description,
    priority: task.priority,
    priorityLabel: meta.label,
    priorityClassName: meta.className,
    assigneeIds: task.assigneeIds,
    dueAt: task.dueAt,
    dueAtLabel: toDateLabel(task.dueAt),
    sprintId: task.sprintId,
    goalId: task.goalId,
    projectId: task.projectId,
    timeSpentLabel: secondsToLabel(task.timeSpentSec),
    attachmentsCount: task.attachments.length,
    originalEstimateSec: task.originalEstimateSec,
    attachments: task.attachments,
    createdBy: task.createdBy,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    status: task.status,
    labels: (task.labels ?? []).map((label) => ({ id: label.id, name: label.name, color: label.color })),
    parentId: task.parentId,
    subtasks: (task.subtasks ?? []).map(toTaskViewModel),
  }
}

export const toBoardOptionsViewModel = (boards: Board[]): BoardOptionViewModel[] =>
  (boards || []).map((item) => ({
    id: item.id,
    name: item.name,
    ownerId: item.ownerId,
    ownerFullName: item.ownerFullName,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    nextDueAt: item.nextDueAt,
    progress: item.progress
      ? {
          totalTasks: item.progress.totalTasks,
          completedTasks: item.progress.completedTasks,
          completionPercent: item.progress.completionPercent,
        }
      : undefined,
  }))

export const toBoardUsersViewModel = (users: BoardUser[]): BoardUserViewModel[] =>
  (users || []).map((item) => ({
    id: item.id,
    fullName: item.fullName,
    email: item.email,
    avatarUrl: item.avatarUrl,
    initials: toInitials(item.fullName),
  }))

export const toBoardTaskListViewModel = (tasks: BoardTask[]): BoardTaskViewModel[] => (tasks || []).map(toTaskViewModel)

export const toBoardLabelsViewModel = (labels: BoardLabel[]): BoardLabelViewModel[] =>
  (labels || []).map((item) => ({ id: item.id, name: item.name, color: item.color }))

export const toBoardCommentsViewModel = (comments: BoardComment[]): BoardCommentViewModel[] =>
  (comments || []).map((item) => ({
    id: item.id,
    userId: item.userId,
    authorName: item.author?.fullName ?? `User ${item.userId}`,
    content: item.content,
    attachmentUrl: item.attachmentUrl,
    createdAt: item.createdAt,
    createdAtLabel: dateTimeFormatter.format(new Date(item.createdAt)),
  }))

export const toOrgStatsViewModel = (stats: OrgKanbanStats): OrgStatsViewModel => ({
  stateBodyId: stats.stateBodyId,
  summary: (stats.summary || []).map((item) => ({ status: item.status, count: item.count })),
  projects: (stats.projects || []).map((item) => ({
    boardName: item.boardName,
    totalTasks: item.totalTasks,
    statuses: (item.statuses || []).map((status) => ({ status: status.status, count: status.count })),
  })),
  closedBy: (stats.closedBy || []).map((item) => ({
    userId: item.userId,
    fullName: item.fullName,
    closedCount: item.closedCount,
  })),
})

export const toOrgAccessUsersViewModel = (users: OrgAccessUser[]): OrgAccessUserViewModel[] =>
  users.map((item) => ({
    userId: item.userId,
    fullName: item.fullName,
    createdAtLabel: dateTimeFormatter.format(new Date(item.createdAt)),
  }))

const countRelatedTasks = (
  columns: Array<{ tasks: BoardTask[] }>,
  field: 'goalId' | 'projectId',
  id: string
): number => {
  let count = 0
  const visit = (t: BoardTask) => {
    if (t[field] === id) {
      count++
    }
    if (t.subtasks) {
      t.subtasks.forEach(visit)
    }
  }
  columns.forEach((col) => {
    if (col.tasks) {
      col.tasks.forEach(visit)
    }
  })
  return count
}

const countRelatedSprints = (sprints: Array<{ goalId?: string }>, goalId: string): number =>
  sprints.reduce((count, sprint) => count + (sprint.goalId === goalId ? 1 : 0), 0)

export const toBoardDetailsViewModel = (value: BoardDetails): BoardDetailsViewModel => {
  const columns = value.columns
    .slice()
    .sort((a, b) => a.column.position - b.column.position)
    .map((item) => ({
      id: item.column.id,
      name: item.column.name,
      key: item.column.key,
      position: item.column.position,
      tasks: item.tasks
        .map(toTaskViewModel)
        .sort((a, b) => {
          const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
          const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
          return timeB - timeA
        }),
      totalTasks: item.totalTasks,
    }))

  const totalTasks = columns.reduce((sum, column) => sum + column.totalTasks, 0)

  const goals = (value.goals || []).map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    taskCount: item.taskCount || countRelatedTasks(value.columns, 'goalId', item.id),
    completedTasks: item.completedTasks ?? 0,
    activeTasks: item.activeTasks ?? 0,
    overdueTasks: item.overdueTasks ?? 0,
    projectCount: item.projectCount ?? 0,
    sprintCount: Math.max(item.sprintCount ?? 0, countRelatedSprints(value.sprints || [], item.id)),
    completionPercent: item.completionPercent ?? 0,
    topProjectName: item.topProjectName,
    predictionLabel: item.predictionLabel,
    nextActionLabel: item.nextActionLabel,
  }))

  const projects = (value.projects || []).map((item) => ({
    id: item.id,
    goalId: item.goalId,
    name: item.name,
    description: item.description,
    status: item.status,
    taskCount: countRelatedTasks(value.columns, 'projectId', item.id),
  }))

  return {
    boardId: value.board.id,
    ownerId: value.board.ownerId,
    boardName: value.board.name,
    columns,
    sprints: value.sprints.map((item) => ({
      id: item.id,
      name: item.name,
      status: item.status,
      goalId: item.goalId,
      projectId: item.projectId,
      startDate: item.startDate,
      endDate: item.endDate,
    })),
    goals,
    projects,
    members: value.members.map((item: BoardMember) => ({
      userId: item.userId,
      role: item.role,
      teamRole: item.teamRole,
      name: item.user?.fullName ?? `User ${item.userId}`,
      initials: toInitials(item.user?.fullName ?? `U ${item.userId}`),
      avatarUrl: item.user?.avatarUrl || '',
    })),
    totalTasks,
    background: value.background
      ? {
          imageUrl: value.background.imageUrl,
          mode: value.background.mode,
          presetHex: value.background.presetHex,
          presetId: value.background.presetId,
        }
      : null,
  }
}

export const toBoardActivityViewModel = (
  worklogs: BoardWorklog[], 
  history: BoardHistory[],
  userNamesById?: Map<number, string>
): BoardActivityViewModel => ({
  worklogs: worklogs.map((item) => ({
    id: item.id,
    userId: item.userId,
    comment: item.comment,
    createdAt: item.createdAt,
    createdAtLabel: dateTimeFormatter.format(new Date(item.createdAt)),
    timeSpentLabel: secondsToLabel(item.timeSpentSec),
  })),
  history: history.map((item) => ({
    id: item.id,
    action: toHistoryActionLabel(item.action),
    details: toHistoryDetails(item, userNamesById),
    createdAt: item.createdAt,
    createdAtLabel: dateTimeFormatter.format(new Date(item.createdAt)),
    userId: item.userId,
    userName: item.user?.fullName ?? `User ${item.userId}`,
  })),
})

export interface BoardStatsViewModel {
  summary: {
    totalTasks: number
    completedTasks: number
    activeTasks: number
    overdueTasks: number
    unassignedTasks: number
    completionPercent: number
    totalEstimateLabel: string
    totalSpentLabel: string
    avgCompletionLabel: string
  }
  byStatus: Array<{ name: string; count: number; percent: number }>
  byPriority: Array<{ name: string; count: number; percent: number }>
  byDeadline: Array<{ name: string; count: number; percent: number }>
  employees: Array<{
    userId: number
    fullName: string
    assignedTasks: number
    createdTasks: number
    completedTasks: number
    activeTasks: number
    overdueTasks: number
    completionPercent: number
    overduePercent: number
    productivityScore: number
    productivityLabel: string
    productivityClassName: string
    totalEstimateLabel: string
    totalSpentLabel: string
    worklogLabel: string
  }>
  activity: Array<{ action: string; count: number }>
  worklogs: Array<{ date: string; totalSeconds: number; totalLabel: string }>
}

const productivityMeta = (score: number, assignedTasks: number): { label: string; className: string } => {
  if (!assignedTasks) return { label: bt('productivity.noAssignments'), className: 'bg-slate-50 text-slate-600 border-slate-200' }
  if (score >= 85) {
    return { label: bt('productivity.excellent'), className: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
  }
  if (score >= 65) {
    return { label: bt('productivity.good'), className: 'bg-sky-50 text-sky-700 border-sky-200' }
  }
  if (score >= 40) {
    return { label: bt('productivity.attention'), className: 'bg-amber-50 text-amber-700 border-amber-200' }
  }
  return { label: bt('productivity.risk'), className: 'bg-red-50 text-red-700 border-red-200' }
}

export const toBoardStatsViewModel = (stats: BoardStats): BoardStatsViewModel => ({
  summary: {
    totalTasks: stats.summary.totalTasks,
    completedTasks: stats.summary.completedTasks,
    activeTasks: stats.summary.activeTasks,
    overdueTasks: stats.summary.overdueTasks,
    unassignedTasks: stats.summary.unassignedTasks,
    completionPercent: stats.summary.completionPercent,
    totalEstimateLabel: secondsToLabel(stats.summary.totalEstimateSeconds),
    totalSpentLabel: secondsToLabel(stats.summary.totalSpentSeconds),
    avgCompletionLabel: secondsToLabel(stats.summary.avgCompletionSeconds),
  },
  byStatus: stats.byStatus.map((item) => ({ name: item.name, count: item.count, percent: item.percent })),
  byPriority: stats.byPriority.map((item) => ({ name: item.name, count: item.count, percent: item.percent })),
  byDeadline: stats.byDeadline.map((item) => ({ name: item.name, count: item.count, percent: item.percent })),
  employees: stats.employees
    .map((item) => {
      const meta = productivityMeta(item.productivityScore, item.assignedTasks)
      return {
        userId: item.userId,
        fullName: item.fullName,
        assignedTasks: item.assignedTasks,
        createdTasks: item.createdTasks,
        completedTasks: item.completedTasks,
        activeTasks: item.activeTasks,
        overdueTasks: item.overdueTasks,
        completionPercent: item.completionPercent,
        overduePercent: item.overduePercent,
        productivityScore: item.productivityScore,
        productivityLabel: meta.label,
        productivityClassName: meta.className,
        totalEstimateLabel: secondsToLabel(item.totalEstimateSeconds),
        totalSpentLabel: secondsToLabel(item.totalSpentSeconds),
        worklogLabel: secondsToLabel(item.worklogSeconds),
      }
    })
    .sort((a, b) => b.productivityScore - a.productivityScore || b.completedTasks - a.completedTasks),
  activity: stats.activity.map((item) => ({ action: item.action, count: item.count })),
  worklogs: stats.worklogs.map((item) => ({
    date: item.date,
    totalSeconds: item.totalSeconds,
    totalLabel: secondsToLabel(item.totalSeconds),
  })),
})
