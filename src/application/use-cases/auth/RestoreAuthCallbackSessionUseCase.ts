import type { AuthRepository } from '../../../domain/repositories/AuthRepository'
import type { AuthSessionStore } from '../../../domain/services/AuthSessionStore'

/** A completed sign-in replaces the previous browser identity with the cookie session. */
export class RestoreAuthCallbackSessionUseCase {
  private readonly authRepository: Pick<AuthRepository, 'refresh'>
  private readonly sessionStore: AuthSessionStore

  constructor(
    authRepository: Pick<AuthRepository, 'refresh'>,
    sessionStore: AuthSessionStore,
  ) {
    this.authRepository = authRepository
    this.sessionStore = sessionStore
  }

  async execute(): Promise<void> {
    // A tenant handoff may have just issued cookies for a different account.
    // Never bootstrap the former account if the new session cannot be restored.
    this.sessionStore.clearTokens()
    const tokens = await this.authRepository.refresh('')
    if (!tokens.accessToken?.trim()) throw new Error('Invalid callback session')

    const expiresIn = tokens.expiresIn > 0 ? tokens.expiresIn : 86400
    this.sessionStore.setTokens({
      ...tokens,
      refreshToken: tokens.refreshToken || '',
      tokenType: tokens.tokenType || 'Bearer',
      expiresIn,
      expiresAt: tokens.expiresAt || new Date(Date.now() + expiresIn * 1000).toISOString(),
    })
  }
}
