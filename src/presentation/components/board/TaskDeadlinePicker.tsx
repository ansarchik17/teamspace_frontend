import { bt } from './boardText'
import { useEffect, useRef, useState } from 'react'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import MiniCalendar, { buildMiniCalendarCells, toDayKey } from '../calendar/MiniCalendar'

type PickerPlacement = 'bottom' | 'top'

interface TaskDeadlinePickerProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placement?: PickerPlacement
  buttonClassName?: string
  formatLabel?: (date: Date) => string
  emptyLabel?: string
  showIcon?: boolean
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const pad = (value: number) => String(value).padStart(2, '0')

const dateFromValue = (value: string): Date | null => {
  if (!value) return null
  if (DATE_KEY_PATTERN.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day)
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const timeFromDate = (date: Date | null) => date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : '18:00'

const toIsoDeadline = (dateKey: string, time: string): string => {
  const [year, month, day] = dateKey.split('-').map(Number)
  const [hours, minutes] = time.split(':').map(Number)
  return new Date(year, month - 1, day, hours || 0, minutes || 0, 0, 0).toISOString()
}

export default function TaskDeadlinePicker({
  value,
  onChange,
  disabled = false,
  placement = 'bottom',
  buttonClassName = '',
  formatLabel,
  emptyLabel = bt('deadline.placeholder'),
  showIcon = true,
}: TaskDeadlinePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const valueDate = dateFromValue(value)
  const [open, setOpen] = useState(false)
  const [anchorDate, setAnchorDate] = useState(() => valueDate || new Date())
  const [draftDayKey, setDraftDayKey] = useState(() => valueDate ? toDayKey(valueDate) : toDayKey(new Date()))
  const [draftTime, setDraftTime] = useState(() => timeFromDate(valueDate))

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  const openPicker = () => {
    const nextDate = dateFromValue(value) || new Date()
    setAnchorDate(nextDate)
    setDraftDayKey(toDayKey(nextDate))
    setDraftTime(timeFromDate(dateFromValue(value)))
    setOpen(true)
  }

  const label = valueDate
    ? formatLabel ? formatLabel(valueDate) : `${valueDate.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' })}, ${timeFromDate(valueDate)}`
    : emptyLabel
  const popupPosition = placement === 'top' ? 'bottom-full mb-2' : 'top-[calc(100%+8px)]'

  const setQuickDeadline = (hoursFromNow: number) => {
    const next = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000)
    setAnchorDate(next)
    setDraftDayKey(toDayKey(next))
    setDraftTime(timeFromDate(next))
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => open ? setOpen(false) : openPicker()}
        className={`flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-[#D7E2F0] bg-white px-3 text-left text-sm font-semibold text-[#284F9E] outline-none transition hover:border-[#1765FF] focus-visible:ring-2 focus-visible:ring-[#1765FF]/20 disabled:cursor-default disabled:border-[#E2E8F0] disabled:bg-[#F8FAFC] disabled:text-[#64748B] ${buttonClassName}`}
      >
        <span className="truncate">{label}</span>
        {showIcon ? <MaterialSymbol name="event" size={17} color="currentColor" /> : null}
      </button>

      {open && !disabled ? (
        <div className={`absolute left-0 z-[1200] w-[320px] rounded-lg bg-white p-4 shadow-[0_1px_2px_rgba(60,64,67,0.3),0_2px_6px_2px_rgba(60,64,67,0.15)] ${popupPosition}`}>
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[#172B4D]">
            <MaterialSymbol name="schedule" size={18} color="#1765FF" />
            {bt('deadline.title')}
          </div>
          <MiniCalendar
            anchorDate={anchorDate}
            cells={buildMiniCalendarCells(anchorDate, draftDayKey)}
            onPrev={() => setAnchorDate((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))}
            onNext={() => setAnchorDate((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))}
            onSelect={(dateKey) => setDraftDayKey(dateKey)}
          />

          <div className="mt-3 grid grid-cols-[1fr_116px] gap-2">
            <label className="min-w-0">
              <span className="mb-1 block text-[11px] font-bold text-[#64748B]">{bt('filters.date')}</span>
              <input
                type="date"
                value={draftDayKey}
                onChange={(event) => {
                  setDraftDayKey(event.target.value)
                  if (event.target.value) {
                    const [year, month, day] = event.target.value.split('-').map(Number)
                    setAnchorDate(new Date(year, month - 1, day))
                  }
                }}
                className="h-10 w-full rounded-lg border border-[#D7E2F0] px-2 text-xs font-semibold text-[#172B4D] outline-none focus:border-[#1765FF]"
              />
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-bold text-[#64748B]">{bt('taskDetail.tabs.worklog')}</span>
              <input
                type="time"
                value={draftTime}
                onChange={(event) => setDraftTime(event.target.value)}
                className="h-10 w-full rounded-lg border border-[#D7E2F0] px-2 text-sm font-semibold text-[#172B4D] outline-none focus:border-[#1765FF]"
              />
            </label>
          </div>

          <div className="mt-3 flex gap-1.5">
            <button type="button" onClick={() => setQuickDeadline(1)} className="rounded-md bg-[#EEF4FF] px-2 py-1 text-[11px] font-bold text-[#1765FF] transition hover:bg-[#DFEAFF]">{bt('deadline.inHour')}</button>
            <button type="button" onClick={() => setQuickDeadline(24)} className="rounded-md bg-[#EEF4FF] px-2 py-1 text-[11px] font-bold text-[#1765FF] transition hover:bg-[#DFEAFF]">{bt('hub.tomorrow')}</button>
          </div>

          <div className="mt-4 flex gap-2 border-t border-[#EEF2F6] pt-3">
            {value ? (
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false) }}
                className="h-9 flex-1 rounded-lg border border-[#D7E2F0] bg-white px-2 text-xs font-semibold text-[#52647F] transition hover:bg-[#F7FAFF]"
              >
                {bt('filters.clear')}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => { onChange(toIsoDeadline(draftDayKey, draftTime)); setOpen(false) }}
              className="ts-button ts-button--primary ts-button--compact h-9 flex-1 rounded-lg bg-[#2458D3] px-2 text-xs font-semibold text-white transition hover:bg-[#1D49B3]"
            >
              {bt('save')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
