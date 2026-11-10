import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { HttpGrowyPlatformRepository } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { growyErrorMessage } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { ErrorNotice } from './growyUi'

interface Totals { total: number; active: number; activeSum: number; currency: string; completed: number; cancelled: number }
const MAX_PAGES = 20

export default function CrmDealSummary({ repository, filters, search, revision }: { repository: HttpGrowyPlatformRepository; filters: Record<string, string>; search: string; revision: number }) {
  const { t } = useTranslation('shell')
  const [totals, setTotals] = useState<Totals | null>(null)
  const [error, setError] = useState('')
  const filterKey = JSON.stringify(filters)
  useEffect(() => {
    const controller = new AbortController()
    const base = JSON.parse(filterKey) as Record<string, string>
    const timer = window.setTimeout(() => {
      setError('')
      const count = (status?: string) => repository.list('deals', { search, filters: status ? { ...base, status } : base, signal: controller.signal }).then((page) => page.count)
      const activeSum = async () => {
        let sum = 0
        let currency = 'KZT'
        for (let page = 1; page <= MAX_PAGES; page += 1) {
          const result = await repository.list('deals', { search, page, filters: { ...base, status: 'active' }, signal: controller.signal })
          result.results.forEach((deal) => { sum += Number(deal.amount || 0); if (deal.currency) currency = deal.currency })
          if (!result.hasNext) break
        }
        return { sum, currency }
      }
      Promise.all([count(), count('active'), count('completed'), count('cancelled'), activeSum()]).then(([total, active, completed, cancelled, money]) => {
        if (!controller.signal.aborted) setTotals({ total, active, completed, cancelled, activeSum: money.sum, currency: money.currency })
      }).catch((reason) => { if (!controller.signal.aborted) setError(growyErrorMessage(reason)) })
    }, 250)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [repository, filterKey, search, revision])

  const cells: [string, string, string][] = totals ? [
    [t('crm.deals.total'), totals.total.toLocaleString('ru-RU'), t('crm.deals.allTime')],
    [t('crm.deals.activeSum'), `${totals.activeSum.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ${totals.currency === 'KZT' ? '₸' : totals.currency}`, t('crm.deals.inWork', { count: totals.active })],
    [t('crm.deals.completed'), totals.completed.toLocaleString('ru-RU'), t('crm.deals.allTime')],
    [t('crm.deals.cancelled'), totals.cancelled.toLocaleString('ru-RU'), t('crm.deals.allTime')],
  ] : [[t('crm.deals.total'), '', ''], [t('crm.deals.activeSum'), '', ''], [t('crm.deals.completed'), '', ''], [t('crm.deals.cancelled'), '', '']]

  return (
    <div className="space-y-2">
      {error && <ErrorNotice message={error} />}
      <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-[#E6EAF1] bg-white lg:grid-cols-4">
        {cells.map(([label, value, caption], index) => {
          const borders = `${index % 2 ? 'border-l' : ''} ${index > 1 ? 'border-t lg:border-t-0' : ''} ${index === 2 ? 'lg:border-l' : ''}`
          return (
            <article key={label} className={`min-w-0 border-[#E6EAF1] px-5 py-3.5 ${borders}`}>
              <h2 className="truncate text-[13px] leading-5 text-[#586174]">{label}</h2>
              <p className="mt-1 truncate text-[22px] font-semibold leading-7 tabular-nums text-[#17202E]">
                {value || <span className="inline-block h-5 w-16 animate-pulse rounded bg-[#EEF0F3] align-middle" />}
              </p>
              <p className="mt-0.5 truncate text-[12px] text-[#8A93A5]">{caption || ' '}</p>
            </article>
          )
        })}
      </div>
    </div>
  )
}
