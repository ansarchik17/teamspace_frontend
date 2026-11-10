import type { ChatMessage, MessageType, UnifiedChat, ReplyToView, ChatType } from '../../../domain/entities/Chat'

export interface CurrentUserState {
  id: number
  name: string
  isSupport?: boolean
}

export interface CryptoState {
  currentDeviceId: string | null
  privateKey: string | null
}

export interface ChatListItem {
  chat: UnifiedChat
  title: string
  subtitle: string
  time: string
  avatar: string
  avatarUrl: string | null
  seed: number
  online: boolean
  unread: number
  isDraft?: boolean
  isGlobal?: boolean
}

export interface MessageView {
  raw: ChatMessage
  replyTo?: ReplyToView | null
  kind: MessageType
  from: 'me' | 'them'
  senderLabel: string
  text: string
  attachment?: ChatAttachmentViewModel
  mediaUrl?: string
  audioUrl?: string
  videoUrl?: string
  time: string
  status: 'sent' | 'delivered' | 'read'
  unavailable: boolean
  isCall: boolean
  tables?: any[]
  feedback?: 'like' | 'dislike' | null
}

export interface ChatAttachmentViewModel {
  kind: 'image' | 'video' | 'video_message' | 'audio' | 'voice' | 'file'
  url: string
  objectName?: string
  filename: string
  size?: number
  mime?: string
  ext?: string
  icon: 'image' | 'video' | 'audio' | 'pdf' | 'word' | 'excel' | 'presentation' | 'text' | 'archive' | 'file'
}

export interface GroupSharedAttachmentItem {
  id: string
  messageId: string
  name: string
  url: string
  previewUrl?: string
  kind: 'image' | 'video' | 'audio' | 'file'
  icon: ChatAttachmentViewModel['icon']
  size?: number
  mime?: string
  ext?: string
  senderLabel: string
  createdAt: string
}

export interface ChatSearchResultItem {
  raw: ChatMessage
  view: MessageView
  senderLabel: string
  snippetText: string
  highlightedSnippet: string | null
  timeLabel: string
  typeLabel: string | null
  chatId: string
  chatType: ChatType
  chatName: string
  attachmentName?: string | null
}

export interface TypingIndicatorState {
  senderId: number
  label: string
}

export interface MentionContext {
  start: number
  end: number
  query: string
}

export interface SelectedMessageActionState {
  ids: string[]
  anchorId: string | null
}

export interface MessageContextMenuState {
  messageId: string
  x: number
  y: number
}

export interface ChatListContextMenuState {
  chatId: string
  x: number
  y: number
  isFolderMenuOpen: boolean
}
