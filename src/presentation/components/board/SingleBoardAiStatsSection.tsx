import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, ChevronRight, Clock3, Activity, ListChecks, Sparkles, Star, TrendingUp, Trophy, Users } from 'lucide-react'
import type { BoardOptionViewModel, BoardUserViewModel } from '../../view-models/BoardViewModel'
import type { KanbanBoardStatsResponse } from '../../../domain/entities/AiTools'
import type { HttpAlemAiRepository } from '../../../infrastructure/repositories/HttpAlemAiRepository'
import GradientAvatar from '../../../shared/ui/GradientAvatar'
import AppSelect from '../../../shared/ui/AppSelect'
import { formatDate } from '../../../shared/i18n'
import { bt } from './boardText'

interface SingleBoardAiStatsSectionProps {
  boards: BoardOptionViewModel[]
  users: BoardUserViewModel[]
  alemAiRepository: HttpAlemAiRepository
}

type StatsUser = KanbanBoardStatsResponse['users'][number]
type TimelineItem = KanbanBoardStatsResponse['timeline'][number] & {
  in_progress_tasks_count?: number
  overdue_tasks_count?: number
}

const COLORS = {
  done: '#1E8E3E',
  doneSoft: '#E6F4EA',
  progress: '#F9AB00',
  progressSoft: '#FEF7E0',
  overdue: '#D93025',
  overdueSoft: '#FCE8E6',
  total: '#1A73E8',
  totalSoft: '#E8F0FE',
}

const percent = (value: number, total: number) => (total > 0 ? Math.round((value / total) * 100) : 0)

const initialsOf = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '??'

