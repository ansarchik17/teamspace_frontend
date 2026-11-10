import { useState, useRef, useEffect, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import type { HttpAdministrationRepository } from '../../../infrastructure/repositories/HttpAdministrationRepository'
import {
  isAIRevisionConflict,
  isAIBudgetConflict,
} from '../../../infrastructure/repositories/HttpAdministrationRepository'
import type { AIBudgetSummary, SetAIBudgetRequest } from '../../../domain/entities/AdministrationAIBudget'
import { formatMicrocredits } from '../../../domain/entities/UserAILimits'
import AppModal from '../../../shared/ui/AppModal'
import AppButton from '../../../shared/ui/AppButton'
import { microcreditsToCreditsInput } from './CompanyAIBudgetSection'
import { AICreditGuide } from './AICreditGuide'

export interface CompanyAIBudgetModalProps {
  organizationId: string
  budget: AIBudgetSummary
  repo: HttpAdministrationRepository
  isPlatformAdmin: boolean
  isOpen: boolean
  onClose: () => void
  onSuccess: (message: string) => void
  onRefreshBudget: () => Promise<AIBudgetSummary | null>
}

const MAX_AIBUDGET_MICROCREDITS = 1_000_000_000_000_000n

export function validateBudgetCreditField(
  raw: string,
): { valid: true; microcredits: string } | { valid: false; errorKey: string } {
  const trimmed = raw.trim().replace(',', '.')
  if (!trimmed) {
    return { valid: false, errorKey: 'admin.validationRequired' }
  }
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) {
    if (trimmed.startsWith('-')) {
      return { valid: false, errorKey: 'admin.validationNonNegative' }
    }
    return { valid: false, errorKey: 'admin.validationInvalidNumber' }
  }
  const [intPart, fracPart = ''] = trimmed.split('.')
  if (fracPart.length > 6) {
    return { valid: false, errorKey: 'admin.validationMaxDecimals' }
  }
  const paddedFrac = fracPart.padEnd(6, '0')
  const microcreditsBigInt = BigInt(intPart) * 1_000_000n + BigInt(paddedFrac)
  if (microcreditsBigInt > MAX_AIBUDGET_MICROCREDITS) {
    return { valid: false, errorKey: 'admin.validationMaxExceeded' }
  }
  return { valid: true, microcredits: microcreditsBigInt.toString() }
}

