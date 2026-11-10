import { useTranslation } from 'react-i18next'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import type { ProfileStatsViewModel } from '../../view-models/ProfileViewModel'

interface ProfileStatsCardProps {
  stats: ProfileStatsViewModel
}

const PERIOD_KEYS = ['day', 'week', 'month', 'current_day', 'current_week', 'current_month', 'quarter', 'year'] as const

type PeriodKey = (typeof PERIOD_KEYS)[number]

const isPeriodKey = (value: string): value is PeriodKey => (PERIOD_KEYS as readonly string[]).includes(value)

export default function ProfileStatsCard({ stats }: ProfileStatsCardProps) {
  const { t } = useTranslation(['profile', 'common'])
  const periodLabel = isPeriodKey(stats.period) ? t(`periods.${stats.period}`) : stats.period

  return (
    <section className="rounded-2xl border border-[#DDE3EE] bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold tracking-tight text-[#0A1628]">{t('feedback.statsTitle')}</h3>
          <p className="mt-0.5 text-xs font-medium text-[#64748B]">{t('feedback.period')} <span className="text-[#2458D3] font-bold">{periodLabel}</span></p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#2458D3]">
          <MaterialSymbol name="leaderboard" size={20} color="currentColor" />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="group relative overflow-hidden rounded-xl bg-[#F8FBFF] p-5 ring-1 ring-[#EAEFF8]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#5B7396]">{t('feedback.totalReviews')}</p>
          <div className="mt-3 flex items-baseline gap-2">
            <p className="text-3xl font-bold tracking-tighter text-[#0A1628]">{stats.reviewCount}</p>
          </div>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#2458D3] opacity-10">
            <MaterialSymbol name="rate_review" size={48} color="currentColor" />
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-xl bg-[#F8FBFF] p-5 ring-1 ring-[#EAEFF8]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#5B7396]">{t('feedback.averageScore')}</p>
          <div className="mt-3 flex items-baseline gap-2">
            <p className="text-3xl font-bold tracking-tighter text-[#0A1628]">{stats.overallScore.toFixed(1)}</p>
            <span className="text-xs font-bold text-[#7B94B8]">/ 5.0</span>
          </div>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#2458D3] opacity-10">
            <MaterialSymbol name="star" size={48} color="currentColor" />
          </div>
        </div>
      </div>
    </section>
  )
}
