import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, MoreHorizontal, Plus, Search } from 'lucide-react'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import FloatingMenu, { floatingMenuItemClass } from '../../../shared/ui/FloatingMenu'
import GradientAvatar from '../../../shared/ui/GradientAvatar'
import ViewToggle from '../../../shared/ui/ViewToggle'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import { formatDate } from '../../../shared/i18n'
import type { BoardTask } from '../../../domain/entities/board/BoardModels'
import { canCompleteAssignment, assignmentStatus, assignmentDocumentRoute, isActiveAssignment, isOverdueAssignment } from '../../../application/use-cases/assignments/assignmentPolicy'
import { useAssignments } from './useAssignments'
import { odoSectionLaunchRoute } from '../../../application/use-cases/eps/odoNavigation'
import AssignmentResultDialog from './AssignmentResultDialog'
import { HttpOrganizationRepository, type OrganizationMember } from '../../../infrastructure/repositories/HttpOrganizationRepository'
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore'
import { normalizeBackendAssetUrl } from '../../../infrastructure/http/normalizeBackendAssetUrl'

type Filter = 'all' | 'active' | 'overdue' | 'completed'
type SortKey = 'created' | 'due' | 'priority' | 'status' | 'number' | 'title' | 'executor' | 'creator'
type ViewMode = 'list' | 'grid'
const PAGE_SIZE = 10
const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
const STATUS_ORDER: Record<string, number> = { overdue: 0, assigned: 1, in_progress: 2, completed: 3, closed: 4, cancelled: 5 }

const PRIORITY_TONE: Record<string, string> = {
  low: 'bg-[#E8F0FE] text-[#1967D2]',
  medium: 'bg-[#F1F3F4] text-[#3C4043]',
  high: 'bg-[#FCE8E6] text-[#C5221F]',
  critical: 'bg-[#FAD2CF] text-[#A50E0E]',
}

const STATUS_TONE: Record<string, string> = {
  assigned: 'bg-[#E8F0FE] text-[#1967D2]',
  in_progress: 'bg-[#E8F0FE] text-[#1967D2]',
  completed: 'bg-[#E6F4EA] text-[#137333]',
  closed: 'bg-[#E6F4EA] text-[#137333]',
  cancelled: 'bg-[#F1F3F4] text-[#5F6368]',
  overdue: 'bg-[#FCE8E6] text-[#C5221F]',
}

const dueDateOf = (task: BoardTask) => (task.sourceDueDate ? `${task.sourceDueDate}T12:00:00` : task.dueAt || '')
const displayStatus = (task: BoardTask) => (isOverdueAssignment(task) ? 'overdue' : assignmentStatus(task))
const shortDate = (value: string) => formatDate(value, { day: '2-digit', month: 'short', year: 'numeric' }).replace(/\s?г\.?$/, '')
const initialsOf = (name: string) => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '?'

function Pill({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`inline-flex h-6 items-center whitespace-nowrap rounded-[6px] px-2 text-[12px] font-medium ${tone}`}>{children}</span>
}

function AssignmentsEmpty() {
  const { t } = useTranslation('assignments')
  return <div className="flex flex-col items-center px-6 py-14 text-center">
    <div aria-hidden="true" className="mb-6 w-full max-w-[280px] space-y-2 rounded-xl bg-[#F6F7F9] p-3">
      {['bg-[#E8EEFC]', 'bg-[#FFF3D6]', 'bg-[#DFF5E8]'].map(tone => <div key={tone} className="flex items-center gap-3 rounded-lg border border-[#E2E5EA] bg-white p-3"><span className={`h-7 w-7 rounded-md ${tone}`} /><span className="h-2 flex-1 rounded-full bg-[#E4E8EF]" /><span className="h-3 w-10 rounded-full bg-[#EAF4FF]" /></div>)}
    </div>
    <h2 className="text-[18px] font-semibold text-[#17202E]">{t('empty.title')}</h2>
    <p className="mt-2 max-w-[460px] text-[14px] leading-6 text-[#586174]">{t('empty.description')}</p>
  </div>
}

function TableSkeleton() {
  return <div className="animate-pulse divide-y divide-[#EEF0F3]" aria-busy="true">
    {[0, 1, 2, 3, 4].map((i) => <div key={i} className="flex items-center gap-4 px-6 py-5">
      <span className="h-5 w-5 rounded bg-[#EEF1F5]" />
      <span className="h-3 w-12 rounded bg-[#EEF1F5]" />
      <span className="h-3 flex-1 rounded bg-[#EEF1F5]" />
      <span className="h-6 w-20 rounded-lg bg-[#EEF1F5]" />
      <span className="h-6 w-20 rounded-lg bg-[#EEF1F5]" />
      <span className="h-6 w-24 rounded-full bg-[#EEF1F5]" />
    </div>)}
  </div>
}

