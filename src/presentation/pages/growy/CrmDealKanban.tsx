import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, CalendarDays, MoreHorizontal, Plus } from 'lucide-react'
import type { CrmRecord, HttpGrowyPlatformRepository, Page } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { growyErrorMessage } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import FloatingMenu, { floatingMenuItemClass } from '../../../shared/ui/FloatingMenu'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import AxisAvatar from '../../components/board/AxisAvatar'
import { KANBAN_COLUMN_BG } from '../../components/board/kanbanTheme'
import type { CrmCardAction } from './CrmKanban'
import { ErrorNotice } from './growyUi'
import { recordName } from './growyShared'

type Status = 'active' | 'completed' | 'cancelled'
type ColumnPage = Page<CrmRecord> & { page: number }
const STATUSES: { id: Status; color: string }[] = [
  { id: 'active', color: '#2458D3' },
  { id: 'completed', color: '#16A34A' },
  { id: 'cancelled', color: '#9AA0A6' },
]
const COLUMN_ICON = `flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] text-[#586174] transition-colors duration-[120ms] hover:bg-white hover:text-[#17202E] ${AXIS_UI.focus}`
const initialsOf = (value: string) => value.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('')
const money = (record: CrmRecord) => `${Number(record.amount || 0).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ${!record.currency || record.currency === 'KZT' ? '₸' : record.currency}`
const shortDate = (value?: string) => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? '' : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export default function CrmDealKanban({ repository, search, filters, revision, recordActions, onOpen, onCreate, onChanged }: {
  repository: HttpGrowyPlatformRepository; search: string; filters: Record<string, string>; revision: number
  recordActions: (record: CrmRecord) => CrmCardAction[]; onOpen: (record: CrmRecord) => void
  onCreate: () => void; onChanged: () => void
}) {
  const { t } = useTranslation('shell')
  const [pages, setPages] = useState<Partial<Record<Status, ColumnPage>>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [localRevision, setLocalRevision] = useState(0)
  const [moving, setMoving] = useState(false)
  const [moreLoading, setMoreLoading] = useState<Status | null>(null)
  const [dropColumn, setDropColumn] = useState<Status | null>(null)
  const [menu, setMenu] = useState<{ anchor: HTMLElement; record: CrmRecord } | null>(null)
  const drag = useRef<CrmRecord | null>(null)
  const busy = useRef(false)
  const filtersKey = JSON.stringify(filters)

  useEffect(() => {
    const controller = new AbortController()
    const base = JSON.parse(filtersKey) as Record<string, string>
    setLoading(true); setError('')
    const timer = window.setTimeout(() => {
      Promise.all(STATUSES.map(({ id }) => repository.list('deals', { search, filters: { ...base, status: id }, signal: controller.signal })
        .then((page) => { if (!controller.signal.aborted) setPages((current) => ({ ...current, [id]: { ...page, page: 1 } })) })))
        .catch((reason) => { if (!controller.signal.aborted) setError(growyErrorMessage(reason)) })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 250)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [repository, search, filtersKey, revision, localRevision])

  const move = async (record: CrmRecord, status: Status) => {
    if (busy.current || record.status === status) return
    busy.current = true; setMoving(true); setError('')
    try {
      await repository.update('deals', record.id, { status })
      setLocalRevision((value) => value + 1); onChanged()
    } catch (reason) { setError(growyErrorMessage(reason)) }
    finally { busy.current = false; setMoving(false) }
  }
  const more = async (status: Status) => {
    const current = pages[status]
    if (!current?.hasNext || moreLoading) return
    setMoreLoading(status)
    try {
      const next = await repository.list('deals', { search, page: current.page + 1, filters: { ...filters, status } })
      setPages((prev) => ({ ...prev, [status]: { ...next, page: current.page + 1, results: [...new Map([...current.results, ...next.results].map((item) => [item.id, item])).values()] } }))
    } catch (reason) { setError(growyErrorMessage(reason)) }
    finally { setMoreLoading(null) }
  }
  const filtered = Boolean(search) || Object.values(filters).some(Boolean)

  return <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
    {error && <ErrorNotice message={error} retry={() => setLocalRevision((value) => value + 1)} />}
    {moving && <span role="status" className="sr-only">{t('crm.deals.saving')}</span>}
    <div className="relative flex min-h-0 flex-1 items-stretch gap-4 overflow-x-auto pb-4 [scrollbar-color:rgba(23,32,46,0.16)_transparent] [scrollbar-width:thin]" aria-label={t('crm.deals.board')} aria-busy={loading || moving}>
      {STATUSES.map(({ id, color }) => {
        const page = pages[id]
        const name = t(`crm.deals.statuses.${id}`)
        return <section key={id}
          className="flex h-full max-h-full min-h-[160px] w-[calc(100vw-48px)] max-w-[288px] shrink-0 flex-col rounded-[8px] border border-[#E2E5EA] p-2 sm:w-[288px]"
          style={{ backgroundColor: KANBAN_COLUMN_BG }}
          onDragOver={(event) => { if (drag.current && !busy.current) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropColumn(id) } }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropColumn(null) }}
          onDrop={(event) => { event.preventDefault(); if (drag.current) void move(drag.current, id); drag.current = null; setDropColumn(null) }}>
          <header className="flex shrink-0 items-center gap-2 px-2 pb-2 pt-1">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            <h3 className="min-w-0 truncate text-[14px] font-semibold leading-5 text-[#17202E]">{name}</h3>
            <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-white px-1.5 text-[12px] font-medium tabular-nums text-[#586174]">
              {page ? page.count : loading ? '…' : '!'}
            </span>
            <span className="min-w-0 flex-1" />
            {id === 'active' && <button type="button" className={COLUMN_ICON} aria-label={t('crm.deals.addTo', { name })} onClick={onCreate}><Plus size={18} /></button>}
          </header>
          <div className={`flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden overscroll-contain rounded-[6px] p-0.5 outline-dashed outline-2 -outline-offset-2 transition-[background-color,outline-color] duration-[120ms] [scrollbar-gutter:stable] [scrollbar-color:rgba(23,32,46,0.16)_transparent] [scrollbar-width:thin] ${dropColumn === id ? 'bg-[#EDF2FF] outline-[#2458D3]/40' : 'outline-transparent'}`}>
            {page?.results.map((record) => {
              const person = record.manager || record.assigned_to
              const personName = person?.full_name || person?.name || ''
              const title = recordName(record)
              return <article key={record.id} draggable={!loading && !moving} tabIndex={0} role="button" aria-label={t('crm.deals.open', { name: title })}
                onClick={() => onOpen(record)}
                onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpen(record) } }}
                onDragStart={(event) => { drag.current = record; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(record.id)); event.dataTransfer.setDragImage(event.currentTarget, 150, 40) }}
                onDragEnd={() => { drag.current = null; setDropColumn(null) }}
                className={`group relative flex w-full shrink-0 cursor-pointer flex-col rounded-[8px] border border-[#E2E5EA] bg-white px-3.5 py-3.5 text-left transition-[border-color,box-shadow] duration-[120ms] hover:border-[#C4C9D2] hover:shadow-[0_2px_8px_rgba(23,32,46,0.06)] active:cursor-grabbing ${AXIS_UI.focus}`}>
                <div className="mb-3 flex w-full select-none items-start justify-between gap-2">
                  <span className={`inline-flex h-6 shrink-0 items-center rounded-[6px] px-2 text-[12px] font-semibold tabular-nums ${id === 'cancelled' ? 'bg-[#17202E]/[0.05] text-[#8A93A5] line-through' : id === 'completed' ? 'bg-[#E7F5EE] text-[#16734B]' : 'bg-[#EDF2FF] text-[#2458D3]'}`}>
                    {money(record)}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="pt-0.5 text-[12px] font-medium leading-4 tabular-nums text-[#586174]">№ {record.id}</span>
                    <button type="button" className="-my-1 -mr-1.5 flex h-7 w-7 items-center justify-center rounded-[6px] text-[#586174] opacity-0 transition-[opacity,background-color] duration-[120ms] hover:bg-[#F1F2F4] hover:text-[#17202E] focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-0"
                      aria-label={t('crm.deals.actions', { name: title })} aria-haspopup="menu" disabled={loading || moving}
                      onClick={(event) => { event.stopPropagation(); setMenu({ anchor: event.currentTarget, record }) }}><MoreHorizontal size={16} /></button>
                  </div>
                </div>
                <p className="line-clamp-2 select-none break-words text-[14px] font-semibold leading-5 text-[#17202E]">{title}</p>
                {record.comment && <p className="mt-1 line-clamp-1 select-none break-words text-[12px] leading-4 text-[#586174]">{record.comment}</p>}
                <div className="mt-3.5 flex w-full shrink-0 items-center justify-between gap-2">
                  <span className="inline-flex shrink-0 items-center gap-1 text-[12px] leading-4 tabular-nums text-[#586174]">
                    <CalendarDays size={14} />{shortDate(record.created_date)}
                  </span>
                  {person && <AxisAvatar initials={initialsOf(personName) || String(person.id).slice(-2)} size={24} seed={person.id} title={personName} />}
                </div>
              </article>
            })}
            {!page && <p role="status" className="px-3 py-5 text-center text-[12px] text-[#586174]">{loading ? t('crm.deals.loading') : t('crm.deals.failed')}</p>}
            {page && page.count === 0 && <p className="rounded-[8px] border border-dashed border-[#C4C9D2] px-3 py-5 text-center text-[12px] leading-5 text-[#586174]">
              {filtered ? t('crm.deals.emptyFiltered') : t('crm.deals.empty')}
            </p>}
            {page?.hasNext && <button type="button" className={`inline-flex h-9 w-full shrink-0 items-center justify-center rounded-[6px] text-[13px] font-medium text-[#586174] transition-colors duration-[120ms] hover:bg-white hover:text-[#2458D3] ${AXIS_UI.focus}`}
              disabled={moreLoading !== null} onClick={() => void more(id)}>
              {moreLoading === id ? t('crm.deals.loadingMore') : t('crm.deals.more')}
            </button>}
            {id === 'active' && <button type="button" className={`inline-flex h-9 w-full shrink-0 items-center gap-1.5 rounded-[6px] px-2 text-[14px] font-medium text-[#586174] transition-colors duration-[120ms] hover:bg-white hover:text-[#2458D3] ${AXIS_UI.focus}`}
              onClick={onCreate}><Plus size={18} />{t('crm.deals.add')}</button>}
          </div>
        </section>
      })}
    </div>
    <FloatingMenu anchor={menu?.anchor ?? null} open={Boolean(menu)} onClose={() => setMenu(null)} className="min-w-[220px] py-1.5">
      {menu && <>
        {recordActions(menu.record).map((action) => <button key={action.key} type="button" className={floatingMenuItemClass} disabled={action.disabled}
          onClick={() => { setMenu(null); action.onClick() }}>{action.icon}{action.label}</button>)}
        <div className="my-1.5 h-px bg-[#E2E5EA]" />
        <p className="px-4 pb-1 pt-1.5 text-[12px] font-medium text-[#8A93A5]">{t('crm.deals.moveTo')}</p>
        {STATUSES.map(({ id, color }) => <button key={id} type="button" className={floatingMenuItemClass} disabled={menu.record.status === id}
          onClick={() => { const record = menu.record; setMenu(null); void move(record, id) }}>
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <span className="min-w-0 flex-1 truncate">{t(`crm.deals.statuses.${id}`)}</span>
          {menu.record.status === id ? <span className="text-[12px] text-[#8A93A5]">{t('crm.deals.now')}</span> : <ArrowRight size={14} className="text-[#8A93A5]" />}
        </button>)}
      </>}
    </FloatingMenu>
  </div>
}
