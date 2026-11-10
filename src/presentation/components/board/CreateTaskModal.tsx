import type { BoardSprintViewModel, BoardUserViewModel, BoardLabelViewModel, BoardTaskViewModel, BoardGoalViewModel, BoardProjectViewModel } from '../../view-models/BoardViewModel'
import type { BoardTask } from '../../../domain/entities/board/BoardModels'
import type { KanbanAssigneeAdviceResponse } from '../../../domain/entities/AiTools'
import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent, type ReactNode } from 'react'
import { CalendarDays, Check, CircleCheck, CornerLeftUp, Flag, Folder, Loader, Loader2, Paperclip, Plus, Sparkles, Tag, Target, Upload, UsersRound, X } from 'lucide-react'
import AppSelect from '../../../shared/ui/AppSelect'
import FloatingMenu, { floatingMenuItemClass } from '../../../shared/ui/FloatingMenu'
import GradientAvatar from '../../../shared/ui/GradientAvatar'
import TaskDeadlinePicker from './TaskDeadlinePicker'
import { formatDate } from '../../../shared/i18n'
import { bt } from './boardText'

const PRIORITY_META: Record<BoardTask['priority'], { label: string; bg: string; fg: string }> = {
  low: { get label() { return bt('priority.low') }, bg: '#E8EBFF', fg: '#3B4BC8' },
  medium: { get label() { return bt('priority.medium') }, bg: '#FFF4E0', fg: '#C77700' },
  high: { get label() { return bt('priority.high') }, bg: '#FFECE5', fg: '#E2521B' },
  critical: { get label() { return bt('priority.critical') }, bg: '#FDE8E8', fg: '#D92D20' },
}

const LABEL_COLORS = ['#2458D3', '#16A34A', '#E8900C', '#D92D20', '#9333EA', '#0891B2']

const BARE_SELECT = '!h-7 !w-auto !max-w-[300px] !gap-1 !border-0 !bg-transparent !px-0 !text-[13px] !text-[#1D1D1F] !ring-0 hover:!text-[#2458D3]'
const MENU_INPUT = 'h-9 w-full rounded-md bg-[#F1F3F4] px-3 text-[14px] text-[#1F1F1F] outline-none placeholder:text-[#5F6368] focus:bg-white focus:shadow-[inset_0_0_0_2px_#1A73E8]'

const formatLongDate = (date: Date) =>
  formatDate(date, { day: 'numeric', month: 'long', year: 'numeric' }).replace(/\s?г\.?$/, '') // i18n-ignore

const formatTime = (date: Date) => date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

function PropertyRow({ icon, label, children, alignTop = false }: { icon: ReactNode; label: string; children: ReactNode; alignTop?: boolean }) {
  return (
    <div className={`grid grid-cols-[120px_minmax(0,1fr)] gap-3 sm:grid-cols-[150px_minmax(0,1fr)] ${alignTop ? 'items-start' : 'items-center'}`}>
      <dt className="flex min-h-7 items-center gap-2 text-[13px] text-[#8E8E93]">
        <span className="flex shrink-0 text-[#AEAEB2]">{icon}</span>
        <span className="truncate">{label}</span>
      </dt>
      <dd className="flex min-h-7 min-w-0 items-center">{children}</dd>
    </div>
  )
}

interface CreateTaskModalProps {
  open: boolean
  users: BoardUserViewModel[]
  sprints: BoardSprintViewModel[]
  goals: BoardGoalViewModel[]
  projects: BoardProjectViewModel[]
  allLabels: BoardLabelViewModel[]
  availableParentTasks: BoardTaskViewModel[]
  isSubmitting: boolean
  value: {
    title: string
    description: string
    priority: BoardTask['priority']
    sprintId: string
    goalId: string
    projectId: string
    dueAt: string
    assigneeIds: number[]
    labelIds: string[]
    parentId: string
    attachmentFileIds: string[]
  }
  uploadedAttachments: { id: string; fileName: string }[]
  onClose: () => void
  onChange: (next: CreateTaskModalProps['value']) => void
  onUpload: (file: File) => Promise<void>
  onRemoveAttachment: (id: string) => void
  onSubmit: () => void
  onCreateBoardLabel: (payload: { name: string; color: string }) => Promise<void>
  onAiAssist?: () => Promise<void>
  isAiProcessing?: boolean
  onAnalyzeAssigneeWorkload?: (payload: {
    title: string
    description: string
    userId: number
    teamRole: string
  }) => Promise<KanbanAssigneeAdviceResponse>
}

