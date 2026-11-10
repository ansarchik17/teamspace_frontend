import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import RecoveryEmailPanel from './RecoveryEmailPanel'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'

interface ProfileSettingsSectionProps {
  oldPasswordValue: string
  newPasswordValue: string
  confirmPasswordValue: string
  passwordError: string
  isPasswordSaving: boolean
  onOldPasswordChange: (value: string) => void
  onNewPasswordChange: (value: string) => void
  onConfirmPasswordChange: (value: string) => void
  onPasswordSubmit: () => void
}

function PasswordField({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  placeholder: string
}) {
  const { t } = useTranslation(['profile', 'common'])
  const [visible, setVisible] = useState(false)

  return (
    <label className="block">
      <span className="mb-1.5 block text-[14px] font-medium leading-5 text-[#17202E]">{label}</span>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className="h-11 w-full rounded-[6px] border border-[#7B8494] bg-white px-3 pr-10 text-[14px] text-[#17202E] outline-none transition-[border-color,box-shadow] duration-[120ms] placeholder:text-[#586174] focus:border-[#2458D3] focus:shadow-[0_0_0_3px_rgba(36,88,211,0.15)] disabled:bg-[#F1F2F4]"
        />
        <button
          type="button"
          onClick={() => setVisible((prev) => !prev)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#586174] transition-colors hover:text-[#17202E]"
          aria-label={visible ? t('common:password.hide') : t('common:password.show')}
        >
          <MaterialSymbol name={visible ? 'visibility_off' : 'visibility'} size={18} color="currentColor" />
        </button>
      </div>
    </label>
  )
}

function SecurityRow({
  icon,
  title,
  description,
  action,
  children,
}: {
  icon: string
  title: string
  description: string
  action: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="py-5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] bg-[#EDF2FF] text-[#2458D3]">
          <MaterialSymbol name={icon} size={20} color="currentColor" />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-[14px] font-semibold leading-5 text-[#17202E]">{title}</h4>
          <p className="mt-0.5 text-[14px] leading-5 text-[#586174]">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

export default function ProfileSettingsSection({
  oldPasswordValue,
  newPasswordValue,
  confirmPasswordValue,
  passwordError,
  isPasswordSaving,
  onOldPasswordChange,
  onNewPasswordChange,
  onConfirmPasswordChange,
  onPasswordSubmit,
}: ProfileSettingsSectionProps) {
  const { t } = useTranslation(['profile', 'common'])
  const [passwordOpen, setPasswordOpen] = useState(false)

  return (
    <section className="rounded-[12px] border border-[#E2E5EA] bg-white p-6">
      <div className="-mx-6 mb-5 flex items-center gap-2 border-b border-[#E2E5EA] px-6 pb-4">
        <MaterialSymbol name="lock" size={20} color="#2458D3" />
        <h3 className="text-[18px] font-semibold leading-[26px] text-[#17202E]">{t('security.title')}</h3>
      </div>

      <div className="divide-y divide-[#E2E5EA]">
        <SecurityRow
          icon="lock"
          title={t('security.password')}
          description={t('security.passwordDescription')}
          action={
            <button
              type="button"
              onClick={() => setPasswordOpen((current) => !current)}
              aria-expanded={passwordOpen}
              className={`${passwordOpen ? AXIS_UI.secondaryButtonActive : AXIS_UI.secondaryButton} !h-10 !px-4`}
            >
              {passwordOpen ? t('common:actions.hide') : t('security.changePassword')}
            </button>
          }
        >
          {passwordOpen || passwordError ? (
            <div className="mt-4 rounded-[8px] bg-[#F6F7F9] p-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <PasswordField label={t('security.currentPassword')} value={oldPasswordValue} onChange={onOldPasswordChange} disabled={isPasswordSaving} placeholder={t('security.currentPasswordPlaceholder')} />
                <PasswordField label={t('security.newPassword')} value={newPasswordValue} onChange={onNewPasswordChange} disabled={isPasswordSaving} placeholder={t('security.newPasswordPlaceholder')} />
                <PasswordField label={t('security.repeatPassword')} value={confirmPasswordValue} onChange={onConfirmPasswordChange} disabled={isPasswordSaving} placeholder={t('security.repeatPasswordPlaceholder')} />
              </div>
              {passwordError ? (
                <p className="mt-3 flex items-center gap-1.5 text-[12px] leading-4 text-[#C03437]">
                  <MaterialSymbol name="error_outline" size={14} color="currentColor" />
                  {passwordError}
                </p>
              ) : null}
              <div className="mt-4 flex justify-end">
                <button type="button" onClick={onPasswordSubmit} disabled={isPasswordSaving} className={`${AXIS_UI.primaryButton} !h-10 min-w-[160px]`}>
                  {isPasswordSaving ? t('security.saving') : t('security.savePassword')}
                </button>
              </div>
            </div>
          ) : null}
        </SecurityRow>

        <RecoveryEmailPanel />
      </div>
    </section>
  )
}
