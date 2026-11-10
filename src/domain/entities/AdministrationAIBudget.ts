/**
 * Доменные сущности, DTO и утилиты валидации для административного управления ИИ.
 * Реализует контракты задач 04, 10–15 (разделы 5–8 docs/ai-budget-api-contract.md).
 */

export interface AIPeriod {
  id: string | null
  starts_at: string
  ends_at: string
}

export interface AIServiceBudgetSummary {
  used_microcredits: string
  reserved_microcredits: string
  carried_reserved_microcredits: string
  available_microcredits: string
}

export interface AIBudgetCapabilities {
  set_company_budget: boolean
  set_service_quota: boolean
  set_user_quotas: boolean
}

export interface AIBudgetSummary {
  organization_id: string
  server_time: string
  enforcement_mode: 'observe' | 'enforced' | string
  configured: boolean
  revision: string
  weekly_budget_microcredits: string | null
  max_five_hour_microcredits: string | null
  service_weekly_quota_microcredits: string
  period: AIPeriod | null
  employee_allocated_microcredits: string
  allocated_microcredits: string
  committed_microcredits: string
  used_microcredits: string
  reserved_microcredits: string
  carried_reserved_microcredits: string
  unallocated_microcredits: string | null
  available_microcredits: string | null
  overcommitted_microcredits: string | null
  remaining_percent: number | null
  service: AIServiceBudgetSummary
  capabilities: AIBudgetCapabilities
}

export interface AIQuotaWindow {
  state: 'unconfigured' | 'disabled' | 'active' | 'exhausted' | string
  limit_microcredits: string | null
  used_microcredits: string
  reserved_microcredits: string
  carried_reserved_microcredits: string
  available_microcredits: string | null
  remaining_percent: number | null
  period: AIPeriod | null
}

export interface AIEmployeeQuota {
  user_id: number
  full_name: string
  username: string
  email: string
  is_active: boolean
  is_blocked: boolean
  is_director: boolean
  configured: boolean
  revision: string
  company_revision: string
  weekly_quota_microcredits: string | null
  five_hour_limit_microcredits: string | null
  effective_five_hour_microcredits: string | null
  committed_microcredits: string
  server_time: string
  weekly: AIQuotaWindow
  five_hour: AIQuotaWindow
}

export interface AIUsersPage {
  items: AIEmployeeQuota[]
  total: number
  limit: number
  offset: number
  server_time: string
  company_revision: string
  period: AIPeriod | null
}

export interface SetAIBudgetRequest {
  weekly_budget_microcredits: string
  max_five_hour_microcredits: string
  /** Deprecated compatibility field. New clients send "0"; it allocates no funds. */
  service_weekly_quota_microcredits: string
  revision: string
}

export interface SetAIUserQuotaRequest {
  weekly_quota_microcredits: string
  five_hour_limit_microcredits: string
  revision: string
  company_revision: string
}

export interface AIRevisionConflictDetails {
  scope: 'company' | 'user' | string
  expected_revision: string
  current_revision: string
}

export interface AIBudgetConflictDetails {
  reason: 'INSUFFICIENT_BUDGET' | 'BUDGET_BELOW_COMMITTED' | 'INCREASE_WHILE_OVERCOMMITTED' | string
  available_microcredits?: string
  required_microcredits?: string
  committed_microcredits?: string
}

/**
 * Валидирует и парсит строковое представление int64 суммы в микрокредитах.
 * Исключает преобразование в Number и потерю точности.
 */
export function validateMicrocreditsString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`Field '${fieldName}' must be a decimal string, received ${typeof value}`)
  }
  const trimmed = value.trim()
  if (!/^(?:0|[1-9]\d*)$/.test(trimmed)) {
    throw new RangeError(`Field '${fieldName}' must be a non-negative decimal integer string, received: '${value}'`)
  }
  return trimmed
}

export function validateOptionalMicrocreditsString(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined) {
    return null
  }
  return validateMicrocreditsString(value, fieldName)
}

export function parseAIPeriodDto(raw: unknown): AIPeriod | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const obj = raw as Record<string, unknown>
  if (typeof obj.starts_at !== 'string' || typeof obj.ends_at !== 'string') {
    return null
  }
  return {
    id: typeof obj.id === 'string' ? obj.id : null,
    starts_at: obj.starts_at,
    ends_at: obj.ends_at,
  }
}

