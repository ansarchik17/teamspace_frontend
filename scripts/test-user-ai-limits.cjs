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

const { HttpError } = load('src/infrastructure/http/HttpError.ts')
const limitsEntities = load('src/domain/entities/UserAILimits.ts')
const {
  parseUserAILimitsDto,
  formatMicrocredits,
  formatRemainingPercent,
  microcreditsToCreditsBigInt,
} = limitsEntities

const {
  HttpUserAILimitsRepository,
  SessionChangedError,
  isAbortError,
  isSessionChangedError,
} = load('src/infrastructure/repositories/HttpUserAILimitsRepository.ts', {
  '../../domain/entities/UserAILimits': limitsEntities,
  '../http/HttpError': { HttpError },
  '../http/authorizedFetch': {
    authorizedFetch: async (sessionStore, url, init) => {
      assert.equal(url, '/api/v1/ai/limits')
      assert.equal(init.method, 'GET')
      assert.equal(init.cache, 'no-store')
      assert.equal(init.headers?.Accept, 'application/json')

      if (mockFetchHook) {
        return mockFetchHook(sessionStore, url, init)
      }
      throw new Error('mockFetchHook not configured')
    },
  },
})

const { GetUserAILimitsUseCase } = load('src/application/use-cases/ai/GetUserAILimitsUseCase.ts', {
  '../../../domain/entities/UserAILimits': limitsEntities,
})

let mockFetchHook = null

