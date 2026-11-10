import type { UserAILimits } from '../entities/UserAILimits'

export interface UserAILimitsRepository {
  /**
   * Retrieves the authenticated user's personal 5-hour and weekly AI limits,
   * current usage, active reservations, and access status.
   *
   * @param signal Optional AbortSignal to cancel the in-flight request.
   * @returns Promise resolving to UserAILimits.
   */
  getLimits(signal?: AbortSignal): Promise<UserAILimits>
}
