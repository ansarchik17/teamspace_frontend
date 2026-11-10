import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { Camera } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AvailabilityStatus } from '../../../domain/entities/profile-settings/ProfileSettingsModels'
import { availabilityStatuses } from '../../../domain/entities/profile-settings/ProfileSettingsModels'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import type { ProfileUserViewModel } from '../../view-models/ProfileViewModel'

interface ProfileUserCardProps {
  user: ProfileUserViewModel
  /** Строка под именем: «Должность · Организация» из HR-профиля */
  subtitle?: string
  verified?: boolean
  statusValue: AvailabilityStatus
  statusError: string
  avatarError: string
  isStatusSaving: boolean
  isAvatarSaving: boolean
  onStatusSubmit: (status: AvailabilityStatus) => void
  onAvatarSubmit: (file: File) => void
  onEditClick?: () => void
}

/** Плашка статуса в тоне самого статуса */
const STATUS_TONE: Record<AvailabilityStatus, string> = {
  online: 'bg-[#EDF8F1] text-[#16734B] hover:bg-[#E0F2E7]',
  offline: 'bg-[#F1F2F4] text-[#586174] hover:bg-[#E7E9EC]',
  sick: 'bg-[#FFF6E5] text-[#946000] hover:bg-[#FCEDD2]',
  vacation: 'bg-[#EDF2FF] text-[#2458D3] hover:bg-[#E0E8FD]',
}

const STATUS_DOT: Record<AvailabilityStatus, string> = {
  online: 'bg-[#16734B]',
  offline: 'bg-[#7B8494]',
  sick: 'bg-[#946000]',
  vacation: 'bg-[#2458D3]',
}

