import { useTranslation } from 'react-i18next'
import type { CalendarEventViewModel } from '../../view-models/CalendarViewModel'

interface CalendarMonthGridProps {
  cells: Array<{
    dateKey: string
    dayNumber: number
    inCurrentMonth: boolean
    isToday: boolean
    isSelected: boolean
    events: CalendarEventViewModel[]
  }>
  onSelectDay: (dayKey: string) => void
  onOpenDay: (dayKey: string) => void
  onSelectEvent: (event: CalendarEventViewModel, x: number, y: number) => void
}

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

const formatEventTime = (event: CalendarEventViewModel, allDayLabel: string) => {
  if (event.isAllDay) return allDayLabel
  const [start] = event.timeLabel.split('-')
  return start.trim()
}

const getEventSurface = (color?: string) => {
  const accent = color || '#2E6BFF'
  return {
    borderColor: `${accent}26`,
    backgroundColor: `${accent}12`,
    color: accent,
  }
}

export default function CalendarMonthGrid({
  cells,
  onSelectDay,
  onOpenDay,
  onSelectEvent,
}: CalendarMonthGridProps) {
  const { t } = useTranslation('calendar')
  const weeksCount = Math.max(1, Math.ceil(cells.length / 7))
  const maxRowsPerCell = 3

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[22px] border border-[#E7ECF4] bg-white">
      <div className="grid shrink-0 grid-cols-7 border-b border-[#EAEFF6] bg-[#FCFDFF]">
        {WEEKDAY_KEYS.map((key) => t(`page.weekdays.${key}`)).map((day) => (
          <div
            key={day}
            className="border-r border-[#EEF2F7] px-3 py-2 text-center text-[11px] font-medium text-[#7B8798] last:border-r-0"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-7" style={{ gridTemplateRows: `repeat(${weeksCount}, minmax(0, 1fr))` }}>
        {cells.map((cell) => {
          const hiddenEventsCount = Math.max(0, cell.events.length - maxRowsPerCell)
          const visibleEvents = hiddenEventsCount > 0
            ? cell.events.slice(0, maxRowsPerCell - 1)
            : cell.events.slice(0, maxRowsPerCell)

          return (
            <button
              key={cell.dateKey}
              type="button"
              aria-label={t('widgets.pickDate', { date: cell.dateKey })}
              onClick={() => onSelectDay(cell.dateKey)}
              className={[
                'group flex min-h-[104px] min-w-0 appearance-none flex-col items-stretch justify-start overflow-hidden border-r border-t border-[#EEF2F7] px-1 py-1.5 text-left transition sm:min-h-[112px] sm:px-1.5 lg:min-h-[128px] lg:px-2 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9FC5F5] last:border-r-0',
                cell.isSelected ? 'bg-[#F7FAFF]' : 'bg-white hover:bg-[#FBFDFF]',
                cell.inCurrentMonth ? '' : 'bg-[#FBFCFE] text-[#A8B2C2]',
              ].join(' ')}
            >
              <div className="mb-0.5 flex items-center justify-between">
                <span
                  className={[
                    'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px] font-semibold leading-none',
                    cell.isToday ? 'bg-[#111111] text-white shadow-[0_8px_18px_rgba(15,23,42,0.22)]' : 'text-[#1B2B42]',
                    !cell.inCurrentMonth && !cell.isToday ? 'text-[#A8B2C2]' : '',
                  ].join(' ')}
                >
                  {cell.dayNumber}
                </span>
              </div>

              <div className="min-w-0 space-y-0.5 overflow-hidden">
                {visibleEvents.map((event) => {
                  const surface = getEventSurface(event.color)

                  return (
                    <div
                      key={event.id}
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation()
                        onSelectEvent(event, clickEvent.clientX, clickEvent.clientY)
                      }}
                      className="flex h-[22px] min-w-0 items-center gap-1 overflow-hidden rounded-[7px] border px-1 py-0.5 text-[9px] leading-none transition hover:brightness-[0.98] sm:px-1.5 md:text-[10px]"
                      style={surface}
                      title={`${event.title} · ${event.timeLabel}`}
                    >
                      <span
                        className="h-4 w-[3px] shrink-0 rounded-full"
                        style={{ backgroundColor: event.color || '#2E6BFF' }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate font-semibold">{event.title}</span>
                      <span className="hidden shrink-0 text-[8px] font-medium opacity-80 sm:inline md:text-[9px]">
                        {formatEventTime(event, t('page.allDay'))}
                      </span>
                    </div>
                  )
                })}

                {hiddenEventsCount > 0 ? (
                  <button
                    type="button"
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation()
                      onOpenDay(cell.dateKey)
                    }}
                    className="block h-4 pl-1 text-[9px] font-medium leading-4 text-[#5F7FB1] underline decoration-transparent underline-offset-2 transition hover:decoration-current md:text-[10px]"
                    title={t('widgets.openDayMore', { date: cell.dateKey, count: hiddenEventsCount })}
                  >
                    {t('widgets.moreCount', { count: hiddenEventsCount })}
                  </button>
                ) : null}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
