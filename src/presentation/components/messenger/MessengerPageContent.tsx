import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import type { ChangeEvent, CSSProperties, FormEvent, MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react'
import { useLayoutEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { mt } from './messengerText'
import { formatDate } from '../../../shared/i18n'
import type { AuthTokens } from '../../../domain/entities/AuthTokens'
import type { ChatTheme, ChatThemeConfigInput } from '../../../domain/entities/ChatTheme'
import type { ChatAttachmentTypeFilter, GlobalChatSearchResult, ChatFolder, ChatGroupDetails, ChatGroupMember, ChatMessage, MessageType, MessageViewer, PinnedMessage, ReplyToView, UnifiedChat, ChatType, GlobalChatSearchItem } from '../../../domain/entities/Chat'
import { HttpAuthRepository } from '../../../infrastructure/repositories/HttpAuthRepository'
import { HttpChatRepository, toChatMessage } from '../../../infrastructure/repositories/HttpChatRepository'
import { HttpChatThemeRepository } from '../../../infrastructure/repositories/HttpChatThemeRepository'
import { HttpChannelRepository, toChannelPost } from '../../../infrastructure/repositories/HttpChannelRepository'
import type { ChannelPostViewDto } from '../../../infrastructure/repositories/HttpChannelRepository'
import type { ChannelView, UpdateChannelInput, ChannelPostView } from '../../../domain/entities/Channel'
import type { CalendarEvent, CreateCalendarEventPayload } from '../../../domain/entities/CalendarEvent'
import {
  HttpUserDirectoryRepository,
  type CreateUserReviewInput,
  type UserDirectoryUser,
  type UserDirectoryUserDetails,
} from '../../../infrastructure/repositories/HttpUserDirectoryRepository'
import { IndexedDbKeyStore } from '../../../infrastructure/storage/IndexedDbKeyStore'
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore'
import { WebDeviceSessionStore } from '../../../infrastructure/storage/WebDeviceSessionStore'
import { normalizeBackendAssetUrl } from '../../../infrastructure/http/normalizeBackendAssetUrl'
import { dispatchAuthSessionExpired } from '../../../shared/auth/authSessionEvents'
import { refreshSessionWithLock } from '../../../infrastructure/http/authorizedFetch'
import { playOutgoingMessageSound } from '../../../shared/audio/messageNotificationSound'
import { ALEM_MESSENGER_MUTE_MAP_EVENT } from '../../../shared/messenger/muteMapEvents'
import { normalizeConversationIdKey } from '../../../shared/messenger/realtimeConversationId'
import { shouldReloadMessengerChatList } from '../../../shared/messenger/messengerWsEventsWithoutChatReload'
import {
  DEFAULT_MESSAGE_MODERATION_RULES,
  canDeleteMessagesForEveryone,
  canDeleteMessagesForMe,
  canEditMessage,
  formatModerationWindow,
  normalizeMessageModerationRules,
  parseMessageDeletedEvent,
  type MessageDeletedEvent,
  type MessageModerationRules,
} from '../../../shared/messenger/messageModeration'
import { readLastActiveChatId, writeLastActiveChatId } from '../../../shared/messenger/lastActiveChat'
import { buildReplyThread, countDirectReplies, formatReplyCount } from '../../../shared/messenger/replyTree'
import { getErrorMessage } from '../../../shared/utils/getErrorMessage'
import { forwardChatMessages } from '../../../shared/utils/chatForwarding'
import { HttpSmartAgentRepository } from '../../../infrastructure/repositories/HttpSmartAgentRepository'
import { HttpAlemAiRepository } from '../../../infrastructure/repositories/HttpAlemAiRepository'
import type { SmartAgentConversationSummary } from '../../pages/alemai/smart-agent/types'
import { sanitizeSmartAgentAssistantText } from '../../pages/alemai/smart-agent/utils'
import MS from '../../../shared/ui/MaterialSymbol'
import { C } from '../../pages/dashboard/model/constants'
import GlobalMessageSearchResults from './GlobalMessageSearchResults'
import ContactItem from './ContactItem'
import ChatListFilters from './ChatListFilters'
import { loadHiddenGroupChat } from './hiddenGroupChats'
import { clearMessengerListSnapshot, messengerSnapshotScope, readMessengerListSnapshot, writeMessengerListSnapshot } from './messengerListSnapshot'
import ChatHistoryLoadingState from './ChatHistoryLoadingState'
import EmojiPicker from './EmojiPicker'
import InfoPanel from './InfoPanel'
import GroupProfileModal from './GroupProfileModal'
import GroupInfoDrawer from './GroupInfoDrawer'
import SharedMediaDialog from './SharedMediaDialog'
import ChannelProfileModal from './ChannelProfileModal'
import type { ChannelMember, ChannelRole } from '../../../domain/entities/Channel'
import MessageBubble, { MESSENGER_OPEN_USER_CHAT_EVENT } from './MessageBubble'
import MessengerAvatar from './MessengerAvatar'
import MessengerThemePanel from './MessengerThemePanel'
import { getDefaultChatCanvasStyle } from './chatWallpaper'
import PinnedIcon from './PinnedIcon'
import UserProfileModal from './UserProfileModal'
import VideoMessageRecordingPreview from './VideoMessageRecordingPreview'
import DriveFilePickerModal from './DriveFilePickerModal'
// @ts-expect-error: drive-src uses internal legacy logic
import { grantPermission } from '../../pages/alemdrive/drive-src/api/files'
import { useCallManager } from '../../calls/useCallManager'
import { useQrLogin } from '../../hooks/useQrLogin'
import { MESSENGER_VIDEO_CALLS_ENABLED } from './featureFlags'
import { HttpCallRepository } from '../../../infrastructure/repositories/HttpCallRepository'
import { HttpGroupCalendarRepository } from '../../../infrastructure/repositories/HttpGroupCalendarRepository'
import type { CallRecording } from '../../../domain/entities/Call'
import type {
  ChatListItem,
  ChatListContextMenuState,
  ChatSearchResultItem,
  CryptoState,
  CurrentUserState,
  MessageContextMenuState,
  MessageView,
  GroupSharedAttachmentItem,
  SelectedMessageActionState,
  TypingIndicatorState,
} from './types'
import {
  formatDaySeparatorLabel,
  formatMessageTime,
  formatRecordingDuration,
  formatTimeLabel,
  getInitials,
  getMentionContext,
  getSeed,
  isSameCalendarDate,
  isVideoCallLikeMessage,
  readFolderChatAssignments,
  resolveMessageText,
  resolveMessageTypeFromAttachment,
  toMessageView,
  writeFolderChatAssignments,
  parseJsonRecord,
} from './utils'

const getFriendlyMessageText = (text: string | null | undefined, type: string): string => {
  if (!text) return mt('page.t000')
  const normalized = text.toLowerCase()
  const isUrl = normalized.startsWith('http') || normalized.startsWith('/api/') || normalized.includes('object_name=')
  if (isUrl) {
    switch (type) {
      case 'image':
        return mt('page.t001')
      case 'video':
        return mt('page.t002')
      case 'video_message':
        return mt('page.t003')
      case 'voice':
        return mt('page.t004')
      case 'audio':
        return mt('page.t005')
      case 'file':
        return mt('page.t006')
      default:
        return mt('page.t000')
    }
  }
  return text
}

const DEFAULT_CHAT_LIST_PANEL_WIDTH = 340
const MIN_CHAT_LIST_PANEL_WIDTH = 280
const MAX_CHAT_LIST_PANEL_WIDTH = 440
const RECORD_LOCK_THRESHOLD = 84
const CHAT_HISTORY_PAGE_SIZE = 50
const CHAT_HISTORY_TOP_THRESHOLD = 120
const CHAT_HISTORY_BOTTOM_THRESHOLD = 40
const MESSENGER_UNREAD_COUNT_EVENT = 'messenger:unread-count-changed'
const CHANNEL_VIEWED_AT_STORAGE_KEY = 'messenger:channel-viewed-at'
const MOBILE_MESSENGER_BREAKPOINT = 960

interface ReplyThreadViewRow {
  id: string
  depth: number
  senderLabel: string
  time: string
  text: string
}
const CHAT_SEARCH_MIN_QUERY_LENGTH = 2
const CHAT_SEARCH_DEBOUNCE_MS = 320
const CHAT_SEARCH_PANEL_LIMIT = 20
const IMAGE_ATTACHMENT_LIMIT_BYTES = 50 * 1024 * 1024
const VIDEO_ATTACHMENT_LIMIT_BYTES = 1024 * 1024 * 1024
const DOCUMENT_ATTACHMENT_LIMIT_BYTES = 100 * 1024 * 1024
const GENERIC_ATTACHMENT_LIMIT_BYTES = 500 * 1024 * 1024
const IMAGE_ATTACHMENT_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp'])
const VIDEO_ATTACHMENT_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.mkv'])
const AUDIO_ATTACHMENT_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.opus'])
const DOCUMENT_ATTACHMENT_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt'])

const shouldSkipServerReadReceipt = (messageId: string): boolean =>
  !messageId || messageId.startsWith('sa-history-') || messageId.startsWith('draft-')

const getEmptyChatStateMessages = () => [
  mt('page.t007'),
  mt('page.t008'),
  mt('page.t009'),
  mt('page.t010'),
  mt('page.t011'),
  mt('page.t012'),
  mt('page.t013'),
]

const SMART_ASSISTANT_PROFILE_ID = -1

const isVirtualProfileId = (userId: number | null | undefined): userId is number =>
  typeof userId === 'number' && userId <= 0

const buildSmartAssistantProfile = (): UserDirectoryUserDetails => ({
  id: SMART_ASSISTANT_PROFILE_ID,
  email: 'smart.ai@alem.local',
  username: 'smart_agent',
  firstName: 'Smart',
  lastName: 'AI',
  fullName: 'Smart AI',
  avatarUrl: null,
  isActive: true,
  lastSeenAt: null,
  keycloakId: 'smart-agent',
  iin: '',
  ministryId: null,
  stateBodyId: null,
  role: 'assistant',
  availabilityStatus: 'online',
  createdAt: null,
  lastLoginAt: null,
  isFirstLogin: false,
  isSupport: true,
  ministryName: '',
  stateBodyName: 'Team Workspace',
  bossId: null,
  bossName: '',
  reviewStats: null,
  hasReviewedThisMonth: true,
  educations: [],
  licenses: [],
})

const pickRandomItem = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)]

type MessengerAttachmentUploadType = 'image' | 'video' | 'document' | 'file'

interface MessengerAttachmentSelection {
  uploadType: MessengerAttachmentUploadType
  messageType: MessageType
  ext: string
  mime: string
  maxSizeBytes: number
  limitLabel: string
}

const readChannelViewedAtMap = (): Record<string, string> => {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const raw = window.localStorage.getItem(CHANNEL_VIEWED_AT_STORAGE_KEY)
    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw) as Record<string, string> | null
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const writeChannelViewedAtMap = (next: Record<string, string>): void => {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(CHANNEL_VIEWED_AT_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Ignore storage failures and keep runtime behavior intact.
  }
}

const getAttachmentExtension = (filename: string): string => {
  const trimmed = filename.trim()
  const dotIndex = trimmed.lastIndexOf('.')
  return dotIndex >= 0 ? trimmed.slice(dotIndex).toLowerCase() : ''
}

const isGalleryImageFile = (file: { name?: string; type?: string }): boolean => {
  const ext = getAttachmentExtension(file.name ?? '')
  const mime = (file.type ?? '').toLowerCase()
  return IMAGE_ATTACHMENT_EXTENSIONS.has(ext) || mime.startsWith('image/')
}

const formatAttachmentLimit = (bytes: number): string => {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${Math.round(bytes / (1024 * 1024 * 1024))} GB`
  }

  return `${Math.round(bytes / (1024 * 1024))} MB`
}

const parseAttachmentSizeValue = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }

  return undefined
}

const resolveSharedAttachmentKind = (name?: string | null, mime?: string | null): GroupSharedAttachmentItem['kind'] => {
  const normalizedMime = (mime ?? '').toLowerCase()
  const ext = getAttachmentExtension(name ?? '')

  if (IMAGE_ATTACHMENT_EXTENSIONS.has(ext) || normalizedMime.startsWith('image/')) {
    return 'image'
  }

  if (VIDEO_ATTACHMENT_EXTENSIONS.has(ext) || normalizedMime.startsWith('video/')) {
    return 'video'
  }

  if (AUDIO_ATTACHMENT_EXTENSIONS.has(ext) || normalizedMime.startsWith('audio/')) {
    return 'audio'
  }

  return 'file'
}

const resolveSharedAttachmentIcon = (
  kind: GroupSharedAttachmentItem['kind'],
  name?: string | null,
): GroupSharedAttachmentItem['icon'] => {
  if (kind === 'image') return 'image'
  if (kind === 'video') return 'video'
  if (kind === 'audio') return 'audio'

  const ext = getAttachmentExtension(name ?? '')
  if (['.pdf'].includes(ext)) return 'pdf'
  if (['.doc', '.docx', '.rtf', '.odt'].includes(ext)) return 'word'
  if (['.xls', '.xlsx', '.csv'].includes(ext)) return 'excel'
  if (['.ppt', '.pptx', '.odp'].includes(ext)) return 'presentation'
  if (['.txt', '.md', '.json', '.xml', '.log'].includes(ext)) return 'text'
  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) return 'archive'
  return 'file'

}
const classifyAttachmentFile = (file: File): MessengerAttachmentSelection => {
  const ext = getAttachmentExtension(file.name)
  const mime = file.type.toLowerCase()

  if (IMAGE_ATTACHMENT_EXTENSIONS.has(ext) || (mime.startsWith('image/') && (!ext || IMAGE_ATTACHMENT_EXTENSIONS.has(ext)))) {
    return {
      uploadType: 'image',
      messageType: 'image',
      ext,
      mime: mime || 'image/*',
      maxSizeBytes: IMAGE_ATTACHMENT_LIMIT_BYTES,
      limitLabel: formatAttachmentLimit(IMAGE_ATTACHMENT_LIMIT_BYTES),
    }
  }

  if (VIDEO_ATTACHMENT_EXTENSIONS.has(ext)) {
    return {
      uploadType: 'video',
      messageType: 'video',
      ext,
      mime: mime || 'video/*',
      maxSizeBytes: VIDEO_ATTACHMENT_LIMIT_BYTES,
      limitLabel: formatAttachmentLimit(VIDEO_ATTACHMENT_LIMIT_BYTES),
    }
  }

  if (AUDIO_ATTACHMENT_EXTENSIONS.has(ext) || mime.startsWith('audio/')) {
    return {
      uploadType: 'file',
      messageType: 'audio',
      ext,
      mime: mime || 'audio/*',
      maxSizeBytes: GENERIC_ATTACHMENT_LIMIT_BYTES,
      limitLabel: formatAttachmentLimit(GENERIC_ATTACHMENT_LIMIT_BYTES),
    }
  }

  if (DOCUMENT_ATTACHMENT_EXTENSIONS.has(ext)) {
    return {
      uploadType: 'document',
      messageType: 'file',
      ext,
      mime: mime || 'application/octet-stream',
      maxSizeBytes: DOCUMENT_ATTACHMENT_LIMIT_BYTES,
      limitLabel: formatAttachmentLimit(DOCUMENT_ATTACHMENT_LIMIT_BYTES),
    }
  }

  return {
    uploadType: 'file',
    messageType: 'file',
    ext,
    mime: mime || 'application/octet-stream',
    maxSizeBytes: GENERIC_ATTACHMENT_LIMIT_BYTES,
    limitLabel: formatAttachmentLimit(GENERIC_ATTACHMENT_LIMIT_BYTES),
  }
}

const clampChatListPanelWidth = (value: number): number => {
  const viewportCap = typeof document === 'undefined' ? MAX_CHAT_LIST_PANEL_WIDTH : Math.max(MIN_CHAT_LIST_PANEL_WIDTH, document.documentElement.clientWidth - 420)
  return Math.min(Math.max(value, MIN_CHAT_LIST_PANEL_WIDTH), Math.min(MAX_CHAT_LIST_PANEL_WIDTH, viewportCap))
}

const DEFAULT_CHAT_THEME_CONFIG: ChatThemeConfigInput = {
  messageColorHex: '#DBEAFF',
  backgroundType: 'default',
  backgroundColorHex: '#FFFFFF',
  backgroundImageUrl: null,
}

const normalizeThemeHex = (value: string | null | undefined): string | null => {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed.toUpperCase()
  }

  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const [, r, g, b] = trimmed
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }

  return null
}

const toChatThemeDraft = (theme: ChatTheme | null): ChatThemeConfigInput => ({
  messageColorHex: normalizeThemeHex(theme?.messageColorHex) ?? DEFAULT_CHAT_THEME_CONFIG.messageColorHex,
  backgroundType: theme?.backgroundType ?? DEFAULT_CHAT_THEME_CONFIG.backgroundType,
  backgroundColorHex: normalizeThemeHex(theme?.backgroundColorHex) ?? DEFAULT_CHAT_THEME_CONFIG.backgroundColorHex,
  backgroundImageUrl: theme?.backgroundImageUrl ?? DEFAULT_CHAT_THEME_CONFIG.backgroundImageUrl,
})

const normalizeThemeConfig = (draft: ChatThemeConfigInput): ChatThemeConfigInput => {
  const backgroundType = draft.backgroundType ?? 'default'
  const backgroundImageUrl = draft.backgroundImageUrl?.trim() ? draft.backgroundImageUrl.trim() : null

  return {
    messageColorHex: normalizeThemeHex(draft.messageColorHex) ?? DEFAULT_CHAT_THEME_CONFIG.messageColorHex,
    backgroundType,
    backgroundColorHex: normalizeThemeHex(draft.backgroundColorHex) ?? DEFAULT_CHAT_THEME_CONFIG.backgroundColorHex,
    backgroundImageUrl: backgroundType === 'image' ? backgroundImageUrl : null,
  }
}

const prependMessageViews = (existing: MessageView[], incoming: MessageView[]): MessageView[] => {
  const existingById = new Map(existing.map((message) => [message.raw.id, message] as const))
  const incomingById = new Map(incoming.map((message) => [message.raw.id, message] as const))
  const orderedIds = [...incoming.map((message) => message.raw.id), ...existing.map((message) => message.raw.id)]
  const uniqueIds = orderedIds.filter((messageId, index) => orderedIds.indexOf(messageId) === index)

  return uniqueIds.map((messageId) => existingById.get(messageId) ?? incomingById.get(messageId)!).filter(Boolean)
}

const appendMessageViews = (existing: MessageView[], incoming: MessageView[]): MessageView[] => {
  const existingById = new Map(existing.map((message) => [message.raw.id, message] as const))
  const incomingById = new Map(incoming.map((message) => [message.raw.id, message] as const))
  const orderedIds = [...existing.map((message) => message.raw.id), ...incoming.map((message) => message.raw.id)]
  const uniqueIds = orderedIds.filter((messageId, index) => orderedIds.indexOf(messageId) === index)

  return uniqueIds.map((messageId) => incomingById.get(messageId) ?? existingById.get(messageId)!).filter(Boolean)
}

const messageSyncCursorKey = (deviceId: string) => `messenger:sync-sequence:${deviceId}`
const readMessageSyncCursor = (deviceId: string): number | null => {
  try {
    const stored = localStorage.getItem(messageSyncCursorKey(deviceId))
    if (stored === null) return null
    const parsed = Number(stored)
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
  } catch {
    return null
  }
}
const writeMessageSyncCursor = (deviceId: string, sequence: number) => {
  try {
    localStorage.setItem(messageSyncCursorKey(deviceId), String(Math.max(0, sequence, readMessageSyncCursor(deviceId) ?? 0)))
  } catch {
    return
  }
}
const SOCKET_RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 15000, 30000]

const isScrolledNearBottom = (element: HTMLElement): boolean => {
  const remainingDistance = Math.ceil(element.scrollHeight - element.scrollTop - element.clientHeight)
  return remainingDistance <= CHAT_HISTORY_BOTTOM_THRESHOLD
}

const getChatSearchTypeLabel = (type: MessageType): string | null => {
  switch (type) {
    case 'text':
      return null
    case 'image':
      return mt('page.t001')
    case 'video':
      return mt('page.t002')
    case 'file':
      return mt('page.t006')
    case 'audio':
      return mt('page.t014')
    case 'voice':
      return mt('page.t015')
    case 'video_message':
      return mt('page.t016')
    case 'share_task':
      return mt('page.t017')
    case 'share_event':
      return mt('page.t018')
    default:
      return mt('page.t000')
  }
}

const formatLastSeen = (value: string | null | undefined): string => {
  if (!value) return mt('page.t019')
  const date = new Date(value)
  if (isNaN(date.getTime())) return mt('page.t019')

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return mt('page.t020')
  if (diffMins < 60) return mt('lastSeen.minutesAgo', { count: diffMins })

  const dayLabel = formatDaySeparatorLabel(value)
  const timeLabel = formatMessageTime(value)

  if (dayLabel === mt('common.today')) {
    return mt('lastSeen.today', { time: timeLabel })
  }
  if (dayLabel === mt('common.yesterday')) {
    return mt('lastSeen.yesterday', { time: timeLabel })
  }

  return mt('lastSeen.onDay', { day: dayLabel, time: timeLabel })
}

function VideoMessageModeIcon({ color }: { color: string }) {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="2.35" y="2.35" width="13.3" height="13.3" rx="4.2" stroke={color} strokeWidth="1.7" />
      <circle cx="9" cy="9" r="2.45" stroke={color} strokeWidth="1.6" />
    </svg>
  )
}

function EmojiModeIcon({ color }: { color: string }) {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="9" cy="9" r="6.7" stroke={color} strokeWidth="1.7" />
      <circle cx="6.5" cy="7.2" r="0.85" fill={color} />
      <circle cx="11.5" cy="7.2" r="0.85" fill={color} />
      <path d="M6 10.2C6.6 11.5 7.67 12.15 9 12.15C10.33 12.15 11.4 11.5 12 10.2" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function ThemeSettingsIcon({ color }: { color: string }) {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M2.25 5.25H10.25" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M7.75 12.75H15.75" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12.75" cy="5.25" r="2" stroke={color} strokeWidth="1.7" />
      <circle cx="5.25" cy="12.75" r="2" stroke={color} strokeWidth="1.7" />
    </svg>
  )
}

const MESSAGE_COMPOSER_MAX_HEIGHT_PX = 168

const getGroupPermissions = (group: ChatGroupDetails, userId: number | null) => {
  if (userId === null) return { canEdit: false, canDelete: false }
  const role = group.members.find((member) => member.id === userId)?.role
  const isOwner = group.createdBy === userId || role === 'owner'
  return { canEdit: isOwner || role === 'admin', canDelete: isOwner }
}

type HiddenGroupEntry = { id: string; name: string }
const hiddenGroupsKey = (userId: number) => `messenger:hidden-groups:${userId}`

const readHiddenGroups = (userId: number): HiddenGroupEntry[] => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(hiddenGroupsKey(userId)) ?? '[]')
    return Array.isArray(stored) ? stored.filter((entry): entry is HiddenGroupEntry =>
      Boolean(entry && typeof entry.id === 'string' && typeof entry.name === 'string')) : []
  } catch { return [] }
}

const saveHiddenGroups = (userId: number, groups: HiddenGroupEntry[]) => {
  try { localStorage.setItem(hiddenGroupsKey(userId), JSON.stringify(groups)) } catch { /* storage may be unavailable */ }
}

export default function MessengerPageContent() {
  useTranslation('messenger')
  const authRepository = useMemo(() => new HttpAuthRepository(), [])
  const sessionStore = useMemo(() => new LocalStorageAuthSessionStore(), [])
  const chatRepository = useMemo(() => new HttpChatRepository(sessionStore), [sessionStore])
  const chatThemeRepository = useMemo(() => new HttpChatThemeRepository(sessionStore), [sessionStore])
  const userDirectoryRepository = useMemo(() => new HttpUserDirectoryRepository(sessionStore), [sessionStore])
  const groupCalendarRepository = useMemo(() => new HttpGroupCalendarRepository(sessionStore), [sessionStore])
  const channelRepository = useMemo(() => new HttpChannelRepository(sessionStore), [sessionStore])
  const smartAgentRepository = useMemo(() => new HttpSmartAgentRepository(sessionStore), [sessionStore])
  const callRepository = useMemo(() => new HttpCallRepository(sessionStore), [sessionStore])
  const keyStore = useMemo(() => new IndexedDbKeyStore(), [])
  const webDeviceStore = useMemo(() => new WebDeviceSessionStore(), [])
  const { busyLabel: callBusyLabel, isBusy: isCallBusy, startDirectCall, startGroupCall, joinCalendarCall } = useCallManager()
  const { username } = useParams<{ username?: string }>()
  const navigate = useNavigate()

  const [listSnapshotScope] = useState(() => messengerSnapshotScope(sessionStore.getTokens(), webDeviceStore.getCurrentDeviceId()))
  const [initialListSnapshot] = useState(() => readMessengerListSnapshot(listSnapshotScope))
  const [currentUser, setCurrentUser] = useState<CurrentUserState | null>(initialListSnapshot?.currentUser ?? null)
  const [cryptoState, setCryptoState] = useState<CryptoState>(initialListSnapshot?.cryptoState ?? { currentDeviceId: null, privateKey: null })
  const [chats, setChats] = useState<ChatListItem[]>(initialListSnapshot?.chats ?? [])
  const [resolvedChannel, setResolvedChannel] = useState<ChannelView | null>(null)
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageView[]>([])
  const [search, setSearch] = useState('')
  const [sidebarMessageSearch, setSidebarMessageSearch] = useState<{ query: string; results: ChatSearchResultItem[]; totalCount: number; hasMore: boolean; offset: number; isLoading: boolean; error: string }>({ query: '', results: [], totalCount: 0, hasMore: false, offset: 0, isLoading: false, error: '' })
  const [filter, setFilter] = useState<'all' | 'groups' | 'personal' | 'channels' | 'calls'>('all')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  const [showSharedMedia, setShowSharedMedia] = useState(false)
  const [showHiddenGroups, setShowHiddenGroups] = useState(false)
  const [hiddenGroups, setHiddenGroups] = useState<HiddenGroupEntry[]>(() => initialListSnapshot ? readHiddenGroups(initialListSnapshot.currentUser.id) : [])
  const [hiddenGroupsError, setHiddenGroupsError] = useState('')
  const [restoringGroupId, setRestoringGroupId] = useState<string | null>(null)

  useEffect(() => {
    if (!currentUser?.id) { setHiddenGroups([]); return }
    try {
      const stored = JSON.parse(localStorage.getItem(hiddenGroupsKey(currentUser.id)) ?? '[]') as unknown
      setHiddenGroups(Array.isArray(stored) ? stored.filter((entry): entry is HiddenGroupEntry =>
        !!entry && typeof entry === 'object' && typeof entry.id === 'string' && typeof entry.name === 'string') : [])
    } catch { setHiddenGroups([]) }
  }, [currentUser?.id])
  const [input, setInput] = useState('')
  const [folders, setFolders] = useState<ChatFolder[]>(initialListSnapshot?.folders ?? [])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  
  const [callsActiveTab, setCallsActiveTab] = useState<'welcome' | 'create' | 'join' | 'recordings'>('welcome')
  const [newMeetingRoomName, setNewMeetingRoomName] = useState('')
  const [joinMeetingRoomInput, setJoinMeetingRoomInput] = useState('')
  const [isCopied, setIsCopied] = useState(false)
  const handleCreateMeetingInit = () => {
    const randomRoom = `alem-room-${Math.random().toString(36).substring(2, 10)}`
    setNewMeetingRoomName(randomRoom)
    setCallsActiveTab('create')
    setIsCopied(false)
  }

  const [userRecordings, setUserRecordings] = useState<CallRecording[]>([])
  const [isLoadingRecordings, setIsLoadingRecordings] = useState(false)
  const [recordingsError, setRecordingsError] = useState('')
  const [downloadingEgressIds, setDownloadingEgressIds] = useState<Record<string, boolean>>({})
  const [playingEgressIds, setPlayingEgressIds] = useState<Record<string, boolean>>({})
  const [currentlyPlayingAudio, setCurrentlyPlayingAudio] = useState<{ egressId: string; audio: HTMLAudioElement } | null>(null)

  const loadUserRecordings = useCallback(async () => {
    setIsLoadingRecordings(true)
    setRecordingsError('')
    try {
      const recs = await callRepository.getUserRecordings(50, 0)
      setUserRecordings(recs)
    } catch (err: any) {
      console.error('Failed to load user recordings:', err)
      setRecordingsError(mt('page.t023'))
    } finally {
      setIsLoadingRecordings(false)
    }
  }, [callRepository])

  useEffect(() => {
    if (filter === 'calls' && callsActiveTab === 'recordings') {
      void loadUserRecordings()
    }
  }, [filter, callsActiveTab, loadUserRecordings])

  useEffect(() => {
    return () => {
      if (currentlyPlayingAudio) {
        currentlyPlayingAudio.audio.pause()
      }
    }
  }, [currentlyPlayingAudio])

  const handlePlayRecording = useCallback(async (egressId: string) => {
    if (playingEgressIds[egressId]) return

    if (currentlyPlayingAudio?.egressId === egressId) {
      currentlyPlayingAudio.audio.pause()
      setCurrentlyPlayingAudio(null)
      return
    }

    if (currentlyPlayingAudio) {
      currentlyPlayingAudio.audio.pause()
    }

    setPlayingEgressIds((prev) => ({ ...prev, [egressId]: true }))
    try {
      const blob = await callRepository.downloadRecording(egressId)
      const url = window.URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => {
        setCurrentlyPlayingAudio(null)
        window.URL.revokeObjectURL(url)
      }
      setCurrentlyPlayingAudio({ egressId, audio })
      audio.play()
    } catch (err) {
      console.error('Failed to play recording:', err)
      alert(mt('page.t024'))
    } finally {
      setPlayingEgressIds((prev) => ({ ...prev, [egressId]: false }))
    }
  }, [callRepository, currentlyPlayingAudio, playingEgressIds])

  const handleDownloadRecording = useCallback(async (egressId: string, filename: string) => {
    if (downloadingEgressIds[egressId]) return
    setDownloadingEgressIds((prev) => ({ ...prev, [egressId]: true }))
    try {
      const blob = await callRepository.downloadRecording(egressId)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename || `recording-${egressId}.mp4`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to download recording:', err)
      alert(mt('page.t025'))
    } finally {
      setDownloadingEgressIds((prev) => ({ ...prev, [egressId]: false }))
    }
  }, [callRepository, downloadingEgressIds])

  const [folderChatAssignments, setFolderChatAssignments] = useState<Record<string, string[]>>({})
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false)
  const [isThemePanelOpen, setIsThemePanelOpen] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [folderError, setFolderError] = useState('')
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [pendingFolderAssignmentTarget, setPendingFolderAssignmentTarget] = useState<{
    chatId: string
    chatType: ChatType
  } | null>(null)
  const [isDeletingFolder, setIsDeletingFolder] = useState(false)
  const [isFolderUpdating, setIsFolderUpdating] = useState(false)
  const [isLoadingChats, setIsLoadingChats] = useState(!initialListSnapshot)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false)
  const [historyOffset, setHistoryOffset] = useState(0)
  const [hasMoreHistory, setHasMoreHistory] = useState(false)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [pendingNewMessagesCount, setPendingNewMessagesCount] = useState(0)
  const [chatListPanelWidth, setChatListPanelWidth] = useState(DEFAULT_CHAT_LIST_PANEL_WIDTH)
  const [isMobileLayout, setIsMobileLayout] = useState(() => (typeof document === 'undefined' ? false : document.documentElement.clientWidth < MOBILE_MESSENGER_BREAKPOINT))
  const [isChatListPanelResizing, setIsChatListPanelResizing] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isRecordingVoice, setIsRecordingVoice] = useState(false)
  const [recordingDurationSeconds, setRecordingDurationSeconds] = useState(0)
  const [isRecordingVideoMessage, setIsRecordingVideoMessage] = useState(false)
  const [videoRecordingDurationSeconds, setVideoRecordingDurationSeconds] = useState(0)
  const [isRecordingLocked, setIsRecordingLocked] = useState(false)
  const [isRecordGestureActive, setIsRecordGestureActive] = useState(false)
  const [isRecordLockHintVisible, setIsRecordLockHintVisible] = useState(false)
  const [attachmentToUpload, setAttachmentToUpload] = useState<File | null>(null)
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null)
  const [attachmentsToUpload, setAttachmentsToUpload] = useState<File[]>([])
  const [attachmentPreviewUrls, setAttachmentPreviewUrls] = useState<string[]>([])
  const [smartAgentSessionId, setSmartAgentSessionId] = useState<string | null>(null)
  const [isSmartAgentLoading, setIsSmartAgentLoading] = useState(false)
  const [smartAgentStreamingTextVisible, setSmartAgentStreamingTextVisible] = useState(false)
  const [smartAgentHistory, setSmartAgentHistory] = useState<unknown[]>([])
  const [smartAgentConversations, setSmartAgentConversations] = useState<SmartAgentConversationSummary[]>([])
  const [isLoadingSmartAgentConversations, setIsLoadingSmartAgentConversations] = useState(false)
  const [isSmartAgentListOpen, setIsSmartAgentListOpen] = useState(false)
  const smartAgentStreamAbortRef = useRef<AbortController | null>(null)
  const smartAgentStreamRequestIdRef = useRef<string | null>(null)
  const smartAgentSkipNextLoadRef = useRef<string | null>(null)
  const channelViewedAtMapRef = useRef<Record<string, string>>(readChannelViewedAtMap())

  const toChatListItem = useCallback(
    async (chat: UnifiedChat, onlineUserIds: Set<number> = new Set<number>(), deferPreview = false): Promise<ChatListItem> => {
      const title =
        chat.type === 'group'
          ? chat.groupName || mt('page.t026')
          : chat.type === 'channel'
            ? chat.channelName || mt('page.t027')
            : chat.peerFullName || chat.peerUsername || `User ${chat.peerId ?? ''}`.trim()
      const preview = chat.lastMessage
        ? deferPreview
          ? { text: mt('page.t028'), unavailable: false }
          : await resolveMessageText(chat.lastMessage, cryptoRef.current, { compact: true })
        : { text: mt('page.t029'), unavailable: false }

      return {
        chat,
        title,
        subtitle: preview.text,
        time: chat.lastMessage ? formatTimeLabel(chat.lastMessage.createdAt) : formatTimeLabel(chat.updatedAt),
        avatar: getInitials(title),
        avatarUrl:
          chat.type === 'group'
            ? chat.groupAvatar
            : chat.type === 'channel'
              ? chat.channelAvatar
              : chat.peerAvatar,
        seed: getSeed(title),
        online: chat.peerId ? onlineUserIds.has(chat.peerId) : false,
        unread: chat.unreadCount,
      }
    },
    [],
  )

  const toChannelListItem = useCallback(
    (channel: ChannelView): ChatListItem => {
      const title = channel.name
      const subtitle = channel.lastPost?.content || channel.description || mt('page.t030')

      return {
        chat: {
          id: channel.id,
          type: 'channel',
          peerId: null,
          peerUsername: channel.username,
          peerFullName: null,
          peerAvatar: null,
          lastSeenAt: null,
          groupId: null,
          groupName: null,
          groupAvatar: null,
          channelId: channel.id,
          channelName: channel.name,
          channelAvatar: channel.avatarUrl,
          aiModel: null,
          aiTitle: null,
          lastMessage: null,
          unreadCount: 0,
          mentionCount: 0,
          isPinned: false,
          isMuted: channel.isMuted,
          createdAt: channel.createdAt,
          updatedAt: channel.updatedAt,
        },
        title,
        subtitle,
        time: formatTimeLabel(channel.lastPost?.createdAt || channel.updatedAt),
        avatar: getInitials(title),
        avatarUrl: channel.avatarUrl,
        seed: getSeed(title),
        online: false,
        unread: 0,
      }
    },
    [],
  )
  const [recordLockProgress, setRecordLockProgress] = useState(0)
  const [selectedRecorderMode, setSelectedRecorderMode] = useState<'voice' | 'video_message'>('voice')
  const [error, setError] = useState('')
  const [sendError, setSendError] = useState('')
  const [muteToggleBusy, setMuteToggleBusy] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [chatTheme, setChatTheme] = useState<ChatTheme | null>(null)
  const [chatThemeDraft, setChatThemeDraft] = useState<ChatThemeConfigInput>(DEFAULT_CHAT_THEME_CONFIG)
  const [chatThemeError, setChatThemeError] = useState('')
  const chatThemeRequestVersionRef = useRef(0)
  const [isThemeSaving, setIsThemeSaving] = useState(false)
  const [isThemeResetting, setIsThemeResetting] = useState(false)
  const [isAiProofreading, setIsAiProofreading] = useState(false)
  const alemAiRepository = useMemo(() => new HttpAlemAiRepository(sessionStore), [sessionStore])
  const [isThemeImageUploading, setIsThemeImageUploading] = useState(false)
  const [typingByChat, setTypingByChat] = useState<Record<string, TypingIndicatorState>>({})
  const [onlineUserIds, setOnlineUserIds] = useState<Set<number>>(() => new Set<number>())
  const [isUserPickerOpen, setIsUserPickerOpen] = useState(false)
  const [userSearchQuery, setUserSearchQuery] = useState('')
  const [chatCreationMode, setChatCreationMode] = useState<'personal' | 'group' | 'channel'>('personal')
  const [groupCreateName, setGroupCreateName] = useState('')
  const [groupCreateDescription, setGroupCreateDescription] = useState('')
  const [selectedNewGroupMemberIds, setSelectedNewGroupMemberIds] = useState<number[]>([])
  const [directoryUsers, setDirectoryUsers] = useState<UserDirectoryUser[]>([])
  const [isSearchingUsers, setIsSearchingUsers] = useState(false)
  const [userSearchError, setUserSearchError] = useState('')
  const [groupCreateError, setGroupCreateError] = useState('')
  const [isCreatingGroup, setIsCreatingGroup] = useState(false)
  const [channelCreateName, setChannelCreateName] = useState('')
  const [channelCreateDescription, setChannelCreateDescription] = useState('')
  const [channelCreateUsername, setChannelCreateUsername] = useState('')
  const [channelCreateType, setChannelCreateType] = useState<'public' | 'private'>('public')
  const [channelCreateError, setChannelCreateError] = useState('')
  const [isCreatingChannel, setIsCreatingChannel] = useState(false)
  const [channelCreationStep, setChannelCreationStep] = useState<1 | 2>(1)
  const [createdChannelId, setCreatedChannelId] = useState<string | null>(null)
  const [myChannels, setMyChannels] = useState<ChannelView[]>([])
  const [globalChannelResults, setGlobalChannelResults] = useState<ChatListItem[]>([])
  const [isSearchingGlobal, setIsSearchingGlobal] = useState(false)
  const [activeGroupMembers, setActiveGroupMembers] = useState<ChatGroupMember[]>([])
  const [activeGroupDetails, setActiveGroupDetails] = useState<ChatGroupDetails | null>(null)
  const [activeGroupEvents, setActiveGroupEvents] = useState<CalendarEvent[]>([])
  const [groupEventsError, setGroupEventsError] = useState('')
  const [isGroupEventsLoading, setIsGroupEventsLoading] = useState(false)
  const [isCreatingGroupEvent, setIsCreatingGroupEvent] = useState(false)
  const [channelDetails, setChannelDetails] = useState<ChannelView | null>(null)
  const [channelAdmins, setChannelAdmins] = useState<ChannelMember[]>([])
  const [channelMembers, setChannelMembers] = useState<ChannelMember[]>([])
  const [isLoadingChannelDetails, setIsLoadingChannelDetails] = useState(false)
  const [isLoadingChannelAdmins, setIsLoadingChannelAdmins] = useState(false)
  const [isLoadingChannelMembers, setIsLoadingChannelMembers] = useState(false)
  const [channelMembersError, setChannelMembersError] = useState('')
  const [groupMembersError, setGroupMembersError] = useState('')
  const [groupMembersActionError, setGroupMembersActionError] = useState('')
  const [isGroupMembersUpdating, setIsGroupMembersUpdating] = useState(false)
  const [mentionCaretIndex, setMentionCaretIndex] = useState(0)
  const [selectedMessages, setSelectedMessages] = useState<SelectedMessageActionState>({ ids: [], anchorId: null })
  const [messageActionError, setMessageActionError] = useState('')
  const [isMessageActionLoading, setIsMessageActionLoading] = useState(false)
  const [messageViewers, setMessageViewers] = useState<MessageViewer[]>([])
  const [isViewersModalOpen, setIsViewersModalOpen] = useState(false)
  const [isDrivePickerOpen, setIsDrivePickerOpen] = useState(false)
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false)
  const [isUserProfileModalOpen, setIsUserProfileModalOpen] = useState(false)
  const [isUserProfileLoading, setIsUserProfileLoading] = useState(false)
  const [userProfileError, setUserProfileError] = useState('')
  const [profileUserId, setProfileUserId] = useState<number | null>(null)
  const [profileUser, setProfileUser] = useState<UserDirectoryUserDetails | null>(null)
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([])
  const [resolvedPinnedMessageViews, setResolvedPinnedMessageViews] = useState<Record<string, MessageView>>({})
  const [activePinnedIndex, setActivePinnedIndex] = useState(0)
  const [isPinnedMessagesPanelOpen, setIsPinnedMessagesPanelOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editTargetMessageId, setEditTargetMessageId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [isForwardModalOpen, setIsForwardModalOpen] = useState(false)
  const [forwardTargetMessageIds, setForwardTargetMessageIds] = useState<string[] | null>(null)
  const [forwardChatSearchQuery, setForwardChatSearchQuery] = useState('')
  const [selectedForwardChatIds, setSelectedForwardChatIds] = useState<string[]>([])
  const [isForwardingMessages, setIsForwardingMessages] = useState(false)
  const forwardMenuCloseTimeoutRef = useRef<number | null>(null)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [shareLink, setShareLink] = useState('')
  const [selectedShareChatIds, setSelectedShareChatIds] = useState<string[]>([])
  const [shareSearchQuery, setShareSearchQuery] = useState('')
  const [isSharingLink, setIsSharingLink] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [deleteTargetMessageIds, setDeleteTargetMessageIds] = useState<string[] | null>(null)
  const [moderationRules, setModerationRules] = useState<MessageModerationRules>(DEFAULT_MESSAGE_MODERATION_RULES)
  const [replyThreadMessageId, setReplyThreadMessageId] = useState<string | null>(null)
  const [isNewChatMenuOpen, setIsNewChatMenuOpen] = useState(false)
  const newChatMenuRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!isNewChatMenuOpen) {
      return
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (newChatMenuRef.current?.contains(event.target as Node)) {
        return
      }
      setIsNewChatMenuOpen(false)
    }
    window.addEventListener('mousedown', handlePointerDown)
    return () => window.removeEventListener('mousedown', handlePointerDown)
  }, [isNewChatMenuOpen])
  const [forwardChatTab, setForwardChatTab] = useState<'all' | 'personal' | 'group'>('all')
  const [chatSearchAttachmentType, setChatSearchAttachmentType] = useState<ChatAttachmentTypeFilter>('all')
  const [isChatSearchResultsOpen, setIsChatSearchResultsOpen] = useState(false)
  const [replyThreadRemote, setReplyThreadRemote] = useState<{ sourceId: string; rows: ReplyThreadViewRow[]; truncated: boolean } | null>(null)
  const [messageContextMenu, setMessageContextMenu] = useState<MessageContextMenuState | null>(null)
  const messageContextMenuRef = useRef<HTMLDivElement | null>(null)
  const [chatListContextMenu, setChatListContextMenu] = useState<ChatListContextMenuState | null>(null)
  const [groupMenuPermissions, setGroupMenuPermissions] = useState<{ chatId: string; canEdit: boolean; canDelete: boolean } | null>(null)
  const [chatListActionError, setChatListActionError] = useState('')
  const [isChatDeleteConfirmOpen, setIsChatDeleteConfirmOpen] = useState(false)
  const [chatDeleteTargetId, setChatDeleteTargetId] = useState<string | null>(null)
  const [isChatListActionLoading, setIsChatListActionLoading] = useState(false)
  const [isGroupEditModalOpen, setIsGroupEditModalOpen] = useState(false)
  const [groupEditTargetId, setGroupEditTargetId] = useState<string | null>(null)
  const [groupEditName, setGroupEditName] = useState('')
  const [groupEditDescription, setGroupEditDescription] = useState('')
  const [groupEditAvatar, setGroupEditAvatar] = useState<File | null>(null)
  const [groupEditCurrentAvatarUrl, setGroupEditCurrentAvatarUrl] = useState<string | null>(null)
  const [groupEditAvatarPreviewUrl, setGroupEditAvatarPreviewUrl] = useState<string | null>(null)
  const [groupEditError, setGroupEditError] = useState('')
  const [isGroupEditLoading, setIsGroupEditLoading] = useState(false)
  const [isGroupEditSaving, setIsGroupEditSaving] = useState(false)

  useEffect(() => {
    void chatRepository.getModerationRules()
      .then((rules) => setModerationRules(normalizeMessageModerationRules(rules)))
      .catch(() => undefined)
  }, [chatRepository])

  useEffect(() => {
    if (!groupEditAvatar) {
      setGroupEditAvatarPreviewUrl(null)
      return
    }

    const previewUrl = URL.createObjectURL(groupEditAvatar)
    setGroupEditAvatarPreviewUrl(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [groupEditAvatar])
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false)
  const [isChatSearchOpen, setIsChatSearchOpen] = useState(false)
  const [chatSearchQuery, setChatSearchQuery] = useState('')
  const [chatSearchResults, setChatSearchResults] = useState<ChatSearchResultItem[]>([])
  const [isChatSearchLoading, setIsChatSearchLoading] = useState(false)
  const [chatSearchError, setChatSearchError] = useState('')
  const [, setChatSearchInfo] = useState('')
  const [selectedChatSearchResultId, setSelectedChatSearchResultId] = useState<string | null>(null)
  const [highlightedSearchMessageId, setHighlightedSearchMessageId] = useState<string | null>(null)
  const [openedImageMessageId, setOpenedImageMessageId] = useState<string | null>(null)
  const [openedVideoMessageId, setOpenedVideoMessageId] = useState<string | null>(null)
  const [replyTarget, setReplyTarget] = useState<ReplyToView | null>(null)
  const [isChatQrAuthorized, setIsChatQrAuthorized] = useState(true)
  const [emptyChatStateMessage] = useState(() => pickRandomItem(getEmptyChatStateMessages()))
  const [socketReconnectNonce, setSocketReconnectNonce] = useState(0)

  useEffect(() => {
    if (chats.length === 0 && myChannels.length === 0) {
      return
    }
    const map: Record<string, boolean> = {}
    for (const item of chats) {
      map[normalizeConversationIdKey(item.chat.id)] = item.chat.isMuted
      if (item.chat.type === 'personal' && typeof item.chat.peerId === 'number') {
        map[`peer:${item.chat.peerId}`] = item.chat.isMuted
      }
    }
    for (const ch of myChannels) {
      map[normalizeConversationIdKey(ch.id)] = ch.isMuted
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(ALEM_MESSENGER_MUTE_MAP_EVENT, { detail: map }))
    }
  }, [chats, myChannels])

  const bottomRef = useRef<HTMLDivElement | null>(null)
  const messagesScrollerRef = useRef<HTMLDivElement | null>(null)
  const messageItemRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const chatListResizeStartXRef = useRef(0)
  const chatListResizeStartWidthRef = useRef(DEFAULT_CHAT_LIST_PANEL_WIDTH)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const attachMenuRef = useRef<HTMLDivElement | null>(null)
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null)
  /** Зеркало текста поля ввода; DOM — источник правды при наборе, state `input` подтягивается через startTransition. */
  const messageDraftRef = useRef('')
  /** Увеличивается при смене чата, чтобы отбрасывать отложенные startTransition от предыдущего диалога. */
  const composerSyncEpochRef = useRef(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const videoMessageRecorderRef = useRef<MediaRecorder | null>(null)
  const videoMessageStreamRef = useRef<MediaStream | null>(null)
  const videoMessageChunksRef = useRef<Blob[]>([])
  const videoMessageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const chatsRef = useRef<ChatListItem[]>(initialListSnapshot?.chats ?? [])
  const chatsHydratedRef = useRef(Boolean(initialListSnapshot))
  const chatListLoadRef = useRef<Promise<void> | null>(null)
  const chatListLoadVersionRef = useRef(0)
  const messengerMountedRef = useRef(true)
  const lastChatRestoreAttemptedRef = useRef(false)
  const hasSocketConnectedOnceRef = useRef(false)
  useEffect(() => {
    messengerMountedRef.current = true
    return () => { messengerMountedRef.current = false }
  }, [])
  const previousActiveChatRef = useRef<ChatListItem | null>(null)
  const activeChatRef = useRef<string | null>(null)
  const groupDetailsRequestRef = useRef(0)
  const currentUserRef = useRef<CurrentUserState | null>(initialListSnapshot?.currentUser ?? null)
  const cryptoRef = useRef<CryptoState>(initialListSnapshot?.cryptoState ?? { currentDeviceId: null, privateKey: null })
  const loadPinnedMessagesRef = useRef<((chatId: string, chatType: ChatType) => Promise<void>) | null>(null)
  const loadMessagesRef = useRef<((chatId: string, chatType: ChatType) => Promise<void>) | null>(null)
  const messagesRef = useRef<MessageView[]>([])
  const loadOlderMessagesRef = useRef<(() => Promise<void>) | null>(null)
  const replyNavigationRef = useRef(0)
  const reactionRequestsRef = useRef(new Set<string>())
  useEffect(() => () => { replyNavigationRef.current += 1 }, [])
  const onlineUserIdsRef = useRef<Set<number>>(new Set<number>())
  const historyOffsetRef = useRef(0)
  const hasMoreHistoryRef = useRef(false)
  const isLoadingOlderMessagesRef = useRef(false)
  const isAtBottomRef = useRef(true)
  const historyRequestIdRef = useRef(0)
  const pendingPrependScrollRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null)
  const pendingReadSyncFrameRef = useRef<number | null>(null)
  const lastMarkedReadMessageIdByChatRef = useRef<Record<string, string>>({})
  const socketRef = useRef<WebSocket | null>(null)
  const socketReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const socketReconnectAttemptsRef = useRef(0)
  const typingTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const outgoingTypingChatRef = useRef<string | null>(null)
  const outgoingTypingStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleTypingStopRafRef = useRef<number | null>(null)
  const recordHoldTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recordHoldResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recordHoldTriggeredRef = useRef(false)
  const recordGestureStartYRef = useRef<number | null>(null)
  const recordShouldContinueRef = useRef(false)
  const isRecordingLockedRef = useRef(false)
  const pendingMessagesScrollBehaviorRef = useRef<ScrollBehavior | null>('auto')
  const chatSearchRequestIdRef = useRef(0)
  const sidebarMessageSearchRequestIdRef = useRef(0)
  const highlightedSearchMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSearchNavigationRef = useRef<string | null>(null)
  const historyLoadedChatIdRef = useRef<string | null>(null)
  const lastResolvedUsernameRef = useRef<string | null>(null)

  const activeChat = useMemo(() => {
    if (activeChatId && activeChatId.startsWith('smart-agent')) {
      const colonIndex = activeChatId.indexOf(':')
      const convId = colonIndex !== -1 ? activeChatId.slice(colonIndex + 1) : null
      const matchedConv = convId ? smartAgentConversations.find(c => c.conv_id === convId) : null
      const title = matchedConv?.name || 'Smart Agent'

      return {
        chat: {
          id: activeChatId,
          type: 'personal' as ChatType,
          peerId: SMART_ASSISTANT_PROFILE_ID,
          peerUsername: 'smart_agent',
          peerFullName: 'Smart Agent',
          peerAvatar: null,
          lastSeenAt: null,
          groupId: null,
          groupName: null,
          groupAvatar: null,
          channelId: null,
          channelName: null,
          channelAvatar: null,
          aiModel: 'gpt-4o',
          aiTitle: title,
          lastMessage: null,
          unreadCount: 0,
          mentionCount: 0,
          isPinned: false,
          isMuted: false,
          createdAt: matchedConv?.created_at || new Date().toISOString(),
          updatedAt: matchedConv?.updated_at || new Date().toISOString(),
        },
        title: title,
        subtitle: mt('page.t031'),
        time: '',
        avatar: 'SA',
        avatarUrl: null,
        seed: 777,
        online: false,
        unread: 0,
        isDraft: false,
      } as ChatListItem
    }
    const foundChat = chats.find((item) => item.chat.id === activeChatId)
    if (foundChat) return foundChat
    const foundChannel = myChannels.find((c) => c.id === activeChatId)
    if (foundChannel) return toChannelListItem(foundChannel)
    const foundGlobal = globalChannelResults.find((item) => item.chat.id === activeChatId)
    if (foundGlobal) return foundGlobal
    if (resolvedChannel && resolvedChannel.id === activeChatId) return toChannelListItem(resolvedChannel)
    return null
  }, [activeChatId, chats, myChannels, globalChannelResults, toChannelListItem, resolvedChannel, smartAgentConversations])

  const canManageChannelPosts = useMemo(() => {
    if (!activeChat || activeChat.chat.type !== 'channel') {
      return true
    }
    const role = channelDetails?.myRole
    return role === 'admin' || role === 'owner'
  }, [activeChat, channelDetails])


  const currentUserFirstName = useMemo(() => {
    const source = currentUser?.name?.trim()
    if (!source) {
      return ''
    }

    return source.split(/\s+/)[0] ?? ''
  }, [currentUser?.name])

  const emptyChatStateMessageText = useMemo(() => {
    if (!currentUserFirstName) {
      return emptyChatStateMessage.replace(/,?\s*\{name\}/g, '').replace(/\{name\}/g, '').replace(/\s{2,}/g, ' ').trim()
    }

    return emptyChatStateMessage.replace(/\{name\}/g, currentUserFirstName)
  }, [currentUserFirstName, emptyChatStateMessage])

  const activeTyping = useMemo(() => {
    if (activeChatId && activeChatId.startsWith('smart-agent') && isSmartAgentLoading && !smartAgentStreamingTextVisible) {
      return { senderId: -1, label: 'Smart Agent' }
    }
    return activeChatId ? typingByChat[activeChatId] ?? null : null
  }, [activeChatId, typingByChat, isSmartAgentLoading, smartAgentStreamingTextVisible])

  const showChatListPane = !isMobileLayout || (!activeChat && (filter !== 'calls' || callsActiveTab === 'welcome'))
  const showChatPane = !isMobileLayout || Boolean(activeChat) || (filter === 'calls' && callsActiveTab !== 'welcome')
  const activePinnedMessage = useMemo(
    () => (pinnedMessages.length > 0 ? pinnedMessages[Math.min(activePinnedIndex, pinnedMessages.length - 1)] : null),
    [activePinnedIndex, pinnedMessages],
  )
  const chatListContextMenuTarget = useMemo(
    () => (chatListContextMenu ? chats.find((item) => item.chat.id === chatListContextMenu.chatId) ?? null : null),
    [chatListContextMenu, chats],
  )
  const chatDeleteTarget = useMemo(
    () => (chatDeleteTargetId ? chats.find((item) => item.chat.id === chatDeleteTargetId) ?? null : null),
    [chatDeleteTargetId, chats],
  )
  const activePeerId = useMemo(
    () => (activeChat?.chat.type === 'personal' ? activeChat.chat.peerId ?? null : null),
    [activeChat],
  )

  const applyMutedToChatId = useCallback((chatId: string, isMuted: boolean) => {
    setChats((prev) =>
      prev.map((item) => (item.chat.id === chatId ? { ...item, chat: { ...item.chat, isMuted } } : item)),
    )
    setMyChannels((prev) => prev.map((c) => (c.id === chatId ? { ...c, isMuted } : c)))
    setGlobalChannelResults((prev) =>
      prev.map((item) => (item.chat.id === chatId ? { ...item, chat: { ...item.chat, isMuted } } : item)),
    )
    setResolvedChannel((prev) => (prev && prev.id === chatId ? { ...prev, isMuted } : prev))
    setChannelDetails((prev) => (prev && prev.id === chatId ? { ...prev, isMuted } : prev))
  }, [])

  const toggleActiveChatMute = useCallback(async () => {
    if (!activeChat || activeChat.isDraft || activeChat.chat.type === 'support') {
      return
    }
    const { id, type } = activeChat.chat
    const nextMute = !activeChat.chat.isMuted
    setMuteToggleBusy(true)
    try {
      let resolved = nextMute
      if (type === 'personal') {
        resolved = await chatRepository.setConversationMute(id, nextMute)
      } else if (type === 'group') {
        resolved = await chatRepository.setGroupMute(id, nextMute)
      } else if (type === 'channel') {
        resolved = await channelRepository.setMute(id, nextMute)
      } else {
        return
      }
      applyMutedToChatId(id, resolved)
    } catch (err) {
      setSendError(getErrorMessage(err, mt('page.t032')))
    } finally {
      setMuteToggleBusy(false)
    }
  }, [activeChat, applyMutedToChatId, chatRepository, channelRepository])

  const toggleMuteForPersonalPeerChat = useCallback(
    async (peerId: number) => {
      const item = chats.find((c) => c.chat.type === 'personal' && c.chat.peerId === peerId)
      if (!item) return
      const next = !item.chat.isMuted
      setMuteToggleBusy(true)
      try {
        const resolved = await chatRepository.setConversationMute(item.chat.id, next)
        applyMutedToChatId(item.chat.id, resolved)
      } catch (err) {
        setSendError(getErrorMessage(err, mt('page.t032')))
      } finally {
        setMuteToggleBusy(false)
      }
    },
    [chats, chatRepository, applyMutedToChatId],
  )

  const profilePersonalMuteControls = useMemo(() => {
    if (profileUserId === null || isVirtualProfileId(profileUserId)) return null
    const item = chats.find((c) => c.chat.type === 'personal' && c.chat.peerId === profileUserId)
    if (!item) return null
    return {
      isMuted: item.chat.isMuted,
      busy: muteToggleBusy,
      onToggle: () => void toggleMuteForPersonalPeerChat(profileUserId),
    }
  }, [profileUserId, chats, muteToggleBusy, toggleMuteForPersonalPeerChat])

  const canSearchInActiveChat = Boolean(activeChat && !activeChat.isDraft)
  const canForwardMessages = Boolean(
    activeChat && (activeChat.chat.type === 'personal' || activeChat.chat.type === 'group'),
  )
  const canStartCallInActiveChat = Boolean(
    activeChat &&
      !activeChat.chat.id.startsWith('smart-agent') &&
      (activeChat.chat.type === 'group' || (activePeerId !== null && activePeerId > 0)),
  )
  const isSmartAgentChat = Boolean(activeChatId?.startsWith('smart-agent'))
  const isSmartAgentListMode = isSmartAgentChat || isSmartAgentListOpen
  const hasDraftMessage =
    input.trim().length > 0 || attachmentToUpload !== null || attachmentsToUpload.length > 0
  const isRecordingAnyMedia = isRecordingVoice || isRecordingVideoMessage
  const isRecordingUiActive = isRecordingAnyMedia || isRecordingLocked
  const profileUserPresence = useMemo(
    () => (profileUserId !== null && profileUserId > 0 ? onlineUserIds.has(profileUserId) : false),
    [onlineUserIds, profileUserId],
  )

  useEffect(() => {
    if (!isSmartAgentChat) {
      return
    }

    setIsDrivePickerOpen(false)
    setAttachmentToUpload(null)
    setAttachmentPreviewUrl(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [isSmartAgentChat])

  const totalUnreadCount = useMemo(
    () => chats.reduce((sum, item) => sum + Math.max(item.chat.unreadCount ?? item.unread ?? 0, 0), 0),
    [chats],
  )
  const forwardableChats = useMemo(() => {
    const query = forwardChatSearchQuery.trim().toLowerCase()
    const hiddenGroupIds = new Set(hiddenGroups.map((group) => group.id))

    return chats
      .filter((item) => item.chat.type === 'personal' || item.chat.type === 'group')
      .filter((item) => item.chat.type !== 'group' || !hiddenGroupIds.has(item.chat.id))
      .filter((item) => item.chat.id !== activeChatId)
      .filter((item) => {
        if (!query) {
          return true
        }

        return item.title.toLowerCase().includes(query) || item.subtitle.toLowerCase().includes(query)
      })
  }, [activeChatId, chats, forwardChatSearchQuery, hiddenGroups])
  const loadedMessageIds = useMemo(() => new Set(messages.map((message) => message.raw.id)), [messages])
  const activeThemeConfig = useMemo(
    () => normalizeThemeConfig(isThemePanelOpen ? chatThemeDraft : toChatThemeDraft(chatTheme)),
    [chatTheme, chatThemeDraft, isThemePanelOpen],
  )
  const hasSavedChatTheme = Boolean(chatTheme)
  const messageBubbleTheme = useMemo(
    () => ({ outgoingColorHex: activeThemeConfig.messageColorHex }),
    [activeThemeConfig.messageColorHex],
  )
  const handleStartActiveChatCall = useCallback(async () => {
    if (!activeChat) {
      return
    }

    try {
      setError('')

      if (activeChat.chat.type === 'group') {
        await startGroupCall({
          groupId: activeChat.chat.id,
          displayName: activeChat.title,
        })

        // send system message for group call
        try {
          await chatRepository.sendMessage({
            chatId: activeChat.chat.id,
            chatType: 'group',
            content: mt('page.t033'),
            type: 'text',
            metadata: JSON.stringify({
              type: 'video_call',
              status: 'initiated',
              direction: 'outgoing',
              call_start_at: new Date().toISOString()
            })
          })
        } catch (msgError) {
          console.warn('Failed to send call message', msgError)
        }
        return
      }

      if (activePeerId === null) {
        throw new Error(mt('page.t034'))
      }

      await startDirectCall({
        calleeId: activePeerId,
        chatId: activeChat.isDraft ? undefined : activeChat.chat.id,
        displayName: activeChat.title,
      })

      // send system message for direct call
      if (!activeChat.isDraft) {
        try {
          await chatRepository.sendMessage({
            chatId: activeChat.chat.id,
            chatType: 'personal',
            content: mt('page.t033'),
            type: 'text',
            metadata: JSON.stringify({
              type: 'video_call',
              status: 'initiated',
              direction: 'outgoing',
              call_start_at: new Date().toISOString()
            })
          })
        } catch (msgError) {
          console.warn('Failed to send call message', msgError)
        }
      }
    } catch (error) {
      setError(getErrorMessage(error, mt('page.t035')))
    }
  }, [activeChat, activePeerId, startDirectCall, startGroupCall, chatRepository])

  const startCallWithUser = useCallback(async (userId: number, fullName: string) => {
    try {
      setError('')
      await startDirectCall({
        calleeId: userId,
        displayName: fullName,
      })
    } catch (error) {
      setError(getErrorMessage(error, mt('page.t035')))
    }
  }, [startDirectCall])

  const themedChatSurfaceBackground = activeThemeConfig.backgroundType === 'default' ? C.surface : 'rgba(255,255,255,0.84)'
  const themedChatSurfaceBorder = activeThemeConfig.backgroundType === 'default' ? C.border : '#D7E3F4'
  const themedChatCanvasStyle = useMemo<CSSProperties>(() => {
    if (activeThemeConfig.backgroundType === 'image' && activeThemeConfig.backgroundImageUrl) {
      return {
        backgroundColor: '#EEF4FB',
        backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.56) 0%, rgba(255,255,255,0.8) 100%), url(${activeThemeConfig.backgroundImageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }
    }

    if (activeThemeConfig.backgroundType === 'color') {
      const color = activeThemeConfig.backgroundColorHex ?? DEFAULT_CHAT_THEME_CONFIG.backgroundColorHex ?? '#EEF2FF'
      return {
        backgroundColor: color,
        backgroundImage: `linear-gradient(180deg, ${color} 0%, #FFFFFF 180%)`,
      }
    }

    return getDefaultChatCanvasStyle()
  }, [activeThemeConfig.backgroundColorHex, activeThemeConfig.backgroundImageUrl, activeThemeConfig.backgroundType])
  const folderUnreadCountById = useMemo(() => {
    const unreadByChatId = new Map(
      chats.map((item) => [item.chat.id, Math.max(item.chat.unreadCount ?? item.unread ?? 0, 0)] as const),
    )

    return Object.fromEntries(
      Object.entries(folderChatAssignments).map(([folderId, chatIds]) => [
        folderId,
        chatIds.reduce((sum, chatId) => sum + (unreadByChatId.get(chatId) ?? 0), 0),
      ]),
    ) as Record<string, number>
  }, [chats, folderChatAssignments])
  const chatListContextMenuFolderId = useMemo(() => {
    if (!chatListContextMenuTarget) {
      return null
    }

    for (const [folderId, chatIds] of Object.entries(folderChatAssignments)) {
      if (chatIds.includes(chatListContextMenuTarget.chat.id)) {
        return folderId
      }
    }

    return null
  }, [chatListContextMenuTarget, folderChatAssignments])
  const activeMentionContext = useMemo(() => {
    if (activeChat?.chat.type !== 'group' || isRecordingUiActive) {
      return null
    }

    if (!input.includes('@')) {
      return null
    }

    return getMentionContext(input, mentionCaretIndex)
  }, [activeChat?.chat.type, input, isRecordingUiActive, mentionCaretIndex])
  const mentionSuggestions = useMemo(() => {
    if (!activeMentionContext) {
      return []
    }

    const query = activeMentionContext.query.trim().toLowerCase()
    const filtered = activeGroupMembers.filter((member) => {
      const username = member.username.toLowerCase()
      const fullName = member.fullName.toLowerCase()
      const email = member.email.toLowerCase()
      return !query || username.includes(query) || fullName.includes(query) || email.includes(query)
    })

    return filtered.slice(0, 6)
  }, [activeGroupMembers, activeMentionContext])
  const selectedMessageSet = useMemo(() => new Set(selectedMessages.ids), [selectedMessages.ids])
  const selectedMessageViews = useMemo(
    () => messages.filter((message) => selectedMessageSet.has(message.raw.id)),
    [messages, selectedMessageSet],
  )
  const forwardSourceMessages = useMemo(() => {
    if (!forwardTargetMessageIds || forwardTargetMessageIds.length === 0) {
      return []
    }

    const forwardTargetSet = new Set(forwardTargetMessageIds)
    return messages.filter((message) => forwardTargetSet.has(message.raw.id))
  }, [forwardTargetMessageIds, messages])
  const selectedMessage = useMemo(
    () => selectedMessageViews.find((message) => message.raw.id === selectedMessages.anchorId) ?? selectedMessageViews[0] ?? null,
    [selectedMessageViews, selectedMessages.anchorId],
  )
  const deleteTargetMessages = useMemo(() => {
    const targetIds = new Set(deleteTargetMessageIds ?? selectedMessageViews.map((message) => message.raw.id))
    return messages.filter((message) => targetIds.has(message.raw.id))
  }, [deleteTargetMessageIds, messages, selectedMessageViews])
  const canDeleteTargetsForEveryone = useMemo(() => {
    if (activeChat?.chat.type === 'channel' && canManageChannelPosts) {
      return true
    }
    const currentMember = activeGroupMembers.find((member) => member.id === currentUser?.id)
    const isGroupAdmin = activeChat?.chat.type === 'group' && (currentMember?.role === 'owner' || currentMember?.role === 'admin')
    return canDeleteMessagesForEveryone(
      deleteTargetMessages.map((message) => message.raw),
      { currentUserId: currentUser?.id, isModerator: isGroupAdmin },
      moderationRules,
    )
  }, [activeChat?.chat.type, activeGroupMembers, canManageChannelPosts, currentUser?.id, deleteTargetMessages, moderationRules])
  const canDeleteTargetsForMe = activeChat?.chat.type !== 'channel' && canDeleteMessagesForMe(moderationRules)
  const isMessageEditable = useCallback((message: MessageView | null | undefined) => {
    if (!message || message.kind !== 'text' || message.raw.isDeleted) {
      return false
    }
    if (activeChat?.chat.type === 'channel' && canManageChannelPosts) {
      return true
    }
    return canEditMessage(
      { senderId: message.raw.senderId, createdAt: message.raw.createdAt, isDeleted: message.raw.isDeleted },
      currentUser?.id,
      moderationRules,
    )
  }, [activeChat?.chat.type, canManageChannelPosts, currentUser?.id, moderationRules])
  const isMessageDeletable = useCallback((message: MessageView | null | undefined) => {
    if (!message) {
      return false
    }
    if (activeChat?.chat.type !== 'channel' || canManageChannelPosts) {
      return true
    }
    return canDeleteMessagesForEveryone([message.raw], { currentUserId: currentUser?.id }, moderationRules)
  }, [activeChat?.chat.type, canManageChannelPosts, currentUser?.id, moderationRules])
  const editWindowExpiredMessage = mt('page.editExpired', { window: formatModerationWindow(moderationRules.editWindowSeconds) })
  const canReplyInActiveChat = canManageChannelPosts || Boolean(activeChat?.chat.type === 'channel' && channelDetails?.isSubscribed)
  const replyTreeSources = useMemo(
    () => messages.map((message) => ({ id: message.raw.id, replyToId: message.raw.replyToId, view: message })),
    [messages],
  )
  const replyCountByMessageId = useMemo(() => countDirectReplies(replyTreeSources), [replyTreeSources])
  const replyThreadLocalRows = useMemo<ReplyThreadViewRow[]>(
    () =>
      (replyThreadMessageId ? buildReplyThread(replyTreeSources, replyThreadMessageId) : []).map(({ message, depth }) => ({
        id: message.id,
        depth,
        senderLabel: message.view.from === 'me' ? mt('common.you') : message.view.senderLabel,
        time: message.view.time,
        text: message.view.text,
      })),
    [replyThreadMessageId, replyTreeSources],
  )
  const replyThreadRootId = replyThreadLocalRows[0]?.id ?? replyThreadMessageId
  const isChannelReplyThread = activeChat?.chat.type === 'channel'
  useEffect(() => {
    if (!replyThreadRootId) {
      return
    }
    let cancelled = false
    const currentUserId = currentUser?.id
    const load = async () => {
      try {
        if (isChannelReplyThread) {
          const thread = await channelRepository.getPostThread(replyThreadRootId)
          if (cancelled) return
          setReplyThreadRemote({
            sourceId: replyThreadRootId,
            truncated: thread.truncated,
            rows: thread.rows.map(({ post, depth }) => ({
              id: post.id,
              depth,
              senderLabel: post.authorId === currentUserId ? mt('common.you') : post.authorName,
              time: formatTimeLabel(post.createdAt),
              text: post.content || mt('page.t037'),
            })),
          })
          return
        }
        const thread = await chatRepository.getMessageThread(replyThreadRootId)
        const rows = await Promise.all(
          thread.rows.map(async ({ message, depth }) => ({
            id: message.id,
            depth,
            senderLabel: message.senderId === currentUserId ? mt('common.you') : message.senderFullName,
            time: formatTimeLabel(message.createdAt),
            text: (await resolveMessageText(message, cryptoRef.current)).text,
          })),
        )
        if (cancelled) return
        setReplyThreadRemote({ sourceId: replyThreadRootId, truncated: thread.truncated, rows })
      } catch {
        if (!cancelled) setReplyThreadRemote(null)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [channelRepository, chatRepository, currentUser?.id, isChannelReplyThread, replyThreadRootId])
  const replyThreadServer = replyThreadRemote && replyThreadRemote.sourceId === replyThreadRootId ? replyThreadRemote : null
  const replyThreadRows = replyThreadServer?.rows ?? replyThreadLocalRows
  const editTargetMessage = useMemo(
    () => (editTargetMessageId ? messages.find((message) => message.raw.id === editTargetMessageId) ?? null : selectedMessage),
    [editTargetMessageId, messages, selectedMessage],
  )
  const pinnedMessageIds = useMemo(() => new Set(pinnedMessages.map((message) => message.messageId)), [pinnedMessages])
  const activePinnedMessageView = useMemo(
    () =>
      activePinnedMessage
        ? messages.find((message) => message.raw.id === activePinnedMessage.messageId) ??
          resolvedPinnedMessageViews[activePinnedMessage.messageId] ??
          null
        : null,
    [activePinnedMessage, messages, resolvedPinnedMessageViews],
  )
  const imageMessages = useMemo(() => {
    const list: MessageView[] = []
    messages.forEach((message) => {
      const metadata = parseJsonRecord(message.raw.metadata)
      if (metadata && Array.isArray(metadata.gallery) && metadata.gallery.length > 0) {
        metadata.gallery.forEach((file: any, index: number) => {
          if (!isGalleryImageFile(file)) {
            return
          }

          list.push({
            ...message,
            raw: {
              ...message.raw,
              id: `${message.raw.id}_album_${index}`,
            },
            mediaUrl: file.url,
          })
        })
      } else if (message.kind === 'image' && Boolean(message.mediaUrl)) {
        list.push(message)
      }
    })
    return list
  }, [messages])
  const groupSharedAttachments = useMemo<GroupSharedAttachmentItem[]>(() => {
    const collected: GroupSharedAttachmentItem[] = []

    const pushAttachment = (item: GroupSharedAttachmentItem | null) => {
      if (!item?.url) {
        return
      }
      collected.push(item)
    }

    messages.forEach((message) => {
      if (message.raw.isDeleted) {
        return
      }

      const senderLabel = message.senderLabel
      const createdAt = message.raw.createdAt

      if (message.attachment?.url) {
        const attachment = message.attachment
        const kind = attachment.kind === 'image'
          ? 'image'
          : attachment.kind === 'video' || attachment.kind === 'video_message'
            ? 'video'
            : attachment.kind === 'audio' || attachment.kind === 'voice'
              ? 'audio'
              : 'file'

        pushAttachment({
          id: `${message.raw.id}:attachment`,
          messageId: message.raw.id,
          name: attachment.filename,
          url: attachment.url,
          previewUrl: kind === 'image' ? attachment.url : undefined,
          kind,
          icon: attachment.icon,
          size: attachment.size,
          mime: attachment.mime,
          ext: attachment.ext,
          senderLabel,
          createdAt,
        })
      }

      const metadata = parseJsonRecord(message.raw.metadata)
      if (!metadata || typeof metadata !== 'object') {
        return
      }

      const record = metadata as Record<string, unknown>
      const gallery = Array.isArray(record.gallery) ? record.gallery : null
      if (gallery) {
        gallery.forEach((file, index) => {
          if (!file || typeof file !== 'object') {
            return
          }

          const galleryFile = file as Record<string, unknown>
          const url = typeof galleryFile.url === 'string'
            ? (normalizeBackendAssetUrl(galleryFile.url) ?? galleryFile.url)
            : ''
          if (!url) {
            return
          }

          const name = typeof galleryFile.name === 'string' && galleryFile.name.trim()
            ? galleryFile.name.trim()
            : mt('page.fileN', { n: index + 1 })
          const mime = typeof galleryFile.type === 'string' ? galleryFile.type : null
          const kind = resolveSharedAttachmentKind(name, mime)

          pushAttachment({
            id: `${message.raw.id}:gallery:${index}`,
            messageId: message.raw.id,
            name,
            url,
            previewUrl: kind === 'image' ? url : undefined,
            kind,
            icon: resolveSharedAttachmentIcon(kind, name),
            size: parseAttachmentSizeValue(galleryFile.size),
            mime: mime ?? undefined,
            ext: getAttachmentExtension(name) || undefined,
            senderLabel,
            createdAt,
          })
        })
      }

      if (record.type === 'drive_file') {
        const url = typeof record.fileDownloadUrl === 'string'
          ? (normalizeBackendAssetUrl(record.fileDownloadUrl) ?? record.fileDownloadUrl)
          : ''
        const name = typeof record.fileName === 'string' && record.fileName.trim()
          ? record.fileName.trim()
          : mt('page.t038')
        if (!url) {

          return
        }

        const mime = typeof record.fileMime === 'string' ? record.fileMime : null
        const kind = resolveSharedAttachmentKind(name, mime)
        pushAttachment({
          id: `${message.raw.id}:drive`,
          messageId: message.raw.id,
          name,
          url,
          previewUrl: kind === 'image' ? url : undefined,
          kind,
          icon: resolveSharedAttachmentIcon(kind, name),
          size: parseAttachmentSizeValue(record.fileSize),
          mime: mime ?? undefined,
          ext: getAttachmentExtension(name) || undefined,
          senderLabel,
          createdAt,
        })
      }
    })

    const unique = new Map<string, GroupSharedAttachmentItem>()
    collected.forEach((item) => {
      const key = `${item.messageId}:${item.url}:${item.name}`
      if (!unique.has(key)) {
        unique.set(key, item)
      }
    })

    return Array.from(unique.values()).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
  }, [messages])
  const openedImageIndex = useMemo(
    () => (openedImageMessageId ? imageMessages.findIndex((message) => message.raw.id === openedImageMessageId) : -1),
    [imageMessages, openedImageMessageId],
  )
  const openedImageMessage = openedImageIndex >= 0 ? imageMessages[openedImageIndex] : null
  const openedVideoMessage = useMemo(
    () => (openedVideoMessageId ? messages.find((message) => message.raw.id === openedVideoMessageId && Boolean(message.videoUrl)) ?? null : null),
    [messages, openedVideoMessageId],
  )
  const contextMenuMessage = useMemo(
    () => (messageContextMenu ? messages.find((message) => message.raw.id === messageContextMenu.messageId) ?? null : null),
    [messageContextMenu, messages],
  )
  const contextMenuIsCall = useMemo(
    () => contextMenuMessage
      ? isVideoCallLikeMessage(contextMenuMessage.raw, { content: contextMenuMessage.text, unavailable: Boolean(contextMenuMessage.unavailable) })
      : false,
    [contextMenuMessage],
  )
  useLayoutEffect(() => {
    if (!messageContextMenu || !messageContextMenuRef.current) {
      return
    }

    const viewportMargin = 12
    const menuRect = messageContextMenuRef.current.getBoundingClientRect()
    const maxX = Math.max(viewportMargin, window.innerWidth - menuRect.width - viewportMargin)
    const maxY = Math.max(viewportMargin, window.innerHeight - menuRect.height - viewportMargin)
    const nextX = Math.max(viewportMargin, Math.min(messageContextMenu.x, maxX))
    const nextY = messageContextMenu.y + menuRect.height > window.innerHeight - viewportMargin
      ? Math.max(viewportMargin, messageContextMenu.y - menuRect.height)
      : Math.max(viewportMargin, Math.min(messageContextMenu.y, maxY))

    if (nextX !== messageContextMenu.x || nextY !== messageContextMenu.y) {
      setMessageContextMenu((current) => current ? { ...current, x: nextX, y: nextY } : current)
    }
  }, [messageContextMenu, contextMenuMessage])
  const openThemePanel = useCallback(() => {
    setChatThemeDraft(toChatThemeDraft(chatTheme))
    setChatThemeError('')
    setIsThemePanelOpen(true)
  }, [chatTheme])
  const closeThemePanel = useCallback(() => {
    setChatThemeDraft(toChatThemeDraft(chatTheme))
    setChatThemeError('')
    setIsThemePanelOpen(false)
  }, [chatTheme])
  const handleThemeDraftChange = useCallback((patch: Partial<ChatThemeConfigInput>) => {
    setChatThemeDraft((prev) => ({ ...prev, ...patch }))
  }, [])
  const handleThemeImageUpload = useCallback(async (file: File) => {
    const extension = getAttachmentExtension(file.name)
    const isImageFile = file.type.startsWith('image/') || IMAGE_ATTACHMENT_EXTENSIONS.has(extension)

    if (!isImageFile) {
      setChatThemeError(mt('page.t039'))
      return
    }

    if (file.size > IMAGE_ATTACHMENT_LIMIT_BYTES) {
      setChatThemeError(mt('page.imageTooBig', { limit: formatAttachmentLimit(IMAGE_ATTACHMENT_LIMIT_BYTES) }))
      return
    }

    setIsThemeImageUploading(true)
    setChatThemeError('')

    try {
      const uploaded = await chatRepository.uploadFile(file, 'image')
      setChatThemeDraft((prev) => ({
        ...prev,
        backgroundType: 'image',
        backgroundImageUrl: uploaded.url,
      }))
    } catch (uploadError) {
      setChatThemeError(getErrorMessage(uploadError, mt('page.t040')))
    } finally {
      setIsThemeImageUploading(false)
    }
  }, [chatRepository])
  const handleSaveTheme = useCallback(async () => {
    setIsThemeSaving(true)
    setChatThemeError('')
    const requestVersion = ++chatThemeRequestVersionRef.current

    try {
      const savedTheme = await chatThemeRepository.setTheme(normalizeThemeConfig(chatThemeDraft))
      if (chatThemeRequestVersionRef.current !== requestVersion) {
        return
      }
      setChatTheme(savedTheme)
      setChatThemeDraft(toChatThemeDraft(savedTheme))
      setIsThemePanelOpen(false)
    } catch (saveError) {
      if (chatThemeRequestVersionRef.current !== requestVersion) {
        return
      }
      setChatThemeError(getErrorMessage(saveError, mt('page.t041')))
    } finally {
      if (chatThemeRequestVersionRef.current === requestVersion) {
        setIsThemeSaving(false)
      }
    }
  }, [chatThemeDraft, chatThemeRepository])
  const handleResetTheme = useCallback(async () => {
    setIsThemeResetting(true)
    setChatThemeError('')
    const requestVersion = ++chatThemeRequestVersionRef.current

    try {
      await chatThemeRepository.deleteTheme()
      if (chatThemeRequestVersionRef.current !== requestVersion) {
        return
      }
      setChatTheme(null)
      setChatThemeDraft(DEFAULT_CHAT_THEME_CONFIG)
      setIsThemePanelOpen(false)
    } catch (resetError) {
      if (chatThemeRequestVersionRef.current !== requestVersion) {
        return
      }
      setChatThemeError(getErrorMessage(resetError, mt('page.t042')))
    } finally {
      if (chatThemeRequestVersionRef.current === requestVersion) {
        setIsThemeResetting(false)
      }
    }
  }, [chatThemeRepository])

  useEffect(() => {
    if (typeof window === 'undefined' || isLoadingChats || error) {
      return
    }

    window.dispatchEvent(new CustomEvent<number>(MESSENGER_UNREAD_COUNT_EVENT, { detail: totalUnreadCount }))
  }, [error, isLoadingChats, totalUnreadCount])
  useEffect(() => {
    let cancelled = false
    const requestVersion = ++chatThemeRequestVersionRef.current

    const loadTheme = async () => {
      try {
        const savedTheme = await chatThemeRepository.getTheme()
        if (cancelled || chatThemeRequestVersionRef.current !== requestVersion) {
          return
        }

        setChatTheme(savedTheme)
        setChatThemeDraft(toChatThemeDraft(savedTheme))
      } catch (themeError) {
        if (!cancelled && chatThemeRequestVersionRef.current === requestVersion) {
          setChatTheme(null)
          setChatThemeDraft(DEFAULT_CHAT_THEME_CONFIG)
          setChatThemeError(getErrorMessage(themeError, mt('page.t043')))
        }
      }
    }

    void loadTheme()

    return () => {
      cancelled = true
    }
  }, [chatThemeRepository])
  const filteredChats = useMemo(() => {
    const hiddenGroupIds = new Set(hiddenGroups.map((group) => group.id))
    const filtered = chats.filter((item) => {
      if (item.chat.type === 'group' && hiddenGroupIds.has(item.chat.id) && item.unread <= 0) return false
      if (selectedFolderId) {
        const assignedChatIds = new Set(folderChatAssignments[selectedFolderId] ?? [])
        if (!assignedChatIds.has(item.chat.id)) {
          return false
        }
      } else {
        if (filter === 'groups' && item.chat.type !== 'group') {
          return false
        }

        if (filter === 'personal' && item.chat.type !== 'personal') {
          return false
        }

        if (filter === 'channels') {
          return false
        }
      }

      if (unreadOnly && item.unread <= 0 && (item.chat.mentionCount ?? 0) <= 0) {
        return false
      }

      if (!search.trim()) {
        return true
      }

      const query = search.toLowerCase()
      return item.title.toLowerCase().includes(query) || item.subtitle.toLowerCase().includes(query)
    })

    return filtered.sort((left, right) => {
      // Support chats always go to the absolute top
      const leftIsSupport = left.chat.type === 'support'
      const rightIsSupport = right.chat.type === 'support'
      if (leftIsSupport !== rightIsSupport) {
        return leftIsSupport ? -1 : 1
      }

      if (left.chat.isPinned !== right.chat.isPinned) {
        return left.chat.isPinned ? -1 : 1
      }

      const leftTime = left.chat.lastMessage?.createdAt
        ? new Date(left.chat.lastMessage.createdAt).getTime()
        : new Date(left.chat.updatedAt || left.chat.createdAt).getTime()

      const rightTime = right.chat.lastMessage?.createdAt
        ? new Date(right.chat.lastMessage.createdAt).getTime()
        : new Date(right.chat.updatedAt || right.chat.createdAt).getTime()

      return rightTime - leftTime
    })
  }, [chats, filter, folderChatAssignments, hiddenGroups, search, selectedFolderId, unreadOnly])

  const filteredChannels = useMemo(() => {
    if (selectedFolderId) return []
    if (filter !== 'channels' && filter !== 'all') return []

    const mapped = myChannels
      .map(toChannelListItem)
      .filter((item) => !unreadOnly || item.unread > 0 || (item.chat.mentionCount ?? 0) > 0)
    if (!search.trim()) {
      return mapped
    }

    const query = search.toLowerCase()
    return mapped.filter((item) => item.title.toLowerCase().includes(query) || item.subtitle.toLowerCase().includes(query))
  }, [filter, myChannels, search, selectedFolderId, toChannelListItem, unreadOnly])

  const allDisplayItems = useMemo(() => {
    if (filter === 'channels') {
      return [...filteredChannels, ...globalChannelResults].filter(
        (item) => !unreadOnly || item.unread > 0 || (item.chat.mentionCount ?? 0) > 0,
      )
    }
    if (search.trim().length >= 2 && filter === 'all') {
      // Deduplicate global results if they are already in filteredChannels
      const localIds = new Set(filteredChannels.map(c => c.chat.id))
      const uniqueGlobal = globalChannelResults.filter(
        (item) =>
          !localIds.has(item.chat.id) &&
          (!unreadOnly || item.unread > 0 || (item.chat.mentionCount ?? 0) > 0),
      )
      return [...filteredChats, ...uniqueGlobal]
    }
    return filteredChats
  }, [filter, filteredChannels, filteredChats, globalChannelResults, search, unreadOnly])

  const filteredSmartAgentConversations = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) {
      return smartAgentConversations
    }

    return smartAgentConversations.filter((conversation) =>
      [conversation.name, conversation.last_message]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query),
    )
  }, [search, smartAgentConversations])


  const resetChatSearchState = useCallback(() => {
    chatSearchRequestIdRef.current += 1
    setChatSearchQuery('')
    setChatSearchAttachmentType('all')
    setChatSearchResults([])
    setIsChatSearchLoading(false)
    setChatSearchError('')
    setChatSearchInfo('')
    setSelectedChatSearchResultId(null)
    setHighlightedSearchMessageId(null)
    if (highlightedSearchMessageTimeoutRef.current) {
      clearTimeout(highlightedSearchMessageTimeoutRef.current)
      highlightedSearchMessageTimeoutRef.current = null
    }
  }, [])

  const closeChatSearch = useCallback(() => {
    setIsChatSearchOpen(false)
    resetChatSearchState()
  }, [resetChatSearchState])

  const buildChatSearchResultItem = useCallback(
    async (result: GlobalChatSearchItem): Promise<ChatSearchResultItem> => {
      const message = result.message
      const current = currentUserRef.current
      const view = await toMessageView(message, current?.id ?? 0, cryptoRef.current)

      return {
        raw: message,
        view,
        senderLabel: message.senderFullName || message.senderUsername || mt('page.t044'),
        snippetText: view.text,
        highlightedSnippet: result.highlight || null,
        timeLabel: formatTimeLabel(message.createdAt),
        typeLabel: getChatSearchTypeLabel(view.kind),
        chatId: message.conversationId,
        chatType: result.chatType,
        chatName: result.chatName,
        attachmentName: result.attachmentName,
      }
    },
    [],
  )

  const loadSidebarMessageSearch = useCallback(async (query: string, offset: number, requestId: number, chatType?: ChatType) => {
    if (sidebarMessageSearchRequestIdRef.current !== requestId) return
    setSidebarMessageSearch((previous) => ({ ...previous, isLoading: true, error: '' }))
    try {
      const page = await chatRepository.searchMessagesGlobal(query, { limit: 50, offset, chatType })
      const items = await Promise.all(page.results.map(buildChatSearchResultItem))
      if (sidebarMessageSearchRequestIdRef.current !== requestId) return
      setSidebarMessageSearch((previous) => ({
        query,
        results: offset === 0 ? items : [...previous.results, ...items],
        totalCount: page.totalCount,
        hasMore: page.hasMore && offset + page.results.length < 10000,
        offset: offset + page.results.length,
        isLoading: false,
        error: '',
      }))
    } catch (searchError) {
      if (sidebarMessageSearchRequestIdRef.current !== requestId) return
      setSidebarMessageSearch((previous) => ({ ...previous, isLoading: false, error: searchError instanceof Error ? searchError.message : mt('page.t045') }))
    }
  }, [buildChatSearchResultItem, chatRepository])

  useEffect(() => {
    const query = search.trim()
    const requestId = ++sidebarMessageSearchRequestIdRef.current
    if (isSmartAgentListMode || filter === 'calls' || query.length < CHAT_SEARCH_MIN_QUERY_LENGTH) {
      setSidebarMessageSearch({ query, results: [], totalCount: 0, hasMore: false, offset: 0, isLoading: false, error: '' })
      return
    }
    setSidebarMessageSearch({ query, results: [], totalCount: 0, hasMore: false, offset: 0, isLoading: true, error: '' })
    const sidebarChatType: ChatType | undefined = filter === 'groups' ? 'group' : filter === 'channels' ? 'channel' : filter === 'personal' ? 'personal' : undefined
    const timer = window.setTimeout(() => void loadSidebarMessageSearch(query, 0, requestId, sidebarChatType), CHAT_SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [filter, isSmartAgentListMode, loadSidebarMessageSearch, search])

  useEffect(() => {
    setActivePinnedIndex(0)
  }, [activeChatId])

  useEffect(() => {
    setIsPinnedMessagesPanelOpen(false)
  }, [activeChatId])

  useEffect(() => {
    setResolvedPinnedMessageViews({})
  }, [activeChatId])

  useEffect(() => {
    if (!activeChat) {
      setShowInfo(false)
    }
  }, [activeChat])

  useEffect(() => {
    if (!activeChat || pinnedMessages.length === 0 || !currentUserRef.current) {
      return
    }

    const loadedById = new Map(messages.map((message) => [message.raw.id, message] as const))
    const missingPinned = pinnedMessages.filter(
      (pinned) => !loadedById.has(pinned.messageId) && !resolvedPinnedMessageViews[pinned.messageId],
    )

    if (missingPinned.length === 0) {
      const hydratedFromLoaded = pinnedMessages.reduce<Record<string, MessageView>>((acc, pinned) => {
        const view = loadedById.get(pinned.messageId)
        if (view) {
          acc[pinned.messageId] = view
        }
        return acc
      }, {})

      if (Object.keys(hydratedFromLoaded).length > 0) {
        setResolvedPinnedMessageViews((prev) => {
          let changed = false
          const next = { ...prev }
          for (const [messageId, view] of Object.entries(hydratedFromLoaded)) {
            if (next[messageId] !== view) {
              next[messageId] = view
              changed = true
            }
          }
          return changed ? next : prev
        })
      }
      return
    }

    let isCancelled = false

    const toPinnedFallbackMessage = (pinned: PinnedMessage): ChatMessage => ({
      id: pinned.messageId,
      conversationId: pinned.chatId,
      senderId: pinned.pinnedBy,
      replyToId: null,
      replyTo: null,
      content: pinned.content,
      contentHash: '',
      encryptedKeys: {},
      type: pinned.type,
      attachmentUrl: null,
      attachmentType: null,
      attachmentSize: null,
      metadata: null,
      isEdited: false,
      isForwarded: false,
      originalSenderId: null,
      isDeleted: false,
      createdAt: pinned.createdAt,
      updatedAt: pinned.createdAt,
      editedAt: null,
      isEphemeral: false,
      ttlSeconds: null,
      expiresAt: null,
      senderUsername: '',
      senderFullName: '',
      senderAvatar: null,
      originalSenderFullName: null,
      readByCount: 0,
      deliveredCount: 0,
      isRead: true,
      reactions: [],
    })

    const toPinnedChannelMessage = (post: ChannelPostView): ChatMessage => ({
      id: post.id,
      conversationId: post.channelId,
      senderId: post.authorId,
      replyToId: post.replyToId,
      replyTo: post.replyTo,
      content: post.content || '',
      contentHash: '',
      encryptedKeys: {},
      type: resolveMessageTypeFromAttachment(post.attachmentType),
      attachmentUrl: post.attachmentUrl,
      attachmentType: post.attachmentType,
      attachmentSize: post.attachmentSize,
      metadata: post.metadata,
      isEdited: false,
      isForwarded: false,
      originalSenderId: null,
      isDeleted: false,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      editedAt: null,
      isEphemeral: false,
      ttlSeconds: null,
      expiresAt: null,
      senderUsername: '',
      senderFullName: post.authorName,
      senderAvatar: post.authorAvatar,
      originalSenderFullName: null,
      readByCount: 0,
      deliveredCount: 0,
      isRead: post.isViewed,
      reactions: (post.reactions || []).map((r) => ({
        reaction: r.reaction,
        count: r.count,
        reacted: r.reacted,
        users: (r.users || []).map((u) => ({
          id: u.id,
          fullName: u.fullName,
          avatar: u.avatar,
        })),
      })),
    })

    const hydratePinnedViews = async () => {
      const currentUserId = currentUserRef.current?.id ?? 0
      const pendingIds = new Set(missingPinned.map((pinned) => pinned.messageId))
      const resolvedBatch: Record<string, MessageView> = {}

      const resolveRawMessage = async (raw: ChatMessage) => {
        if (!pendingIds.has(raw.id)) {
          return
        }
        const view = await toMessageView(raw, currentUserId, cryptoRef.current)
        resolvedBatch[raw.id] = view
        pendingIds.delete(raw.id)
      }

      try {
        const maxPages = 8
        let offset = 0

        for (let pageIndex = 0; pageIndex < maxPages && pendingIds.size > 0; pageIndex += 1) {
          if (activeChat.chat.type === 'channel') {
            const posts = await channelRepository.getPosts(activeChat.chat.id, { limit: CHAT_HISTORY_PAGE_SIZE, offset })
            for (const post of posts) {
              await resolveRawMessage(toPinnedChannelMessage(post))
            }
            if (posts.length < CHAT_HISTORY_PAGE_SIZE) {
              break
            }
            offset += posts.length
            continue
          }

          const page =
            activeChat.chat.type === 'group'
              ? await chatRepository.getGroupMessages(activeChat.chat.id, { limit: CHAT_HISTORY_PAGE_SIZE, offset })
              : await chatRepository.getConversationMessages(activeChat.chat.id, { limit: CHAT_HISTORY_PAGE_SIZE, offset })

          for (const raw of page.messages) {
            await resolveRawMessage(raw)
          }

          if (page.count < CHAT_HISTORY_PAGE_SIZE) {
            break
          }
          offset += page.count
        }
      } catch {
        // fallback below
      }

      for (const pinned of missingPinned) {
        if (resolvedBatch[pinned.messageId]) {
          continue
        }
        resolvedBatch[pinned.messageId] = await toMessageView(toPinnedFallbackMessage(pinned), currentUserId, cryptoRef.current)
      }

      if (!isCancelled && Object.keys(resolvedBatch).length > 0) {
        setResolvedPinnedMessageViews((prev) => {
          let changed = false
          const next = { ...prev }
          for (const [messageId, view] of Object.entries(resolvedBatch)) {
            if (next[messageId] !== view) {
              next[messageId] = view
              changed = true
            }
          }
          return changed ? next : prev
        })
      }
    }

    void hydratePinnedViews()

    return () => {
      isCancelled = true
    }
  }, [activeChat, channelRepository, chatRepository, messages, pinnedMessages, resolvedPinnedMessageViews])

  useEffect(() => {
    setIsChatSearchOpen(false)
    setReplyTarget(null)
    resetChatSearchState()
  }, [activeChatId, resetChatSearchState])

  useEffect(() => {
    const query = search.trim().toLowerCase()
    const canSearchGlobalChannels = !isSmartAgentListMode && (filter === 'all' || filter === 'channels')
    if (!canSearchGlobalChannels || query.length < 2) {
      setGlobalChannelResults([])
      setIsSearchingGlobal(false)
      return
    }

    const timer = setTimeout(async () => {
      setIsSearchingGlobal(true)
      try {
        const results = await channelRepository.searchChannels(query)
        const mapped = results.map((r) => ({ ...toChannelListItem(r), isGlobal: true }))
        setGlobalChannelResults(mapped)
      } catch (err) {
        console.error('Global channel search failed', err)
      } finally {
        setIsSearchingGlobal(false)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [channelRepository, filter, isSmartAgentListMode, search, toChannelListItem])

  useEffect(() => {
    setActivePinnedIndex((prev) => {
      if (pinnedMessages.length === 0) {
        return 0
      }

      return Math.min(prev, pinnedMessages.length - 1)
    })
  }, [pinnedMessages])

  const filteredDirectoryUsers = useMemo(() => {
    const availableUsers = directoryUsers.filter((user) => !currentUser || user.id !== currentUser.id)
    const query = userSearchQuery.trim().toLowerCase()

    const filtered = !query
      ? availableUsers
      : availableUsers.filter((user) => {
          const haystack = [user.fullName, user.username, user.email]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()

          return haystack.includes(query)
        })

    return filtered.sort((left, right) => {
      if (left.isActive !== right.isActive) {
        return left.isActive ? -1 : 1
      }

      return left.fullName.localeCompare(right.fullName, 'ru', { sensitivity: 'base' })
    })
  }, [currentUser, directoryUsers, userSearchQuery])

  useEffect(() => {
    setFolderChatAssignments(readFolderChatAssignments())
  }, [])



  useEffect(() => {
    if (selectedFolderId && !folders.some((folder) => folder.id === selectedFolderId)) {
      setSelectedFolderId(null)
    }
  }, [folders, selectedFolderId])

  const loadChats = useCallback(async (options?: { silent?: boolean }) => {
    if (chatListLoadRef.current) return chatListLoadRef.current
    const loadVersion = ++chatListLoadVersionRef.current
    const request = (async () => {
      const activeDeviceId = webDeviceStore.getOrCreateCurrentDeviceId()
      console.log('[Messenger DEBUG] Current Device ID:', activeDeviceId)

      const silent = options?.silent ?? chatsHydratedRef.current
      setIsChatQrAuthorized(true)
      if (!silent) {
        setIsLoadingChats(true)
      }
      setError('')

      try {
        // Start the list request immediately; it does not depend on the profile or local key.
        const [me, nextChats] = await Promise.all([
          authRepository.me(sessionStore.getTokens()?.accessToken),
          chatRepository.getUnifiedChats(),
        ])
        if (!messengerMountedRef.current) return
        const storageKey = IndexedDbKeyStore.buildScopedStorageKey(me.id, activeDeviceId)
        const privateKey = await keyStore.getPrivateKey(storageKey)
        if (!messengerMountedRef.current) return
        const canReusePreviews = currentUserRef.current?.id === me.id &&
          cryptoRef.current.currentDeviceId === activeDeviceId && cryptoRef.current.privateKey === privateKey
        const nextCryptoState = { currentDeviceId: activeDeviceId, privateKey }
        setCryptoState(nextCryptoState)
        cryptoRef.current = nextCryptoState

        const storedHiddenGroups = readHiddenGroups(me.id)
        const knownChatIds = new Set(nextChats.map((chat) => chat.id))
        setHiddenGroups(storedHiddenGroups)

        setCurrentUser({
          id: me.id,
          name: me.fullName || me.username || me.email || 'User',
          isSupport: me.isSupport,
        })
        // Folders are auxiliary UI data and must not block opening the messenger.
        void chatRepository.getFolders().then((nextFolders) => {
          if (!messengerMountedRef.current || chatListLoadVersionRef.current !== loadVersion) return
          setFolders(nextFolders)
          const initialAssignments = { ...readFolderChatAssignments() }
          for (const folder of nextFolders) {
            if (folder.chatIds) initialAssignments[folder.id] = folder.chatIds
          }
          persistFolderAssignments(initialAssignments)
        }).catch((folderError) => {
          console.error('Failed to load folders', folderError)
        })

        const normalizedChats = nextChats.map((chat) => {
          if (chat.type !== 'channel') {
            return chat
          }

          const lastViewedAt = channelViewedAtMapRef.current[chat.id]
          const lastActivityAt = chat.lastMessage?.createdAt ?? chat.updatedAt
          const shouldClearStaleUnread =
            Boolean(lastViewedAt) &&
            Boolean(lastActivityAt) &&
            new Date(lastViewedAt as string).getTime() >= new Date(lastActivityAt).getTime()

          return {
            ...chat,
            unreadCount: shouldClearStaleUnread ? 0 : chat.unreadCount,
            mentionCount: shouldClearStaleUnread ? 0 : chat.mentionCount,
          }
        })

        const mapped = await Promise.all(normalizedChats.map((chat) => toChatListItem(chat, onlineUserIdsRef.current, true)))
        if (!messengerMountedRef.current) return
        const previousById = new Map(chatsRef.current.map((item) => [item.chat.id, item]))
        const pendingPreviews = normalizedChats.filter((chat, index) => {
          const previous = previousById.get(chat.id)
          if (canReusePreviews && previous && previous.subtitle !== mt('page.t028') &&
            previous.chat.lastMessage?.id === chat.lastMessage?.id &&
            previous.chat.lastMessage?.updatedAt === chat.lastMessage?.updatedAt &&
            previous.chat.lastMessage?.content === chat.lastMessage?.content &&
            JSON.stringify(previous.chat.lastMessage?.encryptedKeys) === JSON.stringify(chat.lastMessage?.encryptedKeys)) {
            mapped[index].subtitle = previous.subtitle
            return false
          }
          return Boolean(chat.lastMessage)
        })
        setChats(mapped)
        setIsLoadingChats(false)
        // Paint the list before trying historical device keys for encrypted previews.
        // Yield between small batches so decryption never monopolizes the UI thread.
        void (async () => {
          for (let offset = 0; offset < pendingPreviews.length; offset += 8) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
            if (!messengerMountedRef.current || chatListLoadVersionRef.current !== loadVersion) return
            const previews = await Promise.all(pendingPreviews.slice(offset, offset + 8)
              .map((chat) => toChatListItem(chat, onlineUserIdsRef.current)))
            if (!messengerMountedRef.current || chatListLoadVersionRef.current !== loadVersion) return
            const byId = new Map(previews.map((item) => [item.chat.id, item]))
            setChats((previous) => previous.map((item) => {
              const preview = byId.get(item.chat.id)
              if (!preview || preview.chat.lastMessage?.id !== item.chat.lastMessage?.id ||
                preview.chat.lastMessage?.updatedAt !== item.chat.lastMessage?.updatedAt) return item
              return { ...item, subtitle: preview.subtitle }
            }))
          }
        })().catch((previewError) => {
          console.error('Failed to load chat previews', previewError)
        })
        const shouldRestoreLastChat =
          !lastChatRestoreAttemptedRef.current &&
          !window.location.pathname.startsWith('/messenger/') &&
          !window.matchMedia(`(max-width: ${MOBILE_MESSENGER_BREAKPOINT - 1}px)`).matches
        const restoredChatId = shouldRestoreLastChat ? readLastActiveChatId(me.id) : null
        lastChatRestoreAttemptedRef.current = true
        setActiveChatId((prev) => {
          const candidate = prev ?? restoredChatId
          if (!candidate) {
            return null
          }

          return mapped.some((item) => item.chat.id === candidate) || storedHiddenGroups.some((group) => group.id === candidate) ? candidate : null
        })
        // Hidden-group history can require many pages. Hydrate it after the visible list.
        for (const group of storedHiddenGroups.filter((group) => !knownChatIds.has(group.id))) {
          void loadHiddenGroupChat(chatRepository, group.id, me.id, () => messengerMountedRef.current && chatListLoadVersionRef.current === loadVersion)
            .then((chat) => toChatListItem(chat, onlineUserIdsRef.current))
            .then((item) => {
              if (!messengerMountedRef.current || chatListLoadVersionRef.current !== loadVersion) return
              setChats((previous) => previous.some((existing) => existing.chat.id === item.chat.id)
                ? previous
                : [...previous, item])
            }).catch((hiddenGroupError) => {
              if (hiddenGroupError instanceof DOMException && hiddenGroupError.name === 'AbortError') return
              console.error('Failed to load hidden group', hiddenGroupError)
            })
        }
      } catch (loadError) {
        if (!messengerMountedRef.current) return
        if (
          typeof loadError === 'object' &&
          loadError !== null &&
          'status' in loadError &&
          (loadError as { status?: unknown }).status === 401
        ) {
          clearMessengerListSnapshot()
          dispatchAuthSessionExpired({
            reason: 'unauthorized',
            message: mt('page.t046'),
          })
        }
        setError(loadError instanceof Error ? loadError.message : mt('page.t047'))
      } finally {
        if (messengerMountedRef.current) {
          setIsLoadingChats(false)
          chatsHydratedRef.current = true
        }
      }

      if (!messengerMountedRef.current) return
      void channelRepository.getMyChannels().then((channels) => {
        if (messengerMountedRef.current && chatListLoadVersionRef.current === loadVersion) setMyChannels(channels)
      }).catch((channelErr) => {
        console.error('Failed to load channels', channelErr)
      })
    })()
    chatListLoadRef.current = request
    try {
      await request
    } finally {
      if (chatListLoadRef.current === request) chatListLoadRef.current = null
    }
  }, [authRepository, channelRepository, chatRepository, keyStore, sessionStore, toChatListItem, webDeviceStore])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleRefreshChats = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: unknown; from?: unknown; content?: unknown }>).detail
      const eventType = typeof detail?.type === 'string' ? detail.type : ''
      const senderId =
        typeof detail?.from === 'number'
          ? detail.from
          : typeof detail?.content === 'object' && detail.content && 'sender_id' in detail.content && typeof (detail.content as { sender_id?: unknown }).sender_id === 'number'
            ? ((detail.content as { sender_id: number }).sender_id)
            : null

      if (!shouldReloadMessengerChatList(eventType)) {
        return
      }

      if (senderId !== null && senderId === currentUserRef.current?.id) {
        return
      }

      console.log('[Messenger WS] Triggering loadChats due to messenger:refresh-chats event', eventType)
      void loadChats({ silent: true })
    }

    window.addEventListener('messenger:refresh-chats', handleRefreshChats as EventListener)
    return () => {
      window.removeEventListener('messenger:refresh-chats', handleRefreshChats as EventListener)
    }
  }, [loadChats])

  const loadChannels = useCallback(async () => {
    try {
      const channels = await channelRepository.getMyChannels()
      setMyChannels(channels)
    } catch (err) {
      console.error('Failed to load channels', err)
    }
  }, [channelRepository])

  const refreshActiveGroupMembers = useCallback(async (groupId: string) => {
    if (activeChatRef.current !== groupId) return
    const requestId = ++groupDetailsRequestRef.current
    const group = await chatRepository.getGroupDetails(groupId)
    if (activeChatRef.current !== groupId || requestId !== groupDetailsRequestRef.current) return
    setActiveGroupMembers(group.members)
    setActiveGroupDetails(group)
    setGroupMembersError('')
  }, [chatRepository])

  const loadActiveGroupEvents = useCallback(async (groupId: string) => {
    setIsGroupEventsLoading(true)
    setGroupEventsError('')
    try {
      const events = await groupCalendarRepository.listUpcomingEvents(groupId, 8)
      setActiveGroupEvents(events)
    } catch (err) {
      setActiveGroupEvents([])
      setGroupEventsError(getErrorMessage(err, mt('page.t048')))
    } finally {
      setIsGroupEventsLoading(false)
    }
  }, [groupCalendarRepository])

  const createActiveGroupEvent = useCallback(async (payload: CreateCalendarEventPayload) => {
    const activeGroupId = activeChat?.chat.type === 'group' ? activeChat.chat.id : null
    if (!activeGroupId) {
      return
    }

    setIsCreatingGroupEvent(true)
    setGroupEventsError('')
    try {
      const created = await groupCalendarRepository.createEvent(activeGroupId, payload)
      setActiveGroupEvents((prev) => {
        const next = [created, ...prev.filter((item) => item.id !== created.id)]
        return next.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      })
    } catch (err) {
      setGroupEventsError(getErrorMessage(err, mt('page.t049')))
      throw err
    } finally {
      setIsCreatingGroupEvent(false)
    }
  }, [activeChat, groupCalendarRepository])

  const loadChannelDetails = useCallback(async (channelId: string) => {
    setIsLoadingChannelDetails(true)
    try {
      const details = await channelRepository.getChannel(channelId)
      setChannelDetails(details)
    } catch (err) {
      setChannelMembersError(getErrorMessage(err, mt('page.t050')))
    } finally {
      setIsLoadingChannelDetails(false)
    }
  }, [channelRepository])

  const handleUpdateChannel = useCallback(async (input: UpdateChannelInput) => {
    if (!activeChatId) return
    try {
      const updated = await channelRepository.updateChannel(activeChatId, input)
      setChannelDetails(updated)
      setChats(prev => prev.map(item => 
        item.chat.id === activeChatId 
          ? { 
              ...item, 
              title: updated.name, 
              avatar: getInitials(updated.name), 
              avatarUrl: updated.avatarUrl,
              chat: {
                ...item.chat,
                channelName: updated.name,
                channelAvatar: updated.avatarUrl,
                peerUsername: updated.username,
                updatedAt: updated.updatedAt,
              }
            } 
          : item
      ))
    } catch (err) {
      setChannelMembersError(getErrorMessage(err, mt('page.t051')))
    }
  }, [activeChatId, channelRepository])

  const handleUpdateChannelAvatar = useCallback(async (file: File) => {
    if (!activeChatId) return
    const uploaded = await chatRepository.uploadFile(file, 'image')
    await channelRepository.updateAvatar(activeChatId, uploaded.url)
    const updated = await channelRepository.getChannel(activeChatId)
    setChannelDetails(updated)
    setChats((previous) => previous.map((item) => item.chat.id === activeChatId
      ? { ...item, avatarUrl: updated.avatarUrl, chat: { ...item.chat, channelAvatar: updated.avatarUrl } }
      : item))
  }, [activeChatId, chatRepository, channelRepository])

  const handleJoinChannel = useCallback(async () => {
    if (!activeChatId) return
    try {
      setIsMessageActionLoading(true)
      await channelRepository.subscribe(activeChatId)
      const details = await channelRepository.getChannel(activeChatId)
      setChannelDetails(details)
      
      // Refresh my channels and unified chats to ensure full synchronization
      await Promise.all([
        loadChannels(),
        loadChats()
      ])
      await loadPinnedMessagesRef.current?.(activeChatId, 'channel')
      await loadMessagesRef.current?.(activeChatId, 'channel')
    } catch (err) {
      setMessageActionError(getErrorMessage(err, mt('page.t052')))
    } finally {
      setIsMessageActionLoading(false)
    }
  }, [activeChatId, channelRepository, loadChannels, loadChats])

  const loadChannelAdmins = useCallback(async (channelId: string) => {
    setIsLoadingChannelAdmins(true)
    try {
      const admins = await channelRepository.getAdmins(channelId)
      setChannelAdmins(admins)
    } catch (err) {
      setChannelMembersError(getErrorMessage(err, mt('page.t053')))
    } finally {
      setIsLoadingChannelAdmins(false)
    }
  }, [channelRepository])

  const loadChannelMembers = useCallback(async (channelId: string) => {
    setIsLoadingChannelMembers(true)
    try {
      const members = await channelRepository.getMembers(channelId)
      setChannelMembers(members)
    } catch (err) {
      setChannelMembersError(getErrorMessage(err, mt('page.t054')))
    } finally {
      setIsLoadingChannelMembers(false)
    }
  }, [channelRepository])

  useEffect(() => {
    setMentionCaretIndex(0)
    setGroupMembersActionError('')

    const activeChatIdValue = activeChat?.chat.id
    const activeChatType = activeChat?.chat.type
    const isActiveChatDraft = activeChat?.isDraft

    const requestId = ++groupDetailsRequestRef.current
    if (!activeChatIdValue || activeChatType !== 'group' || isActiveChatDraft) {
      setActiveGroupMembers([])
      setActiveGroupDetails(null)
      setActiveGroupEvents([])
      setGroupMembersError('')
      setGroupEventsError('')
      return
    }

    let cancelled = false
    setGroupMembersError('')

    void chatRepository
      .getGroupDetails(activeChatIdValue)
      .then((group) => {
        if (cancelled || requestId !== groupDetailsRequestRef.current) {
          return
        }

        setActiveGroupMembers(group.members)
        setActiveGroupDetails(group)
        void loadActiveGroupEvents(activeChatIdValue)
      })
      .catch((loadError) => {
        if (cancelled || requestId !== groupDetailsRequestRef.current) {
          return
        }

        setActiveGroupMembers([])
        setActiveGroupDetails(null)
        setGroupMembersError(loadError instanceof Error ? loadError.message : mt('page.t055'))
      })

    return () => {
      cancelled = true
    }
  }, [activeChat?.chat.id, activeChat?.chat.type, activeChat?.isDraft, chatRepository, loadActiveGroupEvents, showInfo])

  useEffect(() => {
    const activeChatIdValue = activeChat?.chat.id
    const activeChatType = activeChat?.chat.type
    const isActiveChatDraft = activeChat?.isDraft

    if (!activeChatIdValue || activeChatType !== 'channel' || isActiveChatDraft) {
      setChannelDetails(null)
      setChannelAdmins([])
      setChannelMembers([])
      setChannelMembersError('')
      return
    }

    void loadChannelDetails(activeChatIdValue)
  }, [activeChat?.chat.id, activeChat?.chat.type, activeChat?.isDraft, loadChannelDetails])

  const activeChannelId = activeChat?.chat.type === 'channel' && !activeChat.isDraft ? activeChat.chat.id : null
  const activeChannelDetails = channelDetails && channelDetails.id === activeChannelId ? channelDetails : null
  const activeChannelRole = activeChannelDetails?.myRole ?? null
  const isActiveChannelSubscribed = Boolean(activeChannelDetails?.isSubscribed)
  useEffect(() => {
    if (!activeChannelId || !isActiveChannelSubscribed) {
      return
    }
    void loadChannelAdmins(activeChannelId)
    if (activeChannelRole === 'owner' || activeChannelRole === 'admin') {
      void loadChannelMembers(activeChannelId)
    }
  }, [activeChannelId, activeChannelRole, isActiveChannelSubscribed, loadChannelAdmins, loadChannelMembers])

  useEffect(() => {
    activeChatRef.current = activeChatId
    currentUserRef.current = currentUser
    cryptoRef.current = cryptoState
    chatsRef.current = chats
    messagesRef.current = messages
  }, [activeChatId, chats, cryptoState, currentUser, messages])

  useEffect(() => {
    if (!currentUser || !chatsHydratedRef.current) return
    const currentScope = messengerSnapshotScope(sessionStore.getTokens(), webDeviceStore.getCurrentDeviceId())
    writeMessengerListSnapshot(
      currentScope === listSnapshotScope ? currentScope : null,
      { currentUser, cryptoState, chats: chats.filter((item) => !item.isDraft && !item.isGlobal), folders },
    )
  }, [chats, cryptoState, currentUser, folders, listSnapshotScope, sessionStore, webDeviceStore])

  useEffect(() => {
    onlineUserIdsRef.current = onlineUserIds
  }, [onlineUserIds])

  useEffect(() => {
    historyOffsetRef.current = historyOffset
  }, [historyOffset])

  useEffect(() => {
    hasMoreHistoryRef.current = hasMoreHistory
  }, [hasMoreHistory])

  useEffect(() => {
    isLoadingOlderMessagesRef.current = isLoadingOlderMessages
  }, [isLoadingOlderMessages])

  useEffect(() => {
    isAtBottomRef.current = isAtBottom
  }, [isAtBottom])

  useEffect(() => {
    return () => {
      if (pendingReadSyncFrameRef.current !== null) {
        cancelAnimationFrame(pendingReadSyncFrameRef.current)
      }
      if (highlightedSearchMessageTimeoutRef.current) {
        clearTimeout(highlightedSearchMessageTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!isChatSearchOpen || !activeChatId || activeChat?.isDraft) {
      chatSearchRequestIdRef.current += 1
      setChatSearchResults([])
      setIsChatSearchLoading(false)
      setChatSearchError('')
      setChatSearchInfo('')
      setSelectedChatSearchResultId(null)
      return
    }

    const targetChatId = activeChatId
    const normalizedQuery = chatSearchQuery.trim()
    const requestId = chatSearchRequestIdRef.current + 1
    chatSearchRequestIdRef.current = requestId
    setChatSearchError('')
    setChatSearchInfo('')
    setSelectedChatSearchResultId(null)

    const attachmentTypeFilter = chatSearchAttachmentType === 'all' ? undefined : chatSearchAttachmentType
    const hasQuery = normalizedQuery.length >= CHAT_SEARCH_MIN_QUERY_LENGTH

    if (!hasQuery && !attachmentTypeFilter) {
      setChatSearchResults([])
      setIsChatSearchLoading(false)
      return
    }

    const timeoutId = setTimeout(() => {
      setIsChatSearchLoading(true)

      void Promise.all([
        hasQuery
          ? chatRepository.searchMessagesGlobal(normalizedQuery, { limit: CHAT_SEARCH_PANEL_LIMIT, chatId: targetChatId, attachmentType: attachmentTypeFilter })
          : Promise.resolve<GlobalChatSearchResult>({ query: '', results: [], totalCount: 0, hasMore: false }),
        chatRepository.searchAttachments({ query: hasQuery ? normalizedQuery : undefined, attachmentType: attachmentTypeFilter, limit: CHAT_SEARCH_PANEL_LIMIT, chatId: targetChatId }),
      ])
        .then(async ([messageResult, attachmentResult]) => {
          if (chatSearchRequestIdRef.current !== requestId || activeChatRef.current !== targetChatId) {
            return
          }

          const messageItems = await Promise.all(messageResult.results.map(buildChatSearchResultItem))
          const knownIds = new Set(messageItems.map((item) => item.raw.id))
          const attachmentItems = await Promise.all(
            attachmentResult.attachments
              .filter((attachment) => !knownIds.has(attachment.id))
              .map((attachment) => buildChatSearchResultItem({
                message: toChatMessage({
                  id: attachment.id,
                  conversation_id: attachment.conversationId,
                  sender_id: attachment.senderId,
                  sender_full_name: attachment.senderFullName,
                  content: attachment.attachmentName,
                  type: attachment.attachmentType as MessageType,
                  attachment_url: attachment.attachmentUrl,
                  attachment_type: attachment.attachmentType,
                  attachment_size: attachment.attachmentSize,
                  created_at: attachment.createdAt,
                  updated_at: attachment.createdAt,
                }),
                chatType: attachment.chatType,
                chatName: attachment.chatName,
                highlight: attachment.attachmentName,
                attachmentName: attachment.attachmentName,
                relevanceScore: 0,
              })),
          )
          const nextResults = [...messageItems, ...attachmentItems]

          if (chatSearchRequestIdRef.current !== requestId || activeChatRef.current !== targetChatId) {
            return
          }

          setChatSearchResults(nextResults)
        })
        .catch((searchError) => {
          if (chatSearchRequestIdRef.current !== requestId || activeChatRef.current !== targetChatId) {
            return
          }

          setChatSearchResults([])
          setChatSearchError(searchError instanceof Error ? searchError.message : mt('page.t056'))
        })
        .finally(() => {
          if (chatSearchRequestIdRef.current === requestId && activeChatRef.current === targetChatId) {
            setIsChatSearchLoading(false)
          }
        })
    }, CHAT_SEARCH_DEBOUNCE_MS)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [activeChat?.isDraft, activeChatId, buildChatSearchResultItem, chatRepository, chatSearchAttachmentType, chatSearchQuery, isChatSearchOpen])

  useEffect(() => {
    if (!isChatSearchOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeChatSearch()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeChatSearch, isChatSearchOpen])

  useEffect(() => {
    const syncWidth = () => {
      const isMobile = document.documentElement.clientWidth < MOBILE_MESSENGER_BREAKPOINT
      if (!isMobile) {
        setChatListPanelWidth((prev) => clampChatListPanelWidth(prev))
      }
      setIsMobileLayout(isMobile)
    }

    const mobileQuery = window.matchMedia(`(max-width: ${MOBILE_MESSENGER_BREAKPOINT - 1}px)`)
    const viewportObserver = new ResizeObserver(syncWidth)
    viewportObserver.observe(document.documentElement)
    syncWidth()
    window.addEventListener('resize', syncWidth)
    mobileQuery.addEventListener('change', syncWidth)
    return () => {
      window.removeEventListener('resize', syncWidth)
      mobileQuery.removeEventListener('change', syncWidth)
      viewportObserver.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!lastChatRestoreAttemptedRef.current) {
      return
    }
    writeLastActiveChatId(currentUser?.id, activeChatId)
  }, [activeChatId, currentUser?.id])

  useEffect(() => {
    if (!activeChatId) {
      if (window.location.pathname.startsWith('/messenger/')) {
        navigate('/messenger')
      }
      return
    }

    if (!activeChat) return

    if (activeChat.chat.type !== 'channel') {
      if (window.location.pathname.startsWith('/messenger/')) {
        navigate('/messenger', { replace: true })
      }
      return
    }

    // Standard behavior: channels sync to /messenger/@username or /messenger/ID
    if (activeChat.chat.type === 'channel') {
      const chatUsername = activeChat.chat.peerUsername
      const cleanUsername = chatUsername ? (chatUsername.startsWith('@') ? chatUsername.slice(1) : chatUsername) : null
      const isUuid = cleanUsername ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanUsername) : false
      
      if (cleanUsername && !isUuid) {
        // Use @handle if available and NOT a UUID
        const targetPath = `/messenger/@${cleanUsername}`
        if (window.location.pathname !== targetPath && window.location.pathname !== `/${cleanUsername}` && window.location.pathname !== `/@${cleanUsername}`) {
          navigate(targetPath)
        }
      } else {
        // Fallback to ID-based path for channels without a public handle
        const targetPath = `/messenger/${activeChat.chat.id}`
        if (window.location.pathname !== targetPath && window.location.pathname !== `/${activeChat.chat.id}`) {
          navigate(targetPath)
        }
      }
    }
  }, [activeChatId, activeChat, navigate])

  useEffect(() => {
    if (!isMobileLayout) {
      return
    }

    setIsChatListPanelResizing(false)
  }, [isMobileLayout])

  useEffect(() => {
    if (!showInfo) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowInfo(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showInfo])

  useEffect(() => {
    if (!isChatListPanelResizing) {
      return
    }

    const handleMouseMove = (event: MouseEvent) => {
      const nextWidth = clampChatListPanelWidth(chatListResizeStartWidthRef.current + (event.clientX - chatListResizeStartXRef.current))
      setChatListPanelWidth(nextWidth)
    }

    const handleMouseUp = () => {
      setIsChatListPanelResizing(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isChatListPanelResizing])

  useEffect(() => {
    const previousActiveChat = previousActiveChatRef.current

    if (
      previousActiveChat?.isDraft &&
      previousActiveChat.chat.id !== activeChatId &&
      input.trim() === '' &&
      messagesRef.current.length === 0
    ) {
      setChats((prev) => prev.filter((item) => item.chat.id !== previousActiveChat.chat.id))
    }

    previousActiveChatRef.current = activeChat
  }, [activeChat, activeChatId, input])

  const syncScrollBottomState = useCallback(() => {
    const scroller = messagesScrollerRef.current
    if (!scroller) {
      return
    }

    const atBottom = isScrolledNearBottom(scroller)
    isAtBottomRef.current = atBottom
    setIsAtBottom(atBottom)
    if (atBottom) {
      setPendingNewMessagesCount(0)
    }
  }, [])

  const stickChatToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    pendingMessagesScrollBehaviorRef.current = behavior
    isAtBottomRef.current = true
    setIsAtBottom(true)
    setPendingNewMessagesCount(0)
  }, [])

  const appendSmartAgentStreamDelta = useCallback((messageId: string, delta: string) => {
    if (!delta) return

    setSmartAgentStreamingTextVisible(true)
    setMessages((prev) => {
      const messageIndex = prev.findIndex((message) => message.raw.id === messageId)
      if (messageIndex < 0) {
        const now = new Date().toISOString()
        const safeDelta = sanitizeSmartAgentAssistantText(delta)
        const streamMessage: MessageView = {
          raw: toChatMessage({
            id: messageId,
            sender_id: -1,
            content: safeDelta,
            type: 'text',
            created_at: now,
            updated_at: now,
            conversation_id: 'smart-agent',
          }),
          from: 'them',
          text: safeDelta,
          time: new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          kind: 'text',
          senderLabel: 'Smart Agent',
          isCall: false,
          status: 'read',
          unavailable: false,
          feedback: null,
        }
        return [...prev, streamMessage]
      }

      const next = [...prev]
      const current = next[messageIndex]
      const nextText = sanitizeSmartAgentAssistantText(`${current.text}${delta}`)
      next[messageIndex] = {
        ...current,
        text: nextText,
        raw: {
          ...current.raw,
          content: nextText,
          updatedAt: new Date().toISOString(),
        },
      }
      return next
    })
    stickChatToBottom('auto')
  }, [setMessages, stickChatToBottom])

  useLayoutEffect(() => {
    const scroller = messagesScrollerRef.current
    if (!scroller || isLoadingMessages) {
      return
    }

    if (pendingPrependScrollRef.current) {
      const { scrollHeight, scrollTop } = pendingPrependScrollRef.current
      pendingPrependScrollRef.current = null
      scroller.scrollTop = scrollTop + (scroller.scrollHeight - scrollHeight)
      return
    }

    const behavior = pendingMessagesScrollBehaviorRef.current
    if (!behavior) {
      return
    }

    pendingMessagesScrollBehaviorRef.current = null
    if (behavior === 'auto') {
      scroller.scrollTop = scroller.scrollHeight
    } else {
      bottomRef.current?.scrollIntoView({ behavior, block: 'end' })
    }

    requestAnimationFrame(() => {
      syncScrollBottomState()
    })
  }, [messages, isLoadingMessages, syncScrollBottomState])

  const handleQrAuthenticated = useCallback(
    async (tokens: AuthTokens): Promise<void> => {
      sessionStore.setTokens(tokens)
      setIsChatQrAuthorized(true)
      await loadChats()
    },
    [loadChats, sessionStore],
  )

  const {
    status: qrStatus,
    startQrLogin,
  } = useQrLogin({ onAuthenticated: handleQrAuthenticated })

  useEffect(() => {
    if (isChatQrAuthorized || qrStatus !== 'idle') return
    if (webDeviceStore.getCurrentDeviceId()) return
    void startQrLogin()
  }, [isChatQrAuthorized, qrStatus, startQrLogin, webDeviceStore])

  const createFolder = useCallback(async () => {
    const normalizedName = folderName.trim()
    if (!normalizedName) {
      setFolderError(mt('page.t057'))
      return
    }

    setIsCreatingFolder(true)
    setFolderError('')

    try {
      const nextFolder = await chatRepository.createFolder(normalizedName)
      setFolders((prev) => [nextFolder, ...prev])

      if (pendingFolderAssignmentTarget) {
        const folderApiChatType = pendingFolderAssignmentTarget.chatType === 'group' ? 'group' : 'conversation'
        const currentFolderIds = Object.entries(folderChatAssignments)
          .filter(([, chatIds]) => chatIds.includes(pendingFolderAssignmentTarget.chatId))
          .map(([folderId]) => folderId)

        try {
          await Promise.all(
            currentFolderIds.map((folderId) =>
              chatRepository.removeChatFromFolder(folderId, pendingFolderAssignmentTarget.chatId),
            ),
          )
          await chatRepository.addChatToFolder(nextFolder.id, pendingFolderAssignmentTarget.chatId, folderApiChatType)

          const nextAssignments = {
            ...Object.fromEntries(
              Object.entries(folderChatAssignments).map(([folderId, chatIds]) => [
                folderId,
                chatIds.filter((chatId) => chatId !== pendingFolderAssignmentTarget.chatId),
              ]),
            ),
            [nextFolder.id]: [pendingFolderAssignmentTarget.chatId],
          } as Record<string, string[]>

          setFolderChatAssignments(nextAssignments)
          writeFolderChatAssignments(nextAssignments)
        } catch (folderAssignError) {
          const message =
            folderAssignError instanceof Error
              ? folderAssignError.message
              : mt('page.t058')
          setChatListActionError(message)
        }
      }

      setFolderName('')
      setEditingFolderId(null)
      setPendingFolderAssignmentTarget(null)
      setIsFolderModalOpen(false)
    } catch (createFolderError) {
      setFolderError(createFolderError instanceof Error ? createFolderError.message : mt('page.t059'))
    } finally {
      setIsCreatingFolder(false)
    }
  }, [chatRepository, folderChatAssignments, folderName, pendingFolderAssignmentTarget])

  const persistFolderAssignments = useCallback((nextValue: Record<string, string[]>) => {
    setFolderChatAssignments(nextValue)
    writeFolderChatAssignments(nextValue)
  }, [])

  const removeChatFromAllFolderAssignmentsLocally = useCallback(
    (chatId: string) => {
      const nextAssignments = Object.fromEntries(
        Object.entries(folderChatAssignments).map(([folderId, chatIds]) => [folderId, chatIds.filter((id) => id !== chatId)]),
      ) as Record<string, string[]>

      persistFolderAssignments(nextAssignments)
    },
    [folderChatAssignments, persistFolderAssignments],
  )

  const assignChatToFolderById = useCallback(
    async (chatId: string, chatType: ChatType, folderId: string) => {
      const folderApiChatType = chatType === 'group' ? 'group' : 'conversation'
      const currentFolderIds = Object.entries(folderChatAssignments)
        .filter(([, chatIds]) => chatIds.includes(chatId))
        .map(([currentFolderId]) => currentFolderId)

      setIsFolderUpdating(true)
      setIsFolderUpdating(true)
      setChatListActionError('')

      try {
        await Promise.all(
          currentFolderIds
            .filter((currentFolderId) => currentFolderId !== folderId)
            .map((currentFolderId) => chatRepository.removeChatFromFolder(currentFolderId, chatId)),
        )

        if (!currentFolderIds.includes(folderId)) {
          await chatRepository.addChatToFolder(folderId, chatId, folderApiChatType)
        }

        const nextAssignments = Object.fromEntries(
          Object.entries(folderChatAssignments).map(([currentFolderId, chatIds]) => [
            currentFolderId,
            currentFolderId === folderId ? [...new Set([...chatIds.filter((id) => id !== chatId), chatId])] : chatIds.filter((id) => id !== chatId),
          ]),
        ) as Record<string, string[]>

        persistFolderAssignments(nextAssignments)
      } catch (moveFolderError) {
        const message = moveFolderError instanceof Error ? moveFolderError.message : mt('page.t060')
        setChatListActionError(message)
        throw moveFolderError
      } finally {
        setIsFolderUpdating(false)
      }
    },
    [chatRepository, folderChatAssignments, persistFolderAssignments],
  )

  const removeChatFromFolderById = useCallback(
    async (chatId: string, folderId: string) => {
      setIsFolderUpdating(true)
      setIsFolderUpdating(true)
      setChatListActionError('')

      try {
        await chatRepository.removeChatFromFolder(folderId, chatId)
        const nextAssignments = {
          ...folderChatAssignments,
          [folderId]: (folderChatAssignments[folderId] ?? []).filter((id) => id !== chatId),
        }
        persistFolderAssignments(nextAssignments)
      } catch (removeFolderError) {
        const message = removeFolderError instanceof Error ? removeFolderError.message : mt('page.t061')
        setChatListActionError(message)
        throw removeFolderError
      } finally {
        setIsFolderUpdating(false)
      }
    },
    [chatRepository, folderChatAssignments, persistFolderAssignments],
  )

  const updateFolder = useCallback(async () => {
    const normalizedName = folderName.trim()
    if (!editingFolderId) {
      return
    }

    if (!normalizedName) {
      setFolderError(mt('page.t057'))
      return
    }

    setIsCreatingFolder(true)
    setFolderError('')

    try {
      await chatRepository.updateFolder(editingFolderId, normalizedName)
      setFolders((prev) =>
        prev.map((folder) => (folder.id === editingFolderId ? { ...folder, name: normalizedName } : folder)),
      )
      setFolderName('')
      setEditingFolderId(null)
      setPendingFolderAssignmentTarget(null)
      setIsFolderModalOpen(false)
    } catch (updateFolderError) {
      setFolderError(updateFolderError instanceof Error ? updateFolderError.message : mt('page.t062'))
    } finally {
      setIsCreatingFolder(false)
    }
  }, [chatRepository, editingFolderId, folderName])

  const deleteFolder = useCallback(
    async (folderId: string) => {
      setIsDeletingFolder(true)
      setFolderError('')

      try {
        await chatRepository.deleteFolder(folderId)
        setFolders((prev) => prev.filter((folder) => folder.id !== folderId))
        const nextAssignments = Object.fromEntries(
          Object.entries(folderChatAssignments).filter(([currentFolderId]) => currentFolderId !== folderId),
        )
        persistFolderAssignments(nextAssignments)

        if (selectedFolderId === folderId) {
          setSelectedFolderId(null)
          setFilter('all')
        }

        if (editingFolderId === folderId) {
          setEditingFolderId(null)
          setFolderName('')
        }
      } catch (deleteFolderError) {
        setFolderError(deleteFolderError instanceof Error ? deleteFolderError.message : mt('page.t063'))
      } finally {
        setIsDeletingFolder(false)
      }
    },
    [chatRepository, editingFolderId, folderChatAssignments, persistFolderAssignments, selectedFolderId],
  )

  const addGroupMember = useCallback(async (userId: number) => {
    if (!activeChat || activeChat.chat.type !== 'group') {
      return
    }

    setIsGroupMembersUpdating(true)
    setGroupMembersActionError('')

    try {
      await chatRepository.addGroupMembers(activeChat.chat.id, [userId])
      await refreshActiveGroupMembers(activeChat.chat.id)
    } catch (error) {
      setGroupMembersActionError(error instanceof Error ? error.message : mt('page.t064'))
    } finally {
      setIsGroupMembersUpdating(false)
    }
  }, [activeChat, chatRepository, refreshActiveGroupMembers])

  const removeGroupMember = useCallback(async (userId: number) => {
    if (!activeChat || activeChat.chat.type !== 'group') {
      return
    }

    setIsGroupMembersUpdating(true)
    setGroupMembersActionError('')

    try {
      await chatRepository.removeGroupMember(activeChat.chat.id, userId)
      await refreshActiveGroupMembers(activeChat.chat.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : mt('page.t065')
      setGroupMembersActionError(message)
      setMessageActionError(message)
    } finally {
      setIsGroupMembersUpdating(false)
    }
  }, [activeChat, chatRepository, refreshActiveGroupMembers])

  const updateGroupMemberRole = useCallback(async (userId: number, role: 'member' | 'admin') => {
    if (!activeChat || activeChat.chat.type !== 'group') {
      return
    }

    setIsGroupMembersUpdating(true)
    setGroupMembersActionError('')

    try {
      await chatRepository.updateGroupMemberRole(activeChat.chat.id, userId, role)
      await refreshActiveGroupMembers(activeChat.chat.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : mt('page.t066')
      setGroupMembersActionError(message)
      setMessageActionError(message)
    } finally {
      setIsGroupMembersUpdating(false)
    }
  }, [activeChat, chatRepository, refreshActiveGroupMembers])

  const leaveActiveGroup = useCallback(async () => {
    if (!activeChat || activeChat.chat.type !== 'group') {
      return
    }

    setIsGroupMembersUpdating(true)
    setGroupMembersActionError('')

    try {
      await chatRepository.leaveGroup(activeChat.chat.id)
      setShowInfo(false)
      await loadChats()
    } catch (error) {
      setGroupMembersActionError(error instanceof Error ? error.message : mt('page.t067'))
    } finally {
      setIsGroupMembersUpdating(false)
    }
  }, [activeChat, chatRepository, loadChats])

  const subscribeToChannel = useCallback(async (channelId: string) => {
    try {
      await channelRepository.subscribe(channelId)
      await loadChannelDetails(channelId)
      await loadChats()
      await loadPinnedMessagesRef.current?.(channelId, 'channel')
      await loadMessagesRef.current?.(channelId, 'channel')
    } catch (err) {
      setError(getErrorMessage(err, mt('page.t052')))
    }
  }, [channelRepository, loadChannelDetails, loadChats])

  const unsubscribeFromChannel = useCallback(async (channelId: string) => {
    try {
      await channelRepository.unsubscribe(channelId)
      setShowInfo(false)
      setActiveChatId(null)
      await loadChats()
    } catch (err) {
      setError(getErrorMessage(err, mt('page.t068')))
    }
  }, [channelRepository, loadChats])

  const addChannelMembers = useCallback(async (channelId: string, userIds: number[]) => {
    setIsLoadingChannelMembers(true)
    try {
      await channelRepository.addMembers(channelId, userIds)
      await loadChannelMembers(channelId)
      await loadChannelDetails(channelId)
    } catch (err) {
      setChannelMembersError(getErrorMessage(err, mt('page.t069')))
    } finally {
      setIsLoadingChannelMembers(false)
    }
  }, [channelRepository, loadChannelDetails, loadChannelMembers])

  const removeChannelMember = useCallback(async (channelId: string, userId: number) => {
    setIsLoadingChannelMembers(true)
    try {
      await channelRepository.removeMember(channelId, userId)
      await loadChannelMembers(channelId)
      await loadChannelAdmins(channelId)
      await loadChannelDetails(channelId)
    } catch (err) {
      setChannelMembersError(getErrorMessage(err, mt('page.t070')))
    } finally {
      setIsLoadingChannelMembers(false)
    }
  }, [channelRepository, loadChannelAdmins, loadChannelDetails, loadChannelMembers])

  const updateChannelMemberRole = useCallback(async (channelId: string, userId: number, role: ChannelRole) => {
    setIsLoadingChannelMembers(true)
    try {
      await channelRepository.updateMemberRole(channelId, userId, role)
      await loadChannelMembers(channelId)
      await loadChannelAdmins(channelId)
    } catch (err) {
      setChannelMembersError(getErrorMessage(err, mt('page.t071')))
    } finally {
      setIsLoadingChannelMembers(false)
    }
  }, [channelRepository, loadChannelAdmins, loadChannelMembers])

  const closeChatListContextMenu = useCallback(() => {
    setChatListContextMenu(null)
    setGroupMenuPermissions(null)
  }, [])

  const openChatListContextMenu = useCallback((event: ReactMouseEvent<HTMLButtonElement>, chatId: string) => {
    if (chatId && chatId.startsWith('smart-agent')) {
      event.preventDefault()
      return
    }
    event.preventDefault()
    event.stopPropagation()
    setGroupMenuPermissions(null)
    const target = chats.find((item) => item.chat.id === chatId)
    if (target?.chat.type === 'group' && !target.isDraft) {
      void chatRepository.getGroupDetails(chatId).then((group) => {
        setGroupMenuPermissions({ chatId, ...getGroupPermissions(group, currentUser?.id ?? null) })
      }).catch(() => {
        // Keep management actions hidden when permissions cannot be verified.
      })
    }
    const menuWidth = 236
    const menuHeight = 320
    setChatListActionError('')

    const x = Math.max(12, Math.min(event.clientX, window.innerWidth - menuWidth - 12))
    let y = event.clientY
    if (y + menuHeight > window.innerHeight - 12) {
      y = Math.max(12, event.clientY - menuHeight)
    }

    setChatListContextMenu({
      chatId,
      x,
      y,
      isFolderMenuOpen: false,
    })
  }, [chatRepository, chats, currentUser?.id])

  const toggleChatListFolderMenu = useCallback(() => {
    setChatListContextMenu((prev) => (prev ? { ...prev, isFolderMenuOpen: !prev.isFolderMenuOpen } : prev))
  }, [])

  const removeChatLocally = useCallback(
    (chatId: string) => {
      setChats((prev) => prev.filter((item) => item.chat.id !== chatId))
      removeChatFromAllFolderAssignmentsLocally(chatId)

      if (activeChatId === chatId) {
        setActiveChatId(null)
        setShowInfo(false)
        messageDraftRef.current = ''
        setInput('')
        setMentionCaretIndex(0)
        setMessages([])
        setHistoryOffset(0)
        setHasMoreHistory(false)
        setHistoryError('')
        setPendingNewMessagesCount(0)
        setSelectedMessages({ ids: [], anchorId: null })
        setMessageActionError('')
        setMessageContextMenu(null)
        setPinnedMessages([])
        setActivePinnedIndex(0)
        setIsPinnedMessagesPanelOpen(false)
        setChatSearchQuery('')
        setChatSearchResults([])
        setChatSearchError('')
        setChatSearchInfo('')
        setSelectedChatSearchResultId(null)
        setHighlightedSearchMessageId(null)
        setIsChatSearchOpen(false)
      }
    },
    [activeChatId, removeChatFromAllFolderAssignmentsLocally],
  )

  const handleToggleChatPin = useCallback(
    async (chatItem: ChatListItem) => {
      if (chatItem.isDraft) {
        return
      }

      closeChatListContextMenu()
      setIsChatListActionLoading(true)
      setChatListActionError('')

      try {
        if (chatItem.chat.isPinned) {
          await chatRepository.unpinChat(chatItem.chat.id, chatItem.chat.type)
        } else {
          await chatRepository.pinChat(chatItem.chat.id, chatItem.chat.type)
        }

        await loadChats()
      } catch (chatActionError) {
        setChatListActionError(chatActionError instanceof Error ? chatActionError.message : mt('page.t072'))
      } finally {
        setIsChatListActionLoading(false)
      }
    },
    [chatRepository, closeChatListContextMenu, loadChats],
  )

  const handleToggleContextChatMute = useCallback(async () => {
    if (!chatListContextMenuTarget || chatListContextMenuTarget.isDraft) {
      return
    }

    const { id, type, isMuted } = chatListContextMenuTarget.chat
    const nextMute = !isMuted

    closeChatListContextMenu()
    setIsChatListActionLoading(true)
    setChatListActionError('')

    try {
      let resolved = nextMute
      if (type === 'personal') {
        resolved = await chatRepository.setConversationMute(id, nextMute)
      } else if (type === 'group') {
        resolved = await chatRepository.setGroupMute(id, nextMute)
      } else if (type === 'channel') {
        resolved = await chatRepository.setChannelMute(id, nextMute)
      } else {
        return
      }
      applyMutedToChatId(id, resolved)
    } catch (chatActionError) {
      setChatListActionError(chatActionError instanceof Error ? chatActionError.message : mt('page.t073'))
    } finally {
      setIsChatListActionLoading(false)
    }
  }, [chatListContextMenuTarget, chatRepository, closeChatListContextMenu, applyMutedToChatId])

  const handleAssignContextChatToFolder = useCallback(
    async (folderId: string) => {
      if (!chatListContextMenuTarget || chatListContextMenuTarget.isDraft) {
        return
      }

      closeChatListContextMenu()

      try {
        await assignChatToFolderById(chatListContextMenuTarget.chat.id, chatListContextMenuTarget.chat.type, folderId)
      } catch {
        return
      }
    },
    [assignChatToFolderById, chatListContextMenuTarget, closeChatListContextMenu],
  )

  const handleRemoveContextChatFromFolder = useCallback(async () => {
    if (!chatListContextMenuTarget || !chatListContextMenuFolderId) {
      return
    }

    closeChatListContextMenu()

    try {
      await removeChatFromFolderById(chatListContextMenuTarget.chat.id, chatListContextMenuFolderId)
    } catch {
      return
    }
  }, [chatListContextMenuFolderId, chatListContextMenuTarget, closeChatListContextMenu, removeChatFromFolderById])

  const handleRequestDeleteChat = useCallback((chatId: string) => {
    closeChatListContextMenu()
    setChatDeleteTargetId(chatId)
    setIsChatDeleteConfirmOpen(true)
    setChatListActionError('')
  }, [closeChatListContextMenu])

  const handleHideGroup = useCallback(async (groupId: string) => {
    closeChatListContextMenu()
    setIsChatListActionLoading(true)
    setChatListActionError('')
    try {
      await chatRepository.hideGroup(groupId)
      const groupName = chats.find((item) => item.chat.id === groupId)?.title ?? mt('page.t074')
      if (currentUser?.id) {
        const next = [...readHiddenGroups(currentUser.id).filter((entry) => entry.id !== groupId), { id: groupId, name: groupName }]
        saveHiddenGroups(currentUser.id, next)
        setHiddenGroups(next)
      }
      await loadChats()
    } catch (error) {
      setChatListActionError(error instanceof Error ? error.message : mt('page.t075'))
    } finally {
      setIsChatListActionLoading(false)
    }
  }, [chatRepository, chats, closeChatListContextMenu, currentUser?.id, loadChats])

  const handleRestoreGroup = useCallback(async (groupId: string) => {
    setRestoringGroupId(groupId)
    setHiddenGroupsError('')
    try {
      await chatRepository.unhideGroup(groupId)
      if (currentUser?.id) {
        const next = readHiddenGroups(currentUser.id).filter((entry) => entry.id !== groupId)
        saveHiddenGroups(currentUser.id, next)
        setHiddenGroups(next)
      }
      await loadChats()
    } catch (error) {
      setHiddenGroupsError(error instanceof Error ? error.message : mt('page.t076'))
    } finally {
      setRestoringGroupId(null)
    }
  }, [chatRepository, currentUser?.id, loadChats])

  const handleConfirmDeleteChat = useCallback(async () => {
    if (!chatDeleteTarget) {
      return
    }

    setIsChatListActionLoading(true)
    setChatListActionError('')

    try {
      if (chatDeleteTarget.chat.type === 'channel') {
        await channelRepository.unsubscribe(chatDeleteTarget.chat.id)
      } else if (chatDeleteTarget.chat.type === 'group') {
        await chatRepository.deleteGroup(chatDeleteTarget.chat.id)
      } else {
        await chatRepository.hideConversation(chatDeleteTarget.chat.id)
      }

      removeChatLocally(chatDeleteTarget.chat.id)
      setIsChatDeleteConfirmOpen(false)
      setChatDeleteTargetId(null)
      await loadChats()
    } catch (chatDeleteError) {
      setChatListActionError(
        chatDeleteError instanceof Error
          ? chatDeleteError.message
          : chatDeleteTarget.chat.type === 'group'
            ? mt('page.t077')
            : mt('page.t078'),
      )
    } finally {
      setIsChatListActionLoading(false)
    }
  }, [chatDeleteTarget, chatRepository, channelRepository, loadChats, removeChatLocally])

  const handleOpenGroupEditModal = useCallback(
    async (chatItem: ChatListItem) => {
      if (chatItem.chat.type !== 'group' || chatItem.isDraft) {
        return
      }

      closeChatListContextMenu()
      setIsChatListActionLoading(true)
      setChatListActionError('')
      setGroupEditTargetId(null)
      setGroupEditName('')
      setGroupEditDescription('')
      setGroupEditError('')
      setIsGroupEditLoading(true)

      try {
        const group = await chatRepository.getGroupDetails(chatItem.chat.id)
        const canEditGroup = getGroupPermissions(group, currentUser?.id ?? null).canEdit

        if (!canEditGroup) {
          setChatListActionError(mt('page.t079'))
          return
        }

        setGroupEditTargetId(chatItem.chat.id)
        setGroupEditName(group.name)
        setGroupEditDescription(group.description ?? '')
        setGroupEditAvatar(null)
        setGroupEditCurrentAvatarUrl(group.avatarUrl ?? chatItem.avatarUrl)
        setIsGroupEditModalOpen(true)
      } catch (groupEditLoadError) {
        setChatListActionError(groupEditLoadError instanceof Error ? groupEditLoadError.message : mt('page.t080'))
      } finally {
        setIsGroupEditLoading(false)
        setIsChatListActionLoading(false)
      }
    },
    [chatRepository, closeChatListContextMenu, currentUser?.id],
  )

  const handleSubmitGroupEdit = useCallback(async () => {
    const normalizedName = groupEditName.trim()
    if (!groupEditTargetId) {
      return
    }

    if (!normalizedName) {
      setGroupEditError(mt('page.t081'))
      return
    }

    setIsGroupEditSaving(true)
    setGroupEditError('')

    try {
      await chatRepository.updateGroup(groupEditTargetId, {
        name: normalizedName,
        description: groupEditDescription.trim() || null,
      })
      if (groupEditAvatar) {
        await chatRepository.updateGroupAvatar(groupEditTargetId, groupEditAvatar)
      }
      await refreshActiveGroupMembers(groupEditTargetId)

      setIsGroupEditModalOpen(false)
      setGroupEditTargetId(null)
      setGroupEditName('')
      setGroupEditDescription('')
      setGroupEditAvatar(null)
      setGroupEditCurrentAvatarUrl(null)
      await loadChats()
    } catch (groupEditSaveError) {
      setGroupEditError(groupEditSaveError instanceof Error ? groupEditSaveError.message : mt('page.t082'))
    } finally {
      setIsGroupEditSaving(false)
    }
  }, [chatRepository, groupEditAvatar, groupEditDescription, groupEditName, groupEditTargetId, loadChats, refreshActiveGroupMembers])

  const closeGroupEditModal = useCallback(() => {
    setIsGroupEditModalOpen(false)
    setGroupEditTargetId(null)
    setGroupEditName('')
    setGroupEditDescription('')
    setGroupEditAvatar(null)
    setGroupEditCurrentAvatarUrl(null)
    setGroupEditError('')
    setIsGroupEditLoading(false)
    setIsGroupEditSaving(false)
  }, [])

  const updateChatBadgeLocally = useCallback(
    (
      chatId: string,
      nextBadge: {
        unreadCount?: number
        mentionCount?: number
      },
    ) => {
      setChats((prev) =>
        prev.map((item) =>
          item.chat.id === chatId
            ? {
                ...item,
                unread: nextBadge.unreadCount ?? item.unread,
                chat: {
                  ...item.chat,
                  unreadCount: nextBadge.unreadCount ?? item.chat.unreadCount,
                  mentionCount: nextBadge.mentionCount ?? item.chat.mentionCount,
                },
              }
            : item,
        ),
      )
    },
    [],
  )

  const clearChatBadges = useCallback((chatId: string) => {
    updateChatBadgeLocally(chatId, { unreadCount: 0, mentionCount: 0 })
  }, [updateChatBadgeLocally])

  const getChatBadgeState = useCallback((chatId: string) => {
    const targetChat = chatsRef.current.find((item) => item.chat.id === chatId)

    return {
      unreadCount: targetChat?.chat.unreadCount ?? targetChat?.unread ?? 0,
      mentionCount: targetChat?.chat.mentionCount ?? 0,
    }
  }, [])

  const isMessageVisibleInScroller = useCallback((node: HTMLDivElement, scroller: HTMLDivElement) => {
    const viewportTop = scroller.scrollTop
    const viewportBottom = viewportTop + scroller.clientHeight
    const messageTop = node.offsetTop
    const messageBottom = messageTop + node.offsetHeight

    return messageBottom > viewportTop + 4 && messageTop < viewportBottom - 4
  }, [])

  const findNewestVisibleIncomingMessage = useCallback((chatId: string, nextMessages: MessageView[]): MessageView | null => {
    const current = currentUserRef.current
    const scroller = messagesScrollerRef.current

    if (!current) {
      return null
    }

    if (!scroller) {
      for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
        const message = nextMessages[index]
        if (
          message.raw.conversationId === chatId &&
          message.raw.senderId !== current.id &&
          !message.raw.isRead
        ) {
          return message
        }
      }

      return null
    }

    for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
      const message = nextMessages[index]
      if (
        message.raw.conversationId !== chatId ||
        message.raw.senderId === current.id ||
        message.raw.isRead
      ) {
        continue
      }

      const node = messageItemRefs.current[message.raw.id]
      if (node && isMessageVisibleInScroller(node, scroller)) {
        return message
      }
    }

    return null
  }, [isMessageVisibleInScroller])

  const findNewestVisibleMessage = useCallback((chatId: string, nextMessages: MessageView[]): MessageView | null => {
    const scroller = messagesScrollerRef.current

    if (!scroller) {
      for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
        const message = nextMessages[index]
        if (message.raw.conversationId === chatId) {
          return message
        }
      }

      return null
    }

    for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
      const message = nextMessages[index]
      if (message.raw.conversationId !== chatId) {
        continue
      }

      const node = messageItemRefs.current[message.raw.id]
      if (node && isMessageVisibleInScroller(node, scroller)) {
        return message
      }
    }

    return null
  }, [isMessageVisibleInScroller])

  const applyLocalIncomingReadState = useCallback((anchorMessageId: string) => {
    const current = currentUserRef.current
    if (!current) {
      return
    }

    setMessages((prev) => {
      const boundaryIndex = prev.findIndex((message) => message.raw.id === anchorMessageId)
      if (boundaryIndex === -1) {
        return prev
      }

      return prev.map((message, index) =>
        index <= boundaryIndex && message.raw.senderId !== current.id
          ? {
              ...message,
              raw: {
                ...message.raw,
                isRead: true,
              },
            }
          : message,
      )
    })
  }, [])

  const confirmMessagesDelivered = useCallback(
    (rawMessages: ChatMessage[]) => {
      const current = currentUserRef.current
      if (!current) return

      const incomingMessageIds = rawMessages
        .filter((message) => message.senderId !== current.id && message.deliveredCount < 1)
        .map((message) => message.id)

      if (incomingMessageIds.length > 0) {
        void Promise.allSettled(incomingMessageIds.map((messageId) => chatRepository.markAsDelivered(messageId)))
      }
    },
    [chatRepository],
  )

  const rememberChannelViewedAt = useCallback((channelId: string, viewedAt: string) => {
    if (!channelId || !viewedAt) {
      return
    }

    const next = {
      ...channelViewedAtMapRef.current,
      [channelId]: viewedAt,
    }

    channelViewedAtMapRef.current = next
    writeChannelViewedAtMap(next)
  }, [])

  const markChatAnchorAsRead = useCallback(
    async (chatId: string, chatType: ChatType, anchorMessageId: string, anchorMessageCreatedAt: string) => {
      if (chatType !== 'channel' && shouldSkipServerReadReceipt(anchorMessageId)) {
        clearChatBadges(chatId)
        applyLocalIncomingReadState(anchorMessageId)
        return
      }

      const previousAnchorMessageId = lastMarkedReadMessageIdByChatRef.current[chatId] ?? ''

      if (previousAnchorMessageId === anchorMessageId) {
        return
      }

      lastMarkedReadMessageIdByChatRef.current[chatId] = anchorMessageId

      const isSuccess = await (chatType === 'channel'
        ? channelRepository.markPostViewed(anchorMessageId)
        : chatRepository.markAsRead(anchorMessageId))
        .then(() => true)
        .catch(() => false)

      if (!isSuccess) {
        if (lastMarkedReadMessageIdByChatRef.current[chatId] === anchorMessageId) {
          lastMarkedReadMessageIdByChatRef.current[chatId] = previousAnchorMessageId
        }
        return
      }

      if (chatType === 'channel') {
        rememberChannelViewedAt(chatId, anchorMessageCreatedAt)
      }

      const boundaryIndex = messagesRef.current.findIndex((message) => message.raw.id === anchorMessageId)
      const remainingUnread = boundaryIndex < 0
        ? 0
        : messagesRef.current.slice(boundaryIndex + 1).filter(
            (message) => message.raw.senderId !== currentUserRef.current?.id && !message.raw.isRead,
          ).length
      updateChatBadgeLocally(chatId, { unreadCount: remainingUnread, mentionCount: remainingUnread > 0 ? undefined : 0 })
      applyLocalIncomingReadState(anchorMessageId)
    },
    [applyLocalIncomingReadState, channelRepository, chatRepository, clearChatBadges, rememberChannelViewedAt, updateChatBadgeLocally],
  )

  const markVisibleIncomingAsRead = useCallback(
    async (chatId: string, chatType: ChatType, nextMessages: MessageView[]) => {
      const current = currentUserRef.current
      if (!current || nextMessages.length === 0) {
        return
      }

      const { unreadCount, mentionCount } = getChatBadgeState(chatId)
      const unreadVisibleIncomingMessage = findNewestVisibleIncomingMessage(chatId, nextMessages)
      if (!unreadVisibleIncomingMessage && unreadCount <= 0 && mentionCount <= 0) {
        return
      }

      const anchorMessage =
        unreadVisibleIncomingMessage ??
        (unreadCount > 0 || mentionCount > 0 ? findNewestVisibleMessage(chatId, nextMessages) : null)

      if (!anchorMessage) {
        return
      }

      await markChatAnchorAsRead(chatId, chatType, anchorMessage.raw.id, anchorMessage.raw.createdAt)
    },
    [findNewestVisibleIncomingMessage, findNewestVisibleMessage, getChatBadgeState, markChatAnchorAsRead],
  )

  const scheduleVisibleReadSync = useCallback(
    (chatId: string, chatType: ChatType, nextMessages: MessageView[]) => {
      if (pendingReadSyncFrameRef.current !== null) {
        cancelAnimationFrame(pendingReadSyncFrameRef.current)
      }

      pendingReadSyncFrameRef.current = requestAnimationFrame(() => {
        pendingReadSyncFrameRef.current = null
        void markVisibleIncomingAsRead(chatId, chatType, nextMessages)
      })
    },
    [markVisibleIncomingAsRead],
  )

  const updateChatPreview = useCallback(async (rawMessage: ChatMessage) => {
    const preview = await resolveMessageText(rawMessage, cryptoRef.current, { compact: true })
    setChats((prev) => {
      const hasChat = prev.some((item) => item.chat.id === rawMessage.conversationId)
      if (!hasChat) {
        void loadChats({ silent: true })
        return prev
      }

      return prev.map((item) =>
        item.chat.id === rawMessage.conversationId
          ? {
              ...item,
              chat: {
                ...item.chat,
                lastMessage: rawMessage,
                updatedAt: rawMessage.updatedAt,
              },
              subtitle: preview.text,
              time: formatTimeLabel(rawMessage.createdAt),
            }
          : item,
      )
    })
  }, [loadChats])

  const updateChatPreviewForDeletedMessages = useCallback((event: MessageDeletedEvent) => {
    const deletedIds = new Set(event.messageIds)

    if (event.newLastMessage) {
      const nextLast = toChatMessage(event.newLastMessage as unknown as Parameters<typeof toChatMessage>[0])
      void resolveMessageText(nextLast, cryptoRef.current, { compact: true }).then((preview) => {
        setChats((current) =>
          current.map((item) =>
            item.chat.lastMessage && deletedIds.has(item.chat.lastMessage.id)
              ? {
                  ...item,
                  chat: { ...item.chat, lastMessage: nextLast },
                  subtitle: preview.text,
                  time: formatTimeLabel(nextLast.createdAt),
                }
              : item,
          ),
        )
      })
      return
    }

    if (event.isForEveryone) {
      setChats((current) =>
        current.map((item) =>
          item.chat.lastMessage && deletedIds.has(item.chat.lastMessage.id)
            ? {
                ...item,
                chat: { ...item.chat, lastMessage: { ...item.chat.lastMessage, isDeleted: true } },
                subtitle: mt('page.t083'),
              }
            : item,
        ),
      )
      return
    }

    if (chatsRef.current.some((item) => item.chat.lastMessage && deletedIds.has(item.chat.lastMessage.id))) {
      void loadChats()
    }
  }, [loadChats])

  const updateChatPreviewForEditedMessage = useCallback((messageId: string, content: string, isEdited = true) => {
    setChats((prev) => {
      const targets = prev
        .filter((item) => item.chat.lastMessage?.id === messageId)
        .map((item) => {
          const updatedRaw: ChatMessage = {
            ...item.chat.lastMessage!,
            content,
            isEdited,
            editedAt: item.chat.lastMessage?.editedAt ?? new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }

          return resolveMessageText(updatedRaw, cryptoRef.current, { compact: true }).then((preview) => ({
            chatId: item.chat.id,
            updatedRaw,
            previewText: preview.text,
          }))
        })

      if (!targets.length) {
        return prev
      }

      void Promise.all(targets).then((updates) => {
        setChats((current) =>
          current.map((item) => {
            const update = updates.find((candidate) => candidate.chatId === item.chat.id)
            if (!update || item.chat.lastMessage?.id !== messageId) {
              return item
            }

            return {
              ...item,
              chat: {
                ...item.chat,
                lastMessage: update.updatedRaw,
                updatedAt: update.updatedRaw.updatedAt,
              },
              subtitle: update.previewText,
              time: formatTimeLabel(update.updatedRaw.createdAt),
            }
          }),
        )
      })

      return prev
    })
  }, [])

  const clearSelectedMessages = useCallback(() => {
    setSelectedMessages({ ids: [], anchorId: null })
    setMessageActionError('')
    setMessageContextMenu(null)
  }, [])

  const closeForwardModal = useCallback(() => {
    if (forwardMenuCloseTimeoutRef.current !== null) {
      window.clearTimeout(forwardMenuCloseTimeoutRef.current)
      forwardMenuCloseTimeoutRef.current = null
    }
    setIsForwardModalOpen(false)
    setForwardTargetMessageIds(null)
    setForwardChatSearchQuery('')
    setSelectedForwardChatIds([])
  }, [])

  const openForwardModal = useCallback((messageIds?: string[]) => {
    const targetIds = messageIds && messageIds.length > 0 ? messageIds : selectedMessages.ids
    if (targetIds.length === 0) {
      return
    }

    setMessageActionError('')
    setForwardTargetMessageIds(targetIds)
    setForwardChatSearchQuery('')
    setSelectedForwardChatIds([])
    setIsForwardModalOpen(true)
  }, [selectedMessages.ids])

  const closeMessageContextMenu = useCallback(() => {
    setMessageContextMenu(null)
  }, [])

  const handleAddReaction = useCallback(
    async (messageId: string, reaction: string) => {
      if (!currentUser) return
      if (reactionRequestsRef.current.has(messageId)) return
      reactionRequestsRef.current.add(messageId)
      const chatId = activeChatRef.current
      setMessageActionError('')
      const previousReactions = messagesRef.current.find((msg) => msg.raw.id === messageId)?.raw.reactions ?? []
      const isOwnReaction = (item: ChatMessage['reactions'][number]) =>
        item.reacted || item.users.some((user) => user.id === currentUser.id)
      const ownOtherReactions = previousReactions.filter((item) => item.reaction !== reaction && isOwnReaction(item))
      const self = { id: currentUser.id, fullName: currentUser.name, avatar: null }
      const optimisticReactions = previousReactions
        .map((item) => {
          const own = isOwnReaction(item)
          if (item.reaction === reaction) {
            return own ? item : { ...item, count: item.count + 1, reacted: true, users: [...item.users, self] }
          }
          return own
            ? { ...item, count: item.count - 1, reacted: false, users: item.users.filter((user) => user.id !== currentUser.id) }
            : item
        })
        .filter((item) => item.count > 0)
      if (!optimisticReactions.some((item) => item.reaction === reaction)) {
        optimisticReactions.push({ reaction, count: 1, reacted: true, users: [self] })
      }
      const applyReactions = (reactions: ChatMessage['reactions']) =>
        setMessages((prev) =>
          prev.map((msg) => (msg.raw.id === messageId ? { ...msg, raw: { ...msg.raw, reactions } } : msg)),
        )
      applyReactions(optimisticReactions)
      try {
        const isChannel = activeChat?.chat.type === 'channel'
        for (const item of ownOtherReactions) {
          if (isChannel) {
            await channelRepository.removeReaction(messageId, item.reaction)
          } else {
            await chatRepository.removeReaction(messageId, item.reaction)
          }
        }
        const serverReactions = isChannel
          ? await channelRepository.addReaction(messageId, reaction)
          : await chatRepository.addReaction(messageId, reaction)
        if (activeChatRef.current !== chatId) return
        applyReactions(serverReactions)
      } catch {
        if (activeChatRef.current === chatId) {
          applyReactions(previousReactions)
          setMessageActionError(mt('page.t084'))
        }
      } finally {
        reactionRequestsRef.current.delete(messageId)
      }
    },
    [activeChat?.chat.type, channelRepository, chatRepository, currentUser],
  )

  const handleRemoveReaction = useCallback(
    async (messageId: string, reaction: string) => {
      if (!currentUser) return
      if (reactionRequestsRef.current.has(messageId)) return
      reactionRequestsRef.current.add(messageId)
      const chatId = activeChatRef.current
      setMessageActionError('')
      try {
        const serverReactions =
          activeChat?.chat.type === 'channel'
            ? await channelRepository.removeReaction(messageId, reaction)
            : await chatRepository.removeReaction(messageId, reaction)
        if (activeChatRef.current !== chatId) return
        setMessages((prev) =>
          prev.map((msg) => (msg.raw.id === messageId ? { ...msg, raw: { ...msg.raw, reactions: serverReactions } } : msg)),
        )
      } catch {
        if (activeChatRef.current === chatId) setMessageActionError(mt('page.t085'))
      } finally {
        reactionRequestsRef.current.delete(messageId)
      }
    },
    [activeChat?.chat.type, channelRepository, chatRepository, currentUser],
  )

  const toggleMessageSelection = useCallback((messageId: string, additive = false) => {
    setSelectedMessages((prev) => {
      if (!additive) {
        if (prev.ids.length === 1 && prev.ids[0] === messageId) {
          return { ids: [], anchorId: null }
        }

        return { ids: [messageId], anchorId: messageId }
      }

      const exists = prev.ids.includes(messageId)
      const nextIds = exists ? prev.ids.filter((id) => id !== messageId) : [...prev.ids, messageId]
      return {
        ids: nextIds,
        anchorId: nextIds.length === 0 ? null : messageId,
      }
    })
    setMessageActionError('')
  }, [])

  const getMessageById = useCallback(
    (messageId: string) => messages.find((message) => message.raw.id === messageId) ?? null,
    [messages],
  )

  const openMessageContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>, messageId: string) => {
    if (activeChatId && activeChatId.startsWith('smart-agent')) {
      event.preventDefault()
      return
    }
    event.preventDefault()
    event.stopPropagation()
    setMessageActionError('')

    const menuWidth = 220
    const x = Math.max(12, Math.min(event.clientX, window.innerWidth - menuWidth - 12))

    setMessageContextMenu({
      messageId,
      x,
      y: event.clientY,
    })
  }, [activeChatId])

  const scrollToMessageById = useCallback((messageId: string) => {
    const targetNode = messageItemRefs.current[messageId]
    if (targetNode) {
      targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return true
    }

    return false
  }, [])

  const flashSearchMessageHighlight = useCallback((messageId: string) => {
    if (highlightedSearchMessageTimeoutRef.current) {
      clearTimeout(highlightedSearchMessageTimeoutRef.current)
    }

    setHighlightedSearchMessageId(messageId)
    highlightedSearchMessageTimeoutRef.current = setTimeout(() => {
      setHighlightedSearchMessageId((current) => (current === messageId ? null : current))
      highlightedSearchMessageTimeoutRef.current = null
    }, 2200)
  }, [])

  const handleReplyMessageClick = useCallback(
    async (messageId: string) => {
      const navigationId = ++replyNavigationRef.current
      const chatId = activeChatRef.current
      const requestId = historyRequestIdRef.current
      setMessageActionError('')
      if (scrollToMessageById(messageId)) {
        setChatSearchInfo('')
        flashSearchMessageHighlight(messageId)
        return
      }

      const isCurrent = () => replyNavigationRef.current === navigationId &&
        activeChatRef.current === chatId && historyRequestIdRef.current === requestId
      // Use the same paginated, permission-filtered history as normal scrolling.
      while (isCurrent() && hasMoreHistoryRef.current) {
        if (isLoadingOlderMessagesRef.current) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 50))
          continue
        }
        const offset = historyOffsetRef.current
        await loadOlderMessagesRef.current?.()
        if (!isCurrent()) return
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        if (!isCurrent()) return
        if (scrollToMessageById(messageId)) {
          setChatSearchInfo('')
          flashSearchMessageHighlight(messageId)
          return
        }
        if (historyOffsetRef.current === offset) {
          setMessageActionError(mt('page.t086'))
          return
        }
      }
      if (isCurrent()) setMessageActionError(mt('page.t087'))
    },
    [flashSearchMessageHighlight, scrollToMessageById],
  )

  const handleChatSearchResultClick = useCallback(
    (item: ChatSearchResultItem) => {
      const messageId = item.raw.id
      setSelectedChatSearchResultId(messageId)
      setChatSearchError('')

      if (item.chatId !== activeChatRef.current) {
        pendingSearchNavigationRef.current = messageId
        setActiveChatId(item.chatId)
        return
      }

      if (loadedMessageIds.has(messageId) && scrollToMessageById(messageId)) {
        setChatSearchInfo('')
        flashSearchMessageHighlight(messageId)
        return
      }

      setChatSearchInfo(mt('page.t088'))
      void handleReplyMessageClick(messageId)
    },
    [flashSearchMessageHighlight, handleReplyMessageClick, loadedMessageIds, scrollToMessageById],
  )

  useEffect(() => {
    const messageId = pendingSearchNavigationRef.current
    if (!messageId || !loadedMessageIds.has(messageId)) return
    pendingSearchNavigationRef.current = null
    requestAnimationFrame(() => {
      if (scrollToMessageById(messageId)) {
        setChatSearchInfo('')
        flashSearchMessageHighlight(messageId)
      }
    })
  }, [flashSearchMessageHighlight, loadedMessageIds, scrollToMessageById])

  useEffect(() => {
    const messageId = pendingSearchNavigationRef.current
    if (!messageId || !activeChatId || historyLoadedChatIdRef.current !== activeChatId || isLoadingMessages || loadedMessageIds.has(messageId)) return
    pendingSearchNavigationRef.current = null
    void handleReplyMessageClick(messageId)
  }, [activeChatId, handleReplyMessageClick, isLoadingMessages, loadedMessageIds])

  const stepChatSearchResult = useCallback((direction: 1 | -1) => {
    if (chatSearchResults.length === 0) {
      return
    }
    const currentIndex = chatSearchResults.findIndex((item) => item.raw.id === selectedChatSearchResultId)
    const nextIndex = currentIndex < 0
      ? (direction === 1 ? 0 : chatSearchResults.length - 1)
      : (currentIndex + direction + chatSearchResults.length) % chatSearchResults.length
    setIsChatSearchResultsOpen(false)
    handleChatSearchResultClick(chatSearchResults[nextIndex])
  }, [chatSearchResults, handleChatSearchResultClick, selectedChatSearchResultId])

  const handlePinnedMessageClick = useCallback(() => {
    if (!activePinnedMessage) {
      return
    }

    const targetMessageId = activePinnedMessage.messageId
    scrollToMessageById(targetMessageId)

    if (pinnedMessages.length > 1) {
      setActivePinnedIndex((prev) => (prev === pinnedMessages.length - 1 ? 0 : prev + 1))
    }
  }, [activePinnedMessage, pinnedMessages.length, scrollToMessageById])

  const handlePinnedListItemClick = useCallback(
    (messageId: string, index: number) => {
      setIsPinnedMessagesPanelOpen(false)
      setActivePinnedIndex(index)
      scrollToMessageById(messageId)
    },
    [scrollToMessageById],
  )

  const handleMessageLeftClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>, messageId: string) => {
      if (selectedMessages.ids.length === 0) {
        return
      }

      const target = event.target as HTMLElement | null
      if (
        target?.closest(
          'button, a, input, textarea, video, audio, [role="button"], [data-no-message-select="true"]',
        )
      ) {
        return
      }

      toggleMessageSelection(messageId, true)
    },
    [selectedMessages.ids.length, toggleMessageSelection],
  )

  useEffect(() => {
    if (!messageContextMenu) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-message-context-menu="true"], [data-forward-chat-menu="true"]')) {
        return
      }

      setMessageContextMenu(null)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMessageContextMenu(null)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [messageContextMenu])

  useEffect(() => {
    if (!chatListContextMenu) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-chat-list-context-menu="true"]')) {
        return
      }

      setChatListContextMenu(null)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setChatListContextMenu(null)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [chatListContextMenu])

  const removeMessagesFromState = useCallback((messageIds: string[]) => {
    const removed = new Set(messageIds)
    setMessages((prev) =>
      prev
        .filter((message) => !removed.has(message.raw.id))
        .map((message) => {
          if (!message.raw.replyToId || !removed.has(message.raw.replyToId) || !message.raw.replyTo) {
            return message
          }

          return {
            ...message,
            raw: {
              ...message.raw,
              replyTo: {
                ...message.raw.replyTo,
                content: mt('page.t000'),
                type: 'text',
                attachmentUrl: null,
                attachmentType: null,
              },
            },
          }
        }),
    )
    setPinnedMessages((prev) => prev.filter((message) => !removed.has(message.messageId)))
    setResolvedPinnedMessageViews((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([messageId]) => !removed.has(messageId))),
    )
    setSelectedMessages((prev) => ({
      ids: prev.ids.filter((id) => !removed.has(id)),
      anchorId: prev.anchorId && removed.has(prev.anchorId) ? null : prev.anchorId,
    }))
  }, [])

  const loadPinnedMessages = useCallback(async (chatId: string, chatType: ChatType) => {
    try {
      const nextPinnedMessages = await chatRepository.getPinnedMessages(chatId, chatType)
      setPinnedMessages(nextPinnedMessages)
      setResolvedPinnedMessageViews({})
    } catch {
      setPinnedMessages([])
      setResolvedPinnedMessageViews({})
    }
  }, [chatRepository])

  const handleDeleteSelectedMessages = useCallback(async (scope: 'me' | 'everyone' = 'me') => {
    const targetIds = deleteTargetMessageIds ?? selectedMessageViews.map((message) => message.raw.id)
    if (targetIds.length === 0) {
      return
    }

    setIsMessageActionLoading(true)
    setMessageActionError('')

    try {
      if (activeChat?.chat.type === 'channel') {
        await Promise.all(targetIds.map((id) => channelRepository.deletePost(id)))
      } else if (targetIds.length === 1) {
        await chatRepository.deleteMessage(targetIds[0], scope)
      } else {
        await chatRepository.deleteMessages(targetIds, scope)
      }

      removeMessagesFromState(targetIds)
      setIsDeleteConfirmOpen(false)
      setDeleteTargetMessageIds(null)
    } catch (actionError) {
      setMessageActionError(actionError instanceof Error ? actionError.message : mt('page.t089'))
    } finally {
      setIsMessageActionLoading(false)
    }
  }, [activeChat?.chat.type, channelRepository, chatRepository, deleteTargetMessageIds, removeMessagesFromState, selectedMessageViews])

  const toggleForwardChatSelection = useCallback((chatId: string) => {
    setSelectedForwardChatIds((prev) =>
      prev.includes(chatId) ? prev.filter((id) => id !== chatId) : [...prev, chatId],
    )
  }, [])

  const shareableChats = useMemo(() => {
    const query = shareSearchQuery.trim().toLowerCase()
    return chats
      .filter((item) => item.chat.type === 'personal' || item.chat.type === 'group')
      .filter((item) => {
        if (!query) return true
        return item.title.toLowerCase().includes(query) || (item.subtitle && item.subtitle.toLowerCase().includes(query))
      })
  }, [chats, shareSearchQuery])

  const handleShareMeetingLink = useCallback(async () => {
    if (!currentUser || !shareLink || selectedShareChatIds.length === 0) {
      return
    }

    setIsSharingLink(true)
    try {
      const selectedTargets = chats.filter((item) => selectedShareChatIds.includes(item.chat.id))
      const draftUpdates = new Map<string, UnifiedChat>()

      for (const targetChatItem of selectedTargets) {
        let targetChat = targetChatItem.chat
        let targetChatId = targetChatItem.chat.id

        if (targetChatItem.isDraft && targetChatItem.chat.type === 'personal') {
          if (!targetChatItem.chat.peerId) {
            throw new Error(mt('page.t090'))
          }

          const createdConversation = await chatRepository.createConversation(targetChatItem.chat.peerId)
          targetChatId = createdConversation.id
          targetChat = {
            ...targetChatItem.chat,
            id: createdConversation.id,
          }
          draftUpdates.set(targetChatItem.chat.id, targetChat)
        }

        await chatRepository.sendMessage({
          chatId: targetChatId,
          chatType: targetChat.type,
          content: shareLink,
          type: 'text',
          metadata: null,
          attachmentUrl: null,
          attachmentType: null,
          attachmentSize: null,
          replyToId: null,
        })
      }

      if (draftUpdates.size > 0) {
        setChats((prev) =>
          prev.map((item) => {
            const updatedChat = draftUpdates.get(item.chat.id)
            if (!updatedChat) return item
            return {
              ...item,
              isDraft: false,
              chat: updatedChat,
            }
          }),
        )
      }

      setIsShareModalOpen(false)
      setSelectedShareChatIds([])
      setShareSearchQuery('')
      await loadChats()
    } catch (err) {
      console.error('Failed to share meeting link', err)
      alert(err instanceof Error ? err.message : mt('page.t091'))
    } finally {
      setIsSharingLink(false)
    }
  }, [chatRepository, chats, currentUser, loadChats, selectedShareChatIds, shareLink])

  const handleForwardMessagesToSelectedChats = useCallback(async () => {
    if (!currentUser || forwardSourceMessages.length === 0 || selectedForwardChatIds.length === 0) {
      return
    }

    setIsForwardingMessages(true)
    setMessageActionError('')

    try {
      const selectedTargets = chats.filter((item) => selectedForwardChatIds.includes(item.chat.id))
      const resolvedTargetChats: UnifiedChat[] = []
      const draftUpdates = new Map<string, UnifiedChat>()

      for (const targetChatItem of selectedTargets) {
        let targetChat = targetChatItem.chat

        if (targetChatItem.isDraft && targetChatItem.chat.type === 'personal') {
          if (!targetChatItem.chat.peerId) {
            throw new Error(mt('page.t090'))
          }

          const createdConversation = await chatRepository.createConversation(targetChatItem.chat.peerId)
          targetChat = {
            ...targetChatItem.chat,
            id: createdConversation.id,
          }
          draftUpdates.set(targetChatItem.chat.id, targetChat)
        }

        resolvedTargetChats.push(targetChat)
      }

      if (draftUpdates.size > 0) {
        setChats((prev) =>
          prev.map((item) => {
            const updatedChat = draftUpdates.get(item.chat.id)
            if (!updatedChat) {
              return item
            }

            return {
              ...item,
              isDraft: false,
              chat: updatedChat,
            }
          }),
        )
      }

      await forwardChatMessages({
        chatRepository,
        messages: forwardSourceMessages.map((message) => message.raw),
        targetChats: resolvedTargetChats,
        crypto: cryptoRef.current,
      })

      closeForwardModal()
      clearSelectedMessages()
      await loadChats()
    } catch (actionError) {
      setMessageActionError(actionError instanceof Error ? actionError.message : mt('page.t092'))
    } finally {
      setIsForwardingMessages(false)
    }
  }, [chatRepository, chats, clearSelectedMessages, closeForwardModal, currentUser, forwardSourceMessages, loadChats, selectedForwardChatIds])

  const handleEditSelectedMessage = useCallback((messageId?: string) => {
    const targetMessage = messageId ? getMessageById(messageId) : selectedMessage
    if (!targetMessage) {
      return
    }

    if (!isMessageEditable(targetMessage)) {
      setMessageActionError(editWindowExpiredMessage)
      return
    }

    setMessageActionError('')
    setEditTargetMessageId(targetMessage.raw.id)
    setEditDraft(targetMessage.text)
    setIsEditModalOpen(true)
  }, [editWindowExpiredMessage, getMessageById, isMessageEditable, selectedMessage])

  const confirmEditSelectedMessage = useCallback(async () => {
    if (!editTargetMessage) {
      return
    }

    if (!editDraft.trim() || editDraft.trim() === editTargetMessage.text.trim()) {
      setIsEditModalOpen(false)
      setEditTargetMessageId(null)
      return
    }

    if (!isMessageEditable(editTargetMessage)) {
      setMessageActionError(editWindowExpiredMessage)
      return
    }

    setIsMessageActionLoading(true)
    setMessageActionError('')

    try {
      const editedContent = editDraft.trim()
      if (activeChat?.chat.type === 'channel') {
        await channelRepository.editPost(editTargetMessage.raw.id, editedContent)
      } else {
        await chatRepository.editMessage(editTargetMessage.raw.id, editedContent)
      }
      setMessages((prev) =>
        prev.map((message) =>
          message.raw.id === editTargetMessage.raw.id
            ? {
                ...message,
                text: editedContent,
                raw: {
                  ...message.raw,
                  content: editedContent,
                  isEdited: true,
                  editedAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                },
              }
            : message,
        ),
      )
      updateChatPreviewForEditedMessage(editTargetMessage.raw.id, editedContent, true)
      setIsEditModalOpen(false)
      setEditTargetMessageId(null)
    } catch (actionError) {
      setMessageActionError(actionError instanceof Error ? actionError.message : mt('page.t093'))
    } finally {
      setIsMessageActionLoading(false)
    }
  }, [activeChat?.chat.type, channelRepository, chatRepository, editDraft, editTargetMessage, editWindowExpiredMessage, isMessageEditable, updateChatPreviewForEditedMessage])
  const handleTogglePinMessage = useCallback(async (messageId?: string) => {
    const targetMessage = messageId ? getMessageById(messageId) : selectedMessage
    if (!activeChat || !targetMessage) {
      return
    }

    setIsMessageActionLoading(true)
    setMessageActionError('')

    try {
      if (activeChat.chat.type === 'channel') {
        await channelRepository.pinPost(targetMessage.raw.id, !pinnedMessageIds.has(targetMessage.raw.id))
      } else if (pinnedMessageIds.has(targetMessage.raw.id)) {
        await chatRepository.unpinMessage(activeChat.chat.id, activeChat.chat.type, targetMessage.raw.id)
      } else {
        await chatRepository.pinMessage(activeChat.chat.id, activeChat.chat.type, targetMessage.raw.id)
      }

      await loadPinnedMessages(activeChat.chat.id, activeChat.chat.type)
    } catch (actionError) {
      setMessageActionError(actionError instanceof Error ? actionError.message : mt('page.t094'))
    } finally {
      setIsMessageActionLoading(false)
    }
  }, [activeChat, channelRepository, chatRepository, getMessageById, loadPinnedMessages, pinnedMessageIds, selectedMessage])

  const handleUnpinAllPinnedMessages = useCallback(async () => {
    if (!activeChat || pinnedMessages.length === 0) {
      return
    }

    setIsMessageActionLoading(true)
    setMessageActionError('')

    try {
      await Promise.all(
        pinnedMessages.map((pinned) =>
          chatRepository.unpinMessage(activeChat.chat.id, activeChat.chat.type, pinned.messageId),
        ),
      )

      await loadPinnedMessages(activeChat.chat.id, activeChat.chat.type)
      setIsPinnedMessagesPanelOpen(false)
    } catch (actionError) {
      setMessageActionError(actionError instanceof Error ? actionError.message : mt('page.t095'))
    } finally {
      setIsMessageActionLoading(false)
    }
  }, [activeChat, chatRepository, loadPinnedMessages, pinnedMessages])

  const handleLoadMessageViewers = useCallback(async (messageId?: string) => {
    const targetMessage = messageId ? getMessageById(messageId) : selectedMessage
    if (!targetMessage) {
      return
    }

    setIsMessageActionLoading(true)
    setMessageActionError('')

    try {
      const viewers =
        activeChat?.chat.type === 'channel'
          ? await channelRepository.getPostViewers(targetMessage.raw.id)
          : await chatRepository.getMessageViewers(targetMessage.raw.id)
      setMessageViewers(viewers)
      setIsViewersModalOpen(true)
    } catch (actionError) {
      setMessageActionError(actionError instanceof Error ? actionError.message : mt('page.t096'))
    } finally {
      setIsMessageActionLoading(false)
    }
  }, [activeChat?.chat.type, channelRepository, chatRepository, getMessageById, selectedMessage])

  const downloadMessageAsset = useCallback((targetMessage: MessageView | null) => {
    if (!targetMessage) {
      return
    }

    const downloadUrl =
      targetMessage.attachment?.url ?? targetMessage.audioUrl ?? targetMessage.videoUrl ?? targetMessage.mediaUrl ?? targetMessage.raw.attachmentUrl
    if (!downloadUrl) {
      setMessageActionError(mt('page.t097'))
      return
    }

    const link = document.createElement('a')
    link.href = downloadUrl
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.download = targetMessage.attachment?.filename ?? ''
    document.body.appendChild(link)
    link.click()
    link.remove()
  }, [])

  const openGroupSharedAttachment = useCallback((attachment: GroupSharedAttachmentItem) => {
    if (!attachment.url) {
      return
    }

    const link = document.createElement('a')
    link.href = attachment.url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.download = attachment.name || ''
    document.body.appendChild(link)
    link.click()

    link.remove()
  }, [])
  const openImageViewer = useCallback((message: MessageView) => {
    if (!message.mediaUrl) {
      return
    }

    setOpenedImageMessageId(message.raw.id)
  }, [])

  const closeImageViewer = useCallback(() => {
    setOpenedImageMessageId(null)
  }, [])

  const openVideoViewer = useCallback((message: MessageView) => {
    if (!message.videoUrl) {
      return
    }

    setOpenedVideoMessageId(message.raw.id)
  }, [])

  const closeVideoViewer = useCallback(() => {
    setOpenedVideoMessageId(null)
  }, [])

  const showPreviousImage = useCallback(() => {
    setOpenedImageMessageId((current) => {
      if (!current || imageMessages.length <= 1) {
        return current
      }

      const currentIndex = imageMessages.findIndex((message) => message.raw.id === current)
      if (currentIndex < 0) {
        return current
      }

      const nextIndex = currentIndex === 0 ? imageMessages.length - 1 : currentIndex - 1
      return imageMessages[nextIndex]?.raw.id ?? current
    })
  }, [imageMessages])

  const showNextImage = useCallback(() => {
    setOpenedImageMessageId((current) => {
      if (!current || imageMessages.length <= 1) {
        return current
      }

      const currentIndex = imageMessages.findIndex((message) => message.raw.id === current)
      if (currentIndex < 0) {
        return current
      }

      const nextIndex = currentIndex === imageMessages.length - 1 ? 0 : currentIndex + 1
      return imageMessages[nextIndex]?.raw.id ?? current
    })
  }, [imageMessages])

  useEffect(() => {
    if (!openedImageMessage && !openedVideoMessage) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeImageViewer()
        closeVideoViewer()
        return
      }

      if (!openedImageMessage) {
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        showPreviousImage()
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        showNextImage()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeImageViewer, closeVideoViewer, openedImageMessage, openedVideoMessage, showNextImage, showPreviousImage])

  const loadMessages = useCallback(
    async (chatId: string, chatType: ChatType) => {
      if (!currentUserRef.current) {
        return
      }

      const requestId = historyRequestIdRef.current + 1
      historyRequestIdRef.current = requestId
      historyLoadedChatIdRef.current = null
      setIsLoadingMessages(true)
      setIsLoadingOlderMessages(false)
      isLoadingOlderMessagesRef.current = false
      setSendError('')
      setHistoryError('')
      setPendingNewMessagesCount(0)
      setHistoryOffset(0)
      historyOffsetRef.current = 0
      setHasMoreHistory(false)
      hasMoreHistoryRef.current = false
      setIsAtBottom(true)
      isAtBottomRef.current = true
      lastMarkedReadMessageIdByChatRef.current[chatId] = ''

      try {
        let page: { messages: ChatMessage[]; count: number }
        if (chatType === 'channel') {
          const posts = await channelRepository.getPosts(chatId, { limit: CHAT_HISTORY_PAGE_SIZE, offset: 0 })
          page = {
            messages: posts.map(
              (post) =>
                 ({
                  id: post.id,
                  conversationId: post.channelId,
                  senderId: post.authorId,
                  replyToId: post.replyToId,
                  replyTo: post.replyTo ?? null,
                  content: post.content || '',
                  contentHash: '',
                  encryptedKeys: {},
                  type: resolveMessageTypeFromAttachment(post.attachmentType),
                  attachmentUrl: post.attachmentUrl,
                  attachmentType: post.attachmentType,
                  attachmentSize: post.attachmentSize,
                  metadata: post.metadata,
                  isEdited: false,
                  isForwarded: false,
                  originalSenderId: null,
                  isDeleted: false,
                  createdAt: post.createdAt,
                  updatedAt: post.updatedAt,
                  editedAt: null,
                  isEphemeral: false,
                  ttlSeconds: null,
                  expiresAt: null,
                  senderUsername: '',
                  senderFullName: post.authorName,
                  senderAvatar: null,
                  originalSenderFullName: null,
                  readByCount: 0,
                  deliveredCount: 0,
                  isRead: post.isViewed,
                  reactions: post.reactions || [],
                }) as ChatMessage,
            ),
            count: posts.length,
          }
        } else if (chatType === 'group') {
          page = await chatRepository.getGroupMessages(chatId, { limit: CHAT_HISTORY_PAGE_SIZE, offset: 0 })
        } else if (chatId && chatId.startsWith('smart-agent')) {
          const colonIndex = chatId.indexOf(':')
          const sessionId = colonIndex !== -1 ? chatId.slice(colonIndex + 1) : null

          if (sessionId) {
            const detail = await smartAgentRepository.getConversation(sessionId)
            const formatTime = (iso: string) => {
              const d = new Date(iso)
              return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }

            const historyEntries = Array.isArray(detail.conversation_history)
              ? detail.conversation_history
                  .map((entry) => {
                    if (!entry || typeof entry !== 'object') return null
                    const role = typeof (entry as { role?: unknown }).role === 'string'
                      ? (entry as { role: string }).role.trim().toLowerCase()
                      : ''
                    const content = typeof (entry as { content?: unknown }).content === 'string'
                      ? (entry as { content: string }).content
                      : ''
                    const createdAt = typeof (entry as { created_at?: unknown }).created_at === 'string'
                      ? (entry as { created_at: string }).created_at
                      : new Date().toISOString()
                    const tables = Array.isArray((entry as { tables?: unknown }).tables)
                      ? (entry as { tables: any[] }).tables
                      : undefined
                    const feedback = typeof (entry as { feedback?: unknown }).feedback === 'string'
                      ? (entry as { feedback: 'like' | 'dislike' }).feedback
                      : undefined

                    const widget = (entry as any).widget || (entry as any).metadata

                    if (!content.trim() || (role !== 'user' && role !== 'assistant')) {
                      return null
                    }
                    return { role, content, createdAt, tables, feedback, widget }
                  })
                  .filter((entry): entry is Exclude<typeof entry, null> => Boolean(entry))
              : []

            const lastAssistantIndex = (() => {
              for (let index = historyEntries.length - 1; index >= 0; index -= 1) {
                if (historyEntries[index].role === 'assistant') {
                  return index
                }
              }
              return -1
            })()

            const nextMessages = historyEntries.map((entry, index): MessageView => {
              const isUserEntry = entry.role === 'user'
              const rawWidget = entry.widget || (!isUserEntry && index === lastAssistantIndex ? (detail as any).widget : null)
              const metadata = rawWidget ? JSON.stringify(rawWidget) : null

              return {
                raw: toChatMessage({
                  id: `sa-history-${Date.now()}-${index}`,
                  sender_id: isUserEntry ? (currentUserRef.current?.id || 0) : -1,
                  content: entry.content,
                  type: 'text',
                  created_at: entry.createdAt,
                  updated_at: entry.createdAt,
                  conversation_id: 'smart-agent',
                  metadata,
                }),
                from: isUserEntry ? 'me' : 'them',
                text: entry.content,
                time: formatTime(entry.createdAt),
                kind: 'text',
                senderLabel: isUserEntry ? mt('common.you') : 'Smart Agent',
                isCall: false,
                status: 'read',
                unavailable: false,
                tables: entry.tables,
                feedback: entry.feedback || null,
              }
            })

            setSmartAgentSessionId(sessionId)
            setMessages(nextMessages)
            if (Array.isArray(detail.conversation_history)) {
              setSmartAgentHistory(detail.conversation_history)
            }
          } else {
            setSmartAgentSessionId(null)
            setMessages([])
            setSmartAgentHistory([])
          }
          setIsLoadingMessages(false)
          return
        } else {
          page = await chatRepository.getConversationMessages(chatId, { limit: CHAT_HISTORY_PAGE_SIZE, offset: 0 })
        }

        if (historyRequestIdRef.current !== requestId) {
          return
        }

        const ordered = page.messages.slice().reverse()
        const nextMessages = await Promise.all(
          ordered.map((message) => toMessageView(message, currentUserRef.current!.id, cryptoRef.current)),
        )

        if (chatType !== 'channel') {
          confirmMessagesDelivered(page.messages)
        }

        if (historyRequestIdRef.current !== requestId) {
          return
        }

        const nextOffset = page.count
        const nextHasMoreHistory = page.count === CHAT_HISTORY_PAGE_SIZE
        pendingPrependScrollRef.current = null
        pendingMessagesScrollBehaviorRef.current = 'auto'
        setMessages(nextMessages)
        setHistoryOffset(nextOffset)
        historyOffsetRef.current = nextOffset
        setHasMoreHistory(nextHasMoreHistory)
        hasMoreHistoryRef.current = nextHasMoreHistory
        historyLoadedChatIdRef.current = chatId
        if (page.messages[0]) {
          await updateChatPreview(page.messages[0])
        }
      } catch (loadError) {
        if (historyRequestIdRef.current !== requestId) {
          return
        }

        setMessages([])
        setHistoryOffset(0)
        historyOffsetRef.current = 0
        setHasMoreHistory(false)
        hasMoreHistoryRef.current = false
        setSendError(loadError instanceof Error ? loadError.message : mt('page.t098'))
      } finally {
        if (historyRequestIdRef.current === requestId) {
          setIsLoadingMessages(false)
        }
      }
    },
    [channelRepository, chatRepository, confirmMessagesDelivered, updateChatPreview, smartAgentRepository],
  )

  useEffect(() => {
    loadPinnedMessagesRef.current = loadPinnedMessages
  }, [loadPinnedMessages])

  useEffect(() => {
    loadMessagesRef.current = loadMessages
  }, [loadMessages])

  const loadOlderMessages = useCallback(async () => {
    const activeChatIdValue = activeChatRef.current
    const current = currentUserRef.current
    const scroller = messagesScrollerRef.current
    if (
      !activeChatIdValue ||
      !current ||
      !scroller ||
      isLoadingMessages ||
      isLoadingOlderMessagesRef.current ||
      !hasMoreHistoryRef.current
    ) {
      return
    }

    const chat = chatsRef.current.find((item) => item.chat.id === activeChatIdValue)
    if (!chat || chat.isDraft) {
      return
    }

    const requestId = historyRequestIdRef.current
    const previousScrollHeight = scroller.scrollHeight
    const previousScrollTop = scroller.scrollTop

    setIsLoadingOlderMessages(true)
    isLoadingOlderMessagesRef.current = true
    setHistoryError('')

    try {
      let page: { messages: ChatMessage[]; count: number }
      if (chat.chat.type === 'channel') {
        const posts = await channelRepository.getPosts(chat.chat.id, {
          limit: CHAT_HISTORY_PAGE_SIZE,
          offset: historyOffsetRef.current,
        })
        page = {
          messages: posts.map(
            (post) =>
              ({
                id: post.id,
                conversationId: post.channelId,
                senderId: post.authorId,
                replyToId: post.replyToId,
                replyTo: post.replyTo ?? null,
                content: post.content || '',
                contentHash: '',
                encryptedKeys: {},
                type: resolveMessageTypeFromAttachment(post.attachmentType),
                attachmentUrl: post.attachmentUrl,
                attachmentType: post.attachmentType,
                attachmentSize: post.attachmentSize,
                metadata: post.metadata,
                isEdited: false,
                isForwarded: false,
                originalSenderId: null,
                isDeleted: false,
                createdAt: post.createdAt,
                updatedAt: post.updatedAt,
                editedAt: null,
                isEphemeral: false,
                ttlSeconds: null,
                expiresAt: null,
                senderUsername: '',
                senderFullName: post.authorName,
                senderAvatar: null,
                originalSenderFullName: null,
                readByCount: 0,
                deliveredCount: 0,
                isRead: post.isViewed,
                reactions: post.reactions || [],
              }) as ChatMessage,
          ),
          count: posts.length,
        }
      } else if (chat.chat.type === 'group') {
        page = await chatRepository.getGroupMessages(chat.chat.id, {
          limit: CHAT_HISTORY_PAGE_SIZE,
          offset: historyOffsetRef.current,
        })
      } else {
        page = await chatRepository.getConversationMessages(chat.chat.id, {
          limit: CHAT_HISTORY_PAGE_SIZE,
          offset: historyOffsetRef.current,
        })
      }

      if (historyRequestIdRef.current !== requestId || activeChatRef.current !== chat.chat.id) {
        return
      }

      const ordered = page.messages.slice().reverse()
      const olderMessages = await Promise.all(
        ordered.map((message) => toMessageView(message, current.id, cryptoRef.current)),
      )

      if (historyRequestIdRef.current !== requestId || activeChatRef.current !== chat.chat.id) {
        return
      }

      pendingPrependScrollRef.current = {
        scrollHeight: previousScrollHeight,
        scrollTop: previousScrollTop,
      }
      setMessages((prev) => prependMessageViews(prev, olderMessages))

      const nextOffset = historyOffsetRef.current + page.count
      const nextHasMoreHistory = page.count === CHAT_HISTORY_PAGE_SIZE
      setHistoryOffset(nextOffset)
      historyOffsetRef.current = nextOffset
      setHasMoreHistory(nextHasMoreHistory)
      hasMoreHistoryRef.current = nextHasMoreHistory
    } catch (loadError) {
      if (historyRequestIdRef.current !== requestId || activeChatRef.current !== chat.chat.id) {
        return
      }

      setHistoryError(loadError instanceof Error ? loadError.message : mt('page.t099'))
    } finally {
      if (historyRequestIdRef.current === requestId && activeChatRef.current === chat.chat.id) {
        setIsLoadingOlderMessages(false)
        isLoadingOlderMessagesRef.current = false
      }
    }
  }, [channelRepository, chatRepository, isLoadingMessages])

  useEffect(() => {
    loadOlderMessagesRef.current = loadOlderMessages
  }, [loadOlderMessages])

  const handleMessagesScroll = useCallback(() => {
    const scroller = messagesScrollerRef.current
    const chatId = activeChatRef.current

    if (!scroller || !chatId) {
      return
    }

    const nextIsAtBottom = isScrolledNearBottom(scroller)
    if (nextIsAtBottom !== isAtBottomRef.current) {
      isAtBottomRef.current = nextIsAtBottom
      setIsAtBottom(nextIsAtBottom)
    }

    if (nextIsAtBottom) {
      setPendingNewMessagesCount(0)
    }

    if (scroller.scrollTop <= CHAT_HISTORY_TOP_THRESHOLD && hasMoreHistoryRef.current && !isLoadingOlderMessagesRef.current) {
      void loadOlderMessages()
    }

    scheduleVisibleReadSync(chatId, activeChat?.chat.type ?? 'personal', messagesRef.current)
  }, [activeChat?.chat.type, loadOlderMessages, scheduleVisibleReadSync])

  useEffect(() => {
    void loadChats()
  }, [loadChats])

  useEffect(() => {
    if (!activeChatId) {
      historyRequestIdRef.current += 1
      setMessages([])
      setPinnedMessages([])
      setHistoryOffset(0)
      historyOffsetRef.current = 0
      setHasMoreHistory(false)
      hasMoreHistoryRef.current = false
      setIsLoadingOlderMessages(false)
      isLoadingOlderMessagesRef.current = false
      setPendingNewMessagesCount(0)
      setHistoryError('')
      setIsAtBottom(true)
      isAtBottomRef.current = true
      clearSelectedMessages()
      return
    }

    if (activeChatId && activeChatId.startsWith('smart-agent')) {
      clearSelectedMessages()
      setPinnedMessages([])
      setHistoryOffset(0)
      historyOffsetRef.current = 0
      setHasMoreHistory(false)
      hasMoreHistoryRef.current = false
      setIsLoadingOlderMessages(false)
      isLoadingOlderMessagesRef.current = false
      setPendingNewMessagesCount(0)
      setHistoryError('')
      setIsAtBottom(true)
      isAtBottomRef.current = true
      if (smartAgentSkipNextLoadRef.current === activeChatId) {
        smartAgentSkipNextLoadRef.current = null
        return
      }
      void loadMessages(activeChatId, 'personal')
      return
    }

    const selectedChat =
      chatsRef.current.find((item) => item.chat.id === activeChatId) ??
      (activeChat?.chat.type === 'channel' && channelDetails?.isSubscribed ? activeChat : null)

    if (!selectedChat) {
      historyRequestIdRef.current += 1
      setMessages([])
      setPinnedMessages([])
      setHistoryOffset(0)
      historyOffsetRef.current = 0
      setHasMoreHistory(false)
      hasMoreHistoryRef.current = false
      setIsLoadingOlderMessages(false)
      isLoadingOlderMessagesRef.current = false
      setPendingNewMessagesCount(0)
      setHistoryError('')
      setIsAtBottom(true)
      isAtBottomRef.current = true
      clearSelectedMessages()
      return
    }

    if (selectedChat.isDraft) {
      historyRequestIdRef.current += 1
      setMessages([])
      setPinnedMessages([])
      setHistoryOffset(0)
      historyOffsetRef.current = 0
      setHasMoreHistory(false)
      hasMoreHistoryRef.current = false
      setIsLoadingOlderMessages(false)
      isLoadingOlderMessagesRef.current = false
      setPendingNewMessagesCount(0)
      setHistoryError('')
      setIsAtBottom(true)
      isAtBottomRef.current = true
      clearSelectedMessages()
      setIsLoadingMessages(false)
      return
    }

    clearSelectedMessages()
    void loadPinnedMessages(selectedChat.chat.id, selectedChat.chat.type)

    void loadMessages(selectedChat.chat.id, selectedChat.chat.type)
    // We purposely omit 'activeChat' from the dependency array because loadMessages 
    // updates the 'chats' state, which in turn recalculates 'activeChat' via useMemo.
    // Including it would create an infinite loop of message loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeChatId,
    channelDetails?.isSubscribed,
    clearSelectedMessages,
    loadMessages,
    loadPinnedMessages,
  ])

  useEffect(() => {
    if (!activeChatId || activeChat?.isDraft || messages.length === 0) {
      return
    }

    scheduleVisibleReadSync(activeChatId, activeChat?.chat.type ?? 'personal', messages)
  }, [activeChat?.chat.type, activeChat?.isDraft, activeChatId, messages, scheduleVisibleReadSync])

  const clearTypingIndicator = useCallback((chatId: string) => {
    const timeoutId = typingTimeoutsRef.current[chatId]
    if (timeoutId) {
      clearTimeout(timeoutId)
      delete typingTimeoutsRef.current[chatId]
    }

    setTypingByChat((prev) => {
      if (!prev[chatId]) {
        return prev
      }

      const next = { ...prev }
      delete next[chatId]
      return next
    })
  }, [])

  const resolveTypingLabel = useCallback((chatId: string, senderId: number): string => {
    const chat = chatsRef.current.find((item) => item.chat.id === chatId)

    if (chat?.chat.type === 'personal') {
      return chat.title
    }

    const knownSender = [...messagesRef.current].reverse().find((message) => message.raw.senderId === senderId)?.senderLabel
    if (knownSender) {
      return knownSender
    }

    if (chat?.chat.peerId === senderId) {
      return chat.title
    }

    return mt('page.t100')
  }, [])

  const setTypingIndicator = useCallback(
    (chatId: string, senderId: number) => {
      setTypingByChat((prev) => ({
        ...prev,
        [chatId]: {
          senderId,
          label: resolveTypingLabel(chatId, senderId),
        },
      }))

      const existingTimeout = typingTimeoutsRef.current[chatId]
      if (existingTimeout) {
        clearTimeout(existingTimeout)
      }

      typingTimeoutsRef.current[chatId] = setTimeout(() => {
        clearTypingIndicator(chatId)
      }, 3000)
    },
    [clearTypingIndicator, resolveTypingLabel],
  )

  const sendTypingState = useCallback((nextIsTyping: boolean) => {
    const socket = socketRef.current
    const current = currentUserRef.current
    const chatId = activeChatRef.current

    if (!socket || socket.readyState !== WebSocket.OPEN || !current || !chatId) {
      return
    }

    socket.send(
      JSON.stringify({
        type: 'typing',
        from: current.id,
        conversation_id: chatId,
        content: {
          is_typing: nextIsTyping,
        },
        timestamp: Date.now(),
      }),
    )
  }, [])

  const scheduleTypingStop = useCallback(() => {
    if (outgoingTypingStopTimeoutRef.current) {
      clearTimeout(outgoingTypingStopTimeoutRef.current)
    }

    outgoingTypingStopTimeoutRef.current = setTimeout(() => {
      if (outgoingTypingChatRef.current) {
        sendTypingState(false)
        outgoingTypingChatRef.current = null
      }
    }, 1500)
  }, [sendTypingState])

  const adjustMessageComposerHeight = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) {
      return
    }
    el.style.height = '0px'
    el.style.height = `${Math.min(el.scrollHeight, MESSAGE_COMPOSER_MAX_HEIGHT_PX)}px`
  }, [])

  const clearMessageComposerField = useCallback(() => {
    messageDraftRef.current = ''
    const el = messageInputRef.current
    if (el) {
      el.value = ''
      adjustMessageComposerHeight(el)
    }
    setMentionCaretIndex(0)
    setInput('')
  }, [adjustMessageComposerHeight])

  const handleComposerInput = useCallback(
    (event: FormEvent<HTMLTextAreaElement>) => {
      const el = event.currentTarget
      const v = el.value
      const c = el.selectionStart ?? v.length
      messageDraftRef.current = v
      adjustMessageComposerHeight(el)

      const epoch = composerSyncEpochRef.current

      const flushComposerState = () => {
        startTransition(() => {
          if (composerSyncEpochRef.current !== epoch) {
            return
          }
          setInput(v)
          setMentionCaretIndex(c)
        })
      }

      const chatId = activeChatRef.current
      if (!chatId) {
        flushComposerState()
        return
      }

      if (!v.trim()) {
        if (scheduleTypingStopRafRef.current !== null) {
          cancelAnimationFrame(scheduleTypingStopRafRef.current)
          scheduleTypingStopRafRef.current = null
        }

        if (outgoingTypingChatRef.current) {
          sendTypingState(false)
          outgoingTypingChatRef.current = null
        }

        if (outgoingTypingStopTimeoutRef.current) {
          clearTimeout(outgoingTypingStopTimeoutRef.current)
          outgoingTypingStopTimeoutRef.current = null
        }

        flushComposerState()
        return
      }

      if (outgoingTypingChatRef.current !== chatId) {
        sendTypingState(true)
        outgoingTypingChatRef.current = chatId
      }

      if (scheduleTypingStopRafRef.current !== null) {
        cancelAnimationFrame(scheduleTypingStopRafRef.current)
      }
      scheduleTypingStopRafRef.current = requestAnimationFrame(() => {
        scheduleTypingStopRafRef.current = null
        scheduleTypingStop()
      })

      flushComposerState()
    },
    [adjustMessageComposerHeight, scheduleTypingStop, sendTypingState],
  )

  const handleInputTyping = useCallback(
    (nextValue: string) => {
      const chatId = activeChatRef.current
      if (!chatId) {
        return
      }

      if (!nextValue.trim()) {
        if (scheduleTypingStopRafRef.current !== null) {
          cancelAnimationFrame(scheduleTypingStopRafRef.current)
          scheduleTypingStopRafRef.current = null
        }

        if (outgoingTypingChatRef.current) {
          sendTypingState(false)
          outgoingTypingChatRef.current = null
        }

        if (outgoingTypingStopTimeoutRef.current) {
          clearTimeout(outgoingTypingStopTimeoutRef.current)
          outgoingTypingStopTimeoutRef.current = null
        }

        return
      }

      if (outgoingTypingChatRef.current !== chatId) {
        sendTypingState(true)
        outgoingTypingChatRef.current = chatId
      }

      if (scheduleTypingStopRafRef.current !== null) {
        cancelAnimationFrame(scheduleTypingStopRafRef.current)
      }
      scheduleTypingStopRafRef.current = requestAnimationFrame(() => {
        scheduleTypingStopRafRef.current = null
        scheduleTypingStop()
      })
    },
    [scheduleTypingStop, sendTypingState],
  )

  const applyMentionSuggestion = useCallback(
    (member: ChatGroupMember) => {
      const el = messageInputRef.current
      if (!el) {
        return
      }

      const raw = el.value
      const mentionContext = getMentionContext(raw, mentionCaretIndex)
      if (!mentionContext) {
        return
      }

      const mentionName = member.username || `user${member.id}`
      const nextValue = `${raw.slice(0, mentionContext.start)}@${mentionName} ${raw.slice(mentionContext.end)}`
      const nextCaret = mentionContext.start + mentionName.length + 2

      el.value = nextValue
      messageDraftRef.current = nextValue
      adjustMessageComposerHeight(el)
      handleInputTyping(nextValue)
      const epoch = composerSyncEpochRef.current
      startTransition(() => {
        if (composerSyncEpochRef.current !== epoch) {
          return
        }
        setInput(nextValue)
        setMentionCaretIndex(nextCaret)
      })

      requestAnimationFrame(() => {
        el.focus()
        el.setSelectionRange(nextCaret, nextCaret)
      })
    },
    [adjustMessageComposerHeight, handleInputTyping, mentionCaretIndex],
  )

  const insertEmojiIntoInput = useCallback(
    (emoji: string) => {
      const el = messageInputRef.current
      if (!el) {
        return
      }

      const fallbackCaret = Math.min(mentionCaretIndex, el.value.length)
      const selectionStart = el.selectionStart
      const selectionEnd = el.selectionEnd
      const start = typeof selectionStart === 'number' ? selectionStart : fallbackCaret
      const end = typeof selectionEnd === 'number' ? selectionEnd : fallbackCaret
      const nextValue = `${el.value.slice(0, start)}${emoji}${el.value.slice(end)}`
      const nextCaret = start + emoji.length

      el.value = nextValue
      messageDraftRef.current = nextValue
      adjustMessageComposerHeight(el)
      handleInputTyping(nextValue)
      const epoch = composerSyncEpochRef.current
      startTransition(() => {
        if (composerSyncEpochRef.current !== epoch) {
          return
        }
        setInput(nextValue)
        setMentionCaretIndex(nextCaret)
      })

      requestAnimationFrame(() => {
        el.focus()
        el.setSelectionRange(nextCaret, nextCaret)
      })
    },
    [adjustMessageComposerHeight, handleInputTyping, mentionCaretIndex],
  )

  const stopOutgoingTyping = useCallback(() => {
    if (outgoingTypingStopTimeoutRef.current) {
      clearTimeout(outgoingTypingStopTimeoutRef.current)
      outgoingTypingStopTimeoutRef.current = null
    }

    if (outgoingTypingChatRef.current) {
      sendTypingState(false)
      outgoingTypingChatRef.current = null
    }
  }, [sendTypingState])

  const requestSocketReconnect = useCallback((immediate = false) => {
    if (socketReconnectTimerRef.current) {
      clearTimeout(socketReconnectTimerRef.current)
      socketReconnectTimerRef.current = null
    }

    const runReconnect = () => {
      socketReconnectTimerRef.current = null
      setSocketReconnectNonce((prev) => prev + 1)
    }

    if (immediate) {
      socketReconnectAttemptsRef.current = 0
      runReconnect()
      return
    }

    socketReconnectAttemptsRef.current += 1
    const delayIndex = Math.min(Math.max(0, socketReconnectAttemptsRef.current - 1), SOCKET_RECONNECT_DELAYS_MS.length - 1)
    const baseDelayMs = SOCKET_RECONNECT_DELAYS_MS[delayIndex]
    const delayMs = Math.round(baseDelayMs * (0.8 + Math.random() * 0.4))
    socketReconnectTimerRef.current = setTimeout(runReconnect, delayMs)
  }, [])

  useEffect(() => {
    const recoverSocketIfNeeded = () => {
      const socket = socketRef.current
      const isAlive = socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)

      if (isAlive) {
        return
      }

      requestSocketReconnect(true)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        recoverSocketIfNeeded()
      }
    }

    window.addEventListener('online', recoverSocketIfNeeded)
    window.addEventListener('focus', recoverSocketIfNeeded)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('online', recoverSocketIfNeeded)
      window.removeEventListener('focus', recoverSocketIfNeeded)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [requestSocketReconnect])

  const currentUserId = currentUser?.id ?? null

  useEffect(() => {
    const accessToken = sessionStore.getTokens()?.accessToken

    if (!accessToken || currentUserId === null) {
      return
    }

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const webDeviceId = webDeviceStore.getOrCreateCurrentDeviceId()
    const socketQuery = new URLSearchParams({
      token: accessToken,
    })

    if (webDeviceId) {
      socketQuery.set('web_device_id', webDeviceId)
    }

    const socket = new WebSocket(`${protocol}://${window.location.host}/api/v1/ws?${socketQuery.toString()}`)
    socketRef.current = socket
    let disposed = false
    let syncReceivedMessages = false

    const isReconnect = hasSocketConnectedOnceRef.current
    const finishSync = () => {
      if (!syncReceivedMessages && !isReconnect) return
      syncReceivedMessages = false
      void loadChats({ silent: true })
      const activeId = activeChatRef.current
      const activeType = chatsRef.current.find((item) => item.chat.id === activeId)?.chat.type
      if (activeId && activeType) void loadMessagesRef.current?.(activeId, activeType)
    }

    const applySyncBatch = async (batch: { messages?: unknown[]; last_sequence?: number; has_more?: boolean }, parsedMessages?: ChatMessage[]) => {
      const rawMessages = parsedMessages ?? (Array.isArray(batch.messages) ? batch.messages : []).map((message) =>
        toChatMessage(message as Parameters<typeof toChatMessage>[0]),
      )
      if (rawMessages.length > 0) syncReceivedMessages = true
      const current = currentUserRef.current
      if (current && rawMessages.length > 0) {
        const activeMessages = rawMessages.filter((message) => message.conversationId === activeChatRef.current)
        if (activeMessages.length > 0) {
          const views = await Promise.all(activeMessages.map((message) => toMessageView(message, current.id, cryptoRef.current)))
          setMessages((previous) => appendMessageViews(previous, views).sort((left, right) => {
            const sequenceDelta = (left.raw.sequenceNumber ?? 0) - (right.raw.sequenceNumber ?? 0)
            return sequenceDelta || new Date(left.raw.createdAt).getTime() - new Date(right.raw.createdAt).getTime()
          }))
        }
      }
      const lastSequence = typeof batch.last_sequence === 'number' ? batch.last_sequence : readMessageSyncCursor(webDeviceId) ?? 0
      writeMessageSyncCursor(webDeviceId, lastSequence)
      return { lastSequence, hasMore: batch.has_more === true }
    }

    const syncViaHttp = async () => {
      let cursor = readMessageSyncCursor(webDeviceId)
      for (let page = 0; page < 100 && !disposed; page += 1) {
        const result = await chatRepository.syncMessages({ deviceId: webDeviceId, afterSequence: cursor ?? undefined, limit: 100 })
        const applied = await applySyncBatch({ last_sequence: result.lastSequence, has_more: result.hasMore }, result.messages)
        cursor = applied.lastSequence
        if (!applied.hasMore) break
      }
      if (cursor !== null) {
        await chatRepository.confirmSyncPosition({ deviceId: webDeviceId, sequence: cursor })
      }
      finishSync()
    }

    socket.onopen = () => {
      if (disposed) {
        socket.close()
        return
      }

      socketReconnectAttemptsRef.current = 0
      if (socketReconnectTimerRef.current) {
        clearTimeout(socketReconnectTimerRef.current)
        socketReconnectTimerRef.current = null
      }
      hasSocketConnectedOnceRef.current = true
      const storedCursor = readMessageSyncCursor(webDeviceId)
      socket.send(JSON.stringify({
        type: 'sync_request',
        device_id: webDeviceId,
        ...(storedCursor !== null ? { last_sequence: storedCursor } : {}),
        sync_limit: 100,
      }))
    }

    socket.onerror = () => {
      // In case of connection error (potentially 401), try to refresh session
      if (socketReconnectAttemptsRef.current === 0) {
        void refreshSessionWithLock(sessionStore).catch(() => undefined)
      }
    }

    socket.onmessage = (event) => {
      void (async () => {
        try {
          const payload = JSON.parse(event.data) as {
            type?: string
            content?: unknown
            message_id?: string
            from?: number
            conversation_id?: string
          }

          console.log('[Messenger WS] Received payload:', payload)

          if (payload.type === 'sync_response' && typeof payload.content === 'object' && payload.content) {
            const applied = await applySyncBatch(payload.content as { messages?: unknown[]; last_sequence?: number; has_more?: boolean })
            if (applied.hasMore && socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'sync_request', device_id: webDeviceId, last_sequence: applied.lastSequence, sync_limit: 100 }))
            } else {
              void chatRepository.confirmSyncPosition({ deviceId: webDeviceId, sequence: applied.lastSequence }).catch(() => undefined)
              finishSync()
            }
            return
          }

          if (payload.type === 'sync_error') {
            void syncViaHttp().catch(() => requestSocketReconnect())
            return
          }

          if (shouldReloadMessengerChatList(payload.type)) {
            console.log('[Messenger WS] Triggering loadChats from direct WS handler for event type:', payload.type)
            void loadChats({ silent: true })
          }

          if (payload.type === 'initial_online_list') {
            const nextOnlineUserIds = new Set<number>(
              (Array.isArray(payload.content) ? payload.content : []).filter((value): value is number => typeof value === 'number'),
            )
            setOnlineUserIds(nextOnlineUserIds)
            setChats((prev) =>
              prev.map((item) => ({
                ...item,
                online: item.chat.peerId ? nextOnlineUserIds.has(item.chat.peerId) : false,
              })),
            )
            return
          }

          if (payload.type === 'user_status') {
            const userStatus =
              typeof payload.content === 'object' && payload.content ? (payload.content as any) : null
            const userId =
              typeof userStatus?.user_id === 'number' ? userStatus.user_id : typeof payload.from === 'number' ? payload.from : null
            const nextStatus = userStatus?.status
            const lastSeenAt = userStatus?.last_seen_at

            if (userId !== null && (nextStatus === 'online' || nextStatus === 'offline')) {
              setOnlineUserIds((prev) => {
                const next = new Set(prev)
                if (nextStatus === 'online') {
                  next.add(userId)
                } else {
                  next.delete(userId)
                }
                return next
              })
              setChats((prev) =>
                prev.map((item) =>
                  item.chat.peerId === userId
                    ? {
                        ...item,
                        online: nextStatus === 'online',
                        chat: {
                          ...item.chat,
                          lastSeenAt: nextStatus === 'offline' && lastSeenAt ? lastSeenAt : item.chat.lastSeenAt,
                        },
                      }
                    : item,
                ),
              )
            }
            return
          }

          if (payload.type === 'read_receipt' && payload.message_id) {
            const receipt = typeof payload.content === 'object' && payload.content
              ? payload.content as { is_read?: boolean; read_by_count?: number }
              : {}
            setMessages((prev) => prev.map((message) => message.raw.id === payload.message_id
              ? {
                  ...message,
                  status: receipt.is_read === false ? message.status : 'read',
                  raw: {
                    ...message.raw,
                    isRead: receipt.is_read ?? true,
                    readByCount: receipt.read_by_count ?? message.raw.readByCount,
                  },
                }
              : message))
            return
          }

          if (payload.type === 'delivery_receipt' && payload.message_id) {
            const receipt = typeof payload.content === 'object' && payload.content
              ? payload.content as { delivered_count?: number }
              : {}
            if (typeof receipt.delivered_count !== 'number') return
            const deliveredCount = receipt.delivered_count
            setMessages((prev) => prev.map((message) => message.raw.id === payload.message_id
              ? {
                  ...message,
                  status: message.raw.isRead ? 'read' : deliveredCount > 0 ? 'delivered' : 'sent',
                  raw: { ...message.raw, deliveredCount },
                }
              : message))
            return
          }

          if (payload.type === 'unread_count_updated' && payload.conversation_id) {
            const unread = typeof payload.content === 'object' && payload.content
              ? (payload.content as { unread_count?: unknown }).unread_count
              : undefined
            if (typeof unread === 'number') {
              updateChatBadgeLocally(payload.conversation_id, { unreadCount: Math.max(0, unread) })
            }
            return
          }

          if (
            payload.type === 'typing' &&
            payload.conversation_id &&
            typeof payload.from === 'number' &&
            payload.from !== currentUserRef.current?.id &&
            typeof payload.content === 'object' &&
            payload.content
          ) {
            const typingContent = payload.content as { is_typing?: boolean }

            if (typingContent.is_typing) {
              setTypingIndicator(payload.conversation_id, payload.from)
            } else {
              clearTypingIndicator(payload.conversation_id)
            }
            return
          }

          const deletedEvent = parseMessageDeletedEvent(payload)
          if (deletedEvent) {
            if (deletedEvent.isForEveryone) {
              const deletedIds = new Set(deletedEvent.messageIds)
              setMessages((prev) =>
                prev.map((message) => {
                  if (deletedIds.has(message.raw.id)) {
                    return {
                      ...message,
                      text: mt('page.t083'),
                      raw: {
                        ...message.raw,
                        isDeleted: true,
                      },
                    }
                  }

                  if (message.raw.replyToId && deletedIds.has(message.raw.replyToId) && message.raw.replyTo) {
                    return {
                      ...message,
                      raw: {
                        ...message.raw,
                        replyTo: {
                          ...message.raw.replyTo,
                          content: mt('page.t000'),
                          type: 'text',
                          attachmentUrl: null,
                          attachmentType: null,
                        },
                      },
                    }
                  }

                  return message
                }),
              )
              setSelectedMessages((prev) => ({
                ids: prev.ids.filter((id) => !deletedIds.has(id)),
                anchorId: prev.anchorId && deletedIds.has(prev.anchorId) ? null : prev.anchorId,
              }))
            } else {
              removeMessagesFromState(deletedEvent.messageIds)
            }
            updateChatPreviewForDeletedMessages(deletedEvent)
            return
          }

          if (payload.type === 'message_edited' && typeof payload.content === 'object' && payload.content) {
            const edited = payload.content as { id?: string; content?: string; is_edited?: boolean; edited_at?: string | null }

            if (edited.id && typeof edited.content === 'string') {
              const editedContent = edited.content
              setMessages((prev) => {
                void Promise.all(
                  prev.map(async (message) => {
                    if (message.raw.id !== edited.id) {
                      return message
                    }

                    const updatedRaw: ChatMessage = {
                      ...message.raw,
                      content: editedContent,
                      isEdited: edited.is_edited ?? true,
                      editedAt: edited.edited_at ?? new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    }
                    const resolved = await resolveMessageText(updatedRaw, cryptoRef.current)

                    return {
                      ...message,
                      text: resolved.text,
                      unavailable: resolved.unavailable,
                      raw: updatedRaw,
                    }
                  }),
                ).then((next) => {
                  setMessages(next)
                })

                return prev
              })
              updateChatPreviewForEditedMessage(edited.id, editedContent, edited.is_edited ?? true)
            }
            return
          }

          if (payload.type === 'new_message' && payload.content && typeof payload.content === 'object') {
            const payloadContent = payload.content as Parameters<typeof toChatMessage>[0] & { is_mention?: boolean }
            const rawMessage = toChatMessage(payloadContent)
            const current = currentUserRef.current
            const isMention = Boolean(payloadContent.is_mention ?? (payload as { is_mention?: boolean }).is_mention)

            if (!current) {
              return
            }

            const messageView = await toMessageView(rawMessage, current.id, cryptoRef.current)
            if (rawMessage.senderId !== current.id) {
              confirmMessagesDelivered([rawMessage])
            }
            clearTypingIndicator(rawMessage.conversationId)
            await updateChatPreview(rawMessage)

            setChats((prev) =>
              prev.map((item) =>
                item.chat.id === rawMessage.conversationId
                  ? {
                      ...item,
                      unread:
                        activeChatRef.current === item.chat.id && isAtBottomRef.current
                          ? 0
                          : rawMessage.senderId === current.id
                            ? item.unread
                            : item.unread + 1,
                      chat: {
                        ...item.chat,
                        unreadCount:
                          activeChatRef.current === item.chat.id && isAtBottomRef.current
                            ? 0
                            : rawMessage.senderId === current.id
                              ? item.chat.unreadCount
                              : item.chat.unreadCount + 1,
                        mentionCount:
                          activeChatRef.current === item.chat.id && isAtBottomRef.current
                            ? 0
                            : rawMessage.senderId === current.id
                              ? item.chat.mentionCount
                              : item.chat.mentionCount + (isMention ? 1 : 0),
                      },
                    }
                  : item,
              ),
            )

            if (activeChatRef.current === rawMessage.conversationId) {
              const shouldStickToBottom = isAtBottomRef.current
              if (shouldStickToBottom) {
                stickChatToBottom(rawMessage.senderId === current.id ? 'auto' : 'smooth')
              }

              setMessages((prev) => appendMessageViews(prev, [messageView]))

              if (rawMessage.senderId !== current.id) {
                if (shouldStickToBottom) {
                  setPendingNewMessagesCount(0)
                } else {
                  setPendingNewMessagesCount((prev) => prev + 1)
                }
              }
            }
          }

          if (payload.type === 'new_channel_post' && payload.content && typeof payload.content === 'object') {
            const socketData = payload.content as ChannelPostViewDto & { payload?: ChannelPostViewDto }
            const post = socketData.payload ?? socketData
            
            const current = currentUserRef.current
            if (!current) return

            // If it's our own post, we already faked it in sendChatPayload
            // or we might want to prioritize the server's version for ID/timestamp
            // We use appendMessageViews which deduplicates by ID.

            const rawMessage: ChatMessage = {
              id: post.id,
              conversationId: post.channel_id,
              senderId: post.author_id,
              replyToId: post.reply_to_id ?? null,
              replyTo: post.reply_to ? {
                id: post.reply_to.id,
                senderId: post.reply_to.author_id,
                senderFullName: post.reply_to.author_name ?? '',
                content: post.reply_to.content ?? '',
                type: post.reply_to.attachment_type ? 'file' : 'text',
                attachmentUrl: post.reply_to.attachment_url ?? null,
                attachmentType: post.reply_to.attachment_type ?? null,
              } : null,
              content: post.content || '',
              contentHash: '',
              encryptedKeys: {},
              type: resolveMessageTypeFromAttachment(post.attachment_type || null),
              attachmentUrl: post.attachment_url || null,
              attachmentType: post.attachment_type || null,
              attachmentSize: post.attachment_size || null,
              metadata: post.metadata || null,
              isEdited: false,
              isForwarded: false,
              originalSenderId: null,
              isDeleted: false,
              createdAt: post.created_at,
              updatedAt: post.updated_at,
              editedAt: null,
              isEphemeral: false,
              ttlSeconds: null,
              expiresAt: null,
              senderUsername: '',
              senderFullName: post.author_name,
              senderAvatar: post.author_avatar || null,
              originalSenderFullName: null,
              readByCount: 0,
              deliveredCount: 0,
              isRead: post.is_viewed,
              reactions: (post.reactions ?? []).map((r) => ({
                reaction: r.reaction,
                count: r.count,
                users: (r.users ?? []).map((u) => ({
                  id: u.id,
                  fullName: u.full_name,
                  avatar: normalizeBackendAssetUrl(u.avatar) ?? u.avatar ?? null,
                })),
                reacted: r.reacted,
              })),
            }

             const messageView = await toMessageView(rawMessage, current.id, cryptoRef.current)

            // Update myChannels state
            setMyChannels((prev) =>
              prev.map((ch) =>
                ch.id === post.channel_id ? { ...ch, lastPost: toChannelPost(post), updatedAt: post.created_at } : ch
              )
            )

            setChats((prev) =>
              prev.map((item) =>
                item.chat.id === post.channel_id
                  ? {
                      ...item,
                      unread:
                        activeChatRef.current === item.chat.id && isAtBottomRef.current
                          ? 0
                          : post.author_id === current.id
                            ? item.unread
                            : item.unread + 1,
                      chat: {
                        ...item.chat,
                        unreadCount:
                          activeChatRef.current === item.chat.id && isAtBottomRef.current
                            ? 0
                            : post.author_id === current.id
                              ? item.chat.unreadCount
                              : item.chat.unreadCount + 1,
                      },
                    }
                  : item,
              ),
            )

            // Update unified chats list
            await updateChatPreview(rawMessage)

            if (activeChatRef.current === post.channel_id) {
              const shouldStickToBottom = isAtBottomRef.current
              if (shouldStickToBottom) {
                stickChatToBottom(post.author_id === current.id ? 'auto' : 'smooth')
              }
              setMessages((prev) => appendMessageViews(prev, [messageView]))
              if (post.author_id !== current.id) {
                if (shouldStickToBottom) {
                  setPendingNewMessagesCount(0)
                } else {
                  setPendingNewMessagesCount((prev) => prev + 1)
                }
              }
            }
          }

          // Реакции: полностью заменяем локальный массив реакций данными с сервера
          if (payload.type === 'message_reactions_updated' && typeof payload.content === 'object' && payload.content) {
            const reactionUpdate = payload.content as {
              message_id?: string
              reactions?: Array<{
                reaction: string
                count: number
                users: Array<{ id: number; full_name: string; avatar?: string | null }>
                reacted: boolean
              }>
            }

            if (reactionUpdate.message_id && Array.isArray(reactionUpdate.reactions) && !reactionRequestsRef.current.has(reactionUpdate.message_id)) {
              const updatedReactions = reactionUpdate.reactions.map((r) => ({
                reaction: r.reaction,
                count: r.count,
                users: (r.users ?? []).map((u) => ({
                  id: u.id,
                  fullName: u.full_name,
                  avatar: u.avatar ?? null,
                })),
                reacted: r.reacted,
              }))

              setMessages((prev) =>
                prev.map((msg) =>
                  msg.raw.id === reactionUpdate.message_id
                    ? { ...msg, raw: { ...msg.raw, reactions: updatedReactions } }
                    : msg,
                ),
              )
            }
            return
          }

          if (payload.type === 'pinned_messages_updated' && payload.conversation_id) {
            const chatId = payload.conversation_id
            const chatContent = typeof payload.content === 'object' && payload.content ? (payload.content as any) : null
            const chatType = chatContent?.chat_type

            if (activeChatRef.current === chatId && chatType) {
              void loadPinnedMessagesRef.current?.(chatId, chatType)
            }
            return
          }
        } catch {
          return
        }
      })()
    }

    socket.onclose = (event) => {
      if (disposed) {
        return
      }

      const reason = (event.reason ?? '').toLowerCase()
      const authLikeCode = [1008, 4001, 4003, 4401, 4403].includes(event.code)
      const authLikeReason =
        reason.includes('unauthor') || reason.includes('token') || reason.includes('session') || reason.includes('forbidden')

      if (authLikeCode || authLikeReason) {
        dispatchAuthSessionExpired({
          reason: 'device_rotation',
          message: mt('page.t101'),
        })
        return
      }

      requestSocketReconnect(document.visibilityState === 'visible')
    }

    return () => {
      disposed = true
      if (socketRef.current === socket) {
        socketRef.current = null
      }
      socket.onmessage = null
      socket.onerror = null
      socket.onclose = null

      if (socket.readyState === WebSocket.OPEN) {
        socket.close()
      }
    }
  }, [
    chatRepository,
    clearTypingIndicator,
    confirmMessagesDelivered,
    currentUserId,
    loadChats,
    removeMessagesFromState,
    requestSocketReconnect,
    sessionStore,
    setTypingIndicator,
    socketReconnectNonce,
    updateChatPreview,
    updateChatPreviewForDeletedMessages,
    updateChatPreviewForEditedMessage,
    updateChatBadgeLocally,
    stickChatToBottom,
    webDeviceStore,
  ])

  useEffect(() => {
    return () => {
      if (socketReconnectTimerRef.current) {
        clearTimeout(socketReconnectTimerRef.current)
        socketReconnectTimerRef.current = null
      }
      if (scheduleTypingStopRafRef.current !== null) {
        cancelAnimationFrame(scheduleTypingStopRafRef.current)
        scheduleTypingStopRafRef.current = null
      }
    }
  }, [])

  useLayoutEffect(() => {
    composerSyncEpochRef.current += 1
    messageDraftRef.current = ''
    setInput('')
    setMentionCaretIndex(0)
    const el = messageInputRef.current
    if (el) {
      el.value = ''
      adjustMessageComposerHeight(el)
    }
  }, [activeChatId, adjustMessageComposerHeight])

  useEffect(() => {
    stopOutgoingTyping()
  }, [activeChatId, stopOutgoingTyping])

  useEffect(() => {
    setIsEmojiPickerOpen(false)
  }, [activeChatId, isRecordingAnyMedia])

  useEffect(() => {
    if (activeMentionContext) {
      setIsEmojiPickerOpen(false)
    }
  }, [activeMentionContext])

  const sendChatPayload = useCallback(async (payload: { 
    content: string; 
    type: MessageType; 
    clearInput?: boolean; 
    metadata?: string | null;
    attachmentUrl?: string | null;
    attachmentType?: string | null;
    attachmentSize?: number | null;
    replyToId?: string | null;
  }) => {
    if (!activeChat || !currentUser || isSending) {
      return
    }

    setIsSending(true)
    setSendError('')

    try {
      let targetChatId = activeChat.chat.id
      if (activeChat.isDraft) {
        if (!activeChat.chat.peerId) {
          throw new Error(mt('page.t102'))
        }

        const createdConversation = await chatRepository.createConversation(activeChat.chat.peerId)
        targetChatId = createdConversation.id
        setActiveChatId(createdConversation.id)
        setChats((prev) =>
          prev.map((item) =>
            item.chat.id === activeChat.chat.id
              ? {
                  ...item,
                  isDraft: false,
                  chat: {
                    ...item.chat,
                    id: createdConversation.id,
                  },
                }
              : item,
          ),
        )
      }

      if (activeChat.chat.type === 'channel') {
        const sent = await channelRepository.createPost({
          channelId: targetChatId,
          content: payload.attachmentUrl ? payload.content : (payload.type === 'text' ? payload.content : undefined),
          attachmentUrl: payload.attachmentUrl || (payload.type !== 'text' ? payload.content : undefined),
          attachmentType: payload.attachmentType || (payload.type !== 'text' ? payload.type : undefined),
          attachmentSize: payload.attachmentSize || undefined,
          metadata: payload.metadata ?? null,
          replyToId: payload.replyToId ?? replyTarget?.id ?? null,
        })

        // Fake the message result for UI update if needed, or better, use the post data
        const fakeSent: ChatMessage = {
          id: sent.id,
          conversationId: targetChatId,
          senderId: currentUser.id,
          replyToId: sent.replyToId,
          replyTo: sent.replyTo,
          content: sent.content || '',
          contentHash: '',
          encryptedKeys: {},
          type: resolveMessageTypeFromAttachment(sent.attachmentType),
          attachmentUrl: sent.attachmentUrl,
          attachmentType: sent.attachmentType,
          attachmentSize: sent.attachmentSize,
          metadata: sent.metadata,
          isEdited: false,
          isForwarded: false,
          originalSenderId: null,
          isDeleted: false,
          createdAt: sent.createdAt,
          updatedAt: sent.updatedAt,
          editedAt: null,
          isEphemeral: false,
          ttlSeconds: null,
          expiresAt: null,
          senderUsername: '',
          senderFullName: currentUser.name,
          senderAvatar: null,
          originalSenderFullName: null,
          readByCount: 0,
          deliveredCount: 0,
          isRead: true,
          reactions: [],
        }

        stopOutgoingTyping()
        if (payload.clearInput) {
          clearMessageComposerField()
        }
        setReplyTarget(null)

        const view = await toMessageView(fakeSent, currentUser.id, cryptoRef.current)
        stickChatToBottom('auto')
        setMessages((prev) => appendMessageViews(prev, [view]))
        await updateChatPreview(fakeSent)
        playOutgoingMessageSound()
        setIsSending(false)
        return
      }

      const sent = await chatRepository.sendMessage({
        chatId: targetChatId,
        chatType: activeChat.chat.type,
        content: payload.content,
        type: payload.type,
        metadata: payload.metadata ?? null,
        attachmentUrl: payload.attachmentUrl,
        attachmentType: payload.attachmentType,
        attachmentSize: payload.attachmentSize,
        replyToId: payload.replyToId ?? replyTarget?.id ?? null,
      })

      stopOutgoingTyping()
      clearTypingIndicator(targetChatId)
      const nextMessage = await toMessageView(sent, currentUser.id, cryptoState)
      stickChatToBottom('auto')
      setMessages((prev) => appendMessageViews(prev, [nextMessage]))
      if (payload.clearInput ?? false) {
        clearMessageComposerField()
      }
      setReplyTarget(null)
      await updateChatPreview(sent)
      clearChatBadges(targetChatId)
      playOutgoingMessageSound()
    } catch (sendMessageError) {
      setSendError(sendMessageError instanceof Error ? sendMessageError.message : mt('page.t103'))
    } finally {
      setIsSending(false)
    }
  }, [activeChat, channelRepository, chatRepository, clearChatBadges, clearMessageComposerField, clearTypingIndicator, cryptoState, currentUser, isSending, replyTarget, stopOutgoingTyping, stickChatToBottom, updateChatPreview])


  const loadSmartAgentConversations = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setIsLoadingSmartAgentConversations(true)
    }
    setError('')
    try {
      const list = await smartAgentRepository.listConversations()
      const sorted = [...list].sort((a, b) => {
        const timeA = new Date(a.updated_at || a.created_at || 0).getTime()
        const timeB = new Date(b.updated_at || b.created_at || 0).getTime()
        return timeB - timeA
      })
      setSmartAgentConversations(sorted)
    } catch (err) {
      setError(err instanceof Error ? err.message : mt('page.t104'))
    } finally {
      if (showLoading) {
        setIsLoadingSmartAgentConversations(false)
      }
    }
  }, [smartAgentRepository, setError])

  const handleRenameSmartAgentConversation = useCallback(async (convId: string, newName: string) => {
    try {
      await smartAgentRepository.renameConversation(convId, newName)
      void loadSmartAgentConversations(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : mt('page.t105'))
    }
  }, [smartAgentRepository, loadSmartAgentConversations])

  const handleDeleteSmartAgentConversation = useCallback(async (convId: string) => {
    try {
      await smartAgentRepository.deleteConversation(convId)
      const colonIndex = activeChatId ? activeChatId.indexOf(':') : -1
      const currentSessionId = colonIndex !== -1 ? activeChatId!.slice(colonIndex + 1) : null
      if (currentSessionId === convId) {
        setActiveChatId('smart-agent')
        setSmartAgentSessionId(null)
        setMessages([])
        setSmartAgentHistory([])
      }
      void loadSmartAgentConversations(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : mt('page.t106'))
    }
  }, [smartAgentRepository, activeChatId, loadSmartAgentConversations])

  const startNewSmartAgentChat = useCallback(() => {
    const requestId = smartAgentStreamRequestIdRef.current
    if (requestId) {
      void smartAgentRepository.cancelChatStream(requestId).catch(() => undefined)
    }
    smartAgentStreamAbortRef.current?.abort()
    setIsSmartAgentListOpen(true)
    setError('')
    setMessages([])
    setSmartAgentHistory([])
    setSmartAgentSessionId(null)
    setActiveChatId('smart-agent')
  }, [setError, smartAgentRepository])

  useEffect(() => {
    if (isSmartAgentListMode) {
      void loadSmartAgentConversations()
    }
  }, [isSmartAgentListMode, loadSmartAgentConversations])

  const sendSmartAgentMessage = useCallback(async (messageText?: string, displayText?: string) => {
    const composerRaw = messageText ?? (messageInputRef.current?.value ?? messageDraftRef.current ?? '')
    const userMessageText = composerRaw.trim()
    if (!userMessageText || isSmartAgentLoading) return

    if (!messageText) {
      clearMessageComposerField()
    }

    const formatTime = (iso: string) => {
      const d = new Date(iso)
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    const textToShow = displayText ?? userMessageText

    const userMsg: MessageView = {
      raw: toChatMessage({
        id: `sa-user-${Date.now()}`,
        sender_id: currentUser?.id || 0,
        content: textToShow,
        type: 'text',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        conversation_id: 'smart-agent',
      }),
      from: 'me',
      text: textToShow,
      time: formatTime(new Date().toISOString()),
      kind: 'text',
      senderLabel: mt('common.you'),
      isCall: false,
      status: 'read',
      unavailable: false,
    }

    stickChatToBottom('auto')
    setMessages(prev => [...prev, userMsg])
    setIsSmartAgentLoading(true)
    setSmartAgentStreamingTextVisible(false)

    const streamController = new AbortController()
    const streamMessageId = `sa-stream-${Date.now()}`
    smartAgentStreamAbortRef.current = streamController
    smartAgentStreamRequestIdRef.current = null

    try {
      const response = await smartAgentRepository.chatStream(
        {
          message: userMessageText,
          session_id: smartAgentSessionId,
          conversation_history: smartAgentHistory,
        },
        {
          onStarted: (requestId) => {
            smartAgentStreamRequestIdRef.current = requestId
          },
          onDelta: (delta) => {
            appendSmartAgentStreamDelta(streamMessageId, delta)
          },
        },
        streamController.signal,
      )

      if (!response) return

      if (response.session_id) {
        setSmartAgentSessionId(response.session_id)
        if (activeChatId === 'smart-agent') {
          const nextChatId = `smart-agent:${response.session_id}`
          smartAgentSkipNextLoadRef.current = nextChatId
          setActiveChatId(nextChatId)
        }
      }

      if (Array.isArray(response.conversation_history)) {
        setSmartAgentHistory(response.conversation_history)
      }

      void loadSmartAgentConversations(false)

      const historyEntries = Array.isArray(response.conversation_history)
        ? response.conversation_history
            .map((entry) => {
              if (!entry || typeof entry !== 'object') {
                return null
              }

              const role = typeof (entry as { role?: unknown }).role === 'string'
                ? (entry as { role: string }).role.trim().toLowerCase()
                : ''
              const rawContent = typeof (entry as { content?: unknown }).content === 'string'
                ? (entry as { content: string }).content
                : ''
              const content = role === 'assistant'
                ? sanitizeSmartAgentAssistantText(rawContent)
                : rawContent
              const createdAt = typeof (entry as { created_at?: unknown }).created_at === 'string'
                ? (entry as { created_at: string }).created_at
                : new Date().toISOString()
              const tables = Array.isArray((entry as { tables?: unknown }).tables)
                ? (entry as { tables: any[] }).tables
                : undefined
              const feedback = typeof (entry as { feedback?: unknown }).feedback === 'string'
                ? (entry as { feedback: 'like' | 'dislike' }).feedback
                : undefined

              const widget = (entry as any).widget || (entry as any).metadata

              if (!content.trim() || (role !== 'user' && role !== 'assistant')) {
                return null
              }

              return { role, content, createdAt, tables, feedback, widget }
            })
            .filter((entry): entry is Exclude<typeof entry, null> => Boolean(entry))
        : []

      if (historyEntries.length > 0) {
        const lastAssistantIndex = (() => {
          for (let index = historyEntries.length - 1; index >= 0; index -= 1) {
            if (historyEntries[index].role === 'assistant') {
              return index
            }
          }

          return -1
        })()

        const nextMessages = historyEntries.map((entry, index): MessageView => {
          const isUserEntry = entry.role === 'user'
          const rawWidget = entry.widget || (!isUserEntry && index === lastAssistantIndex ? response.widget : null)
          const metadata = rawWidget ? JSON.stringify(rawWidget) : null

          return {
            raw: toChatMessage({
              id: `sa-history-${Date.now()}-${index}`,
              sender_id: isUserEntry ? (currentUser?.id || 0) : -1,
              content: entry.content,
              type: 'text',
              created_at: entry.createdAt,
              updated_at: entry.createdAt,
              conversation_id: 'smart-agent',
              metadata,
            }),
            from: isUserEntry ? 'me' : 'them',
            text: entry.content,
            time: formatTime(entry.createdAt),
            kind: 'text',
            senderLabel: isUserEntry ? mt('common.you') : 'Smart Agent',
            isCall: false,
            status: 'read',
            unavailable: false,
            tables: entry.tables,
            feedback: entry.feedback || null,
          }
        })

        stickChatToBottom('auto')
        setMessages(nextMessages)
        return
      }

      const aiMsg: MessageView = {
        raw: toChatMessage({
          id: `sa-ai-${Date.now()}`,
          sender_id: -1,
          content: response.reply,
          type: 'text',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          conversation_id: 'smart-agent',
          metadata: response.widget ? JSON.stringify(response.widget) : null,
        }),
        from: 'them',
        text: response.reply,
        time: formatTime(new Date().toISOString()),
        kind: 'text',
        senderLabel: 'Smart Agent',
        isCall: false,
        status: 'read',
        unavailable: false,
        tables: response.tables || undefined,
        feedback: null,
      }

      stickChatToBottom('auto')
      setMessages(prev => [...prev, aiMsg])
    } catch (err) {
      if (!streamController.signal.aborted) {
        setSendError(getErrorMessage(err, mt('page.t107')))
      }
    } finally {
      setIsSmartAgentLoading(false)
      setSmartAgentStreamingTextVisible(false)
      if (smartAgentStreamAbortRef.current === streamController) {
        smartAgentStreamAbortRef.current = null
        smartAgentStreamRequestIdRef.current = null
      }
    }
  }, [clearMessageComposerField, isSmartAgentLoading, smartAgentRepository, smartAgentSessionId, smartAgentHistory, setSmartAgentHistory, currentUser, setMessages, stickChatToBottom, activeChatId, setActiveChatId, loadSmartAgentConversations, appendSmartAgentStreamDelta])

  const stopSmartAgentGeneration = useCallback(() => {
    const requestId = smartAgentStreamRequestIdRef.current
    if (requestId) {
      void smartAgentRepository.cancelChatStream(requestId).catch(() => undefined)
    }
    smartAgentStreamAbortRef.current?.abort()
  }, [smartAgentRepository])

  useEffect(() => {
    return () => {
      const requestId = smartAgentStreamRequestIdRef.current
      if (requestId) {
        void smartAgentRepository.cancelChatStream(requestId).catch(() => undefined)
      }
      smartAgentStreamAbortRef.current?.abort()
    }
  }, [smartAgentRepository])

  const handleEditSmartAgentMessage = useCallback(async (newText: string, messageIndex: number, regenerate = false) => {
    if (isSmartAgentLoading) return

    const formatTime = (iso: string) => {
      const d = new Date(iso)
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    const precedingMessages = messages.slice(0, messageIndex)
    const updatedUserMsg: MessageView = {
      raw: toChatMessage({
        id: `sa-user-edit-${Date.now()}`,
        sender_id: currentUser?.id || 0,
        content: newText,
        type: 'text',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        conversation_id: 'smart-agent',
      }),
      from: 'me',
      text: newText,
      time: formatTime(new Date().toISOString()),
      kind: 'text',
      senderLabel: mt('common.you'),
      isCall: false,
      status: 'read',
      unavailable: false,
    }

    const nextMessages = [...precedingMessages, updatedUserMsg]
    setMessages(nextMessages)
    setIsSmartAgentLoading(true)
    setSmartAgentStreamingTextVisible(false)

    const streamController = new AbortController()
    const streamMessageId = `sa-edit-stream-${Date.now()}`
    smartAgentStreamAbortRef.current = streamController
    smartAgentStreamRequestIdRef.current = null

    const historyToSend = precedingMessages.map(m => ({
      role: m.from === 'me' ? 'user' : 'assistant',
      content: m.text
    }))

    try {
      const response = await smartAgentRepository.chatStream(
        {
          message: newText,
          session_id: smartAgentSessionId,
          regenerate,
          conversation_history: historyToSend,
        },
        {
          onStarted: (requestId) => {
            smartAgentStreamRequestIdRef.current = requestId
          },
          onDelta: (delta) => appendSmartAgentStreamDelta(streamMessageId, delta),
        },
        streamController.signal,
      )

      if (!response) return

      if (response.session_id) {
        setSmartAgentSessionId(response.session_id)
        if (activeChatId === 'smart-agent') {
          const nextChatId = `smart-agent:${response.session_id}`
          smartAgentSkipNextLoadRef.current = nextChatId
          setActiveChatId(nextChatId)
        }
      }

      if (Array.isArray(response.conversation_history)) {
        setSmartAgentHistory(response.conversation_history)
      }

      void loadSmartAgentConversations(false)

      const historyEntries = Array.isArray(response.conversation_history)
        ? response.conversation_history
            .map((entry) => {
              if (!entry || typeof entry !== 'object') {
                return null
              }

              const role = typeof (entry as { role?: unknown }).role === 'string'
                ? (entry as { role: string }).role.trim().toLowerCase()
                : ''
              const content = typeof (entry as { content?: unknown }).content === 'string'
                ? (entry as { content: string }).content
                : ''
              const createdAt = typeof (entry as { created_at?: unknown }).created_at === 'string'
                ? (entry as { created_at: string }).created_at
                : new Date().toISOString()
              const tables = Array.isArray((entry as { tables?: unknown }).tables)
                ? (entry as { tables: any[] }).tables
                : undefined
              const feedback = typeof (entry as { feedback?: unknown }).feedback === 'string'
                ? (entry as { feedback: 'like' | 'dislike' }).feedback
                : undefined

              if (!content.trim() || (role !== 'user' && role !== 'assistant')) {
                return null
              }

              return { role, content, createdAt, tables, feedback }
            })
            .filter((entry): entry is Exclude<typeof entry, null> => Boolean(entry))
        : []

      if (historyEntries.length > 0) {
        const lastAssistantIndex = (() => {
          for (let index = historyEntries.length - 1; index >= 0; index -= 1) {
            if (historyEntries[index].role === 'assistant') {
              return index
            }
          }

          return -1
        })()

        const finalMessages = historyEntries.map((entry, index): MessageView => {
          const isUserEntry = entry.role === 'user'
          const metadata =
            !isUserEntry && index === lastAssistantIndex && response.widget
              ? JSON.stringify(response.widget)
              : null

          return {
            raw: toChatMessage({
              id: `sa-history-${Date.now()}-${index}`,
              sender_id: isUserEntry ? (currentUser?.id || 0) : -1,
              content: entry.content,
              type: 'text',
              created_at: entry.createdAt,
              updated_at: entry.createdAt,
              conversation_id: 'smart-agent',
              metadata,
            }),
            from: isUserEntry ? 'me' : 'them',
            text: entry.content,
            time: formatTime(entry.createdAt),
            kind: 'text',
            senderLabel: isUserEntry ? mt('common.you') : 'Smart Agent',
            isCall: false,
            status: 'read',
            unavailable: false,
            tables: entry.tables,
            feedback: entry.feedback || null,
          }
        })

        stickChatToBottom('auto')
        setMessages(finalMessages)
        return
      }

      const aiMsg: MessageView = {
        raw: toChatMessage({
          id: `sa-ai-${Date.now()}`,
          sender_id: -1,
          content: response.reply,
          type: 'text',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          conversation_id: 'smart-agent',
        }),
        from: 'them',
        text: response.reply,
        time: formatTime(new Date().toISOString()),
        kind: 'text',
        senderLabel: 'Smart Agent',
        isCall: false,
        status: 'read',
        unavailable: false,
        tables: response.tables || undefined,
        feedback: null,
      }

      stickChatToBottom('auto')
      setMessages(prev => [...prev, aiMsg])
    } catch (err) {
      if (streamController.signal.aborted) return
      const errorMessageText = err instanceof Error ? err.message : mt('page.t108')
      const aiMsg: MessageView = {
        raw: toChatMessage({
          id: `sa-ai-error-${Date.now()}`,
          sender_id: -1,
          content: errorMessageText,
          type: 'text',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          conversation_id: 'smart-agent',
        }),
        from: 'them',
        text: errorMessageText,
        time: formatTime(new Date().toISOString()),
        kind: 'text',
        senderLabel: 'Smart Agent',
        isCall: false,
        status: 'read',
        unavailable: false,
        feedback: null,
      }
      setMessages(prev => [...prev, aiMsg])
      setSendError(getErrorMessage(err, mt('page.t107')))
    } finally {
      setIsSmartAgentLoading(false)
      setSmartAgentStreamingTextVisible(false)
      if (smartAgentStreamAbortRef.current === streamController) {
        smartAgentStreamAbortRef.current = null
        smartAgentStreamRequestIdRef.current = null
      }
    }
  }, [
    isSmartAgentLoading,
    messages,
    currentUser,
    smartAgentSessionId,
    activeChatId,
    setActiveChatId,
    setSmartAgentHistory,
    smartAgentRepository,
    loadSmartAgentConversations,
    stickChatToBottom,
    setMessages,
    setSendError,
    appendSmartAgentStreamDelta,
  ])

  const handleSendSmartAgentFeedback = useCallback(async (msgIndex: number, feedback: 'like' | 'dislike') => {
    if (!smartAgentSessionId) {
      console.warn("No smart agent session ID to submit feedback")
      return
    }

    try {
      await smartAgentRepository.sendFeedback({
        session_id: smartAgentSessionId,
        feedback,
      })

      setMessages((prev) => {
        const next = [...prev]
        if (next[msgIndex]) {
          next[msgIndex] = {
            ...next[msgIndex],
            feedback,
          }
        }
        return next
      })
    } catch (err) {
      alert(mt('page.t109'))
    }
  }, [smartAgentSessionId, smartAgentRepository])

  const sendMessage = useCallback(async () => {
    const composerRaw = messageInputRef.current?.value ?? messageDraftRef.current ?? ''
    if (!composerRaw.trim() && !attachmentToUpload && attachmentsToUpload.length === 0) {
      return
    }

    if (activeChatId && activeChatId.startsWith('smart-agent')) {
      await sendSmartAgentMessage()
      return
    }

    setIsSending(true)

    try {
      let attachmentParams: {
        attachmentUrl?: string
        attachmentType?: string
        attachmentSize?: number
        type?: MessageType
      } = {}

      let extraMetadata: Record<string, any> = {}

      if (attachmentsToUpload.length > 0) {
        if (attachmentsToUpload.length === 1) {
          const file = attachmentsToUpload[0]
          const selection = classifyAttachmentFile(file)
          const uploaded = await chatRepository.uploadFile(file, selection.uploadType)
          extraMetadata.attachment = {
            filename: uploaded.filename || file.name,
            object_name: uploaded.objectName,
            mime: selection.mime,
            size: file.size,
            ext: selection.ext || getAttachmentExtension(uploaded.filename || file.name),
          }
          attachmentParams = {
            attachmentUrl: uploaded.url,
            attachmentType: selection.mime,
            attachmentSize: file.size,
            type: selection.messageType,
          }
        } else {
          const uploadPromises = attachmentsToUpload.map(async (file) => {
            const selection = classifyAttachmentFile(file)
            const uploaded = await chatRepository.uploadFile(file, selection.uploadType)
            return {
              url: uploaded.url,
              type: selection.mime,
              size: file.size,
              name: uploaded.filename || file.name,
              object_name: uploaded.objectName,
            }
          })
          const uploadedFiles = await Promise.all(uploadPromises)

          const allImages = uploadedFiles.every((file) => isGalleryImageFile(file))
          const first = uploadedFiles[0]
          attachmentParams = {
            attachmentUrl: first.url,
            attachmentType: first.type,
            attachmentSize: first.size,
            type: allImages ? 'image' : 'file',
          }
          extraMetadata.gallery = uploadedFiles
        }
      } else if (attachmentToUpload) {
        const selection = classifyAttachmentFile(attachmentToUpload)
        const uploaded = await chatRepository.uploadFile(attachmentToUpload, selection.uploadType)
        extraMetadata.attachment = {
          filename: uploaded.filename || attachmentToUpload.name,
          object_name: uploaded.objectName,
          mime: selection.mime,
          size: attachmentToUpload.size,
          ext: selection.ext || getAttachmentExtension(uploaded.filename || attachmentToUpload.name),
        }
        attachmentParams = {
          attachmentUrl: uploaded.url,
          attachmentType: selection.mime,
          attachmentSize: attachmentToUpload.size,
          type: selection.messageType,
        }
      }

      let metadata: string | null = null
      if (activeChat?.chat.type === 'group') {
        const memberUsernames = new Set(activeGroupMembers.map((member) => member.username).filter(Boolean))
        const mentions = Array.from(
          new Set(
            [...composerRaw.matchAll(/(^|\s)@([a-zA-Z0-9._-]+)/g)]
              .map((match) => match[2])
              .filter((username): username is string => Boolean(username) && memberUsernames.has(username)),
          ),
        )

        if (mentions.length > 0) {
          metadata = JSON.stringify({ mentions, ...extraMetadata })
        } else if (Object.keys(extraMetadata).length > 0) {
          metadata = JSON.stringify(extraMetadata)
        }
      } else if (activeChat?.chat.type === 'personal' && activeChat.chat.peerUsername) {
        const peer = activeChat.chat.peerUsername
        const escaped = peer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        let mentions: string[] = []
        if (new RegExp(`(^|\\s)@${escaped}(?=[\\s,.!?;:]|$)`, 'i').test(composerRaw)) {
          mentions = [peer]
        }
        if (mentions.length > 0) {
          metadata = JSON.stringify({ mentions, ...extraMetadata })
        } else if (Object.keys(extraMetadata).length > 0) {
          metadata = JSON.stringify(extraMetadata)
        }
      } else if (activeChat?.chat.type === 'channel') {
        const mentions = Array.from(new Set(
          [...composerRaw.matchAll(/(^|\s)@([a-zA-Z0-9._-]+)/g)]
            .map((match) => match[2])
            .filter((username): username is string => Boolean(username)),
        ))
        if (mentions.length > 0 || Object.keys(extraMetadata).length > 0) {
          metadata = JSON.stringify({ ...(mentions.length > 0 ? { mentions } : {}), ...extraMetadata })
        }
      } else if (Object.keys(extraMetadata).length > 0) {
        metadata = JSON.stringify(extraMetadata)
      }

      await sendChatPayload({
        content: composerRaw.trim(),
        type: attachmentParams.type || 'text',
        clearInput: true,
        metadata,
        ...attachmentParams,
      })

      // Clear pending attachments after successful send
      setAttachmentToUpload(null)
      setAttachmentPreviewUrl(null)
      setAttachmentsToUpload([])
      setAttachmentPreviewUrls([])
    } catch (err) {
      setSendError(err instanceof Error ? err.message : mt('page.t103'))
    } finally {
      setIsSending(false)
    }
  }, [activeChat, activeChatId, activeGroupMembers, attachmentToUpload, attachmentsToUpload, chatRepository, sendChatPayload, sendSmartAgentMessage])

  const handleAiProofreadMessage = useCallback(async () => {
    const text = messageInputRef.current?.value || ''
    if (!text.trim()) return
    setIsAiProofreading(true)
    try {
      const res = await alemAiRepository.proofreadNote({ content: text })
      if (res.corrected_text && messageInputRef.current) {
        messageInputRef.current.value = res.corrected_text
        handleComposerInput({ currentTarget: messageInputRef.current } as any)
      }
    } catch (e) {
      console.error('AI Proofread failed', e)
    } finally {
      setIsAiProofreading(false)
    }
  }, [alemAiRepository, handleComposerInput])

  const handleDriveFileSelect = useCallback(async (file: { id: string; name: string; size?: number; mime_type?: string; download_url?: string }) => {
    if (activeChatId && activeChatId.startsWith('smart-agent')) {
      setIsDrivePickerOpen(false)
      setSendError(mt('page.t110'))
      return
    }

    setIsDrivePickerOpen(false)
    setIsSending(true)
    try {
      // 1. Grant public access (consistent with SendToMessengerModal.jsx logic)
      try {
        await grantPermission(file.id, 'public', 'viewer')
      } catch (permErr) {
        console.warn('Failed to grant public access to drive file', permErr)
      }

      // 2. Prepare metadata and content
      const metadata = JSON.stringify({
        type: 'drive_file',
        fileId: file.id,
        fileName: file.name,
        fileSize: file.size,
        fileMime: file.mime_type,
        fileDownloadUrl: normalizeBackendAssetUrl(file.download_url) ?? file.download_url,
        sharedVia: 'messenger'
      })
      
      const content = `📄 Team Drive: ${file.name}`

      // 3. Send message payload with metadata
      await sendChatPayload({
        content,
        type: 'text',
        clearInput: false,
        metadata
      })
    } catch (err) {
      console.error('Failed to share drive file', err)
      setSendError(mt('page.t111'))
    } finally {
      setIsSending(false)
    }
  }, [activeChatId, sendChatPayload])

  const handleOpenDriveFile = useCallback((file: { fileId: string; fileName?: string; fileSize?: number; fileMime?: string; fileDownloadUrl?: string }) => {
    const fileId = file.fileId
    const fileName = file.fileName || mt('page.t038')
    const fileMime = file.fileMime || ''
    const fileDownloadUrl = normalizeBackendAssetUrl(file.fileDownloadUrl) ?? file.fileDownloadUrl
    const lowerName = fileName.toLowerCase()
    const isPreviewable = fileMime.startsWith('image/')
      || fileMime === 'application/pdf'
      || fileMime.startsWith('video/')
      || /\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|pdf|mp4|mov|webm|avi|mkv|3gp)$/i.test(lowerName)

    if (isPreviewable) {
      navigate(`/drive/editor/${fileId}`, {
        state: {
          file: {
            id: fileId,
            name: fileName,
            mime_type: fileMime,
            size: file.fileSize,
            download_url: fileDownloadUrl,
            downloadUrl: fileDownloadUrl,
          },
          mode: 'view',
        },
      })
      return
    }

    navigate(`/drive/editor/${fileId}`)
  }, [navigate])

  const handleOpenNote = useCallback((noteId: string) => {
    navigate(`/notes?noteId=${noteId}`)
  }, [navigate])

  const handleOpenPublication = useCallback((publicationId: string) => {
    navigate(`/news/${encodeURIComponent(publicationId)}`)
  }, [navigate])



  const handleAttachmentSelection = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || [])
      if (files.length === 0) {
        return
      }

      if (activeChatId && activeChatId.startsWith('smart-agent')) {
        setSendError(mt('page.t112'))
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
        return
      }

      const validFiles: File[] = []
      const validUrls: string[] = []

      for (const file of files) {
        const selection = classifyAttachmentFile(file)
        if (file.size > selection.maxSizeBytes) {
          setSendError(mt('page.fileTooBig', { name: file.name, limit: selection.limitLabel }))
          continue
        }
        validFiles.push(file)
        validUrls.push(URL.createObjectURL(file))
      }

      if (validFiles.length > 0) {
        setAttachmentsToUpload((prev) => [...prev, ...validFiles])
        setAttachmentPreviewUrls((prev) => [...prev, ...validUrls])
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    [activeChatId],
  )

  const handlePaste = useCallback(
    async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (activeChatId && activeChatId.startsWith('smart-agent')) {
        return
      }

      const items = event.clipboardData?.items
      if (!items) return

      const pastedFiles: File[] = []
      const pastedUrls: string[] = []

      for (const item of Array.from(items)) {
        if (item.type.indexOf('image/') !== -1) {
          event.preventDefault()
          const file = item.getAsFile()
          if (!file) continue

          const selection = classifyAttachmentFile(file)
          if (file.size > selection.maxSizeBytes) {
            setSendError(mt('page.fileTooBig', { name: file.name, limit: selection.limitLabel }))
            continue
          }

          pastedFiles.push(file)
          pastedUrls.push(URL.createObjectURL(file))
        }
      }

      if (pastedFiles.length > 0) {
        setAttachmentsToUpload((prev) => [...prev, ...pastedFiles])
        setAttachmentPreviewUrls((prev) => [...prev, ...pastedUrls])
      }
    },
    [activeChatId],
  )


  const resetRecordGestureState = useCallback(() => {
    if (recordHoldTimeoutRef.current) {
      clearTimeout(recordHoldTimeoutRef.current)
      recordHoldTimeoutRef.current = null
    }

    if (recordHoldResetTimeoutRef.current) {
      clearTimeout(recordHoldResetTimeoutRef.current)
      recordHoldResetTimeoutRef.current = null
    }

    recordHoldTriggeredRef.current = false
    recordGestureStartYRef.current = null
    recordShouldContinueRef.current = false
    isRecordingLockedRef.current = false
    setIsRecordGestureActive(false)
    setIsRecordLockHintVisible(false)
    setIsRecordingLocked(false)
    setRecordLockProgress(0)
  }, [])

  const cleanupRecordingResources = useCallback(() => {
    resetRecordGestureState()

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }

    mediaRecorderRef.current = null
    recordedChunksRef.current = []
    setIsRecordingVoice(false)
    setRecordingDurationSeconds(0)
  }, [resetRecordGestureState])

  /* const unusedSendSmartAgentMessage = useCallback(async (overrideText?: string) => {
    const userMessageText = (overrideText ?? input).trim()
    if (!userMessageText || isSmartAgentLoading) return

    if (!overrideText) {
      setInput('')
    }

    const formatTime = (iso: string) => {
      const d = new Date(iso)
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    const userMsg: MessageView = {
      raw: toChatMessage({
        id: `sa-user-${Date.now()}`,
        sender_id: currentUser?.id || 0,
        content: userMessageText,
        type: 'text',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        conversation_id: 'smart-agent',
      }),
      from: 'me',
      text: userMessageText,
      time: formatTime(new Date().toISOString()),
      kind: 'text',
      senderLabel: mt('common.you'),
      isCall: false,
      status: 'read',
      unavailable: false,
    }

    setSmartAgentMessages(prev => [...prev, userMsg])
    setMessages(prev => [...prev, userMsg])
    setIsSmartAgentLoading(true)

    try {
      const response = await smartAgentRepository.chat({
        message: userMessageText,
        session_id: smartAgentSessionId,
        conversation_history: [],
      })

      if (response.session_id) {
        setSmartAgentSessionId(response.session_id)
      }

      const aiMsg: MessageView = {
        raw: toChatMessage({
          id: `sa-ai-${Date.now()}`,
          sender_id: -1,
          content: response.reply,
          type: 'text',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          conversation_id: 'smart-agent',
          metadata: response.widget ? JSON.stringify(response.widget) : null,
        }),
        from: 'them',
        text: response.reply,
        time: formatTime(new Date().toISOString()),
        kind: 'text',
        senderLabel: 'Smart Agent',
        isCall: false,
        status: 'read',
        unavailable: false,
      }

      setSmartAgentMessages(prev => [...prev, aiMsg])
      setMessages(prev => [...prev, aiMsg])
    } catch (err) {
      setSendError(getErrorMessage(err, mt('page.t107')))
    } finally {
      setIsSmartAgentLoading(false)
    }
  }, [input, isSmartAgentLoading, smartAgentRepository, smartAgentSessionId, currentUser, setMessages, setSmartAgentMessages]) */

  void 0

  const cleanupVideoRecordingResources = useCallback(() => {
    resetRecordGestureState()

    if (videoMessageTimerRef.current) {
      clearInterval(videoMessageTimerRef.current)
      videoMessageTimerRef.current = null
    }

    if (videoMessageStreamRef.current) {
      videoMessageStreamRef.current.getTracks().forEach((track) => track.stop())
      videoMessageStreamRef.current = null
    }

    videoMessageRecorderRef.current = null
    videoMessageChunksRef.current = []
    setIsRecordingVideoMessage(false)
    setVideoRecordingDurationSeconds(0)
  }, [resetRecordGestureState])

  useEffect(() => {
    return () => {
      stopOutgoingTyping()
      Object.values(typingTimeoutsRef.current).forEach((timeoutId) => clearTimeout(timeoutId))
      typingTimeoutsRef.current = {}
      if (recordHoldTimeoutRef.current) {
        clearTimeout(recordHoldTimeoutRef.current)
        recordHoldTimeoutRef.current = null
      }
      cleanupRecordingResources()
      cleanupVideoRecordingResources()
    }
  }, [cleanupRecordingResources, cleanupVideoRecordingResources, stopOutgoingTyping])

  const sendVoiceFile = useCallback(
    async (file: File) => {
      if (!activeChat) {
        return
      }

      setSendError('')

      try {
        const uploaded = await chatRepository.uploadFile(file, 'audio')
        await sendChatPayload({
          content: '',
          type: 'audio',
          attachmentUrl: uploaded.url,
          attachmentSize: file.size,
        })
      } catch (sendVoiceError) {
        setSendError(sendVoiceError instanceof Error ? sendVoiceError.message : mt('page.t113'))
      }
    },
    [activeChat, chatRepository, sendChatPayload],
  )

  const stopVoiceRecording = useCallback(async () => {
    const recorder = mediaRecorderRef.current

    if (!recorder) {
      cleanupRecordingResources()
      return
    }

    if (recorder.state === 'inactive') {
      cleanupRecordingResources()
      return
    }

    await new Promise<void>((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        const extension = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm'
        const mimeType = blob.type || (extension === 'm4a' ? 'audio/mp4' : extension === 'ogg' ? 'audio/ogg' : 'audio/webm')
        const file = new File([blob], `voice-${Date.now()}.${extension}`, { type: mimeType })
        cleanupRecordingResources()
        void sendVoiceFile(file).finally(() => resolve())
      }

      recorder.stop()
    })
  }, [cleanupRecordingResources, sendVoiceFile])

  const startVoiceRecording = useCallback(async () => {
    if (isRecordingVoice || isRecordingVideoMessage || isSending) {
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      if (!recordShouldContinueRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      mediaStreamRef.current = stream

      const preferredMimeType = MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
            ? 'audio/ogg;codecs=opus'
            : ''

      const recorder = preferredMimeType ? new MediaRecorder(stream, { mimeType: preferredMimeType }) : new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      recordedChunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data)
        }
      }

      recorder.start()
      setIsRecordingVoice(true)
      setRecordingDurationSeconds(0)
      recordingTimerRef.current = setInterval(() => {
        setRecordingDurationSeconds((prev) => prev + 1)
      }, 1000)
    } catch (recordingError) {
      cleanupRecordingResources()
      setSendError(recordingError instanceof Error ? recordingError.message : mt('page.t114'))
    }
  }, [cleanupRecordingResources, isRecordingVideoMessage, isRecordingVoice, isSending])

  const cancelVoiceRecording = useCallback(async () => {
    const recorder = mediaRecorderRef.current

    if (!recorder || recorder.state === 'inactive') {
      cleanupRecordingResources()
      return
    }

    await new Promise<void>((resolve) => {
      recorder.onstop = () => {
        cleanupRecordingResources()
        resolve()
      }

      recorder.stop()
    })
  }, [cleanupRecordingResources])

  const sendVideoMessageFile = useCallback(
    async (file: File) => {
      setSendError('')

      try {
        const uploaded = await chatRepository.uploadFile(file, 'video_message')
        await sendChatPayload({
          content: '',
          type: 'video_message',
          attachmentUrl: uploaded.url,
          attachmentSize: file.size,
        })
      } catch (sendVideoError) {
        setSendError(sendVideoError instanceof Error ? sendVideoError.message : mt('page.t115'))
      }
    },
    [chatRepository, sendChatPayload],
  )

  const stopVideoMessageRecording = useCallback(async () => {
    const recorder = videoMessageRecorderRef.current

    if (!recorder) {
      cleanupVideoRecordingResources()
      return
    }

    if (recorder.state === 'inactive') {
      cleanupVideoRecordingResources()
      return
    }

    await new Promise<void>((resolve) => {
      recorder.onstop = () => {
        const fallbackType = recorder.mimeType || 'video/webm'
        const blob = new Blob(videoMessageChunksRef.current, { type: fallbackType })
        const extension = blob.type.includes('mp4') ? 'mp4' : 'webm'
        const file = new File([blob], `video-message-${Date.now()}.${extension}`, { type: blob.type || fallbackType })
        cleanupVideoRecordingResources()
        void sendVideoMessageFile(file).finally(() => resolve())
      }

      recorder.stop()
    })
  }, [cleanupVideoRecordingResources, sendVideoMessageFile])

  const startVideoMessageRecording = useCallback(async () => {
    if (isRecordingVideoMessage || isRecordingVoice || isSending) {
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: 'user',
          width: { ideal: 720 },
          height: { ideal: 720 },
        },
      })

      if (!recordShouldContinueRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      videoMessageStreamRef.current = stream

      const preferredMimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
          ? 'video/webm;codecs=vp8,opus'
          : MediaRecorder.isTypeSupported('video/webm')
            ? 'video/webm'
            : ''

      const recorder = preferredMimeType ? new MediaRecorder(stream, { mimeType: preferredMimeType }) : new MediaRecorder(stream)
      videoMessageRecorderRef.current = recorder
      videoMessageChunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          videoMessageChunksRef.current.push(event.data)
        }
      }

      recorder.start()
      setIsRecordingVideoMessage(true)
      setVideoRecordingDurationSeconds(0)
      videoMessageTimerRef.current = setInterval(() => {
        setVideoRecordingDurationSeconds((prev) => prev + 1)
      }, 1000)
    } catch (recordingError) {
      cleanupVideoRecordingResources()
      setSendError(recordingError instanceof Error ? recordingError.message : mt('page.t116'))
    }
  }, [cleanupVideoRecordingResources, isRecordingVideoMessage, isRecordingVoice, isSending])

  const cancelVideoMessageRecording = useCallback(async () => {
    const recorder = videoMessageRecorderRef.current

    if (!recorder || recorder.state === 'inactive') {
      cleanupVideoRecordingResources()
      return
    }

    await new Promise<void>((resolve) => {
      recorder.onstop = () => {
        cleanupVideoRecordingResources()
        resolve()
      }

      recorder.stop()
    })
  }, [cleanupVideoRecordingResources])

  const startSelectedRecording = useCallback(async () => {
    if (selectedRecorderMode === 'video_message') {
      await startVideoMessageRecording()
      return
    }

    await startVoiceRecording()
  }, [selectedRecorderMode, startVideoMessageRecording, startVoiceRecording])

  const stopActiveRecording = useCallback(async () => {
    if (mediaRecorderRef.current) {
      await stopVoiceRecording()
      return
    }

    if (videoMessageRecorderRef.current) {
      await stopVideoMessageRecording()
      return
    }

    recordShouldContinueRef.current = false
    if (isRecordingLockedRef.current || isRecordGestureActive) {
      resetRecordGestureState()
    }
  }, [isRecordGestureActive, resetRecordGestureState, stopVideoMessageRecording, stopVoiceRecording])

  const cancelActiveRecording = useCallback(async () => {
    if (mediaRecorderRef.current) {
      await cancelVoiceRecording()
      return
    }

    if (videoMessageRecorderRef.current) {
      await cancelVideoMessageRecording()
      return
    }

    recordShouldContinueRef.current = false
    if (isRecordingLockedRef.current || isRecordGestureActive) {
      resetRecordGestureState()
    }
  }, [cancelVideoMessageRecording, cancelVoiceRecording, isRecordGestureActive, resetRecordGestureState])

  const clearRecordHoldTimeout = useCallback(() => {
    if (recordHoldTimeoutRef.current) {
      clearTimeout(recordHoldTimeoutRef.current)
      recordHoldTimeoutRef.current = null
    }
  }, [])

  const scheduleRecordHoldFlagReset = useCallback(() => {
    if (recordHoldResetTimeoutRef.current) {
      clearTimeout(recordHoldResetTimeoutRef.current)
    }

    recordHoldResetTimeoutRef.current = setTimeout(() => {
      recordHoldTriggeredRef.current = false
      recordHoldResetTimeoutRef.current = null
    }, 320)
  }, [])

  const handleRecordGestureMove = useCallback(
    (clientY: number | null) => {
      const startY = recordGestureStartYRef.current
      if (clientY === null || startY === null || isRecordingLockedRef.current) {
        return
      }

      const upwardDistance = Math.max(0, startY - clientY)
      const nextProgress = Math.min(upwardDistance / RECORD_LOCK_THRESHOLD, 1)
      setRecordLockProgress(nextProgress)

      if (upwardDistance >= RECORD_LOCK_THRESHOLD && (recordHoldTriggeredRef.current || isRecordingAnyMedia)) {
        setIsRecordLockHintVisible(true)
        isRecordingLockedRef.current = true
        setIsRecordingLocked(true)
        setIsRecordGestureActive(false)
        recordShouldContinueRef.current = true
        clearRecordHoldTimeout()
      }
    },
    [clearRecordHoldTimeout, isRecordingAnyMedia],
  )

  const handleRecordButtonPressStart = useCallback((clientY: number | null) => {
    if (hasDraftMessage || isSending || isRecordingAnyMedia || isRecordingLockedRef.current) {
      return
    }

    clearRecordHoldTimeout()
    if (recordHoldResetTimeoutRef.current) {
      clearTimeout(recordHoldResetTimeoutRef.current)
      recordHoldResetTimeoutRef.current = null
    }
    recordGestureStartYRef.current = clientY
    recordShouldContinueRef.current = false
    recordHoldTriggeredRef.current = false
    setIsRecordGestureActive(true)
    setRecordLockProgress(0)
    recordHoldTimeoutRef.current = setTimeout(() => {
      recordHoldTriggeredRef.current = true
      recordShouldContinueRef.current = true
      setIsRecordLockHintVisible(true)
      void startSelectedRecording()
    }, 220)
  }, [clearRecordHoldTimeout, hasDraftMessage, isRecordingAnyMedia, isSending, startSelectedRecording])

  const handleRecordButtonPressEnd = useCallback(async () => {
    clearRecordHoldTimeout()
    recordGestureStartYRef.current = null
    const isLockedNow = isRecordingLockedRef.current
    const hasActiveRecorder =
      (mediaRecorderRef.current !== null && mediaRecorderRef.current.state !== 'inactive')
      || (videoMessageRecorderRef.current !== null && videoMessageRecorderRef.current.state !== 'inactive')

    if (!recordHoldTriggeredRef.current) {
      setIsRecordGestureActive(false)
      setRecordLockProgress(0)
      return
    }

    if (isLockedNow) {
      setIsRecordGestureActive(false)
      setRecordLockProgress(1)
      scheduleRecordHoldFlagReset()
      return
    }

    recordShouldContinueRef.current = false
    setIsRecordGestureActive(false)
    setRecordLockProgress(0)

    if (hasActiveRecorder || isRecordingAnyMedia) {
      await stopActiveRecording()
    }
    scheduleRecordHoldFlagReset()
  }, [clearRecordHoldTimeout, isRecordingAnyMedia, scheduleRecordHoldFlagReset, stopActiveRecording])

  useEffect(() => {
    if (!isRecordGestureActive) {
      return
    }

    const handleMouseMove = (event: MouseEvent) => {
      handleRecordGestureMove(event.clientY)
    }

    const handleTouchMove = (event: TouchEvent) => {
      handleRecordGestureMove(event.touches[0]?.clientY ?? null)
    }

    const handleMouseUp = () => {
      void handleRecordButtonPressEnd()
    }

    const handleTouchEnd = () => {
      void handleRecordButtonPressEnd()
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('touchend', handleTouchEnd)
    window.addEventListener('touchcancel', handleTouchEnd)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('touchend', handleTouchEnd)
      window.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [handleRecordButtonPressEnd, handleRecordGestureMove, isRecordGestureActive])

  const createDraftChat = useCallback(
    (user: UserDirectoryUser) => {
      const peerId = user.id

      if (currentUser && peerId === currentUser.id) {
        setSendError(mt('page.t117'))
        return
      }

      const existingChat = chats.find((item) => (item.chat.type === 'personal' || item.chat.type === 'support') && item.chat.peerId === peerId)

      if (existingChat) {
        setActiveChatId(existingChat.chat.id)
        setShowInfo(false)
        setSendError('')
        setIsUserPickerOpen(false)
        return
      }

      const displayName = user.fullName || user.username || `User ${peerId}`
      const draftId = `draft-${peerId}-${Date.now()}`

      const draftChat: ChatListItem = {
        chat: {
          id: draftId,
          type: user.isSupport ? 'support' : 'personal',
          peerId,
          peerUsername: user.username || null,
          peerFullName: displayName,
          peerAvatar: user.avatarUrl,
          lastSeenAt: null,
          groupId: null,
          groupName: null,
          groupAvatar: null,
          channelId: null,
          channelName: null,
          channelAvatar: null,
          aiModel: null,
          aiTitle: null,
          lastMessage: null,
          unreadCount: 0,
          mentionCount: 0,
          isPinned: false,
          isMuted: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        title: displayName,
        subtitle: mt('page.t118'),
        time: '',
        avatar: getInitials(displayName),
        avatarUrl: user.avatarUrl,
        seed: getSeed(displayName),
        online: false,
        unread: 0,
        isDraft: true,
      }

      setChats((prev) => [draftChat, ...prev])
      setMessages([])
      setActiveChatId(draftId)
      setShowInfo(false)
      setSendError('')
      setIsUserPickerOpen(false)
    },
    [chats, currentUser],
  )

  useEffect(() => {
    if (!username || !currentUser) {
      lastResolvedUsernameRef.current = null
      return
    }

    if (username === lastResolvedUsernameRef.current) {
      return
    }

    const resolveIdentifier = async () => {
      lastResolvedUsernameRef.current = username
      const isHandle = username.startsWith('@')
      const cleanIdentifier = isHandle ? username.slice(1) : username
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanIdentifier)
      
      // If it's neither a handle nor a UUID, it's not a valid channel identifier
      if (!isHandle && !isUuid) {
        if (window.location.pathname.startsWith('/messenger/')) {
          navigate('/messenger')
        }
        return
      }

      try {
        if (!isUuid) {
          const directoryUsersList = await userDirectoryRepository.getUsers()
          const matchedUser = directoryUsersList.find(
            (u) => u.username && u.username.toLowerCase() === cleanIdentifier.toLowerCase()
          )

          if (matchedUser) {
            createDraftChat(matchedUser)
            return
          }
        }
      } catch (userErr) {
        console.error('Failed to lookup user in directory', userErr)
      }

      try {
        let channel: ChannelView
        if (isUuid) {
          channel = await channelRepository.getChannel(cleanIdentifier)
        } else {
          channel = await channelRepository.getChannelByUsername(cleanIdentifier)
        }

        setResolvedChannel(channel)
        setActiveChatId(channel.id)
        setFilter((prev) => (prev !== 'all' ? 'channels' : prev))
        setError('')
      } catch (err) {
        console.error('Failed to resolve channel identifier', err)
        setError(mt('page.t119'))
        
        // If resolution fails and we are on a channel-like path, go back to main view
        if (window.location.pathname.startsWith('/messenger/') || window.location.pathname.includes(username)) {
          navigate('/messenger')
        }
      }
    }

    void resolveIdentifier()
  }, [username, currentUser, channelRepository, userDirectoryRepository, createDraftChat, navigate])

  const resetChatCreationModal = useCallback(() => {
    setChatCreationMode('personal')
    setUserSearchQuery('')
    setUserSearchError('')
    setGroupCreateName('')
    setGroupCreateDescription('')
    setSelectedNewGroupMemberIds([])
    setGroupCreateError('')
    setChannelCreateName('')
    setChannelCreateDescription('')
    setChannelCreateUsername('')
    setChannelCreateType('public')
    setChannelCreateError('')
    setChannelCreationStep(1)
    setCreatedChannelId(null)
  }, [])

  const createGroupFromPicker = useCallback(async () => {
    const normalizedName = groupCreateName.trim()
    if (!normalizedName) {
      setGroupCreateError(mt('page.t081'))
      return
    }

    setIsCreatingGroup(true)
    setGroupCreateError('')

    try {
      const createdGroup = await chatRepository.createGroup({
        name: normalizedName,
        memberIds: selectedNewGroupMemberIds,
        description: groupCreateDescription.trim(),
        type: 'private',
        maxMembers: 200,
      })

      setActiveChatId(createdGroup.id)
      setShowInfo(false)
      setMessages([])
      setIsUserPickerOpen(false)
      resetChatCreationModal()
      await loadChats()
    } catch (error) {
      setGroupCreateError(error instanceof Error ? error.message : mt('page.t120'))
    } finally {
      setIsCreatingGroup(false)
    }
  }, [chatRepository, groupCreateDescription, groupCreateName, loadChats, resetChatCreationModal, selectedNewGroupMemberIds])

  const createChannelFromPicker = useCallback(async () => {
    const normalizedName = channelCreateName.trim()
    if (!normalizedName) {
      setChannelCreateError(mt('page.t121'))
      return
    }

    if (channelCreateType === 'public') {
      const normalizedUsername = channelCreateUsername.trim()
      if (!normalizedUsername) {
        setChannelCreateError(mt('page.t122'))
        return
      }
      if (normalizedUsername.length < 4) {
        setChannelCreateError(mt('page.t123'))
        return
      }
    }

    setIsCreatingChannel(true)
    setChannelCreateError('')

    try {
      const createdChannel = await channelRepository.createChannel({
        name: normalizedName,
        description: channelCreateDescription.trim(),
        username: channelCreateType === 'public' ? channelCreateUsername.trim() : undefined,
        type: channelCreateType,
      })

      setCreatedChannelId(createdChannel.id)
      setChannelCreationStep(2)
      setSelectedNewGroupMemberIds([]) // Инициализируем пустой список для участников
    } catch (createErr) {
      setChannelCreateError(createErr instanceof Error ? createErr.message : mt('page.t124'))
    } finally {
      setIsCreatingChannel(false)
    }
  }, [channelCreateDescription, channelCreateName, channelCreateType, channelCreateUsername, channelRepository])

  const handleChannelUsernameKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') {
      return
    }

    event.preventDefault()

    const input = event.currentTarget
    const selectionStart = input.selectionStart ?? channelCreateUsername.length
    const selectionEnd = input.selectionEnd ?? channelCreateUsername.length
    const nextValue = `${channelCreateUsername.slice(0, selectionStart)}_${channelCreateUsername.slice(selectionEnd)}`

    setChannelCreateUsername(nextValue)

    requestAnimationFrame(() => {
      const caretPosition = selectionStart + 1
      input.setSelectionRange(caretPosition, caretPosition)
    })
  }, [channelCreateUsername])

  const finishChannelCreationWithMembers = useCallback(async () => {
    if (!createdChannelId) return

    setIsCreatingChannel(true)
    try {
      if (selectedNewGroupMemberIds.length > 0) {
        await channelRepository.addMembers(createdChannelId, selectedNewGroupMemberIds)
      }

      setActiveChatId(createdChannelId)
      setShowInfo(false)
      setMessages([])
      setIsUserPickerOpen(false)
      resetChatCreationModal()
      await loadChats()
    } catch (err) {
      setChannelCreateError(err instanceof Error ? err.message : mt('page.t125'))
    } finally {
      setIsCreatingChannel(false)
    }
  }, [channelRepository, createdChannelId, loadChats, resetChatCreationModal, selectedNewGroupMemberIds])

  const loadDirectoryUsers = useCallback(
    async () => {
      setIsSearchingUsers(true)
      setUserSearchError('')

      try {
        setDirectoryUsers(await userDirectoryRepository.getUsers())
      } catch (searchError) {
        setDirectoryUsers([])
        setUserSearchError(searchError instanceof Error ? searchError.message : mt('page.t126'))
      } finally {
        setIsSearchingUsers(false)
      }
    },
    [userDirectoryRepository],
  )

  useEffect(() => {
    if (!isUserPickerOpen) {
      return
    }

    if (directoryUsers.length > 0) {
      return
    }

    void loadDirectoryUsers()
  }, [directoryUsers.length, isUserPickerOpen, loadDirectoryUsers])

  useEffect(() => {
    if (!isAttachMenuOpen) return
    const handleOutsideClick = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setIsAttachMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [isAttachMenuOpen])


  const openUserProfile = useCallback(
    async (userId: number) => {
      setProfileUserId(userId)
      setProfileUser(null)
      setUserProfileError('')
      setIsUserProfileLoading(false)
      setIsUserProfileModalOpen(true)

      if (isVirtualProfileId(userId)) {
        setProfileUser(buildSmartAssistantProfile())
        setIsUserProfileLoading(false)
        return
      }

      setIsUserProfileLoading(true)

      try {
        const user = await userDirectoryRepository.getUserDetails(userId)
        setProfileUser(user)
      } catch (profileError) {
        setUserProfileError(profileError instanceof Error ? profileError.message : mt('page.t127'))
      } finally {
        setIsUserProfileLoading(false)
      }
    },
    [userDirectoryRepository],
  )

  const retryOpenUserProfile = useCallback(() => {
    if (profileUserId === null) {
      return
    }

    void openUserProfile(profileUserId)
  }, [openUserProfile, profileUserId])

  useEffect(() => {
    const handleOpenUserChat = (event: Event) => {
      const userId = (event as CustomEvent<number>).detail
      if (typeof userId !== 'number') {
        return
      }
      const existingChat = chatsRef.current.find((item) => (item.chat.type === 'personal' || item.chat.type === 'support') && item.chat.peerId === userId)
      if (existingChat) {
        setActiveChatId(existingChat.chat.id)
        setShowInfo(false)
        return
      }
      void userDirectoryRepository.getUserDetails(userId)
        .then((user) => createDraftChat(user))
        .catch((openError) => setMessageActionError(getErrorMessage(openError, mt('page.t128'))))
    }
    window.addEventListener(MESSENGER_OPEN_USER_CHAT_EVENT, handleOpenUserChat)
    return () => window.removeEventListener(MESSENGER_OPEN_USER_CHAT_EVENT, handleOpenUserChat)
  }, [createDraftChat, userDirectoryRepository])

  const openChatFromProfile = useCallback(() => {
    if (!profileUser) {
      return
    }

    if (profileUser.id <= 0) {
      setActiveChatId('smart-agent')
      setShowInfo(false)
      setIsUserProfileModalOpen(false)
      return
    }

    createDraftChat(profileUser)
    setIsUserProfileModalOpen(false)
  }, [createDraftChat, profileUser])

  const handleSubmitProfileReview = useCallback(async (input: CreateUserReviewInput) => {
    await userDirectoryRepository.submitReview(input)

    if (profileUserId !== input.targetUserId) {
      return
    }

    const refreshedProfile = await userDirectoryRepository.getUserDetails(input.targetUserId)
    setProfileUser(refreshedProfile)
  }, [profileUserId, userDirectoryRepository])

  const startChatListPanelResize = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (isMobileLayout) {
        return
      }

      event.preventDefault()
      chatListResizeStartXRef.current = event.clientX
      chatListResizeStartWidthRef.current = chatListPanelWidth
      setIsChatListPanelResizing(true)
    },
    [chatListPanelWidth, isMobileLayout],
  )

  const handleSelectChat = useCallback((chatId: string) => {
    setIsSmartAgentListOpen(chatId.startsWith('smart-agent'))
    setActiveChatId(chatId)
    setShowInfo(false)
    setChatListContextMenu(null)
    setChatListActionError('')
  }, [])

  const handleBackToChatList = useCallback(() => {
    setActiveChatId(null)
    setShowInfo(false)
    setIsEmojiPickerOpen(false)
    setMessageContextMenu(null)
    setSelectedMessages({ ids: [], anchorId: null })
    closeChatSearch()
  }, [closeChatSearch])

  const selectMessengerSection = useCallback(
    (nextFilter: 'all' | 'groups' | 'channels' | 'calls') => {
      if (isSmartAgentChat || nextFilter === 'calls') {
        setActiveChatId(null)
      }
      setIsSmartAgentListOpen(false)
      setSelectedFolderId(null)
      setUnreadOnly(false)
      setFilter(nextFilter)
      if (nextFilter === 'calls') {
        setCallsActiveTab('welcome')
      }
    },
    [isSmartAgentChat],
  )

  const renderChatListFooter = () => (
    <div className="messenger-list-footer">
            <button
              type="button"
              className="messenger-axis-entry"
              onClick={() => {
                setIsSmartAgentListOpen(true)
                setActiveChatId(isMobileLayout ? null : smartAgentSessionId ? `smart-agent:${smartAgentSessionId}` : 'smart-agent')
                setSelectedFolderId(null)
                setUnreadOnly(false)
                setFilter('all')
              }}
              aria-pressed={isSmartAgentListMode}
              title={mt('page.t129')}
              style={{
                height: 36,
                padding: isMobileLayout ? '0 10px' : '0 12px',
                borderRadius: 11,
                border: `1px solid ${isSmartAgentListMode ? `${C.blue}55` : C.border}`,
                background: isSmartAgentListMode ? C.blueSoft : '#FFFFFF',
                color: C.blue,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 12,
                fontWeight: 750,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <MS name="auto_awesome" size={17} color={C.blue} />
              <span>Axis AI</span>
            </button>
      <div className="messenger-list-tools">
            <button
              type="button"
              onClick={openThemePanel}
              aria-pressed={isThemePanelOpen}
              title={mt('page.t130')}
              style={{
                width: 36,
                height: 36,
                borderRadius: 11,
                border: `1px solid ${isThemePanelOpen || hasSavedChatTheme ? `${C.blue}33` : C.border}`,
                background: isThemePanelOpen || hasSavedChatTheme ? C.blueSoft : '#FFFFFF',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
              }}
            >
              <ThemeSettingsIcon color={isThemePanelOpen || hasSavedChatTheme ? C.blue : C.inkMuted} />
            </button>
      </div>
    </div>
  )

  const renderChatListHeader = () => {
    const sectionTabs: Array<{ key: 'all' | 'groups' | 'channels' | 'calls'; label: string }> = [
      { key: 'all', label: mt('page.t131') },
      { key: 'groups', label: mt('page.t132') },
      { key: 'channels', label: mt('page.t133') },
      { key: 'calls', label: mt('page.t134') },
    ]

    return (
      <div
        style={{
          padding: isMobileLayout ? '14px 12px 12px' : '18px 16px 12px',
          borderBottom: `1px solid ${C.borderLight}`,
          flexShrink: 0,
          background: '#FFFFFF',
          fontFamily: '"Manrope", sans-serif',
        }}
      >
        <div className="messenger-list-title-row">
          <h2>{mt('page.t135')}</h2>
            {isSmartAgentListMode ? <button
              type="button"
              className="messenger-new-chat"
              onClick={() => {
                if (isSmartAgentListMode) {
                  startNewSmartAgentChat()
                } else {
                  resetChatCreationModal()
                  setIsUserPickerOpen(true)
                }
              }}
              title={isSmartAgentListMode ? mt('page.t136') : mt('page.t137')}
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                border: 'none',
                background: C.blue,
                color: '#FFFFFF',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                boxShadow: `0 8px 18px ${C.blue}2B`,
              }}
            >
              <MS name="add" size={20} color="#FFFFFF" /><span>{mt('page.t137')}</span>
            </button> : null}        </div>

        {filter !== 'calls' ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: '#F3F6FA',
              border: `1px solid ${C.borderLight}`,
              borderRadius: 11,
              padding: '0 12px',
              height: 38,
            }}
          >
            <MS name="search" size={17} color={C.inkMuted} />
            <input
              type="search"
              name="messenger_search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={isSmartAgentListMode ? mt('page.t138') : mt('page.t139')}
              style={{
                flex: 1,
                minWidth: 0,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: 13,
                fontWeight: 450,
                lineHeight: 1.2,
                color: C.ink,
                fontFamily: 'inherit',
              }}
            />
          </div>
        ) : null}

        <div
          role="tablist"
          aria-label={mt('page.t140')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginTop: 12,
            overflow: 'hidden',
            borderBottom: `1px solid ${C.borderLight}`,
          }}
        >
          {sectionTabs.map((tab) => {
            const isSelected =
              !isSmartAgentListMode &&
              selectedFolderId === null &&
              (tab.key === 'all' ? filter === 'all' || filter === 'personal' : filter === tab.key)
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => selectMessengerSection(tab.key)}
                style={{
                  position: 'relative',
                  flex: '1 1 0',
                  minWidth: 0,
                  height: 36,
                  padding: '0 8px',
                  border: 'none',
                  background: 'transparent',
                  color: isSelected ? C.blue : C.inkMuted,
                  fontSize: 12,
                  fontWeight: isSelected ? 750 : 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.label}
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: 8,
                    right: 8,
                    bottom: -1,
                    height: 2,
                    borderRadius: 999,
                    background: isSelected ? C.blue : 'transparent',
                  }}
                />
              </button>
            )
          })}
        </div>

        {(filter === 'all' || filter === 'personal') && !isSmartAgentListMode ? (
          <ChatListFilters
            filter={filter}
            unreadOnly={unreadOnly}
            unreadCount={totalUnreadCount}
            hiddenGroupsCount={hiddenGroups.length}
            onOpenHiddenGroups={() => {
              setHiddenGroupsError('')
              setShowHiddenGroups(true)
            }}
            folders={folders}
            selectedFolderId={selectedFolderId}
            folderUnreadCounts={folderUnreadCountById}
            onFilterChange={(nextFilter) => {
              setFilter(nextFilter)
              setSelectedFolderId(null)
            }}
            onToggleUnread={() => setUnreadOnly((value) => !value)}
            onFolderChange={(folderId) => {
              setSelectedFolderId(folderId)
              setFilter('all')
            }}
            onCreateFolder={() => {
              setIsFolderModalOpen(true)
              setEditingFolderId(null)
              setFolderName('')
              setFolderError('')
              setPendingFolderAssignmentTarget(null)
            }}
          />
        ) : isSmartAgentListMode ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, color: C.blue, fontSize: 11.5, fontWeight: 700 }}>
            <MS name="auto_awesome" size={15} color={C.blue} />
            {mt('page.t141')}
          </div>
        ) : null}
      </div>
    )
  }

  if (isLoadingChats) {
    return (
      <div role="status" aria-live="polite" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: C.inkMuted }}>
        <span
          aria-hidden="true"
          className="animate-spin motion-reduce:animate-none"
          style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid #DBEAFE', borderTopColor: C.blue, boxSizing: 'border-box' }}
        />
        <span style={{ fontSize: 14, fontWeight: 500 }}>{mt('page.t142')}</span>
      </div>
    )
  }



  return (
    <div className={isMobileLayout ? 'messenger-redesign' : 'messenger-redesign messenger-floating'} style={{ position: 'relative', display: 'flex', flex: 1, minWidth: 0, minHeight: 0, height: '100%', overflow: 'hidden', background: C.canvas, ...(isMobileLayout ? {} : themedChatCanvasStyle) }}>
      {showChatListPane ? (
      <div
        className="messenger-list-pane"
        style={{
          position: 'relative',
          width: isMobileLayout ? '100%' : chatListPanelWidth,
          maxWidth: isMobileLayout ? undefined : 'calc(100% - 400px)',
          minWidth: isMobileLayout ? undefined : MIN_CHAT_LIST_PANEL_WIDTH,
          containerType: 'inline-size',
          background: '#FFFFFF',
          borderRight: !isMobileLayout ? `1px solid ${C.border}` : 'none',
          display: 'flex',
          flexShrink: 0,
          minHeight: 0,
        }}
      >
        <div
          style={{
            width: '100%',
            background: '#FFFFFF',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            flexShrink: 0,
            fontFamily: '"Manrope", sans-serif',
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
          }}
        >
        {filter === 'calls' ? (
          <div style={{ display: 'flex', flexDirection: 'column', background: '#FFFFFF', flex: 1, minHeight: 0 }}>
            {renderChatListHeader()}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '16px', overflowY: 'auto', alignContent: 'start' }}>
              <div
                role="button"
                tabIndex={0}
                onClick={handleCreateMeetingInit}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleCreateMeetingInit() }}
                style={{
                  cursor: 'pointer',
                  borderRadius: 16,
                  border: `1.5px solid ${callsActiveTab === 'create' ? '#3390EC' : '#E8EDF2'}`,
                  background: callsActiveTab === 'create' ? '#EEF7FF' : '#F5F7FA',
                  padding: '18px 10px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 10,
                  transition: 'border-color 0.18s, background 0.18s',
                  userSelect: 'none',
                }}
              >
                <div style={{ width: 58, height: 58, borderRadius: 14, background: callsActiveTab === 'create' ? '#3390EC' : '#DDE9F8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <MS name="video_call" size={28} color={callsActiveTab === 'create' ? '#FFFFFF' : '#3390EC'} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1A1A2E', textAlign: 'center', lineHeight: 1.35 }}>{mt('page.t143')}</div>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={() => setCallsActiveTab('join')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setCallsActiveTab('join') }}
                style={{
                  cursor: 'pointer',
                  borderRadius: 16,
                  border: `1.5px solid ${callsActiveTab === 'join' ? '#3390EC' : '#E8EDF2'}`,
                  background: callsActiveTab === 'join' ? '#EEF7FF' : '#F5F7FA',
                  padding: '18px 10px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 10,
                  transition: 'border-color 0.18s, background 0.18s',
                  userSelect: 'none',
                }}
              >
                <div style={{ width: 58, height: 58, borderRadius: 14, background: callsActiveTab === 'join' ? '#3390EC' : '#DDE9F8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <MS name="add" size={28} color={callsActiveTab === 'join' ? '#FFFFFF' : '#3390EC'} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1A1A2E', textAlign: 'center', lineHeight: 1.35 }}>{mt('page.t144')}</div>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={() => { navigate('/calendar') }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/calendar') }}
                style={{
                  cursor: 'pointer',
                  borderRadius: 16,
                  border: '1.5px solid #E8EDF2',
                  background: '#F5F7FA',
                  padding: '18px 10px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 10,
                  transition: 'border-color 0.18s, background 0.18s',
                  userSelect: 'none',
                }}
              >
                <div style={{ width: 58, height: 58, borderRadius: 14, background: '#DDE9F8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <MS name="calendar_month" size={28} color="#3390EC" />
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1A1A2E', textAlign: 'center', lineHeight: 1.35 }}>{mt('page.t145')}</div>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={() => setCallsActiveTab('recordings')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setCallsActiveTab('recordings') }}
                style={{
                  cursor: 'pointer',
                  borderRadius: 16,
                  border: `1.5px solid ${callsActiveTab === 'recordings' ? '#3390EC' : '#E8EDF2'}`,
                  background: callsActiveTab === 'recordings' ? '#EEF7FF' : '#F5F7FA',
                  padding: '18px 10px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 10,
                  transition: 'border-color 0.18s, background 0.18s',
                  userSelect: 'none',
                }}
              >
                <div style={{ width: 58, height: 58, borderRadius: 14, background: callsActiveTab === 'recordings' ? '#3390EC' : '#DDE9F8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <MS name="radio_button_checked" size={28} color={callsActiveTab === 'recordings' ? '#FFFFFF' : '#3390EC'} />
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1A1A2E', textAlign: 'center', lineHeight: 1.35 }}>{mt('page.t146')}</div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {renderChatListHeader()}

        {error ? (
          <div style={{ padding: 12, fontSize: 12, color: C.red, borderBottom: `1px solid ${C.borderLight}` }}>{error}</div>
        ) : null}
        {chatListActionError ? (
          <div style={{ padding: 12, fontSize: 12, color: C.red, borderBottom: `1px solid ${C.borderLight}`, background: '#FFF8F8' }}>
            {chatListActionError}
          </div>
        ) : null}

        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: isSmartAgentListMode ? 0 : '0 0 84px', scrollbarGutter: 'stable' }}>
          {isSearchingGlobal && !isSmartAgentListMode && (
            <div style={{ padding: '8px 16px', fontSize: 11, color: C.blue, fontWeight: 700, opacity: 0.8 }}>{mt('page.t147')}</div>
          )}
          {isSmartAgentListMode ? (
            isLoadingSmartAgentConversations ? (
              <div style={{ padding: 18, fontSize: 12, color: C.inkMuted }}>{mt('page.t148')}</div>
            ) : filteredSmartAgentConversations.length === 0 ? (
              <div style={{ padding: 18, fontSize: 12, color: C.inkMuted }}>
                {search.trim() ? mt('page.t149') : mt('page.t150')}
              </div>
            ) : (
              filteredSmartAgentConversations.map((conv) => {
                const isActive = activeChatId === `smart-agent:${conv.conv_id}`
                const formattedTime = (() => {
                  try {
                    const date = new Date(conv.updated_at || conv.created_at)
                    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  } catch {
                    return ''
                  }
                })()

                return (
                  <div
                    key={conv.conv_id}
                    onClick={() => {
                      handleSelectChat(`smart-agent:${conv.conv_id}`)
                    }}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) {
                        return
                      }

                      event.preventDefault()
                      handleSelectChat(`smart-agent:${conv.conv_id}`)
                    }}
                    role="button"
                    tabIndex={0}
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={mt('page.openDialog', { name: conv.name || mt('page.t137') })}
                    className="smart-agent-chat-item group"
                    style={{
                      boxSizing: 'border-box',
                      display: 'grid',
                      gridTemplateColumns: '48px minmax(0, 1fr) 60px',
                      columnGap: 10,
                      rowGap: 2,
                      alignItems: 'center',
                      padding: '9px 12px',
                      margin: '2px 10px',
                      width: 'calc(100% - 20px)',
                      cursor: 'pointer',
                      background: isActive ? '#EEF2FF' : 'transparent',
                      color: C.ink,
                      position: 'relative',
                      borderRadius: 12,
                      transition: 'background 0.16s ease',
                      fontFamily: '"Manrope", sans-serif',
                    }}
                  >
                    <div style={{ gridRow: '1 / span 2' }}>
                      <MessengerAvatar initials="SA" imageUrl={null} size={48} seed={777} online={false} />
                    </div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: C.ink,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        lineHeight: 1.2,
                      }}
                    >
                      {conv.name || mt('page.t137')}
                    </div>

                    <div
                      style={{
                        gridColumn: '3',
                        gridRow: '1 / span 2',
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        width: '100%',
                        height: '100%',
                      }}
                    >
                      <div
                        className="smart-agent-time"
                        style={{
                          fontSize: 12,
                          color: isActive ? C.blue : '#94A3B8',
                          fontWeight: 500,
                          whiteSpace: 'nowrap',
                          position: 'absolute',
                          top: 2,
                          right: 0,
                          display: isMobileLayout ? 'none' : 'block',
                          transition: 'opacity 0.15s ease, visibility 0.15s ease',
                        }}
                      >
                        {formattedTime}
                      </div>

                      {/* Actions: Rename / Delete */}
                      <div
                        className="smart-agent-actions"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          zIndex: 10,
                          opacity: isMobileLayout ? 1 : 0,
                          visibility: isMobileLayout ? 'visible' : 'hidden',
                          transition: 'opacity 0.15s ease, visibility 0.15s ease',
                        }}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            const newName = prompt(mt('page.t151'), conv.name)
                            if (newName?.trim()) {
                              void handleRenameSmartAgentConversation(conv.conv_id, newName.trim())
                            }
                          }}
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 4,
                            border: 'none',
                            background: isActive ? '#FFFFFF' : 'rgba(0,0,0,0.05)',
                            color: '#707579',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          title={mt('page.t152')}
                        >
                          <MS name="edit" size={15} color="#707579" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (confirm(mt('page.t153'))) {
                              void handleDeleteSmartAgentConversation(conv.conv_id)
                            }
                          }}
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 4,
                            border: 'none',
                            background: isActive ? '#FFFFFF' : 'rgba(0,0,0,0.05)',
                            color: '#FF4D4F',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          title={mt('page.t154')}
                        >
                          <MS name="delete" size={15} color="#FF4D4F" />
                        </button>
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: 14,
                        color: isActive ? '#596985' : '#707579',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        minWidth: 0,
                        lineHeight: 1.26,
                      }}
                    >
                      {conv.last_message || mt('page.t155')}
                    </div>

                    <style>{`
                      .smart-agent-chat-item:hover .smart-agent-actions {
                        opacity: 1 !important;
                        visibility: visible !important;
                      }
                      .smart-agent-chat-item:focus-within .smart-agent-actions {
                        opacity: 1 !important;
                        visibility: visible !important;
                      }
                      .smart-agent-chat-item:hover .smart-agent-time {
                        opacity: 0 !important;
                        visibility: hidden !important;
                      }
                      .smart-agent-chat-item:focus-within .smart-agent-time {
                        opacity: 0 !important;
                        visibility: hidden !important;
                      }
                    `}</style>
                  </div>
                )
              })
            )
          ) : allDisplayItems.length === 0 ? (
            <div style={{ padding: 18, fontSize: 12, color: C.inkMuted }}>{search.trim() ? mt('page.t156') : selectedFolderId ? mt('page.t157') : mt('page.t158')}</div>
          ) : allDisplayItems.map((item, index) => {
            const previousItem = index > 0 ? allDisplayItems[index - 1] : null
            const showGlobalHeader = item.isGlobal && !previousItem?.isGlobal

            return (
              <React.Fragment key={item.chat.id}>
                {showGlobalHeader ? (
                  <div style={{ padding: '14px 16px 8px', fontSize: 11, fontWeight: 800, color: C.blue, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {mt('page.t159')}
                  </div>
                ) : null}
                <ContactItem
                  item={item}
                  isActive={activeChat?.chat.id === item.chat.id}
                  typingLabel={typingByChat[item.chat.id] ? mt('page.typing', { name: typingByChat[item.chat.id].label }) : undefined}
                  onClick={() => {
                    handleSelectChat(item.chat.id)
                  }}
                  onContextMenu={item.isDraft ? undefined : (event) => openChatListContextMenu(event, item.chat.id)}
                />
              </React.Fragment>
            )
          })}
          {!isSmartAgentListMode && search.trim().length >= CHAT_SEARCH_MIN_QUERY_LENGTH && sidebarMessageSearch.query === search.trim() ? (
            <GlobalMessageSearchResults
              results={sidebarMessageSearch.results}
              totalCount={sidebarMessageSearch.totalCount}
              hasMore={sidebarMessageSearch.hasMore}
              isLoading={sidebarMessageSearch.isLoading}
              error={sidebarMessageSearch.error}
              onSelect={(item) => {
                setSelectedFolderId(null)
                setUnreadOnly(false)
                setFilter('all')
                handleChatSearchResultClick(item)
              }}
              onLoadMore={() => {
                if (!sidebarMessageSearch.isLoading) void loadSidebarMessageSearch(search.trim(), sidebarMessageSearch.offset, sidebarMessageSearchRequestIdRef.current, filter === 'groups' ? 'group' : filter === 'channels' ? 'channel' : filter === 'personal' ? 'personal' : undefined)
              }}
            />
          ) : null}
        </div>
          </>
        )}
        {!isSmartAgentListMode && filter !== 'calls' ? (
          <div ref={newChatMenuRef} style={{ position: 'absolute', right: 16, bottom: 88, zIndex: 20, display: 'grid', justifyItems: 'end', gap: 10 }}>
            {isNewChatMenuOpen ? (
              <div role="menu" aria-label={mt('page.t160')} style={{ minWidth: 230, padding: 6, borderRadius: 14, background: '#FFFFFF', border: '1px solid #E1E7F0', boxShadow: '0 12px 32px rgba(31,45,72,0.18)' }}>
                {([
                  ['channel', 'campaign', mt('page.t161')],
                  ['group', 'groups', mt('page.t162')],
                  ['conference', 'call', mt('page.t163')],
                  ['personal', 'person', mt('page.t164')],
                ] as const).map(([key, icon, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="menuitem"
                    className="message-context-menu__item"
                    onClick={() => {
                      setIsNewChatMenuOpen(false)
                      if (key === 'conference') {
                        setFilter('calls')
                        handleCreateMeetingInit()
                        return
                      }
                      resetChatCreationModal()
                      setChatCreationMode(key)
                      setIsUserPickerOpen(true)
                    }}
                  >
                    <MS name={icon} size={22} color="currentColor" />
                    <span className="message-context-menu__label">{label}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              aria-label={isNewChatMenuOpen ? mt('page.t165') : mt('page.t166')}
              aria-haspopup="menu"
              aria-expanded={isNewChatMenuOpen}
              onClick={() => setIsNewChatMenuOpen((prev) => !prev)}
              style={{ width: 54, height: 54, borderRadius: 999, border: 'none', background: C.blue, boxShadow: `0 10px 24px ${C.blue}40`, cursor: 'pointer', display: 'grid', placeItems: 'center' }}
            >
              <MS name={isNewChatMenuOpen ? 'close' : 'edit'} size={24} color="#FFFFFF" />
            </button>
          </div>
        ) : null}
        {renderChatListFooter()}
        </div>
      </div>
      ) : null}

      {!isMobileLayout ? (
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={mt('page.t167')}
        aria-valuemin={MIN_CHAT_LIST_PANEL_WIDTH}
        aria-valuemax={MAX_CHAT_LIST_PANEL_WIDTH}
        aria-valuenow={chatListPanelWidth}
        tabIndex={0}
        onMouseDown={startChatListPanelResize}
        onDoubleClick={() => setChatListPanelWidth(DEFAULT_CHAT_LIST_PANEL_WIDTH)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
            return
          }

          event.preventDefault()
          const direction = event.key === 'ArrowRight' ? 1 : -1
          setChatListPanelWidth((currentWidth) => clampChatListPanelWidth(currentWidth + direction * 16))
        }}
        style={{
          width: 6,
          flexShrink: 0,
          cursor: 'col-resize',
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'center',
          background: isChatListPanelResizing ? 'rgba(36, 117, 255, 0.08)' : 'transparent',
        }}
        title={mt('page.t168')}
      >
        <div
          style={{
            width: 1,
            borderRadius: 999,
            margin: '12px 0',
            background: isChatListPanelResizing ? C.blue : 'rgba(130, 149, 184, 0.38)',
            transition: 'background 0.16s ease',
          }}
        />
      </div>
      ) : null}

      {isUserPickerOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(10, 22, 40, 0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 400,
          }}
          onClick={() => {
            setIsUserPickerOpen(false)
            resetChatCreationModal()
          }}
        >
          <div
            style={{
              width: 480,
              maxWidth: 'calc(100vw - 32px)',
              maxHeight: 'min(72vh, 640px)',
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 18,
              boxShadow: '0 20px 60px rgba(10,22,40,0.18)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ padding: '18px 20px 14px', borderBottom: `1px solid ${C.borderLight}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: C.ink }}>
                    {chatCreationMode === 'channel' && channelCreationStep === 2 ? mt('page.t169') : mt('page.t137')}
                  </div>
                  <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 4 }}>
                    {chatCreationMode === 'channel' && channelCreationStep === 2
                      ? mt('page.channelCreated', { name: channelCreateName })
                      : mt('page.t170')}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsUserPickerOpen(false)
                    resetChatCreationModal()
                  }}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    border: `1px solid ${C.borderLight}`,
                    background: C.canvas,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <MS name="close" size={16} color={C.inkMuted} />
                </button>
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 20px' }}>
              {chatCreationMode === 'channel' && channelCreationStep === 2 ? null : (
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  {[
                    { key: 'personal', label: mt('page.t171') },
                    { key: 'group', label: mt('page.t074') },
                    { key: 'channel', label: mt('page.t027') },
                  ].map((mode) => (
                    <button
                      key={mode.key}
                      type="button"
                      onClick={() => {
                        setChatCreationMode(mode.key as 'personal' | 'group' | 'channel')
                        setGroupCreateError('')
                        setChannelCreateError('')
                      }}
                      style={{
                        flex: 1,
                        height: 38,
                        borderRadius: 12,
                        border: `1px solid ${chatCreationMode === mode.key ? `${C.blue}33` : C.borderLight}`,
                        background: chatCreationMode === mode.key ? C.blueSoft : C.canvas,
                        color: chatCreationMode === mode.key ? C.blue : C.inkMuted,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              )}

              {chatCreationMode !== 'channel' || channelCreationStep === 2 ? (
                <div style={{ position: 'relative', marginBottom: 16 }}>
                  <MS
                    name="search"
                    size={18}
                    color={C.inkMuted}
                    style={{ position: 'absolute', left: 12, top: 12 }}
                  />
                  <input
                    type="search"
                    name="messenger_user_search"
                    autoComplete="off"
                    value={userSearchQuery}
                    onChange={(event) => setUserSearchQuery(event.target.value)}
                    placeholder={mt('page.t172')}
                    style={{
                      width: '100%',
                      height: 42,
                      borderRadius: 12,
                      border: `1px solid ${C.border}`,
                      background: C.canvas,
                      padding: '0 12px 0 40px',
                      outline: 'none',
                      fontSize: 13,
                      color: C.ink,
                      fontFamily: 'inherit',
                    }}
                  />
                </div>
              ) : null}

              {chatCreationMode === 'group' ? (
                <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
                  <input
                    value={groupCreateName}
                    onChange={(event) => setGroupCreateName(event.target.value)}
                    placeholder={mt('page.t173')}
                    style={{
                      width: '100%',
                      height: 42,
                      borderRadius: 12,
                      border: `1px solid ${C.border}`,
                      background: C.canvas,
                      padding: '0 12px',
                      outline: 'none',
                      fontSize: 13,
                      color: C.ink,
                      fontFamily: 'inherit',
                    }}
                  />
                  <input
                    value={groupCreateDescription}
                    onChange={(event) => setGroupCreateDescription(event.target.value)}
                    placeholder={mt('page.t174')}
                    style={{
                      width: '100%',
                      height: 42,
                      borderRadius: 12,
                      border: `1px solid ${C.border}`,
                      background: C.canvas,
                      padding: '0 12px',
                      outline: 'none',
                      fontSize: 13,
                      color: C.ink,
                      fontFamily: 'inherit',
                    }}
                  />
                  {groupCreateError ? <div style={{ fontSize: 12, color: C.red }}>{groupCreateError}</div> : null}
                </div>
              ) : null}

              {chatCreationMode === 'channel' && channelCreationStep === 1 ? (
                <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {[
                      { key: 'public', label: mt('page.t175'), icon: 'public' },
                      { key: 'private', label: mt('page.t176'), icon: 'lock' },
                    ].map((type) => (
                      <button
                        key={type.key}
                        type="button"
                        onClick={() => {
                          setChannelCreateType(type.key as 'public' | 'private')
                          if (type.key === 'private') {
                            setChannelCreateUsername('')
                          }
                        }}
                        style={{
                          flex: 1,
                          height: 38,
                          borderRadius: 10,
                          border: `1px solid ${channelCreateType === type.key ? `${C.blue}33` : C.borderLight}`,
                          background: channelCreateType === type.key ? C.blueSoft : C.canvas,
                          color: channelCreateType === type.key ? C.blue : C.inkMuted,
                          fontSize: 12,
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          cursor: 'pointer',
                        }}
                      >
                        <MS name={type.icon} size={16} color={channelCreateType === type.key ? C.blue : C.inkMuted} />
                        {type.label}
                      </button>
                    ))}
                  </div>

                  <div style={{ fontSize: 12, color: C.inkMuted, lineHeight: 1.4, padding: '0 4px' }}>
                    {channelCreateType === 'public'
                      ? mt('page.t177')
                      : mt('page.t178')}
                  </div>

                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 4px' }}>{mt('page.t179')}</div>
                    <input
                      value={channelCreateName}
                      onChange={(event) => setChannelCreateName(event.target.value)}
                      placeholder={mt('page.t180')}
                      style={{
                        width: '100%',
                        height: 42,
                        borderRadius: 12,
                        border: `1px solid ${C.border}`,
                        background: C.canvas,
                        padding: '0 12px',
                        outline: 'none',
                        fontSize: 13,
                        color: C.ink,
                        fontFamily: 'inherit',
                      }}
                    />
                    <input
                      value={channelCreateDescription}
                      onChange={(event) => setChannelCreateDescription(event.target.value)}
                      placeholder={mt('page.t181')}
                      style={{
                        width: '100%',
                        height: 42,
                        borderRadius: 12,
                        border: `1px solid ${C.border}`,
                        background: C.canvas,
                        padding: '0 12px',
                        outline: 'none',
                        fontSize: 13,
                        color: C.ink,
                        fontFamily: 'inherit',
                      }}
                    />
                  </div>

                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 4px' }}>{mt('page.t182')}</div>
                    {channelCreateType === 'public' ? (
                      <div>
                        <div style={{ position: 'relative' }}>
                          <span style={{ position: 'absolute', left: 12, top: 12, color: C.inkMuted, fontSize: 13 }}>@</span>
                          <input
                            value={channelCreateUsername}
                            onChange={(event) => setChannelCreateUsername(event.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                            onKeyDown={handleChannelUsernameKeyDown}
                            placeholder={mt('page.t183')}
                            style={{
                              width: '100%',
                              height: 42,
                              borderRadius: 12,
                              border: `1px solid ${C.border}`,
                              background: C.canvas,
                              padding: '0 12px 0 30px',
                              outline: 'none',
                              fontSize: 13,
                              color: C.ink,
                              fontFamily: 'inherit',
                            }}
                          />
                        </div>
                        <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 6, lineHeight: 1.4, padding: '0 4px' }}>
                          {mt('page.t184')}
                        </div>
                      </div>
                    ) : (
                      <div style={{ background: C.canvas, padding: '12px', borderRadius: 12, border: `1px solid ${C.borderLight}`, borderStyle: 'dashed' }}>
                        <div style={{ fontSize: 13, color: C.blue, fontWeight: 600 }}>
                          /web/messenger/...
                        </div>
                        <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 4, lineHeight: 1.4 }}>
                          {mt('page.t185')}
                        </div>
                      </div>
                    )}
                  </div>

                  {channelCreateError ? <div style={{ fontSize: 12, color: C.red, padding: '0 4px' }}>{channelCreateError}</div> : null}
                </div>
              ) : null}

              {chatCreationMode === 'channel' && channelCreationStep === 1 ? (
                <div style={{ padding: '8px 10px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                  <div
                    style={{
                      width: 54,
                      height: 54,
                      borderRadius: 18,
                      background: C.blueSoft,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 12,
                    }}
                  >
                    <MS name="campaign" size={28} color={C.blue} />
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 6 }}>{mt('page.t186')}</div>
                  <div style={{ fontSize: 13, color: C.inkMuted, lineHeight: 1.5, maxWidth: 320 }}>
                    {mt('page.t187')}
                  </div>
                </div>
              ) : null}

              {(chatCreationMode !== 'channel' || channelCreationStep === 2) && isSearchingUsers ? (
                <div style={{ padding: 20, fontSize: 13, color: C.inkMuted }}>{mt('page.t188')}</div>
              ) : null}

              {(chatCreationMode !== 'channel' || channelCreationStep === 2) && !isSearchingUsers && userSearchError ? (
                <div style={{ padding: 20, fontSize: 13, color: C.red }}>{userSearchError}</div>
              ) : null}

              {(chatCreationMode !== 'channel' || channelCreationStep === 2) && !isSearchingUsers && !userSearchError && filteredDirectoryUsers.length === 0 ? (
                <div style={{ padding: 20, fontSize: 13, color: C.inkMuted }}>{mt('page.t189')}</div>
              ) : null}

              {(chatCreationMode !== 'channel' || channelCreationStep === 2) && !isSearchingUsers &&
                !userSearchError &&
                filteredDirectoryUsers.map((user) => {
                  const title = user.fullName || user.username || `User ${user.id}`
                  const isMultiSelect = chatCreationMode === 'group' || (chatCreationMode === 'channel' && channelCreationStep === 2)

                  return (
                    <button
                      key={user.id}
                      onClick={() => {
                        if (isMultiSelect) {
                          setSelectedNewGroupMemberIds((prev) => (prev.includes(user.id) ? prev.filter((id) => id !== user.id) : [...prev, user.id]))
                          return
                        }

                        createDraftChat(user)
                      }}
                      style={{
                        width: '100%',
                        border: isMultiSelect ? `1px solid ${selectedNewGroupMemberIds.includes(user.id) ? `${C.blue}33` : C.borderLight}` : 'none',
                        background: isMultiSelect && selectedNewGroupMemberIds.includes(user.id) ? C.blueSoft : 'transparent',
                        textAlign: 'left',
                        padding: '12px',
                        borderRadius: 12,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(event) => {
                        if (!isMultiSelect || !selectedNewGroupMemberIds.includes(user.id)) {
                          event.currentTarget.style.background = C.blueSoft
                        }
                      }}
                      onMouseLeave={(event) => {
                        event.currentTarget.style.background = isMultiSelect && selectedNewGroupMemberIds.includes(user.id) ? C.blueSoft : 'transparent'
                      }}
                    >
                      <MessengerAvatar initials={getInitials(title)} imageUrl={user.avatarUrl} size={40} seed={getSeed(title)} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {title}
                        </div>
                      </div>
                      <MS
                        name={isMultiSelect ? (selectedNewGroupMemberIds.includes(user.id) ? 'check_circle' : 'radio_button_unchecked') : 'chevron_right'}
                        size={18}
                        color={isMultiSelect && selectedNewGroupMemberIds.includes(user.id) ? C.blue : C.inkMuted}
                      />
                    </button>
                  )
                })}
            </div>
              {chatCreationMode === 'group' || chatCreationMode === 'channel' ? (
                <div style={{ padding: '12px 20px 18px', borderTop: `1px solid ${C.borderLight}`, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsUserPickerOpen(false)
                      resetChatCreationModal()
                    }}
                    disabled={isCreatingGroup || isCreatingChannel}
                    style={{
                      height: 38,
                      padding: '0 14px',
                      borderRadius: 10,
                      border: `1px solid ${C.borderLight}`,
                      background: '#FFFFFF',
                      color: C.inkMuted,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: (isCreatingGroup || isCreatingChannel) ? 'default' : 'pointer',
                    }}
                  >
                    {mt('page.t190')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (chatCreationMode === 'group') {
                        void createGroupFromPicker()
                      } else {
                        if (channelCreationStep === 1) {
                          void createChannelFromPicker()
                        } else {
                          void finishChannelCreationWithMembers()
                        }
                      }
                    }}
                    disabled={isCreatingGroup || isCreatingChannel}
                    style={{
                      height: 38,
                      padding: '0 16px',
                      borderRadius: 10,
                      border: 'none',
                      background: `linear-gradient(135deg, ${C.blue} 0%, #4EA1FF 100%)`,
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: (isCreatingGroup || isCreatingChannel) ? 'default' : 'pointer',
                      opacity: (isCreatingGroup || isCreatingChannel) ? 0.7 : 1,
                      boxShadow: `0 10px 22px ${C.blue}2B`,
                    }}
                  >
                    {chatCreationMode === 'group'
                      ? (isCreatingGroup ? mt('page.t191') : mt('page.t192'))
                      : (channelCreationStep === 1
                          ? (isCreatingChannel ? mt('page.t191') : mt('page.t160'))
                          : (isCreatingChannel ? mt('page.t193') : mt('page.t194'))
                        )}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
      ) : null}

      {showChatPane ? (
      <div className={filter === 'calls' ? 'messenger-chat-pane messenger-chat-pane--solid' : 'messenger-chat-pane'} style={{ flex: 1, display: 'flex', flexDirection: 'column', background: !isMobileLayout && filter !== 'calls' ? 'transparent' : '#FFFFFF', minWidth: 0, minHeight: 0, position: 'relative' }}>
        {filter === 'calls' ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
            {/* Mobile header / back button if activeTab is not welcome */}
            {isMobileLayout && callsActiveTab !== 'welcome' && (
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 10, background: '#FFFFFF' }}>
                <button
                  onClick={() => setCallsActiveTab('welcome')}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
                >
                  <MS name="arrow_back" size={20} color="#2458D3" />
                </button>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                  {callsActiveTab === 'create' ? mt('page.t143') : callsActiveTab === 'join' ? mt('page.t144') : mt('page.t195')}
                </span>
              </div>
            )}

            {callsActiveTab === 'welcome' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center', gap: 16 }}>
                <MS name="videocam" size={64} color="#3390EC" />
                <div style={{ fontSize: 20, fontWeight: 700, color: '#000000', letterSpacing: '-0.01em' }}>{mt('page.t195')}</div>
              </div>
            )}

            {callsActiveTab === 'create' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
                <div style={{ width: '100%', maxWidth: 440, borderRadius: 24, border: '1px solid #E2E8F0', padding: '32px 24px', textAlign: 'center', background: '#FFFFFF', boxShadow: '0 10px 30px rgba(0,0,0,0.03)' }}>
                  <div style={{ width: 64, height: 64, borderRadius: 20, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                    <MS name="video_call" size={30} color="#2458D3" />
                  </div>
                  <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', margin: '0 0 10px' }}>{mt('page.t196')}</h3>
                  <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 24px', lineHeight: 1.5 }}>
                    {mt('page.t197')}
                  </p>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '8px 12px', marginBottom: 24 }}>
                    <input
                      type="text"
                      readOnly
                      value={`${window.location.origin}/web/meet/${newMeetingRoomName}`}
                      style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: '#0F172A', fontWeight: 500 }}
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/web/meet/${newMeetingRoomName}`)
                        setIsCopied(true)
                        setTimeout(() => setIsCopied(false), 2000)
                      }}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#2458D3', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <MS name={isCopied ? "check" : "content_copy"} size={16} />
                      <span>{isCopied ? mt('page.t198') : mt('page.t199')}</span>
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      const link = `${window.location.origin}/web/meet/${newMeetingRoomName}`
                      setShareLink(link)
                      setIsShareModalOpen(true)
                    }}
                    style={{
                      width: '100%',
                      height: 48,
                      borderRadius: 12,
                      background: '#FFFFFF',
                      color: '#2458D3',
                      border: '1.5px solid #2458D3',
                      fontSize: 15,
                      fontWeight: 700,
                      cursor: 'pointer',
                      marginBottom: 12,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                  >
                    <MS name="send" size={18} color="#2458D3" />
                    {mt('page.t200')}
                  </button>

                  <button
                    onClick={() => {
                      void joinCalendarCall({ roomName: newMeetingRoomName })
                    }}
                    style={{
                      width: '100%',
                      height: 48,
                      borderRadius: 12,
                      background: 'linear-gradient(135deg, #2458D3 0%, #1B2A8C 100%)',
                      color: '#FFFFFF',
                      border: 'none',
                      fontSize: 15,
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 10px 20px rgba(47,75,226,0.15)',
                    }}
                  >
                    {mt('page.t201')}
                  </button>
                </div>
              </div>
            )}

            {callsActiveTab === 'join' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
                <div style={{ width: '100%', maxWidth: 440, borderRadius: 24, border: '1px solid #E2E8F0', padding: '32px 24px', background: '#FFFFFF', boxShadow: '0 10px 30px rgba(0,0,0,0.03)' }}>
                  <div style={{ width: 64, height: 64, borderRadius: 20, background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                    <MS name="login" size={30} color="#2458D3" />
                  </div>
                  <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', margin: '0 0 10px', textAlign: 'center' }}>{mt('page.t202')}</h3>
                  <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 24px', lineHeight: 1.5, textAlign: 'center' }}>
                    {mt('page.t203')}
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{mt('page.t204')}</label>
                    <input
                      type="text"
                      placeholder={mt('page.t205')}
                      value={joinMeetingRoomInput}
                      onChange={(e) => setJoinMeetingRoomInput(e.target.value)}
                      style={{ height: 48, borderRadius: 12, border: '1.5px solid #E2E8F0', padding: '0 16px', fontSize: 14, outline: 'none', color: '#0F172A', fontWeight: 500 }}
                    />
                  </div>

                  <button
                    onClick={() => {
                      if (!joinMeetingRoomInput.trim()) return
                      let room = joinMeetingRoomInput.trim()
                      if (room.includes('/calls/calendar/')) {
                        room = room.substring(room.lastIndexOf('/') + 1)
                      }
                      void joinCalendarCall({ roomName: room })
                    }}
                    disabled={!joinMeetingRoomInput.trim()}
                    style={{
                      width: '100%',
                      height: 48,
                      borderRadius: 12,
                      background: 'linear-gradient(135deg, #2458D3 0%, #1B2A8C 100%)',
                      color: '#FFFFFF',
                      border: 'none',
                      fontSize: 15,
                      fontWeight: 700,
                      cursor: joinMeetingRoomInput.trim() ? 'pointer' : 'default',
                      opacity: joinMeetingRoomInput.trim() ? 1 : 0.6,
                      boxShadow: '0 10px 20px rgba(47,75,226,0.15)',
                    }}
                  >
                    {mt('page.t206')}
                  </button>
                </div>
              </div>
            )}

            {callsActiveTab === 'recordings' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: isMobileLayout ? '20px' : '32px 40px', minHeight: 0 }}>
                <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', margin: '0 0 20px' }}>{mt('page.t146')}</h3>
                
                {isLoadingRecordings ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', gap: 8 }}>
                    <span style={{ fontSize: 14 }}>{mt('page.t207')}</span>
                  </div>
                ) : recordingsError ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.red, fontSize: 14 }}>
                    {recordingsError}
                  </div>
                ) : userRecordings.length === 0 ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 20 }}>
                    <div style={{ width: 68, height: 68, borderRadius: 22, background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18, border: '1px solid #E2E8F0' }}>
                      <MS name="videocam_off" size={30} color="#94A3B8" />
                    </div>
                    <h4 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', margin: '0 0 8px' }}>{mt('page.t208')}</h4>
                    <p style={{ fontSize: 13, color: '#64748B', maxWidth: 300, margin: 0, lineHeight: 1.5 }}>
                      {mt('page.t209')}
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 14, overflowY: 'auto', flex: 1, minHeight: 0 }} className="no-scrollbar">
                    {userRecordings.map((rec) => {
                      const isCurrentlyPlaying = currentlyPlayingAudio?.egressId === rec.egressId
                      const isPlayLoading = playingEgressIds[rec.egressId]
                      const isDownloadLoading = downloadingEgressIds[rec.egressId]

                      const formattedDate = (() => {
                        try {
                          const date = new Date(rec.startedAt)
                          return formatDate(date, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
                        } catch {
                          return rec.startedAt
                        }
                      })()

                      const formattedDuration = rec.durationS 
                        ? rec.durationS > 60 
                          ? mt('page.minutes', { count: Math.floor(rec.durationS / 60) }) 
                          : mt('page.seconds', { count: rec.durationS })
                        : mt('page.t210')

                      const title = rec.roomId || mt('page.recordingN', { id: rec.egressId })

                      return (
                        <div key={rec.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 18, border: '1px solid #E2E8F0', borderRadius: 16, background: '#FFFFFF', transition: 'box-shadow 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.01)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#EEF2FF', color: '#3390EC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <MS name="videocam" size={22} />
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
                              <div style={{ fontSize: 12, color: '#64748B', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formattedDate} · {formattedDuration}</div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                            <button
                              onClick={() => void handlePlayRecording(rec.egressId)}
                              style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #E2E8F0', background: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyItems: 'center', color: '#3390EC', justifyContent: 'center' }}
                              title={isCurrentlyPlaying ? mt('page.t211') : mt('page.t212')}
                            >
                              <MS name={isPlayLoading ? "sync" : isCurrentlyPlaying ? "pause" : "play_arrow"} size={20} />
                            </button>
                            <button
                              onClick={() => void handleDownloadRecording(rec.egressId, `${title}.mp4`)}
                              style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #E2E8F0', background: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyItems: 'center', color: '#64748B', justifyContent: 'center' }}
                              title={mt('page.t213')}
                            >
                              <MS name={isDownloadLoading ? "sync" : "download"} size={18} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            {!activeChat ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 28,
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 420,
                borderRadius: 28,
                border: `1px solid ${C.borderLight}`,
                background: 'rgba(255,255,255,0.68)',
                boxShadow: '0 20px 48px rgba(10,22,40,0.08)',
                padding: '34px 28px',
                display: 'grid',
                justifyItems: 'center',
                gap: 14,
                textAlign: 'center',
                backdropFilter: 'blur(10px)',
              }}
            >
              <div
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: 24,
                  background: 'linear-gradient(135deg, #EEF5FF 0%, #E2EEFF 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
                }}
              >
                <MS name="forum" size={30} color={C.blue} />
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em' }}>
                {chats.length === 0 ? mt('page.t214') : mt('page.t215')}
              </div>
              {chats.length > 0 ? (
                <div style={{ fontSize: 14, lineHeight: 1.6, color: C.inkMuted, maxWidth: 320 }}>
                  {emptyChatStateMessageText}
                </div>
              ) : null}
              <div style={{ display: chats.length === 0 ? 'block' : 'none', fontSize: 14, lineHeight: 1.6, color: C.inkMuted, maxWidth: 320 }}>
                {chats.length === 0
                  ? mt('page.t216')
                  : mt('page.t217')}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div
              className="messenger-chat-header"
              style={{
                height: isMobileLayout ? 64 : 58,
                position: 'relative',
                zIndex: 10,
                background: themedChatSurfaceBackground,
                borderBottom: `1px solid ${themedChatSurfaceBorder}`,
                display: 'flex',
                alignItems: 'center',
                padding: isMobileLayout ? '0 12px' : '0 14px',
                gap: isMobileLayout ? 10 : 12,
                flexShrink: 0,
                fontFamily: '"Manrope", sans-serif',
                WebkitFontSmoothing: 'antialiased',
                MozOsxFontSmoothing: 'grayscale',
                backdropFilter: activeThemeConfig.backgroundType === 'default' ? undefined : 'blur(14px)',
              }}
            >
              <button
                type="button"
                onClick={handleBackToChatList}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  border: `1px solid ${C.borderLight}`,
                  background: '#FFFFFF',
                  display: isMobileLayout ? 'flex' : 'none',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                  transition: 'all 0.2s ease',
                }}
                className="hover:scale-105 active:scale-95 hover:bg-slate-50"
                title={mt('page.t218')}
              >
                <MS name="arrow_back" size={18} color={C.inkMuted} />
              </button>
              {isChatSearchOpen ? (
                <>
                  <MessengerAvatar initials={activeChat.avatar} imageUrl={activeChat.avatarUrl} size={isMobileLayout ? 38 : 40} seed={activeChat.seed} />
                  <div data-no-message-select="true" style={{ position: 'relative', flex: 1, minWidth: 0, maxWidth: 720, margin: '0 auto' }}>
                    <div style={{ height: 40, display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px 0 14px', borderRadius: 999, background: C.canvas, border: `1px solid ${C.borderLight}` }}>
                      <MS name="search" size={20} color={C.inkMuted} />
                      <input
                        type="search"
                        name="chat_message_search"
                        autoComplete="off"
                        autoFocus
                        value={chatSearchQuery}
                        onChange={(event) => {
                          setChatSearchQuery(event.target.value)
                          setIsChatSearchResultsOpen(true)
                        }}
                        onFocus={() => setIsChatSearchResultsOpen(true)}
                        onClick={() => setIsChatSearchResultsOpen(true)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && chatSearchResults.length > 0) {
                            event.preventDefault()
                            stepChatSearchResult(1)
                          }
                        }}
                        placeholder={mt('page.t219')}
                        aria-label={mt('page.t220')}
                        style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', fontSize: 16, color: C.ink, fontFamily: 'inherit' }}
                      />
                      {chatSearchResults.length > 0 ? (
                        <>
                          <button type="button" onClick={() => stepChatSearchResult(-1)} aria-label={mt('page.t221')} style={{ width: 34, height: 34, borderRadius: 999, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                            <MS name="expand_less" size={22} color={C.inkMuted} />
                          </button>
                          <button type="button" onClick={() => stepChatSearchResult(1)} aria-label={mt('page.t222')} style={{ width: 34, height: 34, borderRadius: 999, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                            <MS name="expand_more" size={22} color={C.inkMuted} />
                          </button>
                        </>
                      ) : null}
                      <button type="button" onClick={closeChatSearch} aria-label={mt('page.t223')} style={{ width: 34, height: 34, borderRadius: 999, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                        <MS name="close" size={20} color={C.inkMuted} />
                      </button>
                    </div>
                    {isChatSearchResultsOpen && chatSearchQuery.trim().length >= CHAT_SEARCH_MIN_QUERY_LENGTH ? (
                      <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, maxHeight: 'min(460px, calc(100vh - 200px))', overflowY: 'auto', padding: 6, borderRadius: 18, background: '#FFFFFF', border: `1px solid ${C.borderLight}`, boxShadow: '0 18px 42px rgba(10,22,40,0.16)', zIndex: 30 }}>
                        {chatSearchError ? <div role="alert" style={{ padding: '12px 14px', fontSize: 14, color: C.red }}>{chatSearchError}</div> : null}
                        {!chatSearchError && isChatSearchLoading && chatSearchResults.length === 0 ? <div style={{ padding: '12px 14px', fontSize: 14, color: C.inkMuted }}>{mt('page.t224')}</div> : null}
                        {!chatSearchError && !isChatSearchLoading && chatSearchResults.length === 0 ? <div style={{ padding: '12px 14px', fontSize: 14, color: C.inkMuted }}>{mt('page.t225')}</div> : null}
                        {chatSearchResults.map((item) => {
                          const isSelected = item.raw.id === selectedChatSearchResultId
                          const createdAt = new Date(item.raw.createdAt)
                          const dateLabel = isSameCalendarDate(item.raw.createdAt, new Date().toISOString())
                            ? item.timeLabel
                            : formatDate(createdAt, { day: 'numeric', month: 'short' })
                          const snippet = item.highlightedSnippet || item.snippetText || item.attachmentName || item.typeLabel || mt('page.t000')
                          return (
                            <button
                              key={item.raw.id}
                              type="button"
                              onClick={() => {
                                setIsChatSearchResultsOpen(false)
                                handleChatSearchResultClick(item)
                              }}
                              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '8px 12px', border: 'none', borderRadius: 14, background: isSelected ? C.canvas : 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
                            >
                              <MessengerAvatar initials={getInitials(item.senderLabel)} imageUrl={item.raw.senderAvatar} seed={getSeed(item.senderLabel)} size={44} />
                              <span style={{ minWidth: 0, flex: 1 }}>
                                <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                                  <span style={{ fontSize: 16, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.senderLabel}</span>
                                  <span style={{ fontSize: 12, color: C.inkMuted, flexShrink: 0 }}>{dateLabel}</span>
                                </span>
                                <span style={{ display: 'block', marginTop: 2, fontSize: 14, color: C.inkMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {snippet.split(/(⟦.*?⟧)/g).map((part, partIndex) =>
                                    part.startsWith('⟦') && part.endsWith('⟧')
                                      ? <span key={partIndex} style={{ color: C.blue }}>{part.slice(1, -1)}</span>
                                      : part,
                                  )}
                                </span>
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
              {activePeerId !== null ? (
                <button
                  type="button"
                  onContextMenu={(e) => {
                    if (activeChatId === 'smart-agent') e.preventDefault()
                  }}
                  onClick={() => {
                    if (!isMobileLayout && activeChat.chat.type === 'personal' && activePeerId > 0 && !isSmartAgentChat) {
                      setShowInfo((prev) => !prev)
                      return
                    }
                    void openUserProfile(activePeerId)
                  }}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  title={activePeerId > 0 ? mt('page.t226') : mt('page.t227')}
                >
                  <MessengerAvatar initials={activeChat.avatar} imageUrl={activeChat.avatarUrl} size={isMobileLayout ? 38 : 40} seed={activeChat.seed} online={activeChat.online} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 750, color: C.ink, letterSpacing: '-0.018em', lineHeight: 1.2 }}>
                      {activeChat.title}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: !isSmartAgentChat && activeChat.online ? C.green : C.inkMuted,
                        marginTop: 2,
                        fontWeight: 400,
                        lineHeight: 1.2,
                        letterSpacing: '-0.004em',
                      }}
                    >
                      {isSmartAgentChat
                        ? mt('page.t031')
                        : activeChat.online
                          ? mt('page.t228')
                          : activeChat.chat.type === 'group'
                            ? mt('page.t074')
                            : formatLastSeen(activeChat.chat.lastSeenAt)}
                    </div>
                  </div>
                </button>
              ) : (
                <>
                <button
                  type="button"
                  onClick={() => setShowInfo(prev => !prev)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  title={activeChat.chat.type === 'channel' ? mt('page.t229') : mt('page.t230')}
                >
                  <MessengerAvatar initials={activeChat.avatar} imageUrl={activeChat.avatarUrl} size={isMobileLayout ? 38 : 40} seed={activeChat.seed} online={activeChat.online} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 750, color: C.ink, letterSpacing: '-0.018em', lineHeight: 1.2 }}>
                      {activeChat.title}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: activeChat.online ? C.green : C.inkMuted,
                        marginTop: 2,
                        fontWeight: 400,
                        lineHeight: 1.2,
                        letterSpacing: '-0.004em',
                      }}
                    >
                      {activeChat.online
                        ? mt('page.t228')
                        : activeChat.chat.type === 'group'
                          ? mt('page.t074')
                          : activeChat.chat.type === 'channel'
                            ? mt('page.t027')
                            : formatLastSeen(activeChat.chat.lastSeenAt)}
                    </div>
                  </div>
                </button>
                </>
              )}
              {MESSENGER_VIDEO_CALLS_ENABLED && canStartCallInActiveChat ? (
                <button
                  type="button"
                  onClick={() => void handleStartActiveChatCall()}
                  disabled={isCallBusy}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 9,
                    background: isCallBusy ? '#F4F7FB' : '#EEF5FF',
                    border: `1px solid ${isCallBusy ? C.borderLight : `${C.blue}22`}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: isCallBusy ? 'default' : 'pointer',
                    boxShadow: isCallBusy ? 'none' : '0 8px 18px rgba(47,75,226,0.12)',
                    opacity: isCallBusy ? 0.7 : 1,
                  }}
                  title={
                    isCallBusy
                      ? callBusyLabel
                      : activeChat.chat.type === 'group'
                        ? mt('page.t231')
                        : mt('page.t232')
                  }
                >
                  <MS name="videocam" size={18} color={isCallBusy ? C.inkMuted : C.blue} />
                </button>
              ) : null}
              {canSearchInActiveChat ? (
                <button
                  type="button"
                  onClick={() => {
                    if (isChatSearchOpen) {
                      closeChatSearch()
                      return
                    }

                    setIsChatSearchOpen(true)
                    setChatSearchError('')
                    setChatSearchInfo('')
                    setSelectedChatSearchResultId(null)
                  }}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 9,
                    background: isChatSearchOpen ? '#EEF5FF' : 'transparent',
                    border: `1px solid ${isChatSearchOpen ? `${C.blue}22` : C.borderLight}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: isChatSearchOpen ? '0 8px 18px rgba(47,75,226,0.12)' : 'none',
                  }}
                  title={isChatSearchOpen ? mt('page.t223') : mt('page.t220')}
                >
                  <MS name="search" size={17} color={isChatSearchOpen ? C.blue : C.inkSub} />
                </button>
              ) : null}
              {(activeChat.chat.type === 'personal' || activeChat.chat.type === 'group') && !activeChat.isDraft ? (
                <button
                  type="button"
                  onClick={() => setShowSharedMedia(true)}
                  title={mt('page.t233')}
                  aria-label={mt('page.t233')}
                  style={{ width: 36, height: 36, borderRadius: 9, background: 'transparent', border: `1px solid ${C.borderLight}`, display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}
                >
                  <MS name="image" size={18} color={C.inkSub} />
                </button>
              ) : null}
                </>
              )}
            </div>

            {messageActionError ? (
              <div style={{ padding: '10px 18px', fontSize: 12, color: C.red, background: '#FFF6F6', borderBottom: `1px solid ${C.borderLight}` }}>
                {messageActionError}
              </div>
            ) : null}

            {selectedMessageViews.length > 0 ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '8px 14px',
                  background: '#E7F0FC',
                  borderBottom: `1px solid ${C.borderLight}`,
                }}
              >
                <button
                  type="button"
                  onClick={clearSelectedMessages}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 999,
                    border: 'none',
                    background: 'rgba(255,255,255,0.78)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(10,22,40,0.04)',
                  }}
                  title={mt('page.t234')}
                >
                  <MS name="close" size={16} color={C.inkMuted} />
                </button>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 90 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.ink, lineHeight: 1 }}>{selectedMessageViews.length}</div>
                  <div style={{ fontSize: 13, color: C.inkMuted, fontWeight: 700, lineHeight: 1 }}>{mt('page.t235')}</div>
                </div>
                <div style={{ flex: 1 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {canForwardMessages ? (
                    <button
                      type="button"
                      onClick={() => openForwardModal()}
                      disabled={isForwardingMessages || isMessageActionLoading}
                      style={{ width: 40, height: 40, borderRadius: 12, border: 'none', background: 'transparent', color: C.ink, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title={mt('page.t236')}
                    >
                      <MS name="reply" size={18} color={C.ink} style={{ transform: 'scaleX(-1)' }} />
                    </button>
                  ) : null}
                  {canManageChannelPosts && (
                    <button type="button" onClick={() => setIsDeleteConfirmOpen(true)} disabled={isMessageActionLoading} style={{ width: 40, height: 40, borderRadius: 12, border: 'none', background: 'transparent', color: C.red, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title={mt('page.t154')}><MS name="delete" size={18} color={C.red} /></button>
                  )}
                  {selectedMessageViews.length === 1 ? (
                    <>
                      {canManageChannelPosts && (
                        <button type="button" onClick={() => void handleTogglePinMessage()} disabled={isMessageActionLoading} style={{ width: 40, height: 40, borderRadius: 12, border: 'none', background: selectedMessage && pinnedMessageIds.has(selectedMessage.raw.id) ? 'rgba(255,255,255,0.72)' : 'transparent', color: selectedMessage && pinnedMessageIds.has(selectedMessage.raw.id) ? C.blue : C.ink, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title={selectedMessage && pinnedMessageIds.has(selectedMessage.raw.id) ? mt('page.t237') : mt('page.t238')}><PinnedIcon size={18} color={selectedMessage && pinnedMessageIds.has(selectedMessage.raw.id) ? C.blue : C.ink} /></button>
                      )}
                      {canManageChannelPosts && (
                        <button type="button" onClick={() => void handleLoadMessageViewers()} disabled={isMessageActionLoading} style={{ width: 40, height: 40, borderRadius: 12, border: 'none', background: 'transparent', color: C.ink, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title={mt('page.t239')}><MS name="visibility" size={18} color={C.ink} /></button>
                      )}
                      {isMessageEditable(selectedMessage) ? (
                        <button type="button" onClick={() => void handleEditSelectedMessage()} disabled={isMessageActionLoading} style={{ width: 40, height: 40, borderRadius: 12, border: 'none', background: 'transparent', color: C.ink, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title={mt('page.t240')}><MS name="edit" size={18} color={C.ink} /></button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}

            {pinnedMessages.length > 0 ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  background: '#FFFFFF',
                  ...(isMobileLayout
                    ? { padding: '10px 18px', borderBottom: `1px solid ${C.borderLight}`, boxShadow: '0 1px 0 rgba(10,22,40,0.02)' }
                    : { position: 'relative' as const, zIndex: 4, margin: '8px 12px 0 6px', padding: '8px 14px', border: '1px solid #E1E7F0', borderRadius: 16, boxShadow: '0 8px 28px rgba(10,22,40,0.08)' }),
                }}
              >
                <div
                  style={{
                    width: 3,
                    alignSelf: 'stretch',
                    borderRadius: 999,
                    background: `linear-gradient(180deg, ${C.blue} 0%, #64B5F6 100%)`,
                    boxShadow: `0 0 0 1px ${C.blue}22`,
                    flexShrink: 0,
                  }}
                />
                <button
                  type="button"
                  onClick={handlePinnedMessageClick}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 500, color: C.blue, lineHeight: 1.2 }}>
                    {mt('page.t241')}
                    {pinnedMessages.length > 1 ? (
                      <span style={{ color: C.inkMuted }}>{` · ${mt('page.ofCount', { index: activePinnedIndex + 1, total: pinnedMessages.length })}`}</span>
                    ) : null}
                  </div>
                  <div
                    style={{
                      marginTop: 3,
                      fontSize: 13,
                      lineHeight: 1.35,
                      color: C.ink,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {getFriendlyMessageText(
                      activePinnedMessageView?.text?.trim() || activePinnedMessage?.content?.trim(),
                      activePinnedMessage?.type || activePinnedMessageView?.kind || 'text'
                    )}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    setIsPinnedMessagesPanelOpen(true)
                  }}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    border: 'none',
                    background: 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                  title={mt('page.t242')}
                >
                  <MS name="format_list_bulleted" size={18} color={C.inkMuted} />
                </button>
              </div>
            ) : null}

            <div style={{ flex: 1, minHeight: 0, minWidth: 0, position: 'relative', ...(isMobileLayout ? themedChatCanvasStyle : {}) }}>
              <div
                ref={messagesScrollerRef}
                onScroll={handleMessagesScroll}
                style={{
                  flex: 1,
                  minHeight: 0,
                  minWidth: 0,
                  height: '100%',
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  paddingTop: isMobileLayout ? 14 : 20,
                  paddingBottom: isMobileLayout ? 14 : 20,
                  paddingLeft: isMobileLayout ? 12 : 24,
                  paddingRight: isMobileLayout ? 12 : 24,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
              <div
                style={{
                  width: '100%',
                  maxWidth: '100%',
                  marginTop: 'auto',
                  flexShrink: 0,
                }}
              >
              {isLoadingOlderMessages ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 10px' }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: C.inkMuted,
                      background: 'rgba(255,255,255,0.84)',
                      border: `1px solid ${C.borderLight}`,
                      borderRadius: 999,
                      padding: '5px 10px',
                    }}
                  >
                    {mt('page.t243')}
                  </div>
                </div>
              ) : null}
              {historyError ? (
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: C.red,
                      background: '#FFFFFF',
                      border: `1px solid ${C.borderLight}`,
                      borderRadius: 12,
                      padding: '8px 12px',
                      boxShadow: '0 2px 10px rgba(10,22,40,0.06)',
                    }}
                  >
                    {historyError}
                  </div>
                </div>
              ) : null}
              {isLoadingMessages ? (
                <ChatHistoryLoadingState />
              ) : (
                messages.map((msg, index) => {
                  const previousMessage = index > 0 ? messages[index - 1] : null
                  const shouldShowDaySeparator =
                    !previousMessage || !isSameCalendarDate(previousMessage.raw.createdAt, msg.raw.createdAt)
                  const nextMessage = index < messages.length - 1 ? messages[index + 1] : null
                  const isLastInSeries =
                    !nextMessage ||
                    nextMessage.raw.senderId !== msg.raw.senderId ||
                    !isSameCalendarDate(msg.raw.createdAt, nextMessage.raw.createdAt)

                  return (
                    <div
                      key={msg.raw.id}
                      ref={(node) => {
                        messageItemRefs.current[msg.raw.id] = node
                      }}
                      data-message-id={msg.raw.id}
                    >
                      {shouldShowDaySeparator ? (
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'center',
                            margin: '14px 0 10px',
                          }}
                        >
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: C.inkMuted,
                              background: 'rgba(255,255,255,0.72)',
                              border: `1px solid ${C.borderLight}`,
                              borderRadius: 999,
                              padding: '4px 10px',
                              boxShadow: '0 1px 2px rgba(10,22,40,0.04)',
                            }}
                          >
                            {formatDaySeparatorLabel(msg.raw.createdAt)}
                          </div>
                        </div>
                      ) : null}
                      <div
                        onClick={(event) => handleMessageLeftClick(event, msg.raw.id)}
                        onContextMenu={(event) => openMessageContextMenu(event, msg.raw.id)}
                        style={{
                          padding: selectedMessageSet.has(msg.raw.id) || highlightedSearchMessageId === msg.raw.id ? 6 : 0,
                          borderRadius: 16,
                          background: selectedMessageSet.has(msg.raw.id)
                            ? 'rgba(76,158,255,0.08)'
                            : highlightedSearchMessageId === msg.raw.id
                              ? 'rgba(47,75,226,0.08)'
                              : 'transparent',
                          border: selectedMessageSet.has(msg.raw.id)
                            ? `1px solid ${C.blue}22`
                            : highlightedSearchMessageId === msg.raw.id
                              ? `1px solid ${C.blue}44`
                              : '1px solid transparent',
                          boxShadow: highlightedSearchMessageId === msg.raw.id ? '0 14px 34px rgba(47,75,226,0.12)' : 'none',
                          transition: 'background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease',
                          cursor: 'pointer',
                        }}
                      >
                        {pinnedMessageIds.has(msg.raw.id) ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4, color: C.blue, fontSize: 11, fontWeight: 700 }}>
                            <PinnedIcon size={12} color={C.blue} />
                            {mt('page.t244')}
                          </div>
                        ) : null}
                        <MessageBubble 
                          msg={msg} 
                          showSenderLabel={activeChat.chat.type === 'group'} 
                          showTail={isLastInSeries}
                          onOpenMenu={(event) => openMessageContextMenu(event as unknown as ReactMouseEvent<HTMLDivElement>, msg.raw.id)}
                          groupedWithPrevious={Boolean(previousMessage && !shouldShowDaySeparator && previousMessage.raw.senderId === msg.raw.senderId)}
                          onOpenImage={openImageViewer} 
                          onOpenVideo={openVideoViewer} 
                          theme={messageBubbleTheme} 
                          isSmartAgentSending={isSmartAgentLoading}
                          isSmartAgentChat={isSmartAgentChat}
                          isLastSmartAgentMessage={isSmartAgentChat && !isSmartAgentLoading && msg.from === 'them' && index === messages.length - 1}
                          onSendFeedback={(feedback) => handleSendSmartAgentFeedback(index, feedback)}
                          onReact={handleAddReaction} 
                          onUnreact={handleRemoveReaction} 
                          onNavigateToReply={handleReplyMessageClick}
                          onReply={!canReplyInActiveChat || isSmartAgentChat ? undefined : () => {
                            setReplyTarget({
                              id: msg.raw.id,
                              senderId: msg.raw.senderId,
                              senderFullName: msg.senderLabel,
                              content: msg.text,
                              type: msg.raw.type,
                              attachmentUrl: msg.raw.attachmentUrl,
                              attachmentType: msg.raw.attachmentType,
                            })
                          }}
                          onConfirm={() => {
                            void sendSmartAgentMessage('yes', mt('page.t245'))
                          }}
                          onCancel={() => {
                            void sendSmartAgentMessage('no', mt('page.t246'))
                          }}
                          onSelect={(val, label) => {
                            void sendSmartAgentMessage(val, label)
                          }}
                          onOpenDriveFile={handleOpenDriveFile}
                          onOpenNote={handleOpenNote}
                          onOpenPublication={handleOpenPublication}
                          onEditSubmit={(newText) => handleEditSmartAgentMessage(newText, index)}
                          onRegenerate={isSmartAgentChat && msg.from === 'them' && index === messages.length - 1 ? () => {
                            for (let userIndex = index - 1; userIndex >= 0; userIndex -= 1) {
                              if (messages[userIndex]?.from === 'me') {
                                void handleEditSmartAgentMessage(messages[userIndex].text, userIndex, true)
                                break
                              }
                            }
                          } : undefined}
                        />
                        {replyCountByMessageId.get(msg.raw.id) ? (
                          <div style={{ display: 'flex', justifyContent: msg.from === 'me' ? 'flex-end' : 'flex-start', margin: '-2px 0 6px' }}>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                setReplyThreadMessageId(msg.raw.id)
                              }}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 24, padding: '0 8px', borderRadius: 999, border: 'none', background: 'transparent', color: C.blue, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                            >
                              <MS name="forum" size={14} color={C.blue} />
                              {formatReplyCount(replyCountByMessageId.get(msg.raw.id) ?? 0)}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                })
              )}
              {activeTyping ? <div style={{ fontSize: 12, color: C.inkMuted }}>{mt('page.typing', { name: activeTyping.label })}</div> : null}
              <div ref={bottomRef} />
              </div>
              </div>

              {!isAtBottom && messages.length > 0 ? (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 16,
                    display: 'flex',
                    justifyContent: 'center',
                    zIndex: 4,
                    pointerEvents: 'none',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      stickChatToBottom('smooth')
                      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
                      if (activeChatId) {
                        scheduleVisibleReadSync(activeChatId, activeChat?.chat.type ?? 'personal', messages)
                      }
                    }}
                    style={{
                      pointerEvents: 'auto',
                      border: 'none',
                      borderRadius: 999,
                      background: '#FFFFFF',
                      color: C.blue,
                      height: 38,
                      padding: '0 14px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      boxShadow: '0 10px 24px rgba(10,22,40,0.12)',
                      cursor: 'pointer',
                    }}
                  >
                    <MS name="south" size={16} color={C.blue} />
                    {pendingNewMessagesCount > 0 ? mt('page.newMessages', { count: pendingNewMessagesCount }) : mt('page.t247')}
                  </button>
                </div>
              ) : null}

            </div>

            {isRecordingVideoMessage ? (
              <VideoMessageRecordingPreview
                stream={videoMessageStreamRef.current}
                durationSeconds={videoRecordingDurationSeconds}
                isLocked={isRecordingLocked}
              />
            ) : null}

            {sendError ? <div style={{ padding: '0 20px 8px', fontSize: 12, color: C.red }}>{sendError}</div> : null}

            <div
              className="messenger-composer"
              style={{
                position: 'relative',
                zIndex: 5,
                background: themedChatSurfaceBackground,
                borderTop: `1px solid ${themedChatSurfaceBorder}`,
                padding: isRecordingUiActive
                  ? isMobileLayout
                    ? '10px 12px'
                    : '12px 20px 12px'
                  : isMobileLayout
                    ? '10px 12px 12px'
                    : '14px 20px 12px',
                flexShrink: 0,
                boxShadow: isRecordingUiActive ? '0 -10px 26px rgba(10,22,40,0.05)' : '0 -8px 24px rgba(10,22,40,0.03)',
                backdropFilter: activeThemeConfig.backgroundType === 'default' ? undefined : 'blur(14px)',
              }}
            >
              {activeMentionContext && (mentionSuggestions.length > 0 || Boolean(groupMembersError)) ? (
                <div
                  style={{
                    position: 'absolute',
                    left: isMobileLayout ? 12 : 20,
                    right: isMobileLayout ? 12 : 20,
                    bottom: 'calc(100% + 8px)',
                    background: '#FFFFFF',
                    border: `1px solid ${C.borderLight}`,
                    borderRadius: 16,
                    boxShadow: '0 16px 40px rgba(10,22,40,0.12)',
                    padding: 8,
                    zIndex: 5,
                  }}
                >
                  {groupMembersError ? (
                    <div style={{ padding: '10px 12px', fontSize: 12, color: C.red }}>{groupMembersError}</div>
                  ) : null}
                  {mentionSuggestions.map((member) => {
                    const title = member.fullName || member.username || `User ${member.id}`

                    return (
                      <button
                        key={member.id}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => applyMentionSuggestion(member)}
                        style={{
                          width: '100%',
                          border: 'none',
                          background: 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '10px 12px',
                          borderRadius: 12,
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <MessengerAvatar initials={getInitials(title)} imageUrl={null} size={34} seed={getSeed(title)} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {title}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : null}

              {!hasDraftMessage && (isRecordLockHintVisible || isRecordingAnyMedia || isRecordingLocked) ? (
                <div
                  style={{
                    position: 'absolute',
                    right: 20,
                    bottom: 'calc(100% + 14px)',
                    zIndex: 6,
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: 10,
                    pointerEvents: 'none',
                  }}
                >
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: 16,
                      background: isRecordingLocked ? '#EEF6FF' : 'rgba(255,255,255,0.98)',
                      border: `1px solid ${isRecordingLocked ? '#D7E8FF' : C.borderLight}`,
                      boxShadow: isRecordingLocked ? '0 12px 28px rgba(46,135,255,0.14)' : '0 10px 26px rgba(10,22,40,0.09)',
                      minWidth: 196,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 800, color: isRecordingLocked ? C.blue : C.ink }}>
                      {isRecordingLocked ? mt('page.t248') : mt('page.t249')}
                    </div>
                    <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 3 }}>
                      {isRecordingLocked
                        ? mt('page.t250')
                        : selectedRecorderMode === 'video_message' ? mt('page.releaseToSendVideo') : mt('page.releaseToSendVoice')}
                    </div>
                  </div>

                  <div
                    style={{
                      position: 'relative',
                      width: 42,
                      height: 122,
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'center',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 12,
                        width: 6,
                        height: 92,
                        borderRadius: 999,
                        background: '#E6EEF9',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          bottom: 0,
                          height: `${Math.max(12, Math.round(recordLockProgress * 100))}%`,
                          borderRadius: 999,
                          background: isRecordingLocked ? C.blue : '#8EC1FF',
                          transition: 'height 0.12s ease, background 0.12s ease',
                        }}
                      />
                    </div>
                    <div
                      style={{
                        position: 'absolute',
                        top: isRecordingLocked ? 2 : `${14 + (1 - recordLockProgress) * 50}px`,
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        background: isRecordingLocked ? `linear-gradient(135deg, ${C.blue} 0%, #66B2FF 100%)` : '#FFFFFF',
                        border: `1px solid ${isRecordingLocked ? `${C.blue}30` : C.borderLight}`,
                        boxShadow: isRecordingLocked ? '0 10px 24px rgba(46,135,255,0.24)' : '0 6px 16px rgba(10,22,40,0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'top 0.12s ease, background 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease',
                      }}
                    >
                      <MS name="lock" size={16} color={isRecordingLocked ? '#FFFFFF' : C.inkMuted} />
                    </div>
                  </div>
                </div>
              ) : null}

              <div
                className={isRecordingUiActive ? undefined : 'messenger-compose-input'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: isRecordingUiActive ? 0 : 12,
                  background: isRecordingUiActive ? 'transparent' : '#FFFFFF',
                  border: isRecordingUiActive ? 'none' : `1px solid ${C.borderLight}`,
                  borderRadius: isRecordingUiActive ? 0 : 14,
                  padding: isRecordingUiActive ? 0 : '10px 12px 10px 16px',
                  boxShadow: 'none',
                  position: 'relative',
                }}
              >
                {activeChat?.chat.type === 'channel' && !channelDetails?.isSubscribed ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 42 }}>
                    {isLoadingChannelDetails ? (
                      <div style={{ fontSize: 13, color: C.inkMuted, fontWeight: 600 }}>{mt('page.t251')}</div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleJoinChannel}
                        disabled={isMessageActionLoading}
                        style={{
                          flex: 1,
                          height: 42,
                          background: C.blue,
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: 12,
                          fontSize: 14,
                          fontWeight: 800,
                          cursor: isMessageActionLoading ? 'default' : 'pointer',
                          boxShadow: `0 8px 20px ${C.blue}33`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          transition: 'opacity 0.2s ease',
                          opacity: isMessageActionLoading ? 0.7 : 1,
                        }}
                      >
                        {isMessageActionLoading ? (
                          mt('page.t252')
                        ) : (
                          <>
                            <MS name="add_circle" size={18} color="#FFFFFF" />
                            <span>{mt('page.t253')}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                ) : activeChat?.chat.type === 'channel' && channelDetails?.myRole !== 'admin' && channelDetails?.myRole !== 'owner' && !replyTarget ? (
                  <div 
                    style={{ 
                      flex: 1, 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      height: 48, 
                      color: C.inkSub, 
                      fontSize: 13, 
                      fontWeight: 800,
                      background: '#F8FAFC',
                      borderRadius: 16,
                      border: `1px solid ${C.borderLight}`,
                      letterSpacing: '0.04em',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8), 0 2px 4px rgba(0,0,0,0.02)'
                    }}
                  >
                    <MS name="campaign" size={18} color={C.inkSub} style={{ marginRight: 10, opacity: 0.8 }} />
                    <span style={{ transform: 'translateY(0.5px)' }}>{mt('page.t254')}</span>
                  </div>
                ) : (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      onChange={(event) => void handleAttachmentSelection(event)}
                      style={{ display: 'none' }}
                    />
                    {isRecordingUiActive ? (
                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                          minHeight: 58,
                          borderRadius: 22,
                          background: 'linear-gradient(180deg, #FFFFFF 0%, #F4F8FF 100%)',
                          border: '1px solid #DCE8F8',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.86), 0 12px 28px rgba(46,135,255,0.08)',
                          display: 'grid',
                          gridTemplateColumns: 'auto minmax(0, 1fr) auto',
                          alignItems: 'center',
                          gap: 16,
                          padding: '6px 8px 6px 18px',
                          color: C.ink,
                          overflow: 'hidden',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flexShrink: 0 }}>
                          <span
                            style={{
                              width: 11,
                              height: 11,
                              borderRadius: '50%',
                              background: '#E25555',
                              boxShadow: '0 0 0 5px rgba(226,85,85,0.14)',
                              flexShrink: 0,
                            }}
                          />
                          <div style={{ display: 'grid', gap: 2 }}>
                            <span
                              style={{
                                fontSize: 15,
                                fontWeight: 700,
                                lineHeight: 1,
                                fontFamily: 'Manrope, "Segoe UI", sans-serif',
                                fontVariantNumeric: 'tabular-nums',
                                letterSpacing: '-0.015em',
                                color: C.ink,
                              }}
                            >
                              {isRecordingVideoMessage
                                ? formatRecordingDuration(videoRecordingDurationSeconds)
                                : formatRecordingDuration(recordingDurationSeconds)}
                            </span>
                            <span
                              style={{
                                fontSize: 11,
                                lineHeight: 1.1,
                                color: C.inkMuted,
                                fontFamily: 'Manrope, "Segoe UI", sans-serif',
                              }}
                            >
                              {isRecordingLocked
                                ? mt('page.t248')
                                : isRecordingVideoMessage
                                  ? mt('page.t016')
                                  : mt('page.t004')}
                            </span>
                          </div>
                        </div>

                        <div
                          style={{
                            flex: 1,
                            minWidth: 28,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minHeight: 46,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => void cancelActiveRecording()}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              color: C.blue,
                              fontSize: 15,
                              lineHeight: 1,
                              fontWeight: 500,
                              fontFamily: 'Manrope, "Segoe UI", sans-serif',
                              cursor: 'pointer',
                              padding: '0 12px',
                            }}
                          >
                            {mt('page.t190')}
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => void stopActiveRecording()}
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 24,
                            border: '1px solid rgba(72,153,255,0.24)',
                            background: 'linear-gradient(135deg, #5FAEFF 0%, #318DFF 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 12px 24px rgba(49,141,255,0.24)',
                            cursor: 'pointer',
                            flexShrink: 0,
                            justifySelf: 'end',
                          }}
                          title={isRecordingLocked ? mt('page.t255') : mt('page.t256')}
                        >
                          <MS name="send" size={19} color="#FFFFFF" style={{ transform: 'translateX(1px)' }} />
                        </button>
                      </div>
                    ) : (
                      <>
                        {replyTarget && (
                          <div
                            style={{
                              position: 'absolute',
                              bottom: 'calc(100% + 12px)',
                              left: 0,
                              right: 0,
                              padding: '10px 14px',
                              background: '#FFFFFF',
                              borderRadius: 16,
                              border: `1px solid ${C.borderLight}`,
                              boxShadow: '0 8px 30px rgba(10,22,40,0.12)',
                              zIndex: 10,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%', background: 'rgba(47,75,226,0.08)', flexShrink: 0 }}>
                              <MS name="reply" size={18} color={C.blue} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: C.blue, marginBottom: 2, fontFamily: '"Manrope", sans-serif' }}>
                                {replyTarget.senderFullName}
                              </div>
                              <div
                                style={{
                                  fontSize: 13,
                                  color: C.inkSub,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  fontFamily: '"Manrope", sans-serif',
                                }}
                              >
                                {replyTarget.attachmentUrl
                                  ? `📎 ${replyTarget.attachmentType ?? mt('page.t006')}`
                                  : replyTarget.content}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setReplyTarget(null)}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: '50%',
                                border: 'none',
                                background: '#F1F5F9',
                                color: C.inkSub,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <MS name="close" size={18} />
                            </button>
                          </div>
                        )}
                        {(attachmentPreviewUrl || attachmentsToUpload.length > 0) && (
                          <div style={{
                            position: 'absolute',
                            bottom: 'calc(100% + 12px)',
                            left: 0,
                            right: 0,
                            padding: '12px',
                            background: '#FFFFFF',
                            borderRadius: '16px',
                            border: `1px solid ${C.borderLight}`,
                            boxShadow: '0 8px 30px rgba(10,22,40,0.12)',
                            zIndex: 10,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px'
                          }}>
                            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '4px 0', flex: 1 }}>
                              {attachmentPreviewUrl && !attachmentsToUpload.length && (
                                <div style={{ position: 'relative', width: 44, height: 44, borderRadius: 8, overflow: 'hidden', background: '#F4F7FB', border: '1px solid #E0E7F2', flexShrink: 0 }}>
                                  {attachmentToUpload?.type.startsWith('image/') ? (
                                    <img src={attachmentPreviewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  ) : (
                                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.blue }}>
                                      <MS name="description" size={24} />
                                    </div>
                                  )}
                                </div>
                              )}

                              {attachmentsToUpload.map((file, idx) => (
                                <div key={idx} style={{ position: 'relative', width: 44, height: 44, borderRadius: 8, overflow: 'hidden', background: '#F4F7FB', border: '1px solid #E0E7F2', flexShrink: 0 }}>
                                  {file.type.startsWith('image/') ? (
                                    <img src={attachmentPreviewUrls[idx]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  ) : (
                                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.blue }}>
                                      <MS name="description" size={24} />
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newFiles = [...attachmentsToUpload]
                                      const newUrls = [...attachmentPreviewUrls]
                                      newFiles.splice(idx, 1)
                                      newUrls.splice(idx, 1)
                                      setAttachmentsToUpload(newFiles)
                                      setAttachmentPreviewUrls(newUrls)
                                    }}
                                    style={{
                                      position: 'absolute',
                                      top: 2,
                                      right: 2,
                                      width: 16,
                                      height: 16,
                                      borderRadius: 8,
                                      border: 'none',
                                      background: 'rgba(15, 23, 42, 0.7)',
                                      color: '#FFFFFF',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: 'pointer',
                                      fontSize: 9,
                                      fontWeight: 'bold',
                                    }}
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>

                            <div style={{ flexShrink: 0, paddingRight: 8, textAlign: 'right' }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
                                {attachmentsToUpload.length > 0 
                                  ? (attachmentsToUpload.length === 1 ? attachmentsToUpload[0].name : mt('page.filesCount', { count: attachmentsToUpload.length }))
                                  : (attachmentToUpload?.name || mt('page.t037'))}
                              </div>
                              <div style={{ fontSize: 11, color: C.inkFaint }}>
                                {formatAttachmentLimit(
                                  attachmentsToUpload.length > 0 
                                    ? attachmentsToUpload.reduce((acc, f) => acc + f.size, 0)
                                    : (attachmentToUpload?.size || 0)
                                )}
                              </div>
                            </div>

                            <button 
                              type="button"
                              onClick={() => {
                                setAttachmentToUpload(null)
                                setAttachmentPreviewUrl(null)
                                setAttachmentsToUpload([])
                                setAttachmentPreviewUrls([])
                              }}
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: 16,
                                border: 'none',
                                background: '#F1F5F9',
                                color: C.inkSub,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              <MS name="close" size={18} />
                            </button>
                          </div>
                        )}
                        {!isSmartAgentChat ? (
                          <div ref={attachMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
                            <button
                              type="button"
                              onClick={() => {
                                if (!isSending && !isRecordingAnyMedia) {
                                  setIsAttachMenuOpen((prev) => !prev)
                                }
                              }}
                              disabled={isSending || isRecordingAnyMedia}
                              style={{
                                width: 42,
                                height: 42,
                                borderRadius: 21,
                                border: `1px solid ${isAttachMenuOpen ? C.blue : C.borderLight}`,
                                background: isAttachMenuOpen ? '#EEF2FF' : '#FFFFFF',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: isAttachMenuOpen ? C.blue : C.inkMuted,
                                cursor: isSending || isRecordingAnyMedia ? 'default' : 'pointer',
                                flexShrink: 0,
                                opacity: isSending || isRecordingAnyMedia ? 0.6 : 1,
                                boxShadow: '0 2px 10px rgba(10,22,40,0.05)',
                                transition: 'all 0.15s ease',
                              }}
                              className="messenger-attach-button"
                              title={mt('page.t257')}
                            >
                              <MS name="attach_file" size={18} color={isAttachMenuOpen ? C.blue : C.inkMuted} style={{ transform: 'translateY(-2px)' }} />
                            </button>

                            {isAttachMenuOpen && (
                              <div
                                style={{
                                  position: 'absolute',
                                  bottom: 'calc(100% + 8px)',
                                  left: 0,
                                  background: '#FFFFFF',
                                  border: `1px solid ${C.borderLight}`,
                                  borderRadius: 16,
                                  boxShadow: '0 8px 32px rgba(10,22,40,0.14)',
                                  padding: '6px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 2,
                                  minWidth: 190,
                                  zIndex: 100,
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsAttachMenuOpen(false)
                                    fileInputRef.current?.click()
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    padding: '10px 14px',
                                    borderRadius: 12,
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    color: '#1E293B',
                                    fontSize: 14,
                                    fontWeight: 500,
                                    textAlign: 'left',
                                    width: '100%',
                                  }}
                                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#F1F5F9' }}
                                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                                >
                                  <MS name="insert_drive_file" size={18} color={C.inkMuted} />
                                  {mt('page.t258')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsAttachMenuOpen(false)
                                    setIsDrivePickerOpen(true)
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    padding: '10px 14px',
                                    borderRadius: 12,
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    color: '#1E293B',
                                    fontSize: 14,
                                    fontWeight: 500,
                                    textAlign: 'left',
                                    width: '100%',
                                  }}
                                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#EEF2FF' }}
                                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                                >
                                  <MS name="cloud" size={18} color={C.blue} />
                                  {mt('page.t259')}
                                </button>
                              </div>
                            )}
                          </div>
                        ) : null}
                        <textarea
                          key={activeChatId ? `composer-${activeChatId}` : 'composer-none'}
                          ref={messageInputRef}
                          defaultValue=""
                          onInput={handleComposerInput}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                              event.preventDefault()
                              void sendMessage()
                            }
                          }}
                          onClick={(event) => {
                            const c = event.currentTarget.selectionStart ?? event.currentTarget.value.length
                            const epoch = composerSyncEpochRef.current
                            startTransition(() => {
                              if (composerSyncEpochRef.current !== epoch) {
                                return
                              }
                              setMentionCaretIndex(c)
                            })
                          }}
                          onKeyUp={(event) => {
                            const c = event.currentTarget.selectionStart ?? event.currentTarget.value.length
                            const epoch = composerSyncEpochRef.current
                            startTransition(() => {
                              if (composerSyncEpochRef.current !== epoch) {
                                return
                              }
                              setMentionCaretIndex(c)
                            })
                          }}
                          onSelect={(event) => {
                            const c = event.currentTarget.selectionStart ?? event.currentTarget.value.length
                            const epoch = composerSyncEpochRef.current
                            startTransition(() => {
                              if (composerSyncEpochRef.current !== epoch) {
                                return
                              }
                              setMentionCaretIndex(c)
                            })
                          }}
                          onBlur={() => stopOutgoingTyping()}
                          onPaste={handlePaste}
                          placeholder={attachmentToUpload ? mt('page.t260') : mt('page.t261')}
                          disabled={isRecordingAnyMedia}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            minHeight: 42,
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            fontSize: 14,
                            color: C.ink,
                            fontFamily: 'inherit',
                            resize: 'none',
                            lineHeight: '22px',
                            paddingTop: 12,
                            paddingBottom: 8,
                            boxSizing: 'border-box',
                            maxHeight: MESSAGE_COMPOSER_MAX_HEIGHT_PX,
                            overflowY: 'auto',
                            opacity: isRecordingAnyMedia ? 0.55 : 1,
                          }}
                        />
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                          <button
                            type="button"
                            onClick={handleAiProofreadMessage}
                            disabled={isAiProofreading || isRecordingAnyMedia}
                            style={{
                              width: 42,
                              height: 42,
                              borderRadius: 21,
                              border: `1px solid ${C.borderLight}`,
                              background: '#FFFFFF',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: C.blue,
                              cursor: isAiProofreading || isRecordingAnyMedia ? 'default' : 'pointer',
                              flexShrink: 0,
                              opacity: isAiProofreading || isRecordingAnyMedia ? 0.6 : 1,
                              boxShadow: '0 2px 10px rgba(10,22,40,0.05)',
                              transition: 'all 0.15s ease',
                            }}
                            title={mt('page.t262')}
                          >
                            {isAiProofreading ? (
                              <MS name="progress_activity" size={18} className="animate-spin" />
                            ) : (
                              <MS name="auto_fix" size={18} />
                            )}
                          </button>
                        </div>
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                          <button
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => setIsEmojiPickerOpen((prev) => !prev)}
                            disabled={isRecordingAnyMedia}
                            style={{
                              width: 42,
                              height: 42,
                              borderRadius: 21,
                              border: `1px solid ${isEmojiPickerOpen ? '#D7E8FF' : C.borderLight}`,
                              background: isEmojiPickerOpen ? '#EDF5FF' : '#FFFFFF',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: isRecordingAnyMedia ? 'default' : 'pointer',
                              flexShrink: 0,
                              opacity: isRecordingAnyMedia ? 0.6 : 1,
                              boxShadow: '0 2px 10px rgba(10,22,40,0.05)',
                              fontSize: 18,
                              lineHeight: 1,
                            }}
                            title={mt('page.t263')}
                          >
                            <span aria-hidden="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <EmojiModeIcon color={isEmojiPickerOpen ? C.blue : '#7B8DA7'} />
                            </span>
                          </button>

                          {isEmojiPickerOpen ? (
                            <div
                              style={{
                                position: 'absolute',
                                right: 0,
                                bottom: 'calc(100% + 12px)',
                                zIndex: 7,
                              }}
                            >
                              <EmojiPicker
                                onClose={() => setIsEmojiPickerOpen(false)}
                                onSelect={insertEmojiIntoInput}
                              />
                            </div>
                          ) : null}
                        </div>
                          <button
                            type="button"
                            className="messenger-send-control"
                            onClick={() => {
                            if (isSmartAgentChat && isSmartAgentLoading) {
                              stopSmartAgentGeneration()
                              return
                            }

                            if (recordHoldTriggeredRef.current) {
                              recordHoldTriggeredRef.current = false
                              return
                            }

                            if (hasDraftMessage) {
                              void sendMessage()
                              return
                            }

                            if (isSmartAgentChat) {
                              return
                            }

                            setSelectedRecorderMode((prev) => (prev === 'voice' ? 'video_message' : 'voice'))
                          }}
                          onMouseDown={(event) => {
                            if (isSmartAgentChat && (!hasDraftMessage || isSmartAgentLoading)) return
                            handleRecordButtonPressStart(event.clientY)
                          }}
                          onTouchStart={(event: ReactTouchEvent<HTMLButtonElement>) => {
                            if (isSmartAgentChat && (!hasDraftMessage || isSmartAgentLoading)) return
                            handleRecordButtonPressStart(event.touches[0]?.clientY ?? null)
                          }}
                          disabled={isSending || (isSmartAgentChat && !hasDraftMessage && !isSmartAgentLoading)}
                          style={{
                            width: 42,
                            height: 42,
                            borderRadius: 21,
                            background: isSmartAgentChat && isSmartAgentLoading
                              ? C.red
                              : hasDraftMessage
                              ? `linear-gradient(135deg, ${C.blue} 0%, #4EA1FF 100%)`
                              : selectedRecorderMode === 'video_message'
                                ? '#EDF5FF'
                                : '#FFFFFF',
                            border: `1px solid ${isSmartAgentChat && isSmartAgentLoading ? `${C.red}20` : hasDraftMessage ? `${C.blue}20` : selectedRecorderMode === 'video_message' ? '#D7E8FF' : C.borderLight}`,
                            cursor: isSending ? 'default' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: isSmartAgentChat && isSmartAgentLoading
                              ? `0 8px 18px ${C.red}33`
                              : hasDraftMessage
                              ? `0 8px 18px ${C.blue}33`
                              : selectedRecorderMode === 'video_message'
                                ? '0 6px 16px rgba(46,135,255,0.16)'
                                : '0 2px 10px rgba(10,22,40,0.05)',
                            flexShrink: 0,
                            opacity: isSending ? 0.6 : 1,
                            transition: 'background 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease, transform 0.16s ease',
                          }}
                          title={
                            isSmartAgentChat && isSmartAgentLoading
                              ? mt('page.t264')
                              : hasDraftMessage
                              ? mt('page.t265')
                              : selectedRecorderMode === 'video_message'
                                ? mt('page.t266')
                                : mt('page.t267')
                          }
                        >
                          <MS
                            name={isSmartAgentChat && isSmartAgentLoading ? 'stop' : hasDraftMessage || isSmartAgentChat ? 'send' : 'mic'}
                            size={18}
                            color="#FFFFFF"
                            style={{
                              display: selectedRecorderMode === 'video_message' && !hasDraftMessage && !isSmartAgentChat ? 'none' : undefined,
                              marginLeft: hasDraftMessage || isSmartAgentChat ? 2 : 0,
                            }}
                          />
                          {selectedRecorderMode === 'video_message' && !hasDraftMessage && !isSmartAgentChat ? (
                            <VideoMessageModeIcon color="#FFFFFF" />
                          ) : null}
                        </button>
                      </>
                    )}

                  </>
                )}
              </div>


          </div>
        </>
        )}
        </>
        )}
      </div>
      ) : null}

      {showInfo && isMobileLayout && activeChat && activeChat.chat.type === 'personal' ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 620,
            background: 'rgba(10,22,40,0.22)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={() => setShowInfo(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={mt('page.t268')}
            tabIndex={-1}
            autoFocus
            style={{
              width: isMobileLayout ? 'min(100%, 420px)' : 'clamp(300px, 44%, 400px)',
              maxWidth: '100%',
              height: '100%',
              boxShadow: '-18px 0 46px rgba(10,22,40,0.16)',
            }}
            onClick={(event) => event.stopPropagation()}
          >
          <InfoPanel
            activeChat={activeChat}
            currentUserId={currentUser?.id ?? null}
            activePeerId={activePeerId}
            groupMembers={activeGroupMembers}
            groupMembersError={groupMembersError}
            groupMembersActionError={groupMembersActionError}
            isGroupMembersUpdating={isGroupMembersUpdating}
            directoryUsers={directoryUsers}
            isSearchingUsers={isSearchingUsers}
            userSearchError={userSearchError}
            onLoadDirectoryUsers={() => void loadDirectoryUsers()}
            onAddGroupMember={(userId) => void addGroupMember(userId)}
            onRemoveGroupMember={(userId) => void removeGroupMember(userId)}
            onUpdateGroupMemberRole={(userId, role) => void updateGroupMemberRole(userId, role)}
            onLeaveGroup={() => void leaveActiveGroup()}
            onOpenUserProfile={(userId) => void openUserProfile(userId)}
            groupDescription={activeGroupDetails?.description ?? null}
            onClose={() => setShowInfo(false)}
            isMobile={isMobileLayout}
            isMuted={activeChat?.chat?.isMuted ?? false}
            muteBusy={muteToggleBusy}
            onToggleMute={() => void toggleActiveChatMute()}
          />
          </div>
        </div>
      ) : null}

      {!isMobileLayout ? (
        <GroupInfoDrawer
          isOpen={showInfo && !!activeChat && (activeChat.chat.type === 'group' || activeChat.chat.type === 'personal')}
          variant={activeChat?.chat.type === 'personal' ? 'personal' : 'group'}
          subtitle={activeChat ? (isSmartAgentChat ? mt('page.t031') : activeChat.online ? mt('page.t228') : formatLastSeen(activeChat.chat.lastSeenAt)) : undefined}
          peerUserId={activePeerId}
          onClose={() => setShowInfo(false)}
          onEditGroup={activeChat ? () => { setShowInfo(false); void handleOpenGroupEditModal(activeChat) } : undefined}
          activeChat={activeChat}
          currentUserId={currentUser?.id ?? null}
          groupDetails={activeGroupDetails}
          groupMembers={activeGroupMembers}
          groupMembersError={groupMembersError}
          groupMembersActionError={groupMembersActionError}
          isGroupMembersUpdating={isGroupMembersUpdating}
          directoryUsers={directoryUsers}
          isSearchingUsers={isSearchingUsers}
          userSearchError={userSearchError}
          onLoadDirectoryUsers={loadDirectoryUsers}
          onAddGroupMember={(userId) => void addGroupMember(userId)}
          onOpenUserProfile={(userId) => void openUserProfile(userId)}
          onLeaveGroup={() => void leaveActiveGroup()}
          onRemoveGroupMember={(userId) => void removeGroupMember(userId)}
          onUpdateGroupMemberRole={(userId, role) => void updateGroupMemberRole(userId, role)}
          isMuted={activeChat?.chat?.isMuted ?? false}
          muteBusy={muteToggleBusy}
          onToggleMute={() => void toggleActiveChatMute()}
          onCall={() => void handleStartActiveChatCall()}
          attachments={groupSharedAttachments}
          onOpenAttachment={openGroupSharedAttachment}
          onGoToMessage={(messageId) => { setShowInfo(false); void handleReplyMessageClick(messageId) }}
          events={activeGroupEvents}
          eventsError={groupEventsError}
          eventsLoading={isGroupEventsLoading}
          isCreatingEvent={isCreatingGroupEvent}
          onCreateEvent={createActiveGroupEvent}
        />
      ) : (
        <GroupProfileModal
          isOpen={showInfo && !!activeChat && activeChat.chat.type === 'group'}
          onClose={() => setShowInfo(false)}
          activeChat={activeChat}
          currentUserId={currentUser?.id ?? null}
          groupDetails={activeGroupDetails}
          groupMembers={activeGroupMembers}
          groupMembersError={groupMembersError}
          groupMembersActionError={groupMembersActionError}
          isGroupMembersUpdating={isGroupMembersUpdating}
          directoryUsers={directoryUsers}
          isSearchingUsers={isSearchingUsers}
          userSearchError={userSearchError}
          onLoadDirectoryUsers={loadDirectoryUsers}
          onAddGroupMember={(userId) => void addGroupMember(userId)}
          onRemoveGroupMember={(userId) => void removeGroupMember(userId)}
          onUpdateGroupMemberRole={(userId, role) => void updateGroupMemberRole(userId, role)}
          onLeaveGroup={() => void leaveActiveGroup()}
          onOpenUserProfile={(userId) => void openUserProfile(userId)}
          isMuted={activeChat?.chat?.isMuted ?? false}
          muteBusy={muteToggleBusy}
          onToggleMute={() => void toggleActiveChatMute()}
          onCall={() => void handleStartActiveChatCall()}
        />
      )}

      <ChannelProfileModal
        isOpen={Boolean(showInfo && activeChat?.chat?.type === 'channel')}
        onClose={() => setShowInfo(false)}
        activeChat={activeChat}
        currentUserId={currentUser?.id ?? null}
        channelView={channelDetails}
        channelAdmins={channelAdmins}
        channelMembers={channelMembers}
        memberCount={channelDetails?.memberCount ?? 0}
        isAdmin={channelDetails?.myRole === 'admin' || channelDetails?.myRole === 'owner'}
        isOwner={channelDetails?.myRole === 'owner'}
        isSubscribed={channelDetails?.isSubscribed ?? false}
        onSubscribe={() => activeChatId && void subscribeToChannel(activeChatId)}
        onUnsubscribe={() => activeChatId && void unsubscribeFromChannel(activeChatId)}
        directoryUsers={directoryUsers}
        isSearchingUsers={isSearchingUsers}
        userSearchError={userSearchError}
        onLoadDirectoryUsers={loadDirectoryUsers}
        onAddMembers={(userIds) => activeChatId && void addChannelMembers(activeChatId, userIds)}
        membersError={channelMembersError}
        onRemoveMember={(userId) => activeChatId && void removeChannelMember(activeChatId, userId)}
        onUpdateMemberRole={(userId, role) => activeChatId && void updateChannelMemberRole(activeChatId, userId, role)}
        onOpenUserProfile={(userId) => void openUserProfile(userId)}
        onLoadMoreMembers={() => activeChatId && void loadChannelMembers(activeChatId)}
        isLoadingMembers={isLoadingChannelMembers}
        isLoadingAdmins={isLoadingChannelAdmins}
        onUpdateChannel={handleUpdateChannel}
        onUpdateAvatar={handleUpdateChannelAvatar || (async () => { console.error('handleUpdateChannelAvatar is undefined'); })}
        isMuted={channelDetails?.isMuted ?? activeChat?.chat?.isMuted ?? false}
        muteBusy={muteToggleBusy}
        onToggleMute={() => void toggleActiveChatMute()}
      />


      {openedImageMessage ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(7,11,18,0.92)',
            backdropFilter: 'blur(18px)',
            display: 'flex',
            flexDirection: 'column',
          }}
          onClick={closeImageViewer}
        >
          <div
            style={{
              position: 'absolute',
              left: 24,
              right: 24,
              top: 18,
              zIndex: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              color: '#F8FBFF',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>
                {openedImageMessage.from === 'me' ? mt('common.you') : openedImageMessage.senderLabel}
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(248,251,255,0.72)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span>{openedImageMessage.time}</span>
                {imageMessages.length > 1 ? <span>{mt('page.ofCount', { index: openedImageIndex + 1, total: imageMessages.length })}</span> : null}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                onClick={() => downloadMessageAsset(openedImageMessage)}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
                title={mt('page.t213')}
              >
                <MS name="download" size={20} color="#F8FBFF" />
              </button>
              <button
                type="button"
                onClick={closeImageViewer}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
                title={mt('page.t269')}
              >
                <MS name="close" size={20} color="#F8FBFF" />
              </button>
            </div>
          </div>

          <div
            style={{
              position: 'relative',
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '86px 24px 28px',
            }}
          >
            {imageMessages.length > 1 ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  showPreviousImage()
                }}
                style={{
                  position: 'absolute',
                  left: 24,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 14px 32px rgba(0,0,0,0.18)',
                }}
                title={mt('page.t270')}
              >
                <MS name="chevron_left" size={28} color="#F8FBFF" />
              </button>
            ) : null}

            <div
              style={{
                maxWidth: 'min(92vw, 1320px)',
                maxHeight: 'calc(100vh - 140px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 24,
                overflow: 'hidden',
                boxShadow: '0 28px 90px rgba(0,0,0,0.42)',
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <img
                src={openedImageMessage.mediaUrl}
                alt={mt('page.t271')}
                style={{
                  display: 'block',
                  maxWidth: 'min(92vw, 1320px)',
                  maxHeight: 'calc(100vh - 140px)',
                  width: 'auto',
                  height: 'auto',
                  objectFit: 'contain',
                  background: 'rgba(255,255,255,0.02)',
                }}
              />
            </div>

            {imageMessages.length > 1 ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  showNextImage()
                }}
                style={{
                  position: 'absolute',
                  right: 24,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 14px 32px rgba(0,0,0,0.18)',
                }}
                title={mt('page.t272')}
              >
                <MS name="chevron_right" size={28} color="#F8FBFF" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {openedVideoMessage ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(7,11,18,0.94)',
            backdropFilter: 'blur(18px)',
            display: 'flex',
            flexDirection: 'column',
          }}
          onClick={closeVideoViewer}
        >
          <div
            style={{
              position: 'absolute',
              left: 24,
              right: 24,
              top: 18,
              zIndex: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              color: '#F8FBFF',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>
                {openedVideoMessage.from === 'me' ? mt('common.you') : openedVideoMessage.senderLabel}
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(248,251,255,0.72)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span>{openedVideoMessage.time}</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                onClick={() => downloadMessageAsset(openedVideoMessage)}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
                title={mt('page.t213')}
              >
                <MS name="download" size={20} color="#F8FBFF" />
              </button>
              <button
                type="button"
                onClick={closeVideoViewer}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
                title={mt('page.t269')}
              >
                <MS name="close" size={20} color="#F8FBFF" />
              </button>
            </div>
          </div>

          <div
            style={{
              position: 'relative',
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '86px 24px 28px',
            }}
          >
            <div
              style={{
                width: 'min(92vw, 1320px)',
                maxHeight: 'calc(100vh - 140px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 24,
                overflow: 'hidden',
                boxShadow: '0 28px 90px rgba(0,0,0,0.42)',
                background: 'rgba(255,255,255,0.02)',
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <video
                src={openedVideoMessage.videoUrl || undefined}
                controls
                autoPlay
                playsInline
                preload="metadata"
                style={{
                  display: 'block',
                  width: '100%',
                  maxHeight: 'calc(100vh - 140px)',
                  background: '#000000',
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {isPinnedMessagesPanelOpen ? (
        <div
          style={{
            display: 'flex',
            ...(isMobileLayout
              ? { position: 'fixed' as const, inset: 0, background: 'rgba(242,245,250,0.72)', backdropFilter: 'blur(10px)', zIndex: 9999, padding: '52px 24px 24px', alignItems: 'flex-start', justifyContent: 'center' }
              : { position: 'absolute' as const, inset: 0, background: 'rgba(10,22,40,0.24)', zIndex: 620, padding: 16, boxSizing: 'border-box' as const, alignItems: 'center', justifyContent: 'center' }),
          }}
          onClick={() => setIsPinnedMessagesPanelOpen(false)}
        >
          <div
            style={{
              width: isMobileLayout ? '100%' : 440,
              maxWidth: isMobileLayout ? 920 : '100%',
              flexShrink: 0,
              height: 'auto',
              maxHeight: isMobileLayout ? 'calc(100% - 76px)' : 'min(560px, 100%)',
              background: C.surface,
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
              borderRadius: isMobileLayout ? 28 : 20,
              overflow: 'hidden',
              boxShadow: isMobileLayout ? '0 28px 90px rgba(10,22,40,0.16)' : '0 24px 60px rgba(10,22,40,0.2)',
              border: `1px solid ${isMobileLayout ? C.borderLight : '#E1E7F0'}`,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                minHeight: isMobileLayout ? 82 : 0,
                padding: isMobileLayout ? '20px 22px 18px' : '14px 16px 12px',
                borderBottom: `1px solid ${C.borderLight}`,
                background: isMobileLayout ? 'linear-gradient(180deg, #FFFFFF 0%, #F9FBFF 100%)' : '#FFFFFF',
                flexShrink: 0,
              }}
            >
              <button
                type="button"
                onClick={() => setIsPinnedMessagesPanelOpen(false)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  border: 'none',
                  background: 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                title={mt('page.t269')}
              >
                <MS name={isMobileLayout ? 'arrow_back' : 'close'} size={isMobileLayout ? 18 : 22} color={isMobileLayout ? C.inkMuted : C.ink} />
              </button>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.25, color: C.ink }}>
                  {mt('page.t273')}
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: C.inkMuted }}>
                  {mt('page.messagesCount', { count: pinnedMessages.length })}
                </div>
              </div>
            </div>

            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '14px 14px 62px',
                background: 'linear-gradient(180deg, #F8FBFF 0%, #F2F6FC 100%)',
              }}
            >
              <div style={{ width: '100%', maxWidth: 760, margin: '0 auto', display: 'grid', gap: 8 }}>
                {pinnedMessages.map((pinned, index) => {
                  const message =
                    messages.find((item) => item.raw.id === pinned.messageId) ??
                    resolvedPinnedMessageViews[pinned.messageId] ??
                    null
                  const previousPinned = index > 0 ? pinnedMessages[index - 1] : null
                  const previousDate = previousPinned
                    ? messages.find((item) => item.raw.id === previousPinned.messageId)?.raw.createdAt ??
                      resolvedPinnedMessageViews[previousPinned.messageId]?.raw.createdAt ??
                      previousPinned.createdAt
                    : null
                  const senderName =
                    message?.senderLabel ??
                    (pinned.pinnedBy === currentUser?.id ? currentUser?.name : mt('page.userN', { id: pinned.pinnedBy }))
                  const messageDate = message?.raw.createdAt ?? pinned.createdAt
                  const rawPreview = message?.text?.trim() || pinned.content?.trim() || mt('page.messageN', { id: pinned.messageId })
                  const preview = getFriendlyMessageText(rawPreview, pinned.type || message?.kind || 'text')
                  const shouldShowDateChip = !previousDate || !isSameCalendarDate(previousDate, messageDate)
                  const isMine = message?.from === 'me'

                  return (
                    <div key={pinned.id} style={{ display: 'grid', gap: 6 }}>
                      {shouldShowDateChip ? (
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <div
                            style={{
                              padding: '3px 10px',
                              borderRadius: 999,
                              background: 'rgba(221,233,248,0.96)',
                              color: C.inkSub,
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            {formatDaySeparatorLabel(messageDate)}
                          </div>
                        </div>
                      ) : null}

                      <div style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', gap: 8, alignItems: 'flex-end' }}>
                        {!isMine ? (
                          <MessengerAvatar
                            initials={getInitials(senderName)}
                            size={30}
                            seed={getSeed(senderName)}
                          />
                        ) : null}

                        <button
                          type="button"
                          onClick={() => handlePinnedListItemClick(pinned.messageId, index)}
                          style={{
                            width: '100%',
                            maxWidth: 320,
                            border: `1px solid ${index === activePinnedIndex ? `${C.blue}33` : 'transparent'}`,
                            borderRadius: isMine ? '15px 15px 5px 15px' : '15px 15px 15px 5px',
                            background: isMine ? '#DCEEFF' : '#FFFFFF',
                            padding: '7px 11px 8px',
                            cursor: 'pointer',
                            textAlign: 'left',
                            display: 'grid',
                            gap: 4,
                            fontFamily: 'inherit',
                            boxShadow: '0 1px 2px rgba(10,22,40,0.08)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: isMine ? C.blueDark : C.blue }}>
                                {senderName}
                              </div>
                            </div>
                            <div style={{ fontSize: 11, color: C.inkMuted, flexShrink: 0 }}>
                              {formatMessageTime(messageDate)}
                            </div>
                          </div>

                          <div
                            style={{
                              fontSize: 14,
                              lineHeight: 1.35,
                              color: C.ink,
                              overflowWrap: 'anywhere',
                              display: '-webkit-box',
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {preview}
                          </div>
                        </button>

                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: 48,
                borderTop: `1px solid ${C.borderLight}`,
                background: 'rgba(255,255,255,0.96)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 18px',
              }}
            >
              <button
                type="button"
                onClick={() => void handleUnpinAllPinnedMessages()}
                disabled={isMessageActionLoading || pinnedMessages.length === 0}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: C.blue,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: isMessageActionLoading || pinnedMessages.length === 0 ? 'default' : 'pointer',
                  opacity: isMessageActionLoading || pinnedMessages.length === 0 ? 0.5 : 1,
                }}
              >
                {isMessageActionLoading ? mt('page.t274') : mt('page.unpinAll', { count: pinnedMessages.length })}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {chatListContextMenu && chatListContextMenuTarget ? createPortal(
        <>
          <div
            data-chat-list-context-menu="true"
            style={{
              position: 'fixed',
              left: chatListContextMenu.x,
              top: chatListContextMenu.y,
              width: 236,
              background: '#FFFFFF',
              border: '1px solid #E1E7F0',
              borderRadius: 16,
              boxShadow: '0 20px 40px rgba(31,45,72,0.18)',
              padding: 8,
              zIndex: 1100,
              maxHeight: 'calc(100vh - 24px)',
              overflowY: 'auto',
            }}
          >
            <button
              type="button"
              onClick={() => void handleToggleContextChatMute()}
              disabled={isChatListActionLoading}
              style={{ width: '100%', height: 42, borderRadius: 12, border: 'none', background: 'transparent', color: '#202A44', display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px', cursor: isChatListActionLoading ? 'default' : 'pointer', textAlign: 'left', fontSize: 14, fontWeight: 600, opacity: isChatListActionLoading ? 0.6 : 1 }}
            >
              <MS name={chatListContextMenuTarget.chat.isMuted ? 'notifications' : 'notifications_off'} size={18} color="#202A44" />
              {chatListContextMenuTarget.chat.isMuted ? mt('page.t275') : mt('page.t276')}
            </button>

            {MESSENGER_VIDEO_CALLS_ENABLED && chatListContextMenuTarget.chat.id !== 'smart-agent' && (chatListContextMenuTarget.chat.type === 'group' || chatListContextMenuTarget.chat.type === 'personal') ? (
              <button
                type="button"
                onClick={() => {
                  const target = chatListContextMenuTarget
                  setChatListContextMenu(null)
                  void (async () => {
                    try {
                      setIsChatListActionLoading(true)
                      if (target.chat.type === 'group') {
                        await startGroupCall({
                          groupId: target.chat.id,
                          displayName: target.title,
                        })
                        try {
                          await chatRepository.sendMessage({
                            chatId: target.chat.id,
                            chatType: 'group',
                            content: mt('page.t033'),
                            type: 'text',
                            metadata: JSON.stringify({
                              type: 'video_call',
                              status: 'initiated',
                              direction: 'outgoing',
                              call_start_at: new Date().toISOString()
                            })
                          })
                        } catch {}
                      } else {
                        const peerId = Number(target.chat.id)
                        if (peerId > 0) {
                          await startDirectCall({
                            calleeId: peerId,
                            chatId: target.chat.id,
                            displayName: target.title,
                          })

                          // send system message for direct call from context menu
                          try {
                            await chatRepository.sendMessage({
                              chatId: target.chat.id,
                              chatType: 'personal',
                              content: mt('page.t033'),
                              type: 'text',
                              metadata: JSON.stringify({
                                type: 'video_call',
                                status: 'initiated',
                                direction: 'outgoing',
                                call_start_at: new Date().toISOString()
                              })
                            })
                          } catch {}
                        }
                      }
                    } catch (e) {
                      setError(getErrorMessage(e, mt('page.t277')))
                    } finally {
                      setIsChatListActionLoading(false)
                    }
                  })()
                }}
                disabled={isChatListActionLoading || isCallBusy}
                style={{ width: '100%', height: 42, borderRadius: 12, border: 'none', background: 'transparent', color: '#202A44', display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px', cursor: isChatListActionLoading || isCallBusy ? 'default' : 'pointer', textAlign: 'left', fontSize: 14, fontWeight: 600, opacity: isChatListActionLoading || isCallBusy ? 0.6 : 1 }}
              >
                <MS name="videocam" size={18} color="#202A44" />
                {mt('page.t033')}
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => void handleToggleChatPin(chatListContextMenuTarget)}
              disabled={isChatListActionLoading}
              style={{ width: '100%', height: 42, borderRadius: 12, border: 'none', background: 'transparent', color: '#202A44', display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px', cursor: isChatListActionLoading ? 'default' : 'pointer', textAlign: 'left', fontSize: 14, fontWeight: 600, opacity: isChatListActionLoading ? 0.6 : 1 }}
            >
              <PinnedIcon size={18} color="#202A44" />
              {chatListContextMenuTarget.chat.type === 'group'
                ? chatListContextMenuTarget.chat.isPinned
                  ? mt('page.t278')
                  : mt('page.t279')
                : chatListContextMenuTarget.chat.isPinned
                  ? mt('page.t280')
                  : mt('page.t281')}
            </button>

            <button
              type="button"
              onClick={toggleChatListFolderMenu}
              disabled={isChatListActionLoading}
              style={{ width: '100%', height: 42, borderRadius: 12, border: 'none', background: chatListContextMenu.isFolderMenuOpen ? '#E9EEF6' : 'transparent', color: '#202A44', display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px', cursor: isChatListActionLoading ? 'default' : 'pointer', textAlign: 'left', fontSize: 14, fontWeight: 600, opacity: isChatListActionLoading ? 0.5 : 1 }}
            >
              <MS name="folder" size={18} color="#202A44" />
              <span style={{ flex: 1 }}>
                {chatListContextMenuFolderId ? mt('page.t282') : mt('page.t283')}
              </span>
              <MS name="chevron_right" size={16} color="#6B7A90" />
            </button>

            {chatListContextMenuTarget.chat.type === 'group' && groupMenuPermissions?.chatId === chatListContextMenuTarget.chat.id && groupMenuPermissions.canEdit ? (
              <button
                type="button"
                onClick={() => void handleOpenGroupEditModal(chatListContextMenuTarget)}
                disabled={isChatListActionLoading}
                style={{ width: '100%', height: 42, borderRadius: 12, border: 'none', background: 'transparent', color: '#202A44', display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px', cursor: isChatListActionLoading ? 'default' : 'pointer', textAlign: 'left', fontSize: 14, fontWeight: 600, opacity: isChatListActionLoading ? 0.6 : 1 }}
              >
                <MS name="edit" size={18} color="#202A44" />
                {mt('page.t284')}
              </button>
            ) : null}

            <div style={{ height: 1, background: '#E9EEF6', margin: '6px 4px' }} />

            {chatListContextMenuTarget.chat.type === 'group' ? (
              <button
                type="button"
                onClick={() => void handleHideGroup(chatListContextMenuTarget.chat.id)}
                disabled={isChatListActionLoading}
                style={{ width: '100%', height: 42, borderRadius: 12, border: 'none', background: 'transparent', color: '#202A44', display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px', cursor: 'pointer', textAlign: 'left', fontSize: 14, fontWeight: 600 }}
              >
                <MS name="visibility_off" size={18} color="#202A44" />
                {mt('page.t285')}
              </button>
            ) : null}

            {(chatListContextMenuTarget.chat.type !== 'group' || (groupMenuPermissions?.chatId === chatListContextMenuTarget.chat.id && groupMenuPermissions.canDelete)) ? <button
              type="button"
              onClick={() => handleRequestDeleteChat(chatListContextMenuTarget.chat.id)}
              disabled={isChatListActionLoading}
              style={{ width: '100%', height: 42, borderRadius: 12, border: 'none', background: 'transparent', color: '#FF6767', display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px', cursor: isChatListActionLoading ? 'default' : 'pointer', textAlign: 'left', fontSize: 14, fontWeight: 600, opacity: isChatListActionLoading ? 0.6 : 1 }}
            >
              <MS name={chatListContextMenuTarget.chat.type === 'channel' ? 'logout' : 'delete'} size={18} color="#FF6767" />
              {chatListContextMenuTarget.chat.type === 'group' ? mt('page.t286') : chatListContextMenuTarget.chat.type === 'channel' ? mt('page.t287') : mt('page.t288')}
            </button> : null}
          </div>

          {chatListContextMenu.isFolderMenuOpen ? (
            <div
              data-chat-list-context-menu="true"
              style={{
                position: 'fixed',
                left:
                  typeof window === 'undefined'
                    ? chatListContextMenu.x + 244
                    : Math.max(12, Math.min(chatListContextMenu.x + 244, window.innerWidth - 236 - 12)),
                top:
                  typeof window === 'undefined'
                    ? chatListContextMenu.y + 44
                    : Math.max(12, Math.min(chatListContextMenu.y + 44, window.innerHeight - 320 - 12)),
                width: 236,
                boxShadow: '0 20px 40px rgba(31,45,72,0.18)',
                background: '#FFFFFF',
                border: '1px solid #E1E7F0',
                borderRadius: 16,
                padding: 8,
                zIndex: 1110,
                maxHeight: 'min(320px, calc(100vh - 24px))',
                overflowY: 'auto',
              }}
            >
              {folders.length === 0 ? (
                <div
                  style={{
                    padding: '10px 12px 12px',
                    fontSize: 12,
                    lineHeight: 1.45,
                    color: '#6B7A90',
                  }}
                >
                  {mt('page.t289')}
                </div>
              ) : null}

              {chatListContextMenuFolderId ? (
                <>
                  <button
                    type="button"
                    onClick={() => void handleRemoveContextChatFromFolder()}
                    disabled={isFolderUpdating}
                    style={{ width: '100%', height: 42, borderRadius: 12, border: 'none', background: 'transparent', color: '#202A44', display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px', cursor: isFolderUpdating ? 'default' : 'pointer', textAlign: 'left', fontSize: 14, fontWeight: 600, opacity: isFolderUpdating ? 0.6 : 1 }}
                  >
                    <MS name="close" size={18} color="#202A44" />
                    {mt('page.t290')}
                  </button>
                  <div style={{ height: 1, background: '#E9EEF6', margin: '6px 4px' }} />
                </>
              ) : null}

              {folders.map((folder) => {
                const isAssigned = chatListContextMenuFolderId === folder.id

                return (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => void handleAssignContextChatToFolder(folder.id)}
                    disabled={isFolderUpdating}
                    style={{ width: '100%', minHeight: 42, borderRadius: 12, border: 'none', background: isAssigned ? '#E9EEF6' : 'transparent', color: '#202A44', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', cursor: isFolderUpdating ? 'default' : 'pointer', textAlign: 'left', fontSize: 14, fontWeight: 600, opacity: isFolderUpdating ? 0.6 : 1 }}
                  >
                    <MS name={isAssigned ? 'check_circle' : 'folder'} size={18} color={isAssigned ? '#315EFF' : '#202A44'} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {folder.name}
                    </span>
                  </button>
                )
              })}

              <div style={{ height: 1, background: '#E9EEF6', margin: '6px 4px' }} />
              <button
                type="button"
                onClick={() => {
                  closeChatListContextMenu()
                  setIsFolderModalOpen(true)
                  setPendingFolderAssignmentTarget({
                    chatId: chatListContextMenuTarget.chat.id,
                    chatType: chatListContextMenuTarget.chat.type,
                  })
                  setEditingFolderId(null)
                  setFolderName('')
                  setFolderError('')
                }}
                style={{ width: '100%', height: 42, borderRadius: 12, border: 'none', background: 'transparent', color: '#315EFF', display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px', cursor: 'pointer', textAlign: 'left', fontSize: 14, fontWeight: 600 }}
              >
                <MS name="add" size={18} color="#315EFF" />
                {mt('page.t291')}
              </button>
            </div>
          ) : null}
        </>,
        document.body,
      ) : null}

      {messageContextMenu && contextMenuMessage ? createPortal(
        <div
          ref={messageContextMenuRef}
          data-message-context-menu="true"
          style={{
            position: 'fixed',
            left: messageContextMenu.x,
            top: messageContextMenu.y,
            width: 236,
            zIndex: 1100,
          }}
        >
          <div className="message-context-menu__reactions" aria-label={mt('page.t292')}>
            {['👍', '❤️', '😂', '😮', '😢', '🔥'].map((emoji) => {
              const alreadyReacted = (contextMenuMessage.raw.reactions ?? []).some(
                (reaction) => reaction.reaction === emoji && reaction.reacted,
              )

              return (
                <button
                  key={emoji}
                  type="button"
                  className="message-context-menu__reaction"
                  aria-label={alreadyReacted ? mt('page.removeReaction', { emoji }) : mt('page.addReaction', { emoji })}
                  aria-pressed={alreadyReacted}
                  title={alreadyReacted ? mt('page.removeShort', { emoji }) : mt('page.react', { emoji })}
                  onClick={() => {
                    closeMessageContextMenu()
                    if (alreadyReacted) {
                      void handleRemoveReaction(contextMenuMessage.raw.id, emoji)
                    } else {
                      void handleAddReaction(contextMenuMessage.raw.id, emoji)
                    }
                  }}
                >
                  {emoji}
                </button>
              )
            })}
          </div>
          <div className="message-context-menu__list">
          <button
            type="button"
            className="message-context-menu__item"
            onClick={() => {
              closeMessageContextMenu()
              setReplyTarget({ id: contextMenuMessage.raw.id, senderId: contextMenuMessage.raw.senderId, senderFullName: contextMenuMessage.senderLabel, content: contextMenuMessage.text, type: contextMenuMessage.raw.type, attachmentUrl: contextMenuMessage.raw.attachmentUrl, attachmentType: contextMenuMessage.raw.attachmentType })
              messageInputRef.current?.focus()
            }}
          >
            <MS name="reply" size={22} color="currentColor" />
            <span className="message-context-menu__label">{mt('page.t293')}</span>
          </button>
          {!contextMenuIsCall ? (
            <>
              {contextMenuMessage.kind === 'text' && contextMenuMessage.text ? (
                <button type="button" className="message-context-menu__item" onClick={() => { void navigator.clipboard.writeText(contextMenuMessage.text); closeMessageContextMenu() }}>
                  <MS name="content_copy" size={21} color="currentColor" /><span className="message-context-menu__label">{mt('page.t294')}</span>
                </button>
              ) : null}
              <div className="message-context-menu__divider" />
              {canManageChannelPosts ? (
                <button type="button" className="message-context-menu__item" onClick={() => { closeMessageContextMenu(); void handleTogglePinMessage(contextMenuMessage.raw.id) }}>
                  <MS name="keep" size={22} color="currentColor" /><span className="message-context-menu__label">{pinnedMessageIds.has(contextMenuMessage.raw.id) ? mt('page.t237') : mt('page.t238')}</span>
                </button>
              ) : null}
              {canManageChannelPosts && contextMenuMessage.raw.senderId === currentUser?.id ? (
                <button type="button" className="message-context-menu__item" onClick={() => { closeMessageContextMenu(); void handleLoadMessageViewers(contextMenuMessage.raw.id) }}>
                  <MS name="visibility" size={21} color="currentColor" /><span className="message-context-menu__label">{mt('page.t239')}</span>
                </button>
              ) : null}
              {(contextMenuMessage.attachment?.url ?? contextMenuMessage.audioUrl ?? contextMenuMessage.videoUrl ?? contextMenuMessage.mediaUrl ?? contextMenuMessage.raw.attachmentUrl) ? (
                <button type="button" className="message-context-menu__item" onClick={() => { closeMessageContextMenu(); downloadMessageAsset(contextMenuMessage) }}>
                  <MS name="download" size={21} color="currentColor" /><span className="message-context-menu__label">{mt('page.t213')}</span>
                </button>
              ) : null}
              {canForwardMessages ? (
                <button type="button" className="message-context-menu__item" onClick={() => { const messageId = contextMenuMessage.raw.id; closeMessageContextMenu(); openForwardModal([messageId]) }}>
                  <MS name="reply" size={22} color="currentColor" style={{ transform: 'scaleX(-1)' }} /><span className="message-context-menu__label">{mt('page.t236')}</span>
                </button>
              ) : null}
              {isMessageEditable(contextMenuMessage) ? (
                <button type="button" className="message-context-menu__item" onClick={() => { closeMessageContextMenu(); handleEditSelectedMessage(contextMenuMessage.raw.id) }}>
                  <MS name="edit" size={21} color="currentColor" /><span className="message-context-menu__label">{mt('page.t240')}</span>
                </button>
              ) : null}
              <button type="button" className="message-context-menu__item" onClick={() => { closeMessageContextMenu(); toggleMessageSelection(contextMenuMessage.raw.id, true) }}>
                <MS name="check_circle" size={22} color="currentColor" /><span className="message-context-menu__label">{mt('page.t295')}</span>
              </button>
            </>
          ) : null}
          {isMessageDeletable(contextMenuMessage) ? (
            <>
              <div className="message-context-menu__divider" />
              <button type="button" className="message-context-menu__item message-context-menu__item--danger" onClick={() => { setDeleteTargetMessageIds([contextMenuMessage.raw.id]); closeMessageContextMenu(); setIsDeleteConfirmOpen(true) }}>
                <MS name="delete" size={22} color="currentColor" /><span className="message-context-menu__label">{mt('page.t154')}</span>
              </button>
            </>
          ) : null}
          </div>
        </div>,
        document.body,
      ) : null}

      {isForwardModalOpen ? (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 1200 }}
          onClick={closeForwardModal}
        >
          <div
            data-forward-chat-menu="true"
            role="dialog"
            aria-modal="true"
            aria-label={mt('page.t236')}
            style={{ width: 'min(420px, 100%)', maxHeight: 'min(640px, calc(100vh - 32px))', background: '#FFFFFF', borderRadius: 24, border: '1px solid #E1E7F0', boxShadow: '0 24px 60px rgba(10,22,40,0.2)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px 10px' }}>
              <button type="button" onClick={closeForwardModal} aria-label={mt('page.t269')} style={{ width: 40, height: 40, borderRadius: 999, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                <MS name="close" size={24} color={C.ink} />
              </button>
              <div style={{ flex: 1, minWidth: 0, fontSize: 19, fontWeight: 700, color: C.ink }}>
                {mt('page.t236')}{selectedForwardChatIds.length > 0 ? ` · ${selectedForwardChatIds.length}` : ''}
              </div>
              <button
                type="button"
                onClick={() => void handleForwardMessagesToSelectedChats()}
                disabled={isForwardingMessages || selectedForwardChatIds.length === 0}
                aria-label={mt('page.t296')}
                title={mt('page.t236')}
                style={{ width: 40, height: 40, borderRadius: 999, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: isForwardingMessages || selectedForwardChatIds.length === 0 ? 'default' : 'pointer', opacity: isForwardingMessages || selectedForwardChatIds.length === 0 ? 0.4 : 1 }}
              >
                <MS name="check_circle" size={26} color={selectedForwardChatIds.length > 0 ? C.blue : C.ink} />
              </button>
            </div>

            <div style={{ padding: '0 16px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 46, padding: '0 16px', borderRadius: 999, background: C.canvas }}>
                <MS name="search" size={22} color={C.inkMuted} />
                <input
                  type="search"
                  name="messenger_forward_search"
                  autoComplete="off"
                  value={forwardChatSearchQuery}
                  onChange={(event) => setForwardChatSearchQuery(event.target.value)}
                  placeholder={mt('page.t219')}
                  style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', fontSize: 16, color: C.ink, fontFamily: 'inherit' }}
                />
              </div>
            </div>

            <div style={{ minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: '0 16px 16px', display: 'grid', gap: 12 }}>
              {forwardableChats.length > 0 && !forwardChatSearchQuery.trim() ? (
                <div style={{ display: 'flex', gap: 6, padding: '12px 8px', borderRadius: 20, background: C.canvas, overflowX: 'auto' }}>
                  {forwardableChats.slice(0, 8).map((item) => {
                    const isSelected = selectedForwardChatIds.includes(item.chat.id)
                    return (
                      <button
                        key={item.chat.id}
                        type="button"
                        onClick={() => toggleForwardChatSelection(item.chat.id)}
                        disabled={isForwardingMessages}
                        aria-pressed={isSelected}
                        style={{ flex: '0 0 72px', width: 72, border: 'none', background: 'transparent', padding: 0, display: 'grid', justifyItems: 'center', gap: 6, cursor: isForwardingMessages ? 'default' : 'pointer', fontFamily: 'inherit' }}
                      >
                        <span style={{ borderRadius: 999, padding: 2, border: `2px solid ${isSelected ? C.blue : 'transparent'}`, display: 'flex' }}>
                          <MessengerAvatar initials={item.avatar} imageUrl={item.avatarUrl} seed={item.seed} size={52} />
                        </span>
                        <span style={{ maxWidth: 70, fontSize: 12, color: isSelected ? C.blue : C.ink, fontWeight: isSelected ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</span>
                      </button>
                    )
                  })}
                </div>
              ) : null}

              <div role="tablist" aria-label={mt('page.t297')} style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 999, background: C.canvas, overflowX: 'auto' }}>
                {([['all', mt('page.t298')], ['personal', mt('page.t299')], ['group', mt('page.t132')]] as const).map(([value, label]) => {
                  const selected = forwardChatTab === value
                  const count = value === 'all' ? forwardableChats.length : forwardableChats.filter((item) => item.chat.type === value).length
                  return (
                    <button
                      key={value}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setForwardChatTab(value)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', borderRadius: 999, border: 'none', background: selected ? '#FFFFFF' : 'transparent', color: selected ? C.blue : C.inkMuted, fontSize: 15, fontWeight: 600, cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' }}
                    >
                      {label}
                      <span style={{ minWidth: 22, height: 20, padding: '0 6px', boxSizing: 'border-box', borderRadius: 999, background: selected ? C.blue : C.border, color: selected ? '#FFFFFF' : C.inkMuted, fontSize: 12, fontWeight: 700, lineHeight: '20px', textAlign: 'center' }}>{count}</span>
                    </button>
                  )
                })}
              </div>

              <div style={{ borderRadius: 20, background: C.canvas, padding: 6 }}>
                {forwardableChats.filter((item) => forwardChatTab === 'all' || item.chat.type === forwardChatTab).length === 0 ? (
                  <div style={{ padding: '14px 12px', fontSize: 14, color: C.inkMuted }}>{mt('page.t300')}</div>
                ) : (
                  forwardableChats.filter((item) => forwardChatTab === 'all' || item.chat.type === forwardChatTab).map((item) => {
                    const isSelected = selectedForwardChatIds.includes(item.chat.id)
                    return (
                      <button
                        key={item.chat.id}
                        type="button"
                        onClick={() => toggleForwardChatSelection(item.chat.id)}
                        disabled={isForwardingMessages}
                        aria-pressed={isSelected}
                        style={{ width: '100%', border: 'none', background: isSelected ? 'rgba(44,140,255,0.08)' : 'transparent', minHeight: 56, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', borderRadius: 14, cursor: isForwardingMessages ? 'default' : 'pointer', fontFamily: 'inherit' }}
                      >
                        <MessengerAvatar initials={item.avatar} imageUrl={item.avatarUrl} seed={item.seed} size={44} online={item.online} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 16, fontWeight: 500, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
                          <div style={{ marginTop: 2, fontSize: 14, color: C.inkMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.chat.type === 'group' ? mt('page.t074') : item.online ? mt('page.t301') : mt('page.t171')}
                          </div>
                        </div>
                        {isSelected ? <MS name="check_circle" size={22} color={C.blue} /> : null}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {replyThreadMessageId && replyThreadRows.length > 0 ? (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 16 }}
          onClick={() => setReplyThreadMessageId(null)}
        >
          <div
            style={{ width: '100%', maxWidth: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: C.surface, borderRadius: 20, border: `1px solid ${C.borderLight}`, boxShadow: '0 24px 60px rgba(10,22,40,0.16)', overflow: 'hidden' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ padding: '18px 20px 12px', borderBottom: `1px solid ${C.borderLight}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>{mt('page.t302')}</div>
                <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 4 }}>{formatReplyCount(replyThreadRows.length - 1)}{replyThreadServer?.truncated ? ` · ${mt('page.notAllShown')}` : ''}</div>
              </div>
              <button type="button" onClick={() => setReplyThreadMessageId(null)} aria-label={mt('page.t269')} style={{ width: 36, height: 36, borderRadius: 10, border: 'none', background: 'transparent', color: C.inkMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MS name="close" size={20} color={C.inkMuted} />
              </button>
            </div>
            <div style={{ padding: '12px 16px 16px', overflowY: 'auto' }}>
              {replyThreadRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => {
                    setReplyThreadMessageId(null)
                    void handleReplyMessageClick(row.id)
                  }}
                  style={{ display: 'block', width: `calc(100% - ${Math.min(row.depth, 6) * 18}px)`, marginLeft: Math.min(row.depth, 6) * 18, marginBottom: 6, padding: '8px 12px', textAlign: 'left', borderRadius: 12, border: `1px solid ${row.id === replyThreadMessageId ? C.blue : C.borderLight}`, borderLeft: `3px solid ${row.depth === 0 ? C.blue : C.borderLight}`, background: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                    <span style={{ fontWeight: 700, color: C.blue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.senderLabel}</span>
                    <span style={{ color: C.inkMuted, flexShrink: 0 }}>{row.time}</span>
                  </div>
                  <div style={{ fontSize: 13, color: C.ink, marginTop: 2, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>{row.text}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {isShareModalOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(10,22,40,0.24)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 65,
            padding: 16,
          }}
          onClick={() => {
            setIsShareModalOpen(false)
            setSelectedShareChatIds([])
            setShareSearchQuery('')
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 440,
              height: 520,
              background: '#FFFFFF',
              borderRadius: 24,
              border: `1px solid ${C.borderLight}`,
              boxShadow: '0 24px 60px rgba(10,22,40,0.12)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ padding: '20px 24px 14px', borderBottom: `1px solid ${C.borderLight}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>
                    {mt('page.t200')}
                  </div>
                  {selectedShareChatIds.length > 0 ? (
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.blue, marginTop: 2 }}>
                      {mt('page.chatsSelected', { count: selectedShareChatIds.length })}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsShareModalOpen(false)
                    setSelectedShareChatIds([])
                    setShareSearchQuery('')
                  }}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    border: `1px solid ${C.borderLight}`,
                    background: C.canvas,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <MS name="close" size={16} color={C.inkMuted} />
                </button>
              </div>
              <input
                type="search"
                name="messenger_share_search"
                autoComplete="off"
                value={shareSearchQuery}
                onChange={(event) => setShareSearchQuery(event.target.value)}
                placeholder={mt('page.t304')}
                style={{
                  width: '100%',
                  marginTop: 14,
                  height: 42,
                  borderRadius: 12,
                  border: `1px solid ${C.borderLight}`,
                  background: '#FFFFFF',
                  padding: '0 14px',
                  fontSize: 14,
                  color: C.ink,
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12 }}>
              {shareableChats.length === 0 ? (
                <div style={{ padding: '12px 10px', fontSize: 13, color: C.inkMuted }}>
                  {mt('page.t300')}
                </div>
              ) : (
                shareableChats.map((item) => {
                  const isSelected = selectedShareChatIds.includes(item.chat.id)
                  return (
                    <button
                      key={item.chat.id}
                      type="button"
                      onClick={() => {
                        setSelectedShareChatIds((prev) =>
                          prev.includes(item.chat.id)
                            ? prev.filter((id) => id !== item.chat.id)
                            : [...prev, item.chat.id]
                        )
                      }}
                      disabled={isSharingLink}
                      style={{
                        width: '100%',
                        border: 'none',
                        background: isSelected ? 'rgba(44,140,255,0.08)' : 'transparent',
                        padding: '10px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        textAlign: 'left',
                        borderRadius: 14,
                        cursor: isSharingLink ? 'default' : 'pointer',
                      }}
                    >
                      <MessengerAvatar
                        initials={item.avatar}
                        imageUrl={item.avatarUrl}
                        seed={item.seed}
                        size={42}
                        online={item.online}
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.title}
                        </div>
                        <div style={{ marginTop: 2, fontSize: 12, color: C.inkMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.chat.type === 'group' ? mt('page.t074') : item.isDraft ? mt('page.t164') : mt('page.t171')}
                        </div>
                      </div>
                      <div
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 999,
                          border: `1.5px solid ${isSelected ? C.blue : C.border}`,
                          background: isSelected ? C.blue : '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {isSelected ? <MS name="check" size={14} color="#FFFFFF" /> : null}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 20px', borderTop: `1px solid ${C.borderLight}` }}>
              <button
                type="button"
                onClick={() => {
                  setIsShareModalOpen(false)
                  setSelectedShareChatIds([])
                  setShareSearchQuery('')
                }}
                disabled={isSharingLink}
                style={{
                  height: 40,
                  padding: '0 14px',
                  borderRadius: 10,
                  border: `1px solid ${C.borderLight}`,
                  background: '#FFFFFF',
                  color: C.inkMuted,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: isSharingLink ? 'default' : 'pointer',
                }}
              >
                {mt('page.t190')}
              </button>
              <button
                type="button"
                onClick={() => void handleShareMeetingLink()}
                disabled={isSharingLink || selectedShareChatIds.length === 0}
                style={{
                  height: 40,
                  padding: '0 16px',
                  borderRadius: 10,
                  border: 'none',
                  background: isSharingLink || selectedShareChatIds.length === 0 ? '#B7C7DE' : C.blue,
                  color: '#FFFFFF',
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: isSharingLink || selectedShareChatIds.length === 0 ? 'default' : 'pointer',
                }}
              >
                {isSharingLink ? mt('page.t305') : `${mt('page.send')}${selectedShareChatIds.length > 0 ? ` (${selectedShareChatIds.length})` : ''}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isChatDeleteConfirmOpen && chatDeleteTarget ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(10,22,40,0.24)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 70,
            padding: 16,
          }}
          onClick={() => {
            setIsChatDeleteConfirmOpen(false)
            setChatDeleteTargetId(null)
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 400,
              background: C.surface,
              borderRadius: 20,
              border: `1px solid ${C.borderLight}`,
              boxShadow: '0 24px 60px rgba(10,22,40,0.16)',
              overflow: 'hidden',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ padding: '18px 20px 12px', borderBottom: `1px solid ${C.borderLight}` }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>
                {chatDeleteTarget.chat.type === 'group' ? mt('page.t286') : chatDeleteTarget.chat.type === 'channel' ? mt('page.t287') : mt('page.t288')}
              </div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 4, lineHeight: 1.5 }}>
                {chatDeleteTarget.chat.type === 'group'
                  ? mt('page.t306')
                  : chatDeleteTarget.chat.type === 'channel'
                    ? mt('page.t307')
                    : mt('page.t308')}
              </div>
            </div>
            <div style={{ padding: '18px 20px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => {
                  setIsChatDeleteConfirmOpen(false)
                  setChatDeleteTargetId(null)
                }}
                style={{ height: 38, padding: '0 14px', borderRadius: 10, border: `1px solid ${C.borderLight}`, background: '#FFFFFF', color: C.inkMuted, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                {mt('page.t190')}
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDeleteChat()}
                disabled={isChatListActionLoading}
                style={{ height: 38, padding: '0 16px', borderRadius: 10, border: 'none', background: C.red, color: '#FFFFFF', fontSize: 13, fontWeight: 700, cursor: isChatListActionLoading ? 'default' : 'pointer', opacity: isChatListActionLoading ? 0.6 : 1 }}
              >
                {chatDeleteTarget.chat.type === 'group' ? mt('page.t286') : chatDeleteTarget.chat.type === 'channel' ? mt('page.t287') : mt('page.t288')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isGroupEditModalOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(10,22,40,0.24)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 70,
            padding: 16,
          }}
          onClick={closeGroupEditModal}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 460,
              background: C.surface,
              borderRadius: 20,
              border: `1px solid ${C.borderLight}`,
              boxShadow: '0 24px 60px rgba(10,22,40,0.16)',
              overflow: 'hidden',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ padding: '18px 20px 12px', borderBottom: `1px solid ${C.borderLight}` }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>{mt('page.t284')}</div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 4 }}>{mt('page.t309')}</div>
            </div>
            <div style={{ padding: '18px 20px 20px', display: 'grid', gap: 12 }}>
              {isGroupEditLoading ? (
                <div style={{ fontSize: 13, color: C.inkMuted }}>{mt('page.t310')}</div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '4px 0 8px' }}>
                    <label htmlFor="group-edit-avatar" style={{ position: 'relative', display: 'inline-flex', cursor: 'pointer', borderRadius: '50%' }} title={mt('page.t311')}>
                      <MessengerAvatar
                        initials={getInitials(groupEditName || mt('page.t074'))}
                        imageUrl={groupEditAvatarPreviewUrl ?? groupEditCurrentAvatarUrl}
                        size={72}
                        seed={getSeed(groupEditName || mt('page.t074'))}
                      />
                      <span style={{ position: 'absolute', right: 0, bottom: 0, width: 25, height: 25, borderRadius: '50%', background: C.blue, color: '#FFFFFF', border: '2px solid #FFFFFF', display: 'grid', placeItems: 'center' }}>
                        <MS name="image" size={13} color="#FFFFFF" />
                      </span>
                    </label>
                    <div style={{ minWidth: 0, display: 'grid', gap: 5 }}>
                      <label htmlFor="group-edit-avatar" style={{ fontSize: 13, fontWeight: 700, color: C.blue, cursor: 'pointer' }}>
                        {groupEditAvatar ? mt('page.t312') : mt('page.t313')}
                      </label>
                      <span style={{ fontSize: 12, color: C.inkMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {groupEditAvatar ? groupEditAvatar.name : mt('page.t314')}
                      </span>
                      {groupEditAvatar ? (
                        <button type="button" onClick={() => setGroupEditAvatar(null)} style={{ justifySelf: 'start', border: 0, padding: 0, background: 'transparent', color: C.inkMuted, fontSize: 12, cursor: 'pointer' }}>
                          {mt('page.t315')}
                        </button>
                      ) : null}
                    </div>
                    <input id="group-edit-avatar" type="file" accept="image/*" aria-label={mt('page.t316')} onChange={(event) => {
                      setGroupEditAvatar(event.target.files?.[0] ?? null)
                      event.target.value = ''
                    }} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />
                  </div>
                  <input
                    value={groupEditName}
                    onChange={(event) => setGroupEditName(event.target.value)}
                    placeholder={mt('page.t173')}
                    style={{
                      width: '100%',
                      height: 42,
                      borderRadius: 12,
                      border: `1px solid ${C.border}`,
                      background: C.canvas,
                      padding: '0 12px',
                      outline: 'none',
                      fontSize: 13,
                      color: C.ink,
                      fontFamily: 'inherit',
                    }}
                  />
                  <textarea
                    value={groupEditDescription}
                    onChange={(event) => setGroupEditDescription(event.target.value)}
                    placeholder={mt('page.t317')}
                    rows={4}
                    style={{
                      width: '100%',
                      borderRadius: 12,
                      border: `1px solid ${C.border}`,
                      background: C.canvas,
                      padding: '10px 12px',
                      outline: 'none',
                      fontSize: 13,
                      color: C.ink,
                      fontFamily: 'inherit',
                      resize: 'vertical',
                    }}
                  />
                </>
              )}
              {groupEditError ? <div style={{ fontSize: 12, color: C.red }}>{groupEditError}</div> : null}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={closeGroupEditModal}
                  disabled={isGroupEditSaving}
                  style={{ height: 38, padding: '0 14px', borderRadius: 10, border: `1px solid ${C.borderLight}`, background: '#FFFFFF', color: C.inkMuted, fontSize: 13, fontWeight: 700, cursor: isGroupEditSaving ? 'default' : 'pointer', opacity: isGroupEditSaving ? 0.6 : 1 }}
                >
                  {mt('page.t190')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSubmitGroupEdit()}
                  disabled={isGroupEditLoading || isGroupEditSaving || !groupEditTargetId || !groupEditName.trim()}
                  style={{ height: 38, padding: '0 16px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg, ${C.blue} 0%, #4EA1FF 100%)`, color: '#FFFFFF', fontSize: 13, fontWeight: 700, cursor: isGroupEditLoading || isGroupEditSaving || !groupEditTargetId || !groupEditName.trim() ? 'default' : 'pointer', opacity: isGroupEditLoading || isGroupEditSaving || !groupEditTargetId || !groupEditName.trim() ? 0.7 : 1 }}
                >
                  {isGroupEditSaving ? mt('page.t318') : mt('page.t319')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isDeleteConfirmOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(10,22,40,0.24)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
            padding: 16,
          }}
          onClick={() => {
            setIsDeleteConfirmOpen(false)
            setDeleteTargetMessageIds(null)
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 520,
              background: C.surface,
              borderRadius: 20,
              border: `1px solid ${C.borderLight}`,
              boxShadow: '0 24px 60px rgba(10,22,40,0.16)',
              overflow: 'hidden',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ padding: '18px 20px 12px', borderBottom: `1px solid ${C.borderLight}` }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>{mt('page.t320')}</div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 4 }}>
                {activeChat?.chat.type === 'channel' ? mt('page.t321') : mt('page.t322')}
              </div>
            </div>
            {messageActionError ? (
              <div role="alert" style={{ padding: '12px 20px 0', fontSize: 12, color: C.red }}>{messageActionError}</div>
            ) : null}
            <div style={{ padding: '18px 20px 20px', display: 'flex', justifyContent: 'flex-end', flexWrap: 'nowrap', gap: 10 }}>
              <button type="button" onClick={() => { setIsDeleteConfirmOpen(false); setDeleteTargetMessageIds(null) }} style={{ height: 42, minWidth: 0, flex: '1 1 0', padding: '0 8px', borderRadius: 10, border: `1px solid ${C.borderLight}`, background: '#FFFFFF', color: C.inkMuted, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{mt('page.t190')}</button>
              {canDeleteTargetsForMe ? (
                <button type="button" onClick={() => void handleDeleteSelectedMessages('me')} disabled={isMessageActionLoading} style={{ height: 42, minWidth: 0, flex: '1 1 0', padding: '0 8px', borderRadius: 10, border: `1px solid ${C.red}`, background: '#FFFFFF', color: C.red, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: isMessageActionLoading ? 0.6 : 1 }}>{mt('page.t323')}</button>
              ) : null}
              {canDeleteTargetsForEveryone ? (
                <button type="button" onClick={() => void handleDeleteSelectedMessages('everyone')} disabled={isMessageActionLoading} style={{ height: 42, minWidth: 0, flex: '1 1 0', padding: '0 8px', borderRadius: 10, border: 'none', background: C.red, color: '#FFFFFF', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: isMessageActionLoading ? 0.6 : 1 }}>{activeChat?.chat.type === 'channel' ? mt('page.t154') : mt('page.t324')}</button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {isEditModalOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(10,22,40,0.24)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
            padding: 16,
          }}
          onClick={() => { setIsEditModalOpen(false); setEditTargetMessageId(null) }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 520,
              background: C.surface,
              borderRadius: 20,
              border: `1px solid ${C.borderLight}`,
              boxShadow: '0 24px 60px rgba(10,22,40,0.16)',
              overflow: 'hidden',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ padding: '18px 20px 12px', borderBottom: `1px solid ${C.borderLight}` }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>{mt('page.t325')}</div>
              {!(activeChat?.chat.type === 'channel' && canManageChannelPosts) && moderationRules.editWindowSeconds > 0 ? (
                <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 4 }}>
                  {mt('page.editWindow', { window: formatModerationWindow(moderationRules.editWindowSeconds) })}
                </div>
              ) : null}
            </div>
            <div style={{ padding: 16 }}>
              <textarea
                value={editDraft}
                onChange={(event) => setEditDraft(event.target.value)}
                rows={5}
                style={{
                  width: '100%',
                  borderRadius: 14,
                  border: `1px solid ${C.borderLight}`,
                  background: '#FFFFFF',
                  padding: '12px 14px',
                  outline: 'none',
                  fontSize: 14,
                  color: C.ink,
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
            </div>
            {messageActionError ? (
              <div role="alert" style={{ padding: '0 20px 12px', fontSize: 12, color: C.red }}>{messageActionError}</div>
            ) : null}
            <div style={{ padding: '0 20px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => { setIsEditModalOpen(false); setEditTargetMessageId(null) }} style={{ height: 38, padding: '0 14px', borderRadius: 10, border: `1px solid ${C.borderLight}`, background: '#FFFFFF', color: C.inkMuted, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{mt('page.t190')}</button>
              <button type="button" onClick={() => void confirmEditSelectedMessage()} disabled={!editDraft.trim() || isMessageActionLoading} style={{ height: 38, padding: '0 16px', borderRadius: 10, border: 'none', background: C.blue, color: '#FFFFFF', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: !editDraft.trim() || isMessageActionLoading ? 0.6 : 1 }}>{mt('page.t319')}</button>
            </div>
          </div>
        </div>
      ) : null}

      {isViewersModalOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(10,22,40,0.24)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
            padding: 16,
          }}
          onClick={() => setIsViewersModalOpen(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              background: C.surface,
              borderRadius: 20,
              border: `1px solid ${C.borderLight}`,
              boxShadow: '0 24px 60px rgba(10,22,40,0.16)',
              overflow: 'hidden',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ padding: '18px 20px 12px', borderBottom: `1px solid ${C.borderLight}` }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>{mt('page.t239')}</div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 4 }}>{mt('page.usersCount', { count: messageViewers.length })}</div>
            </div>
            <div style={{ maxHeight: 340, overflowY: 'auto', padding: 16, display: 'grid', gap: 10 }}>
              {messageViewers.length === 0 ? (
                <div style={{ fontSize: 13, color: C.inkMuted }}>{mt('page.t326')}</div>
              ) : (
                messageViewers.map((viewer) => (
                  <div
                    key={`${viewer.userId}-${viewer.readAt}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: `1px solid ${C.borderLight}`,
                      background: '#FFFFFF',
                    }}
                  >
                    <MessengerAvatar initials={getInitials(viewer.fullName)} imageUrl={viewer.avatarUrl} size={36} seed={getSeed(viewer.fullName)} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{viewer.fullName}</div>
                      <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>{formatTimeLabel(viewer.readAt)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div style={{ padding: '0 20px 20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setIsViewersModalOpen(false)}
                style={{
                  height: 38,
                  padding: '0 14px',
                  borderRadius: 10,
                  border: `1px solid ${C.borderLight}`,
                  background: '#FFFFFF',
                  color: C.inkMuted,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {mt('page.t269')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <UserProfileModal
        isOpen={isUserProfileModalOpen}
        user={profileUser}
        currentUserId={currentUser?.id ?? null}
        isOnline={profileUserPresence}
        isLoading={isUserProfileLoading}
        error={userProfileError}
        onRetry={retryOpenUserProfile}
        onClose={() => setIsUserProfileModalOpen(false)}
        onOpenChat={openChatFromProfile}
        onOpenUserProfile={(userId) => void openUserProfile(userId)}
        onSubmitReview={handleSubmitProfileReview}
        onCall={profileUser && profileUser.id > 0 ? () => {
          void startCallWithUser(profileUser.id, profileUser.fullName || profileUser.username || `User ${profileUser.id}`)
        } : undefined}
        personalChatMute={profilePersonalMuteControls}
      />

      <MessengerThemePanel
        open={isThemePanelOpen}
        isMobile={isMobileLayout}
        draft={chatThemeDraft}
        hasSavedTheme={hasSavedChatTheme}
        isSaving={isThemeSaving}
        isResetting={isThemeResetting}
        isUploadingImage={isThemeImageUploading}
        error={chatThemeError}
        onClose={closeThemePanel}
        onChange={handleThemeDraftChange}
        onUploadImage={(file) => void handleThemeImageUpload(file)}
        onSave={() => void handleSaveTheme()}
        onReset={() => void handleResetTheme()}
      />

      {isFolderModalOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(10,22,40,0.24)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: 16,
          }}
          onClick={() => {
            if (isCreatingFolder) {
              return
            }

            setIsFolderModalOpen(false)
            setPendingFolderAssignmentTarget(null)
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 380,
              background: C.surface,
              borderRadius: 20,
              border: `1px solid ${C.borderLight}`,
              boxShadow: '0 24px 60px rgba(10,22,40,0.16)',
              overflow: 'hidden',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ padding: '18px 20px 12px', borderBottom: `1px solid ${C.borderLight}` }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.ink }}>{editingFolderId ? mt('page.t282') : mt('page.t291')}</div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 4 }}>
                {editingFolderId
                  ? mt('page.t327')
                  : pendingFolderAssignmentTarget
                    ? mt('page.t328')
                    : mt('page.t329')}
              </div>
            </div>

            <div style={{ padding: 20 }}>
              {folders.length > 0 ? (
                <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
                  {folders.map((folder) => {
                    const isEditing = editingFolderId === folder.id
                    return (
                      <div
                        key={folder.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          padding: '10px 12px',
                          borderRadius: 12,
                          border: `1px solid ${isEditing ? `${C.blue}44` : C.borderLight}`,
                          background: isEditing ? C.blueSoft : '#FFFFFF',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <MS name="folder" size={16} color={isEditing ? C.blue : C.inkMuted} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {folder.name}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingFolderId(folder.id)
                              setFolderName(folder.name)
                              setFolderError('')
                            }}
                            disabled={isCreatingFolder || isDeletingFolder}
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 8,
                              border: `1px solid ${C.borderLight}`,
                              background: '#FFFFFF',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: isCreatingFolder || isDeletingFolder ? 'default' : 'pointer',
                            }}
                            title={mt('page.t240')}
                          >
                            <MS name="edit" size={15} color={C.inkMuted} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteFolder(folder.id)}
                            disabled={isCreatingFolder || isDeletingFolder}
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 8,
                              border: `1px solid ${C.borderLight}`,
                              background: '#FFFFFF',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: isCreatingFolder || isDeletingFolder ? 'default' : 'pointer',
                              opacity: isCreatingFolder || isDeletingFolder ? 0.6 : 1,
                            }}
                            title={mt('page.t154')}
                          >
                            <MS name="delete" size={15} color={C.red} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : null}

              <input
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
                placeholder={mt('page.t330')}
                autoFocus
                style={{
                  width: '100%',
                  height: 42,
                  borderRadius: 12,
                  border: `1px solid ${C.border}`,
                  background: C.canvas,
                  padding: '0 14px',
                  outline: 'none',
                  fontSize: 14,
                  color: C.ink,
                  fontFamily: 'inherit',
                }}
              />
              {folderError ? <div style={{ marginTop: 10, fontSize: 12, color: C.red }}>{folderError}</div> : null}
            </div>

            <div style={{ padding: '0 20px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => {
                  setIsFolderModalOpen(false)
                  setEditingFolderId(null)
                  setFolderName('')
                  setFolderError('')
                  setPendingFolderAssignmentTarget(null)
                }}
                disabled={isCreatingFolder || isDeletingFolder}
                style={{
                  height: 38,
                  padding: '0 14px',
                  borderRadius: 10,
                  border: `1px solid ${C.borderLight}`,
                  background: '#FFFFFF',
                  color: C.inkMuted,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: isCreatingFolder || isDeletingFolder ? 'default' : 'pointer',
                }}
              >
                {mt('page.t190')}
              </button>
              <button
                type="button"
                onClick={() => void (editingFolderId ? updateFolder() : createFolder())}
                disabled={isCreatingFolder || isDeletingFolder}
                style={{
                  height: 38,
                  padding: '0 16px',
                  borderRadius: 10,
                  border: 'none',
                  background: `linear-gradient(135deg, ${C.blue} 0%, #4EA1FF 100%)`,
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: isCreatingFolder || isDeletingFolder ? 'default' : 'pointer',
                  opacity: isCreatingFolder || isDeletingFolder ? 0.7 : 1,
                  boxShadow: `0 10px 22px ${C.blue}2B`,
                }}
              >
                {isCreatingFolder
                  ? editingFolderId
                    ? mt('page.t318')
                    : pendingFolderAssignmentTarget
                      ? mt('page.t191')
                      : mt('page.t191')
                  : editingFolderId
                    ? mt('page.t319')
                    : pendingFolderAssignmentTarget
                      ? mt('page.t331')
                      : mt('page.t160')}
              </button>
              </div>
          </div>
        </div>
      ) : null}

      <DriveFilePickerModal 
        isOpen={isDrivePickerOpen}
        onClose={() => setIsDrivePickerOpen(false)}
        onSelect={handleDriveFileSelect}
      />

      {showSharedMedia && activeChat && (activeChat.chat.type === 'personal' || activeChat.chat.type === 'group') ? (
        <SharedMediaDialog
          key={activeChat.chat.id}
          chatId={activeChat.chat.id}
          chatType={activeChat.chat.type}
          chatTitle={activeChat.title}
          repository={chatRepository}
          onClose={() => setShowSharedMedia(false)}
        />
      ) : null}

      {showHiddenGroups ? createPortal(
        <div role="presentation" onClick={() => setShowHiddenGroups(false)} style={{ position: 'fixed', inset: 0, zIndex: 810, background: 'rgba(10,22,40,.45)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <section role="dialog" aria-modal="true" aria-label={mt('page.t332')} onClick={(event) => event.stopPropagation()} style={{ width: 'min(460px, 100%)', maxHeight: '80vh', overflowY: 'auto', background: '#fff', borderRadius: 18, padding: 20, boxShadow: '0 24px 60px rgba(0,0,0,.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 19 }}>{mt('page.t332')}</h2>
              <button type="button" onClick={() => setShowHiddenGroups(false)} aria-label={mt('page.t269')} style={{ border: 0, background: 'transparent', cursor: 'pointer' }}><MS name="close" size={21} /></button>
            </div>
            {hiddenGroups.length === 0 ? <p style={{ color: C.inkMuted, fontSize: 13 }}>{mt('page.t333')}</p> : (
              <div style={{ display: 'grid', gap: 10 }}>
                {hiddenGroups.map((group) => (
                  <div key={group.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, border: `1px solid ${C.borderLight}`, borderRadius: 12, padding: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.name}</span>
                    <button type="button" onClick={() => void handleRestoreGroup(group.id)} disabled={restoringGroupId !== null} style={{ border: 0, borderRadius: 9, background: C.blueSoft, color: C.blue, padding: '8px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}>{restoringGroupId === group.id ? mt('page.t334') : mt('page.t335')}</button>
                  </div>
                ))}
              </div>
            )}
            {hiddenGroupsError ? <p role="alert" style={{ color: C.red, fontSize: 13 }}>{hiddenGroupsError}</p> : null}
          </section>
        </div>,
        document.body,
      ) : null}

    </div>
  )
}