export function parseAIQuotaWindowDto(raw: unknown): AIQuotaWindow {
  if (!raw || typeof raw !== 'object') {
    throw new TypeError('Invalid AI quota window object')
  }
  const obj = raw as Record<string, unknown>
  return {
    state: typeof obj.state === 'string' ? obj.state : 'unconfigured',
    limit_microcredits: validateOptionalMicrocreditsString(obj.limit_microcredits, 'limit_microcredits'),
    used_microcredits: validateMicrocreditsString(obj.used_microcredits ?? '0', 'used_microcredits'),
    reserved_microcredits: validateMicrocreditsString(obj.reserved_microcredits ?? '0', 'reserved_microcredits'),
    carried_reserved_microcredits: validateMicrocreditsString(obj.carried_reserved_microcredits ?? '0', 'carried_reserved_microcredits'),
    available_microcredits: validateOptionalMicrocreditsString(obj.available_microcredits, 'available_microcredits'),
    remaining_percent: typeof obj.remaining_percent === 'number' ? obj.remaining_percent : null,
    period: parseAIPeriodDto(obj.period),
  }
}

export function parseAIBudgetSummaryDto(raw: unknown): AIBudgetSummary {
  if (!raw || typeof raw !== 'object') {
    throw new TypeError('Invalid AI budget summary response')
  }
  const obj = raw as Record<string, unknown>

  const serviceRaw = (obj.service && typeof obj.service === 'object') ? (obj.service as Record<string, unknown>) : {}
  const capabilitiesRaw = (obj.capabilities && typeof obj.capabilities === 'object') ? (obj.capabilities as Record<string, unknown>) : {}

  return {
    organization_id: typeof obj.organization_id === 'string' ? obj.organization_id : '',
    server_time: typeof obj.server_time === 'string' ? obj.server_time : new Date().toISOString(),
    enforcement_mode: typeof obj.enforcement_mode === 'string' ? obj.enforcement_mode : 'enforced',
    configured: Boolean(obj.configured),
    revision: validateMicrocreditsString(obj.revision ?? '0', 'revision'),
    weekly_budget_microcredits: validateOptionalMicrocreditsString(obj.weekly_budget_microcredits, 'weekly_budget_microcredits'),
    max_five_hour_microcredits: validateOptionalMicrocreditsString(obj.max_five_hour_microcredits, 'max_five_hour_microcredits'),
    service_weekly_quota_microcredits: validateMicrocreditsString(obj.service_weekly_quota_microcredits ?? '0', 'service_weekly_quota_microcredits'),
    period: parseAIPeriodDto(obj.period),
    employee_allocated_microcredits: validateMicrocreditsString(obj.employee_allocated_microcredits ?? '0', 'employee_allocated_microcredits'),
    allocated_microcredits: validateMicrocreditsString(obj.allocated_microcredits ?? '0', 'allocated_microcredits'),
    committed_microcredits: validateMicrocreditsString(obj.committed_microcredits ?? '0', 'committed_microcredits'),
    used_microcredits: validateMicrocreditsString(obj.used_microcredits ?? '0', 'used_microcredits'),
    reserved_microcredits: validateMicrocreditsString(obj.reserved_microcredits ?? '0', 'reserved_microcredits'),
    carried_reserved_microcredits: validateMicrocreditsString(obj.carried_reserved_microcredits ?? '0', 'carried_reserved_microcredits'),
    unallocated_microcredits: validateOptionalMicrocreditsString(obj.unallocated_microcredits, 'unallocated_microcredits'),
    available_microcredits: validateOptionalMicrocreditsString(obj.available_microcredits, 'available_microcredits'),
    overcommitted_microcredits: validateOptionalMicrocreditsString(obj.overcommitted_microcredits, 'overcommitted_microcredits'),
    remaining_percent: typeof obj.remaining_percent === 'number' ? obj.remaining_percent : null,
    service: {
      used_microcredits: validateMicrocreditsString(serviceRaw.used_microcredits ?? '0', 'service.used_microcredits'),
      reserved_microcredits: validateMicrocreditsString(serviceRaw.reserved_microcredits ?? '0', 'service.reserved_microcredits'),
      carried_reserved_microcredits: validateMicrocreditsString(serviceRaw.carried_reserved_microcredits ?? '0', 'service.carried_reserved_microcredits'),
      available_microcredits: validateMicrocreditsString(serviceRaw.available_microcredits ?? '0', 'service.available_microcredits'),
    },
    capabilities: {
      set_company_budget: Boolean(capabilitiesRaw.set_company_budget),
      set_service_quota: Boolean(capabilitiesRaw.set_service_quota),
      set_user_quotas: Boolean(capabilitiesRaw.set_user_quotas),
    },
  }
}

