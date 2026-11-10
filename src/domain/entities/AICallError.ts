import { HttpError } from '../../infrastructure/http/HttpError'

export type AICallErrorKind = 'pre_call_rejection' | 'unknown_outcome' | 'provider_error' | 'client_error'

export interface ParsedAICallError {
  kind: AICallErrorKind
  code?: string
  status?: number
  reason?: string
  scope?: string
  retryAt: string | null
  retryKind?: string
  serverTime?: string
  userMessage: string
  preservesDraft: boolean
  canAutoRetry: boolean
  rawError: unknown
}

export type TranslateFn = (key: any, options?: any) => string

function extractDetails(details: unknown): {
  reason?: string
  scope?: string
  retryAt: string | null
  retryKind?: string
  serverTime?: string
} {
  if (!details || typeof details !== 'object') {
    return { retryAt: null }
  }

  const d = details as Record<string, unknown>
  let reason = typeof d.reason === 'string' ? d.reason : undefined
  let scope = typeof d.scope === 'string' ? d.scope : undefined
  let retryAt = typeof d.retry_at === 'string' ? d.retry_at : null
  const retryKind = typeof d.retry_kind === 'string' ? d.retry_kind : undefined
  const serverTime = typeof d.server_time === 'string' ? d.server_time : undefined

  if (Array.isArray(d.blockers) && d.blockers.length > 0) {
    const firstBlocker = d.blockers[0] as Record<string, unknown>
    if (typeof firstBlocker.reason === 'string' && !reason) {
      reason = firstBlocker.reason
    }
    if (typeof firstBlocker.scope === 'string' && !scope) {
      scope = firstBlocker.scope
    }
    if (typeof firstBlocker.resets_at === 'string' && !('retry_at' in d) && retryKind === 'estimated') {
      retryAt = firstBlocker.resets_at
    }
  }

  return { reason, scope, retryAt, retryKind, serverTime }
}

/**
 * Classifies an AI error into:
 * - 'pre_call_rejection': rejected before model execution (budget/quota/rate/concurrency/access).
 *                         Preserves user draft (text, model, attachments). Never auto-retries.
 * - 'unknown_outcome': timeout or connection drop while request in flight.
 *                      Outcome unconfirmed; never auto-retries paid generation.
 * - 'provider_error': 502/503 upstream provider failure.
 * - 'client_error': client-side validation / authorization issue.
 */
