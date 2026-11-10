import type { AuthSessionStore } from '../../domain/services/AuthSessionStore'
import { authorizedFetch } from '../http/authorizedFetch'
import { parseHttpError } from '../http/HttpError'
import { i18n } from '../../shared/i18n/i18n'

export interface RecoveryChallenge { id: string; email: string; purpose: 'bind' | 'remove'; expires_at: string; retry_at: string }
export interface RecoveryEmailState { email: string | null; verified_at: string | null; pending: RecoveryChallenge | null }
export function recoveryTokenFromHash(hash: string): string | null {
  if (!hash.startsWith('#')) return null
  const params = new URLSearchParams(hash.slice(1))
  const token = params.get('token')
  return params.getAll('token').length === 1 && token !== null && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null
}
export class HttpRecoveryRepository {
  private readonly store: AuthSessionStore
  constructor(store: AuthSessionStore) { this.store = store }
  private headers() { return { 'Content-Type': 'application/json', 'Accept-Language': i18n.resolvedLanguage || i18n.language || 'ru' } }
  private async publicRequest(action: string, body: unknown, signal?: AbortSignal): Promise<void> {
    const response = await fetch(`/api/v1/auth/recovery/${action}`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body), signal, cache: 'no-store', referrerPolicy: 'no-referrer', credentials: 'omit' })
    if (!response.ok) throw await parseHttpError(response)
  }
  private async privateRequest<T>(action: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const response = await authorizedFetch(this.store, `/api/v1/auth/recovery-email${action}`, { method: body === undefined ? 'GET' : 'POST', headers: this.headers(), body: body === undefined ? undefined : JSON.stringify(body), signal, cache: 'no-store', referrerPolicy: 'no-referrer' })
    return response.json() as Promise<T>
  }
  state(signal?: AbortSignal) { return this.privateRequest<RecoveryEmailState>('', undefined, signal) }
  sendCode(email: string, purpose: 'bind' | 'remove', password: string) { return this.privateRequest<RecoveryChallenge>('/code', { email, purpose, password }) }
  confirm(id: string, code: string, password: string) { return this.privateRequest<{ ok: boolean }>('/confirm', { id, code, password }) }
  request(login: string) { return this.publicRequest('request', { login }) }
  preview(token: string, signal?: AbortSignal) { return this.publicRequest('preview', { token }, signal) }
  complete(token: string, newPassword: string) { return this.publicRequest('complete', { token, new_password: newPassword }) }
}
