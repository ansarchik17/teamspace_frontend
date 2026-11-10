import { adminText } from '../../shared/i18n/adminText'
import type { AuthSessionStore } from '../../domain/services/AuthSessionStore'
import { authorizedFetch } from '../http/authorizedFetch'
import { HttpError } from '../http/HttpError'
import {
  type AIBudgetSummary,
  type AIEmployeeQuota,
  type AIUsersPage,
  type SetAIBudgetRequest,
  type SetAIUserQuotaRequest,
  type AIRevisionConflictDetails,
  type AIBudgetConflictDetails,
  parseAIBudgetSummaryDto,
  parseAIEmployeeQuotaDto,
  parseAIUsersPageDto,
  validateSetAIBudgetRequest,
  validateSetAIUserQuotaRequest,
} from '../../domain/entities/AdministrationAIBudget'

export * from '../../domain/entities/AdministrationAIBudget'

export interface AdministrationCapabilities {
  manage_users: boolean
  delete_users?: boolean
  manage_structure: boolean
  manage_permissions: boolean
  manage_modules: boolean
  set_module_availability: boolean
  set_company_quota: boolean
  set_user_quotas: boolean
  manage_identity_providers: boolean
  manage_company_lifecycle: boolean
  assign_owner: boolean
  read_audit: boolean
}

export interface AdministrationModule {
  application: string
  available: boolean
  enabled: boolean
  effective: boolean
  revision: number
}

export interface AdministrationStorage {
  quota_bytes: number | null
  allocated_bytes: number
  used_bytes: number
  free_bytes: number | null
  unallocated_bytes: number | null
  revision: number
}

export interface StorageCapacity {
  total_bytes: number
  free_bytes: number
  reserve_bytes: number
  other_committed_bytes: number
  max_quota_bytes: number
  observed_at: string
}

export interface AdministrationEmployee {
  id: number
  full_name: string
  username: string
  email: string
  position?: string
  role: string
  is_active: boolean
  is_blocked: boolean
  is_director: boolean
}

export interface StorageEmployee {
  user_id: number
  full_name: string
  quota_bytes: number
  used_bytes: number
  revision: number
}

export interface AdministrationAudit {
  id: number
  organization_id: string
  actor_id: number
  action: string
  object_type: string
  object_id: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  created_at: string
}

export interface SecurityEvent {
  id: number
  actor_id: number | null
  organization_id: string | null
  action: string
  outcome: string
  object_type: string
  object_id: string
  ip: string | null
  created_at: string
  administration_audit_id: number | null
}

export interface SecurityPage {
  items: SecurityEvent[]
  snapshot_id: number
  next_before_id?: number
}

export interface OffsetPage<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

export interface AdministrationOverview {
  organization: {
    id: string
    name: string
    slug: string
    status: string
    owner_id: number | null
  }
  capabilities: AdministrationCapabilities
  users: {
    total: number
    active: number
    inactive: number
    blocked: number
  }
  unit_count: number
  modules: AdministrationModule[]
  storage: AdministrationStorage | null
  integrations: {
    total: number
    enabled: number
    pending: number
    error: number
    disabled: number
  }
  recent_audit: {
    items: AdministrationAudit[]
    next_before_id?: number
  } | null
}

export interface PlatformOverview {
  capabilities: {
    create_companies: boolean
    manage_company_lifecycle: boolean
    assign_owners: boolean
    read_global_audit: boolean
  }
  companies: {
    total: number
    active: number
    suspended: number
    without_owner: number
  }
  users: {
    total: number
    active: number
    inactive: number
    blocked: number
  }
}

export function administrationPrefix(organizationId?: string): string {
  return organizationId
    ? `/api/v1/platform/organizations/${encodeURIComponent(organizationId)}`
    : '/api/v1/organizations/current'
}

export function administrationQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value))
    }
  }
  return search.size ? `?${search.toString()}` : ''
}

export function isAIRevisionConflict(error: unknown): error is HttpError & { details: AIRevisionConflictDetails } {
  return error instanceof HttpError && error.status === 409 && error.code === 'AI_REVISION_CONFLICT'
}

export function isAIBudgetConflict(error: unknown): error is HttpError & { details: AIBudgetConflictDetails } {
  return error instanceof HttpError && error.status === 409 && error.code === 'AI_BUDGET_CONFLICT'
}

export function isAIConfigurationRequired(error: unknown): error is HttpError {
  return error instanceof HttpError && error.status === 409 && error.code === 'AI_CONFIGURATION_REQUIRED'
}

export function isAICompanySuspended(error: unknown): error is HttpError {
  return error instanceof HttpError && error.status === 409 && error.code === 'AI_COMPANY_SUSPENDED'
}

interface AICacheEntry<T> {
  data: T
  orgScope: string
  sessionIdentity?: string
  expiresAt: number
}

function extractUserIdentity(token?: string): string {
  if (!token) return 'anonymous'
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '=')))
    if (typeof claims.user_id === 'number' && claims.user_id > 0) return `user:${claims.user_id}`
  } catch {
    /* fallback to token */
  }
  return token
}

