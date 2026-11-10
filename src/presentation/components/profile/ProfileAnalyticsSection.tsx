import { useTranslation } from 'react-i18next'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import type { ProfileStatsViewModel } from '../../view-models/ProfileViewModel'

interface ProfileAnalyticsSectionProps {
  stats: ProfileStatsViewModel
}

const PERIOD_KEYS = ['day', 'week', 'month', 'current_day', 'current_week', 'current_month', 'quarter', 'year'] as const

type PeriodKey = (typeof PERIOD_KEYS)[number]

const isPeriodKey = (value: string): value is PeriodKey => (PERIOD_KEYS as readonly string[]).includes(value)

export default function ProfileAnalyticsSection({ stats }: ProfileAnalyticsSectionProps) {
  const { t } = useTranslation(['profile', 'common'])
  const periodLabel = isPeriodKey(stats.period) ? t(`periods.${stats.period}`) : stats.period
  const overall = Math.max(0, Math.min(5, stats.overallScore))
  const filledStars = Math.round(overall)

  return (
    <section className="rounded-[12px] border border-[#E2E5EA] bg-white p-6">
      <div className="-mx-6 mb-5 flex items-center gap-2 border-b border-[#E2E5EA] px-6 pb-4">
        <MaterialSymbol name="analytics" size={20} color="#2458D3" />
        <h3 className="text-[18px] font-semibold leading-[26px] text-[#17202E]">{t('feedback.title')}</h3>
        {periodLabel ? (
          <span className="ml-auto inline-flex h-6 items-center rounded-[6px] bg-[#F1F2F4] px-2 text-[12px] font-medium text-[#586174]">{periodLabel}</span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="flex flex-col items-start rounded-[8px] bg-[#F6F7F9] p-5 lg:self-start">
          <span className="text-[14px] leading-5 text-[#586174]">{t('feedback.averageScore')}</span>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-[40px] font-semibold leading-[48px] tabular-nums text-[#17202E]">{overall.toFixed(1)}</span>
            <span className="text-[16px] text-[#586174]">/ 5</span>
          </div>
          <div className="mt-2 flex items-center gap-1" aria-label={t('feedback.rating', { score: overall.toFixed(1) })}>
            {Array.from({ length: 5 }, (_, index) => (
              <MaterialSymbol
                key={index}
                name="star"
                size={18}
                color={index < filledStars ? '#2458D3' : '#C4C9D2'}
                className={index < filledStars ? 'fill-current' : undefined}
              />
            ))}
          </div>
          <span className="mt-3 text-[12px] leading-4 text-[#586174]">
            {t('feedback.basedOn', { count: stats.reviewCount })}
          </span>
        </div>

        <div className="min-w-0">
          <h4 className="mb-4 text-[16px] font-semibold leading-6 text-[#17202E]">{t('feedback.skillScores')}</h4>
          {stats.skills.length > 0 ? (
            <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
              {stats.skills.map((skill) => {
                const normalized = Math.max(0, Math.min(5, skill.score))
                return (
                  <div key={skill.key}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="truncate text-[14px] leading-5 text-[#17202E]">{t(`skills.${skill.key}`)}</p>
                      <p className="shrink-0 text-[14px] font-semibold tabular-nums text-[#17202E]">
                        {normalized.toFixed(1)}
                        <span className="font-normal text-[#586174]"> / 5</span>
                      </p>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#F1F2F4]" role="progressbar" aria-valuemin={0} aria-valuemax={5} aria-valuenow={normalized} aria-label={t(`skills.${skill.key}`)}>
                      <div className="h-full rounded-full bg-[#2458D3]" style={{ width: `${(normalized / 5) * 100}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="rounded-[8px] bg-[#F6F7F9] p-4 text-[14px] text-[#586174]">{t('feedback.noSkillScores')}</p>
          )}
        </div>
      </div>
    </section>
  )
}
