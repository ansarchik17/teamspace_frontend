const INTERNAL_CHAT_EVENT_TYPES = new Set([
  'message', 'new_message', 'new_channel_post', 'typing', 'user_status',
  'initial_online_list', 'read', 'read_receipt', 'delivery_receipt', 'unread_count_updated',
])

/** Native chat notifications have no destination after removing the messenger. */
export function isInternalChatNotification(item: { type?: unknown; actionUrl?: unknown }): boolean {
  if (typeof item.actionUrl === 'string') {
    try {
      const url = new URL(item.actionUrl, 'https://unitespace.invalid')
      if (/^\/(?:web\/)?messenger(?:\/|$)/.test(url.pathname)) return true
      if (/^\/(?:web\/)?crm\/messenger(?:\/|$)/.test(url.pathname)) return false
    } catch {
      // A malformed destination must not hide unrelated system notifications.
    }
  }
  const type = typeof item.type === 'string' ? item.type.trim().toLowerCase() : ''
  return INTERNAL_CHAT_EVENT_TYPES.has(type) || /^(?:chat|channel|conversation|message)_/.test(type)
}
