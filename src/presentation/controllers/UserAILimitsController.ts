import type { GetUserAILimitsUseCase } from '../../application/use-cases/ai/GetUserAILimitsUseCase'
import type { UserAILimits } from '../../domain/entities/UserAILimits'

export class UserAILimitsController {
  private readonly useCase: GetUserAILimitsUseCase

  constructor(useCase: GetUserAILimitsUseCase) {
    this.useCase = useCase
  }

  async getLimits(signal?: AbortSignal): Promise<UserAILimits> {
    return this.useCase.execute(signal)
  }
}
