import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Clock3, Lightbulb, Sparkles, Timer, TrendingDown, TrendingUp, X } from 'lucide-react'
import type { BoardStatsViewModel } from '../../view-models/BoardViewModel'
import type { KanbanBoardStatsResponse } from '../../../domain/entities/AiTools'
import GradientAvatar from '../../../shared/ui/GradientAvatar'
import { formatHours } from './stats/StatUtils'
import { bt } from './boardText'

interface BoardStatsDashboardProps {
  stats: BoardStatsViewModel
  aiStats?: KanbanBoardStatsResponse | null
  onClose: () => void
}

interface Segment {
  key: string
  label: string
  value: number
  color: string
}

const STATUS_COLORS = ['#1A73E8', '#F9AB00', '#A142F4', '#1E8E3E', '#E8710A', '#12B5CB', '#5F6368']

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
  get checklist_created() { return bt('stats.activity.checklistCreated') },
  get checklist_updated() { return bt('stats.activity.checklistUpdated') },
  get attachment_added() { return bt('stats.activity.attachmentAdded') },
  get attachment_created() { return bt('stats.activity.attachmentAdded') },
  get attachment_deleted() { return bt('stats.activity.attachmentDeleted') },
}

const sentenceCase = (value: string) => {
  const text = value.trim()
  if (!text || text !== text.toUpperCase()) return text
  return text.charAt(0) + text.slice(1).toLowerCase()
}

const statusColor = (name: string, index: number) => {
  const value = name.toLowerCase()
  if (value.includes('готов') || value.includes('done') || value.includes('заверш')) return '#1E8E3E' // i18n-ignore
  if (value.includes('провер') || value.includes('review') || value.includes('test')) return '#A142F4' // i18n-ignore
  if (value.includes('работ') || value.includes('progress')) return '#F9AB00' // i18n-ignore
  if (value.includes('выполн') || value.includes('todo')) return '#1A73E8' // i18n-ignore
  return STATUS_COLORS[index % STATUS_COLORS.length]
}

const scoreMeta = (score: number, assignedTasks: number) => {
  if (!assignedTasks) return { label: bt('productivity.noAssignments'), color: '#6B7280', bg: '#F3F4F6' }
  if (score >= 85) return { label: bt('productivity.excellent'), color: '#1E8E3E', bg: '#E6F4EA' }
  if (score >= 65) return { label: bt('productivity.good'), color: '#1967D2', bg: '#E8F0FE' }
  if (score >= 40) return { label: bt('stats.attention'), color: '#B06000', bg: '#FEF7E0' }
  return { label: bt('productivity.risk'), color: '#C5221F', bg: '#FCE8E6' }
}

const formatDay = (value: string, options: Intl.DateTimeFormatOptions) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ru-RU', options).replace(/\.$/, '')
}

const niceMax = (value: number) => {
  if (value <= 4) return 4
  const power = 10 ** Math.floor(Math.log10(value))
  const unit = value / power
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10
  return Math.ceil((nice * power) / 4) * 4
}

function Card({ title, extra, children, className = '' }: { title: string; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`flex min-w-0 flex-col rounded-2xl border border-[#ECECEF] bg-white p-4 ${className}`}>
      <header className="mb-3 flex min-h-8 items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-[#1D1D1F]">{title}</h3>
        {extra}
      </header>
      {children}
    </section>
  )
}

