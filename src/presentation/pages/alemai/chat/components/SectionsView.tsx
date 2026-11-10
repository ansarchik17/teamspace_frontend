import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Folder, MessageSquare, MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { ChatNotice } from './ChatNotice'
import FloatingMenu, { floatingMenuItemClass } from '../../../../../shared/ui/FloatingMenu'
import type { AlemAiChatSection } from '../../../../../infrastructure/repositories/HttpAlemAiRepository'
import type { ChatConversationSummary } from '../api/types'
import { BTN_PRIMARY, CHAT_FOCUS, ICON_BTN, sectionTone } from '../chatUi'
import { formatConversationTimestamp } from '../utils'

interface SectionsViewProps {
  sections: AlemAiChatSection[]
  chats: ChatConversationSummary[]
  loading: boolean
  error: string
  openSectionId: string | null
  onOpenSection: (sectionId: string | null) => void
  onCreate: () => void
  onEdit: (section: AlemAiChatSection) => void
  onDelete: (section: AlemAiChatSection) => void
  onOpenChat: (convId: string) => void
  onNewChat: (sectionId: string) => void
}

export function SectionsView({ sections, chats, loading, error, openSectionId, onOpenSection, onCreate, onEdit, onDelete, onOpenChat, onNewChat }: SectionsViewProps) {
  const { t } = useTranslation('ai')
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState<{ anchor: HTMLElement; section: AlemAiChatSection } | null>(null)
  const counts = useMemo(() => {
    const map = new Map<string, { count: number; last: string | null }>()
    for (const chat of chats) {
      if (!chat.section_id) continue
      const entry = map.get(chat.section_id) ?? { count: 0, last: null }
      entry.count += 1
      const stamp = chat.last_message_at || chat.updated_at || null
      if (stamp && (!entry.last || stamp > entry.last)) entry.last = stamp
      map.set(chat.section_id, entry)
    }
    return map
  }, [chats])
  const open = sections.find((section) => section.id === openSectionId) ?? null
  const normalized = query.trim().toLowerCase()
  const visible = sections.filter((section) => !normalized || `${section.name} ${section.description}`.toLowerCase().includes(normalized))

  if (open) {
    const tone = sectionTone(open.color)
    const sectionChats = chats.filter((chat) => chat.section_id === open.id)
    return <div className="mx-auto flex w-full max-w-[880px] flex-col gap-5">
      <button type="button" onClick={() => onOpenSection(null)} className={`-ml-1.5 inline-flex h-8 w-fit items-center gap-1 rounded-lg px-1.5 text-[14px] text-[#586174] hover:bg-[#F1F3F6] hover:text-[#17202E] ${CHAT_FOCUS}`}><ChevronLeft size={17} />{t('chat.allSections')}</button>
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]" style={{ background: tone.soft, color: tone.color }}><Folder size={22} strokeWidth={1.8} /></span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[24px] font-semibold leading-8 tracking-[-0.01em] text-[#17202E]">{open.name}</h1>
          {open.description && <p className="mt-1 text-[14px] text-[#586174]">{open.description}</p>}
        </div>
        <button type="button" aria-label={t('chat.sectionActions')} onClick={(event) => setMenu({ anchor: event.currentTarget, section: open })} className={ICON_BTN}><MoreHorizontal size={18} /></button>
      </div>
      <button type="button" onClick={() => onNewChat(open.id)} className={`${BTN_PRIMARY} w-fit`}><Plus size={17} />{t('chat.newChat')}</button>
      {sectionChats.length === 0
        ? <p className="rounded-2xl border border-dashed border-[#D3D9E3] px-5 py-8 text-center text-[14px] text-[#586174]">{t('chat.sectionNoChats')}</p>
        : <ul className="overflow-hidden rounded-2xl border border-[#E6EAF1]">
          {sectionChats.map((chat) => <li key={chat.conv_id} className="border-b border-[#EEF0F3] last:border-b-0">
            <button type="button" onClick={() => onOpenChat(chat.conv_id)} className={`flex min-h-[60px] w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-[#F8F9FB] ${CHAT_FOCUS}`}>
              <MessageSquare size={17} strokeWidth={1.8} className="shrink-0 text-[#7B8494]" />
              <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-medium text-[#17202E]">{chat.name || t('chat.untitled')}</span>{(chat.preview || chat.last_message) && <span className="block truncate text-[12px] text-[#586174]">{chat.preview || chat.last_message}</span>}</span>
              <span className="shrink-0 text-[12px] tabular-nums text-[#7B8494]">{formatConversationTimestamp(chat.last_message_at || chat.updated_at)}</span>
            </button>
          </li>)}
        </ul>}
      <SectionMenu menu={menu} onClose={() => setMenu(null)} onEdit={onEdit} onDelete={onDelete} />
    </div>
  }

  return <div className="mx-auto flex w-full max-w-[880px] flex-col gap-[22px]">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[24px] font-semibold leading-8 tracking-[-0.01em] text-[#17202E]">{t('chat.navSections')}</h1>
        <p className="mt-1 text-[14px] text-[#586174]">{t('chat.sectionsText')}</p>
      </div>
      <button type="button" className={BTN_PRIMARY} onClick={onCreate}><Plus size={16} />{t('chat.newSection')}</button>
    </div>
    {sections.length > 0 && <label className="flex h-10 max-w-[360px] items-center gap-2 rounded-[10px] border border-[#E2E5EA] px-3 text-[#586174] focus-within:border-[#2458D3]">
      <Search size={16} strokeWidth={1.8} /><span className="sr-only">{t('chat.findSection')}</span>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('chat.findSection')} className="min-w-0 flex-1 bg-transparent text-[14px] text-[#17202E] outline-none placeholder:text-[#7B8494]" />
    </label>}
    {error && <ChatNotice message={error} />}
    {loading && !sections.length
      ? <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5" role="status" aria-label={t('chat.navSections')}>{[0, 1, 2].map((index) => <div key={index} className="h-[168px] animate-pulse rounded-2xl bg-[#F1F3F6] motion-reduce:animate-none" />)}</div>
      : <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5">
        {visible.map((section) => {
          const tone = sectionTone(section.color)
          const stats = counts.get(section.id)
          const count = section.chat_count ?? stats?.count ?? 0
          const updated = formatConversationTimestamp(stats?.last || section.updated_at)
          return <article key={section.id} className="group relative flex min-h-[168px] flex-col gap-3.5 rounded-2xl border border-[#EBEEF3] bg-white p-[18px] shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-[box-shadow,border-color,transform] duration-300 ease-out hover:-translate-y-[2px] hover:border-[#DCE1E8] hover:shadow-[0_10px_24px_-10px_rgba(16,24,40,0.16)] motion-reduce:hover:translate-y-0">
            <div className="flex items-start justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: tone.soft, color: tone.color }}><Folder size={20} strokeWidth={1.8} /></span>
              <button type="button" aria-label={t('chat.sectionActions')} onClick={(event) => setMenu({ anchor: event.currentTarget, section })} className={`${ICON_BTN} relative z-10 -mr-1 -mt-1`}><MoreHorizontal size={17} /></button>
            </div>
            <div className="flex-1">
              <h2 className="text-[15px] font-semibold leading-[22px] text-[#17202E]">
                <button type="button" onClick={() => onOpenSection(section.id)} className={`text-left after:absolute after:inset-0 after:rounded-2xl after:content-[''] ${CHAT_FOCUS}`}>{section.name}</button>
              </h2>
              {section.description && <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-[#586174]">{section.description}</p>}
            </div>
            <p className="flex items-center gap-2 text-[12px] text-[#7B8494]"><span>{t('chat.chatsCount', { count })}</span>{updated && <><span className="h-[3px] w-[3px] rounded-full bg-[#C3C9D4]" /><span>{updated}</span></>}</p>
          </article>
        })}
        <button type="button" onClick={onCreate} className={`flex min-h-[168px] flex-col items-center justify-center gap-2.5 rounded-2xl border-[1.5px] border-dashed border-[#D3D9E3] text-[14px] font-medium text-[#586174] transition-colors hover:border-[#B8C1CF] hover:bg-[#FAFBFC] hover:text-[#17202E] ${CHAT_FOCUS}`}>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F1F3F6]"><Plus size={18} /></span>{t('chat.createSection')}
        </button>
      </div>}
    {!loading && !sections.length && !error && <p className="text-center text-[13px] text-[#7B8494]">{t('chat.sectionsEmptyText')}</p>}
    <SectionMenu menu={menu} onClose={() => setMenu(null)} onEdit={onEdit} onDelete={onDelete} />
  </div>
}

function SectionMenu({ menu, onClose, onEdit, onDelete }: { menu: { anchor: HTMLElement; section: AlemAiChatSection } | null; onClose: () => void; onEdit: (section: AlemAiChatSection) => void; onDelete: (section: AlemAiChatSection) => void }) {
  const { t } = useTranslation('ai')
  return <FloatingMenu anchor={menu?.anchor ?? null} open={Boolean(menu)} onClose={onClose} className="min-w-[200px]">
    {menu && <>
      <button type="button" className={floatingMenuItemClass} onClick={() => { const section = menu.section; onClose(); onEdit(section) }}><Pencil size={16} className="text-[#586174]" />{t('chat.editSection')}</button>
      <button type="button" className={`${floatingMenuItemClass} !text-[#C5301B]`} onClick={() => { const section = menu.section; onClose(); onDelete(section) }}><Trash2 size={16} />{t('chat.deleteSection')}</button>
    </>}
  </FloatingMenu>
}
