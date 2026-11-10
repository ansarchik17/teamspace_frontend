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

// Загрузка зависимостей
const { HttpError } = load('src/infrastructure/http/HttpError.ts')
const limitsEntities = load('src/domain/entities/UserAILimits.ts')
const {
  parseUserAILimitsDto,
  formatMicrocredits,
  formatRemainingPercent,
} = limitsEntities

const repoModule = load('src/infrastructure/repositories/HttpUserAILimitsRepository.ts', {
  '../../domain/entities/UserAILimits': limitsEntities,
  '../http/HttpError': { HttpError },
  '../http/authorizedFetch': {
    authorizedFetch: async (sessionStore, url, init) => {
      if (mockFetchHook) {
        return mockFetchHook(sessionStore, url, init)
      }
      throw new Error('mockFetchHook not configured')
    },
  },
})
const { HttpUserAILimitsRepository, SessionChangedError, isAbortError, isSessionChangedError } = repoModule

const useCaseModule = load('src/application/use-cases/ai/GetUserAILimitsUseCase.ts', {
  '../../../domain/entities/UserAILimits': limitsEntities,
})
const { GetUserAILimitsUseCase } = useCaseModule

const AUTH_SESSION_CLEARED_EVENT = 'superapp:auth-session-cleared'
const authEventsModule = {
  AUTH_SESSION_CLEARED_EVENT,
}

// Контролируемый mock для fetch
let mockFetchHook = null

// Моделирование AuthSessionStore
class MockAuthSessionStore {
  constructor(userId = 42) {
    this.userId = userId
  }
  getTokens() {
    if (!this.userId) return null
    const payload = Buffer.from(JSON.stringify({ user_id: this.userId })).toString('base64url')
    return {
      accessToken: `header.${payload}.sig`,
      refreshToken: 'mock-refresh-token',
    }
  }
  setTokens() {}
  clearTokens() {
    this.userId = null
  }
}

// Эмуляция BroadcastChannel
class MockBroadcastChannel {
  static channels = new Map()

  constructor(name) {
    this.name = name
    this.onmessage = null
    this.closed = false
    if (!MockBroadcastChannel.channels.has(name)) {
      MockBroadcastChannel.channels.set(name, new Set())
    }
    MockBroadcastChannel.channels.get(name).add(this)
  }

  postMessage(data) {
    if (this.closed) return
    const listeners = MockBroadcastChannel.channels.get(this.name) || new Set()
    for (const channel of listeners) {
      if (channel !== this && !channel.closed && channel.onmessage) {
        channel.onmessage({ data })
      }
    }
  }

  close() {
    this.closed = true
    const listeners = MockBroadcastChannel.channels.get(this.name)
    if (listeners) {
      listeners.delete(this)
    }
  }
}

// Эмуляция window/document
class MockWindow {
  constructor() {
    this.listeners = new Map()
    this.localStorage = new Map()
    this.localStorage.getItem = (k) => (this.localStorage.has(k) ? this.localStorage.get(k) : null)
    this.localStorage.setItem = (k, v) => {
      this.localStorage.set(k, String(v))
    }
    this.localStorage.removeItem = (k) => {
      this.localStorage.delete(k)
    }
  }

  addEventListener(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event).add(fn)
  }

  removeEventListener(event, fn) {
    if (this.listeners.has(event)) this.listeners.get(event).delete(fn)
  }

  dispatchEvent(event) {
    const set = this.listeners.get(event.type)
    if (set) {
      for (const fn of set) {
        fn(event)
      }
    }
  }
}

const coordinatorModule = load('src/infrastructure/services/UserAILimitsSyncCoordinator.ts', {
  '../../domain/services/AuthSessionStore': {},
  '../../domain/entities/UserAILimits': limitsEntities,
  '../../application/use-cases/ai/GetUserAILimitsUseCase': useCaseModule,
  '../repositories/HttpUserAILimitsRepository': repoModule,
  '../storage/LocalStorageAuthSessionStore': { LocalStorageAuthSessionStore: MockAuthSessionStore },
  '../../shared/auth/authSessionEvents': authEventsModule,
})
const { UserAILimitsSyncCoordinator } = coordinatorModule

