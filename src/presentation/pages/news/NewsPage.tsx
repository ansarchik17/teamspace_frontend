import PageHeader from '../../../shared/ui/PageHeader'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  Building2,
  Edit3,
  Grid,
  X,
  Trash2,
  ImagePlus,
  FileText,
  Video,
  MoveUp,
  MoveDown,
  Search,
  Send,
  Check,
  ArrowRight,
  SlidersHorizontal,
  ChevronDown,
  ArrowLeft,
} from 'lucide-react'
import { HttpPublicationRepository } from '../../../infrastructure/repositories/HttpPublicationRepository'
import type {
  Publication,
  CreatePublicationInput,
  PublicationAttachment,
  PublicationContentBlock,
  PublicationContentDoc,
} from '../../../infrastructure/repositories/HttpPublicationRepository'
import { HttpProfileRepository } from '../../../infrastructure/repositories/HttpProfileRepository'
import { HttpMinistryRepository } from '../../../infrastructure/repositories/HttpMinistryRepository'
import { HttpUserDirectoryRepository } from '../../../infrastructure/repositories/HttpUserDirectoryRepository'
import type { UserDirectoryUser } from '../../../infrastructure/repositories/HttpUserDirectoryRepository'
import { HttpChatRepository } from '../../../infrastructure/repositories/HttpChatRepository'
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore'
import type { CurrentProfile } from '../../../domain/entities/profile-settings/ProfileSettingsModels'
import AppModal from '../../../shared/ui/AppModal'
import AppButton from '../../../shared/ui/AppButton'
import AppSelect from '../../../shared/ui/AppSelect'
import FloatingMenu, { floatingMenuItemClass } from '../../../shared/ui/FloatingMenu'
import PublicationRichTextEditor from './PublicationRichTextEditor'
import PublicationReadAnalyticsModal from './PublicationReadAnalyticsModal'
import PublicationAlertsModal from './PublicationAlertsModal'
import { notifyPublicationBannersChanged } from '../../../shared/news/publicationBannerEvents'
import { PublicationCard } from '../../components/workspace/PublicationCard'

/* -------------------------------------------------------------------------- */
/*  Design tokens                                                             */
/* -------------------------------------------------------------------------- */

const T = {
  primary: 'var(--ts-action)',
  primaryHover: 'var(--ts-action-hover)',
  accentBg: 'var(--ts-selection)',
  textPrimary: 'var(--ts-text)',
  textSecondary: 'var(--ts-text-secondary)',
  textMuted: 'var(--ts-text-secondary)',
  textPlaceholder: 'var(--ts-text-muted)',
  cardBorder: 'var(--ts-border)',
  inputBorder: 'var(--ts-border)',
  inputBg: 'var(--ts-surface)',
  panelBg: 'var(--ts-surface-muted)',
  pageBg: 'var(--ts-bg)',
  danger: 'var(--ts-danger)',
  iconHeader: 20,
  iconAction: 18,
  iconSmall: 16,
  iconMicro: 12,
} as const

const FILTERS = ['Все', 'Новости', 'Объявления', 'Документы', 'События'] as const
type Filter = (typeof FILTERS)[number]
type PublicationStatus = 'published' | 'draft' | 'scheduled' | 'archived'
type PublicationAction = 'publish' | 'unpublish' | 'archive' | 'unarchive-draft' | 'unarchive-publish'
const STATUS_TABS: Array<{ value: PublicationStatus; label: string }> = [
  { value: 'published', label: 'Лента' },
  { value: 'draft', label: 'Черновики' },
  { value: 'scheduled', label: 'Запланированные' },
  { value: 'archived', label: 'Архив' },
]
const STATUS_LABELS: Record<PublicationStatus, string> = {
  published: 'Опубликовано', draft: 'Черновик', scheduled: 'Запланировано', archived: 'В архиве',
}

const FILTER_TO_TYPE: Record<Filter, Publication['type'] | undefined> = {
  'Все': undefined,
  'Новости': 'news',
  'Объявления': 'announcement',
  'Документы': 'document',
  'События': 'event',
}

const dateFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
const timeFormatter = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })

