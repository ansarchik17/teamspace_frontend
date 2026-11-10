import type { AuthTokens } from '../../../domain/entities/AuthTokens'
import type { AuthRepository } from '../../../domain/repositories/AuthRepository'
import type { AuthSessionStore } from '../../../domain/services/AuthSessionStore'

export class RefreshSessionUseCase {
  private readonly authRepository: AuthRepository
  private readonly sessionStore: AuthSessionStore

  constructor(authRepository: AuthRepository, sessionStore: AuthSessionStore) {
    this.authRepository = authRepository
    this.sessionStore = sessionStore
  }

  async execute(): Promise<AuthTokens> {
    const tokens = this.sessionStore.getTokens()
    const refreshToken = tokens?.refreshToken ?? ''

    const refreshedTokens = await this.authRepository.refresh(refreshToken)
    this.sessionStore.setTokens(refreshedTokens)

    return refreshedTokens
  }
}
