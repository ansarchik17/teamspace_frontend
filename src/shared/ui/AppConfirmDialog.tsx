import { useTranslation } from 'react-i18next'
import MaterialSymbol from './MaterialSymbol'
import AppModal from './AppModal'
import AppButton from './AppButton'

interface AppConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  error?: string
  isLoading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function AppConfirmDialog({
  open,
  title,
  message,
  confirmText,
  cancelText,
  isLoading = false,
  error,
  onConfirm,
  onCancel,
}: AppConfirmDialogProps) {
  const { t } = useTranslation()
  if (!open) return null

  return (
    <AppModal title={title} maxWidth={480} onClose={() => { if (!isLoading) onCancel() }} footer={<>
      <AppButton variant="secondary" onClick={onCancel} disabled={isLoading}>{cancelText ?? t('actions.cancel')}</AppButton>
      <AppButton variant="danger" onClick={onConfirm} isLoading={isLoading}>{isLoading ? t('status.inProgress') : confirmText ?? t('actions.confirm')}</AppButton>
    </>}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FFF6F6]">
            <MaterialSymbol name="warning" size={18} color="#C53030" />
          </div>
          <div className="min-w-0">
            <p className="mt-1 break-words text-sm text-[#6B7280] [overflow-wrap:anywhere]">
              {message}
            </p>
            {error && <p role="alert" className="mt-3 text-sm text-[#C53030]">{error}</p>}
          </div>
        </div>

    </AppModal>
  )
}
