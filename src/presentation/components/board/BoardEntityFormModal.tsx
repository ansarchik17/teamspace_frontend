import type { ReactNode } from 'react'
import AppModal from '../../../shared/ui/AppModal'

interface BoardEntityFormModalProps {
  open: boolean
  title: string
  icon: string
  maxWidth?: string
  children: ReactNode
  onClose: () => void
}

export const BOARD_FORM_LABEL = 'ts-field'
export const BOARD_FORM_CONTROL = 'ts-input'
export const BOARD_FORM_TEXTAREA = 'ts-input'

export default function BoardEntityFormModal({
  open,
  title,
  icon,
  maxWidth = 'max-w-lg',
  children,
  onClose,
}: BoardEntityFormModalProps) {
  if (!open) return null
  const width = maxWidth === 'max-w-xl' ? 576 : 512
  return (
    <AppModal title={title} maxWidth={width} onClose={onClose}>
      <div className="board-entity-form" data-form-icon={icon}>{children}</div>
    </AppModal>
  )
}