function Ring({ value, color, track }: { value: number; color: string; track: string }) {
  const radius = 24
  const length = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <svg width="60" height="60" viewBox="0 0 60 60" aria-hidden="true" className="shrink-0">
      <circle cx="30" cy="30" r={radius} fill="none" stroke={track} strokeWidth="5" />
      <circle
        cx="30"
        cy="30"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${(clamped / 100) * length} ${length}`}
        transform="rotate(-90 30 30)"
      />
    </svg>
  )
}

function KpiCard({ icon, label, value, caption, color, track, ring }: { icon: ReactNode; label: string; value: number; caption: string; color: string; track: string; ring: number }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-[#E6EAF1] bg-white px-5 py-4">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[13px] font-semibold" style={{ color }}>
          {icon}
          {label}
        </p>
        <p className="mt-2 flex items-baseline gap-2">
          <span className="text-[34px] font-semibold leading-none text-[#17202E]">{value}</span>
          <span className="text-[13px] text-[#586174]">{caption}</span>
        </p>
      </div>
      <Ring value={ring} color={color} track={track} />
    </div>
  )
}

function SectionIcon({ children, bg, color }: { children: ReactNode; bg: string; color: string }) {
  return <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: bg, color }}>{children}</span>
}

function MetricTile({ label, value, sub, color, bg }: { label: string; value: number; sub?: string; color: string; bg: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: bg }}>
      <p className="text-[11px] font-medium" style={{ color }}>{label}</p>
      <p className="mt-0.5 flex items-baseline gap-1.5">
        <span className="text-[22px] font-semibold leading-none" style={{ color }}>{value}</span>
        {sub ? <span className="text-[11px] font-medium" style={{ color }}>{sub}</span> : null}
      </p>
    </div>
  )
}

function StatsSkeleton() {
  return (
    <div className="animate-pulse space-y-5" aria-busy="true" aria-label={bt('stats.ai.loading')}>
      <div className="h-[110px] rounded-xl bg-[#EEF1F5]" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-[118px] rounded-xl bg-[#EEF1F5]" />)}
      </div>
      <div className="h-[276px] rounded-xl bg-[#EEF1F5]" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="h-[420px] rounded-xl bg-[#EEF1F5]" />
        <div className="h-[420px] rounded-xl bg-[#EEF1F5]" />
      </div>
    </div>
  )
}

function TimelineChart({ items }: { items: TimelineItem[] }) {
  const totals = items.map((item) => item.closed_tasks_count + (item.in_progress_tasks_count ?? 0) + (item.overdue_tasks_count ?? 0))
  const maxValue = Math.max(4, ...totals)
  const steps = Math.min(4, maxValue)
  const ticks = Array.from({ length: steps + 1 }, (_, index) => Math.round((maxValue / steps) * index))
  const chartHeight = 144

  return (
    <div className="flex gap-3">
      <div className="relative w-6 shrink-0" style={{ height: chartHeight }}>
        {ticks.map((tick) => (
          <span key={tick} className="absolute right-0 -translate-y-1/2 text-[11px] text-[#7B8494]" style={{ bottom: `${(tick / maxValue) * 100}%`, transform: 'translateY(50%)' }}>{tick}</span>
        ))}
      </div>
      <div className="min-w-0 flex-1 overflow-x-auto">
        <div className="relative min-w-[620px]">
          <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: chartHeight }}>
            {ticks.map((tick) => (
              <div key={tick} className="absolute inset-x-0 border-t border-[#EEF0F3]" style={{ bottom: `${(tick / maxValue) * 100}%` }} />
            ))}
          </div>
          <div className="relative flex items-end justify-between gap-1" style={{ height: chartHeight }}>
            {items.map((item) => {
              const parts = [
                { key: 'done', value: item.closed_tasks_count, color: COLORS.done, label: bt('stats.done') },
                { key: 'progress', value: item.in_progress_tasks_count ?? 0, color: COLORS.progress, label: bt('status.IN_PROGRESS') },
                { key: 'overdue', value: item.overdue_tasks_count ?? 0, color: COLORS.overdue, label: bt('goals.overdue') },
              ].filter((part) => part.value > 0)
              const day = new Date(item.date)
              const title = `${formatDate(day, { day: 'numeric', month: 'long' })}: ${parts.length ? parts.map((part) => `${part.label.toLowerCase()} ${part.value}`).join(', ') : bt('stats.ai.noEvents')}`
              return (
                <div key={item.date} className="flex h-full flex-1 flex-col-reverse items-center gap-[3px]" title={title}>
                  {parts.length ? parts.map((part) => (
                    <span key={part.key} className="w-full max-w-[14px] rounded-[4px]" style={{ height: `${(part.value / maxValue) * 100}%`, minHeight: 6, background: part.color }} />
                  )) : <span className="h-1 w-full max-w-[14px] rounded-full bg-[#E3E8EF]" />}
                </div>
              )
            })}
          </div>
          <div className="mt-2 flex justify-between gap-1">
            {items.map((item) => (
              <span key={item.date} className="flex-1 text-center text-[11px] text-[#7B8494]">{String(new Date(item.date).getDate()).padStart(2, '0')}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SingleBoardAiStatsSection({ boards, users, alemAiRepository }: SingleBoardAiStatsSectionProps) {
  const [selectedBoardId, setSelectedBoardId] = useState<string>('')
  const [stats, setStats] = useState<KanbanBoardStatsResponse | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string>('')
  const [noteExpanded, setNoteExpanded] = useState<boolean>(false)
  const [driverIndex, setDriverIndex] = useState<number>(0)

  const resolveUser = useCallback((userId: number, fallbackName: string) => {
    const matched = users.find((u) => u.id === userId)
    if (matched) return { fullName: matched.fullName, initials: matched.initials, avatarUrl: matched.avatarUrl }
    return { fullName: fallbackName, initials: initialsOf(fallbackName), avatarUrl: '' }
  }, [users])

  useEffect(() => {
    if (boards.length > 0 && !selectedBoardId) setSelectedBoardId(boards[0].id)
  }, [boards, selectedBoardId])

  const loadStats = useCallback(async (boardId: string) => {
    if (!boardId) return
    setIsLoading(true)
    setError('')
    try {
      setStats(await alemAiRepository.getBoardStats(boardId))
      setDriverIndex(0)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : bt('stats.ai.loadError'))
    } finally {
      setIsLoading(false)
    }
  }, [alemAiRepository])

  useEffect(() => {
    if (selectedBoardId) void loadStats(selectedBoardId)
  }, [selectedBoardId, loadStats])

  const drivers = useMemo<StatsUser[]>(() => (stats?.users ? [...stats.users].sort((a, b) => (b.share_percent ?? 0) - (a.share_percent ?? 0)).slice(0, 3) : []), [stats])
  const timeline = useMemo<TimelineItem[]>(() => (stats?.timeline ?? []) as TimelineItem[], [stats])
  const timelineHasProgress = timeline.some((item) => typeof item.in_progress_tasks_count === 'number')
  const timelineHasOverdue = timeline.some((item) => typeof item.overdue_tasks_count === 'number')
  const periodLabel = stats?.period_start ? new Date(stats.period_start).toLocaleDateString('ru-RU', { month: 'long' }) : ''

  if (boards.length === 0) return null

  const summary = stats?.summary
  const total = summary?.total_tasks ?? 0
  const activeDriver = drivers[driverIndex] ?? drivers[0]

  return (
    <section className="mx-auto w-full min-w-0 max-w-[1232px] overflow-x-clip pb-8 pl-1 pr-3 pt-4">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <SectionIcon bg={COLORS.totalSoft} color={COLORS.total}><TrendingUp size={22} /></SectionIcon>
          <div className="min-w-0">
            <h2 className="text-[22px] font-semibold leading-tight text-[#17202E]">{bt('stats.ai.title')}</h2>
            <p className="mt-1 text-[13px] text-[#586174]">{bt('stats.ai.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-center">
          <AppSelect
            value={selectedBoardId}
            options={boards.map((board) => ({ value: board.id, label: board.name }))}
            onChange={setSelectedBoardId}
            ariaLabel={bt('filters.boardSelect')}
            searchable
            searchPlaceholder={bt('filters.boardSearch')}
            showButtonAvatar={false}
            showOptionAvatar={false}
            className="w-[260px] max-w-full"
          />
        </div>
      </header>

      <div className="mt-5 space-y-4">
          {error ? (
            <div className="flex items-center gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-600">
              <AlertTriangle size={18} />
              {error}
            </div>
          ) : null}

          {isLoading ? <StatsSkeleton /> : stats && summary ? (
            <>
              {stats.calculation_note ? (
                <div className="flex items-start gap-4 rounded-xl border border-[#E4E0F7] bg-[linear-gradient(100deg,#EEF2FE_0%,#F3EEFD_55%,#FCEEF4_100%)] px-5 py-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#7C3AED] shadow-[0_2px_8px_rgba(124,58,237,0.12)]"><Sparkles size={22} /></span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-semibold text-[#17202E]">{bt('stats.ai.summaryTitle')}</h3>
                    <p className={`mt-1 text-[13px] leading-[22px] text-[#3C4858] ${noteExpanded ? '' : 'line-clamp-2'}`}>{stats.calculation_note}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNoteExpanded((value) => !value)}
                    className="mt-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#3C4858] shadow-[0_1px_3px_rgba(23,32,46,0.08)] transition hover:text-[#7C3AED]"
                    aria-label={noteExpanded ? bt('stats.ai.collapse') : bt('stats.ai.expand')}
                    aria-expanded={noteExpanded}
                  >
                    <ChevronRight size={18} className={noteExpanded ? 'rotate-90 transition' : 'transition'} />
                  </button>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard icon={<ListChecks size={16} />} label={bt('stats.totalTasks')} value={total} caption={bt('stats.tasksWord')} color={COLORS.total} track={COLORS.totalSoft} ring={total > 0 ? 100 : 0} />
                <KpiCard icon={<CheckCircle2 size={16} />} label={bt('stats.done')} value={summary.done_tasks} caption={`${percent(summary.done_tasks, total)}%`} color={COLORS.done} track={COLORS.doneSoft} ring={percent(summary.done_tasks, total)} />
                <KpiCard icon={<Clock3 size={16} />} label={bt('status.IN_PROGRESS')} value={summary.in_progress_tasks} caption={`${percent(summary.in_progress_tasks, total)}%`} color={COLORS.progress} track={COLORS.progressSoft} ring={percent(summary.in_progress_tasks, total)} />
                <KpiCard icon={<AlertTriangle size={16} />} label={bt('goals.overdue')} value={summary.overdue_tasks} caption={`${percent(summary.overdue_tasks, total)}%`} color={COLORS.overdue} track={COLORS.overdueSoft} ring={percent(summary.overdue_tasks, total)} />
              </div>

              {timeline.length ? (
                <div className="rounded-xl border border-[#E6EAF1] bg-white px-5 py-4">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-[17px] font-semibold text-[#17202E]">{bt('stats.ai.timeline')}</h3>
                      <p className="mt-0.5 text-[13px] text-[#586174]">{bt('stats.ai.perDay')}{periodLabel ? ` · ${periodLabel}` : ''}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium" style={{ background: COLORS.doneSoft, color: COLORS.done }}><span className="h-2 w-2 rounded-full" style={{ background: COLORS.done }} />{bt('stats.done')}</span>
                      {timelineHasProgress ? <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium" style={{ background: COLORS.progressSoft, color: '#B06000' }}><span className="h-2 w-2 rounded-full" style={{ background: COLORS.progress }} />{bt('status.IN_PROGRESS')}</span> : null}
                      {timelineHasOverdue ? <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium" style={{ background: COLORS.overdueSoft, color: COLORS.overdue }}><span className="h-2 w-2 rounded-full" style={{ background: COLORS.overdue }} />{bt('goals.overdue')}</span> : null}
                    </div>
                  </div>
                  <TimelineChart items={timeline} />
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                <div className="min-w-0 rounded-xl border border-[#E6EAF1] bg-white p-5">
                  <div className="flex items-start gap-3">
                    <SectionIcon bg={COLORS.totalSoft} color={COLORS.total}><Users size={20} /></SectionIcon>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[17px] font-semibold text-[#17202E]">{bt('stats.ai.drivers')}</h3>
                      <p className="mt-0.5 text-[13px] text-[#586174]">{bt('stats.ai.driversHint')}</p>
                    </div>
                    {drivers.length > 1 ? (
                      <button type="button" onClick={() => setDriverIndex((index) => (index + 1) % drivers.length)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F3F6] text-[#3C4858] transition hover:bg-[#E6EAF1]" aria-label={bt('stats.ai.nextDriver')}>
                        <ChevronRight size={18} />
                      </button>
                    ) : null}
                  </div>

                  {activeDriver ? (() => {
                    const assigned = activeDriver.assigned_tasks_count || activeDriver.closed_tasks_count + activeDriver.in_progress_tasks_count
                    const focus = (activeDriver.tasks ?? []).slice(0, 2).map((task: { task_title?: string; title?: string; name?: string } | string) => (typeof task === 'string' ? task : task?.task_title || task?.title || task?.name || '')).filter(Boolean)
                    return (
                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,230px)_minmax(0,1fr)]">
                        <div className="flex flex-col gap-2 self-start">
                          {drivers.map((driver, index) => {
                            const person = resolveUser(driver.user_id, driver.full_name)
                            const driverShare = Math.min(100, Math.round(driver.share_percent ?? 0))
                            const active = index === driverIndex
                            return (
                              <button key={driver.user_id} type="button" onClick={() => setDriverIndex(index)} className={`rounded-xl border p-4 text-left transition ${active ? 'border-[#DCE3EE] bg-white shadow-[0_2px_10px_rgba(23,32,46,0.06)]' : 'border-transparent bg-[#F8FAFC] hover:bg-[#F1F4F8]'}`}>
                                <div className="flex items-start gap-3">
                                  <GradientAvatar initials={person.initials} src={person.avatarUrl} size={44} seed={driver.user_id} />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[14px] font-semibold leading-snug text-[#17202E]">{person.fullName}</p>
                                    <p className="text-[12px] text-[#586174]">{bt('stats.ai.assignee')}</p>
                                  </div>
                                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#FEF7E0] px-2 py-0.5 text-[11px] font-semibold text-[#B06000]"><Trophy size={12} />{bt('stats.ai.top', { n: index + 1 })}</span>
                                </div>
                                <div className="mt-3 flex items-center justify-between text-[12px] text-[#3C4858]">
                                  <span>{bt('stats.ai.closedShare')}</span>
                                  <span className="font-semibold text-[#1A73E8]">{driverShare}%</span>
                                </div>
                                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#E8F0FE]"><div className="h-full rounded-full bg-[#1A73E8]" style={{ width: `${driverShare}%` }} /></div>
                              </button>
                            )
                          })}
                        </div>

                        <div className="space-y-3 rounded-xl border border-[#EEF1F5] p-4">
                          <div className="grid grid-cols-3 gap-2">
                            <MetricTile label={bt('stats.done')} value={activeDriver.closed_tasks_count} sub={`${percent(activeDriver.closed_tasks_count, assigned)}%`} color={COLORS.done} bg={COLORS.doneSoft} />
                            <MetricTile label={bt('goals.overdue')} value={activeDriver.overdue_tasks_count} sub={`${percent(activeDriver.overdue_tasks_count, assigned)}%`} color={COLORS.overdue} bg={COLORS.overdueSoft} />
                            <MetricTile label={bt('status.IN_PROGRESS')} value={activeDriver.in_progress_tasks_count} sub={`${percent(activeDriver.in_progress_tasks_count, assigned)}%`} color="#B06000" bg={COLORS.progressSoft} />
                          </div>
                          <MetricTile label={bt('stats.totalTasks')} value={assigned} color={COLORS.total} bg={COLORS.totalSoft} />
                          {activeDriver.ai_summary ? (
                            <div className="rounded-xl bg-[linear-gradient(135deg,#F5F3FF_0%,#F8F5FE_100%)] p-4">
                              <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-[#7C3AED]"><Sparkles size={14} />{bt('stats.ai.activityAnalysis')}</p>
                              <p className="text-[13px] leading-[21px] text-[#3C4858]">{activeDriver.ai_summary}</p>
                            </div>
                          ) : null}
                          {focus.length ? (
                            <p className="flex items-start gap-2 text-[13px] leading-5 text-[#3C4858]"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#1E8E3E]" /><span><span className="font-semibold text-[#17202E]">{bt('stats.ai.focus')}</span> {focus.join(', ')}</span></p>
                          ) : null}
                          {activeDriver.on_time_closed_count > 0 ? (
                            <p className="flex items-start gap-2 text-[13px] leading-5 text-[#3C4858]"><Star size={16} className="mt-0.5 shrink-0 text-[#1A73E8]" /><span><span className="font-semibold text-[#17202E]">{bt('stats.ai.onTime')}</span> {bt('stats.ai.ofCount', { done: activeDriver.on_time_closed_count, total: activeDriver.closed_tasks_count })}</span></p>
                          ) : null}
                        </div>
                      </div>
                    )
                  })() : <p className="mt-6 rounded-xl bg-[#F8FAFC] py-8 text-center text-[13px] text-[#7B8494]">{bt('stats.ai.noDrivers')}</p>}
                </div>

                <div className="min-w-0 rounded-xl border border-[#E6EAF1] bg-white p-5">
                  <div className="flex items-start gap-3">
                    <SectionIcon bg="#FCE8F1" color="#C2185B"><Activity size={20} /></SectionIcon>
                    <div className="min-w-0">
                      <h3 className="text-[17px] font-semibold text-[#17202E]">{bt('stats.ai.pulse')}</h3>
                      <p className="mt-0.5 text-[13px] text-[#586174]">{bt('stats.ai.pulseHint')}</p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {stats.users?.length ? stats.users.map((member) => {
                      const person = resolveUser(member.user_id, member.full_name)
                      return (
                        <div key={member.user_id} className="rounded-xl border border-[#E6EAF1] bg-[#FBFCFE] p-4">
                          <div className="flex flex-wrap items-center gap-3">
                            <GradientAvatar initials={person.initials} src={person.avatarUrl} size={44} seed={member.user_id} />
                            <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[#17202E]">{person.fullName}</p>
                            <div className="flex flex-wrap gap-1.5">
                              <span className="rounded-full px-2.5 py-1 text-[12px] font-medium" style={{ background: COLORS.doneSoft, color: COLORS.done }} title={bt('stats.done')}>{bt('stats.ai.doneShort', { count: member.closed_tasks_count })}</span>
                              <span className="rounded-full px-2.5 py-1 text-[12px] font-medium" style={{ background: COLORS.progressSoft, color: '#B06000' }} title={bt('status.IN_PROGRESS')}>{bt('stats.ai.progressShort', { count: member.in_progress_tasks_count })}</span>
                              <span className="rounded-full px-2.5 py-1 text-[12px] font-medium" style={{ background: COLORS.overdueSoft, color: COLORS.overdue }} title={bt('goals.overdue')}>{bt('stats.ai.overdueShort', { count: member.overdue_tasks_count })}</span>
                            </div>
                          </div>
                          {member.commentary ? (
                            <div className="mt-3 rounded-xl bg-[linear-gradient(135deg,#F3F1FE_0%,#F8F5FE_100%)] p-4">
                              <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-[#7C3AED]"><Sparkles size={14} />{bt('stats.ai.teamAiSummary')}</p>
                              <p className="text-[13px] leading-[21px] text-[#3C4858]">{member.commentary}</p>
                            </div>
                          ) : null}
                        </div>
                      )
                    }) : <p className="rounded-xl bg-[#F8FAFC] py-8 text-center text-[13px] text-[#7B8494]">{bt('stats.ai.noMembers')}</p>}
                  </div>
                </div>
              </div>
            </>
          ) : !error ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#DDE3EE] bg-white text-[13px] text-[#586174]">
              <TrendingUp size={28} className="text-[#9AA4B2]" />
              {bt('stats.ai.pickBoard')}
            </div>
          ) : null}
      </div>
    </section>
  )
}
