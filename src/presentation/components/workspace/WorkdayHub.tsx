import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import type { HomeDashboardViewModel } from '../../view-models/HomeDashboardViewModel'
import type { CalendarEventViewModel } from '../../view-models/CalendarViewModel'

const WEEK_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

type MeetingStatus = 'now' | 'active' | 'planned'

interface WorkdayHubProps {
  hubData: HomeDashboardViewModel
  calendarEvents?: CalendarEventViewModel[]
}

const getMeetingStatus = (startTime?: string, endTime?: string): MeetingStatus => {
  if (!startTime) {
    return 'planned'
  }

  const now = new Date()
  const start = new Date(startTime)
  const finish = endTime ? new Date(endTime) : null

  if (Number.isNaN(start.getTime())) {
    return 'planned'
  }

  if (start <= now && finish && !Number.isNaN(finish.getTime()) && finish >= now) {
    return 'now'
  }

  if (start > now) {
    return 'planned'
  }

  return 'active'
}

const meetingStatusLabel: Record<MeetingStatus, string> = {
  now: 'Сейчас',
  active: 'В работе',
  planned: 'Планируется',
}

const MINI_CALENDAR_MAX_DOTS = 3

const getMiniCalendarEventDots = (events: CalendarEventViewModel[]) =>
  events.slice(0, MINI_CALENDAR_MAX_DOTS).map((event, index) => ({
    key: `${event.id}-${index}`,
    color: event.color || '#2458D3',
  }))

const meetingStatusClass: Record<MeetingStatus, string> = {
  now: 'border-[#DBEAFE] bg-[#EEF2FF] text-[#2458D3]',
  active: 'border-[#DBEAFE] bg-[#EEF2FF] text-[#2458D3]',
  planned: 'border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280]',
}

const normalizeTaskStatus = (
  status: string,
): { label: string; className: string } => {
  const value = status.toLowerCase()

  if (value.includes('провер') || value.includes('review')) {
    return {
      label: 'На проверке',
      className: 'border-[#A7F3D0] bg-[#ECFDF5] text-[#059669]',
    }
  }

  if (value.includes('работ') || value.includes('progress') || value.includes('doing')) {
    return {
      label: 'В работе',
      className: 'border-[#DBEAFE] bg-[#EEF2FF] text-[#2458D3]',
    }
  }

  if (value.includes('выполн') || value.includes('todo') || value.includes('к выполнению')) {
    return {
      label: 'К выполнению',
      className: 'border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]',
    }
  }

  return {
    label: status,
    className: 'border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280]',
  }
}

const buildMonthGrid = (date: Date): Array<number | null> => {
  const year = date.getFullYear()
  const month = date.getMonth()
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startOffset = (firstDay.getDay() + 6) % 7

  const cells: Array<number | null> = []
  for (let i = 0; i < startOffset; i += 1) {
    cells.push(null)
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(day)
  }
  while (cells.length % 7 !== 0) {
    cells.push(null)
  }

  return cells
}

const QUICK_ACTIONS = [
  { icon: 'checklist', label: 'Создать задачу', route: '/board' },
  { icon: 'event', label: 'Запланировать встречу', route: '/calendar' },
  { icon: 'notes', label: 'Создать заметку', route: '/notes' },
  { icon: 'attach_file', label: 'Загрузить файл', route: '/drive' },
] as const

