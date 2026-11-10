import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Archive, Check, RotateCcw, Search, Trash2 } from 'lucide-react'
import DataTable, { DATA_TABLE_ROW_ICON, DataTableEmpty, DataTablePager, type DataTableColumn } from '../../../../../shared/ui/DataTable'
import type { AlemAiChatSection } from '../../../../../infrastructure/repositories/HttpAlemAiRepository'
import type { ChatConversationSummary } from '../api/types'
import { CHAT_FOCUS } from '../chatUi'

const PAGE_SIZE = 10

interface ArchiveViewProps {
  chats: ChatConversationSummary[]
  sections: AlemAiChatSection[]
  loading: boolean
  busy: boolean
  onRestore: (ids: string[]) => void
  onDelete: (ids: string[]) => void
}

function Checkbox({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) {
  return <button type="button" role="checkbox" aria-checked={checked} aria-label={label} onClick={(event) => { event.stopPropagation(); onChange() }}
    className={`flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-[1.5px] transition-colors ${checked ? 'border-[#2458D3] bg-[#2458D3] text-white' : 'border-[#B4BAC5] bg-white hover:border-[#7B8494]'} ${CHAT_FOCUS}`}>
    {checked && <Check size={12} strokeWidth={3.5} />}
  </button>
}

export function ArchiveView({ chats, sections, loading, busy, onRestore, onDelete }: ArchiveViewProps) {
  const { t, i18n } = useTranslation('ai')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const sectionMap = useMemo(() => new Map(sections.map((section) => [section.id, section])), [sections])
  const normalized = query.trim().toLowerCase()
  const filtered = chats.filter((chat) => !normalized || (chat.name || '').toLowerCase().includes(normalized))
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const live = selected.filter((id) => chats.some((chat) => chat.conv_id === id))
  const allOnPage = rows.length > 0 && rows.every((row) => live.includes(row.conv_id))
  const toggle = (id: string) => setSelected((list) => list.includes(id) ? list.filter((item) => item !== id) : [...list, id])
  const date = (value?: string | null) => value ? new Date(value).toLocaleDateString(i18n.language === 'kk' ? 'kk-KZ' : 'ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

  const columns: DataTableColumn<ChatConversationSummary>[] = [
    { key: 'select', label: <Checkbox checked={allOnPage} label={t('chat.selectAll')} onChange={() => setSelected((list) => allOnPage ? list.filter((id) => !rows.some((row) => row.conv_id === id)) : [...new Set([...list, ...rows.map((row) => row.conv_id)])])} />, track: '24px', render: (chat) => <Checkbox checked={live.includes(chat.conv_id)} label={t('chat.selectRow', { name: chat.name })} onChange={() => toggle(chat.conv_id)} /> },
    { key: 'chat', label: t('chat.colChat'), track: 'minmax(220px,2fr)', render: (chat) => <div className="min-w-0"><p className="truncate font-medium text-[#17202E]">{chat.name || t('chat.untitled')}</p>{(chat.preview || chat.last_message) && <p className="truncate text-[12px] text-[#586174]">{chat.preview || chat.last_message}</p>}</div> },
    { key: 'section', label: t('chat.colSection'), track: 'minmax(130px,1fr)', render: (chat) => {
      const section = chat.section_id ? sectionMap.get(chat.section_id) : null
      return <span className="inline-flex h-[22px] max-w-full items-center gap-1.5 rounded-md bg-[#F1F3F6] px-2 text-[12px] text-[#465066]"><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: section?.color ?? '#B4BAC5' }} /><span className="truncate">{section?.name ?? t('chat.noSection')}</span></span>
    } },
    { key: 'date', label: t('chat.colArchived'), track: '130px', render: (chat) => <span className="text-[13px] tabular-nums">{date(chat.archived_at || chat.updated_at)}</span> },
  ]

  return <div className="mx-auto flex w-full max-w-[880px] flex-col gap-[18px]">
    <div>
      <h1 className="text-[24px] font-semibold leading-8 tracking-[-0.01em] text-[#17202E]">{t('chat.navArchive')}</h1>
      <p className="mt-1 text-[14px] text-[#586174]">{t('chat.archiveText')}</p>
    </div>
    <div className="flex min-h-10 flex-wrap items-center justify-between gap-3">
      <label className="flex h-10 w-[320px] max-w-full items-center gap-2 rounded-[10px] border border-[#E2E5EA] px-3 text-[#586174] focus-within:border-[#2458D3]">
        <Search size={16} strokeWidth={1.8} /><span className="sr-only">{t('chat.archiveSearch')}</span>
        <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder={t('chat.archiveSearch')} className="min-w-0 flex-1 bg-transparent text-[14px] text-[#17202E] outline-none placeholder:text-[#7B8494]" />
      </label>
      {live.length > 0 && <div role="toolbar" aria-label={t('chat.selected', { count: live.length })} className="flex h-10 items-center gap-2 rounded-[10px] bg-[#F3F6FF] pl-3.5 pr-1.5 text-[14px]">
        <span className="font-medium tabular-nums text-[#17202E]">{t('chat.selected', { count: live.length })}</span>
        <button type="button" disabled={busy} onClick={() => { onRestore(live); setSelected([]) }} className={`inline-flex h-[30px] items-center gap-1.5 rounded-lg border border-[#D6DEF5] bg-white px-2.5 text-[13px] font-medium text-[#17202E] hover:bg-[#F8F9FB] disabled:opacity-60 ${CHAT_FOCUS}`}><RotateCcw size={14} />{t('chat.restore')}</button>
        <button type="button" disabled={busy} onClick={() => onDelete(live)} className={`inline-flex h-[30px] items-center gap-1.5 rounded-lg border border-[#F3CFCA] bg-white px-2.5 text-[13px] font-medium text-[#C5301B] hover:bg-[#FFF5F5] disabled:opacity-60 ${CHAT_FOCUS}`}><Trash2 size={14} />{t('chat.delete')}</button>
      </div>}
    </div>
    <DataTable rows={rows} rowKey={(chat) => chat.conv_id} columns={columns} loading={loading && !chats.length} skeletonRows={5}
      ariaLabel={t('chat.navArchive')} actionsLabel={t('chat.colActions')} actionsTrack="80px"
      empty={<DataTableEmpty icon={<Archive size={22} />} title={normalized ? t('chat.nothingFound') : t('chat.archiveEmpty')} text={normalized ? undefined : t('chat.archiveEmptyText')} />}
      actions={(chat) => <>
        <button type="button" disabled={busy} aria-label={t('chat.unarchive')} title={t('chat.unarchive')} onClick={() => onRestore([chat.conv_id])} className={DATA_TABLE_ROW_ICON}><RotateCcw size={16} /></button>
        <button type="button" disabled={busy} aria-label={t('chat.deleteForever')} title={t('chat.deleteForever')} onClick={() => onDelete([chat.conv_id])} className={DATA_TABLE_ROW_ICON}><Trash2 size={16} /></button>
      </>}
      footer={filtered.length > PAGE_SIZE ? <DataTablePager label={`${(current - 1) * PAGE_SIZE + 1}–${Math.min(current * PAGE_SIZE, filtered.length)} / ${filtered.length}`} page={current}
        canPrev={current > 1} canNext={current < pages} onPrev={() => setPage(current - 1)} onNext={() => setPage(current + 1)} prevLabel={t('chat.prev')} nextLabel={t('chat.next')} /> : undefined} />
  </div>
}
