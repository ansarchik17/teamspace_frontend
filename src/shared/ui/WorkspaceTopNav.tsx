/* eslint-disable */
// @ts-nocheck
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import {
  detectAppLocale,
  formatNotificationDateTime,
  getNotificationTranslations,
} from '../notifications/notificationPresentation'
import { canAccessAlemContact } from '../config/alemContactAccess'
import { WORKSPACE_NAVIGATION, WORKSPACE_TOOL_NAVIGATION } from '../config/workspaceNavigation'
import AppModal from './AppModal'
import MaterialSymbol from './MaterialSymbol'
import GradientAvatar from './GradientAvatar'
import LanguageSwitcher from './LanguageSwitcher'

interface TopNavNotification {
  id: string
  userId?: number
  organizerId?: number | null
  type: string
  title: string
  subtitle: string
  preview?: string
  isRead: boolean
  icon: string
  createdAt?: string
  dateLabel?: string
  sourceName?: string
  sourceSystemCode?: string
  status?: string
  statusLabel?: string
  statusTone?: 'success' | 'warning' | 'error' | 'neutral'
  actionUrl?: string
  fullMessage?: string
  notificationType?: string
  externalMessageId?: string
  applicationNumber?: string
  processedAt?: string
  metadata?: Record<string, any>
}

type CalendarInviteResponseStatus = 'accepted' | 'declined' | 'tentative'

const CALENDAR_INVITE_OPTIONS: Array<{
  status: CalendarInviteResponseStatus
  labelKey: string
  icon: string
  buttonClassName: string
  ringClassName: string
  messageClassName: string
}> = [
  {
    status: 'accepted',
    labelKey: 'calendarInvite.accept',
    icon: 'check',
    buttonClassName: 'bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white',
    ringClassName: 'ring-emerald-600',
    messageClassName: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  },
  {
    status: 'tentative',
    labelKey: 'calendarInvite.tentative',
    icon: 'help',
    buttonClassName: 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-700',
    ringClassName: 'ring-amber-500',
    messageClassName: 'text-amber-700 bg-amber-50 border-amber-200',
  },
  {
    status: 'declined',
    labelKey: 'calendarInvite.decline',
    icon: 'close',
    buttonClassName: 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-600',
    ringClassName: 'ring-rose-500',
    messageClassName: 'text-rose-600 bg-rose-50 border-rose-200',
  },
]

const CALENDAR_INVITE_STATUS_MESSAGE_KEYS: Record<CalendarInviteResponseStatus, string> = {
  accepted: 'calendarInvite.accepted',
  tentative: 'calendarInvite.tentativeSaved',
  declined: 'calendarInvite.declined',
}

const toCalendarInviteResponseStatus = (
  notification: TopNavNotification | null,
): CalendarInviteResponseStatus | null => {
  if (!notification) return null

  const rawStatus = notification.metadata?.calendar_invite_response_status || notification.metadata?.invite_response_status
  if (rawStatus === 'accepted' || rawStatus === 'declined' || rawStatus === 'tentative') {
    return rawStatus
  }

  return null
}

const getDriveDeleteRequestId = (notification: TopNavNotification | null): string | null => {
  if (!notification) return null
  const rawValue = notification.metadata?.delete_request_id
  return typeof rawValue === 'string' && rawValue.trim() ? rawValue : null
}

const getDriveDeleteRequestStatus = (notification: TopNavNotification | null): 'pending' | 'approved' | 'rejected' | null => {
  if (!notification) return null
  const rawStatus = notification.metadata?.drive_delete_request_status
  if (rawStatus === 'pending' || rawStatus === 'approved' || rawStatus === 'rejected') {
    return rawStatus
  }
  return null
}

const isDriveDeleteApprovalNotification = (notification: TopNavNotification | null): boolean => {
  if (!notification) return false
  return notification.metadata?.kind === 'drive_delete_approval' && Boolean(getDriveDeleteRequestId(notification))
}

const NAV_ITEMS = [...WORKSPACE_NAVIGATION, ...WORKSPACE_TOOL_NAVIGATION]
const NAV_GROUPS: string[][] = [WORKSPACE_NAVIGATION.map((item) => item.id), WORKSPACE_TOOL_NAVIGATION.map((item) => item.id)]

const ROLE_LABEL_KEYS: Record<string, string> = {
  user: 'roles.user',
  admin: 'roles.admin',
  superadmin: 'roles.superadmin',
  company_admin: 'roles.companyAdmin',
  manager: 'roles.manager',
}

interface WorkspaceTopNavProps {
  activeNav: string
  setActiveNav: (id: string) => void
  isLoggingOut: boolean
  notifications?: TopNavNotification[]
  onMarkNotificationRead?: (notificationId: string) => Promise<void>
  onMarkAllNotificationsRead?: () => Promise<void>
  onRespondToCalendarInvite?: (params: {
    notificationId: string
    eventId: string
    status: CalendarInviteResponseStatus
  }) => Promise<void>
  onResolveCalendarInviteStatus?: (params: {
    notificationId: string
    eventId: string
  }) => Promise<CalendarInviteResponseStatus | null>
  onResolveDriveDeleteRequest?: (params: {
    notificationId: string
    deleteRequestId: string
    decision: 'approved' | 'rejected'
  }) => Promise<void>
  userName?: string
  /** Для ограничения раздела AlemContact */
  userEmail?: string
  avatarUrl?: string
  chatUnreadCount?: number
  accessToken?: string | null
  sidebarCollapsed?: boolean
  onToggleSidebar?: () => void
  compact?: boolean
  userRole?: string
}