export class HttpAdministrationRepository {
  private readonly store: AuthSessionStore
  private readonly aiCache = new Map<string, AICacheEntry<unknown>>()

  constructor(store: AuthSessionStore) {
    this.store = store
  }

  private async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    const response = await authorizedFetch(this.store, path, { signal, cache: 'no-store' })
    return response.json() as Promise<T>
  }

  private async put(path: string, body: object): Promise<void> {
    await authorizedFetch(this.store, path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  overview(org?: string, signal?: AbortSignal): Promise<AdministrationOverview> {
    return this.get<AdministrationOverview>(`${administrationPrefix(org)}/administration/overview`, signal)
  }

  platformOverview(signal?: AbortSignal): Promise<PlatformOverview> {
    return this.get<PlatformOverview>('/api/v1/platform/administration/overview', signal)
  }

  async auditEntry(org: string | undefined, id: number, signal?: AbortSignal, global = false): Promise<AdministrationAudit> {
    const page = await this.get<{ items: AdministrationAudit[] }>(
      `${global ? '/api/v1/platform' : administrationPrefix(org)}/administration/audit${administrationQuery({ before_id: id + 1, limit: 1 })}`,
      signal,
    )
    const entry = page.items.find((item) => item.id === id)
    if (!entry) {
      throw new HttpError(adminText('text268'), 404)
    }
    return entry
  }

  users(org: string | undefined, q: string, offset: number, signal?: AbortSignal): Promise<OffsetPage<AdministrationEmployee>> {
    return this.get<OffsetPage<AdministrationEmployee>>(
      `${administrationPrefix(org)}/administration/users${administrationQuery({ q, limit: 10, offset })}`,
      signal,
    )
  }

  storageUsers(org: string | undefined, offset: number, signal?: AbortSignal): Promise<OffsetPage<StorageEmployee>> {
    return this.get<OffsetPage<StorageEmployee>>(
      `${administrationPrefix(org)}/administration/storage/users${administrationQuery({ limit: 10, offset })}`,
      signal,
    )
  }

  capacity(org: string): Promise<StorageCapacity> {
    return this.get<StorageCapacity>(`${administrationPrefix(org)}/administration/storage/capacity`)
  }

  async deleteEmployee(org: string | undefined, id: number): Promise<void> {
    await authorizedFetch(this.store, `${administrationPrefix(org)}/administration/users/${id}`, { method: 'DELETE' })
    this.invalidateAiCache(org)
  }

  block(org: string | undefined, id: number, blocked: boolean): Promise<void> {
    return this.put(`${administrationPrefix(org)}/administration/users/${id}/block`, { blocked })
  }

  module(
    org: string | undefined,
    module: AdministrationModule,
    changes: { enabled?: boolean; available?: boolean },
  ): Promise<void> {
    return this.put(
      `${administrationPrefix(org)}/administration/modules/${encodeURIComponent(module.application)}`,
      { ...changes, revision: module.revision },
    )
  }

  budget(org: string, quota_bytes: number, revision: number): Promise<void> {
    return this.put(`${administrationPrefix(org)}/administration/storage`, { quota_bytes, revision })
  }

  quota(org: string | undefined, user: StorageEmployee, quota_bytes: number): Promise<void> {
    return this.put(`${administrationPrefix(org)}/administration/storage/users/${user.user_id}`, {
      quota_bytes,
      revision: user.revision,
    })
  }

  security(
    org: string | undefined,
    filters: Record<string, string | number | undefined>,
    signal?: AbortSignal,
    global = false,
    limit = 50,
  ): Promise<SecurityPage> {
    return this.get<SecurityPage>(
      `${global ? '/api/v1/platform' : administrationPrefix(org)}/security-audit${administrationQuery({ ...filters, limit })}`,
      signal,
    )
  }

  async exportSecurity(
    org: string | undefined,
    filters: Record<string, string | number | undefined>,
    global = false,
  ): Promise<Blob> {
    const response = await authorizedFetch(
      this.store,
      `${global ? '/api/v1/platform' : administrationPrefix(org)}/security-audit/export${administrationQuery({ ...filters, format: 'csv' })}`,
      { cache: 'no-store' },
    )
    return response.blob()
  }

  // ==================== AI Budget & Quotas Management ====================

  /**
   * Чтение бюджета компании, служебной квоты и сводки расхода.
   * Доступ: директор своей компании (org = undefined) либо администратор платформы (org = UUID).
   * Поддерживает AbortSignal для отмены устаревших запросов при переключении страниц/компаний.
   */
  async aiBudget(org?: string, signal?: AbortSignal): Promise<AIBudgetSummary> {
    const path = `${administrationPrefix(org)}/administration/ai-budget`
    const raw = await this.get<unknown>(path, signal)
    return parseAIBudgetSummaryDto(raw)
  }

  /**
   * Чтение бюджета компании из изолированного кэша с проверкой TTL.
   * Кэш строго изолирован по компании и текущему пользователю.
   */
  async aiBudgetCached(org?: string, signal?: AbortSignal, ttlMs = 5000): Promise<AIBudgetSummary> {
    const requestToken = this.store.getTokens()?.accessToken
    const cached = this.getCachedAiEntry<AIBudgetSummary>(org, 'ai-budget')
    if (cached) {
      return cached
    }
    const fresh = await this.aiBudget(org, signal)
    if (signal?.aborted || this.store.getTokens()?.accessToken !== requestToken) {
      throw new DOMException('Session changed or request cancelled', 'AbortError')
    }
    this.setCachedAiEntry(org, 'ai-budget', fresh, ttlMs)
    return fresh
  }

  /**
   * Изменение бюджета компании, пятичасового лимита и служебной квоты.
   * Доступ: только администратор платформы (org обязательно задан).
   * Автоматически инвалидирует изолированный кэш этой компании.
   */
  async setAiBudget(org: string, request: SetAIBudgetRequest): Promise<void> {
    if (!org) {
      throw new Error('Platform administrator organization_id is required to update AI budget')
    }
    const validated = validateSetAIBudgetRequest(request)
    const path = `${administrationPrefix(org)}/administration/ai-budget`
    await this.put(path, validated)
    this.invalidateAiCache(org)
  }

  /**
   * Получение страницы сотрудников со списком квот и расхода ИИ.
   * Доступ: директор своей компании либо администратор платформы.
   */
  async aiUsers(
    org: string | undefined,
    params?: { q?: string; limit?: number; offset?: number },
    signal?: AbortSignal,
  ): Promise<AIUsersPage> {
    const query = administrationQuery({
      q: params?.q,
      limit: params?.limit ?? 25,
      offset: params?.offset ?? 0,
    })
    const path = `${administrationPrefix(org)}/administration/ai-budget/users${query}`
    const raw = await this.get<unknown>(path, signal)
    return parseAIUsersPageDto(raw)
  }

  /**
   * Чтение квоты конкретного сотрудника.
   * Доступ: директор своей компании либо администратор платформы.
   */
  async aiUser(org: string | undefined, userId: number, signal?: AbortSignal): Promise<AIEmployeeQuota> {
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new Error('Valid positive integer userId is required')
    }
    const path = `${administrationPrefix(org)}/administration/ai-budget/users/${userId}`
    const raw = await this.get<unknown>(path, signal)
    return parseAIEmployeeQuotaDto(raw)
  }

  /**
   * Изменение недельной и пятичасовой квоты сотрудника.
   * Доступ: директор своей компании либо администратор платформы.
   * Автоматически инвалидирует изолированный кэш этой компании.
   */
  async setAiUserQuota(
    org: string | undefined,
    userId: number,
    request: SetAIUserQuotaRequest,
  ): Promise<void> {
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new Error('Valid positive integer userId is required')
    }
    const validated = validateSetAIUserQuotaRequest(request)
    const path = `${administrationPrefix(org)}/administration/ai-budget/users/${userId}`
    await this.put(path, validated)
    this.invalidateAiCache(org)
  }

  // ==================== Scoped Cache Isolation ====================

  private getCacheKey(org: string | undefined, key: string): string {
    const orgScope = org ?? '__current__'
    const sessionIdentity = extractUserIdentity(this.store.getTokens()?.accessToken)
    return `${sessionIdentity}:${orgScope}:${key}`
  }

  public getCachedAiEntry<T>(org: string | undefined, key: string): T | null {
    const cacheKey = this.getCacheKey(org, key)
    const entry = this.aiCache.get(cacheKey)
    if (!entry) return null

    // Проверка актуальности сессии и компании
    const currentSession = extractUserIdentity(this.store.getTokens()?.accessToken)
    const expectedOrgScope = org ?? '__current__'
    if (entry.sessionIdentity !== currentSession || entry.orgScope !== expectedOrgScope) {
      this.aiCache.delete(cacheKey)
      return null
    }

    if (Date.now() > entry.expiresAt) {
      this.aiCache.delete(cacheKey)
      return null
    }

    return entry.data as T
  }

  public setCachedAiEntry<T>(org: string | undefined, key: string, data: T, ttlMs = 5000): void {
    const cacheKey = this.getCacheKey(org, key)
    const orgScope = org ?? '__current__'
    const sessionIdentity = extractUserIdentity(this.store.getTokens()?.accessToken)
    this.aiCache.set(cacheKey, {
      data,
      orgScope,
      sessionIdentity,
      expiresAt: Date.now() + ttlMs,
    })
  }

  /**
   * Инвалидирует кэш конкретной компании.
   */
  public invalidateAiCache(org?: string): void {
    const targetOrgScope = org ?? '__current__'
    for (const [cacheKey, entry] of this.aiCache.entries()) {
      if (entry.orgScope === targetOrgScope) {
        this.aiCache.delete(cacheKey)
      }
    }
  }

  /**
   * Полностью очищает кэш всех компаний и пользователей.
   */
  public clearAiCache(): void {
    this.aiCache.clear()
  }
}
