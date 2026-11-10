import { GROWY_COURSES_URL } from '../../../shared/config/growy'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'

import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import AppModal from '../../../shared/ui/AppModal'
import GradientAvatar from '../../../shared/ui/GradientAvatar'
import type { HomeDashboardViewModel } from '../../view-models/HomeDashboardViewModel'
import type { CalendarEventViewModel } from '../../view-models/CalendarViewModel'
import type { UnfinishedTrainingProgram } from '../../../infrastructure/repositories/HttpGrowyRepository'
import { getGrowyCourseUrl } from '../../../infrastructure/repositories/HttpGrowyRepository'
import type { EpsUnreadMailbox } from '../../../infrastructure/eps/epsMail'
import { openWorkspaceMail } from '../../../shared/config/mailConfig'

export interface WorkspaceGoalItem {
  id: string
  boardId: string
  title: string
  subtitle: string
  progress: number
  color: string
}

interface WorkspaceDashboardProps {
  hubData: HomeDashboardViewModel
  calendarEvents?: CalendarEventViewModel[]
  workspaceGoals?: WorkspaceGoalItem[]
  unfinishedTrainingPrograms?: UnfinishedTrainingProgram[]
  epsUnreadMailbox?: EpsUnreadMailbox | null
  userName?: string
  appsCount?: number
}

type ReminderItem = HomeDashboardViewModel['notifications'][number]

type CalendarWidgetEvent = {
  id: string
  title: string
  timeRange: string
  tag: string
  startTime?: string
  attendees: Array<{ id: number; fullName: string }>
}

const WEEK_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const MONTH_NAMES = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
]

const isSameDay = (left: Date, right: Date): boolean =>
  left.getDate() === right.getDate() &&
  left.getMonth() === right.getMonth() &&
  left.getFullYear() === right.getFullYear()

const getAttendeeInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

const isRealAttendeeName = (fullName: string): boolean =>
  Boolean(fullName.trim()) && !/^User \d+$/i.test(fullName.trim())




const formatReminderStartTime = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getReminderStartTime = (metadata?: Record<string, unknown>): string | null => {
  if (!metadata) return null
  return formatReminderStartTime(metadata.start_time ?? metadata.startTime)
}



const priorityTone = (priority: string) => {
  const value = priority.toLowerCase()
  if (value.includes('high') || value.includes('высок')) {
    return 'border-[#FECDD3] bg-[#FFF1F2] text-[#E11D48]'
  }
  if (value.includes('low') || value.includes('низк')) {
    return 'border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280]'
  }
  return 'border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280]'
}

const statusTone = (status: string) => {
  const value = status.toLowerCase()
  if (value.includes('работ') || value.includes('progress')) {
    return 'border-[#99F6E4] bg-[#F0FDFA] text-[#0D9488]'
  }
  if (value.includes('тест') || value.includes('test')) {
    return 'border-[#DDD6FE] bg-[#F5F3FF] text-[#7C3AED]'
  }
  if (value.includes('выполн') || value.includes('todo')) {
    return 'border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280]'
  }
  return 'border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280]'
}

const resolveTaskColumnKey = (task: HomeDashboardViewModel['tasks'][number]): string => {
  const raw = (task.columnKey || task.status || '').toUpperCase()
  if (raw === 'IN_PROGRESS' || raw.includes('PROGRESS') || task.status === 'В работе') return 'IN_PROGRESS'
  if (raw === 'TODO' || task.status === 'К выполнению') return 'TODO'
  if (raw === 'TEST' || task.status === 'Тестирование') return 'TEST'
  return raw
}

type TaskDeadlineState = 'overdue' | 'today' | 'upcoming' | 'none'

const getTaskDeadlineState = (
  task: HomeDashboardViewModel['tasks'][number],
  today: Date,
): TaskDeadlineState => {
  if (!task.dueAt) return 'none'

  const dueAt = new Date(task.dueAt)
  if (Number.isNaN(dueAt.getTime())) return 'none'

  const dueDay = new Date(dueAt.getFullYear(), dueAt.getMonth(), dueAt.getDate()).getTime()
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  if (dueDay < todayDay) return 'overdue'
  if (dueDay === todayDay) return 'today'
  return 'upcoming'
}

const formatTrainingDueDate = (value: string | null): string | null => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

const formatEmailReceivedLabel = (value: string): string => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return formatDistanceToNow(date, { addSuffix: true, locale: ru })
}

const isInProgressTraining = (status: string): boolean => status === 'in_progress'