function StatusSelect({
  value,
  disabled,
  onChange,
}: {
  value: AvailabilityStatus
  disabled: boolean
  onChange: (status: AvailabilityStatus) => void
}) {
  const { t } = useTranslation(['profile', 'common'])
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex h-10 items-center gap-2 rounded-[6px] pl-3 pr-2.5 text-[14px] font-medium transition-colors duration-[120ms] disabled:opacity-60 ${STATUS_TONE[value]} ${AXIS_UI.focus}`}
      >
        <span className={`h-2 w-2 rounded-full ${STATUS_DOT[value]}`} />
        {t(`status.${value}`)}
        <MaterialSymbol name="expand_more" size={16} color="currentColor" className={`transition-transform duration-[120ms] ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <ul role="listbox" className="absolute right-0 top-[calc(100%+4px)] z-30 w-[200px] rounded-[8px] border border-[#E2E5EA] bg-white p-1 shadow-[0_8px_24px_rgba(23,32,46,0.12)]">
          {availabilityStatuses.map((status) => {
            const active = status === value
            return (
              <li key={status}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setOpen(false)
                    if (!active) onChange(status)
                  }}
                  className={`flex h-9 w-full items-center gap-2 rounded-[6px] px-3 text-left text-[14px] transition-colors duration-[120ms] ${active ? 'bg-[#EDF2FF] font-medium text-[#2458D3]' : 'text-[#17202E] hover:bg-[#F6F7F9]'}`}
                >
                  <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
                  <span className="flex-1">{t(`status.${status}`)}</span>
                  {active ? <MaterialSymbol name="check" size={16} color="currentColor" /> : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

export default function ProfileUserCard({
  user,
  subtitle,
  verified = false,
  statusValue,
  statusError,
  avatarError,
  isStatusSaving,
  isAvatarSaving,
  onStatusSubmit,
  onAvatarSubmit,
  onEditClick,
}: ProfileUserCardProps) {
  const { t } = useTranslation(['profile', 'common'])
  const [avatarBroken, setAvatarBroken] = useState(false)
  const [isAvatarPreviewOpen, setIsAvatarPreviewOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement | null>(null)

  const initials = useMemo(() => {
    const base = user.fullName || `${user.firstName} ${user.lastName}`.trim() || user.username
    return (
      base
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('') || '?'
    )
  }, [user.firstName, user.fullName, user.lastName, user.username])

  const hasAvatar = Boolean(user.avatarUrl) && !avatarBroken
  const displayName = user.fullName || `${user.firstName} ${user.lastName}`.trim() || user.username
  // Логин иногда совпадает с email — тогда не добавляем «@» и не дублируем строку
  const handle = user.username.includes('@') ? user.username : `@${user.username}`

  const openAvatarPicker = () => {
    if (isAvatarSaving) return
    avatarInputRef.current?.click()
  }

  const closeAvatarConfirm = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setSelectedFile(null)
    setPreviewUrl(null)
  }

  const handleAvatarFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  const avatarPreviewModal = isAvatarPreviewOpen ? (
    <div
      className="ts-legacy-backdrop fixed inset-0 z-[9999] flex items-center justify-center bg-[#17202E]/70 p-4"
      onClick={() => setIsAvatarPreviewOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label={t('avatar.preview')}
    >
      <div className="relative max-h-[90vh] w-full max-w-[560px] overflow-hidden rounded-[12px] bg-white [font-family:Inter,sans-serif]" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          onClick={() => setIsAvatarPreviewOpen(false)}
          className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#17202E]/50 text-white transition-colors hover:bg-[#17202E]/70"
          aria-label={t('avatar.closePreview')}
        >
          <MaterialSymbol name="close" size={18} color="currentColor" />
        </button>
        <div className="flex items-center justify-center bg-[#17202E] p-4">
          {hasAvatar ? (
            <img src={user.avatarUrl} alt={displayName} className="max-h-[70vh] w-auto max-w-full rounded-[8px] object-contain" />
          ) : (
            <span className="flex h-60 w-60 items-center justify-center rounded-full bg-[#2458D3] text-[72px] font-semibold text-white">{initials}</span>
          )}
        </div>
        <div className="flex justify-end border-t border-[#E2E5EA] px-4 py-3">
          <button
            type="button"
            onClick={() => {
              setIsAvatarPreviewOpen(false)
              openAvatarPicker()
            }}
            disabled={isAvatarSaving}
            className={`${AXIS_UI.primaryButton} !h-10`}
          >
            <MaterialSymbol name="image" size={16} color="currentColor" />
            {t('avatar.uploadNew')}
          </button>
        </div>
      </div>
    </div>
  ) : null

  const avatarConfirmModal = selectedFile && previewUrl ? (
    <div className="ts-legacy-backdrop fixed inset-0 z-[9999] flex items-center justify-center bg-[#17202E]/40 p-4" role="dialog" aria-modal="true" aria-label={t('avatar.newTitle')}>
      <div className="w-full max-w-sm rounded-[12px] bg-white p-6 text-center shadow-[0_24px_60px_rgba(23,32,46,0.2)] [font-family:Inter,sans-serif]">
        <h2 className="text-[18px] font-semibold leading-[26px] text-[#17202E]">{t('avatar.newTitle')}</h2>
        <img src={previewUrl} alt="" className="mx-auto mt-4 h-32 w-32 rounded-full object-cover" />
        <p className="mt-3 truncate text-[12px] text-[#586174]">{selectedFile.name}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button type="button" onClick={closeAvatarConfirm} className={`${AXIS_UI.secondaryButton} !h-10 !px-4`}>
            {t('common:actions.cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              onAvatarSubmit(selectedFile)
              closeAvatarConfirm()
            }}
            disabled={isAvatarSaving}
            className={`${AXIS_UI.primaryButton} !h-10`}
          >
            {t('avatar.save')}
          </button>
        </div>
      </div>
    </div>
  ) : null

  return (
    <section className="rounded-[12px] border border-[#E2E5EA] bg-white p-6">
      <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarFileChange} />

      <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
        <div className="relative h-[88px] w-[88px] shrink-0">
          <button
            type="button"
            onClick={() => setIsAvatarPreviewOpen(true)}
            className={`block h-full w-full overflow-hidden rounded-full ${AXIS_UI.focus}`}
            aria-label={t('avatar.open')}
          >
            {hasAvatar ? (
              <img src={user.avatarUrl} alt={displayName} className="h-full w-full object-cover" onError={() => setAvatarBroken(true)} />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-[#2458D3] text-[30px] font-semibold text-white">{initials}</span>
            )}
          </button>
          <button
            type="button"
            onClick={openAvatarPicker}
            disabled={isAvatarSaving}
            className={`absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border border-[#E2E5EA] bg-white text-[#2458D3] shadow-[0_2px_6px_rgba(23,32,46,0.12)] transition-colors duration-[120ms] hover:bg-[#EDF2FF] disabled:opacity-60 ${AXIS_UI.focus}`}
            aria-label={t('avatar.change')}
            title={t('avatar.changeShort')}
          >
            {isAvatarSaving ? (
              <MaterialSymbol name="autorenew" size={16} color="currentColor" className="animate-spin" />
            ) : (
              <Camera size={16} strokeWidth={1.75} aria-hidden />
            )}
          </button>
        </div>

        <div className="min-w-0 max-w-full">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-[24px] font-semibold leading-8 text-[#17202E]">{displayName}</h2>
            {verified ? (
              <span className="inline-flex h-6 items-center gap-1 rounded-[6px] bg-[#EDF8F1] px-2 text-[12px] font-medium text-[#16734B]" title={t('card.verifiedHint')}>
                <MaterialSymbol name="verified" size={14} color="currentColor" />
                {t('card.verified')}
              </span>
            ) : null}
          </div>
          {subtitle ? <p className="mt-1 truncate text-[14px] leading-5 text-[#17202E]">{subtitle}</p> : null}
          <p className="mt-0.5 truncate text-[14px] leading-5 text-[#586174]">{handle}</p>
          {avatarError ? <p className="mt-2 text-[12px] text-[#C03437]">{avatarError}</p> : null}
        </div>

        <div className="flex flex-col items-start gap-1.5 sm:ml-auto sm:items-end">
          <div className="flex items-center gap-2">
            <StatusSelect value={statusValue} disabled={isStatusSaving} onChange={onStatusSubmit} />
            {onEditClick ? (
              <button type="button" onClick={onEditClick} className={`${AXIS_UI.secondaryButton} !h-10 !px-4`}>
                <MaterialSymbol name="edit" size={16} color="#2458D3" />
                {t('common:actions.edit')}
              </button>
            ) : null}
          </div>
          {statusError ? <span className="text-[12px] leading-4 text-[#C03437]">{statusError}</span> : null}
        </div>
      </div>

      {typeof document !== 'undefined' && avatarPreviewModal ? createPortal(avatarPreviewModal, document.body) : null}
      {typeof document !== 'undefined' && avatarConfirmModal ? createPortal(avatarConfirmModal, document.body) : null}
    </section>
  )
}
