import type { AuthSessionStore } from '../../domain/services/AuthSessionStore'
import type { UserAILimitsRepository } from '../../domain/repositories/UserAILimitsRepository'
import type { UserAILimits } from '../../domain/entities/UserAILimits'
import { parseUserAILimitsDto } from '../../domain/entities/UserAILimits'
import { authorizedFetch } from '../http/authorizedFetch'
import { HttpError } from '../http/HttpError'

function sessionIdentity(token?: string): string | undefined {
  if (!token) return undefined
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '=')))
    if (typeof claims.user_id === 'number' && claims.user_id > 0) return `user:${claims.user_id}`
  } catch { /* Opaque tokens retain strict equality. */ }
  return token
}

export class SessionChangedError extends Error {
  constructor(message = 'Session changed during AI limits request') {
    super(message)
    this.name = 'SessionChangedError'
  }
}

/**
 * Проверяет, является ли ошибка отменой запроса (через AbortController / AbortSignal).
 * Отмена не должна отображаться пользователю как ошибка запроса.
 */
export function isAbortError(error: unknown): boolean {
  if (!error) return false
  if (error instanceof Error && error.name === 'AbortError') return true
  if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') return true
  return false
}

/**
 * Проверяет, была ли ошибка вызвана сменой сессии / пользователя во время запроса.
 */
export function isSessionChangedError(error: unknown): boolean {
  if (!error) return false
  if (error instanceof SessionChangedError) return true
  if (error instanceof Error && error.name === 'SessionChangedError') return true
  return false
}

export class HttpUserAILimitsRepository implements UserAILimitsRepository {
  private readonly sessionStore: AuthSessionStore

  constructor(sessionStore: AuthSessionStore) {
    this.sessionStore = sessionStore
  }

  async getLimits(signal?: AbortSignal): Promise<UserAILimits> {
    const initialToken = this.sessionStore.getTokens()?.accessToken

    const response = await authorizedFetch(
      this.sessionStore,
      '/api/v1/ai/limits',
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        cache: 'no-store',
        signal,
      },
    )

    const assertCurrent = () => {
      if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError')
      if (sessionIdentity(initialToken) !== sessionIdentity(this.sessionStore.getTokens()?.accessToken)) throw new SessionChangedError()
    }
    assertCurrent()

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      assertCurrent()
      throw new HttpError('Failed to parse AI limits response', 502)
    }

    assertCurrent()
    try {
      return parseUserAILimitsDto(payload)
    } catch {
      throw new HttpError('Invalid AI limits payload', 502)
    }
  }
}
