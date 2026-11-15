import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import CardShell from '../../../shared/ui/CardShell'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import GradientAvatar from '../../../shared/ui/GradientAvatar'
import AppToast from '../../../shared/ui/AppToast'
import { getErrorMessage } from '../../../shared/utils/getErrorMessage'
import WorkspaceAppCard from '../../components/workspace/WorkspaceAppCard'
import WorkspaceEpsAppCard from '../../components/workspace/WorkspaceEpsAppCard'
import WorkspaceDashboard from '../../components/workspace/WorkspaceDashboard'
import WorkspaceReferenceDashboard from '../../components/workspace/WorkspaceReferenceDashboard'
import WorkspaceSkeletons from '../../components/workspace/WorkspaceSkeletons'
import { createHomeDashboardController } from '../../dashboard/createHomeDashboardController'
import { createAuthController } from '../../auth/createAuthController'
import { createWorkspaceFavoritesController } from '../../workspace/createWorkspaceFavoritesController'
import type { WorkspaceFavoriteAppViewModel } from '../../view-models/WorkspaceFavoritesViewModel'
import { getDefaultHomeDashboardViewModel, type HomeDashboardViewModel } from '../../view-models/HomeDashboardViewModel'
import { createCalendarController } from '../../calendar/createCalendarController'
import { createBoardController } from '../../board/createBoardController'
import type { CalendarEventViewModel } from '../../view-models/CalendarViewModel'
import type { WorkspaceGoalItem } from '../../components/workspace/WorkspaceDashboard'
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore'
import { MAIL_APP_URL, openWorkspaceMail } from '../../../shared/config/mailConfig'
import type { EpsUnreadMailbox } from '../../../infrastructure/eps/epsMail'
import { HttpPublicationRepository } from '../../../infrastructure/repositories/HttpPublicationRepository'
import type { Publication } from '../../../infrastructure/repositories/HttpPublicationRepository'
import { HttpMinistryRepository } from '../../../infrastructure/repositories/HttpMinistryRepository'
import { HttpProfileRepository } from '../../../infrastructure/repositories/HttpProfileRepository'
import type { CurrentProfile } from '../../../domain/entities/profile-settings/ProfileSettingsModels'
import type { ManagementVacation } from '../../../domain/repositories/ProfileRepository'
import kazakhstanCoatOfArms from '../../../assets/kazakhstan_coat_of_arms.jpg'
import { PublicationCard } from '../../components/workspace/PublicationCard'
import MinistryWorkspaceView from '../../components/workspace/MinistryWorkspaceView'
import { renderTextWithLinks } from '../../../shared/utils/renderTextWithLinks'


const WORKSPACE_GOAL_COLORS = ['#14B8A6', '#FB923C', '#2458D3', '#8B5CF6', '#F43F5E', '#0EA5E9']
const NEWS_PAGE_SIZE = 10
const NEWS_LOAD_AHEAD_PX = 320

const mapWorkspaceGoal = (goal: {
  id: string
  boardId: string
  name: string
  description?: string
  boardName?: string
  completionPercent: number
}, index: number): WorkspaceGoalItem => ({
  id: goal.id,
  boardId: goal.boardId,
  title: goal.name,
  subtitle: goal.boardName || goal.description || '—',
  progress: Math.min(100, Math.max(0, goal.completionPercent)),
  color: WORKSPACE_GOAL_COLORS[index % WORKSPACE_GOAL_COLORS.length],
})

const moveItem = <T,>(items: T[], fromIndex: number, toIndex: number): T[] => {
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return items
  }

  const next = [...items]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

const normalizePositions = (apps: WorkspaceFavoriteAppViewModel[]): WorkspaceFavoriteAppViewModel[] =>
  apps.map((app, index) => ({ ...app, position: index + 1 }))

const formatDateRange = (begin?: string, end?: string) => {
  if (!begin || !end) return 'В отпуске'
  try {
    const bDate = new Date(begin)
    const eDate = new Date(end)
    const pad = (n: number) => String(n).padStart(2, '0')
    const fBegin = `${pad(bDate.getDate())}.${pad(bDate.getMonth() + 1)}.${bDate.getFullYear()}`
    const fEnd = `${pad(eDate.getDate())}.${pad(eDate.getMonth() + 1)}.${eDate.getFullYear()}`
    return `${fBegin} — ${fEnd}`
  } catch {
    return 'В отпуске'
  }
}

const getDurationText = (begin?: string, end?: string) => {
  if (!begin || !end) return 'В отпуске'
  try {
    const bDate = new Date(begin)
    const eDate = new Date(end)
    const diffMs = eDate.getTime() - bDate.getTime()
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1
    if (diffDays > 0) {
      return `${diffDays} дн.`
    }
    return 'В отпуске'
  } catch {
    return 'В отпуске'
  }
}

