import type { CurrentProfile } from '../../../domain/entities/profile-settings/ProfileSettingsModels'
import type { ProfileRepository } from '../../../domain/repositories/ProfileRepository'

export class UpdateMyEmailUseCase {
  private readonly profileRepository: ProfileRepository

  constructor(profileRepository: ProfileRepository) {
    this.profileRepository = profileRepository
  }

  async execute(email: string): Promise<CurrentProfile> {
    return this.profileRepository.updateEmail(email)
  }
}
