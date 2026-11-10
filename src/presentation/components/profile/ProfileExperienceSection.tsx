import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react'
import type {
  CreateEducationInput,
  CreateLicenseCertificationInput,
  UpdateEducationInput,
  UpdateLicenseCertificationInput,
} from '../../../domain/entities/profile-settings/ProfileSectionsModels'
import { useTranslation } from 'react-i18next'
import { formatDate, i18n } from '../../../shared/i18n'
import AppConfirmDialog from '../../../shared/ui/AppConfirmDialog'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import type {
  ProfileEducationViewModel,
  ProfileLicenseCertificationViewModel,
} from '../../view-models/ProfileViewModel'

interface ProfileExperienceSectionProps {
  educations: ProfileEducationViewModel[]
  licenses: ProfileLicenseCertificationViewModel[]
  isEducationSaving: boolean
  isLicenseSaving: boolean
  deletingEducationId: number | null
  deletingLicenseId: number | null
  onCreateEducation: (payload: CreateEducationInput) => void
  onUpdateEducation: (id: number, payload: UpdateEducationInput) => void
  onDeleteEducation: (id: number) => void
  onCreateLicense: (payload: CreateLicenseCertificationInput) => void
  onUpdateLicense: (id: number, payload: UpdateLicenseCertificationInput) => void
  onDeleteLicense: (id: number) => void
}

interface LabeledInputProps {
  label: string
  children: React.ReactNode
}

type EducationDialogMode = 'create' | 'edit'
type LicenseDialogMode = 'create' | 'edit'

const formatMonthYear = (date: Date): string => formatDate(date, { month: 'short', year: 'numeric' })

const fieldClassName =
  'h-11 w-full rounded-[6px] border border-[#E2E5EA] bg-white px-4 text-sm text-[#17202E] outline-none transition-all focus:border-[#2458D3] focus:ring-4 focus:ring-[#2458D3]/10'

const getInitials = (value: string): string =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'A'

const formatDateRange = (startDate: string, endDate: string): string => {
  const start = new Date(startDate)
  if (Number.isNaN(start.getTime())) {
    return ''
  }

  const startLabel = formatMonthYear(start)
  if (!endDate) {
    return i18n.t('profile:experience.present', { start: startLabel })
  }

  const end = new Date(endDate)
  if (Number.isNaN(end.getTime())) {
    return startLabel
  }

  return `${startLabel} — ${formatMonthYear(end)}`
}

const formatIssueDate = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return i18n.t('profile:experience.issued', { date: formatMonthYear(date) })
}

const isImageAttachment = (contentType: string): boolean => contentType.startsWith('image/')

function LabeledInput({ label, children }: LabeledInputProps) {
  return (
    <label className="space-y-1.5">
      <span className="text-[12px] font-medium text-[#586174]">{label}</span>
      {children}
    </label>
  )
}

function EntityAvatar({
  label,
  imageUrl,
  tone,
  icon,
}: {
  label: string
  imageUrl: string
  tone: string
  icon?: string
}) {
  const [imageFailed, setImageFailed] = useState(false)
  const normalizedUrl = imageUrl.trim()

  useEffect(() => {
    setImageFailed(false)
  }, [normalizedUrl])

  const handleImageError = (event: SyntheticEvent<HTMLImageElement>) => {
    event.currentTarget.onerror = null
    setImageFailed(true)
  }

  if (normalizedUrl && !imageFailed) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-[#E2E5EA] bg-white p-1">
        <img
          src={normalizedUrl}
          alt={label}
          className="h-full w-full object-contain"
          onError={handleImageError}
        />
      </div>
    )
  }

  return (
    <div
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] ${tone} text-[14px] font-semibold text-[#2458D3]`}
      aria-hidden
    >
      {icon ? <MaterialSymbol name={icon} size={22} color="currentColor" /> : getInitials(label)}
    </div>
  )
}