export function AssignmentsPanel() {
  const model = useAssignments()
  return <AssignmentsContent key={model.scope} model={model} />
}

function AssignmentsContent({ model }: { model: ReturnType<typeof useAssignments> }) {
  const { t } = useTranslation('assignments')
  const navigate = useNavigate()
  const outlet = useOutletContext<{ userName?: string; avatarUrl?: string } | undefined>()
  const executorName = outlet?.userName?.trim() || t('you')
  const [resultTask, setResultTask] = useState<BoardTask | null>(null)
  const [resultDrafts, setResultDrafts] = useState<Record<string,string>>({})
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('created')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [view, setView] = useState<ViewMode>('list')
  const [page, setPage] = useState(1)
  const [members, setMembers] = useState<Map<number, OrganizationMember>>(() => new Map())
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null)
  const [sortAnchor, setSortAnchor] = useState<HTMLElement | null>(null)

  useEffect(() => {
    let alive = true
    new HttpOrganizationRepository(new LocalStorageAuthSessionStore()).listMembers()
      .then((list) => { if (alive) setMembers(new Map(list.map((member) => [member.id, member]))) })
      .catch(() => undefined)
    return () => { alive = false }
  }, [])

  const creatorOf = (task: BoardTask) => members.get(task.createdBy)
  const creatorName = (task: BoardTask) => creatorOf(task)?.full_name?.trim() || ''

  const statuses: Record<string, string> = { assigned: t('statuses.assigned'), in_progress: t('statuses.in_progress'), completed: t('statuses.completed'), closed: t('statuses.closed'), cancelled: t('statuses.cancelled'), overdue: t('statuses.overdue') }
  const priorities: Record<string, string> = { low: t('priorities.low'), medium: t('priorities.medium'), high: t('priorities.high'), critical: t('priorities.critical') }

  const matchesFilter = (task: BoardTask, key: Filter) => key === 'all' || (key === 'active' && isActiveAssignment(task)) || (key === 'overdue' && isOverdueAssignment(task)) || (key === 'completed' && ['completed', 'closed'].includes(assignmentStatus(task)))
  const counts = useMemo(() => ({
    all: model.tasks.length,
    active: model.tasks.filter((task) => isActiveAssignment(task)).length,
    overdue: model.tasks.filter((task) => isOverdueAssignment(task)).length,
    completed: model.tasks.filter((task) => ['completed', 'closed'].includes(assignmentStatus(task))).length,
  }), [model.tasks])

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const list = model.tasks.filter((task) => matchesFilter(task, filter) && (!normalized || [task.taskKey, task.title, task.description].some((value) => (value || '').toLowerCase().includes(normalized))))
    const value = (task: BoardTask): string | number => {
      switch (sortKey) {
        case 'due': return dueDateOf(task) || '9999'
        case 'priority': return PRIORITY_ORDER[task.priority] ?? 2
        case 'status': return STATUS_ORDER[displayStatus(task)] ?? 9
        case 'number': return task.taskNumber ?? 0
        case 'title': return task.title.toLowerCase()
        case 'executor': return executorName
        case 'creator': return members.get(task.createdBy)?.full_name?.trim() || ''
        default: return task.createdAt || ''
      }
    }
    return [...list].sort((a, b) => {
      const left = value(a)
      const right = value(b)
      const result = left < right ? -1 : left > right ? 1 : 0
      return sortDir === 'asc' ? result : -result
    })
  }, [model.tasks, filter, query, sortKey, sortDir, executorName, members])

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageItems = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'created' ? 'desc' : 'asc')
    }
  }

  const sortHeader = (column: SortKey, label: string, className = '') => (
    <th key={column} className={`whitespace-nowrap px-3 py-3 text-left text-[13px] font-medium text-[#586174] ${className}`}>
      <button type="button" onClick={() => toggleSort(column)} className="inline-flex items-center gap-1.5 transition hover:text-[#17202E]" aria-label={t('table.sortBy', { column: label })}>
        {label}
        <ArrowUpDown size={13} className={sortKey === column ? 'text-[#2458D3]' : 'text-[#9AA0A6]'} />
      </button>
    </th>
  )

  const renderDue = (item: BoardTask) => {
    const due = dueDateOf(item)
    return due ? shortDate(due) : t('noDue')
  }

  const openLink = (url: string, className = '') => (
    <Link to={url} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[13px] font-medium text-[#1967D2] transition hover:bg-[#E8F0FE] ${className}`}>
      {t('table.open')}
      <ExternalLink size={13} />
    </Link>
  )

  const resultAction = (item: BoardTask) => {
    const pending = model.commands[item.id]
    if (!pending && (!model.allowed || !canCompleteAssignment(item))) return null
    return <button type="button" className="ts-button ts-button--secondary ts-button--compact" onClick={() => { model.clearCommandError(); setResultTask(item) }}>{pending?.phase === 'confirmed' ? t('details') : pending ? t('checkCommand') : t('complete')}</button>
  }
  const currentResultTask = resultTask ? model.tasks.find(item => item.id === resultTask.id) || resultTask : null

  const renderCards = (className = '') => (
    <div className={`grid grid-cols-1 gap-3 border-t border-[#EEF0F3] p-3 sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] sm:p-4 lg:px-6 ${className}`}>
      {pageItems.map((item) => {
        const status = displayStatus(item)
        const url = assignmentDocumentRoute(item.sourceDocumentId)
        const creatorLabel = creatorName(item)
        return <article key={item.id} className="flex h-full min-w-0 flex-col rounded-xl border border-[#E6EAF1] bg-white p-3.5 transition hover:border-[#D2DAE8] sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[12.5px] text-[#80868B]">{item.taskKey || t('card')}</span>
            <Pill tone={STATUS_TONE[status] ?? STATUS_TONE.cancelled}>{statuses[status] || t('statuses.unknown')}</Pill>
          </div>
          <h3 className="mt-2 line-clamp-2 break-words text-[14.5px] font-medium leading-5 text-[#17202E]" title={item.title}>{item.title}</h3>
          {item.description ? <p className="mt-1 line-clamp-2 break-words text-[13px] leading-[18px] text-[#80868B]">{item.description}</p> : null}
          {creatorLabel ? <p className="mt-3 flex min-w-0 items-center gap-2 text-[12.5px] text-[#5F6368]">
            <GradientAvatar initials={initialsOf(creatorLabel)} src={normalizeBackendAssetUrl(creatorOf(item)?.avatar_url) || undefined} size={20} seed={item.createdBy} />
            <span className="truncate">{creatorLabel}</span>
          </p> : null}
          <span aria-hidden="true" className="min-h-3 flex-1" />
          <div className="flex flex-wrap items-center gap-2 border-t border-[#EEF0F3] pt-3">
            <span className={`whitespace-nowrap text-[12.5px] ${status === 'overdue' ? 'text-[#D93025]' : 'text-[#3C4043]'}`}>{renderDue(item)}</span>
            <Pill tone={PRIORITY_TONE[item.priority] ?? PRIORITY_TONE.medium}>{priorities[item.priority] || priorities.medium}</Pill>
            {url ? openLink(url, 'ml-auto -mr-1.5') : null}
            {resultAction(item)}
          </div>
        </article>
      })}
    </div>
  )

  return <section className="w-full min-w-0 px-1 py-2">
    <div className="mb-5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className={AXIS_UI.h1}>{t('title')}</h1>
        <p className="mt-1 text-[14px] text-[#586174]">{t('subtitle')}</p>
      </div>
      <button type="button" onClick={(event) => setMoreAnchor(moreAnchor ? null : event.currentTarget)} className={`${AXIS_UI.iconButton} shrink-0`} aria-label={t('more')}>
        <MoreHorizontal size={18} />
      </button>
      <FloatingMenu anchor={moreAnchor} open={Boolean(moreAnchor)} onClose={() => setMoreAnchor(null)}>
        <button type="button" className={floatingMenuItemClass} onClick={() => { setMoreAnchor(null); navigate('/eps') }}><span className="flex-1">{t('openOdo')}</span><ExternalLink size={15} /></button>
      </FloatingMenu>
    </div>

    <nav className="mb-5 flex items-center gap-6 overflow-x-auto border-b border-[#E2E5EA] [scrollbar-width:none]" aria-label={t('filters.label')}>
      {(['all', 'overdue', 'completed'] as const).map(key => {
        const active = filter === key
        return <button key={key} type="button" aria-current={active ? 'page' : undefined} onClick={() => { setFilter(key); setPage(1) }} className={`${AXIS_UI.tab} ${active ? AXIS_UI.tabActive : AXIS_UI.tabIdle}`}>
          {t(`filters.${key}`)}
          <span className={AXIS_UI.countBadge}>{counts[key]}</span>
        </button>
      })}
    </nav>


    {model.loadError && <div role="alert" className="mb-5 rounded-xl border border-[#F5C2C7] bg-[#FFF5F5] p-4 text-sm text-[#AE2634]">{t(model.loadError)}</div>}
    {!model.allowed && model.tasks.length > 0 && <p className="mb-4 text-[13px] text-[#586174]">{t('readOnly')}</p>}

    <div className="overflow-hidden rounded-2xl border border-[#E6EAF1] bg-white">
      <div className="flex flex-wrap items-center gap-3 p-4 sm:px-6">
        <label className={`${AXIS_UI.inputShell} w-full sm:w-[320px]`}>
          <Search size={16} className="shrink-0 text-[#586174]" />
          <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder={t('search')} aria-label={t('search')} className={AXIS_UI.input} />
        </label>
        <span className="hidden flex-1 sm:block" />
        <button type="button" onClick={(event) => setSortAnchor(sortAnchor ? null : event.currentTarget)} className={sortAnchor ? AXIS_UI.secondaryButtonActive : AXIS_UI.secondaryButton}>
          <ArrowUpDown size={16} />
          {t('sort.label')}
          <ChevronDown size={16} />
        </button>
        <FloatingMenu anchor={sortAnchor} open={Boolean(sortAnchor)} onClose={() => setSortAnchor(null)}>
          {(['created', 'due', 'priority', 'status', 'number'] as const).map((key) => <button key={key} type="button" className={floatingMenuItemClass} onClick={() => { setSortKey(key); setSortDir(key === 'created' ? 'desc' : 'asc'); setSortAnchor(null) }}>
            <span className="flex-1">{t(`sort.${key}`)}</span>
            {sortKey === key ? <MaterialSymbol name="check" size={18} color="#1967D2" /> : null}
          </button>)}
        </FloatingMenu>
        <div className="hidden md:block">
          <ViewToggle
            value={view}
            options={[{ value: 'list', icon: 'view_list', label: t('view.list') }, { value: 'grid', icon: 'grid_view', label: t('view.grid') }]}
            onChange={setView}
          />
        </div>
        <button type="button" onClick={() => navigate(odoSectionLaunchRoute('create-assignment'))} className={`${AXIS_UI.primaryButton} ts-button--compact`}>
          <Plus size={16} />
          {t('create')}
        </button>
      </div>

      {model.loading ? <TableSkeleton /> : model.tasks.length === 0 && !model.loadError ? <AssignmentsEmpty /> : visible.length === 0 ? (
        <p className="border-t border-[#EEF0F3] px-6 py-12 text-center text-[14px] text-[#586174]">{query.trim() ? t('noResults') : t('filters.empty')}</p>
      ) : view === 'list' ? (
        <>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-y border-[#EEF0F3] bg-[#FAFBFC]">
                {sortHeader('number', t('table.number'), 'pl-4 sm:pl-6 hidden lg:table-cell')}
                {sortHeader('title', t('table.name'), 'pl-4 sm:pl-6 lg:pl-3 w-[34%]')}
                {sortHeader('priority', t('table.priority'), 'hidden xl:table-cell')}
                {sortHeader('status', t('table.status'))}
                {sortHeader('due', t('table.due'))}
                {sortHeader('creator', t('table.creator'), 'hidden xl:table-cell')}
                {sortHeader('executor', t('table.executor'), 'hidden 2xl:table-cell')}
                <th className="pr-4 text-right sm:pr-6"><span className="sr-only">{t('table.actions')}</span></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((item) => {
                const status = displayStatus(item)
                const overdue = status === 'overdue'
                const entry = model.commands[item.id]
                const url = assignmentDocumentRoute(item.sourceDocumentId)
                const creator = creatorOf(item)
                const creatorLabel = creatorName(item)
                return <tr key={item.id} className="border-b border-[#EEF0F3] transition last:border-0 hover:bg-[#FAFBFC]">
                  <td className="hidden whitespace-nowrap py-3 pl-6 pr-3 text-[14px] text-[#3C4043] lg:table-cell">{item.taskKey || '—'}</td>
                  <td className="max-w-0 py-3 pl-4 pr-3 sm:pl-6 lg:pl-3">
                    <p className="truncate text-[14px] font-medium text-[#17202E]" title={item.title}>{item.title}</p>
                    {item.description ? <p className="mt-0.5 truncate text-[12.5px] text-[#80868B]">{item.description}</p> : null}
                    {entry?.phase === 'confirmed' ? <p className="mt-0.5 text-[12px] text-[#137333]">{t('confirmed')}</p> : entry && ['uncertain', 'pending'].includes(entry.phase) ? <p className="mt-0.5 text-[12px] text-[#B06000]">{t('uncertain')}</p> : null}
                  </td>
                  <td className="hidden px-3 py-3 xl:table-cell"><Pill tone={PRIORITY_TONE[item.priority] ?? PRIORITY_TONE.medium}>{priorities[item.priority] || priorities.medium}</Pill></td>
                  <td className="px-3 py-3"><Pill tone={STATUS_TONE[status] ?? STATUS_TONE.cancelled}>{statuses[status] || t('statuses.unknown')}</Pill></td>
                  <td className={`whitespace-nowrap px-3 py-3 text-[14px] ${overdue ? 'text-[#D93025]' : 'text-[#3C4043]'}`}>{renderDue(item)}</td>
                  <td className="hidden px-3 py-3 xl:table-cell">
                    {creatorLabel ? <span className="flex items-center gap-2.5">
                      <GradientAvatar initials={initialsOf(creatorLabel)} src={normalizeBackendAssetUrl(creator?.avatar_url) || undefined} size={30} seed={item.createdBy} />
                      <span className="truncate text-[14px] font-medium text-[#17202E]">{creatorLabel}</span>
                    </span> : <span className="text-[14px] text-[#80868B]">—</span>}
                  </td>
                  <td className="hidden px-3 py-3 2xl:table-cell">
                    <span className="flex items-center gap-2.5">
                      <GradientAvatar initials={initialsOf(executorName)} src={outlet?.avatarUrl || undefined} size={30} seed={item.assigneeIds[0] ?? 0} />
                      <span className="truncate text-[14px] font-medium text-[#17202E]">{executorName}</span>
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-3 pr-4 text-right sm:pr-6">
                    {url ? openLink(url, '-mr-2') : null}
                    {resultAction(item)}
                  </td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
        {renderCards('md:hidden')}
        </>
      ) : renderCards()}

      {!model.loading && visible.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EEF0F3] px-4 py-3 sm:px-6 sm:py-4">
          <p className="text-[14px] text-[#3C4043]">{t('shown', { shown: pageItems.length, total: visible.length })}</p>
          <div className="flex items-center gap-1.5">
            <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className={AXIS_UI.ghostIconButton} aria-label={t('prevPage')}><ChevronLeft size={18} /></button>
            {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => <button key={number} type="button" onClick={() => setPage(number)} aria-current={number === currentPage ? 'page' : undefined} aria-label={t('page', { page: number })} className={`ts-button ts-button--icon ${number === currentPage ? 'ts-button--active' : 'ts-button--ghost'}`}>{number}</button>)}
            <button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} className={AXIS_UI.ghostIconButton} aria-label={t('nextPage')}><ChevronRight size={18} /></button>
          </div>
        </div>
      ) : null}
    </div>

    {currentResultTask && <AssignmentResultDialog
      task={currentResultTask}
      pending={model.commands[currentResultTask.id]}
      draft={resultDrafts[currentResultTask.id] ?? model.commands[currentResultTask.id]?.command.result_comment ?? ''}
      allowed={model.allowed && model.tasks.some(item => item.id === currentResultTask.id)}
      sending={model.sending !== null}
      error={model.commandError || (model.commands[currentResultTask.id]?.phase === 'conflict' ? 'errors.conflict' : model.commands[currentResultTask.id]?.phase === 'denied' ? 'errors.denied' : model.commands[currentResultTask.id]?.phase === 'uncertain' ? 'errors.unknown' : null)}
      onDraft={value => setResultDrafts(current => ({...current,[currentResultTask.id]:value}))}
      onSubmit={value => { void model.complete(model.commands[currentResultTask.id] ? currentResultTask : resultTask!,value) }}
      onStartNew={() => { setResultDrafts(current => ({...current,[currentResultTask.id]:model.commands[currentResultTask.id]?.command.result_comment || current[currentResultTask.id] || ''})); model.startNew(currentResultTask); setResultTask(currentResultTask) }}
      onClose={() => setResultTask(null)}
    />}
  </section>
}

export default function AssignmentsPage() {
  return <main className="min-h-full bg-[#F4F8FF] px-4 py-6 sm:px-8 lg:px-10"><AssignmentsPanel /></main>
}