function buildSampleLimitsDto({
  serverTime = '2026-10-19T10:00:00Z',
  fiveHourEndsAt = '2026-10-19T15:00:00Z',
  weeklyEndsAt = '2026-10-26T00:00:00Z',
  usedMicrocredits = '2500000',
  remainingPercent = 75,
  canStartRequest = true,
  blockers = [],
} = {}) {
  return {
    server_time: serverTime,
    organization_id: 'org-123',
    enforcement_mode: 'enforced',
    credit_policy_version: 'v1.0.0',
    five_hour: {
      state: 'active',
      limit_microcredits: '10000000',
      used_microcredits: usedMicrocredits,
      reserved_microcredits: '0',
      carried_reserved_microcredits: '0',
      available_microcredits: '7500000',
      remaining_percent: remainingPercent,
      period: {
        id: '5h-window-1',
        starts_at: '2026-10-19T10:00:00Z',
        ends_at: fiveHourEndsAt,
      },
    },
    weekly: {
      state: 'active',
      limit_microcredits: '50000000',
      used_microcredits: '10000000',
      reserved_microcredits: '0',
      carried_reserved_microcredits: '0',
      available_microcredits: '40000000',
      remaining_percent: 80,
      period: {
        id: 'weekly-window-1',
        starts_at: '2026-10-19T00:00:00Z',
        ends_at: weeklyEndsAt,
      },
    },
    access: {
      can_start_request: canStartRequest,
      blockers,
      retry_at: null,
      retry_kind: 'none',
      recheck_at: null,
    },
  }
}

