/**
 * Domain entities, DTOs, and conversion utilities for personal AI limits.
 * Implements the Task 28 / Task 04 specification (section 4 of ai-budget-api-contract.md).
 */

export const MICROCREDITS_PER_CREDIT = 1_000_000n

export type AIQuotaWindowState = 'active' | 'disabled' | 'unconfigured' | 'exhausted' | string

export interface AIPeriod {
  id: string | null
  startsAt: string
  endsAt: string
}

export interface AIQuotaWindow {
  state: AIQuotaWindowState
  /** Лимит в микрокредитах (строка int64). null только при unconfigured. */
  limitMicrocredits: string | null
  /** Фактический зафиксированный расход в микрокредитах (строка int64). */
  usedMicrocredits: string
  /** Активное резервирование в микрокредитах (строка int64, включает carried). */
  reservedMicrocredits: string
  /** Часть резервирования, перенесённая из прошлых окон (строка int64). */
  carriedReservedMicrocredits: string
  /** Доступный остаток: max(0, limit - used - reserved). null при unconfigured. */
  availableMicrocredits: string | null
  /** Процент доступного остатка 0..100. null при unconfigured или disabled. 0 может означать < 1%. */
  remainingPercent: number | null
  /** Окно периода или null, если якорь ещё не открыт. */
  period: AIPeriod | null
}

export type AIBlockerScope = 'account' | 'company' | 'weekly' | 'five_hour' | 'policy' | 'service' | string

export type AIBlockerReason =
  | 'NO_ORGANIZATION'
  | 'COMPANY_SUSPENDED'
  | 'AI_ACCESS_DENIED'
  | 'COMPANY_BUDGET_UNCONFIGURED'
  | 'COMPANY_BUDGET_DISABLED'
  | 'USER_QUOTA_UNCONFIGURED'
  | 'USER_QUOTA_DISABLED'
  | 'FIVE_HOUR_DISABLED'
  | 'SERVICE_QUOTA_DISABLED'
  | 'CREDIT_POLICY_UNAVAILABLE'
  | 'COMPANY_WEEKLY_EXHAUSTED'
  | 'USER_WEEKLY_EXHAUSTED'
  | 'FIVE_HOUR_EXHAUSTED'
  | 'SERVICE_WEEKLY_EXHAUSTED'
  | 'RESERVATION_PENDING'
  | 'RESERVATION_TOO_LARGE'
  | string

export interface AIBlocker {
  reason: AIBlockerReason
  scope: AIBlockerScope
  enforced: boolean
  resetsAt: string | null
}

export type AIRetryKind = 'none' | 'estimated' | 'requires_action' | 'unknown' | string

export interface AIAccessState {
  canStartRequest: boolean
  blockers: AIBlocker[]
  retryAt: string | null
  retryKind: AIRetryKind
  recheckAt: string | null
}

export type AIEnforcementMode = 'observe' | 'enforced' | string

export interface UserAILimits {
  serverTime: string
  organizationId: string | null
  enforcementMode: AIEnforcementMode
  creditPolicyVersion: string | null
  fiveHour: AIQuotaWindow
  weekly: AIQuotaWindow
  access: AIAccessState
}

/* ==================== Wire DTO interfaces ==================== */

export interface AIPeriodDto {
  id?: string | null
  starts_at?: string
  ends_at?: string
}

export interface AIQuotaWindowDto {
  state?: string
  limit_microcredits?: string | null
  used_microcredits?: string
  reserved_microcredits?: string
  carried_reserved_microcredits?: string
  available_microcredits?: string | null
  remaining_percent?: number | null
  period?: AIPeriodDto | null
}

export interface AIBlockerDto {
  reason?: string
  scope?: string
  enforced?: boolean
  resets_at?: string | null
}

export interface AIAccessStateDto {
  can_start_request?: boolean
  blockers?: AIBlockerDto[]
  retry_at?: string | null
  retry_kind?: string
  recheck_at?: string | null
}

export interface UserAILimitsDto {
  server_time?: string
  organization_id?: string | null
  enforcement_mode?: string
  credit_policy_version?: string | null
  five_hour?: AIQuotaWindowDto
  weekly?: AIQuotaWindowDto
  access?: AIAccessStateDto
}

/* ==================== Utilities & Formatters ==================== */

/**
 * Преобразует строковое значение микрокредитов в BigInt целых кредитов с отбрасыванием остатка.
 */
export function microcreditsToCreditsBigInt(microcredits: string | null | undefined): bigint | null {
  if (!microcredits) return null
  const isNegative = microcredits.startsWith('-')
  const abs = isNegative ? microcredits.slice(1) : microcredits
  if (!/^\d+$/.test(abs)) return null
  try {
    const val = BigInt(abs) / MICROCREDITS_PER_CREDIT
    return isNegative ? -val : val
  } catch {
    return null
  }
}

/**
 * Форматирует значение микрокредитов в строку кредитов с указанной дробной частью.
 * Сохраняет точные строковые вычисления через BigInt без потери точности Number.
 */
export function formatMicrocredits(
  microcredits: string | null | undefined,
  fractionDigits = 2,
): string {
  if (microcredits === null || microcredits === undefined || microcredits === '') {
    return '—'
  }
  const isNegative = microcredits.startsWith('-')
  const raw = isNegative ? microcredits.slice(1) : microcredits
  if (!/^\d+$/.test(raw)) {
    return '—'
  }
  try {
    const val = BigInt(raw)
    const whole = val / MICROCREDITS_PER_CREDIT
    const remainder = val % MICROCREDITS_PER_CREDIT

    if (fractionDigits <= 0) {
      return `${isNegative ? '-' : ''}${whole.toString()}`
    }

    const remStr = remainder.toString().padStart(6, '0').slice(0, fractionDigits)
    return `${isNegative ? '-' : ''}${whole.toString()}.${remStr}`
  } catch {
    return '—'
  }
}

