import type { ChatMessage, MessageType, ReplyToView } from '../../../domain/entities/Chat'
import { normalizeBackendAssetUrl } from '../../../infrastructure/http/normalizeBackendAssetUrl'
import { decryptChatContentWithAnyWrappedKey, isEncryptedChatPayload } from '../../../shared/utils/chatCrypto'
import type { ChatAttachmentViewModel, CryptoState, MentionContext, MessageView } from './types'
import { mt } from './messengerText'
import { formatDate } from '../../../shared/i18n'

const FOLDER_CHAT_ASSIGNMENTS_STORAGE_KEY = 'messenger_folder_chat_assignments_v1'
const voiceMarkers = ['/voice/', 'object_name=voice%2f', 'object_name=voice/']
const backendFileUrlMarkers = [
  '/api/v1/files/download',
  '/api/v1/files/url',
  '92.38.48.9',
  '100.72.193.178',
  'alem-superapp.qaztech.gov.kz',
  'alem-workspace.gov.kz'
]

const normalizeMessageAssetUrl = (value: string | null | undefined): string | undefined => {
  if (!value) {
    return undefined
  }

  const normalized = value.toLowerCase()
  if (!backendFileUrlMarkers.some((marker) => normalized.includes(marker))) {
    return value
  }

  return normalizeBackendAssetUrl(value) ?? value
}

export const readFolderChatAssignments = (): Record<string, string[]> => {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const raw = window.localStorage.getItem(FOLDER_CHAT_ASSIGNMENTS_STORAGE_KEY)
    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw) as Record<string, string[]>
    return Object.fromEntries(
      Object.entries(parsed).map(([folderId, chatIds]) => [folderId, Array.isArray(chatIds) ? chatIds : []]),
    )
  } catch {
    return {}
  }
}

export const writeFolderChatAssignments = (value: Record<string, string[]>) => {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(FOLDER_CHAT_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(value))
}

export const getMentionContext = (value: string, caretIndex: number): MentionContext | null => {
  const safeCaret = Math.max(0, Math.min(caretIndex, value.length))
  const beforeCaret = value.slice(0, safeCaret)
  const match = beforeCaret.match(/(^|\s)@([^\s@]*)$/)

  if (!match) {
    return null
  }

  const query = match[2] ?? ''
  const start = beforeCaret.lastIndexOf('@')
  if (start < 0) {
    return null
  }

  return {
    start,
    end: safeCaret,
    query,
  }
}