const NARROW_SEARCH_QUERY = '(max-width: 700px)'
const subscribeNarrowSearch = (onChange: () => void) => {
  const media = window.matchMedia(NARROW_SEARCH_QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
const readNarrowSearch = () => window.matchMedia(NARROW_SEARCH_QUERY).matches

export default function WorkspaceTopNav({
  activeNav,
  setActiveNav,
  onLogout,
  isLoggingOut,
  notifications = [],
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onRespondToCalendarInvite,
  onResolveCalendarInviteStatus,
  onResolveDriveDeleteRequest,
  userName = '',
  userEmail = '',
  avatarUrl,
  chatUnreadCount = 0,
  accessToken,
  sidebarCollapsed = false,
  onToggleSidebar,
  compact = false,
  userRole = '',
}: WorkspaceTopNavProps) {
  const navigate = useNavigate()
  const { t } = useTranslation(['shell', 'common'])
  const displayName = userName || t('profile.defaultName')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const isNarrowSearch = useSyncExternalStore(subscribeNarrowSearch, readNarrowSearch, () => false)
  useEffect(() => {
    if (!compact) return
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [compact])
  const showAlemContact = canAccessAlemContact(userEmail)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifRender, setNotifRender] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [selectedNotification, setSelectedNotification] = useState<TopNavNotification | null>(null)
  const [globalSearch, setGlobalSearch] = useState('')
  const { pathname } = useLocation()
  const isDriveSearch = pathname.startsWith('/drive') && !pathname.startsWith('/drive/editor')
  useEffect(() => {
    setGlobalSearch('')
  }, [isDriveSearch])
  const handleGlobalSearchChange = (value: string) => {
    setGlobalSearch(value)
    if (isDriveSearch) document.dispatchEvent(new CustomEvent('alem-drive-search', { detail: value }))
  }

  const [rsvpLoading, setRsvpLoading] = useState(false)
  const [rsvpSuccess, setRsvpSuccess] = useState('')
  const [rsvpError, setRsvpError] = useState('')
  const [deleteDecisionLoading, setDeleteDecisionLoading] = useState(false)
  const [deleteDecisionSuccess, setDeleteDecisionSuccess] = useState('')
  const [deleteDecisionError, setDeleteDecisionError] = useState('')

  useEffect(() => {
    setRsvpLoading(false)
    setRsvpSuccess('')
    setRsvpError('')
    setDeleteDecisionLoading(false)
    setDeleteDecisionSuccess('')
    setDeleteDecisionError('')
  }, [selectedNotification])

  const handleCalendarRsvp = async (status: CalendarInviteResponseStatus) => {
    const eventId = selectedNotification?.metadata?.event_id || selectedNotification?.metadata?.eventId
    if (!eventId) {
      setRsvpError(t('calendarInvite.noEventId'))
      return
    }
    if (!selectedNotification?.id || !onRespondToCalendarInvite) {
      setRsvpError(t('calendarInvite.unavailable'))
      return
    }
    setRsvpLoading(true)
    setRsvpError('')
    setRsvpSuccess('')

    try {
      await onRespondToCalendarInvite({
        notificationId: selectedNotification.id,
        eventId: String(eventId),
        status,
      })

      setRsvpSuccess(t(CALENDAR_INVITE_STATUS_MESSAGE_KEYS[status]))
      
      setSelectedNotification(prev => prev ? {
        ...prev,
        metadata: {
          ...(prev.metadata ?? {}),
          calendar_invite_response_status: status,
          invite_response_status: status,
        }
      } : null)
    } catch (err: any) {
      console.error(err)
      setRsvpError(err?.message || t('calendarInvite.failed'))
    } finally {
      setRsvpLoading(false)
    }
  }

  const handleDriveDeleteDecision = async (decision: 'approved' | 'rejected') => {
    const deleteRequestId = getDriveDeleteRequestId(selectedNotification)
    if (!deleteRequestId || !selectedNotification?.id || !onResolveDriveDeleteRequest) {
      setDeleteDecisionError(t('driveDelete.unavailable'))
      return
    }

    setDeleteDecisionLoading(true)
    setDeleteDecisionSuccess('')
    setDeleteDecisionError('')

    try {
      await onResolveDriveDeleteRequest({
        notificationId: selectedNotification.id,
        deleteRequestId,
        decision,
      })

      const nextStatus = decision === 'approved' ? 'approved' : 'rejected'
      setDeleteDecisionSuccess(
        decision === 'approved'
          ? t('driveDelete.approvedDone')
          : t('driveDelete.rejectedDone')
      )

      setSelectedNotification(prev => prev ? {
        ...prev,
        metadata: {
          ...(prev.metadata ?? {}),
          drive_delete_request_status: nextStatus,
        },
        isRead: true,
        processedAt: prev.processedAt || new Date().toISOString(),
      } : null)
    } catch (err: any) {
      console.error(err)
      setDeleteDecisionError(err?.message || t('driveDelete.failed'))
    } finally {
      setDeleteDecisionLoading(false)
    }
  }

  const notifRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)
  const locale = detectAppLocale()
  const nt = getNotificationTranslations(locale)

  const unread = notifications.filter((n) => !n.isRead).length
  const selectedInviteResponseStatus = toCalendarInviteResponseStatus(selectedNotification)
  const selectedDriveDeleteStatus = getDriveDeleteRequestStatus(selectedNotification)
  const initials =
    displayName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join('') || 'U'

  const handleMarkAsRead = async (notificationId: string) => {
    if (!onMarkNotificationRead) return
    await onMarkNotificationRead(notificationId).catch(() => undefined)
  }

  const handleMarkAllAsRead = async () => {
    if (!onMarkAllNotificationsRead) return
    await onMarkAllNotificationsRead().catch(() => undefined)
  }

  const badgeClassName = (tone?: TopNavNotification['statusTone']) => {
    switch (tone) {
      case 'success':
        return 'border-[#B7E4CC] bg-[#EAFBF2] text-[#157347]'
      case 'warning':
        return 'border-[#F4D8A6] bg-[#FFF7E8] text-[#9A6700]'
      case 'error':
        return 'border-[#F5B5B5] bg-[#FFF0F0] text-[#C53030]'
      default:
        return 'border-[#D9E3F0] bg-[#F5F8FC] text-[#5F728C]'
    }
  }

  const openActionUrl = (actionUrl: string) => {
    if (/^https?:\/\//i.test(actionUrl)) {
      window.location.assign(actionUrl)
      return
    }

    if (actionUrl.startsWith('/')) {
      navigate(actionUrl)
      setNotifOpen(false)
      setNotifRender(false)
      setSelectedNotification(null)
      return
    }

    window.location.assign(actionUrl)
  }

  const handleOpenNotification = async (notification: TopNavNotification) => {
    await handleMarkAsRead(notification.id)

    if (notification.actionUrl) {
      openActionUrl(notification.actionUrl)
      return
    }

    const eventId = notification.metadata?.event_id || notification.metadata?.eventId
    const hasStoredInviteStatus = Boolean(toCalendarInviteResponseStatus(notification))

    if (
      !hasStoredInviteStatus &&
      onResolveCalendarInviteStatus &&
      (notification.type === 'calendar_invite' || notification.notificationType === 'calendar_invite') &&
      eventId
    ) {
      try {
        const resolvedStatus = await onResolveCalendarInviteStatus({
          notificationId: notification.id,
          eventId: String(eventId),
        })

        if (resolvedStatus) {
          setSelectedNotification({
            ...notification,
            isRead: true,
            processedAt: notification.processedAt || new Date().toISOString(),
            metadata: {
              ...(notification.metadata ?? {}),
              calendar_invite_response_status: resolvedStatus,
            },
          })
          return
        }
      } catch {
        // Ignore resolver failures and fall back to current notification payload.
      }
    }

    setSelectedNotification(notification)
  }

  const handleNav = (item: typeof NAV_ITEMS[0]) => {
    if (item.isExternal) {
      const url = item.route.startsWith('http')
        ? new URL(item.route)
        : new URL(item.route, window.location.origin)
      window.open(url.toString(), '_blank', 'noopener,noreferrer')
      setMobileMenuOpen(false)
      return
    }

    setActiveNav(item.id)
    navigate(item.route)
    setNotifOpen(false)
    setProfileOpen(false)
    setMobileMenuOpen(false)
  }

  const handleOverlayClick = () => {
    setNotifOpen(false)
    setProfileOpen(false)
    setMobileMenuOpen(false)
  }

  const openNotifications = () => {
    setNotifRender(true)
    requestAnimationFrame(() => {
      setNotifOpen(true)
    })
  }

  const closeNotifications = () => {
    setNotifOpen(false)
  }

  const toggleNotifications = () => {
    if (notifOpen) {
      closeNotifications()
      return
    }
    setProfileOpen(false)
    setMobileMenuOpen(false)
    openNotifications()
  }

  useEffect(() => {
    if (notifOpen) return
    if (!notifRender) return
    const timeout = window.setTimeout(() => setNotifRender(false), 220)
    return () => window.clearTimeout(timeout)
  }, [notifOpen, notifRender])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifOpen && notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false)
      }
      if (profileOpen && profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [notifOpen, profileOpen])

  return (
    <>
      {(notifOpen || profileOpen || mobileMenuOpen) && (
        <div className="fixed inset-0 z-490 bg-black/5 min-[1101px]:hidden" onClick={handleOverlayClick} />
      )}

      <header className={`sticky top-0 z-500 bg-transparent ${compact ? 'wr-topbar px-0 py-0' : 'px-3 py-2.5'}`}>
        <div className={`mx-auto flex h-16 items-center border-white/20 bg-white/75 px-4 shadow-[0_8px_32px_rgba(10,22,40,0.04)] backdrop-blur-md transition-all duration-300 ${compact ? 'max-w-none rounded-none border-x-0 border-t-0' : 'max-w-445 rounded-2xl border'}`}>
        <div className="flex items-center gap-2 lg:gap-4 flex-1 lg:flex-initial">
          {onToggleSidebar ? (
            <button
              type="button"
              className="workspace-sidebar-toggle"
              onClick={onToggleSidebar}
              aria-label={sidebarCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
              aria-expanded={!sidebarCollapsed}
              aria-controls="workspace-sidebar"
              data-tooltip="native"
            >
              {sidebarCollapsed ? <PanelLeftOpen size={22}><title>{t('nav.expandSidebar')}</title></PanelLeftOpen> : <PanelLeftClose size={22}><title>{t('nav.collapseSidebar')}</title></PanelLeftClose>}
            </button>
          ) : null}
          <button
            onClick={() => { setMobileMenuOpen(!mobileMenuOpen); closeNotifications(); setProfileOpen(false) }}
            aria-label={t('nav.menu')}
            className="flex h-9 w-9 items-center justify-center rounded-xl min-[1101px]:hidden hover:bg-slate-500/5 transition-colors border-0 cursor-pointer"
          >
            <MaterialSymbol name={mobileMenuOpen ? 'close' : 'menu'} size={22} color="#374C6B" />
          </button>
          
          {!compact ? <div
            className="workspace-top-brand flex shrink-0 cursor-pointer items-center gap-2 lg:gap-3 lg:border-r border-slate-200/60 pr-4 lg:pr-6"
            onClick={() => {
              setActiveNav('home')
              navigate('/dashboard')
              setNotifOpen(false)
              setProfileOpen(false)
              setMobileMenuOpen(false)
            }}
          >
            <img src={`${import.meta.env.BASE_URL}axis-workspace-mark.png`} alt="" className="hidden h-9 w-9 shrink-0 object-contain sm:inline lg:h-10 lg:w-10" />
            <span className="hidden whitespace-nowrap text-[15px] tracking-[-0.05em] text-[#1A1F36] sm:inline lg:text-[16px]" style={{ fontFamily: 'Manrope, sans-serif' }}>
              <span className="font-bold">Team</span><span className="font-light">Space</span>
            </span>
          </div> : null}
        </div>

        {compact ? <form className="wr-search-form" onSubmit={(event) => { event.preventDefault(); if (isDriveSearch) return; navigate(globalSearch.trim() ? `/teamai?prompt=${encodeURIComponent(globalSearch.trim())}` : '/teamai') }}><div className="workspace-top-search"><MaterialSymbol name="search" size={20} color="#70819B" /><input ref={searchInputRef} value={globalSearch} onChange={(event) => handleGlobalSearchChange(event.target.value)} placeholder={isDriveSearch ? (pathname.startsWith('/drive/notebook') ? t('search.notebook') : t('search.drive')) : isNarrowSearch ? t('search.short') : t('search.placeholder')} aria-label={isDriveSearch ? t('search.drive') : t('search.label')} /><kbd>⌘ K</kbd></div></form> : null}

        {!compact ? <nav className="hidden lg:flex flex-1 items-center justify-center px-4 h-full min-w-0">
          <div className="no-scrollbar flex h-full items-center overflow-x-auto lg:overflow-visible bg-transparent px-2 gap-1 xl:gap-1.5">
          {NAV_GROUPS.map((groupIds, groupIndex) => (
            <div key={`group-${groupIndex}`} className="flex items-center gap-0.5 xl:gap-1">
              {groupIds
                .filter((itemId) => itemId !== 'alem-contact' || showAlemContact)
                .map((itemId) => {
                  const item = NAV_ITEMS.find((navItem) => navItem.id === itemId)
                  if (!item) return null
                  const isActive = activeNav === item.id
                  const isAiNav = Boolean(item.isAi)
                  const itemBadge = item.id === 'chat' ? chatUnreadCount : item.badge
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNav(item)}
                      className={[
                        'group relative flex h-9 items-center gap-1 xl:gap-1.5 2xl:gap-2 rounded-xl px-2 xl:px-2.5 2xl:px-3 py-1.5 transition-all duration-200 cursor-pointer border-0 font-[inherit] leading-none whitespace-nowrap',
                        isAiNav
                          ? isActive
                            ? 'bg-indigo-50/80 text-indigo-700 font-semibold ring-1 ring-indigo-100/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]'
                            : 'text-indigo-600/90 hover:bg-indigo-500/5 hover:text-indigo-800 font-medium'
                          : isActive
                            ? 'bg-[#EEF2FF] text-[#2458D3] font-semibold ring-1 ring-[#EEF2FF]/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]'
                            : 'text-[#6B7A99] hover:bg-slate-500/5 hover:text-[#1A1F36] font-medium',
                      ].join(' ')}
                    >
                      <div className="relative flex items-center justify-center">
                        <MaterialSymbol
                          name={item.icon}
                          size={18}
                          color={
                            isAiNav
                              ? isActive
                                ? '#4F46E5'
                                : '#6366F1'
                              : isActive
                                ? '#2458D3'
                                : 'currentColor'
                          }
                        />
                        {itemBadge ? (
                          <span className="absolute -top-2 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full border border-white bg-[#CB3F3F] px-1 text-[9px] font-bold text-white shadow-[0_2px_6px_rgba(203,63,63,0.3)]">
                            {itemBadge > 99 ? '99+' : itemBadge}
                          </span>
                        ) : null}
                      </div>
                      <span className="hidden xl:inline text-xs 2xl:text-[13px] tracking-tight whitespace-nowrap">
                        {t(item.labelKey)}
                      </span>
                      {/* Premium Tooltip for smaller screens where label is hidden */}
                      <span className="pointer-events-none absolute top-11 left-1/2 -translate-x-1/2 rounded-lg bg-slate-900/90 px-2.5 py-1.5 text-[11px] font-semibold text-white opacity-0 shadow-md transition-all duration-200 group-hover:translate-y-1 group-hover:opacity-100 group-hover:visible invisible whitespace-nowrap backdrop-blur-sm z-50 xl:hidden">
                        {t(item.labelKey)}
                      </span>
                    </button>
                  )
                })}
              {groupIndex < NAV_GROUPS.length - 1 ? (
                <div className="mx-1 xl:mx-2 2xl:mx-2.5 w-px h-5 bg-slate-200/60 align-middle self-center" aria-hidden />
              ) : null}
            </div>
          ))}
          </div>
        </nav> : null}

        <div className="flex shrink-0 items-center gap-2 ml-auto">
          <LanguageSwitcher />

          <div className="relative" ref={notifRef}>
            <button
              aria-label={t('notifications.title')}
              onClick={toggleNotifications}
              className={[
                'relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border-0 transition-all duration-200',
                notifOpen ? 'bg-[#EEF2FF] text-[#2458D3] ring-1 ring-[#EEF2FF]/60' : 'bg-transparent text-[#6B7F99] hover:bg-slate-500/5 hover:text-[#1A1F36]',
              ].join(' ')}
            >
              <MaterialSymbol name="notifications" size={20} color="currentColor" />
              {unread > 0 && (
                <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#CB3F3F] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#CB3F3F]"></span>
                </span>
              )}
            </button>

            {notifRender && (
              <div
                className={[
                  'absolute top-13 right-0 z-300 w-[min(560px,calc(100vw-16px))] max-w-[calc(100vw-16px)] overflow-hidden rounded-2xl border border-[#EDF2F8] bg-white/95 backdrop-blur-lg shadow-[0_16px_48px_rgba(15,35,62,0.1)] transition-all duration-220 ease-out sm:w-140 sm:max-w-140',
                  notifOpen ? 'translate-y-0 scale-100 opacity-100' : '-translate-y-2 scale-[0.98] opacity-0 pointer-events-none',
                ].join(' ')}
              >
                <div className="flex items-center justify-between border-b border-[#EDF2F8] px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-extrabold text-[#1A1F36]">{nt.notifications}</span>
                    {unread > 0 && (
                      <span className="rounded-lg bg-[#CB3F3F] px-1.75 py-px text-[10px] font-bold text-white shadow-sm">{unread} {nt.newItems}</span>
                    )}
                  </div>
                  <span
                    className="cursor-pointer text-[11px] font-semibold text-[#2458D3] hover:underline whitespace-nowrap"
                    onClick={() => { void handleMarkAllAsRead() }}
                  >
                    {nt.allRead}
                  </span>
                </div>

                <div className="max-h-[70vh] overflow-y-auto sm:max-h-[72vh] custom-scrollbar">
                  {notifications.map((n, i) => (
                    <div
                      key={`${n.id}-${n.type}`}
                      onClick={() => { void handleOpenNotification(n) }}
                      className={[
                        'flex cursor-pointer items-start gap-3 px-5 py-3.5 transition-all duration-200',
                        !n.isRead ? 'bg-[#F3F8FF]/60 hover:bg-[#F3F8FF]' : 'bg-transparent hover:bg-slate-500/5',
                        i < notifications.length - 1 ? 'border-b border-[#EDF2F8]' : '',
                      ].join(' ')}
                      style={{
                        transitionDelay: notifOpen ? `${Math.min(i, 6) * 16}ms` : '0ms',
                        transform: notifOpen ? 'translateY(0)' : 'translateY(-2px)',
                        opacity: notifOpen ? 1 : 0.94,
                      }}
                    >
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${n.isRead ? 'bg-slate-100' : 'bg-[#EEF2FF]'}`}>
                        <MaterialSymbol name={n.icon} size={17} color={n.isRead ? '#6B7A99' : '#2458D3'} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className={`min-w-0 text-xs text-[#1A1F36] ${n.isRead ? 'font-semibold' : 'font-bold'}`}>{n.title}</div>
                          <div className="shrink-0 text-[10px] font-medium text-[#6B7A99]">
                            {n.dateLabel || (n.createdAt ? formatNotificationDateTime(n.createdAt, locale) : '')}
                          </div>
                        </div>
                        <div className="mt-1 wrap-break-word text-[11px] leading-[1.45] text-[#6B7A99]">
                          {n.preview || n.subtitle}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {n.sourceName ? (
                            <span className="rounded-full border border-[#D9E3F0] bg-[#F5F8FC] px-2 py-0.5 text-[10px] font-semibold text-[#556987]">
                              {nt.source}: {n.sourceName}
                            </span>
                          ) : null}
                          {n.statusLabel ? (
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeClassName(n.statusTone)}`}>
                              {nt.status}: {n.statusLabel}
                            </span>
                          ) : null}
                        </div>
                        {isDriveDeleteApprovalNotification(n) && getDriveDeleteRequestStatus(n) === 'pending' && onResolveDriveDeleteRequest ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                void onResolveDriveDeleteRequest({
                                  notificationId: n.id,
                                  deleteRequestId: getDriveDeleteRequestId(n) as string,
                                  decision: 'approved',
                                })
                              }}
                              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white transition-colors hover:bg-emerald-700 border-0 cursor-pointer"
                            >
                              {t('common:actions.confirm')}
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                void onResolveDriveDeleteRequest({
                                  notificationId: n.id,
                                  deleteRequestId: getDriveDeleteRequestId(n) as string,
                                  decision: 'rejected',
                                })
                              }}
                              className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-bold text-rose-600 transition-colors hover:bg-rose-100 cursor-pointer"
                            >
                              {t('common:actions.reject')}
                            </button>
                          </div>
                        ) : null}
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            void handleOpenNotification(n)
                          }}
                          className="mt-2 text-[11px] font-semibold text-[#2458D3] hover:underline cursor-pointer border-0 bg-transparent"
                        >
                          {nt.details}
                        </button>
                      </div>
                      {!n.isRead && <div className="mt-1.5 h-1.75 w-1.75 shrink-0 rounded-full bg-[#2458D3] shadow-sm" />}
                    </div>
                  ))}

                  {notifications.length === 0 && (
                    <div className="px-5 py-5 text-xs text-[#6B7A99]">{nt.noNotifications}</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="h-5 w-px shrink-0 self-center bg-slate-200/60" aria-hidden />

          <div className="relative" ref={profileRef}>
            <button
              onClick={() => { setProfileOpen(!profileOpen); closeNotifications(); setMobileMenuOpen(false) }}
              className={[
                'flex h-9 cursor-pointer items-center gap-2 rounded-xl border-0 px-1.5 font-[inherit] text-[#1A1F36] transition-all duration-200',
                profileOpen ? 'bg-[#F4F7FB] ring-1 ring-slate-200/50' : 'bg-transparent hover:bg-slate-500/5',
              ].join(' ')}
            >
              <GradientAvatar initials={initials} src={avatarUrl} size={compact ? 40 : 28} seed={0} />
              <div className="hidden text-left md:block">
                <div className="wr-profile-name text-[12px] font-bold leading-none text-[#1A1F36]">{displayName}</div>
                {compact ? <div className="wr-profile-role mt-1 text-[10px] text-[#71829D]">{(ROLE_LABEL_KEYS[userRole] ? t(ROLE_LABEL_KEYS[userRole]) : userRole) || t('profile.defaultRole')}</div> : null}
              </div>
              <MaterialSymbol name="expand_more" size={16} color="#6B7A99" />
            </button>

            {profileOpen && (
              <div className="absolute top-13 right-0 z-300 w-56 overflow-hidden rounded-2xl border border-[#EDF2F8] bg-white/95 backdrop-blur-lg shadow-[0_16px_48px_rgba(15,35,62,0.1)]">
                <div className="flex items-center gap-3 border-b border-[#EDF2F8] px-4 py-3.5">
                  <GradientAvatar initials={initials} src={avatarUrl} size={32} seed={0} />
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-bold text-[#1A1F36]">{displayName}</div>
                  </div>
                </div>

                <div className="py-1">
                  <button
                    onClick={() => {
                      setProfileOpen(false)
                      setActiveNav('profile')
                      navigate('/profile')
                    }}
                    className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-[13px] text-[#374C6B] transition-colors hover:bg-slate-500/5 hover:text-[#1A1F36] border-0 bg-transparent font-[inherit]"
                  >
                    <MaterialSymbol name="badge" size={16} color="#6B7A99" />
                    {t('profile.myProfile')}
                  </button>
                </div>

                <div className="border-t border-[#EDF2F8] py-1">
                  <button
                    onClick={() => { setProfileOpen(false); void onLogout() }}
                    disabled={isLoggingOut}
                    className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-[13px] text-[#CB3F3F] transition-colors hover:bg-[#FEF0F0] disabled:opacity-60 border-0 bg-transparent font-[inherit]"
                  >
                    <MaterialSymbol name="logout" size={16} color="#CB3F3F" />
                    {isLoggingOut ? t('profile.loggingOut') : t('common:actions.logout')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        </div>
      </header>

      {selectedNotification ? (
        <AppModal title={selectedNotification.title} onClose={() => setSelectedNotification(null)} maxWidth={640}>
          {(() => {
            const isCalendarInvite =
              (selectedNotification.type === 'calendar_invite' ||
                selectedNotification.notificationType === 'calendar_invite' ||
                selectedNotification.type === 'calendar_event_created' ||
                selectedNotification.type === 'calendar_event_updated') &&
              selectedNotification.userId !== selectedNotification.organizerId &&
              Boolean(selectedNotification.metadata?.event_id || selectedNotification.metadata?.eventId)
            const isDriveDeleteApproval = isDriveDeleteApprovalNotification(selectedNotification)

            return (
              <div className="min-w-0 space-y-4 overflow-x-hidden">
                <div className="break-words text-[14px] font-semibold leading-6 text-[#0A1628]">
                  {selectedNotification.fullMessage || selectedNotification.preview || selectedNotification.subtitle}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {selectedNotification.sourceName ? (
                    <span className="rounded-full border border-[#D9E3F0] bg-[#F5F8FC] px-2.5 py-1 text-[11px] font-semibold text-[#556987]">
                      {nt.source}: {selectedNotification.sourceName}
                    </span>
                  ) : null}
                  {selectedNotification.statusLabel ? (
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badgeClassName(selectedNotification.statusTone)}`}>
                      {nt.status}: {selectedNotification.statusLabel}
                    </span>
                  ) : null}
                </div>

                {isCalendarInvite && (
                  <div className="rounded-2xl border border-[#E7EDF6] bg-[#F8FAFC] p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-extrabold text-[#374C6B]">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-[#2458D3]">
                        <MaterialSymbol name="event" size={14} color="currentColor" />
                      </span>
                      <span className="uppercase">{t('calendarInvite.title')}</span>
                    </div>

                    {(() => {
                      const current = selectedInviteResponseStatus
                      const statusMessage = rsvpSuccess || (current ? t(CALENDAR_INVITE_STATUS_MESSAGE_KEYS[current]) : '')
                      const tone = current ? CALENDAR_INVITE_OPTIONS.find((option) => option.status === current) : null
                      return (
                        <>
                          {statusMessage && tone ? (
                            <div className={`flex items-center gap-2 rounded-xl border p-3 text-[13px] font-semibold ${tone.messageClassName}`}>
                              <MaterialSymbol name={tone.icon} size={18} color="currentColor" />
                              {statusMessage}
                            </div>
                          ) : null}
                          {current ? (
                            <p className="text-[11px] font-semibold text-[#556987]">{t('calendarInvite.canChange')}</p>
                          ) : null}
                          <div className="grid grid-cols-3 gap-1.5">
                            {CALENDAR_INVITE_OPTIONS.map((option) => {
                              const isActive = current === option.status
                              return (
                                <button
                                  key={option.status}
                                  type="button"
                                  disabled={rsvpLoading || isActive}
                                  aria-pressed={isActive}
                                  onClick={() => handleCalendarRsvp(option.status)}
                                  className={`flex min-w-0 items-center justify-center gap-1 rounded-lg border px-1.5 py-1.5 text-[11px] font-bold transition-all duration-200 disabled:cursor-default ${option.buttonClassName} ${isActive ? 'ring-2 ring-offset-1 ' + option.ringClassName : ''} ${rsvpLoading && !isActive ? 'opacity-60' : ''}`}
                                >
                                  {rsvpLoading && !isActive ? (
                                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                  ) : (
                                    <MaterialSymbol name={option.icon} size={12} color="currentColor" />
                                  )}
                                  <span className="truncate">{t(option.labelKey)}</span>
                                </button>
                              )
                            })}
                          </div>
                          {rsvpError && (
                            <div className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-2.5">
                              {rsvpError}
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                )}

                {isDriveDeleteApproval && (
                  <div className="rounded-2xl border border-[#E7EDF6] bg-[#F8FAFC] p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-extrabold text-[#374C6B]">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                        <MaterialSymbol name="delete" size={14} color="currentColor" />
                      </span>
                      <span className="uppercase">{t('driveDelete.title')}</span>
                    </div>

                    {deleteDecisionSuccess ? (
                      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[13px] font-semibold text-emerald-600">
                        <MaterialSymbol name="check_circle" size={18} color="currentColor" />
                        {deleteDecisionSuccess}
                      </div>
                    ) : selectedDriveDeleteStatus === 'approved' ? (
                      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[13px] font-semibold text-emerald-600">
                        <MaterialSymbol name="check_circle" size={18} color="currentColor" />
                        {t('driveDelete.alreadyApproved')}
                      </div>
                    ) : selectedDriveDeleteStatus === 'rejected' ? (
                      <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[13px] font-semibold text-rose-600">
                        <MaterialSymbol name="close" size={18} color="currentColor" />
                        {t('driveDelete.rejectedDone')}
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            disabled={deleteDecisionLoading}
                            onClick={() => handleDriveDeleteDecision('approved')}
                            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs py-2.5 transition-all duration-200 shadow-sm hover:shadow"
                          >
                            {deleteDecisionLoading ? (
                              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            ) : (
                              <MaterialSymbol name="check" size={14} color="currentColor" />
                            )}
                            {t('driveDelete.approve')}
                          </button>

                          <button
                            type="button"
                            disabled={deleteDecisionLoading}
                            onClick={() => handleDriveDeleteDecision('rejected')}
                            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-rose-50 hover:bg-rose-100 disabled:opacity-60 border border-rose-200 text-rose-600 font-bold text-xs py-2.5 transition-all duration-200"
                          >
                            {deleteDecisionLoading ? (
                              <span className="h-3 w-3 animate-spin rounded-full border-2 border-rose-600 border-t-transparent" />
                            ) : (
                              <MaterialSymbol name="close" size={14} color="currentColor" />
                            )}
                            {t('driveDelete.reject')}
                          </button>
                        </div>

                        {deleteDecisionError && (
                          <div className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-2.5">
                            {deleteDecisionError}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

            <div className="grid gap-3 rounded-2xl border border-[#E7EDF6] bg-[#FBFCFE] p-4 sm:grid-cols-2">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#8A9BB5]">{nt.receivedAt}</div>
                <div className="mt-1 text-[13px] font-medium text-[#0A1628]">
                  {selectedNotification.createdAt ? formatNotificationDateTime(selectedNotification.createdAt, locale) : '-'}
                </div>
              </div>
              {selectedNotification.processedAt ? (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#8A9BB5]">{nt.processedAt}</div>
                  <div className="mt-1 text-[13px] font-medium text-[#0A1628]">
                    {formatNotificationDateTime(selectedNotification.processedAt, locale)}
                  </div>
                </div>
              ) : null}
              {selectedNotification.sourceName ? (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#8A9BB5]">{nt.sourceSystemName}</div>
                  <div className="mt-1 text-[13px] font-medium text-[#0A1628]">{selectedNotification.sourceName}</div>
                </div>
              ) : null}
              {selectedNotification.sourceSystemCode ? (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#8A9BB5]">{nt.sourceSystemCode}</div>
                  <div className="mt-1 text-[13px] font-medium text-[#0A1628]">{selectedNotification.sourceSystemCode}</div>
                </div>
              ) : null}
              {selectedNotification.externalMessageId ? (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#8A9BB5]">{nt.externalMessageId}</div>
                  <div className="mt-1 break-all text-[13px] font-medium text-[#0A1628]">{selectedNotification.externalMessageId}</div>
                </div>
              ) : null}
              {selectedNotification.applicationNumber ? (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#8A9BB5]">{nt.applicationNumber}</div>
                  <div className="mt-1 text-[13px] font-medium text-[#0A1628]">{selectedNotification.applicationNumber}</div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedNotification(null)}
                className="rounded-xl border border-[#D9E3F0] px-4 py-2 text-[13px] font-semibold text-[#52637D] transition hover:bg-[#F6F8FB]"
              >
                {nt.close}
              </button>
              {selectedNotification.actionUrl ? (
                <button
                  type="button"
                  onClick={() => openActionUrl(selectedNotification.actionUrl!)}
                  className="ts-button ts-button--primary rounded-xl bg-[#2458D3] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#1D49B3]"
                >
                  {nt.open}
                </button>
              ) : null}
            </div>
          </div>
            )
          })()}
        </AppModal>
      ) : null}

      {/* Mobile Drawer */}
      <div
        className={[
          'fixed left-3 right-3 top-19 bottom-3 z-500 w-auto max-w-[320px] transform overflow-hidden rounded-[12px] border border-[var(--ts-border)] bg-white shadow-[var(--ts-shadow-menu)] transition-transform duration-300 ease-in-out min-[1101px]:hidden',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-[120%] invisible pointer-events-none',
        ].join(' ')}
      >
        <div className="flex max-h-[calc(100vh-88px)] flex-col gap-1.5 overflow-y-auto p-4 custom-scrollbar">
          {NAV_ITEMS.filter((item) => item.id !== 'alem-contact' || showAlemContact).map((item) => {
            const isActive = activeNav === item.id
            const isAiNav = Boolean(item.isAi)
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item)}
                className={[
                  'flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all border-0 cursor-pointer font-[inherit]',
                  isAiNav
                    ? isActive
                      ? 'bg-indigo-50 text-indigo-700 font-bold ring-1 ring-indigo-100/70 shadow-sm'
                      : 'text-indigo-600/90 font-semibold hover:bg-indigo-500/5 hover:text-indigo-800'
                    : isActive
                      ? 'bg-[#EEF2FF] text-[#2458D3] font-bold ring-1 ring-[#EEF2FF]/60 shadow-sm'
                      : 'text-[#6B7A99] font-semibold hover:bg-slate-500/5 hover:text-[#1A1F36]',
                ].join(' ')}
              >
                <MaterialSymbol
                  name={item.icon}
                  size={20}
                  color={isAiNav ? (isActive ? '#4F46E5' : '#6366F1') : isActive ? '#2458D3' : 'currentColor'}
                />
                <span className="text-[13px] flex min-w-0 flex-1 items-center gap-2">
                  {t(item.labelKey)}
                </span>
                {isActive && (
                   <div className={`ml-auto h-1.5 w-1.5 rounded-full ${isAiNav ? 'bg-indigo-600' : 'bg-[#2458D3]'}`} />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
