import { useEffect, useState } from 'react'
import type { HttpGrowyPlatformRepository } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { growyErrorMessage } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { ErrorNotice } from './growyUi'

interface Metric { value?: number; value_percent?: number; change_percent?: number | null; change_absolute?: number | null; period: string }
interface Summary { stats: Record<string, Metric>; period: { date_from: string; date_to: string } }
const metrics = [
  ['leads_total', 'Всего лидов'], ['conversion_to_client', 'Конверсия в клиента'],
  ['contacted_today', 'Связались сегодня'], ['new_leads', 'Новые лиды'],
] as const

export default function CrmLeadSummary({ repository, filters, search, revision }: { repository: HttpGrowyPlatformRepository; filters: Record<string, string>; search: string; revision: number }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState('')
  const filterKey = JSON.stringify(filters)
  useEffect(() => {
    const controller = new AbortController()
    const query = new URLSearchParams({ ...JSON.parse(filterKey), search })
    const timer = window.setTimeout(() => {
      setSummary(null); setError('')
      repository.request<Summary>(`crm/leads/summary/?${query}`, { signal: controller.signal }).then((result) => { if (!controller.signal.aborted) setSummary(result) })
        .catch((error) => { if (!controller.signal.aborted) setError(growyErrorMessage(error)) })
    }, 250)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [repository, filterKey, search, revision])
  return (
    <div className="space-y-2">
      {error && <ErrorNotice message={error} />}
      <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-[#E6EAF1] bg-white lg:grid-cols-4" aria-label="Статистика лидов">
        {metrics.map(([key, label], index) => {
          const metric = summary?.stats[key]
          const delta = metric?.change_percent ?? metric?.change_absolute
          const period = metric?.period === 'today' ? 'Сегодня' : summary
            ? `${new Date(`${summary.period.date_from.slice(0, 10)}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} — ${new Date(`${summary.period.date_to.slice(0, 10)}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`
            : 'Выбранный период'
          const borders = `${index % 2 ? 'border-l' : ''} ${index > 1 ? 'border-t lg:border-t-0' : ''} ${index === 2 ? 'lg:border-l' : ''}`
          return (
            <article key={key} className={`min-w-0 border-[#E6EAF1] px-5 py-3.5 ${borders}`}>
              <h2 className="truncate text-[13px] leading-5 text-[#586174]">{label}</h2>
              <div className="mt-1 flex items-baseline gap-2">
                <p className="text-[22px] font-semibold leading-7 tabular-nums text-[#17202E]">
                  {metric ? `${(metric.value_percent ?? metric.value ?? 0).toLocaleString('ru-RU')}${key === 'conversion_to_client' ? '%' : ''}` : <span className="inline-block h-5 w-12 animate-pulse rounded bg-[#EEF0F3] align-middle" />}
                </p>
                {delta != null && <span className={`rounded-full px-1.5 text-[12px] font-medium leading-5 tabular-nums ${delta < 0 ? 'bg-[#FDECEC] text-[#C03437]' : delta > 0 ? 'bg-[#E7F5EE] text-[#16734B]' : 'bg-[#F1F3F6] text-[#586174]'}`}>
                  {delta > 0 ? '+' : ''}{delta.toLocaleString('ru-RU')}{metric?.change_percent != null ? '%' : ''}
                </span>}
              </div>
              <p className="mt-0.5 truncate text-[12px] text-[#8A93A5]">{period}</p>
            </article>
          )
        })}
      </div>
    </div>
  )
}