export const formatTimeLabel = (value: string): string => {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()

  if (sameDay) {
    return formatDate(date, {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return formatDate(date, {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

export const formatMessageTime = (value: string): string => {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return formatDate(date, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const formatRecordingDuration = (totalSeconds: number): string => {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export const isSameCalendarDate = (leftValue: string, rightValue: string): boolean => {
  const left = new Date(leftValue)
  const right = new Date(rightValue)

  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) {
    return false
  }

  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

export const formatDaySeparatorLabel = (value: string): string => {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  if (isSameCalendarDate(date.toISOString(), today.toISOString())) {
    return mt('common.today')
  }

  if (isSameCalendarDate(date.toISOString(), yesterday.toISOString())) {
    return mt('common.yesterday')
  }

  return formatDate(date, {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

export const getInitials = (value: string): string => {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (parts.length === 0) {
    return 'CH'
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export const getSeed = (value: string): number =>
  Array.from(value).reduce((sum, char) => sum + char.charCodeAt(0), 0)

const getSpecialMessageText = (type: MessageType): string => {
  switch (type) {
    case 'image':
      return mt('utils.t02')
    case 'video':
      return mt('utils.t03')
    case 'file':
      return mt('utils.t04')
    case 'audio':
      return mt('utils.t05')
    case 'voice':
      return mt('utils.t06')
    case 'video_message':
      return mt('utils.t07')
    case 'share_task':
      return mt('utils.t08')
    case 'share_event':
      return mt('utils.t09')
    default:
      return mt('utils.t10')
  }
}

const LEGACY_MESSAGE_UNAVAILABLE_TEXT = mt('utils.t11')
const LEGACY_MESSAGE_UNAVAILABLE_PREVIEW = mt('utils.t12')

export const hasVoiceMarker = (...values: Array<string | null | undefined>): boolean =>
  values.some((value) => {
    const normalized = (value ?? '').toLowerCase()
    return voiceMarkers.some((marker) => normalized.includes(marker))
  })

export const resolveMessageTypeFromAttachment = (type: string | null | undefined): MessageType => {
  if (!type) {
    return 'text'
  }

  const normalized = type.toLowerCase()
  if (normalized === 'image' || normalized.startsWith('image/')) {
    return 'image'
  }
  if (normalized === 'video' || normalized.startsWith('video/')) {
    return 'video'
  }
  if (normalized === 'audio' || normalized.startsWith('audio/')) {
    return 'audio'
  }
  if (normalized === 'voice' || normalized === 'audio/opus' || normalized.includes('voice')) {
    return 'voice'
  }
  if (normalized === 'video_message' || normalized === 'video_note' || normalized.includes('video_message')) {
    return 'video_message'
  }
  if (normalized === 'file' || normalized === 'document' || normalized.includes('/')) {
     return 'file'
  }

  return 'text'
}

export const parseJsonRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value) {
    return null
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  if (typeof value !== 'string') {
    return null
  }

  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export const getFileExtension = (value: string | null | undefined): string | undefined => {
  if (!value) {
    return undefined
  }

  const cleanValue = value.split('?')[0]?.trim()
  if (!cleanValue) {
    return undefined
  }

  const lastDotIndex = cleanValue.lastIndexOf('.')
  if (lastDotIndex < 0) {
    return undefined
  }

  const ext = cleanValue.slice(lastDotIndex).toLowerCase()
  return ext || undefined
}

const normalizeAttachmentFilename = (value: string | null | undefined): string | undefined => {
  if (!value) {
    return undefined
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  return trimmed.replace(/^\d{10,}_/, '')
}

const getObjectNameFromUrl = (value: string | null | undefined): string | undefined => {
  if (!value) {
    return undefined
  }

  try {
    const parsed = new URL(value, window.location.origin)
    const objectName = parsed.searchParams.get('object_name')
    return objectName ? decodeURIComponent(objectName) : undefined
  } catch {
    return undefined
  }
}

const getFilenameFromUrl = (value: string | null | undefined): string | undefined => {
  if (!value) {
    return undefined
  }

  const objectName = getObjectNameFromUrl(value)
  if (objectName) {
    const fromObjectName = normalizeAttachmentFilename(objectName.split('/').pop())
    if (fromObjectName) {
      return fromObjectName
    }
  }

  try {
    const parsed = new URL(value, window.location.origin)
    const pathnameFilename = normalizeAttachmentFilename(parsed.pathname.split('/').pop())
    if (pathnameFilename) {
      return pathnameFilename
    }
  } catch {
    const pathnameFilename = normalizeAttachmentFilename(value.split('/').pop())
    if (pathnameFilename) {
      return pathnameFilename
    }
  }

  return undefined
}

export const iconByExtension = (ext?: string): ChatAttachmentViewModel['icon'] => {
  switch (ext) {
    case '.pdf':
      return 'pdf'
    case '.doc':
    case '.docx':
      return 'word'
    case '.xls':
    case '.xlsx':
    case '.csv':
      return 'excel'
    case '.ppt':
    case '.pptx':
      return 'presentation'
    case '.txt':
      return 'text'
    case '.zip':
    case '.rar':
    case '.7z':
      return 'archive'
    default:
      return 'file'
  }
}

const readFirstString = (records: Array<Record<string, unknown> | null>, keys: string[]): string | null => {
  for (const record of records) {
    if (!record) {
      continue
    }

    for (const key of keys) {
      const value = record[key]
      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
    }
  }

  return null
}

export const isVideoCallLikeMessage = (
  message: ChatMessage,
  resolvedContent: { content: string; unavailable: boolean },
): boolean => {
  if (message.type === 'video_message') {
    return true
  }

  if (message.type !== 'text') {
    return false
  }

  const payloads = [parseJsonRecord(message.metadata), parseJsonRecord(message.content)]
  const direction = readFirstString(payloads, ['direction', 'call_direction', 'callDirection', 'kind'])
  const status = readFirstString(payloads, ['status', 'call_status', 'callStatus', 'state'])
  const type = readFirstString(payloads, ['type', 'message_type', 'messageType', 'event'])

  if (direction || status || type) {
    const jsonBlob = `${direction ?? ''} ${status ?? ''} ${type ?? ''}`.toLowerCase()
    if (
      jsonBlob.includes('call') ||
      jsonBlob.includes('video') ||
      jsonBlob.includes('звон') || // i18n-ignore
      jsonBlob.includes('видео') // i18n-ignore
    ) {
      return true
    }
  }

  const rawBlob = `${resolvedContent.unavailable ? '' : resolvedContent.content} ${message.metadata ?? ''}`.toLowerCase().trim()
  const normalizedRawBlob = rawBlob.replace(/\s+/g, ' ')
  if (!rawBlob) {
    return false
  }

  return (
    normalizedRawBlob === 'видеозвонок' || // i18n-ignore
    normalizedRawBlob === 'video call' ||
    normalizedRawBlob === 'исходящий видеозвонок' || // i18n-ignore
    normalizedRawBlob === 'входящий видеозвонок' || // i18n-ignore
    rawBlob.includes('incoming_call') ||
    rawBlob.includes('outgoing_call') ||
    rawBlob.includes('call_status') ||
    rawBlob.includes('call_direction')
  )
}

const resolveRenderableMessageType = (
  message: ChatMessage,
  resolvedContent: { content: string; unavailable: boolean },
): MessageType => {
  if (message.type === 'text' && message.metadata) {
    try {
      const meta = JSON.parse(message.metadata)
      if (meta && (meta.is_service === true || meta.system_type)) {
        return 'service'
      }
    } catch (_) {}
  }

  if (message.type !== 'video_message') {
    return message.type
  }

  const attachmentType = (message.attachmentType ?? '').toLowerCase()
  if (attachmentType.startsWith('audio/')) {
    return 'voice'
  }

  const content = resolvedContent.unavailable ? '' : resolvedContent.content.toLowerCase()
  const attachmentUrl = (message.attachmentUrl ?? '').toLowerCase()

  if (hasVoiceMarker(content, attachmentUrl)) {
    return 'voice'
  }

  return message.type
}

const resolveMessageAttachment = (
  message: ChatMessage,
  renderableType: MessageType,
  resolvedContent: { content: string; unavailable: boolean },
): ChatAttachmentViewModel | undefined => {
  if (resolvedContent.unavailable) {
    return undefined
  }

  if (!['image', 'video', 'video_message', 'audio', 'voice', 'file'].includes(renderableType)) {
    return undefined
  }

  const metadata = parseJsonRecord(message.metadata)
  const attachmentMetadata = metadata?.attachment && typeof metadata.attachment === 'object' && !Array.isArray(metadata.attachment)
    ? (metadata.attachment as Record<string, unknown>)
    : null

  const metadataFilename =
    typeof attachmentMetadata?.filename === 'string'
      ? attachmentMetadata.filename
      : typeof metadata?.title === 'string'
        ? metadata.title
        : typeof metadata?.file_name === 'string'
          ? metadata.file_name
        : null
  const metadataObjectName = typeof attachmentMetadata?.object_name === 'string' ? attachmentMetadata.object_name : null
  const url =
    normalizeMessageAssetUrl(message.attachmentUrl) ??
    normalizeMessageAssetUrl(resolvedContent.content) ??
    normalizeMessageAssetUrl(typeof metadata?.download_url === 'string' ? metadata.download_url : null) ??
    (metadataObjectName ? normalizeMessageAssetUrl(`/api/v1/files/download?object_name=${encodeURIComponent(metadataObjectName)}`) : undefined)
  if (!url) {
    return undefined
  }
  const metadataMime =
    typeof attachmentMetadata?.mime === 'string'
      ? attachmentMetadata.mime
      : typeof metadata?.mime_type === 'string'
        ? metadata.mime_type
        : null
  const metadataExt = typeof attachmentMetadata?.ext === 'string' ? attachmentMetadata.ext.toLowerCase() : null
  const metadataSize =
    typeof attachmentMetadata?.size === 'number'
      ? attachmentMetadata.size
      : typeof attachmentMetadata?.size === 'string'
        ? Number(attachmentMetadata.size)
        : typeof metadata?.size === 'number'
          ? metadata.size
          : typeof metadata?.size === 'string'
            ? Number(metadata.size)
        : null

  const objectName = metadataObjectName ?? getObjectNameFromUrl(url)
  const filename =
    normalizeAttachmentFilename(metadataFilename) ??
    normalizeAttachmentFilename(message.attachmentUrl?.split('/').pop()) ??
    normalizeAttachmentFilename(objectName?.split('/').pop()) ??
    getFilenameFromUrl(url) ??
    'file'
  const ext = metadataExt ?? getFileExtension(filename) ?? getFileExtension(objectName) ?? getFileExtension(url)
  const mime = message.attachmentType ?? metadataMime ?? undefined
  const size = message.attachmentSize ?? (Number.isFinite(metadataSize) && metadataSize !== null ? metadataSize : undefined)

  if (renderableType === 'image') {
    return { kind: 'image', url, objectName: objectName ?? undefined, filename, size, mime, ext, icon: 'image' }
  }

  if (renderableType === 'video') {
    return { kind: 'video', url, objectName: objectName ?? undefined, filename, size, mime, ext, icon: 'video' }
  }

  if (renderableType === 'video_message') {
    return { kind: 'video_message', url, objectName: objectName ?? undefined, filename, size, mime, ext, icon: 'video' }
  }

  if (renderableType === 'audio' || renderableType === 'voice') {
    return { kind: renderableType, url, objectName: objectName ?? undefined, filename, size, mime, ext, icon: 'audio' }
  }

  return {
    kind: 'file',
    url,
    objectName: objectName ?? undefined,
    filename,
    size,
    mime,
    ext,
    icon: iconByExtension(ext),
  }
}

const resolveDecryptedValue = async (
  content: string,
  encryptedKeys: Record<string, string>,
  cryptoState: CryptoState,
): Promise<{
  content: string
  previewText?: string
  unavailable: boolean
}> => {
  if (!isEncryptedChatPayload(content)) {
    return { content, unavailable: false }
  }

  if (!cryptoState.currentDeviceId) {
    return {
      content: LEGACY_MESSAGE_UNAVAILABLE_TEXT,
      previewText: LEGACY_MESSAGE_UNAVAILABLE_PREVIEW,
      unavailable: false,
    }
  }

  if (!cryptoState.privateKey) {
    return {
      content: LEGACY_MESSAGE_UNAVAILABLE_TEXT,
      previewText: LEGACY_MESSAGE_UNAVAILABLE_PREVIEW,
      unavailable: false,
    }
  }

  const wrappedKeyEntries = Object.entries(encryptedKeys)

  if (wrappedKeyEntries.length === 0) {
    return {
      content: LEGACY_MESSAGE_UNAVAILABLE_TEXT,
      previewText: LEGACY_MESSAGE_UNAVAILABLE_PREVIEW,
      unavailable: false,
    }
  }

  try {
    const { plaintext } = await decryptChatContentWithAnyWrappedKey(
      content,
      encryptedKeys,
      cryptoState.privateKey,
      cryptoState.currentDeviceId,
    )
    return { content: plaintext, unavailable: false }
  } catch {
    return {
      content: LEGACY_MESSAGE_UNAVAILABLE_TEXT,
      previewText: LEGACY_MESSAGE_UNAVAILABLE_PREVIEW,
      unavailable: false,
    }
  }
}

const resolveMessageContentValue = (message: ChatMessage, cryptoState: CryptoState) =>
  resolveDecryptedValue(message.content, message.encryptedKeys, cryptoState)

const resolveReplyToView = async (replyTo: ReplyToView, cryptoState: CryptoState): Promise<ReplyToView> => {
  const resolved = await resolveDecryptedValue(replyTo.content, replyTo.encryptedKeys ?? {}, cryptoState)
  return {
    ...replyTo,
    content: resolved.content,
  }
}

export const resolveMessageText = async (
  message: ChatMessage,
  cryptoState: CryptoState,
  options?: { compact?: boolean },
): Promise<{ text: string; unavailable: boolean }> => {
  if (message.isDeleted) {
    return { text: mt('utils.t18'), unavailable: false }
  }

  const resolved = await resolveMessageContentValue(message, cryptoState)

  if (message.type !== 'text') {
    return { text: getSpecialMessageText(message.type), unavailable: false }
  }

  return {
    text: options?.compact ? resolved.previewText ?? resolved.content : resolved.content,
    unavailable: false,
  }
}

export const toMessageView = async (
  message: ChatMessage,
  currentUserId: number,
  cryptoState: CryptoState,
): Promise<MessageView> => {
  const resolved = await resolveMessageText(message, cryptoState)
  const resolvedContent = await resolveMessageContentValue(message, cryptoState)
  const senderLabel = message.senderFullName || message.senderUsername || 'Unknown'
  const renderableType = resolveRenderableMessageType(message, resolvedContent)
  const isCall = isVideoCallLikeMessage(message, resolvedContent)
  const attachment = resolveMessageAttachment(message, renderableType, resolvedContent)

  return {
    raw: message,
    replyTo: message.replyTo ? await resolveReplyToView(message.replyTo, cryptoState) : null,
    kind: renderableType,
    from: message.senderId === currentUserId ? 'me' : 'them',
    senderLabel,
    text: resolved.text,
    attachment,
    mediaUrl: attachment?.kind === 'image' ? attachment.url : undefined,
    audioUrl: attachment?.kind === 'voice' || attachment?.kind === 'audio' ? attachment.url : undefined,
    videoUrl: attachment?.kind === 'video' || attachment?.kind === 'video_message' ? attachment.url : undefined,
    time: formatMessageTime(message.createdAt),
    status: message.isRead ? 'read' : message.deliveredCount > 0 ? 'delivered' : 'sent',
    unavailable: false,
    isCall,
  }
}
