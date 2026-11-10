import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, RefreshCw } from 'lucide-react'
import type { HttpAdministrationRepository } from '../../../infrastructure/repositories/HttpAdministrationRepository'
import type { AIEmployeeQuota, AIUsersPage } from '../../../domain/entities/AdministrationAIBudget'
import { AdminPanel, AdminPagination, AdminRowAction } from './administrationUi'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import { credits } from './aiBudgetFormat'
import { Meter } from './aiBudgetUi'

export interface CompanyAIUsersTableProps {
  repo: HttpAdministrationRepository
  organizationId?: string
  canManageQuotas: boolean
  busy: boolean
  onEditQuota?: (employee: AIEmployeeQuota) => void
  refreshToken?: number
}

export type EmployeeAIStatusKey = 'blocked' | 'unconfigured' | 'disabled' | 'exhausted' | 'active'

export function getEmployeeAIStatus(employee: AIEmployeeQuota): EmployeeAIStatusKey {
  if (employee.is_blocked) {
    return 'blocked'
  }
  if (!employee.configured || employee.weekly_quota_microcredits === null) {
    return 'unconfigured'
  }
  if (employee.weekly_quota_microcredits === '0') {
    return 'disabled'
  }
  if (
    employee.weekly.state === 'exhausted' ||
    employee.weekly.available_microcredits === '0' ||
    employee.five_hour.state === 'exhausted' ||
    employee.five_hour.available_microcredits === '0'
  ) {
    return 'exhausted'
  }
  return 'active'
}

export function isEmployeeZeroUsage(employee: AIEmployeeQuota): boolean {
  return (
    employee.weekly.used_microcredits === '0' &&
    employee.weekly.reserved_microcredits === '0' &&
    employee.five_hour.used_microcredits === '0' &&
    employee.five_hour.reserved_microcredits === '0'
  )
}

