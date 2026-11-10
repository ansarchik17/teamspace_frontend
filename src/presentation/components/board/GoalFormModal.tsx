import { bt } from './boardText'
export interface GoalFormValue {
  name: string
  description: string
}

interface GoalFormModalProps {
  open: boolean
  title: string
  confirmText: string
  value: GoalFormValue
  isSubmitting: boolean
  onChange: (next: GoalFormValue) => void
  onClose: () => void
  onSubmit: () => void
}

export default function GoalFormModal({
  open,
  title,
  confirmText,
  value,
  isSubmitting,
  onChange,
  onClose,
  onSubmit,
}: GoalFormModalProps) {
  return (
    <BoardEntityFormModal open={open} title={title} icon="track_changes" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSubmit() }} className="space-y-4 p-5">
        <div className="space-y-4">
          <label className={BOARD_FORM_LABEL}>
            {bt('name')}
            <input
              autoFocus
              placeholder={bt('goals.namePlaceholder')}
              value={value.name}
              onChange={(event) => onChange({ ...value, name: event.target.value })}
              className={BOARD_FORM_CONTROL}
            />
          </label>

          <label className={BOARD_FORM_LABEL}>
            {bt('description')}
            <textarea
              rows={4}
              placeholder={bt('goals.descriptionPlaceholder')}
              value={value.description}
              onChange={(event) => onChange({ ...value, description: event.target.value })}
              className={BOARD_FORM_TEXTAREA}
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-[#EEF2F6] pt-4">
          <AppButton type="button" variant="secondary" onClick={onClose}>{bt('cancel')}</AppButton>
          <AppButton type="submit" isLoading={isSubmitting} disabled={!value.name.trim()}>
            {isSubmitting ? bt('sprintForm.saving') : confirmText}
          </AppButton>
        </div>
      </form>
    </BoardEntityFormModal>
  )
}
import AppButton from '../../../shared/ui/AppButton'
import BoardEntityFormModal, {
  BOARD_FORM_CONTROL,
  BOARD_FORM_LABEL,
  BOARD_FORM_TEXTAREA,
} from './BoardEntityFormModal'
