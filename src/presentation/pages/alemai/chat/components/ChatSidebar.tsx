import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Archive, Folder, FolderInput, MessageSquare, MoreHorizontal, Pencil, Pin, PinOff, Plus, Search, SlidersHorizontal, Trash2, X } from 'lucide-react'
import FloatingMenu, { floatingMenuItemClass } from '../../../../../shared/ui/FloatingMenu'
import { useUserAILimits } from '../../../../alemai/useUserAILimits'
import type { ChatConversationSummary } from '../api/types'
import { CHAT_FOCUS, groupConversations, usedPercent } from '../chatUi'
import { UsageRing } from './ChatDialogs'

export type AiView = 'chat' | 'sections' | 'archive'
export type ChatAction = 'rename' | 'pin' | 'move' | 'archive' | 'delete'

interface ChatSidebarProps {
  collapsed: boolean
  compact: boolean
  onClose: () => void
  view: AiView
  onViewChange: (view: AiView) => void
  conversations: ChatConversationSummary[]
  archivedCount: number
  sectionsCount: number
  selectedConversationId: string
  onSelectConversation: (convId: string) => void
  onCreateConversation: () => void
  isCreatingConversation?: boolean
  isConversationsLoading: boolean
  conversationsError: string
  onChatAction: (chat: ChatConversationSummary, action: ChatAction) => void
  onOpenLimits: () => void
  onOpenSettings: () => void
}

const NAV_ITEM = `flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[14px] transition-colors duration-150 ${CHAT_FOCUS}`