export function CompanyAIUsersTable({
  repo,
  organizationId,
  canManageQuotas,
  busy,
  onEditQuota,
  refreshToken,
}: CompanyAIUsersTableProps) {
  const { t } = useTranslation('ai')

  const [pageData, setPageData] = useState<AIUsersPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [offset, setOffset] = useState(0)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const pageSize = 25

  const currentOrgRef = useRef(organizationId)
  currentOrgRef.current = organizationId

  const activeAbortRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    activeAbortRef.current?.abort()
    const abort = new AbortController()
    activeAbortRef.current = abort

    setLoading(true)
    setError(null)

    try {
      const result = await repo.aiUsers(
        organizationId,
        {
          q: query || undefined,
          limit: pageSize,
          offset,
        },
        abort.signal,
      )

      if (currentOrgRef.current === organizationId && !abort.signal.aborted) {
        setPageData(result)
      }
    } catch (err) {
      if (currentOrgRef.current === organizationId && !abort.signal.aborted) {
        setPageData(null)
        setError(err instanceof Error ? err.message : t('admin.errorLoadingUsers'))
      }
    } finally {
      if (currentOrgRef.current === organizationId && !abort.signal.aborted) {
        setLoading(false)
      }
    }
  }, [organizationId, query, offset, repo, t, refreshToken])

  // При смене организации: сброс параметров и изоляция состояния
  useEffect(() => {
    setOffset(0)
    setSearch('')
    setQuery('')
    setPageData(null)
  }, [organizationId])

  useEffect(() => {
    void load()
    return () => {
      activeAbortRef.current?.abort()
    }
  }, [load])

  useEffect(() => {
    const next = search.trim()
    if (next === query) return
    const timer = window.setTimeout(() => { setOffset(0); setQuery(next) }, 300)
    return () => window.clearTimeout(timer)
  }, [search, query])

  const items = pageData?.items ?? []
  const total = pageData?.total ?? 0
  const statusMeta: Record<EmployeeAIStatusKey, [string, string]> = {
    blocked: [t('admin.statusBlocked'), 'bg-[#FDECEC] text-[#C03437]'],
    unconfigured: [t('admin.statusUnconfigured'), 'bg-[#F1F3F6] text-[#586174]'],
    disabled: [t('admin.statusDisabled'), 'bg-[#F1F3F6] text-[#586174]'],
    exhausted: [t('admin.statusExhausted'), 'bg-[#FDF2E1] text-[#A85A00]'],
    active: [t('admin.statusActive'), 'bg-[#E7F5EE] text-[#16734B]'],
  }
  const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '?'
  const usageCell = (limit: string | null, window: AIEmployeeQuota['weekly'], effective?: string | null) => {
    if (limit === null) return <span className="text-[13px] text-[#8A93A5]">{t('admin.quotaUnconfigured')}</span>
    if (limit === '0') return <span className="text-[13px] text-[#8A93A5]">{t('admin.quotaZeroDisabled')}</span>
    const spent = (BigInt(window.used_microcredits) + BigInt(window.reserved_microcredits)).toString()
    return <div className="min-w-[150px]">
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="font-medium tabular-nums text-[#17202E]">{credits(window.used_microcredits)} <span className="font-normal text-[#586174]">/ {credits(limit)}</span></span>
        {effective && effective !== limit && <span className="text-[11px] text-[#586174]" title={t('admin.effectiveLimitHint', { limit: credits(effective) })}>≤ {credits(effective)}</span>}
      </div>
      <div className="mt-1.5"><Meter used={spent} total={limit} /></div>
      {window.available_microcredits !== null && <div className="mt-1 text-[12px] text-[#586174]">{t('admin.availableHint', { amount: credits(window.available_microcredits) })}</div>}
    </div>
  }

  return (
    <AdminPanel
      title={t('admin.employeeQuotasTitle')}
      action={
        <label className={`${AXIS_UI.inputShell} w-full sm:w-[280px]`}>
          <Search size={16} className="shrink-0 text-[#586174]" />
          <input data-ui="bare" type="search" className={AXIS_UI.input} aria-label={t('admin.employeeSearchPlaceholder')} placeholder={t('admin.employeeSearchPlaceholder')} maxLength={255} value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      }
    >
      {error && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="company-admin-form-error" role="alert">{error}</div>
          <button type="button" className={AXIS_UI.secondaryButton} disabled={busy} onClick={() => void load()}><RefreshCw size={15} />{t('admin.retry')}</button>
        </div>
      )}

      {!error && (
        <div className="company-admin-table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t('admin.colEmployee')}</th>
                <th>{t('admin.colWeeklyQuota')}</th>
                <th>{t('admin.colFiveHourLimit')}</th>
                <th>{t('admin.colStatus')}</th>
                <th>{t('admin.colAction')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && !pageData ? Array.from({ length: 3 }, (_, index) => <tr key={index} aria-hidden>{[40, 32, 32, 16, 20].map((width, cell) => <td key={cell}><span className="inline-block h-4 animate-pulse rounded bg-[#EEF0F3]" style={{ width: `${width * 4}px` }} /></td>)}</tr>)
                : items.map((employee) => {
                  const statusKey = getEmployeeAIStatus(employee)
                  const name = employee.full_name || employee.username
                  return (
                    <tr key={employee.user_id}>
                      <td>
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2458D3] text-[12px] font-semibold text-white">{initials(name)}</span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5"><span className="truncate font-semibold text-[#17202E]">{name}</span>{employee.is_director && <span className="shrink-0 rounded-[6px] bg-[#EDF2FF] px-1.5 py-0.5 text-[11px] font-medium text-[#2458D3]">{t('admin.directorRole')}</span>}</span>
                            <span className="block truncate text-[12px] text-[#586174]">{employee.email}</span>
                          </span>
                        </span>
                      </td>
                      <td>{usageCell(employee.weekly_quota_microcredits, employee.weekly)}</td>
                      <td>{usageCell(employee.five_hour_limit_microcredits, employee.five_hour, employee.effective_five_hour_microcredits)}</td>
                      <td><span className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-[6px] px-2 text-[12px] font-medium ${statusMeta[statusKey][1]}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{statusMeta[statusKey][0]}</span></td>
                      <td>
                        <AdminRowAction disabled={busy || !canManageQuotas} onClick={() => onEditQuota?.(employee)}>
                          {employee.configured ? t('admin.editUserQuota') : t('admin.configureUserQuota')}
                        </AdminRowAction>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && items.length === 0 && <p className="company-admin-empty">{t('admin.emptyUsers')}</p>}

      <AdminPagination offset={offset} total={total} size={pageSize} busy={busy || loading} change={setOffset} />
    </AdminPanel>
  )
}

export default CompanyAIUsersTable
