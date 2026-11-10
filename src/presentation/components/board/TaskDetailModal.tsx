import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUpRight, CalendarDays, Check, CircleCheck, Clock3, CornerLeftUp, Link2, ListTree, Loader, Loader2, LogOut, MoreVertical, Plus, Share2, Sparkles, Tag, Trash2, Upload, UsersRound, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatDate } from '../../../shared/i18n'
import { bt } from './boardText'
import { normalizeBoardStatus } from '../../../shared/utils/boardStatus'
import type { BoardChecklistItem, BoardTask } from '../../../domain/entities/board/BoardModels'
import type {
  BoardActivityViewModel,
  BoardCommentViewModel,
  BoardLabelViewModel,
  BoardTaskViewModel,
  BoardUserViewModel,
  BoardGoalViewModel,
  BoardProjectViewModel,
  BoardSprintViewModel,
  BoardColumnViewModel,
} from '../../view-models/BoardViewModel'
import AppConfirmDialog from '../../../shared/ui/AppConfirmDialog'
import AppModal from '../../../shared/ui/AppModal'
import AppSelect from '../../../shared/ui/AppSelect'
import AppToast from '../../../shared/ui/AppToast'
import FloatingMenu, { floatingMenuDangerClass, floatingMenuItemClass } from '../../../shared/ui/FloatingMenu'
import GradientAvatar from '../../../shared/ui/GradientAvatar'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import BoardCommentsSection, { CommentComposer } from './advanced/BoardCommentsSection'
import TaskAttachmentCard from './TaskAttachmentCard'
import TaskMeetingSources from './TaskMeetingSources'
import TaskChecklistSection from './TaskChecklistSection'
import TaskDescriptionMarkdown from './TaskDescriptionMarkdown'
import TaskDeadlinePicker from './TaskDeadlinePicker'

type AttachmentPreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'unsupported'

interface AttachmentPreviewState {
  attachmentId?: string
  sourceUrl: string
  fileName: string
  mimeType: string
  objectUrl: string
  kind: AttachmentPreviewKind
  textContent?: string
}

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'])
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.aac', '.m4a', '.flac'])
const TEXT_EXTENSIONS = new Set(['.txt', '.log', '.json', '.js', '.ts', '.css', '.html', '.md'])

const getFileNameFromUrl = (url: string): string => {
  try {
    const parsed = new URL(url, window.location.origin)
    const pathname = parsed.pathname
    return pathname.slice(pathname.lastIndexOf('/') + 1) || 'file'
  } catch {
    return 'file'
  }
}



const createBlobFingerprint = async (blob: Blob): Promise<string> => {
  const hashBuffer = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

const resolveAttachmentPreviewKind = (mimeType: string, fileName: string): AttachmentPreviewKind => {
  const normalizedMime = mimeType?.trim().toLowerCase() ?? ''
  const dotIndex = fileName.lastIndexOf('.')
  const extension = dotIndex !== -1 ? fileName.slice(dotIndex).toLowerCase() : ''

  if (normalizedMime.startsWith('image/') || IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (normalizedMime.startsWith('video/') || VIDEO_EXTENSIONS.has(extension)) return 'video'
  if (normalizedMime.startsWith('audio/') || AUDIO_EXTENSIONS.has(extension)) return 'audio'
  if (normalizedMime === 'application/pdf' || extension === '.pdf') return 'pdf'
  if (normalizedMime.startsWith('text/') || TEXT_EXTENSIONS.has(extension)) return 'text'
  return 'unsupported'
}

interface TaskDetailModalProps {
  open: boolean
  task: BoardTask | null
  columns: BoardColumnViewModel[]
  users: BoardUserViewModel[]
  sprints: BoardSprintViewModel[]
  goals: BoardGoalViewModel[]
  projects: BoardProjectViewModel[]
  activity: BoardActivityViewModel | null
  activityLoading: boolean
  labels: BoardLabelViewModel[]
  labelsLoading: boolean
  parentTask: BoardTaskViewModel | null
  availableParentTasks: BoardTaskViewModel[]
  comments: BoardCommentViewModel[]
  commentsLoading: boolean
  saving: boolean
  userRole?: string
  currentUserId?: number | null
  onClose: () => void
  onSave: (payload: {
    title?: string
    description?: string
    priority?: string
    dueAt?: string
    sprintId?: string
    goalId?: string
    projectId?: string
    assigneeIds?: number[]
    parentId?: string | null
    clearParentId?: boolean
    status?: string
  }) => Promise<void>
  onDelete: () => void
  onOpenTask: (taskId: string) => void
  onUpload: (file: File) => Promise<void>
  onAddWorklog: (payload: { timeSpentSec: number; comment?: string }) => void
  onAddTaskLabel: (labelId: string) => Promise<void>
  onRemoveTaskLabel: (labelId: string) => Promise<void>
  onCreateBoardLabel: (payload: { name: string; color: string }) => Promise<void>
  onCreateComment: (payload: { content: string }) => Promise<void>
  onCreatePhotoComment: (payload: { file: File; content?: string }) => Promise<void>
  onLoadAttachment: (url: string) => Promise<Blob>
  onDeleteAttachment: (attachmentId: string) => Promise<void>
  onUpdateComment: (commentId: string, content: string) => Promise<void>
  onDeleteComment: (commentId: string) => Promise<void>
  onLoadChecklist: (taskId: string) => Promise<BoardChecklistItem[]>
  onCreateChecklist: (taskId: string, payload: { text: string; completed?: boolean; position?: number }) => Promise<BoardChecklistItem>
  onUpdateChecklist: (taskId: string, itemId: string, payload: { text?: string; completed?: boolean }) => Promise<BoardChecklistItem>
  onDeleteChecklist: (taskId: string, itemId: string) => Promise<void>
  onRefreshComments: () => void
  onRefreshActivity: () => void
  onUpdateStatus?: (status: string, columnId?: string) => Promise<void>
  onAiAssist?: () => Promise<void>
  isAiProcessing?: boolean
}

interface TaskAutosavePayload {
  title: string
  description: string
  priority: BoardTask['priority']
  dueAt: string
  sprintId: string
  goalId: string
  projectId: string
  assigneeIds: number[]
  parentId: string | undefined
  clearParentId: boolean
}

const buildTaskShareUrl = (task: BoardTask): string => {
  const taskRef = task.taskKey || task.id
  const baseUrl = import.meta.env.BASE_URL || '/'
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const link = task.link?.trim() || `kanban?task=${encodeURIComponent(taskRef)}`
  const normalizedLink = link.startsWith('/') ? link.slice(1) : link
  const path = `${normalizedBase}${normalizedLink}`
  return `${window.location.origin}${path}`
}

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  TODO: { get label() { return bt('status.TODO') }, bg: '#EEF0FF', fg: '#4F46E5' },
  IN_PROGRESS: { get label() { return bt('status.IN_PROGRESS') }, bg: '#FFF4E0', fg: '#E8900C' },
  TEST: { get label() { return bt('status.TEST') }, bg: '#F5EDFF', fg: '#9333EA' },
  DONE: { get label() { return bt('status.DONE') }, bg: '#E7F7EE', fg: '#16A34A' },
}

const PRIORITY_META: Record<BoardTask['priority'], { label: string; bg: string; fg: string }> = {
  low: { get label() { return bt('priority.low') }, bg: '#E8EBFF', fg: '#3B4BC8' },
  medium: { get label() { return bt('priority.medium') }, bg: '#FFF4E0', fg: '#C77700' },
  high: { get label() { return bt('priority.high') }, bg: '#FFECE5', fg: '#E2521B' },
  critical: { get label() { return bt('priority.critical') }, bg: '#FDE8E8', fg: '#D92D20' },
}

const LABEL_COLORS = ['#2458D3', '#16A34A', '#E8900C', '#D92D20', '#9333EA', '#0891B2']

type TaskHistoryEntry = BoardActivityViewModel['history'][number]

const formatLongDate = (date: Date) =>
  formatDate(date, { day: 'numeric', month: 'long', year: 'numeric' }).replace(/\s?г\.?$/, '') // i18n-ignore

const formatTime = (date: Date) => formatDate(date, { hour: '2-digit', minute: '2-digit' })

const initialsFromName = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '??'

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`

const groupHistoryByDay = (items: TaskHistoryEntry[]) => {
  const today = new Date()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  const groups: Array<{ key: string; label: string; items: TaskHistoryEntry[] }> = []
  items.forEach((item) => {
    const date = item.createdAt ? new Date(item.createdAt) : null
    const valid = date && !Number.isNaN(date.getTime())
    const key = valid && date ? dayKey(date) : 'unknown'
    let group = groups.find((entry) => entry.key === key)
    if (!group) {
      let label = bt('taskDetail.history.earlier')
      if (valid && date) {
        if (key === dayKey(today)) label = bt('taskDetail.history.today')
        else if (key === dayKey(yesterday)) label = bt('taskDetail.history.yesterday')
        else label = formatDate(date, { day: 'numeric', month: 'long', ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' as const } : {}) }).replace(/\s?г\.?$/, '') // i18n-ignore
      }
      group = { key, label, items: [] }
      groups.push(group)
    }
    group.items.push(item)
  })
  return groups
}

function PropertyRow({ icon, label, children, alignTop = false }: { icon: ReactNode; label: string; children: ReactNode; alignTop?: boolean }) {
  return (
    <div className={`grid grid-cols-[120px_minmax(0,1fr)] gap-3 sm:grid-cols-[150px_minmax(0,1fr)] ${alignTop ? 'items-start' : 'items-center'}`}>
      <dt className={`flex min-h-7 items-center gap-2 text-[13px] text-[#8E8E93]`}>
        <span className="flex shrink-0 text-[#AEAEB2]">{icon}</span>
        <span className="truncate">{label}</span>
      </dt>
      <dd className="flex min-h-7 min-w-0 items-center">{children}</dd>
    </div>
  )
}

