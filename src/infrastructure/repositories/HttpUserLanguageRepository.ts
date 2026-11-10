import type { AuthSessionStore } from '../../domain/services/AuthSessionStore'
import { authorizedFetch } from '../http/authorizedFetch'
import { LocalStorageAuthSessionStore } from '../storage/LocalStorageAuthSessionStore'

export class HttpUserLanguageRepository {
  private readonly sessionStore: AuthSessionStore

  constructor(sessionStore: AuthSessionStore = new LocalStorageAuthSessionStore()) {
    this.sessionStore = sessionStore
  }

  async saveLanguage(language: string): Promise<void> {
    await authorizedFetch(this.sessionStore, '/api/v1/auth/me/language', {
      method: 'PUT',
      body: JSON.stringify({ language }),
    })
  }
}
