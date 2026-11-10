import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from 'react'
import { AlertTriangle, BarChart3, CheckCircle2, ChevronDown, Clock3, History, ListChecks, Timer, TrendingUp } from 'lucide-react'
import type { BoardOptionViewModel, BoardStatsViewModel } from '../../view-models/BoardViewModel'
import type { BoardController } from '../../controllers/BoardController'
import FloatingMenu from '../../../shared/ui/FloatingMenu'
import { formatHours } from './stats/StatUtils'
import { bt } from './boardText'

interface MultiBoardStatsSectionProps {
  boards: BoardOptionViewModel[]
  boardController: BoardController
}

interface BarItem {
  key: string
  label: string
  value: number
  color: string
  valueLabel?: string
}

const PALETTE = ['#1A73E8', '#F9AB00', '#A142F4', '#1E8E3E', '#D93025', '#12B5CB', '#E8710A', '#5F6368']

const PRIORITY_META: Record<string, { label: string; color: string; order: number }> = {
  critical: { get label() { return bt('priority.critical') }, color: '#B31412', order: 0 },
  high: { get label() { return bt('priority.high') }, color: '#EA4335', order: 1 },
  medium: { get label() { return bt('priority.medium') }, color: '#F9AB00', order: 2 },
  low: { get label() { return bt('priority.low') }, color: '#34A853', order: 3 },
}

const ACTIVITY_LABELS: Record<string, string> = {
  get moved() { return bt('stats.activity.moved') },
  get updated() { return bt('stats.activity.updated') },
  get assigned() { return bt('stats.activity.assigned') },
  get unassigned() { return bt('stats.activity.unassigned') },
  get created() { return bt('stats.activity.created') },
  get deleted() { return bt('stats.activity.deleted') },
  get comment_added() { return bt('stats.activity.comment') },
  get comment_deleted() { return bt('stats.activity.commentDeleted') },
  get checklist_created() { return bt('stats.activity.checklistCreated') },
  get checklist_updated() { return bt('stats.activity.checklistUpdated') },
  get checklist_deleted() { return bt('stats.activity.checklistDeleted') },
  get attachment_added() { return bt('stats.activity.attachmentAdded') },
  get attachment_created() { return bt('stats.activity.attachmentAdded') },
  get attachment_deleted() { return bt('stats.activity.attachmentDeleted') },
}

const DEADLINE_COLORS = ['#D93025', '#F9AB00', '#1E8E3E', '#1A73E8']

const sentenceCase = (value: string) => {
  const text = value.trim()
  if (!text) return text
  if (text !== text.toUpperCase()) return text
  return text.charAt(0) + text.slice(1).toLowerCase()
}

const humanizeAction = (action: string) => {
  const key = action.toLowerCase().trim()
  if (ACTIVITY_LABELS[key]) return ACTIVITY_LABELS[key]
  return sentenceCase(key.replace(/_/g, ' ')) || bt('stats.other')
}

const statusColor = (name: string, index: number) => {
  const value = name.toLowerCase()
  if (value.includes('готов') || value.includes('done') || value.includes('заверш')) return '#1E8E3E' // i18n-ignore
  if (value.includes('провер') || value.includes('review')) return '#A142F4' // i18n-ignore
  if (value.includes('работ') || value.includes('progress')) return '#F9AB00' // i18n-ignore
  if (value.includes('выполн') || value.includes('todo') || value.includes('to do')) return '#1A73E8' // i18n-ignore
  return PALETTE[index % PALETTE.length]
}

const scoreMeta = (score: number) => {
  if (score >= 85) return { bar: '#1E8E3E', badge: 'bg-[#E6F4EA] text-[#137333]' }
  if (score >= 65) return { bar: '#1A73E8', badge: 'bg-[#E8F0FE] text-[#1967D2]' }
  if (score >= 40) return { bar: '#F9AB00', badge: 'bg-[#FEF7E0] text-[#B06000]' }
  return { bar: '#D93025', badge: 'bg-[#FCE8E6] text-[#C5221F]' }
}