function SectionHeader({
  title,
  count,
  actionLabel,
  onAction,
  disabled,
}: {
  title: string
  count?: number
  actionLabel: string
  onAction: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <h4 className="text-[16px] font-semibold leading-6 text-[#17202E]">{title}</h4>
        {count ? (
          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#F1F2F4] px-1.5 text-[12px] font-medium tabular-nums text-[#586174]">{count}</span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onAction}
        disabled={disabled}
        className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-[#E2E5EA] bg-white px-3 text-[14px] font-medium text-[#2458D3] transition-colors duration-[120ms] hover:border-[#2458D3] hover:bg-[#EDF2FF] disabled:opacity-50"
      >
        <MaterialSymbol name="add" size={16} color="currentColor" />
        {actionLabel}
      </button>
    </div>
  )
}

function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: string
  title: string
  description: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div className="flex flex-col items-center rounded-[8px] border border-dashed border-[#C4C9D2] px-6 py-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#EDF2FF] text-[#2458D3]">
        <MaterialSymbol name={icon} size={20} color="currentColor" />
      </span>
      <h4 className="mt-3 text-[14px] font-semibold leading-5 text-[#17202E]">{title}</h4>
      <p className="mt-1 max-w-md text-[14px] leading-5 text-[#586174]">{description}</p>
      <button
        type="button"
        onClick={onAction}
        className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-[#E2E5EA] bg-white px-3 text-[14px] font-medium text-[#17202E] transition-colors duration-[120ms] hover:bg-[#F6F7F9]"
      >
        <MaterialSymbol name="add" size={16} color="currentColor" />
        {actionLabel}
      </button>
    </div>
  )
}

function CardActions({
  onEdit,
  onDelete,
  isDeleting,
  disabled,
}: {
  onEdit: () => void
  onDelete: () => void
  isDeleting?: boolean
  disabled?: boolean
}) {
  const { t } = useTranslation(['profile', 'common'])
  const base = 'inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-[#586174] transition-colors duration-[120ms] disabled:opacity-50'
  return (
    <div className="flex items-center gap-0.5">
      <button type="button" onClick={onEdit} disabled={disabled || isDeleting} className={`${base} hover:bg-[#F1F2F4] hover:text-[#17202E]`} aria-label={t('common:actions.edit')}>
        <MaterialSymbol name="edit" size={16} color="currentColor" />
      </button>
      <button type="button" onClick={onDelete} disabled={disabled || isDeleting} className={`${base} hover:bg-[#FFF0F0] hover:text-[#C03437]`} aria-label={isDeleting ? t('experience.deleting') : t('common:actions.delete')}>
        <MaterialSymbol name={isDeleting ? 'autorenew' : 'delete'} size={16} color="currentColor" className={isDeleting ? 'animate-spin' : undefined} />
      </button>
    </div>
  )
}

function EducationCard({
  item,
  onEdit,
  onDelete,
  isDeleting,
  disabled,
}: {
  item: ProfileEducationViewModel
  onEdit: () => void
  onDelete: () => void
  isDeleting?: boolean
  disabled?: boolean
}) {
  const subtitle = [item.degree, item.fieldOfStudy].filter(Boolean).join(', ')
  const period = formatDateRange(item.startDate, item.endDate)

  return (
    <article className="flex items-start gap-4 rounded-[8px] border border-[#E2E5EA] bg-white p-4 transition-colors duration-[120ms] hover:border-[#C4C9D2]">
      <EntityAvatar label={item.schoolName} imageUrl={item.schoolAvatarUrl} tone="bg-[#EDF2FF]" icon="school" />
      <div className="min-w-0 flex-1">
        <h4 className="truncate text-[14px] font-semibold leading-5 text-[#17202E]">{item.schoolName}</h4>
        {subtitle ? <p className="mt-0.5 text-[14px] leading-5 text-[#586174]">{subtitle}</p> : null}
        {period ? (
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] leading-4 text-[#586174]">
            <MaterialSymbol name="calendar_today" size={14} color="currentColor" />
            {period}
          </p>
        ) : null}
      </div>
      <CardActions onEdit={onEdit} onDelete={onDelete} isDeleting={isDeleting} disabled={disabled} />
    </article>
  )
}

function LicenseCard({
  item,
  onEdit,
  onDelete,
  isDeleting,
  disabled,
}: {
  item: ProfileLicenseCertificationViewModel
  onEdit: () => void
  onDelete: () => void
  isDeleting?: boolean
  disabled?: boolean
}) {
  const { t } = useTranslation(['profile', 'common'])
  const issueDate = formatIssueDate(item.issueDate)
  const hasPreview = item.attachmentDownloadUrl && isImageAttachment(item.attachmentContentType)

  return (
    <article className="rounded-[8px] border border-[#E2E5EA] bg-white p-4 transition-colors duration-[120ms] hover:border-[#C4C9D2]">
      <div className="flex items-start gap-4">
        <EntityAvatar label={item.name} imageUrl={item.avatarUrl} tone="bg-[#EDF2FF]" icon="verified" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="truncate text-[14px] font-semibold leading-5 text-[#17202E]">{item.name}</h4>
              <p className="mt-0.5 text-[14px] leading-5 text-[#586174]">{item.issuingOrganization}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                {issueDate ? (
                  <span className="inline-flex items-center gap-1.5 text-[12px] leading-4 text-[#586174]">
                    <MaterialSymbol name="calendar_today" size={14} color="currentColor" />
                    {issueDate}
                  </span>
                ) : null}
                {item.skillName ? (
                  <span className="inline-flex h-6 items-center rounded-[6px] bg-[#F1F2F4] px-2 text-[12px] font-medium text-[#586174]">{item.skillName}</span>
                ) : null}
              </div>
            </div>
            <CardActions onEdit={onEdit} onDelete={onDelete} isDeleting={isDeleting} disabled={disabled} />
          </div>

          {hasPreview || item.attachmentFileName ? (
            <div className="mt-4 flex flex-col gap-3 rounded-[8px] bg-[#F6F7F9] p-3 sm:flex-row sm:items-center">
              {hasPreview ? (
                <a
                  href={item.attachmentDownloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="h-20 w-36 overflow-hidden rounded-[8px] border border-[#E2E8F0] bg-white"
                >
                  <img
                    src={item.attachmentDownloadUrl}
                    alt={item.attachmentFileName || item.name}
                    className="h-full w-full object-cover"
                  />
                </a>
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-[8px] bg-[#EDF2FF] text-[#2458D3]">
                  <MaterialSymbol name="description" size={26} color="currentColor" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[#17202E]">
                  {item.attachmentFileName || t('experience.attachment')}
                </p>
                <p className="mt-1 text-xs text-[#586174]">
                  {item.attachmentContentType || t('experience.attachmentHint')}
                </p>
              </div>

              {item.attachmentDownloadUrl ? (
                <a
                  href={item.attachmentDownloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-[6px] border border-[#E2E5EA] bg-white px-3 text-[14px] font-medium text-[#2458D3] transition-colors hover:bg-[#EDF2FF]"
                >
                  <MaterialSymbol name="open_in_new" size={18} color="currentColor" />
                  {t('common:actions.open')}
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}


export default function ProfileExperienceSection({
  educations,
  licenses,
  isEducationSaving,
  isLicenseSaving,
  deletingEducationId,
  deletingLicenseId,
  onCreateEducation,
  onUpdateEducation,
  onDeleteEducation,
  onCreateLicense,
  onUpdateLicense,
  onDeleteLicense,
}: ProfileExperienceSectionProps) {
  const { t } = useTranslation(['profile', 'common'])
  const [educationOpen, setEducationOpen] = useState(false)
  const [licenseOpen, setLicenseOpen] = useState(false)
  const [educationMode, setEducationMode] = useState<EducationDialogMode>('create')
  const [licenseMode, setLicenseMode] = useState<LicenseDialogMode>('create')
  const [editingEducationId, setEditingEducationId] = useState<number | null>(null)
  const [editingLicenseId, setEditingLicenseId] = useState<number | null>(null)
  const [educationError, setEducationError] = useState('')
  const [licenseError, setLicenseError] = useState('')

  const [confirmDeleteEducation, setConfirmDeleteEducation] = useState<ProfileEducationViewModel | null>(null)
  const [confirmDeleteLicense, setConfirmDeleteLicense] = useState<ProfileLicenseCertificationViewModel | null>(null)

  const [schoolName, setSchoolName] = useState('')
  const [degree, setDegree] = useState('')
  const [fieldOfStudy, setFieldOfStudy] = useState('')
  const [educationStartDate, setEducationStartDate] = useState('')
  const [educationEndDate, setEducationEndDate] = useState('')
  const [educationAvatarFile, setEducationAvatarFile] = useState<File | null>(null)
  const [educationAvatarPreview, setEducationAvatarPreview] = useState('')
  const [removeEducationAvatar, setRemoveEducationAvatar] = useState(false)

  const [licenseName, setLicenseName] = useState('')
  const [issuingOrganization, setIssuingOrganization] = useState('')
  const [skillName, setSkillName] = useState('')
  const [licenseIssueDate, setLicenseIssueDate] = useState('')
  const [licenseExpirationDate, setLicenseExpirationDate] = useState('')
  const [licenseAvatarFile, setLicenseAvatarFile] = useState<File | null>(null)
  const [licenseAvatarPreview, setLicenseAvatarPreview] = useState('')
  const [removeLicenseAvatar, setRemoveLicenseAvatar] = useState(false)
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [attachmentName, setAttachmentName] = useState('')
  const [existingAttachmentUrl, setExistingAttachmentUrl] = useState('')
  const [existingAttachmentType, setExistingAttachmentType] = useState('')
  const [removeAttachment, setRemoveAttachment] = useState(false)

  const educationAvatarInputRef = useRef<HTMLInputElement | null>(null)
  const licenseAvatarInputRef = useRef<HTMLInputElement | null>(null)
  const attachmentInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!educationAvatarFile) {
      if (educationAvatarPreview !== '') {
        const t = setTimeout(() => setEducationAvatarPreview(''), 0)
        return () => clearTimeout(t)
      }
      return
    }
    const reader = new FileReader()
    reader.onloadend = () => {
      setEducationAvatarPreview(reader.result as string)
    }
    reader.readAsDataURL(educationAvatarFile)
  }, [educationAvatarFile, educationAvatarPreview])

  useEffect(() => {
    if (!licenseAvatarFile) {
      if (licenseAvatarPreview !== '') {
        const t = setTimeout(() => setLicenseAvatarPreview(''), 0)
        return () => clearTimeout(t)
      }
      return
    }
    const reader = new FileReader()
    reader.onloadend = () => {
      setLicenseAvatarPreview(reader.result as string)
    }
    reader.readAsDataURL(licenseAvatarFile)
  }, [licenseAvatarFile, licenseAvatarPreview])

  const visibleEducationAvatar = useMemo(() => {
    if (educationAvatarFile && educationAvatarPreview) return educationAvatarPreview
    if (removeEducationAvatar) return ''
    return educationAvatarPreview
  }, [educationAvatarFile, educationAvatarPreview, removeEducationAvatar])

  const visibleLicenseAvatar = useMemo(() => {
    if (licenseAvatarFile && licenseAvatarPreview) return licenseAvatarPreview
    if (removeLicenseAvatar) return ''
    return licenseAvatarPreview
  }, [licenseAvatarFile, licenseAvatarPreview, removeLicenseAvatar])

  const visibleAttachmentName = attachmentFile?.name || (removeAttachment ? '' : attachmentName)
  const visibleAttachmentUrl = attachmentFile ? '' : removeAttachment ? '' : existingAttachmentUrl
  const visibleAttachmentType = attachmentFile?.type || (removeAttachment ? '' : existingAttachmentType)

  const resetEducationForm = () => {
    setSchoolName('')
    setDegree('')
    setFieldOfStudy('')
    setEducationStartDate('')
    setEducationEndDate('')
    setEducationAvatarFile(null)
    setEducationAvatarPreview('')
    setRemoveEducationAvatar(false)
    setEducationError('')
    setEditingEducationId(null)
    setEducationMode('create')
    if (educationAvatarInputRef.current) {
      educationAvatarInputRef.current.value = ''
    }
  }

  const resetLicenseForm = () => {
    setLicenseName('')
    setIssuingOrganization('')
    setSkillName('')
    setLicenseIssueDate('')
    setLicenseExpirationDate('')
    setLicenseAvatarFile(null)
    setLicenseAvatarPreview('')
    setRemoveLicenseAvatar(false)
    setAttachmentFile(null)
    setAttachmentName('')
    setExistingAttachmentUrl('')
    setExistingAttachmentType('')
    setRemoveAttachment(false)
    setLicenseError('')
    setEditingLicenseId(null)
    setLicenseMode('create')
    if (licenseAvatarInputRef.current) {
      licenseAvatarInputRef.current.value = ''
    }
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = ''
    }
  }

  const openEducationCreate = () => {
    resetEducationForm()
    setEducationMode('create')
    setEducationOpen(true)
  }

  const openEducationEdit = (item: ProfileEducationViewModel) => {
    resetEducationForm()
    setEducationMode('edit')
    setEditingEducationId(item.id)
    setSchoolName(item.schoolName)
    setDegree(item.degree)
    setFieldOfStudy(item.fieldOfStudy)
    setEducationStartDate(item.startDate)
    setEducationEndDate(item.endDate)
    setEducationAvatarPreview(item.schoolAvatarUrl)
    setEducationOpen(true)
  }

  const openLicenseCreate = () => {
    resetLicenseForm()
    setLicenseMode('create')
    setLicenseOpen(true)
  }

  const openLicenseEdit = (item: ProfileLicenseCertificationViewModel) => {
    resetLicenseForm()
    setLicenseMode('edit')
    setEditingLicenseId(item.id)
    setLicenseName(item.name)
    setIssuingOrganization(item.issuingOrganization)
    setSkillName(item.skillName)
    setLicenseIssueDate(item.issueDate)
    setLicenseExpirationDate(item.expirationDate)
    setLicenseAvatarPreview(item.avatarUrl)
    setAttachmentName(item.attachmentFileName)
    setExistingAttachmentUrl(item.attachmentDownloadUrl)
    setExistingAttachmentType(item.attachmentContentType)
    setLicenseOpen(true)
  }

  const submitEducation = () => {
    if (!schoolName.trim() || !fieldOfStudy.trim() || !educationStartDate) {
      setEducationError(t('experience.educationRequired'))
      return
    }

    const startYear = new Date(educationStartDate).getFullYear()
    if (isNaN(startYear) || startYear < 1940 || startYear > 2100) {
      setEducationError(t('experience.educationStartYear'))
      return
    }

    if (educationEndDate) {
      const endYear = new Date(educationEndDate).getFullYear()
      if (isNaN(endYear) || endYear < 1940 || endYear > 2100) {
        setEducationError(t('experience.educationEndYear'))
        return
      }
      if (new Date(educationEndDate) < new Date(educationStartDate)) {
        setEducationError(t('experience.educationEndBeforeStart'))
        return
      }
    }

    setEducationError('')

    const payload: UpdateEducationInput = {
      schoolName: schoolName.trim(),
      degree: degree.trim(),
      fieldOfStudy: fieldOfStudy.trim(),
      startDate: educationStartDate,
      endDate: educationEndDate || undefined,
      avatarFile: educationAvatarFile,
      removeAvatar: removeEducationAvatar,
    }

    if (educationMode === 'edit' && editingEducationId != null) {
      onUpdateEducation(editingEducationId, payload)
    } else {
      onCreateEducation(payload)
    }

    resetEducationForm()
    setEducationOpen(false)
  }

  const submitLicense = () => {
    if (!licenseName.trim() || !issuingOrganization.trim() || !skillName.trim() || !licenseIssueDate) {
      setLicenseError(t('experience.licenseRequired'))
      return
    }

    const issueYear = new Date(licenseIssueDate).getFullYear()
    if (isNaN(issueYear) || issueYear < 1940 || issueYear > 2100) {
      setLicenseError(t('experience.licenseIssueYear'))
      return
    }

    if (licenseExpirationDate) {
      const expYear = new Date(licenseExpirationDate).getFullYear()
      if (isNaN(expYear) || expYear < 1940 || expYear > 2100) {
        setLicenseError(t('experience.licenseExpiryYear'))
        return
      }
      if (new Date(licenseExpirationDate) < new Date(licenseIssueDate)) {
        setLicenseError(t('experience.licenseExpiryBeforeIssue'))
        return
      }
    }

    setLicenseError('')

    const payload: UpdateLicenseCertificationInput = {
      name: licenseName.trim(),
      issuingOrganization: issuingOrganization.trim(),
      skillName: skillName.trim(),
      issueDate: licenseIssueDate,
      expirationDate: licenseExpirationDate || undefined,
      avatarFile: licenseAvatarFile,
      attachmentFile,
      removeAvatar: removeLicenseAvatar,
      removeAttachment,
    }

    if (licenseMode === 'edit' && editingLicenseId != null) {
      onUpdateLicense(editingLicenseId, payload)
    } else {
      onCreateLicense(payload)
    }

    resetLicenseForm()
    setLicenseOpen(false)
  }

  return (
    <div className="space-y-5">
      <div className="border-t border-[#E2E5EA] pt-6 first:border-t-0 first:pt-0">
        <SectionHeader
          title={t('experience.education')}
          count={educations.length}
          actionLabel={t('experience.addEducation')}
          onAction={openEducationCreate}
          disabled={isEducationSaving}
        />

        {educationOpen ? (
          <div className="mt-7 rounded-[12px] border border-[#E2E5EA] bg-[#F6F7F9] p-6">
            <div className="mb-5 flex flex-col gap-4 rounded-[12px] border border-[#E2E5EA] bg-white p-5 sm:flex-row sm:items-center">
              <EntityAvatar
                label={schoolName || 'Education'}
                imageUrl={visibleEducationAvatar}
                tone="bg-[#EDF2FF]"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#17202E]">
                  {educationAvatarFile?.name || (visibleEducationAvatar ? t('experience.avatarUploaded') : t('experience.avatarNotSelected'))}
                </p>
                <p className="mt-1 text-xs text-[#586174]">{t('experience.educationAvatarHint')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={educationAvatarInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null
                    setEducationAvatarFile(file)
                    if (file) {
                      setRemoveEducationAvatar(false)
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => educationAvatarInputRef.current?.click()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-[#E2E5EA] bg-[#F6F7F9] px-4 text-sm font-semibold text-[#17202E]"
                >
                  <MaterialSymbol name="image" size={18} color="currentColor" />
                  {visibleEducationAvatar ? t('experience.replaceAvatar') : t('experience.addAvatar')}
                </button>
                {visibleEducationAvatar ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEducationAvatarFile(null)
                      setEducationAvatarPreview('')
                      setRemoveEducationAvatar(true)
                      if (educationAvatarInputRef.current) {
                        educationAvatarInputRef.current.value = ''
                      }
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-[#F2C9CA] bg-[#FFF0F0] px-4 text-sm font-semibold text-[#C03437]"
                  >
                    <MaterialSymbol name="delete" size={18} color="currentColor" />
                    {t('experience.remove')}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <LabeledInput label={t('experience.school')}>
                <input
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  className={fieldClassName}
                  placeholder={t('experience.schoolPlaceholder')}
                />
              </LabeledInput>
              <LabeledInput label={t('experience.degree')}>
                <input
                  value={degree}
                  onChange={(e) => setDegree(e.target.value)}
                  className={fieldClassName}
                  placeholder={t('experience.degreePlaceholder')}
                />
              </LabeledInput>
              <LabeledInput label={t('experience.specialty')}>
                <input
                  value={fieldOfStudy}
                  onChange={(e) => setFieldOfStudy(e.target.value)}
                  className={fieldClassName}
                  placeholder={t('experience.specialtyPlaceholder')}
                />
              </LabeledInput>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <LabeledInput label={t('experience.startDate')}>
                  <input
                    type="date"
                    value={educationStartDate}
                    onChange={(e) => setEducationStartDate(e.target.value)}
                    className={fieldClassName}
                    min="1940-01-01"
                    max="2100-12-31"
                  />
                </LabeledInput>
                <LabeledInput label={t('experience.endDate')}>
                  <input
                    type="date"
                    value={educationEndDate}
                    onChange={(e) => setEducationEndDate(e.target.value)}
                    className={fieldClassName}
                    min="1940-01-01"
                    max="2100-12-31"
                  />
                </LabeledInput>
              </div>
            </div>

            {educationError ? (
              <div className="mt-4 rounded-[6px] bg-[#FFF0F0] px-4 py-3 text-sm font-medium text-[#C03437]">
                {educationError}
              </div>
            ) : null}

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  resetEducationForm()
                  setEducationOpen(false)
                }}
                className="inline-flex h-11 items-center rounded-[6px] border border-[#E2E5EA] bg-white px-5 text-sm font-semibold text-[#586174]"
              >
                {t('common:actions.cancel')}
              </button>
              <button
                type="button"
                onClick={submitEducation}
                disabled={isEducationSaving}
                className="ts-button ts-button--primary inline-flex h-11 items-center gap-2 rounded-[6px] bg-[#2458D3] px-5 text-sm font-semibold text-white disabled:opacity-50"
              >
                <MaterialSymbol
                  name={educationMode === 'edit' ? 'save' : 'add'}
                  size={18}
                  color="#fff"
                />
                {isEducationSaving ? t('experience.saving') : educationMode === 'edit' ? t('common:actions.save') : t('experience.add')}
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          {educations.length ? (
            educations.map((item) => (
              <EducationCard
                key={item.id}
                item={item}
                onEdit={() => openEducationEdit(item)}
                onDelete={() => setConfirmDeleteEducation(item)}
                isDeleting={deletingEducationId === item.id}
                disabled={isEducationSaving}
              />
            ))
          ) : (
            <EmptyState
              icon="school"
              title={t('experience.educationEmptyTitle')}
              description={t('experience.educationEmptyDescription')}
              actionLabel={t('experience.addEducation')}
              onAction={openEducationCreate}
            />
          )}
        </div>
      </div>

      <div className="border-t border-[#E2E5EA] pt-6 first:border-t-0 first:pt-0">
        <SectionHeader
          title={t('experience.licenses')}
          count={licenses.length}
          actionLabel={t('experience.addLicense')}
          onAction={openLicenseCreate}
          disabled={isLicenseSaving}
        />

        {licenseOpen ? (
          <div className="mt-7 rounded-[12px] border border-[#E2E5EA] bg-[#F6F7F9] p-6">
            <div className="mb-5 flex flex-col gap-4 rounded-[12px] border border-[#E2E5EA] bg-white p-5 sm:flex-row sm:items-center">
              <EntityAvatar label={licenseName || 'License'} imageUrl={visibleLicenseAvatar} tone="bg-[#EDF2FF]" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#17202E]">
                  {licenseAvatarFile?.name || (visibleLicenseAvatar ? t('experience.avatarUploaded') : t('experience.avatarNotSelected'))}
                </p>
                <p className="mt-1 text-xs text-[#586174]">{t('experience.licenseAvatarHint')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={licenseAvatarInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null
                    setLicenseAvatarFile(file)
                    if (file) {
                      setRemoveLicenseAvatar(false)
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => licenseAvatarInputRef.current?.click()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-[#E2E5EA] bg-[#F6F7F9] px-4 text-sm font-semibold text-[#17202E]"
                >
                  <MaterialSymbol name="image" size={18} color="currentColor" />
                  {visibleLicenseAvatar ? t('experience.replaceAvatar') : t('experience.addAvatar')}
                </button>
                {visibleLicenseAvatar ? (
                  <button
                    type="button"
                    onClick={() => {
                      setLicenseAvatarFile(null)
                      setLicenseAvatarPreview('')
                      setRemoveLicenseAvatar(true)
                      if (licenseAvatarInputRef.current) {
                        licenseAvatarInputRef.current.value = ''
                      }
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-[#F2C9CA] bg-[#FFF0F0] px-4 text-sm font-semibold text-[#C03437]"
                  >
                    <MaterialSymbol name="delete" size={18} color="currentColor" />
                    {t('experience.remove')}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <LabeledInput label={t('experience.licenseName')}>
                <input
                  value={licenseName}
                  onChange={(e) => setLicenseName(e.target.value)}
                  className={fieldClassName}
                  placeholder={t('experience.licenseNamePlaceholder')}
                />
              </LabeledInput>
              <LabeledInput label={t('experience.issuer')}>
                <input
                  value={issuingOrganization}
                  onChange={(e) => setIssuingOrganization(e.target.value)}
                  className={fieldClassName}
                  placeholder={t('experience.issuerPlaceholder')}
                />
              </LabeledInput>
              <LabeledInput label={t('experience.skill')}>
                <input
                  value={skillName}
                  onChange={(e) => setSkillName(e.target.value)}
                  className={fieldClassName}
                  placeholder={t('experience.skillPlaceholder')}
                />
              </LabeledInput>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <LabeledInput label={t('experience.issueDate')}>
                  <input
                    type="date"
                    value={licenseIssueDate}
                    onChange={(e) => setLicenseIssueDate(e.target.value)}
                    className={fieldClassName}
                    min="1940-01-01"
                    max="2100-12-31"
                  />
                </LabeledInput>
                <LabeledInput label={t('experience.expiryDate')}>
                  <input
                    type="date"
                    value={licenseExpirationDate}
                    onChange={(e) => setLicenseExpirationDate(e.target.value)}
                    className={fieldClassName}
                    min="1940-01-01"
                    max="2100-12-31"
                  />
                </LabeledInput>
              </div>
            </div>

            <div className="mt-4">
              <LabeledInput label={t('experience.certificateFile')}>
                <div className="rounded-[8px] border border-dashed border-[#C4C9D2] bg-white p-4">
                  <input
                    ref={attachmentInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null
                      setAttachmentFile(file)
                      if (file) {
                        setRemoveAttachment(false)
                      }
                    }}
                  />
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#17202E]">
                        {visibleAttachmentName || t('experience.fileNotSelected')}
                      </p>
                      <p className="mt-1 text-xs text-[#586174]">
                        {visibleAttachmentType || 'PDF, JPG, PNG, WEBP, DOC, DOCX'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => attachmentInputRef.current?.click()}
                        className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-[#E2E5EA] bg-[#F6F7F9] px-4 text-sm font-semibold text-[#17202E]"
                      >
                        <MaterialSymbol name="description" size={18} color="currentColor" />
                        {visibleAttachmentName ? t('experience.replaceFile') : t('experience.chooseFile')}
                      </button>
                      {visibleAttachmentName ? (
                        <button
                          type="button"
                          onClick={() => {
                            setAttachmentFile(null)
                            setAttachmentName('')
                            setExistingAttachmentUrl('')
                            setExistingAttachmentType('')
                            setRemoveAttachment(true)
                            if (attachmentInputRef.current) {
                              attachmentInputRef.current.value = ''
                            }
                          }}
                          className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-[#F2C9CA] bg-[#FFF0F0] px-4 text-sm font-semibold text-[#C03437]"
                        >
                          <MaterialSymbol name="delete" size={18} color="currentColor" />
                          {t('experience.remove')}
                        </button>
                      ) : null}
                      {visibleAttachmentUrl ? (
                        <a
                          href={visibleAttachmentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-[#E2E5EA] bg-white px-4 text-sm font-semibold text-[#1D49B3]"
                        >
                          <MaterialSymbol name="open_in_new" size={18} color="currentColor" />
                          {t('common:actions.open')}
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              </LabeledInput>
            </div>

            {licenseError ? (
              <div className="mt-4 rounded-[6px] bg-[#FFF0F0] px-4 py-3 text-sm font-medium text-[#C03437]">
                {licenseError}
              </div>
            ) : null}

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  resetLicenseForm()
                  setLicenseOpen(false)
                }}
                className="inline-flex h-11 items-center rounded-[6px] border border-[#E2E5EA] bg-white px-5 text-sm font-semibold text-[#586174]"
              >
                {t('common:actions.cancel')}
              </button>
              <button
                type="button"
                onClick={submitLicense}
                disabled={isLicenseSaving}
                className="ts-button ts-button--primary inline-flex h-11 items-center gap-2 rounded-[6px] bg-[#2458D3] px-5 text-sm font-semibold text-white disabled:opacity-50"
              >
                <MaterialSymbol name={licenseMode === 'edit' ? 'save' : 'add'} size={18} color="#fff" />
                {isLicenseSaving ? t('experience.saving') : licenseMode === 'edit' ? t('common:actions.save') : t('experience.add')}
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          {licenses.length ? (
            licenses.map((item) => (
              <LicenseCard
                key={item.id}
                item={item}
                onEdit={() => openLicenseEdit(item)}
                onDelete={() => setConfirmDeleteLicense(item)}
                isDeleting={deletingLicenseId === item.id}
                disabled={isLicenseSaving}
              />
            ))
          ) : (
            <EmptyState
              icon="verified"
              title={t('experience.licensesEmptyTitle')}
              description={t('experience.licensesEmptyDescription')}
              actionLabel={t('experience.addLicense')}
              onAction={openLicenseCreate}
            />
          )}
        </div>
      </div>

      <AppConfirmDialog
        open={Boolean(confirmDeleteEducation)}
        title={t('experience.deleteEducationTitle')}
        message={t('experience.deleteMessage', { name: confirmDeleteEducation?.schoolName ?? '' })}
        confirmText={t('common:actions.delete')}
        isLoading={deletingEducationId === confirmDeleteEducation?.id}
        onCancel={() => setConfirmDeleteEducation(null)}
        onConfirm={() => {
          if (confirmDeleteEducation) {
            onDeleteEducation(confirmDeleteEducation.id)
            setConfirmDeleteEducation(null)
          }
        }}
      />

      <AppConfirmDialog
        open={Boolean(confirmDeleteLicense)}
        title={t('experience.deleteLicenseTitle')}
        message={t('experience.deleteMessage', { name: confirmDeleteLicense?.name ?? '' })}
        confirmText={t('common:actions.delete')}
        isLoading={deletingLicenseId === confirmDeleteLicense?.id}
        onCancel={() => setConfirmDeleteLicense(null)}
        onConfirm={() => {
          if (confirmDeleteLicense) {
            onDeleteLicense(confirmDeleteLicense.id)
            setConfirmDeleteLicense(null)
          }
        }}
      />
    </div>
  )
}
