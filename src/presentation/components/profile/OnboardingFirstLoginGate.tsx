import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AuthSessionStore } from '../../../domain/services/AuthSessionStore'
import { ChangeMyPasswordUseCase } from '../../../application/use-cases/profile/ChangeMyPasswordUseCase'
import { HttpProfileRepository } from '../../../infrastructure/repositories/HttpProfileRepository'
import { getErrorMessage } from '../../../shared/utils/getErrorMessage'
import MustChangePasswordModal from './MustChangePasswordModal'

interface Props {
  sessionStore: AuthSessionStore
  onPasswordChanged: () => Promise<void>
  onLogout: () => void
}

export default function OnboardingFirstLoginGate({ sessionStore, onPasswordChanged, onLogout }: Props) {
  const { t } = useTranslation('profile')
  const changePassword = useMemo(() => new ChangeMyPasswordUseCase(new HttpProfileRepository(sessionStore)), [sessionStore])
  const pending = useRef(false)
  const passwordSaved = useRef(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  return <MustChangePasswordModal
    isSaving={isSaving}
    error={error}
    onLogout={() => { if (!pending.current) onLogout() }}
    onConfirm={async (oldPassword, newPassword) => {
      if (pending.current) return
      pending.current = true
      setIsSaving(true)
      setError('')
      try {
        if (!passwordSaved.current) {
          await changePassword.execute(oldPassword, newPassword)
          passwordSaved.current = true
        }
        // Confirm the server profile after saving. A failed profile read must
        // not replay a successfully committed password mutation.
        await onPasswordChanged()
      } catch (failure) {
        setError(getErrorMessage(failure, t('password.failed')) || t('password.failed'))
      } finally {
        pending.current = false
        setIsSaving(false)
      }
    }}
  />
}