export function classifyAICallError(error: unknown, t?: TranslateFn): ParsedAICallError {
  const isHttp = error instanceof HttpError
  const status = isHttp ? error.status : undefined
  const code = isHttp ? error.code : undefined
  const rawMessage = isHttp ? error.message : error instanceof Error ? error.message : String(error)
  const details = isHttp ? extractDetails(error.details) : { retryAt: null }

  const translate = (key: string, fallback: string, options?: Record<string, unknown>): string => {
    if (!t) return fallback
    const res = t(key, options)
    return res && res !== key ? res : fallback
  }

  // 1. Client-side errors (no network request / client validation)
  if (!isHttp) {
    const isAbort = error instanceof DOMException && error.name === 'AbortError'
    if (isAbort) {
      return {
        kind: 'unknown_outcome',
        userMessage: translate('errors.unknownOutcome', rawMessage),
        preservesDraft: false,
        canAutoRetry: false,
        retryAt: null,
        rawError: error,
      }
    }

    const lower = rawMessage.toLowerCase()
    if (error instanceof TypeError || lower.includes('timeout') || lower.includes('deadline') || lower.includes('network')) {
      return {
        kind: 'unknown_outcome',
        userMessage: translate('errors.unknownOutcome', rawMessage),
        preservesDraft: false,
        canAutoRetry: false,
        retryAt: null,
        rawError: error,
      }
    }

    return {
      kind: 'client_error',
      userMessage: rawMessage,
      preservesDraft: true,
      canAutoRetry: false,
      retryAt: null,
      rawError: error,
    }
  }

  // 2. Pre-call budget and access rejections (Task 29 server codes)
  // HTTP 429 Quota Exceeded
  if (status === 429 && code === 'AI_QUOTA_EXCEEDED') {
    let msg = rawMessage
    if (details.reason) {
      msg = translate(`reasons.${details.reason}`, rawMessage)
    }
    if (details.reason === 'RESERVATION_TOO_LARGE') {
      const scopeMessages: Record<string, string> = {
        five_hour: 'errors.insufficientFiveHour',
        weekly: 'errors.insufficientWeekly',
        company: 'errors.insufficientCompany',
      }
      const key = details.scope ? scopeMessages[details.scope] : undefined
      if (key) msg = translate(key, msg)
    }
    if (details.reason === 'RESERVATION_PENDING' && details.scope === 'account') {
      msg = translate('errors.generationPending', msg)
    }
    return {
      kind: 'pre_call_rejection',
      status,
      code,
      reason: details.reason,
      scope: details.scope,
      retryAt: details.retryAt,
      retryKind: details.retryKind,
      serverTime: details.serverTime,
      userMessage: msg,
      preservesDraft: true,
      canAutoRetry: false,
      rawError: error,
    }
  }

  // HTTP 429 Rate Limit
  if (status === 429 && code === 'AI_RATE_LIMIT') {
    return {
      kind: 'pre_call_rejection',
      status,
      code,
      userMessage: translate('errors.rateLimit', rawMessage),
      preservesDraft: true,
      canAutoRetry: false,
      retryAt: details.retryAt,
      rawError: error,
    }
  }

  // HTTP 429 Concurrency Limit
  if (status === 429 && code === 'AI_CONCURRENCY_LIMIT') {
    return {
      kind: 'pre_call_rejection',
      status,
      code,
      userMessage: translate('errors.concurrencyLimit', rawMessage),
      preservesDraft: true,
      canAutoRetry: false,
      retryAt: details.retryAt,
      rawError: error,
    }
  }

  // HTTP 403 Access Disabled
  if (status === 403 && (code === 'AI_ACCESS_DISABLED' || code === 'FORBIDDEN')) {
    let msg = rawMessage
    if (details.reason) {
      msg = translate(`reasons.${details.reason}`, rawMessage)
    }
    return {
      kind: 'pre_call_rejection',
      status,
      code,
      reason: details.reason,
      scope: details.scope,
      retryAt: details.retryAt,
      userMessage: msg,
      preservesDraft: true,
      canAutoRetry: false,
      rawError: error,
    }
  }

  // HTTP 409 Reservation Conflict
  if (status === 409 && code === 'AI_RESERVATION_CONFLICT') {
    return {
      kind: 'pre_call_rejection',
      status,
      code,
      reason: details.reason,
      userMessage: translate('errors.reservationConflict', rawMessage),
      preservesDraft: true,
      canAutoRetry: false,
      retryAt: null,
      rawError: error,
    }
  }

  // Accounting can also fail after dispatch; these codes alone do not prove the call was unsent.
  if (status === 503 && (code === 'AI_MODEL_UNPRICED' || code === 'AI_ACCOUNTING_UNAVAILABLE')) {
    return {
      kind: 'unknown_outcome', status, code,
      userMessage: translate('errors.unknownOutcome', rawMessage),
      preservesDraft: false, canAutoRetry: false, retryAt: null, rawError: error,
    }
  }

  // HTTP 503 Infrastructure / Accounting pre-call rejections
  if (
    status === 503 &&
    code === 'AI_LIMITER_UNAVAILABLE'
  ) {
    let msg = rawMessage
    if (code === 'AI_LIMITER_UNAVAILABLE') msg = translate('errors.limiterUnavailable', rawMessage)

    return {
      kind: 'pre_call_rejection',
      status,
      code,
      userMessage: msg,
      preservesDraft: true,
      canAutoRetry: false,
      retryAt: null,
      rawError: error,
    }
  }

  // 3. Unknown outcome (504 Gateway Timeout or Deadline Exceeded)
  if (status === 504) {
    return {
      kind: 'unknown_outcome',
      status,
      code,
      userMessage: translate('errors.unknownOutcome', rawMessage),
      preservesDraft: false,
      canAutoRetry: false,
      retryAt: null,
      rawError: error,
    }
  }

  // 4. Provider failure (502 Bad Gateway or 503 Internal Error)
  if (status === 502 || (status === 503 && code === 'INTERNAL_ERROR')) {
    return {
      kind: 'provider_error',
      status,
      code,
      userMessage: translate('errors.providerError', rawMessage),
      preservesDraft: false,
      canAutoRetry: false,
      retryAt: null,
      rawError: error,
    }
  }

  // 5. Fallback for unhandled HTTP status codes
  if (status === 429 || status === 403) {
    return {
      kind: 'pre_call_rejection',
      status,
      code,
      userMessage: rawMessage,
      preservesDraft: true,
      canAutoRetry: false,
      retryAt: details.retryAt,
      rawError: error,
    }
  }

  return {
    kind: 'provider_error',
    status,
    code,
    userMessage: rawMessage || translate('errors.providerError', 'Request failed'),
    preservesDraft: false,
    canAutoRetry: false,
    retryAt: null,
    rawError: error,
  }
}
