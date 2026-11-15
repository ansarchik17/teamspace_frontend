import type { ChangePasswordResponse } from '../../domain/entities/profile-settings/ProfileSettingsModels'
import type { AuthSessionStore } from '../../domain/services/AuthSessionStore'
import { storeAuthFlashNotice } from '../../shared/auth/authFlashNotice'
import { i18n } from '../../shared/i18n'

/** Complete a successful password change whose previous sessions were revoked. */
export function finishPasswordChangeSession(result: ChangePasswordResponse, sessionStore: AuthSessionStore): boolean {
  if (!result.reauthenticationRequired) return false
  try {
    storeAuthFlashNotice({ kind: 'info', title: i18n.t('profile:password.changed'), message: i18n.t('profile:password.signInAgain') })
  } catch {
    // Browser storage restrictions must not keep revoked credentials in memory.
  }
  sessionStore.clearTokens()
  window.location.assign(`${import.meta.env.BASE_URL}login`)
  return true
}
