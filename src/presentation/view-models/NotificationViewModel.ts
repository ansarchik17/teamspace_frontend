import type { CallHistoryItem, NotificationItem } from '../../domain/entities/Notification'
import {
  buildNotificationCompactMeta,
  detectAppLocale,
  formatNotificationDateTime,
  getNotificationFallbackMessage,
  getNotificationFallbackTitle,
  getNotificationIconName,
  getNotificationPreview,
  getNotificationSourceName,
  getNotificationStatusMeta,
} from '../../shared/notifications/notificationPresentation'

export interface NotificationItemViewModel {
  id: string
  userId?: number
  organizerId?: number | null
  type: string
  title: string
  subtitle: string
  preview?: string
  isRead: boolean
  icon: string
  createdAt: string
  dateLabel?: string
  sourceName?: string
  sourceSystemCode?: string
  status?: string
  statusLabel?: string
  statusTone?: 'success' | 'warning' | 'error' | 'neutral'
  actionUrl?: string
  fullMessage?: string
  notificationType?: string
  externalMessageId?: string
  applicationNumber?: string
  processedAt?: string
  metadata?: Record<string, unknown>
}

export interface CallHistoryItemViewModel {
  id: string
  callId: string
  roomName: string
  status: string
  fromName: string
  createdAt: string
}

const asTrimmedText = (value: unknown): string =>
  typeof value === 'string' && value.trim() ? value.trim() : ''

const getTaskMetadataText = (metadata: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
    const text = asTrimmedText(value)
    if (text) return text
  }
  return ''
}

const isTaskNotification = (item: NotificationItem): boolean =>
  /task|kanban|задач/i.test(`${item.type} ${item.notificationType}`)

const getTaskReference = (item: NotificationItem): string => {
  const metadata = item.metadata ?? {}
  const fromMetadata = getTaskMetadataText(metadata, [
    'task_id',
    'taskId',
    'kanban_task_id',
    'kanbanTaskId',
  ])
  return fromMetadata
}

const getTaskDueDateKey = (item: NotificationItem): string => {
  const metadata = item.metadata ?? {}
  const fromMetadata = getTaskMetadataText(metadata, ['due_at', 'dueAt', 'due_date', 'dueDate', 'deadline'])
  const fromText = `${fromMetadata} ${item.messageText || item.content || ''}`.match(/\b\d{4}-\d{2}-\d{2}\b/)
  return fromText?.[0] ?? ''
}

const getLocalDateKey = (date = new Date()): string => {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

const getTaskActionUrl = (item: NotificationItem): string | undefined => {
  const taskReference = getTaskReference(item)
  if (taskReference) return `/board?task=${encodeURIComponent(taskReference)}`
  const apiTaskId = item.actionUrl?.match(/\/kanban\/tasks\/([^/?#]+)/i)?.[1]
  if (apiTaskId) return `/board?task=${encodeURIComponent(apiTaskId)}`

  return item.actionUrl || undefined
}

const getNotificationTitle = (item: NotificationItem): string => {
  const sourceTitle = item.title?.trim() || getNotificationFallbackTitle(item, detectAppLocale())
  if (!isTaskNotification(item) || !/просроч/i.test(sourceTitle)) return sourceTitle
  return getTaskDueDateKey(item) === getLocalDateKey() ? 'Срок задачи сегодня' : sourceTitle
}

export const toNotificationItemViewModel = (item: NotificationItem): NotificationItemViewModel => {
  const locale = detectAppLocale()
  const title = getNotificationTitle(item)
  const preview = getNotificationPreview(item, locale)
  const dateLabel = formatNotificationDateTime(item.createdAt, locale)
  const sourceName = getNotificationSourceName(item)
  const statusMeta = getNotificationStatusMeta(item.status, locale)
  const fullMessage = getNotificationFallbackMessage(item, locale)

  return {
    id: item.id,
    userId: item.userId,
    organizerId: item.organizerId,
    type: item.type,
    title,
    subtitle: buildNotificationCompactMeta(preview, sourceName, item.createdAt, locale),
    preview,
    isRead: item.isRead,
    icon: getNotificationIconName(item),
    createdAt: item.createdAt,
    dateLabel,
    sourceName,
    sourceSystemCode: item.sourceSystemCode,
    status: item.status,
    statusLabel: statusMeta?.label,
    statusTone: statusMeta?.tone,
    actionUrl: getTaskActionUrl(item),
    fullMessage,
    notificationType: item.notificationType,
    externalMessageId: item.externalMessageId,
    applicationNumber: item.applicationNumber,
    processedAt: item.processedAt,
    metadata: item.metadata,
  }
}

export const toCallHistoryItemViewModel = (item: CallHistoryItem): CallHistoryItemViewModel => ({
  id: item.id,
  callId: item.callId,
  roomName: item.roomName || item.roomId,
  status: item.status,
  fromName: item.fromName || `User ${item.fromUserId}`,
  createdAt: item.createdAt,
})
