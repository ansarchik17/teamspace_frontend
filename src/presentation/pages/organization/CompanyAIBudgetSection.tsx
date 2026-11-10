import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw, Check } from 'lucide-react'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import type { HttpAdministrationRepository } from '../../../infrastructure/repositories/HttpAdministrationRepository'
import type { AIBudgetSummary, AIEmployeeQuota } from '../../../domain/entities/AdministrationAIBudget'
import { formatMicrocredits } from '../../../domain/entities/UserAILimits'
import type { AdminForm } from './administrationUi'
import { CompanyAIUsersTable } from './CompanyAIUsersTable'
import { CompanyAIEmployeeQuotaModal } from './CompanyAIEmployeeQuotaModal'
import { AICreditGuide } from './AICreditGuide'

export interface CompanyAIBudgetSectionProps {
  repo: HttpAdministrationRepository
  organizationId?: string
  isPlatformAdmin: boolean
  busy: boolean
  openForm?: (form: AdminForm) => void
  onMutate?: (operation: () => Promise<void>) => Promise<boolean>
}

export function parseCreditsToMicrocredits(input: string, errorMessage?: string): string {
  const trimmed = input.trim().replace(',', '.')
  if (!trimmed || !/^\d+(?:\.\d+)?$/.test(trimmed)) {
    throw new Error(errorMessage || 'Invalid credit amount')
  }
  const [intPart, fracPart = ''] = trimmed.split('.')
  const paddedFrac = fracPart.padEnd(6, '0').slice(0, 6)
  const microcreditsBigInt = BigInt(intPart) * 1_000_000n + BigInt(paddedFrac)
  return microcreditsBigInt.toString()
}

export function microcreditsToCreditsInput(microcredits: string | null | undefined): string {
  if (!microcredits) return ''
  try {
    const b = BigInt(microcredits)
    const intPart = b / 1_000_000n
    const rem = b % 1_000_000n
    if (rem === 0n) return intPart.toString()
    const frac = rem.toString().padStart(6, '0').replace(/0+$/, '')
    return `${intPart}.${frac}`
  } catch {
    return ''
  }
}

