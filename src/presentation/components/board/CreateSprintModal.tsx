import { useEffect, useRef, useState } from 'react'
import type { BoardGoalViewModel, BoardProjectViewModel } from '../../view-models/BoardViewModel'
import AppButton from '../../../shared/ui/AppButton'
import { bt } from './boardText'
import AppSelect from '../../../shared/ui/AppSelect'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import MiniCalendar, { buildMiniCalendarCells, toDayKey } from '../calendar/MiniCalendar'
import BoardEntityFormModal, {
  BOARD_FORM_CONTROL,
  BOARD_FORM_LABEL,
} from './BoardEntityFormModal'

function isValidDateString(str: string): boolean {
  if (!str) return true
  const parts = str.split('-')
  if (parts.length !== 3) return false

  const year = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10)
  const day = parseInt(parts[2], 10)

  if (isNaN(year) || isNaN(month) || isNaN(day)) return false
  if (month < 1 || month > 12) return false
  if (day < 1 || day > 31) return false

  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day
}

function parseLocalDate(str: string): Date {
  const parts = str.split('-')
  const year = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10)
  const day = parseInt(parts[2], 10)
  return new Date(year, month - 1, day)
}

const formatDateLabel = (value: string) => {
  if (!value || !isValidDateString(value)) return bt('sprintForm.pickDate')
  return parseLocalDate(value).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

interface SprintDatePickerProps {
  label: string
  value: string
  onChange: (value: string) => void
}

function SprintDatePicker({ label, value, onChange }: SprintDatePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [anchorDate, setAnchorDate] = useState(() => value && isValidDateString(value) ? parseLocalDate(value) : new Date())

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  const openPicker = () => {
    setAnchorDate(value && isValidDateString(value) ? parseLocalDate(value) : new Date())
    setIsOpen(true)
  }

  return (
    <div ref={rootRef} className="relative">
      <span className={BOARD_FORM_LABEL}>{label}</span>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => isOpen ? setIsOpen(false) : openPicker()}
        className={`${BOARD_FORM_CONTROL} mt-1.5 flex w-full items-center justify-between gap-2 text-left ${value ? 'text-[#172B4D]' : 'text-[#94A3B8]'}`}
      >
        <span className="truncate">{formatDateLabel(value)}</span>
        <MaterialSymbol name="calendar_today" size={17} color="currentColor" />
      </button>

      {isOpen ? (
        <div role="dialog" aria-label={label} className="absolute left-0 top-[calc(100%+8px)] z-[1200] w-[316px] rounded-xl border border-[#DDE6F2] bg-white p-3.5 shadow-[0_18px_42px_rgba(15,35,62,0.18)]">
          <MiniCalendar
            anchorDate={anchorDate}
            cells={buildMiniCalendarCells(anchorDate, value)}
            onPrev={() => setAnchorDate((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))}
            onNext={() => setAnchorDate((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))}
            onSelect={(dateKey) => {
              onChange(dateKey)
              setIsOpen(false)
            }}
          />
          <div className="mt-3 flex items-center justify-between border-t border-[#EEF2F6] pt-3">
            <button
              type="button"
              onClick={() => { onChange(''); setIsOpen(false) }}
              className="text-[11px] font-semibold text-[#6B7A99] transition hover:text-[#3159E8]"
            >
              {bt('filters.clear')}
            </button>
            <button
              type="button"
              onClick={() => { onChange(toDayKey(new Date())); setIsOpen(false) }}
              className="text-[11px] font-semibold text-[#3159E8] transition hover:text-[#244AD2]"
            >
              {bt('taskDetail.history.today')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export interface SprintFormValue {
  name: string
  goalId: string
  projectId: string
  status: string
  startDate: string
  endDate: string
}

interface CreateSprintModalProps {
  open: boolean
  value: SprintFormValue
  goals: BoardGoalViewModel[]
  projects: BoardProjectViewModel[]
  title?: string
  confirmText?: string
  isSubmitting: boolean
  onClose: () => void
  onChange: (next: SprintFormValue) => void
  onSubmit: () => void
}

export default function CreateSprintModal({
  open,
  value,
  goals,
  projects,
  title = bt('sprints.create'),
  confirmText = bt('create'),
  isSubmitting,
  onClose,
  onChange,
  onSubmit,
}: CreateSprintModalProps) {
  const startInvalid = value.startDate ? !isValidDateString(value.startDate) : false
  const endInvalid = value.endDate ? !isValidDateString(value.endDate) : false

  let dateErrorMessage = ''
  if (startInvalid || endInvalid) {
    dateErrorMessage = bt('sprintForm.invalidDate')
  } else if (value.startDate && value.endDate) {
    const start = parseLocalDate(value.startDate)
    const end = parseLocalDate(value.endDate)
    if (start.getTime() > end.getTime()) {
      dateErrorMessage = bt('sprintForm.endBeforeStart')
    }
  }

  const filteredProjects = value.goalId
    ? projects.filter((project) => project.goalId === value.goalId)
    : projects

  return (
    <BoardEntityFormModal open={open} title={title} icon="sprint" maxWidth="max-w-xl" onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSubmit() }} className="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className={`${BOARD_FORM_LABEL} md:col-span-2`}>
            {bt('name')}
            <input
              autoFocus
              placeholder={bt('sprintForm.namePlaceholder')}
              value={value.name}
              onChange={(event) => onChange({ ...value, name: event.target.value })}
              className={BOARD_FORM_CONTROL}
            />
          </label>

          <label className={BOARD_FORM_LABEL}>
            {bt('goal')}
            <AppSelect
              value={value.goalId}
              onChange={(nextGoalId) => {
                const nextProjectId = value.projectId && projects.some((project) => project.id === value.projectId && project.goalId === nextGoalId)
                  ? value.projectId
                  : ''
                onChange({ ...value, goalId: nextGoalId, projectId: nextProjectId })
              }}
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
            {bt('createTask.project')}
            <AppSelect
              value={value.projectId}
              onChange={(nextProjectId) => {
                const relatedProject = projects.find((project) => project.id === nextProjectId)
                onChange({
                  ...value,
                  projectId: nextProjectId,
                  goalId: relatedProject?.goalId ?? value.goalId,
                })
              }}
              options={[
                { value: '', label: bt('createTask.noProject') },
                ...filteredProjects.map((project) => ({ value: project.id, label: project.name })),
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
                { value: 'planned', label: bt('sprint.status.planned') },
                { value: 'active', label: bt('sprint.status.active') },
                { value: 'closed', label: bt('sprint.status.completed') },
              ]}
              showButtonAvatar={false}
              showOptionAvatar={false}
              buttonClassName="!mt-1.5 !h-10 !rounded-lg !bg-white"
            />
          </label>

          <SprintDatePicker
            label={bt('sprintForm.start')}
            value={value.startDate}
            onChange={(startDate) => onChange({ ...value, startDate })}
          />

          <SprintDatePicker
            label={bt('sprintForm.end')}
            value={value.endDate}
            onChange={(endDate) => onChange({ ...value, endDate })}
          />
        </div>

        {dateErrorMessage ? (
          <div className="rounded-lg border border-[#F6C9C9] bg-[#FFF6F6] px-3 py-2 text-xs font-semibold text-[#C53030]">{dateErrorMessage}</div>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-[#EEF2F6] pt-4">
          <AppButton type="button" variant="secondary" onClick={onClose}>{bt('cancel')}</AppButton>
          <AppButton type="submit" isLoading={isSubmitting} disabled={!value.name.trim() || !!dateErrorMessage}>
            {isSubmitting ? bt('sprintForm.saving') : confirmText}
          </AppButton>
        </div>
      </form>
    </BoardEntityFormModal>
  )
}
