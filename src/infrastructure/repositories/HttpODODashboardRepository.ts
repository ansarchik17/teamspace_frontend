import type { AuthSessionStore } from '../../domain/services/AuthSessionStore'
import type { ODOCount, ODODashboardCounts } from '../../domain/entities/ODODashboardCounts'
import { emptyODOCounts } from '../../domain/entities/ODODashboardCounts'
import { HttpError } from '../http/HttpError'

export class HttpODODashboardRepository {
  private readonly sessionStore: AuthSessionStore

  constructor(sessionStore: AuthSessionStore) {
    this.sessionStore = sessionStore
  }

  async counts(signal: AbortSignal): Promise<ODODashboardCounts> {
    const token = this.sessionStore.getTokens()?.accessToken
    if (!token) return emptyODOCounts('unavailable')

    const results = await Promise.allSettled([
      this.count('approvals', token, signal),
      this.count('signing', token, signal),
    ])
    signal.throwIfAborted()
    if (this.sessionStore.getTokens()?.accessToken !== token) {
      throw new Error('ODO counter session changed')
    }
    const metric = (result: PromiseSettledResult<number>): ODOCount => result.status === 'fulfilled'
      ? { value: result.value, state: 'ready' }
      : { value: null, state: result.reason instanceof HttpError && result.reason.status === 403 ? 'denied' : 'unavailable' }
    return { approvals: metric(results[0]), signing: metric(results[1]) }
  }

  private async count(kind: 'approvals' | 'signing', token: string, signal: AbortSignal): Promise<number> {
    const query = new URLSearchParams({ kind })
    // Fixed same-origin ODO API. Do not use a source URL, ambient EDO cookies,
    // or the generic Workspace 401 handler (an ODO failure must not log it out).
    const response = await fetch(`/odo/api/v1/documents/my-pending-count?${query}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      credentials: 'omit', cache: 'no-store', redirect: 'error', signal,
    })
    if (!response.ok) throw new HttpError('ODO counters unavailable', response.status)
    const data: unknown = await response.json()
    const count = data as { scope?: unknown; total?: unknown } | null
    if (count?.scope !== 'current_user') throw new HttpError('Invalid ODO counter scope', 502)
    const total = count.total
    if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0) {
      throw new HttpError('Invalid ODO counter', 502)
    }
    return total
  }
}
