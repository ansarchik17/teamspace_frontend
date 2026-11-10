import type { ChatMessage, UnifiedChat } from '../../domain/entities/Chat'
import type { ChatRepository } from '../../domain/repositories/ChatRepository'
import {
  decryptChatContentWithAnyWrappedKey,
  isEncryptedChatPayload,
} from './chatCrypto'

interface ForwardCryptoState {
  privateKey: string | null
  currentDeviceId: string | null
}

interface ForwardChatMessagesInput {
  chatRepository: ChatRepository
  messages: ChatMessage[]
  targetChats: UnifiedChat[]
  crypto: ForwardCryptoState
}

const decryptForwardedPlaintext = async (
  message: ChatMessage,
  crypto: ForwardCryptoState,
): Promise<string> => {
  if (!isEncryptedChatPayload(message.content)) {
    return message.content
  }

  if (!crypto.privateKey) {
    return 'Сообщение из предыдущей версии недоступно'
  }

  try {
    const { plaintext } = await decryptChatContentWithAnyWrappedKey(
      message.content,
      message.encryptedKeys,
      crypto.privateKey,
      crypto.currentDeviceId,
    )
    return plaintext
  } catch {
    return 'Сообщение из предыдущей версии недоступно'
  }
}

export const forwardChatMessages = async ({
  chatRepository,
  messages,
  targetChats,
  crypto,
}: ForwardChatMessagesInput): Promise<ChatMessage[]> => {
  if (messages.length === 0 || targetChats.length === 0) {
    return []
  }

  const preparedMessages = []
  for (const targetChat of targetChats) {
    if (targetChat.type !== 'personal' && targetChat.type !== 'group') {
      throw new Error(`Forwarding to ${targetChat.type} chats is not supported by this flow.`)
    }

    for (const message of messages) {
      const plaintext = await decryptForwardedPlaintext(message, crypto)
      preparedMessages.push({
        originalMessageId: message.id,
        targetChatId: targetChat.id,
        content: plaintext,
      })
    }
  }

  return chatRepository.forwardMessages(preparedMessages)
}