async function runTests() {
  console.log('=== Task 33: Personal AI Limits Synchronization Verification ===\n')

  // Установка глобальных mock объектов для Node окружения
  const mockWin = new MockWindow()
  global.window = mockWin
  global.document = {
    visibilityState: 'visible',
    addEventListener: (ev, fn) => mockWin.addEventListener(ev, fn),
    removeEventListener: (ev, fn) => mockWin.removeEventListener(ev, fn),
  }
  global.BroadcastChannel = MockBroadcastChannel
  global.CustomEvent = class {
    constructor(type, init = {}) {
      this.type = type
      this.detail = init.detail
    }
  }

  // ТЕСТ 1: In-flight дедупликация параллельных запросов
  {
    console.log('1. Testing in-flight request deduplication (storm prevention)...')
    let networkCallsCount = 0
    mockFetchHook = async () => {
      networkCallsCount++
      // Искусственная задержка для проверки параллельных вызовов
      await new Promise((r) => setTimeout(r, 20))
      return {
        ok: true,
        json: async () => buildSampleLimitsDto(),
      }
    }

    const sessionStore = new MockAuthSessionStore(101)
    const repository = new HttpUserAILimitsRepository(sessionStore)
    const useCase = new GetUserAILimitsUseCase(repository)
    const coordinator = new UserAILimitsSyncCoordinator({
      sessionStore,
      useCase,
      cooldownMs: 100,
    })

    // Запускаем 10 параллельных запросов обновления
    const promises = []
    for (let i = 0; i < 10; i++) {
      promises.push(coordinator.refresh({ force: true }))
    }

    const results = await Promise.all(promises)
    assert.equal(networkCallsCount, 1, 'Exactly 1 network request must be made for 10 parallel calls')
    for (const res of results) {
      assert.ok(res, 'All promises must resolve to the same limits object')
      assert.equal(res.fiveHour.usedMicrocredits, '2500000')
    }

    coordinator.destroy()
    console.log('   In-flight deduplication verified: 10 concurrent calls collapsed into 1 HTTP request!')
  }

  // ТЕСТ 2: Управляемые часы и таймер границы периода (ends_at)
  {
    console.log('2. Testing period reset timer and clock skew handling...')
    let networkCallsCount = 0
    let currentDto = buildSampleLimitsDto({
      serverTime: '2026-10-19T12:00:00Z',
      fiveHourEndsAt: '2026-10-19T12:00:01Z', // заканчивается через 1 секунду
      usedMicrocredits: '10000000', // 100% израсходовано
      remainingPercent: 0,
    })

    mockFetchHook = async () => {
      networkCallsCount++
      return {
        ok: true,
        json: async () => currentDto,
      }
    }

    const sessionStore = new MockAuthSessionStore(102)
    const repository = new HttpUserAILimitsRepository(sessionStore)
    const useCase = new GetUserAILimitsUseCase(repository)
    const coordinator = new UserAILimitsSyncCoordinator({
      sessionStore,
      useCase,
      safetySkewMs: 100, // 100ms safety skew в тесте
      cooldownMs: 50,
    })

    let lastReceivedState = null
    const unsubscribe = coordinator.subscribe((st) => {
      lastReceivedState = st
    })

    // Ждем начальной загрузки
    await new Promise((r) => setTimeout(r, 10))
    assert.equal(networkCallsCount, 1)
    assert.equal(lastReceivedState.limits.fiveHour.usedMicrocredits, '10000000')
    assert.equal(lastReceivedState.limits.fiveHour.remainingPercent, 0)

    // Проверяем: таймер браузера НЕ должен самостоятельно локально обнулять расход!
    // До наступления ответа сервера состояние должно оставаться прежним
    assert.equal(lastReceivedState.limits.fiveHour.usedMicrocredits, '10000000')

    // Теперь сервер возвращает новый период со сброшенным расходом
    currentDto = buildSampleLimitsDto({
      serverTime: '2026-10-19T12:00:02Z',
      fiveHourEndsAt: '2026-10-19T17:00:00Z',
      usedMicrocredits: '0',
      remainingPercent: 100,
    })

    // Ждем срабатывания таймера сброса (задержка ~1.1 сек)
    await new Promise((r) => setTimeout(r, 1200))

    assert.ok(networkCallsCount >= 2, 'Timer must trigger network refetch')
    assert.equal(lastReceivedState.limits.fiveHour.usedMicrocredits, '0', 'Network refetch updated used microcredits to 0')
    assert.equal(lastReceivedState.limits.fiveHour.remainingPercent, 100)

    unsubscribe()
    coordinator.destroy()
    console.log('   Period reset timer verified: network refetch triggered without arbitrary client-side state mutation!')
  }

  // ТЕСТ 3: Двухэтапная фиксация после ИИ-операций (мгновенное обновление + отложенный follow-up для автозаголовка)
  {
    console.log('3. Testing two-stage AI operation completion with background follow-up settling...')
    let networkCallsCount = 0
    let step = 1
    mockFetchHook = async () => {
      networkCallsCount++
      if (step === 1) {
        // До операции
        return {
          ok: true,
          json: async () => buildSampleLimitsDto({ usedMicrocredits: '1000000', remainingPercent: 90 }),
        }
      } else if (step === 2) {
        // Сразу после ответа ассистента (основной запрос списал токены)
        return {
          ok: true,
          json: async () => buildSampleLimitsDto({ usedMicrocredits: '2000000', remainingPercent: 80 }),
        }
      } else {
        // После завершения фонового автозаголовка чата
        return {
          ok: true,
          json: async () => buildSampleLimitsDto({ usedMicrocredits: '2300000', remainingPercent: 77 }),
        }
      }
    }

    const sessionStore = new MockAuthSessionStore(103)
    const repository = new HttpUserAILimitsRepository(sessionStore)
    const useCase = new GetUserAILimitsUseCase(repository)
    const coordinator = new UserAILimitsSyncCoordinator({
      sessionStore,
      useCase,
      followUpDelayMs: 200, // 200ms follow-up в тесте
      cooldownMs: 50,
    })

    let lastState = null
    const unsubscribe = coordinator.subscribe((st) => {
      lastState = st
    })
    await new Promise((r) => setTimeout(r, 10))
    assert.equal(networkCallsCount, 1)
    assert.equal(lastState.limits.fiveHour.usedMicrocredits, '1000000')

    // Пользователь завершил запрос к ассистенту
    step = 2
    coordinator.notifyAIOperationCompleted()
    await new Promise((r) => setTimeout(r, 10))
    assert.equal(networkCallsCount, 2, 'Immediate refetch triggered upon operation completion')
    assert.equal(lastState.limits.fiveHour.usedMicrocredits, '2000000')

    // В фоне сработал автозаголовок чата (шаг 3)
    step = 3
    // Ждем срабатывания follow-up таймера (200ms)
    await new Promise((r) => setTimeout(r, 260))
    assert.equal(networkCallsCount, 3, 'Follow-up settling refetch triggered after delay')
    assert.equal(lastState.limits.fiveHour.usedMicrocredits, '2300000')
    assert.equal(lastState.limits.fiveHour.remainingPercent, 77)

    unsubscribe()
    coordinator.destroy()
    console.log('   Two-stage AI operation completion verified: immediate + follow-up settling caught background tokens!')
  }

  // ТЕСТ 4: Синхронизация между вкладками (BroadcastChannel и storage fallback)
  {
    console.log('4. Testing cross-tab synchronization via BroadcastChannel...')
    let networkCallsCountA = 0
    let networkCallsCountB = 0

    mockFetchHook = async (store) => {
      if (store.tab === 'A') {
        networkCallsCountA++
        return { ok: true, json: async () => buildSampleLimitsDto({ usedMicrocredits: '5000000' }) }
      } else {
        networkCallsCountB++
        return { ok: true, json: async () => buildSampleLimitsDto({ usedMicrocredits: '5000000' }) }
      }
    }

    const storeA = new MockAuthSessionStore(104)
    storeA.tab = 'A'
    const coordA = new UserAILimitsSyncCoordinator({
      sessionStore: storeA,
      useCase: new GetUserAILimitsUseCase(new HttpUserAILimitsRepository(storeA)),
      channelName: 'test-cross-tab-channel',
      cooldownMs: 50,
    })

    const storeB = new MockAuthSessionStore(104)
    storeB.tab = 'B'
    const coordB = new UserAILimitsSyncCoordinator({
      sessionStore: storeB,
      useCase: new GetUserAILimitsUseCase(new HttpUserAILimitsRepository(storeB)),
      channelName: 'test-cross-tab-channel',
      cooldownMs: 50,
    })

    const unsubA = coordA.subscribe(() => {})
    const unsubB = coordB.subscribe(() => {})

    await new Promise((r) => setTimeout(r, 20))
    assert.equal(networkCallsCountA, 1)
    assert.equal(networkCallsCountB, 1)

    // Вкладка A выполняет операцию и оповещает вкладку B
    coordA.notifyAIOperationCompleted()
    await new Promise((r) => setTimeout(r, 60))

    // Вкладка B должна была получить сообщение и сделать повторный запрос
    assert.equal(networkCallsCountB, 2, 'Tab B must refetch limits upon notification from Tab A')

    unsubA()
    unsubB()
    coordA.destroy()
    coordB.destroy()
    console.log('   Cross-tab synchronization verified: message from Tab A triggered refresh in Tab B!')
  }

  // ТЕСТ 5: Выход из сна / смена видимости вкладки (visibilitychange & focus)
  {
    console.log('5. Testing wake-from-sleep and tab visibility transitions...')
    let networkCallsCount = 0
    mockFetchHook = async () => {
      networkCallsCount++
      return { ok: true, json: async () => buildSampleLimitsDto() }
    }

    const sessionStore = new MockAuthSessionStore(105)
    const coordinator = new UserAILimitsSyncCoordinator({
      sessionStore,
      useCase: new GetUserAILimitsUseCase(new HttpUserAILimitsRepository(sessionStore)),
      cooldownMs: 500, // кулдаун 500мс
      staleThresholdMs: 1000,
    })

    const unsub = coordinator.subscribe(() => {})
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(networkCallsCount, 1)

    // Переключение вкладки во время кулдауна (менее 500мс): сетевой вызов блокируется кулдауном
    global.document.visibilityState = 'hidden'
    mockWin.dispatchEvent(new CustomEvent('visibilitychange'))
    global.document.visibilityState = 'visible'
    mockWin.dispatchEvent(new CustomEvent('visibilitychange'))
    mockWin.dispatchEvent(new CustomEvent('focus'))
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(networkCallsCount, 1, 'Rapid tab focus during cooldown must not trigger network storm')

    // Теперь эмулируем наступление границы периода во время сна
    const nowIso = new Date().toISOString()
    const pastLimits = buildSampleLimitsDto({
      serverTime: nowIso,
      fiveHourEndsAt: new Date(Date.now() - 5000).toISOString(), // граница уже позади!
    })
    coordinator.schedulePeriodResetTimer(parseUserAILimitsDto(pastLimits))

    // Пользователь разворачивает вкладку после сна
    global.document.visibilityState = 'visible'
    mockWin.dispatchEvent(new CustomEvent('visibilitychange'))
    await new Promise((r) => setTimeout(r, 20))

    assert.equal(networkCallsCount, 2, 'Visibility change when period boundary has passed must immediately refresh')

    unsub()
    coordinator.destroy()
    console.log('   Wake-from-sleep and visibility checks verified without polling storms!')
  }

  // ТЕСТ 6: Смена пользователя и защита от запоздалых ответов
  {
    console.log('6. Testing session change, abort controller, and stale response rejection...')
    let delayedResolve = null
    mockFetchHook = async (store, url, init) => {
      // Имитируем медленный сетевой ответ для пользователя 106
      return new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(new DOMException('Request aborted', 'AbortError'))
        })
        delayedResolve = () => {
          resolve({
            ok: true,
            json: async () => buildSampleLimitsDto({ usedMicrocredits: '9999999' }),
          })
        }
      })
    }

    const sessionStore = new MockAuthSessionStore(106)
    const coordinator = new UserAILimitsSyncCoordinator({
      sessionStore,
      useCase: new GetUserAILimitsUseCase(new HttpUserAILimitsRepository(sessionStore)),
      cooldownMs: 50,
    })

    let lastState = null
    const unsub = coordinator.subscribe((st) => {
      lastState = st
    })

    // Начат запрос для пользователя 106
    assert.equal(lastState.loading, true)

    // Пользователь нажимает "Выйти" или перелогинивается
    sessionStore.clearTokens()
    mockWin.dispatchEvent(new CustomEvent(AUTH_SESSION_CLEARED_EVENT))

    // Состояние немедленно сбрасывается в null
    assert.equal(lastState.limits, null)
    assert.equal(lastState.loading, false)

    // Теперь медленный ответ всё же завершился от сетевого драйвера
    if (delayedResolve) {
      delayedResolve()
    }
    await new Promise((r) => setTimeout(r, 20))

    // Результат пользователя 106 НЕ ДОЛЖЕН перезаписать данные
    assert.equal(lastState.limits, null, 'Stale response from previous user must be discarded!')

    unsub()
    coordinator.destroy()
    console.log('   Session change and stale response isolation verified successfully!')
  }

  // Deferred reads and a controlled timer queue: no timing-dependent sleeps.
  {
    const originalTimeout = global.setTimeout
    const originalClearTimeout = global.clearTimeout
    const timers = new Map()
    let nextTimer = 0
    global.setTimeout = (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id }
    global.clearTimeout = id => timers.delete(id)
    const pending = []
    let calls = 0
    const data = parseUserAILimitsDto(buildSampleLimitsDto())
    const coordinator = new UserAILimitsSyncCoordinator({
      sessionStore: new MockAuthSessionStore(107),
      useCase: { execute: () => { calls++; return new Promise(resolve => pending.push(resolve)) } },
      followUpDelayMs: 2500,
    })
    const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve() }
    try {
      let unsubscribe = coordinator.subscribe(() => {})
      pending.shift()(data)
      await flush()
      assert.ok(coordinator.periodTimer !== null)
      unsubscribe()
      assert.equal(coordinator.periodTimer, null)
      unsubscribe = coordinator.subscribe(() => {})
      assert.equal(calls, 2, 'Re-subscribe must re-read data and restore period scheduling')

      coordinator.notifyAIOperationCompleted()
      const followUp = timers.get(coordinator.followUpTimer)
      followUp.callback()
      assert.equal(calls, 2, 'Invalidations during a read must coalesce')
      pending.shift()(data)
      await flush()
      assert.equal(calls, 3, 'A fresh read must follow the stale in-flight result')
      pending.shift()({ ...data, creditPolicyVersion: 'fresh' })
      await flush()
      assert.equal(coordinator.getState().limits.creditPolicyVersion, 'fresh')
      assert.ok(coordinator.periodTimer !== null)
      assert.equal(calls, 3, 'No unbounded polling after invalidations settle')
      unsubscribe()
    } finally {
      coordinator.destroy()
      global.setTimeout = originalTimeout
      global.clearTimeout = originalClearTimeout
    }
    console.log('   Re-subscribe timers and invalidations during deferred reads verified!')
  }

  console.log('\nAll Task 33 synchronization verification tests passed successfully!')
}

runTests().catch((err) => {
  console.error('\nVerification failed:', err)
  process.exit(1)
})
