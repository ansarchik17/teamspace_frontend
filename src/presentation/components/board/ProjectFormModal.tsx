import { bt } from './boardText'
import type { BoardGoalViewModel } from '../../view-models/BoardViewModel'
import AppButton from '../../../shared/ui/AppButton'
import AppSelect from '../../../shared/ui/AppSelect'
import BoardEntityFormModal, {
  BOARD_FORM_CONTROL,
  BOARD_FORM_LABEL,
  BOARD_FORM_TEXTAREA,
} from './BoardEntityFormModal'

export interface ProjectFormValue {
  name: string
  description: string
  goalId: string
  status: string
}

interface ProjectFormModalProps {
  open: boolean
  title: string
  confirmText: string
  value: ProjectFormValue
  goals: BoardGoalViewModel[]
  isSubmitting: boolean
  onChange: (next: ProjectFormValue) => void
  onClose: () => void
  onSubmit: () => void
}

export default function ProjectFormModal({
  open,
  title,
  confirmText,
  value,
  goals,
  isSubmitting,
  onChange,
  onClose,
  onSubmit,
}: ProjectFormModalProps) {
  return (
    <BoardEntityFormModal open={open} title={title} icon="account_tree" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSubmit() }} className="space-y-4 p-5">
        <div className="space-y-4">
          <label className={BOARD_FORM_LABEL}>
            {bt('name')}
            <input
              autoFocus
              placeholder={bt('projects.formNamePlaceholder')}
              value={value.name}
              onChange={(event) => onChange({ ...value, name: event.target.value })}
              className={BOARD_FORM_CONTROL}
            />
          </label>

          <label className={BOARD_FORM_LABEL}>
            {bt('goal')}
            <AppSelect
              value={value.goalId}
              onChange={(goalId) => onChange({ ...value, goalId })}
              options={[
                { value: '', label: bt('projects.noGoal') },
                ...goals.map((goal) => ({ value: goal.id, label: goal.name })),
              ]}
              showButtonAvatar={false}
              showOptionAvatar={false}
              buttonClassName="!mt-1.5 !h-10 !rounded-lg !bg-white"
            />
          </label>

          <label className={BOARD_FORM_LABEL}>
            {bt('list.status')}
            <AppSelect
              value={value.status}
              onChange={(status) => onChange({ ...value, status })}
              options={[
                { value: 'active', label: bt('projects.status.active') },
                { value: 'planned', label: bt('sprint.status.planned') },
                { value: 'paused', label: bt('projects.status.paused') },
                { value: 'done', label: bt('sprint.status.completed') },
              ]}
              showButtonAvatar={false}
              showOptionAvatar={false}
              buttonClassName="!mt-1.5 !h-10 !rounded-lg !bg-white"
            />
          </label>

          <label className={BOARD_FORM_LABEL}>
            {bt('description')}
            <textarea
              rows={4}
              placeholder={bt('projects.formDescriptionPlaceholder')}
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
