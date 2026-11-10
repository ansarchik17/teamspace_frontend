import { useTranslation } from 'react-i18next'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import type { CalendarAttendance, CalendarAttendanceSummary } from '../../../domain/entities/CalendarEvent'
import type { CalendarEventViewModel } from '../../view-models/CalendarViewModel'

export const eventHasPlace = (event: CalendarEventViewModel): boolean =>
  Boolean(event.room?.name || event.roomName || event.location.trim())

export const eventHasOnline = (event: CalendarEventViewModel): boolean =>
  Boolean(event.isOnline || event.joinUrl)

export function EventPlaceRow({ event }: { event: CalendarEventViewModel }) {
  const { t } = useTranslation('calendar')
  const roomName = event.room?.name || event.roomName
  const title = roomName || event.location.trim()
  if (!title) return null
  const details = roomName
    ? [
        event.room?.siteName,
        event.room?.floor != null ? t('event.floorValue', { floor: event.room.floor }) : '',
        event.room?.location,
        event.room?.address,
      ].filter(Boolean).join(', ')
    : ''
  return (
    <div className="flex items-start gap-3.5 text-[#5C728E]">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#EBF0F6] bg-white text-[#90A3BF] shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <MaterialSymbol name="location_on" size={16} color="currentColor" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#90A3BF]">{t('event.where')}</p>
        <p className="mt-0.5 break-words text-xs font-bold text-[#4A5E73]">{title}</p>
        {details ? <p className="mt-0.5 break-words text-xs text-[#6B7F97]">{details}</p> : null}
        {roomName && event.location.trim() && event.location.trim() !== roomName ? (
          <p className="mt-0.5 break-words text-xs text-[#6B7F97]">{event.location.trim()}</p>
        ) : null}
      </div>
    </div>
  )
}

export function AttendanceBadge({ attendance }: { attendance: CalendarAttendance | null }) {
  const { t } = useTranslation('calendar')
  if (!attendance) return null
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${attendance === 'online' ? 'bg-[#EEF2FF] text-[#2458D3]' : 'bg-[#ECFDF3] text-[#067647]'}`}>
      <MaterialSymbol name={attendance === 'online' ? 'videocam' : 'location_on'} size={11} color="currentColor" />
      {t(`event.attendance.${attendance}`)}
    </span>
  )
}

export function AttendanceSummaryLine({ summary }: { summary: CalendarAttendanceSummary }) {
  const { t } = useTranslation('calendar')
  return <p className="text-xs font-semibold text-[#5C728E]">{t("event.attendance.summary", { ...summary })}</p>
}

export function AttendanceChoice({
  value,
  disabled,
  allowOffline,
  allowOnline,
  onSelect,
}: {
  value: CalendarAttendance | null
  disabled?: boolean
  allowOffline: boolean
  allowOnline: boolean
  onSelect: (value: CalendarAttendance) => void
}) {
  const { t } = useTranslation('calendar')
  const options = ([
    ['offline', 'location_on', allowOffline],
    ['online', 'videocam', allowOnline],
  ] as const).filter(([, , allowed]) => allowed)
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-[#4A5E73]">{t('event.attendance.title')}</p>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('event.attendance.title')}>
        {options.map(([option, icon]) => {
          const selected = value === option
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onSelect(option)}
              className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${selected ? 'border-[#2458D3] bg-[#EEF2FF] text-[#2458D3]' : 'border-[#DCE5F2] bg-white text-[#4A5E73] hover:border-[#B8C7DE]'}`}
            >
              <MaterialSymbol name={icon} size={16} color="currentColor" />
              <span className="min-w-0">
                <span className="block text-xs font-bold">{t(`event.attendance.${option}`)}</span>
                <span className={`block text-[11px] ${selected ? 'text-[#4A6FD1]' : 'text-[#7B8EA9]'}`}>{t(`event.attendance.${option}Hint`)}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
