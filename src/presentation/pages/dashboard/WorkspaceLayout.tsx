/* eslint-disable */
// @ts-nocheck
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getBrowserNotificationPermission, requestBrowserNotificationPermission } from '../../../shared/notifications/browserNotifications'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { applyProfileLanguage, formatDateTime, i18n } from '../../../shared/i18n'
import { LogoutUseCase } from '../../../application/use-cases/auth/LogoutUseCase'
import { NotificationRealtimeClient } from '../../../infrastructure/notifications/NotificationRealtimeClient'
import { HttpAuthRepository } from '../../../infrastructure/repositories/HttpAuthRepository'
import { HttpProfileRepository } from '../../../infrastructure/repositories/HttpProfileRepository'
import { HttpOrganizationRepository } from '../../../infrastructure/repositories/HttpOrganizationRepository'
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore'
import TopNavLayout from '../../../shared/ui/TopNavLayout'
import WorkspaceTopNav from '../../../shared/ui/WorkspaceTopNav'
import WorkspaceReferenceSidebar from '../../components/workspace/WorkspaceReferenceSidebar'
import AppToast from '../../../shared/ui/AppToast'
import PublicationBannerHost from '../../components/workspace/PublicationBannerHost'
import { notifyPublicationBannersChanged } from '../../../shared/news/publicationBannerEvents'
import { showAppSplash, showAppSplashBeforeRedirect } from '../../../shared/ui/axisSplash'
import { isLocalDevHost } from '../../../shared/auth/isLocalDevHost'
import { isKeycloakBrowserSsoEnabled } from '../../../shared/auth/keycloakBrowserSso'
import MS from '../../../shared/ui/MaterialSymbol'
import {
  AUTH_SESSION_EXPIRED_EVENT,
  PROFILE_UPDATED_EVENT,
  type AuthSessionExpiredDetail,
  type ProfileUpdatedDetail,
} from '../../../shared/auth/authSessionEvents'
import { consumeAuthFlashNotice, storeAuthFlashNotice, type AuthFlashNotice } from '../../../shared/auth/authFlashNotice'
import { C } from './model/constants'
import { createAuthController } from '../../auth/createAuthController'
import { useWorkspaceProfileRole } from '../../auth/useWorkspaceProfileRole'
import MeetCallProvider from '../meet/MeetCallProvider'
import { CallManagerProvider } from '../../calls/CallManagerContext'
import { createCalendarController } from '../../calendar/createCalendarController'
import { useCalendarReminders, type CalendarReminderItem } from '../../calendar/useCalendarReminders'
import { createHomeDashboardController } from '../../dashboard/createHomeDashboardController'
import { getDefaultHomeDashboardViewModel } from '../../view-models/HomeDashboardViewModel'
import { createNotificationController } from '../../notifications/createNotificationController'
import type { NotificationItemViewModel } from '../../view-models/NotificationViewModel'
import { getRealtimeContentRecord, resolveRealtimeConversationId } from '../../../shared/messenger/realtimeConversationId'
import { isInternalChatNotification } from '../../../shared/notifications/internalChatNotifications'
import PeopleSectionSidebar from '../../components/people/PeopleSectionSidebar'
import CrmSectionSidebar from '../../components/crm/CrmSectionSidebar'
import WorkSectionSidebar from '../../components/work/WorkSectionSidebar'
import { PeopleNavContext, isPeopleSectionPath, type PeopleNavState, type PeopleNavTab } from '../../components/people/peopleNav'

const GLOBAL_TOAST_LIMIT = 4
const NOTIFICATION_REFRESH_INTERVAL_MS = 20000

const resolveAnalyticsSection = (pathname: string): { section: string; path: string } | null => {
  const normalizedPath = pathname.trim() || '/'

  if (normalizedPath.startsWith('/team-contact/org-map')) {
    return { section: 'alem_contact_org_map', path: normalizedPath }
  }
  if (normalizedPath.startsWith('/team-contact')) {
    return { section: 'alem_contact', path: normalizedPath }
  }
  if (normalizedPath.startsWith('/workspace') || normalizedPath === '/' || normalizedPath.startsWith('/dashboard')) {
    return { section: 'workspace', path: normalizedPath }
  }
  if (normalizedPath.startsWith('/teamstore')) {
    return { section: 'alemstore', path: normalizedPath }
  }
  if (normalizedPath.startsWith('/calls/calendar')) {
    return { section: 'calls_calendar', path: normalizedPath }
  }
  if (normalizedPath.startsWith('/calendar')) {
    return { section: 'calendar', path: normalizedPath }
  }
  if (normalizedPath.startsWith('/board') || normalizedPath.startsWith('/kanban')) {
    return { section: 'board', path: normalizedPath }
  }
  if (normalizedPath.startsWith('/teamai')) {
    return { section: 'alemai', path: normalizedPath }
  }
  if (normalizedPath.startsWith('/team-rag')) {
    return { section: 'alem_rag', path: normalizedPath }
  }
  if (normalizedPath.startsWith('/drive')) {
    return { section: 'drive', path: normalizedPath }
  }
  if (normalizedPath.startsWith('/news')) {
    return { section: 'news', path: normalizedPath }
  }
  if (normalizedPath.startsWith('/notes')) {
    return { section: 'notes', path: normalizedPath }
  }
  if (normalizedPath.startsWith('/whiteboard')) {
    return { section: 'whiteboard', path: normalizedPath }
  }
  if (normalizedPath.startsWith('/eps')) {
    return { section: 'eps', path: normalizedPath }
  }
  if (normalizedPath.startsWith('/profile')) {
    return { section: 'profile', path: normalizedPath }
  }
  return null
}

type GlobalToastItem = {
  id: string
  title: string
  subtitle: string
  variant: 'success' | 'error' | 'info' | 'warning'
  icon?: string
}