export function AIBudgetMeter({
  label,
  usedMicrocredits,
  reservedMicrocredits,
  totalMicrocredits,
  availableMicrocredits,
  remainingPercent,
  icon,
}: {
  label: string
  usedMicrocredits: string
  reservedMicrocredits: string
  totalMicrocredits: string | null
  availableMicrocredits: string | null
  remainingPercent: number | null
  icon: ReactNode
}) {
  const { t } = useTranslation('ai')

  const totalBn = totalMicrocredits ? BigInt(totalMicrocredits) : 0n
  const usedBn = BigInt(usedMicrocredits)
  const reservedBn = BigInt(reservedMicrocredits)
  const spentBn = usedBn + reservedBn

  let fillPercent = 0
  if (totalBn > 0n) {
    const raw = Number((spentBn * 100n) / totalBn)
    fillPercent = Math.min(100, Math.max(0, raw))
  }

  return (
    <div className="company-admin-meter">
      <div className="company-admin-icon">{icon}</div>
      <div>
        <div className="company-admin-meter-label">
          <strong>{label}</strong>
          <span>
            {formatMicrocredits(usedMicrocredits)} / {totalMicrocredits == null ? '—' : formatMicrocredits(totalMicrocredits)} {t('limits.creditsUnit')}
          </span>
        </div>
        <div
          className="company-admin-meter-track"
          role="meter"
          aria-label={label}
          aria-valuenow={Number(usedBn / 1_000_000n)}
          aria-valuemin={0}
          aria-valuemax={Number(totalBn / 1_000_000n)}
        >
          <span style={{ width: totalBn > 0n ? `${fillPercent}%` : '0%' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '6px', color: 'var(--ts-text-secondary)' }}>
          <span>
            {t('admin.available')}: <strong>{formatMicrocredits(availableMicrocredits)}</strong> {t('limits.creditsUnit')}
            {remainingPercent !== null && ` (${remainingPercent}%)`}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function CompanyAIBudgetSection({
  repo,
  organizationId,
  busy,
  openForm: _openForm,
}: CompanyAIBudgetSectionProps) {
  const { t } = useTranslation('ai')

  const [budget, setBudget] = useState<AIBudgetSummary | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedEmployee, setSelectedEmployee] = useState<AIEmployeeQuota | null>(null)
  const [isQuotaModalOpen, setIsQuotaModalOpen] = useState(false)
  const [usersVersion, setUsersVersion] = useState(0)
  const [successNotice, setSuccessNotice] = useState<string | null>(null)
  const currentOrgRef = useRef(organizationId)
  const activeLoadRef = useRef<AbortController | null>(null)
  currentOrgRef.current = organizationId

  const handleRefreshQuotaData = async () => {
    if (!selectedEmployee) return null
    try {
      const [freshEmp, freshBudget] = await Promise.all([
        repo.aiUser(organizationId, selectedEmployee.user_id),
        repo.aiBudget(organizationId),
      ])
      if (currentOrgRef.current === organizationId) {
        setSelectedEmployee(freshEmp)
        setBudget(freshBudget)
      }
      return { employee: freshEmp, budget: freshBudget }
    } catch {
      return null
    }
  }

  const load = useCallback(async () => {
    activeLoadRef.current?.abort()
    const abort = new AbortController()
    activeLoadRef.current = abort
    setLoading(true)
    setError(null)
    try {
      const result = await repo.aiBudget(organizationId, abort.signal)
      if (currentOrgRef.current === organizationId && !abort.signal.aborted) {
        setBudget(result)
      }
    } catch (err) {
      if (currentOrgRef.current === organizationId && !abort.signal.aborted) {
        setBudget(null)
        setError(err instanceof Error ? err.message : t('admin.error'))
      }
    } finally {
      if (currentOrgRef.current === organizationId && !abort.signal.aborted) {
        setLoading(false)
      }
    }
  }, [organizationId, repo, t])

  useEffect(() => {
    void load()
    return () => {
      activeLoadRef.current?.abort()
    }
  }, [load])

  if (loading && !budget) {
    return (
      <div className="@container flex flex-col gap-4" role="status" aria-label={t('admin.loading')}>
        <div className="grid gap-4 @min-[900px]:grid-cols-3">
          {[0, 1, 2].map((index) => <div key={index} className="h-[188px] animate-pulse rounded-2xl border border-[#E6EAF1] bg-white" />)}
        </div>
        <div className="h-[220px] animate-pulse rounded-2xl border border-[#E6EAF1] bg-white" />
      </div>
    )
  }

  if (error || !budget) {
    return (
      <section className="rounded-2xl border border-[#E6EAF1] bg-white p-6">
        <h2 className="text-[16px] font-semibold text-[#17202E]">{t('admin.title')}</h2>
        <div className="company-admin-form-error mt-4" role="alert">{error || t('admin.error')}</div>
        <button type="button" className={`${AXIS_UI.secondaryButton} mt-4`} disabled={busy} onClick={() => void load()}>
          <RefreshCw size={15} />{t('admin.retry')}
        </button>
      </section>
    )
  }

  return (
    <div className="@container flex flex-col gap-4">
      <AICreditGuide />
      {successNotice && (
        <div className="company-admin-notice" role="status">
          <Check size={17} />
          {successNotice}
        </div>
      )}
      <p className="text-[13px] leading-5 text-[#586174]">{t('creditGuide.personalAccess')}</p>

      <CompanyAIUsersTable
        repo={repo}
        organizationId={organizationId}
        canManageQuotas={Boolean(budget.capabilities.set_user_quotas)}
        busy={busy}
        refreshToken={usersVersion}
        onEditQuota={(emp) => {
          setSelectedEmployee(emp)
          setIsQuotaModalOpen(true)
        }}
      />

      {isQuotaModalOpen && selectedEmployee && budget && (
        <CompanyAIEmployeeQuotaModal
          organizationId={organizationId}
          employee={selectedEmployee}
          budget={budget}
          repo={repo}
          isOpen={isQuotaModalOpen}
          canManageQuotas={Boolean(budget.capabilities.set_user_quotas)}
          onClose={() => {
            setIsQuotaModalOpen(false)
            setSelectedEmployee(null)
          }}
          onSuccess={(msg) => {
            setSuccessNotice(msg)
            setIsQuotaModalOpen(false)
            setSelectedEmployee(null)
            setUsersVersion((v) => v + 1)
            void load()
          }}
          onRefreshData={handleRefreshQuotaData}
        />
      )}
    </div>
  )
}

export { CompanyAIBudgetSection }