export function CompanyAIBudgetModal({
  organizationId,
  budget,
  repo,
  isPlatformAdmin,
  isOpen,
  onClose,
  onSuccess,
  onRefreshBudget,
}: CompanyAIBudgetModalProps) {
  const { t } = useTranslation('ai')

  const [weeklyBudget, setWeeklyBudget] = useState(() =>
    microcreditsToCreditsInput(budget.weekly_budget_microcredits ?? '1000000000'),
  )
  const [maxFiveHour, setMaxFiveHour] = useState(() =>
    microcreditsToCreditsInput(budget.max_five_hour_microcredits ?? '100000000'),
  )
  const [revision, setRevision] = useState(() => budget.revision.toString())

  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const [refreshing, setRefreshing] = useState(false)
  const refreshingRef = useRef(false)

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [revisionConflict, setRevisionConflict] = useState(false)

  const currentOrgRef = useRef(organizationId)
  currentOrgRef.current = organizationId

  // Синхронизация ревизии при смене budget извне
  useEffect(() => {
    setRevision(budget.revision.toString())
  }, [budget.revision])

  if (!isOpen || !isPlatformAdmin || !budget.capabilities.set_company_budget) {
    return null
  }

  const handleRefreshRevision = async () => {
    if (refreshingRef.current || submittingRef.current) return
    refreshingRef.current = true
    setRefreshing(true)
    setServerError(null)
    try {
      const fresh = await onRefreshBudget()
      if (currentOrgRef.current === organizationId && fresh) {
        setRevision(fresh.revision.toString())
        setRevisionConflict(false)
        setServerError(null)
      }
    } catch {
      if (currentOrgRef.current === organizationId) {
        setServerError(t('admin.error'))
      }
    } finally {
      refreshingRef.current = false
      setRefreshing(false)
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (submittingRef.current || refreshingRef.current) return

    setServerError(null)
    const errors: Record<string, string> = {}

    const weeklyVal = validateBudgetCreditField(weeklyBudget)
    if (!weeklyVal.valid) {
      errors.weekly_budget = t(weeklyVal.errorKey as any)
    }

    const maxFiveVal = validateBudgetCreditField(maxFiveHour)
    if (!maxFiveVal.valid) {
      errors.max_five_hour = t(maxFiveVal.errorKey as any)
    }

    // Доменные бизнес-проверки контракта перед отправкой
    if (weeklyVal.valid) {
      const weeklyBI = BigInt(weeklyVal.microcredits)
      if (weeklyBI > 0n) {
        const backgroundUsage = BigInt(budget.service.used_microcredits) + BigInt(budget.service.reserved_microcredits)
        const legacyAllocation = BigInt(budget.service_weekly_quota_microcredits)
        const oldBackgroundCommitment = legacyAllocation > backgroundUsage ? legacyAllocation : backgroundUsage
        const committedBI = BigInt(budget.committed_microcredits) - oldBackgroundCommitment + backgroundUsage
        if (weeklyBI < committedBI) {
          errors.weekly_budget = t('admin.conflictBudgetBelowCommitted', {
            committed: formatMicrocredits(budget.committed_microcredits),
          })
        }
        const usedBI = BigInt(budget.used_microcredits)
        if (weeklyBI < usedBI + BigInt(budget.reserved_microcredits)) {
          errors.weekly_budget = t('admin.conflictBudgetBelowUsed', {
            used: formatMicrocredits(budget.used_microcredits),
          })
        }
      }
    }

    if (!weeklyVal.valid || !maxFiveVal.valid || Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setFieldErrors({})
    submittingRef.current = true
    setSubmitting(true)

    try {
      const payload: SetAIBudgetRequest = {
        weekly_budget_microcredits: weeklyVal.microcredits,
        max_five_hour_microcredits: maxFiveVal.microcredits,
        service_weekly_quota_microcredits: '0',
        revision: revision,
      }

      await repo.setAiBudget(organizationId, payload)

      if (currentOrgRef.current === organizationId) {
        onSuccess(t('admin.formSuccess'))
        onClose()
      }
    } catch (cause) {
      if (currentOrgRef.current !== organizationId) {
        onClose()
        return
      }

      if (isAIRevisionConflict(cause)) {
        setRevisionConflict(true)
        setServerError(t('admin.conflictRevisionDescription'))
        // Введённые пользователем значения НЕ сбрасываются
        return
      }

      if (isAIBudgetConflict(cause)) {
        const details = cause.details
        if (details?.reason === 'INCREASE_WHILE_OVERCOMMITTED') {
          setServerError(t('admin.conflictIncreaseWhileOvercommitted'))
        } else if (details?.reason === 'BUDGET_BELOW_COMMITTED') {
          setServerError(
            t('admin.conflictBudgetBelowCommitted', {
              committed: formatMicrocredits(budget.committed_microcredits),
            }),
          )
        } else {
          setServerError(t('admin.conflictBudgetGeneral'))
        }
        return
      }

      setServerError(cause instanceof Error ? cause.message : t('admin.error'))
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const title = budget.configured ? t('admin.editBudget') : t('admin.configureBudget')

  return (
    <AppModal
      title={title}
      onClose={() => {
        if (!submitting) onClose()
      }}
      animated
      closeOnBackdrop={!submitting}
      maxWidth={620}
      footer={
        <>
          <AppButton variant="secondary" disabled={submitting || refreshing} onClick={onClose}>
            {t('admin.cancel')}
          </AppButton>
          <AppButton
            type="submit"
            form="company-ai-budget-form"
            variant="primary"
            isLoading={submitting}
            disabled={submitting || refreshing}
          >
            {submitting ? t('admin.saving') : t('admin.save')}
          </AppButton>
        </>
      }
    >
      <form id="company-ai-budget-form" className="company-admin-form" onSubmit={handleSubmit}>
        <p>{t('admin.formDescription')}</p>
        <AICreditGuide />

        {revisionConflict && (
          <div
            className="company-admin-warning"
            role="alert"
            style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={18} />
              <strong>{t('admin.conflictRevisionTitle')}</strong>
            </div>
            <div>{serverError}</div>
            <div>
              <AppButton
                type="button"
                variant="secondary"
                disabled={refreshing || submitting}
                isLoading={refreshing}
                onClick={handleRefreshRevision}
              >
                <RefreshCw size={14} style={{ marginRight: '6px' }} />
                {t('admin.conflictRevisionAction')}
              </AppButton>
            </div>
          </div>
        )}

        {!revisionConflict && serverError && (
          <div className="company-admin-form-error" role="alert">
            {serverError}
          </div>
        )}

        <label>
          <span>{t('admin.formWeeklyBudget')}</span>
          <input
            disabled={submitting || refreshing}
            type="text"
            inputMode="decimal"
            required
            maxLength={32}
            value={weeklyBudget}
            onChange={(e) => {
              setWeeklyBudget(e.target.value)
              if (fieldErrors.weekly_budget) {
                setFieldErrors((prev) => ({ ...prev, weekly_budget: '' }))
              }
            }}
          />
          <small>
            {t('admin.committed')}: {formatMicrocredits(budget.committed_microcredits)} {t('limits.creditsUnit')} ·{' '}
            {t('admin.used')}: {formatMicrocredits(budget.used_microcredits)} {t('limits.creditsUnit')}
          </small>
          {fieldErrors.weekly_budget && (
            <div className="company-admin-form-error" role="alert">
              {fieldErrors.weekly_budget}
            </div>
          )}
        </label>

        <label>
          <span>{t('admin.formMaxFiveHour')}</span>
          <input
            disabled={submitting || refreshing}
            type="text"
            inputMode="decimal"
            required
            maxLength={32}
            value={maxFiveHour}
            onChange={(e) => {
              setMaxFiveHour(e.target.value)
              if (fieldErrors.max_five_hour) {
                setFieldErrors((prev) => ({ ...prev, max_five_hour: '' }))
              }
            }}
          />
          <small>{t('admin.maxFiveHour')}</small>
          {fieldErrors.max_five_hour && (
            <div className="company-admin-form-error" role="alert">
              {fieldErrors.max_five_hour}
            </div>
          )}
        </label>

        <div style={{ color: 'var(--ts-text-secondary)', fontSize: '12px' }}>
          {t('admin.currentRevisionHint', { revision })}
        </div>
      </form>
    </AppModal>
  )
}

export default CompanyAIBudgetModal