export function parseAIEmployeeQuotaDto(raw: unknown): AIEmployeeQuota {
  if (!raw || typeof raw !== 'object') {
    throw new TypeError('Invalid AI employee quota response')
  }
  const obj = raw as Record<string, unknown>

  return {
    user_id: typeof obj.user_id === 'number' ? obj.user_id : Number(obj.user_id),
    full_name: typeof obj.full_name === 'string' ? obj.full_name : '',
    username: typeof obj.username === 'string' ? obj.username : '',
    email: typeof obj.email === 'string' ? obj.email : '',
    is_active: Boolean(obj.is_active),
    is_blocked: Boolean(obj.is_blocked),
    is_director: Boolean(obj.is_director),
    configured: Boolean(obj.configured),
    revision: validateMicrocreditsString(obj.revision ?? '0', 'revision'),
    company_revision: validateMicrocreditsString(obj.company_revision ?? '0', 'company_revision'),
    weekly_quota_microcredits: validateOptionalMicrocreditsString(obj.weekly_quota_microcredits, 'weekly_quota_microcredits'),
    five_hour_limit_microcredits: validateOptionalMicrocreditsString(obj.five_hour_limit_microcredits, 'five_hour_limit_microcredits'),
    effective_five_hour_microcredits: validateOptionalMicrocreditsString(obj.effective_five_hour_microcredits, 'effective_five_hour_microcredits'),
    committed_microcredits: validateMicrocreditsString(obj.committed_microcredits ?? '0', 'committed_microcredits'),
    server_time: typeof obj.server_time === 'string' ? obj.server_time : new Date().toISOString(),
    weekly: parseAIQuotaWindowDto(obj.weekly),
    five_hour: parseAIQuotaWindowDto(obj.five_hour),
  }
}

export function parseAIUsersPageDto(raw: unknown): AIUsersPage {
  if (!raw || typeof raw !== 'object') {
    throw new TypeError('Invalid AI users page response')
  }
  const obj = raw as Record<string, unknown>
  const rawItems = Array.isArray(obj.items) ? obj.items : []

  return {
    items: rawItems.map((item) => parseAIEmployeeQuotaDto(item)),
    total: typeof obj.total === 'number' ? obj.total : 0,
    limit: typeof obj.limit === 'number' ? obj.limit : 25,
    offset: typeof obj.offset === 'number' ? obj.offset : 0,
    server_time: typeof obj.server_time === 'string' ? obj.server_time : new Date().toISOString(),
    company_revision: validateMicrocreditsString(obj.company_revision ?? '0', 'company_revision'),
    period: parseAIPeriodDto(obj.period),
  }
}

/**
 * Валидирует тело запроса PUT P/ai-budget.
 * Все 4 поля обязательны, неотрицательные строковые int64, null запрещен.
 */
export function validateSetAIBudgetRequest(req: SetAIBudgetRequest): SetAIBudgetRequest {
  if (!req || typeof req !== 'object') {
    throw new TypeError('SetAIBudgetRequest must be an object')
  }
  return {
    weekly_budget_microcredits: validateMicrocreditsString(req.weekly_budget_microcredits, 'weekly_budget_microcredits'),
    max_five_hour_microcredits: validateMicrocreditsString(req.max_five_hour_microcredits, 'max_five_hour_microcredits'),
    service_weekly_quota_microcredits: validateMicrocreditsString(req.service_weekly_quota_microcredits, 'service_weekly_quota_microcredits'),
    revision: validateMicrocreditsString(req.revision, 'revision'),
  }
}

/**
 * Валидирует тело запроса PUT D/P /ai-budget/users/:user_id.
 * Все 4 поля обязательны, неотрицательные строковые int64, null запрещен.
 */
export function validateSetAIUserQuotaRequest(req: SetAIUserQuotaRequest): SetAIUserQuotaRequest {
  if (!req || typeof req !== 'object') {
    throw new TypeError('SetAIUserQuotaRequest must be an object')
  }
  return {
    weekly_quota_microcredits: validateMicrocreditsString(req.weekly_quota_microcredits, 'weekly_quota_microcredits'),
    five_hour_limit_microcredits: validateMicrocreditsString(req.five_hour_limit_microcredits, 'five_hour_limit_microcredits'),
    revision: validateMicrocreditsString(req.revision, 'revision'),
    company_revision: validateMicrocreditsString(req.company_revision, 'company_revision'),
  }
}
