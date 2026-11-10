export interface ReplyTreeSource {
  id: string
  replyToId: string | null
}

export interface ReplyTreeRow<T extends ReplyTreeSource> {
  message: T
  depth: number
}

export function countDirectReplies(messages: ReplyTreeSource[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const message of messages) {
    if (message.replyToId) {
      counts.set(message.replyToId, (counts.get(message.replyToId) ?? 0) + 1)
    }
  }
  return counts
}

export function buildReplyThread<T extends ReplyTreeSource>(messages: T[], messageId: string): ReplyTreeRow<T>[] {
  const byId = new Map(messages.map((message) => [message.id, message]))
  let root = byId.get(messageId)
  if (!root) {
    return []
  }

  const ancestors = new Set<string>([root.id])
  while (root.replyToId) {
    const parent = byId.get(root.replyToId)
    if (!parent || ancestors.has(parent.id)) {
      break
    }
    ancestors.add(parent.id)
    root = parent
  }

  const children = new Map<string, T[]>()
  for (const message of messages) {
    if (message.replyToId && byId.has(message.replyToId)) {
      const siblings = children.get(message.replyToId)
      if (siblings) {
        siblings.push(message)
      } else {
        children.set(message.replyToId, [message])
      }
    }
  }

  const rows: ReplyTreeRow<T>[] = []
  const visited = new Set<string>()
  const walk = (message: T, depth: number) => {
    if (visited.has(message.id)) {
      return
    }
    visited.add(message.id)
    rows.push({ message, depth })
    for (const child of children.get(message.id) ?? []) {
      walk(child, depth + 1)
    }
  }
  walk(root, 0)
  return rows
}

export function formatReplyCount(count: number): string {
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) {
    return `${count} ответ`
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} ответа`
  }
  return `${count} ответов`
}
