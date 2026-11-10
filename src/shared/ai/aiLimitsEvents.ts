import { UserAILimitsSyncCoordinator } from '../../infrastructure/services/UserAILimitsSyncCoordinator'

export const AI_LIMITS_INVALIDATED_EVENT = 'superapp:ai-limits-invalidated'

export interface AILimitsInvalidatedDetail {
  reason?: string
}

/**
 * Оповещает систему об успешном завершении платной ИИ-операции.
 * - Немедленно запрашивает актуальные лимиты;
 * - Планирует отложенный follow-up запрос (2.5 сек) для учёта фоновых вызовов (автозаголовок);
 * - Транслирует событие в другие открытые вкладки.
 */
export function notifyAIOperationCompleted(): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    UserAILimitsSyncCoordinator.getInstance().notifyAIOperationCompleted()
  } catch {
    /* ignore coordinator failure in SSR or non-standard environments */
  }
  window.dispatchEvent(
    new CustomEvent<AILimitsInvalidatedDetail>(AI_LIMITS_INVALIDATED_EVENT, {
      detail: { reason: 'ai_completed' },
    }),
  )
}

/**
 * Оповещает систему об инвалидации лимитов (например, после отказа по квоте или ручного сброса).
 */
export function dispatchAILimitsInvalidated(reason = 'limits_invalidated'): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    UserAILimitsSyncCoordinator.getInstance().notifyLimitsInvalidated(reason)
  } catch {
    /* ignore coordinator failure */
  }
  window.dispatchEvent(
    new CustomEvent<AILimitsInvalidatedDetail>(AI_LIMITS_INVALIDATED_EVENT, {
      detail: { reason },
    }),
  )
}
