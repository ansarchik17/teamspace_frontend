import PageHeader from '../../../shared/ui/PageHeader'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { formatDate, i18n } from '../../../shared/i18n'
import type { AvailabilityStatus } from '../../../domain/entities/profile-settings/ProfileSettingsModels'
import { availabilityStatuses } from '../../../domain/entities/profile-settings/ProfileSettingsModels'
import type {
  CreateEducationInput,
  CreateLicenseCertificationInput,
  UpdateEducationInput,
  UpdateLicenseCertificationInput,
} from '../../../domain/entities/profile-settings/ProfileSectionsModels'
import { HttpError } from '../../../infrastructure/http/HttpError'
import AppToast from '../../../shared/ui/AppToast'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import GradientAvatar from '../../../shared/ui/GradientAvatar'
import { getErrorMessage } from '../../../shared/utils/getErrorMessage'
import { dispatchProfileUpdated } from '../../../shared/auth/authSessionEvents'
import ProfileAnalyticsSection from '../../components/profile/ProfileAnalyticsSection'
import ProfileExperienceSection from '../../components/profile/ProfileExperienceSection'
import ProfileSettingsSection from '../../components/profile/ProfileSettingsSection'
import ProfileSkeletons from '../../components/profile/ProfileSkeletons'
import ProfilePersonalDataSection from '../../components/profile/ProfilePersonalDataSection'
import './profileSettings.css'
import ProfileUserCard from '../../components/profile/ProfileUserCard'
import { createProfileController } from '../../profile/createProfileController'
import { finishPasswordChangeSession } from '../../auth/finishPasswordChangeSession'
import type { CurrentProfileViewModel, ProfilePageViewModel } from '../../view-models/ProfileViewModel'

const emptyProfileViewModel: ProfilePageViewModel = {
  user: null,
  hrProfile: null,
  stats: null,
  sections: null,
}

type ProfileTab = 'profile' | 'appearance' | 'experience' | 'feedback' | 'security'

const PROFILE_SECTIONS: readonly { id: ProfileTab; icon: string }[] = [
  { id: 'profile', icon: 'person' },
  { id: 'appearance', icon: 'photo_camera' },
  { id: 'experience', icon: 'school' },
  { id: 'feedback', icon: 'chat_bubble_outline' },
  { id: 'security', icon: 'shield' },
]

const toReadableDate = (iso: string): string => {
  const date = new Date(iso)
  if (!iso || Number.isNaN(date.getTime())) return '—'
  const day = formatDate(date, { day: 'numeric', month: 'short', year: 'numeric' }).replace(' г.', '') // i18n-ignore
  const time = formatDate(date, { hour: '2-digit', minute: '2-digit' })
  return `${day}, ${time}`
}

/** Строка «подпись — значение» для карточек профиля */
function InfoRow({ icon, label, value }: { icon?: string; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      {icon ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#F1F2F4] text-[#586174]">
          <MaterialSymbol name={icon} size={16} color="currentColor" />
        </span>
      ) : null}
      <span className="min-w-[110px] text-[14px] leading-5 text-[#586174]">{label}</span>
      <span className="ml-auto min-w-0 break-words text-right text-[14px] leading-5 tabular-nums text-[#17202E]">{value}</span>
    </div>
  )
}

const isAvailabilityStatus = (value: string): value is AvailabilityStatus =>
  availabilityStatuses.includes(value as AvailabilityStatus)

const isUnauthorizedError = (error: unknown): boolean =>
  error instanceof HttpError && (error.status === 401 || error.status === 403 || error.code === 'UNAUTHORIZED')

const getPasswordErrorMessage = (error: unknown): string => {
  if (error instanceof HttpError) {
    if (error.code === 'UNAUTHORIZED' || error.status === 401) {
      return i18n.t('profile:password.oldInvalid')
    }

    if (error.code === 'INTERNAL_ERROR' || error.status >= 500) {
      return i18n.t('profile:password.serverError')
    }
  }

  return getErrorMessage(error, i18n.t('profile:password.failed'))
}