export default function WorkdayHub({ hubData, calendarEvents }: WorkdayHubProps) {
  const navigate = useNavigate()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const today = useMemo(() => new Date(), [])
  const currentDay = today.getDate()
  const monthGrid = useMemo(() => buildMonthGrid(today), [today])

  const getEventsForDay = (day: number | null): CalendarEventViewModel[] => {
    if (day === null || !calendarEvents) return []
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    const key = `${y}-${m}-${d}`
    return calendarEvents.filter((event) => event.dayKey === key)
  }

  const datePill = useMemo(
    () =>
      new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        weekday: 'long',
      }).format(today),
    [today],
  )

  const monthTitle = useMemo(
    () =>
      new Intl.DateTimeFormat('ru-RU', {
        month: 'long',
        year: 'numeric',
      }).format(today),
    [today],
  )

  const timeLabel = useMemo(
    () => now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    [now],
  )

  const todayMeetings = useMemo(() => {
    return hubData.events.filter((event) => {
      if (!event.startTime) return false
      const eventDate = new Date(event.startTime)
      return (
        eventDate.getDate() === today.getDate() &&
        eventDate.getMonth() === today.getMonth() &&
        eventDate.getFullYear() === today.getFullYear()
      )
    })
  }, [hubData.events, today])

  const meetings = useMemo(() => todayMeetings.slice(0, 3), [todayMeetings])
  const tasks = hubData.tasks.slice(0, 3)

  return (
    <section className="rounded-[20px] border border-[#E5E7EB] bg-[#FAFBFC] p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)] sm:p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="text-[18px] font-semibold tracking-[-0.02em] text-[#111827]">Рабочий день</h2>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-white px-3 py-1.5 text-[12px] font-medium text-[#4B5563]">
            <MaterialSymbol name="calendar_today" size={14} color="#6B7280" />
            {datePill}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-white px-3 py-1.5 text-[12px] font-medium text-[#4B5563]">
            <MaterialSymbol name="schedule" size={14} color="#6B7280" />
            {timeLabel}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
        <article className="flex flex-col rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-[13px] font-semibold text-[#111827]">Календарь</h3>
            <MaterialSymbol name="calendar_month" size={18} color="#9CA3AF" />
          </div>
          <p className="mb-3 text-center text-[13px] font-medium capitalize text-[#374151]">{monthTitle}</p>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium text-[#9CA3AF]">
            {WEEK_DAYS.map((day) => (
              <span key={day} className="py-1">
                {day}
              </span>
            ))}
          </div>
          <div className="mt-0.5 grid grid-cols-7 gap-0.5 text-center text-[12px]">
            {monthGrid.map((day, index) => {
              const dayEvents = getEventsForDay(day)
              const dots = getMiniCalendarEventDots(dayEvents)
              const isTodayDay = day === currentDay

              return (
                <span
                  key={`${day ?? 'empty'}-${index}`}
                  className={[
                    'inline-flex flex-col items-center justify-center rounded-lg font-medium aspect-square',
                    day === null ? 'opacity-0' : 'text-[#374151]',
                    isTodayDay ? 'bg-[#2458D3] text-white shadow-sm' : '',
                  ].join(' ')}
                >
                  {day !== null && (
                    <>
                      <span className="leading-none text-[12px]">{day}</span>
                      <span className="mt-1 flex min-h-[4px] items-center justify-center gap-[3px]">
                        {dots.map((dot) => (
                          <span
                            key={dot.key}
                            className="h-1 w-1 rounded-full"
                            style={{
                              backgroundColor: isTodayDay ? '#A5B7D6' : dot.color,
                            }}
                          />
                        ))}
                        {dayEvents.length > MINI_CALENDAR_MAX_DOTS && (
                          <span
                            className="h-1 w-1 rounded-full bg-[#9DB0C9]"
                          />
                        )}
                      </span>
                    </>
                  )}
                </span>
              )
            })}
          </div>
        </article>

        <article className="flex flex-col rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="truncate text-[13px] font-semibold text-[#111827]">Встречи на сегодня</h3>
              <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-[#EEF2FF] px-1.5 text-[11px] font-semibold text-[#2458D3]">
                {todayMeetings.length}
              </span>
            </div>
            <MaterialSymbol name="videocam" size={18} color="#9CA3AF" />
          </div>

          <div className="flex flex-1 flex-col gap-2">
            {meetings.length > 0 ? (
              meetings.map((event) => {
                const status = getMeetingStatus(event.startTime, event.endTime)
                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => navigate(`/calendar?event=${event.id}`)}
                    className="flex w-full items-start justify-between gap-2 rounded-xl border border-[#F3F4F6] bg-[#FAFBFC] px-3 py-2.5 text-left transition duration-200 hover:border-[#DBEAFE] hover:bg-[#EEF2FF] active:scale-[0.99]"
                  >
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-[#6B7280]">{event.time}</p>
                      <p className="mt-0.5 truncate text-[13px] font-medium text-[#111827]">{event.title}</p>
                    </div>
                    <span
                      className={[
                        'shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        meetingStatusClass[status],
                      ].join(' ')}
                    >
                      {meetingStatusLabel[status]}
                    </span>
                  </button>
                )
              })
            ) : (
              <p className="py-6 text-center text-[13px] text-[#6B7280]">На сегодня встреч нет</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => navigate('/calendar')}
            className="mt-3 inline-flex items-center gap-1 text-left text-[12px] font-medium text-[#2458D3] transition hover:text-[#1B2A8C]"
          >
            Смотреть все встречи
            <MaterialSymbol name="arrow_forward" size={14} color="currentColor" />
          </button>
        </article>

        <article className="flex flex-col rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="truncate text-[13px] font-semibold text-[#111827]">Мои задачи</h3>
              <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-[#EEF2FF] px-1.5 text-[11px] font-semibold text-[#2458D3]">
                {hubData.tasks.length}
              </span>
            </div>
            <MaterialSymbol name="checklist" size={18} color="#9CA3AF" />
          </div>

          <div className="flex flex-1 flex-col gap-2">
            {tasks.length > 0 ? (
              tasks.map((task) => {
                const status = normalizeTaskStatus(task.status)
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => navigate(`/board?task=${task.id}`)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-[#F3F4F6] bg-[#FAFBFC] px-3 py-2.5 text-left transition duration-200 hover:border-[#DBEAFE] hover:bg-[#EEF2FF] active:scale-[0.99]"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <MaterialSymbol name="check_circle_outline" size={16} color="#9CA3AF" />
                      <p className="truncate text-[13px] font-medium text-[#111827]">{task.title}</p>
                    </div>
                    <span
                      className={[
                        'shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        status.className,
                      ].join(' ')}
                    >
                      {status.label}
                    </span>
                  </button>
                )
              })
            ) : (
              <p className="py-6 text-center text-[13px] text-[#6B7280]">Активных задач нет</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => navigate('/board')}
            className="mt-3 inline-flex items-center gap-1 text-left text-[12px] font-medium text-[#2458D3] transition hover:text-[#1B2A8C]"
          >
            Открыть все задачи
            <MaterialSymbol name="arrow_forward" size={14} color="currentColor" />
          </button>
        </article>

        <article className="flex flex-col rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-[13px] font-semibold text-[#111827]">Быстрые действия</h3>
            <MaterialSymbol name="bolt" size={18} color="#9CA3AF" />
          </div>

          <ul className="flex flex-1 flex-col gap-1">
            {QUICK_ACTIONS.map((action) => (
              <li key={action.route}>
                <button
                  type="button"
                  onClick={() => navigate(action.route)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition hover:bg-[#F9FAFB]"
                >
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#E5E7EB] bg-[#FAFBFC] text-[#6B7280]">
                    <MaterialSymbol name={action.icon} size={17} color="currentColor" />
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] font-medium text-[#374151]">{action.label}</span>
                  <MaterialSymbol name="chevron_right" size={18} color="#9CA3AF" />
                </button>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  )
}