type CalendarInviteResponseStatus = 'accepted' | 'declined' | 'tentative'

const flashNoticeStyles: Record<AuthFlashNotice['kind'], { bg: string; border: string; text: string }> = {
  info: { bg: '#EEF6FF', border: '#DBEAFE', text: '#1B2A8C' },
  warning: { bg: '#FFF7ED', border: '#FED7AA', text: '#9A3412' },
  error: { bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C' },
}

const parseEventTimestamp = (input: unknown): string => {
  if (typeof input === 'string' && input) {
    const date = new Date(input)
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString()
    }
  }

  if (typeof input === 'number') {
    const normalized = input > 1e12 ? input : input * 1000
    const date = new Date(normalized)
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString()
    }
  }

  return new Date().toISOString()
}

const toReadableDate = (iso: string): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return i18n.t('shell:realtime.now')
  return formatDateTime(date, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getRealtimeIcon = (eventType: string): string => {
  if (eventType.includes('call')) return 'call'
  if (eventType.includes('message') || eventType === 'typing') return 'forum'
  if (eventType.includes('chat')) return 'forum'
  if (eventType.includes('kanban') || eventType.includes('task')) return 'task_alt'
  if (eventType.includes('security') || eventType.includes('login')) return 'shield'
  if (eventType.includes('status')) return 'badge'
  return 'notifications'
}

const getRealtimeTaskActionUrl = (metadata?: Record<string, unknown>): string | undefined => {
  if (!metadata) return undefined

  const taskId = pickFirstText(
    metadata.task_id,
    metadata.taskId,
    metadata.kanban_task_id,
    metadata.kanbanTaskId,
  )

  return taskId ? `/board?task=${encodeURIComponent(taskId)}` : undefined
}

const pickFirstText = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === 'string') {
      const normalized = value.trim()
      if (normalized) {
        return normalized
      }
    }
  }
  return ''
}

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

const toRealtimeNotification = (event: Record<string, unknown>): NotificationItemViewModel | null => {
  const eventType = typeof event.type === 'string' ? event.type : ''
  if (!eventType || isInternalChatNotification(event)) return null

  const parsedEventContent = getRealtimeContentRecord(event)
  const objectEventContent =
    event.content && typeof event.content === 'object' && !Array.isArray(event.content)
      ? (event.content as Record<string, unknown>)
      : null
  const eventContent = { ...(parsedEventContent ?? {}), ...(objectEventContent ?? {}) }
  const conversationId = resolveRealtimeConversationId(event)
  const messageId = typeof event.message_id === 'string'
    ? event.message_id
    : typeof event.messageId === 'string'
      ? event.messageId
      : ''
  const notificationId = pickFirstText(
    event.notification_id,
    event.notificationId,
    eventContent.notification_id,
    eventContent.notificationId,
  )
  const createdAt = parseEventTimestamp(event.created_at ?? event.timestamp)
  const senderName = pickFirstText(
    eventContent.sender_full_name,
    eventContent.senderFullName,
    eventContent.from_full_name,
    eventContent.fromFullName,
    eventContent.from_name,
    eventContent.fromName,
    eventContent.sender_name,
    eventContent.senderName,
    eventContent.author_name,
    eventContent.authorName,
    eventContent.user_name,
    eventContent.username,
    eventContent.sender_username,
    eventContent.senderUsername,
    eventContent.full_name,
    eventContent.name,
    event.from_name,
    event.sender_name,
  )
  const senderId = typeof event.from === 'number' && Number.isFinite(event.from) ? event.from : null
  const resolvedSenderName = senderName || (senderId && senderId > 0 ? `User ${senderId}` : i18n.t('shell:realtime.system'))
  const roomName = typeof eventContent.room_name === 'string' ? eventContent.room_name : ''
  const title = typeof event.title === 'string' && event.title.trim() ? event.title.trim() : ''
  const content =
    typeof event.content === 'string' && event.content.trim()
      ? event.content.trim()
      : typeof event.body === 'string' && event.body.trim()
        ? event.body.trim()
        : typeof eventContent.content === 'string' && eventContent.content.trim()
          ? eventContent.content.trim()
          : ''
  const idParts = [
    eventType,
    typeof event.id === 'string' ? event.id : '',
    messageId,
    conversationId,
    createdAt,
  ].filter(Boolean)
  const fallbackId = notificationId || `ws-${idParts.join(':')}`

  const chatMessagePresentation = (): NotificationItemViewModel => ({
    id: fallbackId,
    type: 'new_message',
    title: i18n.t('shell:realtime.newMessage'),
    subtitle: `${resolvedSenderName}${roomName ? ` · ${roomName}` : ''} · ${toReadableDate(createdAt)}`,
    isRead: false,
    icon: getRealtimeIcon('new_message'),
    createdAt,
  })

  const eventTypeKey = eventType.toLowerCase()
  switch (eventTypeKey) {
    case 'new_message':
    case 'chat_message':
    case 'message_created':
      return chatMessagePresentation()
    case 'incoming_call':
      return {
        id: fallbackId,
        type: eventType,
        title: i18n.t('shell:realtime.incomingCall'),
        subtitle: `${resolvedSenderName} · ${toReadableDate(createdAt)}`,
        isRead: false,
        icon: getRealtimeIcon(eventType),
        createdAt,
      }
    case 'typing':
      return {
        id: fallbackId,
        type: eventType,
        title: i18n.t('shell:realtime.typingTitle'),
        subtitle: i18n.t('shell:realtime.typing', { name: resolvedSenderName }),
        isRead: true,
        icon: getRealtimeIcon(eventType),
        createdAt,
      }
    case 'message_deleted':
      return {
        id: fallbackId,
        type: eventType,
        title: i18n.t('shell:realtime.messageDeleted'),
        subtitle: `${roomName || i18n.t('shell:realtime.chat')} · ${toReadableDate(createdAt)}`,
        isRead: true,
        icon: getRealtimeIcon(eventType),
        createdAt,
      }
    case 'chat_hidden':
      return {
        id: fallbackId,
        type: eventType,
        title: i18n.t('shell:realtime.chatHidden'),
        subtitle: `${roomName || i18n.t('shell:realtime.dialog')} · ${toReadableDate(createdAt)}`,
        isRead: true,
        icon: getRealtimeIcon(eventType),
        createdAt,
      }
    case 'user_status':
      return {
        id: fallbackId,
        type: eventType,
        title: i18n.t('shell:realtime.userStatus'),
        subtitle: `${resolvedSenderName} · ${toReadableDate(createdAt)}`,
        isRead: true,
        icon: getRealtimeIcon(eventType),
        createdAt,
      }
    case 'message':
      return {
        id: fallbackId,
        type: eventType,
        title: i18n.t('shell:realtime.notification'),
        subtitle: `${resolvedSenderName} · ${toReadableDate(createdAt)}`,
        isRead: false,
        icon: getRealtimeIcon(eventType),
        createdAt,
      }
    default:
      if (!title && !content) {
        const taskActionUrl = getRealtimeTaskActionUrl(eventContent)
        if (taskActionUrl || eventTypeKey.includes('task') || eventTypeKey.includes('kanban')) {
          return {
            id: fallbackId,
            type: eventType,
            title: pickFirstText(eventContent.task_title, eventContent.taskTitle) || i18n.t('shell:realtime.taskUpdate'),
            subtitle: pickFirstText(eventContent.message, eventContent.description) || i18n.t('shell:realtime.taskUpdateText'),
            isRead: false,
            icon: getRealtimeIcon(eventType),
            createdAt,
            actionUrl: taskActionUrl,
            metadata: eventContent,
          }
        }
        return null
      }
      return {
        id: fallbackId,
        type: eventType,
        title: title || i18n.t('shell:realtime.notification'),
        subtitle: content || toReadableDate(createdAt),
        isRead: false,
        icon: getRealtimeIcon(eventType),
        createdAt,
        actionUrl: getRealtimeTaskActionUrl(eventContent),
        metadata: eventContent,
      }
  }
}

