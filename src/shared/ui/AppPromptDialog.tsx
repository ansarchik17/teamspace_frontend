import { useTranslation } from 'react-i18next'
import AppModal from './AppModal'
import AppButton from './AppButton'

interface AppPromptDialogProps {
  open: boolean
  title: string
  label: string
  value: string
  placeholder?: string
  confirmText?: string
  cancelText?: string
  isLoading?: boolean
  onChange: (value: string) => void
  onConfirm: () => void
  onCancel: () => void
}

export default function AppPromptDialog({
  open,
  title,
  label,
  value,
  placeholder,
  confirmText,
  cancelText,
  isLoading = false,
  onChange,
  onConfirm,
  onCancel,
}: AppPromptDialogProps) {
  const { t } = useTranslation()
  if (!open) return null

  return (
    <AppModal title={title} maxWidth={480} onClose={() => { if (!isLoading) onCancel() }} footer={<>
      <AppButton variant="secondary" onClick={onCancel} disabled={isLoading}>{cancelText ?? t('actions.cancel')}</AppButton>
      <AppButton onClick={onConfirm} isLoading={isLoading} disabled={!value.trim()}>{isLoading ? t('status.saving') : confirmText ?? t('actions.save')}</AppButton>
    </>}>
      <label className="ts-field">
        <span>{label}</span>
        <input className="ts-input" value={value} autoFocus disabled={isLoading} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      </label>
    </AppModal>
  )
}