const PanelShell = ({
  title,
  icon,
  children,
  action,
  className = '',
}: {
  title: string
  icon: string
  children: ReactNode
  action?: ReactNode
  className?: string
}) => (
  <article className={`rounded-[24px] border border-[#ECEEF3] bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)] flex flex-col ${className}`}>
    <div className="mb-4 flex items-center justify-between gap-3 shrink-0">
      <div className="flex items-center gap-2.5">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8FAFC] text-[#64748B]">
          <MaterialSymbol name={icon} size={18} color="currentColor" />
        </span>
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-[#111827]">{title}</h3>
      </div>
      {action}
    </div>
    <div className="flex-1 flex flex-col justify-between">
      {children}
    </div>
  </article>
)

export default function WorkspaceDashboard({
  hubData,
  calendarEvents = [],
  workspaceGoals = [],
  unfinishedTrainingPrograms = [],
  epsUnreadMailbox = null,
  userName = 'Пользователь',
  appsCount,
}: WorkspaceDashboardProps) {
  const navigate = useNavigate()
  const today = useMemo(() => new Date(), [])
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [now, setNow] = useState(() => new Date())
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    todo: true,
    test: true,
  })
  const [selectedReminder, setSelectedReminder] = useState<ReminderItem | null>(null)
  const [selectedEventIdForDetails, setSelectedEventIdForDetails] = useState<string | null>(null)
  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false)

  const reminders = hubData.notifications
    .filter((item) => item.type === 'calendar_reminder')
    .slice(0, 4)

  const detailsEvent = useMemo(() => {
    if (!selectedEventIdForDetails) return null
    const full = calendarEvents.find((e) => e.id === selectedEventIdForDetails)
    if (full) return full
    const brief = hubData.events.find((e) => e.id === selectedEventIdForDetails)
    if (brief) {
      return {
        id: brief.id,
        title: brief.title,
        timeLabel: `${brief.time} – ${brief.end}`,
        startTime: brief.startTime,
        endTime: brief.endTime,
        isOnline: brief.tag === 'Онлайн',
        location: brief.tag !== 'Онлайн' ? brief.tag : '',
        organizerName: userName,
        organizerUserId: null as number | null,
        reminderMinutes: 30,
        attendees: [{ id: 1, fullName: userName, email: '', status: 'accepted' as const }],
        isOrganizer: true,
      }
    }
    return null
  }, [selectedEventIdForDetails, calendarEvents, hubData.events, userName])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const firstName = userName.trim().split(/\s+/)[0] || 'Пользователь'

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('ru-RU', {
        month: 'long',
      }).format(selectedDate),
    [selectedDate],
  )

  const weekDays = useMemo(() => {
    const start = new Date(selectedDate)
    const offset = (start.getDay() + 6) % 7
    start.setDate(start.getDate() - offset)
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      return date
    })
  }, [selectedDate])

  const goalsPercentage = useMemo(() => {
    if (hubData._extra?.progress) {
      return Math.round(hubData._extra.progress.percentage)
    }
    if (workspaceGoals.length === 0) return 0
    const total = workspaceGoals.reduce((sum, g) => sum + g.progress, 0)
    return Math.round(total / workspaceGoals.length)
  }, [hubData._extra?.progress, workspaceGoals])

  const circumference = 2 * Math.PI * 18
  const strokeDashoffset = circumference - (goalsPercentage / 100) * circumference

  const dateLabelRu = useMemo(() => {
    return new Intl.DateTimeFormat('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(today).replace(/^./, (char) => char.toUpperCase())
  }, [today])

  const tasks = hubData.tasks
  const inProgressTasks = tasks.filter((task) => resolveTaskColumnKey(task) === 'IN_PROGRESS')
  const todoTasks = tasks.filter((task) => resolveTaskColumnKey(task) === 'TODO')
  const testTasks = tasks.filter((task) => resolveTaskColumnKey(task) === 'TEST')
  const overdueTasks = tasks.filter((task) => getTaskDeadlineState(task, today) === 'overdue')
  const todayTasks = tasks.filter((task) => getTaskDeadlineState(task, today) === 'today')

  const goals = workspaceGoals

  const selectedDateEvents = useMemo(() => {
    const allEvents: CalendarWidgetEvent[] =
      calendarEvents.length > 0
        ? calendarEvents.map((event) => ({
            id: event.id,
            title: event.title,
            timeRange: event.timeLabel,
            tag: event.isOnline ? 'Онлайн' : event.location || 'Оффлайн',
            startTime: event.startTime,
            attendees: event.attendees
              .filter((attendee) => isRealAttendeeName(attendee.fullName))
              .slice(0, 3)
              .map((attendee) => ({
                id: attendee.id,
                fullName: attendee.fullName,
              })),
          }))
        : hubData.events.map((event) => ({
            id: event.id,
            title: event.title,
            timeRange: `${event.time} – ${event.end}`,
            tag: event.tag || 'Оффлайн',
            startTime: event.startTime,
            attendees: [],
          }))

    return allEvents.filter((event) => {
      if (!event.startTime) return false
      const eventDate = new Date(event.startTime)
      return isSameDay(eventDate, selectedDate)
    })
  }, [calendarEvents, hubData.events, selectedDate])

  const nextMeetingTime = useMemo(() => {
    if (selectedDateEvents.length === 0) return 'Событий нет'
    
    const upcoming = selectedDateEvents.find(e => e.startTime && new Date(e.startTime) > now) || selectedDateEvents[0]
    if (!upcoming || !upcoming.startTime) return 'Событий нет'
    
    const time = new Date(upcoming.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    return `Следующая в ${time}`
  }, [selectedDateEvents, now])

  const featuredEvent = selectedDateEvents[0]

  const selectedDateEmptyLabel = isSameDay(selectedDate, today)
    ? 'На сегодня событий нет'
    : `${selectedDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} событий нет`

  const selectedReminderStartTime = selectedReminder
    ? getReminderStartTime(selectedReminder.metadata)
    : null
  const selectedReminderEventId = selectedReminder?.metadata?.event_id ?? selectedReminder?.metadata?.eventId

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }




  return (
    <section className="relative">
      <div className="pointer-events-none absolute -left-20 top-0 h-72 w-72 rounded-full bg-[#DBEAFE]/35 blur-[100px]" />
      <div className="pointer-events-none absolute -right-16 bottom-24 h-80 w-80 rounded-full bg-[#EEF2FF]/30 blur-[110px]" />

      {/* Greeting Header Card */}
      <div 
        className="relative mb-6 rounded-[24px] border border-[#ECEEF3] p-6 lg:p-8 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between"
        style={{
          background: 'linear-gradient(135deg, #F8FAFC 0%, #EEF2FF 100%)',
          boxShadow: '0 8px 30px rgba(15,23,42,0.03)',
        }}
      >
        <div className="min-w-0 flex-1 z-10">
          <div className="flex items-center gap-2 text-[#64748B] text-[13px] font-semibold">
            <MaterialSymbol name="calendar_today" size={15} color="currentColor" />
            <span>{dateLabelRu}</span>
          </div>
          <h1 className="mt-3 text-[28px] lg:text-[32px] font-bold tracking-[-0.02em] text-[#0A1628]">
            Добрый день, <span className="text-[#2458D3]">{firstName}</span>
          </h1>
          <p className="mt-2 text-[14px] lg:text-[15px] text-[#475569] leading-relaxed max-w-2xl font-medium">
            Планируйте уверенно. Действуйте эффективно.<br className="hidden sm:inline" /> Мы поможем вам достичь большего каждый день.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 z-10">
          <button
            type="button"
            onClick={() => navigate('/teamai')}
            className="ts-button ts-button--primary inline-flex h-11 items-center gap-2 rounded-full bg-[#2458D3] px-5 text-[13px] font-semibold text-white shadow-[0_10px_20px_rgba(47,75,226,0.2)] transition hover:brightness-105"
          >
            <MaterialSymbol name="auto_awesome" size={16} color="#fff" />
            Спросить AI
          </button>
          <button
            type="button"
            onClick={() => navigate('/board')}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-[#E2E8F0] bg-white px-5 text-[13px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]"
          >
            <MaterialSymbol name="notifications" size={16} color="currentColor" />
            Обновления задач
          </button>
          <button
            type="button"
            onClick={() => navigate('/notes')}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-[#E2E8F0] bg-white px-5 text-[13px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC]"
          >
            <MaterialSymbol name="edit" size={16} color="currentColor" />
            Создать заметку
          </button>
        </div>

        {/* Decorative waves SVG on the right */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-30 pointer-events-none hidden lg:block overflow-hidden rounded-r-[24px]">
          <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
            <path d="M50,0 Q70,40 100,50 T100,100" fill="none" stroke="#2458D3" strokeWidth="0.5" />
            <path d="M30,0 Q60,30 90,60 T100,100" fill="none" stroke="#2458D3" strokeWidth="0.25" />
          </svg>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        {/* Active Tasks Card */}
        <div className="bg-white border border-[#ECEEF3] rounded-[22px] p-5 flex items-center justify-between shadow-[0_8px_30px_rgba(15,23,42,0.03)]">
          <div>
            <div className="text-[28px] font-extrabold text-[#0A1628] leading-none">
              {hubData.stats[0]?.value ?? (inProgressTasks.length + todoTasks.length + testTasks.length)}
            </div>
            <div className="text-[13px] font-semibold text-[#64748B] mt-2">
              Активные задачи
            </div>
            {hubData.stats[0]?.delta !== undefined && hubData.stats[0].delta !== 0 ? (
              <div className={`text-[11px] font-bold mt-1.5 flex items-center gap-0.5 ${hubData.stats[0].delta > 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                <span>{hubData.stats[0].delta > 0 ? '▲' : '▼'}</span>
                <span>{Math.abs(hubData.stats[0].delta)}% {hubData.stats[0].deltaLabel || 'vs вчера'}</span>
              </div>
            ) : null}
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#EEF2FF] text-[#2458D3] flex items-center justify-center">
            <MaterialSymbol name="assignment" size={24} color="currentColor" />
          </div>
        </div>

        {/* Meetings Today Card */}
        <div className="bg-white border border-[#ECEEF3] rounded-[22px] p-5 flex items-center justify-between shadow-[0_8px_30px_rgba(15,23,42,0.03)]">
          <div>
            <div className="text-[28px] font-extrabold text-[#0A1628] leading-none">
              {hubData.stats[1]?.value ?? selectedDateEvents.length}
            </div>
            <div className="text-[13px] font-semibold text-[#64748B] mt-2">
              Встречи сегодня
            </div>
            <div className="text-[11px] font-bold text-[#64748B] mt-1.5">
              {nextMeetingTime}
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#ECFDF5] text-[#10B981] flex items-center justify-center">
            <MaterialSymbol name="calendar_month" size={24} color="currentColor" />
          </div>
        </div>

        {/* Apps in Work Card */}
        <div className="bg-white border border-[#ECEEF3] rounded-[22px] p-5 flex items-center justify-between shadow-[0_8px_30px_rgba(15,23,42,0.03)]">
          <div>
            <div className="text-[28px] font-extrabold text-[#0A1628] leading-none">
              {appsCount ?? 0}
            </div>
            <div className="text-[13px] font-semibold text-[#64748B] mt-2">
              Приложений в работе
            </div>
            <div className="text-[11px] font-bold text-[#64748B] mt-1.5">
              Закреплено на панели
            </div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#F5F3FF] text-[#8B5CF6] flex items-center justify-center">
            <MaterialSymbol name="grid_view" size={24} color="currentColor" />
          </div>
        </div>

        {/* Goals Progress Card */}
        <div className="bg-white border border-[#ECEEF3] rounded-[22px] p-5 flex items-center justify-between shadow-[0_8px_30px_rgba(15,23,42,0.03)]">
          <div>
            <div className="text-[13px] font-semibold text-[#64748B] mt-1">
              Выполнение целей
            </div>
            <div className="text-[11px] font-bold text-[#64748B] mt-2.5">
              {goals.length > 0 ? `Всего целей: ${goals.length}` : 'Целей не задано'}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="relative w-14 h-14 flex items-center justify-center">
              <svg className="w-14 h-14 transform -rotate-90">
                <circle cx="28" cy="28" r="18" className="stroke-[#F1F5F9]" strokeWidth="4" fill="transparent" />
                <circle cx="28" cy="28" r="18" className="stroke-[#2458D3]" strokeWidth="4" fill="transparent"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        strokeLinecap="round" />
              </svg>
              <span className="absolute text-[12px] font-bold text-[#0A1628]">{goalsPercentage}%</span>
            </div>
            <MaterialSymbol name="keyboard_arrow_down" size={18} color="#94A3B8" />
          </div>
        </div>
      </div>

      {unfinishedTrainingPrograms.length > 0 ? (
        <div className="relative mb-5">
          <PanelShell
          title="Продолжить обучение"
          icon="school"
          action={
            <a
              href={GROWY_COURSES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-[#E5E7EB] px-3 py-1.5 text-[12px] font-semibold text-[#64748B] transition hover:bg-[#F8FAFC]"
            >
              Все курсы
              <MaterialSymbol name="open_in_new" size={14} color="currentColor" />
            </a>
          }
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {unfinishedTrainingPrograms.slice(0, 4).map((program) => {
              const dueLabel = formatTrainingDueDate(program.dueDate)
              const continueLabel = isInProgressTraining(program.status) ? 'Продолжить' : 'Начать'

              return (
                <a
                  key={program.id}
                  href={getGrowyCourseUrl(program.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-4 rounded-[20px] border border-[#ECEEF3] bg-[#FCFCFD] px-4 py-4 transition hover:border-[#DBEAFE] hover:bg-[#F8FBFF]"
                >
                  {program.coverImageUrl ? (
                    <img
                      src={program.coverImageUrl}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-2xl object-cover"
                    />
                  ) : (
                    <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#EEF2FF] text-[#2458D3]">
                      <MaterialSymbol name="school" size={24} color="currentColor" />
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-[#111827]">{program.title}</p>
                    {program.category ? (
                      <p className="mt-0.5 truncate text-[12px] text-[#94A3B8]">{program.category}</p>
                    ) : null}
                    <div className="mt-3 flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#F1F5F9]">
                        <div
                          className="h-full rounded-full bg-[#2458D3]"
                          style={{ width: `${program.progress}%` }}
                        />
                      </div>
                      <span className="w-8 text-right text-[12px] font-semibold text-[#64748B]">
                        {program.progress}%
                      </span>
                    </div>
                    {dueLabel ? (
                      <p className="mt-2 text-[11px] font-medium text-[#94A3B8]">Дедлайн: {dueLabel}</p>
                    ) : null}
                  </div>

                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#EEF2FF] px-3 py-1.5 text-[12px] font-semibold text-[#2458D3] transition group-hover:bg-[#EEF2FF]">
                    {continueLabel}
                    <MaterialSymbol name="arrow_forward" size={14} color="currentColor" />
                  </span>
                </a>
              )
            })}
          </div>
        </PanelShell>
        </div>
      ) : null}

      <div className="relative grid grid-cols-1 gap-5 xl:grid-cols-2 items-stretch">
        <PanelShell
          title="Календарь"
          className="h-full"
            icon="calendar_month"
            action={
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMonthDropdownOpen((prev) => !prev)}
                  className="inline-flex items-center gap-1 rounded-full border border-[#E5E7EB] px-3 py-1.5 text-[12px] font-semibold capitalize text-[#64748B] hover:bg-[#F8FAFC] transition"
                >
                  {monthLabel}
                  <MaterialSymbol name="keyboard_arrow_down" size={16} color="currentColor" />
                </button>
                {monthDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMonthDropdownOpen(false)} />
                    <div className="absolute right-0 mt-1.5 z-20 w-40 rounded-2xl border border-[#E2E8F0] bg-white py-1.5 shadow-[0_4px_20px_rgba(15,23,42,0.06)] max-h-60 overflow-y-auto custom-scrollbar">
                      {MONTH_NAMES.map((name, index) => {
                        const isSelected = selectedDate.getMonth() === index
                        return (
                          <button
                            key={name}
                            type="button"
                            onClick={() => {
                              const newDate = new Date(selectedDate)
                              newDate.setMonth(index)
                              if (index === today.getMonth()) {
                                newDate.setDate(today.getDate())
                              } else {
                                newDate.setDate(1)
                              }
                              setSelectedDate(newDate)
                              setMonthDropdownOpen(false)
                            }}
                            className={[
                              'flex w-full items-center px-4 py-2 text-left text-[13px] font-medium transition',
                              isSelected
                                ? 'bg-[#F1F5F9] text-[#2458D3] font-semibold'
                                : 'text-[#475569] hover:bg-[#F8FAFC] hover:text-[#0F172A]',
                            ].join(' ')}
                          >
                            {name}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            }
          >
            <div className="mb-4 grid grid-cols-7 gap-2">
              {weekDays.map((date, index) => {
                const isToday = isSameDay(date, today)
                const isSelected = isSameDay(date, selectedDate)
                return (
                  <div key={date.toISOString()} className="text-center">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]">
                      {WEEK_DAYS[index]}
                    </p>
                    <button
                      type="button"
                      onClick={() => setSelectedDate(new Date(date))}
                      aria-label={date.toLocaleDateString('ru-RU', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                      aria-pressed={isSelected}
                      className={[
                        'mx-auto mt-2 flex h-10 w-10 items-center justify-center rounded-full text-[13px] font-semibold transition',
                        isSelected
                          ? 'bg-[#2458D3] text-white'
                          : isToday
                            ? 'text-[#2458D3] ring-1 ring-[#CBD5E1] hover:bg-[#F8FAFC]'
                            : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#111827]',
                      ].join(' ')}
                    >
                      {String(date.getDate()).padStart(2, '0')}
                    </button>
                  </div>
                )
              })}
            </div>

            {featuredEvent ? (
              <button
                type="button"
                onClick={() => setSelectedEventIdForDetails(featuredEvent.id)}
                className="flex w-full items-center justify-between gap-4 rounded-[22px] border border-[#ECEEF3] bg-[#FCFCFD] px-4 py-4 text-left transition hover:border-[#DBEAFE]"
              >
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-[#111827]">{featuredEvent.title}</p>
                  <p className="mt-1 text-[12px] text-[#94A3B8]">{featuredEvent.timeRange}</p>
                  <span className="mt-3 inline-flex rounded-full border border-[#E5E7EB] bg-white px-3 py-1 text-[12px] font-semibold text-[#64748B]">
                    {featuredEvent.tag || 'Видеовстреча'}
                  </span>
                </div>
                {featuredEvent.attendees.length > 0 ? (
                  <div className="flex -space-x-2">
                    {featuredEvent.attendees.map((attendee) => (
                      <GradientAvatar
                        key={attendee.id}
                        initials={getAttendeeInitials(attendee.fullName)}
                        size={36}
                        seed={attendee.id}
                        borderRadius="9999px"
                      />
                    ))}
                  </div>
                ) : null}
              </button>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-[22px] border border-dashed border-[#E5E7EB] px-4 py-8 text-center">
                <MaterialSymbol name="event_busy" size={24} color="#94A3B8" style={{ marginBottom: 8 }} />
                <p className="text-[13px] font-medium text-[#94A3B8]">
                  {selectedDateEmptyLabel}
                </p>
                <p className="text-[11px] text-[#CBD5E1] mt-1">Наслаждайтесь продуктивным днем!</p>
              </div>
            )}
          </PanelShell>

          <PanelShell
            title="Напоминания"
            className="h-full"
            icon="schedule"
            action={
              <button type="button" className="rounded-lg p-1.5 text-[#94A3B8] hover:bg-[#F8FAFC]">
                <MaterialSymbol name="more_horiz" size={18} color="currentColor" />
              </button>
            }
          >
            <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.08em] text-[#94A3B8]">Сегодня</p>
            <div className="space-y-4">
              {reminders.length > 0 ? (
                reminders.map((item) => {
                  const rawTime = item.metadata?.start_time ?? item.metadata?.startTime
                  const startClockTime = typeof rawTime === 'string' && rawTime.trim()
                    ? (() => {
                        const d = new Date(rawTime)
                        return Number.isNaN(d.getTime()) ? '15:00' : d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                      })()
                    : '15:00'
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedReminder(item)}
                      className="flex w-full items-start gap-3 rounded-2xl text-left transition hover:bg-[#F8FAFC] p-1.5"
                    >
                      <div className="px-2.5 py-1 rounded-xl bg-[#EEF2FF] text-[#2458D3] text-[12px] font-bold shrink-0">
                        {startClockTime}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold text-[#111827]">{item.title}</p>
                        <p className="mt-1 text-[12px] text-[#64748B] leading-relaxed line-clamp-2">
                          {item.content}
                        </p>
                      </div>
                    </button>
                  )
                })
              ) : (
                <p className="py-4 text-[13px] text-[#94A3B8]">Напоминаний пока нет</p>
              )}
            </div>
            
            <div className="mt-4 border-t border-[#F1F5F9] pt-3">
              <button 
                onClick={() => navigate('/notes')}
                className="text-[13px] font-semibold text-[#2458D3] hover:underline"
              >
                Посмотреть все напоминания &gt;
              </button>
            </div>
          </PanelShell>

          {epsUnreadMailbox ? (
            <div className="xl:col-span-2">
              <PanelShell
                title="Непрочитанные"
                className="h-full"
              icon="mail"
              action={
                <button
                  type="button"
                  onClick={openWorkspaceMail}
                  className="inline-flex items-center gap-1 rounded-full border border-[#E5E7EB] px-3 py-1.5 text-[12px] font-semibold text-[#64748B] transition hover:bg-[#F8FAFC]"
                >
                  Почта
                  {epsUnreadMailbox.unreadTotal > 0 ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2458D3] px-1.5 text-[10px] font-bold text-white">
                      {epsUnreadMailbox.unreadTotal > 99 ? '99+' : epsUnreadMailbox.unreadTotal}
                    </span>
                  ) : null}
                </button>
              }
            >
              <div className="space-y-1">
                {epsUnreadMailbox.emails.length > 0 ? (
                  epsUnreadMailbox.emails.map((email) => (
                    <button
                      key={email.id}
                      type="button"
                      onClick={openWorkspaceMail}
                      className="flex w-full items-start gap-3 rounded-2xl px-1 py-2.5 text-left transition hover:bg-[#F8FAFC]"
                    >
                      <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[#2458D3]">
                        <MaterialSymbol name="mail" size={16} color="currentColor" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-[14px] font-semibold text-[#111827]">{email.fromName}</p>
                          <span className="shrink-0 text-[11px] font-medium text-[#94A3B8]">
                            {formatEmailReceivedLabel(email.receivedAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[13px] font-medium text-[#374151]">{email.subject}</p>
                        {email.hasAttachment ? (
                          <p className="mt-1 text-[11px] font-medium text-[#94A3B8]">Есть вложение</p>
                        ) : null}
                      </div>
                    </button>
                  ))
                ) : (
                  <p className="py-4 text-[13px] text-[#94A3B8]">Непрочитанных писем нет</p>
                )}
              </div>
            </PanelShell>
          </div>
        ) : null}

        <PanelShell
          title="Мои задачи"
          className="h-full"
            icon="checklist"
            action={
              <div className="flex items-center gap-1 text-[#94A3B8]">
                <button type="button" onClick={() => navigate('/board')} className="rounded-lg p-1.5 hover:bg-[#F8FAFC]">
                  <MaterialSymbol name="add" size={18} color="currentColor" />
                </button>
                <button type="button" onClick={() => navigate('/board')} className="rounded-lg p-1.5 hover:bg-[#F8FAFC]">
                  <MaterialSymbol name="open_in_full" size={18} color="currentColor" />
                </button>
                <button type="button" className="rounded-lg p-1.5 hover:bg-[#F8FAFC]">
                  <MaterialSymbol name="more_horiz" size={18} color="currentColor" />
                </button>
              </div>
            }
          >
            {(overdueTasks.length > 0 || todayTasks.length > 0) ? (
              <div className="mb-4 grid grid-cols-2 gap-2" aria-label="Задачи по сроку">
                <button
                  type="button"
                  onClick={() => overdueTasks[0] && navigate(`/board?task=${overdueTasks[0].id}`)}
                  disabled={overdueTasks.length === 0}
                  className="rounded-2xl border border-[#FECACA] bg-[#FFF6F6] px-3 py-2.5 text-left transition hover:bg-[#FFF0F0] disabled:cursor-default disabled:opacity-60"
                >
                  <span className="block text-[11px] font-bold uppercase tracking-[0.06em] text-[#E11D48]">Просрочено</span>
                  <span className="mt-1 block text-[18px] font-bold leading-none text-[#9F1239]">{overdueTasks.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => todayTasks[0] && navigate(`/board?task=${todayTasks[0].id}`)}
                  disabled={todayTasks.length === 0}
                  className="rounded-2xl border border-[#BFDBFE] bg-[#F5F9FF] px-3 py-2.5 text-left transition hover:bg-[#EFF6FF] disabled:cursor-default disabled:opacity-60"
                >
                  <span className="block text-[11px] font-bold uppercase tracking-[0.06em] text-[#2563EB]">Сегодня</span>
                  <span className="mt-1 block text-[18px] font-bold leading-none text-[#1D4ED8]">{todayTasks.length}</span>
                </button>
              </div>
            ) : null}
            <div className="space-y-4">
              {/* Category: В работе */}
              <div>
                <button
                  type="button"
                  onClick={() => toggleSection('progress')}
                  className="flex w-full items-center justify-between py-1.5"
                >
                  <span className="rounded-full border border-[#99F6E4] bg-[#F0FDFA] px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#0D9488]">
                    В работе
                  </span>
                  <MaterialSymbol
                    name={collapsedSections.progress ? 'keyboard_arrow_down' : 'keyboard_arrow_up'}
                    size={20}
                    color="#94A3B8"
                  />
                </button>
                {!collapsedSections.progress && (
                  <div className="mt-2 space-y-1 pl-1">
                    {inProgressTasks.length > 0 ? (
                      inProgressTasks.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => navigate(`/board?task=${task.id}`)}
                          className="flex w-full items-start justify-between gap-4 py-3.5 border-b border-[#F1F5F9]/60 last:border-b-0 hover:bg-[#F8FAFC]/50 text-left transition duration-150"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-semibold text-[#111827] leading-snug truncate">
                              {task.title}
                            </p>
                            <div className="mt-2 flex items-center gap-2.5">
                              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${priorityTone(task.priority)}`}>
                                {task.priority !== '—' ? task.priority : 'Средний'}
                              </span>
                              <span className={[
                                'text-[12px]',
                                getTaskDeadlineState(task, today) === 'overdue'
                                  ? 'font-semibold text-[#E11D48]'
                                  : getTaskDeadlineState(task, today) === 'today'
                                    ? 'font-semibold text-[#2563EB]'
                                    : 'text-[#94A3B8]',
                              ].join(' ')}>{task.due || '—'}</span>
                            </div>
                          </div>
                          <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusTone(task.status)}`}>
                            {task.status}
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className="py-3 text-[13px] text-[#94A3B8]">Нет задач в работе</p>
                    )}
                  </div>
                )}
              </div>

              {/* Category: К выполнению */}
              <div className="border-t border-[#F1F5F9] pt-3">
                <button
                  type="button"
                  onClick={() => toggleSection('todo')}
                  className="flex w-full items-center justify-between py-1.5"
                >
                  <span className="rounded-full border border-[#E5E7EB] bg-[#F9FAFB] px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#6B7280]">
                    К выполнению
                  </span>
                  <MaterialSymbol
                    name={collapsedSections.todo ? 'keyboard_arrow_down' : 'keyboard_arrow_up'}
                    size={20}
                    color="#94A3B8"
                  />
                </button>
                {!collapsedSections.todo && (
                  <div className="mt-2 space-y-1 pl-1">
                    {todoTasks.length > 0 ? (
                      todoTasks.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => navigate(`/board?task=${task.id}`)}
                          className="flex w-full items-start justify-between gap-4 py-3.5 border-b border-[#F1F5F9]/60 last:border-b-0 hover:bg-[#F8FAFC]/50 text-left transition duration-150"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-semibold text-[#111827] leading-snug truncate">
                              {task.title}
                            </p>
                            <div className="mt-2 flex items-center gap-2.5">
                              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${priorityTone(task.priority)}`}>
                                {task.priority !== '—' ? task.priority : 'Средний'}
                              </span>
                              <span className={[
                                'text-[12px]',
                                getTaskDeadlineState(task, today) === 'overdue'
                                  ? 'font-semibold text-[#E11D48]'
                                  : getTaskDeadlineState(task, today) === 'today'
                                    ? 'font-semibold text-[#2563EB]'
                                    : 'text-[#94A3B8]',
                              ].join(' ')}>{task.due || '—'}</span>
                            </div>
                          </div>
                          <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusTone(task.status)}`}>
                            {task.status}
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className="py-3 text-[13px] text-[#94A3B8]">Нет задач к выполнению</p>
                    )}
                  </div>
                )}
              </div>

              {/* Category: Тестирование */}
              <div className="border-t border-[#F1F5F9] pt-3">
                <button
                  type="button"
                  onClick={() => toggleSection('test')}
                  className="flex w-full items-center justify-between py-1.5"
                >
                  <span className="rounded-full border border-[#DDD6FE] bg-[#F5F3FF] px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#7C3AED]">
                    Тестирование
                  </span>
                  <MaterialSymbol
                    name={collapsedSections.test ? 'keyboard_arrow_down' : 'keyboard_arrow_up'}
                    size={20}
                    color="#94A3B8"
                  />
                </button>
                {!collapsedSections.test && (
                  <div className="mt-2 space-y-1 pl-1">
                    {testTasks.length > 0 ? (
                      testTasks.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => navigate(`/board?task=${task.id}`)}
                          className="flex w-full items-start justify-between gap-4 py-3.5 border-b border-[#F1F5F9]/60 last:border-b-0 hover:bg-[#F8FAFC]/50 text-left transition duration-150"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-semibold text-[#111827] leading-snug truncate">
                              {task.title}
                            </p>
                            <div className="mt-2 flex items-center gap-2.5">
                              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${priorityTone(task.priority)}`}>
                                {task.priority !== '—' ? task.priority : 'Средний'}
                              </span>
                              <span className={[
                                'text-[12px]',
                                getTaskDeadlineState(task, today) === 'overdue'
                                  ? 'font-semibold text-[#E11D48]'
                                  : getTaskDeadlineState(task, today) === 'today'
                                    ? 'font-semibold text-[#2563EB]'
                                    : 'text-[#94A3B8]',
                              ].join(' ')}>{task.due || '—'}</span>
                            </div>
                          </div>
                          <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${statusTone(task.status)}`}>
                            {task.status}
                          </span>
                        </button>
                      ))
                    ) : (
                      <p className="py-3 text-[13px] text-[#94A3B8]">Нет задач на тестировании</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate('/board')}
              className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#2458D3] hover:underline"
            >
              <MaterialSymbol name="add" size={16} color="currentColor" />
              Добавить задачу
            </button>
          </PanelShell>

          <PanelShell
            title="Мои цели"
            className="h-full"
            icon="track_changes"
            action={
              <button type="button" className="rounded-lg p-1.5 text-[#94A3B8] hover:bg-[#F8FAFC]">
                <MaterialSymbol name="more_horiz" size={18} color="currentColor" />
              </button>
            }
          >
            <div className="space-y-4">
              {goals.length > 0 ? (
                goals.map((goal) => (
                  <div
                    key={goal.id}
                    onClick={() => navigate(`/board?boardId=${goal.boardId}`)}
                    className="flex w-full items-center justify-between py-1 cursor-pointer"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-[#111827]">{goal.title}</p>
                      <p className="mt-0.5 truncate text-[12px] text-[#94A3B8]">{goal.subtitle}</p>
                    </div>
                    <div className="flex w-[120px] items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#F1F5F9]">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${goal.progress}%`, backgroundColor: '#0D9488' }}
                        />
                      </div>
                      <span className="w-8 text-right text-[12px] font-semibold text-[#64748B]">{goal.progress}%</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-4 text-[13px] text-[#94A3B8]">Целей пока нет</p>
              )}
            </div>
            
            <div className="mt-4 border-t border-[#F1F5F9] pt-3">
              <button 
                onClick={() => navigate('/board')}
                className="text-[13px] font-semibold text-[#2458D3] hover:underline"
              >
                Перейти к целям &gt;
              </button>
            </div>
          </PanelShell>
      </div>

      {selectedReminder ? (
        <AppModal title={selectedReminder.title} onClose={() => setSelectedReminder(null)} maxWidth={560}>
          <div className="space-y-4">
            <p className="text-[14px] leading-6 text-[#334155]">{selectedReminder.content}</p>

            {selectedReminderStartTime ? (
              <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#94A3B8]">
                  Начало встречи
                </p>
                <p className="mt-1 text-[14px] font-semibold text-[#111827]">{selectedReminderStartTime}</p>
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              {typeof selectedReminderEventId === 'string' && selectedReminderEventId ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedReminder(null)
                    navigate(`/calendar?event=${selectedReminderEventId}`)
                  }}
                  className="ts-button ts-button--primary inline-flex h-10 items-center rounded-xl bg-[#2458D3] px-4 text-[13px] font-semibold text-white transition hover:brightness-105"
                >
                  Открыть в календаре
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setSelectedReminder(null)}
                className="inline-flex h-10 items-center rounded-xl border border-[#E2E8F0] bg-white px-4 text-[13px] font-semibold text-[#64748B] transition hover:bg-[#F8FAFC]"
              >
                Закрыть
              </button>
            </div>
          </div>
        </AppModal>
      ) : null}

      {detailsEvent ? (() => {
        const cleanOrganizerName = (() => {
          const orgName = detailsEvent.organizerName || ''
          if (/^(user \d+|пользователь #\d+)$/i.test(orgName.trim())) {
            return userName
          }
          return orgName
        })()

        const cleanAttendees = detailsEvent.attendees?.map((attendee) => {
          const isOrganizer = detailsEvent.organizerUserId === attendee.id || 
                              detailsEvent.isOrganizer || 
                              attendee.fullName.toLowerCase().includes('user 9') ||
                              attendee.fullName.toLowerCase().includes('пользователь #9')
          
          let name = attendee.fullName
          if (/^(user \d+|пользователь #\d+)$/i.test(name.trim())) {
            if (isOrganizer) {
              name = userName
            }
          }
          return {
            ...attendee,
            fullName: name,
            isOrganizer,
          }
        }) || []

        return (
          <div className="ts-legacy-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm">
            <div className="ts-legacy-dialog relative w-full max-w-[460px] rounded-[28px] bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.08)] mx-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#2458D3]" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                    Детали встречи
                  </span>
                </div>
                <div className="flex items-center gap-2.5 text-[#64748B]">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEventIdForDetails(null)
                      navigate(`/calendar?event=${detailsEvent.id}&edit=true`)
                    }}
                    className="rounded-lg p-1 hover:bg-[#F8FAFC] transition"
                    title="Редактировать"
                  >
                    <MaterialSymbol name="edit" size={20} color="currentColor" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEventIdForDetails(null)
                      navigate(`/calendar?event=${detailsEvent.id}`)
                    }}
                    className="rounded-lg p-1 hover:bg-[#F8FAFC] transition text-[#EF4444]"
                    title="Удалить"
                  >
                    <MaterialSymbol name="delete" size={20} color="currentColor" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedEventIdForDetails(null)}
                    className="rounded-lg p-1 hover:bg-[#F8FAFC] transition"
                    title="Закрыть"
                  >
                    <MaterialSymbol name="close" size={20} color="currentColor" />
                  </button>
                </div>
              </div>

              {/* Title & Time */}
              <div className="mt-5">
                <h2 className="text-[22px] font-extrabold text-[#0A1628] leading-tight break-words">
                  {detailsEvent.title}
                </h2>
                
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#EEF2FF] text-[#2458D3] text-[13px] font-bold mt-4">
                  <MaterialSymbol name="schedule" size={16} color="currentColor" />
                  <span>{detailsEvent.timeLabel}</span>
                </div>
              </div>

              {/* Info Box */}
              <div className="mt-5 p-4 rounded-2xl border border-[#F1F5F9] bg-[#F8FAFC] space-y-3">
                <div className="flex items-center gap-3 text-[13px] font-semibold text-[#475569]">
                  <MaterialSymbol name="notifications" size={18} color="#64748B" />
                  <span>За {detailsEvent.reminderMinutes || 30} минут</span>
                </div>
                <div className="flex items-center gap-3 text-[13px] font-semibold text-[#475569]">
                  <MaterialSymbol name="calendar_today" size={18} color="#64748B" />
                  <span>{cleanOrganizerName}</span>
                </div>
              </div>

              {/* Attendees Section */}
              <div className="mt-6">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
                  Участники ({cleanAttendees.length})
                </span>
                
                <div className="mt-3 space-y-3 max-h-[160px] overflow-y-auto custom-scrollbar">
                  {cleanAttendees.map((attendee) => {
                    const initials = getAttendeeInitials(attendee.fullName)
                    const isAccepted = attendee.status === 'accepted' || attendee.id === 1 // Default organizer accepted

                    return (
                      <div key={attendee.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2458D3] text-[12px] font-bold text-white uppercase">
                            {initials}
                          </span>
                          <span className="text-[14px] font-semibold text-[#0A1628]">
                            {attendee.fullName}
                          </span>
                          {attendee.isOrganizer && (
                            <span className="bg-[#F1F5F9] text-[#64748B] text-[10px] font-bold px-1.5 py-0.5 rounded">
                              ОРГ.
                            </span>
                          )}
                        </div>

                        {isAccepted ? (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-[#10B981] bg-[#ECFDF5] border border-[#A7F3D0] px-2.5 py-1 rounded-full">
                            <MaterialSymbol name="check" size={12} color="currentColor" />
                            Принял
                          </span>
                        ) : attendee.status === 'declined' ? (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-[#EF4444] bg-[#FEF2F2] border border-[#FCA5A5] px-2.5 py-1 rounded-full">
                            <MaterialSymbol name="close" size={12} color="currentColor" />
                            Отклонил
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-[#64748B] bg-[#F1F5F9] border border-[#E2E8F0] px-2.5 py-1 rounded-full">
                            Не ответил
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )
      })() : null}
    </section>
  )
}
