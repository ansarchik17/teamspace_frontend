import { useTranslation } from 'react-i18next'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import type { CalendarHostUserViewModel } from '../../view-models/CalendarViewModel'

interface CalendarHeaderProps {
  periodLabel: string
  host: CalendarHostUserViewModel | null
  isRefreshing: boolean
  onToday: () => void
  onPrevious: () => void
  onNext: () => void
  onRefresh: () => void
}

export default function CalendarHeader({
  periodLabel,
  host,
  onToday,
  onPrevious,
  onNext,
}: CalendarHeaderProps) {
  const { t } = useTranslation('calendar')
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3 md:mb-6">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#8497B4]">Workspace</p>
        <h1 className="mt-1 text-[28px] font-extrabold leading-none tracking-[-0.03em] text-[#0A1628]">Team Calendar</h1>
        <p className="mt-2 text-sm text-[#6B7280]">{periodLabel}</p>
        {host ? (
          <p className="mt-1 text-xs text-[#8497B4]">{t('widgets.organizerValue', { name: host.fullName || host.email })}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label={t('widgets.goToday')}
          onClick={onToday}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#DDE3EE] bg-white px-3 py-2 text-xs font-semibold text-[#374C6B] transition hover:bg-[#F9FAFB]"
        >
          <MaterialSymbol name="calendar_today" size={14} color="#8497B4" />
          {t('page.today')}
        </button>
        <button
          type="button"
          aria-label={t('page.nav.prevPeriod')}
          onClick={onPrevious}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#DDE3EE] bg-white text-[#4B5D79] transition hover:bg-[#F9FAFB]"
        >
          <MaterialSymbol name="chevron_right" size={14} color="#8497B4" style={{ transform: 'rotate(180deg)' }} />
        </button>
        <button
          type="button"
          aria-label={t('page.nav.nextPeriod')}
          onClick={onNext}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#DDE3EE] bg-white text-[#4B5D79] transition hover:bg-[#F9FAFB]"
        >
          <MaterialSymbol name="chevron_right" size={14} color="#8497B4" />
        </button>
      </div>
    </header>
  )
}
