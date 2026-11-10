import { type AIQuotaWindow } from '../../../../domain/entities/UserAILimits'
import type { ChatConversationSummary } from './api/types'
import { AXIS_UI } from '../../../../shared/ui/axisTokens'

export const CHAT_FOCUS = AXIS_UI.focus
export const BTN_PRIMARY = `inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-[#2458D3] px-4 text-[14px] font-medium text-white transition-colors duration-150 hover:bg-[#1D47B0] disabled:cursor-not-allowed disabled:opacity-50 ${AXIS_UI.focus}`
export const BTN_SECONDARY = `inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-[#E2E5EA] bg-white px-4 text-[14px] font-medium text-[#17202E] transition-colors duration-150 hover:bg-[#F8F9FB] disabled:cursor-not-allowed disabled:opacity-50 ${AXIS_UI.focus}`
export const BTN_DANGER = `inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-[#C5301B] px-4 text-[14px] font-medium text-white transition-colors duration-150 hover:bg-[#A82714] disabled:cursor-not-allowed disabled:opacity-50 ${AXIS_UI.focus}`
export const ICON_BTN = `inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-[#586174] transition-colors duration-150 hover:bg-[#F1F3F6] hover:text-[#17202E] disabled:opacity-40 ${AXIS_UI.focus}`
export const FIELD = 'h-10 w-full rounded-[10px] border border-[#E2E5EA] bg-white px-3 text-[14px] text-[#17202E] outline-none transition-colors placeholder:text-[#7B8494] hover:border-[#C9D3E6] focus:border-[#2458D3] focus:shadow-[0_0_0_3px_rgba(36,88,211,0.12)]'
export const LABEL = 'flex flex-col gap-1.5 text-[13px] font-medium text-[#465066]'

export const SECTION_COLORS = ['#2458D3', '#16A34A', '#F97316', '#7C3AED', '#0E8F80', '#64748B']

export const sectionTone = (color: string) => ({
  color,
  soft: `color-mix(in srgb, ${color} 12%, #FFFFFF)`,
})

export type ChatGroupKey = 'groupPinned' | 'groupToday' | 'groupYesterday' | 'groupWeek' | 'groupMonth' | 'groupOlder'

const stamp = (chat: ChatConversationSummary) => Math.max(Date.parse(chat.last_message_at || '') || 0, Date.parse(chat.updated_at || '') || 0) || Date.now()

export function groupConversations(chats: ChatConversationSummary[], now = new Date()) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day = 86400000
  const order: ChatGroupKey[] = ['groupPinned', 'groupToday', 'groupYesterday', 'groupWeek', 'groupMonth', 'groupOlder']
  const groups = new Map<ChatGroupKey, ChatConversationSummary[]>(order.map((key) => [key, []]))
  for (const chat of chats) {
    const time = stamp(chat)
    const key: ChatGroupKey = chat.pinned ? 'groupPinned'
      : time >= startOfToday ? 'groupToday'
        : time >= startOfToday - day ? 'groupYesterday'
          : time >= startOfToday - 7 * day ? 'groupWeek'
            : time >= startOfToday - 30 * day ? 'groupMonth'
              : 'groupOlder'
    groups.get(key)?.push(chat)
  }
  return order.map((key) => ({ key, items: (groups.get(key) ?? []).sort((a, b) => stamp(b) - stamp(a)) })).filter((group) => group.items.length)
}

const TECHNICAL_ERROR = /not found|internal server|server error|bad request|method not allowed|failed to fetch|network|timeout|^\s*\d{3}\b/i
export const friendlyText = (message: string | null | undefined, fallback: string) => message && !TECHNICAL_ERROR.test(message) ? message : fallback
export const errorText = (error: unknown, fallback: string) => friendlyText(error instanceof Error ? error.message : null, fallback)

export const usedPercent = (window: AIQuotaWindow | null | undefined): number | null => {
  if (!window || window.state === 'unconfigured' || window.state === 'disabled' || !window.limitMicrocredits) return null
  try {
    const limit = BigInt(window.limitMicrocredits)
    const used = BigInt(window.usedMicrocredits)
    if (limit <= 0n || used < 0n) return null
    // Reservations are temporary holds, not spending. Only a committed debit
    // may move this meter to 100%; releasing a hold must not lower usage.
    return used >= limit ? 100 : Number(used * 100n / limit)
  } catch {
    return null
  }
}
