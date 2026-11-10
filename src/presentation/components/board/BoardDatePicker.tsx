import { formatDate } from '../../../shared/i18n'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import MiniCalendar, { buildMiniCalendarCells, toDayKey } from '../calendar/MiniCalendar'

interface BoardDatePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel?: string
  buttonClassName?: string
}

const parseDayKey = (value: string): Date | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

export default function BoardDatePicker({ value, onChange, placeholder, ariaLabel, buttonClassName = '' }: BoardDatePickerProps) {
  const { t } = useTranslation()
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = parseDayKey(value)
  const [open, setOpen] = useState(false)
  const [anchorDate, setAnchorDate] = useState(() => selected ?? new Date())
  const popupRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || popupRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const rect = rootRef.current?.getBoundingClientRect()
      const popup = popupRef.current
      if (!rect || !popup) return
      const gap = 4
      const margin = 8
      const width = popup.offsetWidth
      const height = popup.offsetHeight
      const viewportWidth = document.documentElement.clientWidth
      const viewportHeight = window.innerHeight
      const fitsBelow = rect.bottom + gap + height <= viewportHeight - margin
      const fitsAbove = rect.top - gap - height >= margin
      const top = fitsBelow || !fitsAbove ? Math.min(rect.bottom + gap, Math.max(margin, viewportHeight - margin - height)) : rect.top - gap - height
      const left = Math.min(Math.max(margin, rect.left), Math.max(margin, viewportWidth - margin - width))
      setPosition({ top, left })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  const label = selected
    ? formatDate(selected, { day: 'numeric', month: 'long', year: 'numeric' })
    : placeholder ?? t('date.any')

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open) {
            setAnchorDate(selected ?? new Date())
            setPosition(null)
          }
          setOpen((prev) => !prev)
        }}
        className={`flex h-10 w-full items-center justify-between gap-2 rounded-xl border bg-[#F9FBFE] px-3 text-left text-sm outline-none transition-all hover:border-[#C5D2E5] ${
          open ? 'border-[#2458D3] ring-2 ring-[#2458D3]/10' : 'border-[#DDE3EE]'
        } ${selected ? 'text-[#0A1628]' : 'text-[#8497B4]'} ${buttonClassName}`}
      >
        <span className="truncate">{label}</span>
        <span className="flex shrink-0 items-center gap-1">
          {selected ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(event) => { event.stopPropagation(); onChange('') }}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.stopPropagation(); onChange('') } }}
              className="flex h-5 w-5 items-center justify-center rounded-full text-[#8497B4] transition hover:bg-[#EEF2F7] hover:text-[#0A1628]"
              aria-label={t('date.reset')}
            >
              <X size={13} />
            </span>
          ) : null}
          <CalendarDays size={16} strokeWidth={1.75} className="text-[#64748B]" />
        </span>
      </button>

      {open ? createPortal(
        <div ref={popupRef} role="dialog" aria-label={ariaLabel} style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? 'visible' : 'hidden' }} className={`fixed z-[2100] w-[300px] max-w-[calc(100vw-32px)] rounded-lg bg-white p-3.5 shadow-[0_1px_2px_rgba(60,64,67,0.3),0_2px_6px_2px_rgba(60,64,67,0.15)]`}>
          <MiniCalendar
            anchorDate={anchorDate}
            cells={buildMiniCalendarCells(anchorDate, value)}
            onPrev={() => setAnchorDate((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))}
            onNext={() => setAnchorDate((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))}
            onSelect={(dateKey) => {
              onChange(dateKey)
              setOpen(false)
            }}
          />
          <div className="mt-3 flex items-center justify-between border-t border-[#E8EAED] pt-2.5">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false) }}
              className="rounded-md px-2 py-1 text-[13px] text-[#5F6368] transition hover:bg-[#F1F3F4]"
            >
              {t('date.clear')}
            </button>
            <button
              type="button"
              onClick={() => { onChange(toDayKey(new Date())); setOpen(false) }}
              className="rounded-md px-2 py-1 text-[13px] font-medium text-[#1A73E8] transition hover:bg-[#E8F0FE]"
            >
              {t('time.today')}
            </button>
          </div>
        </div>,
        document.body,
      )
      : null}
    </div>
  )
}
