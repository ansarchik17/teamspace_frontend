const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load(file, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const item = { exports: {} }
  new Function('require', 'module', 'exports', code)(
    name => {
      assert.ok(dependencies[name], `Unexpected import ${name}`)
      return dependencies[name]
    },
    item,
    item.exports,
  )
  return item.exports
}

// Загрузка модулей
const adminEntities = load('src/domain/entities/AdministrationAIBudget.ts')
const { HttpError } = load('src/infrastructure/http/HttpError.ts')

let mockFetchHook = null

const repoModule = load('src/infrastructure/repositories/HttpAdministrationRepository.ts', {
  '../../shared/i18n/adminText': { adminText: (k) => `admin_text_${k}` },
  '../../domain/services/AuthSessionStore': {},
  '../http/HttpError': { HttpError },
  '../../domain/entities/AdministrationAIBudget': adminEntities,
  '../http/authorizedFetch': {
    authorizedFetch: async (sessionStore, url, init) => {
      if (mockFetchHook) {
        return mockFetchHook(sessionStore, url, init)
      }
      throw new Error('mockFetchHook not configured')
    },
  },
})

const {
  HttpAdministrationRepository,
  administrationPrefix,
  administrationQuery,
  isAIRevisionConflict,
  isAIBudgetConflict,
  isAIConfigurationRequired,
  isAICompanySuspended,
  parseAIBudgetSummaryDto,
  parseAIEmployeeQuotaDto,
  parseAIUsersPageDto,
  validateSetAIBudgetRequest,
  validateSetAIUserQuotaRequest,
} = repoModule

class MockAuthSessionStore {
  constructor(userId = 1) {
    this.userId = userId
  }
  getTokens() {
    if (!this.userId) return null
    const payload = Buffer.from(JSON.stringify({ user_id: this.userId })).toString('base64url')
    return {
      accessToken: `header.${payload}.sig`,
      refreshToken: 'mock-refresh',
    }
  }
  setTokens() {}
  clearTokens() {
    this.userId = null
  }
}

