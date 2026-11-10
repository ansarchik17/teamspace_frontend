import { forwardRef, type KeyboardEvent, type ReactNode } from 'react'
import { Heading1, Heading3, ImageIcon, List, ListOrdered, Mic, Search, Sparkles, SquareCheck, Table, Upload } from 'lucide-react'
import { nt } from './notesText'

export type SlashItemKey = 'text' | 'heading' | 'subheading' | 'todo' | 'bullet' | 'ordered' | 'table' | 'image' | 'audio-upload' | 'audio-record' | 'ai'

export interface SlashItem {
  key: SlashItemKey
  title: string
  description?: string
  icon: ReactNode
  keywords: string
}

export const SLASH_ITEMS: SlashItem[] = [
  { key: 'text', get title() { return nt('slash.t00') }, get description() { return nt('slash.t01') }, icon: <span className="text-[15px] font-medium tracking-[-0.02em]">Aa</span>, keywords: 'text paragraph текст абзац' }, // i18n-ignore
  { key: 'heading', get title() { return nt('slash.t03') }, get description() { return nt('slash.t04') }, icon: <Heading1 size={18} strokeWidth={1.7} />, keywords: 'heading h1 title заголовок' }, // i18n-ignore
  { key: 'subheading', get title() { return nt('slash.t06') }, get description() { return nt('slash.t07') }, icon: <Heading3 size={18} strokeWidth={1.7} />, keywords: 'subheading h3 подзаголовок заголовок 3' }, // i18n-ignore
  { key: 'todo', get title() { return nt('slash.t09') }, get description() { return nt('slash.t10') }, icon: <SquareCheck size={18} strokeWidth={1.7} />, keywords: 'todo checklist check задача чеклист чек-лист' }, // i18n-ignore
  { key: 'bullet', get title() { return nt('slash.t12') }, get description() { return nt('slash.t13') }, icon: <List size={18} strokeWidth={1.7} />, keywords: 'bullet list ul список маркированный' }, // i18n-ignore
  { key: 'ordered', get title() { return nt('slash.t15') }, get description() { return nt('slash.t16') }, icon: <ListOrdered size={18} strokeWidth={1.7} />, keywords: 'numbered ordered list ol список нумерованный' }, // i18n-ignore
  { key: 'table', get title() { return nt('slash.t18') }, get description() { return nt('slash.t19') }, icon: <Table size={18} strokeWidth={1.7} />, keywords: 'table grid таблица' }, // i18n-ignore
  { key: 'image', get title() { return nt('slash.t21') }, get description() { return nt('slash.t22') }, icon: <ImageIcon size={18} strokeWidth={1.7} />, keywords: 'image picture photo картинка изображение фото' }, // i18n-ignore
  { key: 'audio-upload', get title() { return nt('slash.t24') }, get description() { return nt('slash.t25') }, icon: <Upload size={18} strokeWidth={1.7} />, keywords: 'audio upload mp3 m4a wav аудио загрузить файл' }, // i18n-ignore
  { key: 'audio-record', get title() { return nt('slash.t27') }, get description() { return nt('slash.t28') }, icon: <Mic size={18} strokeWidth={1.7} />, keywords: 'audio record voice microphone аудио запись микрофон' }, // i18n-ignore
  { key: 'ai', get title() { return nt('slash.t30') }, icon: <Sparkles size={18} strokeWidth={1.7} className="text-[#2458D3]" />, keywords: 'ai ии спросить assistant' }, // i18n-ignore
]

export const filterSlashItems = (query: string): SlashItem[] => {
  const q = query.trim().toLowerCase()
  if (!q) return SLASH_ITEMS
  return SLASH_ITEMS.filter((item) => `${item.title} ${item.description ?? ''} ${item.keywords}`.toLowerCase().includes(q))
}

interface NoteSlashMenuProps {
  query: string
  activeIndex: number
  position: { top: number; left: number }
  onQueryChange: (value: string) => void
  onHover: (index: number) => void
  onSelect: (item: SlashItem) => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
}

const NoteSlashMenu = forwardRef<HTMLDivElement, NoteSlashMenuProps>(function NoteSlashMenu(
  { query, activeIndex, position, onQueryChange, onHover, onSelect, onKeyDown },
  ref,
) {
  const items = filterSlashItems(query)
  const basic = items.filter((item) => item.key !== 'ai')
  const ai = items.find((item) => item.key === 'ai')

  const renderItem = (item: SlashItem) => {
    const index = items.indexOf(item)
    const active = index === activeIndex
    return (
      <button
        key={item.key}
        type="button"
        role="option"
        aria-selected={active}
        onMouseDown={(event) => event.preventDefault()}
        onMouseEnter={() => onHover(index)}
        ref={(el) => { if (active && el) el.scrollIntoView({ block: 'nearest' }) }}
        onClick={() => onSelect(item)}
        className={`flex w-full items-center gap-3 rounded-lg px-2 py-[7px] text-left transition-colors ${active ? 'bg-[#F2F3F5]' : ''}`}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center text-[#374151]">{item.icon}</span>
        <span className="min-w-0">
          <span className="block text-[13px] leading-[1.25] text-[#111827]">{item.title}</span>
          {item.description ? <span className="block truncate text-[11.5px] leading-[1.3] text-[#6B7280]">{item.description}</span> : null}
        </span>
      </button>
    )
  }

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={nt('slash.t32')}
      className="fixed z-50 w-[234px] overflow-y-auto rounded-[14px] border border-[#E8EAED] bg-white p-2 shadow-[0_16px_40px_rgba(15,23,42,0.12),0_2px_6px_rgba(15,23,42,0.05)]"
      style={{ top: position.top, left: position.left, maxHeight: `calc(100vh - ${position.top + 12}px)` }}
    >
      <div className="relative mb-2">
        <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6B7280]" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={nt('slash.t33')}
          className="h-[34px] w-full rounded-lg border border-[#E3E6EA] bg-white pl-8 pr-2 text-[13px] outline-none placeholder:text-[#6B7280] focus:border-[#2458D3]"
        />
      </div>
      {basic.length > 0 ? (
        <>
          <div className="px-2 pb-1 pt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#6B7280]">{nt('slash.t34')}</div>
          {basic.map(renderItem)}
        </>
      ) : null}
      {ai ? (
        <>
          {basic.length > 0 ? <div className="mx-1 my-1.5 h-px bg-[#EEF0F3]" /> : null}
          {renderItem(ai)}
        </>
      ) : null}
      {items.length === 0 ? <div className="px-2 py-2 text-[12.5px] text-[#6B7280]">{nt('slash.t35')}</div> : null}
    </div>
  )
})

export default NoteSlashMenu