const getPublicationExcerpt = (content?: string, maxLength = 96) => {
  const normalized = (content || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return 'Подробности доступны в публикации'
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength).trimEnd()}...`
}

type PublicationFormAttachment = {
  name: string
  size: number
  url: string
  objectName: string
}

export default function WorkspacePage() {
  const navigate = useNavigate()
  const [apps, setApps] = useState<WorkspaceFavoriteAppViewModel[]>([])
  const [query, setQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // View Mode switcher state
  const [viewMode, setViewMode] = useState<'news' | 'services'>('news')
  
  // Publication-related states
  const [publications, setPublications] = useState<Publication[]>([])
  const [newsLoading, setNewsLoading] = useState(false)
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(null)
  const [currentUserId, setCurrentUserId] = useState<number | null>(null)
  const [managementVacations, setManagementVacations] = useState<ManagementVacation[]>([])
  const [vacationsLoading, setVacationsLoading] = useState(false)
  const [isVacationsModalOpen, setIsVacationsModalOpen] = useState(false)
  const [importantAnnouncements, setImportantAnnouncements] = useState<Publication[]>([])
  const [importantAnnouncementsLoading, setImportantAnnouncementsLoading] = useState(false)
  const [ministries, setMinistries] = useState<Array<{ id: number; name: string }>>([])
  
  // Filtering states
  const [selectedNewsType, setSelectedNewsType] = useState<string>('all')
  const [selectedOrgId, setSelectedOrgId] = useState<string>('all')
  const [selectedDeptId, setSelectedDeptId] = useState<string>('all')
  const [selectedPortalMinistryId, setSelectedPortalMinistryId] = useState<string | null>(null)
  const [ministryDepartments, setMinistryDepartments] = useState<Record<string, Array<{ id: number; name: string }>>>({})
  const [expandedOrgIds, setExpandedOrgIds] = useState<Record<string, boolean>>({})
  
  // Comments states
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  
  // Create Publication states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingPublicationId, setEditingPublicationId] = useState<string | null>(null)
  const [isSubmittingPub, setIsSubmittingPub] = useState(false)
  
  const [pubSourceType, setPubSourceType] = useState<'user' | 'ministry' | 'department'>('user')
  const [pubType, setPubType] = useState<'news' | 'announcement' | 'document' | 'event' | 'appeal'>('news')
  const [pubTitle, setPubTitle] = useState('')
  const [pubContent, setPubContent] = useState('')
  const [pubAttachments, setPubAttachments] = useState<PublicationFormAttachment[]>([])
  const [pubTargetAudience, setPubTargetAudience] = useState<Publication['target_audience']>('all')
  const [pubImportance, setPubImportance] = useState<'normal' | 'important' | 'urgent'>('normal')
  const [pubAllowComments, setPubAllowComments] = useState(true)
  const [pubRequiresAck, setPubRequiresAck] = useState(false)

  const isEditingPublication = editingPublicationId !== null

  const resetPublicationForm = useCallback(() => {
    setEditingPublicationId(null)
    setPubSourceType('user')
    setPubType('news')
    setPubTitle('')
    setPubContent('')
    setPubAttachments([])
    setPubTargetAudience('all')
    setPubImportance('normal')
    setPubAllowComments(true)
    setPubRequiresAck(false)
  }, [])

  const closePublicationModal = useCallback(() => {
    setIsCreateModalOpen(false)
    resetPublicationForm()
  }, [resetPublicationForm])

  const openCreatePublicationModal = useCallback(() => {
    resetPublicationForm()
    setIsCreateModalOpen(true)
  }, [resetPublicationForm])

  const openEditPublicationModal = useCallback((pub: Publication) => {
    setEditingPublicationId(pub.id)
    setPubSourceType(pub.source_type)
    setPubType(pub.type)
    setPubTitle(pub.title || '')
    setPubContent(pub.content || '')
    setPubAttachments((pub.attachments || []).map((att) => ({
      name: att.file_name,
      size: att.file_size || 0,
      url: att.file_url,
      objectName: att.id || att.file_name,
    })))
    setPubTargetAudience(pub.target_audience)
    setPubImportance(pub.importance)
    setPubAllowComments(pub.allow_comments)
    setPubRequiresAck(pub.requires_acknowledgement)
    setIsCreateModalOpen(true)
  }, [])

  // Pagination states
  const newsPageRef = useRef(1)
  const [hasMoreNews, setHasMoreNews] = useState(true)
  const [loadingMoreNews, setLoadingMoreNews] = useState(false)
  const mainScrollRef = useRef<HTMLElement | null>(null)
  const hasMoreNewsRef = useRef(true)
  const loadingMoreNewsRef = useRef(false)
  const newsLoadingRef = useRef(false)
  const orgFeedInitializedRef = useRef(false)
  const orgFeedTouchedByUserRef = useRef(false)
  const [showScrollTop, setShowScrollTop] = useState(false)

  const sessionStore = useMemo(() => new LocalStorageAuthSessionStore(), [])
  const pubRepo = useMemo(() => new HttpPublicationRepository(sessionStore), [sessionStore])
  const ministryRepo = useMemo(() => new HttpMinistryRepository(sessionStore), [sessionStore])
  const profileRepo = useMemo(() => new HttpProfileRepository(sessionStore), [sessionStore])

  const applyFeedOrgSelection = useCallback((orgId: string, deptId: string = 'all', options?: { manual?: boolean }) => {
    if (options?.manual !== false) {
      orgFeedTouchedByUserRef.current = true
    }
    orgFeedInitializedRef.current = true
    setSelectedPortalMinistryId(null)
    setSelectedOrgId(orgId)
    setSelectedDeptId(deptId)
  }, [])

  const loadNewsData = useCallback(async () => {
    setNewsLoading(true)
    setLoadingMoreNews(false)
    setHasMoreNews(true)
    newsPageRef.current = 1
    
    const activeNewsType = selectedNewsType
    const activeOrgId = selectedOrgId
    const activeDeptId = selectedDeptId

    setVacationsLoading(true)
    setImportantAnnouncementsLoading(true)
    try {
      const [prof, vacs, announcements, mins] = await Promise.all([
        profileRepo.getMe(),
        profileRepo.getManagementVacations().catch((err) => {
          console.error('Failed to load management vacations', err)
          return []
        }),
        pubRepo.getPublications({ page: 1, limit: 20, type: 'announcement' }).catch((err) => {
          console.error('Failed to load important announcements', err)
          return []
        }),
        pubRepo.getMinistries().catch((err) => {
          console.error('Failed to load ministries', err)
          return []
        }),
      ])

      if (
        activeNewsType !== selectedNewsType ||
        activeOrgId !== selectedOrgId ||
        activeDeptId !== selectedDeptId
      ) {
        return
      }

      setCurrentProfile(prof)
      if (prof?.id) {
        setCurrentUserId(prof.id)
      }
      setManagementVacations(vacs)
      setImportantAnnouncements(announcements)
      setMinistries(mins)

      const ownMinistryId =
        typeof prof?.ministryId === 'number' && Number.isFinite(prof.ministryId) && prof.ministryId > 0
          ? String(prof.ministryId)
          : null

      const shouldAutoSelectOwnMinistry =
        !orgFeedInitializedRef.current &&
        !orgFeedTouchedByUserRef.current &&
        activeOrgId === 'all' &&
        activeDeptId === 'all' &&
        ownMinistryId !== null

      if (shouldAutoSelectOwnMinistry) {
        orgFeedInitializedRef.current = true
        setExpandedOrgIds((prev) => (prev[ownMinistryId] ? prev : { ...prev, [ownMinistryId]: true }))
        setSelectedOrgId(ownMinistryId)
        setSelectedDeptId('all')
        return
      }

      orgFeedInitializedRef.current = true

      const typeParam = selectedNewsType === 'all' ? undefined : selectedNewsType
      const orgParam = selectedOrgId === 'all' ? undefined : Number(selectedOrgId)
      const deptParam = selectedDeptId === 'all' ? undefined : Number(selectedDeptId)
      const pubs = await pubRepo.getPublications({
        page: 1,
        limit: NEWS_PAGE_SIZE,
        type: typeParam,
        ministry_id: orgParam,
        department_id: deptParam,
      })

      if (
        activeNewsType !== selectedNewsType ||
        activeOrgId !== selectedOrgId ||
        activeDeptId !== selectedDeptId
      ) {
        return
      }

      setPublications(pubs)
      setHasMoreNews(pubs.length === NEWS_PAGE_SIZE)
    } catch (err) {
      console.error('Failed to load news workspace data', err)
    } finally {
      if (
        activeNewsType === selectedNewsType &&
        activeOrgId === selectedOrgId &&
        activeDeptId === selectedDeptId
      ) {
        setNewsLoading(false)
        setVacationsLoading(false)
        setImportantAnnouncementsLoading(false)
      }
    }
  }, [pubRepo, profileRepo, selectedNewsType, selectedOrgId, selectedDeptId])

  const loadMoreNewsData = useCallback(async () => {
    if (loadingMoreNewsRef.current || newsLoadingRef.current || !hasMoreNewsRef.current) return

    loadingMoreNewsRef.current = true
    setLoadingMoreNews(true)

    const activeNewsType = selectedNewsType
    const activeOrgId = selectedOrgId
    const activeDeptId = selectedDeptId
    const initialPage = newsPageRef.current

    try {
      const typeParam = selectedNewsType === 'all' ? undefined : selectedNewsType
      const orgParam = selectedOrgId === 'all' ? undefined : Number(selectedOrgId)
      const deptParam = selectedDeptId === 'all' ? undefined : Number(selectedDeptId)

      let nextPage = initialPage
      let hasMore = true
      let pagesChecked = 0
      const seen = new Set(publications.map(item => item.id))
      const appended: Publication[] = []

      while (hasMore && appended.length === 0 && pagesChecked < 3) {
        nextPage += 1
        pagesChecked += 1

        const pubs = await pubRepo.getPublications({
          page: nextPage,
          limit: NEWS_PAGE_SIZE,
          type: typeParam,
          ministry_id: orgParam,
          department_id: deptParam,
        })

        if (
          activeNewsType !== selectedNewsType ||
          activeOrgId !== selectedOrgId ||
          activeDeptId !== selectedDeptId
        ) {
          return
        }

        if (pubs.length < NEWS_PAGE_SIZE) {
          hasMore = false
        }

        for (const item of pubs) {
          if (seen.has(item.id)) {
            continue
          }
          seen.add(item.id)
          appended.push(item)
        }

        if (pubs.length === 0) {
          break
        }
      }

      if (appended.length > 0) {
        setPublications(prev => [...prev, ...appended])
      }

      newsPageRef.current = nextPage
      setHasMoreNews(hasMore)
    } catch (err) {
      console.error('Failed to load more news', err)
    } finally {
      loadingMoreNewsRef.current = false
      if (
        activeNewsType === selectedNewsType &&
        activeOrgId === selectedOrgId &&
        activeDeptId === selectedDeptId
      ) {
        setLoadingMoreNews(false)
      }
    }
  }, [pubRepo, publications, selectedNewsType, selectedOrgId, selectedDeptId])


  useEffect(() => {
    hasMoreNewsRef.current = hasMoreNews
  }, [hasMoreNews])

  useEffect(() => {
    loadingMoreNewsRef.current = loadingMoreNews
  }, [loadingMoreNews])

  useEffect(() => {
    newsLoadingRef.current = newsLoading
  }, [newsLoading])

  useEffect(() => {
    void loadNewsData()
  }, [loadNewsData])

  useEffect(() => {
    const scrollEl = mainScrollRef.current
    if (!scrollEl) return

    let ticking = false

    const evaluateScrollPosition = () => {
      ticking = false
      setShowScrollTop(scrollEl.scrollTop > 400)

      if (!hasMoreNewsRef.current || loadingMoreNewsRef.current || newsLoadingRef.current) {
        return
      }

      const distanceToBottom = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight
      if (distanceToBottom <= NEWS_LOAD_AHEAD_PX) {
        void loadMoreNewsData()
      }
    }

    const handleScroll = () => {
      if (ticking) {
        return
      }
      ticking = true
      window.requestAnimationFrame(evaluateScrollPosition)
    }

    scrollEl.addEventListener('scroll', handleScroll, { passive: true })
    evaluateScrollPosition()

    return () => {
      scrollEl.removeEventListener('scroll', handleScroll)
    }
  }, [loadMoreNewsData, hasMoreNews, loadingMoreNews, newsLoading, publications.length])

  const fetchDepartmentsForMinistry = useCallback(async (orgId: string) => {
    if (orgId === 'all' || ministryDepartments[orgId]) return
    try {
      const ministryId = Number(orgId)
      const stateBodies = await profileRepo.getStateBodies(ministryId)
      const deptPromises = stateBodies.map(sb => profileRepo.getDepartments(sb.id))
      const deptResults = await Promise.all(deptPromises)
      const allDepts = deptResults.flat()
      setMinistryDepartments(prev => ({ ...prev, [orgId]: allDepts }))
    } catch (err) {
      console.error('Failed to load departments for ministry', orgId, err)
    }
  }, [profileRepo, ministryDepartments])

  const handleSelectOrg = useCallback(async (orgId: string) => {
    applyFeedOrgSelection(orgId, 'all')
  }, [applyFeedOrgSelection])

  const toggleOrgExpansion = useCallback(async (orgId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const nextExpanded = !expandedOrgIds[orgId]
    setExpandedOrgIds(prev => ({ ...prev, [orgId]: nextExpanded }))

    if (nextExpanded) {
      await fetchDepartmentsForMinistry(orgId)
    }
  }, [expandedOrgIds, fetchDepartmentsForMinistry])

  useEffect(() => {
    if (!isDropdownOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isDropdownOpen])
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [draggedAppId, setDraggedAppId] = useState<number | null>(null)
  const [dragOverAppId, setDragOverAppId] = useState<number | null>(null)
  const [isReordering, setIsReordering] = useState(false)
  const [removingId, setRemovingId] = useState<number | null>(null)
  const [pendingRatingId, setPendingRatingId] = useState<number | null>(null)
  const [hubData, setHubData] = useState<HomeDashboardViewModel>(getDefaultHomeDashboardViewModel())
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventViewModel[]>([])
  const [workspaceGoals, setWorkspaceGoals] = useState<WorkspaceGoalItem[]>([])
  const [epsUnreadMailbox, setEpsUnreadMailbox] = useState<EpsUnreadMailbox | null>(null)
  const [showEpsApp, setShowEpsApp] = useState(false)
  const [userName, setUserName] = useState('Пользователь')
  const [removedIds, setRemovedIds] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('workspace_removed_ids')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    localStorage.setItem('workspace_removed_ids', JSON.stringify(removedIds))
  }, [removedIds])

  const { workspaceFavoritesController } = useMemo(() => createWorkspaceFavoritesController(), [])
  const { homeDashboardController } = useMemo(() => createHomeDashboardController(), [])
  const { calendarController } = useMemo(() => createCalendarController(), [])
  const { boardController } = useMemo(() => createBoardController(), [])
  const { authController } = useMemo(() => createAuthController(), [])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 2500)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const loadFavorites = useCallback(
    async (options?: { force?: boolean }) => {
      setIsLoading(true)
      setError('')
      try {
        const today = new Date()
        const fromIso = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()
        const toIso = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999).toISOString()

        const authPromise = authController.bootstrap().catch(() => null)

        const calendarPromise = calendarController
          .loadPage({ fromIso, toIso, force: options?.force })
          .then((res) => res.viewModel.events)
          .catch((err) => {
            console.error('Failed to load calendar events for workspace dashboard', err)
            return [] as CalendarEventViewModel[]
          })

        const goalsPromise = boardController
          .listMyGoals()
          .then((items) => items.map(mapWorkspaceGoal))
          .catch((err) => {
            console.error('Failed to load workspace goals', err)
            return [] as WorkspaceGoalItem[]
          })

        const epsUnreadPromise = authPromise.then((authModel) => {
          if (authModel?.name?.trim()) {
            setUserName(authModel.name.trim())
          }
          if (authModel?.userId) {
            setCurrentUserId(authModel.userId)
          }
          setShowEpsApp(Boolean(authModel?.userId))
          return null
        })

        const [workspaceViewModel, homeViewModel, monthlyEvents, goals, epsUnread] =
          await Promise.all([
          workspaceFavoritesController.load(options),
          homeDashboardController.load(options),
          calendarPromise,
          goalsPromise,
          epsUnreadPromise,
          authPromise,
        ])

        // Filter out apps that were explicitly removed by user but might still be returned by server (e.g. global apps)
        const visibleApps = workspaceViewModel.apps.filter((app) => {
          if (removedIds.includes(app.id)) {
            return false
          }
          return true
        })

        setApps(visibleApps)
        setHubData(homeViewModel)
        setCalendarEvents(monthlyEvents)
        setWorkspaceGoals(goals)
        setEpsUnreadMailbox(epsUnread)
      } catch (error) {
        setError(getErrorMessage(error, 'Не удалось загрузить список приложений. Попробуйте еще раз.'))
      } finally {
        setIsLoading(false)
      }
    },
    [workspaceFavoritesController, homeDashboardController, calendarController, boardController, authController, removedIds],
  )

  useEffect(() => {
    void loadFavorites()
  }, [loadFavorites])

  const allTags = useMemo(() => {
    const tagsSet = new Set<string>()
    apps.forEach((app) => {
      app.tags.forEach((tag) => {
        if (tag.trim()) {
          tagsSet.add(tag.trim())
        }
      })
    })
    return Array.from(tagsSet)
  }, [apps])

  const filteredApps = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return apps.filter((app) => {
      const matchesQuery = !normalizedQuery || app.appName.toLowerCase().includes(normalizedQuery)
      const matchesTag = !selectedTag || app.tags.some((tag) => tag.trim() === selectedTag)
      return matchesQuery && matchesTag
    })
  }, [apps, query, selectedTag])

  const showEpsInGrid = useMemo(() => {
    if (!showEpsApp || selectedTag) return false
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return true
    return normalizedQuery.includes('eps') || normalizedQuery.includes('почт')
  }, [showEpsApp, query, selectedTag])

  const showPinnedAppsSection = apps.length > 0 || showEpsApp
  const reorderAllowed = query.trim().length === 0

  const handleDrop = async (targetAppId: number) => {
    if (!reorderAllowed || isReordering || draggedAppId === null || draggedAppId === targetAppId) {
      return
    }

    const fromIndex = apps.findIndex((app) => app.id === draggedAppId)
    const toIndex = apps.findIndex((app) => app.id === targetAppId)
    if (fromIndex === -1 || toIndex === -1) {
      return
    }

    const previous = apps
    const reordered = normalizePositions(moveItem(apps, fromIndex, toIndex))
    setApps(reordered)
    setIsReordering(true)
    setDraggedAppId(null)
    setDragOverAppId(null)

    try {
      await workspaceFavoritesController.reorder(draggedAppId, toIndex + 1)
      setToast('Порядок приложений обновлен')
    } catch (error) {
      setApps(previous)
      setError(getErrorMessage(error, 'Не удалось изменить порядок приложений. Попробуйте снова.'))
    } finally {
      setIsReordering(false)
    }
  }

  const handleRemove = async (appId: number) => {
    if (removingId !== null || isReordering) {
      return
    }

    const previous = apps
    const next = normalizePositions(apps.filter((item) => item.id !== appId))
    setApps(next)
    setRemovingId(appId)
    setError('')

    try {
      await workspaceFavoritesController.remove(appId)
      setRemovedIds((prev) => [...new Set([...prev, appId])])
      await loadFavorites({ force: true })
      setToast('Приложение удалено из избранного')
    } catch (error) {
      setApps(previous)
      setError(getErrorMessage(error, 'Не удалось удалить приложение. Возможно, оно является глобальным.'))
    } finally {
      setRemovingId(null)
    }
  }

  const handleOpen = (targetApp: WorkspaceFavoriteAppViewModel) => {
    if (targetApp.id === 36) {
      navigate('/calendar')
      return
    }

    if (targetApp.id === 42) {
      navigate('/teamai')
      return
    }

    if (targetApp.id === 38) {
      navigate('/board')
      return
    }

    if (!targetApp.link) {
      return
    }

    if (targetApp.link === MAIL_APP_URL) openWorkspaceMail()
    else window.open(targetApp.link, '_blank', 'noopener,noreferrer')
  }

  const handleRate = async (targetApp: WorkspaceFavoriteAppViewModel, rating: number) => {
    if (pendingRatingId !== null) {
      return
    }

    const previous = apps
    const optimistic = apps.map((app) =>
      app.id === targetApp.id
        ? {
            ...app,
            myRating: rating,
          }
        : app,
    )

    setPendingRatingId(targetApp.id)
    setApps(optimistic)
    setError('')

    try {
      const updated = await workspaceFavoritesController.rate(targetApp.id, rating)
      setApps((current) => current.map((app) => (app.id === updated.id ? updated : app)))
      setToast('Оценка сохранена')
    } catch (error) {
      setApps(previous)
      setError(getErrorMessage(error, 'Не удалось сохранить оценку. Попробуйте снова.'))
    } finally {
      setPendingRatingId(null)
    }
  }

  const handleClearRating = async (targetApp: WorkspaceFavoriteAppViewModel) => {
    if (pendingRatingId !== null) {
      return
    }

    const previous = apps
    setPendingRatingId(targetApp.id)
    setApps((current) => current.map((app) => (app.id === targetApp.id ? { ...app, myRating: null } : app)))
    setError('')

    try {
      const updated = await workspaceFavoritesController.clearRating(targetApp.id)
      setApps((current) => current.map((app) => (app.id === updated.id ? updated : app)))
      setToast('Оценка удалена')
    } catch (error) {
      setApps(previous)
      setError(getErrorMessage(error, 'Не удалось удалить оценку. Попробуйте снова.'))
    } finally {
      setPendingRatingId(null)
    }
  }

  const filteredPublications = useMemo(() => {
    return publications
  }, [publications])

  const prioritizedAnnouncements = useMemo(() => {
    const importanceRank: Record<Publication['importance'], number> = {
      normal: 0,
      important: 1,
      urgent: 2,
    }

    return [...importantAnnouncements]
      .filter((pub) => pub.type === 'announcement' && (pub.importance === 'important' || pub.importance === 'urgent'))
      .sort((left, right) => {
        if (left.is_pinned !== right.is_pinned) {
          return left.is_pinned ? -1 : 1
        }

        const rankDiff = importanceRank[right.importance] - importanceRank[left.importance]
        if (rankDiff !== 0) {
          return rankDiff
        }

        return new Date(right.published_at).getTime() - new Date(left.published_at).getTime()
      })
      .slice(0, 3)
  }, [importantAnnouncements])

  const formatPubDate = (isoString: string) => {
    try {
      const d = new Date(isoString)
      return d.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return 'Сегодня'
    }
  }

  const todayCalendarEvents = useMemo(() => {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    const todayKey = `${year}-${month}-${day}`

    return calendarEvents
      .filter((event) => event.dayKey === todayKey && !event.isDeclined)
      .sort((left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime())
      .slice(0, 3)
  }, [calendarEvents])

  const handleShare = async (pub: Publication) => {
    try {
      await pubRepo.sharePublication(pub.id)
      setPublications(prev => prev.map(p => p.id === pub.id ? { ...p, shares_count: p.shares_count + 1 } : p))
      
      const shareUrl = `${window.location.origin}/web/workspace?pub_id=${pub.id}`
      await navigator.clipboard.writeText(shareUrl)
      setToast('Ссылка на публикацию скопирована в буфер обмена')
    } catch (err) {
      console.error(err)
    }
  }

  const handleAcknowledge = async (pub: Publication) => {
    try {
      await pubRepo.acknowledgePublication(pub.id)
      setPublications(prev => prev.map(p => p.id === pub.id ? { ...p, acknowledged: true } : p))
      setToast('Ознакомление успешно подтверждено')
    } catch (err) {
      console.error(err)
      setError('Не удалось подтвердить ознакомление')
    }
  }

  const handleDeletePub = async (pubId: string) => {
    if (!window.confirm('Вы действительно хотите удалить эту публикацию?')) return
    try {
      await pubRepo.deletePublication(pubId)
      setPublications(prev => prev.filter(p => p.id !== pubId))
      setToast('Публикация удалена')
    } catch (err) {
      console.error(err)
      setError('Не удалось удалить публикацию')
    }
  }

  const handleCommentCountChange = useCallback((pubId: string, diff: number) => {
    setPublications(prev => prev.map(p => p.id === pubId ? { ...p, comments_count: Math.max(0, p.comments_count + diff) } : p))
  }, [])

  const loadMinistryPublications = useCallback(async ({ ministryId, type, page = 1, limit = 20 }: { ministryId: number; type?: string; page?: number; limit?: number }) => {
    return pubRepo.getPublications({
      ministry_id: ministryId,
      type,
      page,
      limit,
    })
  }, [pubRepo])


  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    
    const file = files[0]
    
    try {
      setToast('Загрузка файла...')
      const uploaded = await pubRepo.uploadFile(file, 'document')
      setPubAttachments(prev => [...prev, {
        name: file.name,
        size: file.size,
        url: uploaded.url,
        objectName: uploaded.objectName
      }])
      setToast('Файл успешно прикреплен')
    } catch (err) {
      console.error(err)
      setError(`Не удалось загрузить файл ${file.name}`)
    }
  }

  const handleSubmitPublication = async () => {
    if (!pubTitle.trim()) {
      setError('Пожалуйста, введите заголовок публикации')
      return
    }

    setIsSubmittingPub(true)
    try {
      const payload = {
        source_type: pubSourceType,
        type: pubType,
        title: pubTitle.trim(),
        content: pubContent,
        target_audience: pubTargetAudience,
        importance: pubImportance,
        allow_comments: pubAllowComments,
        requires_acknowledgement: pubRequiresAck,
        attachments: pubAttachments.map(att => ({
          file_url: att.url,
          file_name: att.name,
          file_type: 'document',
          file_size: att.size
        }))
      }

      if (editingPublicationId) {
        await pubRepo.updatePublication(editingPublicationId, payload)
        setToast('Публикация успешно обновлена')
      } else {
        await pubRepo.createPublication(payload)
        setToast('Публикация успешно создана')
      }

      closePublicationModal()
      void loadNewsData()
    } catch (err: any) {
      console.error(err)
      setError(getErrorMessage(err, editingPublicationId ? 'Не удалось обновить публикацию.' : 'Не удалось создать публикацию.'))
    } finally {
      setIsSubmittingPub(false)
    }
  }

  return (
    <WorkspaceReferenceDashboard
      hubData={hubData}
      calendarEvents={calendarEvents}
      apps={apps}
      publications={publications}
      userName={userName}
      isLoading={isLoading || newsLoading}
    />
  )

  return (
    <main
      ref={mainScrollRef}
      className="custom-scrollbar relative min-h-0 flex-1 overflow-y-auto"
      style={{
        backgroundColor: '#FFFFFF',
        backgroundImage:
          'linear-gradient(to right, rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.08) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }}
    >
      {error ? <AppToast variant="error" message={error} onClose={() => setError('')} /> : null}
      {toast ? <AppToast variant="success" message={toast} onClose={() => setToast('')} /> : null}

      <div className="mx-auto w-full max-w-[1320px] px-4 py-6 pb-28 md:px-6 lg:px-8 lg:py-8">
        
        {/* Top Navigation Mode Tabs */}
        <div className="flex items-center justify-between mb-8 select-none sticky top-0 bg-white/95 backdrop-blur-sm z-40 py-4 -mt-4 border-b border-[#ECEEF3]/80">
          <div className="flex items-center p-1 bg-[#F1F5F9] rounded-2xl border border-[#E2E8F0]/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]">
            <button
              onClick={() => setViewMode('news')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-[13.5px] transition-all duration-200 cursor-pointer outline-none ${
                viewMode === 'news'
                  ? 'bg-white text-[#2458D3] shadow-[0_2px_8px_rgba(15,23,42,0.06)] border border-slate-200/40'
                  : 'text-[#64748B] hover:text-[#0A1628] border border-transparent'
              }`}
            >
              <MaterialSymbol name="feed" size={17} color={viewMode === 'news' ? '#2458D3' : 'currentColor'} />
              Рабочая лента
            </button>
            <button
              onClick={() => setViewMode('services')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-[13.5px] transition-all duration-200 cursor-pointer outline-none ${
                viewMode === 'services'
                  ? 'bg-white text-[#2458D3] shadow-[0_2px_8px_rgba(15,23,42,0.06)] border border-slate-200/40'
                  : 'text-[#64748B] hover:text-[#0A1628] border border-transparent'
              }`}
            >
              <MaterialSymbol name="apps" size={17} color={viewMode === 'services' ? '#2458D3' : 'currentColor'} />
              Сервисы
            </button>
          </div>
        </div>

        {/* SERVICES VIEW MODE */}
        {viewMode === 'services' && (
          <>
            {isLoading ? <WorkspaceSkeletons /> : null}

            {!isLoading ? (
              <WorkspaceDashboard
                hubData={hubData}
                calendarEvents={calendarEvents}
                workspaceGoals={workspaceGoals}
                epsUnreadMailbox={epsUnreadMailbox}
                userName={userName}
                appsCount={apps.length}
              />
            ) : null}

            {!isLoading && apps.length === 0 && !showEpsApp ? (
              <CardShell className="mt-10 p-10 text-center flex flex-col items-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#EEF2FF]">
                  <MaterialSymbol name="apps" size={24} color="#2458D3" />
                </div>
                <h2 className="text-lg font-bold text-[#0A1628]">У вас пока нет избранных приложений</h2>
                <p className="mt-2 text-sm text-[#8497B4]">После добавления в избранное приложения появятся здесь.</p>
                <button
                  type="button"
                  onClick={() => navigate('/teamstore')}
                  className="ts-button ts-button--primary mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2458D3] hover:bg-[#253CB1] text-white text-sm font-bold transition shadow-sm cursor-pointer"
                >
                  <MaterialSymbol name="storefront" size={18} color="#fff" />
                  <span>Перейти в AlemStore</span>
                </button>
              </CardShell>
            ) : null}

            {!isLoading && showPinnedAppsSection ? (
              <section className="mt-10 space-y-5 border-t border-[#ECEEF3] pt-8">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-[#111827]">
                      Закрепленные приложения
                    </h2>
                    <p className="mt-1 text-[13px] text-[#94A3B8]">
                      Быстрый доступ к вашим приложениям
                    </p>
                  </div>

                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                    <label className="relative w-full sm:w-[220px]">
                      <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Поиск инструментов..."
                        className="h-10 w-full rounded-full border border-[#E5E7EB] bg-white pl-10 pr-3 text-[13px] font-normal text-[#374151] outline-none transition placeholder:text-[#9CA3AF] focus:border-[#DBEAFE] focus:ring-2 focus:ring-[#EEF2FF]"
                      />
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8CA0BE]">
                        <MaterialSymbol name="search" size={17} color="currentColor" />
                      </span>
                    </label>

                    {allTags.length > 0 ? (
                      <div ref={dropdownRef} className="relative w-full sm:w-[150px]">
                        <button
                          type="button"
                          onClick={() => setIsDropdownOpen((prev) => !prev)}
                          className={[
                            'flex h-10 w-full items-center justify-between rounded-full border bg-white pl-10 pr-4 text-[13px] font-semibold outline-none transition-all duration-200 select-none text-left',
                            isDropdownOpen
                              ? 'border-[#DBEAFE] ring-2 ring-[#EEF2FF] text-[#2458D3]'
                              : 'border-[#E5E7EB] text-[#4B5563] hover:border-[#D1D5DB] hover:bg-[#F9FAFB] hover:text-[#111827]',
                          ].join(' ')}
                        >
                          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]">
                            <MaterialSymbol name="filter_list" size={16} color="currentColor" />
                          </span>
                          <span className="truncate pr-1">{selectedTag || 'Все теги'}</span>
                          <MaterialSymbol
                            name="keyboard_arrow_down"
                            size={16}
                            color="currentColor"
                            style={{
                              transform: isDropdownOpen ? 'rotate(180deg)' : 'none',
                              transition: 'transform 200ms ease',
                            }}
                          />
                        </button>

                        {isDropdownOpen && (
                          <div className="absolute right-0 top-full z-50 mt-1.5 w-full min-w-[160px] overflow-hidden rounded-2xl border border-[#E2EAF5] bg-white py-1.5 shadow-[0_12px_34px_rgba(15,31,58,0.14)]">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTag(null)
                                setIsDropdownOpen(false)
                              }}
                              className={[
                                'flex w-full items-center px-4 py-2 text-left text-[13px] transition-colors',
                                !selectedTag
                                  ? 'bg-[#EEF2FF] font-bold text-[#2458D3]'
                                  : 'font-medium text-[#4B5563] hover:bg-[#F3F4F6] hover:text-[#111827]',
                              ].join(' ')}
                            >
                              Все теги
                            </button>
                            {allTags.map((tag) => (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => {
                                  setSelectedTag(tag)
                                  setIsDropdownOpen(false)
                                }}
                                className={[
                                  'flex w-full items-center px-4 py-2 text-left text-[13px] transition-colors',
                                  selectedTag === tag
                                    ? 'bg-[#EEF2FF] font-bold text-[#2458D3]'
                                    : 'font-medium text-[#4B5563] hover:bg-[#F3F4F6] hover:text-[#111827]',
                                ].join(' ')}
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => navigate('/teamstore')}
                      className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-[#111827] px-4 text-[13px] font-medium text-white transition hover:bg-[#1F2937]"
                    >
                      <MaterialSymbol name="add" size={18} color="#fff" />
                      AlemStore
                    </button>
                  </div>
                </div>

                {!reorderAllowed ? (
                  <p className="text-[13px] font-medium text-[#6B7F9A]">Перетаскивание доступно без поиска</p>
                ) : null}

                {filteredApps.length === 0 && !showEpsInGrid ? (
                  <CardShell className="p-10 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#F3F4F6]">
                      <MaterialSymbol name="search" size={24} color="#6B7280" />
                    </div>
                    <h2 className="text-base font-semibold text-[#111827]">Ничего не найдено</h2>
                    <p className="mt-1 text-sm text-[#6B7280]">Измените поисковый запрос или очистите фильтр.</p>
                  </CardShell>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {showEpsInGrid ? (
                      <WorkspaceEpsAppCard
                        unreadTotal={epsUnreadMailbox?.unreadTotal ?? 0}
                        onOpen={() => navigate('/eps')}
                      />
                    ) : null}
                    {filteredApps.map((app) => (
                      <div key={app.id} className={dragOverAppId === app.id ? 'rounded-2xl ring-2 ring-[#2458D3]/30 ring-offset-2 ring-offset-white' : ''}>
                        <WorkspaceAppCard
                          app={app}
                          variant="compact"
                          draggable={reorderAllowed && !isReordering && removingId === null}
                          isRemoving={removingId === app.id}
                          isRatingPending={pendingRatingId === app.id}
                          onOpen={handleOpen}
                          onRate={(target, rating) => {
                            void handleRate(target, rating)
                          }}
                          onClearRating={(target) => {
                            void handleClearRating(target)
                          }}
                          onDragStart={setDraggedAppId}
                          onDragOver={setDragOverAppId}
                          onDrop={(targetId) => {
                            void handleDrop(targetId)
                          }}
                          onDragEnd={() => {
                            setDraggedAppId(null)
                            setDragOverAppId(null)
                          }}
                          onRemove={(appId) => {
                            void handleRemove(appId)
                          }}
                        />
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => navigate('/teamstore')}
                      className="flex min-h-[168px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[#D1D5DB] bg-white p-6 text-center transition hover:border-[#DBEAFE] hover:bg-[#EEF2FF]"
                    >
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#EEF2FF] text-[#2458D3]">
                        <MaterialSymbol name="add" size={20} color="currentColor" />
                      </span>
                      <p className="text-[14px] font-medium text-[#374151]">Добавить приложение</p>
                    </button>
                  </div>
                )}
              </section>
            ) : null}
          </>
        )}

        {/* NEWS & WORKSPACE FEED VIEW MODE */}
        {viewMode === 'news' && (
          <>
            {selectedPortalMinistryId === null ? (
              <>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6 text-left">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-[#EEF2FF] flex items-center justify-center text-[#2458D3] shrink-0 shadow-sm border border-[#E2E8F0]/30">
                      <MaterialSymbol name="feed" size={22} color="currentColor" />
                    </div>
                    <div>
                      <h1 className="text-[22px] font-extrabold text-[#0A1628] tracking-tight">Рабочая лента</h1>
                      <p className="text-[13px] text-[#64748B] mt-1">Новости, объявления и кадровые обновления от министерств и ведомств</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center flex-wrap gap-2.5 self-start md:self-auto">
                    {((selectedOrgId === 'all' || selectedOrgId === String(currentProfile?.ministryId)) &&
                      (selectedDeptId === 'all' || selectedDeptId === String(currentProfile?.departmentId))) && (
                      <button
                        onClick={openCreatePublicationModal}
                        className="ts-button ts-button--primary inline-flex h-10 items-center gap-2 bg-[#2458D3] hover:bg-[#253CB1] text-white px-5 rounded-xl text-[12.5px] font-bold transition-all shadow-[0_4px_12px_rgba(47,75,226,0.2)] cursor-pointer"
                      >
                        <MaterialSymbol name="edit" size={16} color="#fff" />
                        <span>Создать публикацию</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex border-b border-[#ECEEF3] mb-8 select-none overflow-x-auto pb-0 custom-scrollbar text-left">
                  {[
                    { id: 'all', label: 'Все' },
                    { id: 'news', label: 'Новости' },
                    { id: 'announcement', label: 'Объявления' },
                    { id: 'document', label: 'Документы' },
                    { id: 'event', label: 'События' }
                  ].map(tab => {
                    const isActive = selectedNewsType === tab.id
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setSelectedNewsType(tab.id)}
                        className={`pb-3.5 px-5 text-[13.5px] font-semibold transition-colors relative outline-none cursor-pointer shrink-0 ${
                          isActive ? 'text-[#2458D3]' : 'text-[#64748B] hover:text-[#0A1628]'
                        }`}
                      >
                        {tab.label}
                        {isActive && (
                          <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#2458D3] rounded-t-full" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </>
            ) : null}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-left">
            
            {/* Left Column - Мои организации */}
            <div className="lg:col-span-3 space-y-6 lg:sticky lg:top-[68px] lg:self-start">
              <div className="bg-white rounded-3xl border border-[#ECEEF3] p-5 shadow-[0_8px_30px_rgba(15,23,42,0.02)] space-y-5">
                
                <div>
                  <div className="flex items-center justify-between text-[#0A1628] font-bold text-[14px] mb-3">
                    <span>Мои организации</span>
                    <MaterialSymbol name="chevron_right" size={18} color="#94A3B8" />
                  </div>
                  
                  <div className="space-y-1.5 max-h-[400px] overflow-y-auto overflow-x-hidden pr-1 pb-3 custom-scrollbar">
                    {/* "Все публикации" */}
                    <button
                      onClick={() => void handleSelectOrg('all')}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-2xl text-left transition-all ${
                        selectedOrgId === 'all' ? 'bg-[#EEF2FF] text-[#2458D3] font-semibold' : 'hover:bg-[#F8FAFC] text-[#4B5563]'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                        selectedOrgId === 'all' ? 'bg-[#2458D3] text-white' : 'bg-[#EEF2FF] text-[#2458D3]'
                      }`}>
                        <MaterialSymbol name="feed" size={16} color="currentColor" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span className={`text-[12.5px] truncate ${selectedOrgId === 'all' ? 'text-[#2458D3] font-semibold' : 'font-medium'}`}>Все публикации</span>
                        </div>
                        <div className="text-[10px] text-[#94A3B8] truncate">Общая рабочая лента</div>
                      </div>
                    </button>

                    {/* Ministries */}
                    {ministries.map(m => {
                      const isSelected = selectedOrgId === String(m.id)
                      const isOwnMinistry = String(m.id) === String(currentProfile?.ministryId)
                      const isExpanded = expandedOrgIds[String(m.id)]

                      return (
                        <div key={m.id} className="space-y-1">
                          <div className="flex items-center gap-1.5 w-full group">
                            <button
                              onClick={() => void handleSelectOrg(String(m.id))}
                              className={`flex-1 min-w-0 flex items-center gap-3 p-2.5 rounded-2xl text-left transition-all ${
                                isSelected ? 'bg-[#EEF2FF] text-[#2458D3]' : 'hover:bg-[#F8FAFC] text-[#4B5563]'
                              }`}
                            >
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                                isSelected ? 'bg-[#2458D3] text-white' : 'bg-[#EEF2FF] text-[#2458D3]'
                              }`}>
                                <MaterialSymbol name="domain" size={16} color="currentColor" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1">
                                  <span className={`text-[12.5px] truncate ${isSelected ? 'font-semibold' : 'font-medium'}`}>{m.name}</span>
                                  {isOwnMinistry && <MaterialSymbol name="verified" size={13} color="#2458D3" />}
                                </div>
                                <div className="text-[10px] text-[#94A3B8] truncate">Официальное ведомство</div>
                              </div>
                            </button>

                            {/* Collapse/Expand Toggle Button */}
                            <button
                              onClick={(e) => void toggleOrgExpansion(String(m.id), e)}
                              className={`w-8.5 h-8.5 rounded-xl flex items-center justify-center text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#0A1628] transition shrink-0 ${
                                isSelected ? 'bg-[#EEF2FF]/60 text-[#2458D3]' : ''
                              }`}
                              title={isExpanded ? 'Свернуть подразделения' : 'Развернуть подразделения'}
                            >
                              <MaterialSymbol name={isExpanded ? 'expand_less' : 'expand_more'} size={18} />
                            </button>
                          </div>

                          {/* Sub-departments tree view */}
                          {isExpanded && (
                            <div className="pl-3 pr-1 space-y-1 border-l-2 border-[#EEF2FF] ml-4.5 mt-1 mb-1">
                              {/* "Все подразделения" options button inside the ministry tree */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void handleSelectOrg(String(m.id))
                                }}
                                className={`w-full min-w-0 flex items-center gap-2 p-2 rounded-xl text-left transition-all ${
                                  isSelected && selectedDeptId === 'all' ? 'bg-[#F1F5F9] text-[#0A1628] font-bold' : 'hover:bg-[#F8FAFC] text-[#64748B]'
                                }`}
                              >
                                <MaterialSymbol name="feed" size={14} color="currentColor" />
                                <span className="text-[11px] truncate">Все подразделения</span>
                              </button>

                              {/* Department list loader or items */}
                              {!ministryDepartments[String(m.id)] ? (
                                <div className="text-[10.5px] text-[#94A3B8] pl-6.5 py-1.5 flex items-center gap-1.5">
                                  <svg className="animate-spin h-3.5 w-3.5 text-[#2458D3]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  <span>Загрузка подразделений...</span>
                                </div>
                              ) : ministryDepartments[String(m.id)].length === 0 ? (
                                <div className="text-[10.5px] text-[#94A3B8] pl-6.5 py-1">Нет подразделений</div>
                              ) : (
                                ministryDepartments[String(m.id)].map(dept => {
                                  const isDeptSelected = isSelected && selectedDeptId === String(dept.id)
                                  return (
                                    <button
                                      key={dept.id}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        applyFeedOrgSelection(String(m.id), String(dept.id))
                                      }}
                                      className={`w-full min-w-0 flex items-center gap-2 p-2 rounded-xl text-left transition-all ${
                                        isDeptSelected ? 'bg-[#F1F5F9] text-[#2458D3] font-semibold' : 'hover:bg-[#F8FAFC] text-[#64748B]'
                                      }`}
                                    >
                                      <MaterialSymbol name="subdirectory_arrow_right" size={14} color="currentColor" />
                                      <span className="text-[11px] truncate" title={dept.name}>{dept.name}</span>
                                    </button>
                                  )
                                })
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

              </div>
            </div>

            {selectedPortalMinistryId !== null ? (
              <MinistryWorkspaceView
                ministryId={Number(selectedPortalMinistryId)}
                ministryName={ministries.find((item) => String(item.id) === selectedPortalMinistryId)?.name || 'Министерство'}
                ministryRepository={ministryRepo}
                loadMinistryPublications={loadMinistryPublications}
                currentProfile={currentProfile}
                currentUserId={currentUserId}
                pubRepo={pubRepo}
                onShare={handleShare}
                onAcknowledge={handleAcknowledge}
                onEditPub={openEditPublicationModal}
                onDeletePub={handleDeletePub}
                onCommentCountChange={handleCommentCountChange}
                setPreviewImageUrl={setPreviewImageUrl}
                formatPubDate={formatPubDate}
                setToast={setToast}
                setAppError={setError}
                onBackToFeed={() => {
                  setSelectedPortalMinistryId(null)
                }}
              />
            ) : (
              <>
                {/* Middle Column - Лента публикаций */}
                <div className="lg:col-span-6 space-y-5">

                  {/* Publication list */}
                  {newsLoading ? (
                    <div className="space-y-4">
                      {[1, 2].map(n => (
                        <div key={n} className="bg-white rounded-3xl border border-[#ECEEF3] p-6 space-y-4 animate-pulse">
                          <div className="flex gap-3 items-center">
                            <div className="w-10 h-10 rounded-full bg-[#E5E7EB]" />
                            <div className="space-y-2 flex-1">
                              <div className="h-4 bg-[#E5E7EB] rounded w-1/4" />
                              <div className="h-3 bg-[#E5E7EB] rounded w-1/6" />
                            </div>
                          </div>
                          <div className="h-6 bg-[#E5E7EB] rounded w-3/4" />
                          <div className="h-16 bg-[#E5E7EB] rounded w-full" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredPublications.map(pub => (
                        <PublicationCard
                          key={pub.id}
                          pub={pub}
                          currentProfile={currentProfile}
                          currentUserId={currentUserId}
                          pubRepo={pubRepo}
                          onShare={handleShare}
                          onAcknowledge={handleAcknowledge}
                          onEditPub={openEditPublicationModal}
                          onDeletePub={handleDeletePub}
                          onCommentCountChange={handleCommentCountChange}
                          setPreviewImageUrl={setPreviewImageUrl}
                          formatPubDate={formatPubDate}
                          onOpenMinistry={(ministryId) => {
                            orgFeedTouchedByUserRef.current = true;
                            orgFeedInitializedRef.current = true;
                            setSelectedPortalMinistryId(String(ministryId));
                          }}
                          setError={setError}
                          setToast={setToast}
                        />
                      ))}
                      {filteredPublications.length === 0 && (
                        <div className="bg-white rounded-3xl border border-[#ECEEF3] p-10 text-center text-[#8497B4]">
                          Лента пуста. Будьте первыми, кто создаст публикацию!
                        </div>
                      )}

                      <div className="h-4" />

                      {loadingMoreNews && (
                        <div className="flex items-center justify-center py-4">
                          <div className="flex items-center gap-2 text-[#8497B4] text-[12.5px] font-medium">
                            <svg className="animate-spin h-5 w-5 text-[#2458D3]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span>Загрузка новостей...</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Right Column - Виджеты событий/отпусков */}
                <div className="lg:col-span-3 space-y-6 lg:sticky lg:top-[68px] lg:self-start">
              
              {/* Сотрудники в отпуске */}
              <div className="bg-white rounded-3xl border border-[#ECEEF3] p-5 shadow-[0_8px_30px_rgba(15,23,42,0.02)]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <MaterialSymbol name="wb_sunny" size={18} color="#FB923C" />
                    <h3 className="text-[13.5px] font-bold text-[#0A1628]">Сотрудники в отпуске</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsVacationsModalOpen(true)}
                    className="text-[11px] font-semibold text-[#2458D3] hover:underline disabled:text-[#94A3B8] disabled:no-underline"
                    disabled={managementVacations.length === 0}
                  >
                    Показать все
                  </button>
                </div>
                <div className="space-y-3">
                  {vacationsLoading ? (
                    <div className="space-y-2.5 animate-pulse">
                      {[1, 2].map((n) => (
                        <div key={n} className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#E5E7EB] shrink-0" />
                          <div className="flex-1 space-y-1.5 min-w-0">
                            <div className="h-3 bg-[#E5E7EB] rounded w-3/4" />
                            <div className="h-2 bg-[#E5E7EB] rounded w-1/2" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : managementVacations.length === 0 ? (
                    <div className="text-[12px] text-[#64748B] text-center py-2">
                      Сейчас никто не в отпуске
                    </div>
                  ) : (
                    managementVacations.map((v, idx) => {
                      const fullName = `${v.last_name} ${v.first_name}`.trim()
                      const initials = `${v.first_name?.slice(0, 1) || ''}${v.last_name?.slice(0, 1) || ''}`.toUpperCase() || 'Р'
                      const hasVacationDates = Boolean(v.begin_date && v.end_date)
                      const dates = hasVacationDates ? formatDateRange(v.begin_date, v.end_date) : ''
                      const duration = hasVacationDates ? getDurationText(v.begin_date, v.end_date) : 'В отпуске'
                      const positionLabel = v.position?.trim() || ''
                      return (
                        <div key={v.user_id || idx} className="flex items-center justify-between gap-3 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            {v.avatar_url ? (
                              <img
                                src={v.avatar_url}
                                alt={fullName}
                                className="w-8 h-8 rounded-full object-cover shrink-0"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-[#EEF2FF] text-[#2458D3] flex items-center justify-center text-[11px] font-bold shrink-0">
                                {initials}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="text-[12.5px] font-semibold text-[#0A1628] truncate">{fullName}</div>
                              {positionLabel ? (
                                <div className="text-[10px] text-[#8497B4] truncate" title={positionLabel}>
                                  {positionLabel}
                                </div>
                              ) : null}
                              {dates ? (
                                <div className="text-[9.5px] text-[#2458D3] mt-0.5 font-medium truncate">{dates}</div>
                              ) : null}
                            </div>
                          </div>
                          <span className="text-[10px] text-[#64748B] bg-[#F1F5F9] px-2 py-0.5 rounded-full shrink-0">
                            {duration}
                          </span>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Важные объявления */}
              <div className="bg-white rounded-3xl border border-[#ECEEF3] p-5 shadow-[0_8px_30px_rgba(15,23,42,0.02)]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <MaterialSymbol name="campaign" size={18} color="#EF4444" />
                    <h3 className="text-[13.5px] font-bold text-[#0A1628]">Важные объявления</h3>
                  </div>
                  <button
                    onClick={() => {
                      setViewMode('news')
                      setSelectedNewsType('announcement')
                      applyFeedOrgSelection('all')
                    }}
                    className="text-[11px] font-semibold text-[#2458D3] hover:underline"
                  >
                    Показать все
                  </button>
                </div>
                <div className="space-y-3.5">
                  {importantAnnouncementsLoading ? (
                    <div className="space-y-3 animate-pulse">
                      {[1, 2, 3].map((item) => (
                        <div key={item} className="space-y-1.5">
                          <div className="h-4 w-5/6 rounded bg-[#E5E7EB]" />
                          <div className="h-3 w-full rounded bg-[#E5E7EB]" />
                          <div className="h-3 w-1/3 rounded bg-[#E5E7EB]" />
                        </div>
                      ))}
                    </div>
                  ) : prioritizedAnnouncements.length === 0 ? (
                    <div className="text-[12px] text-[#64748B] text-center py-2">
                      Сейчас нет важных объявлений
                    </div>
                  ) : (
                    prioritizedAnnouncements.map((pub) => (
                      <button
                        key={pub.id}
                        type="button"
                        onClick={() => {
                          setViewMode('news')
                          setSelectedNewsType('announcement')
                          applyFeedOrgSelection('all')
                        }}
                        className="block w-full text-left space-y-0.5"
                      >
                        <div className="text-[12.5px] font-bold text-[#0A1628] leading-snug hover:text-[#2458D3] transition">
                          {pub.title}
                        </div>
                        <div className="text-[11px] text-[#64748B] leading-relaxed line-clamp-2">
                          {getPublicationExcerpt(pub.content)}
                        </div>
                        <div className="text-[9.5px] text-[#94A3B8]">{formatPubDate(pub.published_at)}</div>
                      </button>
                    ))
                  )}
                </div>
              </div>


              {/* Сегодняшние события */}
              <div className="bg-white rounded-3xl border border-[#ECEEF3] p-5 shadow-[0_8px_30px_rgba(15,23,42,0.02)]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <MaterialSymbol name="event" size={18} color="#2458D3" />
                    <h3 className="text-[13.5px] font-bold text-[#0A1628]">Сегодняшние события</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/calendar')}
                    className="text-[11px] font-semibold text-[#2458D3] hover:underline"
                  >
                    Календарь
                  </button>
                </div>
                <div className="space-y-3">
                  {todayCalendarEvents.length > 0 ? todayCalendarEvents.map((event) => {
                    const metaLabel = event.isOnline ? (event.location || 'Онлайн') : (event.location || 'Место не указано')
                    const dotColor = event.color || (event.isOnline ? '#14B8A6' : '#F59E0B')

                    return (
                      <div key={event.id} className="flex gap-2.5">
                        <div className="text-[11.5px] font-bold text-[#2458D3] pt-0.5 min-w-[52px]">{event.isAllDay ? 'Весь день' : event.timeLabel}</div>
                        <div className="flex-1 space-y-0.5">
                          <div className="text-[12.5px] font-semibold text-[#0A1628] leading-tight">{event.title}</div>
                          <div className="text-[10px] text-[#8497B4] flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dotColor }} />
                            <span>{metaLabel}</span>
                          </div>
                        </div>
                      </div>
                    )
                  }) : (
                    <div className="rounded-2xl bg-[#F8FAFC] px-4 py-5 text-center text-[12px] text-[#8497B4]">
                      На сегодня событий нет
                    </div>
                  )}
                </div>
              </div>
              </div>
              </>
            )}
            </div>
          </>
        )}
      </div>

      {isVacationsModalOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="ts-legacy-backdrop fixed inset-0 z-[10050] flex items-center justify-center bg-[#0A1628]/55 backdrop-blur-sm p-4"
            onClick={() => setIsVacationsModalOpen(false)}
          >
            <div
              className="ts-legacy-dialog w-full max-w-[720px] max-h-[88vh] overflow-hidden rounded-[28px] border border-[#E2E8F0] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[#ECEEF3] px-6 py-5">
                <div>
                  <div className="text-[20px] font-bold text-[#0A1628]">Все сотрудники в отпуске</div>
                  <div className="mt-1 text-[12px] text-[#64748B]">Найдено: {managementVacations.length}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsVacationsModalOpen(false)}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#E2E8F0] text-[#64748B] transition hover:border-[#CBD5E1] hover:bg-[#F8FAFC] hover:text-[#0A1628]"
                >
                  <MaterialSymbol name="close" size={20} />
                </button>
              </div>
              <div className="max-h-[calc(88vh-92px)] overflow-y-auto px-6 py-5">
                {managementVacations.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-6 py-10 text-center text-[14px] text-[#64748B]">
                    Сейчас никто не в отпуске
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {managementVacations.map((v, idx) => {
                      const fullName = `${v.last_name} ${v.first_name}`.trim()
                      const initials =
                        `${v.first_name?.slice(0, 1) || ''}${v.last_name?.slice(0, 1) || ''}`.toUpperCase() || 'С'
                      const hasVacationDates = Boolean(v.begin_date && v.end_date)
                      const dates = hasVacationDates ? formatDateRange(v.begin_date, v.end_date) : ''
                      const duration = hasVacationDates ? getDurationText(v.begin_date, v.end_date) : 'В отпуске'
                      const positionLabel = v.position?.trim() || ''

                      return (
                        <div
                          key={v.user_id || idx}
                          className="rounded-3xl border border-[#E8EEF7] bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FBFF_100%)] p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)]"
                        >
                          <div className="flex items-start gap-3">
                            {v.avatar_url ? (
                              <img
                                src={v.avatar_url}
                                alt={fullName}
                                className="h-12 w-12 rounded-2xl object-cover shrink-0 border border-[#E2E8F0]"
                              />
                            ) : (
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#EEF2FF] text-[14px] font-bold text-[#2458D3]">
                                {initials}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[14px] font-bold text-[#0A1628]">{fullName}</div>
                              {positionLabel ? (
                                <div className="mt-1 truncate text-[11px] text-[#64748B]" title={positionLabel}>
                                  {positionLabel}
                                </div>
                              ) : null}
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                {dates ? (
                                  <span className="inline-flex items-center rounded-full bg-[#EEF2FF] px-2.5 py-1 text-[10px] font-semibold text-[#2458D3]">
                                    {dates}
                                  </span>
                                ) : null}
                                <span className="inline-flex items-center rounded-full bg-[#F1F5F9] px-2.5 py-1 text-[10px] font-semibold text-[#475569]">
                                  {duration}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* CREATE PUBLICATION MODAL DIALOG */}
      {isCreateModalOpen && (
        <div className="ts-legacy-backdrop fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="ts-legacy-dialog bg-white rounded-[24px] shadow-[0_24px_60px_rgba(10,22,40,0.18)] w-full max-w-[1200px] max-h-[90vh] overflow-hidden flex flex-col font-sans border border-[#E2EAF5]">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4.5 border-b border-[#ECEEF3] shrink-0 text-left">
              <h2 className="text-[17px] font-bold text-[#0A1628]">{isEditingPublication ? 'Редактировать публикацию' : 'Создать публикацию'}</h2>
              <button
                onClick={closePublicationModal}
                className="text-[#8497B4] hover:text-[#0A1628] p-1 rounded-xl hover:bg-[#F3F4F6] transition"
              >
                <MaterialSymbol name="close" size={22} />
              </button>
            </div>
            
            {/* Modal Content - 2 Columns */}
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8 text-left">
              
              {/* Form Fields Column */}
              <div className="lg:col-span-7 space-y-6">
                
                {/* 1. От кого публикуем */}
                <div className="space-y-2.5">
                  <label className="text-[12.5px] font-bold text-[#0A1628]">От кого публикуем?</label>
                  <div className="grid grid-cols-1 max-w-xs gap-3">
                    
                    {/* От себя */}
                    <button
                      onClick={() => setPubSourceType('user')}
                      className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                        pubSourceType === 'user'
                          ? 'border-[#2458D3] bg-[#EEF2FF]/40 ring-1 ring-[#2458D3]'
                          : 'border-[#E5E7EB] hover:border-[#D1D5DB] hover:bg-[#F9FAFB]'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-3">
                        <div className="w-8 h-8 rounded-full bg-white border border-[#E5E7EB] flex items-center justify-center text-[#2458D3]">
                          <MaterialSymbol name="person" size={18} />
                        </div>
                        {pubSourceType === 'user' && <MaterialSymbol name="check_circle" size={18} color="#2458D3" />}
                      </div>
                      <div>
                        <div className="text-[13px] font-bold text-[#0A1628] truncate">{currentProfile?.fullName || 'Тамерлан Картаев'}</div>
                        {currentProfile?.position ? (
                          <div className="text-[10px] text-[#8497B4] mt-0.5 truncate">{currentProfile?.position}</div>
                        ) : null}
                      </div>
                    </button>
                  </div>
                </div>

                {/* 2. Тип публикации */}
                <div className="space-y-2.5">
                  <label className="text-[12.5px] font-bold text-[#0A1628]">Тип публикации</label>
                  <div className="flex flex-wrap gap-2 select-none">
                    {[
                      { id: 'news', label: 'Новость' },
                      { id: 'announcement', label: 'Объявление' },
                      { id: 'document', label: 'Документ' },
                      { id: 'event', label: 'Событие' },
                      { id: 'appeal', label: 'Обращение' }
                    ].map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setPubType(t.id as any)}
                        className={`h-9 px-4 rounded-xl text-[12.5px] font-medium border transition-all ${
                          pubType === t.id
                            ? 'bg-[#EEF2FF] border-[#2458D3] text-[#2458D3] font-semibold'
                            : 'bg-white border-[#E5E7EB] text-[#4B5563] hover:border-[#D1D5DB]'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Заголовок */}
                <div className="space-y-2">
                  <label className="text-[12.5px] font-bold text-[#0A1628]">Заголовок</label>
                  <input
                    value={pubTitle}
                    onChange={e => setPubTitle(e.target.value)}
                    placeholder="Введите заголовок публикации..."
                    className="w-full h-11 px-4.5 rounded-2xl border border-[#E5E7EB] text-[13px] outline-none focus:border-[#2458D3] transition"
                  />
                </div>

                {/* 4. Текст */}
                <div className="space-y-2">
                  <label className="text-[12.5px] font-bold text-[#0A1628]">Текст публикации</label>
                  <textarea
                    value={pubContent}
                    onChange={e => setPubContent(e.target.value)}
                    placeholder="Введите текст публикации..."
                    rows={5}
                    className="w-full p-4.5 rounded-2xl border border-[#E5E7EB] text-[13px] outline-none focus:border-[#2458D3] transition resize-none leading-relaxed"
                  />
                </div>

                {/* 5. Вложения */}
                <div className="space-y-3">
                  <label className="text-[12.5px] font-bold text-[#0A1628]">Вложения</label>
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex h-9 items-center gap-1.5 border border-[#E5E7EB] text-[#4B5563] px-3.5 rounded-xl text-[12px] font-semibold hover:bg-[#F9FAFB] cursor-pointer transition">
                      <MaterialSymbol name="attach_file" size={15} />
                      <span>Прикрепить файл</span>
                      <input type="file" onChange={handleFileSelect} className="hidden" />
                    </label>
                  </div>

                  {pubAttachments.length > 0 && (
                    <div className="space-y-2">
                      {pubAttachments.map((att, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 rounded-2xl bg-[#F8FAFC] border border-[#ECEEF3]">
                          <div className="flex items-center gap-2.5">
                            <MaterialSymbol name="description" size={20} color="#64748B" />
                            <div className="text-[12.5px] font-medium text-[#0A1628] truncate max-w-[280px]">{att.name}</div>
                          </div>
                          <button
                            onClick={() => setPubAttachments(prev => prev.filter((_, i) => i !== idx))}
                            className="text-[#8497B4] hover:text-[#EF4444] transition-colors"
                          >
                            <MaterialSymbol name="close" size={18} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 6. Аудитория */}
                <div className="space-y-2.5">
                  <label className="text-[12.5px] font-bold text-[#0A1628]">Аудитория</label>
                  <div className="flex flex-wrap gap-2 select-none">
                    {[
                      { id: 'all', label: 'Все сотрудники' },
                    ].map(a => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setPubTargetAudience(a.id as any)}
                        className={`h-9 px-4 rounded-xl text-[12.5px] font-medium border transition-all ${
                          pubTargetAudience === a.id
                            ? 'bg-[#EEF2FF] border-[#2458D3] text-[#2458D3] font-semibold'
                            : 'bg-white border-[#E5E7EB] text-[#4B5563] hover:border-[#D1D5DB]'
                        }`}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 7. Важность */}
                <div className="space-y-2.5">
                  <label className="text-[12.5px] font-bold text-[#0A1628]">Важность</label>
                  <div className="flex flex-wrap gap-2 select-none">
                    {[
                      { id: 'normal', label: 'Обычная' },
                      { id: 'important', label: 'Важная' },
                      { id: 'urgent', label: 'Срочная' }
                    ].map(i => (
                      <button
                        key={i.id}
                        type="button"
                        onClick={() => setPubImportance(i.id as any)}
                        className={`h-9 px-4 rounded-xl text-[12.5px] font-medium border transition-all ${
                          pubImportance === i.id
                            ? 'bg-[#EEF2FF] border-[#2458D3] text-[#2458D3] font-semibold'
                            : 'bg-white border-[#E5E7EB] text-[#4B5563] hover:border-[#D1D5DB]'
                        }`}
                      >
                        {i.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 8. Дополнительно */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-[12.5px] font-medium text-[#4B5563]">
                      <input
                        type="checkbox"
                        checked={!pubAllowComments}
                        onChange={e => setPubAllowComments(!e.target.checked)}
                        className="w-4 h-4 rounded border-[#E5E7EB] text-[#2458D3] focus:ring-[#EEF2FF]"
                      />
                      <span>Отключить комментарии</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none text-[12.5px] font-medium text-[#4B5563]">
                      <input
                        type="checkbox"
                        checked={pubRequiresAck}
                        onChange={e => setPubRequiresAck(e.target.checked)}
                        className="w-4 h-4 rounded border-[#E5E7EB] text-[#2458D3] focus:ring-[#EEF2FF]"
                      />
                      <span>Требуется подтверждение ознакомления</span>
                    </label>
                  </div>
                </div>

                {/* Info Notice */}
                <div className="flex gap-2.5 p-4.5 rounded-2xl bg-[#EFF6FF] border border-[#BFDBFE] text-left">
                  <MaterialSymbol name="info" size={18} color="#2458D3" className="shrink-0 pt-0.5" />
                  <p className="text-[11.5px] text-[#1E3A8A] leading-relaxed font-medium">
                    Убедитесь, что перед публикацией проверили все вложения и реквизиты. После публикации изменения не применяются мгновенно.
                  </p>
                </div>
              </div>
              
              {/* Dynamic Preview Column */}
              <div className="lg:col-span-5 border-l border-[#ECEEF3] pl-0 lg:pl-8 space-y-4">
                <h3 className="text-[12.5px] font-bold text-[#8497B4] tracking-wider uppercase">Предпросмотр</h3>
                
                {/* Simulated Post Card */}
                <div className="bg-white rounded-3xl border border-[#ECEEF3] p-5.5 shadow-[0_12px_40px_rgba(15,23,42,0.04)] space-y-4 text-left">
                  
                  {/* Card Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      {pubSourceType !== 'user' ? (
                        <img
                          src={kazakhstanCoatOfArms}
                          alt="Герб Республики Казахстан"
                          referrerPolicy="no-referrer"
                          className="w-9 h-9 object-cover rounded-full border border-[#ECEEF3] p-0.5 bg-white shrink-0"
                        />
                      ) : (
                        <GradientAvatar
                          initials={(currentProfile?.fullName || '??').slice(0, 2).toUpperCase()}
                          src={currentProfile?.avatarUrl}
                          size={36}
                          seed={(currentProfile?.fullName || '').charCodeAt(0) || 0}
                        />
                      )}
                      <div>
                        <div className="text-[13px] font-bold text-[#0A1628] leading-tight">
                          {pubSourceType === 'user'
                            ? currentProfile?.fullName || 'Тамерлан Картаев'
                            : pubSourceType === 'ministry'
                            ? 'Министерство цифрового развития'
                            : 'Департамент цифровых сервисов'}
                          {pubSourceType !== 'user' && (
                            <span className="inline-flex items-center ml-1.5 align-middle text-[#2458D3]">
                              <MaterialSymbol name="verified" size={14} color="currentColor" />
                            </span>
                          )}
                        </div>
                        <div className="text-[10.5px] text-[#8497B4] mt-0.5">
                          Сегодня, {new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} • Официальное объявление
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Importance Label inside Preview */}
                  {pubImportance !== 'normal' && (
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      pubImportance === 'urgent' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-amber-50 text-amber-600 border border-amber-100'
                    }`}>
                      {pubImportance === 'urgent' ? 'Срочно' : 'Важно'}
                    </span>
                  )}

                  {/* Title & Body content */}
                  <div className="space-y-2 min-w-0 max-w-full">
                    <h4 className="text-[14.5px] font-bold text-[#0A1628] leading-snug break-words [overflow-wrap:anywhere] [word-break:break-word]">
                      {pubTitle || 'Заголовок вашей новой публикации'}
                    </h4>
                    <p className="text-[12.5px] text-[#4B5563] leading-relaxed whitespace-pre-line break-words [overflow-wrap:anywhere] [word-break:break-word] max-w-full">
                      {renderTextWithLinks(pubContent || 'Здесь будет отображаться текст вашей публикации...')}
                    </p>
                  </div>

                  {/* Attachments list inside Preview */}
                  {pubAttachments.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {pubAttachments.map((att, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-[#F8FAFC] border border-[#ECEEF3]">
                          <div className="flex items-center gap-2">
                            <MaterialSymbol name="description" size={20} color="#64748B" />
                            <div className="text-[12px] font-semibold text-[#0A1628] truncate max-w-[200px]">{att.name}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Acknowledge box inside Preview */}
                  {pubRequiresAck && (
                    <div className="flex items-center justify-between p-3 rounded-xl bg-[#EFF6FF] border border-[#BFDBFE]">
                      <span className="text-[11px] font-semibold text-[#1E3A8A]">Требуется ознакомиться</span>
                      <button className="ts-button ts-button--primary bg-[#2458D3] text-white text-[10.5px] font-bold px-2.5 py-1 rounded-lg">Ознакомлен</button>
                    </div>
                  )}

                  <hr className="border-[#ECEEF3]" />

                  {/* Card Footer */}
                  <div className="flex items-center justify-between text-[#8497B4] text-[11.5px] pt-0.5">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1"><MaterialSymbol name="favorite" size={15} /> 0</div>
                      <div className="flex items-center gap-1"><MaterialSymbol name="chat_bubble" size={14} /> 0</div>
                      <div className="flex items-center gap-1"><MaterialSymbol name="share" size={14} /> 0</div>
                    </div>
                    <div>Просмотры: 0</div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Modal Action Footer */}
            <div className="flex items-center justify-between px-6 py-4.5 border-t border-[#ECEEF3] shrink-0 bg-[#F8FAFC] text-left">
              <button
                type="button"
                onClick={closePublicationModal}
                className="inline-flex h-10 items-center justify-center px-4 rounded-xl text-[12.5px] font-bold text-[#64748B] hover:text-[#0A1628] transition-colors"
              >
                Сохранить черновик
              </button>
              
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closePublicationModal}
                  className="inline-flex h-10 items-center justify-center px-4 rounded-xl border border-[#E5E7EB] bg-white text-[12.5px] font-semibold text-[#4B5563] hover:bg-[#F9FAFB] transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  disabled={isSubmittingPub}
                  onClick={handleSubmitPublication}
                  className="ts-button ts-button--primary inline-flex h-10 items-center justify-center gap-1 bg-[#2458D3] hover:bg-[#253CB1] text-white px-5 rounded-xl text-[12.5px] font-bold transition-all disabled:opacity-50 shadow-[0_4px_12px_rgba(47,75,226,0.2)]"
                >
                  {isSubmittingPub ? 'Публикация...' : 'Опубликовать'}
                  <MaterialSymbol name="navigate_next" size={18} color="#fff" />
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Lightbox full-screen preview modal */}
      {previewImageUrl && (
        <div
          className="ts-legacy-backdrop fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 cursor-zoom-out"
          onClick={() => setPreviewImageUrl(null)}
        >
          <button
            onClick={() => setPreviewImageUrl(null)}
            className="absolute top-6 right-6 text-white hover:text-gray-300 bg-white/10 hover:bg-white/20 p-2.5 rounded-full transition-all"
            title="Закрыть"
          >
            <MaterialSymbol name="close" size={24} />
          </button>
          
          <img
            src={previewImageUrl || undefined}
            alt="Preview"
            className="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl transition-transform duration-350 cursor-default"
            onClick={e => e.stopPropagation()} // Prevent closing when clicking the image itself
          />
        </div>
      )}

      {/* Scroll to Top floating action button */}
      {showScrollTop && (
        <button
          onClick={() => mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-8 right-8 z-50 w-11 h-11 bg-white hover:bg-slate-50 text-[#0A1628] rounded-full flex items-center justify-center shadow-[0_4px_20px_rgba(15,23,42,0.15)] border border-[#E2E8F0] hover:scale-105 transition-all cursor-pointer group"
          title="Наверх"
        >
          <MaterialSymbol
            name="arrow_upward"
            size={20}
            className="text-[#2458D3] group-hover:-translate-y-0.5 transition-transform"
          />
        </button>
      )}

    </main>
  )
}