function LimitsButton({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation('ai')
  const { limits } = useUserAILimits()
  const values = [usedPercent(limits?.fiveHour), usedPercent(limits?.weekly)].filter((value): value is number => typeof value === 'number')
  const used = values.length ? Math.max(...values) : null
  return <button type="button" onClick={onOpen} className={`flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[13px] text-[#465066] transition-colors hover:bg-[#F1F3F6] hover:text-[#17202E] ${CHAT_FOCUS}`}>
    <UsageRing value={used} />
    <span className="min-w-0 flex-1 truncate font-medium text-[#17202E]">{t('chat.limits')}</span>
    <span className="shrink-0 tabular-nums">{used === null ? '—' : `${used}%`}</span>
  </button>
}

export function ChatSidebar(props: ChatSidebarProps) {
  const { t } = useTranslation('ai')
  const { collapsed, compact, onClose, view, onViewChange, conversations, selectedConversationId } = props
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState<{ anchor: HTMLElement; chat: ChatConversationSummary } | null>(null)
  const normalized = query.trim().toLowerCase()
  const filtered = useMemo(() => normalized
    ? conversations.filter((chat) => `${chat.name} ${chat.preview || chat.last_message || ''}`.toLowerCase().includes(normalized))
    : conversations, [conversations, normalized])
  const groups = useMemo(() => groupConversations(filtered), [filtered])
  const nav: { id: AiView; label: string; icon: typeof MessageSquare; count?: number }[] = [
    { id: 'chat', label: t('chat.navChats'), icon: MessageSquare },
    { id: 'sections', label: t('chat.navSections'), icon: Folder, count: props.sectionsCount },
    { id: 'archive', label: t('chat.navArchive'), icon: Archive, count: props.archivedCount },
  ]
  const act = (action: ChatAction) => {
    if (!menu) return
    const chat = menu.chat
    setMenu(null)
    props.onChatAction(chat, action)
  }

  return <>
    {compact && <button type="button" onClick={onClose} aria-label={t('chat.close')}
      className={`fixed inset-0 z-30 transition-opacity duration-300 ${collapsed ? 'pointer-events-none opacity-0' : 'bg-[#0A1628]/25 opacity-100'}`} />}
    <aside aria-label={t('chat.navChats')}
      className={`flex flex-col overflow-hidden border-r border-[#E6EAF1] bg-[#FAFBFC] transition-[width,transform,opacity] duration-300 ease-out ${compact
        ? `fixed bottom-0 left-0 top-0 z-40 w-[85vw] max-w-[300px] shadow-2xl ${collapsed ? '-translate-x-full opacity-0' : 'translate-x-0 opacity-100'}`
        : `h-full shrink-0 ${collapsed ? 'w-0 opacity-0' : 'w-[280px] opacity-100'}`}`}>
      <div className="flex w-[280px] max-w-full flex-1 flex-col overflow-hidden">
        <div className="flex flex-col gap-3 px-3.5 pb-2 pt-4">
          <div className="flex items-center gap-2">
            <h2 className="workspace-people-panel__title min-w-0 flex-1 truncate !px-1 text-[#17202E]">Team AI</h2>
            {compact && <button type="button" onClick={onClose} aria-label={t('chat.close')} className={`flex h-9 w-9 items-center justify-center rounded-[10px] text-[#586174] hover:bg-[#F1F3F6] ${CHAT_FOCUS}`}><X size={18} /></button>}
          </div>
          <button type="button" onClick={props.onCreateConversation} disabled={props.isCreatingConversation}
            className={`flex h-10 items-center justify-center gap-2 rounded-[10px] bg-[#2458D3] px-3 text-[14px] font-medium text-white shadow-[0_6px_14px_-8px_rgba(36,88,211,0.8)] transition-colors hover:bg-[#1D47B0] disabled:opacity-60 ${CHAT_FOCUS}`}>
            <Plus size={18} strokeWidth={2} />{t('chat.newChat')}
          </button>
          <label className="flex h-9 items-center gap-2 rounded-[10px] bg-[#F1F3F6] px-2.5 text-[#586174] transition-colors focus-within:bg-white focus-within:shadow-[0_0_0_1px_#2458D3]">
            <Search size={16} strokeWidth={1.8} className="shrink-0" />
            <span className="sr-only">{t('chat.search')}</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('chat.search')} className="min-w-0 flex-1 bg-transparent text-[13px] text-[#17202E] outline-none placeholder:text-[#7B8494]" />
          </label>
        </div>

        <nav className="flex flex-col gap-0.5 px-2 py-1">
          {nav.map((item) => {
            const Icon = item.icon
            const active = view === item.id
            return <button key={item.id} type="button" aria-current={active ? 'page' : undefined} onClick={() => onViewChange(item.id)}
              className={`${NAV_ITEM} ${active ? 'bg-[#EEF1F5] font-semibold text-[#17202E]' : 'text-[#465066] hover:bg-[#F1F3F6] hover:text-[#17202E]'}`}>
              <Icon size={17} strokeWidth={1.8} />
              <span className="flex-1">{item.label}</span>
              {!!item.count && <span className="text-[12px] font-normal tabular-nums text-[#7B8494]">{item.count}</span>}
            </button>
          })}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 pt-2 [scrollbar-color:#D1D5DB_transparent] [scrollbar-width:thin]">
          {props.isConversationsLoading && !conversations.length
            ? <div className="space-y-2 px-2.5 pt-2" role="status" aria-label={t('chat.navChats')}>{[70, 52, 84, 60, 74].map((width, index) => <span key={index} className="block h-4 animate-pulse rounded-md bg-[#EEF1F5] motion-reduce:animate-none" style={{ width: `${width}%` }} />)}</div>
            : props.conversationsError && !conversations.length
              ? <p className="flex items-center gap-2 px-2.5 py-2 text-[13px] text-[#586174]"><AlertCircle size={14} className="shrink-0 text-[#D9480F]" />{t('chat.loadFailed')}</p>
              : !groups.length
                ? <p className="px-2.5 py-2 text-[13px] text-[#7B8494]">{normalized ? t('chat.nothingFound') : t('chat.emptyList')}</p>
                : <div className="flex flex-col gap-3.5">
                  {groups.map((group) => <div key={group.key} className="flex flex-col gap-px">
                    <p className="px-2.5 pb-1 text-[12px] font-medium text-[#7B8494]">{t(`chat.${group.key}`)}</p>
                    {group.items.map((chat) => {
                      const active = view === 'chat' && chat.conv_id === selectedConversationId
                      const menuOpen = menu?.chat.conv_id === chat.conv_id
                      return <div key={chat.conv_id} className={`group relative flex h-9 items-center rounded-[8px] transition-colors duration-150 ${active ? 'bg-[#EDF2FF]' : menuOpen ? 'bg-[#F1F3F6]' : 'hover:bg-[#F1F3F6]'}`}>
                        <button type="button" onClick={() => props.onSelectConversation(chat.conv_id)} aria-current={active ? 'page' : undefined}
                          className={`flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-[8px] pl-2.5 pr-9 text-left text-[14px] ${active ? 'font-medium text-[#17202E]' : 'text-[#465066]'} ${CHAT_FOCUS}`}>
                          {chat.pinned && <Pin size={13} strokeWidth={2} className="shrink-0 text-[#7B8494]" />}
                          <span className="truncate">{chat.name || t('chat.untitled')}</span>
                        </button>
                        <button type="button" data-no-tooltip aria-label={t('chat.actions')} aria-haspopup="menu" aria-expanded={menuOpen}
                          onClick={(event) => setMenu(menuOpen ? null : { anchor: event.currentTarget, chat })}
                          className={`absolute right-1 flex h-7 w-7 items-center justify-center rounded-md text-[#465066] transition-opacity hover:bg-[#E3E8F0] hover:text-[#17202E] focus-visible:opacity-100 ${menuOpen || active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} ${CHAT_FOCUS}`}>
                          <MoreHorizontal size={16} />
                        </button>
                      </div>
                    })}
                  </div>)}
                </div>}
        </div>

        <div className="flex items-center gap-1 border-t border-[#E6EAF1] px-2.5 py-2.5">
          <LimitsButton onOpen={props.onOpenLimits} />
          <button type="button" onClick={props.onOpenSettings} aria-label={t('chat.settings')} title={t('chat.settings')} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[#465066] transition-colors hover:bg-[#F1F3F6] hover:text-[#17202E] ${CHAT_FOCUS}`}><SlidersHorizontal size={18} strokeWidth={1.8} /></button>
        </div>
      </div>
    </aside>

    <FloatingMenu anchor={menu?.anchor ?? null} open={Boolean(menu)} onClose={() => setMenu(null)} align="start" className="min-w-[220px]">
      {menu && <>
        <button type="button" className={floatingMenuItemClass} onClick={() => act('rename')}><Pencil size={16} className="text-[#586174]" />{t('chat.rename')}</button>
        <button type="button" className={floatingMenuItemClass} onClick={() => act('pin')}>{menu.chat.pinned ? <PinOff size={16} className="text-[#586174]" /> : <Pin size={16} className="text-[#586174]" />}{menu.chat.pinned ? t('chat.unpin') : t('chat.pin')}</button>
        <button type="button" className={floatingMenuItemClass} onClick={() => act('move')}><FolderInput size={16} className="text-[#586174]" />{t('chat.move')}</button>
        <button type="button" className={floatingMenuItemClass} onClick={() => act('archive')}><Archive size={16} className="text-[#586174]" />{t('chat.archive')}</button>
        <div className="mx-2 my-1 h-px bg-[#EEF0F3]" />
        <button type="button" className={`${floatingMenuItemClass} !text-[#C5301B]`} onClick={() => act('delete')}><Trash2 size={16} />{t('chat.delete')}</button>
      </>}
    </FloatingMenu>
  </>
}