function HistoryText({ item }: { item: TaskHistoryEntry }) {
  const [expanded, setExpanded] = useState(false)
  const details = item.details && item.details !== item.action ? item.details : ''
  const limit = 160
  const isLong = details.length > limit
  const shown = isLong && !expanded ? `${details.slice(0, limit)}…` : details
  const date = item.createdAt ? new Date(item.createdAt) : null
  const time = date && !Number.isNaN(date.getTime()) ? formatTime(date) : item.createdAtLabel
  return (
    <div className="min-w-0 flex-1 pt-px">
      <p className="text-[13px] leading-[18px] text-[#1D1D1F]">
        <span className="font-medium">{item.userName}</span>
        <span className="text-[#8E8E93]"> · {item.action.toLowerCase()}</span>
      </p>
      {shown ? (
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-[18px] text-[#3C3C43]">
          {shown}
          {isLong ? (
            <button type="button" onClick={() => setExpanded((value) => !value)} className="ml-1 text-[12px] text-[#2458D3] hover:underline">
              {expanded ? bt('taskDetail.hide') : bt('taskDetail.more')}
            </button>
          ) : null}
        </p>
      ) : null}
      <p className="mt-0.5 text-[11px] text-[#8E8E93]">{time}</p>
    </div>
  )
}

export default function TaskDetailModal({
  open,
  task,
  columns,
  users,
  activity,
  activityLoading,
  labels,
  parentTask,
  availableParentTasks,
  comments,
  commentsLoading,
  saving,
  userRole,
  currentUserId = null,
  onClose,
  onDelete,
  onOpenTask,
  onSave,
  onUpload,
  onAddWorklog,
  onAddTaskLabel,
  onRemoveTaskLabel,
  onCreateBoardLabel,
  onCreateComment,
  onCreatePhotoComment,
  onLoadAttachment,
  onDeleteAttachment,
  onUpdateComment,
  onDeleteComment,
  onLoadChecklist,
  onCreateChecklist,
  onUpdateChecklist,
  onDeleteChecklist,
  onUpdateStatus,
  onAiAssist,
  isAiProcessing,
}: TaskDetailModalProps) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [priority, setPriority] = useState<BoardTask['priority']>(task?.priority ?? 'medium')
  const [dueAt, setDueAt] = useState(task?.dueAt ?? '')
  const [assigneeIds, setAssigneeIds] = useState<number[]>(task?.assigneeIds ?? [])
  const [parentId, setParentId] = useState(task?.parentId ?? '')
  const [sprintId, setSprintId] = useState(task?.sprintId ?? '')
  const [goalId, setGoalId] = useState(task?.goalId ?? '')
  const [projectId, setProjectId] = useState(task?.projectId ?? '')
  const [status, setStatus] = useState(normalizeBoardStatus(task?.status) || 'TODO')
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    status: string
    matchingColumns: BoardColumnViewModel[]
  } | null>(null)
  const [activeFeedTab, setActiveFeedTab] = useState<'activity' | 'comments' | 'checklist' | 'attachments' | 'worklog'>('comments')
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [priorityMenuOpen, setPriorityMenuOpen] = useState(false)
  const [labelMenuOpen, setLabelMenuOpen] = useState(false)
  const [memberMenuOpen, setMemberMenuOpen] = useState(false)
  const [memberQuery, setMemberQuery] = useState('')
  const moreButtonRef = useRef<HTMLButtonElement | null>(null)
  const statusButtonRef = useRef<HTMLButtonElement | null>(null)
  const priorityButtonRef = useRef<HTMLButtonElement | null>(null)
  const labelButtonRef = useRef<HTMLButtonElement | null>(null)
  const memberButtonRef = useRef<HTMLButtonElement | null>(null)
  const feedTabsRef = useRef<HTMLDivElement | null>(null)
  const footerMemberButtonRef = useRef<HTMLButtonElement | null>(null)
  const [footerMemberMenuOpen, setFooterMemberMenuOpen] = useState(false)
  const [worklogHours, setWorklogHours] = useState('1')
  const [worklogComment, setWorklogComment] = useState('')
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [preview, setPreview] = useState<AttachmentPreviewState | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const previewDialogRef = useRef<HTMLDivElement>(null)
  const isPreviewOpen = previewLoading || Boolean(preview)

  useEffect(() => {
    if (!isPreviewOpen) return
    const previousFocus = document.activeElement
    previewDialogRef.current?.focus()
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [isPreviewOpen])
  const [attachmentToDelete, setAttachmentToDelete] = useState<{ id: string; fileName: string } | null>(null)
  const [hiddenTaskAttachmentIds, setHiddenTaskAttachmentIds] = useState<string[]>([])
  const [newLabelName, setNewLabelName] = useState('')
  const [shareToast, setShareToast] = useState<{ message: string; variant: 'success' | 'error' } | null>(null)
  const [descriptionTab, setDescriptionTab] = useState<'edit' | 'preview'>('preview')
  const [autosaveError, setAutosaveError] = useState('')
  const previewRequestIdRef = useRef(0)
  const titleRef = useRef<HTMLTextAreaElement | null>(null)
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null)
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveInFlightRef = useRef(false)
  const queuedSaveRef = useRef<{
    snapshot: string
    payload: TaskAutosavePayload
  } | null>(null)
  const lastSavedSnapshotRef = useRef('')

  const assignees = users.filter((user) => assigneeIds.includes(user.id))
  const currentUser = currentUserId != null ? users.find((user) => user.id === currentUserId) : undefined

  const taskLabelIds = new Set((task?.labels ?? []).map((label) => label.id))
  const addableLabelOptions = labels
    .filter((label) => !taskLabelIds.has(label.id))
    .map((label) => ({ value: label.id, label: label.name }))

  const isOwner = userRole === 'owner'
  const isEditor = userRole === 'editor'
  const canEditTask = isOwner || isEditor
  const canDeleteTask = isOwner || isEditor

  const visibleTaskAttachments = (task?.attachments ?? []).filter(
    (attachment) => !hiddenTaskAttachmentIds.includes(attachment.id),
  )
  const previewableAttachments = visibleTaskAttachments.filter((attachment) => Boolean(attachment.downloadUrl))

  const getColumnsByStatus = (statusValue: string) => {
    return columns.filter((col) => normalizeBoardStatus(col.key) === statusValue)
  }

  const handleStatusChange = (next: string) => {
    setStatusMenuOpen(false)

    const matchingCols = getColumnsByStatus(next)
    if (matchingCols.length > 1) {
      setPendingStatusChange({ status: next, matchingColumns: matchingCols })
    } else if (matchingCols.length === 1) {
      if (onUpdateStatus) {
        void onUpdateStatus(next, matchingCols[0].id)
      }
    } else {
      if (onUpdateStatus) {
        void onUpdateStatus(next)
      }
    }
  }

  const buildPersistPayload = (): TaskAutosavePayload => ({
    title,
    description,
    priority,
    dueAt,
    assigneeIds,
    parentId: parentId || undefined,
    clearParentId: !parentId && Boolean(task?.parentId),
    sprintId,
    goalId,
    projectId,
  })

  const buildTaskSnapshot = (payload: TaskAutosavePayload) =>
    JSON.stringify({
      title: payload.title,
      description: payload.description,
      priority: payload.priority,
      dueAt: payload.dueAt,
      assigneeIds: [...(payload.assigneeIds ?? [])].sort((left, right) => left - right),
      parentId: payload.parentId ?? '',
      clearParentId: Boolean(payload.clearParentId),
      sprintId: payload.sprintId ?? '',
      goalId: payload.goalId ?? '',
      projectId: payload.projectId ?? '',
    })

  const persistTaskChanges = async (
    snapshot: string,
    payload: TaskAutosavePayload,
  ): Promise<void> => {
    if (snapshot === lastSavedSnapshotRef.current) {
      return
    }

    if (saveInFlightRef.current) {
      queuedSaveRef.current = { snapshot, payload }
      return
    }

    saveInFlightRef.current = true
    setAutosaveError('')

    try {
      await onSave(payload)
      lastSavedSnapshotRef.current = snapshot
    } catch (error) {
      setAutosaveError(error instanceof Error && error.message ? error.message : bt('errors.saveChanges'))
      throw error
    } finally {
      saveInFlightRef.current = false
    }

    if (queuedSaveRef.current && queuedSaveRef.current.snapshot !== lastSavedSnapshotRef.current) {
      const nextQueuedSave = queuedSaveRef.current
      queuedSaveRef.current = null
      await persistTaskChanges(nextQueuedSave.snapshot, nextQueuedSave.payload)
      return
    }

    queuedSaveRef.current = null
  }

  useEffect(() => {
    if (task) {
      setTitle(task.title || '')
      setDescription(task.description || '')
      setPriority(task.priority || 'medium')
      setDueAt(task.dueAt ?? '')
      setAssigneeIds(task.assigneeIds ?? [])
      setParentId(task.parentId ?? '')
      setSprintId(task.sprintId ?? '')
      setGoalId(task.goalId ?? '')
      setProjectId(task.projectId ?? '')
      setStatus(normalizeBoardStatus(task.status) || 'TODO')
      setAutosaveError('')
      setDescriptionTab('preview')
      lastSavedSnapshotRef.current = buildTaskSnapshot({
        title: task.title || '',
        description: task.description || '',
        priority: task.priority || 'medium',
        dueAt: task.dueAt || '',
        assigneeIds: task.assigneeIds ?? [],
        parentId: task.parentId ?? undefined,
        clearParentId: false,
        sprintId: task.sprintId ?? '',
        goalId: task.goalId ?? '',
        projectId: task.projectId ?? '',
      })
    }
  }, [task])

  useEffect(() => {
    if (!open || !task || !canEditTask) {
      return
    }

    const payload = buildPersistPayload()
    const nextSnapshot = buildTaskSnapshot(payload)
    if (nextSnapshot === lastSavedSnapshotRef.current || !title.trim()) {
      return
    }

    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current)
    }

    autosaveTimeoutRef.current = setTimeout(() => {
      autosaveTimeoutRef.current = null
      void persistTaskChanges(nextSnapshot, payload)
    }, 500)

    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current)
        autosaveTimeoutRef.current = null
      }
    }
  }, [open, task, canEditTask, title, description, priority, dueAt, assigneeIds, parentId, sprintId, goalId, projectId])

  useEffect(() => {
    const element = titleRef.current
    if (!element) return

    element.style.height = '0px'
    element.style.height = `${element.scrollHeight}px`
  }, [title, open, task?.id])

  useEffect(() => {
    return () => {
      if (preview?.objectUrl) {
        URL.revokeObjectURL(preview.objectUrl)
      }
    }
  }, [preview])

  const closePreview = () => {
    previewRequestIdRef.current += 1
    setPreview((current) => {
      if (current?.objectUrl) {
        URL.revokeObjectURL(current.objectUrl)
      }
      return null
    })
    setPreviewError('')
    setPreviewLoading(false)
  }

  useEffect(() => {
    if (!open) {
      previewRequestIdRef.current += 1
      setPreview((current) => {
        if (current?.objectUrl) {
          URL.revokeObjectURL(current.objectUrl)
        }
        return null
      })
      setPreviewError('')
      setPreviewLoading(false)
    }
  }, [open])

  useEffect(() => {
    const taskAttachments = task?.attachments ?? []
    const commentAttachmentUrls = comments
      .map((comment) => comment.attachmentUrl)
      .filter(Boolean)

    let cancelled = false

    if (!taskAttachments.length || !commentAttachmentUrls.length) {
      Promise.resolve().then(() => {
        if (!cancelled) {
          setHiddenTaskAttachmentIds([])
        }
      })
      return () => {
        cancelled = true
      }
    }

    void (async () => {
      try {
        const commentFingerprints = new Set(
          await Promise.all(
            commentAttachmentUrls.map(async (url) => {
              const blob = await onLoadAttachment(url)
              return createBlobFingerprint(blob)
            }),
          ),
        )

        const hiddenIds = (
          await Promise.all(
            taskAttachments.map(async (attachment) => {
              if (!attachment.downloadUrl) return null

              const blob = await onLoadAttachment(attachment.downloadUrl)
              const fingerprint = await createBlobFingerprint(blob)
              return commentFingerprints.has(fingerprint) ? attachment.id : null
            }),
          )
        ).filter((value): value is string => Boolean(value))

        if (!cancelled) {
          setHiddenTaskAttachmentIds(hiddenIds)
        }
      } catch {
        if (!cancelled) {
          setHiddenTaskAttachmentIds([])
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [comments, onLoadAttachment, task])

  const handleOpenAttachment = async (input: { url: string; fileName?: string; mimeType?: string; blob?: Blob; attachmentId?: string }) => {
    const requestId = previewRequestIdRef.current + 1
    previewRequestIdRef.current = requestId
    setPreviewLoading(true)
    setPreviewError('')

    try {
      const blob = input.blob ?? await onLoadAttachment(input.url)
      if (requestId !== previewRequestIdRef.current) return
      const fileName = input.fileName || getFileNameFromUrl(input.url)
      const mimeType = blob.type || input.mimeType || ''
      const kind = resolveAttachmentPreviewKind(mimeType, fileName)
      const objectUrl = URL.createObjectURL(blob)
      const textContent = kind === 'text' ? await blob.text() : undefined

      if (requestId !== previewRequestIdRef.current) {
        URL.revokeObjectURL(objectUrl)
        return
      }

      setPreview((current) => {
        if (current?.objectUrl) {
          URL.revokeObjectURL(current.objectUrl)
        }
        return {
          attachmentId: input.attachmentId,
          sourceUrl: input.url,
          fileName,
          mimeType,
          objectUrl,
          kind,
          textContent,
        }
      })
    } catch (error) {
      if (requestId !== previewRequestIdRef.current) return
      const message = error instanceof Error && error.message ? error.message : bt('errors.openAttachment')
      setPreviewError(message)
      throw error
    } finally {
      if (requestId === previewRequestIdRef.current) {
        setPreviewLoading(false)
      }
    }
  }

  const currentPreviewIndex = preview
    ? previewableAttachments.findIndex((attachment) =>
        (preview.attachmentId && attachment.id === preview.attachmentId) ||
        (preview.sourceUrl && attachment.downloadUrl === preview.sourceUrl),
      )
    : -1

  const canOpenPrevAttachment = currentPreviewIndex > 0
  const canOpenNextAttachment = currentPreviewIndex >= 0 && currentPreviewIndex < previewableAttachments.length - 1

  const openAttachmentByIndex = (index: number) => {
    if (index < 0 || index >= previewableAttachments.length) return

    const target = previewableAttachments[index]
    void handleOpenAttachment({
      attachmentId: target.id,
      url: target.downloadUrl,
      fileName: target.fileName,
      mimeType: target.mimeType,
    }).catch(() => {})
  }

  useEffect(() => {
    if (!preview && !previewLoading) return

    const handlePreviewNavigation = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' && canOpenPrevAttachment) {
        event.preventDefault()
        openAttachmentByIndex(currentPreviewIndex - 1)
      }

      if (event.key === 'ArrowRight' && canOpenNextAttachment) {
        event.preventDefault()
        openAttachmentByIndex(currentPreviewIndex + 1)
      }
    }

    document.addEventListener('keydown', handlePreviewNavigation)
    return () => {
      document.removeEventListener('keydown', handlePreviewNavigation)
    }
  }, [preview, previewLoading, canOpenPrevAttachment, canOpenNextAttachment, currentPreviewIndex, previewableAttachments])

  useEffect(() => {
    if (!open) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open, onClose])

  const handleOpenPreviewInNewTab = () => {
    if (!preview?.objectUrl) return

    const anchor = document.createElement('a')
    anchor.href = preview.objectUrl
    anchor.target = '_blank'
    anchor.rel = 'noopener noreferrer'
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
  }

  const handleDownloadPreview = () => {
    if (!preview?.objectUrl) return

    const anchor = document.createElement('a')
    anchor.href = preview.objectUrl
    anchor.download = preview.fileName
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
  }

  const isLabelDuplicate = labels.some(
    (l) => l.name.toLowerCase() === newLabelName.trim().toLowerCase()
  )

  const handleCreateLabel = async () => {
    if (!newLabelName.trim() || isLabelDuplicate) return
    try {
      await onCreateBoardLabel({ name: newLabelName.trim(), color: LABEL_COLORS[labels.length % LABEL_COLORS.length] })
      setNewLabelName('')
    } catch {
      // handled by parent
    }
  }

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter(Boolean)
    if (!list.length) return

    setIsUploading(true)
    setUploadStatus(null)
    try {
      for (const file of list) {
        await onUpload(file)
      }
      setUploadStatus({
        type: 'success',
        text:
          list.length === 1
            ? bt('taskDetail.fileUploaded', { name: list[0].name })
            : bt('taskDetail.filesUploaded', { count: list.length }),
      })
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : bt('errors.uploadFile')
      setUploadStatus({ type: 'error', text: message })
    } finally {
      setIsUploading(false)
    }
  }

  const handleAttachmentInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files?.length) return
    void uploadFiles(files)
    event.target.value = ''
  }

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    for (const item of items) {
      if (item.type.includes('image') || item.kind === 'file') {
        const file = item.getAsFile()
        if (file) {
          await uploadFiles([file])
        }
      }
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const files = e.dataTransfer.files
    if (files?.length) {
      await uploadFiles(files)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const copyShareLink = async (value: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return
    }

    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(textarea)
    if (!copied) throw new Error(bt('errors.copyLink'))
  }

  const handleCopyTaskLink = async () => {
    if (!task) return

    try {
      await copyShareLink(buildTaskShareUrl(task))
      setShareToast({ message: bt('toast.taskLinkCopied'), variant: 'success' })
    } catch {
      setShareToast({ message: bt('errors.copyTaskLink'), variant: 'error' })
    }
  }

  const handleShareTask = async () => {
    if (!task) return

    const shareUrl = buildTaskShareUrl(task)
    const shareTitle = task.title || bt('task')

    try {
      if (navigator.share) {
        await navigator.share({ title: shareTitle, url: shareUrl })
        return
      }

      await copyShareLink(shareUrl)
      setShareToast({ message: bt('toast.taskLinkCopied'), variant: 'success' })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return

      try {
        await copyShareLink(shareUrl)
        setShareToast({ message: bt('toast.taskLinkCopied'), variant: 'success' })
      } catch {
        setShareToast({ message: bt('errors.copyTaskLink'), variant: 'error' })
      }
    }
  }

  const historyItems = activity?.history ?? []
  const worklogItems = activity?.worklogs ?? []
  const statusMeta = STATUS_META[status] ?? { ...STATUS_META.TODO, label: task?.status || bt('status.TODO') }
  const priorityMeta = PRIORITY_META[priority] ?? PRIORITY_META.medium
  const createdDate = task?.createdAt ? new Date(task.createdAt) : null
  const hasCreatedDate = Boolean(createdDate && !Number.isNaN(createdDate.getTime()))
  const usersById = new Map(users.map((user) => [user.id, user]))
  const normalizedMemberQuery = memberQuery.trim().toLowerCase()
  const memberOptions = normalizedMemberQuery
    ? users.filter((user) => user.fullName.toLowerCase().includes(normalizedMemberQuery))
    : users
  const historyGroups = groupHistoryByDay(historyItems)

  const toggleAssignee = (userId: number) => {
    setAssigneeIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]))
  }

  const openActivity = () => {
    setActiveFeedTab('activity')
    feedTabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const memberMenuContent = (
    <>
      <div className="mb-1.5 border-b border-[#E8EAED] px-2 pb-1.5">
        <input
          value={memberQuery}
          onChange={(event) => setMemberQuery(event.target.value)}
          placeholder={bt('taskDetail.findMember')}
          autoFocus
          className="h-9 w-full rounded-md bg-[#F1F3F4] px-3 text-[14px] text-[#1F1F1F] outline-none placeholder:text-[#5F6368] focus:bg-white focus:shadow-[inset_0_0_0_2px_#1A73E8]"
        />
      </div>
      <div className="max-h-64 overflow-y-auto">
        {memberOptions.map((user) => (
          <button key={user.id} type="button" className={floatingMenuItemClass} onClick={() => toggleAssignee(user.id)}>
            <GradientAvatar initials={user.initials} src={user.avatarUrl} size={24} seed={user.id} />
            <span className="min-w-0 flex-1 truncate">{user.fullName}</span>
            {assigneeIds.includes(user.id) ? <Check size={18} className="text-[#1967D2]" /> : null}
          </button>
        ))}
        {memberOptions.length === 0 ? <p className="px-4 py-2 text-[14px] text-[#5F6368]">{bt('taskDetail.nobodyFound')}</p> : null}
      </div>
    </>
  )

  const feedTabs: Array<{ id: typeof activeFeedTab; label: string; count?: number }> = [
    { id: 'comments', label: bt('taskDetail.tabs.comments'), count: comments.length },
    { id: 'checklist', label: bt('taskDetail.tabs.checklist') },
    { id: 'attachments', label: bt('taskDetail.tabs.attachments'), count: visibleTaskAttachments.length },
    { id: 'activity', label: bt('taskDetail.tabs.activity') },
    { id: 'worklog', label: bt('taskDetail.tabs.worklog') },
  ]

  return (
    <AnimatePresence>
      {open && task ? (
      <motion.div
        key="task-detail-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="task-detail-backdrop fixed inset-0 z-[600] bg-[#0A1628]/[0.22]"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            onClose()
          }
        }}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
      <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 40 }}
        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
        role="dialog"
        aria-modal={isPreviewOpen ? undefined : true}
        aria-hidden={isPreviewOpen || undefined}
        aria-label={task.title || bt('task')}
        className="task-detail-drawer absolute bottom-3 right-3 top-3 flex w-[min(560px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_70px_rgba(10,22,40,0.22)]"
      >
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#F0F1F3] px-5">
          <button
            type="button"
            onClick={onClose}
            className="-ml-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-[#3C3C43] transition hover:bg-[#F3F4F6]"
            aria-label={bt('close')}
          >
            <X size={19} strokeWidth={1.75} />
          </button>
          <div className="flex items-center gap-1">
            {canEditTask && saving ? (
              <span className="mr-2 flex items-center gap-1.5 text-[11px] text-[#8E8E93]">
                <Loader2 size={13} className="animate-spin" />
                {bt('taskDetail.saving')}
              </span>
            ) : null}
            <button
              type="button"
              onClick={openActivity}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#3C3C43] transition hover:bg-[#F3F4F6]"
              title={bt('taskDetail.history.title')}
              aria-label={bt('taskDetail.history.title')}
            >
              <Clock3 size={17} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => void handleCopyTaskLink()}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#3C3C43] transition hover:bg-[#F3F4F6]"
              title={bt('taskDetail.copyLink')}
              aria-label={bt('taskDetail.copyLink')}
            >
              <Link2 size={17} strokeWidth={1.75} />
            </button>
            <button
              ref={moreButtonRef}
              type="button"
              onClick={() => setMoreMenuOpen((value) => !value)}
              className="-mr-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-[#3C3C43] transition hover:bg-[#F3F4F6]"
              aria-label={bt('taskDetail.more')}
            >
              <MoreVertical size={17} strokeWidth={1.75} />
            </button>
            <FloatingMenu anchor={moreButtonRef.current} open={moreMenuOpen} onClose={() => setMoreMenuOpen(false)}>
              <button type="button" className={floatingMenuItemClass} onClick={() => { setMoreMenuOpen(false); void handleCopyTaskLink() }}>
                <Link2 size={16} />
                {bt('taskDetail.copyLink')}
              </button>
              <button type="button" className={floatingMenuItemClass} onClick={() => { setMoreMenuOpen(false); void handleShareTask() }}>
                <Share2 size={16} />
                {bt('taskDetail.share')}
              </button>
              {canDeleteTask ? (
                <button type="button" className={floatingMenuDangerClass} onClick={() => { setMoreMenuOpen(false); onDelete() }}>
                  <Trash2 size={16} />
                  {bt('taskDetail.delete')}
                </button>
              ) : null}
            </FloatingMenu>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-color:#D1D5DB_transparent] [scrollbar-width:thin]">
          <div className="px-5 pt-5">
            <textarea
              ref={titleRef}
              value={title}
              readOnly={!canEditTask}
              onChange={(e) => setTitle(e.target.value)}
              rows={1}
              className={`-mx-1 block w-[calc(100%+8px)] resize-none overflow-hidden rounded-lg bg-transparent px-1 text-[20px] font-semibold leading-[26px] tracking-[-0.015em] text-[#1D1D1F] outline-none placeholder:text-[#AEAEB2] focus:bg-[#F5F5F7] ${!canEditTask ? 'cursor-default' : ''}`}
              placeholder={bt('taskDetail.titlePlaceholder')}
            />
            {autosaveError ? <p className="mt-2 text-[13px] text-[#D92D20]">{autosaveError}</p> : null}

            <dl className="mt-5 space-y-1.5">
              <PropertyRow icon={<Clock3 size={15} strokeWidth={1.75} />} label={bt('taskDetail.created')}>
                {hasCreatedDate && createdDate ? (
                  <span className="text-[13px] text-[#1D1D1F]">
                    {formatLongDate(createdDate)}
                    <span className="ml-2 text-[#8E8E93]">{formatTime(createdDate)}</span>
                  </span>
                ) : <span className="text-[13px] text-[#AEAEB2]">—</span>}
              </PropertyRow>

              <PropertyRow icon={<Loader size={15} strokeWidth={1.75} />} label={bt('list.status')}>
                <button
                  ref={statusButtonRef}
                  type="button"
                  disabled={!canEditTask}
                  onClick={() => setStatusMenuOpen((value) => !value)}
                  className="inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium transition hover:brightness-95 disabled:cursor-default disabled:hover:brightness-100"
                  style={{ background: statusMeta.bg, color: statusMeta.fg }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusMeta.fg }} />
                  {statusMeta.label}
                </button>
                <FloatingMenu anchor={statusButtonRef.current} open={statusMenuOpen} onClose={() => setStatusMenuOpen(false)} align="start">
                  {Object.entries(STATUS_META).map(([value, meta]) => (
                    <button key={value} type="button" className={floatingMenuItemClass} onClick={() => handleStatusChange(value)}>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.fg }} />
                      <span className="flex-1">{meta.label}</span>
                      {status === value ? <Check size={18} className="text-[#1967D2]" /> : null}
                    </button>
                  ))}
                </FloatingMenu>
              </PropertyRow>

              <PropertyRow icon={<CircleCheck size={15} strokeWidth={1.75} />} label={bt('list.priority')}>
                <button
                  ref={priorityButtonRef}
                  type="button"
                  disabled={!canEditTask}
                  onClick={() => setPriorityMenuOpen((value) => !value)}
                  className="inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-medium transition hover:brightness-95 disabled:cursor-default disabled:hover:brightness-100"
                  style={{ background: priorityMeta.bg, color: priorityMeta.fg }}
                >
                  {priorityMeta.label}
                </button>
                <FloatingMenu anchor={priorityButtonRef.current} open={priorityMenuOpen} onClose={() => setPriorityMenuOpen(false)} align="start">
                  {(Object.keys(PRIORITY_META) as Array<BoardTask['priority']>).map((value) => (
                    <button key={value} type="button" className={floatingMenuItemClass} onClick={() => { setPriority(value); setPriorityMenuOpen(false) }}>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: PRIORITY_META[value].fg }} />
                      <span className="flex-1">{PRIORITY_META[value].label}</span>
                      {priority === value ? <Check size={18} className="text-[#1967D2]" /> : null}
                    </button>
                  ))}
                </FloatingMenu>
              </PropertyRow>

              <PropertyRow icon={<CalendarDays size={15} strokeWidth={1.75} />} label={bt('list.due')}>
                <TaskDeadlinePicker
                  value={dueAt}
                  disabled={!canEditTask}
                  onChange={setDueAt}
                  formatLabel={(date) => `${formatLongDate(date)}, ${formatTime(date)}`}
                  emptyLabel={canEditTask ? bt('taskDetail.addDue') : bt('list.noDue')}
                  showIcon={false}
                  buttonClassName="!h-7 !w-auto !gap-1 !rounded-md !border-0 !bg-transparent !px-0 !text-[13px] !font-normal !text-[#1D1D1F] hover:!text-[#2458D3] disabled:!bg-transparent disabled:!text-[#1D1D1F]"
                />
              </PropertyRow>

              <PropertyRow icon={<Tag size={15} strokeWidth={1.75} />} label={bt('taskDetail.labels')} alignTop>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(task.labels ?? []).map((label) => (
                    <span key={label.id} className="group inline-flex h-6 items-center gap-1 rounded-full bg-[#F2F2F7] px-2.5 text-[12px] text-[#3C3C43]">
                      {label.name}
                      {canEditTask ? (
                        <button
                          type="button"
                          onClick={() => void onRemoveTaskLabel(label.id)}
                          className="-mr-1 hidden h-4 w-4 items-center justify-center rounded-full text-[#6B7280] transition hover:bg-[#E5E7EB] hover:text-[#D92D20] group-hover:flex"
                          aria-label={bt('taskDetail.removeLabel', { name: label.name })}
                        >
                          <X size={11} />
                        </button>
                      ) : null}
                    </span>
                  ))}
                  {canEditTask ? (
                    <>
                      <button
                        ref={labelButtonRef}
                        type="button"
                        onClick={() => setLabelMenuOpen((value) => !value)}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-[#D1D1D6] text-[#8E8E93] transition hover:border-[#2458D3] hover:text-[#2458D3]"
                        aria-label={bt('taskDetail.addLabel')}
                      >
                        <Plus size={13} />
                      </button>
                      <FloatingMenu anchor={labelButtonRef.current} open={labelMenuOpen} onClose={() => setLabelMenuOpen(false)} align="start" className="w-[260px]">
                        <div className="max-h-56 overflow-y-auto">
                          {labels.filter((label) => !taskLabelIds.has(label.id)).map((label) => (
                            <button key={label.id} type="button" className={floatingMenuItemClass} onClick={() => { void onAddTaskLabel(label.id); setLabelMenuOpen(false) }}>
                              <span className="h-2.5 w-2.5 rounded-full" style={{ background: label.color }} />
                              <span className="truncate">{label.name}</span>
                            </button>
                          ))}
                          {addableLabelOptions.length === 0 ? <p className="px-4 py-2 text-[14px] text-[#5F6368]">{bt('taskDetail.allLabelsAdded')}</p> : null}
                        </div>
                        <div className="mt-1.5 border-t border-[#E8EAED] px-2 pt-2">
                          <div className="flex items-center gap-1.5">
                            <input
                              value={newLabelName}
                              onChange={(event) => setNewLabelName(event.target.value)}
                              onKeyDown={(event) => { if (event.key === 'Enter') void handleCreateLabel() }}
                              placeholder={bt('taskDetail.newLabel')}
                              className="h-9 min-w-0 flex-1 rounded-md bg-[#F1F3F4] px-3 text-[14px] text-[#1F1F1F] outline-none placeholder:text-[#5F6368] focus:bg-white focus:shadow-[inset_0_0_0_2px_#1A73E8]"
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
                    </>
                  ) : null}
                  {!canEditTask && !(task.labels ?? []).length ? <span className="text-[13px] text-[#AEAEB2]">—</span> : null}
                </div>
              </PropertyRow>

              <PropertyRow icon={<UsersRound size={15} strokeWidth={1.75} />} label={bt('list.assignees')}>
                <div className="flex items-center gap-2">
                  {assignees.length ? (
                    <div className="flex -space-x-1.5">
                      {assignees.map((user) => (
                        <span key={user.id} title={user.fullName} className="rounded-full ring-2 ring-white">
                          <GradientAvatar initials={user.initials} src={user.avatarUrl} size={24} seed={user.id} />
                        </span>
                      ))}
                    </div>
                  ) : !canEditTask ? <span className="text-[13px] text-[#AEAEB2]">{bt('taskDetail.unassigned')}</span> : null}
                  {canEditTask ? (
                    <>
                      <button
                        ref={memberButtonRef}
                        type="button"
                        onClick={() => setMemberMenuOpen((value) => !value)}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-[#D1D1D6] text-[#8E8E93] transition hover:border-[#2458D3] hover:text-[#2458D3]"
                        aria-label={bt('taskDetail.changeAssignees')}
                      >
                        <Plus size={13} />
                      </button>
                      <FloatingMenu anchor={memberButtonRef.current} open={memberMenuOpen} onClose={() => { setMemberMenuOpen(false); setMemberQuery('') }} align="start" className="w-[280px]">
                        {memberMenuContent}
                      </FloatingMenu>
                    </>
                  ) : null}
                </div>
              </PropertyRow>

              {canEditTask || task.parentId ? (
                <PropertyRow icon={<CornerLeftUp size={15} strokeWidth={1.75} />} label={bt('taskDetail.parent')}>
                  <div className="flex min-w-0 items-center gap-2">
                    {canEditTask ? (
                      <AppSelect
                        value={parentId}
                        options={[
                          { value: '', label: bt('taskDetail.noParent') },
                          ...availableParentTasks.map((item) => ({ value: item.id, label: item.title })),
                        ]}
                        onChange={setParentId}
                        className="min-w-0 max-w-[280px]"
                        menuClassName="!min-w-[280px]"
                        searchable
                        searchPlaceholder={bt('taskDetail.searchTasks')}
                        showButtonAvatar={false}
                        showOptionAvatar={false}
                        buttonClassName="!h-7 !gap-1 !border-0 !bg-transparent !px-0 !text-[13px] !text-[#1D1D1F] !ring-0 hover:!text-[#2458D3]"
                      />
                    ) : (
                      <span className="truncate text-[13px] text-[#1D1D1F]">{parentTask?.title || bt('taskDetail.parentTask')}</span>
                    )}
                    {task.parentId ? (
                      <button
                        type="button"
                        onClick={() => onOpenTask(task.parentId!)}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#8E8E93] transition hover:bg-[#F3F4F6] hover:text-[#2458D3]"
                        title={bt('taskDetail.openParent')}
                      >
                        <ArrowUpRight size={14} />
                      </button>
                    ) : null}
                  </div>
                </PropertyRow>
              ) : null}

              {(task.subtasks?.length ?? 0) > 0 ? (
                <PropertyRow icon={<ListTree size={15} strokeWidth={1.75} />} label={bt('taskDetail.subtasks')} alignTop>
                  <div className="flex flex-wrap gap-2">
                    {(task.subtasks ?? []).map((subtask) => (
                      <button
                        key={subtask.id}
                        type="button"
                        onClick={() => onOpenTask(subtask.id)}
                        className="inline-flex h-6 max-w-full items-center rounded-full bg-[#F2F2F7] px-2.5 text-[12px] text-[#3C3C43] transition hover:bg-[#E8F0FE] hover:text-[#2458D3]"
                      >
                        <span className="truncate">{subtask.title}</span>
                      </button>
                    ))}
                  </div>
                </PropertyRow>
              ) : null}
            </dl>

            <TaskMeetingSources taskId={task.id} />
            <section className="mt-5 rounded-xl bg-[#F5F5F7] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[12px] font-semibold text-[#1D1D1F]">{bt('description')}</h3>
                {onAiAssist && canEditTask ? (
                  <button
                    type="button"
                    onClick={() => void onAiAssist()}
                    disabled={isAiProcessing || (!title.trim() && !description.trim())}
                    title={bt('taskDetail.aiAssistant')}
                    aria-label={bt('taskDetail.aiAssistant')}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-[#8E8E93] transition hover:bg-white hover:text-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isAiProcessing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  </button>
                ) : null}
              </div>
              {canEditTask && descriptionTab === 'edit' ? (
                <div className="mt-2">
                  <textarea
                    ref={descriptionRef}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    autoFocus
                    className="block min-h-[120px] w-full resize-y rounded-lg border border-[#E5E5EA] bg-white px-3 py-2 text-[13px] leading-5 text-[#3C3C43] outline-none transition focus:border-[#2458D3]"
                    placeholder={bt('taskDetail.descriptionPlaceholder')}
                    spellCheck={false}
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setDescriptionTab('preview')}
                      className="h-7 rounded-md bg-[#2458D3] px-3 text-[12px] font-medium text-white transition hover:bg-[#1D49B3]"
                    >
                      {bt('status.DONE')}
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => canEditTask && setDescriptionTab('edit')}
                  className={`mt-1.5 max-h-[280px] overflow-y-auto text-[13px] leading-5 text-[#3C3C43] [scrollbar-width:thin] ${canEditTask ? 'cursor-text' : ''}`}
                >
                  <TaskDescriptionMarkdown
                    source={description}
                    emptyLabel={canEditTask ? bt('taskDetail.addDescription') : bt('goals.noDescription')}
                  />
                </div>
              )}
            </section>
          </div>

          <div ref={feedTabsRef} className="mt-5 flex scroll-mt-2 gap-5 overflow-hidden px-5 shadow-[inset_0_-1px_0_#EDEDF0]" role="tablist" aria-label={bt('taskDetail.sections')}>
            {feedTabs.map((tab) => {
              const isActive = activeFeedTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveFeedTab(tab.id)}
                  className={`flex h-10 shrink-0 items-center gap-1 border-b-2 px-1 text-[14px] transition ${isActive ? 'border-[#2458D3] text-[#2458D3]' : 'border-transparent text-[#3C3C43] hover:text-[#1D1D1F]'}`}
                >
                  {tab.label}
                  {tab.count ? <span className={`text-[12px] ${isActive ? 'text-[#2458D3]/70' : 'text-[#AEAEB2]'}`}>{tab.count}</span> : null}
                </button>
              )
            })}
          </div>

          <div className="px-5 pb-6 pt-4">
            {activeFeedTab === 'activity' ? (
              activityLoading ? (
                <div className="space-y-5">
                  {[0, 1, 2].map((index) => (
                    <div key={index} className="flex animate-pulse gap-3">
                      <span className="h-6 w-6 shrink-0 rounded-full bg-[#F2F2F7]" />
                      <span className="flex-1 space-y-2 pt-1">
                        <span className="block h-3 w-4/5 rounded bg-[#EEF1F5]" />
                        <span className="block h-2.5 w-14 rounded bg-[#EEF1F5]" />
                      </span>
                    </div>
                  ))}
                </div>
              ) : historyGroups.length ? (
                <div className="space-y-4">
                  {historyGroups.map((group) => (
                    <div key={group.key}>
                      <h4 className="mb-3 text-[14px] font-medium text-[#1D1D1F]">{group.label}</h4>
                      <ol>
                        {group.items.map((item, index) => {
                          const author = item.userId ? usersById.get(item.userId) : undefined
                          const isLast = index === group.items.length - 1
                          return (
                            <li key={item.id} className={`relative flex gap-2.5 ${isLast ? '' : 'pb-4'}`}>
                              {!isLast ? <span className="absolute bottom-1 left-[11.5px] top-7 border-l border-dashed border-[#D1D1D6]" aria-hidden="true" /> : null}
                              <span className="relative shrink-0">
                                <GradientAvatar initials={author?.initials || initialsFromName(item.userName)} src={author?.avatarUrl} size={24} seed={item.userId ?? 0} />
                              </span>
                              <HistoryText item={item} />
                            </li>
                          )
                        })}
                      </ol>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-6 text-center text-[13px] text-[#8E8E93]">{bt('taskDetail.activityEmpty')}</p>
              )
            ) : null}

            {activeFeedTab === 'comments' ? (
              <BoardCommentsSection
                comments={comments}
                users={users}
                currentUserId={currentUserId}
                isLoading={commentsLoading}
                isSubmitting={saving}
                onOpenAttachment={(url) => handleOpenAttachment({ url })}
                onUpdateComment={onUpdateComment}
                onDeleteComment={onDeleteComment}
              />
            ) : null}

            {activeFeedTab === 'checklist' ? (
              <div id="task-checklist">
                <TaskChecklistSection
                  taskId={task.id}
                  canEdit={canEditTask}
                  onLoad={onLoadChecklist}
                  onCreate={onCreateChecklist}
                  onUpdate={onUpdateChecklist}
                  onDelete={onDeleteChecklist}
                />
              </div>
            ) : null}

            {activeFeedTab === 'attachments' ? (
              <div>
                {canEditTask ? (
                  <label className={`mb-3 flex h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed text-[12px] transition ${isUploading ? 'cursor-not-allowed border-[#E5E7EB] text-[#9CA3AF]' : 'border-[#D1D5DB] text-[#4B5563] hover:border-[#2458D3] hover:bg-[#F8FAFF] hover:text-[#2458D3]'}`}>
                    {isUploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                    {isUploading ? bt('taskDetail.uploading') : bt('taskDetail.dropFile')}
                    <input type="file" className="hidden" disabled={isUploading} onChange={handleAttachmentInputChange} />
                  </label>
                ) : null}
                {uploadStatus ? (
                  <p className={`mb-3 text-[13px] ${uploadStatus.type === 'success' ? 'text-[#1E8E3E]' : 'text-[#D92D20]'}`}>{uploadStatus.text}</p>
                ) : null}
                {visibleTaskAttachments.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {visibleTaskAttachments.map((attachment) => (
                      <TaskAttachmentCard
                        key={`${attachment.id}:${attachment.downloadUrl}:${attachment.mimeType}`}
                        attachment={attachment}
                        onLoadAttachment={onLoadAttachment}
                        onOpenAttachment={handleOpenAttachment}
                        onDelete={() => setAttachmentToDelete({ id: attachment.id, fileName: attachment.fileName || bt('taskDetail.file') })}
                        deleteDisabled={saving}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="py-6 text-center text-[13px] text-[#8E8E93]">{bt('taskDetail.noAttachments')}</p>
                )}
                {previewError ? <p className="mt-2 text-[13px] text-[#D92D20]">{previewError}</p> : null}
              </div>
            ) : null}

            {activeFeedTab === 'worklog' ? (
              <div>
                {canEditTask ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      value={worklogHours}
                      onChange={(event) => setWorklogHours(event.target.value)}
                      className="h-8 w-20 rounded-lg border border-[#E5E5EA] bg-white px-2.5 text-[13px] outline-none focus:border-[#2458D3]"
                      placeholder={bt('taskDetail.hours')}
                      aria-label={bt('taskDetail.hours')}
                    />
                    <input
                      value={worklogComment}
                      onChange={(event) => setWorklogComment(event.target.value)}
                      className="h-8 min-w-0 flex-1 rounded-lg border border-[#E5E5EA] bg-white px-2.5 text-[13px] outline-none focus:border-[#2458D3]"
                      placeholder={bt('taskDetail.whatDone')}
                    />
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        const hours = Number(worklogHours)
                        if (!hours || hours <= 0) return
                        onAddWorklog({ timeSpentSec: Math.round(hours * 3600), comment: worklogComment })
                        setWorklogComment('')
                        setWorklogHours('1')
                      }}
                      className="h-8 rounded-lg bg-[#2458D3] px-3 text-[12px] font-medium text-white transition hover:bg-[#1D49B3] disabled:opacity-50"
                    >
                      {bt('taskDetail.logTime')}
                    </button>
                  </div>
                ) : null}
                {worklogItems.length ? (
                  <ul className="mt-4 space-y-3">
                    {worklogItems.map((item) => {
                      const author = usersById.get(item.userId)
                      return (
                        <li key={item.id} className="flex gap-2.5">
                          <GradientAvatar initials={author?.initials || '??'} src={author?.avatarUrl} size={24} seed={item.userId} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] leading-[18px] text-[#1D1D1F]">
                              <span className="font-medium">{author?.fullName || bt('userNumber', { id: item.userId })}</span>
                              <span className="text-[#8E8E93]">{` ${bt('taskDetail.logged')} `}</span>
                              <span className="font-medium">{item.timeSpentLabel}</span>
                            </p>
                            {item.comment ? <p className="mt-0.5 text-[13px] leading-[18px] text-[#3C3C43]">{item.comment}</p> : null}
                            <p className="mt-0.5 text-[11px] text-[#8E8E93]">{item.createdAtLabel}</p>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="py-6 text-center text-[13px] text-[#8E8E93]">{bt('taskDetail.noWorklog')}</p>
                )}
              </div>
            ) : null}
          </div>
        </div>
        {activeFeedTab === 'comments' ? (
          <div className="shrink-0 border-t border-[#E5E5EA] px-5 py-3">
            {canEditTask ? (
              <CommentComposer
                selectedTask={task}
                currentUser={currentUser}
                isSubmitting={saving}
                onCreateComment={onCreateComment}
                onCreatePhotoComment={onCreatePhotoComment}
              />
            ) : (
              <p className="text-[13px] text-[#8E8E93]">{bt('taskDetail.commentsRequireEdit')}</p>
            )}
          </div>
        ) : null}
        <footer className="flex h-12 shrink-0 items-center justify-between gap-3 border-t border-[#E5E5EA] px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="text-[13px] text-[#8E8E93]">{bt('taskDetail.members')}</span>
            <div className="flex items-center gap-1.5">
              {assignees.length ? (
                <div className="flex -space-x-1.5">
                  {assignees.map((user) => (
                    <span key={user.id} title={user.fullName} className="rounded-full ring-2 ring-white">
                      <GradientAvatar initials={user.initials} src={user.avatarUrl} size={22} seed={user.id} />
                    </span>
                  ))}
                </div>
              ) : null}
              {canEditTask ? (
                <button
                  ref={footerMemberButtonRef}
                  type="button"
                  onClick={() => setFooterMemberMenuOpen((value) => !value)}
                  className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#F2F2F7] text-[#8E8E93] transition hover:bg-[#E5E5EA] hover:text-[#1D1D1F]"
                  aria-label={bt('taskDetail.addMember')}
                >
                  <Plus size={12} strokeWidth={2} />
                </button>
              ) : null}
              <FloatingMenu anchor={footerMemberButtonRef.current} open={footerMemberMenuOpen} onClose={() => { setFooterMemberMenuOpen(false); setMemberQuery('') }} align="start" className="w-[280px]">
                {memberMenuContent}
              </FloatingMenu>
            </div>
          </div>
          {currentUserId != null && assigneeIds.includes(currentUserId) && canEditTask ? (
            <button
              type="button"
              onClick={() => setAssigneeIds((prev) => prev.filter((id) => id !== currentUserId))}
              className="flex items-center gap-1.5 text-[13px] text-[#3C3C43] transition hover:text-[#D92D20]"
            >
              <LogOut size={15} strokeWidth={1.75} />
              {bt('taskDetail.leave')}
            </button>
          ) : null}
        </footer>
      </motion.div>

      <AppConfirmDialog
        open={Boolean(attachmentToDelete)}
        title={bt('taskDetail.deleteFileTitle')}
        message={attachmentToDelete ? bt('taskDetail.deleteFileNamed', { name: attachmentToDelete.fileName }) : bt('taskDetail.deleteFileText')}
        confirmText={bt('delete')}
        isLoading={saving}
        onCancel={() => setAttachmentToDelete(null)}
        onConfirm={() => {
          if (!attachmentToDelete) return
          void onDeleteAttachment(attachmentToDelete.id).finally(() => {
            setAttachmentToDelete(null)
          })
        }}
      />

      {pendingStatusChange && (
        <AppModal
          title={bt('taskDetail.pickColumn')}
          onClose={() => setPendingStatusChange(null)}
          maxWidth={450}
        >
          <div className="space-y-4">
            <p className="text-sm text-[#475569] leading-relaxed">
              {bt('taskDetail.statusColumns', { status: bt(`status.${['TODO', 'IN_PROGRESS', 'TEST'].includes(pendingStatusChange.status) ? pendingStatusChange.status : 'DONE'}`) })}
            </p>
            <div className="flex flex-col gap-2 mt-4">
              {pendingStatusChange.matchingColumns.map((col) => (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => {
                    const statusVal = pendingStatusChange.status
                    setPendingStatusChange(null)
                    if (onUpdateStatus) {
                      void onUpdateStatus(statusVal, col.id)
                    }
                  }}
                  className="flex items-center justify-between w-full rounded-xl border border-[#DDE3EE] bg-white px-4 py-3 text-left text-sm font-semibold text-[#0A1628] hover:border-[#3F51B5] hover:bg-[#F8FBFF] transition cursor-pointer outline-none"
                >
                  <span>{col.name}</span>
                  <MaterialSymbol name="chevron_right" size={18} className="text-[#6F86A8]" />
                </button>
              ))}
            </div>
          </div>
        </AppModal>
      )}

      {(previewLoading || preview) ? (
        <div ref={previewDialogRef} role="dialog" aria-modal="true" aria-label={preview?.fileName || bt('taskDetail.attachment')} tabIndex={-1}
          className="absolute inset-0 z-20 flex items-center justify-center bg-[#091728]/60 p-4 backdrop-blur-[2px]"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              closePreview()
            } else if (event.key === 'Tab') {
              const items = Array.from(previewDialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]') || [])
              const first = items[0]
              const last = items[items.length - 1]
              if (event.shiftKey && (document.activeElement === first || document.activeElement === previewDialogRef.current)) {
                event.preventDefault()
                last?.focus()
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault()
                first?.focus()
              }
            }
          }}>
          <div className="flex h-full max-h-[calc(100vh-3rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#DCE4F1] bg-white shadow-[0_30px_80px_rgba(10,22,40,0.38)]">
            <header className="flex items-center justify-between gap-3 border-b border-[#E1E7F2] bg-[#F8F9FD] px-4 py-3 sm:px-6">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-[#0A1628]">{preview?.fileName || bt('taskDetail.attachment')}</p>
                <p className="mt-1 text-xs text-[#6F86A8]">
                  {preview?.mimeType || bt('taskDetail.file')}
                  {currentPreviewIndex >= 0 ? bt('taskDetail.previewPosition', { index: currentPreviewIndex + 1, total: previewableAttachments.length }) : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {preview && previewableAttachments.length > 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => openAttachmentByIndex(currentPreviewIndex - 1)}
                      disabled={!canOpenPrevAttachment}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#DDE3EE] bg-white px-3 text-xs font-semibold text-[#334E73] transition hover:bg-[#F3F7FE] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <MaterialSymbol name="chevron_left" size={16} color="currentColor" />
                      <span>{bt('taskDetail.prev')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openAttachmentByIndex(currentPreviewIndex + 1)}
                      disabled={!canOpenNextAttachment}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#DDE3EE] bg-white px-2 text-[10px] font-semibold text-[#334E73] transition hover:bg-[#F3F7FE] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span>{bt('taskDetail.next')}</span>
                      <MaterialSymbol name="chevron_right" size={14} color="currentColor" />
                    </button>
                  </>
                ) : null}
                {preview ? (
                  <>
                    <button
                      type="button"
                      onClick={handleOpenPreviewInNewTab}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#DDE3EE] bg-white px-3 text-xs font-semibold text-[#334E73] transition hover:bg-[#F3F7FE]"
                    >
                      <MaterialSymbol name="open_in_new" size={14} color="currentColor" />
                      <span>{bt('taskDetail.openSeparately')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadPreview}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#DDE3EE] bg-white px-3 text-xs font-semibold text-[#334E73] transition hover:bg-[#F3F7FE]"
                    >
                      <MaterialSymbol name="download" size={14} color="currentColor" />
                      <span>{bt('taskDetail.download')}</span>
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={closePreview}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#DDE3EE] bg-white text-[#4D6486] transition hover:bg-[#F3F7FE]"
                  aria-label={bt('taskDetail.closePreview')}
                >
                  <MaterialSymbol name="close" size={18} color="currentColor" />
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 bg-[#EEF4FB] p-4 sm:p-6">
              {previewLoading ? (
                <div className="flex h-full items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#2458D3] border-t-transparent" />
                </div>
              ) : preview ? (
                <div className="relative h-full">
                  {previewableAttachments.length > 1 && canOpenPrevAttachment ? (
                    <button
                      type="button"
                      onClick={() => openAttachmentByIndex(currentPreviewIndex - 1)}
                      className="absolute left-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-[#0F172A]/74 text-white shadow-[0_12px_30px_rgba(10,22,40,0.28)] transition hover:bg-[#163056]"
                      aria-label={bt('taskDetail.prevAttachment')}
                    >
                      <MaterialSymbol name="chevron_left" size={22} color="currentColor" />
                    </button>
                  ) : null}

                  {previewableAttachments.length > 1 && canOpenNextAttachment ? (
                    <button
                      type="button"
                      onClick={() => openAttachmentByIndex(currentPreviewIndex + 1)}
                      className="absolute right-3 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-[#0F172A]/74 text-white shadow-[0_12px_30px_rgba(10,22,40,0.28)] transition hover:bg-[#163056]"
                      aria-label={bt('taskDetail.nextAttachment')}
                    >
                      <MaterialSymbol name="chevron_right" size={22} color="currentColor" />
                    </button>
                  ) : null}

                  <AttachmentPreviewBody preview={preview} />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[#C8D5E8] bg-white/70 text-sm text-[#6F86A8]">
                  {bt('taskDetail.previewUnavailable')}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {shareToast ? (
        <AppToast
          message={shareToast.message}
          variant={shareToast.variant}
          onClose={() => setShareToast(null)}
        />
      ) : null}
      </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function AttachmentPreviewBody({ preview }: { preview: AttachmentPreviewState }) {
  switch (preview.kind) {
    case 'image':
      return (
        <div className="flex h-full items-center justify-center overflow-auto rounded-2xl border border-[#DCE4F1] bg-white p-4">
          <img
            src={preview.objectUrl}
            alt={preview.fileName}
            className="max-h-full max-w-full rounded-xl object-contain shadow-[0_16px_40px_rgba(10,22,40,0.14)]"
          />
        </div>
      )
    case 'video':
      return (
        <div className="flex h-full items-center justify-center rounded-2xl border border-[#DCE4F1] bg-[#07111F] p-4">
          <video src={preview.objectUrl} controls className="max-h-full w-full rounded-xl bg-black" />
        </div>
      )
    case 'audio':
      return (
        <div className="flex h-full items-center justify-center rounded-2xl border border-[#DCE4F1] bg-white p-6">
          <div className="w-full max-w-2xl rounded-2xl border border-[#E1E7F2] bg-[#F8F9FD] p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EAF1FC] text-[#2D4D80]">
                <MaterialSymbol name="graphic_eq" size={24} color="currentColor" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-[#0A1628]">{preview.fileName}</p>
                <p className="mt-1 text-xs text-[#6F86A8]">{preview.mimeType || bt('taskDetail.audio')}</p>
              </div>
            </div>
            <audio src={preview.objectUrl} controls className="w-full" />
          </div>
        </div>
      )
    case 'pdf':
      return (
        <div className="h-full rounded-2xl border border-[#DCE4F1] bg-white p-2">
          <iframe title={preview.fileName} src={preview.objectUrl} className="h-full w-full rounded-xl" />
        </div>
      )
    case 'text':
      return (
        <div className="h-full overflow-auto rounded-2xl border border-[#DCE4F1] bg-white p-4">
          <pre className="whitespace-pre-wrap wrap-break-word text-sm leading-6 text-[#1A2D45]">
            {preview.textContent || bt('taskDetail.fileEmpty')}
          </pre>
        </div>
      )
    default:
      return (
        <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[#C8D5E8] bg-white p-6">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF1FC] text-[#2D4D80]">
              <MaterialSymbol name="insert_drive_file" size={28} color="currentColor" />
            </div>
            <p className="text-base font-bold text-[#0A1628]">{preview.fileName}</p>
            <p className="mt-2 text-sm text-[#5B7193]">
              {bt('taskDetail.noPreviewHint')}
            </p>
          </div>
        </div>
      )
  }
}
