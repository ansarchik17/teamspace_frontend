const storageKey = (userId: number | string): string => `axis:messenger:last-active-chat:${userId}`

const isPersistableChatId = (chatId: string): boolean => !chatId.startsWith('smart-agent')

export function readLastActiveChatId(userId: number | string | null | undefined): string | null {
  if (userId === null || userId === undefined) {
    return null
  }
  try {
    const stored = window.localStorage.getItem(storageKey(userId))
    return stored && isPersistableChatId(stored) ? stored : null
  } catch {
    return null
  }
}

export function writeLastActiveChatId(userId: number | string | null | undefined, chatId: string | null): void {
  if (userId === null || userId === undefined) {
    return
  }
  try {
    if (chatId && isPersistableChatId(chatId)) {
      window.localStorage.setItem(storageKey(userId), chatId)
    } else if (!chatId) {
      window.localStorage.removeItem(storageKey(userId))
    }
  } catch {
    return
  }
}
