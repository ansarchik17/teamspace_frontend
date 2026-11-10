import { normalizeBoardStatus } from '../../../shared/utils/boardStatus'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../../../shared/i18n'
import { bt } from '../../components/board/boardText'
import type { CSSProperties } from 'react'
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import type { BoardTask } from '../../../domain/entities/board/BoardModels'
import type { TzAiTaskAssistResponse, KanbanBoardStatsResponse } from '../../../domain/entities/AiTools'
import type { NotificationRealtimeClient } from '../../../infrastructure/notifications/NotificationRealtimeClient'

import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import AppSelect from '../../../shared/ui/AppSelect'
import AppToast from '../../../shared/ui/AppToast'
import { getErrorMessage } from '../../../shared/utils/getErrorMessage'
import { createBoardController } from '../../board/createBoardController'
import { createAuthController } from '../../auth/createAuthController'
import BoardAdvancedPanel from '../../components/board/BoardAdvancedPanel'
import BoardColumnCard from '../../components/board/BoardColumnCard'
import { KANBAN_PAGE_BG } from '../../components/board/kanbanTheme'
import { ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react'
import BoardFilters from '../../components/board/BoardFilters'
import BoardHubSkeleton from '../../components/board/BoardHubSkeleton'
import BoardsEmptyState from '../../components/board/BoardsEmptyState'
import BoardMembersModal from '../../components/board/BoardMembersModal'
import BoardSkeleton from '../../components/board/BoardSkeleton'
import CreateBoardModal from '../../components/board/CreateBoardModal'
import CreateSprintModal from '../../components/board/CreateSprintModal'
import CreateTaskModal from '../../components/board/CreateTaskModal'
import GoalFormModal from '../../components/board/GoalFormModal'
import ProjectFormModal from '../../components/board/ProjectFormModal'
import AiTaskAssistModal from '../../components/board/AiTaskAssistModal'
import TaskDetailModal from '../../components/board/TaskDetailModal'
import BoardProjectHub, { type BoardHubCover } from '../../components/board/BoardProjectHub'
import BoardToolsMenu from '../../components/board/BoardToolsMenu'
import { AXIS_TONE_CLASS, AXIS_UI, isDoneColumn, type AxisTone } from '../../../shared/ui/axisTokens'
import { DueDate, PriorityChip } from '../../components/board/TaskMeta'
import ViewToggle from '../../../shared/ui/ViewToggle'
import AxisAvatar from '../../components/board/AxisAvatar'
import BoardStatsDashboard from '../../components/board/BoardStatsDashboard'
import MultiBoardStatsModal from '../../components/board/MultiBoardStatsModal'
import MultiBoardStatsSection from '../../components/board/MultiBoardStatsSection'
import SingleBoardAiStatsSection from '../../components/board/SingleBoardAiStatsSection'
import { AssignmentsPanel } from '../assignments/AssignmentsPage'
import { AlemAIUploadModal } from '../../components/board/AlemAIUploadModal'
import { AlemAIGeneratedTasks } from '../../components/board/AlemAIGeneratedTasks'
import AppConfirmDialog from '../../../shared/ui/AppConfirmDialog'
import CreateColumnModal from '../../components/board/CreateColumnModal'
import AppPromptDialog from '../../../shared/ui/AppPromptDialog'
import { workTabFromSearch, workTabPath, type WorkTab } from '../../components/work/workTabs'
import { createAlemAiController } from '../../alem-ai/createAlemAiController'
import type { TzAiTaskItem } from '../alemai/tzai/types'
import type {
  BoardActivityViewModel,
  BoardCommentViewModel,
  BoardDetailsViewModel,
  BoardLabelViewModel,
  BoardOptionViewModel,
  BoardTaskViewModel,
  BoardUserViewModel,
  BoardStatsViewModel,
} from '../../view-models/BoardViewModel'

const LAST_BOARD_KEY = 'superapp.last_board_id'
const BOARD_VISIT_IDS_KEY = 'superapp.board_visit_ids'
const SPRINT_LINK_OVERRIDES_KEY_PREFIX = 'superapp.board_sprint_links.'

type BoardOutletContext = {
  realtimeClient?: NotificationRealtimeClient
}

type SprintLinkOverride = {
  goalId?: string
  projectId?: string
}

const getSprintLinkOverridesStorageKey = (boardId: string) => `${SPRINT_LINK_OVERRIDES_KEY_PREFIX}${boardId}`

const readSprintLinkOverrides = (boardId: string): Record<string, SprintLinkOverride> => {
  try {
    const raw = window.localStorage.getItem(getSprintLinkOverridesStorageKey(boardId))
    if (!raw) return {}

    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([sprintId, value]) => {
        if (!value || typeof value !== 'object') return []

        const nextValue = value as { goalId?: unknown; projectId?: unknown }
        const goalId = typeof nextValue.goalId === 'string' ? nextValue.goalId : undefined
        const projectId = typeof nextValue.projectId === 'string' ? nextValue.projectId : undefined

        if (!goalId && !projectId) return []
        return [[sprintId, { goalId, projectId }]]
      }),
    )
  } catch {
    return {}
  }
}

const writeSprintLinkOverrides = (boardId: string, overrides: Record<string, SprintLinkOverride>) => {
  try {
    if (Object.keys(overrides).length === 0) {
      window.localStorage.removeItem(getSprintLinkOverridesStorageKey(boardId))
      return
    }

    window.localStorage.setItem(getSprintLinkOverridesStorageKey(boardId), JSON.stringify(overrides))
  } catch {
    // Ignore storage sync failures.
  }
}

const applySprintLinkOverrides = (
  details: BoardDetailsViewModel,
  overrides: Record<string, SprintLinkOverride>,
): BoardDetailsViewModel => {
  if (Object.keys(overrides).length === 0) return details

  let hasChanges = false
  const sprints = details.sprints.map((sprint) => {
    const override = overrides[sprint.id]
    if (!override) return sprint

    const nextGoalId = sprint.goalId || override.goalId
    const nextProjectId = sprint.projectId || override.projectId
    if (nextGoalId === sprint.goalId && nextProjectId === sprint.projectId) {
      return sprint
    }

    hasChanges = true
    return {
      ...sprint,
      goalId: nextGoalId,
      projectId: nextProjectId,
    }
  })

  return hasChanges ? { ...details, sprints } : details
}

const getSprintStatusMeta = (status: string): { label: string; tone: AxisTone } => {
  if (status === 'active') return { label: bt('sprint.status.active'), tone: 'action' }
  if (status === 'planned') return { label: bt('sprint.status.planned'), tone: 'neutral' }
  return { label: bt('sprint.status.completed'), tone: 'success' }
}

const TASK_ROW_GRID = 'grid grid-cols-[minmax(0,1fr)_96px] items-center gap-4 px-4 @[560px]:grid-cols-[minmax(0,1fr)_150px_96px] @[820px]:grid-cols-[minmax(200px,1fr)_150px_110px_minmax(150px,200px)_96px]'

const TASK_VIEW_OPTIONS = [
  { value: 'list', icon: 'view_list', get label() { return bt('page.list') } },
  { value: 'board', icon: 'grid_view', get label() { return bt('page.board') } },
] as const

const formatSprintPeriod = (startDate?: string, endDate?: string): string => {
  const format = (value?: string) => {
    if (!value) return ''
    const date = new Date(value)
    return Number.isNaN(date.valueOf())
      ? ''
      : formatDate(date, { day: 'numeric', month: 'short' })
  }
  const start = format(startDate)
  const end = format(endDate)
  if (start && end) return `${start} — ${end}`
  if (start) return bt('sprint.from', { date: start })
  if (end) return bt('sprint.to', { date: end })
  return bt('sprint.noDates')
}

const initialsOf = (name: string): string =>
  name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '??'

/** Поле формы по брендбуку: 44 px, граница #7B8494, фокус — синяя граница и кольцо */
const PLAN_FIELD =
  'h-11 w-full rounded-[6px] border border-[#7B8494] bg-white px-3 text-[14px] text-[#17202E] outline-none transition-[border-color,box-shadow] duration-[120ms] placeholder:text-[#586174] focus:border-[#2458D3] focus:shadow-[0_0_0_3px_rgba(36,88,211,0.15)]'

