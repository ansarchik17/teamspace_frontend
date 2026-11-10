import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import AppButton from '../../../shared/ui/AppButton'
import type { ProfileHrViewModel, ProfileUserViewModel } from '../../view-models/ProfileViewModel'

interface ProfilePersonalDataSectionProps {
  user: ProfileUserViewModel
  hrProfile: ProfileHrViewModel | null
  emailValue: string
  emailError: string
  isEmailSaving: boolean
  onEmailChange: (value: string) => void
  onEmailCancel: () => void
  onEmailSubmit: () => void
}

export default function ProfilePersonalDataSection({
  user, hrProfile, emailValue, emailError, isEmailSaving,
  onEmailChange, onEmailCancel, onEmailSubmit,
}: ProfilePersonalDataSectionProps) {
  const { t } = useTranslation(['profile', 'common'])
  const emailRef = useRef<HTMLInputElement>(null)
  const emailChanged = emailValue.trim() !== user.email
  const fullName = user.fullName || [user.firstName, user.lastName].filter(Boolean).join(' ')
  const handle = user.username ? (user.username.includes('@') ? user.username : `@${user.username}`) : ''

  useEffect(() => {
    if (emailError) emailRef.current?.focus()
  }, [emailError])

  const personalFields = [
    { label: t('fields.fullName'), value: fullName },
    { label: t('fields.login'), value: handle },
    { label: t('fields.iin'), value: user.iin },
  ]

  return (
    <div className="profile-settings-personal">
      <dl className="profile-settings-facts">
        {personalFields.map(({ label, value }) => (
          <div key={label} className="profile-settings-fact">
            <dt>{label}</dt>
            <dd className={value?.trim() ? '' : 'is-empty'}>{value?.trim() || t('fields.notSpecified')}</dd>
          </div>
        ))}
      </dl>

      <form className="profile-settings-email-form" noValidate aria-busy={isEmailSaving} onSubmit={(event) => {
        event.preventDefault()
        onEmailSubmit()
      }}>
        <label htmlFor="profile-email">{t('fields.email')}</label>
        <input
          ref={emailRef}
          id="profile-email"
          name="email"
          type="email"
          autoComplete="email"
          value={emailValue}
          onChange={(event) => onEmailChange(event.target.value)}
          disabled={isEmailSaving}
          aria-invalid={Boolean(emailError)}
          aria-describedby={emailError ? 'profile-email-error' : undefined}
        />
        {emailError ? <p id="profile-email-error" className="profile-settings-field-error" role="alert">{emailError}</p> : null}
        <div className="profile-settings-form-actions">
          <AppButton type="submit" isLoading={isEmailSaving} disabled={!emailChanged}>
            {isEmailSaving ? t('security.saving') : t('common:actions.save')}
          </AppButton>
          <AppButton variant="secondary" disabled={isEmailSaving || (!emailChanged && !emailError)} onClick={onEmailCancel}>
            {t('common:actions.cancel')}
          </AppButton>
        </div>
      </form>

      {hrProfile ? (
        <section className="profile-settings-workplace" aria-labelledby="profile-workplace-title">
          <h3 id="profile-workplace-title">{t('fields.workplace')}</h3>
          <p>{t('fields.eqyzmetData')}</p>
          <dl className="profile-settings-facts">
            {([
              ['organization', hrProfile.nameGo],
              ['position', hrProfile.jobName],
              ['department', hrProfile.subName],
              ['docType', hrProfile.docType],
              ['orderDate', hrProfile.lastOrderDate],
              ['orderNumber', hrProfile.lastOrderNumber],
            ] as const).map(([key, value]) => (
              <div key={key} className="profile-settings-fact">
                <dt>{t(`fields.${key}`)}</dt>
                <dd className={value?.trim() ? '' : 'is-empty'}>{value?.trim() || t('fields.notSpecified')}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  )
}
