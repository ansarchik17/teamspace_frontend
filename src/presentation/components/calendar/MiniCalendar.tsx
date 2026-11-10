import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../../../shared/i18n'

export type MiniCalendarCell = {
  dateKey: string
  dayNumber: number
  inCurrentMonth: boolean
  isSelected: boolean
  isToday?: boolean
  hasEvent?: boolean
  disabled?: boolean
}

interface Props {
  anchorDate: Date
  cells: MiniCalendarCell[]
  onPrev: () => void
  onNext: () => void
  onSelect: (dateKey: string) => void
  headerExtra?: ReactNode
  className?: string
}

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

export const toDayKey = (d: Date) =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')

export function buildMiniCalendarCells(anchorDate: Date, selectedDayKey: string, markedKeys?: Set<string>): MiniCalendarCell[] {
  const first = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1)
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - ((first.getDay() + 6) % 7))
  const todayKey = toDayKey(new Date())
  const all = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const dateKey = toDayKey(d)
    return {
      dateKey,
      dayNumber: d.getDate(),
      inCurrentMonth: d.getMonth() === first.getMonth(),
      isSelected: dateKey === selectedDayKey,
      isToday: dateKey === todayKey,
      hasEvent: markedKeys?.has(dateKey) ?? false,
    }
  })
  return all[35].inCurrentMonth ? all : all.slice(0, 35)
}

export default function MiniCalendar({ anchorDate, cells, onPrev, onNext, onSelect, headerExtra, className = '' }: Props) {
  const { t } = useTranslation('calendar')
  const title = formatDate(anchorDate, { month: 'long', year: 'numeric' })
  const navButton = 'flex h-8 w-8 items-center justify-center rounded-full bg-[#F5F7FB] text-[#1E2A4A] transition hover:bg-[#EAF0FA]'

  return (
    <div className={className}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-bold capitalize tracking-[-0.01em] text-[#111832]">{title}</h3>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onPrev} className={navButton} aria-label={t('widgets.prevMonth')}><ChevronLeft size={18} /></button>
          <button type="button" onClick={onNext} className={navButton} aria-label={t('widgets.nextMonth')}><ChevronRight size={18} /></button>
          {headerExtra}
        </div>
      </div>

      <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-semibold text-[#7383A3]">
        {WEEKDAY_KEYS.map((key) => <span key={key}>{t(`page.weekdays.${key}`)}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((cell) => {
          const tone = cell.isSelected
            ? 'bg-[#1765FF] text-white shadow-[0_4px_10px_rgba(23,101,255,.25)]'
            : cell.inCurrentMonth
              ? 'text-[#17213D] hover:bg-[#EFF4FF]'
              : 'text-[#B7C2D7] hover:bg-[#F5F7FB]'
          const today = cell.isToday && !cell.isSelected ? ' ring-2 ring-inset ring-[#1765FF]/35' : ''
          return (
            <button
              key={cell.dateKey}
              type="button"
              aria-pressed={cell.isSelected}
              aria-label={cell.dateKey}
              onClick={() => onSelect(cell.dateKey)}
              className={'relative mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition ' + tone + today}
            >
              {cell.dayNumber}
              {cell.hasEvent && <span className={'absolute bottom-[3px] h-1 w-1 rounded-full ' + (cell.isSelected ? 'bg-white' : 'bg-[#1765FF]')} aria-hidden="true" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}