export default function CreateTaskModal({
  open,
  users,
  sprints,
  goals,
  projects,
  allLabels,
  availableParentTasks,
  isSubmitting,
  value,
  uploadedAttachments,
  onClose,
  onChange,
  onUpload,
  onRemoveAttachment,
  onSubmit,
  onCreateBoardLabel,
  onAiAssist,
  isAiProcessing,
  onAnalyzeAssigneeWorkload,
}: CreateTaskModalProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [isAttachmentDropActive, setIsAttachmentDropActive] = useState(false)
  const [newLabelName, setNewLabelName] = useState('')
  const [priorityMenuOpen, setPriorityMenuOpen] = useState(false)
  const [labelMenuOpen, setLabelMenuOpen] = useState(false)
  const [memberMenuOpen, setMemberMenuOpen] = useState(false)
  const [memberQuery, setMemberQuery] = useState('')
  const priorityButtonRef = useRef<HTMLButtonElement | null>(null)
  const labelButtonRef = useRef<HTMLButtonElement | null>(null)
  const memberButtonRef = useRef<HTMLButtonElement | null>(null)
  const titleRef = useRef<HTMLTextAreaElement | null>(null)
  const [assigneeAdvice, setAssigneeAdvice] = useState<KanbanAssigneeAdviceResponse | null>(null)
  const [assigneeAdviceError, setAssigneeAdviceError] = useState('')
  const [isAssigneeAdviceLoading, setIsAssigneeAdviceLoading] = useState(false)

  const filteredProjects = value.goalId
    ? projects.filter((p) => p.goalId === value.goalId)
    : projects

  const handleGoalChangeForTask = (goalId: string) => {
    let nextProjectId = value.projectId
    if (goalId) {
      const selectedProj = projects.find((p) => p.id === value.projectId)
      if (selectedProj && selectedProj.goalId !== goalId) {
        nextProjectId = ''
      }
    }
    onChange({ ...value, goalId, projectId: nextProjectId })
  }

  const handleProjectChangeForTask = (projectId: string) => {
    let nextGoalId = value.goalId
    if (projectId) {
      const selectedProj = projects.find((p) => p.id === projectId)
      if (selectedProj && selectedProj.goalId) {
        nextGoalId = selectedProj.goalId
      }
    }
    onChange({ ...value, projectId, goalId: nextGoalId })
  }

  useEffect(() => {
    const element = titleRef.current
    if (!element) return
    element.style.height = '0px'
    element.style.height = `${element.scrollHeight}px`
  }, [value.title, open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !priorityMenuOpen && !labelMenuOpen && !memberMenuOpen) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose, priorityMenuOpen, labelMenuOpen, memberMenuOpen])

  useEffect(() => {
    if (!open) {
      setAssigneeAdvice(null)
      setAssigneeAdviceError('')
      setIsAssigneeAdviceLoading(false)
    }
  }, [open])

  if (!open) return null

  const primaryAssigneeId = value.assigneeIds[0]
  const primaryAssignee = primaryAssigneeId != null ? users.find((user) => user.id === primaryAssigneeId) : undefined
  const primaryTeamRole = primaryAssignee?.teamRole?.trim() || ''
  const recommendedAssigneeId = assigneeAdvice?.recommended_assignee?.user_id
  const canAnalyzeAssignee =
    Boolean(onAnalyzeAssigneeWorkload) &&
    Boolean(value.title.trim()) &&
    primaryAssigneeId != null &&
    Boolean(primaryTeamRole) &&
    !isAssigneeAdviceLoading

  const handleAnalyzeAssigneeWorkload = async () => {
    if (!onAnalyzeAssigneeWorkload || primaryAssigneeId == null || !primaryTeamRole) return

    setIsAssigneeAdviceLoading(true)
    setAssigneeAdviceError('')
    try {
      const result = await onAnalyzeAssigneeWorkload({
        title: value.title.trim(),
        description: value.description.trim(),
        userId: primaryAssigneeId,
        teamRole: primaryTeamRole,
      })
      setAssigneeAdvice(result)
    } catch (error) {
      setAssigneeAdvice(null)
      setAssigneeAdviceError(error instanceof Error ? error.message : bt('errors.workload'))
    } finally {
      setIsAssigneeAdviceLoading(false)
    }
  }

  const handleApplyRecommendedAssignee = () => {
    if (!assigneeAdvice?.recommended_assignee) return
    onChange({ ...value, assigneeIds: [assigneeAdvice.recommended_assignee.user_id] })
  }

  const priorityMeta = PRIORITY_META[value.priority] ?? PRIORITY_META.medium
  const dueDate = value.dueAt ? new Date(value.dueAt) : null
  const assignees = value.assigneeIds.map((id) => users.find((user) => user.id === id)).filter((user): user is BoardUserViewModel => Boolean(user))
  const normalizedMemberQuery = memberQuery.trim().toLowerCase()
  const memberOptions = normalizedMemberQuery
    ? users.filter((user) => user.fullName.toLowerCase().includes(normalizedMemberQuery))
    : users

  const toggleAssignee = (userId: number) => {
    onChange({
      ...value,
      assigneeIds: value.assigneeIds.includes(userId)
        ? value.assigneeIds.filter((id) => id !== userId)
        : [...value.assigneeIds, userId],
    })
  }

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    setUploadError('')
    try {
      await onUpload(file)
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : bt('errors.upload'))
    } finally {
      setIsUploading(false)
      e.target.value = ''
    }
  }

  const handlePaste = async (e: ClipboardEvent) => {
    const items = e.clipboardData.items
    for (const item of items) {
      if (item.type.includes('image') || item.kind === 'file') {
        const file = item.getAsFile()
        if (file) {
          setIsUploading(true)
          setUploadError('')
          try {
            await onUpload(file)
          } catch (err) {
            setUploadError(err instanceof Error ? err.message : bt('errors.upload'))
          } finally {
            setIsUploading(false)
          }
        }
      }
    }
  }

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsAttachmentDropActive(false)
    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      setIsUploading(true)
      setUploadError('')
      try {
        for (let i = 0; i < files.length; i++) {
          await onUpload(files[i])
        }
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : bt('errors.upload'))
      } finally {
        setIsUploading(false)
      }
    }
  }

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleAttachmentDragEnter = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) {
      setIsAttachmentDropActive(true)
    }
  }

  const handleAttachmentDragLeave = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setIsAttachmentDropActive(false)
    }
  }

  const isLabelDuplicate = allLabels.some(
    (l) => l.name.toLowerCase() === newLabelName.trim().toLowerCase()
  )

  const handleCreateLabel = async () => {
    if (!newLabelName.trim() || isLabelDuplicate) return
    try {
      await onCreateBoardLabel({ name: newLabelName.trim(), color: LABEL_COLORS[allLabels.length % LABEL_COLORS.length] })
      setNewLabelName('')
    } catch {
      // handled by parent
    }
  }

  const addableLabels = allLabels.filter((l) => !value.labelIds.includes(l.id))
  const selectedLabels = value.labelIds
    .map((lid) => allLabels.find((l) => l.id === lid))
    .filter((label): label is BoardLabelViewModel => Boolean(label))
  const canSubmit = Boolean(value.title.trim()) && !isSubmitting

  return (
    <div
      className="task-detail-backdrop fixed inset-0 z-[700] bg-[#0A1628]/[0.22]"
      onPaste={handlePaste}
      onDragEnter={handleAttachmentDragEnter}
      onDragLeave={handleAttachmentDragLeave}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      role="presentation"
    >
      <div
        className="task-detail-drawer absolute bottom-3 right-3 top-3 flex w-[min(560px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_70px_rgba(10,22,40,0.22)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-task-title"
      >
        {isAttachmentDropActive ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-white/90 text-center" aria-hidden="true">
            <Upload size={22} strokeWidth={1.5} className="text-[#2458D3]" />
            <p className="text-[13px] font-medium text-[#1D1D1F]">{bt('createTask.dropRelease')}</p>
            <p className="text-[12px] text-[#8E8E93]">{bt('createTask.dropHint')}</p>
          </div>
        ) : null}

        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#F0F1F3] px-5">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="-ml-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-[#3C3C43] transition hover:bg-[#F3F4F6]"
              aria-label={bt('close')}
            >
              <X size={19} strokeWidth={1.75} />
            </button>
            <h2 id="create-task-title" className="text-[13px] text-[#8E8E93]">{bt('page.newTask')}</h2>
          </div>
          <label
            className={`-mr-1.5 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[#3C3C43] transition hover:bg-[#F3F4F6] ${isUploading ? 'pointer-events-none opacity-50' : ''}`}
            title={bt('createTask.attachFile')}
          >
            {isUploading ? <Loader2 size={17} className="animate-spin" /> : <Paperclip size={17} strokeWidth={1.75} />}
            <input type="file" className="hidden" onChange={handleFileChange} disabled={isUploading} />
          </label>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-color:#D1D5DB_transparent] [scrollbar-width:thin]">
          <div className="px-5 pb-6 pt-5">
            <textarea
              ref={titleRef}
              value={value.title}
              onChange={(event) => onChange({ ...value, title: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  if (canSubmit) onSubmit()
                }
              }}
              rows={1}
              autoFocus
              aria-required="true"
              placeholder={bt('taskDetail.titlePlaceholder')}
              className="-mx-1 block w-[calc(100%+8px)] resize-none overflow-hidden rounded-lg bg-transparent px-1 text-[20px] font-semibold leading-[26px] tracking-[-0.015em] text-[#1D1D1F] outline-none placeholder:text-[#C7C7CC] focus:bg-[#F5F5F7]"
            />

            <dl className="mt-5 space-y-1.5">
              <PropertyRow icon={<Loader size={15} strokeWidth={1.75} />} label={bt('list.status')}>
                <span className="inline-flex h-6 items-center gap-1.5 rounded-md bg-[#EEF0FF] px-2 text-[12px] font-medium text-[#4F46E5]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#4F46E5]" />
                  {bt('status.TODO')}
                </span>
              </PropertyRow>

              <PropertyRow icon={<CircleCheck size={15} strokeWidth={1.75} />} label={bt('list.priority')}>
                <button
                  ref={priorityButtonRef}
                  type="button"
                  onClick={() => setPriorityMenuOpen((open) => !open)}
                  className="inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-medium transition hover:brightness-95"
                  style={{ background: priorityMeta.bg, color: priorityMeta.fg }}
                >
                  {priorityMeta.label}
                </button>
                <FloatingMenu anchor={priorityButtonRef.current} open={priorityMenuOpen} onClose={() => setPriorityMenuOpen(false)} align="start">
                  {(Object.keys(PRIORITY_META) as Array<BoardTask['priority']>).map((item) => (
                    <button key={item} type="button" className={floatingMenuItemClass} onClick={() => { onChange({ ...value, priority: item }); setPriorityMenuOpen(false) }}>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: PRIORITY_META[item].fg }} />
                      <span className="flex-1">{PRIORITY_META[item].label}</span>
                      {value.priority === item ? <Check size={18} className="text-[#1967D2]" /> : null}
                    </button>
                  ))}
                </FloatingMenu>
              </PropertyRow>

              <PropertyRow icon={<CalendarDays size={15} strokeWidth={1.75} />} label={bt('list.due')}>
                <TaskDeadlinePicker
                  value={value.dueAt}
                  onChange={(dueAt) => onChange({ ...value, dueAt })}
                  formatLabel={(date) => `${formatLongDate(date)}, ${formatTime(date)}`}
                  emptyLabel={bt('taskDetail.addDue')}
                  showIcon={false}
                  buttonClassName={`!h-7 !w-auto !gap-1 !rounded-md !border-0 !bg-transparent !px-0 !text-[13px] !font-normal hover:!text-[#2458D3] ${dueDate ? '!text-[#1D1D1F]' : '!text-[#AEAEB2]'}`}
                />
              </PropertyRow>

              <PropertyRow icon={<Tag size={15} strokeWidth={1.75} />} label={bt('taskDetail.labels')} alignTop>
                <div className="flex flex-wrap items-center gap-1.5 py-0.5">
                  {selectedLabels.map((label) => (
                    <span key={label.id} className="group inline-flex h-6 items-center gap-1 rounded-full bg-[#F2F2F7] px-2.5 text-[12px] text-[#3C3C43]">
                      {label.name}
                      <button
                        type="button"
                        onClick={() => onChange({ ...value, labelIds: value.labelIds.filter((id) => id !== label.id) })}
                        className="-mr-1 hidden h-4 w-4 items-center justify-center rounded-full text-[#6B7280] transition hover:bg-[#E5E7EB] hover:text-[#D92D20] group-hover:flex"
                        aria-label={bt('taskDetail.removeLabel', { name: label.name })}
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                  <button
                    ref={labelButtonRef}
                    type="button"
                    onClick={() => setLabelMenuOpen((open) => !open)}
                    className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-[#D1D1D6] text-[#8E8E93] transition hover:border-[#2458D3] hover:text-[#2458D3]"
                    aria-label={bt('taskDetail.addLabel')}
                  >
                    <Plus size={13} />
                  </button>
                  <FloatingMenu anchor={labelButtonRef.current} open={labelMenuOpen} onClose={() => setLabelMenuOpen(false)} align="start" className="w-[260px]">
                    <div className="max-h-56 overflow-y-auto">
                      {addableLabels.map((label) => (
                        <button key={label.id} type="button" className={floatingMenuItemClass} onClick={() => { onChange({ ...value, labelIds: [...value.labelIds, label.id] }); setLabelMenuOpen(false) }}>
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: label.color }} />
                          <span className="truncate">{label.name}</span>
                        </button>
                      ))}
                      {addableLabels.length === 0 ? <p className="px-4 py-2 text-[14px] text-[#5F6368]">{bt('taskDetail.allLabelsAdded')}</p> : null}
                    </div>
                    <div className="mt-1.5 border-t border-[#E8EAED] px-2 pt-2">
                      <div className="flex items-center gap-1.5">
                        <input
                          value={newLabelName}
                          onChange={(event) => setNewLabelName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              void handleCreateLabel()
                            }
                          }}
                          placeholder={bt('taskDetail.newLabel')}
                          className={MENU_INPUT.replace('w-full', 'min-w-0 flex-1')}
                        />
                        <button
                          type="button"
                          onClick={() => void handleCreateLabel()}
                          disabled={!newLabelName.trim() || isLabelDuplicate}
                          className="h-9 rounded-md px-3 text-[14px] font-medium text-[#1A73E8] transition hover:bg-[#E8F0FE] disabled:text-[#9AA0A6] disabled:hover:bg-transparent"
                        >
                          {bt('create')}
                        </button>
                      </div>
                      {isLabelDuplicate && newLabelName.trim() ? <p className="mt-1 px-0.5 text-[11px] text-[#D92D20]">{bt('taskDetail.labelExists')}</p> : null}
                    </div>
                  </FloatingMenu>
                </div>
              </PropertyRow>

              <PropertyRow icon={<UsersRound size={15} strokeWidth={1.75} />} label={bt('list.assignees')}>
                <div className="flex items-center gap-2">
                  {assignees.length ? (
                    <div className="flex -space-x-1.5">
                      {assignees.map((user) => {
                        const isRecommended = recommendedAssigneeId === user.id
                        const isOverloaded = assigneeAdvice != null && !assigneeAdvice.can_assign && assigneeAdvice.assignee_user_id === user.id
                        return (
                          <span
                            key={user.id}
                            title={user.fullName}
                            className={`rounded-full ring-2 ${isRecommended ? 'ring-[#34A853]' : isOverloaded ? 'ring-[#F9AB00]' : 'ring-white'}`}
                          >
                            <GradientAvatar initials={user.initials} src={user.avatarUrl} size={24} seed={user.id} />
                          </span>
                        )
                      })}
                    </div>
                  ) : null}
                  <button
                    ref={memberButtonRef}
                    type="button"
                    onClick={() => setMemberMenuOpen((open) => !open)}
                    className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-[#D1D1D6] text-[#8E8E93] transition hover:border-[#2458D3] hover:text-[#2458D3]"
                    aria-label={bt('taskDetail.changeAssignees')}
                  >
                    <Plus size={13} />
                  </button>
                  {onAnalyzeAssigneeWorkload && assignees.length ? (
                    <button
                      type="button"
                      onClick={() => void handleAnalyzeAssigneeWorkload()}
                      disabled={!canAnalyzeAssignee}
                      title={primaryTeamRole ? bt('createTask.checkWorkload') : bt('createTask.noTeamRole')}
                      className="ml-1 inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[12px] text-[#7C3AED] transition hover:bg-[#F5F0FF] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isAssigneeAdviceLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} strokeWidth={1.75} />}
                      {bt('createTask.workload')}
                    </button>
                  ) : null}
                  <FloatingMenu anchor={memberButtonRef.current} open={memberMenuOpen} onClose={() => { setMemberMenuOpen(false); setMemberQuery('') }} align="start" className="w-[280px]">
                    <div className="mb-1.5 border-b border-[#E8EAED] px-2 pb-1.5">
                      <input
                        value={memberQuery}
                        onChange={(event) => setMemberQuery(event.target.value)}
                        placeholder={bt('taskDetail.findMember')}
                        autoFocus
                        className={MENU_INPUT}
                      />
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {memberOptions.map((user) => (
                        <button key={user.id} type="button" className={floatingMenuItemClass} onClick={() => toggleAssignee(user.id)}>
                          <GradientAvatar initials={user.initials} src={user.avatarUrl} size={24} seed={user.id} />
                          <span className="min-w-0 flex-1 truncate">{user.fullName}</span>
                          {value.assigneeIds.includes(user.id) ? <Check size={18} className="text-[#1967D2]" /> : null}
                        </button>
                      ))}
                      {memberOptions.length === 0 ? <p className="px-4 py-2 text-[14px] text-[#5F6368]">{bt('taskDetail.nobodyFound')}</p> : null}
                    </div>
                  </FloatingMenu>
                </div>
              </PropertyRow>

              {assigneeAdviceError || assigneeAdvice ? (
                <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 sm:grid-cols-[150px_minmax(0,1fr)]">
                  <span />
                  <div className="rounded-lg bg-[#F5F5F7] px-3 py-2 text-[12px] leading-[17px]">
                    {assigneeAdviceError ? <p className="text-[#D92D20]">{assigneeAdviceError}</p> : null}
                    {assigneeAdvice ? (
                      <>
                        <p className={assigneeAdvice.can_assign ? 'font-medium text-[#137333]' : 'font-medium text-[#B06000]'}>
                          {assigneeAdvice.can_assign ? bt('createTask.canAssign') : bt('createTask.overloaded')}
                        </p>
                        <p className="mt-0.5 text-[#3C3C43]">{assigneeAdvice.rationale}</p>
                        {assigneeAdvice.recommended_assignee && assigneeAdvice.recommended_assignee.user_id !== primaryAssigneeId ? (
                          <button type="button" onClick={handleApplyRecommendedAssignee} className="mt-1.5 text-[#2458D3] hover:underline">
                            {bt('createTask.assignRecommended', { name: assigneeAdvice.recommended_assignee.fio })}
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <PropertyRow icon={<CornerLeftUp size={15} strokeWidth={1.75} />} label={bt('taskDetail.parent')}>
                <AppSelect
                  value={value.parentId}
                  options={[
                    { value: '', label: bt('taskDetail.noParent') },
                    ...availableParentTasks.map((task) => ({ value: task.id, label: task.title })),
                  ]}
                  onChange={(next) => onChange({ ...value, parentId: next })}
                  ariaLabel={bt('createTask.parentSelect')}
                  searchable
                  searchPlaceholder={bt('taskDetail.searchTasks')}
                  showButtonAvatar={false}
                  showOptionAvatar={false}
                  className="min-w-0"
                  menuClassName="!min-w-[280px]"
                  buttonClassName={BARE_SELECT}
                />
              </PropertyRow>

              <PropertyRow icon={<Flag size={15} strokeWidth={1.75} />} label={bt('createTask.sprint')}>
                <AppSelect
                  value={value.sprintId}
                  options={[
                    { value: '', label: bt('createTask.noSprint') },
                    ...sprints.map((sprint) => ({ value: sprint.id, label: sprint.name })),
                  ]}
                  onChange={(next) => onChange({ ...value, sprintId: next })}
                  ariaLabel={bt('createTask.sprintSelect')}
                  showButtonAvatar={false}
                  showOptionAvatar={false}
                  className="min-w-0"
                  menuClassName="!min-w-[240px]"
                  buttonClassName={BARE_SELECT}
                />
              </PropertyRow>

              <PropertyRow icon={<Target size={15} strokeWidth={1.75} />} label={bt('goal')}>
                <AppSelect
                  value={value.goalId}
                  options={[
                    { value: '', label: bt('projects.noGoal') },
                    ...goals.map((g) => ({ value: g.id, label: g.name })),
                  ]}
                  onChange={handleGoalChangeForTask}
                  ariaLabel={bt('createTask.goalSelect')}
                  showButtonAvatar={false}
                  showOptionAvatar={false}
                  className="min-w-0"
                  menuClassName="!min-w-[240px]"
                  buttonClassName={BARE_SELECT}
                />
              </PropertyRow>

              <PropertyRow icon={<Folder size={15} strokeWidth={1.75} />} label={bt('createTask.project')}>
                <AppSelect
                  value={value.projectId}
                  options={[
                    { value: '', label: bt('createTask.noProject') },
                    ...filteredProjects.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                  onChange={handleProjectChangeForTask}
                  ariaLabel={bt('createTask.projectSelect')}
                  showButtonAvatar={false}
                  showOptionAvatar={false}
                  className="min-w-0"
                  menuClassName="!min-w-[240px]"
                  buttonClassName={BARE_SELECT}
                />
              </PropertyRow>
            </dl>

            <section className="mt-5 rounded-xl bg-[#F5F5F7] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[12px] font-semibold text-[#1D1D1F]">{bt('description')}</h3>
                {onAiAssist ? (
                  <button
                    type="button"
                    onClick={() => void onAiAssist()}
                    disabled={isAiProcessing || (!value.title.trim() && !value.description.trim())}
                    title={bt('taskDetail.aiAssistant')}
                    aria-label={bt('taskDetail.aiAssistant')}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-[#8E8E93] transition hover:bg-white hover:text-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isAiProcessing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  </button>
                ) : null}
              </div>
              <textarea
                value={value.description}
                onChange={(event) => onChange({ ...value, description: event.target.value })}
                rows={5}
                spellCheck={false}
                placeholder={bt('taskDetail.descriptionPlaceholder')}
                className="mt-1.5 block min-h-[110px] w-full resize-y bg-transparent text-[13px] leading-5 text-[#3C3C43] outline-none placeholder:text-[#AEAEB2]"
              />
            </section>

            <section className="mt-5">
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-medium text-[#1D1D1F]">{bt('taskDetail.tabs.attachments')}</h3>
                <label className={`inline-flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 text-[12px] text-[#2458D3] transition hover:bg-[#F5F8FF] ${isUploading ? 'pointer-events-none opacity-50' : ''}`}>
                  {isUploading ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                  {bt('createTask.add')}
                  <input type="file" className="hidden" onChange={handleFileChange} disabled={isUploading} />
                </label>
              </div>
              {uploadedAttachments.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {uploadedAttachments.map((file) => (
                    <span key={file.id} className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-lg border border-[#E5E5EA] bg-white pl-2 pr-1 text-[12px] text-[#1D1D1F]">
                      <Paperclip size={12} className="shrink-0 text-[#8E8E93]" />
                      <span className="max-w-[180px] truncate">{file.fileName}</span>
                      <button
                        type="button"
                        onClick={() => onRemoveAttachment(file.id)}
                        className="flex h-5 w-5 items-center justify-center rounded text-[#AEAEB2] transition hover:text-[#D92D20]"
                        aria-label={bt('createTask.removeAttachment')}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-[12px] text-[#AEAEB2]">{bt('createTask.dropOrPaste')}</p>
              )}
              {uploadError ? <p className="mt-1.5 text-[12px] text-[#D92D20]">{uploadError}</p> : null}
            </section>
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[#F0F1F3] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 items-center rounded-lg px-3.5 text-[13px] font-medium text-[#3C3C43] transition hover:bg-[#F2F2F7]"
          >
            {bt('cancel')}
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={onSubmit}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#2458D3] px-3.5 text-[13px] font-medium text-white transition hover:bg-[#1D49B3] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : null}
            {isSubmitting ? bt('createTask.creating') : bt('createTask.submit')}
          </button>
        </footer>
      </div>
    </div>
  )
}
