import type { AuthSessionStore } from '../../domain/services/AuthSessionStore'
import type { UserAILimits } from '../../domain/entities/UserAILimits'
import { GetUserAILimitsUseCase } from '../../application/use-cases/ai/GetUserAILimitsUseCase'
import {
  HttpUserAILimitsRepository,
  isAbortError,
  isSessionChangedError,
} from '../repositories/HttpUserAILimitsRepository'
import { LocalStorageAuthSessionStore } from '../storage/LocalStorageAuthSessionStore'
import { AUTH_SESSION_CLEARED_EVENT } from '../../shared/auth/authSessionEvents'

export interface LimitsSyncState {
  limits: UserAILimits | null
  loading: boolean
  error: Error | null
}

export type LimitsSyncListener = (state: LimitsSyncState) => void

export interface RefreshOptions {
  force?: boolean
  reason?: string
  invalidate?: boolean
}

export interface UserAILimitsSyncCoordinatorOptions {
  sessionStore?: AuthSessionStore
  useCase?: GetUserAILimitsUseCase
  cooldownMs?: number
  safetySkewMs?: number
  followUpDelayMs?: number
  staleThresholdMs?: number
  channelName?: string
  storageKey?: string
}

const DEFAULT_COOLDOWN_MS = 2000
const DEFAULT_SAFETY_SKEW_MS = 1000
const DEFAULT_FOLLOW_UP_DELAY_MS = 2500
const DEFAULT_STALE_THRESHOLD_MS = 60_000
const DEFAULT_CHANNEL_NAME = 'superapp:ai-limits'
const DEFAULT_STORAGE_KEY = 'superapp:ai-limits-sync'
const MAX_TIMEOUT_MS = 2_147_483_647

function extractSessionIdentity(token?: string): string | undefined {
  if (!token) return undefined
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '=')))
    if (typeof claims.user_id === 'number' && claims.user_id > 0) return `user:${claims.user_id}`
  } catch {
    /* Opaque tokens retain strict string equality */
  }
  return token
}

export class UserAILimitsSyncCoordinator {
  private static instance: UserAILimitsSyncCoordinator | null = null

  private readonly sessionStore: AuthSessionStore
  private readonly useCase: GetUserAILimitsUseCase
  private readonly cooldownMs: number
  private readonly safetySkewMs: number
  private readonly followUpDelayMs: number
  private readonly staleThresholdMs: number
  private readonly channelName: string
  private readonly storageKey: string
  private readonly tabId: string

  private state: LimitsSyncState = {
    limits: null,
    loading: false,
    error: null,
  }

  private subscribers = new Set<LimitsSyncListener>()
  private inFlightPromise: Promise<UserAILimits | null> | null = null
  private activeAbortController: AbortController | null = null
  private refreshAfterFlight = false

  private lastSuccessTimeMs = 0
  private lastSessionIdentity: string | undefined = undefined
  private nextPeriodResetTargetTimeMs: number | null = null
  private hasEverLoaded = false

  private periodTimer: ReturnType<typeof setTimeout> | null = null
  private followUpTimer: ReturnType<typeof setTimeout> | null = null
  private cooldownTimer: ReturnType<typeof setTimeout> | null = null

  private broadcastChannel: BroadcastChannel | null = null
  private isBrowserListenersBound = false

  constructor(options: UserAILimitsSyncCoordinatorOptions = {}) {
    this.sessionStore = options.sessionStore ?? new LocalStorageAuthSessionStore()
    const repository = new HttpUserAILimitsRepository(this.sessionStore)
    this.useCase = options.useCase ?? new GetUserAILimitsUseCase(repository)

    this.cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS
    this.safetySkewMs = options.safetySkewMs ?? DEFAULT_SAFETY_SKEW_MS
    this.followUpDelayMs = options.followUpDelayMs ?? DEFAULT_FOLLOW_UP_DELAY_MS
    this.staleThresholdMs = options.staleThresholdMs ?? DEFAULT_STALE_THRESHOLD_MS
    this.channelName = options.channelName ?? DEFAULT_CHANNEL_NAME
    this.storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY
    this.tabId = `tab_${Math.random().toString(36).slice(2, 9)}_${Date.now()}`
  }

