import type { ChatMessage, UnifiedChat } from '../../../domain/entities/Chat'
import type { ChatRepository } from '../../../domain/repositories/ChatRepository'

// Hidden groups are omitted from the unified endpoint. Read their history without
// unhiding them, so normal message/read events can update the same chat entries.
export async function loadHiddenGroupChat(
  repository: ChatRepository,
  groupId: string,
  userId: number,
  isCurrent: () => boolean = () => true,
): Promise<UnifiedChat> {
  const checkCurrent = () => {
    if (!isCurrent()) throw new DOMException('Hidden group load superseded', 'AbortError')
  }
  checkCurrent()
  const group = await repository.getGroupDetails(groupId)
  let lastMessage: ChatMessage | null = null
  let unreadCount = 0
  let offset = 0
  const seen = new Set<string>()
  while (true) {
    checkCurrent()
    const page = await repository.getGroupMessages(groupId, { limit: 100, offset })
    checkCurrent()
    const fresh = page.messages.filter((message) => !seen.has(message.id))
    if (fresh.length === 0) break
    for (const message of fresh) {
      seen.add(message.id)
      if (!lastMessage || message.createdAt > lastMessage.createdAt) lastMessage = message
      if (message.senderId !== userId && !message.isRead) unreadCount += 1
    }
    if (page.messages.length < 100) break
    offset += page.messages.length
  }
  return {
    id: group.id, type: 'group', groupId: group.id, groupName: group.name, groupAvatar: group.avatarUrl,
    peerId: null, peerUsername: null, peerFullName: null, peerAvatar: null, lastSeenAt: null,
    channelId: null, channelName: null, channelAvatar: null, aiModel: null, aiTitle: null,
    lastMessage, unreadCount, mentionCount: 0, isPinned: false, isMuted: false,
    createdAt: group.createdAt, updatedAt: lastMessage?.createdAt ?? group.updatedAt,
  }
}