/**
 * Интерпретирует процент остатка согласно серверной спецификации:
 * - null/undefined -> '—' (для unconfigured / disabled);
 * - 0% при положительном availableMicrocredits -> '< 1%';
 * - N% -> 'N%'.
 */
export function formatRemainingPercent(
  percent: number | null | undefined,
  availableMicrocredits?: string | null,
): string {
  if (percent === null || percent === undefined) {
    return '—'
  }
  if (percent === 0 && availableMicrocredits && availableMicrocredits !== '0') {
    return '< 1%'
  }
  return `${percent}%`
}

/** An integer percentage rounded down to zero is not proof of exhaustion. */
export function isAIQuotaWindowExhausted(window: AIQuotaWindow | null | undefined): boolean {
  if (!window || window.limitMicrocredits === null || window.limitMicrocredits === '0') return false
  return window.state === 'exhausted' || window.availableMicrocredits === '0'
}

/* ==================== Parsing & Validation ==================== */

function parsePeriod(dto: unknown): AIPeriod | null {
  if (!dto || typeof dto !== 'object') return null
  const p = dto as Record<string, unknown>
  const startsAt = typeof p.starts_at === 'string' ? p.starts_at : ''
  const endsAt = typeof p.ends_at === 'string' ? p.ends_at : ''
  if (!startsAt || !endsAt) return null
  return {
    id: typeof p.id === 'string' ? p.id : null,
    startsAt,
    endsAt,
  }
}

function parseQuotaWindow(dto: unknown): AIQuotaWindow {
  if (!dto || typeof dto !== 'object') {
    return {
      state: 'unconfigured',
      limitMicrocredits: null,
      usedMicrocredits: '0',
      reservedMicrocredits: '0',
      carriedReservedMicrocredits: '0',
      availableMicrocredits: null,
      remainingPercent: null,
      period: null,
    }
  }
  const w = dto as Record<string, unknown>
  const state = typeof w.state === 'string' ? w.state : 'unconfigured'
  const limitMicrocredits = typeof w.limit_microcredits === 'string' ? w.limit_microcredits : null
  const usedMicrocredits = typeof w.used_microcredits === 'string' ? w.used_microcredits : '0'
  const reservedMicrocredits = typeof w.reserved_microcredits === 'string' ? w.reserved_microcredits : '0'
  const carriedReservedMicrocredits =
    typeof w.carried_reserved_microcredits === 'string' ? w.carried_reserved_microcredits : '0'
  const availableMicrocredits = typeof w.available_microcredits === 'string' ? w.available_microcredits : null
  const remainingPercent =
    typeof w.remaining_percent === 'number' && Number.isFinite(w.remaining_percent) ? w.remaining_percent : null
  const period = parsePeriod(w.period)

  return {
    state,
    limitMicrocredits,
    usedMicrocredits,
    reservedMicrocredits,
    carriedReservedMicrocredits,
    availableMicrocredits,
    remainingPercent,
    period,
  }
}

function parseBlocker(dto: unknown): AIBlocker | null {
  if (!dto || typeof dto !== 'object') return null
  const b = dto as Record<string, unknown>
  if (typeof b.reason !== 'string' || !b.reason) return null
  return {
    reason: b.reason,
    scope: typeof b.scope === 'string' ? b.scope : 'account',
    enforced: b.enforced === true,
    resetsAt: typeof b.resets_at === 'string' ? b.resets_at : null,
  }
}

function parseAccessState(dto: unknown): AIAccessState {
  if (!dto || typeof dto !== 'object') {
    return {
      canStartRequest: false,
      blockers: [],
      retryAt: null,
      retryKind: 'none',
      recheckAt: null,
    }
  }
  const a = dto as Record<string, unknown>
  const blockers: AIBlocker[] = Array.isArray(a.blockers)
    ? a.blockers.map(parseBlocker).filter((b): b is AIBlocker => b !== null)
    : []

  return {
    canStartRequest: a.can_start_request === true,
    blockers,
    retryAt: typeof a.retry_at === 'string' ? a.retry_at : null,
    retryKind: typeof a.retry_kind === 'string' ? a.retry_kind : 'none',
    recheckAt: typeof a.recheck_at === 'string' ? a.recheck_at : null,
  }
}

/**
 * Валидирует и преобразует JSON-ответ сервера в доменную сущность UserAILimits.
 * Гарантирует сохранение строкового представления микрокредитов без потери точности.
 */
export function parseUserAILimitsDto(payload: unknown): UserAILimits {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid UserAILimits payload')
  }
  const data = payload as Record<string, unknown>
  const serverTime = typeof data.server_time === 'string' ? data.server_time : ''
  if (!serverTime) {
    throw new Error('Missing server_time in UserAILimits payload')
  }

  return {
    serverTime,
    organizationId: typeof data.organization_id === 'string' ? data.organization_id : null,
    enforcementMode: typeof data.enforcement_mode === 'string' ? data.enforcement_mode : 'observe',
    creditPolicyVersion: typeof data.credit_policy_version === 'string' ? data.credit_policy_version : null,
    fiveHour: parseQuotaWindow(data.five_hour),
    weekly: parseQuotaWindow(data.weekly),
    access: parseAccessState(data.access),
  }
}