function Pill({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#E5E5EA] px-2.5 text-[12px] text-[#3C3C43]">{children}</span>
}

function ColumnsChart({ items }: { items: Array<{ key: string; label: string; fullLabel: string; value: number }> }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = niceMax(Math.max(0, ...items.map((item) => item.value)))
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((part) => Math.round(max * part))
  const height = 200

  if (!items.length) return <p className="flex h-[220px] items-center justify-center text-[13px] text-[#8E8E93]">{bt('stats.noDataPeriod')}</p>

  return (
    <div className="flex gap-3">
      <div className="relative w-6 shrink-0" style={{ height }}>
        {ticks.map((tick) => (
          <span key={tick} className="absolute right-0 text-[11px] leading-none text-[#8E8E93]" style={{ bottom: `${(tick / max) * 100}%`, transform: 'translateY(50%)' }}>{tick}</span>
        ))}
      </div>
      <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:thin]">
        <div className="relative" style={{ minWidth: items.length * 22 }}>
          <div className="relative" style={{ height }}>
            {ticks.map((tick) => (
              <div key={tick} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[#EDEDF0]" style={{ bottom: `${(tick / max) * 100}%` }} />
            ))}
            <div className="relative flex h-full items-end gap-1" onMouseLeave={() => setHover(null)}>
              {items.map((item, index) => (
                <div key={item.key} className="relative flex h-full flex-1 items-end justify-center" onMouseEnter={() => setHover(index)}>
                  <span
                    className="w-full max-w-[18px] rounded-t-[5px] transition-opacity"
                    style={{
                      height: `${(item.value / max) * 100}%`,
                      minHeight: item.value > 0 ? 4 : 2,
                      background: item.value > 0 ? '#2458D3' : '#E5E5EA',
                      opacity: hover === null || hover === index ? 1 : 0.35,
                    }}
                  />
                  {hover === index ? (
                    <div className="pointer-events-none absolute bottom-[calc(100%+8px)] z-10 w-max min-w-[140px] -translate-x-1/2 rounded-xl border border-[#ECECEF] bg-white px-3 py-2 shadow-[0_8px_24px_rgba(15,23,42,0.12)]" style={{ left: '50%', bottom: `calc(${(item.value / max) * 100}% + 8px)` }}>
                      <p className="text-[11px] text-[#8E8E93]">{item.fullLabel}</p>
                      <p className="mt-0.5 text-[15px] font-semibold text-[#1D1D1F]">{item.value} <span className="text-[12px] font-normal text-[#8E8E93]">{bt('stats.tasksWord')}</span></p>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-2 flex gap-1">
            {items.map((item, index) => (
              <span key={item.key} className={`flex-1 text-center text-[11px] ${hover === index ? 'font-semibold text-[#1D1D1F]' : 'text-[#8E8E93]'}`}>{item.label}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Donut({ segments, total, caption }: { segments: Segment[]; total: number; caption: string }) {
  const radius = 56
  const stroke = 14
  const length = 2 * Math.PI * radius
  const visible = segments.filter((segment) => segment.value > 0)
  const gap = visible.length > 1 ? 6 : 0
  let offset = 0
  return (
    <div className="flex items-center gap-5">
      <div className="relative h-[140px] w-[140px] shrink-0">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="70" cy="70" r={radius} fill="none" stroke="#F2F2F7" strokeWidth={stroke} />
          {total > 0 ? visible.map((segment) => {
            const size = (segment.value / total) * length
            const node = (
              <circle key={segment.key} cx="70" cy="70" r={radius} fill="none" stroke={segment.color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${Math.max(0.1, size - gap)} ${length}`} strokeDashoffset={-offset} />
            )
            offset += size
            return node
          }) : null}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[24px] font-semibold leading-none text-[#1D1D1F]">{total}</span>
          <span className="mt-1 text-[11px] text-[#8E8E93]">{caption}</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2.5">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center gap-2 text-[13px]">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: segment.color }} />
            <span className="min-w-0 flex-1 truncate text-[#3C3C43]">{segment.label}</span>
            <span className="font-semibold tabular-nums text-[#1D1D1F]">{segment.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function LineChart({ points }: { points: Array<{ key: string; label: string; value: number; valueLabel: string }> }) {
  const [hover, setHover] = useState<number | null>(null)
  if (!points.length) return <p className="flex h-[150px] items-center justify-center text-[13px] text-[#8E8E93]">{bt('stats.noWorklog')}</p>
  const width = 300
  const height = 130
  const max = Math.max(...points.map((point) => point.value), 0.0001)
  const step = points.length > 1 ? width / (points.length - 1) : 0
  const coords = points.map((point, index) => ({
    x: points.length > 1 ? index * step : width / 2,
    y: height - 12 - (point.value / max) * (height - 30),
  }))
  const path = coords.map((c, index) => `${index ? 'L' : 'M'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
  const area = `${path} L${coords[coords.length - 1].x.toFixed(1)},${height} L${coords[0].x.toFixed(1)},${height} Z`
  const active = hover ?? points.length - 1

  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-[130px] w-full overflow-visible" onMouseLeave={() => setHover(null)}>
          <defs>
            <linearGradient id="worklog-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#2458D3" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#2458D3" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((part) => (
            <line key={part} x1="0" x2={width} y1={height * part} y2={height * part} stroke="#EDEDF0" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={area} fill="url(#worklog-area)" />
          <path d={path} fill="none" stroke="#2458D3" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <line x1={coords[active].x} x2={coords[active].x} y1="0" y2={height} stroke="#1D1D1F" strokeDasharray="3 3" strokeOpacity="0.35" vectorEffect="non-scaling-stroke" />
          {points.map((point, index) => (
            <rect key={point.key} x={coords[index].x - step / 2} y="0" width={Math.max(step, 12)} height={height} fill="transparent" onMouseEnter={() => setHover(index)} />
          ))}
        </svg>
        <span
          className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#2458D3] bg-white"
          style={{ left: `${(coords[active].x / width) * 100}%`, top: `${(coords[active].y / height) * 100}%` }}
        />
        <span
          className="pointer-events-none absolute -translate-x-1/2 rounded-md bg-[#2458D3] px-1.5 py-0.5 text-[11px] font-semibold text-white"
          style={{ left: `${(coords[active].x / width) * 100}%`, top: `calc(${(coords[active].y / height) * 100}% - 30px)` }}
        >
          {points[active].valueLabel}
        </span>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <p className="text-[20px] font-semibold leading-none text-[#1D1D1F]">{points[active].valueLabel}</p>
          <p className="mt-1 text-[12px] text-[#8E8E93]">{points[active].label}</p>
        </div>
        <p className="text-[12px] text-[#8E8E93]">{bt('stats.days', { count: points.length })}</p>
      </div>
    </div>
  )
}

function ProgressRows({ rows }: { rows: Array<{ key: string; label: string; value: number; color: string; suffix?: string }> }) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  if (!rows.length) return <p className="py-6 text-center text-[13px] text-[#8E8E93]">{bt('stats.noData')}</p>
  return (
    <ul className="space-y-3.5">
      {rows.map((row) => (
        <li key={row.key}>
          <div className="flex items-center justify-between text-[13px]">
            <span className="truncate text-[#3C3C43]">{row.label}</span>
            <span className="font-semibold tabular-nums text-[#1D1D1F]">{row.value}{row.suffix ?? ''}</span>
          </div>
          <div className="relative mt-1.5 h-1.5 rounded-full bg-[#F2F2F7]">
            <div className="h-full rounded-full" style={{ width: `${(row.value / max) * 100}%`, background: row.color }} />
            <span className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full" style={{ left: `calc(${(row.value / max) * 100}% - 1px)`, background: row.color }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function Ring({ value }: { value: number }) {
  const radius = 7
  const length = 2 * Math.PI * radius
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" className="-rotate-90" aria-hidden="true">
      <circle cx="9" cy="9" r={radius} fill="none" stroke="#E5E5EA" strokeWidth="2.5" />
      <circle cx="9" cy="9" r={radius} fill="none" stroke="#1E8E3E" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${(Math.min(100, value) / 100) * length} ${length}`} />
    </svg>
  )
}

export default function BoardStatsDashboard({ stats, aiStats, onClose }: BoardStatsDashboardProps) {
  const { summary, byStatus, byPriority, byDeadline, employees, activity, worklogs } = stats

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const statusSegments = useMemo<Segment[]>(() => byStatus.map((item, index) => ({
    key: `${item.name}-${index}`,
    label: sentenceCase(item.name || bt('stats.noStatus')),
    value: item.count,
    color: statusColor(item.name || '', index),
  })), [byStatus])

  const prioritySegments = useMemo<Segment[]>(() => byPriority
    .map((item, index) => {
      const meta = PRIORITY_META[String(item.name || '').toLowerCase().trim()]
      return { key: `${item.name}-${index}`, label: meta?.label ?? sentenceCase(item.name || bt('stats.noPriority')), value: item.count, color: meta?.color ?? '#9AA0A6', order: meta?.order ?? 9 }
    })
    .sort((a, b) => a.order - b.order), [byPriority])

  const timelineItems = useMemo(() => {
    if (aiStats?.timeline?.length) {
      return aiStats.timeline.map((item) => ({
        key: item.date,
        label: formatDay(item.date, { day: 'numeric' }),
        fullLabel: formatDay(item.date, { day: 'numeric', month: 'long' }),
        value: item.closed_tasks_count,
      }))
    }
    return []
  }, [aiStats])

  const worklogPoints = useMemo(() => worklogs.map((item) => ({
    key: item.date,
    label: formatDay(item.date, { day: 'numeric', month: 'long' }),
    value: item.totalSeconds,
    valueLabel: item.totalLabel,
  })), [worklogs])

  const activityRows = useMemo(() => [...activity]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((item) => ({
      key: item.action,
      label: ACTIVITY_LABELS[item.action.toLowerCase()] ?? sentenceCase(item.action.replace(/_/g, ' ')),
      value: item.count,
      color: '#2458D3',
    })), [activity])

  const totalWorklogSeconds = worklogs.reduce((sum, item) => sum + item.totalSeconds, 0)
  const statusTotal = statusSegments.reduce((sum, item) => sum + item.value, 0)
  const priorityTotal = prioritySegments.reduce((sum, item) => sum + item.value, 0)
  const aiByUser = new Map((aiStats?.users ?? []).map((user) => [user.user_id, user]))
  const periodLabel = aiStats ? `${formatDay(aiStats.period_start, { day: 'numeric', month: 'long' })} — ${formatDay(aiStats.period_end, { day: 'numeric', month: 'long' })}` : ''

  const keyMetrics = [
    { key: 'done', icon: <CheckCircle2 size={15} strokeWidth={1.75} />, label: bt('stats.done'), value: `${summary.completedTasks}`, hint: `${summary.completionPercent}%`, positive: true },
    { key: 'progress', icon: <Clock3 size={15} strokeWidth={1.75} />, label: bt('stats.unfinished'), value: `${summary.activeTasks}` },
    { key: 'overdue', icon: <AlertTriangle size={15} strokeWidth={1.75} />, label: bt('goals.overdue'), value: `${summary.overdueTasks}`, negative: summary.overdueTasks > 0 },
    { key: 'spent', icon: <Timer size={15} strokeWidth={1.75} />, label: bt('stats.spent'), value: summary.totalSpentLabel },
    { key: 'worklog', icon: <Clock3 size={15} strokeWidth={1.75} />, label: 'Worklog', value: formatHours(totalWorklogSeconds) },
  ]

  const insight = summary.overdueTasks > 0
    ? bt('stats.overdueSummary', { overdue: summary.overdueTasks, total: summary.totalTasks })
    : summary.totalTasks > 0
      ? bt('stats.noOverdue')
      : bt('stats.emptyBoard')

  return createPortal(
    <div
      className="fixed inset-0 z-[900] flex items-center justify-center bg-[#0A1628]/[0.22] p-3 sm:p-6"
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div role="dialog" aria-modal="true" aria-label={bt('stats.boardTitle')} className="flex h-full w-full max-w-[1200px] flex-col overflow-hidden rounded-[20px] bg-[#F7F7F8] shadow-[0_24px_70px_rgba(10,22,40,0.22)]">
        <header className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="truncate text-[20px] font-semibold tracking-[-0.02em] text-[#1D1D1F]">{bt('stats.boardTitle')}{aiStats?.board_name ? <span className="font-normal text-[#8E8E93]"> · {aiStats.board_name}</span> : null}</h2>
            {periodLabel ? <p className="mt-0.5 text-[12px] text-[#8E8E93]">{bt('stats.period', { period: periodLabel })}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#E5E5EA] bg-white text-[#3C3C43] transition hover:bg-[#F2F2F7]" aria-label={bt('close')}>
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 sm:px-6 sm:pb-6 [scrollbar-width:thin]">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <Card title={bt('stats.closedTasks')} className="lg:col-span-2" extra={aiStats ? <Pill>{bt('stats.perMonth', { count: aiStats.summary.closed_this_month })}</Pill> : null}>
              <ColumnsChart items={timelineItems} />
            </Card>

            <Card title={bt('stats.composition')}>
              <div className="flex items-center gap-3">
                <span className="text-[30px] font-semibold leading-none tracking-[-0.02em] text-[#1D1D1F]">{summary.totalTasks}</span>
                <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[#E5E5EA] px-2.5 text-[12px] text-[#3C3C43]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#1E8E3E]" />
                  {bt('stats.percentDone', { percent: summary.completionPercent })}
                </span>
              </div>
              <div className="mt-4 flex h-2 gap-0.5 overflow-hidden rounded-full bg-[#F2F2F7]">
                {statusTotal > 0 ? statusSegments.filter((s) => s.value > 0).map((segment) => (
                  <span key={segment.key} style={{ width: `${(segment.value / statusTotal) * 100}%`, background: segment.color }} />
                )) : null}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
                {statusSegments.map((segment) => (
                  <span key={segment.key} className="flex items-center gap-1.5 text-[12px] text-[#3C3C43]">
                    <span className="h-2 w-2 rounded-full" style={{ background: segment.color }} />
                    {segment.label}
                  </span>
                ))}
              </div>
              <p className="mt-5 text-[13px] font-medium text-[#1D1D1F]">{bt('stats.kpi')}</p>
              <ul className="mt-1">
                {keyMetrics.map((metric) => (
                  <li key={metric.key} className="flex items-center justify-between gap-3 border-b border-[#F2F2F7] py-2.5 text-[13px] last:border-0">
                    <span className="flex items-center gap-2 text-[#3C3C43]"><span className="text-[#AEAEB2]">{metric.icon}</span>{metric.label}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-medium tabular-nums text-[#1D1D1F]">{metric.value}</span>
                      {metric.hint ? <span className="flex items-center gap-0.5 text-[12px] text-[#1E8E3E]"><TrendingUp size={12} />{metric.hint}</span> : null}
                      {metric.negative ? <span className="flex items-center text-[#D93025]"><TrendingDown size={12} /></span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card title={bt('stats.priorities')}>
              <Donut segments={prioritySegments} total={priorityTotal} caption={bt('stats.tasksWord')} />
              <div className="mt-4 flex gap-2.5 rounded-xl border border-[#ECECEF] bg-[#FAFAFA] px-3 py-2.5 text-[12px] leading-[17px] text-[#3C3C43]">
                <Lightbulb size={15} strokeWidth={1.75} className="mt-px shrink-0 text-[#8E8E93]" />
                <span>{insight}</span>
              </div>
            </Card>

            <Card title={bt('stats.worklogByDay')}>
              <LineChart points={worklogPoints} />
            </Card>

            <Card title={bt('stats.deadlinesActivity')}>
              <ProgressRows rows={byDeadline.map((item, index) => ({ key: `d-${index}`, label: sentenceCase(item.name), value: item.count, color: ['#D93025', '#F9AB00', '#1E8E3E', '#1A73E8'][index % 4] }))} />
              {activityRows.length ? (
                <>
                  <p className="mb-3 mt-5 text-[13px] font-medium text-[#1D1D1F]">{bt('stats.events')}</p>
                  <ProgressRows rows={activityRows} />
                </>
              ) : null}
            </Card>

            <section className="min-w-0 overflow-hidden rounded-2xl border border-[#ECECEF] bg-white lg:col-span-3">
              <header className="flex items-center justify-between px-4 py-3.5">
                <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-[#1D1D1F]">{bt('stats.employees')}</h3>
                <Pill>{bt('stats.inTeam', { count: employees.length })}</Pill>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-left">
                  <thead>
                    <tr className="border-y border-[#F0F1F3] bg-[#FAFAFA]">
                      {[bt('stats.cols.employee'), bt('stats.cols.assigned'), bt('stats.cols.done'), bt('stats.cols.overdue'), bt('stats.cols.logs'), bt('stats.cols.score')].map((head) => (
                        <th key={head} className="whitespace-nowrap px-4 py-2.5 text-[12px] font-medium text-[#3C3C43]">{head}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp) => {
                      const meta = scoreMeta(emp.productivityScore, emp.assignedTasks)
                      const aiUser = aiByUser.get(emp.userId)
                      const initials = emp.fullName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('')
                      return (
                        <tr key={emp.userId} className="border-b border-[#F2F2F7] last:border-0 hover:bg-[#FAFAFA]">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <GradientAvatar initials={initials || '??'} size={28} seed={emp.userId} />
                              <div className="min-w-0">
                                <p className="truncate text-[13px] font-medium text-[#1D1D1F]">{emp.fullName}</p>
                                {aiUser?.ai_summary ? (
                                  <p className="flex max-w-[320px] items-center gap-1 truncate text-[11px] text-[#8E8E93]" title={aiUser.ai_summary}>
                                    <Sparkles size={11} className="shrink-0 text-[#A142F4]" />
                                    <span className="truncate">{aiUser.ai_summary}</span>
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[13px] tabular-nums text-[#1D1D1F]">{emp.assignedTasks}</td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-2 text-[13px] text-[#3C3C43]">
                              <Ring value={emp.completionPercent} />
                              {emp.completedTasks} · {emp.completionPercent}%
                            </span>
                          </td>
                          <td className={`px-4 py-3 text-[13px] tabular-nums ${emp.overdueTasks > 0 ? 'text-[#D93025]' : 'text-[#3C3C43]'}`}>{emp.overdueTasks}</td>
                          <td className="px-4 py-3 text-[13px] text-[#3C3C43]">
                            <span className="flex items-center gap-1.5"><Timer size={13} className="text-[#AEAEB2]" />{emp.worklogLabel}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[12px] font-medium" style={{ color: meta.color, background: meta.bg, borderColor: meta.bg }}>
                              {emp.assignedTasks > 0 && (emp.productivityScore >= 65 ? <TrendingUp size={12} /> : <TrendingDown size={12} />)}
                              {emp.assignedTasks > 0 ? emp.productivityScore : '—'} · {meta.label}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                    {employees.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-[13px] text-[#8E8E93]">{bt('stats.noEmployees')}</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
