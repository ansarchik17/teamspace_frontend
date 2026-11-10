import type { AuthSessionStore } from '../../domain/services/AuthSessionStore'
import { dispatchAuthSessionExpired } from '../../shared/auth/authSessionEvents'
import { HttpAuthRepository } from '../repositories/HttpAuthRepository'
import { WebDeviceSessionStore } from '../storage/WebDeviceSessionStore'
import { HttpError, parseHttpError } from './HttpError'

let refreshPromise: Promise<void> | null = null
const webDeviceSessionStore = new WebDeviceSessionStore()

const shouldAttachWebDeviceId = (path: string): boolean => {
  const normalized = path.toLowerCase()
  const isApiPath = normalized.startsWith('/api/') || normalized.startsWith('/auth/api/')

  if (!isApiPath) {
    return false
  }

  return ![
    '/api/v1/auth/login',
    '/api/v1/auth/refresh',
    '/auth/api/v1/auth/login',
    '/auth/api/v1/auth/refresh',
  ].some((prefix) => normalized.startsWith(prefix))
}

const shouldAttachAuthorizationHeader = (path: string): boolean => {
  let normalized = path.toLowerCase()
  try {
    normalized = new URL(path, typeof window !== 'undefined' ? window.location.origin : 'http://localhost').pathname.toLowerCase()
  } catch {
    /* keep original path string */
  }
  return (
    normalized.startsWith('/api/') ||
    normalized.startsWith('/auth/api/') ||
    normalized.startsWith('/v1/chat/') ||
    normalized.startsWith('/v1/chats')
  )
}

const isAiPath = (path: string): boolean => {
  let normalized = path.toLowerCase()
  try {
    normalized = new URL(path, typeof window !== 'undefined' ? window.location.origin : 'http://localhost').pathname.toLowerCase()
  } catch {
    /* keep original path string */
  }

  return (
    normalized.startsWith('/api/tools') ||
    normalized.startsWith('/api/ask') ||
    normalized.startsWith('/api/v1/profile') ||
    normalized.startsWith('/api/v1/reminders') ||
    normalized.startsWith('/api/v1/ai/') ||
    normalized.startsWith('/v1/chat/') ||
    normalized.startsWith('/v1/chats')
  )
}

const RETRYABLE_STATUSES = new Set([502, 503, 504])
const RETRYABLE_METHODS = new Set(['GET', 'HEAD'])
const isIntegrationSessionError = (code?: string) => code?.startsWith('growy_') || code === 'session_revoked' || code === 'ODO_REAUTH_REQUIRED'
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const refreshSessionWithLock = async (sessionStore: AuthSessionStore): Promise<void> => {
  if (refreshPromise) {
    return refreshPromise
  }

  refreshPromise = (async () => {
    const authRepository = new HttpAuthRepository()
    const refreshToken = sessionStore.getTokens()?.refreshToken ?? ''

    const refreshedTokens = await authRepository.refresh(refreshToken)
    sessionStore.setTokens(refreshedTokens)
  })()
    .catch((error: unknown) => {
      if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
        sessionStore.clearTokens()
        dispatchAuthSessionExpired({ reason: 'unauthorized' })
      }
      throw error
    })
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}

const shouldSetJsonContentType = (body: BodyInit | null | undefined): boolean => {
  if (!body) {
    return false
  }

  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return false
  }

  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    return false
  }

  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return false
  }

  if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) {
    return false
  }

  return true
}

export const authorizedFetch = async (
  sessionStore: AuthSessionStore,
  path: string,
  init: RequestInit = {},
  options: { preserveIntegrationSession?: boolean; returnErrorResponse?: boolean } = {},
): Promise<Response> => {
  const method = (init.method ?? 'GET').toUpperCase()
  const isRetryableMethod = RETRYABLE_METHODS.has(method)
  const maxAttempts = isRetryableMethod ? 2 : 1

  const requestWithAuthCookies = async (): Promise<Response> => {
    const headers = new Headers(init.headers)

    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json')
    }

    const currentDeviceId = webDeviceSessionStore.getCurrentDeviceId()
    if (currentDeviceId && shouldAttachWebDeviceId(path) && !headers.has('X-Web-Device-ID')) {
      headers.set('X-Web-Device-ID', currentDeviceId)
    }

    if (shouldSetJsonContentType(init.body) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    if (shouldAttachAuthorizationHeader(path)) {
      const accessToken = sessionStore.getTokens()?.accessToken
      if (accessToken) {
        headers.set('Authorization', `Bearer ${accessToken}`)
      } else {
        headers.delete('Authorization')
      }
    }

    return fetch(path, {
      ...init,
      headers,
      credentials: init.credentials ?? 'include',
    })
  }

  let response: Response | null = null
  let requestError: unknown = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const candidate = await requestWithAuthCookies()

      if (isRetryableMethod && RETRYABLE_STATUSES.has(candidate.status) && attempt < maxAttempts) {
        await sleep(350 * attempt)
        continue
      }

      response = candidate
      break
    } catch (error) {
      requestError = error
      const isNetworkIssue = error instanceof TypeError

      if (!isRetryableMethod || !isNetworkIssue || attempt >= maxAttempts) {
        throw error
      }

      await sleep(350 * attempt)
    }
  }

  if (!response) {
    throw (requestError instanceof Error ? requestError : new Error('Не удалось выполнить запрос'))
  }

  if (response.status === 401) {
    if (options.preserveIntegrationSession) {
      const error = await parseHttpError(response.clone())
      if (isIntegrationSessionError(error.code)) {
        if (options.returnErrorResponse) return response
        throw error
      }
    }
    await refreshSessionWithLock(sessionStore)

    response = await requestWithAuthCookies()

    if (response.status === 401) {
      if (options.preserveIntegrationSession) {
        const error = await parseHttpError(response.clone())
        if (isIntegrationSessionError(error.code)) {
        if (options.returnErrorResponse) return response
        throw error
      }
      }
      if (!isAiPath(path)) {
        dispatchAuthSessionExpired({ reason: 'unauthorized' })
      }
      throw await parseHttpError(response)
    }
  }

  if (!response.ok && !options.returnErrorResponse) {
    throw await parseHttpError(response)
  }

  return response
}
