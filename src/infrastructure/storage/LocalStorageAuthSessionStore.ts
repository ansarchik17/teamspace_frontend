import type { AuthTokens } from '../../domain/entities/AuthTokens'
import type { AuthSessionStore } from '../../domain/services/AuthSessionStore'
import { clearGrowyAuthStorage, safeClearAuthStorage, workspaceIdentityChanged } from '../../shared/auth/legacyAuthStorage'
import { AUTH_SESSION_CLEARED_EVENT } from '../../shared/auth/authSessionEvents'


let memoryTokens: AuthTokens | null = null

export class LocalStorageAuthSessionStore implements AuthSessionStore {
  getTokens(): AuthTokens | null {
    try {
      const raw = window.localStorage.getItem('superapp.auth.tokens')
      if (raw) {
        memoryTokens = JSON.parse(raw)
        return memoryTokens
      }
      memoryTokens = null
      return null
    } catch (e) {
      console.warn('Failed to read tokens from localStorage', e)
    }

    return memoryTokens
  }

  setTokens(tokens: AuthTokens): void {
    const previous = this.getTokens()
    memoryTokens = tokens
    try {
      if (workspaceIdentityChanged(previous?.accessToken, tokens.accessToken)) clearGrowyAuthStorage()
      window.localStorage.setItem('superapp.auth.tokens', JSON.stringify(tokens))
      // Also set for legacy apps that expect 'access_token' directly
      window.localStorage.setItem('access_token', tokens.accessToken)
      if (tokens.refreshToken) {
        window.localStorage.setItem('refresh_token', tokens.refreshToken)
      }
    } catch (e) {
      console.warn('Failed to save tokens to localStorage', e)
    }
  }

  clearTokens(): void {
    memoryTokens = null
    safeClearAuthStorage()
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(AUTH_SESSION_CLEARED_EVENT))
  }
}