const niceStep = (raw: number) => {
  if (raw <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(raw))
  const unit = raw / power
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10
  return nice * power
}

const buildTicks = (maxValue: number, integer: boolean) => {
  let step = niceStep(maxValue / 4)
  if (integer) step = Math.max(1, Math.ceil(step))
  const top = Math.max(step, Math.ceil(maxValue / step) * step)
  const ticks: number[] = []
  for (let tick = 0; tick <= top + step / 2; tick += step) ticks.push(Number(tick.toFixed(4)))
  return { ticks, top }
}

const initialsOf = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '??'

function SectionIcon({ children, bg, color }: { children: ReactNode; bg: string; color: string }) {
  return <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: bg, color }}>{children}</span>
}

function Card({ title, subtitle, children, className = '' }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 rounded-xl border border-[#E6EAF1] bg-white px-5 py-4 ${className}`}>
      <h3 className="text-[16px] font-semibold text-[#17202E]">{title}</h3>
      {subtitle ? <p className="mt-0.5 text-[12px] text-[#586174]">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </div>
  )
}

function KpiCard({ icon, label, value, sub, color, bg }: { icon: ReactNode; label: string; value: ReactNode; sub?: string; color: string; bg: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#E6EAF1] bg-white px-4 py-3.5">
      <p className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: bg, color }}>{icon}</span>
        <span className="truncate text-[12px] font-semibold uppercase tracking-[0.03em] text-[#3C4043]">{label}</span>
      </p>
      <p className="mt-3 flex items-baseline gap-2">
        <span className="text-[28px] font-semibold leading-none text-[#17202E]">{value}</span>
        {sub ? <span className="text-[12px] font-semibold text-[#1E8E3E]">{sub}</span> : null}
      </p>
    </div>
  )
}