const formatPubDate = (iso: string): string => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${dateFormatter.format(date)} в ${timeFormatter.format(date)}`
}

const shortDateFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
const formatShortDate = (iso?: string): string => {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return shortDateFormatter.format(date)
}

const toDateTimeLocal = (iso?: string): string => {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return offsetDate.toISOString().slice(0, 16)
}

const buildInitials = (first: string, last: string): string => {
  const f = first?.[0] || ''
  const l = last?.[0] || ''
  return (f + l).toUpperCase() || '—'
}

const ORG_PALETTE = ['#2458D3', '#6366F1', '#16A34A', '#8B5CF6', '#D97706', '#DC2626', '#64748B']

interface OrgItem {
  id: string
  ministryId: number | null
  name: string
  subtitle: string
  color: string
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function NewsPage() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000)
    return () => window.clearInterval(timer)
  }, [])
  const location = useLocation()
  const navigate = useNavigate()
  const { publicationId: routePublicationId } = useParams<{ publicationId: string }>()
  const requestedPublicationId = useMemo(() => routePublicationId?.trim() || new URLSearchParams(location.search).get('pub_id')?.trim() || '', [location.search, routePublicationId])
  const detailMode = Boolean(requestedPublicationId)
  const [activeFilter, setActiveFilter] = useState<Filter>('Все')
  const [activeStatus, setActiveStatus] = useState<PublicationStatus>('published')
  const [statusMenuAnchor, setStatusMenuAnchor] = useState<HTMLElement | null>(null)
  const [activeOrgId, setActiveOrgId] = useState<string>('all')

  const [publications, setPublications] = useState<Publication[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [me, setMe] = useState<CurrentProfile | null>(null)
  const [orgs, setOrgs] = useState<OrgItem[]>([
    { id: 'all', ministryId: null, name: 'Все публикации', subtitle: 'Общая рабочая лента', color: T.primary },
  ])
  const [directoryUsers, setDirectoryUsers] = useState<UserDirectoryUser[]>([])
  const [vacationsLoading, setVacationsLoading] = useState(true)
  const [importantAnnouncements, setImportantAnnouncements] = useState<Publication[]>([])
  const [announcementsLoading, setAnnouncementsLoading] = useState(true)

  const [highlightPubId, setHighlightPubId] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [editingPub, setEditingPub] = useState<Publication | null>(null)
  const [deletingPub, setDeletingPub] = useState<Publication | null>(null)
  const [readAnalyticsPublication, setReadAnalyticsPublication] = useState<Publication | null>(null)
  const [alertsPublication, setAlertsPublication] = useState<Publication | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [statusActionError, setStatusActionError] = useState<string | null>(null)
  const [statusActionMessage, setStatusActionMessage] = useState<string | null>(null)
  const [statusActionBusyId, setStatusActionBusyId] = useState<string | null>(null)
  const [archivingObsolete, setArchivingObsolete] = useState(false)
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [sharingPublication, setSharingPublication] = useState<Publication | null>(null)
  const [shareQuery, setShareQuery] = useState('')
  const [shareRecipientId, setShareRecipientId] = useState<number | null>(null)
  const [shareComment, setShareComment] = useState('')
  const [shareSending, setShareSending] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const [shareToast, setShareToast] = useState(false)
  const [sharePosition, setSharePosition] = useState({ top: 0, left: 0 })
  const shareAnchorRef = useRef<HTMLElement | null>(null)
  const sharePopoverRef = useRef<HTMLDivElement | null>(null)

  const sessionStore = useMemo(() => new LocalStorageAuthSessionStore(), [])
  const pubRepo = useMemo(() => new HttpPublicationRepository(sessionStore), [sessionStore])
  const profileRepo = useMemo(() => new HttpProfileRepository(sessionStore), [sessionStore])
  const ministryRepo = useMemo(() => new HttpMinistryRepository(sessionStore), [sessionStore])
  const userDirectoryRepo = useMemo(() => new HttpUserDirectoryRepository(sessionStore), [sessionStore])
  const chatRepo = useMemo(() => new HttpChatRepository(sessionStore), [sessionStore])

  /* ---- load profile + build organizations sidebar ---- */
  useEffect(() => {
    let cancelled = false
    profileRepo
      .getMe()
      .then(async (profile) => {
        if (cancelled) return
        setMe(profile)

        const next: OrgItem[] = [
          { id: 'all', ministryId: null, name: 'Все публикации', subtitle: 'Общая рабочая лента', color: T.primary },
        ]
        if (profile.ministryId) {
          try {
            const portal = await ministryRepo.getPortal(profile.ministryId)
            const name = portal.ministry?.name?.trim() || 'Моё министерство'
            next.push({
              id: `ministry-${profile.ministryId}`,
              ministryId: profile.ministryId,
              name,
              subtitle: 'Официальное ведомство',
              color: ORG_PALETTE[1],
            })
          } catch (err) {
            console.error('Failed to load ministry portal', err)
          }
        }
        if (!cancelled) setOrgs(next)
      })
      .catch((err) => console.error('Failed to load profile', err))
    return () => {
      cancelled = true
    }
  }, [profileRepo, ministryRepo])

  useEffect(() => {
    let cancelled = false
    setVacationsLoading(true)

    userDirectoryRepo
      .getUsers()
      .then((users) => {
        if (cancelled) return
        setDirectoryUsers(users)
      })
      .catch((err) => {
        console.error('Failed to load users', err)
      })
      .finally(() => {
        if (!cancelled) setVacationsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [userDirectoryRepo])

  /* ---- load important announcements ---- */
  const loadImportantAnnouncements = useCallback(async () => {
    setAnnouncementsLoading(true)
    try {
      const [urgent, important, recent] = await Promise.all([
        pubRepo.getPublications({ page: 1, limit: 20, status: 'published', importance: 'urgent' }),
        pubRepo.getPublications({ page: 1, limit: 20, status: 'published', importance: 'important' }),
        pubRepo.getPublications({ page: 1, limit: 20, status: 'published' }),
      ])
      const now = Date.now()
      const isActive = (flag?: boolean, until?: string | null) => Boolean(flag) && (!until || new Date(until).getTime() > now)
      const isPinned = (p: Publication) => isActive(p.is_pinned, p.pinned_until)
      const unique = new Map<string, Publication>()
      const candidates = [...urgent, ...important, ...recent].filter((p) => p.importance === 'urgent' || p.importance === 'important' || isPinned(p) || isActive(p.is_banner, p.banner_until))
      candidates.forEach((p) => { if (!unique.has(p.id)) unique.set(p.id, p) })
      const sorted = Array.from(unique.values()).sort((left, right) => {
        const pinnedDiff = Number(isPinned(right)) - Number(isPinned(left))
        if (pinnedDiff !== 0) return pinnedDiff
        return new Date(right.published_at || right.created_at).getTime() - new Date(left.published_at || left.created_at).getTime()
      })
      setImportantAnnouncements(sorted.slice(0, 5))
    } catch (err) {
      console.error('Failed to load important announcements', err)
      setImportantAnnouncements([])
    } finally {
      setAnnouncementsLoading(false)
    }
  }, [pubRepo])

  useEffect(() => {
    loadImportantAnnouncements()
  }, [loadImportantAnnouncements])

  /* ---- load feed ---- */
  const activeOrg = orgs.find((o) => o.id === activeOrgId) || orgs[0]

  const loadPublications = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const type = FILTER_TO_TYPE[activeFilter]
      const params: Parameters<typeof pubRepo.getPublications>[0] = {
        page: 1,
        limit: 20,
        status: activeStatus,
      }
      if (type) params.type = type
      if (activeOrg?.ministryId) params.ministry_id = activeOrg.ministryId
      let items = await pubRepo.getPublications(params)
      if (requestedPublicationId && params.status === 'published' && !items.some((item) => item.id === requestedPublicationId)) {
        try {
          const requestedPublication = await pubRepo.getPublicationById(requestedPublicationId)
          if (requestedPublication.status === 'published') items = [requestedPublication, ...items]
        } catch (err) {
          console.warn('Could not load the requested publication from the news feed', err)
        }
      }
      setPublications(items)
    } catch (err) {
      console.error('Failed to load publications', err)
      setError(err instanceof Error ? err.message : 'Не удалось загрузить публикации')
      setPublications([])
    } finally {
      setLoading(false)
    }
  }, [activeFilter, activeOrg?.ministryId, activeStatus, pubRepo, requestedPublicationId])

  useEffect(() => {
    loadPublications()
  }, [loadPublications])

  useEffect(() => {
    if (!requestedPublicationId) return
    setActiveFilter('Все')
    setActiveStatus('published')
    setActiveOrgId('all')
    setHighlightPubId(requestedPublicationId)
  }, [requestedPublicationId])

  // Every signed-in user can publish and manage their own drafts.
  // The API restricts non-published lists and mutations to the author.
  const canCreate = me !== null
  const isSuperAdmin = me?.role?.toLowerCase() === 'superadmin'
  const canManagePublicationStatuses = canCreate
  const shareUserOptions = directoryUsers
    .filter((user) => user.isActive && user.id !== me?.id)
    .filter((user) => {
      const query = shareQuery.trim().toLocaleLowerCase()
      if (!query) return true
      return `${user.fullName} ${user.email} ${user.username} ${user.position || ''}`.toLocaleLowerCase().includes(query)
    })

  const handlePublicationCreated = (pub: Publication) => {
    if (pub.status !== activeStatus && ['published', 'draft', 'scheduled', 'archived'].includes(pub.status || '')) {
      setActiveStatus(pub.status as PublicationStatus)
    } else {
      // Setting the same status does not trigger the feed-loading effect.
      void loadPublications()
    }
    setCreateOpen(false)
    loadImportantAnnouncements()
  }

  const handlePublicationUpdated = (pub: Publication) => {
    if (pub.status !== activeStatus && ['published', 'draft', 'scheduled', 'archived'].includes(pub.status || '')) {
      setActiveStatus(pub.status as PublicationStatus)
    } else {
      void loadPublications()
    }
    setEditingPub(null)
    loadImportantAnnouncements()
  }

  const changePublicationStatus = async (pub: Publication, action: PublicationAction) => {
    setStatusActionBusyId(pub.id)
    setStatusActionError(null)
    setStatusActionMessage(null)
    try {
      if (action === 'publish') await pubRepo.publishPublication(pub.id)
      else if (action === 'unpublish') await pubRepo.unpublishPublication(pub.id)
      else if (action === 'archive') await pubRepo.archivePublication(pub.id)
      else if (action === 'unarchive-draft') await pubRepo.unarchivePublication(pub.id, 'draft')
      else await pubRepo.unarchivePublication(pub.id, 'published')
      await loadPublications()
      loadImportantAnnouncements()
      setStatusActionMessage(action === 'archive' ? 'Публикация перемещена в архив.' : 'Статус публикации обновлён.')
    } catch (err) {
      setStatusActionError(err instanceof Error ? err.message : 'Не удалось изменить статус публикации')
    } finally {
      setStatusActionBusyId(null)
    }
  }

  const archiveObsolete = async () => {
    if (!window.confirm('Переместить в архив опубликованные новости старше 90 дней? Их можно будет восстановить.')) return
    setArchivingObsolete(true)
    setStatusActionError(null)
    setStatusActionMessage(null)
    try {
      const result = await pubRepo.archiveObsoletePublications({ older_than_days: 90 })
      setStatusActionMessage(`В архив перемещено публикаций: ${result.archived_count}.`)
      await loadPublications()
      loadImportantAnnouncements()
    } catch (err) {
      setStatusActionError(err instanceof Error ? err.message : 'Не удалось архивировать устаревшие публикации')
    } finally {
      setArchivingObsolete(false)
    }
  }

  const positionSharePopover = useCallback((anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect()
    const margin = 12
    const gap = 8
    const width = Math.min(320, window.innerWidth - margin * 2)
    const height = sharePopoverRef.current?.offsetHeight || 330
    const fitsRight = rect.left + width <= window.innerWidth - margin
    const left = Math.max(margin, Math.min(fitsRight ? rect.left : rect.right - width, window.innerWidth - width - margin))
    const spaceBelow = window.innerHeight - rect.bottom - gap - margin
    const spaceAbove = rect.top - gap - margin
    const top = height <= spaceBelow || spaceBelow >= spaceAbove
      ? Math.min(rect.bottom + gap, window.innerHeight - height - margin)
      : Math.max(margin, rect.top - gap - height)
    setSharePosition({ top, left })
  }, [])

  useLayoutEffect(() => {
    if (sharingPublication && shareAnchorRef.current) positionSharePopover(shareAnchorRef.current)
  }, [positionSharePopover, sharingPublication, shareQuery, shareError])

  const shareNewsPublication = async (pub: Publication, anchor?: HTMLElement): Promise<void> => {
    if (anchor) {
      shareAnchorRef.current = anchor
      positionSharePopover(anchor)
    }
    setShareQuery('')
    setShareRecipientId(null)
    setShareComment('')
    setShareError(null)
    setSharingPublication(pub)
  }

  useEffect(() => {
    if (!sharingPublication) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node
      if (!sharePopoverRef.current?.contains(target) && !shareAnchorRef.current?.contains(target) && !shareSending) {
        setSharingPublication(null)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !shareSending) setSharingPublication(null)
    }
    const reposition = () => {
      if (shareAnchorRef.current) positionSharePopover(shareAnchorRef.current)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [positionSharePopover, sharingPublication, shareSending])

  useEffect(() => {
    if (!shareToast) return
    const timeout = window.setTimeout(() => setShareToast(false), 1500)
    return () => window.clearTimeout(timeout)
  }, [shareToast])

  const sendPublicationToMessage = async () => {
    if (!sharingPublication || !shareRecipientId || shareSending) return
    setShareSending(true)
    setShareError(null)
    try {
      const shareUrl = `${window.location.origin}/web/news/${encodeURIComponent(sharingPublication.id)}`
      const summary = (sharingPublication.content || '').trim().slice(0, 180)
      const conversation = await chatRepo.createConversation(shareRecipientId)
      await chatRepo.sendMessage({
        chatId: conversation.id,
        chatType: 'personal',
        content: [shareComment.trim(), `Поделился публикацией: ${sharingPublication.title}`].filter(Boolean).join('\n'),
        type: 'text',
        metadata: JSON.stringify({
          type: 'publication',
          publication_id: sharingPublication.id,
          publication_title: sharingPublication.title,
          publication_summary: summary,
          publication_cover_url: sharingPublication.cover_image_url
            || sharingPublication.attachments?.find((item) => item.file_type === 'image' || item.mime_type?.startsWith('image/'))?.file_url
            || sharingPublication.attachments?.find((item) => item.thumbnail_url)?.thumbnail_url
            || undefined,
          publication_url: shareUrl,
          publication_source: sharingPublication.source_name,
          publication_type: sharingPublication.type,
        }),
      })
      setPublications((items) => items.map((item) => item.id === sharingPublication.id
        ? { ...item, shares_count: (item.shares_count || 0) + 1 }
        : item))
      void pubRepo.sharePublication(sharingPublication.id).catch((err) => console.warn('Failed to record publication share', err))
      setSharingPublication(null)
      setStatusActionError(null)
      setShareToast(true)
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Не удалось отправить публикацию')
    } finally {
      setShareSending(false)
    }
  }

  const acknowledgeNewsPublication = async (pub: Publication) => {
    try {
      await pubRepo.acknowledgePublication(pub.id)
      setPublications((items) => items.map((item) => item.id === pub.id ? { ...item, acknowledged: true } : item))
      notifyPublicationBannersChanged()
    } catch (err) {
      setStatusActionError(err instanceof Error ? err.message : 'Не удалось подтвердить ознакомление')
    }
  }

  const unacknowledgeNewsPublication = async (pub: Publication) => {
    try {
      await pubRepo.unacknowledgePublication(pub.id)
      setPublications((items) => items.map((item) => item.id === pub.id ? { ...item, acknowledged: false } : item))
    } catch (err) {
      setStatusActionError(err instanceof Error ? err.message : 'Не удалось отменить подтверждение ознакомления')
    }
  }

  const updateNewsCommentCount = (publicationId: string, diff: number) => {
    setPublications((items) => items.map((item) => item.id === publicationId
      ? { ...item, comments_count: Math.max(0, item.comments_count + diff) }
      : item))
  }

  const openDeleteDialog = (pub: Publication) => {
    setDeleteError(null)
    setDeletingPub(pub)
  }

  const closeDeleteDialog = () => {
    if (deleting) return
    setDeletingPub(null)
    setDeleteError(null)
  }

  const confirmDelete = async () => {
    if (!deletingPub) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await pubRepo.deletePublication(deletingPub.id)
      setPublications((prev) => prev.filter((p) => p.id !== deletingPub.id))
      loadImportantAnnouncements()
      setDeletingPub(null)
    } catch (err) {
      console.error('Failed to delete publication', err)
      setDeleteError(err instanceof Error ? err.message : 'Не удалось удалить публикацию')
    } finally {
      setDeleting(false)
    }
  }

  const handleAnnouncementClick = (ann: Publication) => {
    navigate(`/news/${encodeURIComponent(ann.id)}`)
  }

  // When target publication is present in the feed, scroll to it and briefly highlight
  useEffect(() => {
    if (!highlightPubId) return
    const target = publications.find((p) => p.id === highlightPubId)
    if (!target) return
    const el = document.getElementById(`pub-${highlightPubId}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const clearId = window.setTimeout(() => setHighlightPubId(null), 2200)
    return () => window.clearTimeout(clearId)
  }, [highlightPubId, publications])

  const displayedPublications = detailMode
    ? publications.filter((publication) => publication.id === requestedPublicationId)
    : publications

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        minHeight: 0,
        height: '100%',
        overflow: 'hidden',
        background: T.pageBg,
        fontFamily: 'var(--ts-font)',
      }}
    >
        {!detailMode && <div className="relative z-20 shrink-0 border-b" style={{ borderColor: T.cardBorder, background: T.pageBg }}>
        <div className="max-w-[1440px] w-full mx-auto px-4 pt-4 sm:px-6 sm:pt-5 lg:px-8 flex flex-col gap-2">
          <PageHeader title="Рабочая лента" description="Новости и объявления вашей команды" actions={<div className="flex flex-wrap items-center gap-2">{canManagePublicationStatuses && <>
              <AppButton variant="secondary" size="compact" aria-haspopup="menu" aria-expanded={Boolean(statusMenuAnchor)} onClick={event => setStatusMenuAnchor(statusMenuAnchor ? null : event.currentTarget)} className="!h-9 !min-h-9">
                <SlidersHorizontal size={16} /><span className="whitespace-nowrap">{STATUS_LABELS[activeStatus]}</span><ChevronDown size={16} />
              </AppButton>
              <FloatingMenu anchor={statusMenuAnchor} open={Boolean(statusMenuAnchor)} onClose={() => setStatusMenuAnchor(null)} className="w-56">
                {STATUS_TABS.map(tab => <button key={tab.value} type="button" role="menuitem" className={`${floatingMenuItemClass} justify-between`} onClick={() => { setActiveStatus(tab.value); setStatusActionError(null); setStatusActionMessage(null); setStatusMenuAnchor(null) }}>{tab.label}{activeStatus === tab.value && <Check size={14} />}</button>)}
                {isSuperAdmin && activeStatus === 'published' && <button type="button" role="menuitem" disabled={archivingObsolete} className={`${floatingMenuItemClass} border-t border-[#E6EAF1]`} onClick={() => { setStatusMenuAnchor(null); void archiveObsolete() }}>{archivingObsolete ? 'Архивация…' : 'Архивировать старше 90 дней'}</button>}
              </FloatingMenu>
            </>}{canCreate && <AppButton variant="primary" size="compact" onClick={() => setCreateOpen(true)} className="!h-9 !min-h-9"><Edit3 size={T.iconAction} />Создать публикацию</AppButton>}</div>} />
          {/* Workspace tabs */}
          <div className="flex items-center justify-between gap-4">
          <div className="inline-flex items-center gap-7 overflow-x-auto">
            {FILTERS.map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className="relative py-3 text-sm font-semibold whitespace-nowrap transition-colors"
                style={{ color: activeFilter === filter ? T.primary : T.textMuted }}
              >
                {filter}
                {activeFilter === filter && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full" style={{ background: T.primary }} />}
              </button>
            ))}
          </div>
          </div>
        </div>
        </div>}

      <div className="min-h-0 flex-1 overflow-auto">
      <div className="max-w-[1440px] w-full mx-auto p-4 sm:p-6 lg:px-8 lg:py-6 flex flex-col gap-5">
        <div className="grid grid-cols-1 items-start gap-5 mt-1 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6">
          <div className="min-w-0 flex flex-col gap-5">
            {detailMode
              ? <button type="button" onClick={() => navigate('/news')} className="mx-auto inline-flex w-full max-w-[860px] items-center gap-2 text-[13px] font-semibold transition-colors hover:text-[#2458D3]" style={{ color: T.textMuted }}><ArrowLeft size={16} /> Назад к ленте</button>
              : null}
            {statusActionError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{statusActionError}</div>}
            {statusActionMessage && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{statusActionMessage}</div>}
            {loading ? (
              <FeedSkeleton />
            ) : error ? (
              <Panel>
                <div className="text-center text-sm py-6" style={{ color: T.danger }}>
                  {error}
                  <div className="mt-3">
                    <button
                      onClick={loadPublications}
                      className="text-sm font-semibold hover:underline"
                      style={{ color: T.primary }}
                    >
                      Попробовать снова
                    </button>
                  </div>
                </div>
              </Panel>
            ) : displayedPublications.length === 0 ? (
              <Panel>
                <div className="text-center text-sm py-10" style={{ color: T.textMuted }}>
                  {activeStatus === 'draft' ? 'Черновиков пока нет' : activeStatus === 'scheduled' ? 'Запланированных публикаций пока нет' : activeStatus === 'archived' ? 'Архив пуст' : 'Пока нет публикаций'}
                </div>
              </Panel>
            ) : (
              displayedPublications.map((pub, index) => (
                <div key={pub.id} id={`pub-${pub.id}`} className={`space-y-2 transition-shadow duration-500 ${!detailMode && highlightPubId === pub.id ? 'rounded-2xl ring-2 ring-indigo-400 ring-offset-4' : ''}`}>
                  <PublicationCard
                    pub={pub}
                    priority={index < 2}
                    fullCard={detailMode}
                    onOpenPublication={!detailMode ? (publication) => navigate(`/news/${encodeURIComponent(publication.id)}`) : undefined}
                    currentProfile={me}
                    currentUserId={me?.id ?? null}
                    pubRepo={pubRepo}
                    onShare={shareNewsPublication}
                    onAcknowledge={acknowledgeNewsPublication}
                    onUnacknowledge={unacknowledgeNewsPublication}
                    onOpenReadAnalytics={setReadAnalyticsPublication}
                    onOpenAlerts={setAlertsPublication}
                    onEditPub={setEditingPub}
                    onDeletePub={async (publicationId) => {
                      const target = publications.find((item) => item.id === publicationId)
                      if (target) openDeleteDialog(target)
                    }}
                    onUnpublish={activeStatus === 'published' && (String(pub.author_id) === String(me?.id) || isSuperAdmin) ? () => void changePublicationStatus(pub, 'unpublish') : undefined}
                    onArchive={activeStatus === 'published' && (String(pub.author_id) === String(me?.id) || isSuperAdmin) ? () => void changePublicationStatus(pub, 'archive') : undefined}
                    statusActionBusy={statusActionBusyId === pub.id}
                    onCommentCountChange={updateNewsCommentCount}
                    setPreviewImageUrl={setPreviewImageUrl}
                    formatPubDate={formatPubDate}
                    setError={setStatusActionError}
                    setToast={setStatusActionMessage}
                  />
                  {(String(pub.author_id) === String(me?.id) || isSuperAdmin) && <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl px-2 py-1">
                    {activeStatus !== 'published' && <span className="mr-auto text-[11px] font-semibold text-slate-500">{STATUS_LABELS[activeStatus]}{activeStatus === 'scheduled' && pub.scheduled_at ? ` · ${formatPubDate(pub.scheduled_at)}` : ''}</span>}
                    {activeStatus === 'draft' && <button type="button" disabled={statusActionBusyId === pub.id} onClick={() => void changePublicationStatus(pub, 'publish')} className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 disabled:opacity-50">Опубликовать</button>}
                    {activeStatus === 'scheduled' && <>
                      <button type="button" disabled={statusActionBusyId === pub.id} onClick={() => void changePublicationStatus(pub, 'publish')} className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 disabled:opacity-50">Опубликовать сейчас</button>
                      <button type="button" disabled={statusActionBusyId === pub.id} onClick={() => void changePublicationStatus(pub, 'unpublish')} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-50">В черновик</button>
                    </>}
                    {activeStatus === 'archived' && <>
                      <button type="button" disabled={statusActionBusyId === pub.id} onClick={() => void changePublicationStatus(pub, 'unarchive-draft')} className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 disabled:opacity-50">Восстановить как черновик</button>
                      <button type="button" disabled={statusActionBusyId === pub.id} onClick={() => void changePublicationStatus(pub, 'unarchive-publish')} className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 disabled:opacity-50">Восстановить в ленту</button>
                    </>}
                  </div>}
                </div>
              ))
            )}
          </div>

          {/* RIGHT SIDEBAR */}
          <aside className="w-full min-w-0 flex flex-col gap-4 lg:sticky lg:top-4 lg:border-l lg:pl-6 lg:pr-2" style={{ borderColor: T.cardBorder }}>


            <Panel>
              <SectionHeader title="Мои организации" actionLabel="Все" />
              <div className="flex flex-col gap-1">
                {orgs.map((org) => {
                  const isActive = activeOrgId === org.id
                  return <button key={org.id} onClick={() => setActiveOrgId(org.id)} className="flex items-center gap-3 p-2 rounded-xl text-left transition-colors" style={{ background: isActive ? T.accentBg : 'transparent' }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: org.color, color: '#fff' }}>{org.ministryId ? <Building2 size={T.iconSmall} /> : <Grid size={T.iconSmall} />}</div>
                    <div className="flex-1 min-w-0"><div className="text-sm truncate" style={{ color: isActive ? T.primary : T.textSecondary, fontWeight: isActive ? 700 : 500 }}>{org.name}</div><div className="text-xs truncate" style={{ color: T.textMuted }}>{org.subtitle}</div></div>
                    <ArrowRight size={15} style={{ color: T.textPlaceholder }} />
                  </button>
                })}
              </div>
            </Panel>

            {/* Announcements Card */}
            <Panel>
              <SectionHeader title="Важные объявления" actionLabel={importantAnnouncements.length > 0 ? 'Все' : undefined} />
              {announcementsLoading ? (
                <div className="text-xs py-4 text-center" style={{ color: T.textMuted }}>Загрузка…</div>
              ) : importantAnnouncements.length === 0 ? (
                <div className="text-xs py-4 text-center" style={{ color: T.textMuted }}>
                  Нет важных объявлений
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {importantAnnouncements.map((ann) => {
                    return (
                      <button
                        key={ann.id}
                        type="button"
                        onClick={() => handleAnnouncementClick(ann)}
                        className="flex items-start gap-3 p-2 -mx-2 rounded-xl text-left transition-colors hover:bg-[#F8FAFC] focus:outline-none focus-visible:ring-2"
                        style={{ ['--tw-ring-color' as string]: T.primary }}
                      >
                        <div className="min-w-0 flex-1">
                          <div
                            className="text-sm font-semibold leading-tight mb-1 truncate"
                            style={{ color: T.textSecondary }}
                            title={ann.title}
                          >
                            {ann.title}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" style={{ color: T.textMuted }}>
                            <span>{formatShortDate(ann.published_at)}</span>
                            {ann.is_pinned && (!ann.pinned_until || new Date(ann.pinned_until).getTime() > now) ? <span className="font-semibold" style={{ color: T.primary }}>Закреплено</span> : null}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </Panel>


          </aside>

        </div>
      </div>
      </div>

      {sharingPublication && createPortal(
        <div
          ref={sharePopoverRef}
          role="dialog"
          aria-label="Поделиться публикацией"
          className="fixed z-[10080] overflow-hidden rounded-2xl border border-[#E2E5E9] bg-white shadow-[0_8px_28px_rgba(60,64,67,0.22)]"
          style={{ top: sharePosition.top, left: sharePosition.left, width: 'min(320px, calc(100vw - 24px))', maxHeight: 'min(420px, calc(100vh - 24px))' }}
        >
          <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[#202124]">Поделиться</div>
              <div className="mt-0.5 truncate text-xs text-[#5F6368]" title={sharingPublication.title}>{sharingPublication.title}</div>
            </div>
            <button type="button" aria-label="Закрыть" onClick={() => { if (!shareSending) setSharingPublication(null) }} className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#5F6368] hover:bg-[#F1F3F4]" disabled={shareSending}><X size={17} /></button>
          </div>
          <div className="px-3 pb-3">
            <label className="relative block">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5F6368]" />
              <input
                autoFocus
                value={shareQuery}
                onChange={(event) => setShareQuery(event.target.value)}
                placeholder="Добавить пользователей"
                className="h-9 w-full rounded-lg border border-[#DADCE0] bg-white pl-8 pr-2.5 text-[13px] text-[#202124] outline-none focus:border-[#1A73E8]"
              />
            </label>
            <div className="mt-2 max-h-40 overflow-y-auto">
              {shareUserOptions.length === 0 ? (
                <div className="px-2 py-5 text-center text-xs text-[#5F6368]">
                  {vacationsLoading ? 'Загружаем пользователей…' : shareQuery.trim() ? 'Пользователи не найдены' : 'Нет доступных пользователей'}
                </div>
              ) : shareUserOptions.slice(0, 50).map((user) => {
                const selected = shareRecipientId === user.id
                return <button
                  key={user.id}
                  type="button"
                  onClick={() => { setShareRecipientId(user.id); setShareError(null) }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${selected ? 'bg-[#E8F0FE]' : 'hover:bg-[#F1F3F4]'}`}
                >
                  {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" /> : <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E8F0FE] text-[11px] font-semibold text-[#1967D2]">{buildInitials(user.firstName, user.lastName)}</div>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-[#202124]">{user.fullName || `${user.firstName} ${user.lastName}`}</span>
                    <span className="block truncate text-[11px] text-[#5F6368]">{user.position || user.email}</span>
                  </span>
                  {selected && <span className="text-xs font-semibold text-[#1A73E8]">✓</span>}
                </button>
              })}
            </div>
            <input
              value={shareComment}
              onChange={(event) => setShareComment(event.target.value)}
              placeholder="Сообщение (необязательно)"
              className="mt-2 h-9 w-full rounded-lg border border-[#DADCE0] px-2.5 text-[12px] text-[#202124] outline-none focus:border-[#1A73E8]"
            />
            {shareError && <p role="alert" className="mt-2 text-xs text-[#B3261E]">{shareError}</p>}
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={() => void sendPublicationToMessage()} disabled={!shareRecipientId || shareSending} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#1A73E8] px-4 text-xs font-semibold text-white hover:bg-[#1765CC] disabled:cursor-not-allowed disabled:opacity-50">
                {shareSending ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Send size={13} />}
                Отправить
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {shareToast && <div role="status" className="fixed right-4 top-4 z-[10090] flex items-center gap-2 rounded-full border border-[#DADCE0] bg-white px-3 py-2 text-xs font-medium text-[#3C4043] shadow-[0_4px_14px_rgba(60,64,67,0.2)]">
        <Check size={14} className="text-[#188038]" /> Отправлено в сообщения
      </div>}

      {createOpen && (
        <CreatePublicationModal
          pubRepo={pubRepo}
          onClose={() => setCreateOpen(false)}
          onSaved={handlePublicationCreated}
        />
      )}

      {editingPub && (
        <CreatePublicationModal
          pubRepo={pubRepo}
          initial={editingPub}
          onClose={() => setEditingPub(null)}
          onSaved={handlePublicationUpdated}
        />
      )}

      {deletingPub && (
        <ConfirmDeleteModal
          title={deletingPub.title}
          submitting={deleting}
          error={deleteError}
          onCancel={closeDeleteDialog}
          onConfirm={confirmDelete}
        />
      )}

      {alertsPublication && <PublicationAlertsModal
        publication={alertsPublication}
        repository={pubRepo}
        onClose={() => setAlertsPublication(null)}
        onChanged={() => { void loadPublications(); void loadImportantAnnouncements() }}
      />}

      {readAnalyticsPublication && <PublicationReadAnalyticsModal
        publication={readAnalyticsPublication}
        repository={pubRepo}
        directoryUsers={directoryUsers}
        onClose={() => setReadAnalyticsPublication(null)}
      />}

      {previewImageUrl && <div className="ts-legacy-backdrop fixed inset-0 z-[10080] flex items-center justify-center bg-slate-950/85 p-4" role="dialog" aria-modal="true" onClick={() => setPreviewImageUrl(null)}>
        <button type="button" onClick={() => setPreviewImageUrl(null)} className="absolute right-5 top-5 rounded-full bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20">Закрыть</button>
        <img src={previewImageUrl} alt="Предпросмотр изображения" className="max-h-[90vh] max-w-[95vw] rounded-xl object-contain" onClick={(event) => event.stopPropagation()} />
      </div>}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Reusable primitives                                                       */
/* -------------------------------------------------------------------------- */

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="ts-panel p-4"
      style={{ border: `1px solid ${T.cardBorder}` }}
    >
      {children}
    </div>
  )
}

interface ConfirmDeleteModalProps {
  title: string
  submitting: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}

function ConfirmDeleteModal({ title, submitting, error, onCancel, onConfirm }: ConfirmDeleteModalProps) {
  return (
    <AppModal title="Удалить публикацию?" onClose={onCancel} maxWidth={440}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: '#FEF2F2', color: T.danger }}
          >
            <Trash2 size={T.iconAction} />
          </div>
          <div className="min-w-0">
            <p className="text-sm" style={{ color: T.textSecondary }}>
              Публикация будет удалена без возможности восстановления.
            </p>
            <p className="mt-1 text-sm font-semibold truncate" style={{ color: T.textPrimary }} title={title}>
              «{title}»
            </p>
          </div>
        </div>

        {error && (
          <div
            className="rounded-xl px-3 py-2 text-sm"
            style={{ border: '1px solid #FECACA', background: '#FEF2F2', color: T.danger }}
          >
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <AppButton variant="secondary" onClick={onCancel} disabled={submitting}>
            Отмена
          </AppButton>
          <AppButton variant="danger" onClick={onConfirm} isLoading={submitting}>
            Удалить
          </AppButton>
        </div>
      </div>
    </AppModal>
  )
}

function SectionHeader({ title, actionLabel }: { title: string; actionLabel?: string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-[15px] font-bold" style={{ color: T.textPrimary }}>
        {title}
      </h2>
      {actionLabel && (
        <button className="text-xs font-semibold hover:underline" style={{ color: T.primary }}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}

function FeedSkeleton() {
  const block = { background: T.panelBg }
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="mx-auto flex w-full max-w-[860px] animate-pulse flex-col gap-3.5 rounded-[20px] border bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)] sm:p-5"
          style={{ borderColor: '#E6EAF1' }}
        >
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 shrink-0 rounded-full" style={block} />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-2/5 rounded" style={block} />
              <div className="h-3 w-1/4 rounded" style={block} />
            </div>
          </div>
          <div className="space-y-2.5">
            <div className="h-4.5 w-3/4 rounded" style={block} />
            <div className="h-3.5 w-full rounded" style={block} />
            <div className="h-3.5 w-11/12 rounded" style={block} />
            <div className="h-3.5 w-2/3 rounded" style={block} />
          </div>
          <div className="h-3.5 w-24 rounded" style={block} />
          <div className="aspect-[16/9] max-h-[460px] w-full rounded-2xl" style={block} />
          <div className="flex items-center justify-between border-t pt-3.5" style={{ borderColor: '#EEF1F6' }}>
            <div className="flex gap-5">
              <div className="h-4 w-20 rounded" style={block} />
              <div className="h-4 w-24 rounded" style={block} />
              <div className="h-4 w-20 rounded" style={block} />
            </div>
            <div className="h-3.5 w-20 rounded" style={block} />
          </div>
        </div>
      ))}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/*  Create / edit publication modal                                           */
/* -------------------------------------------------------------------------- */

interface CreatePublicationModalProps {
  pubRepo: HttpPublicationRepository
  onClose: () => void
  onSaved: (pub: Publication) => void
  initial?: Publication
}

type SaveMode = 'draft' | 'publish'

interface StagedAttachment {
  key: string
  file?: File
  caption?: string
  existing?: PublicationAttachment
  video?: { video_url: string; caption: string; title?: string }
}

const attachmentKind = (attachment: Pick<PublicationAttachment, 'file_type' | 'file_name' | 'mime_type'>): 'image' | 'pdf' | 'video' | 'file' => {
  const type = String(attachment.file_type || '').toLowerCase()
  const name = String(attachment.file_name || '').toLowerCase()
  const mime = String(attachment.mime_type || '').toLowerCase()
  if (type.startsWith('image') || mime.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(name)) return 'image'
  if (type === 'pdf' || mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (type === 'video' || mime.startsWith('video/')) return 'video'
  return 'file'
}

const plainTextFromDoc = (doc: PublicationContentDoc): string => doc.blocks
  .filter((block) => ['paragraph', 'heading', 'quote'].includes(block.type))
  .map((block) => Array.isArray(block.runs) ? block.runs.map((run: any) => String(run?.text || '')).join('') : '')
  .join('\n')

const makeId = (prefix: string): string => `${prefix}-${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)}`

const validVideoUrl = (raw: string): boolean => {
  try {
    const url = new URL(raw)
    if (!['http:', 'https:'].includes(url.protocol)) return false
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    return ['youtube.com', 'youtu.be', 'rutube.ru', 'vimeo.com'].includes(host) || /\.(mp4|webm)$/i.test(url.pathname)
  } catch {
    return false
  }
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold mb-1.5" style={{ color: T.textSecondary }}>
      {children}
    </label>
  )
}

function CreatePublicationModal({ pubRepo, onClose, onSaved, initial }: CreatePublicationModalProps) {
  const isEdit = Boolean(initial)
  const [title, setTitle] = useState(initial?.title || '')
  const [type, setType] = useState<Publication['type']>(initial?.type || 'news')
  const [importance, setImportance] = useState<Publication['importance']>(initial?.importance || 'normal')
  const [allowComments, setAllowComments] = useState(initial?.allow_comments ?? true)
  const [requiresAck, setRequiresAck] = useState(initial?.requires_acknowledgement ?? false)
  const [scheduledAt, setScheduledAt] = useState(() => toDateTimeLocal(initial?.scheduled_at))
  const [archiveAt, setArchiveAt] = useState(() => toDateTimeLocal(initial?.archive_at))
  const [contentDoc, setContentDoc] = useState<PublicationContentDoc>(() => initial?.content_doc || {
    type: 'doc',
    version: 1,
    blocks: [{ id: makeId('text'), type: 'paragraph', runs: [{ text: initial?.content || '' }] }],
  })
  const [staged, setStaged] = useState<StagedAttachment[]>(() =>
    (initial?.attachments || []).slice().sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)).map((att) => ({ key: att.id, existing: att })),
  )
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverRemoved, setCoverRemoved] = useState(false)
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(initial?.cover_image_url || null)
  const [videoUrl, setVideoUrl] = useState('')
  const [videoCaption, setVideoCaption] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const pdfInputRef = useRef<HTMLInputElement | null>(null)
  const coverInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!coverFile) return
    const objectUrl = URL.createObjectURL(coverFile)
    setCoverPreviewUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [coverFile])

  const chooseCover = async (file?: File) => {
    if (!file) return
    const validType = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)
      || /\.(jpe?g|png|gif|webp)$/i.test(file.name)
    if (!validType) {
      setFormError('Для обложки поддерживаются JPEG, PNG, GIF и WebP.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setFormError('Размер обложки не должен превышать 10 МиБ.')
      return
    }
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file)
        const pixels = bitmap.width * bitmap.height
        bitmap.close()
        if (pixels > 40_000_000) {
          setFormError('Обложка не должна превышать 40 мегапикселей.')
          return
        }
      } catch {
        setFormError('Не удалось прочитать изображение обложки.')
        return
      }
    }
    setFormError(null)
    setCoverRemoved(false)
    setCoverFile(file)
  }

  const addFiles = async (files: FileList | null, expectedKind: 'image' | 'pdf') => {
    if (!files || files.length === 0) return
    const selected = Array.from(files)
    const accepted: StagedAttachment[] = []
    for (const file of selected) {
      const fileName = file.name.toLowerCase()
      const isImage = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type) || /\.(jpe?g|png|gif|webp)$/i.test(fileName)
      const isPdf = file.type === 'application/pdf' || fileName.endsWith('.pdf')
      if (expectedKind === 'image' && !isImage) {
        setFormError(`${file.name}: поддерживаются только JPEG, PNG, GIF и WebP.`)
        continue
      }
      if (expectedKind === 'pdf' && !isPdf) {
        setFormError(`${file.name}: можно прикрепить только PDF.`)
        continue
      }
      const limit = expectedKind === 'image' ? 25 * 1024 * 1024 : 50 * 1024 * 1024
      if (file.size > limit) {
        setFormError(`${file.name}: файл превышает лимит ${expectedKind === 'image' ? '25' : '50'} МиБ.`)
        continue
      }
      if (isImage && typeof createImageBitmap === 'function') {
        try {
          const bitmap = await createImageBitmap(file)
          const pixels = bitmap.width * bitmap.height
          bitmap.close()
          if (pixels > 40_000_000) {
            setFormError(`${file.name}: изображение превышает лимит 40 мегапикселей.`)
            continue
          }
        } catch {
          setFormError(`${file.name}: не удалось прочитать изображение.`)
          continue
        }
      }
      accepted.push({ key: makeId('attachment'), file })
    }

    const totalNewBytes = [...staged.filter((item) => item.file).map((item) => item.file!.size), ...accepted.map((item) => item.file!.size)]
      .reduce((total, size) => total + size, 0)
    if (totalNewBytes > 100 * 1024 * 1024) {
      setFormError('Общий размер новых файлов не должен превышать 100 МиБ.')
      return
    }
    const isExpectedKind = (item: StagedAttachment) => {
      if (item.video) return false
      const name = item.file?.name || item.existing?.file_name || ''
      const mime = item.file?.type || item.existing?.mime_type || ''
      return expectedKind === 'image'
        ? mime.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(name)
        : mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf')
    }
    if (staged.filter(isExpectedKind).length + accepted.length > 50) {
      setFormError(`Можно прикрепить не более 50 ${expectedKind === 'image' ? 'изображений' : 'PDF-файлов'}.`)
      return
    }
    if (accepted.length) {
      setFormError(null)
      setStaged((prev) => [...prev, ...accepted])
    }
  }

  const removeStaged = (index: number) => {
    setStaged((prev) => prev.filter((_, i) => i !== index))
  }

  const moveStaged = (index: number, direction: -1 | 1) => {
    setStaged((prev) => {
      const target = index + direction
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const setCaption = (index: number, caption: string) => {
    setStaged((prev) => prev.map((item, itemIndex) => itemIndex === index
      ? item.existing ? { ...item, existing: { ...item.existing, caption } }
        : item.video ? { ...item, video: { ...item.video, caption } }
          : { ...item, caption }
      : item))
  }

  const addVideo = () => {
    const url = videoUrl.trim()
    if (!validVideoUrl(url)) {
      setFormError('Укажите ссылку YouTube, RuTube, Vimeo или прямую ссылку на MP4/WebM.')
      return
    }
    if (staged.length >= 50) {
      setFormError('К публикации можно добавить не более 50 элементов.')
      return
    }
    setStaged((prev) => [...prev, { key: makeId('video'), video: { video_url: url, caption: videoCaption.trim() } }])
    setVideoUrl('')
    setVideoCaption('')
    setFormError(null)
  }

  const handleSubmit = async (mode: SaveMode) => {
    setFormError(null)
    const plainContent = plainTextFromDoc(contentDoc).trim()
    if (!title.trim() || (!plainContent && staged.length === 0)) {
      setFormError('Добавьте заголовок и текст или медиаконтент публикации')
      return
    }
    if (contentDoc.blocks.length + staged.length > 2000 || new TextEncoder().encode(JSON.stringify(contentDoc)).length > 4 * 1024 * 1024) {
      setFormError('Текст публикации превышает допустимый размер документа (до 2000 блоков и 4 МиБ).')
      return
    }
    const scheduledDate = scheduledAt ? new Date(scheduledAt) : null
    const archiveDate = archiveAt ? new Date(archiveAt) : null
    if (mode === 'publish' && scheduledAt && (!scheduledDate || Number.isNaN(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now())) {
      setFormError('Для отложенной публикации укажите дату и время в будущем.')
      return
    }
    const earliestArchive = scheduledDate && mode === 'publish' ? scheduledDate.getTime() : Date.now()
    if (archiveAt && (!archiveDate || Number.isNaN(archiveDate.getTime()) || archiveDate.getTime() <= earliestArchive)) {
      setFormError('Дата архивации должна быть позже времени публикации.')
      return
    }

    setSubmitting(true)
    try {
      const publicationFields: CreatePublicationInput = {
        source_type: 'user',
        type,
        title: title.trim(),
        content: plainContent,
        target_audience: 'all',
        importance,
        allow_comments: allowComments,
        requires_acknowledgement: requiresAck,
        status: 'draft',
        content_doc: contentDoc,
      }

      // Media endpoints require a publication UUID, so create a draft first.
      const draft = isEdit && initial ? initial : await pubRepo.createPublication(publicationFields)
      if (coverFile) await pubRepo.uploadPublicationCover(draft.id, coverFile)
      else if (coverRemoved && initial?.cover_image_url) await pubRepo.deletePublicationCover(draft.id)
      const uploadedByKey = new Map<string, PublicationAttachment>()
      const newImages = staged.filter((item) => item.file && (item.file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(item.file.name)))
      const newPdfs = staged.filter((item) => item.file && !(item.file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(item.file.name)))

      if (newImages.length) {
        const uploaded = await pubRepo.uploadPublicationGallery(draft.id, newImages.map((item) => ({ file: item.file!, caption: item.caption || '' })))
        if (uploaded.length !== newImages.length) throw new Error('Сервер вернул неполный список загруженных изображений')
        newImages.forEach((item, index) => uploadedByKey.set(item.key, uploaded[index]))
      }
      if (newPdfs.length) {
        const uploaded = await pubRepo.uploadPublicationAttachments(draft.id, newPdfs.map((item) => ({ file: item.file!, caption: item.caption || '' })))
        if (uploaded.length !== newPdfs.length) throw new Error('Сервер вернул неполный список загруженных PDF')
        newPdfs.forEach((item, index) => uploadedByKey.set(item.key, uploaded[index]))
      }
      for (const item of staged.filter((entry) => entry.video)) {
        const uploaded = await pubRepo.addPublicationVideo(draft.id, item.video!)
        uploadedByKey.set(item.key, uploaded)
      }

      const orderedAttachments = staged.map((item) => item.existing || uploadedByKey.get(item.key)).filter((item): item is PublicationAttachment => Boolean(item))
      const mediaBlocks: PublicationContentBlock[] = orderedAttachments.map((attachment) => {
        const kind = attachmentKind(attachment)
        const caption = attachment.caption || ''
        if (kind === 'image') return {
          id: makeId('image'), type: 'image', attachmentId: attachment.id,
          url: attachment.file_url, alt: attachment.file_name, caption,
        }
        if (kind === 'pdf') return {
          id: makeId('pdf'), type: 'pdf', attachmentId: attachment.id,
          url: attachment.file_url, file_name: attachment.file_name,
          file_size: attachment.file_size, mime_type: attachment.mime_type || 'application/pdf', caption,
        }
        if (kind === 'video') return {
          id: makeId('video'), type: 'video', attachmentId: attachment.id,
          url: attachment.video_url || attachment.file_url,
          embed_url: attachment.video_embed_url,
          provider: attachment.video_provider,
          caption,
        }
        return {
          id: makeId('file'), type: 'file', attachmentId: attachment.id,
          url: attachment.file_url, file_name: attachment.file_name,
          file_size: attachment.file_size, mime_type: attachment.mime_type, caption,
        }
      })
      const nextContentDoc: PublicationContentDoc = {
        type: 'doc',
        version: 1,
        blocks: [...contentDoc.blocks.filter((block) => ['paragraph', 'heading', 'quote', 'checklist', 'table'].includes(block.type)), ...mediaBlocks],
      }

      if (nextContentDoc.blocks.length > 2000 || new TextEncoder().encode(JSON.stringify(nextContentDoc)).length > 4 * 1024 * 1024) {
        throw new Error('Документ публикации превышает допустимый размер (до 2000 блоков и 4 МиБ).')
      }

      const keptIds = new Set(staged.map((item) => item.existing?.id).filter((id): id is string => Boolean(id)))
      const removedExisting = (initial?.attachments || []).filter((attachment) => !keptIds.has(attachment.id))
      for (const attachment of removedExisting) {
        await pubRepo.deletePublicationAttachment(draft.id, attachment.id)
      }
      if (orderedAttachments.length) {
        await pubRepo.reorderPublicationAttachments(draft.id, orderedAttachments.map((item) => item.id))
      }

      const input = {
        ...publicationFields,
        status: isEdit ? (initial?.status || 'published') : 'draft',
        content: plainContent,
        content_doc: nextContentDoc,
      }
      await pubRepo.updatePublication(draft.id, input)
      if (mode === 'publish') {
        if (initial?.status === 'archived') await pubRepo.unarchivePublication(draft.id, 'draft')
        await pubRepo.publishPublication(draft.id, {
          ...(scheduledDate ? { scheduled_at: scheduledDate.toISOString() } : {}),
          ...(archiveDate ? { archive_at: archiveDate.toISOString() } : {}),
        })
      } else if (isEdit && initial?.status !== 'draft') {
        await pubRepo.unpublishPublication(draft.id)
      }
      const saved = await pubRepo.getPublicationById(draft.id)
      onSaved(saved)
    } catch (err) {
      console.error('Failed to save publication', err)
      setFormError(err instanceof Error ? err.message : 'Не удалось сохранить публикацию')
    } finally {
      setSubmitting(false)
    }
  }

  const inputBaseClass = 'w-full h-10 rounded-xl px-3 text-sm outline-none focus:ring-2 transition'

  return (
    <AppModal title={isEdit ? 'Редактировать публикацию' : 'Создать публикацию'} onClose={onClose} maxWidth={640}>
      <div className="flex flex-col gap-4">
        <div>
          <FieldLabel>Заголовок</FieldLabel>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например: Новые правила отчетности"
            className={inputBaseClass}
            style={{
              border: `1px solid ${T.inputBorder}`,
              background: T.inputBg,
              color: T.textPrimary,
            }}
          />
        </div>

        <div>
          <FieldLabel>Текст</FieldLabel>
          <PublicationRichTextEditor
            initialDoc={initial?.content_doc}
            initialText={initial?.content || ''}
            onChange={setContentDoc}
          />
        </div>

        <div>
          <FieldLabel>Обложка новости</FieldLabel>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp"
            onChange={(event) => {
              void chooseCover(event.target.files?.[0])
              event.currentTarget.value = ''
            }}
            className="hidden"
          />
          {coverPreviewUrl ? <div className="relative mb-2 overflow-hidden rounded-xl border" style={{ borderColor: T.inputBorder }}>
            <img src={coverPreviewUrl} alt="Предпросмотр обложки" className="max-h-52 w-full object-cover" />
            <button type="button" onClick={() => { setCoverFile(null); setCoverRemoved(true); setCoverPreviewUrl(null) }} className="absolute right-2 top-2 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow hover:bg-white">Удалить обложку</button>
          </div> : null}
          <button type="button" onClick={() => coverInputRef.current?.click()} className="inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-sm hover:bg-slate-50" style={{ borderColor: T.inputBorder, color: T.textSecondary }}>
            <ImagePlus size={T.iconSmall} /> {coverPreviewUrl ? 'Заменить обложку' : 'Добавить обложку'}
          </button>
          <p className="mt-1 text-[11px]" style={{ color: T.textMuted }}>JPEG, PNG, GIF или WebP · до 10 МиБ</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel>Дата и время публикации</FieldLabel>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
              className={inputBaseClass}
              style={{ border: `1px solid ${T.inputBorder}`, background: T.inputBg, color: T.textPrimary }}
            />
            <p className="mt-1 text-[11px]" style={{ color: T.textMuted }}>Оставьте пустым для публикации сразу.</p>
          </div>
          <div>
            <FieldLabel>Переместить в архив</FieldLabel>
            <input
              type="datetime-local"
              value={archiveAt}
              onChange={(event) => setArchiveAt(event.target.value)}
              className={inputBaseClass}
              style={{ border: `1px solid ${T.inputBorder}`, background: T.inputBg, color: T.textPrimary }}
            />
            <p className="mt-1 text-[11px]" style={{ color: T.textMuted }}>Необязательно: публикация скроется и попадёт в архив.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <FieldLabel>Тип</FieldLabel>
            <AppSelect
              value={type}
              onChange={(v) => setType(v as Publication['type'])}
              showButtonAvatar={false}
              showOptionAvatar={false}
              options={[
                { label: 'Новость', value: 'news' },
                { label: 'Объявление', value: 'announcement' },
                { label: 'Документ', value: 'document' },
                { label: 'Событие', value: 'event' },
                { label: 'Обращение', value: 'appeal' },
              ]}
            />
          </div>

          <div>
            <FieldLabel>Важность</FieldLabel>
            <AppSelect
              value={importance}
              onChange={(v) => setImportance(v as Publication['importance'])}
              showButtonAvatar={false}
              showOptionAvatar={false}
              options={[
                { label: 'Обычная', value: 'normal' },
                { label: 'Важная', value: 'important' },
                { label: 'Срочная', value: 'urgent' },
              ]}
            />
          </div>

        </div>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: T.textSecondary }}>
            <input
              type="checkbox"
              checked={allowComments}
              onChange={(e) => setAllowComments(e.target.checked)}
              className="h-4 w-4 rounded"
              style={{ accentColor: T.primary }}
            />
            Разрешить комментарии
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: T.textSecondary }}>
            <input
              type="checkbox"
              checked={requiresAck}
              onChange={(e) => setRequiresAck(e.target.checked)}
              className="h-4 w-4 rounded"
              style={{ accentColor: T.primary }}
            />
            Требуется подтверждение прочтения
          </label>
        </div>

        <div>
          <FieldLabel>Медиаконтент</FieldLabel>
          <input
            ref={imageInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp"
            onChange={(e) => {
              void addFiles(e.target.files, 'image')
              if (e.target) e.target.value = ''
            }}
            className="hidden"
          />
          <input
            ref={pdfInputRef}
            type="file"
            multiple
            accept="application/pdf,.pdf"
            onChange={(e) => {
              void addFiles(e.target.files, 'pdf')
              if (e.target) e.target.value = ''
            }}
            className="hidden"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => imageInputRef.current?.click()} className="inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-sm hover:bg-slate-50" style={{ borderColor: T.inputBorder, color: T.textSecondary }}>
              <ImagePlus size={T.iconSmall} /> Добавить изображения
            </button>
            <button type="button" onClick={() => pdfInputRef.current?.click()} className="inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-sm hover:bg-slate-50" style={{ borderColor: T.inputBorder, color: T.textSecondary }}>
              <FileText size={T.iconSmall} /> Прикрепить PDF
            </button>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="Ссылка YouTube, RuTube, Vimeo или MP4/WebM" className="h-9 min-w-0 rounded-lg border px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-100" style={{ borderColor: T.inputBorder, background: T.inputBg }} />
            <input value={videoCaption} onChange={(e) => setVideoCaption(e.target.value)} placeholder="Подпись к видео (необязательно)" className="h-9 min-w-0 rounded-lg border px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-100" style={{ borderColor: T.inputBorder, background: T.inputBg }} />
            <button type="button" onClick={addVideo} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-indigo-50 px-3 text-sm font-medium text-indigo-700 hover:bg-indigo-100">
              <Video size={15} /> Добавить видео
            </button>
          </div>

          {staged.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5">
              {staged.map((item, index) => {
                const name = item.file?.name || item.existing?.file_name || item.video?.video_url || 'Файл'
                const kind = item.video ? 'video' : item.file ? item.file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(item.file.name) ? 'image' : 'pdf' : item.existing ? attachmentKind(item.existing) : 'file'
                const caption = item.video?.caption ?? item.existing?.caption ?? item.caption ?? ''
                return (
                  <div
                    key={item.key}
                    className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-xs"
                    style={{
                      border: `1px solid ${T.cardBorder}`,
                      background: T.inputBg,
                      color: T.textSecondary,
                    }}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
                      {kind === 'image' ? <ImagePlus size={14} /> : kind === 'video' ? <Video size={14} /> : <FileText size={14} />}
                      <span className="truncate">{name}</span>
                    </span>
                    <input
                      aria-label={`Подпись: ${name}`}
                      value={caption}
                      onChange={(event) => setCaption(index, event.target.value)}
                      placeholder="Подпись"
                      className="h-8 w-full rounded-md border bg-white px-2 text-xs sm:order-2 sm:w-52"
                      style={{ borderColor: T.inputBorder }}
                    />
                    <button type="button" onClick={() => moveStaged(index, -1)} disabled={index === 0} aria-label={`Переместить ${name} выше`} className="rounded p-1 hover:bg-slate-100 disabled:opacity-30"><MoveUp size={14} /></button>
                    <button type="button" onClick={() => moveStaged(index, 1)} disabled={index === staged.length - 1} aria-label={`Переместить ${name} ниже`} className="rounded p-1 hover:bg-slate-100 disabled:opacity-30"><MoveDown size={14} /></button>
                    <button
                      type="button"
                      onClick={() => removeStaged(index)}
                      className="hover:text-red-500"
                      style={{ color: T.textPlaceholder }}
                      aria-label="Удалить"
                    >
                      <X size={T.iconMicro + 2} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {formError && (
          <div
            className="rounded-xl px-3 py-2 text-sm"
            style={{ border: '1px solid #FECACA', background: '#FEF2F2', color: T.danger }}
          >
            {formError}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <AppButton variant="secondary" onClick={onClose} disabled={submitting}>
            Отмена
          </AppButton>
          <AppButton variant="secondary" onClick={() => void handleSubmit('draft')} disabled={submitting}>
            Сохранить черновик
          </AppButton>
          <AppButton variant="primary" onClick={() => void handleSubmit('publish')} isLoading={submitting}>
            {scheduledAt ? 'Запланировать' : isEdit ? 'Сохранить и опубликовать' : 'Опубликовать'}
          </AppButton>
        </div>
      </div>
    </AppModal>
  )
}
