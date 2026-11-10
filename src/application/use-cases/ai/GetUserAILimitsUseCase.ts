import type { UserAILimits } from '../../../domain/entities/UserAILimits'
import type { UserAILimitsRepository } from '../../../domain/repositories/UserAILimitsRepository'

export class GetUserAILimitsUseCase {
  private readonly repository: UserAILimitsRepository

  constructor(repository: UserAILimitsRepository) {
    this.repository = repository
  }

  async execute(signal?: AbortSignal): Promise<UserAILimits> {
    return this.repository.getLimits(signal)
  }
}