function ColumnChart({ items, height = 170, fixedTop, integer = true, formatTick, barWidth = 28, minColumnWidth = 0 }: {
  items: BarItem[]
  height?: number
  fixedTop?: number
  integer?: boolean
  formatTick?: (value: number) => string
  barWidth?: number
  minColumnWidth?: number
}) {
  const maxValue = Math.max(0, ...items.map((item) => item.value))
  const { ticks, top } = fixedTop
    ? { ticks: [0, 0.25, 0.5, 0.75, 1].map((part) => part * fixedTop), top: fixedTop }
    : buildTicks(Math.max(maxValue, integer ? 4 : 0.0001), integer)

  if (items.length === 0) {
    return <div className="flex items-center justify-center rounded-lg bg-[#F8F9FB] text-[13px] text-[#7B8494]" style={{ height }}>{bt('stats.noData')}</div>
  }

  return (
    <div className="flex gap-3">
      <div className="relative shrink-0" style={{ height, width: formatTick ? 36 : 26 }}>
        {ticks.map((tick) => (
          <span key={tick} className="absolute right-0 text-[11px] leading-none text-[#7B8494]" style={{ bottom: `${(tick / top) * 100}%`, transform: 'translateY(50%)' }}>
            {formatTick ? formatTick(tick) : tick}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1 overflow-x-auto">
        <div style={{ minWidth: minColumnWidth * items.length }}>
          <div className="relative" style={{ height }}>
            {ticks.map((tick) => (
              <div key={tick} className="pointer-events-none absolute inset-x-0 border-t border-[#EEF0F3]" style={{ bottom: `${(tick / top) * 100}%` }} />
            ))}
            <div className="relative flex h-full items-end">
              {items.map((item) => (
                <div key={item.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end" title={`${item.label}: ${item.valueLabel ?? item.value}`}>
                  <span className="mb-1 text-[11px] font-semibold leading-none text-[#3C4043]">{item.valueLabel ?? item.value}</span>
                  <span
                    className="rounded-t-[5px]"
                    style={{ width: barWidth, height: `${Math.min(100, (item.value / top) * 100)}%`, minHeight: item.value > 0 ? 4 : 0, background: item.color }}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="mt-2 flex">
            {items.map((item) => (
              <span key={item.key} className="min-w-0 flex-1 px-1 text-center text-[12px] leading-tight text-[#3C4043]">{item.label}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Donut({ items, total }: { items: BarItem[]; total: number }) {
  const radius = 62
  const stroke = 22
  const length = 2 * Math.PI * radius
  const gap = items.filter((item) => item.value > 0).length > 1 ? 4 : 0
  let offset = 0

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-10">
      <div className="relative h-[164px] w-[164px] shrink-0">
        <svg viewBox="0 0 164 164" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="82" cy="82" r={radius} fill="none" stroke="#F1F3F4" strokeWidth={stroke} />
          {total > 0 ? items.map((item) => {
            const size = (item.value / total) * length
            const segment = (
              <circle
                key={item.key}
                cx="82"
                cy="82"
                r={radius}
                fill="none"
                stroke={item.color}
                strokeWidth={stroke}
                strokeDasharray={`${Math.max(0, size - gap)} ${length}`}
                strokeDashoffset={-offset}
              />
            )
            offset += size
            return segment
          }) : null}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[30px] font-semibold leading-none text-[#17202E]">{total}</span>
          <span className="mt-1 text-[12px] text-[#586174]">{bt('stats.tasksWord')}</span>
        </div>
      </div>
      <ul className="min-w-0 space-y-2.5">
        {items.map((item) => (
          <li key={item.key} className="grid grid-cols-[12px_minmax(0,1fr)_28px_40px] items-center gap-2.5 text-[13px]">
            <span className="h-3 w-3 rounded-[3px]" style={{ background: item.color }} />
            <span className="truncate text-[#17202E]">{item.label}</span>
            <span className="text-right font-semibold text-[#17202E]">{item.value}</span>
            <span className="text-right text-[12px] text-[#586174]">{total > 0 ? Math.round((item.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function HorizontalBars({ items }: { items: BarItem[] }) {
  const maxValue = Math.max(1, ...items.map((item) => item.value))
  if (items.length === 0) {
    return <div className="flex h-[150px] items-center justify-center rounded-lg bg-[#F8F9FB] text-[13px] text-[#7B8494]">{bt('stats.noData')}</div>
  }
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.key} className="grid grid-cols-[96px_minmax(0,1fr)_32px] items-center gap-3">
          <span className="truncate text-[13px] text-[#3C4043]">{item.label}</span>
          <span className="h-6 overflow-hidden rounded-full bg-[#F1F3F4]">
            <span className="block h-full rounded-full" style={{ width: `${Math.max(item.value > 0 ? 6 : 0, (item.value / maxValue) * 100)}%`, background: item.color }} />
          </span>
          <span className="text-right text-[13px] font-semibold text-[#17202E]">{item.value}</span>
        </div>
      ))}
    </div>
  )
}

function StatsSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label={bt('stats.loading')}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-[92px] rounded-xl bg-[#EEF1F5]" />)}
      </div>
      <div className="h-[300px] rounded-xl bg-[#EEF1F5]" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-[260px] rounded-xl bg-[#EEF1F5]" />
        <div className="h-[260px] rounded-xl bg-[#EEF1F5]" />
      </div>
      <div className="h-[260px] rounded-xl bg-[#EEF1F5]" />
    </div>
  )
}

export default function MultiBoardStatsSection({ boards, boardController }: MultiBoardStatsSectionProps) {
  const [selectedBoardIds, setSelectedBoardIds] = useState<string[]>([])
  const [stats, setStats] = useState<BoardStatsViewModel | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const filterButtonRef = useRef<HTMLButtonElement>(null)

  const loadStats = useCallback(async (ids: string[]) => {
    setIsLoading(true)
    setError('')
    try {
      const data = await boardController.loadMultiBoardStats(ids.length > 0 ? ids : undefined)
      setStats(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : bt('errors.loadStatsShort'))
    } finally {
      setIsLoading(false)
    }
  }, [boardController])

  useEffect(() => {
    void loadStats(selectedBoardIds)
  }, [selectedBoardIds, loadStats])

  const handleToggleBoard = (id: string) => {
    setSelectedBoardIds((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]))
  }

  const statusItems = useMemo<BarItem[]>(() => (stats?.byStatus ?? []).map((item, index) => ({
    key: `${item.name}-${index}`,
    label: sentenceCase(item.name || bt('stats.noStatus')),
    value: item.count,
    color: statusColor(item.name || '', index),
  })), [stats])

  const statusTotal = useMemo(() => statusItems.reduce((sum, item) => sum + item.value, 0), [statusItems])

  const priorityItems = useMemo<BarItem[]>(() => (stats?.byPriority ?? [])
    .map((item, index) => {
      const meta = PRIORITY_META[String(item.name || '').toLowerCase().trim()]
      return {
        key: `${item.name}-${index}`,
        label: meta?.label ?? sentenceCase(item.name || bt('stats.noPriority')),
        value: item.count,
        color: meta?.color ?? '#9AA0A6',
        order: meta?.order ?? 9,
      }
    })
    .sort((a, b) => b.value - a.value || a.order - b.order), [stats])

  const ratingItems = useMemo<BarItem[]>(() => (stats?.employees ?? []).filter(emp => emp.assignedTasks > 0).slice(0, 15).map((emp) => ({
    key: String(emp.userId),
    label: emp.fullName,
    value: emp.productivityScore,
    color: scoreMeta(emp.productivityScore).bar,
  })), [stats])

  const deadlineItems = useMemo<BarItem[]>(() => (stats?.byDeadline ?? []).map((item, index) => ({
    key: `${item.name}-${index}`,
    label: sentenceCase(item.name),
    value: item.count,
    color: DEADLINE_COLORS[index % DEADLINE_COLORS.length],
  })), [stats])

  const worklogItems = useMemo<BarItem[]>(() => (stats?.worklogs ?? []).map((item) => {
    const date = new Date(item.date)
    return {
      key: item.date,
      label: Number.isNaN(date.getTime()) ? item.date : date.toLocaleDateString('ru-RU'),
      value: item.totalSeconds / 3600,
      valueLabel: item.totalLabel,
      color: '#A142F4',
    }
  }), [stats])

  const activityItems = useMemo<BarItem[]>(() => (stats?.activity ?? [])
    .map((item) => ({ key: item.action, label: humanizeAction(item.action), value: item.count, color: '#1A73E8' }))
    .sort((a, b) => b.value - a.value), [stats])

  const totalWorklogSeconds = useMemo(() => (stats?.worklogs ?? []).reduce((sum, item) => sum + item.totalSeconds, 0), [stats])

  const filterLabel = selectedBoardIds.length === 0
    ? bt('hub.allBoards')
    : selectedBoardIds.length === 1
      ? boards.find((board) => board.id === selectedBoardIds[0])?.name ?? bt('stats.oneBoardSelected')
      : bt('stats.boardsSelected', { count: selectedBoardIds.length })

  return (
    <section className="mx-auto w-full min-w-0 max-w-[1232px] overflow-x-clip pb-8 pl-1 pr-3 pt-4">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <SectionIcon bg="#E8F0FE" color="#1A73E8"><TrendingUp size={22} /></SectionIcon>
          <div className="min-w-0">
            <h2 className="text-[22px] font-semibold leading-tight text-[#17202E]">{bt('page.hub.stats')}</h2>
            <p className="mt-1 text-[13px] text-[#586174]">
              {selectedBoardIds.length === 0 ? bt('stats.allBoardsData') : bt('stats.selectedBoardsData', { count: selectedBoardIds.length })}
            </p>
          </div>
        </div>
        <button
          ref={filterButtonRef}
          type="button"
          onClick={() => setIsFilterOpen((value) => !value)}
          className={`flex h-10 w-[260px] max-w-full items-center justify-between gap-2 self-end rounded-xl border bg-[#F9FBFE] px-3 text-left text-sm text-[#0A1628] outline-none transition-all hover:border-[#C5D2E5] sm:self-center ${
            isFilterOpen ? 'border-[#2458D3] ring-2 ring-[#2458D3]/10' : 'border-[#DDE3EE]'
          }`}
        >
          <span className="truncate">{filterLabel}</span>
          <ChevronDown size={16} className={`shrink-0 text-[#7B8494] transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
        </button>
        <FloatingMenu anchor={filterButtonRef.current} open={isFilterOpen} onClose={() => setIsFilterOpen(false)} className="w-[260px]">
          <div className="flex items-center justify-between border-b border-[#F1F4F9] px-3.5 pb-2 pt-1.5">
            <span className="text-[12px] font-semibold text-[#586174]">{bt('page.boards')}</span>
            <div className="flex gap-3">
              <button type="button" onClick={() => setSelectedBoardIds(boards.map((b) => b.id))} className="text-[12px] font-medium text-[#2458D3] hover:underline">{bt('hub.statusAll')}</button>
              <button type="button" onClick={() => setSelectedBoardIds([])} className="text-[12px] font-medium text-[#D93025] hover:underline">{bt('stats.reset')}</button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {boards.map((board) => (
              <label key={board.id} className="flex cursor-pointer items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium text-[#1F2937] transition-colors hover:bg-[#F1F5FD]">
                <input
                  type="checkbox"
                  checked={selectedBoardIds.includes(board.id)}
                  onChange={() => handleToggleBoard(board.id)}
                  className="h-4 w-4 shrink-0 rounded border-[#DDE3EE] accent-[#2458D3]"
                />
                <span className="truncate">{board.name}</span>
              </label>
            ))}
          </div>
        </FloatingMenu>
      </header>

      <div className="mt-5 space-y-4">
        {error ? (
          <div className="flex items-center gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-600">
            <AlertTriangle size={18} />
            {error}
          </div>
        ) : null}

        {!stats && isLoading ? <StatsSkeleton /> : stats ? (
          <div className={`space-y-4 transition-opacity ${isLoading ? 'opacity-60' : ''}`}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <KpiCard icon={<ListChecks size={15} />} label={bt('stats.totalTasks')} value={stats.summary.totalTasks} color="#1A73E8" bg="#E8F0FE" />
              <KpiCard icon={<CheckCircle2 size={15} />} label={bt('stats.done')} value={stats.summary.completedTasks} sub={`${stats.summary.completionPercent}%`} color="#1E8E3E" bg="#E6F4EA" />
              <KpiCard icon={<Clock3 size={15} />} label={bt('stats.unfinished')} value={stats.summary.activeTasks} color="#B06000" bg="#FEF7E0" />
              <KpiCard icon={<AlertTriangle size={15} />} label={bt('goals.overdue')} value={stats.summary.overdueTasks} color="#D93025" bg="#FCE8E6" />
              <KpiCard icon={<Timer size={15} />} label={bt('stats.spent')} value={stats.summary.totalSpentLabel} color="#A142F4" bg="#F3E8FD" />
              <KpiCard icon={<History size={15} />} label="Worklog" value={formatHours(totalWorklogSeconds)} color="#12B5CB" bg="#E4F7FB" />
            </div>

            <Card title={bt('stats.rating')} subtitle={bt('stats.ratingHint')}>
              <ColumnChart items={ratingItems} fixedTop={100} height={180} minColumnWidth={96} />
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card title={bt('stats.byStatus')}>
                {statusItems.length ? <Donut items={statusItems} total={statusTotal} /> : <div className="flex h-[164px] items-center justify-center rounded-lg bg-[#F8F9FB] text-[13px] text-[#7B8494]">{bt('stats.noData')}</div>}
              </Card>
              <Card title={bt('stats.byPriority')}>
                <HorizontalBars items={priorityItems} />
              </Card>
              <Card title={bt('stats.deadlines')}>
                <ColumnChart items={deadlineItems} height={180} />
              </Card>
              <Card title={bt('stats.worklogByDay')}>
                <ColumnChart items={worklogItems} height={180} integer={false} formatTick={(value) => formatHours(Math.round(value * 3600))} minColumnWidth={72} />
              </Card>
            </div>

            <Card title={bt('stats.employeeScores')}>
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[#E6EAF1]">
                      {[bt('stats.cols.employee'), bt('stats.cols.assigned'), bt('stats.cols.done'), bt('stats.cols.active'), bt('stats.cols.overdue'), bt('stats.cols.created'), bt('stats.cols.logs'), bt('stats.cols.score')].map((head) => (
                        <th key={head} className="whitespace-nowrap px-2 pb-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#586174]">{head}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.employees.map((emp) => {
                      const meta = emp.assignedTasks > 0 ? scoreMeta(emp.productivityScore) : { bar: '#9CA3AF', badge: 'bg-slate-100 text-slate-600' }
                      return (
                        <tr key={emp.userId} className="border-b border-[#F1F3F4] transition-colors last:border-0 hover:bg-[#F8F9FB]">
                          <td className="px-2 py-3">
                            <div className="flex items-center gap-3">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E8F0FE] text-[11px] font-semibold text-[#1967D2]">{initialsOf(emp.fullName)}</span>
                              <span className="whitespace-nowrap text-[13px] font-semibold text-[#17202E]">{emp.fullName}</span>
                            </div>
                          </td>
                          <td className="px-2 py-3 text-[13px] text-[#17202E]">{emp.assignedTasks}</td>
                          <td className="whitespace-nowrap px-2 py-3 text-[13px]">
                            <span className={emp.completedTasks > 0 ? 'font-semibold text-[#1E8E3E]' : 'text-[#17202E]'}>{emp.completedTasks}</span>
                            <span className="ml-1 text-[11px] text-[#7B8494]">({emp.completionPercent}%)</span>
                          </td>
                          <td className="px-2 py-3 text-[13px] text-[#17202E]">{emp.activeTasks}</td>
                          <td className="whitespace-nowrap px-2 py-3 text-[13px]">
                            <span className={emp.overdueTasks > 0 ? 'font-semibold text-[#D93025]' : 'text-[#17202E]'}>{emp.overdueTasks}</span>
                            <span className="ml-1 text-[11px] text-[#7B8494]">({emp.overduePercent}%)</span>
                          </td>
                          <td className="px-2 py-3 text-[13px] text-[#17202E]">{emp.createdTasks}</td>
                          <td className="whitespace-nowrap px-2 py-3 text-[13px] text-[#17202E]">{emp.worklogLabel}</td>
                          <td className="px-2 py-3">
                            <div className="flex min-w-[190px] items-center gap-2">
                              <span className="h-1.5 w-20 overflow-hidden rounded-full bg-[#F1F3F4]">
                                <span className="block h-full rounded-full" style={{ width: `${Math.min(100, emp.productivityScore)}%`, background: meta.bar }} />
                              </span>
                              <span className="text-[13px] font-semibold text-[#1967D2]">{emp.assignedTasks > 0 ? emp.productivityScore : '—'}</span>
                              <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.badge}`}>{emp.productivityLabel}</span>
                            </div>
                            <p className="mt-1 text-[11px] text-[#7B8494]">{bt('stats.estimateFact', { estimate: emp.totalEstimateLabel, spent: emp.totalSpentLabel })}</p>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {stats.employees.length === 0 ? <p className="py-6 text-center text-[13px] text-[#7B8494]">{bt('stats.noEmployees')}</p> : null}
              </div>
            </Card>

            <Card title={bt('stats.activityEvents')}>
              <ColumnChart items={activityItems} height={180} minColumnWidth={92} barWidth={24} />
            </Card>
          </div>
        ) : !error ? (
          <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#DDE3EE] bg-white">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F3F4] text-[#7B8494]"><BarChart3 size={22} /></span>
            <p className="text-[13px] text-[#586174]">{bt('stats.noStatsData')}</p>
          </div>
        ) : null}
      </div>
    </section>
  )
}