function PlanEmptyState({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[12px] border border-dashed border-[#C4C9D2] bg-white px-6 py-10 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EDF2FF] text-[#2458D3]">
        <MaterialSymbol name={icon} size={20} color="currentColor" />
      </span>
      <p className="mt-3 text-[14px] font-semibold leading-5 text-[#17202E]">{title}</p>
      <p className="mt-1 max-w-[320px] text-[14px] leading-5 text-[#586174]">{text}</p>
    </div>
  )
}

const pushBoardVisitId = (boardId: string) => {
  try {
    const raw = window.localStorage.getItem(BOARD_VISIT_IDS_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    const prev = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
    const next = [boardId, ...prev.filter((id) => id !== boardId)].slice(0, 24)
    window.localStorage.setItem(BOARD_VISIT_IDS_KEY, JSON.stringify(next))
  } catch {
    window.localStorage.setItem(BOARD_VISIT_IDS_KEY, JSON.stringify([boardId]))
  }
}

const PRESET_HEX_MAP: Record<string, string> = {
  preset_default: '#F4F5F7',
  preset_mint: '#EAF7F2',
  preset_sand: '#FFF3E8',
  preset_sky: '#EAF3FF',
}

interface BoardRouteState {
  boardId?: string
  taskId?: string
}

const buildBoardUrl = (boardId?: string, taskId?: string, tab: WorkTab = 'boards') => {
  if (!boardId?.trim() && !taskId?.trim()) return workTabPath(tab)
  const params = new URLSearchParams()
  const normalizedBoardId = boardId?.trim()
  const normalizedTaskId = taskId?.trim()

  if (normalizedBoardId) {
    params.set('boardId', normalizedBoardId)
  }

  if (normalizedTaskId) {
    params.set('task', normalizedTaskId)
  }

  const search = params.toString()
  return search ? `/board?${search}` : '/board'
}

const defaultTaskForm = {
  title: '',
  description: '',
  priority: 'medium' as BoardTask['priority'],
  sprintId: '',
  goalId: '',
  projectId: '',
  dueAt: '',
  assigneeIds: [] as number[],
  labelIds: [] as string[],
  parentId: '',
  attachmentFileIds: [] as string[],
}

const moveArrayItem = <T,>(array: T[], from: number, to: number): T[] => {
  const next = array.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

const normalizeStatusKey = (key?: string): string => {
  if (!key) return ''
  const k = key.toUpperCase().trim()
  if (['TODO', 'TO DO', 'К ВЫПОЛНЕНИЮ', 'К_ВЫПОЛНЕНИЮ'].includes(k)) return 'TODO' // i18n-ignore
  if (['IN_PROGRESS', 'IN PROGRESS', 'В РАБОТЕ', 'В_РАБОТЕ'].includes(k)) return 'IN_PROGRESS' // i18n-ignore
  if (['TEST', 'НА ПРОВЕРКЕ', 'НА_ПРОВЕРКЕ'].includes(k)) return 'TEST' // i18n-ignore
  if (['DONE', 'ГОТОВО', 'ЗАВЕРШЕНО', 'ЗАВЕРШЕН'].includes(k)) return 'DONE' // i18n-ignore
  return k
}

export default function BoardPage() {
  const { t: assignmentText } = useTranslation('assignments')
  const navigate = useNavigate()
  const location = useLocation()
  const { realtimeClient } = useOutletContext<BoardOutletContext>()
  const { boardController } = useMemo(() => createBoardController(), [])
  const { authController } = useMemo(() => createAuthController(), [])
  const { alemAiRepository } = useMemo(() => createAlemAiController(), [])
  const routeState = (location.state as BoardRouteState | null) ?? null
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const requestedBoardId =
    searchParams.get('boardId')?.trim() ||
    (typeof routeState?.boardId === 'string' ? routeState.boardId.trim() : '')
  const requestedTaskId =
    searchParams.get('task')?.trim() ||
    searchParams.get('taskId')?.trim() ||
    (typeof routeState?.taskId === 'string' ? routeState.taskId.trim() : '')
  const skipBoardPicker = Boolean(requestedBoardId)
  const pendingRequestedTaskIdRef = useRef(requestedTaskId)
  /** Доска, у которой нужно открыть окно участников сразу после загрузки (кнопка «Пригласить» в хабе) */
  const [pendingMembersBoardId, setPendingMembersBoardId] = useState('')

  const [boards, setBoards] = useState<BoardOptionViewModel[]>([])
  const [boardProgressById, setBoardProgressById] = useState<Record<string, number>>({})
  const [boardMembersById, setBoardMembersById] = useState<Record<string, Array<{ userId: number; initials: string; name: string; avatarUrl?: string }>>>({})
  const [boardBackgroundsById, setBoardBackgroundsById] = useState<Record<string, BoardDetailsViewModel['background']>>({})
  const [boardCoverImagesById, setBoardCoverImagesById] = useState<Record<string, { key: string; url: string }>>({})
  const coverImageRequestsRef = useRef(new Set<string>())
  const coverObjectUrlsRef = useRef<string[]>([])
  const [boardColumnsById, setBoardColumnsById] = useState<Record<string, Array<{ name: string; key: string; totalTasks: number }>>>({})
  const [weekTasks, setWeekTasks] = useState<BoardTaskViewModel[]>([])
  const [boardView, setBoardView] = useState<'picker' | 'kanban'>(() => (skipBoardPicker ? 'kanban' : 'picker'))
  const [pickerTab, setPickerTab] = useState<WorkTab>(() => workTabFromSearch(location.search))
  const pickerTabRef = useRef(pickerTab)
  pickerTabRef.current = pickerTab
  const workNavKey = (location.state as { workNav?: boolean } | null)?.workNav ? location.key : ''
  const [users, setUsers] = useState<BoardUserViewModel[]>([])
  const [membersUsersHasMore, setMembersUsersHasMore] = useState(false)
  const [membersUsersLoadingMore, setMembersUsersLoadingMore] = useState(false)
  const [membersUsersSearch, setMembersUsersSearch] = useState('')
  const [membersUsersOffset, setMembersUsersOffset] = useState(0)
  const [boardDetails, setBoardDetails] = useState<BoardDetailsViewModel | null>(null)
  const [selectedBoardId, setSelectedBoardId] = useState('')
  const workNavPending = Boolean(workNavKey) && (new URLSearchParams(location.search).get('boardId') ?? '') !== selectedBoardId
  const [selectedSprintId, setSelectedSprintId] = useState('')
  const [search, setSearch] = useState('')
  const [filterUserId, setFilterUserId] = useState('')
  const [filterAuthorId, setFilterAuthorId] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [filterLabelId, setFilterLabelId] = useState('')
  const [filterProjectId, setFilterProjectId] = useState('')
  const [currentUserId, setCurrentUserId] = useState<number | null>(null)
  const [columnOffsets, setColumnOffsets] = useState<Record<string, number>>({})
  const [columnLoadingMore, setColumnLoadingMore] = useState<Record<string, boolean>>({})
  const [columnHasMore, setColumnHasMore] = useState<Record<string, boolean>>({})

  const [isBootstrapLoading, setIsBootstrapLoading] = useState(true)
  const [isBoardLoading, setIsBoardLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const membersUsersPageLimit = 50

  const setApiError = useCallback((err: unknown, fallback: string) => {
    setError(getErrorMessage(err, fallback))
  }, [])

  const loadMembersUserPage = useCallback(async (params?: { reset?: boolean; search?: string; offset?: number }) => {
    const reset = params?.reset ?? false
    const search = params?.search ?? membersUsersSearch
    const offset = params?.offset ?? (reset ? 0 : membersUsersOffset)

    setMembersUsersLoadingMore(true)
    try {
      const result = await boardController.listUsersPage({
        limit: membersUsersPageLimit,
        offset,
        search,
      })

      setUsers((prev) => {
        if (reset) {
          return result.items
        }

        const merged = new Map(prev.map((user) => [user.id, user]))
        for (const user of result.items) {
          merged.set(user.id, user)
        }
        return Array.from(merged.values())
      })
      setMembersUsersOffset(offset + result.items.length)
      setMembersUsersHasMore(offset + result.items.length < result.total)
    } catch (err) {
      setApiError(err, bt('errors.loadUsers'))
    } finally {
      setMembersUsersLoadingMore(false)
    }
  }, [boardController, membersUsersOffset, membersUsersPageLimit, membersUsersSearch, setApiError])

  const handleLoadAttachment = useCallback((url: string) => {
    return boardController.downloadAttachmentByUrl(url)
  }, [boardController])

  // handleAttachmentDelete logic (commented out due to redundancy/mojibake)
  const [dragColumnId, setDragColumnId] = useState('')
  const [columnDropTargetId, setColumnDropTargetId] = useState('')
  const [dragTaskState, setDragTaskState] = useState<{ taskId: string; sourceColumnId: string } | null>(null)
  const columnRefs = useRef(new Map<string, HTMLDivElement>())
  const mainContainerRef = useRef<HTMLElement | null>(null)
  const columnsScrollRef = useRef<HTMLElement | null>(null)


  const [showCreateBoardModal, setShowCreateBoardModal] = useState(false)
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false)
  const [showCreateSprintModal, setShowCreateSprintModal] = useState(false)
  const [showCreateGoalModal, setShowCreateGoalModal] = useState(false)
  const [showMembersModal, setShowMembersModal] = useState(false)
  const [showStatsModal, setShowStatsModal] = useState(false)
  const [showMultiStatsModal, setShowMultiStatsModal] = useState(false)
  const [boardStats, setBoardStats] = useState<BoardStatsViewModel | null>(null)
  const [aiBoardStats, setAiBoardStats] = useState<KanbanBoardStatsResponse | null>(null)
  const [showTaskDetailModal, setShowTaskDetailModal] = useState(false)

  const [createTaskValue, setCreateTaskValue] = useState(defaultTaskForm)
  const [createSprintValue, setCreateSprintValue] = useState({ name: '', goalId: '', projectId: '', status: 'planned', startDate: '', endDate: '' })
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [selectedTaskDetails, setSelectedTaskDetails] = useState<BoardTask | null>(null)
  const [createTaskColumnId, setCreateTaskColumnId] = useState('')
  const [membersSelectedUserId, setMembersSelectedUserId] = useState('')
  const [membersSelectedRole, setMembersSelectedRole] = useState('member')
  const [membersSelectedTeamRole, setMembersSelectedTeamRole] = useState('')

  const [isMutating, setIsMutating] = useState(false)
  const [showToolsMenu, setShowToolsMenu] = useState(false)
  const [showAdvancedPanel, setShowAdvancedPanel] = useState(false)
  const [advancedPanelSection, setAdvancedPanelSection] = useState<'all' | 'background' | 'labels'>('all')
  const [showEditBoardModal, setShowEditBoardModal] = useState(false)
  const [editBoardValue, setEditBoardValue] = useState('')
  const [showDeleteBoardConfirm, setShowDeleteBoardConfirm] = useState(false)
  const [deleteBoardTarget, setDeleteBoardTarget] = useState<{ id: string; name: string } | null>(null)
  const [showDeleteSprintConfirm, setShowDeleteSprintConfirm] = useState(false)
  const [entityDeleteTarget, setEntityDeleteTarget] = useState<{ kind: 'goal' | 'project' | 'sprint'; id: string; name: string } | null>(null)
  
  const [uploadedFilesForNewTask, setUploadedFilesForNewTask] = useState<{ id: string; fileName: string }[]>([])


  // Team AI States
  const [showAlemAiUploadModal, setShowAlemAiUploadModal] = useState(false)
  const [isAlemAiProcessing, setIsAlemAiProcessing] = useState(false)
  const [generatedAiTasks, setGeneratedAiTasks] = useState<TzAiTaskItem[]>([])
  const [aiTaskAssistResult, setAiTaskAssistResult] = useState<TzAiTaskAssistResponse | null>(null)
  const [aiKanbanContext, setAiKanbanContext] = useState<Record<string, { 
    board: { id: string; name: string }; 
    columns: { column: { id: string; name: string } }[]; 
    sprints: { id: string; name: string }[]; 
    members: { user_id: number; name: string }[]; 
  }>>({})
  const [showAiGeneratedTasks, setShowAiGeneratedTasks] = useState(false)
  const [activity, setActivity] = useState<BoardActivityViewModel | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)
  const [labels, setLabels] = useState<BoardLabelViewModel[]>([])
  const [comments, setComments] = useState<BoardCommentViewModel[]>([])
  const [isBackgroundLoading, setIsBackgroundLoading] = useState(false)
  const [isLabelsLoading, setIsLabelsLoading] = useState(false)
  const [isCommentsLoading, setIsCommentsLoading] = useState(false)
  const [resolvedBackgroundImageUrl, setResolvedBackgroundImageUrl] = useState('')

  const resetTaskCreate = useCallback(() => {
    setCreateTaskValue(defaultTaskForm)
    setUploadedFilesForNewTask([])
    setCreateTaskColumnId('')
  }, [])

  const syncBoardUrl = useCallback((boardId?: string, taskId?: string) => {
    const nextUrl = buildBoardUrl(boardId, taskId, pickerTabRef.current)
    const currentUrl = `${location.pathname}${location.search}`

    if (currentUrl !== nextUrl) {
      navigate(nextUrl, { replace: true })
    }
  }, [location.pathname, location.search, navigate])

  const [columnPrompt, setColumnPrompt] = useState<{
    mode: 'create' | 'rename'
    columnId: string
    initialValue: string
    initialKey: string
    open: boolean
  }>({
    mode: 'create',
    columnId: '',
    initialValue: '',
    initialKey: '',
    open: false,
  })
  const [columnPromptValue, setColumnPromptValue] = useState('')
  const [columnPromptKey, setColumnPromptKey] = useState('')
  const [deleteColumnId, setDeleteColumnId] = useState('')
  const [confirmDeleteTaskOpen, setConfirmDeleteTaskOpen] = useState(false)

  const [activePlanTab, setActivePlanTab] = useState<'board' | 'list' | 'goals' | 'projects' | 'sprints'>('board')
  /** Последний выбранный вид вкладки «Задачи»: канбан или список */
  const [taskView, setTaskView] = useState<'board' | 'list'>('board')
  const [goalFormName, setGoalFormName] = useState('')
  const [goalFormDescription, setGoalFormDescription] = useState('')
  const [projectFormName, setProjectFormName] = useState('')
  const [projectFormDescription, setProjectFormDescription] = useState('')
  const [projectFormGoalId, setProjectFormGoalId] = useState('')
  const [goalEditState, setGoalEditState] = useState<{ open: boolean; goalId: string; name: string; description: string }>({
    open: false,
    goalId: '',
    name: '',
    description: '',
  })
  const [projectEditState, setProjectEditState] = useState<{ open: boolean; projectId: string; name: string; description: string; goalId: string; status: string }>({
    open: false,
    projectId: '',
    name: '',
    description: '',
    goalId: '',
    status: 'active',
  })
  const [sprintEditState, setSprintEditState] = useState<{ open: boolean; sprintId: string; name: string; goalId: string; projectId: string; status: string; startDate: string; endDate: string }>({
    open: false,
    sprintId: '',
    name: '',
    goalId: '',
    projectId: '',
    status: 'planned',
    startDate: '',
    endDate: '',
  })
  const [sprintLinkOverrides, setSprintLinkOverrides] = useState<Record<string, SprintLinkOverride>>({})
  const persistSprintLinkOverride = useCallback((boardId: string, sprintId: string, value: SprintLinkOverride) => {
    setSprintLinkOverrides((prev) => {
      const next = { ...prev }

      if (value.goalId || value.projectId) {
        next[sprintId] = value
      } else {
        delete next[sprintId]
      }

      writeSprintLinkOverrides(boardId, next)
      return next
    })
  }, [])

  useEffect(() => {
    if (!selectedBoardId) {
      setSprintLinkOverrides({})
      return
    }

    setSprintLinkOverrides(readSprintLinkOverrides(selectedBoardId))
  }, [selectedBoardId])

  const selectedTask = useMemo(() => {
    if (!boardDetails || !selectedTaskId) return null
    const findTask = (tasks: typeof boardDetails.columns[number]['tasks']): typeof boardDetails.columns[number]['tasks'][number] | null => {
      for (const task of tasks) {
        if (task.id === selectedTaskId) return task
        const nested = findTask(task.subtasks ?? [])
        if (nested) return nested
      }
      return null
    }

    for (const column of boardDetails.columns) {
      const task = findTask(column.tasks)
      if (task) {
        return task
      }
    }
    return null
  }, [boardDetails, selectedTaskId])

  const selectedTaskEntity = useMemo<BoardTask | null>(() => {
    if (selectedTaskDetails && selectedTaskDetails.id === selectedTaskId) {
      return selectedTaskDetails
    }
    if (!selectedTask || !boardDetails) return null

    const fromBoard = boardDetails.columns.flatMap((column) => column.tasks).find((task) => task.id === selectedTask.id)
    const findTask = (tasks: typeof boardDetails.columns[number]['tasks']): typeof boardDetails.columns[number]['tasks'][number] | null => {
      for (const task of tasks) {
        if (task.id === selectedTask.id) return task
        const nested = findTask(task.subtasks ?? [])
        if (nested) return nested
      }
      return null
    }
    const fromTree = fromBoard ?? findTask(boardDetails.columns.flatMap((column) => column.tasks))
    if (!fromTree) return null

    return {
      id: fromTree.id,
      boardId: boardDetails.boardId,
      columnId: boardDetails.columns.find((column) => column.tasks.some((item) => item.id === fromTree.id))?.id ?? fromTree.boardId,
      sprintId: fromTree.sprintId,
      taskNumber: fromTree.taskNumber,
      taskKey: fromTree.taskKey,
      link: fromTree.link,
      title: fromTree.title,
      description: fromTree.description,
      priority: fromTree.priority,
      assigneeIds: fromTree.assigneeIds,
      originalEstimateSec: 0,
      timeSpentSec: 0,
      dueAt: fromTree.dueAt,
      status: fromTree.status,
      parentId: fromTree.parentId,
      subtasks: [],
      createdBy: fromTree.createdBy,
      createdAt: fromTree.createdAt,
      updatedAt: fromTree.updatedAt,
      attachments: [],
      labels: (fromTree.labels ?? []).map((label) => ({
        id: label.id,
        boardId: boardDetails.boardId,
        name: label.name,
        color: label.color,
        createdAt: '',
      })),
    }
  }, [boardDetails, selectedTask, selectedTaskDetails, selectedTaskId])

  const allBoardTasks = useMemo(() => {
    const result: Array<BoardDetailsViewModel['columns'][number]['tasks'][number]> = []
    const visit = (tasks: BoardDetailsViewModel['columns'][number]['tasks']) => {
      for (const task of tasks) {
        result.push(task)
        visit(task.subtasks ?? [])
      }
    }
    visit(boardDetails?.columns.flatMap((column) => column.tasks) ?? [])
    return result
  }, [boardDetails])

  const selectedParentTask = useMemo(() => {
    if (!selectedTaskEntity?.parentId) return null
    return allBoardTasks.find((task) => task.id === selectedTaskEntity.parentId) ?? null
  }, [allBoardTasks, selectedTaskEntity?.parentId])

  const parentTaskOptions = useMemo(() => {
    if (!selectedTaskEntity) return allBoardTasks

    const excluded = new Set<string>([selectedTaskEntity.id])
    const visit = (tasks: BoardTask['subtasks']) => {
      for (const task of tasks ?? []) {
        excluded.add(task.id)
        visit(task.subtasks)
      }
    }
    visit(selectedTaskEntity.subtasks)

    return allBoardTasks.filter((task) => !excluded.has(task.id))
  }, [allBoardTasks, selectedTaskEntity])

  const currentUserRole = useMemo(() => {
    if (!boardDetails || currentUserId === null) return 'member'
    if (boardDetails.ownerId === currentUserId) return 'owner'
    const member = boardDetails.members.find((m) => m.userId === currentUserId)
    return member?.role || 'member'
  }, [boardDetails, currentUserId])

  const knownUsersById = useMemo(() => {
    const map = new Map<number, string>()

    for (const user of users) {
      map.set(user.id, user.fullName)
    }

    for (const member of boardDetails?.members ?? []) {
      if (!map.has(member.userId)) {
        map.set(member.userId, member.name)
      }
    }

    return map
  }, [boardDetails?.members, users])

  const knownUserAvatarsById = useMemo(() => {
    const map = new Map<number, string>()

    for (const member of boardDetails?.members ?? []) {
      if (member.avatarUrl) {
        map.set(member.userId, member.avatarUrl)
      }
    }

    for (const user of users) {
      if (user.avatarUrl && !map.has(user.id)) {
        map.set(user.id, user.avatarUrl)
      }
    }

    return map
  }, [boardDetails?.members, users])

  const boardMembersAsUsers = useMemo<BoardUserViewModel[]>(() => {
    return boardDetails?.members?.map((m) => {
      const u = users.find((user) => user.id === m.userId)
      return {
        id: m.userId,
        fullName: m.name,
        email: u?.email || '',
        avatarUrl: m.avatarUrl || u?.avatarUrl || '',
        initials: m.initials || u?.initials || '??',
        teamRole: m.teamRole || '',
      }
    }) ?? []
  }, [boardDetails, users])

  const modalUsers = useMemo<BoardUserViewModel[]>(() => {
    if (!boardDetails) return []

    return boardDetails.members.map((member) => {
      const u = users.find((user) => user.id === member.userId)
      return {
        id: member.userId,
        email: u?.email || '',
        firstName: '',
        lastName: '',
        fullName: member.name,
        username: '',
        avatarUrl: member.avatarUrl || u?.avatarUrl || '',
        role: member.role,
        teamRole: member.teamRole || '',
        availabilityStatus: '',
        initials: member.initials || u?.initials || '??',
      }
    })
  }, [boardDetails, users])

  const isBoardOwner = useMemo(() => {
    if (!boardDetails || currentUserId === null) return false
    return boardDetails.ownerId === currentUserId
  }, [boardDetails, currentUserId])

  const mapHistoryDetailsToColumnNames = useCallback((input: BoardActivityViewModel): BoardActivityViewModel => {
    if (!boardDetails) return input

    const columnsById = new Map(boardDetails.columns.map((column) => [column.id, column.name]))

    return {
      ...input,
      history: input.history.map((item) => {
        let details = item.details

        for (const [columnId, columnName] of columnsById.entries()) {
          if (details.includes(columnId)) {
            details = details.split(columnId).join(columnName)
          }
        }

        const userIdFromLabel = /^User\s+(\d+)$/.exec(item.userName)?.[1]
        const parsedUserId = userIdFromLabel ? Number(userIdFromLabel) : null
        const resolvedUserName = parsedUserId !== null && knownUsersById.has(parsedUserId)
          ? knownUsersById.get(parsedUserId) ?? item.userName
          : item.userName

        return {
          ...item,
          details,
          userName: resolvedUserName,
        }
      }),
    }
  }, [boardDetails, knownUsersById])

  const loadBoard = useCallback(async (boardId: string, options?: { force?: boolean; silent?: boolean }) => {
    const force = options?.force ?? false
    const silent = options?.silent ?? false

    if (!silent) {
      setIsBoardLoading(true)
    }
    setError('')

    try {
      const details = await boardController.loadBoard(boardId, force)
      const hydratedDetails = applySprintLinkOverrides(details, readSprintLinkOverrides(boardId))
      setBoardDetails(hydratedDetails)
      setBoardColumnsById((previous) => ({
        ...previous,
        [boardId]: hydratedDetails.columns.map((column) => ({
          name: column.name,
          key: column.key,
          totalTasks: column.totalTasks,
        })),
      }))
      setBoardBackgroundsById((previous) => ({ ...previous, [boardId]: hydratedDetails.background ?? null }))
      setBoardMembersById((previous) => ({
        ...previous,
        [boardId]: hydratedDetails.members.map((member) => ({
          userId: member.userId,
          initials: member.initials,
          name: member.name,
          avatarUrl: member.avatarUrl,
        })),
      }))
      window.localStorage.setItem(LAST_BOARD_KEY, boardId)

      // Initialize pagination
      const hasMore: Record<string, boolean> = {}
      const offsets: Record<string, number> = {}
      hydratedDetails.columns.forEach((col) => {
        hasMore[col.id] = col.totalTasks > col.tasks.length
        offsets[col.id] = col.tasks.length
      })
      setColumnHasMore(hasMore)
      setColumnOffsets(offsets)
    } catch (error) {
      setApiError(error, bt('errors.loadBoard'))
    } finally {
      setIsBoardLoading(false)
    }
  }, [boardController, setApiError])

  useEffect(() => {
    if (!realtimeClient || !selectedBoardId) {
      return
    }

    return realtimeClient.subscribe((event) => {
      if (event.type !== 'kanban_task_moved') {
        return
      }

      const content = event.content
      const payload = content && typeof content === 'object' && !Array.isArray(content)
        ? content as Record<string, unknown>
        : event
      const boardId = typeof payload.board_id === 'string'
        ? payload.board_id
        : typeof event.board_id === 'string'
          ? event.board_id
          : ''

      if (!boardId || boardId !== selectedBoardId) {
        return
      }

      void loadBoard(boardId, { force: true, silent: true })
    })
  }, [loadBoard, realtimeClient, selectedBoardId])

  useEffect(() => {
    if (!boardDetails) return

    const hydratedDetails = applySprintLinkOverrides(boardDetails, sprintLinkOverrides)
    if (hydratedDetails !== boardDetails) {
      setBoardDetails(hydratedDetails)
    }
  }, [boardDetails, sprintLinkOverrides])

  const lastLoadTimeRef = useRef<Record<string, number>>({})

  const handleLoadMoreTasks = useCallback(async (columnId: string) => {
    if (!selectedBoardId || columnLoadingMore[columnId] || !columnHasMore[columnId]) return

    // Throttle: don't load more than once every 500ms per column
    const now = Date.now()
    const lastLoad = lastLoadTimeRef.current[columnId] || 0
    if (now - lastLoad < 500) return
    lastLoadTimeRef.current[columnId] = now

    setColumnLoadingMore((prev) => ({ ...prev, [columnId]: true }))

    try {
      const currentOffset = columnOffsets[columnId] || 0
      const limit = 10

      const moreTasks = await boardController.searchTasks({
        boardId: selectedBoardId,
        columnIds: [columnId],
        limit,
        offset: currentOffset,
      })

      if (moreTasks.length > 0) {
        setBoardDetails((prev) => {
          if (!prev) return null
          return {
            ...prev,
            columns: prev.columns.map((col) => {
              if (col.id === columnId) {
                // Filter out tasks that might already exist (rare but possible with dynamic boards)
                const existingIds = new Set(col.tasks.map((t) => t.id))
                const uniqueNewTasks = moreTasks.filter((t) => !existingIds.has(t.id))
                return {
                  ...col,
                  tasks: [...col.tasks, ...uniqueNewTasks],
                }
              }
              return col
            }),
          }
        })
        setColumnOffsets((prev) => ({ ...prev, [columnId]: currentOffset + moreTasks.length }))
        if (moreTasks.length < limit) {
          setColumnHasMore((prev) => ({ ...prev, [columnId]: false }))
        }
      } else {
        setColumnHasMore((prev) => ({ ...prev, [columnId]: false }))
      }
    } catch (err) {
      console.error('Failed to load more tasks', err)
    } finally {
      setColumnLoadingMore((prev) => ({ ...prev, [columnId]: false }))
    }
  }, [selectedBoardId, columnLoadingMore, columnHasMore, columnOffsets, boardController])

  const bootstrapLoadedRef = useRef(false)
  const loadBootstrap = useCallback(async (force = false) => {
    setError('')
    if (!force && !bootstrapLoadedRef.current) setIsBootstrapLoading(true)

    try {
      const result = await boardController.bootstrap(force)
      bootstrapLoadedRef.current = true
      setBoards(result.boards)
      setUsers(result.users)
      setMembersUsersOffset(result.users.length)
      setMembersUsersHasMore(result.users.length >= 100)

      if (!result.boards.length) {
        setBoardDetails(null)
        return
      }

      const stored = window.localStorage.getItem(LAST_BOARD_KEY)
      const routeHit = requestedBoardId && result.boards.some((item) => item.id === requestedBoardId)
      const storedHit = stored && result.boards.some((item) => item.id === stored)

      let nextSelected = ''
      if (skipBoardPicker) {
        if (routeHit) {
          nextSelected = requestedBoardId
        } else if (storedHit) {
          nextSelected = stored
        } else {
          nextSelected = result.boards[0].id
        }
      }

      setSelectedBoardId((prev) => prev || nextSelected)
    } catch (error) {
      setApiError(error, bt('errors.loadBoardData'))
    } finally {
      setIsBootstrapLoading(false)
    }
  }, [boardController, requestedBoardId, setApiError, skipBoardPicker])

  useEffect(() => {
    if (!showMembersModal) return
    void loadMembersUserPage({ reset: true, search: membersUsersSearch, offset: 0 })
  }, [showMembersModal, membersUsersSearch])

  useEffect(() => {
    void loadBootstrap()
  }, [loadBootstrap])

  useEffect(() => {
    if (!boards.length) {
      setBoardProgressById({})
      setBoardMembersById({})
      setBoardColumnsById({})
      setWeekTasks([])
      return
    }

    let isCancelled = false

    const progress = Object.fromEntries(
      boards.map((board) => [board.id, Math.max(0, Math.min(100, Math.round(board.progress?.completionPercent ?? 0)))])
    ) as Record<string, number>

    setBoardProgressById(progress)

    void (async () => {
      try {
        const entries: Array<[
          string,
          {
            members: Array<{ userId: number; initials: string; name: string; avatarUrl?: string }>
            columns: Array<{ name: string; key: string; totalTasks: number }>
            background: BoardDetailsViewModel['background']
          },
        ]> = await Promise.all(
          boards.map(async (board) => {
            try {
              const details = await boardController.loadBoard(board.id)
              const members = (details.members || [])
                .map((member) => {
                  const directoryUser = users.find((user) => user.id === member.userId)
                  return {
                    userId: member.userId,
                    initials: member.initials || directoryUser?.initials || member.name?.slice(0, 2).toUpperCase() || '??',
                    name: member.name || directoryUser?.fullName || bt('user'),
                    avatarUrl: member.avatarUrl || directoryUser?.avatarUrl || '',
                  }
                })
              const columns = details.columns.map((column) => ({
                name: column.name,
                key: column.key,
                totalTasks: column.totalTasks,
              }))
              return [board.id, { members, columns, background: details.background ?? null }]
            } catch {
              return [board.id, { members: [], columns: [], background: null }]
            }
          }),
        )

        if (!isCancelled) {
          const members: Record<string, Array<{ userId: number; initials: string; name: string; avatarUrl?: string }>> = {}
          const columns: Record<string, Array<{ name: string; key: string; totalTasks: number }>> = {}
          const backgrounds: Record<string, BoardDetailsViewModel['background']> = {}
          for (const [boardId, preview] of entries) {
            members[boardId] = preview.members
            columns[boardId] = preview.columns
            backgrounds[boardId] = preview.background
          }
          setBoardMembersById(members)
          setBoardColumnsById(columns)
          setBoardBackgroundsById(backgrounds)
        }
      } catch {
        if (!isCancelled) {
          setBoardMembersById({})
          setBoardColumnsById({})
        }
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [boardController, boards, users])

  useEffect(() => {
    if (!boards.length) {
      setWeekTasks([])
      return
    }
    if (boardView !== 'picker') return

    let isCancelled = false
    const dateFrom = new Date()
    dateFrom.setHours(0, 0, 0, 0)
    const dateTo = new Date(dateFrom)
    dateTo.setDate(dateTo.getDate() + 7)
    dateTo.setHours(23, 59, 59, 999)

    void boardController
      .searchTasks({ dateFrom: dateFrom.toISOString(), dateTo: dateTo.toISOString(), limit: 100 })
      .then((tasks) => {
        if (!isCancelled) setWeekTasks(tasks)
      })
      .catch(() => {
        if (!isCancelled) setWeekTasks([])
      })

    return () => {
      isCancelled = true
    }
  }, [boardController, boardView, boards])

  useEffect(() => {
    let isCancelled = false

    void authController
      .refreshIfExpiringSoon()
      .then((model) => {
        if (!isCancelled) {
          setCurrentUserId(model.userId)
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setCurrentUserId(null)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [authController])

  useEffect(() => {
    if (!selectedBoardId) return
    void loadBoard(selectedBoardId)
  }, [loadBoard, selectedBoardId])

  useEffect(() => {
    pendingRequestedTaskIdRef.current = requestedTaskId
  }, [requestedTaskId])

  useEffect(() => {
    if (!requestedBoardId || !boards.some((item) => item.id === requestedBoardId)) {
      return
    }

    setBoardView('kanban')
    setSelectedBoardId(requestedBoardId)
  }, [boards, requestedBoardId])

  useEffect(() => {
    if (!requestedTaskId || requestedBoardId || selectedBoardId) {
      return
    }

    let isCancelled = false

    void boardController
      .loadTask(requestedTaskId)
      .then((task) => {
        if (isCancelled) return
        pendingRequestedTaskIdRef.current = task.taskKey || task.id
        setBoardView('kanban')
        setSelectedBoardId(task.boardId)
      })
      .catch((error) => {
        if (!isCancelled) {
          setApiError(error, bt('errors.openTaskLink'))
        }
      })

    return () => {
      isCancelled = true
    }
  }, [boardController, requestedBoardId, requestedTaskId, selectedBoardId, setApiError])

  useEffect(() => {
    if (!selectedBoardId) return

    void (async () => {
      setIsLabelsLoading(true)
      try {
        const nextLabels = await boardController.loadBoardLabels(selectedBoardId)
        setLabels(nextLabels)
      } catch {
        setLabels([])
      } finally {
        setIsLabelsLoading(false)
      }
    })()
  }, [boardController, selectedBoardId])

  useEffect(() => {
    const background = boardDetails?.background
    const shouldLoadImage = Boolean(isBoardOwner && background?.imageUrl && selectedBoardId && (background.mode || '').toLowerCase().includes('image'))

    if (!shouldLoadImage) {
      setResolvedBackgroundImageUrl('')
      return
    }

    let isCancelled = false
    let nextObjectUrl = ''

    void (async () => {
      try {
        const blob = await boardController.downloadBoardBackgroundImage(selectedBoardId)
        if (isCancelled) return

        nextObjectUrl = URL.createObjectURL(blob)
        setResolvedBackgroundImageUrl(nextObjectUrl)
      } catch {
        if (!isCancelled) {
          setResolvedBackgroundImageUrl('')
        }
      }
    })()

    return () => {
      isCancelled = true
      if (nextObjectUrl) {
        URL.revokeObjectURL(nextObjectUrl)
      }
    }
  }, [boardController, boardDetails?.background, isBoardOwner, selectedBoardId])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 2400)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    if (boardView !== 'kanban' || !selectedBoardId) {
      return
    }
    pushBoardVisitId(selectedBoardId)
  }, [boardView, selectedBoardId])

  useEffect(() => {
    if (boardView !== 'kanban' || !selectedBoardId || pendingRequestedTaskIdRef.current || workNavPending) {
      return
    }

    syncBoardUrl(selectedBoardId, showTaskDetailModal ? (selectedTaskEntity?.taskKey || selectedTaskId) : undefined)
  }, [boardView, selectedBoardId, selectedTaskEntity?.taskKey, selectedTaskId, showTaskDetailModal, syncBoardUrl, workNavPending])

  const activeProjectId = filterProjectId === '__none__' || boardDetails?.projects.some((project) => project.id === filterProjectId) ? filterProjectId : ''
  const isFilterActive = !!(selectedSprintId || search || filterLabelId || activeProjectId || filterUserId || filterAuthorId || filterStatus || filterDate)

  const filteredColumns = useMemo(() => {
    if (!boardDetails) return []

    const normalizedSearch = search.trim().toLowerCase()
    const normalizedFilterDate = filterDate.trim()

    return boardDetails.columns.map((column) => {
      const filteredTasks = column.tasks.filter((task) => {
        const bySprint = !selectedSprintId || task.sprintId === selectedSprintId
        if (!bySprint) return false

        const byLabel = !filterLabelId || task.labels?.some((label) => label.id === filterLabelId)
        if (!byLabel) return false

        const byProject = !activeProjectId || (activeProjectId === '__none__' ? !task.projectId : task.projectId === activeProjectId)
        if (!byProject) return false

        const byAssignee = !filterUserId || task.assigneeIds.includes(Number(filterUserId))
        if (!byAssignee) return false

        const byAuthor = !filterAuthorId || task.createdBy === Number(filterAuthorId)
        if (!byAuthor) return false

        const byStatus = !filterStatus || normalizeBoardStatus(column.key || task.status || '') === filterStatus
        if (!byStatus) return false

        const byDate =
          !normalizedFilterDate ||
          (task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 10) === normalizedFilterDate : false)
        if (!byDate) return false

        if (!normalizedSearch) return true
        return (
          task.taskKey.toLowerCase().includes(normalizedSearch) ||
          task.title.toLowerCase().includes(normalizedSearch) ||
          task.description.toLowerCase().includes(normalizedSearch)
        )
      })

      return {
        ...column,
        tasks: filteredTasks,
        totalTasks: isFilterActive ? filteredTasks.length : column.totalTasks,
      }
    })
  }, [boardDetails, search, selectedSprintId, filterLabelId, activeProjectId, filterUserId, filterAuthorId, filterStatus, filterDate])

  const filteredTaskRows = useMemo(() => filteredColumns.flatMap((column) =>
    column.tasks.map((task) => ({ task, column })),
  ), [filteredColumns])

  const totalTasksCount = useMemo(() => {
    if (!boardDetails) return 0
    if (isFilterActive) {
      return filteredColumns.reduce((sum, col) => sum + col.tasks.length, 0)
    }
    return boardDetails.totalTasks
  }, [boardDetails, filteredColumns, isFilterActive])

  const handleResetFilters = useCallback(() => {
    setSelectedSprintId('')
    setFilterUserId('')
    setFilterAuthorId('')
    setFilterStatus('')
    setFilterDate('')
    setSearch('')
    setFilterLabelId('')
    setFilterProjectId('')
  }, [])

  const quickActionTasks = useMemo(() => {
    if (!boardDetails) return [] as Array<{ id: string; title: string; columnName: string }>

    return boardDetails.columns.flatMap((column) =>
      column.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        columnName: column.name,
      })),
    )
  }, [boardDetails])

  const handleAlemAiUpload = async (file: File) => {
    setIsAlemAiProcessing(true)
    setError('')
    try {
      const response = await alemAiRepository.analyzeTzViaLocalApi(file)
      setGeneratedAiTasks(response.tasks)
      setAiKanbanContext(response.kanban_context)
      setShowAlemAiUploadModal(false)
      setShowAiGeneratedTasks(true)
    } catch (err) {
      setApiError(err, bt('errors.analyzeSpec'))
    } finally {
      setIsAlemAiProcessing(false)
    }
  }

  const handleTaskAiAssist = async () => {
    const hasTitle = createTaskValue.title.trim()
    const hasDesc = createTaskValue.description.trim()
    if (!hasTitle && !hasDesc) return

    setIsAlemAiProcessing(true)
    setError('')
    try {
      const res = await alemAiRepository.getTaskAssist({
        title: hasTitle || hasDesc.slice(0, 60),
        text: hasDesc || hasTitle,
        board_id: selectedBoardId || undefined,
        current_priority: createTaskValue.priority as any,
        current_sprint_id: createTaskValue.sprintId || undefined,
        current_assignee_id: createTaskValue.assigneeIds[0] || undefined,
        current_due_at: createTaskValue.dueAt || undefined,
        file_ids: createTaskValue.attachmentFileIds,
      })
      setAiTaskAssistResult(res)
    } catch (err) {
      setApiError(err, bt('errors.aiAssist'))
    } finally {
      setIsAlemAiProcessing(false)
    }
  }

  const handleEditTaskAiAssist = async () => {
    if (!selectedTaskEntity) return
    const hasTitle = selectedTaskEntity.title?.trim()
    const hasDesc = selectedTaskEntity.description?.trim()
    if (!hasTitle && !hasDesc) return

    setIsAlemAiProcessing(true)
    setError('')
    try {
      const res = await alemAiRepository.getTaskAssist({
        title: hasTitle || hasDesc?.slice(0, 60) || bt('task'),
        text: hasDesc || hasTitle || '',
        board_id: selectedTaskEntity.boardId,
        current_priority: selectedTaskEntity.priority,
        current_sprint_id: selectedTaskEntity.sprintId,
        current_assignee_id: selectedTaskEntity.assigneeIds[0],
        current_due_at: selectedTaskEntity.dueAt,
        file_ids: selectedTaskEntity.attachments.map(a => a.id),
      })
      setAiTaskAssistResult(res)
    } catch (err) {
      setApiError(err, bt('errors.aiAssist'))
    } finally {
      setIsAlemAiProcessing(false)
    }
  }

  const handleApplyAiTaskAssist = () => {
    if (!aiTaskAssistResult) return
    const res = aiTaskAssistResult
    const sug = res.ai_suggestion
    
    if (showCreateTaskModal) {
      setCreateTaskValue(prev => ({
        ...prev,
        title: res.suggested_title || prev.title,
        description: res.description || prev.description,
        priority: (sug?.priority as any) || prev.priority,
        sprintId: sug?.sprint_id || prev.sprintId,
        assigneeIds: sug?.assignee_id ? [sug.assignee_id] : prev.assigneeIds,
        dueAt: sug?.due_at || prev.dueAt,
      }))
    } else if (selectedTaskEntity) {
      setSelectedTaskDetails(prev => {
        if (!prev) return prev
        return {
          ...prev,
          title: res.suggested_title || prev.title,
          description: res.description || prev.description,
          priority: (sug?.priority as any) || prev.priority,
          sprintId: sug?.sprint_id || prev.sprintId,
          assigneeIds: sug?.assignee_id ? [sug.assignee_id] : prev.assigneeIds,
          dueAt: sug?.due_at || prev.dueAt,
        }
      })
    }
    
    setAiTaskAssistResult(null)
    setToast(bt('toast.aiApplied'))
  }

  const handleAlemAiConfirm = async (tasks: TzAiTaskItem[]) => {
    setIsMutating(true)
    try {
      await alemAiRepository.createTzTasks(tasks)
      setShowAiGeneratedTasks(false)
      setToast(bt('toast.tasksCreated', { count: tasks.length }))
      
      const firstBoardId = tasks[0]?.board_id
      if (firstBoardId && firstBoardId !== selectedBoardId) {
        setSelectedBoardId(firstBoardId)
      } else {
        void handleRefresh()
      }
    } catch (err) {
      setApiError(err, bt('errors.createTasks'))
    } finally {
      setIsMutating(false)
    }
  }

  const handleRefresh = async () => {
    if (!selectedBoardId) return
    setIsRefreshing(true)
    boardController.invalidateAll()
    await loadBootstrap(true)
    await loadBoard(selectedBoardId, { force: true, silent: true })
    setIsRefreshing(false)
  }

  const setColumnCardRef = useCallback((columnId: string, node: HTMLDivElement | null) => {
    if (!node) {
      columnRefs.current.delete(columnId)
      return
    }
    columnRefs.current.set(columnId, node)
  }, [])

  const animateColumnReorder = useCallback(
    (previousRects: Map<string, DOMRect>, orderedColumnIds: string[]) => {
      window.requestAnimationFrame(() => {
        for (const columnId of orderedColumnIds) {
          const element = columnRefs.current.get(columnId)
          const previousRect = previousRects.get(columnId)
          if (!element || !previousRect) continue

          const nextRect = element.getBoundingClientRect()
          const deltaX = previousRect.left - nextRect.left
          if (!deltaX) continue

          element.style.transition = 'none'
          element.style.transform = `translateX(${deltaX}px)`

          window.requestAnimationFrame(() => {
            element.style.transition = 'transform 240ms cubic-bezier(0.2, 0, 0, 1)'
            element.style.transform = 'translateX(0)'

            const cleanup = () => {
              element.style.transition = ''
              element.style.transform = ''
              element.removeEventListener('transitionend', cleanup)
            }

            element.addEventListener('transitionend', cleanup)
          })
        }
      })
    },
    [],
  )

  const handleColumnDrop = async (targetColumnId: string) => {
    if (dragTaskState || !dragColumnId || !boardDetails || !selectedBoardId || dragColumnId === targetColumnId) return

    const fromIndex = boardDetails.columns.findIndex((item) => item.id === dragColumnId)
    const toIndex = boardDetails.columns.findIndex((item) => item.id === targetColumnId)
    if (fromIndex < 0 || toIndex < 0) return

    const previous = boardDetails
    const previousRects = new Map<string, DOMRect>()
    for (const column of boardDetails.columns) {
      const element = columnRefs.current.get(column.id)
      if (element) {
        previousRects.set(column.id, element.getBoundingClientRect())
      }
    }
    const reordered = moveArrayItem(boardDetails.columns, fromIndex, toIndex)
      .map((column, index) => ({ ...column, position: index }))

    setBoardDetails({ ...boardDetails, columns: reordered })
    setDragColumnId('')
    setColumnDropTargetId('')
    animateColumnReorder(previousRects, reordered.map((column) => column.id))

    try {
      await boardController.moveColumn(selectedBoardId, dragColumnId, toIndex)
    } catch (error) {
      setBoardDetails(previous)
      setApiError(error, bt('errors.columnOrder'))
      await loadBoard(selectedBoardId, { force: true, silent: true })
    }
  }

  const handleTaskDrop = async (targetColumnId: string) => {
    if (dragColumnId || !dragTaskState || !boardDetails || !selectedBoardId) return
    
    // We now allow dropping in the same column (it will move to top)


    const previous = boardDetails
    const sourceColumn = boardDetails.columns.find((item) => item.id === dragTaskState.sourceColumnId)
    const targetColumn = boardDetails.columns.find((item) => item.id === targetColumnId)
    if (!sourceColumn || !targetColumn) return

    const task = sourceColumn.tasks.find((item) => item.id === dragTaskState.taskId)
    if (!task) return

    const nextColumns = boardDetails.columns.map((column) => {
      const isRoot = !task.parentId
      if (column.id === sourceColumn.id && column.id === targetColumn.id) {
        // Move within same column: remove and put at top
        const filtered = column.tasks.filter((item) => item.id !== dragTaskState.taskId)
        return { ...column, tasks: [{ ...task, status: targetColumn.key }, ...filtered] }
      }
      if (column.id === sourceColumn.id) {
        return {
          ...column,
          tasks: column.tasks.filter((item) => item.id !== dragTaskState.taskId),
          totalTasks: isRoot ? Math.max(0, column.totalTasks - 1) : column.totalTasks,
        }
      }
      if (column.id === targetColumn.id) {
        return {
          ...column,
          tasks: [{ ...task, status: targetColumn.key }, ...column.tasks],
          totalTasks: isRoot ? column.totalTasks + 1 : column.totalTasks,
        }
      }
      return column
    })
    setBoardDetails({ ...boardDetails, columns: nextColumns })
    setDragTaskState(null)

    try {
      await boardController.moveTask(task.boardId, task.id, targetColumnId)
      realtimeClient?.send({
        type: 'kanban_task_moved',
        board_id: task.boardId,
        task_id: task.id,
        from_column_id: sourceColumn.id,
        to_column_id: targetColumn.id,
      })
      await loadBoard(selectedBoardId, { force: true, silent: true })
    } catch (error) {
      setBoardDetails(previous)
      setApiError(error, bt('errors.moveTask'))
      await loadBoard(selectedBoardId, { force: true, silent: true })
    }
  }

  const refreshSelectedTaskDetails = useCallback(async (taskId: string) => {
    const loadedTask = await boardController.loadTask(taskId)
    setSelectedTaskDetails(loadedTask)
    return loadedTask
  }, [boardController])

  const openTaskDetail = useCallback(async (taskId: string) => {
    setSelectedTaskId(taskId)
    setSelectedTaskDetails(null)
    setShowTaskDetailModal(true)
    setActivityLoading(true)
    setIsCommentsLoading(true)
    try {
      const [loadedActivity, loadedComments, loadedTask] = await Promise.all([
        boardController.loadTaskActivity(taskId),
        boardController.loadTaskComments(taskId),
        refreshSelectedTaskDetails(taskId),
      ])
      setActivity(mapHistoryDetailsToColumnNames(loadedActivity))
      setComments(loadedComments)
      setSelectedTaskDetails(loadedTask)
    } catch {
      setActivity(null)
      setComments([])
      setSelectedTaskDetails(null)
    } finally {
      setActivityLoading(false)
      setIsCommentsLoading(false)
    }
  }, [boardController, mapHistoryDetailsToColumnNames, refreshSelectedTaskDetails])

  useEffect(() => {
    const pendingTaskId = pendingRequestedTaskIdRef.current

    if (!boardDetails || !pendingTaskId) {
      return
    }

    const findPendingTask = (tasks: BoardDetailsViewModel['columns'][number]['tasks']): BoardDetailsViewModel['columns'][number]['tasks'][number] | null => {
      for (const task of tasks) {
        if (task.id === pendingTaskId || task.taskKey.toLowerCase() === pendingTaskId.toLowerCase()) {
          return task
        }
        const nested = findPendingTask(task.subtasks ?? [])
        if (nested) {
          return nested
        }
      }
      return null
    }

    const pendingTask = findPendingTask(boardDetails.columns.flatMap((column) => column.tasks))

    if (!pendingTask) {
      return
    }

    pendingRequestedTaskIdRef.current = ''
    void openTaskDetail(pendingTask.id)
  }, [boardDetails, openTaskDetail])

  useEffect(() => {
    if (!pendingMembersBoardId || boardDetails?.boardId !== pendingMembersBoardId) return
    setPendingMembersBoardId('')
    setShowMembersModal(true)
  }, [boardDetails?.boardId, pendingMembersBoardId])

  const handleSubmitColumnPrompt = async () => {
    if (!selectedBoardId) return

    const value = columnPromptValue.trim()
    if (!value) return

    const normalizedKey = normalizeStatusKey(columnPromptKey)
    const initialNormalizedKey = normalizeStatusKey(columnPrompt.initialKey)

    if (columnPrompt.mode === 'rename') {
      if (
        !columnPrompt.columnId ||
        (value === columnPrompt.initialValue.trim() && normalizedKey === initialNormalizedKey)
      ) {
        setColumnPrompt({ mode: 'create', columnId: '', initialValue: '', initialKey: '', open: false })
        setColumnPromptValue('')
        return
      }

      try {
        await boardController.updateColumn(selectedBoardId, columnPrompt.columnId, value, columnPromptKey)

        await loadBoard(selectedBoardId, { force: true, silent: true })
        setToast(bt('toast.columnUpdated'))
      } catch (error) {
        setApiError(error, bt('errors.updateColumn'))
      } finally {
        setColumnPrompt({ mode: 'create', columnId: '', initialValue: '', initialKey: '', open: false })
        setColumnPromptValue('')
        setColumnPromptKey('')
      }
      return
    }

    try {
      await boardController.createColumn(selectedBoardId, value, columnPromptKey)
      await loadBoard(selectedBoardId, { force: true, silent: true })
      setToast(bt('toast.columnCreated'))
    } catch (error) {
      setApiError(error, bt('errors.createColumn'))
    } finally {
      setColumnPrompt({ mode: 'create', columnId: '', initialValue: '', initialKey: '', open: false })
      setColumnPromptValue('')
      setColumnPromptKey('')
    }
  }

  const handleConfirmDeleteColumn = async () => {
    if (!selectedBoardId || !deleteColumnId) return

    try {
      await boardController.deleteColumn(selectedBoardId, deleteColumnId)
      await loadBoard(selectedBoardId, { force: true, silent: true })
      setToast(bt('toast.columnDeleted'))
    } catch (error) {
      setApiError(error, bt('errors.deleteColumn'))
    } finally {
      setDeleteColumnId('')
    }
  }

  const handleConfirmDeleteTask = async () => {
    if (!selectedBoardId || !selectedTaskId) return

    try {
      await boardController.deleteTask(selectedBoardId, selectedTaskId)
      await loadBoard(selectedBoardId, { force: true, silent: true })
      setShowTaskDetailModal(false)
      setSelectedTaskId('')
      setSelectedTaskDetails(null)
      setActivity(null)
      syncBoardUrl(selectedBoardId)
      setToast(bt('toast.taskDeleted'))
    } catch (error) {
      setApiError(error, bt('errors.deleteTask'))
    } finally {
      setConfirmDeleteTaskOpen(false)
      setIsMutating(false)
    }
  }

  const handleDeleteSprint = async () => {
    if (!selectedBoardId || !selectedSprintId) return

    try {
      await boardController.deleteSprint(selectedBoardId, selectedSprintId)
      setSelectedSprintId('')
      await loadBoard(selectedBoardId, { force: true, silent: true })
      setShowDeleteSprintConfirm(false)
      setToast(bt('toast.sprintDeleted'))
    } catch (error) {
      setApiError(error, bt('errors.deleteSprint'))
    } finally {
      setIsMutating(false)
    }
  }
  const boardSurfaceStyle = useMemo<CSSProperties | undefined>(() => {
    if (boardView !== 'kanban') return undefined
    if (!boardDetails?.background) {
      return { backgroundColor: KANBAN_PAGE_BG }
    }

    if (!boardDetails?.background || !isBoardOwner) {
      return boardView === 'kanban' ? { backgroundColor: KANBAN_PAGE_BG } : undefined
    }

    const mode = (boardDetails.background.mode || '').toLowerCase()
    const isPresetMode = mode.includes('preset') || mode.includes('color')
    const isImageMode = mode.includes('image')

    const hex = boardDetails.background.presetHex || PRESET_HEX_MAP[boardDetails.background.presetId] || ''

    if (isPresetMode && hex) {
      return {
        backgroundColor: hex,
        backgroundImage: `linear-gradient(180deg, ${hex} 0%, #F3F6FB 48%)`,
      }
    }

    if ((isImageMode || (!isPresetMode && !isImageMode)) && resolvedBackgroundImageUrl) {
      return {
        backgroundImage: `url(${resolvedBackgroundImageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    }

    if (hex) {
      return {
        backgroundColor: hex,
        backgroundImage: `linear-gradient(180deg, ${hex} 0%, #F3F6FB 48%)`,
      }
    }

    return undefined
  }, [boardView, boardDetails, isBoardOwner, resolvedBackgroundImageUrl])


  const handleUpdateBoard = async () => {
    if (!selectedBoardId || !editBoardValue.trim()) return
    setIsMutating(true)
    try {
      await boardController.updateBoard(selectedBoardId, editBoardValue.trim())
      setToast(bt('toast.boardUpdated'))
      setShowEditBoardModal(false)
      await handleRefresh()
    } catch (error) {
      setApiError(error, bt('errors.updateBoard'))
    } finally {
      setIsMutating(false)
    }
  }

  const selectPickerTab = (tab: WorkTab) => {
    setPickerTab(tab)
    navigate(workTabPath(tab), { replace: true })
  }

  useEffect(() => {
    if (!workNavKey) return
    const params = new URLSearchParams(location.search)
    const navBoardId = params.get('boardId')
    if (navBoardId) {
      window.localStorage.setItem(LAST_BOARD_KEY, navBoardId)
      setSelectedBoardId(navBoardId)
      setBoardView('kanban')
      return
    }
    setPickerTab(workTabFromSearch(location.search))
    if (params.get('create') === 'board') {
      setShowCreateBoardModal(true)
      navigate(workTabPath('boards'), { replace: true })
    }
    if (boardView === 'kanban') {
      setBoardView('picker')
      setSelectedBoardId('')
      setBoardDetails(null)
      setActivePlanTab('board')
      void loadBootstrap(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workNavKey])

  const openBoardPicker = useCallback(() => {
    setBoardView('picker')
    setSelectedBoardId('')
    setBoardDetails(null)
    setActivePlanTab('board')
    syncBoardUrl()
    void loadBootstrap(true)
  }, [loadBootstrap, syncBoardUrl])

  const handleCreateGoalSubmit = async () => {
    if (!selectedBoardId || !goalFormName.trim()) return
    setIsMutating(true)
    try {
      await boardController.createGoal(selectedBoardId, {
        name: goalFormName.trim(),
        description: goalFormDescription.trim() || undefined,
      })
      setGoalFormName('')
      setGoalFormDescription('')
      setShowCreateGoalModal(false)
      await loadBoard(selectedBoardId, { force: true, silent: true })
      setToast(bt('toast.goalCreated'))
    } catch (error) {
      setApiError(error, bt('errors.createGoal'))
    } finally {
      setIsMutating(false)
    }
  }

  const handleCreateProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedBoardId || !projectFormName.trim()) return
    setIsMutating(true)
    try {
      await boardController.createProject(selectedBoardId, {
        name: projectFormName.trim(),
        description: projectFormDescription.trim() || undefined,
        goalId: projectFormGoalId || undefined,
      })
      setProjectFormName('')
      setProjectFormDescription('')
      setProjectFormGoalId('')
      await loadBoard(selectedBoardId, { force: true, silent: true })
      setToast(bt('toast.projectCreated'))
    } catch (error) {
      setApiError(error, bt('errors.createProject'))
    } finally {
      setIsMutating(false)
    }
  }

  const handleUpdateGoalSubmit = async () => {
    if (!selectedBoardId || !goalEditState.goalId || !goalEditState.name.trim()) return
    setIsMutating(true)
    try {
      await boardController.updateGoal(selectedBoardId, goalEditState.goalId, {
        name: goalEditState.name.trim(),
        description: goalEditState.description.trim() || undefined,
      })
      setGoalEditState({ open: false, goalId: '', name: '', description: '' })
      await loadBoard(selectedBoardId, { force: true, silent: true })
      setToast(bt('toast.goalUpdated'))
    } catch (error) {
      setApiError(error, bt('errors.updateGoal'))
    } finally {
      setIsMutating(false)
    }
  }

  const handleDeleteGoalById = async (goalId: string) => {
    if (!selectedBoardId || !goalId) return
    setIsMutating(true)
    try {
      await boardController.deleteGoal(selectedBoardId, goalId)
      await loadBoard(selectedBoardId, { force: true, silent: true })
      setToast(bt('toast.goalDeleted'))
    } catch (error) {
      setApiError(error, bt('errors.deleteGoal'))
    } finally {
      setIsMutating(false)
    }
  }

  const handleUpdateProjectSubmit = async () => {
    if (!selectedBoardId || !projectEditState.projectId || !projectEditState.name.trim()) return
    setIsMutating(true)
    try {
      await boardController.updateProject(selectedBoardId, projectEditState.projectId, {
        name: projectEditState.name.trim(),
        description: projectEditState.description.trim() || undefined,
        goalId: projectEditState.goalId || undefined,
        status: projectEditState.status,
      })
      setProjectEditState({ open: false, projectId: '', name: '', description: '', goalId: '', status: 'active' })
      await loadBoard(selectedBoardId, { force: true, silent: true })
      setToast(bt('toast.projectUpdated'))
    } catch (error) {
      setApiError(error, bt('errors.updateProject'))
    } finally {
      setIsMutating(false)
    }
  }

  const handleDeleteProjectById = async (projectId: string) => {
    if (!selectedBoardId || !projectId) return
    setIsMutating(true)
    try {
      await boardController.deleteProject(selectedBoardId, projectId)
      await loadBoard(selectedBoardId, { force: true, silent: true })
      setToast(bt('toast.projectDeleted'))
    } catch (error) {
      setApiError(error, bt('errors.deleteProject'))
    } finally {
      setIsMutating(false)
    }
  }

  const handleUpdateSprintById = async () => {
    if (!selectedBoardId || !sprintEditState.sprintId || !sprintEditState.name.trim()) return
    setIsMutating(true)
    try {
      const updatedSprint = await boardController.updateSprint(selectedBoardId, sprintEditState.sprintId, {
        name: sprintEditState.name.trim(),
        goalId: sprintEditState.goalId || undefined,
        projectId: sprintEditState.projectId || undefined,
        status: sprintEditState.status,
        startDate: sprintEditState.startDate ? new Date(sprintEditState.startDate).toISOString() : undefined,
        endDate: sprintEditState.endDate ? new Date(sprintEditState.endDate).toISOString() : undefined,
      })
      persistSprintLinkOverride(selectedBoardId, updatedSprint.id, {
        goalId: updatedSprint.goalId || sprintEditState.goalId || undefined,
        projectId: updatedSprint.projectId || sprintEditState.projectId || undefined,
      })
      setSprintEditState({ open: false, sprintId: '', name: '', goalId: '', projectId: '', status: 'planned', startDate: '', endDate: '' })
      await loadBoard(selectedBoardId, { force: true, silent: true })
      setToast(bt('toast.sprintUpdated'))
    } catch (error) {
      setApiError(error, bt('errors.updateSprint'))
    } finally {
      setIsMutating(false)
    }
  }

  const handleDeleteSprintById = async (sprintId: string) => {
    if (!selectedBoardId || !sprintId) return
    setIsMutating(true)
    try {
      await boardController.deleteSprint(selectedBoardId, sprintId)
      if (selectedSprintId === sprintId) {
        setSelectedSprintId('')
      }
      await loadBoard(selectedBoardId, { force: true, silent: true })
      setToast(bt('toast.sprintDeleted'))
    } catch (error) {
      setApiError(error, bt('errors.deleteSprint'))
    } finally {
      setIsMutating(false)
    }
  }

  const handleDeleteBoard = async () => {
    const boardId = deleteBoardTarget?.id || selectedBoardId
    if (!boardId) return
    setIsMutating(true)
    try {
      await boardController.deleteBoard(boardId)
      setToast(bt('toast.boardDeleted'))
      setShowDeleteBoardConfirm(false)
      setDeleteBoardTarget(null)
      if (boardId === selectedBoardId) {
        setSelectedBoardId('')
        setBoardDetails(null)
        setBoardView('picker')
        syncBoardUrl()
      }
      await loadBootstrap(true)
    } catch (error) {
      setApiError(error, bt('errors.deleteBoard'))
    } finally {
      setIsMutating(false)
    }
  }

  const loadAiBoardStats = useCallback(async (boardId: string) => {
    try {
      const stats = await alemAiRepository.getBoardStats(boardId)
      setAiBoardStats(stats)
    } catch (error) {
      console.error('Failed to load AI stats', error)
    }
  }, [alemAiRepository])

  const handleOpenStats = useCallback(async () => {
    if (!selectedBoardId) return
    setIsMutating(true)
    try {
      const stats = await boardController.loadBoardStats(selectedBoardId)
      setBoardStats(stats)
      setShowStatsModal(true)
      void loadAiBoardStats(selectedBoardId)
    } catch (error) {
      setApiError(error, bt('errors.loadStats'))
    } finally {
      setIsMutating(false)
    }
  }, [boardController, selectedBoardId, setApiError, loadAiBoardStats])

  useEffect(() => {
    if (!dragTaskState && !dragColumnId) return

    const handleWindowDragOver = (e: DragEvent) => {
      const threshold = 150
      const maxSpeed = 35

      if (mainContainerRef.current) {
        const rect = mainContainerRef.current.getBoundingClientRect()
        // Top edge
        if (e.clientY < rect.top + threshold) {
          const dist = Math.max(0, rect.top + threshold - e.clientY)
          const speed = (dist / threshold) * maxSpeed + 5
          mainContainerRef.current.scrollTop -= speed
        } 
        // Bottom edge
        else if (e.clientY > rect.bottom - threshold) {
          const dist = Math.max(0, e.clientY - (rect.bottom - threshold))
          const speed = (dist / threshold) * maxSpeed + 5
          mainContainerRef.current.scrollTop += speed
        }
      }

      if (columnsScrollRef.current) {
        const rect = columnsScrollRef.current.getBoundingClientRect()
        // Left edge
        if (e.clientX < rect.left + threshold) {
          const dist = Math.max(0, rect.left + threshold - e.clientX)
          const speed = (dist / threshold) * maxSpeed + 5
          columnsScrollRef.current.scrollLeft -= speed
        } 
        // Right edge
        else if (e.clientX > rect.right - threshold) {
          const dist = Math.max(0, e.clientX - (rect.right - threshold))
          const speed = (dist / threshold) * maxSpeed + 5
          columnsScrollRef.current.scrollLeft += speed
        }
      }
    }

    window.addEventListener('dragover', handleWindowDragOver)
    return () => window.removeEventListener('dragover', handleWindowDragOver)
  }, [dragTaskState, dragColumnId])

  const runAdvanced = useCallback(async (

    action: () => Promise<void>,
    onError: string,
    setLoading?: (value: boolean) => void,
  ) => {
    if (setLoading) setLoading(true)
    try {
      await action()
    } catch (err) {
      setApiError(err, onError)
      throw err
    } finally {
      if (setLoading) setLoading(false)
    }
  }, [setApiError])

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!selectedBoardId || !selectedTaskId || !selectedTaskEntity) return

    await runAdvanced(async () => {
      await boardController.deleteTaskFile(selectedTaskEntity.boardId, selectedTaskId, attachmentId)

      const [loadedActivity] = await Promise.all([
        boardController.loadTaskActivity(selectedTaskId),
        loadBoard(selectedBoardId, { force: true, silent: true }),
        refreshSelectedTaskDetails(selectedTaskId),
      ])

      setActivity(mapHistoryDetailsToColumnNames(loadedActivity))
      setToast(bt('toast.fileDeleted'))
    }, bt('errors.deleteFile'), setIsMutating)
  }

  useEffect(() => {
    if (!showAdvancedPanel) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowAdvancedPanel(false)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleEscape)
    }
  }, [showAdvancedPanel])

  const effectiveBackgroundsById = useMemo(() => (
    boardDetails ? { ...boardBackgroundsById, [boardDetails.boardId]: boardDetails.background ?? null } : boardBackgroundsById
  ), [boardBackgroundsById, boardDetails])

  useEffect(() => {
    if (boardView !== 'picker') return
    Object.entries(effectiveBackgroundsById).forEach(([boardId, background]) => {
      if (!background?.imageUrl || !(background.mode || '').toLowerCase().includes('image')) return
      const key = `${boardId}:${background.imageUrl}`
      if (coverImageRequestsRef.current.has(key)) return
      coverImageRequestsRef.current.add(key)
      void boardController.downloadBoardBackgroundImage(boardId)
        .then((blob) => {
          const url = URL.createObjectURL(blob)
          coverObjectUrlsRef.current.push(url)
          setBoardCoverImagesById((previous) => ({ ...previous, [boardId]: { key, url } }))
        })
        .catch(() => {
          setBoardCoverImagesById((previous) => ({ ...previous, [boardId]: { key, url: '' } }))
        })
    })
  }, [boardController, boardView, effectiveBackgroundsById])

  useEffect(() => () => {
    coverObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  const boardCoversById = useMemo(() => {
    const covers: Record<string, BoardHubCover> = {}
    Object.entries(effectiveBackgroundsById).forEach(([boardId, background]) => {
      if (!background) return
      const mode = (background.mode || '').toLowerCase()
      const image = boardCoverImagesById[boardId]
      if (mode.includes('image') && image?.url && image.key === `${boardId}:${background.imageUrl}`) {
        covers[boardId] = { image: image.url }
        return
      }
      const hex = background.presetHex || PRESET_HEX_MAP[background.presetId] || ''
      if (hex && background.presetId !== 'preset_default') covers[boardId] = { color: hex }
    })
    return covers
  }, [boardCoverImagesById, effectiveBackgroundsById])

  const pickBoardLoading = isBootstrapLoading
  const kanbanBoardLoading = boardView === 'kanban' && Boolean(selectedBoardId) && isBoardLoading && !boardDetails
  const contentIsLoading = pickBoardLoading || kanbanBoardLoading
  const isTaskTab = activePlanTab === 'board' || activePlanTab === 'list'

  useEffect(() => {
    document.body.setAttribute('data-no-tooltip', '')
    return () => document.body.removeAttribute('data-no-tooltip')
  }, [])

  const hasKanbanColumns = boardView === 'kanban' && activePlanTab === 'board' && Boolean(boardDetails)
  useEffect(() => {
    const container = columnsScrollRef.current
    if (!hasKanbanColumns || !container) return
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || container.scrollWidth <= container.clientWidth) return
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
      if (!event.shiftKey) {
        let node = event.target instanceof HTMLElement ? event.target : null
        while (node && node !== container) {
          const overflowY = window.getComputedStyle(node).overflowY
          if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1) return
          node = node.parentElement
        }
      }
      event.preventDefault()
      container.scrollLeft += event.deltaY
    }
    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [contentIsLoading, hasKanbanColumns, filteredColumns.length])

  const openCreateColumnPrompt = () => {
    if (!selectedBoardId) return
    setColumnPrompt({
      mode: 'create',
      columnId: '',
      initialValue: '',
      initialKey: 'TODO',
      open: true,
    })
    setColumnPromptValue('')
    setColumnPromptKey('TODO')
  }
  return (
    <main
      ref={mainContainerRef}
      data-no-tooltip
      className={`custom-scrollbar min-h-0 flex-1 flex flex-col overflow-hidden ${AXIS_UI.fontFamily} ${boardView === 'kanban' ? '' : 'bg-[#F6F7F9]'}`}
      style={boardSurfaceStyle}
    >

      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 pb-6 pt-6 md:px-6 xl:px-8">
      {boardView === 'kanban' && boards.length > 0 ? (
        <header className="mb-3 flex h-10 shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={openBoardPicker}
            aria-label={bt('page.boards')}
            className={`-ml-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-[#586174] transition-colors duration-[120ms] hover:bg-[#EEF1F5] hover:text-[#17202E] ${AXIS_UI.focus}`}
          >
            <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2} />
          </button>
          <nav aria-label={bt('page.breadcrumbs')} className="flex min-w-0 flex-1 items-center gap-1 text-[14px]">
            <button
              type="button"
              onClick={openBoardPicker}
              className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] px-1.5 text-[#586174] transition-colors duration-[120ms] hover:bg-[#EEF1F5] hover:text-[#17202E] ${AXIS_UI.focus}`}
            >
              <LayoutGrid className="h-4 w-4" strokeWidth={1.8} />
              {bt('page.boards')}
            </button>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#9AA3B2]" strokeWidth={2} aria-hidden />
            <span aria-current="page" className="min-w-0 truncate px-1.5 text-[15px] font-medium text-[#17202E]">
              {boards.find((item) => item.id === selectedBoardId)?.name ?? boardDetails?.boardName ?? bt('page.board')}
            </span>
            {boardDetails ? (
              <span className="hidden shrink-0 whitespace-nowrap text-[13px] text-[#7B8494] md:inline">
                {bt('projects.tasks', { count: totalTasksCount })} · {bt('hub.members', { count: boardMembersAsUsers.length })}
              </span>
            ) : null}
          </nav>
          {boardDetails && currentUserRole !== 'member' ? (
            <button
              type="button"
              onClick={() => {
                const firstColumn = filteredColumns[0] ?? boardDetails.columns[0]
                if (!firstColumn) return
                setCreateTaskColumnId(firstColumn.id)
                setShowCreateTaskModal(true)
              }}
              className={`${AXIS_UI.primaryButton} ts-button--compact shrink-0`}
            >
              <MaterialSymbol name="add" size={18} color="currentColor" />
              {bt('page.newTask')}
            </button>
          ) : null}
        </header>
      ) : null}

      {boardView === 'kanban' && boards.length > 0 ? (
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3 border-b border-[#E2E5EA]">
        <nav className="flex h-10 min-w-0 items-stretch gap-5 overflow-x-auto [scrollbar-width:none]" aria-label={bt('page.sections')}>
          {boardDetails
            ? (
                [
                  ['tasks', bt('page.tabs.tasks')],
                  ['goals', bt('page.tabs.goals')],
                  ['projects', bt('page.tabs.projects')],
                  ['sprints', bt('page.tabs.sprints')],
                ] as const
              ).map(([value, label]) => {
                const isActive = value === 'tasks' ? isTaskTab : activePlanTab === value
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setActivePlanTab(value === 'tasks' ? taskView : value)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`${AXIS_UI.tab} !h-9 ${isActive ? AXIS_UI.tabActive : AXIS_UI.tabIdle}`}
                  >
                    {label}
                  </button>
                )
              })
            : null}
        </nav>
        {boardDetails ? (
          <div className="flex shrink-0 items-center gap-2 py-1.5">
            {isTaskTab ? (
              <ViewToggle
                value={activePlanTab === 'list' ? 'list' : 'board'}
                options={TASK_VIEW_OPTIONS}
                onChange={(view) => {
                  setTaskView(view)
                  setActivePlanTab(view)
                }}
                ariaLabel={bt('page.taskView')}
              />
            ) : null}
              <div className={`relative ${showToolsMenu ? 'z-[460]' : 'z-20'}`}>
                <button
                  type="button"
                  onClick={() => setShowToolsMenu((prev) => !prev)}
                  aria-label={bt('page.tools')}
                  aria-expanded={showToolsMenu}
                  className={`${AXIS_UI.iconButton} ${showToolsMenu ? '!border-[#2458D3] !bg-[#EDF2FF] !text-[#2458D3]' : ''}`}
                >
                  <MaterialSymbol name="more_horiz" size={18} color="currentColor" />
                </button>
                <BoardToolsMenu
                  open={showToolsMenu}
                  onClose={() => setShowToolsMenu(false)}
                  onOpenMembers={() => setShowMembersModal(true)}
                  onOpenCreateBoard={() => setShowCreateBoardModal(true)}
                  onOpenCreateColumn={() => {
                    setColumnPrompt({
                      mode: 'create',
                      columnId: '',
                      initialValue: '',
                      initialKey: 'TODO',
                      open: true,
                    })
                    setColumnPromptValue('')
                    setColumnPromptKey('TODO')
                  }}
                  onOpenCreateSprint={() => setShowCreateSprintModal(true)}
                  onOpenDeleteSprint={() => setShowDeleteSprintConfirm(true)}
                  onOpenBackground={() => {
                    setAdvancedPanelSection('background')
                    setShowAdvancedPanel(true)
                  }}
                  onOpenAlemAI={() => {
                    setShowAlemAiUploadModal(true)
                    setShowToolsMenu(false)
                  }}
                  onOpenLabels={() => {
                    setAdvancedPanelSection('labels')
                    setShowAdvancedPanel(true)
                  }}
                  onOpenEditBoard={() => {
                    setEditBoardValue(boardDetails?.boardName || '')
                    setShowEditBoardModal(true)
                  }}
                  onOpenDeleteBoard={() => {
                    setDeleteBoardTarget({ id: selectedBoardId, name: boardDetails?.boardName ?? bt('page.board') })
                    setShowDeleteBoardConfirm(true)
                  }}
                  onOpenStats={handleOpenStats}
                  isOwner={isBoardOwner}
                  canModifyBoard={currentUserRole !== 'member'}
                  canDeleteSprint={Boolean(selectedSprintId) && currentUserRole !== 'member'}
                />
              </div>
          </div>
        ) : null}
        </div>
      ) : null}

      {boardView === 'kanban' && boards.length > 0 && boardDetails && isTaskTab ? (
        <div className="relative z-[450] mb-4 flex shrink-0 flex-wrap items-center gap-2">
          <BoardFilters
            appearance="modern"
            boards={boards}
            users={boardMembersAsUsers}
            selectedBoardId={selectedBoardId}
            sprintOptions={boardDetails.sprints ?? []}
            selectedSprintId={selectedSprintId}
            search={search}
            filterUserId={filterUserId}
            filterAuthorId={filterAuthorId}
            filterStatus={filterStatus}
            filterDate={filterDate}
            onBoardChange={setSelectedBoardId}
            onSprintChange={setSelectedSprintId}
            onSearchChange={setSearch}
            onFilterUserChange={setFilterUserId}
            onFilterAuthorChange={setFilterAuthorId}
            onFilterStatusChange={setFilterStatus}
            onFilterDateChange={setFilterDate}
            filterLabelId={filterLabelId}
            labels={labels}
            onFilterLabelChange={setFilterLabelId}
            filterProjectId={activeProjectId}
            projects={boardDetails.projects ?? []}
            onFilterProjectChange={setFilterProjectId}
            onApplyFilters={() => {
              setToast(bt('toast.filtersApplied'))
            }}
            onResetFilters={handleResetFilters}
            boardName={boardDetails.boardName}
            totalTasks={totalTasksCount}
            isRefreshing={isRefreshing}
            onRefresh={() => { void handleRefresh() }}
          />
        </div>
      ) : null}

      {/* в”Ђв”Ђ Board area в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Loading skeleton */}
        {contentIsLoading ? (
          boardView === 'picker' ? (
            <BoardHubSkeleton />
          ) : (
            <div className="overflow-x-auto">
              <BoardSkeleton />
            </div>
          )
        ) : null}

        {!contentIsLoading && boardView === 'picker' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <nav
              className="people-section-tabs mb-4 flex w-full shrink-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-1"
              aria-label={bt('page.hubSections')}
            >
              {(
                [
                  ['boards', bt('page.boards'), 'grid_view'],
                  ['assignments', assignmentText('title'), 'assignment'],
                  ['ai', bt('page.hub.ai'), 'auto_awesome'],
                  ['stats', bt('page.hub.stats'), 'bar_chart'],
                ] as const
              ).map(([value, label, icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => selectPickerTab(value)}
                  aria-current={pickerTab === value ? 'page' : undefined}
                  className={`inline-flex min-h-10 shrink-0 grow items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors sm:grow-0 sm:px-5 ${
                    pickerTab === value
                      ? 'bg-white text-[#17202E] shadow-sm'
                      : 'text-[#475569] hover:bg-white/60 hover:text-[#17202E]'
                  }`}
                >
                  <MaterialSymbol name={icon} size={18} color="currentColor" />
                  <span>{label}</span>
                </button>
              ))}
            </nav>

            {/* Active section rendering */}
            <div
              className={`min-h-0 flex-1 ${
                pickerTab === 'ai' || pickerTab === 'stats'
                  ? 'custom-scrollbar overflow-y-auto'
                  : 'flex flex-col'
              }`}
            >
              {pickerTab === 'boards' && (
                <BoardProjectHub
                  boards={boards}
                  users={users}
                  currentUserId={currentUserId}
                  progressByBoardId={boardProgressById}
                  membersByBoardId={boardMembersById}
                  coversByBoardId={boardCoversById}
                  columnsByBoardId={boardColumnsById}
                  weekTasks={weekTasks}
                  highlightedBoardId={window.localStorage.getItem(LAST_BOARD_KEY) ?? undefined}
                  onSelectBoard={(boardId: string) => {
                    window.localStorage.setItem(LAST_BOARD_KEY, boardId)
                    setSelectedBoardId(boardId)
                    setBoardView('kanban')
                    syncBoardUrl(boardId)
                  }}
                  onInviteMembers={(boardId: string) => {
                    window.localStorage.setItem(LAST_BOARD_KEY, boardId)
                    setPendingMembersBoardId(boardId)
                    setSelectedBoardId(boardId)
                    setBoardView('kanban')
                    syncBoardUrl(boardId)
                  }}
                  onOpenTask={(boardId: string, taskId: string) => {
                    // Тот же путь, что и у ссылки на задачу: карточка откроется после загрузки доски
                    pendingRequestedTaskIdRef.current = taskId
                    window.localStorage.setItem(LAST_BOARD_KEY, boardId)
                    setSelectedBoardId(boardId)
                    setBoardView('kanban')
                    syncBoardUrl(boardId)
                  }}
                  onDeleteBoard={(boardId, boardName) => {
                    setDeleteBoardTarget({ id: boardId, name: boardName })
                    setShowDeleteBoardConfirm(true)
                  }}
                  onCreateBoard={() => setShowCreateBoardModal(true)}
                />
              )}

              {pickerTab === 'assignments' && <AssignmentsPanel />}

              {(pickerTab === 'ai' || pickerTab === 'stats') && boards.length === 0 ? (
                <BoardsEmptyState
                  title={bt('page.noAnalytics.title')}
                  description={bt('page.noAnalytics.text')}
                  onCreateBoard={() => setShowCreateBoardModal(true)}
                />
              ) : null}

              {pickerTab === 'ai' && boards.length > 0 && (
                <SingleBoardAiStatsSection
                  boards={boards}
                  users={users}
                  alemAiRepository={alemAiRepository}
                />
              )}

              {pickerTab === 'stats' && boards.length > 0 && (
                <div id="global-stats-section">
                  <MultiBoardStatsSection
                    boards={boards}
                    boardController={boardController}
                  />
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Kanban columns */}
        {!contentIsLoading && boardView === 'kanban' && activePlanTab === 'board' && boardDetails && filteredColumns.length > 0 ? (
          <section 
            ref={columnsScrollRef}
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-x-auto pb-2 [scrollbar-color:rgba(23,32,46,0.16)_transparent] [scrollbar-width:thin] md:flex-row md:items-stretch md:gap-4 md:pb-4"
          >

            {filteredColumns.map((column, columnIndex) => (
              <div
                key={column.id}
                ref={(node) => {
                  setColumnCardRef(column.id, node)
                }}
                className="flex h-full min-h-0 w-full transition-transform duration-200 ease-out md:h-full md:max-h-full md:w-auto"
              >
                <BoardColumnCard
                  column={column}
                  columnIndex={columnIndex}
                  assigneeNamesById={knownUsersById}
                  assigneeAvatarsById={knownUserAvatarsById}
                  activeDragColumnId={dragColumnId}
                  columnDropTargetId={columnDropTargetId}
                  onColumnDragHover={(columnId) => setColumnDropTargetId(columnId)}
                  onColumnDragHoverLeave={() => setColumnDropTargetId('')}
                  onColumnDrop={(targetColumnId) => {
                    void handleColumnDrop(targetColumnId)
                  }}
                  onTaskDrop={(targetColumnId) => {
                    void handleTaskDrop(targetColumnId)
                  }}
                  onTaskDragStart={(taskId, sourceColumnId) => {
                    setDragColumnId('')
                    setColumnDropTargetId('')
                    setDragTaskState({ taskId, sourceColumnId })
                  }}
                  onTaskDragEnd={() => setDragTaskState(null)}
                  isTaskDragging={!!dragTaskState}
                  onColumnDragStart={(columnId) => {
                    setDragTaskState(null)
                    setDragColumnId(columnId)
                  }}
                  onColumnDragEnd={() => {
                    setDragColumnId('')
                    setColumnDropTargetId('')
                  }}
                  onTaskOpen={(taskId) => {
                    void openTaskDetail(taskId)
                  }}
                  onCreateTask={(columnId) => {
                    setCreateTaskColumnId(columnId)
                    setShowCreateTaskModal(true)
                  }}
                  onRenameColumn={(columnId, currentName, currentKey) => {
                    setColumnPrompt({
                      mode: 'rename',
                      columnId,
                      initialValue: currentName,
                      initialKey: currentKey,
                      open: true,
                    })
                    setColumnPromptValue(currentName)
                    setColumnPromptKey(currentKey || 'TODO')
                  }}
                  onDeleteColumn={(columnId) => {
                    if (!selectedBoardId) return
                    setDeleteColumnId(columnId)
                  }}
                  canManageTasks={currentUserRole !== 'member'}
                  canManageColumn={currentUserRole !== 'member'}
                  onLoadMore={() => void handleLoadMoreTasks(column.id)}
                  hasMore={isFilterActive ? false : columnHasMore[column.id]}
                  isLoadingMore={columnLoadingMore[column.id]}
                />
              </div>
            ))}

            {/* Add column button */}
            {currentUserRole !== 'member' && (
              <div className="md:w-[288px] md:shrink-0">
                <button
                  type="button"
                  onClick={openCreateColumnPrompt}
                  className={`flex h-11 w-full items-center justify-center gap-2 rounded-[8px] border border-dashed border-[#C4C9D2] text-[14px] font-medium text-[#586174] transition-colors duration-[120ms] hover:border-[#2458D3] hover:bg-white hover:text-[#2458D3] ${AXIS_UI.focus}`}
                >
                  <MaterialSymbol name="add" size={18} color="currentColor" />
                  {bt('page.addColumn')}
                </button>
              </div>
            )}
          </section>
        ) : null}

        {/* Empty state */}
        {!contentIsLoading && boardView === 'kanban' && activePlanTab === 'board' && boardDetails && filteredColumns.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <div className="w-full max-w-sm rounded-[8px] border border-dashed border-[#C4C9D2] bg-white px-8 py-12 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#EDF2FF]">
                <MaterialSymbol name="view_kanban" size={20} color="#2458D3" />
              </div>
              <p className="text-[14px] font-semibold text-[#17202E]">{bt('page.noTasks')}</p>
              <p className="mt-1.5 text-[14px] leading-5 text-[#586174]">{bt('page.noTasksHint')}</p>
              <button
                type="button"
                onClick={() => {
                  if (!selectedBoardId) return
                  setColumnPrompt({ mode: 'create', columnId: '', initialValue: '', initialKey: '', open: true })
                  setColumnPromptValue('')
                }}
                className={`mt-5 ${AXIS_UI.primaryButton} !h-9 !px-4`}
              >
                <MaterialSymbol name="add" size={16} color="currentColor" />
                {bt('page.addColumn')}
              </button>
            </div>
          </div>
        ) : null}

        {/* Planning Views */}
        {!contentIsLoading && boardView === 'kanban' && activePlanTab !== 'board' && boardDetails && (
          <div className="min-h-0 w-full flex-1 overflow-y-auto pb-6">
            {activePlanTab === 'list' && (
              <section aria-label={bt('list.title')}>
                {filteredTaskRows.length > 0 ? (
                  <div className="@container overflow-hidden rounded-[10px] border border-[#E6EAF1] bg-white">
                    <div className={`${TASK_ROW_GRID} h-10 whitespace-nowrap border-b border-[#E6EAF1] bg-[#FAFBFC] text-[13px] font-medium text-[#586174]`}>
                      <span>{bt('task')}</span>
                      <span className="hidden @[560px]:block">{bt('list.status')}</span>
                      <span className="hidden @[820px]:block">{bt('list.priority')}</span>
                      <span className="hidden @[820px]:block">{bt('list.assignees')}</span>
                      <span>{bt('list.due')}</span>
                    </div>
                    <div className="divide-y divide-[#EEF0F3]">
                      {filteredTaskRows.map(({ task, column }) => {
                        const done = isDoneColumn(column.key)
                        const assignees = task.assigneeIds.map((id) => ({
                          id,
                          name: knownUsersById.get(id) ?? bt('userNumber', { id }),
                          avatarUrl: knownUserAvatarsById.get(id),
                        }))

                        return (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => void openTaskDetail(task.id)}
                            className={`${TASK_ROW_GRID} min-h-14 w-full py-2 text-left transition-colors duration-[120ms] hover:bg-[#F6F7F9] ${AXIS_UI.focus}`}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-[14px] font-medium leading-5 text-[#17202E]">{task.title}</span>
                              {task.taskKey ? (
                                <span className="mt-0.5 block text-[12px] leading-4 tabular-nums text-[#586174]">{task.taskKey}</span>
                              ) : null}
                            </span>
                            <span className="hidden min-w-0 @[560px]:block">
                              <span className={`inline-flex h-6 max-w-full items-center truncate rounded-[6px] px-2 text-[12px] font-medium ${done ? AXIS_TONE_CLASS.success : AXIS_TONE_CLASS.neutral}`}>
                                {column.name}
                              </span>
                            </span>
                            <span className="hidden @[820px]:block"><PriorityChip priority={task.priority} /></span>
                            <span className="hidden min-w-0 items-center gap-2 @[820px]:flex">
                              {assignees.length > 0 ? (
                                <>
                                  <span className="flex shrink-0 items-center -space-x-1">
                                    {assignees.slice(0, 3).map((user) => (
                                      <span key={user.id} className="flex rounded-full ring-2 ring-white">
                                        <AxisAvatar initials={initialsOf(user.name)} src={user.avatarUrl} size={24} seed={user.id} />
                                      </span>
                                    ))}
                                  </span>
                                  <span className="truncate text-[14px] text-[#17202E]">
                                    {assignees.length === 1 ? assignees[0].name : bt('list.assigneesCount', { count: assignees.length })}
                                  </span>
                                </>
                              ) : (
                                <span className="text-[14px] text-[#586174]">{bt('list.unassigned')}</span>
                              )}
                            </span>
                            <span>
                              {task.dueAt ? (
                                <DueDate dueAt={task.dueAt} dueAtLabel={task.dueAtLabel} done={done} />
                              ) : (
                                <span className="text-[12px] leading-4 text-[#586174]">{bt('list.noDue')}</span>
                              )}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <PlanEmptyState icon="search" title={bt('list.emptyTitle')} text={bt('list.emptyText')} />
                )}
              </section>
            )}

            {activePlanTab === 'goals' && (
              <section>
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className={AXIS_UI.h3}>{bt('goals.title')}</h2>
                    <p className="mt-0.5 text-[14px] leading-5 text-[#586174]">{bt('goals.subtitle')}</p>
                  </div>
                  {currentUserRole !== 'member' ? (
                    <button
                      type="button"
                      onClick={() => setShowCreateGoalModal(true)}
                      disabled={isMutating}
                      className={AXIS_UI.secondaryButton}
                    >
                      <MaterialSymbol name="add" size={16} color="currentColor" />
                      {bt('goals.create')}
                    </button>
                  ) : null}
                </div>

                {boardDetails.goals && boardDetails.goals.length > 0 ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-5">
                    {boardDetails.goals.map((goal) => {
                      const totalTasks = goal.taskCount
                      const completionPercent = Math.max(0, Math.min(100, Math.round(goal.completionPercent)))
                      const predictionLabel = goal.predictionLabel ?? bt('goals.needsStructure')
                      const nextActionLabel = goal.nextActionLabel ?? bt('goals.addFirstTask')

                      return (
                        <article key={goal.id} className="flex flex-col rounded-[12px] border border-[#E2E5EA] bg-white p-5">
                          <div className="flex items-start justify-between gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] bg-[#EDF2FF] text-[#2458D3]" aria-hidden>
                              <MaterialSymbol name="track_changes" size={20} color="currentColor" />
                            </span>
                            {currentUserRole !== 'member' ? (
                              <div className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => setGoalEditState({
                                    open: true,
                                    goalId: goal.id,
                                    name: goal.name,
                                    description: goal.description ?? '',
                                  })}
                                  className={AXIS_UI.ghostIconButton}
                                  aria-label={bt('goals.editNamed', { name: goal.name })}
                                >
                                  <MaterialSymbol name="edit" size={16} color="currentColor" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEntityDeleteTarget({ kind: 'goal', id: goal.id, name: goal.name })}
                                  className={`${AXIS_UI.ghostIconButton} hover:!bg-[#FFF0F0] hover:!text-[#C03437]`}
                                  aria-label={bt('goals.deleteNamed', { name: goal.name })}
                                >
                                  <MaterialSymbol name="delete" size={16} color="currentColor" />
                                </button>
                              </div>
                            ) : null}
                          </div>

                          <h3 className="mt-4 line-clamp-2 text-[16px] font-semibold leading-6 text-[#17202E]">{goal.name}</h3>
                          <p className="mt-1 line-clamp-2 min-h-10 text-[14px] leading-5 text-[#586174]">
                            {goal.description?.trim() || bt('goals.noDescription')}
                          </p>

                          <div className="mt-5">
                            <div className="mb-2 flex items-center justify-between text-[12px] leading-4 text-[#586174]">
                              <span className="tabular-nums">{bt('goals.progress', { done: goal.completedTasks, total: totalTasks })}</span>
                              <span className="font-medium tabular-nums text-[#17202E]">{completionPercent}%</span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-[#E2E5EA]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completionPercent}>
                              <div className="h-full rounded-full bg-[#2458D3] transition-[width] duration-200" style={{ width: `${completionPercent}%` }} />
                            </div>
                          </div>

                          <dl className="mt-5 grid grid-cols-3 gap-2 rounded-[8px] bg-[#F6F7F9] p-3">
                            <div className="min-w-0">
                              <dt className="text-[12px] leading-4 text-[#586174]">{bt('goals.inProgress')}</dt>
                              <dd className="mt-1 text-[16px] font-semibold leading-5 tabular-nums text-[#17202E]">{goal.activeTasks}</dd>
                            </div>
                            <div className="min-w-0">
                              <dt className="text-[12px] leading-4 text-[#586174]">{bt('goals.overdue')}</dt>
                              <dd className={`mt-1 text-[16px] font-semibold leading-5 tabular-nums ${goal.overdueTasks > 0 ? 'text-[#C03437]' : 'text-[#17202E]'}`}>{goal.overdueTasks}</dd>
                            </div>
                            <div className="min-w-0">
                              <dt className="text-[12px] leading-4 text-[#586174]">{bt('page.tabs.projects')}</dt>
                              <dd className="mt-1 text-[16px] font-semibold leading-5 tabular-nums text-[#17202E]">{goal.projectCount}</dd>
                            </div>
                          </dl>

                          <div className="mt-5 border-t border-[#E2E5EA] pt-4">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[12px] leading-4 text-[#586174]">{bt('goals.nextStep')}</span>
                              <span className={`inline-flex h-6 shrink-0 items-center rounded-[6px] px-2 text-[12px] font-medium ${AXIS_TONE_CLASS.action}`}>
                                {predictionLabel}
                              </span>
                            </div>
                            <p className="mt-2 text-[14px] font-medium leading-5 text-[#17202E]">{nextActionLabel}</p>
                            <p className="mt-1 truncate text-[12px] leading-4 text-[#586174]">
                              {goal.topProjectName ? bt('goals.topProject', { name: goal.topProjectName }) : bt('goals.noTopProject')} · {bt('goals.sprints', { count: goal.sprintCount })}
                            </p>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                ) : (
                  <PlanEmptyState icon="track_changes" title={bt('goals.emptyTitle')} text={bt('goals.emptyText')} />
                )}
              </section>
            )}

            {activePlanTab === 'projects' && (
              <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="min-w-0">
                  <div className="mb-4">
                    <h2 className={AXIS_UI.h3}>{bt('projects.title')}</h2>
                    <p className="mt-0.5 text-[14px] leading-5 text-[#586174]">{bt('projects.subtitle')}</p>
                  </div>

                  {boardDetails.projects && boardDetails.projects.length > 0 ? (
                    <ul className="divide-y divide-[#E2E5EA] overflow-hidden rounded-[12px] border border-[#E2E5EA] bg-white">
                      {boardDetails.projects.map((project) => {
                        const relatedGoal = boardDetails.goals?.find((g) => g.id === project.goalId)
                        return (
                          <li key={project.id} className="flex items-start gap-4 px-5 py-4">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] bg-[#EDF2FF] text-[#2458D3]" aria-hidden>
                              <MaterialSymbol name="account_tree" size={20} color="currentColor" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <h3 className="truncate text-[14px] font-semibold leading-5 text-[#17202E]">{project.name}</h3>
                              {project.description ? (
                                <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-[14px] leading-5 text-[#586174]">{project.description}</p>
                              ) : null}
                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <span className={`inline-flex h-6 items-center gap-1 rounded-[6px] px-2 text-[12px] font-medium tabular-nums ${AXIS_TONE_CLASS.neutral}`}>
                                  <MaterialSymbol name="task_alt" size={14} color="currentColor" />
                                  {bt('projects.tasks', { count: project.taskCount })}
                                </span>
                                {relatedGoal ? (
                                  <span className={`inline-flex h-6 max-w-full items-center gap-1 rounded-[6px] px-2 text-[12px] font-medium ${AXIS_TONE_CLASS.action}`}>
                                    <MaterialSymbol name="track_changes" size={14} color="currentColor" />
                                    <span className="truncate">{relatedGoal.name}</span>
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            {currentUserRole !== 'member' ? (
                              <div className="flex shrink-0 items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => setProjectEditState({
                                    open: true,
                                    projectId: project.id,
                                    name: project.name,
                                    description: project.description ?? '',
                                    goalId: project.goalId ?? '',
                                    status: project.status || 'active',
                                  })}
                                  className={AXIS_UI.ghostIconButton}
                                  aria-label={bt('projects.editNamed', { name: project.name })}
                                >
                                  <MaterialSymbol name="edit" size={16} color="currentColor" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEntityDeleteTarget({ kind: 'project', id: project.id, name: project.name })}
                                  className={`${AXIS_UI.ghostIconButton} hover:!bg-[#FFF0F0] hover:!text-[#C03437]`}
                                  aria-label={bt('projects.deleteNamed', { name: project.name })}
                                >
                                  <MaterialSymbol name="delete" size={16} color="currentColor" />
                                </button>
                              </div>
                            ) : null}
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <PlanEmptyState icon="account_tree" title={bt('projects.emptyTitle')} text={bt('projects.emptyText')} />
                  )}
                </div>

                <aside className="h-fit rounded-[12px] border border-[#E2E5EA] bg-white p-5 xl:sticky xl:top-0">
                  <h3 className="text-[16px] font-semibold leading-6 text-[#17202E]">{bt('projects.new')}</h3>
                  <form onSubmit={handleCreateProjectSubmit} className="mt-4 flex flex-col gap-4">
                    <label className="block">
                      <span className="mb-1.5 block text-[14px] font-medium leading-5 text-[#17202E]">{bt('name')}</span>
                      <input
                        type="text"
                        required
                        placeholder={bt('projects.namePlaceholder')}
                        value={projectFormName}
                        onChange={(e) => setProjectFormName(e.target.value)}
                        className={PLAN_FIELD}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[14px] font-medium leading-5 text-[#17202E]">
                        {bt('description')} <span className="font-normal text-[#586174]">{bt('optional')}</span>
                      </span>
                      <textarea
                        rows={3}
                        placeholder={bt('projects.descriptionPlaceholder')}
                        value={projectFormDescription}
                        onChange={(e) => setProjectFormDescription(e.target.value)}
                        className={`${PLAN_FIELD} !h-auto resize-none py-2.5`}
                      />
                    </label>
                    <div>
                      <span className="mb-1.5 block text-[14px] font-medium leading-5 text-[#17202E]">
                        {bt('goal')} <span className="font-normal text-[#586174]">{bt('optional')}</span>
                      </span>
                      <AppSelect
                        value={projectFormGoalId}
                        onChange={setProjectFormGoalId}
                        options={[
                          { value: '', label: bt('projects.noGoal') },
                          ...(boardDetails.goals ?? []).map((goal) => ({ value: goal.id, label: goal.name })),
                        ]}
                        showButtonAvatar={false}
                        showOptionAvatar={false}
                        ariaLabel={bt('projects.goal')}
                        buttonClassName="!h-11 !rounded-[6px] !border-[#7B8494] !bg-white !text-[14px] !text-[#17202E]"
                      />
                    </div>
                    <button type="submit" disabled={isMutating} className={`${AXIS_UI.primaryButton} w-full`}>
                      <MaterialSymbol name="add" size={18} color="currentColor" />
                      {bt('projects.create')}
                    </button>
                  </form>
                </aside>
              </section>
            )}

            {activePlanTab === 'sprints' && (
              <section>
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className={AXIS_UI.h3}>{bt('sprints.title')}</h2>
                    <p className="mt-0.5 text-[14px] leading-5 text-[#586174]">{bt('sprints.subtitle')}</p>
                  </div>
                  {currentUserRole !== 'member' ? (
                    <button type="button" onClick={() => setShowCreateSprintModal(true)} className={AXIS_UI.secondaryButton}>
                      <MaterialSymbol name="add" size={16} color="currentColor" />
                      {bt('sprints.create')}
                    </button>
                  ) : null}
                </div>

                {boardDetails.sprints && boardDetails.sprints.length > 0 ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-5">
                    {boardDetails.sprints.map((sprint) => {
                      const relatedGoal = boardDetails.goals?.find((goal) => goal.id === sprint.goalId)
                      const relatedProject = boardDetails.projects?.find((project) => project.id === sprint.projectId)
                      const status = getSprintStatusMeta(sprint.status)
                      const period = formatSprintPeriod(sprint.startDate, sprint.endDate)

                      return (
                        <article key={sprint.id} className="flex flex-col rounded-[12px] border border-[#E2E5EA] bg-white p-5">
                          <div className="flex items-start justify-between gap-3">
                            <h3 className="line-clamp-2 text-[16px] font-semibold leading-6 text-[#17202E]">{sprint.name}</h3>
                            <span className={`inline-flex h-6 shrink-0 items-center rounded-[6px] px-2 text-[12px] font-medium ${AXIS_TONE_CLASS[status.tone]}`}>
                              {status.label}
                            </span>
                          </div>
                          <p className="mt-1 flex items-center gap-1.5 text-[14px] leading-5 tabular-nums text-[#586174]">
                            <MaterialSymbol name="calendar_today" size={16} color="currentColor" />
                            {period}
                          </p>

                          {relatedGoal || relatedProject ? (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {relatedGoal ? (
                                <span className={`inline-flex h-6 max-w-full items-center gap-1 rounded-[6px] px-2 text-[12px] font-medium ${AXIS_TONE_CLASS.neutral}`}>
                                  <MaterialSymbol name="track_changes" size={14} color="currentColor" />
                                  <span className="truncate">{relatedGoal.name}</span>
                                </span>
                              ) : null}
                              {relatedProject ? (
                                <span className={`inline-flex h-6 max-w-full items-center gap-1 rounded-[6px] px-2 text-[12px] font-medium ${AXIS_TONE_CLASS.neutral}`}>
                                  <MaterialSymbol name="account_tree" size={14} color="currentColor" />
                                  <span className="truncate">{relatedProject.name}</span>
                                </span>
                              ) : null}
                            </div>
                          ) : null}

                          <div className="flex-1" />
                          {currentUserRole !== 'member' ? (
                            <div className="mt-4 flex items-center justify-end gap-0.5 border-t border-[#E2E5EA] pt-3">
                              <button
                                type="button"
                                onClick={() => setSprintEditState({
                                  open: true,
                                  sprintId: sprint.id,
                                  name: sprint.name,
                                  goalId: sprint.goalId ?? '',
                                  projectId: sprint.projectId ?? '',
                                  status: sprint.status || 'planned',
                                  startDate: sprint.startDate ? sprint.startDate.slice(0, 10) : '',
                                  endDate: sprint.endDate ? sprint.endDate.slice(0, 10) : '',
                                })}
                                className={AXIS_UI.ghostIconButton}
                                aria-label={bt('sprints.editNamed', { name: sprint.name })}
                              >
                                <MaterialSymbol name="edit" size={16} color="currentColor" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEntityDeleteTarget({ kind: 'sprint', id: sprint.id, name: sprint.name })}
                                className={`${AXIS_UI.ghostIconButton} hover:!bg-[#FFF0F0] hover:!text-[#C03437]`}
                                aria-label={bt('sprints.deleteNamed', { name: sprint.name })}
                              >
                                <MaterialSymbol name="delete" size={16} color="currentColor" />
                              </button>
                            </div>
                          ) : null}
                        </article>
                      )
                    })}
                  </div>
                ) : (
                  <PlanEmptyState icon="timer" title={bt('sprints.emptyTitle')} text={bt('sprints.emptyText')} />
                )}
              </section>
            )}
          </div>
        )}

        {/* No board state */}
        {!contentIsLoading && boardView === 'kanban' && !boardDetails && !isBootstrapLoading && boards.length === 0 ? (
          <BoardsEmptyState onCreateBoard={() => setShowCreateBoardModal(true)} />
        ) : null}
      </div>
      </div>

      {showAdvancedPanel && boardDetails ? (
        <div className="fixed inset-0 z-[800] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-[#0A1628]/40 backdrop-blur-sm transition-opacity animate-in fade-in duration-300"
            onClick={() => setShowAdvancedPanel(false)}
          />
          
          {/* Modal Content */}
          <div className="relative flex h-auto max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-[#D7E2F0] bg-[#F7FAFF] shadow-[0_24px_60px_rgba(10,22,40,0.3)] animate-in zoom-in-95 duration-200">
            <header className="flex items-center justify-between border-b border-[#E1EAF6] bg-white px-6 py-4">
              <div className="min-w-0">
                <p className="text-lg font-bold text-[#10233F]">{bt('page.tools')}</p>
                <p className="text-[11px] text-[#6F86A8]">{bt('tools.subtitle')}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAdvancedPanel(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#DDE5F2] bg-white text-[#4D6486] transition hover:bg-[#F3F7FE] hover:text-[#2458D3]"
                aria-label={bt('tools.close')}
              >
                <MaterialSymbol name="close" size={20} color="currentColor" />
              </button>
            </header>

            <div className="overflow-y-auto p-6 custom-scrollbar">
              <BoardAdvancedPanel
                selectedTask={selectedTaskEntity}
                quickActionTasks={quickActionTasks}
                labels={labels}
                backgroundMode={boardDetails.background?.mode ?? ''}
                backgroundPresetId={boardDetails.background?.presetId ?? 'preset_default'}
                backgroundPresetHex={boardDetails.background?.presetHex ?? ''}
                backgroundImageUrl={boardDetails.background?.imageUrl ?? ''}
                canManageBackground={isBoardOwner}
                isBackgroundLoading={isBackgroundLoading}
                isLabelsLoading={isLabelsLoading}
                isCommentsLoading={isCommentsLoading}
                activeSection={advancedPanelSection}
                onBackgroundPreset={async (presetId) => {
                  if (!selectedBoardId || !boardDetails || !presetId) return

                  const previous = boardDetails
                  setIsBackgroundLoading(true)
                  setBoardDetails({
                    ...boardDetails,
                    background: {
                      imageUrl: '',
                      mode: 'preset_color',
                      presetHex: PRESET_HEX_MAP[presetId] ?? boardDetails.background?.presetHex ?? '',
                      presetId,
                    },
                  })

                  try {
                    await boardController.setBoardBackgroundPreset(selectedBoardId, presetId)
                    await loadBoard(selectedBoardId, { force: true, silent: true })
                    setToast(bt('toast.backgroundUpdated'))
                  } catch (err) {
                    setBoardDetails(previous)
                    setApiError(err, bt('errors.backgroundPreset'))
                  } finally {
                    setIsBackgroundLoading(false)
                  }
                }}
                onBackgroundUpload={async (file) => {
                  if (!selectedBoardId) return
                  await runAdvanced(async () => {
                    await boardController.uploadBoardBackgroundImage(selectedBoardId, file)
                    await loadBoard(selectedBoardId, { force: true, silent: true })
                    setToast(bt('toast.backgroundUploaded'))
                  }, bt('errors.backgroundUpload'), setIsBackgroundLoading)
                }}
                onBackgroundDelete={async () => {
                  if (!selectedBoardId) return
                  await runAdvanced(async () => {
                    await boardController.deleteBoardBackgroundImage(selectedBoardId)
                    await loadBoard(selectedBoardId, { force: true, silent: true })
                    setToast(bt('toast.backgroundDeleted'))
                  }, bt('errors.backgroundDelete'), setIsBackgroundLoading)
                }}
                onRestoreBackgroundPreset={async () => {
                  if (!selectedBoardId) return
                  await runAdvanced(async () => {
                    await boardController.setBoardBackgroundPreset(selectedBoardId, boardDetails.background?.presetId || 'preset_default')
                    await loadBoard(selectedBoardId, { force: true, silent: true })
                    setToast(bt('toast.presetRestored'))
                  }, bt('errors.presetRestore'), setIsBackgroundLoading)
                }}
                onCreateLabel={async (payload) => {
                  if (!selectedBoardId) return
                  await runAdvanced(async () => {
                    await boardController.createBoardLabel(selectedBoardId, payload)
                    setLabels(await boardController.loadBoardLabels(selectedBoardId))
                    setToast(bt('toast.labelCreated'))
                  }, bt('errors.createLabel'), setIsLabelsLoading)
                }}
                onDeleteLabel={async (labelId) => {
                  if (!selectedBoardId) return
                  await runAdvanced(async () => {
                    await boardController.deleteBoardLabel(selectedBoardId, labelId)
                    setLabels(await boardController.loadBoardLabels(selectedBoardId))
                    await loadBoard(selectedBoardId, { force: true, silent: true })
                    setToast(bt('toast.labelDeleted'))
                  }, bt('errors.deleteLabel'), setIsLabelsLoading)
                }}
                onAddTaskLabel={async (labelId) => {
                  if (!selectedBoardId || !selectedTaskId) return
                  await runAdvanced(async () => {
                    await boardController.addTaskLabel(selectedBoardId, selectedTaskId, labelId)
                    await loadBoard(selectedBoardId, { force: true, silent: true })
                    setToast(bt('toast.labelAdded'))
                  }, bt('errors.addLabel'), setIsLabelsLoading)
                }}
                onRemoveTaskLabel={async (labelId) => {
                  if (!selectedBoardId || !selectedTaskId) return
                  await runAdvanced(async () => {
                    await boardController.removeTaskLabel(selectedBoardId, selectedTaskId, labelId)
                    await loadBoard(selectedBoardId, { force: true, silent: true })
                    setToast(bt('toast.labelRemoved'))
                  }, bt('errors.removeLabel'), setIsLabelsLoading)
                }}
                onUpdateTaskStatus={async (taskId, status) => {
                  if (!selectedBoardId || !taskId) return
                  await runAdvanced(async () => {
                    await boardController.updateTaskStatus(selectedBoardId, taskId, status)
                    await loadBoard(selectedBoardId, { force: true, silent: true })
                    setToast(bt('toast.taskStatusUpdated'))
                  }, bt('errors.updateTaskStatus'), setIsCommentsLoading)
                }}
                onUploadAndAttachFile={async (taskId, file) => {
                  if (!selectedBoardId || !taskId) return
                  await runAdvanced(async () => {
                    const uploaded = await boardController.uploadKanbanFile(file)
                    await boardController.attachExistingFile(selectedBoardId, taskId, uploaded.fileId)
                    await loadBoard(selectedBoardId, { force: true, silent: true })
                    setToast(bt('toast.fileUploadedAttached'))
                  }, bt('errors.attachFile'), setIsCommentsLoading)
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      <CreateBoardModal
        open={showCreateBoardModal}
        isSubmitting={isMutating}
        onClose={() => setShowCreateBoardModal(false)}
        onSubmit={({ name, background }) => {
          void (async () => {
            setIsMutating(true)
            try {
              const created = await boardController.createBoard(name)
              let backgroundFailed = false
              try {
                if (background.type === 'image') {
                  await boardController.uploadBoardBackgroundImage(created.id, background.file)
                } else if (background.presetId !== 'preset_default') {
                  await boardController.setBoardBackgroundPreset(created.id, background.presetId)
                }
              } catch {
                backgroundFailed = true
              }
              setShowCreateBoardModal(false)
              await loadBootstrap(true)
              setToast(backgroundFailed ? bt('toast.boardCreatedNoBackground') : bt('toast.boardCreated'))
            } catch (error) {
              setApiError(error, bt('errors.createBoard'))
            } finally {
              setIsMutating(false)
            }
          })()
        }}
      />

      <CreateTaskModal
        open={showCreateTaskModal}
        users={boardMembersAsUsers}
        sprints={boardDetails?.sprints ?? []}
        goals={boardDetails?.goals ?? []}
        projects={boardDetails?.projects ?? []}
        allLabels={labels}
        availableParentTasks={allBoardTasks}
        isSubmitting={isMutating}
        value={createTaskValue}
        uploadedAttachments={uploadedFilesForNewTask}
        onClose={() => {
          setShowCreateTaskModal(false)
          resetTaskCreate()
          setAiTaskAssistResult(null)
        }}
        onChange={setCreateTaskValue}
        onUpload={async (file) => {
          const { fileId } = await boardController.uploadKanbanFile(file)
          setUploadedFilesForNewTask((prev) => [...prev, { id: fileId, fileName: file.name }])
          setCreateTaskValue((prev) => ({
            ...prev,
            attachmentFileIds: [...prev.attachmentFileIds, fileId],
          }))
        }}
        onRemoveAttachment={(id) => {
          setUploadedFilesForNewTask((prev) => prev.filter((f) => f.id !== id))
          setCreateTaskValue((prev) => ({
            ...prev,
            attachmentFileIds: prev.attachmentFileIds.filter((fid) => fid !== id),
          }))
        }}
        onSubmit={() => {
          if (!selectedBoardId || !createTaskValue.title.trim()) return
          void (async () => {
            setIsMutating(true)
            try {
              const column = boardDetails?.columns.find((c) => c.id === createTaskColumnId)
              if (!column) {
                setApiError(new Error(bt('errors.columnNotFound')), bt('errors.columnGone'))
                setShowCreateTaskModal(false)
                resetTaskCreate()
                return
              }
              const columnStatus = normalizeStatusKey(column?.key)

              const newTask = await boardController.createTask(selectedBoardId, {
                title: createTaskValue.title,
                description: createTaskValue.description,
                priority: createTaskValue.priority,
                sprintId: createTaskValue.sprintId || undefined,
                goalId: createTaskValue.goalId || undefined,
                projectId: createTaskValue.projectId || undefined,
                assigneeIds: createTaskValue.assigneeIds.length > 0 ? createTaskValue.assigneeIds : undefined,
                dueAt: createTaskValue.dueAt || undefined,
                parentId: createTaskValue.parentId || undefined,
                attachmentFileIds: createTaskValue.attachmentFileIds.length > 0 ? createTaskValue.attachmentFileIds : undefined,
                columnId: createTaskColumnId || undefined,
                status: (columnStatus && ['TODO', 'IN_PROGRESS', 'TEST', 'DONE'].includes(columnStatus)) ? columnStatus : undefined,
              })

              // Handle labels after task creation
              if (createTaskValue.labelIds.length > 0) {
                await Promise.all(
                  createTaskValue.labelIds.map((lid) => boardController.addTaskLabel(selectedBoardId, newTask.id, lid))
                )
              }

              await loadBoard(selectedBoardId, { force: true, silent: true })
              setToast(bt('toast.taskCreated'))
              setShowCreateTaskModal(false)
              resetTaskCreate()
              setAiTaskAssistResult(null)
            } catch (error) {
              setApiError(error, bt('errors.createTask'))
            } finally {
              setIsMutating(false)
            }
          })()
        }}
        onCreateBoardLabel={async (payload) => {
          if (!selectedBoardId) return
          await runAdvanced(async () => {
            await boardController.createBoardLabel(selectedBoardId, payload)
            setLabels(await boardController.loadBoardLabels(selectedBoardId))
            setToast(bt('toast.labelCreated'))
          }, bt('errors.createLabel'), setIsLabelsLoading)
        }}
        onAiAssist={handleTaskAiAssist}
        isAiProcessing={isAlemAiProcessing}
        onAnalyzeAssigneeWorkload={
          selectedBoardId
            ? async (payload) =>
                alemAiRepository.getKanbanAssigneeAdvice(selectedBoardId, {
                  title: payload.title,
                  description: payload.description,
                  user_id: payload.userId,
                  team_role: payload.teamRole,
                })
            : undefined
        }
      />

      {aiTaskAssistResult && (
        <AiTaskAssistModal
          open={!!aiTaskAssistResult}
          onClose={() => setAiTaskAssistResult(null)}
          onApply={handleApplyAiTaskAssist}
          original={{
            title: showCreateTaskModal ? createTaskValue.title : (selectedTaskEntity?.title || ''),
            description: showCreateTaskModal ? createTaskValue.description : (selectedTaskEntity?.description || ''),
            priority: (showCreateTaskModal ? createTaskValue.priority : selectedTaskEntity?.priority) as any,
            sprintId: showCreateTaskModal ? createTaskValue.sprintId : (selectedTaskEntity?.sprintId || ''),
            assigneeIds: showCreateTaskModal ? createTaskValue.assigneeIds : (selectedTaskEntity?.assigneeIds || []),
            dueAt: showCreateTaskModal ? createTaskValue.dueAt : (selectedTaskEntity?.dueAt ? selectedTaskEntity.dueAt.slice(0, 10) : ''),
          }}
          suggested={aiTaskAssistResult}
          sprints={boardDetails?.sprints || []}
          users={modalUsers}
        />
      )}

      <CreateSprintModal
        open={showCreateSprintModal}
        value={createSprintValue}
        goals={boardDetails?.goals ?? []}
        projects={boardDetails?.projects ?? []}
        isSubmitting={isMutating}
        onClose={() => setShowCreateSprintModal(false)}
        onChange={setCreateSprintValue}
        onSubmit={() => {
          if (!selectedBoardId || !createSprintValue.name.trim()) return
          void (async () => {
            setIsMutating(true)
            try {
              const createdSprint = await boardController.createSprint(selectedBoardId, {
                name: createSprintValue.name.trim(),
                goalId: createSprintValue.goalId || undefined,
                projectId: createSprintValue.projectId || undefined,
                status: createSprintValue.status,
                startDate: createSprintValue.startDate ? new Date(createSprintValue.startDate).toISOString() : undefined,
                endDate: createSprintValue.endDate ? new Date(createSprintValue.endDate).toISOString() : undefined,
              })
              persistSprintLinkOverride(selectedBoardId, createdSprint.id, {
                goalId: createdSprint.goalId || createSprintValue.goalId || undefined,
                projectId: createdSprint.projectId || createSprintValue.projectId || undefined,
              })
              await loadBoard(selectedBoardId, { force: true, silent: true })
              setCreateSprintValue({ name: '', goalId: '', projectId: '', status: 'planned', startDate: '', endDate: '' })
              setShowCreateSprintModal(false)
              setToast(bt('toast.sprintCreated'))
            } catch (error) {
              setApiError(error, bt('errors.createSprint'))
            } finally {
              setIsMutating(false)
            }
          })()
        }}
      />

      <GoalFormModal
        open={showCreateGoalModal}
        title={bt('goals.create')}
        confirmText={bt('create')}
        value={{ name: goalFormName, description: goalFormDescription }}
        isSubmitting={isMutating}
        onChange={(next) => {
          setGoalFormName(next.name)
          setGoalFormDescription(next.description)
        }}
        onClose={() => {
          setShowCreateGoalModal(false)
          setGoalFormName('')
          setGoalFormDescription('')
        }}
        onSubmit={() => {
          if (isMutating) return
          void handleCreateGoalSubmit()
        }}
      />

      <GoalFormModal
        open={goalEditState.open}
        title={bt('goals.edit')}
        confirmText={bt('save')}
        value={{ name: goalEditState.name, description: goalEditState.description }}
        isSubmitting={isMutating}
        onChange={(next) => setGoalEditState((prev) => ({ ...prev, name: next.name, description: next.description }))}
        onClose={() => setGoalEditState({ open: false, goalId: '', name: '', description: '' })}
        onSubmit={() => {
          if (isMutating) return
          void handleUpdateGoalSubmit()
        }}
      />

      <ProjectFormModal
        open={projectEditState.open}
        title={bt('projects.edit')}
        confirmText={bt('save')}
        value={{
          name: projectEditState.name,
          description: projectEditState.description,
          goalId: projectEditState.goalId,
          status: projectEditState.status,
        }}
        goals={boardDetails?.goals ?? []}
        isSubmitting={isMutating}
        onChange={(next) => setProjectEditState((prev) => ({
          ...prev,
          name: next.name,
          description: next.description,
          goalId: next.goalId,
          status: next.status,
        }))}
        onClose={() => setProjectEditState({ open: false, projectId: '', name: '', description: '', goalId: '', status: 'active' })}
        onSubmit={() => {
          if (isMutating) return
          void handleUpdateProjectSubmit()
        }}
      />

      <CreateSprintModal
        open={sprintEditState.open}
        title={bt('sprints.edit')}
        confirmText={bt('save')}
        value={{
          name: sprintEditState.name,
          goalId: sprintEditState.goalId,
          projectId: sprintEditState.projectId,
          status: sprintEditState.status,
          startDate: sprintEditState.startDate,
          endDate: sprintEditState.endDate,
        }}
        goals={boardDetails?.goals ?? []}
        projects={boardDetails?.projects ?? []}
        isSubmitting={isMutating}
        onClose={() => setSprintEditState({ open: false, sprintId: '', name: '', goalId: '', projectId: '', status: 'planned', startDate: '', endDate: '' })}
        onChange={(next) => setSprintEditState((prev) => ({ ...prev, ...next }))}
        onSubmit={() => {
          if (isMutating) return
          void handleUpdateSprintById()
        }}
      />

      <BoardMembersModal
        open={showMembersModal}
        members={boardDetails?.members ?? []}
        users={users}
        usersHasMore={membersUsersHasMore}
        usersLoadingMore={membersUsersLoadingMore}
        selectedUserId={membersSelectedUserId}
        selectedRole={membersSelectedRole}
        selectedTeamRole={membersSelectedTeamRole}
        isSubmitting={isMutating}
        onClose={() => {
          setShowMembersModal(false)
          setMembersSelectedUserId('')
          setMembersSelectedRole('member')
          setMembersSelectedTeamRole('')
          setMembersUsersSearch('')
          setMembersUsersOffset(0)
        }}
        onSelectedUserIdChange={setMembersSelectedUserId}
        onSelectedRoleChange={setMembersSelectedRole}
        onSelectedTeamRoleChange={setMembersSelectedTeamRole}
        onUsersSearchChange={(value) => {
          setMembersUsersSearch(value)
          setMembersUsersOffset(0)
        }}
        onUsersLoadMore={() => {
          if (membersUsersLoadingMore || !membersUsersHasMore) return
          void loadMembersUserPage()
        }}
        onAdd={() => {
          if (!selectedBoardId || !membersSelectedUserId) return
          void (async () => {
            setIsMutating(true)
            try {
              await boardController.addMembers(selectedBoardId, [{
                userId: Number(membersSelectedUserId),
                role: membersSelectedRole,
                teamRole: membersSelectedTeamRole.trim() || undefined,
              }])
              await loadBoard(selectedBoardId, { force: true, silent: true })
              setMembersSelectedUserId('')
              setMembersSelectedRole('member')
              setMembersSelectedTeamRole('')
              setToast(bt('toast.memberAdded'))
            } catch (error) {
              setApiError(error, bt('errors.addMember'))
            } finally {
              setIsMutating(false)
            }
          })()
        }}
        onRemove={(userId) => {
          if (!selectedBoardId) return
          void (async () => {
            setIsMutating(true)
            try {
              await boardController.removeMember(selectedBoardId, userId)
              await loadBoard(selectedBoardId, { force: true, silent: true })
              setToast(bt('toast.memberRemoved'))
            } catch (error) {
              setApiError(error, bt('errors.removeMember'))
            } finally {
              setIsMutating(false)
            }
          })()
        }}
        onUpdateRole={(userId, role) => {
          if (!selectedBoardId) return
          void (async () => {
            setIsMutating(true)
            try {
              await boardController.updateMemberRole(selectedBoardId, userId, role)
              await loadBoard(selectedBoardId, { force: true, silent: true })
              setToast(bt('toast.roleUpdated'))
            } catch (error) {
              setApiError(error, bt('errors.updateRole'))
            } finally {
              setIsMutating(false)
            }
          })()
        }}
        onUpdateTeamRole={(userId, teamRole) => {
          if (!selectedBoardId) return
          void (async () => {
            setIsMutating(true)
            try {
              await boardController.updateMemberTeamRole(selectedBoardId, userId, teamRole)
              await loadBoard(selectedBoardId, { force: true, silent: true })
              setToast(bt('toast.teamRoleUpdated'))
            } catch (error) {
              setApiError(error, bt('errors.updateTeamRole'))
            } finally {
              setIsMutating(false)
            }
          })()
        }}
        boardOwnerId={boardDetails?.ownerId ?? 0}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
      />

      <TaskDetailModal
        key={selectedTaskId || "task"}
        open={showTaskDetailModal}
        task={selectedTaskEntity}
        columns={boardDetails?.columns ?? []}
        users={modalUsers}
        sprints={boardDetails?.sprints ?? []}
        goals={boardDetails?.goals ?? []}
        projects={boardDetails?.projects ?? []}
        activity={activity}
        activityLoading={activityLoading}
        labels={labels}
        labelsLoading={isLabelsLoading}
        parentTask={selectedParentTask}
        availableParentTasks={parentTaskOptions}
        comments={comments}
        commentsLoading={isCommentsLoading}
        saving={isMutating}
        userRole={currentUserRole}
        currentUserId={currentUserId}
        onClose={() => {
          setShowTaskDetailModal(false)
          setSelectedTaskId('')
          setSelectedTaskDetails(null)
          setActivity(null)
          syncBoardUrl(selectedBoardId)
        }}
        onOpenTask={(taskId) => {
          void openTaskDetail(taskId)
        }}
        onSave={async (payload) => {
          if (!selectedBoardId || !selectedTaskId || !selectedTaskEntity) return
          setIsMutating(true)
          try {
            await boardController.updateTask(selectedTaskEntity.boardId, selectedTaskId, payload)
            await Promise.all([
              loadBoard(selectedBoardId, { force: true, silent: true }),
              refreshSelectedTaskDetails(selectedTaskId),
            ])
          } catch (error) {
            setApiError(error, bt('errors.updateTask'))
            throw error
          } finally {
            setIsMutating(false)
          }
        }}
        onUpdateStatus={async (status, columnId) => {
          if (!selectedBoardId || !selectedTaskId) return
          setIsMutating(true)
          try {
            await boardController.updateTaskStatus(selectedBoardId, selectedTaskId, status, columnId)
            await Promise.all([
              loadBoard(selectedBoardId, { force: true, silent: true }),
              refreshSelectedTaskDetails(selectedTaskId),
            ])
            setToast(bt('toast.statusUpdated'))
          } catch (error) {
            setApiError(error, bt('errors.updateStatus'))
          } finally {
            setIsMutating(false)
          }
        }}
        onDelete={() => {
          if (!selectedBoardId || !selectedTaskId) return
          setConfirmDeleteTaskOpen(true)
        }}
        onAiAssist={handleEditTaskAiAssist}
        isAiProcessing={isAlemAiProcessing}
        onUpload={async (file) => {
          if (!selectedBoardId || !selectedTaskId || !selectedTaskEntity) return
          setIsMutating(true)
          try {
            await boardController.uploadTaskFile(selectedTaskEntity.boardId, selectedTaskId, file)
            await Promise.all([
              loadBoard(selectedBoardId, { force: true, silent: true }),
              refreshSelectedTaskDetails(selectedTaskId),
            ])
            setToast(bt('toast.fileAttached'))
          } catch (error) {
            setApiError(error, bt('errors.uploadFile'))
            throw error
          } finally {
            setIsMutating(false)
          }
        }}
        onAddWorklog={(payload) => {
          if (!selectedBoardId || !selectedTaskId || !selectedTaskEntity) return
          void (async () => {
            setIsMutating(true)
            try {
              await boardController.addWorklog(selectedTaskEntity.boardId, selectedTaskId, payload)
              const loadedActivity = await boardController.loadTaskActivity(selectedTaskId)
              setActivity(mapHistoryDetailsToColumnNames(loadedActivity))
              setToast(bt('toast.worklogAdded'))
            } catch (error) {
              setApiError(error, bt('errors.addWorklog'))
            } finally {
              setIsMutating(false)
            }
          })()
        }}
        onAddTaskLabel={async (labelId) => {
          if (!selectedBoardId || !selectedTaskId || !selectedTaskEntity) return
          await runAdvanced(async () => {
            await boardController.addTaskLabel(selectedTaskEntity.boardId, selectedTaskId, labelId)
            await Promise.all([
              loadBoard(selectedBoardId, { force: true, silent: true }),
              refreshSelectedTaskDetails(selectedTaskId),
            ])
            setToast(bt('toast.labelAdded'))
          }, bt('errors.addLabel'), setIsLabelsLoading)
        }}
        onRemoveTaskLabel={async (labelId) => {
          if (!selectedBoardId || !selectedTaskId || !selectedTaskEntity) return
          await runAdvanced(async () => {
            await boardController.removeTaskLabel(selectedTaskEntity.boardId, selectedTaskId, labelId)
            await Promise.all([
              loadBoard(selectedBoardId, { force: true, silent: true }),
              refreshSelectedTaskDetails(selectedTaskId),
            ])
            setToast(bt('toast.labelRemoved'))
          }, bt('errors.removeLabel'), setIsLabelsLoading)
        }}
        onCreateComment={async (payload) => {
          if (!selectedBoardId || !selectedTaskId || !selectedTaskEntity) return
          await runAdvanced(async () => {
            const comment = await boardController.createTaskComment(selectedTaskEntity.boardId, selectedTaskId, payload)
            const authorName = knownUsersById.get(comment.userId)
            setComments((current) => [...current, {
              ...comment,
              authorName: authorName || comment.authorName,
            }])
            setToast(bt('toast.commentAdded'))
          }, bt('errors.addComment'), setIsCommentsLoading)
        }}
        onCreatePhotoComment={async (payload) => {
          if (!selectedBoardId || !selectedTaskId || !selectedTaskEntity) return
          await runAdvanced(async () => {
            const comment = await boardController.createTaskCommentPhoto(selectedTaskEntity.boardId, selectedTaskId, payload)
            const authorName = knownUsersById.get(comment.userId)
            setComments((current) => [...current, {
              ...comment,
              authorName: authorName || comment.authorName,
            }])
            setToast(bt('toast.photoCommentAdded'))
          }, bt('errors.addPhotoComment'), setIsCommentsLoading)
        }}
        onLoadAttachment={handleLoadAttachment}
        onDeleteAttachment={handleDeleteAttachment}
        onUpdateComment={async (commentId, content) => {
          if (!selectedBoardId || !selectedTaskId || !selectedTaskEntity) return
          await runAdvanced(async () => {
            await boardController.updateComment(selectedTaskEntity.boardId, commentId, content)
            setComments(await boardController.loadTaskComments(selectedTaskId))
            setToast(bt('toast.commentUpdated'))
          }, bt('errors.updateComment'), setIsCommentsLoading)
        }}
        onDeleteComment={async (commentId) => {
          if (!selectedBoardId || !selectedTaskId || !selectedTaskEntity) return
          await runAdvanced(async () => {
            await boardController.deleteComment(selectedTaskEntity.boardId, commentId)
            setComments(await boardController.loadTaskComments(selectedTaskId))
            setToast(bt('toast.commentDeleted'))
          }, bt('errors.deleteComment'), setIsCommentsLoading)
        }}
        onLoadChecklist={(taskId) => boardController.loadTaskChecklistItems(taskId)}
        onCreateChecklist={async (taskId, payload) => {
          if (!selectedTaskEntity) throw new Error(bt('errors.noTaskSelected'))
          return boardController.createTaskChecklistItem(selectedTaskEntity.boardId, taskId, payload)
        }}
        onUpdateChecklist={async (taskId, itemId, payload) => {
          if (!selectedTaskEntity) throw new Error(bt('errors.noTaskSelected'))
          return boardController.updateTaskChecklistItem(selectedTaskEntity.boardId, taskId, itemId, payload)
        }}
        onDeleteChecklist={async (taskId, itemId) => {
          if (!selectedTaskEntity) throw new Error(bt('errors.noTaskSelected'))
          await boardController.deleteTaskChecklistItem(selectedTaskEntity.boardId, taskId, itemId)
        }}
        onRefreshComments={() => {
          if (!selectedTaskId) return
          void (async () => {
            setIsCommentsLoading(true)
            try {
              setComments(await boardController.loadTaskComments(selectedTaskId))
            } catch (error) {
              setApiError(error, bt('errors.refreshComments'))
            } finally {
              setIsCommentsLoading(false)
            }
          })()
        }}
        onRefreshActivity={() => {
          if (!selectedTaskId) return
          void (async () => {
            setActivityLoading(true)
            try {
              const loadedActivity = await boardController.loadTaskActivity(selectedTaskId)
              setActivity(mapHistoryDetailsToColumnNames(loadedActivity))
            } catch (error) {
              setApiError(error, bt('errors.refreshHistory'))
            } finally {
              setActivityLoading(false)
            }
          })()
        }}
        onCreateBoardLabel={async (payload) => {
          if (!selectedBoardId) return
          await runAdvanced(async () => {
            await boardController.createBoardLabel(selectedBoardId, payload)
            setLabels(await boardController.loadBoardLabels(selectedBoardId))
            setToast(bt('toast.labelCreated'))
          }, bt('errors.createLabel'), setIsLabelsLoading)
        }}
      />

      <CreateColumnModal
        open={columnPrompt.open}
        mode={columnPrompt.mode}
        name={columnPromptValue}
        statusKey={columnPromptKey}
        isSubmitting={isMutating}
        onNameChange={setColumnPromptValue}
        onStatusChange={setColumnPromptKey}
        onClose={() => {
          setColumnPrompt({ mode: 'create', columnId: '', initialValue: '', initialKey: '', open: false })
          setColumnPromptValue('')
          setColumnPromptKey('')
        }}
        onSubmit={() => {
          if (isMutating) return
          setIsMutating(true)
          void handleSubmitColumnPrompt().finally(() => {
            setIsMutating(false)
          })
        }}
      />

      <AppConfirmDialog
        open={Boolean(deleteColumnId)}
        title={bt('confirm.deleteColumnTitle')}
        message={bt('confirm.deleteColumnText')}
        confirmText={bt('delete')}
        isLoading={isMutating}
        onCancel={() => setDeleteColumnId('')}
        onConfirm={() => {
          if (isMutating) return
          setIsMutating(true)
          void handleConfirmDeleteColumn().finally(() => {
            setIsMutating(false)
          })
        }}
      />

      <AppConfirmDialog
        open={confirmDeleteTaskOpen}
        title={bt('confirm.deleteTaskTitle')}
        message={bt('confirm.deleteTaskText')}
        confirmText={bt('delete')}
        isLoading={isMutating}
        onCancel={() => setConfirmDeleteTaskOpen(false)}
        onConfirm={() => {
          if (isMutating) return
          setIsMutating(true)
          void handleConfirmDeleteTask()
        }}
      />

      <AlemAIUploadModal
        isOpen={showAlemAiUploadModal}
        onClose={() => setShowAlemAiUploadModal(false)}
        onUpload={handleAlemAiUpload}
        isProcessing={isAlemAiProcessing}
      />

      {showAiGeneratedTasks && (
        <AlemAIGeneratedTasks
          tasks={generatedAiTasks}
          kanbanContext={aiKanbanContext}
          onClose={() => setShowAiGeneratedTasks(false)}
          onConfirm={handleAlemAiConfirm}
        />
      )}
      {showEditBoardModal && (
        <AppPromptDialog
          open={showEditBoardModal}
          title={bt('boards.edit')}
          label={bt('boards.name')}
          value={editBoardValue}
          onConfirm={handleUpdateBoard}
          onCancel={() => setShowEditBoardModal(false)}
          onChange={setEditBoardValue}
        />
      )}

      {showDeleteBoardConfirm && (
        <AppConfirmDialog
          open={showDeleteBoardConfirm}
          title={bt('boards.delete')}
          message={bt('boards.deleteConfirm', { name: deleteBoardTarget?.name ?? boardDetails?.boardName ?? '' })}
          onConfirm={handleDeleteBoard}
          onCancel={() => {
            setShowDeleteBoardConfirm(false)
            setDeleteBoardTarget(null)
          }}
        />
      )}

      <AppConfirmDialog
        open={Boolean(entityDeleteTarget)}
        title={entityDeleteTarget?.kind === 'goal' ? bt('goals.delete') : entityDeleteTarget?.kind === 'project' ? bt('projects.delete') : bt('sprints.delete')}
        message={
          entityDeleteTarget?.kind === 'goal'
            ? bt('goals.deleteConfirm', { name: entityDeleteTarget.name })
            : entityDeleteTarget?.kind === 'project'
              ? bt('projects.deleteConfirm', { name: entityDeleteTarget.name })
              : bt('sprints.deleteConfirm', { name: entityDeleteTarget?.name ?? '' })
        }
        confirmText={bt('delete')}
        isLoading={isMutating}
        onCancel={() => { if (!isMutating) setEntityDeleteTarget(null) }}
        onConfirm={() => {
          if (!entityDeleteTarget || isMutating) return
          const target = entityDeleteTarget
          const action = target.kind === 'goal'
            ? handleDeleteGoalById(target.id)
            : target.kind === 'project'
              ? handleDeleteProjectById(target.id)
              : handleDeleteSprintById(target.id)
          void action.finally(() => setEntityDeleteTarget(null))
        }}
      />

      <AppConfirmDialog
        open={showDeleteSprintConfirm}
        title={bt('sprints.delete')}
        message={
          selectedSprintId
            ? bt('sprints.deleteConfirm', { name: boardDetails?.sprints.find((sprint) => sprint.id === selectedSprintId)?.name ?? bt('untitled') })
            : bt('sprints.selectFirst')
        }
        confirmText={bt('delete')}
        isLoading={isMutating}
        onCancel={() => setShowDeleteSprintConfirm(false)}
        onConfirm={() => {
          if (!selectedSprintId || isMutating) return
          setIsMutating(true)
          void handleDeleteSprint()
        }}
      />

      {showStatsModal && boardStats && (
        <BoardStatsDashboard
          stats={boardStats}
          aiStats={aiBoardStats}
          onClose={() => {
            setShowStatsModal(false)
            setAiBoardStats(null)
          }}
        />
      )}

      <MultiBoardStatsModal
        open={showMultiStatsModal}
        onClose={() => setShowMultiStatsModal(false)}
        boards={boards}
        boardController={boardController}
      />

      {/* в”Ђв”Ђ Toast / Error strip в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */}
      {(error || toast) ? (
        <>
          {error ? <AppToast variant="error" message={error} onClose={() => setError('')} /> : null}
          {toast ? <AppToast variant="success" message={toast} onClose={() => setToast('')} /> : null}
        </>
      ) : null}
      
    </main>
  )
}