;(async () => {
  // 1. Форматирование микрокредитов и процентов
  assert.equal(formatMicrocredits('100000000'), '100.00')
  assert.equal(formatMicrocredits('100000000', 0), '100')
  assert.equal(formatMicrocredits('500000'), '0.50')
  assert.equal(formatMicrocredits('0'), '0.00')
  assert.equal(formatMicrocredits(null), '—')
  assert.equal(formatMicrocredits(undefined), '—')

  // Огромные числа (> 2^53 - 1 = 9007199254740991) сохраняют точность через BigInt
  const hugeMicrocredits = '99999999999999999999'
  assert.equal(formatMicrocredits(hugeMicrocredits, 2), '99999999999999.99')
  assert.equal(microcreditsToCreditsBigInt('100000000'), 100n)

  // Проценты:
  assert.equal(formatRemainingPercent(70, '70000000'), '70%')
  assert.equal(formatRemainingPercent(null, null), '—')
  assert.equal(formatRemainingPercent(undefined, null), '—')
  assert.equal(formatRemainingPercent(0, '500000'), '< 1%') // Остаток есть, но < 1%
  assert.equal(formatRemainingPercent(0, '0'), '0%') // Действительно ноль
  assert.equal(formatRemainingPercent(0, null), '0%')

  // 2. Успешный ответ (Active)
  const activePayload = {
    server_time: '2026-10-16T06:00:00Z',
    organization_id: 'f4673508-34cb-4dc7-9c17-f664271eb50f',
    enforcement_mode: 'observe',
    credit_policy_version: 'credits-v1',
    five_hour: {
      state: 'active',
      limit_microcredits: '100000000',
      used_microcredits: '30000000',
      reserved_microcredits: '0',
      carried_reserved_microcredits: '0',
      available_microcredits: '70000000',
      remaining_percent: 70,
      period: {
        id: '32ef21c9-155e-42f8-a2de-2be807ba072e',
        starts_at: '2026-10-16T05:20:00Z',
        ends_at: '2026-10-16T10:20:00Z',
      },
    },
    weekly: {
      state: 'active',
      limit_microcredits: '1000000000',
      used_microcredits: '30000000',
      reserved_microcredits: '0',
      carried_reserved_microcredits: '0',
      available_microcredits: '970000000',
      remaining_percent: 97,
      period: {
        id: '4bdeec70-7294-4c1c-96a7-f49109329981',
        starts_at: '2026-10-16T05:00:00Z',
        ends_at: '2026-10-23T05:00:00Z',
      },
    },
    access: {
      can_start_request: true,
      blockers: [],
      retry_at: null,
      retry_kind: 'none',
      recheck_at: null,
    },
  }

  const parsedActive = parseUserAILimitsDto(activePayload)
  assert.equal(parsedActive.serverTime, '2026-10-16T06:00:00Z')
  assert.equal(parsedActive.organizationId, 'f4673508-34cb-4dc7-9c17-f664271eb50f')
  assert.equal(parsedActive.enforcementMode, 'observe')
  assert.equal(parsedActive.creditPolicyVersion, 'credits-v1')
  assert.equal(parsedActive.fiveHour.state, 'active')
  assert.equal(parsedActive.fiveHour.limitMicrocredits, '100000000')
  assert.equal(parsedActive.fiveHour.usedMicrocredits, '30000000')
  assert.equal(parsedActive.fiveHour.availableMicrocredits, '70000000')
  assert.equal(parsedActive.fiveHour.remainingPercent, 70)
  assert.equal(parsedActive.fiveHour.period?.id, '32ef21c9-155e-42f8-a2de-2be807ba072e')
  assert.equal(parsedActive.fiveHour.period?.startsAt, '2026-10-16T05:20:00Z')
  assert.equal(parsedActive.access.canStartRequest, true)
  assert.equal(parsedActive.access.blockers.length, 0)
  assert.equal(parsedActive.access.retryKind, 'none')

  // 3. Отсутствие настройки (Unconfigured)
  const unconfiguredPayload = {
    server_time: '2026-10-16T06:00:00Z',
    organization_id: 'f4673508-34cb-4dc7-9c17-f664271eb50f',
    enforcement_mode: 'observe',
    credit_policy_version: 'credits-v1',
    five_hour: {
      state: 'unconfigured',
      limit_microcredits: null,
      used_microcredits: '0',
      reserved_microcredits: '0',
      carried_reserved_microcredits: '0',
      available_microcredits: null,
      remaining_percent: null,
      period: null,
    },
    weekly: {
      state: 'unconfigured',
      limit_microcredits: null,
      used_microcredits: '0',
      reserved_microcredits: '0',
      carried_reserved_microcredits: '0',
      available_microcredits: null,
      remaining_percent: null,
      period: null,
    },
    access: {
      can_start_request: false,
      blockers: [
        {
          reason: 'USER_QUOTA_UNCONFIGURED',
          scope: 'account',
          enforced: true,
          resets_at: null,
        },
      ],
      retry_at: null,
      retry_kind: 'requires_action',
      recheck_at: null,
    },
  }

  const parsedUnconfigured = parseUserAILimitsDto(unconfiguredPayload)
  assert.equal(parsedUnconfigured.fiveHour.state, 'unconfigured')
  assert.equal(parsedUnconfigured.fiveHour.limitMicrocredits, null)
  assert.equal(parsedUnconfigured.fiveHour.availableMicrocredits, null)
  assert.equal(parsedUnconfigured.fiveHour.remainingPercent, null)
  assert.equal(parsedUnconfigured.fiveHour.period, null)
  assert.equal(parsedUnconfigured.access.canStartRequest, false)
  assert.equal(parsedUnconfigured.access.blockers.length, 1)
  assert.equal(parsedUnconfigured.access.blockers[0].reason, 'USER_QUOTA_UNCONFIGURED')
  assert.equal(parsedUnconfigured.access.blockers[0].scope, 'account')
  assert.equal(parsedUnconfigured.access.retryKind, 'requires_action')

  // 4. Нулевые лимиты (Disabled)
  const disabledPayload = {
    server_time: '2026-10-16T06:00:00Z',
    organization_id: 'f4673508-34cb-4dc7-9c17-f664271eb50f',
    enforcement_mode: 'observe',
    credit_policy_version: 'credits-v1',
    five_hour: {
      state: 'disabled',
      limit_microcredits: '0',
      used_microcredits: '0',
      reserved_microcredits: '0',
      carried_reserved_microcredits: '0',
      available_microcredits: '0',
      remaining_percent: null,
      period: null,
    },
    weekly: {
      state: 'disabled',
      limit_microcredits: '0',
      used_microcredits: '0',
      reserved_microcredits: '0',
      carried_reserved_microcredits: '0',
      available_microcredits: '0',
      remaining_percent: null,
      period: null,
    },
    access: {
      can_start_request: false,
      blockers: [
        {
          reason: 'USER_QUOTA_DISABLED',
          scope: 'weekly',
          enforced: true,
          resets_at: null,
        },
      ],
      retry_at: null,
      retry_kind: 'requires_action',
      recheck_at: null,
    },
  }

  const parsedDisabled = parseUserAILimitsDto(disabledPayload)
  assert.equal(parsedDisabled.fiveHour.state, 'disabled')
  assert.equal(parsedDisabled.fiveHour.limitMicrocredits, '0')
  assert.equal(parsedDisabled.fiveHour.availableMicrocredits, '0')
  assert.equal(parsedDisabled.fiveHour.remainingPercent, null)
  assert.equal(parsedDisabled.access.blockers[0].reason, 'USER_QUOTA_DISABLED')

  // 5. Исчерпание квоты (Exhausted) с оценкой времени сброса
  const exhaustedPayload = {
    server_time: '2026-10-16T06:00:00Z',
    organization_id: 'f4673508-34cb-4dc7-9c17-f664271eb50f',
    enforcement_mode: 'enforced',
    credit_policy_version: 'credits-v1',
    five_hour: {
      state: 'exhausted',
      limit_microcredits: '100000000',
      used_microcredits: '100000000',
      reserved_microcredits: '0',
      carried_reserved_microcredits: '0',
      available_microcredits: '0',
      remaining_percent: 0,
      period: {
        id: '32ef21c9-155e-42f8-a2de-2be807ba072e',
        starts_at: '2026-10-16T05:20:00Z',
        ends_at: '2026-10-16T10:20:00Z',
      },
    },
    weekly: {
      state: 'active',
      limit_microcredits: '1000000000',
      used_microcredits: '100000000',
      reserved_microcredits: '0',
      carried_reserved_microcredits: '0',
      available_microcredits: '900000000',
      remaining_percent: 90,
      period: {
        id: '4bdeec70-7294-4c1c-96a7-f49109329981',
        starts_at: '2026-10-16T05:00:00Z',
        ends_at: '2026-10-23T05:00:00Z',
      },
    },
    access: {
      can_start_request: false,
      blockers: [
        {
          reason: 'FIVE_HOUR_EXHAUSTED',
          scope: 'five_hour',
          enforced: true,
          resets_at: '2026-10-16T10:20:00Z',
        },
      ],
      retry_at: '2026-10-16T10:20:00Z',
      retry_kind: 'estimated',
      recheck_at: '2026-10-16T10:20:00Z',
    },
  }

  const parsedExhausted = parseUserAILimitsDto(exhaustedPayload)
  assert.equal(parsedExhausted.fiveHour.state, 'exhausted')
  assert.equal(parsedExhausted.fiveHour.availableMicrocredits, '0')
  assert.equal(parsedExhausted.fiveHour.remainingPercent, 0)
  assert.equal(parsedExhausted.access.canStartRequest, false)
  assert.equal(parsedExhausted.access.retryKind, 'estimated')
  assert.equal(parsedExhausted.access.retryAt, '2026-10-16T10:20:00Z')

  // 6. HttpUserAILimitsRepository - Успешный запрос
  let token = 'token-user-1'
  const store = {
    getTokens: () => (token ? { accessToken: token } : null),
  }

  mockFetchHook = async () => ({
    ok: true,
    json: async () => activePayload,
  })

  const repository = new HttpUserAILimitsRepository(store)
  const useCase = new GetUserAILimitsUseCase(repository)
  const res = await useCase.execute()
  assert.equal(res.organizationId, 'f4673508-34cb-4dc7-9c17-f664271eb50f')
  assert.equal(res.weekly.remainingPercent, 97)

  // 7. HttpUserAILimitsRepository - Ошибки сервера (401, 403, 429, 503)
  for (const { status, code, details } of [
    { status: 401, code: 'UNAUTHORIZED' },
    { status: 403, code: 'AI_ACCESS_DISABLED', details: { reason: 'AI_ACCESS_DENIED', scope: 'account' } },
    { status: 429, code: 'AI_QUOTA_EXCEEDED', details: { retry_kind: 'estimated' } },
    { status: 503, code: 'AI_LIMITER_UNAVAILABLE' },
  ]) {
    mockFetchHook = async () => {
      throw new HttpError('Test error', status, code, details)
    }
    await assert.rejects(
      repository.getLimits(),
      err => err instanceof HttpError && err.status === status && err.code === code,
    )
  }

  // 8. HttpUserAILimitsRepository - Некорректный JSON (502)
  mockFetchHook = async () => ({
    ok: true,
    json: async () => {
      throw new Error('invalid json')
    },
  })
  await assert.rejects(repository.getLimits(), { status: 502 })

  mockFetchHook = async () => ({
    ok: true,
    json: async () => ({ unexpected: true }), // Missing server_time
  })
  await assert.rejects(repository.getLimits(), { status: 502 })

  // 9. HttpUserAILimitsRepository - Отмена через AbortSignal
  mockFetchHook = async (_store, _url, init) => {
    init.signal.throwIfAborted()
    const error = new Error('The user aborted a request.')
    error.name = 'AbortError'
    throw error
  }

  const abortController = new AbortController()
  abortController.abort()

  let abortErrorCaught = false
  try {
    await repository.getLimits(abortController.signal)
  } catch (err) {
    abortErrorCaught = true
    assert.ok(isAbortError(err), 'isAbortError must return true for AbortError')
  }
  assert.ok(abortErrorCaught, 'Should reject with AbortError')

  // 10. HttpUserAILimitsRepository - Защита от смены сессии / пользователя
  token = 'token-user-1'
  mockFetchHook = async () => {
    // В процессе запроса произошла смена сессии (другой пользователь вошел)
    token = 'token-user-2'
    return {
      ok: true,
      json: async () => activePayload,
    }
  }

  let sessionChangedCaught = false
  try {
    await repository.getLimits()
  } catch (err) {
    sessionChangedCaught = true
    assert.ok(err instanceof SessionChangedError, 'Must throw SessionChangedError')
    assert.ok(isSessionChangedError(err), 'isSessionChangedError must return true')
  }
  assert.ok(sessionChangedCaught, 'Must detect session change and reject stale response')

  // Session changes and aborts while consuming the response body must win over parsing.
  token = 'body-user-1'
  mockFetchHook = async () => ({ json: async () => { token = 'body-user-2'; return activePayload } })
  await assert.rejects(repository.getLimits(), err => isSessionChangedError(err))
  const bodyAbort = new AbortController()
  mockFetchHook = async () => ({ json: async () => { bodyAbort.abort(); throw new Error('body interrupted') } })
  await assert.rejects(repository.getLimits(bodyAbort.signal), err => isAbortError(err))

  const jwt = (id, nonce) => `x.${Buffer.from(JSON.stringify({ user_id: id, nonce })).toString('base64url')}.x`
  token = jwt(1, 'old')
  mockFetchHook = async () => { token = jwt(1, 'refreshed'); return { json: async () => activePayload } }
  assert.equal((await repository.getLimits()).weekly.remainingPercent, 97)
  mockFetchHook = async () => ({ json: async () => { token = jwt(2, 'login'); return activePayload } })
  await assert.rejects(repository.getLimits(), err => isSessionChangedError(err))

  console.log('Personal AI limits repository and use-case contract tests passed successfully!')
})().catch(err => {
  console.error(err)
  process.exitCode = 1
})