  public static getInstance(): UserAILimitsSyncCoordinator {
    if (!UserAILimitsSyncCoordinator.instance) {
      UserAILimitsSyncCoordinator.instance = new UserAILimitsSyncCoordinator()
    }
    return UserAILimitsSyncCoordinator.instance
  }

  public static setInstanceForTesting(instance: UserAILimitsSyncCoordinator | null): void {
    UserAILimitsSyncCoordinator.instance = instance
  }

  public getState(): LimitsSyncState {
    return this.state
  }

  public subscribe(listener: LimitsSyncListener): () => void {
    this.subscribers.add(listener)

    if (this.subscribers.size === 1) {
      this.bindBrowserListeners()
      // Re-read on return: the previous unsubscribe removed the period timer.
      void this.refresh({ force: true, reason: 'subscribe' })
    }

    listener(this.state)

    return () => {
      this.subscribers.delete(listener)
      if (this.subscribers.size === 0) {
        this.unbindBrowserListeners()
        this.clearAllTimers()
      }
    }
  }

  public async refresh(options: RefreshOptions = {}): Promise<UserAILimits | null> {
    const currentSession = this.getCurrentSessionIdentity()

    // Если сессия сменилась или сброшена до начала запроса
    if (!currentSession) {
      this.resetStateDueToSession(null)
      return null
    }

    if (this.lastSessionIdentity !== undefined && this.lastSessionIdentity !== currentSession) {
      this.resetStateDueToSession(null)
    }

    // Дедупликация: если сетевой запрос уже выполняется
    if (this.inFlightPromise) {
      if (options.invalidate) this.refreshAfterFlight = true
      return this.inFlightPromise
    }

    // Проверка кулдауна для автоматических (не форсированных) вызовов
    const now = Date.now()
    const elapsedSinceLastSuccess = now - this.lastSuccessTimeMs
    if (!options.force && this.hasEverLoaded && elapsedSinceLastSuccess < this.cooldownMs) {
      const remainingCooldown = this.cooldownMs - elapsedSinceLastSuccess
      if (!this.cooldownTimer) {
        this.cooldownTimer = setTimeout(() => {
          this.cooldownTimer = null
          void this.refresh({ force: false, reason: 'cooldown_settled' })
        }, remainingCooldown)
      }
      return this.state.limits
    }

    // Снимаем запланированный таймер кулдауна, так как запускаем запрос
    if (this.cooldownTimer) {
      clearTimeout(this.cooldownTimer)
      this.cooldownTimer = null
    }

    const abortController = new AbortController()
    this.activeAbortController = abortController
    const requestSessionIdentity = currentSession
    this.lastSessionIdentity = currentSession

    this.state = {
      ...this.state,
      loading: true,
      error: null,
    }
    this.notifySubscribers()

    this.inFlightPromise = (async () => {
      try {
        const data = await this.useCase.execute(abortController.signal)

        // Защита от гонок и смены пользователя: проверяем актуальность сессии
        if (
          abortController.signal.aborted ||
          this.getCurrentSessionIdentity() !== requestSessionIdentity
        ) {
          return null
        }

        this.lastSuccessTimeMs = Date.now()
        this.lastSessionIdentity = requestSessionIdentity
        this.hasEverLoaded = true
        this.state = {
          limits: data,
          loading: false,
          error: null,
        }
        this.notifySubscribers()

        // Планируем таймер обновления по серверной границе периода
        this.schedulePeriodResetTimer(data)

        return data
      } catch (err) {
        if (abortController.signal.aborted || isAbortError(err)) {
          return this.state.limits
        }

        if (
          isSessionChangedError(err) ||
          this.getCurrentSessionIdentity() !== requestSessionIdentity
        ) {
          this.resetStateDueToSession(null)
          return null
        }

        const normalizedError = err instanceof Error ? err : new Error(String(err))
        this.state = {
          ...this.state,
          loading: false,
          error: normalizedError,
        }
        this.notifySubscribers()
        return null
      } finally {
        if (this.activeAbortController === abortController) {
          this.activeAbortController = null
          this.inFlightPromise = null
          if (this.refreshAfterFlight) {
            this.refreshAfterFlight = false
            void this.refresh({ force: true, reason: 'pending_invalidation' })
          }
        }
      }
    })()

    return this.inFlightPromise
  }