async function runTests() {
  console.log('=== Task 34: Administration AI Management Verification Suite ===\n')

  // ТЕСТ 1: Точность преобразования int64 сумм, nullable настроек и структуры DTO
  {
    console.log('1. Testing 64-bit microcredits precision & nullable settings conversion...')

    // Бюджет компании с огромными числами (> 2^53 - 1, MAX_SAFE_INTEGER в JS = 9007199254740991)
    const largeBudgetDto = {
      organization_id: 'org-uuid-1234',
      server_time: '2026-10-19T10:00:00Z',
      enforcement_mode: 'observe',
      configured: true,
      revision: '42',
      weekly_budget_microcredits: '9500000000000000', // 9.5 * 10^15 (больше MAX_SAFE_INTEGER)
      max_five_hour_microcredits: '1000000000000000',
      service_weekly_quota_microcredits: '500000000000000',
      period: {
        id: 'period-uuid-5678',
        starts_at: '2026-10-19T05:00:00Z',
        ends_at: '2026-10-26T05:00:00Z',
      },
      employee_allocated_microcredits: '3000000000000000',
      allocated_microcredits: '3500000000000000',
      committed_microcredits: '3500000000000000',
      used_microcredits: '1200000000000000',
      reserved_microcredits: '250000000000000',
      carried_reserved_microcredits: '50000000000000',
      unallocated_microcredits: '6000000000000000',
      available_microcredits: '8050000000000000',
      overcommitted_microcredits: null,
      remaining_percent: 84,
      service: {
        used_microcredits: '100000000000000',
        reserved_microcredits: '20000000000000',
        carried_reserved_microcredits: '0',
        available_microcredits: '380000000000000',
      },
      capabilities: {
        set_company_budget: true,
        set_service_quota: true,
        set_user_quotas: true,
      },
    }

    const parsed = parseAIBudgetSummaryDto(largeBudgetDto)
    assert.equal(typeof parsed.weekly_budget_microcredits, 'string')
    assert.equal(parsed.weekly_budget_microcredits, '9500000000000000', 'Must preserve exact large int64 string')
    assert.equal(parsed.revision, '42')
    assert.equal(parsed.overcommitted_microcredits, null, 'Nullable overcommitted must remain null')
    assert.equal(parsed.remaining_percent, 84)
    assert.equal(parsed.capabilities.set_company_budget, true)

    // Ненастроенный бюджет компании (configured: false, revision: "0", B/Hmax: null)
    const unconfiguredDto = {
      organization_id: 'org-empty',
      server_time: '2026-10-19T10:00:00Z',
      enforcement_mode: 'observe',
      configured: false,
      revision: '0',
      weekly_budget_microcredits: null,
      max_five_hour_microcredits: null,
      service_weekly_quota_microcredits: '0',
      period: null,
      employee_allocated_microcredits: '0',
      allocated_microcredits: '0',
      committed_microcredits: '0',
      used_microcredits: '0',
      reserved_microcredits: '0',
      carried_reserved_microcredits: '0',
      unallocated_microcredits: null,
      available_microcredits: null,
      overcommitted_microcredits: null,
      remaining_percent: null,
      service: {
        used_microcredits: '0',
        reserved_microcredits: '0',
        carried_reserved_microcredits: '0',
        available_microcredits: '0',
      },
      capabilities: {
        set_company_budget: false,
        set_service_quota: false,
        set_user_quotas: false,
      },
    }

    const parsedUnconfigured = parseAIBudgetSummaryDto(unconfiguredDto)
    assert.equal(parsedUnconfigured.configured, false)
    assert.equal(parsedUnconfigured.revision, '0')
    assert.equal(parsedUnconfigured.weekly_budget_microcredits, null, 'Unconfigured budget must be null, not 0')
    assert.equal(parsedUnconfigured.max_five_hour_microcredits, null)
    assert.equal(parsedUnconfigured.available_microcredits, null)
    assert.equal(parsedUnconfigured.remaining_percent, null)

    console.log('   64-bit precision & unconfigured null preservation verified!')
  }

  // ТЕСТ 2: Чтение и изменение бюджета компании (GET/PUT aiBudget)
  {
    console.log('2. Testing get/set company budget routes, headers and payload validation...')
    let lastUrl = ''
    let lastMethod = ''
    let lastBody = ''

    mockFetchHook = async (store, url, init) => {
      lastUrl = url
      lastMethod = init.method || 'GET'
      lastBody = init.body || ''

      if (lastMethod === 'GET') {
        assert.equal(init.cache, 'no-store')
        return {
          ok: true,
          json: async () => ({
            organization_id: 'org-456',
            server_time: '2026-10-19T12:00:00Z',
            enforcement_mode: 'enforced',
            configured: true,
            revision: '1',
            weekly_budget_microcredits: '1000000000',
            max_five_hour_microcredits: '100000000',
            service_weekly_quota_microcredits: '50000000',
            period: {
              id: 'per-1',
              starts_at: '2026-10-19T00:00:00Z',
              ends_at: '2026-10-26T00:00:00Z',
            },
            employee_allocated_microcredits: '200000000',
            allocated_microcredits: '250000000',
            committed_microcredits: '250000000',
            used_microcredits: '50000000',
            reserved_microcredits: '10000000',
            carried_reserved_microcredits: '0',
            unallocated_microcredits: '750000000',
            available_microcredits: '940000000',
            overcommitted_microcredits: null,
            remaining_percent: 94,
            service: {
              used_microcredits: '10000000',
              reserved_microcredits: '0',
              carried_reserved_microcredits: '0',
              available_microcredits: '40000000',
            },
            capabilities: {
              set_company_budget: true,
              set_service_quota: true,
              set_user_quotas: true,
            },
          }),
        }
      }

      if (lastMethod === 'PUT') {
        assert.equal(init.headers['Content-Type'], 'application/json')
        return {
          ok: true,
          status: 204,
          json: async () => ({}),
        }
      }
    }

    const store = new MockAuthSessionStore(1)
    const repo = new HttpAdministrationRepository(store)

    // 1) Чтение текущей компании (директор: org = undefined)
    const budgetDir = await repo.aiBudget(undefined)
    assert.equal(lastUrl, '/api/v1/organizations/current/administration/ai-budget')
    assert.equal(budgetDir.organization_id, 'org-456')
    assert.equal(budgetDir.weekly_budget_microcredits, '1000000000')

    // 2) Чтение платформенным админом (org = 'org-456')
    const budgetPlatform = await repo.aiBudget('org-456')
    assert.equal(lastUrl, '/api/v1/platform/organizations/org-456/administration/ai-budget')
    assert.equal(budgetPlatform.revision, '1')

    // 3) Изменение бюджета компании: директор не может вызывать без org (защита на уровне контракта)
    await assert.rejects(
      async () => {
        await repo.setAiBudget('', {
          weekly_budget_microcredits: '2000000000',
          max_five_hour_microcredits: '200000000',
          service_weekly_quota_microcredits: '100000000',
          revision: '1',
        })
      },
      /Platform administrator organization_id is required/,
    )

    // 4) Успешное изменение бюджета платформенным администратором
    await repo.setAiBudget('org-456', {
      weekly_budget_microcredits: '2000000000',
      max_five_hour_microcredits: '200000000',
      service_weekly_quota_microcredits: '100000000',
      revision: '1',
    })
    assert.equal(lastUrl, '/api/v1/platform/organizations/org-456/administration/ai-budget')
    assert.equal(lastMethod, 'PUT')
    const sentBody = JSON.parse(lastBody)
    assert.equal(sentBody.weekly_budget_microcredits, '2000000000')
    assert.equal(sentBody.revision, '1')

    // 5) Валидация: попытка отправить недопустимое значение или подменить null нулем
    await assert.rejects(
      async () => {
        await repo.setAiBudget('org-456', {
          weekly_budget_microcredits: null, // запрещен null при PUT
          max_five_hour_microcredits: '1000000',
          service_weekly_quota_microcredits: '0',
          revision: '1',
        })
      },
      /Field 'weekly_budget_microcredits' must be a decimal string/,
    )

    console.log('   Company budget GET/PUT verified with platform-scope enforcement!')
  }

  // ТЕСТ 3: Пагинация списка сотрудников, фильтрация и изменение отдельной квоты
  {
    console.log('3. Testing user quotas list, pagination parameters, search query & quota update...')
    let lastUrl = ''
    let lastMethod = ''
    let lastBody = ''

    mockFetchHook = async (store, url, init) => {
      lastUrl = url
      lastMethod = init.method || 'GET'
      lastBody = init.body || ''

      if (url.includes('/users?')) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                user_id: 101,
                full_name: 'Иван Иванов',
                username: 'i.ivanov',
                email: 'ivanov@example.com',
                is_active: true,
                is_blocked: false,
                is_director: false,
                configured: true,
                revision: '3',
                company_revision: '2',
                weekly_quota_microcredits: '50000000',
                five_hour_limit_microcredits: '10000000',
                effective_five_hour_microcredits: '10000000',
                committed_microcredits: '50000000',
                server_time: '2026-10-19T12:00:00Z',
                weekly: {
                  state: 'active',
                  limit_microcredits: '50000000',
                  used_microcredits: '15000000',
                  reserved_microcredits: '0',
                  carried_reserved_microcredits: '0',
                  available_microcredits: '35000000',
                  remaining_percent: 70,
                  period: null,
                },
                five_hour: {
                  state: 'active',
                  limit_microcredits: '10000000',
                  used_microcredits: '2000000',
                  reserved_microcredits: '0',
                  carried_reserved_microcredits: '0',
                  available_microcredits: '8000000',
                  remaining_percent: 80,
                  period: null,
                },
              },
            ],
            total: 1,
            limit: 25,
            offset: 50,
            server_time: '2026-10-19T12:00:00Z',
            company_revision: '2',
            period: null,
          }),
        }
      }

      if (url.endsWith('/users/101') && lastMethod === 'GET') {
        return {
          ok: true,
          json: async () => ({
            user_id: 101,
            full_name: 'Иван Иванов',
            username: 'i.ivanov',
            email: 'ivanov@example.com',
            is_active: true,
            is_blocked: false,
            is_director: false,
            configured: true,
            revision: '3',
            company_revision: '2',
            weekly_quota_microcredits: '50000000',
            five_hour_limit_microcredits: '10000000',
            effective_five_hour_microcredits: '10000000',
            committed_microcredits: '50000000',
            server_time: '2026-10-19T12:00:00Z',
            weekly: { state: 'active', limit_microcredits: '50000000', used_microcredits: '15000000', reserved_microcredits: '0', carried_reserved_microcredits: '0', available_microcredits: '35000000', remaining_percent: 70, period: null },
            five_hour: { state: 'active', limit_microcredits: '10000000', used_microcredits: '2000000', reserved_microcredits: '0', carried_reserved_microcredits: '0', available_microcredits: '8000000', remaining_percent: 80, period: null },
          }),
        }
      }

      if (url.endsWith('/users/101') && lastMethod === 'PUT') {
        return { ok: true, status: 204, json: async () => ({}) }
      }
    }

    const store = new MockAuthSessionStore(1)
    const repo = new HttpAdministrationRepository(store)

    // 1) Список квот сотрудников с пагинацией и поиском
    const page = await repo.aiUsers(undefined, { q: 'Иван', limit: 25, offset: 50 })
    assert.ok(lastUrl.includes('q=%D0%98%D0%B2%D0%B0%D0%BD'))
    assert.ok(lastUrl.includes('limit=25'))
    assert.ok(lastUrl.includes('offset=50'))
    assert.equal(page.total, 1)
    assert.equal(page.company_revision, '2')
    assert.equal(page.items[0].user_id, 101)
    assert.equal(page.items[0].weekly.used_microcredits, '15000000')

    // 2) Получение отдельного сотрудника
    const single = await repo.aiUser(undefined, 101)
    assert.equal(single.user_id, 101)
    assert.equal(single.revision, '3')

    // 3) Изменение квоты отдельного сотрудника (PUT)
    await repo.setAiUserQuota(undefined, 101, {
      weekly_quota_microcredits: '60000000',
      five_hour_limit_microcredits: '12000000',
      revision: '3',
      company_revision: '2',
    })
    assert.equal(lastMethod, 'PUT')
    const sentQuota = JSON.parse(lastBody)
    assert.equal(sentQuota.weekly_quota_microcredits, '60000000')
    assert.equal(sentQuota.five_hour_limit_microcredits, '12000000')
    assert.equal(sentQuota.revision, '3')
    assert.equal(sentQuota.company_revision, '2')

    console.log('   User quotas list, pagination & individual quota PUT verified!')
  }

  // ТЕСТ 4: Обработка ошибок 409 (AI_REVISION_CONFLICT, AI_BUDGET_CONFLICT)
  {
    console.log('4. Testing revision conflict (409) & budget conflict (409) classification...')

    const revisionConflictError = new HttpError(
      'Настройки изменились. Обновите данные.',
      409,
      'AI_REVISION_CONFLICT',
      { scope: 'user', expected_revision: '2', current_revision: '3' },
    )

    assert.equal(isAIRevisionConflict(revisionConflictError), true)
    if (isAIRevisionConflict(revisionConflictError)) {
      assert.equal(revisionConflictError.details.scope, 'user')
      assert.equal(revisionConflictError.details.expected_revision, '2')
      assert.equal(revisionConflictError.details.current_revision, '3')
    }

    const budgetConflictError = new HttpError(
      'Недостаточно бюджета компании.',
      409,
      'AI_BUDGET_CONFLICT',
      {
        reason: 'INSUFFICIENT_BUDGET',
        available_microcredits: '5000000',
        required_microcredits: '10000000',
      },
    )

    assert.equal(isAIBudgetConflict(budgetConflictError), true)
    if (isAIBudgetConflict(budgetConflictError)) {
      assert.equal(budgetConflictError.details.reason, 'INSUFFICIENT_BUDGET')
      assert.equal(budgetConflictError.details.available_microcredits, '5000000')
    }

    const configRequiredError = new HttpError('Требуется настройка бюджета', 409, 'AI_CONFIGURATION_REQUIRED')
    assert.equal(isAIConfigurationRequired(configRequiredError), true)

    const suspendedError = new HttpError('Компания заблокирована', 409, 'AI_COMPANY_SUSPENDED')
    assert.equal(isAICompanySuspended(suspendedError), true)

    console.log('   Typed error conflict guards verified successfully!')
  }

  // ТЕСТ 5: Отмена запроса чтения через AbortSignal
  {
    console.log('5. Testing read cancellation with AbortSignal...')

    mockFetchHook = async (store, url, init) => {
      return new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(new DOMException('The user aborted a request.', 'AbortError'))
        })
      })
    }

    const store = new MockAuthSessionStore(1)
    const repo = new HttpAdministrationRepository(store)
    const controller = new AbortController()

    const readPromise = repo.aiBudget(undefined, controller.signal)
    controller.abort()

    await assert.rejects(
      readPromise,
      (err) => err.name === 'AbortError',
      'Aborted request must throw AbortError',
    )

    console.log('   AbortSignal cancellation verified!')
  }

  // ТЕСТ 6: Изоляция кэша по компании и пользователю, защита от гонок при смене компании
  {
    console.log('6. Testing cache isolation by organization & user, and company switch protection...')

    const store = new MockAuthSessionStore(1)
    const repo = new HttpAdministrationRepository(store)

    const budgetOrgA = {
      organization_id: 'org-A',
      server_time: '2026-10-19T10:00:00Z',
      enforcement_mode: 'observe',
      configured: true,
      revision: '1',
      weekly_budget_microcredits: '1000000',
      max_five_hour_microcredits: '100000',
      service_weekly_quota_microcredits: '0',
      period: null,
      employee_allocated_microcredits: '0',
      allocated_microcredits: '0',
      committed_microcredits: '0',
      used_microcredits: '0',
      reserved_microcredits: '0',
      carried_reserved_microcredits: '0',
      unallocated_microcredits: '1000000',
      available_microcredits: '1000000',
      overcommitted_microcredits: null,
      remaining_percent: 100,
      service: { used_microcredits: '0', reserved_microcredits: '0', carried_reserved_microcredits: '0', available_microcredits: '0' },
      capabilities: { set_company_budget: true, set_service_quota: true, set_user_quotas: true },
    }

    const budgetOrgB = {
      ...budgetOrgA,
      organization_id: 'org-B',
      weekly_budget_microcredits: '2000000',
    }

    // Сохраняем в кэш для org-A
    repo.setCachedAiEntry('org-A', 'ai-budget', budgetOrgA)

    // Читаем из кэша для org-A: возвращает org-A
    const cachedA = repo.getCachedAiEntry('org-A', 'ai-budget')
    assert.equal(cachedA.organization_id, 'org-A')

    // Читаем из кэша для org-B: должно вернуть NULL (строгая изоляция!)
    const cachedB = repo.getCachedAiEntry('org-B', 'ai-budget')
    assert.equal(cachedB, null, 'Cache for org-B must not return data of org-A')

    // Сохраняем для org-B
    repo.setCachedAiEntry('org-B', 'ai-budget', budgetOrgB)
    assert.equal(repo.getCachedAiEntry('org-B', 'ai-budget').organization_id, 'org-B')

    // Инвалидируем только org-A
    repo.invalidateAiCache('org-A')
    assert.equal(repo.getCachedAiEntry('org-A', 'ai-budget'), null)
    assert.equal(repo.getCachedAiEntry('org-B', 'ai-budget').organization_id, 'org-B', 'org-B cache must remain intact')

    // Смена пользователя: перелогиниваемся под пользователем 2
    store.userId = 2
    // Кэш прежнего пользователя 1 должен отвергаться
    assert.equal(repo.getCachedAiEntry('org-B', 'ai-budget'), null, 'Cache must be invalidated when user session changes')

    // Complete an old user's HTTP read only after the active session changed.
    store.userId = 1
    repo.clearAiCache()
    let release
    mockFetchHook = () => new Promise(resolve => { release = resolve })
    const pending = repo.aiBudgetCached(undefined)
    store.userId = 2
    release({ json: async () => budgetOrgA })
    await assert.rejects(pending, error => error.name === 'AbortError')
    assert.equal(repo.getCachedAiEntry(undefined, 'ai-budget'), null)

    // Cancellation after fetch but before JSON completion must not seed cache.
    const abort = new AbortController()
    mockFetchHook = async () => ({ json: () => new Promise(resolve => { release = resolve }) })
    const cancelled = repo.aiBudgetCached(undefined, abort.signal)
    for (let i = 0; i < 5; i++) await Promise.resolve()
    abort.abort()
    release(budgetOrgA)
    await assert.rejects(cancelled, error => error.name === 'AbortError')
    assert.equal(repo.getCachedAiEntry(undefined, 'ai-budget'), null)
    console.log('   Cache isolation, late session response and cancellation verified successfully!')
  }

  console.log('\nAll Task 34 administration AI repository tests passed successfully!')
}

runTests().catch((err) => {
  console.error('\nVerification failed:', err)
  process.exit(1)
})
