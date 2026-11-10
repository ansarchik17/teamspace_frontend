export type MessageDeleteScope = 'me' | 'everyone'

export interface MessageModerationRules {
  editWindowSeconds: number
  deleteForEveryoneWindowSeconds: number
  deleteScopes: MessageDeleteScope[]
}

export const DEFAULT_MESSAGE_MODERATION_RULES: MessageModerationRules = {
  editWindowSeconds: 172800,
  deleteForEveryoneWindowSeconds: 172800,
  deleteScopes: ['me', 'everyone'],
}

export interface ModeratedMessage {
  senderId: number | string | null | undefined
  createdAt: string
  isDeleted?: boolean
  type?: string
}

const toWindowSeconds = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback

export function normalizeMessageModerationRules(
  input: Partial<MessageModerationRules> | null | undefined,
): MessageModerationRules {
  const scopes = Array.isArray(input?.deleteScopes)
    ? input.deleteScopes.filter((scope): scope is MessageDeleteScope => scope === 'me' || scope === 'everyone')
    : []

  return {
    editWindowSeconds: toWindowSeconds(input?.editWindowSeconds, DEFAULT_MESSAGE_MODERATION_RULES.editWindowSeconds),
    deleteForEveryoneWindowSeconds: toWindowSeconds(
      input?.deleteForEveryoneWindowSeconds,
      DEFAULT_MESSAGE_MODERATION_RULES.deleteForEveryoneWindowSeconds,
    ),
    deleteScopes: scopes.length > 0 ? Array.from(new Set(scopes)) : [...DEFAULT_MESSAGE_MODERATION_RULES.deleteScopes],
  }
}

export function getModerationWindowRemainingMs(createdAt: string, windowSeconds: number, now: number = Date.now()): number {
  if (windowSeconds <= 0) {
    return Number.POSITIVE_INFINITY
  }
  const createdAtMs = new Date(createdAt).getTime()
  if (!Number.isFinite(createdAtMs)) {
    return 0
  }
  return Math.max(0, createdAtMs + windowSeconds * 1000 - now)
}

export function isWithinModerationWindow(createdAt: string, windowSeconds: number, now: number = Date.now()): boolean {
  if (windowSeconds <= 0) {
    return true
  }
  const createdAtMs = new Date(createdAt).getTime()
  return Number.isFinite(createdAtMs) && now <= createdAtMs + windowSeconds * 1000
}

const isSameUser = (senderId: ModeratedMessage['senderId'], userId: number | string | null | undefined): boolean =>
  senderId !== null && senderId !== undefined && userId !== null && userId !== undefined && String(senderId) === String(userId)

export function canEditMessage(
  message: ModeratedMessage,
  currentUserId: number | string | null | undefined,
  rules: MessageModerationRules,
  now: number = Date.now(),
): boolean {
  if (message.isDeleted || !isSameUser(message.senderId, currentUserId)) {
    return false
  }
  if (message.type !== undefined && message.type !== 'text') {
    return false
  }
  return isWithinModerationWindow(message.createdAt, rules.editWindowSeconds, now)
}

export function canDeleteMessagesForEveryone(
  messages: ModeratedMessage[],
  context: { currentUserId: number | string | null | undefined; isModerator?: boolean },
  rules: MessageModerationRules,
  now: number = Date.now(),
): boolean {
  if (messages.length === 0 || !rules.deleteScopes.includes('everyone')) {
    return false
  }
  if (context.isModerator) {
    return true
  }
  return messages.every(
    (message) =>
      isSameUser(message.senderId, context.currentUserId) &&
      isWithinModerationWindow(message.createdAt, rules.deleteForEveryoneWindowSeconds, now),
  )
}

export function canDeleteMessagesForMe(rules: MessageModerationRules): boolean {
  return rules.deleteScopes.includes('me')
}

export function formatModerationWindow(windowSeconds: number): string {
  if (windowSeconds <= 0) {
    return 'без ограничения'
  }
  if (windowSeconds % 86400 === 0 && windowSeconds >= 3 * 86400) {
    return `${windowSeconds / 86400} дн`
  }
  if (windowSeconds % 3600 === 0) {
    return `${windowSeconds / 3600} ч`
  }
  if (windowSeconds >= 60) {
    return `${Math.round(windowSeconds / 60)} мин`
  }
  return `${windowSeconds} сек`
}

export interface MessageDeletedEvent {
  messageIds: string[]
  conversationId: string | null
  isForEveryone: boolean
  newLastMessage: Record<string, unknown> | null
}

export function parseMessageDeletedEvent(payload: unknown): MessageDeletedEvent | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }
  const event = payload as Record<string, unknown>
  if (event.type !== 'message_deleted') {
    return null
  }
  const content = event.content && typeof event.content === 'object' ? (event.content as Record<string, unknown>) : {}

  const ids = new Set<string>()
  const pushId = (value: unknown) => {
    if (typeof value === 'string' && value) {
      ids.add(value)
    }
  }
  pushId(event.message_id)
  for (const list of [event.message_ids, content.message_ids]) {
    if (Array.isArray(list)) {
      list.forEach(pushId)
    }
  }
  if (ids.size === 0) {
    return null
  }

  const newLastMessage = content.new_last_message
  return {
    messageIds: Array.from(ids),
    conversationId: typeof event.conversation_id === 'string' ? event.conversation_id : null,
    isForEveryone: content.is_for_everyone === true || content.scope === 'everyone',
    newLastMessage:
      newLastMessage && typeof newLastMessage === 'object' && typeof (newLastMessage as { id?: unknown }).id === 'string'
        ? (newLastMessage as Record<string, unknown>)
        : null,
  }
}
