import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, Columns3, MoreHorizontal, Pencil, Plus } from 'lucide-react'
import type { CrmRecord, CrmResource, HttpGrowyPlatformRepository, Page } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { growyErrorMessage } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import AppButton from '../../../shared/ui/AppButton'
import AppModal from '../../../shared/ui/AppModal'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import AxisAvatar from '../../components/board/AxisAvatar'
import { DueDate } from '../../components/board/TaskMeta'
import { KANBAN_COLUMN_BG } from '../../components/board/kanbanTheme'
import FloatingMenu, { floatingMenuItemClass } from '../../../shared/ui/FloatingMenu'
import { ErrorNotice, Field } from './growyUi'
import { inputClass, recordName } from './growyShared'
import CrmSelect from './CrmSelect'

export interface CrmCardAction { key: string; label: string; icon: ReactNode; onClick: () => void; disabled?: boolean }
const COLUMN_ICON = `flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] text-[#586174] transition-colors duration-[120ms] hover:bg-white hover:text-[#17202E] ${AXIS_UI.focus}`
const SOURCE_COLORS: Record<string, string> = { whatsapp: '#16A34A', facebook: '#2458D3', instagram: '#D946EF', meta: '#2458D3', website: '#0EA5E9', referral: '#F59E0B', manual: '#7B8494', offline: '#7B8494' }
const initialsOf = (value: string) => value.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('')
const shortDate = (value: string) => { const date = new Date(value); return Number.isNaN(date.valueOf()) ? value : date.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }
type Move = { record: CrmRecord; column: CrmRecord; position: number }
type ColumnPage = Page<CrmRecord> & { page: number }
export default function CrmKanban({ repository, resource, search, filters, revision, recordActions, onOpen, onForm }: {
  repository: HttpGrowyPlatformRepository; resource: 'leads' | 'tasks'; search: string
  filters: Record<string, string>; revision: number; recordActions: (record: CrmRecord) => CrmCardAction[]
  onOpen: (record: CrmRecord) => void
  onForm: (resource: CrmResource, record?: CrmRecord, defaultStageId?: number, defaultColumnId?: number) => void
}) {
  const columnsResource = resource === 'leads' ? 'lead-stages' : 'task-kanban-columns'
  const [columns, setColumns] = useState<CrmRecord[]>([])
  const [pages, setPages] = useState<Record<number, ColumnPage>>({})
  const [loading, setLoading] = useState(true)
  const [moreLoading, setMoreLoading] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [localRevision, setLocalRevision] = useState(0)
  const [moving, setMoving] = useState(false)
  const [pending, setPending] = useState<Move | null>(null)
  const [reasons, setReasons] = useState<CrmRecord[]>([])
  const [reasonId, setReasonId] = useState('')
  const [comment, setComment] = useState('')
  const [attempts, setAttempts] = useState('1')
  const [callAt, setCallAt] = useState('')
  const [taskTitle, setTaskTitle] = useState('Перезвонить клиенту')
  const [taskDue, setTaskDue] = useState('')
  const drag = useRef<CrmRecord | null>(null)
  const [dropColumn, setDropColumn] = useState<number | null>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const columnElements = useRef(new Map<number, HTMLElement>())
  const [manageColumns, setManageColumns] = useState(false)
  const [menu, setMenu] = useState<{ anchor: HTMLElement; column?: CrmRecord; record?: CrmRecord } | null>(null)
  const busy = useRef(false)
  const generation = useRef(0)
  const filtersKey = JSON.stringify(filters)
  const queryFor = (column: CrmRecord, currentFilters: Record<string, string>) => ({ ...currentFilters, [resource === 'leads' ? 'stage_id' : 'kanban_column_id']: String(column.id) })
  useEffect(() => {
    const controller = new AbortController()
    generation.current += 1
    setLoading(true); setError(''); setColumns([]); setPages({})
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const items = await repository.all(columnsResource, controller.signal)
          if (controller.signal.aborted) return
          setColumns(items)
          // Keep per-column pagination while bounding concurrent requests to the SSO proxy.
          let nextColumn = 0
          const currentFilters = JSON.parse(filtersKey)
          await Promise.all(Array.from({ length: Math.min(3, items.length) }, async () => {
            while (!controller.signal.aborted && nextColumn < items.length) {
              const column = items[nextColumn++]
              try {
                const page = await repository.list(resource, { search, filters: { ...currentFilters, [resource === 'leads' ? 'stage_id' : 'kanban_column_id']: String(column.id) }, signal: controller.signal })
                if (!controller.signal.aborted) setPages((current) => ({ ...current, [column.id]: { ...page, page: 1 } }))
              } catch (error) {
                if (!controller.signal.aborted) setError(growyErrorMessage(error))
              }
            }
          }))
        } catch (error) { if (!controller.signal.aborted) setError(growyErrorMessage(error)) }
        finally { if (!controller.signal.aborted) setLoading(false) }
      })()
    }, 250)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [repository, resource, columnsResource, search, filtersKey, revision, localRevision])
  useEffect(() => {
    if (pending?.column.system_key !== 'rejected') return
    const controller = new AbortController()
    repository.rejectionReasons(controller.signal).then((result) => {
      if (!controller.signal.aborted) setReasons(result)
    }).catch((error) => { if (!controller.signal.aborted) setError(growyErrorMessage(error)) })
    return () => controller.abort()
  }, [repository, pending])
  const move = async (target: Move, extra: Record<string, unknown> = {}) => {
    if (busy.current) return
    busy.current = true; setMoving(true); setError('')
    try {
      await repository.move(resource, target.record.id, resource === 'leads'
        ? { stage_id: target.column.id, position: target.position, ...extra }
        : { kanban_column_id: target.column.id, kanban_position: target.position })
      setPending(null); setLocalRevision((value) => value + 1)
    } catch (error) { setError(growyErrorMessage(error)) }
    finally { busy.current = false; setMoving(false) }
  }
  const requestMove = (record: CrmRecord, column: CrmRecord, position = 0) => {
    if (loading || busy.current || column.is_active === false) return
    const backward = resource === 'leads' && (columns.find((item) => item.id === record.stage?.id)?.order ?? 0) > (column.order ?? 0)
    const needsDetails = resource === 'leads' && !backward && (column.system_key === 'rejected' || (column.system_key === 'no_answer' && record.stage?.id !== column.id))
    const target = { record, column, position }
    if (needsDetails) { setPending(target); setReasonId(''); setComment(''); setCallAt(''); setTaskDue(''); setError('') }
    else void move(target)
  }
  const more = async (column: CrmRecord) => {
    const current = pages[column.id]
    if (!current?.hasNext || moreLoading !== null) return
    const version = generation.current
    setMoreLoading(column.id)
    try {
      const next = await repository.list(resource, { search, page: current.page + 1, filters: queryFor(column, filters) })
      if (version === generation.current) setPages((prev) => ({ ...prev, [column.id]: { ...next, page: current.page + 1, results: [...new Map([...current.results, ...next.results].map((item) => [item.id, item])).values()] } }))
    } catch (error) { if (version === generation.current) setError(growyErrorMessage(error)) }
    finally { setMoreLoading(null) }
  }
  const reorder = async (index: number, offset: number) => {
    if (loading || busy.current || index + offset < 0 || index + offset >= columns.length) return
    const next = [...columns]
    ;[next[index], next[index + offset]] = [next[index + offset], next[index]]
    busy.current = true; setMoving(true); setError('')
    try {
      const updated = await repository.reorderColumns(columnsResource, next.map((item) => item.id))
      // Keep loaded cards and the viewport in place after changing column order.
      setColumns(Array.isArray(updated) && updated.length === next.length ? updated : next.map((item, position) => ({ ...item, order: position })))
    }
    catch (error) { setError(growyErrorMessage(error)) }
    finally { busy.current = false; setMoving(false) }
  }
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
    {error && <ErrorNotice message={error} retry={() => setLocalRevision((value) => value + 1)} />}
    {loading && columns.length === 0 ? <p role="status" className="p-12 text-center text-sm text-[#586174]">Загружаем доску…</p> : <>
      {moving && <span role="status" className="sr-only">Сохраняем…</span>}
      <div ref={viewport} className="relative flex min-h-0 flex-1 items-stretch gap-4 overflow-x-auto pb-4 [scrollbar-color:rgba(23,32,46,0.16)_transparent] [scrollbar-width:thin]"
        aria-label="Канбан CRM" aria-busy={loading || moving}>
        {columns.map((column) => <section key={column.id}
          ref={(element) => { if (element) columnElements.current.set(column.id, element); else columnElements.current.delete(column.id) }}
          className="flex h-full max-h-full min-h-[160px] w-[calc(100vw-48px)] max-w-[288px] shrink-0 flex-col rounded-[8px] border border-[#E2E5EA] p-2 sm:w-[288px]"
          style={{ backgroundColor: KANBAN_COLUMN_BG }}
          onDragOver={(event) => {
            if (drag.current && !busy.current && column.is_active !== false) {
              event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropColumn(column.id)
            }
          }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropColumn(null) }}
          onDrop={(event) => { event.preventDefault(); if (drag.current) requestMove(drag.current, column); drag.current = null; setDropColumn(null) }}>
          <header className="flex shrink-0 items-center gap-2 px-2 pb-2 pt-1">
            <h3 className="min-w-0 truncate text-[14px] font-semibold leading-5 text-[#17202E]" title={column.name}>{column.name}</h3>
            <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-white px-1.5 text-[12px] font-medium tabular-nums text-[#586174]">
              {pages[column.id] ? pages[column.id].count : loading ? '…' : '!'}
            </span>
            {column.is_active === false && <span className="shrink-0 text-[12px] text-[#586174]">· неактивна</span>}
            <span className="min-w-0 flex-1" />
            <button type="button" className={COLUMN_ICON} aria-label={`Добавить ${resource === 'leads' ? 'лид' : 'задачу'} в ${column.name}`}
              onClick={() => onForm(resource, undefined, resource === 'leads' ? column.id : undefined, resource === 'tasks' ? column.id : undefined)}><Plus size={18} /></button>
            <button type="button" className={COLUMN_ICON} aria-label={`Действия с колонкой ${column.name}`} aria-haspopup="menu"
              onClick={(event) => setMenu({ anchor: event.currentTarget, column })}><MoreHorizontal size={18} /></button>
          </header>
          <div className={`flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden overscroll-y-contain rounded-[6px] p-0.5 outline-dashed outline-2 -outline-offset-2 transition-[background-color,outline-color] duration-[120ms] [scrollbar-gutter:stable] [scrollbar-color:rgba(23,32,46,0.16)_transparent] [scrollbar-width:thin] ${dropColumn === column.id ? 'bg-[#EDF2FF] outline-[#2458D3]/40' : 'outline-transparent'}`}
            onDragOver={(event) => {
              if (!drag.current) return
              const list = event.currentTarget
              const bounds = list.getBoundingClientRect()
              if (event.clientY < bounds.top + 100) list.scrollTop -= 25
              else if (event.clientY > bounds.bottom - 100) list.scrollTop += 25
            }}>
            {pages[column.id]?.results.map((record) => {
              const contact = record.phone || record.whatsapp || record.email || ''
              const person = record.assigned_to || record.manager
              const personName = person?.full_name || person?.name || ''
              const due = record.due_at || record.next_action_at
              const preview = record.comment || record.description || ''
              return <article key={record.id} draggable={!loading && !moving} tabIndex={0} role="button"
                aria-label={`Открыть ${recordName(record)}`}
                onClick={() => onOpen(record)}
                onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onOpen(record) } }}
                onDragStart={(event) => { drag.current = record; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(record.id)); event.dataTransfer.setDragImage(event.currentTarget, 150, 40) }}
                onDragEnd={() => { drag.current = null; setDropColumn(null) }}
                onDragOver={(event) => { if (drag.current) event.preventDefault() }}
                onDrop={(event) => { event.preventDefault(); event.stopPropagation(); if (drag.current) requestMove(drag.current, column, record.kanban_position ?? 0); drag.current = null; setDropColumn(null) }}
                className={`group relative flex w-full shrink-0 cursor-pointer flex-col rounded-[8px] border border-[#E2E5EA] bg-white px-3.5 py-3.5 text-left transition-[border-color,box-shadow] duration-[120ms] hover:border-[#C4C9D2] hover:shadow-[0_2px_8px_rgba(23,32,46,0.06)] active:cursor-grabbing ${AXIS_UI.focus}`}>
                <div className="mb-3 flex w-full select-none items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {record.source ? <span className="inline-flex h-6 max-w-[160px] shrink-0 items-center gap-1.5 rounded-[6px] bg-[#17202E]/[0.05] px-2 text-[12px] font-medium text-[#586174]">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: SOURCE_COLORS[record.source] || '#7B8494' }} />
                      <span className="truncate">{record.source}</span>
                    </span> : <span className="h-6" />}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="pt-0.5 text-[12px] font-medium leading-4 tabular-nums text-[#586174]">№ {record.id}</span>
                    <button type="button" className="-my-1 -mr-1.5 flex h-7 w-7 items-center justify-center rounded-[6px] text-[#586174] opacity-0 transition-[opacity,background-color] duration-[120ms] hover:bg-[#F1F2F4] hover:text-[#17202E] focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-0"
                      aria-label={`Действия с ${recordName(record)}`} aria-haspopup="menu" disabled={loading || moving}
                      onClick={(event) => { event.stopPropagation(); setMenu({ anchor: event.currentTarget, record }) }}><MoreHorizontal size={16} /></button>
                  </div>
                </div>
                <p className="line-clamp-2 select-none break-words text-[14px] font-semibold leading-5 text-[#17202E]">{recordName(record)}</p>
                {contact && contact !== recordName(record) && <p className="mt-1 line-clamp-1 select-none break-words text-[12px] leading-4 text-[#586174]">{contact}</p>}
                {preview && <p className="mt-1 line-clamp-1 select-none break-words text-[12px] leading-4 text-[#586174]">{preview}</p>}
                {(due || person) && <div className="mt-3.5 flex w-full shrink-0 items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                    {due && <DueDate dueAt={due} dueAtLabel={shortDate(due)} done={false} />}
                  </div>
                  {person && <AxisAvatar initials={initialsOf(personName) || String(person.id).slice(-2)} size={24} seed={person.id} title={personName} />}
                </div>}
              </article>
            })}
            {!pages[column.id] && <p role="status" className="px-3 py-5 text-center text-[12px] text-[#586174]">{loading ? 'Загрузка…' : 'Не удалось загрузить колонку'}</p>}
            {pages[column.id]?.hasNext && <button type="button" className={`inline-flex h-9 w-full shrink-0 items-center justify-center rounded-[6px] text-[13px] font-medium text-[#586174] transition-colors duration-[120ms] hover:bg-white hover:text-[#2458D3] ${AXIS_UI.focus}`}
              disabled={moreLoading !== null} onClick={() => void more(column)}>
              {moreLoading === column.id ? 'Загружаем…' : 'Показать ещё'}
            </button>}
            <button type="button" className={`inline-flex h-9 w-full shrink-0 items-center gap-1.5 rounded-[6px] px-2 text-[14px] font-medium text-[#586174] transition-colors duration-[120ms] hover:bg-white hover:text-[#2458D3] ${AXIS_UI.focus}`}
              onClick={() => onForm(resource, undefined, resource === 'leads' ? column.id : undefined, resource === 'tasks' ? column.id : undefined)}>
              <Plus size={18} />{resource === 'leads' ? 'Добавить лид' : 'Добавить задачу'}
            </button>
          </div>
        </section>)}
        {columns.length === 0 && <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-[8px] border border-dashed border-[#C4C9D2] bg-white p-8 text-center">
          <p className="text-[14px] font-semibold">На доске пока нет колонок</p>
          <p className="text-[14px] text-[#586174]">Добавьте первую колонку, чтобы распределять {resource === 'leads' ? 'лиды по стадиям.' : 'задачи.'}</p>
          <button type="button" className={AXIS_UI.secondaryButton} onClick={() => onForm(columnsResource)}><Plus size={16} />Добавить колонку</button>
        </div>}
      </div>
    </>}
    <FloatingMenu anchor={menu?.anchor ?? null} open={Boolean(menu)} onClose={() => setMenu(null)} className="max-h-[min(480px,calc(100vh-16px))] min-w-[220px] !overflow-y-auto py-1.5">
      {menu?.column && (() => {
        const column = menu.column
        return <>
          <button type="button" className={floatingMenuItemClass} onClick={() => { setMenu(null); onForm(columnsResource, column) }}><Pencil size={16} />Редактировать колонку</button>
          <button type="button" className={floatingMenuItemClass} onClick={() => { setMenu(null); setManageColumns(true) }}><Columns3 size={16} />Управление колонками</button>
          <button type="button" className={floatingMenuItemClass} onClick={() => { setMenu(null); onForm(columnsResource) }}><Plus size={16} />Добавить колонку</button>
        </>
      })()}
      {menu?.record && (() => {
        const record = menu.record
        const current = resource === 'leads' ? record.stage?.id : record.kanban_column_id
        return <>
          {recordActions(record).map((action) => <button key={action.key} type="button" className={floatingMenuItemClass} disabled={action.disabled}
            onClick={() => { setMenu(null); action.onClick() }}>{action.icon}{action.label}</button>)}
          <div className="my-1.5 h-px bg-[#E2E5EA]" />
          <p className="px-4 pb-1 pt-1.5 text-[12px] font-medium text-[#8A93A5]">Переместить в</p>
          {columns.filter((item) => item.is_active !== false).map((item) => <button key={item.id} type="button" className={floatingMenuItemClass}
            disabled={item.id === current} onClick={() => { setMenu(null); requestMove(record, item) }}>
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color || '#7B8494' }} />
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
            {item.id === current ? <span className="text-[12px] text-[#8A93A5]">сейчас</span> : <ArrowRight size={14} className="text-[#8A93A5]" />}
          </button>)}
        </>
      })()}
    </FloatingMenu>
    {manageColumns && <AppModal title="Управление колонками" maxWidth={640} onClose={() => { if (!moving) setManageColumns(false) }}>
      <p className={`mb-3 ${AXIS_UI.caption}`}>Измените порядок стрелками или откройте настройки колонки.</p>
      {error && <div className="mb-3"><ErrorNotice message={error} /></div>}
      <ol className="space-y-2">
        {columns.map((column, index) => <li key={column.id} className="flex items-center gap-2 rounded-[6px] border border-[#E2E5EA] px-3 py-2">
          <span className="w-5 shrink-0 text-[12px] tabular-nums text-[#586174]">{index + 1}</span>
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: column.color || '#7B8494' }} />
          <div className="min-w-0 flex-1">
            <p className="break-words text-[14px] font-medium">{column.name}</p>
            <p className={AXIS_UI.caption}>{column.is_active === false ? 'Неактивная · ' : ''}{pages[column.id] ? `${pages[column.id].count} записей` : 'Записи не загружены'}</p>
          </div>
          <button type="button" className={AXIS_UI.iconButton} disabled={loading || moving || index === 0}
            aria-label={`Переместить ${column.name} раньше`} title="Переместить раньше" onClick={() => void reorder(index, -1)}><ArrowUp size={16} /></button>
          <button type="button" className={AXIS_UI.iconButton} disabled={loading || moving || index === columns.length - 1}
            aria-label={`Переместить ${column.name} позже`} title="Переместить позже" onClick={() => void reorder(index, 1)}><ArrowDown size={16} /></button>
          <button type="button" className={AXIS_UI.iconButton} disabled={moving} aria-label={`Редактировать ${column.name}`} title="Редактировать колонку"
            onClick={() => { setManageColumns(false); onForm(columnsResource, column) }}><Pencil size={16} /></button>
        </li>)}
      </ol>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <button type="button" className={AXIS_UI.secondaryButton} disabled={moving}
          onClick={() => { setManageColumns(false); onForm(columnsResource) }}><Plus size={16} />Добавить колонку</button>
        <span role="status" className={AXIS_UI.caption}>{moving ? 'Сохраняем порядок…' : 'Порядок колонок сохраняется автоматически'}</span>
      </div>
    </AppModal>}
    {pending && <AppModal title={`Переместить в «${pending.column.name}»`} onClose={() => { if (!moving) setPending(null) }}><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void move(pending, pending.column.system_key === 'rejected' ? { rejection_reason_id: Number(reasonId), rejection_comment: comment } : { call_attempts: Number(attempts), last_call_at: new Date(callAt).toISOString(), no_answer_comment: comment, next_task_title: taskTitle, ...(taskDue ? { next_task_due_at: new Date(taskDue).toISOString() } : {}) }) }}>
      {pending.column.system_key === 'rejected' ? <Field label="Причина отказа"><CrmSelect required value={reasonId} onChange={setReasonId} placeholder="Выберите причину" options={reasons.filter((item) => item.is_active !== false).map((item) => ({ value: String(item.id), label: item.name || '' }))} /></Field> : <><Field label="Количество попыток звонка"><input className={inputClass} type="number" min="1" required value={attempts} onChange={(e) => setAttempts(e.target.value)} /></Field><Field label="Когда звонили"><input className={inputClass} type="datetime-local" required value={callAt} onChange={(e) => setCallAt(e.target.value)} /></Field><Field label="Следующая задача"><input className={inputClass} required value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} /></Field><Field label="Срок следующей задачи"><input className={inputClass} type="datetime-local" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} /></Field></>}
      <Field label="Комментарий"><textarea className={inputClass} required={pending.column.system_key === 'rejected'} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>{error && <ErrorNotice message={error} />}<AppButton type="submit" isLoading={moving}>Переместить</AppButton>
    </form></AppModal>}
  </div>
}
