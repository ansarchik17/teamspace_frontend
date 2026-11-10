import type { AuthSessionStore } from '../../domain/services/AuthSessionStore'
import { authorizedFetch } from '../http/authorizedFetch'
import { HttpError } from '../http/HttpError'

export class HttpSDDashboardRepository {
  private readonly store: AuthSessionStore

  constructor(store: AuthSessionStore) {
    this.store = store
  }

  async openTicketCount(signal: AbortSignal): Promise<number> {
    const response = await authorizedFetch(this.store, '/api/v1/organizations/current/sd-ticket-count', {
      cache: 'no-store', signal,
    })
    const result: unknown = await response.json()
    const count = (result as { count?: unknown } | null)?.count
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
      throw new HttpError('Invalid SD count', 502)
    }
    return count
  }
}