const mergeNotifications = (
  previous: NotificationItemViewModel[],
  incoming: NotificationItemViewModel,
): NotificationItemViewModel[] => {
  const byId = new Map<string, NotificationItemViewModel>()
  previous.forEach((item) => {
    byId.set(item.id, item)
  })

  const existing = byId.get(incoming.id)
  byId.set(incoming.id, existing ? { ...existing, ...incoming } : incoming)

  return Array.from(byId.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 60)
}

const isEphemeralRealtimeNotification = (notification: NotificationItemViewModel): boolean =>
  notification.type === 'typing' || notification.type === 'user_status'

const getCalendarInviteEventId = (notification: NotificationItemViewModel): string => {
  const eventId = notification.metadata?.event_id ?? notification.metadata?.eventId
  return typeof eventId === 'string' ? eventId : ''
}

const applyCalendarInviteResponses = (
  items: NotificationItemViewModel[],
  responses: Record<string, CalendarInviteResponseStatus>,
): NotificationItemViewModel[] =>
  items.map((item) => {
    const responseStatus = responses[item.id] || responses[getCalendarInviteEventId(item)]
    if (!responseStatus) {
      return item
    }

    return {
      ...item,
      isRead: true,
      processedAt: item.processedAt || new Date().toISOString(),
      metadata: {
        ...(item.metadata ?? {}),
        calendar_invite_response_status: responseStatus,
      },
    }
  })

const getDriveDeleteRequestId = (notification: NotificationItemViewModel | null): string | null => {
  if (!notification) return null
  const rawValue = notification.metadata?.delete_request_id
  return typeof rawValue === 'string' && rawValue.trim() ? rawValue : null
}

const applyDriveDeleteRequestStatuses = (
  items: NotificationItemViewModel[],
  statuses: Record<string, 'approved' | 'rejected'>,
): NotificationItemViewModel[] =>
  items.map((item) => {
    const deleteRequestId = getDriveDeleteRequestId(item)
    const status = deleteRequestId ? (statuses[item.id] || statuses[deleteRequestId]) : null
    if (!status) {
      return item
    }

    return {
      ...item,
      isRead: true,
      processedAt: item.processedAt || new Date().toISOString(),
      metadata: {
        ...(item.metadata ?? {}),
        drive_delete_request_status: status,
      },
    }
  })

const toGlobalToast = (notification: NotificationItemViewModel): GlobalToastItem | null => {
  if (isEphemeralRealtimeNotification(notification)) {
    return null
  }

  return {
    id: notification.id,
    title: notification.title,
    subtitle: notification.subtitle,
    variant: notification.type === 'incoming_call' ? 'warning' : 'info',
    icon: notification.icon,
  }
}

const SIDEBAR_COLLAPSED_KEY = 'workspace.sidebarCollapsed'

