import { useMemo } from 'react'
import type { CalendarBusySlot } from '../../../domain/entities/CalendarEvent'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import { useTranslation } from 'react-i18next'
import { formatDate, getIntlLocale } from '../../../shared/i18n'

export interface CalendarFreeBusyRow {
  userId: number
  name: string
  slots: CalendarBusySlot[]
  unavailable?: boolean
  isCurrentUser?: boolean
}

export interface CalendarFreeBusyOverlap {
  userId: number
  name: string
  slot: CalendarBusySlot
}

interface CalendarFreeBusyProps {
  rows: CalendarFreeBusyRow[]
  dayStartMs: number
  proposedStartMs: number | null
  proposedEndMs: number | null
  loading: boolean
  error: string
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const MAX_ALERT_ITEMS = 3

const timeFormatter = { format: (date: Date) => new Intl.DateTimeFormat(getIntlLocale(), { hour: '2-digit', minute: '2-digit' }).format(date) }
const dateFormatter = { format: (date: Date) => formatDate(date, { day: 'numeric', month: 'long', weekday: 'short' }) }

const formatRange = (startMs: number, endMs: number): string =>
  `${timeFormatter.format(new Date(startMs))}–${timeFormatter.format(new Date(endMs))}`

export const findFreeBusyOverlaps = (
  rows: CalendarFreeBusyRow[],
  proposedStartMs: number | null,
  proposedEndMs: number | null,
): CalendarFreeBusyOverlap[] => {
  if (proposedStartMs === null || proposedEndMs === null || proposedEndMs <= proposedStartMs) return []
  return rows.flatMap((row) =>
    row.slots
      .filter((slot) => {
        const start = Date.parse(slot.startTime)
        const end = Date.parse(slot.endTime)
        return start < proposedEndMs && end > proposedStartMs
      })
      .map((slot) => ({ userId: row.userId, name: row.name, slot })),
  )
}

export default function CalendarFreeBusy({
  rows,
  dayStartMs,
  proposedStartMs,
  proposedEndMs,
  loading,
  error,
}: CalendarFreeBusyProps) {
  const { t } = useTranslation('calendar')
  const dayEndMs = dayStartMs + DAY_MS

  const { startHour, endHour } = useMemo(() => {
    let first = 8
    let last = 20
    const consider = (startMs: number, endMs: number) => {
      const clampedStart = Math.max(dayStartMs, Math.min(dayEndMs, startMs))
      const clampedEnd = Math.max(dayStartMs, Math.min(dayEndMs, endMs))
      first = Math.min(first, Math.floor((clampedStart - dayStartMs) / HOUR_MS))
      last = Math.max(last, Math.ceil((clampedEnd - dayStartMs) / HOUR_MS))
    }
    if (proposedStartMs !== null && proposedEndMs !== null) consider(proposedStartMs, proposedEndMs)
    rows.forEach((row) =>
      row.slots.forEach((slot) => consider(Date.parse(slot.startTime), Date.parse(slot.endTime))),
    )
    return { startHour: Math.max(0, first), endHour: Math.min(24, Math.max(last, first + 1)) }
  }, [dayEndMs, dayStartMs, proposedEndMs, proposedStartMs, rows])

  const windowStartMs = dayStartMs + startHour * HOUR_MS
  const windowEndMs = dayStartMs + endHour * HOUR_MS
  const windowMs = windowEndMs - windowStartMs
  const hourStep = endHour - startHour > 12 ? 3 : 2
  const hourMarks = Array.from(
    { length: Math.floor((endHour - startHour) / hourStep) + 1 },
    (_, index) => startHour + index * hourStep,
  ).filter((hour) => hour <= endHour)

  const toPercent = (ms: number): number =>
    Math.max(0, Math.min(100, ((ms - windowStartMs) / windowMs) * 100))

  const overlaps = useMemo(
    () => findFreeBusyOverlaps(rows, proposedStartMs, proposedEndMs),
    [proposedEndMs, proposedStartMs, rows],
  )
  const overlapUserCount = new Set(overlaps.map((item) => item.userId)).size
  const hasProposed = proposedStartMs !== null && proposedEndMs !== null && proposedEndMs > proposedStartMs
  const proposedLeft = hasProposed ? toPercent(proposedStartMs) : 0
  const proposedWidth = hasProposed ? Math.max(0.8, toPercent(proposedEndMs) - proposedLeft) : 0
  const unavailableCount = rows.filter((row) => row.unavailable).length

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-[#DCE5F2] bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-[#64748B]">{t('widgets.freeBusy.title')}</p>
          <p className="text-[11px] text-[#94A3B8]">{dateFormatter.format(new Date(dayStartMs))}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 text-[10px] font-semibold text-[#64748B]">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#94A3B8]" />
            {t('widgets.freeBusy.busy')}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#E5484D]" />
            {t('widgets.freeBusy.overlap')}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm border border-[#2458D3] bg-[#2458D3]/15" />
            {t('widgets.freeBusy.selected')}
          </span>
        </div>
      </div>

      {error ? (
        <p className="mt-2.5 rounded-lg border border-[#F0CFCF] bg-[#FFF6F6] px-2.5 py-2 text-[11px] font-semibold text-[#B63B3B]">
          {error}
        </p>
      ) : null}

      {!loading && !error && hasProposed && rows.length > 0 ? (
        overlaps.length ? (
          <div className="mt-2.5 rounded-lg border border-[#F5D0A9] bg-[#FFF7ED] px-2.5 py-2 text-[11px] text-[#9A3412]">
            <p className="flex items-center gap-1.5 font-bold">
              <MaterialSymbol name="warning" size={13} color="currentColor" />
              {t('widgets.freeBusy.overlapCount', { count: overlapUserCount })}
            </p>
            <ul className="mt-1 space-y-0.5">
              {overlaps.slice(0, MAX_ALERT_ITEMS).map((item) => (
                <li key={`${item.userId}-${item.slot.eventId}-${item.slot.startTime}`} className="break-words">
                  {item.name}: «{item.slot.title}»{' '}
                  {formatRange(Date.parse(item.slot.startTime), Date.parse(item.slot.endTime))}
                </li>
              ))}
              {overlaps.length > MAX_ALERT_ITEMS ? (
                <li className="font-semibold">{t('widgets.freeBusy.andMore', { count: overlaps.length - MAX_ALERT_ITEMS })}</li>
              ) : null}
            </ul>
          </div>
        ) : (
          <p className="mt-2.5 flex items-center gap-1.5 rounded-lg border border-[#CFEBDD] bg-[#EAF9F1] px-2.5 py-2 text-[11px] font-semibold text-[#1B7A43]">
            <MaterialSymbol name="check_circle" size={13} color="currentColor" />
            {unavailableCount
              ? t('widgets.freeBusy.noOverlapPartial')
              : t('widgets.freeBusy.allFree')}
          </p>
        )
      ) : null}

      <div className="mt-3 grid grid-cols-[88px_minmax(0,1fr)] gap-x-2">
        <div />
        <div className="relative h-4">
          {hourMarks.map((hour) => (
            <span
              key={hour}
              className="absolute -translate-x-1/2 text-[9px] font-semibold text-[#94A3B8] first:translate-x-0 last:-translate-x-full"
              style={{ left: `${toPercent(dayStartMs + hour * HOUR_MS)}%` }}
            >
              {String(hour % 24).padStart(2, '0')}:00
            </span>
          ))}
        </div>

        {loading && rows.length === 0
          ? Array.from({ length: 2 }).map((_, index) => (
              <div key={`skeleton-${index}`} className="contents">
                <div className="my-1 h-4 animate-pulse rounded bg-[#EEF2F6]" />
                <div className="my-1 h-6 animate-pulse rounded-md bg-[#F1F5F9]" />
              </div>
            ))
          : rows.map((row) => (
              <div key={row.userId} className="contents">
                <p
                  className={`my-1 truncate self-center text-[11px] font-semibold ${row.isCurrentUser ? 'text-[#2458D3]' : 'text-[#1E293B]'}`}
                  title={row.name}
                >
                  {row.name}
                </p>
                <div
                  className={`relative my-1 h-6 overflow-hidden rounded-md bg-[#F1F5F9] ${loading ? 'opacity-60' : ''}`}
                  title={row.unavailable ? t('widgets.freeBusy.unavailable') : undefined}
                >
                  {hourMarks.map((hour) => (
                    <span
                      key={hour}
                      className="absolute inset-y-0 w-px bg-white"
                      style={{ left: `${toPercent(dayStartMs + hour * HOUR_MS)}%` }}
                    />
                  ))}
                  {row.unavailable ? (
                    <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold text-[#94A3B8]">
                      {t('widgets.freeBusy.noData')}
                    </span>
                  ) : null}
                  {row.slots.map((slot) => {
                    const start = Date.parse(slot.startTime)
                    const end = Date.parse(slot.endTime)
                    if (end <= windowStartMs || start >= windowEndMs) return null
                    const left = toPercent(start)
                    const width = Math.max(0.8, toPercent(end) - left)
                    const isOverlap =
                      hasProposed && start < (proposedEndMs as number) && end > (proposedStartMs as number)
                    return (
                      <span
                        key={`${slot.eventId}-${slot.startTime}`}
                        className={`absolute inset-y-1 rounded ${isOverlap ? 'bg-[#E5484D]' : 'bg-[#94A3B8]'}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={`${slot.title} · ${formatRange(start, end)}`}
                      />
                    )
                  })}
                  {hasProposed ? (
                    <span
                      className="pointer-events-none absolute inset-y-0 rounded border-x-2 border-[#2458D3] bg-[#2458D3]/15"
                      style={{ left: `${proposedLeft}%`, width: `${proposedWidth}%` }}
                    />
                  ) : null}
                </div>
              </div>
            ))}
      </div>
    </div>
  )
}
