import type { AvailabilityStatus } from '../../domain/entities/profile-settings/ProfileSettingsModels'
import { ChangeMyPasswordUseCase } from '../../application/use-cases/profile/ChangeMyPasswordUseCase'
import type { ChangePasswordResponse } from '../../domain/entities/profile-settings/ProfileSettingsModels'
import { GetCurrentProfileUseCase } from '../../application/use-cases/profile/GetCurrentProfileUseCase'
import { UpdateMyAvatarUseCase } from '../../application/use-cases/profile/UpdateMyAvatarUseCase'
import { UpdateMyStatusUseCase } from '../../application/use-cases/profile/UpdateMyStatusUseCase'
import { UpdateMyEmailUseCase } from '../../application/use-cases/profile/UpdateMyEmailUseCase'
import { LogoutUseCase } from '../../application/use-cases/auth/LogoutUseCase'
import { CompleteOnboardingUseCase } from '../../application/use-cases/auth/CompleteOnboardingUseCase'
import type { CurrentProfileViewModel } from '../view-models/ProfileViewModel'
import { toCurrentProfileViewModel } from '../view-models/ProfileViewModel'

export class ProfileSettingsController {
  private readonly getCurrentProfileUseCase: GetCurrentProfileUseCase
  private readonly updateMyStatusUseCase: UpdateMyStatusUseCase
  private readonly updateMyAvatarUseCase: UpdateMyAvatarUseCase
  private readonly changeMyPasswordUseCase: ChangeMyPasswordUseCase
  private readonly logoutUseCase: LogoutUseCase
  private readonly completeOnboardingUseCase: CompleteOnboardingUseCase
  private readonly updateMyEmailUseCase: UpdateMyEmailUseCase

  constructor(
    getCurrentProfileUseCase: GetCurrentProfileUseCase,
    updateMyStatusUseCase: UpdateMyStatusUseCase,
    updateMyAvatarUseCase: UpdateMyAvatarUseCase,
    changeMyPasswordUseCase: ChangeMyPasswordUseCase,
    logoutUseCase: LogoutUseCase,
    completeOnboardingUseCase: CompleteOnboardingUseCase,
    updateMyEmailUseCase: UpdateMyEmailUseCase,
  ) {
    this.getCurrentProfileUseCase = getCurrentProfileUseCase
    this.updateMyStatusUseCase = updateMyStatusUseCase
    this.updateMyAvatarUseCase = updateMyAvatarUseCase
    this.changeMyPasswordUseCase = changeMyPasswordUseCase
    this.logoutUseCase = logoutUseCase
    this.completeOnboardingUseCase = completeOnboardingUseCase
    this.updateMyEmailUseCase = updateMyEmailUseCase
  }

  async loadProfile(): Promise<CurrentProfileViewModel> {
    const profile = await this.getCurrentProfileUseCase.execute()
    return toCurrentProfileViewModel(profile)
  }

  async updateStatus(status: AvailabilityStatus): Promise<CurrentProfileViewModel> {
    await this.updateMyStatusUseCase.execute(status)
    const profile = await this.getCurrentProfileUseCase.execute()
    return toCurrentProfileViewModel(profile)
  }

  async updateEmail(email: string): Promise<CurrentProfileViewModel> {
    const profile = await this.updateMyEmailUseCase.execute(email)
    return toCurrentProfileViewModel(profile)
  }

  async updateAvatar(avatarUrl?: string, avatarFile?: File): Promise<CurrentProfileViewModel> {
    const updatedFromWriteEndpoint = await this.updateMyAvatarUseCase.execute(avatarUrl, avatarFile)

    try {
      const syncedProfile = await this.getCurrentProfileUseCase.execute()
      return toCurrentProfileViewModel(syncedProfile)
    } catch {
      return toCurrentProfileViewModel(updatedFromWriteEndpoint)
    }
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<ChangePasswordResponse> {
    return this.changeMyPasswordUseCase.execute(oldPassword, newPassword)
  }

  async logout(): Promise<void> {
    return this.logoutUseCase.execute()
  }

  async completeOnboarding(): Promise<void> {
    return this.completeOnboardingUseCase.execute()
  }
}
