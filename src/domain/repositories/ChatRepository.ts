import type {
  BroadcastResponse,
  ChatFolder,
  ChatGroupDetails,
  ChatCommandDefinition,
  ChatCommandExecuteInput,
  ChatCommandExecuteResponse,
  ChatCommandKanbanContext,
  ChatMessage,
  ChatMessagesPage,
  MessageSyncResult,
  ChatSharedMediaPage,
  ChatSearchMessagesResult,
  GlobalChatSearchResult,
  ChatAttachmentSearchResult,
  ChatType,
  DriveFile,
  ForwardChatMessageInput,
  MessageType,
  MessageViewer,
  PinnedChat,
  PinnedMessage,
  SendChatMessageInput,
  UnifiedChat,
  UploadedChatFile,
  MessageThread,
  ChatAttachmentStats,
} from '../entities/Chat'

export interface ChatRepository {
  createConversation(peerId: number): Promise<{ id: string }>
  getConversations(params?: { limit?: number; offset?: number }): Promise<{ conversations: Array<{ id: string; peerId: number | null }>; count: number }>
  unhideConversation(conversationId: string): Promise<void>
  createGroup(input: { name: string; memberIds?: number[]; description?: string; type?: 'private' | 'public'; maxMembers?: number }): Promise<{ id: string }>
  getGroups(): Promise<ChatGroupDetails[]>
  hideGroup(groupId: string): Promise<void>
  unhideGroup(groupId: string): Promise<void>
  getUnifiedChats(): Promise<UnifiedChat[]>
  getFolders(): Promise<ChatFolder[]>
  createFolder(name: string): Promise<ChatFolder>
  updateFolder(folderId: string, name: string): Promise<void>
  deleteFolder(folderId: string): Promise<void>
  addChatToFolder(folderId: string, chatId: string, chatType: 'conversation' | 'group'): Promise<void>
  removeChatFromFolder(folderId: string, chatId: string): Promise<void>
  getFolder(folderId: string): Promise<ChatFolder>
  getConversationMessages(conversationId: string, params?: { limit?: number; offset?: number }): Promise<ChatMessagesPage>
  getGroupMessages(groupId: string, params?: { limit?: number; offset?: number }): Promise<ChatMessagesPage>
  getSharedMedia(chatId: string, chatType: 'personal' | 'group', params?: { limit?: number; offset?: number }): Promise<ChatSharedMediaPage>
  searchMessages(conversationId: string, query: string, limit?: number): Promise<ChatSearchMessagesResult>
  searchMessagesGlobal(query: string, params?: { limit?: number; offset?: number; chatType?: ChatType; chatId?: string; attachmentType?: string; fromDate?: string; toDate?: string; senderId?: number }): Promise<GlobalChatSearchResult>
  getAttachmentStats(chatId: string): Promise<ChatAttachmentStats>
  searchAttachments(params?: { attachmentType?: string; query?: string; limit?: number; offset?: number; chatId?: string; fromDate?: string; toDate?: string }): Promise<ChatAttachmentSearchResult>
  getGroupDetails(groupId: string): Promise<ChatGroupDetails>
  hideConversation(conversationId: string): Promise<void>
  updateGroup(groupId: string, input: { name: string; description?: string | null }): Promise<void>
  updateGroupAvatar(groupId: string, file: File): Promise<void>
  deleteGroup(groupId: string): Promise<void>
  addGroupMembers(groupId: string, userIds: number[]): Promise<void>
  removeGroupMember(groupId: string, userId: number): Promise<void>
  updateGroupMemberRole(groupId: string, userId: number, role: 'member' | 'admin'): Promise<void>
  leaveGroup(groupId: string): Promise<void>
  sendMessage(input: SendChatMessageInput): Promise<ChatMessage>
  getMessageThread(messageId: string, limit?: number): Promise<MessageThread>
  editMessage(messageId: string, content: string): Promise<void>
  getModerationRules(): Promise<{ editWindowSeconds: number; deleteForEveryoneWindowSeconds: number; deleteScopes: Array<'me' | 'everyone'> }>
  deleteMessage(messageId: string, scope?: 'me' | 'everyone'): Promise<void>
  deleteMessages(messageIds: string[], scope?: 'me' | 'everyone'): Promise<void>
  getMessageViewers(messageId: string): Promise<MessageViewer[]>
  forwardMessages(messages: ForwardChatMessageInput[]): Promise<ChatMessage[]>
  addReaction(messageId: string, reaction: string): Promise<ChatMessage['reactions']>
  removeReaction(messageId: string, reaction: string): Promise<ChatMessage['reactions']>
  broadcastMessage(recipientUserIds: number[], content: string, messageType: MessageType): Promise<BroadcastResponse>
  shareItem(targetChatId: string, itemType: 'task' | 'event' | 'note', itemId: string, comment?: string): Promise<ChatMessage>
  pinChat(chatId: string, chatType: ChatType): Promise<void>
  unpinChat(chatId: string, chatType: ChatType): Promise<void>
  getPinnedChats(): Promise<PinnedChat[]>
  pinMessage(chatId: string, chatType: ChatType, messageId: string): Promise<void>
  unpinMessage(chatId: string, chatType: ChatType, messageId: string): Promise<void>
  getPinnedMessages(chatId: string, chatType: ChatType): Promise<PinnedMessage[]>
  uploadFile(file: File, type: 'image' | 'video' | 'document' | 'file' | 'audio' | 'voice' | 'video_message'): Promise<UploadedChatFile>
  uploadDriveFile(file: File, folderId?: string | null): Promise<DriveFile>
  getFileUrl(objectName: string): Promise<{ url: string; expiresIn: string }>
  deleteFile(objectName: string): Promise<void>
  markAsDelivered(messageId: string): Promise<void>
  markAsRead(messageId: string): Promise<void>
  syncMessages(input: { deviceId: string; conversationId?: string; afterSequence?: number; limit?: number }): Promise<MessageSyncResult>
  confirmSyncPosition(input: { deviceId: string; conversationId?: string; sequence: number }): Promise<void>
  listChatCommands(): Promise<ChatCommandDefinition[]>
  getChatCommandKanbanContext(boardId?: string): Promise<ChatCommandKanbanContext>
  executeChatCommand(input: ChatCommandExecuteInput): Promise<ChatCommandExecuteResponse>
  setConversationMute(conversationId: string, mute: boolean): Promise<boolean>
  setGroupMute(groupId: string, mute: boolean): Promise<boolean>
  setChannelMute(channelId: string, mute: boolean): Promise<boolean>
}
