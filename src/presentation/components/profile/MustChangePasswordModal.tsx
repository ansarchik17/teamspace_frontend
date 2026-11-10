import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'

interface MustChangePasswordModalProps {
  onConfirm: (oldPassword: string, newPassword: string) => Promise<void>
  isSaving: boolean
  error: string
  onLogout: () => void
  onSkip?: () => void
}

export default function MustChangePasswordModal({
  onConfirm,
  isSaving,
  error,
  onLogout,
  onSkip,
}: MustChangePasswordModalProps) {
  const { t } = useTranslation(['profile', 'common'])
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showOldPassword, setShowOldPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [localError, setLocalError] = useState('')
  const canClose = typeof onSkip === 'function'

  useEffect(() => {
    if (!canClose) {
      return
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) {
        onSkip()
      }
    }

    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('keydown', handleEscape)
    }
  }, [canClose, isSaving, onSkip])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError('')

    if (!oldPassword) {
      setLocalError(t('mustChange.currentRequired'))
      return
    }

    if (newPassword.length < 8) {
      setLocalError(t('mustChange.tooShort'))
      return
    }

    if (newPassword !== confirmPassword) {
      setLocalError(t('mustChange.mismatch'))
      return
    }

    if (newPassword === oldPassword) {
      setLocalError(t('mustChange.sameAsCurrent'))
      return
    }

    await onConfirm(oldPassword, newPassword)
  }

  return (
    <div
      className="ts-legacy-backdrop fixed inset-0 z-[9999] flex items-center justify-center bg-[#0F172A]/80 p-4 backdrop-blur-xl animate-in fade-in duration-500 overflow-y-auto"
      onClick={() => {
        if (canClose && !isSaving) {
          onSkip()
        }
      }}
    >
      <div
        className="ts-legacy-dialog w-full max-w-[540px] animate-in fade-in zoom-in duration-500 overflow-hidden rounded-[32px] border border-white/10 bg-white shadow-[0_32px_120px_rgba(0,0,0,0.6)]"
        onClick={(event) => {
          event.stopPropagation()
        }}
      >
        <div className="relative overflow-hidden bg-gradient-to-br from-[#2458D3] to-[#1565C0] px-8 py-10 text-white">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <div className="absolute -left-10 -bottom-10 h-32 w-32 rounded-full bg-white/5" />
          {canClose && (
            <button
              type="button"
              onClick={onSkip}
              disabled={isSaving}
              className="absolute right-5 top-5 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/90 transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={t('mustChange.closeWindow')}
            >
              <MaterialSymbol name="close" size={20} color="currentColor" />
            </button>
          )}
          
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md">
              <MaterialSymbol name="lock_reset" size={36} color="#fff" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">{t('mustChange.welcome')}</h2>
            <p className="mt-2 text-sm text-white/80">
              {t(canClose ? 'mustChange.intro' : 'mustChange.requiredIntro')}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-8">
          {(error || localError) && (
            <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
              <MaterialSymbol name="error" size={20} color="currentColor" />
              <span>{error || localError}</span>
            </div>
          )}

          <div className="space-y-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
                {t('mustChange.currentPassword')}
              </label>
              <div className="relative">
                <input
                  type={showOldPassword ? 'text' : 'password'}
                  value={oldPassword}
                  onChange={(e) => {
                    setOldPassword(e.target.value)
                    setLocalError('')
                  }}
                  className="h-12 w-full rounded-xl border border-[#DDE3EE] bg-[#F8FAFC] px-4 pr-12 text-sm text-[#0A1628] transition focus:border-[#2458D3] focus:bg-white focus:ring-4 focus:ring-[#2458D3]/10 outline-none"
                  placeholder={t('mustChange.currentPlaceholder')}
                  disabled={isSaving}
                />
                <button
                  type="button"
                  onClick={() => setShowOldPassword(!showOldPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8497B4] hover:text-[#2458D3] transition"
                >
                  <MaterialSymbol name={showOldPassword ? 'visibility_off' : 'visibility'} size={20} />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
                {t('mustChange.newPassword')}
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value)
                    setLocalError('')
                  }}
                  className="h-12 w-full rounded-xl border border-[#DDE3EE] bg-[#F8FAFC] px-4 pr-12 text-sm text-[#0A1628] transition focus:border-[#2458D3] focus:bg-white focus:ring-4 focus:ring-[#2458D3]/10 outline-none"
                  placeholder={t('mustChange.newPlaceholder')}
                  disabled={isSaving}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8497B4] hover:text-[#2458D3] transition"
                >
                  <MaterialSymbol name={showNewPassword ? 'visibility_off' : 'visibility'} size={20} />
                </button>
              </div>
              <p className="text-[11px] text-[#8497B4]">{t('mustChange.minLength')}</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
                {t('mustChange.confirmPassword')}
              </label>
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  setLocalError('')
                }}
                className="h-12 w-full rounded-xl border border-[#DDE3EE] bg-[#F8FAFC] px-4 text-sm text-[#0A1628] transition focus:border-[#2458D3] focus:bg-white focus:ring-4 focus:ring-[#2458D3]/10 outline-none"
                placeholder={t('mustChange.confirmPlaceholder')}
                disabled={isSaving}
              />
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3">
            <button
              type="submit"
              disabled={isSaving}
              className="ts-button ts-button--primary flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2458D3] font-bold text-white shadow-lg shadow-[#2458D3]/20 transition hover:bg-[#1565C0] hover:shadow-xl active:scale-[0.98] disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {t('mustChange.saving')}
                </>
              ) : (
                t('mustChange.submit')
              )}
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="h-12 w-full rounded-xl border border-[#DDE3EE] text-sm font-semibold text-[#64748B] transition hover:bg-[#F8FAFC] hover:text-[#0A1628]"
            >
              {t('mustChange.logout')}
            </button>
            {onSkip && (
              <button
                type="button"
                onClick={onSkip}
                className="mt-2 text-sm font-medium text-[#2458D3] hover:underline"
              >
                {t('mustChange.later')}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
