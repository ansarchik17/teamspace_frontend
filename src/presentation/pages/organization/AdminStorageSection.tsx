import { useMemo, useState, type ReactNode } from 'react'
import { AlertCircle, Cloud, PieChart, Search, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AdministrationStorage, OffsetPage, StorageEmployee } from '../../../infrastructure/repositories/HttpAdministrationRepository'
import { adminText } from '../../../shared/i18n/adminText'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import { AdminPagination, AdminPanel, AdminRowAction } from './administrationUi'
import { storageSize } from './administrationHelpers'

interface AdminStorageSectionProps {
  storage: AdministrationStorage | null | undefined
  quotas: OffsetPage<StorageEmployee> | undefined
  offset: number
  busy: boolean
  loading: boolean
  canSetBudget: boolean
  canSetQuotas: boolean
  onOffset: (offset: number) => void
  onBudget: () => void
  onQuota: (employee: StorageEmployee) => void
}

const percent = (used: number, total: number | null | undefined) => (total ? Math.min(100, Math.round((used / total) * 100)) : 0)

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?'

function Meter({ value, danger }: { value: number; danger?: boolean }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#EEF1F5]">
      <div className={`h-full rounded-full ${danger ? 'bg-[#C03437]' : 'bg-[#2458D3]'}`} style={{ width: `${value}%` }} />
    </div>
  )
}

function StatCard({ icon, title, action, children }: { icon: ReactNode; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-[#E6EAF1] bg-white p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#EDF2FF] text-[#2458D3]">{icon}</span>
        <h3 className="min-w-0 flex-1 text-[15px] font-semibold leading-5 text-[#17202E]">{title}</h3>
        {action}
      </div>
      <div className="mt-4 flex min-w-0 flex-1 flex-col">{children}</div>
    </section>
  )
}

export default function AdminStorageSection({ storage, quotas, offset, busy, loading, canSetBudget, canSetQuotas, onOffset, onBudget, onQuota }: AdminStorageSectionProps) {
  useTranslation('administration')
  const [query, setQuery] = useState('')
  const items = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    const list = quotas?.items ?? []
    return needle ? list.filter((item) => item.full_name.toLocaleLowerCase().includes(needle)) : list
  }, [query, quotas])
  const budgetLabel = storage?.quota_bytes == null ? adminText('text152') : storageSize(storage.quota_bytes)

  return (
    <div className="@container flex flex-col gap-4">
      {storage ? (
        <div className="grid gap-4 @min-[560px]:grid-cols-2 @min-[560px]:[&>*:last-child]:col-span-2 @min-[900px]:grid-cols-3 @min-[900px]:[&>*:last-child]:col-span-1">
          <StatCard
            icon={<Cloud size={20} />}
            title={adminText('quotaStorageTitle')}
            action={canSetBudget ? <button type="button" disabled={busy} onClick={onBudget} className="h-8 shrink-0 rounded-[8px] px-2 text-[13px] font-medium text-[#1967D2] hover:bg-[#E8F0FE] disabled:opacity-50">{adminText('text153')}</button> : null}
          >
            <div className="grid grid-cols-2 divide-x divide-[#EEF0F3]">
              <div className="min-w-0 pr-4">
                <div className="text-[13px] text-[#586174]">{adminText('quotaUsed')}</div>
                <div className="mt-1 truncate text-[22px] font-semibold leading-7 text-[#17202E]">{storageSize(storage.used_bytes)}</div>
              </div>
              <div className="min-w-0 pl-4">
                <div className="text-[13px] text-[#586174]">{adminText('quotaBudget')}</div>
                <div className="mt-1 truncate text-[22px] font-semibold leading-7 text-[#17202E]">{budgetLabel}</div>
              </div>
            </div>
            <div className="mt-auto pt-4">
              <Meter value={percent(storage.used_bytes, storage.quota_bytes)} />
              <div className="mt-2 text-[12px] text-[#586174]">{storageSize(storage.used_bytes)} / {budgetLabel}</div>
            </div>
          </StatCard>

          <StatCard icon={<Users size={20} />} title={adminText('text158')}>
            <div className="text-[22px] font-semibold leading-7 text-[#17202E]">{storageSize(storage.allocated_bytes)}</div>
            <p className="mt-2 text-[13px] leading-5 text-[#586174]">{adminText('text160')}</p>
          </StatCard>

          <StatCard icon={<PieChart size={20} />} title={adminText('text159')}>
            <div className="text-[22px] font-semibold leading-7 text-[#17202E]">{storage.unallocated_bytes == null ? adminText('text052') : storageSize(storage.unallocated_bytes)}</div>
            {!canSetQuotas ? (
              <p className="mt-3 flex items-start gap-2 rounded-[8px] bg-[#FEF7E0] px-3 py-2 text-[13px] leading-5 text-[#B06000]">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                {adminText('text161')}
              </p>
            ) : null}
          </StatCard>
        </div>
      ) : null}

      <AdminPanel
        title={adminText('text162')}
        action={
          <label className={`${AXIS_UI.inputShell} w-full sm:w-[280px]`}>
            <Search size={16} className="shrink-0 text-[#586174]" />
            <input data-ui="bare" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={adminText('quotaSearch')} aria-label={adminText('quotaSearch')} className={AXIS_UI.input} />
          </label>
        }
      >
        <div className="company-admin-table-scroll">
          <table>
            <thead>
              <tr>
                <th>{adminText('text124')}</th>
                <th>{adminText('text163')}</th>
                <th>{adminText('text164')}</th>
                <th className="w-[28%]">{adminText('quotaUsage')}</th>
                <th>{adminText('text165')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((employee) => {
                const usage = percent(employee.used_bytes, employee.quota_bytes)
                const over = employee.used_bytes > employee.quota_bytes
                return (
                  <tr key={employee.user_id}>
                    <td>
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E8F0FE] text-[12px] font-semibold text-[#1967D2]">{initials(employee.full_name)}</span>
                        <strong className="truncate">{employee.full_name}</strong>
                      </div>
                    </td>
                    <td className="tabular-nums">{storageSize(employee.used_bytes)}</td>
                    <td className="tabular-nums">
                      {storageSize(employee.quota_bytes)}
                      {over ? <small className="!text-[#C03437]">{adminText('text166')}</small> : null}
                    </td>
                    <td>
                      <div className="flex items-center gap-3">
                        <Meter value={usage} danger={over} />
                        <span className="w-10 shrink-0 text-right text-[13px] tabular-nums text-[#586174]">{usage}%</span>
                      </div>
                    </td>
                    <td>
                      <AdminRowAction disabled={busy || !canSetQuotas} onClick={() => onQuota(employee)}>{adminText('quotaChange')}</AdminRowAction>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!items.length ? <p className="company-admin-empty">{query.trim() ? adminText('quotaNoMatches') : adminText('text053')}</p> : null}
        <AdminPagination offset={offset} total={quotas?.total ?? 0} busy={busy || loading} change={onOffset} />
      </AdminPanel>
    </div>
  )
}