export default function WorkspaceLayout() {
  const navigate = useNavigate()
  const { t } = useTranslation(['shell', 'common'])
  const location = useLocation()
  const [manualActiveNav, setManualActiveNav] = useState('home')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      window.localStorage.removeItem(SIDEBAR_COLLAPSED_KEY)
      return window.sessionStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
    } catch { return false }
  })
  const [peopleNav, setPeopleNav] = useState<PeopleNavState | null>(null)
  const knownPeopleTabs = useRef(new Map<string, PeopleNavTab>())
  const publishPeopleNav = useCallback((state: PeopleNavState | null) => {
    if (!state) return
    state.tabs.forEach((tab) => knownPeopleTabs.current.set(tab.id, tab))
    const order = ['employees', 'structure', 'access', 'import', 'administration']
    const tabs = order.flatMap((id) => {
      const tab = knownPeopleTabs.current.get(id)
      return tab ? [tab] : []
    })
    setPeopleNav({ tabs, active: state.active })
  }, [])
  const isPeopleMode = isPeopleSectionPath(location.pathname)
  const isCrmMode = location.pathname.startsWith('/crm')
  const isWorkMode = location.pathname === '/board'
  const toggleSidebar = () => {
    const next = !isSidebarCollapsed
    setIsSidebarCollapsed(next)
    try { window.sessionStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0') } catch (error) { void error }
  }

  const isTablet = location.pathname.endsWith('/tablet') || location.pathname.includes('/tablet/')
  const isEmbedded = location.pathname.includes('/editor-external') || new URLSearchParams(location.search).get('embedded') === 'true'
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<number | null>(null)
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [userRole, setUserRole] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [dashboardData] = useState(getDefaultHomeDashboardViewModel())
  const [notifications, setNotifications] = useState<NotificationItemViewModel[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [emailUpdateError, setEmailUpdateError] = useState('')
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false)
  const [isEmailModalDismissed, setIsEmailModalDismissed] = useState(false)
  const [globalToasts, setGlobalToasts] = useState<GlobalToastItem[]>([])
  const [flashNotice, setFlashNotice] = useState<AuthFlashNotice | null>(() => consumeAuthFlashNotice())
  const [isNotificationsBootstrapped, setIsNotificationsBootstrapped] = useState(false)
  const [calendarInviteResponses, setCalendarInviteResponses] = useState<Record<string, CalendarInviteResponseStatus>>({})
  const [notificationSocketStatus, setNotificationSocketStatus] = useState('idle')
  const shownRealtimeToastIdsRef = useRef<Set<string>>(new Set())

  const [driveDeleteRequestStatuses, setDriveDeleteRequestStatuses] = useState<Record<string, 'approved' | 'rejected'>>({})

  const applyNotificationState = useCallback((items: NotificationItemViewModel[]) => (
    applyDriveDeleteRequestStatuses(
      applyCalendarInviteResponses(
        items
          .filter((item) => !isInternalChatNotification(item))
          .slice()
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        calendarInviteResponses,
      ),
      driveDeleteRequestStatuses,
    )
  ), [calendarInviteResponses, driveDeleteRequestStatuses])

  const authRepository = useMemo(() => new HttpAuthRepository(), [])
  const sessionStore = useMemo(() => new LocalStorageAuthSessionStore(), [])
  const profileRepository = useMemo(() => new HttpProfileRepository(sessionStore), [sessionStore])
  const organizationRepository = useMemo(() => new HttpOrganizationRepository(sessionStore), [sessionStore])
  const profileRole = useWorkspaceProfileRole(organizationRepository, currentUserId, userRole, location.pathname)
  const logoutUseCase = useMemo(() => new LogoutUseCase(authRepository, sessionStore), [authRepository, sessionStore])
  const { authController } = useMemo(() => createAuthController(), [])
  const { calendarController } = useMemo(() => createCalendarController(), [])
  const { notificationController } = useMemo(() => createNotificationController(), [])
  const notificationRealtimeClient = useMemo(
    () => new NotificationRealtimeClient(),
    [],
  )

  const routeActiveNav = location.pathname.startsWith('/profile')
      ? 'profile'
      : location.pathname.startsWith('/meet')
        ? 'meet'
      : location.pathname.startsWith('/calendar')
        ? 'calendar'
        : location.pathname.startsWith('/teamstore')
          ? 'alemstore'
          : location.pathname.startsWith('/team-rag')
              ? 'alem-rag'
          : location.pathname.startsWith('/teamai')
            ? 'alem-rag'
            : location.pathname.startsWith('/drive')
              ? 'alemdrive'
              : location.pathname.startsWith('/news')
                ? 'news'
              : location.pathname.startsWith('/notes')
                ? 'notes'
              : location.pathname.startsWith('/whiteboard')
                ? 'whiteboard'
                : location.pathname.startsWith('/team-contact')
                  ? 'alem-contact'
                : location.pathname.startsWith('/board') || location.pathname.startsWith('/kanban')
                ? 'board'
                : location.pathname.startsWith('/workspace')
                  ? 'workspace'
                  : location.pathname.startsWith('/dashboard') || location.pathname === '/'
                    ? 'home'
                    : manualActiveNav

  useEffect(() => {
    const analyticsTarget = resolveAnalyticsSection(location.pathname)
    if (!analyticsTarget) {
      return
    }

    void profileRepository.trackSectionVisit(analyticsTarget.section, analyticsTarget.path).catch(() => undefined)
  }, [location.pathname, profileRepository])

  useEffect(() => {
    let isCancelled = false
    authController.bootstrap()
      .then((authModel) => {
        if (!isCancelled) void applyProfileLanguage(authModel.language)
      })
      .catch(() => undefined)
    return () => {
      isCancelled = true
    }
  }, [authController])

  useEffect(() => {
    let isCancelled = false

    const load = async () => {
      try {
        const [authModel, notificationList] = await Promise.all([
          authController.bootstrap(),
          notificationController.loadNotifications({ limit: 50, offset: 0 }),
        ])

        if (isCancelled) {
          return
        }

        setUserName(authModel.name || '')
        setUserEmail(authModel.email || '')
        setUserRole(authModel.role || '')
        setCurrentUserId(typeof authModel.userId === 'number' ? authModel.userId : null)
        setAvatarUrl(authModel.avatarUrl || '')
        setNotifications(applyNotificationState(notificationList))
      } catch {
        // silently ignore at layout level
      } finally {
        if (!isCancelled) {
          setIsNotificationsBootstrapped(true)
        }
      }
    }

    void load()

    return () => {
      isCancelled = true
    }
  }, [applyNotificationState, authController, notificationController])

  const refreshNotifications = useCallback(async (options?: { showToastForNew?: boolean }) => {
    const refreshed = await notificationController.loadNotifications({ limit: 50, offset: 0, force: true })
    const normalized = applyNotificationState(refreshed)

    setNotifications((prev) => {
      if (options?.showToastForNew) {
        const prevIds = new Set(prev.map((item) => item.id))
        const newItems = normalized.filter((item) => !prevIds.has(item.id) && !item.isRead)

        for (const item of newItems.slice().reverse()) {
          const toast = toGlobalToast(item)
          if (!toast) {
            continue
          }

          if (shownRealtimeToastIdsRef.current.has(toast.id)) {
            continue
          }

          shownRealtimeToastIdsRef.current.add(toast.id)
          setGlobalToasts((current) => {
            const next = [toast, ...current.filter((existing) => existing.id !== toast.id)]
            return next.slice(0, GLOBAL_TOAST_LIMIT)
          })
        }
      }

      return normalized
    })

    return normalized
  }, [applyNotificationState, notificationController])

  useEffect(() => {
    const unsubscribeStatus = notificationRealtimeClient.subscribeStatus((nextStatus) => {
      setNotificationSocketStatus(nextStatus)
    })

    const unsubscribeEvents = notificationRealtimeClient.subscribe((event) => {
      const eventType = typeof event.type === 'string' ? event.type : ''
      const eventTypeNorm = eventType.toLowerCase()

      if (eventTypeNorm === 'publication_alert') notifyPublicationBannersChanged()

      const mapped = toRealtimeNotification(event)
      if (!mapped) return
      if (isEphemeralRealtimeNotification(mapped)) return
      setNotifications((prev) =>
        applyDriveDeleteRequestStatuses(
          applyCalendarInviteResponses(mergeNotifications(prev, mapped), calendarInviteResponses),
          driveDeleteRequestStatuses,
        ),
      )

      const toast = toGlobalToast(mapped)
      if (!toast) return
      if (shownRealtimeToastIdsRef.current.has(toast.id)) return

      shownRealtimeToastIdsRef.current.add(toast.id)
      
      setGlobalToasts((prev) => {
        const next = [toast, ...prev.filter((item) => item.id !== toast.id)]
        return next.slice(0, GLOBAL_TOAST_LIMIT)
      })

      if (shownRealtimeToastIdsRef.current.size > 200) {
        shownRealtimeToastIdsRef.current = new Set([toast.id])
      }
    })

    if (isNotificationsBootstrapped) {
      notificationRealtimeClient.connect()
    }

    return () => {
      unsubscribeStatus()
      unsubscribeEvents()
      notificationRealtimeClient.disconnect()
    }
  }, [calendarInviteResponses, currentUserId, driveDeleteRequestStatuses, isNotificationsBootstrapped, navigate, notificationRealtimeClient])

  useEffect(() => {
    if (getBrowserNotificationPermission() !== 'default') {
      return
    }
    const requestPermission = () => {
      void requestBrowserNotificationPermission()
    }
    window.addEventListener('pointerdown', requestPermission, { once: true })
    return () => window.removeEventListener('pointerdown', requestPermission)
  }, [])

  useEffect(() => {
    if (!isNotificationsBootstrapped || typeof window === 'undefined') {
      return
    }

    if (notificationSocketStatus === 'open') {
      return
    }

    const runRefresh = () => {
      void refreshNotifications({ showToastForNew: true }).catch(() => undefined)
    }

    const handleFocus = () => {
      runRefresh()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        runRefresh()
      }
    }

    const intervalId = window.setInterval(runRefresh, NOTIFICATION_REFRESH_INTERVAL_MS)
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isNotificationsBootstrapped, notificationSocketStatus, refreshNotifications])


  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleSessionExpired = (event: Event) => {
      const detail = (event as CustomEvent<AuthSessionExpiredDetail>).detail
      sessionStore.clearTokens()
      storeAuthFlashNotice({
        kind: 'error',
        title: i18n.t('shell:session.expiredTitle'),
        message: detail?.message ?? i18n.t('shell:session.expiredText'),
      })
      showAppSplash(i18n.t('shell:session.expiredSplash'))
      navigate('/login', {
        replace: true,
        state: { from: location.pathname },
      })
    }

    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired as EventListener)

    return () => {
      window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired as EventListener)
    }
  }, [location.pathname, navigate, sessionStore])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleProfileUpdated = (event: Event) => {
      const detail = (event as CustomEvent<ProfileUpdatedDetail>).detail
      if (detail.avatarUrl !== undefined) {
        setAvatarUrl(detail.avatarUrl || '')
      }
      if (detail.fullName !== undefined) {
        setUserName(detail.fullName || '')
      } else if (detail.firstName !== undefined || detail.lastName !== undefined) {
        setUserName(`${detail.firstName ?? ''} ${detail.lastName ?? ''}`.trim())
      }
    }

    window.addEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated as EventListener)

    return () => {
      window.removeEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdated as EventListener)
    }
  }, [])

  const handleMarkNotificationRead = useCallback(async (notificationId: string) => {
    const target = notifications.find((item) => item.id === notificationId)
    if (!target || target.isRead) {
      return
    }

    let snapshot: NotificationItemViewModel[] = []
    setNotifications((prev) => {
      snapshot = prev
      return prev.map((item) => (item.id === notificationId ? { ...item, isRead: true } : item))
    })

    if (notificationId.startsWith('ws-')) {
      return
    }

    try {
      await notificationController.markAsRead(notificationId)
    } catch {
      setNotifications(snapshot)
    }
  }, [notificationController, notifications])

  const handleMarkAllNotificationsRead = useCallback(async () => {
    let snapshot: NotificationItemViewModel[] = []
    setNotifications((prev) => {
      snapshot = prev
      return prev.map((item) => ({ ...item, isRead: true }))
    })
    try {
      await notificationController.markAllAsRead()
    } catch {
      setNotifications(snapshot)
    }
  }, [notificationController])

  const pushGlobalToast = useCallback((toast: Omit<GlobalToastItem, 'id'>) => {
    setGlobalToasts((prev) => [
      {
        id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...toast,
      },
      ...prev,
    ].slice(0, GLOBAL_TOAST_LIMIT))
  }, [])

  const handleCalendarReminder = useCallback(
    (reminder: CalendarReminderItem) => {
      pushGlobalToast({
        title: i18n.t('shell:notifications.reminder', { title: reminder.title }),
        subtitle: reminder.message,
        variant: 'info',
        icon: 'notifications',
      })
    },
    [pushGlobalToast],
  )

  const handleOpenReminderEvent = useCallback(
    (eventId: string) => {
      navigate(`/calendar?event=${encodeURIComponent(eventId)}`)
    },
    [navigate],
  )

  useCalendarReminders({
    calendarController,
    userId: currentUserId,
    onReminder: handleCalendarReminder,
    onOpenEvent: handleOpenReminderEvent,
  })

  const handleRespondToCalendarInvite = useCallback(async ({
    notificationId,
    eventId,
    status,
  }: {
    notificationId: string
    eventId: string
    status: CalendarInviteResponseStatus
  }) => {
    await calendarController.respondInvite(eventId, status)

    setCalendarInviteResponses((prev) => ({
      ...prev,
      [notificationId]: status,
      [eventId]: status,
    }))

    setNotifications((prev) =>
      prev.map((item) =>
        item.id === notificationId
          ? {
              ...item,
              isRead: true,
              processedAt: item.processedAt || new Date().toISOString(),
              metadata: {
                ...(item.metadata ?? {}),
                calendar_invite_response_status: status,
              },
            }
          : item,
      ),
    )

    await refreshNotifications()

    pushGlobalToast({
      title:
        status === 'accepted'
          ? i18n.t('shell:calendarInvite.toastAccepted')
          : status === 'tentative'
            ? i18n.t('shell:calendarInvite.toastTentative')
            : i18n.t('shell:calendarInvite.toastDeclined'),
      subtitle:
        status === 'declined'
          ? i18n.t('shell:calendarInvite.toastDeclinedText')
          : i18n.t('shell:calendarInvite.toastSavedText'),
      variant: status === 'accepted' ? 'success' : 'info',
      icon: status === 'accepted' ? 'check_circle' : status === 'tentative' ? 'help' : 'event_busy',
    })
  }, [calendarController, notificationController, pushGlobalToast, refreshNotifications])

  const handleResolveCalendarInviteStatus = useCallback(async ({
    notificationId,
    eventId,
  }: {
    notificationId: string
    eventId: string
  }): Promise<CalendarInviteResponseStatus | null> => {
    if (!eventId || currentUserId === null) {
      return null
    }

    const event = await calendarController.getEvent(eventId)
    const attendeeStatus = event.attendees.find((attendee) => {
      const attendeeUserId = Number(attendee.userId || attendee.user?.id || 0)
      return attendeeUserId === currentUserId
    })?.status

    const resolvedStatus =
      attendeeStatus === 'accepted' || attendeeStatus === 'declined' || attendeeStatus === 'tentative'
        ? attendeeStatus
        : null

    if (!resolvedStatus) {
      return null
    }

    setCalendarInviteResponses((prev) => ({
      ...prev,
      [notificationId]: resolvedStatus,
      [eventId]: resolvedStatus,
    }))

    setNotifications((prev) =>
      prev.map((item) =>
        item.id === notificationId
          ? {
              ...item,
              isRead: true,
              processedAt: item.processedAt || new Date().toISOString(),
              metadata: {
                ...(item.metadata ?? {}),
                calendar_invite_response_status: resolvedStatus,
              },
            }
          : item,
      ),
    )

    return resolvedStatus
  }, [calendarController, currentUserId])

  const handleResolveDriveDeleteRequest = useCallback(async ({
    notificationId,
    deleteRequestId,
    decision,
  }: {
    notificationId: string
    deleteRequestId: string
    decision: 'approved' | 'rejected'
  }) => {
    if (decision === 'approved') {
      await notificationController.approveDriveDeleteRequest(deleteRequestId)
    } else {
      await notificationController.rejectDriveDeleteRequest(deleteRequestId)
    }

    setDriveDeleteRequestStatuses((prev) => ({
      ...prev,
      [notificationId]: decision,
      [deleteRequestId]: decision,
    }))

    setNotifications((prev) =>
      prev.map((item) =>
        item.id === notificationId
          ? {
              ...item,
              isRead: true,
              processedAt: item.processedAt || new Date().toISOString(),
              metadata: {
                ...(item.metadata ?? {}),
                drive_delete_request_status: decision,
              },
            }
          : item,
      ),
    )

    await refreshNotifications()

    pushGlobalToast({
      title: decision === 'approved' ? i18n.t('shell:driveDelete.toastApproved') : i18n.t('shell:driveDelete.toastRejected'),
      subtitle:
        decision === 'approved'
          ? i18n.t('shell:driveDelete.toastApprovedText')
          : i18n.t('shell:driveDelete.toastRejectedText'),
      variant: decision === 'approved' ? 'success' : 'info',
      icon: decision === 'approved' ? 'check_circle' : 'close',
    })
  }, [notificationController, pushGlobalToast, refreshNotifications])

  const handleLogout = useCallback(async () => {
    if (isLoggingOut) {
      return
    }

    setIsLoggingOut(true)
    showAppSplashBeforeRedirect(i18n.t('shell:profile.logoutSplash'))

    // Private Keycloak and local development profiles use API logout; browser
    // SSO would otherwise send visitors to an unreachable identity-provider URL.
    if (isLocalDevHost() || !isKeycloakBrowserSsoEnabled()) {
      notificationRealtimeClient.disconnect()
      try {
        await logoutUseCase.execute()
      } catch (error) {
        console.warn('Logout request failed; local tokens are cleared anyway', error)
        sessionStore.clearTokens()
      }
      window.location.assign(`${window.location.origin}${import.meta.env.BASE_URL}login`)
      return
    }

    try {
      notificationRealtimeClient.disconnect()
      // Clear local in-memory/localStorage tokens immediately
      sessionStore.clearTokens()
    } finally {
      setIsLoggingOut(false)
    }

    // Navigate the browser to the backend Keycloak logout endpoint.
    // This is REQUIRED for proper SSO logout: the backend will revoke tokens,
    // clear app cookies, and then redirect the browser to Keycloak's end-session
    // endpoint which clears KEYCLOAK_SESSION and KEYCLOAK_IDENTITY cookies.
    // A simple POST to /api/v1/auth/logout cannot clear Keycloak browser cookies.
    window.location.href = '/api/v1/auth/keycloak/logout'
  }, [isLoggingOut, logoutUseCase, notificationRealtimeClient, sessionStore])

  const handleUpdateEmail = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailUpdateError('')

    const trimmed = newEmail.trim()
    if (!trimmed) {
      setEmailUpdateError(i18n.t('shell:emailChange.required'))
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmed)) {
      setEmailUpdateError(i18n.t('shell:emailChange.invalid'))
      return
    }

    if (trimmed.toLowerCase().endsWith('@hr.local')) {
      setEmailUpdateError(i18n.t('shell:emailChange.hrLocal'))
      return
    }

    setIsUpdatingEmail(true)
    try {
      await profileRepository.updateEmail(trimmed)
      
      const authModel = await authController.bootstrap(true)
      setUserName(authModel.name || '')
      setUserEmail(authModel.email || '')
      setUserRole(authModel.role || '')
      setAvatarUrl(authModel.avatarUrl || '')

      setGlobalToasts((prev) => [
        {
          id: `email-updated-${Date.now()}`,
          title: i18n.t('common:status.success'),
          subtitle: i18n.t('shell:emailChange.success'),
          variant: 'success',
          icon: 'check_circle',
        },
        ...prev
      ].slice(0, GLOBAL_TOAST_LIMIT))

      setNewEmail('')
    } catch (err: any) {
      let errMsg = err?.message || i18n.t('shell:emailChange.failed')
      if (errMsg.includes('Email is already registered') || errMsg.includes('email адрес уже зарегистрирован')) { // i18n-ignore: matches the server message
        errMsg = i18n.t('shell:emailChange.alreadyRegistered')
      } else if (errMsg.includes('Username extracted from email') || errMsg.includes('извлеченное из email')) { // i18n-ignore: matches the server message
        errMsg = i18n.t('shell:emailChange.usernameTaken')
      }
      setEmailUpdateError(errMsg)
    } finally {
      setIsUpdatingEmail(false)
    }
  }, [newEmail, profileRepository, authController])

  const handleCloseGlobalToast = useCallback((toastId: string) => {
    setGlobalToasts((prev) => prev.filter((item) => item.id !== toastId))
  }, [])

  const topNav = (
    <>
      {flashNotice ? (
        <div
          style={{
            padding: '10px 20px',
            borderBottom: `1px solid ${flashNoticeStyles[flashNotice.kind].border}`,
            background: flashNoticeStyles[flashNotice.kind].bg,
            color: flashNoticeStyles[flashNotice.kind].text,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>{flashNotice.title}</div>
            <div style={{ fontSize: 12, marginTop: 2, lineHeight: 1.45 }}>{flashNotice.message}</div>
          </div>
          <button
            type="button"
            onClick={() => setFlashNotice(null)}
            style={{
              border: 'none',
              background: 'transparent',
              color: flashNoticeStyles[flashNotice.kind].text,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
              padding: 0,
            }}
          >
            {t('common:actions.close')}
          </button>
        </div>
      ) : null}
        <WorkspaceTopNav
          activeNav={routeActiveNav}
          setActiveNav={setManualActiveNav}
          sidebarCollapsed={isSidebarCollapsed}
          compact
          onLogout={handleLogout}
          isLoggingOut={isLoggingOut}
          notifications={notifications}
          onMarkNotificationRead={handleMarkNotificationRead}
          onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
          onRespondToCalendarInvite={handleRespondToCalendarInvite}
          onResolveCalendarInviteStatus={handleResolveCalendarInviteStatus}
          onResolveDriveDeleteRequest={handleResolveDriveDeleteRequest}
          userName={userName}
          userRole={userRole}
          profileRole={profileRole}
          userEmail={userEmail}
          avatarUrl={avatarUrl}
        accessToken={sessionStore.getTokens()?.accessToken}
      />
      {!isEmbedded ? <PublicationBannerHost sessionStore={sessionStore} /> : null}
    </>
  )

  return (
    <MeetCallProvider>
    <CallManagerProvider
      currentUserId={currentUserId}
      currentUserName={userName || t('profile.defaultName')}
      realtimeClient={notificationRealtimeClient}
      sessionStore={sessionStore}
    >
      <>
        <PeopleNavContext.Provider value={publishPeopleNav}>
        <div className={`workspace-app-shell${isSidebarCollapsed ? ' workspace-sidebar-collapsed' : ''}${(isPeopleMode || isCrmMode || isWorkMode) && !isTablet && !isEmbedded ? ' workspace-people-mode' : ''}`}>
          {!isTablet && !isEmbedded ? (
            <WorkspaceReferenceSidebar
              userRole={userRole}
              collapsed={isSidebarCollapsed}
              onToggleCollapsed={toggleSidebar}
            />
          ) : null}
          {isCrmMode && !isTablet && !isEmbedded ? <CrmSectionSidebar /> : null}
          {isWorkMode && !isTablet && !isEmbedded ? <WorkSectionSidebar /> : null}
          {isPeopleMode && !isTablet && !isEmbedded ? (
            <PeopleSectionSidebar nav={peopleNav} />
          ) : null}
          <div className="workspace-app-main">
        <TopNavLayout
          background="var(--ts-bg)"
          fontFamily="var(--ts-font)"
          outletContext={{
            activeNav: routeActiveNav,
            setActiveNav: setManualActiveNav,
            dashboardData,
            userEmail,
            userName,
            avatarUrl,
            workspaceBootstrapReady: isNotificationsBootstrapped,
            userRole,
            realtimeClient: notificationRealtimeClient,
          }}
          topNav={topNav}
        />
          </div>
        </div>
        </PeopleNavContext.Provider>
        {globalToasts.length > 0 ? (
          <div className="pointer-events-none fixed right-4 top-16 z-[9999] flex w-[min(460px,calc(100vw-2rem))] flex-col gap-2">
            {globalToasts.map((toast) => (
              <div key={toast.id} className="pointer-events-auto">
                <AppToast
                  message={toast.subtitle}
                  title={toast.title}
                  subtitle={toast.subtitle}
                  variant={toast.variant}
                  icon={toast.icon}
                  floating={false}
                  onClose={() => handleCloseGlobalToast(toast.id)}
                />
              </div>
            ))}
          </div>
        ) : null}

        {userEmail && userEmail.endsWith('@hr.local') && !isEmailModalDismissed && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 99999,
              background: 'rgba(10, 22, 40, 0.45)',
              backdropFilter: 'blur(20px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
              fontFamily: 'var(--ts-font)',
            }}
          >
            <div
              style={{
                width: 460,
                maxWidth: '100%',
                borderRadius: 24,
                background: '#FFFFFF',
                boxShadow: '0 24px 60px rgba(10, 22, 40, 0.18)',
                padding: '40px 32px 32px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                boxSizing: 'border-box',
                position: 'relative',
              }}
            >
              <button
                type="button"
                onClick={() => setIsEmailModalDismissed(true)}
                style={{
                  position: 'absolute',
                  top: 20,
                  right: 20,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748B',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 4,
                  borderRadius: '50%',
                  transition: 'background-color 0.2s',
                  outline: 'none',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                title={t('common:actions.close')}
              >
                <MS name="close" size={20} color="currentColor" />
              </button>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 20,
                  background: 'linear-gradient(135deg, #E0F2FE 0%, #BAE6FD 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 8px 16px rgba(2, 132, 199, 0.15)',
                }}
              >
                <MS name="mail" size={32} color="#0284C7" />
              </div>

              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: '#0F172A',
                  margin: '24px 0 8px',
                  textAlign: 'center',
                  lineHeight: 1.3,
                }}
              >
                {t('emailChange.title')}
              </h2>

              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: '#475569',
                  margin: '0 0 24px',
                  textAlign: 'center',
                }}
              >
                {t('emailChange.currentBefore')} <strong style={{ color: '#0F172A', fontWeight: 600 }}>{userEmail}</strong> {t('emailChange.currentAfter')}
              </p>

              <form
                onSubmit={handleUpdateEmail}
                style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label
                    htmlFor="email-change-input"
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#64748B',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    {t('emailChange.newEmail')}
                  </label>
                  <input
                    id="email-change-input"
                    type="email"
                    placeholder="example@domain.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    disabled={isUpdatingEmail}
                    style={{
                      height: 48,
                      borderRadius: 12,
                      border: '1.5px solid #E2E8F0',
                      padding: '0 16px',
                      fontSize: 15,
                      outline: 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                      boxSizing: 'border-box',
                      color: '#0F172A',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#0284C7'
                      e.target.style.boxShadow = '0 0 0 3.5px rgba(2, 132, 199, 0.15)'
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#E2E8F0'
                      e.target.style.boxShadow = 'none'
                    }}
                  />
                </div>

                {emailUpdateError && (
                  <div
                    style={{
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: '#EF4444',
                      background: '#FEF2F2',
                      border: '1px solid #FEE2E2',
                      padding: '10px 14px',
                      borderRadius: 10,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <MS name="error" size={16} color="#EF4444" />
                    <span>{emailUpdateError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isUpdatingEmail}
                  style={{
                    height: 48,
                    borderRadius: 12,
                    background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                    color: '#FFFFFF',
                    fontWeight: 700,
                    fontSize: 15,
                    border: 'none',
                    cursor: isUpdatingEmail ? 'default' : 'pointer',
                    transition: 'opacity 0.2s',
                    opacity: isUpdatingEmail ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)',
                  }}
                >
                  {isUpdatingEmail ? (
                    <>
                      <span>{t('common:status.updating')}</span>
                    </>
                  ) : (
                    <span>{t('emailChange.submit')}</span>
                  )}
                </button>
              </form>

              <button
                type="button"
                onClick={handleLogout}
                disabled={isUpdatingEmail}
                style={{
                  background: 'transparent',
                  border: 'none',
                  marginTop: 20,
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#64748B',
                  cursor: isUpdatingEmail ? 'default' : 'pointer',
                  transition: 'color 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
                onMouseEnter={(e) => {
                  if (!isUpdatingEmail) e.currentTarget.style.color = '#475569'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#64748B'
                }}
              >
                <MS name="logout" size={16} color="currentColor" />
                <span>{t('profile.logoutAccount')}</span>
              </button>
            </div>
          </div>
        )}
      </>
    </CallManagerProvider>
    </MeetCallProvider>
  )
}
