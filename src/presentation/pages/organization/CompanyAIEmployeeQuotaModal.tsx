import { useState, useRef, useEffect, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import type { HttpAdministrationRepository } from '../../../infrastructure/repositories/HttpAdministrationRepository'
import {
  isAIRevisionConflict,
  isAIBudgetConflict,
} from '../../../infrastructure/repositories/HttpAdministrationRepository'
import type {
  AIEmployeeQuota,
  AIBudgetSummary,
  SetAIUserQuotaRequest,
} from '../../../domain/entities/AdministrationAIBudget'
import { formatMicrocredits } from '../../../domain/entities/UserAILimits'
import AppModal from '../../../shared/ui/AppModal'
import AppButton from '../../../shared/ui/AppButton'
import { microcreditsToCreditsInput } from './CompanyAIBudgetSection'
import { validateBudgetCreditField } from './CompanyAIBudgetModal'
import { AICreditGuide } from './AICreditGuide'

export interface CompanyAIEmployeeQuotaModalProps {
  organizationId?: string
  employee: AIEmployeeQuota
  budget: AIBudgetSummary
  repo: HttpAdministrationRepository
  isOpen: boolean
  canManageQuotas: boolean
  onClose: () => void
  onSuccess: (message: string) => void
  onRefreshData?: () => Promise<{ employee: AIEmployeeQuota; budget: AIBudgetSummary } | null>
}

export function CompanyAIEmployeeQuotaModal({
  organizationId,
  employee,
  budget,
  repo,
  isOpen,
  canManageQuotas,
  onClose,
  onSuccess,
  onRefreshData,
}: CompanyAIEmployeeQuotaModalProps) {
  const { t } = useTranslation('ai')

  const [weeklyQuota, setWeeklyQuota] = useState(() =>
    employee.weekly_quota_microcredits
      ? microcreditsToCreditsInput(employee.weekly_quota_microcredits)
      : '100000',
  )
  const [fiveHourLimit, setFiveHourLimit] = useState(() =>
    employee.five_hour_limit_microcredits
      ? microcreditsToCreditsInput(employee.five_hour_limit_microcredits)
      : '20000',
  )
  const [revision, setRevision] = useState(() => employee.revision.toString())
  const [companyRevision, setCompanyRevision] = useState(() => budget.revision.toString())

  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const [refreshing, setRefreshing] = useState(false)
  const refreshingRef = useRef(false)

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [revisionConflict, setRevisionConflict] = useState(false)

  const currentOrgRef = useRef(organizationId)
  currentOrgRef.current = organizationId
  const currentUserRef = useRef(employee.user_id)
  currentUserRef.current = employee.user_id

  // Синхронизация ревизий при смене пропсов
  useEffect(() => {
    setRevision(employee.revision.toString())
    setCompanyRevision(budget.revision.toString())
  }, [employee.revision, budget.revision])

  if (!isOpen || !canManageQuotas) {
    return null
  }

  const handleRefresh = async () => {
    if (refreshingRef.current || submittingRef.current) return
    refreshingRef.current = true
    setRefreshing(true)
    setServerError(null)
    try {
      const fresh = await onRefreshData?.()
      if (
        currentOrgRef.current === organizationId &&
        currentUserRef.current === employee.user_id &&
        fresh
      ) {
        setRevision(fresh.employee.revision.toString())
        setCompanyRevision(fresh.budget.revision.toString())
        setRevisionConflict(false)
        setServerError(null)
      }
    } catch {
      if (currentOrgRef.current === organizationId && currentUserRef.current === employee.user_id) {
        setServerError(t('admin.error'))
      }
    } finally {
      refreshingRef.current = false
      setRefreshing(false)
    }
  }

  // Проверка: снижается ли квота ниже уже потраченного сотрудником
  const weeklyVal = validateBudgetCreditField(weeklyQuota)
  const isDecreasingBelowUsed = Boolean(
    weeklyVal.valid &&
      BigInt(weeklyVal.microcredits) < BigInt(employee.weekly.used_microcredits),
  )

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (submittingRef.current || refreshingRef.current) return

    setServerError(null)
    const errors: Record<string, string> = {}

    const curWeeklyVal = validateBudgetCreditField(weeklyQuota)
    if (!curWeeklyVal.valid) {
      errors.weekly_quota = t(curWeeklyVal.errorKey as any)
    }

    const curFiveHourVal = validateBudgetCreditField(fiveHourLimit)
    if (!curFiveHourVal.valid) {
      errors.five_hour_limit = t(curFiveHourVal.errorKey as any)
    }

    if (curWeeklyVal.valid && curFiveHourVal.valid) {
      const weeklyBI = BigInt(curWeeklyVal.microcredits)
      const fiveHourBI = BigInt(curFiveHourVal.microcredits)

      // 5-часовой лимит не может превышать недельную квоту сотрудника (если пятичасовой > 0)
      if (fiveHourBI > weeklyBI) {
        errors.five_hour_limit = t('admin.validationUserFiveHourExceedsWeekly')
      }
    }

    if (!curWeeklyVal.valid || !curFiveHourVal.valid || Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setFieldErrors({})
    submittingRef.current = true
    setSubmitting(true)

    try {
      const payload: SetAIUserQuotaRequest = {
        weekly_quota_microcredits: curWeeklyVal.microcredits,
        five_hour_limit_microcredits: curFiveHourVal.microcredits,
        revision: revision,
        company_revision: companyRevision,
      }

      await repo.setAiUserQuota(organizationId, employee.user_id, payload)

      if (
        currentOrgRef.current === organizationId &&
        currentUserRef.current === employee.user_id
      ) {
        onSuccess(t('admin.quotaUpdateSuccess'))
        onClose()
      }
    } catch (cause) {
      if (
        currentOrgRef.current !== organizationId ||
        currentUserRef.current !== employee.user_id
      ) {
        onClose()
        return
      }

      if (isAIRevisionConflict(cause)) {
        setRevisionConflict(true)
        const scope = cause.details?.scope
        const message =
          scope === 'company'
            ? t('admin.conflictCompanyRevisionDescription')
            : t('admin.conflictUserRevisionDescription')
        setServerError(message)
        // Введённые пользователем значения НЕ сбрасываются
        return
      }

      if (isAIBudgetConflict(cause)) {
        const details = cause.details
        if (details?.reason === 'INCREASE_WHILE_OVERCOMMITTED') {
          setServerError(t('admin.conflictIncreaseWhileOvercommitted'))
        } else if (details?.reason === 'INSUFFICIENT_BUDGET') {
          setServerError(
            t('admin.conflictInsufficientBudget', {
              unallocated: formatMicrocredits(budget.unallocated_microcredits ?? '0'),
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

  const title = employee.configured
    ? t('admin.editQuotaModalTitle')
    : t('admin.configureQuotaModalTitle')

  return (
    <AppModal
      title={title}
      onClose={() => {
        if (!submitting) onClose()
      }}
      animated
      closeOnBackdrop={!submitting}
      maxWidth={600}
      footer={
        <>
          <AppButton variant="secondary" disabled={submitting || refreshing} onClick={onClose}>
            {t('admin.cancel')}
          </AppButton>
          <AppButton
            type="submit"
            form="company-ai-employee-quota-form"
            variant="primary"
            isLoading={submitting}
            disabled={submitting || refreshing}
          >
            {submitting ? t('admin.saving') : t('admin.save')}
          </AppButton>
        </>
      }
    >
      <form id="company-ai-employee-quota-form" className="company-admin-form" onSubmit={handleSubmit}>
        <div>
          <strong>{employee.full_name || employee.username}</strong>
          <small style={{ display: 'block', color: 'var(--ts-text-secondary)', marginTop: '2px' }}>
            {employee.email}
          </small>
        </div>

        {/* Сводка контекста сотрудника */}
        <div
          style={{
            background: 'var(--ts-bg, #F8FAFC)',
            padding: '12px',
            borderRadius: '8px',
            fontSize: '13px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div>
            {t('admin.userQuotaContextInfo', {
              quota: formatMicrocredits(employee.weekly_quota_microcredits),
              used: formatMicrocredits(employee.weekly.used_microcredits),
            })}
          </div>
          <div style={{ color: 'var(--ts-text-secondary)' }}>{t('creditGuide.personalAccess')}</div>
        </div>

        <AICreditGuide />

        {/* Предупреждение о снижении ниже использованного */}
        {isDecreasingBelowUsed && (
          <div
            className="company-admin-warning"
            role="alert"
            style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}
          >
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              {t('admin.quotaBelowUsedWarning', {
                used: formatMicrocredits(employee.weekly.used_microcredits),
              })}
            </div>
          </div>
        )}

        {/* Ошибка конфликта ревизии с кнопкой перечитывания */}
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
                onClick={handleRefresh}
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

        {/* Поле: Недельная квота */}
        <label>
          <span>{t('admin.userWeeklyQuotaLabel')}</span>
          <input
            disabled={submitting || refreshing}
            type="text"
            inputMode="decimal"
            required
            maxLength={32}
            value={weeklyQuota}
            onChange={(e) => {
              setWeeklyQuota(e.target.value)
              if (fieldErrors.weekly_quota) {
                setFieldErrors((prev) => ({ ...prev, weekly_quota: '' }))
              }
            }}
          />
          {fieldErrors.weekly_quota && (
            <div className="company-admin-form-error" role="alert">
              {fieldErrors.weekly_quota}
            </div>
          )}
        </label>

        {/* Поле: 5-часовой лимит */}
        <label>
          <span>{t('admin.userFiveHourLimitLabel')}</span>
          <input
            disabled={submitting || refreshing}
            type="text"
            inputMode="decimal"
            required
            maxLength={32}
            value={fiveHourLimit}
            onChange={(e) => {
              setFiveHourLimit(e.target.value)
              if (fieldErrors.five_hour_limit) {
                setFieldErrors((prev) => ({ ...prev, five_hour_limit: '' }))
              }
            }}
          />
          {fieldErrors.five_hour_limit && (
            <div className="company-admin-form-error" role="alert">
              {fieldErrors.five_hour_limit}
            </div>
          )}
        </label>
      </form>
    </AppModal>
  )
}

export default CompanyAIEmployeeQuotaModal