  /**
   * Рассчитывает серверную границу сброса периода и выставляет таймер сетевого повторного чтения.
   * Таймер браузера инициирует повторное чтение с сервера, а не самостоятельно обнуляет расход.
   */
  public schedulePeriodResetTimer(limits: UserAILimits): void {
    this.clearPeriodTimer()

    const serverTimeMs = new Date(limits.serverTime).getTime()
    const clientNow = Date.now()
    const clockSkewMs = Number.isNaN(serverTimeMs) ? 0 : serverTimeMs - clientNow

    const candidateEndsAtMs: number[] = []
    if (limits.fiveHour.period?.endsAt) {
      const ms = new Date(limits.fiveHour.period.endsAt).getTime()
      if (!Number.isNaN(ms)) candidateEndsAtMs.push(ms)
    }
    if (limits.weekly.period?.endsAt) {
      const ms = new Date(limits.weekly.period.endsAt).getTime()
      if (!Number.isNaN(ms)) candidateEndsAtMs.push(ms)
    }
    if (limits.access.recheckAt) {
      const ms = new Date(limits.access.recheckAt).getTime()
      if (!Number.isNaN(ms)) candidateEndsAtMs.push(ms)
    }
    if (limits.access.retryAt) {
      const ms = new Date(limits.access.retryAt).getTime()
      if (!Number.isNaN(ms)) candidateEndsAtMs.push(ms)
    }
    for (const blocker of limits.access.blockers) {
      if (blocker.resetsAt) {
        const ms = new Date(blocker.resetsAt).getTime()
        if (!Number.isNaN(ms)) candidateEndsAtMs.push(ms)
      }
    }

    if (candidateEndsAtMs.length === 0) {
      this.nextPeriodResetTargetTimeMs = null
      return
    }

    const nearestEndsAtMs = Math.min(...candidateEndsAtMs)
    const targetClientTimeMs = nearestEndsAtMs - clockSkewMs
    this.nextPeriodResetTargetTimeMs = targetClientTimeMs

    const delayMs = targetClientTimeMs - clientNow

    if (delayMs <= 0) {
      // Граница периода уже наступила — планируем сетевой запрос
      void this.refresh({ force: false, reason: 'period_reset_immediate' })
      return
    }

    const timerDelay = Math.min(delayMs + this.safetySkewMs, MAX_TIMEOUT_MS)
    this.periodTimer = setTimeout(() => {
      this.periodTimer = null
      // Таймер браузера инициирует повторное чтение, а не самостоятельно обнуляет расход
      void this.refresh({ force: true, reason: 'period_reset' })
    }, timerDelay)
  }

  /**
   * Вызывается после завершения платной ИИ-операции.
   * Инициирует немедленное обновление, оповещает другие вкладки,
   * а также планирует отложенный follow-up запрос для фонового расхода (автозаголовок).
   */
  public notifyAIOperationCompleted(): void {
    void this.refresh({ force: true, invalidate: true, reason: 'ai_completed' })
    this.broadcastInvalidation('ai_completed')

    if (this.followUpTimer) {
      clearTimeout(this.followUpTimer)
      this.followUpTimer = null
    }

    this.followUpTimer = setTimeout(() => {
      this.followUpTimer = null
      void this.refresh({ force: false, invalidate: true, reason: 'ai_follow_up' })
    }, this.followUpDelayMs)
  }

  /**
   * Вызывается при отказе по лимиту или ручной инвалидации.
   */
  public notifyLimitsInvalidated(reason = 'limits_invalidated'): void {
    void this.refresh({ force: true, invalidate: true, reason })
    this.broadcastInvalidation(reason)
  }