const mergeSettingsIntoProfileVm = (
  prev: ProfilePageViewModel,
  profile: CurrentProfileViewModel,
): ProfilePageViewModel => {
  if (!prev.user) {
    return prev
  }

  return {
    ...prev,
    user: {
      ...prev.user,
      email: profile.email || prev.user.email,
      username: profile.username || prev.user.username,
      firstName: profile.firstName || prev.user.firstName,
      lastName: profile.lastName || prev.user.lastName,
      fullName: profile.fullName || prev.user.fullName,
      avatarUrl: profile.avatarUrl,
      isActive: profile.isActive,
      lastLoginAt: profile.lastLoginAt || prev.user.lastLoginAt,
      createdAt: profile.createdAt || prev.user.createdAt,
      isFirstLogin: profile.isFirstLogin,
      availabilityStatus: profile.availabilityStatus ?? '',
    },
  }
}

export default function ProfilePage() {
  const { t } = useTranslation(['profile', 'common'])
  const navigate = useNavigate()
  const { profileController, profileSettingsController, sessionStore } = useMemo(() => createProfileController(), [])

  const [viewModel, setViewModel] = useState<ProfilePageViewModel>(emptyProfileViewModel)
  const [isLoading, setIsLoading] = useState(true)
  const [isSettingsLoading, setIsSettingsLoading] = useState(true)
  const [isStatusSaving, setIsStatusSaving] = useState(false)
  const [isAvatarSaving, setIsAvatarSaving] = useState(false)
  const [isPasswordSaving, setIsPasswordSaving] = useState(false)
  const [isEducationSaving, setIsEducationSaving] = useState(false)
  const [isLicenseSaving, setIsLicenseSaving] = useState(false)
  const [deletingEducationId, setDeletingEducationId] = useState<number | null>(null)
  const [deletingLicenseId, setDeletingLicenseId] = useState<number | null>(null)
  const [userError, setUserError] = useState('')
  const [statsError, setStatsError] = useState('')
  const [sectionsError, setSectionsError] = useState('')
  const [statusError, setStatusError] = useState('')
  const [avatarError, setAvatarError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [toast, setToast] = useState('')
  const [toastError, setToastError] = useState('')
  const [statusValue, setStatusValue] = useState<AvailabilityStatus>('online')
  const [activeTab, setActiveTab] = useState<ProfileTab>('profile')
  const [emailDraft, setEmailDraft] = useState<string | null>(null)
  const [isEmailSaving, setIsEmailSaving] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [oldPasswordValue, setOldPasswordValue] = useState('')
  const [newPasswordValue, setNewPasswordValue] = useState('')
  const [confirmPasswordValue, setConfirmPasswordValue] = useState('')
  const handleSessionExpired = useCallback(() => {
    sessionStore.clearTokens()
    const basename = (import.meta.env.BASE_URL || '/web/').replace(/\/$/, '');
    navigate(`${basename}/login`, { replace: true, state: { from: '/profile' } });
  }, [navigate, sessionStore])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 2600)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    if (!toastError) return
    const timeout = window.setTimeout(() => setToastError(''), 5200)
    return () => window.clearTimeout(timeout)
  }, [toastError])


  const loadPage = useCallback(
    async () => {
      setIsLoading(true)

      try {
        const result = await profileController.loadPage()
        if (result.isUnauthorized) {
          handleSessionExpired()
          return
        }

        setViewModel(result.viewModel)
        setUserError(result.userError)
        setStatsError(result.statsError)
        setSectionsError(result.sectionsError)

        if (result.viewModel.user) {
          dispatchProfileUpdated({
            avatarUrl: result.viewModel.user.avatarUrl,
            fullName: result.viewModel.user.fullName,
            firstName: result.viewModel.user.firstName,
            lastName: result.viewModel.user.lastName,
          })
        }
      } catch (error) {
        if (isUnauthorizedError(error)) {
          handleSessionExpired()
          return
        }

        setUserError(getErrorMessage(error, i18n.t('profile:errors.loadUser')))
        setStatsError(getErrorMessage(error, i18n.t('profile:errors.loadStats')))
        setSectionsError(getErrorMessage(error, i18n.t('profile:errors.loadSections')))
      } finally {
        setIsLoading(false)
      }
    },
    [handleSessionExpired, profileController],
  )

  const loadSettingsProfile = useCallback(async () => {
    setIsSettingsLoading(true)
    try {
      const profile = await profileSettingsController.loadProfile()
      setStatusValue(profile.availabilityStatus ?? 'offline')
    } catch (error) {
      if (isUnauthorizedError(error)) {
        handleSessionExpired()
        return
      }

      setToastError(getErrorMessage(error, i18n.t('profile:errors.loadSettings')))
    } finally {
      setIsSettingsLoading(false)
    }
  }, [handleSessionExpired, profileSettingsController])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void loadPage()
      void loadSettingsProfile()
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [loadPage, loadSettingsProfile])

  const handleStatusSubmit = useCallback(async (nextStatus?: AvailabilityStatus) => {
    setStatusError('')
    setToastError('')

    const targetStatus = nextStatus ?? statusValue

    if (!isAvailabilityStatus(targetStatus)) {
      setStatusError(i18n.t('profile:status.invalid'))
      return
    }

    setIsStatusSaving(true)
    try {
      setStatusValue(targetStatus)
      const profile = await profileSettingsController.updateStatus(targetStatus)
      setStatusValue(profile.availabilityStatus ?? targetStatus)
      setViewModel((prev) => mergeSettingsIntoProfileVm(prev, profile))
      setToast(i18n.t('profile:status.updated'))
      dispatchProfileUpdated({
        avatarUrl: profile.avatarUrl,
        firstName: profile.firstName,
        lastName: profile.lastName,
        fullName: profile.fullName,
      })
    } catch (error) {
      if (isUnauthorizedError(error)) {
        handleSessionExpired()
        return
      }

      const message = getErrorMessage(error, i18n.t('profile:status.failed'))
      setStatusError(message)
      setToastError(message)
    } finally {
      setIsStatusSaving(false)
    }
  }, [handleSessionExpired, profileSettingsController, statusValue])

  const handleAvatarSubmit = useCallback(async (file: File) => {
    setAvatarError('')
    setToastError('')

    setIsAvatarSaving(true)
    try {
      const profile = await profileSettingsController.updateAvatar(undefined, file)
      setViewModel((prev) => mergeSettingsIntoProfileVm(prev, profile))
      setToast(i18n.t('profile:avatar.updated'))
      dispatchProfileUpdated({
        avatarUrl: profile.avatarUrl,
        firstName: profile.firstName,
        lastName: profile.lastName,
        fullName: profile.fullName,
      })
    } catch (error) {
      if (isUnauthorizedError(error)) {
        handleSessionExpired()
        return
      }

      const message = getErrorMessage(error, i18n.t('profile:avatar.failed'))
      setAvatarError(message)
      setToastError(message)
    } finally {
      setIsAvatarSaving(false)
    }
  }, [handleSessionExpired, profileSettingsController])

  const handlePasswordSubmit = useCallback(async (customOld?: string, customNew?: string) => {
    setPasswordError('')
    setToastError('')

    const oldPass = customOld ?? oldPasswordValue
    const newPass = customNew ?? newPasswordValue

    if (!oldPass) {
      setPasswordError(i18n.t('profile:password.enterCurrent'))
      return
    }

    if (newPass.length < 8) {
      setPasswordError(i18n.t('profile:password.tooShort'))
      return
    }

    if (customOld === undefined && customNew === undefined && newPass !== confirmPasswordValue) {
      setPasswordError(i18n.t('profile:password.mismatch'))
      return
    }

    setIsPasswordSaving(true)
    try {
      const result = await profileSettingsController.changePassword(oldPass, newPass)
      if (finishPasswordChangeSession(result, sessionStore)) return
      
      const tokens = sessionStore.getTokens()
      if (tokens) {
        sessionStore.setTokens({ ...tokens, mustChangePassword: false, cannotSkipPasswordChange: false })
      }

      if (!customOld) setOldPasswordValue('')
      if (!customNew) {
        setNewPasswordValue('')
        setConfirmPasswordValue('')
      }

      setToast(i18n.t('profile:password.changed'))
    } catch (error) {
      if (isUnauthorizedError(error)) {
        handleSessionExpired()
        return
      }

      const message = getPasswordErrorMessage(error)
      setPasswordError(message)
      setToastError(message)
      throw error // Re-throw for modal handling if needed
    } finally {
      setIsPasswordSaving(false)
    }
  }, [confirmPasswordValue, handleSessionExpired, newPasswordValue, oldPasswordValue, profileSettingsController, sessionStore])

  const handleEducationCreate = useCallback(async (payload: CreateEducationInput) => {
    setSectionsError('')
    setToastError('')
    setIsEducationSaving(true)

    try {
      const createdEducation = await profileController.createEducation(payload)
      setViewModel((prev) => ({
        ...prev,
        sections: {
          educations: [createdEducation, ...(prev.sections?.educations ?? [])],
          licenses: prev.sections?.licenses ?? [],
        },
      }))
      setToast(i18n.t('profile:experience.educationAdded'))
    } catch (error) {
      if (isUnauthorizedError(error)) {
        handleSessionExpired()
        return
      }

      setToastError(getErrorMessage(error, i18n.t('profile:experience.educationAddFailed')))
    } finally {
      setIsEducationSaving(false)
    }
  }, [handleSessionExpired, profileController])

  const handleLicenseCreate = useCallback(async (payload: CreateLicenseCertificationInput) => {
    setSectionsError('')
    setToastError('')
    setIsLicenseSaving(true)

    try {
      const createdLicense = await profileController.createLicenseCertification(payload)
      setViewModel((prev) => ({
        ...prev,
        sections: {
          educations: prev.sections?.educations ?? [],
          licenses: [createdLicense, ...(prev.sections?.licenses ?? [])],
        },
      }))
      setToast(i18n.t('profile:experience.licenseAdded'))
    } catch (error) {
      if (isUnauthorizedError(error)) {
        handleSessionExpired()
        return
      }

      setToastError(getErrorMessage(error, i18n.t('profile:experience.licenseAddFailed')))
    } finally {
      setIsLicenseSaving(false)
    }
  }, [handleSessionExpired, profileController])

  const handleEducationUpdate = useCallback(async (id: number, payload: UpdateEducationInput) => {
    setSectionsError('')
    setToastError('')
    setIsEducationSaving(true)

    try {
      const updatedEducation = await profileController.updateEducation(id, payload)
      setViewModel((prev) => ({
        ...prev,
        sections: prev.sections
          ? {
              ...prev.sections,
              educations: prev.sections.educations.map((item) =>
                item.id === id ? updatedEducation : item,
              ),
            }
          : prev.sections,
      }))
      setToast(i18n.t('profile:experience.educationUpdated'))
    } catch (error) {
      if (isUnauthorizedError(error)) {
        handleSessionExpired()
        return
      }

      setToastError(getErrorMessage(error, i18n.t('profile:experience.educationUpdateFailed')))
    } finally {
      setIsEducationSaving(false)
    }
  }, [handleSessionExpired, profileController])

  const handleLicenseUpdate = useCallback(async (id: number, payload: UpdateLicenseCertificationInput) => {
    setSectionsError('')
    setToastError('')
    setIsLicenseSaving(true)

    try {
      const updatedLicense = await profileController.updateLicenseCertification(id, payload)
      setViewModel((prev) => ({
        ...prev,
        sections: prev.sections
          ? {
              ...prev.sections,
              licenses: prev.sections.licenses.map((item) =>
                item.id === id ? updatedLicense : item,
              ),
            }
          : prev.sections,
      }))
      setToast(i18n.t('profile:experience.licenseUpdated'))
    } catch (error) {
      if (isUnauthorizedError(error)) {
        handleSessionExpired()
        return
      }

      setToastError(getErrorMessage(error, i18n.t('profile:experience.licenseUpdateFailed')))
    } finally {
      setIsLicenseSaving(false)
    }
  }, [handleSessionExpired, profileController])

  const handleEducationDelete = useCallback(async (id: number) => {
    setSectionsError('')
    setToastError('')
    setDeletingEducationId(id)

    try {
      await profileController.deleteEducation(id)
      setViewModel((prev) => ({
        ...prev,
        sections: prev.sections
          ? {
              ...prev.sections,
              educations: prev.sections.educations.filter((item) => item.id !== id),
            }
          : prev.sections,
      }))
      setToast(i18n.t('profile:experience.educationDeleted'))
    } catch (error) {
      if (isUnauthorizedError(error)) {
        handleSessionExpired()
        return
      }

      setToastError(getErrorMessage(error, i18n.t('profile:experience.educationDeleteFailed')))
    } finally {
      setDeletingEducationId(null)
    }
  }, [handleSessionExpired, profileController])

  const handleLicenseDelete = useCallback(async (id: number) => {
    setSectionsError('')
    setToastError('')
    setDeletingLicenseId(id)

    try {
      await profileController.deleteLicenseCertification(id)
      setViewModel((prev) => ({
        ...prev,
        sections: prev.sections
          ? {
              ...prev.sections,
              licenses: prev.sections.licenses.filter((item) => item.id !== id),
            }
          : prev.sections,
      }))
      setToast(i18n.t('profile:experience.licenseDeleted'))
    } catch (error) {
      if (isUnauthorizedError(error)) {
        handleSessionExpired()
        return
      }

      setToastError(getErrorMessage(error, i18n.t('profile:experience.licenseDeleteFailed')))
    } finally {
      setDeletingLicenseId(null)
    }
  }, [handleSessionExpired, profileController])

  const handleEmailSubmit = async () => {
    const email = (emailDraft ?? viewModel.user?.email ?? '').trim()
    setEmailError('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError(i18n.t('profile:edit.emailInvalid'))
      return
    }
    if (email === viewModel.user?.email) {
      setEmailDraft(null)
      return
    }
    setIsEmailSaving(true)
    try {
      const profile = await profileSettingsController.updateEmail(email)
      setViewModel((prev) => mergeSettingsIntoProfileVm(prev, profile))
      setToast(i18n.t('profile:edit.emailUpdated'))
      setEmailDraft(null)
    } catch (error) {
      if (isUnauthorizedError(error)) {
        handleSessionExpired()
        return
      }
      setEmailError(getErrorMessage(error, i18n.t('profile:edit.emailFailed')))
    } finally {
      setIsEmailSaving(false)
    }
  }

  const hasFullError = !viewModel.user && !viewModel.stats && (userError || statsError)
  const user = viewModel.user
  const hrProfile = viewModel.hrProfile
  const subtitle = [hrProfile?.jobName, hrProfile?.nameGo].map((value) => value?.trim()).filter(Boolean).join(' · ')

  const accountCard = user ? (
    <section className="rounded-[12px] border border-[#E2E5EA] bg-white p-6">
      <div className="-mx-6 mb-5 flex items-center gap-2 border-b border-[#E2E5EA] px-6 pb-4">
        <MaterialSymbol name="lock" size={20} color="#2458D3" />
        <h3 className="text-[18px] font-semibold leading-[26px] text-[#17202E]">{t('account.title')}</h3>
      </div>
      <div className="flex flex-col gap-4">
        <InfoRow icon="mail" label={t('account.workEmail')} value={user.email || '—'} />
        <InfoRow
          icon="check_circle"
          label={t('account.status')}
          value={
            <span className={`inline-flex items-center gap-1.5 font-medium ${user.isActive ? 'text-[#16734B]' : 'text-[#C03437]'}`}>
              <span className={`h-2 w-2 rounded-full ${user.isActive ? 'bg-[#16734B]' : 'bg-[#C03437]'}`} />
              {user.isActive ? t('account.active') : t('account.disabled')}
            </span>
          }
        />
        <InfoRow icon="calendar_today" label={t('account.registered')} value={toReadableDate(user.createdAt)} />
        <InfoRow icon="schedule" label={t('account.lastLogin')} value={toReadableDate(user.lastLoginAt)} />
      </div>
    </section>
  ) : null

  const privacyNote = (
    <div className="flex items-start gap-3 rounded-[12px] border border-[#E2E5EA] bg-[#F1F2F4] p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-white text-[#586174]">
        <MaterialSymbol name="visibility_off" size={18} color="currentColor" />
      </span>
      <div>
        <p className="text-[14px] font-medium leading-5 text-[#17202E]">{t('account.privateTitle')}</p>
        <p className="mt-0.5 text-[12px] leading-4 text-[#586174]">{t('account.privateDescription')}</p>
      </div>
    </div>
  )

  const displayName = user?.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.username || ''
  const handle = user?.username ? (user.username.includes('@') ? user.username : `@${user.username}`) : ''
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?'
  const sectionLabel = (id: ProfileTab) => id === 'profile' ? t('fields.personalData') : t(`tabs.${id}`)
  const sectionDescription = activeTab === 'profile' ? t('settings.personalDescription')
    : activeTab === 'appearance' ? t('settings.appearanceDescription') : ''
  const emailValue = emailDraft ?? user?.email ?? ''

  return (
    <main className="profile-settings-page">
      <div className="profile-settings-container">
        <Link to="/workspace" className="profile-settings-back">
          <MaterialSymbol name="arrow_back" size={18} />
          {t('page.backToCabinet')}
        </Link>
        <PageHeader title={t('page.title')} className="profile-settings-page-header" />

        {isLoading ? <ProfileSkeletons /> : null}

        {!isLoading && hasFullError ? (
          <section className="rounded-[12px] border border-[#C03437]/20 bg-[#FFF0F0] p-5" role="alert">
            <div className="flex items-center gap-2 text-[#C03437]">
              <MaterialSymbol name="error" size={18} color="currentColor" />
              <span className="text-[14px] font-semibold">{t('page.loadFailed')}</span>
            </div>
            <p className="mt-2 text-[14px] leading-5 text-[#C03437]">{userError || statsError}</p>
            <button type="button" onClick={() => void loadPage()} className={`${AXIS_UI.primaryButton} mt-4 !h-10`}>
              <MaterialSymbol name="refresh" size={16} color="currentColor" />
              {t('common:actions.retry')}
            </button>
          </section>
        ) : null}

        {!isLoading && !hasFullError ? (
          <div className="profile-settings-shell">
            <aside className="profile-settings-sidebar">
              {user ? (
                <button type="button" className="profile-settings-identity" onClick={() => setActiveTab('appearance')} aria-label={t('settings.openAppearance')}>
                  <GradientAvatar initials={initials} src={user.avatarUrl} size={64} seed={0} />
                  <span className="profile-settings-identity-copy">
                    <span className="profile-settings-name">{displayName}</span>
                    {handle ? <span className="profile-settings-handle">{handle}</span> : null}
                  </span>
                </button>
              ) : null}

              <nav className="profile-settings-nav" aria-label={t('page.tabsLabel')}>
                {PROFILE_SECTIONS.map(({ id, icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    aria-current={activeTab === id ? 'page' : undefined}
                    aria-controls="profile-settings-content"
                    className={`profile-settings-nav-item ${activeTab === id ? 'is-active' : ''}`}
                  >
                    <MaterialSymbol name={icon} size={21} />
                    <span>{sectionLabel(id)}</span>
                  </button>
                ))}
              </nav>
              <label className="profile-settings-mobile-nav">
                <span>{t('page.tabsLabel')}</span>
                <select value={activeTab} onChange={(event) => {
                  const nextSection = PROFILE_SECTIONS.find(({ id }) => id === event.target.value)
                  if (nextSection) setActiveTab(nextSection.id)
                }}>
                  {PROFILE_SECTIONS.map(({ id }) => <option key={id} value={id}>{sectionLabel(id)}</option>)}
                </select>
              </label>
            </aside>

            <section id="profile-settings-content" className="profile-settings-content" aria-labelledby="profile-settings-section-title">
              <header className="profile-settings-section-header">
                <h2 id="profile-settings-section-title">{sectionLabel(activeTab)}</h2>
                {sectionDescription ? <p>{sectionDescription}</p> : null}
              </header>

              {activeTab === 'profile' ? (
                user ? (
                  <ProfilePersonalDataSection
                    user={user}
                    hrProfile={hrProfile}
                    emailValue={emailValue}
                    emailError={emailError}
                    isEmailSaving={isEmailSaving}
                    onEmailChange={(value) => { setEmailDraft(value); setEmailError('') }}
                    onEmailCancel={() => { setEmailDraft(null); setEmailError('') }}
                    onEmailSubmit={() => { void handleEmailSubmit() }}
                  />
                ) : <p className="profile-settings-error" role="alert">{userError || t('page.noData')}</p>
              ) : null}

              {activeTab === 'appearance' ? (
                user ? <div className="profile-settings-appearance">
              <ProfileUserCard
                user={user}
                subtitle={subtitle}
                verified={Boolean(hrProfile)}
                statusValue={statusValue}
                statusError={statusError}
                avatarError={avatarError}
                isStatusSaving={isStatusSaving || isSettingsLoading}
                isAvatarSaving={isAvatarSaving || isSettingsLoading}
                onStatusSubmit={(nextStatus) => {
                  void handleStatusSubmit(nextStatus)
                }}
                onAvatarSubmit={(file) => {
                  void handleAvatarSubmit(file)
                }}
              />
                </div> : <p className="profile-settings-error" role="alert">{userError || t('page.noData')}</p>
              ) : null}

              {activeTab === 'experience' ? (
                viewModel.sections ? <div className="profile-settings-experience">
                    <ProfileExperienceSection
                      educations={viewModel.sections.educations}
                      licenses={viewModel.sections.licenses}
                      isEducationSaving={isEducationSaving}
                      isLicenseSaving={isLicenseSaving}
                      deletingEducationId={deletingEducationId}
                      deletingLicenseId={deletingLicenseId}
                      onCreateEducation={(payload) => {
                        void handleEducationCreate(payload)
                      }}
                      onUpdateEducation={(id, payload) => {
                        void handleEducationUpdate(id, payload)
                      }}
                      onDeleteEducation={(id) => {
                        void handleEducationDelete(id)
                      }}
                      onCreateLicense={(payload) => {
                        void handleLicenseCreate(payload)
                      }}
                      onUpdateLicense={(id, payload) => {
                        void handleLicenseUpdate(id, payload)
                      }}
                      onDeleteLicense={(id) => {
                        void handleLicenseDelete(id)
                      }}
                    />
                </div> : <p className="profile-settings-error" role="alert">{sectionsError || t('errors.loadSections')}</p>
              ) : null}

              {activeTab === 'feedback' ? (
                viewModel.stats ? (
                  viewModel.stats.reviewCount > 0 ? (
                    <div className="profile-settings-feedback"><ProfileAnalyticsSection stats={viewModel.stats} /></div>
                  ) : (
                    <div className="profile-settings-empty">
                      <span className="profile-settings-empty-icon"><MaterialSymbol name="chat_bubble_outline" size={28} /></span>
                      <h3>{t('feedback.emptyTitle')}</h3>
                      <p>{t('feedback.emptyDescription')}</p>
                    </div>
                  )
                ) : <p className="profile-settings-error" role="alert">{statsError || t('page.noFeedback')}</p>
              ) : null}

              {activeTab === 'security' ? (
                <div className="profile-settings-security">
                  {isSettingsLoading ? <p>{t('page.loadingSettings')}</p> : (
                    <ProfileSettingsSection
                      oldPasswordValue={oldPasswordValue}
                      newPasswordValue={newPasswordValue}
                      confirmPasswordValue={confirmPasswordValue}
                      passwordError={passwordError}
                      isPasswordSaving={isPasswordSaving}
                      onOldPasswordChange={(value) => {
                        setPasswordError('')
                        setOldPasswordValue(value)
                      }}
                      onNewPasswordChange={(value) => {
                        setPasswordError('')
                        setNewPasswordValue(value)
                      }}
                      onConfirmPasswordChange={(value) => {
                        setPasswordError('')
                        setConfirmPasswordValue(value)
                      }}
                      onPasswordSubmit={() => {
                        void handlePasswordSubmit().catch(() => undefined)
                      }}
                    />
                  )}
                  {accountCard}
                  {privacyNote}
                </div>
              ) : null}
            </section>
          </div>
        ) : null}
      </div>

      {toast ? <AppToast variant="success" message={toast} onClose={() => setToast('')} /> : null}
      {toastError ? <AppToast variant="error" message={toastError} onClose={() => setToastError('')} /> : null}
    </main>
  )
}