  private broadcastInvalidation(reason: string): void {
    const payload = {
      type: 'limits_invalidated',
      reason,
      senderId: this.tabId,
      timestamp: Date.now(),
    }

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(payload)
      } catch {
        /* ignore channel post failure */
      }
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(this.storageKey, JSON.stringify(payload))
      } catch {
        /* ignore localStorage quota/disabled failure */
      }
    }
  }

  private handleCrossTabMessage(senderId?: string): void {
    if (!senderId || senderId === this.tabId) {
      return
    }
    void this.refresh({ force: false, invalidate: true, reason: 'cross_tab' })
  }

  private handleVisibilityOrFocus = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return
    }

    const now = Date.now()

    // 1. Проверяем, не наступила ли граница периода во время неактивности/сна вкладки
    if (
      this.nextPeriodResetTargetTimeMs !== null &&
      now >= this.nextPeriodResetTargetTimeMs
    ) {
      void this.refresh({ force: true, reason: 'period_reset_visibility' })
      return
    }

    // 2. Если данные устарели или ещё не загружены — фоновое обновление с кулдауном
    if (!this.hasEverLoaded || now - this.lastSuccessTimeMs >= this.staleThresholdMs) {
      void this.refresh({ force: false, reason: 'visibility' })
    }
  }

  private handleSessionCleared = (): void => {
    this.resetStateDueToSession(null)
  }

  private resetStateDueToSession(newLimits: UserAILimits | null): void {
    if (this.activeAbortController) {
      this.activeAbortController.abort()
      this.activeAbortController = null
    }
    this.inFlightPromise = null
    this.refreshAfterFlight = false
    this.clearAllTimers()
    this.lastSessionIdentity = this.getCurrentSessionIdentity()
    this.nextPeriodResetTargetTimeMs = null
    this.hasEverLoaded = false
    this.state = {
      limits: newLimits,
      loading: false,
      error: null,
    }
    this.notifySubscribers()
  }

  private getCurrentSessionIdentity(): string | undefined {
    return extractSessionIdentity(this.sessionStore.getTokens()?.accessToken)
  }

  private notifySubscribers(): void {
    for (const listener of this.subscribers) {
      listener(this.state)
    }
  }

  private bindBrowserListeners(): void {
    if (this.isBrowserListenersBound || typeof window === 'undefined') {
      return
    }
    this.isBrowserListenersBound = true

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel(this.channelName)
        this.broadcastChannel.onmessage = (event: MessageEvent) => {
          if (event.data?.type === 'limits_invalidated') {
            this.handleCrossTabMessage(event.data?.senderId)
          }
        }
      } catch {
        this.broadcastChannel = null
      }
    }

    window.addEventListener(AUTH_SESSION_CLEARED_EVENT, this.handleSessionCleared)
    window.addEventListener('focus', this.handleVisibilityOrFocus)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityOrFocus)
    }

    window.addEventListener('storage', this.handleStorageEvent)
  }

  private handleStorageEvent = (event: StorageEvent): void => {
    if (event.key !== this.storageKey || !event.newValue) {
      return
    }
    try {
      const parsed = JSON.parse(event.newValue)
      if (parsed?.type === 'limits_invalidated') {
        this.handleCrossTabMessage(parsed?.senderId)
      }
    } catch {
      /* ignore invalid JSON in storage */
    }
  }

  private unbindBrowserListeners(): void {
    if (!this.isBrowserListenersBound || typeof window === 'undefined') {
      return
    }
    this.isBrowserListenersBound = false

    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.close()
      } catch {
        /* ignore close error */
      }
      this.broadcastChannel = null
    }

    window.removeEventListener(AUTH_SESSION_CLEARED_EVENT, this.handleSessionCleared)
    window.removeEventListener('focus', this.handleVisibilityOrFocus)
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityOrFocus)
    }
    window.removeEventListener('storage', this.handleStorageEvent)
  }

  private clearPeriodTimer(): void {
    if (this.periodTimer) {
      clearTimeout(this.periodTimer)
      this.periodTimer = null
    }
  }

  private clearFollowUpTimer(): void {
    if (this.followUpTimer) {
      clearTimeout(this.followUpTimer)
      this.followUpTimer = null
    }
  }

  private clearCooldownTimer(): void {
    if (this.cooldownTimer) {
      clearTimeout(this.cooldownTimer)
      this.cooldownTimer = null
    }
  }

  private clearAllTimers(): void {
    this.clearPeriodTimer()
    this.clearFollowUpTimer()
    this.clearCooldownTimer()
  }

  public destroy(): void {
    this.refreshAfterFlight = false
    this.unbindBrowserListeners()
    this.clearAllTimers()
    if (this.activeAbortController) {
      this.activeAbortController.abort()
      this.activeAbortController = null
    }
    this.subscribers.clear()
    this.inFlightPromise = null
  }
}
