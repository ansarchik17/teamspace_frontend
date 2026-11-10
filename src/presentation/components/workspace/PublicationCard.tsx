import { useTranslation } from 'react-i18next'
import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react'
import { normalizeBackendAssetUrl } from '../../../infrastructure/http/normalizeBackendAssetUrl'
import { BadgeCheck, Check, ChevronDown, CircleAlert, CircleCheck, ChevronLeft, ChevronRight, Heart, MessageCircle, SendHorizontal, Share2, SmilePlus, ThumbsUp, X } from 'lucide-react'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import FloatingMenu, { floatingMenuDangerClass, floatingMenuItemClass } from '../../../shared/ui/FloatingMenu'
import GradientAvatar from '../../../shared/ui/GradientAvatar'
import { HttpPublicationRepository } from '../../../infrastructure/repositories/HttpPublicationRepository'
import type { Publication, PublicationComment, PublicationAttachment, PublicationReactionSummary } from '../../../infrastructure/repositories/HttpPublicationRepository'
import type { CurrentProfile } from '../../../domain/entities/profile-settings/ProfileSettingsModels'
import kazakhstanCoatOfArms from '../../../assets/kazakhstan_coat_of_arms.jpg'
import { renderTextWithLinks } from '../../../shared/utils/renderTextWithLinks'


const TYPE_LABELS: Record<string, string> = {
  'news': 'Новость',
  'announcement': 'Объявление',
  'document': 'Документ',
  'event': 'Событие',
  'appeal': 'Обращение'
}

const VACATION_PUBLICATION_TITLE_SUFFIX = 'находится в отпуске'
const PUBLICATION_REACTIONS = ['👍', '👎', '❤️', '🔥', '🎉', '😂', '😮', '😢', '👏', '🙏', '😍', '🤔', '💯']
const COMMENT_REACTIONS = ['👍', '👎', '❤️', '🔥', '🎉', '😂', '😮', '😢', '👏', '🙏', '😍', '🤔', '💯']

const updateCommentTree = (
  comments: PublicationComment[],
  commentId: string,
  update: (comment: PublicationComment) => PublicationComment,
): PublicationComment[] => comments.map((comment) => comment.id === commentId
  ? update(comment)
  : { ...comment, replies: comment.replies ? updateCommentTree(comment.replies, commentId, update) : [] })

const countCommentTree = (comments: PublicationComment[]): number => comments.reduce((count, comment) => count + 1 + countCommentTree(comment.replies || []), 0)

interface VacationPublicationDetails {
  periodLabel: string
  durationLabel: string
}

const parseVacationPublicationDetails = (publication: Publication): VacationPublicationDetails | null => {
  if (!publication.title?.toLowerCase().includes(VACATION_PUBLICATION_TITLE_SUFFIX)) {
    return null
  }

  const content = publication.content || ''
  const periodMatch = content.match(/Период отпуска:\s*(.+)/i)
  const durationMatch = content.match(/Длительность:\s*(.+)/i)
  if (!periodMatch && !durationMatch) {
    return null
  }

  return {
    periodLabel: periodMatch?.[1]?.trim() || 'Период отпуска уточняется',
    durationLabel: durationMatch?.[1]?.trim() || 'В отпуске',
  }
}

const renderCommentContent = (content: string) => {
  const mentionMatch = content.match(/^@([^,]+),\s*(.*)$/)
  if (mentionMatch) {
    const [, name, text] = mentionMatch
    return (
      <>
        <span className="inline-flex items-center text-[#2458D3] font-semibold bg-[#EEF2FF] px-1.5 py-0.5 rounded-lg text-[10.5px] mr-1.5 align-middle select-none">
          @{name}
        </span>
        <span className="align-middle break-words [overflow-wrap:anywhere] [word-break:break-word]">{renderTextWithLinks(text)}</span>
      </>
    )
  }
  return renderTextWithLinks(content)
}

const publicationDocText = (doc: Publication['content_doc']): string => (doc?.blocks || [])
  .filter((block) => ['paragraph', 'heading', 'quote'].includes(block.type))
  .map((block: any) => Array.isArray(block.runs) ? block.runs.map((run: any) => String(run?.text || '')).join('') : '')
  .join('\n')

const limitedPublicationBlocks = (blocks: NonNullable<Publication['content_doc']>['blocks'], limit: number) => {
  let remaining = limit
  const result: any[] = []
  for (const block of blocks) {
    if (!['paragraph', 'heading', 'quote'].includes(block.type) || remaining <= 0) continue
    const runs = Array.isArray((block as any).runs) ? (block as any).runs : []
    const nextRuns: any[] = []
    for (const run of runs) {
      if (remaining <= 0) break
      const text = String(run?.text || '')
      const nextText = text.slice(0, remaining)
      remaining -= nextText.length
      if (nextText) nextRuns.push({ ...run, text: nextText })
    }
    result.push({ ...block, runs: nextRuns })
  }
  return result
}

const renderPublicationRuns = (runs: unknown) => {
  if (!Array.isArray(runs)) return null
  return runs.map((run: any, index) => {
    let node: React.ReactNode = String(run?.text || '')
    const marks = Array.isArray(run?.marks) ? run.marks as string[] : []
    marks.forEach((mark) => {
      if (mark === 'bold') node = <strong>{node}</strong>
      else if (mark === 'italic') node = <em>{node}</em>
      else if (mark === 'underline') node = <u>{node}</u>
      else if (mark === 'strike') node = <s>{node}</s>
      else if (mark === 'code') node = <code className="rounded bg-slate-100 px-1">{node}</code>
      else if (mark === 'highlight') node = <mark className="rounded bg-yellow-100 px-0.5">{node}</mark>
      else if (mark === 'subscript') node = <sub>{node}</sub>
      else if (mark === 'superscript') node = <sup>{node}</sup>
      else if (mark.startsWith('color:') && /^#[\da-f]{6}$/i.test(mark.slice(6))) node = <span style={{ color: mark.slice(6) }}>{node}</span>
      else if (mark.startsWith('link:')) {
        try {
          const url = new URL(mark.slice(5))
          if (['http:', 'https:'].includes(url.protocol)) node = <a href={url.href} target="_blank" rel="noreferrer" className="text-[#2458D3] underline">{node}</a>
        } catch { /* Ignore malformed links from older content. */ }
      }
    })
    return <React.Fragment key={index}>{node}</React.Fragment>
  })
}

const renderPublicationContentDoc = (blocks: any[]) => blocks.map((block, index) => {
  if (block.type === 'paragraph') return <p key={block.id || index}>{renderPublicationRuns(block.runs)}</p>
  if (block.type === 'heading') {
    const level = Math.min(6, Math.max(1, Number(block.level) || 2))
    const className = level <= 2 ? 'text-[15px] font-bold text-[#0A1628]' : 'font-semibold text-[#0A1628]'
    return <h4 key={block.id || index} className={className}>{renderPublicationRuns(block.runs)}</h4>
  }
  if (block.type === 'quote') return <blockquote key={block.id || index} className="border-l-2 border-[#B7C7FA] pl-3 italic text-[#64748B]">{renderPublicationRuns(block.runs)}</blockquote>
  if (block.type === 'checklist' && Array.isArray(block.items)) return (
    <ul key={block.id || index} className="space-y-1">
      {block.items.map((item: any, itemIndex: number) => <li key={item.id || itemIndex} className="flex gap-2"><span>{item.checked ? '☑' : '□'}</span><span>{String(item.text || '')}</span></li>)}
    </ul>
  )
  if (block.type === 'table' && Array.isArray(block.rows)) return (
    <div key={block.id || index} className="overflow-x-auto"><table className="min-w-full border-collapse text-left text-xs"><tbody>
      {block.rows.map((row: any[], rowIndex: number) => <tr key={rowIndex}>{(Array.isArray(row) ? row : []).map((cell: any, cellIndex: number) => <td key={cellIndex} className="border border-[#E7ECF5] px-2 py-1">{String(cell?.text || '')}</td>)}</tr>)}
    </tbody></table></div>
  )
  return null
})

const safeVideoEmbed = (rawUrl?: string): string | null => {
  if (!rawUrl) return null
  try {
    const url = new URL(rawUrl)
    const allowedHosts = ['youtube.com', 'www.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com', 'rutube.ru', 'www.rutube.ru', 'player.vimeo.com']
    return url.protocol === 'https:' && allowedHosts.includes(url.hostname.toLowerCase()) ? url.href : null
  } catch {
    return null
  }
}

const sessionViewedPubs = new Set<string>()
const VIEWED_PUBLICATIONS_STORAGE_KEY = 'workspace:viewed-publications'

const hasStoredPublicationView = (userId: number | null, pubId: string) => {
  if (typeof window === 'undefined' || !userId) {
    return false
  }

  try {
    const raw = window.localStorage.getItem(VIEWED_PUBLICATIONS_STORAGE_KEY)
    if (!raw) {
      return false
    }

    const parsed = JSON.parse(raw) as Record<string, string[]>
    return Array.isArray(parsed[String(userId)]) && parsed[String(userId)].includes(pubId)
  } catch {
    return false
  }
}

const storePublicationView = (userId: number | null, pubId: string) => {
  if (typeof window === 'undefined' || !userId) {
    return
  }

  try {
    const raw = window.localStorage.getItem(VIEWED_PUBLICATIONS_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) as Record<string, string[]> : {}
    const userKey = String(userId)
    const nextIds = new Set(parsed[userKey] || [])
    nextIds.add(pubId)
    parsed[userKey] = Array.from(nextIds)
    window.localStorage.setItem(VIEWED_PUBLICATIONS_STORAGE_KEY, JSON.stringify(parsed))
  } catch {
    // Ignore storage failures and keep runtime-only dedupe.
  }
}

const relativeCommentTime = (iso: string, fallback: (value: string) => string): string => {
  const time = new Date(iso).getTime()
  if (!Number.isFinite(time)) return ''
  const minutes = Math.floor((Date.now() - time) / 60000)
  if (minutes < 1) return 'только что'
  if (minutes < 60) return `${minutes} мин. назад`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ч. назад`
  return fallback(iso)
}

interface FeedMediaItem {
  key: string
  src: string
  full: string
  alt: string
  caption?: string
}

function FeedMediaCarousel({ items, priority, onOpen }: { items: FeedMediaItem[]; priority: boolean; onOpen: (url: string) => void }) {
  const [index, setIndex] = useState(0)
  const trackRef = useRef<HTMLDivElement>(null)
  const count = items.length

  const goTo = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(count - 1, next))
    const track = trackRef.current
    if (track) track.scrollTo({ left: clamped * track.clientWidth, behavior: 'smooth' })
    setIndex(clamped)
  }, [count])

  if (!count) return null

  return (
    <div>
      <div className="group relative overflow-hidden rounded-2xl bg-[#F4F5F7]">
        <div
          ref={trackRef}
          onScroll={(event) => {
            const track = event.currentTarget
            const next = Math.round(track.scrollLeft / Math.max(1, track.clientWidth))
            if (next !== index) setIndex(next)
          }}
          className="flex aspect-[16/9] max-h-[460px] w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((item, itemIndex) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onOpen(item.full)}
              className="relative h-full w-full shrink-0 snap-center overflow-hidden"
              aria-label={item.alt}
            >
              <img
                src={item.src}
                alt={item.alt}
                loading={priority && itemIndex === 0 ? 'eager' : 'lazy'}
                fetchPriority={priority && itemIndex === 0 ? 'high' : 'auto'}
                decoding="async"
                className="h-full w-full object-cover"
              />
              {item.caption ? <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 pb-2 pt-6 text-left text-[12px] text-white">{item.caption}</span> : null}
            </button>
          ))}
        </div>
        {count > 1 ? (
          <>
            <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">{index + 1}/{count}</span>
            {index > 0 ? (
              <button type="button" onClick={() => goTo(index - 1)} aria-label="Предыдущее фото" className="absolute left-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#1F2937] shadow-md opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100">
                <ChevronLeft size={18} />
              </button>
            ) : null}
            {index < count - 1 ? (
              <button type="button" onClick={() => goTo(index + 1)} aria-label="Следующее фото" className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#1F2937] shadow-md opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100">
                <ChevronRight size={18} />
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      {count > 1 ? (
        <div className="flex justify-center gap-1 pt-2" aria-hidden="true">
          {items.map((item, dotIndex) => (
            <span key={item.key} className={`h-1.5 rounded-full transition-all ${dotIndex === index ? 'w-1.5 bg-[#2458D3]' : Math.abs(dotIndex - index) > 2 ? 'w-1 bg-[#C7CED9]' : 'w-1.5 bg-[#C7CED9]'}`} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

interface PublicationCardProps {
  priority?: boolean
  pub: Publication
  detailView?: boolean
  fullCard?: boolean
  currentProfile: CurrentProfile | null
  currentUserId: number | null
  pubRepo: HttpPublicationRepository
  onOpenMinistry?: (ministryId: number) => void
  onOpenPublication?: (pub: Publication) => void
  onShare: (pub: Publication, anchor?: HTMLElement) => Promise<void>
  onAcknowledge: (pub: Publication) => Promise<void>
  onUnacknowledge?: (pub: Publication) => Promise<void>
  onOpenReadAnalytics?: (pub: Publication) => void
  onOpenAlerts?: (pub: Publication) => void
  onEditPub: (pub: Publication) => void
  onDeletePub: (pubId: string) => Promise<void>
  onUnpublish?: () => void
  onArchive?: () => void
  statusActionBusy?: boolean
  onCommentCountChange: (pubId: string, diff: number) => void
  setPreviewImageUrl: (url: string | null) => void
  formatPubDate: (isoString: string) => string
  setError: (msg: string) => void
  setToast: (msg: string) => void
}

export const PublicationCard = React.memo(({
  priority = false,
  pub,
  detailView = false,
  fullCard = false,
  currentProfile,
  currentUserId,
  pubRepo,
  onOpenMinistry,
  onOpenPublication,
  onShare,
  onAcknowledge,
  onUnacknowledge,
  onOpenReadAnalytics,
  onOpenAlerts,
  onEditPub,
  onDeletePub,
  onUnpublish,
  onArchive,
  statusActionBusy = false,
  onCommentCountChange,
  setPreviewImageUrl,
  formatPubDate,
  setError,
  setToast
}: PublicationCardProps) => {
  const { t } = useTranslation('shell')
  const [comments, setComments] = useState<PublicationComment[] | null>(null)
  const [loadingComments, setLoadingComments] = useState(false)
  const [commentInput, setCommentInput] = useState('')
  const [replyTarget, setReplyTarget] = useState<{ commentId: string; authorName: string; authorId: number } | null>(null)
  const [commentError, setCommentError] = useState<string | null>(null)
  const [commentsAllowed, setCommentsAllowed] = useState(pub.allow_comments)
  const [moderationBusyId, setModerationBusyId] = useState<string | null>(null)
  const [commentReactionPickerId, setCommentReactionPickerId] = useState<string | null>(null)
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false)
  const [pendingReaction, setPendingReaction] = useState<string | null>(null)
  const [reactions, setReactions] = useState<PublicationReactionSummary[]>(() => pub.reactions || [])
  const [moderationDialog, setModerationDialog] = useState<
    | { kind: 'delete-comment'; comment: PublicationComment }
    | { kind: 'comment-reason'; comment: PublicationComment; action: 'hide' | 'restore' }
    | { kind: 'discussion-lock'; nextAllowed: boolean }
    | null
  >(null)
  const [moderationReason, setModerationReason] = useState('')
  const commentsOpenRef = useRef(false)
  const [isExpanded, setIsExpanded] = useState(fullCard)
  const [commentMenu, setCommentMenu] = useState<{ id: string; anchor: HTMLElement } | null>(null)
  const [commentPicker, setCommentPicker] = useState<{ id: string; anchor: HTMLElement } | null>(null)
  const [actionsAnchor, setActionsAnchor] = useState<HTMLElement | null>(null)
  const [commentSort, setCommentSort] = useState<'new' | 'old'>('new')
  const [viewsCount, setViewsCount] = useState(pub.views_count)
  const [showActionsMenu, setShowActionsMenu] = useState(false)

  useEffect(() => {
    setViewsCount(pub.views_count)
  }, [pub.views_count])


  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (sessionViewedPubs.has(pub.id) || hasStoredPublicationView(currentUserId, pub.id)) {
      return
    }

    let timer: ReturnType<typeof setTimeout> | null = null

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry.isIntersecting) {
          timer = setTimeout(async () => {
            if (sessionViewedPubs.has(pub.id) || hasStoredPublicationView(currentUserId, pub.id)) return
            try {
              await pubRepo.recordView(pub.id)
              sessionViewedPubs.add(pub.id)
              storePublicationView(currentUserId, pub.id)
              setViewsCount(prev => prev + 1)
            } catch (err) {
              console.error('Failed to record publication view:', err)
            }
          }, 1000)
        } else {
          if (timer) {
            clearTimeout(timer)
            timer = null
          }
        }
      },
      { threshold: 0.5 }
    )

    const element = cardRef.current
    if (element) {
      observer.observe(element)
    }

    return () => {
      if (element) {
        observer.unobserve(element)
      }
      if (timer) {
        clearTimeout(timer)
      }
    }
  }, [currentUserId, pub.id, pubRepo])


  const isOfficial = pub.source_type !== 'user'
  const isAuthor = String(pub.author_id) === String(currentProfile?.id) || String(pub.author_id) === String(currentUserId)
  const role = currentProfile?.role?.toLowerCase() || ''
  const canModerate = isAuthor || role === 'superadmin' || role === 'manager'
  const canComment = commentsAllowed || canModerate
  const canOpenMinistry = typeof pub.ministry_id === 'number' && Number.isFinite(pub.ministry_id) && !!onOpenMinistry
  const vacationDetails = useMemo(() => parseVacationPublicationDetails(pub), [pub])
  const { images, files, videos } = useMemo(() => {
    if (!pub.attachments || pub.attachments.length === 0) {
      return { images: [], files: [], videos: [] }
    }
    const imgs: PublicationAttachment[] = []
    const otherFiles: PublicationAttachment[] = []
    const videoFiles: PublicationAttachment[] = []
    pub.attachments.forEach(att => {
      const isImg = att.file_type === 'image' || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.file_name || '')
      if (isImg) imgs.push(att)
      else if (att.file_type === 'video' || att.video_provider || att.mime_type?.startsWith('video/')) videoFiles.push(att)
      else otherFiles.push(att)
    })
    return { images: imgs, files: otherFiles, videos: videoFiles }
  }, [pub.attachments])
  const feedMedia = useMemo<FeedMediaItem[]>(() => {
    if (vacationDetails) return []
    const items: FeedMediaItem[] = []
    if (pub.cover_image_url) items.push({ key: 'cover', src: pub.cover_image_url, full: pub.cover_image_url, alt: pub.title })
    images.forEach((img) => items.push({
      key: img.id,
      src: normalizeBackendAssetUrl(img.thumbnail_url) || img.file_url,
      full: img.file_url,
      alt: img.caption || img.file_name,
      caption: img.caption || undefined,
    }))
    return items
  }, [images, pub.cover_image_url, pub.title, vacationDetails])
  const likeReaction = reactions.find((reaction) => reaction.reaction === '❤️') || { reaction: '❤️', count: 0, reacted: false }

  useEffect(() => {
    setCommentsAllowed(pub.allow_comments)
  }, [pub.allow_comments])

  const refreshComments = useCallback(async () => {
    const next = await pubRepo.getComments(pub.id)
    setComments(next)
    return next
  }, [pub.id, pubRepo])

  const refreshReactions = useCallback(async () => {
    const next = await pubRepo.getPublicationReactions(pub.id)
    setReactions(next)
    return next
  }, [pub.id, pubRepo])

  useEffect(() => {
    commentsOpenRef.current = comments !== null
  }, [comments])

  useEffect(() => {
    let active = true
    const refresh = async () => {
      try {
        const nextReactions = await pubRepo.getPublicationReactions(pub.id)
        if (active) setReactions(nextReactions)
        if (active && commentsOpenRef.current) {
          const latestComments = await pubRepo.getComments(pub.id)
          if (active) setComments(latestComments)
        }
      } catch (err) {
        console.error('Failed to refresh publication discussion', err)
      }
    }
    const onFocus = () => {
      void refresh()
      void pubRepo.getPublicationById(pub.id)
        .then((latest) => { if (active) setCommentsAllowed(latest.allow_comments) })
        .catch((err) => console.error('Failed to refresh publication settings', err))
    }
    if (!Array.isArray(pub.reactions)) void refreshReactions().catch((err) => console.error('Failed to load publication reactions', err))
    window.addEventListener('focus', onFocus)
    return () => {
      active = false
      window.removeEventListener('focus', onFocus)
    }
  }, [pub.id, pub.reactions, pubRepo, refreshReactions])

  const toggleComments = async () => {
    if (loadingComments) return
    const isOpen = comments !== null

    if (isOpen) {
      setComments(null)
    } else {
      setLoadingComments(true)
      setCommentError(null)
      try {
        await refreshComments()
      } catch (err) {
        setCommentError(err instanceof Error ? err.message : 'Не удалось загрузить комментарии')
      } finally {
        setLoadingComments(false)
      }
    }
  }

  useEffect(() => {
    if (!detailView && !fullCard) return
    let active = true
    setComments([])
    setLoadingComments(true)
    setCommentError(null)
    refreshComments()
      .catch((err) => { if (active) setCommentError(err instanceof Error ? err.message : 'Не удалось загрузить комментарии') })
      .finally(() => { if (active) setLoadingComments(false) })
    return () => { active = false }
  }, [detailView, fullCard, pub.id, refreshComments])

  const handleAddComment = async () => {
    const content = commentInput.trim()
    if (!content) return
    if (content.length > 5000) {
      setCommentError('Комментарий не должен превышать 5000 символов.')
      return
    }
    if (!canComment) {
      setCommentError('Обсуждение закрыто.')
      return
    }

    try {
      await pubRepo.addComment(pub.id, {
        content,
        ...(replyTarget ? { parent_id: replyTarget.commentId, reply_to_user_id: replyTarget.authorId } : {}),
      })
      await refreshComments()
      setCommentInput('')
      setReplyTarget(null)
      setCommentError(null)
      onCommentCountChange(pub.id, 1)
    } catch (err) {
      console.error(err)
      setCommentError(err instanceof Error ? err.message : 'Не удалось отправить комментарий')
    }
  }

  const togglePublicationReaction = async (item: PublicationReactionSummary) => {
    if (pendingReaction) return
    setPendingReaction(item.reaction)
    try {
      const selectedReaction = reactions.find((reaction) => reaction.reacted)
      let next: PublicationReactionSummary[]

      if (item.reacted) {
        next = await pubRepo.removePublicationReaction(pub.id, item.reaction)
      } else {
        if (selectedReaction) {
          await pubRepo.removePublicationReaction(pub.id, selectedReaction.reaction)
        }
        try {
          next = await pubRepo.addPublicationReaction(pub.id, item.reaction)
        } catch (error) {
          if (selectedReaction) {
            try {
              setReactions(await pubRepo.addPublicationReaction(pub.id, selectedReaction.reaction))
            } catch {
              // The refresh below will reconcile state if restoring the previous reaction fails.
            }
          }
          throw error
        }
      }
      setReactions(next)
      setReactionPickerOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить реакцию')
      void refreshReactions().catch(() => undefined)
    } finally {
      setPendingReaction(null)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    try {
      const previousCount = countCommentTree(comments || [])
      await pubRepo.deleteComment(pub.id, commentId)
      const nextComments = await refreshComments()
      onCommentCountChange(pub.id, countCommentTree(nextComments) - previousCount)
      setToast('Комментарий удален')
    } catch (err) {
      console.error(err)
      setCommentError(err instanceof Error ? err.message : 'Не удалось удалить комментарий')
    }
  }

  const toggleCommentReaction = async (comment: PublicationComment, item: PublicationReactionSummary) => {
    if (moderationBusyId) return
    setModerationBusyId(`reaction:${comment.id}:${item.reaction}`)
    try {
      const selectedReaction = comment.reactions?.find((reaction) => reaction.reacted)
      let next: PublicationReactionSummary[]

      if (item.reacted) {
        next = await pubRepo.removeCommentReaction(pub.id, comment.id, item.reaction)
      } else {
        if (selectedReaction) {
          await pubRepo.removeCommentReaction(pub.id, comment.id, selectedReaction.reaction)
        }
        try {
          next = await pubRepo.addCommentReaction(pub.id, comment.id, item.reaction)
        } catch (error) {
          if (selectedReaction) {
            try {
              const restored = await pubRepo.addCommentReaction(pub.id, comment.id, selectedReaction.reaction)
              setComments((prev) => prev ? updateCommentTree(prev, comment.id, (current) => ({ ...current, reactions: restored })) : prev)
            } catch {
              // Leave reconciliation to the next comments refresh if rollback fails.
            }
          }
          throw error
        }
      }
      setComments((prev) => prev ? updateCommentTree(prev, comment.id, (current) => ({ ...current, reactions: next })) : prev)
      setCommentReactionPickerId(null)
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Не удалось изменить реакцию на комментарий')
    } finally {
      setModerationBusyId(null)
    }
  }

  const pinComment = async (comment: PublicationComment) => {
    setModerationBusyId(comment.id)
    try {
      await pubRepo.pinComment(pub.id, comment.id, !comment.is_pinned)
      await refreshComments()
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Не удалось изменить закрепление комментария')
    } finally {
      setModerationBusyId(null)
    }
  }

  const moderateComment = async (comment: PublicationComment, action: 'hide' | 'restore' | 'delete') => {
    setModerationReason('')
    setModerationDialog(action === 'delete'
      ? { kind: 'delete-comment', comment }
      : { kind: 'comment-reason', comment, action })
  }

  const toggleCommentsLock = async () => {
    setModerationReason('')
    setModerationDialog({ kind: 'discussion-lock', nextAllowed: !commentsAllowed })
  }

  const submitModerationDialog = async () => {
    if (!moderationDialog || moderationBusyId) return
    const reason = moderationReason.trim()
    if (reason.length > 1000) {
      setCommentError('Причина не должна превышать 1000 символов.')
      return
    }
    setCommentError(null)
    if (moderationDialog.kind === 'discussion-lock') {
      setModerationBusyId('discussion-lock')
      try {
        await pubRepo.lockPublicationComments(pub.id, moderationDialog.nextAllowed, reason)
        setCommentsAllowed(moderationDialog.nextAllowed)
        setToast(moderationDialog.nextAllowed ? 'Обсуждение открыто' : 'Обсуждение закрыто')
        setModerationDialog(null)
      } catch (err) {
        setCommentError(err instanceof Error ? err.message : 'Не удалось изменить настройки обсуждения')
      } finally {
        setModerationBusyId(null)
      }
      return
    }

    const { comment } = moderationDialog
    const action = moderationDialog.kind === 'delete-comment' ? 'delete' : moderationDialog.action
    setModerationBusyId(comment.id)
    try {
      const previousCount = countCommentTree(comments || [])
      await pubRepo.moderateComment(pub.id, comment.id, action, action === 'delete' ? undefined : reason)
      const nextComments = await refreshComments()
      if (action === 'delete') onCommentCountChange(pub.id, countCommentTree(nextComments) - previousCount)
      setModerationDialog(null)
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Не удалось выполнить модерацию комментария')
    } finally {
      setModerationBusyId(null)
    }
  }

  const renderFeedComment = (comment: PublicationComment, depth = 0): React.ReactNode => {
    const ownComment = String(comment.author_id) === String(currentProfile?.id ?? currentUserId)
    const hidden = Boolean(comment.is_hidden || comment.status === 'hidden')
    const removed = comment.status === 'deleted_by_moderator'
    const commentReactions = comment.reactions || []
    const like = commentReactions.find((item) => item.reaction === '👍') || { reaction: '👍', count: 0, reacted: false }
    const extraReactions = commentReactions.filter((item) => item.reaction !== '👍' && item.count > 0)
    const canReply = !hidden && !removed && depth < 64
    const busy = moderationBusyId === comment.id
    const menuOpen = commentMenu?.id === comment.id
    const pickerOpen = commentPicker?.id === comment.id
    return <div key={comment.id} className={depth > 0 ? 'ml-[52px] mt-3' : ''}>
      <div className={`group relative flex gap-3 rounded-xl ${comment.is_pinned ? 'bg-[#F5F7FF] p-2 -mx-2' : ''}`}>
        <GradientAvatar
          initials={comment.author_name ? comment.author_name.slice(0, 2).toUpperCase() : '?'}
          src={comment.author_avatar}
          size={depth > 0 ? 32 : 40}
          seed={comment.author_name ? comment.author_name.charCodeAt(0) + comment.author_name.charCodeAt(comment.author_name.length - 1) : 0}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pr-8">
            <span className="text-[14px] font-bold text-[#0A1628]">{comment.author_name}</span>
            <span className="text-[12px] text-[#94A3B8]">{relativeCommentTime(comment.created_at, formatPubDate)}</span>
            {comment.is_pinned && <span className="rounded-md bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">Закреплён</span>}
            {hidden && <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">Скрыт модератором</span>}
            {removed && <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">Удалён модератором</span>}
          </div>
          {comment.reply_to_user && <div className="mt-0.5 text-[12px] text-[#64748B]">Ответ для @{comment.reply_to_user.full_name}</div>}
          {!removed && <p className="mt-1 max-w-full whitespace-pre-line break-words text-[14px] leading-[1.55] text-[#1F2937] [overflow-wrap:anywhere]">{renderCommentContent(comment.content)}</p>}
          {comment.moderation_reason && canModerate && <p className="mt-1 text-[11px] text-amber-700">Причина: {comment.moderation_reason}</p>}
          <div className="relative mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] font-medium text-[#2458D3]">
            {canReply && <button type="button" onClick={() => setReplyTarget({ commentId: comment.id, authorName: comment.author_name, authorId: comment.author_id })} className="hover:underline">Ответить</button>}
            {canReply && <span className="text-[#C3CCDA]">·</span>}
            {!removed && <button type="button" disabled={moderationBusyId === `reaction:${comment.id}:👍`} onClick={() => void toggleCommentReaction(comment, like)} className={`hover:underline disabled:opacity-50 ${like.reacted ? 'font-bold' : ''}`}>{like.reacted ? 'Вам нравится' : 'Нравится'}</button>}
            {like.count > 0 && <span className="ml-2 inline-flex items-center gap-1 text-[#2458D3]"><ThumbsUp size={14} className={like.reacted ? 'fill-[#2458D3]/20' : ''} />{like.count}</span>}
            {extraReactions.map((item) => <button key={item.reaction} type="button" disabled={moderationBusyId === `reaction:${comment.id}:${item.reaction}`} onClick={() => void toggleCommentReaction(comment, item)} className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] ${item.reacted ? 'border-[#B8C7FF] bg-[#EEF2FF] text-[#2458D3]' : 'border-[#ECEEF3] bg-white text-[#64748B]'}`}><span>{item.reaction}</span><span>{item.count}</span></button>)}
            {!removed && <button type="button" onClick={(event) => { const anchor = event.currentTarget; setCommentPicker(pickerOpen ? null : { id: comment.id, anchor }) }} className={`text-[#94A3B8] transition hover:text-[#2458D3] focus-visible:opacity-100 ${pickerOpen ? 'opacity-100 text-[#2458D3]' : 'opacity-0 group-hover:opacity-100'}`} aria-label="Другая реакция" aria-haspopup="menu" aria-expanded={pickerOpen}><SmilePlus size={14} /></button>}
            <FloatingMenu anchor={pickerOpen ? commentPicker?.anchor ?? null : null} open={pickerOpen} onClose={() => setCommentPicker(null)} align="start" className="!min-w-0 p-1.5">
              <div className="grid grid-cols-7 gap-1">
                {COMMENT_REACTIONS.map((emoji) => {
                  const item = commentReactions.find((entry) => entry.reaction === emoji) || { reaction: emoji, count: 0, reacted: false }
                  return <button key={emoji} type="button" role="menuitem" disabled={Boolean(moderationBusyId)} onClick={() => { setCommentPicker(null); void toggleCommentReaction(comment, item) }} className={`flex h-8 w-8 items-center justify-center rounded-lg text-[17px] hover:bg-[#EEF2FF] disabled:opacity-40 ${item.reacted ? 'bg-[#EEF2FF]' : ''}`} aria-label={`Реакция ${emoji}`}>{emoji}</button>
                })}
              </div>
            </FloatingMenu>
          </div>
        </div>
        {(ownComment || canModerate) && !removed && <div className="absolute right-0 top-0">
          <button type="button" onClick={(event) => { event.stopPropagation(); const anchor = event.currentTarget; setCommentMenu(menuOpen ? null : { id: comment.id, anchor }) }} className={`flex h-7 w-7 items-center justify-center rounded-full text-[#64748B] hover:bg-[#F1F4F9] ${menuOpen ? 'bg-[#F1F4F9]' : ''}`} aria-label="Действия с комментарием" aria-haspopup="menu" aria-expanded={menuOpen}>
            <MaterialSymbol name="more_vert" size={17} />
          </button>
          <FloatingMenu anchor={menuOpen ? commentMenu?.anchor ?? null : null} open={menuOpen} onClose={() => setCommentMenu(null)}>
            {canModerate && <>
              <button type="button" role="menuitem" disabled={busy} onClick={() => { setCommentMenu(null); void pinComment(comment) }} className={floatingMenuItemClass}><MaterialSymbol name={comment.is_pinned ? 'keep_off' : 'push_pin'} size={16} />{comment.is_pinned ? 'Открепить' : 'Закрепить'}</button>
              <button type="button" role="menuitem" disabled={busy} onClick={() => { setCommentMenu(null); void moderateComment(comment, hidden ? 'restore' : 'hide') }} className={floatingMenuItemClass}><MaterialSymbol name={hidden ? 'visibility' : 'visibility_off'} size={16} />{hidden ? 'Восстановить' : 'Скрыть'}</button>
              {!ownComment && <button type="button" role="menuitem" disabled={busy} onClick={() => { setCommentMenu(null); void moderateComment(comment, 'delete') }} className={floatingMenuDangerClass}><MaterialSymbol name="delete_forever" size={16} />Удалить навсегда</button>}
            </>}
            {ownComment && <button type="button" role="menuitem" disabled={busy} onClick={() => { setCommentMenu(null); void handleDeleteComment(comment.id) }} className={floatingMenuDangerClass}><MaterialSymbol name="delete" size={16} />Удалить</button>}
          </FloatingMenu>
        </div>}
      </div>
      {comment.replies?.map((reply) => renderFeedComment(reply, depth + 1))}
    </div>
  }

  const renderComment = (comment: PublicationComment, depth = 0): React.ReactNode => {
    if (!detailView) return renderFeedComment(comment, depth)
    const ownComment = String(comment.author_id) === String(currentProfile?.id ?? currentUserId)
    const hidden = Boolean(comment.is_hidden || comment.status === 'hidden')
    const removed = comment.status === 'deleted_by_moderator'
    const commentReactions = comment.reactions || []
    const canReply = !hidden && !removed && depth < 64
    return <div key={comment.id} className={`${depth > 0 ? (detailView ? 'ml-5 mt-4 border-l border-[#ECEEF3] pl-4' : 'ml-5 border-l-2 border-[#E8ECF3] pl-3') : ''} ${detailView && depth === 0 ? 'border-b border-[#F1F4F9] py-4 last:border-b-0' : ''}`}>
      <div className={`relative flex gap-3 transition-colors ${detailView ? 'p-0' : `gap-2.5 rounded-2xl border p-3 ${comment.is_pinned ? 'border-[#C7D2FE] bg-[#F5F6FF]' : 'border-[#F1F5F9] bg-[#F8FAFC] hover:bg-[#F3F6F9]'}`}`}>
        <GradientAvatar
          initials={comment.author_name ? comment.author_name.slice(0, 2).toUpperCase() : '?'}
          src={comment.author_avatar}
          size={detailView ? 32 : 28}
          seed={comment.author_name ? comment.author_name.charCodeAt(0) + comment.author_name.charCodeAt(comment.author_name.length - 1) : 0}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className={`${detailView ? 'text-[13px] text-[#0A1628]' : 'text-[12px] text-[#202124]'} font-semibold`}>{comment.author_name}</span>
                {comment.author_position && <span className="text-[10px] text-[#8497B4] truncate max-w-[200px]">{comment.author_position}</span>}
                {comment.is_pinned && <span className="rounded-md bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700">Закреплён</span>}
                {hidden && <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">Скрыт модератором</span>}
                {removed && <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">Удалён модератором</span>}
              </div>
              {comment.reply_to_user && <div className="mt-0.5 text-[10px] text-[#64748B]">Ответ для @{comment.reply_to_user.full_name}</div>}
            </div>
            {(ownComment || canModerate) && !removed && <div className="flex shrink-0 items-center gap-1">
              {canModerate && <>
                <button type="button" disabled={moderationBusyId === comment.id} onClick={() => void pinComment(comment)} className="rounded-md p-1 text-[#8497B4] hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-40" title={comment.is_pinned ? 'Открепить' : 'Закрепить'}><MaterialSymbol name={comment.is_pinned ? 'keep_off' : 'push_pin'} size={13} /></button>
                <button type="button" disabled={moderationBusyId === comment.id} onClick={() => void moderateComment(comment, hidden ? 'restore' : 'hide')} className="rounded-md p-1 text-[#8497B4] hover:bg-amber-50 hover:text-amber-700 disabled:opacity-40" title={hidden ? 'Восстановить' : 'Скрыть'}><MaterialSymbol name={hidden ? 'visibility' : 'visibility_off'} size={13} /></button>
                {!ownComment && <button type="button" disabled={moderationBusyId === comment.id} onClick={() => void moderateComment(comment, 'delete')} className="rounded-md p-1 text-[#8497B4] hover:bg-red-50 hover:text-red-600 disabled:opacity-40" title="Удалить навсегда"><MaterialSymbol name="delete_forever" size={14} /></button>}
              </>}
              {ownComment && <button type="button" disabled={moderationBusyId === comment.id} onClick={() => void handleDeleteComment(comment.id)} className="rounded-md p-1 text-[#8497B4] hover:bg-red-50 hover:text-red-600 disabled:opacity-40" title="Удалить комментарий"><MaterialSymbol name="delete" size={13} /></button>}
            </div>}
          </div>
          {!removed && <p className={`${detailView ? 'text-[14px] mt-1 text-[#374151]' : 'text-[12.5px] mt-1 text-[#4B5563]'} whitespace-pre-line leading-relaxed break-words [overflow-wrap:anywhere] [word-break:break-word] max-w-full`}>{renderCommentContent(comment.content)}</p>}
          {comment.moderation_reason && canModerate && <p className="mt-1 text-[10px] text-amber-700">Причина: {comment.moderation_reason}</p>}
          <div className={`flex flex-wrap items-center gap-3 ${detailView ? 'mt-2 text-[12px] text-[#8497B4]' : 'mt-1.5 text-[10px] text-[#777]'}`}>
            <span>{formatPubDate(comment.created_at)}</span>
            {comment.replies_count ? <span>{comment.replies_count} {detailView ? 'ответов' : 'ответов'}</span> : null}
            {canReply && <button type="button" onClick={() => setReplyTarget({ commentId: comment.id, authorName: comment.author_name, authorId: comment.author_id })} className={detailView ? 'font-semibold text-[#64748B] hover:text-[#2458D3]' : 'font-bold text-[#2458D3] hover:underline'}>Ответить</button>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {commentReactions.filter((item) => item.count > 0).map((item) => <button key={item.reaction} type="button" disabled={moderationBusyId === `reaction:${comment.id}:${item.reaction}`} onClick={() => void toggleCommentReaction(comment, item)} className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] ${item.reacted ? 'border-[#B8C7FF] bg-[#EEF2FF] text-[#2458D3]' : 'border-[#ECEEF3] bg-white text-[#64748B]'}`}><span>{item.reaction}</span><span>{item.count}</span></button>)}
            <button type="button" onClick={() => setCommentReactionPickerId((id) => id === comment.id ? null : comment.id)} className="rounded-full border border-[#ECEEF3] bg-white px-2 py-1 text-[10px] hover:bg-[#EEF2FF]">😊 +</button>
            {commentReactionPickerId === comment.id && <span className="flex flex-wrap gap-1 rounded-xl border border-[#E5EAF2] bg-white p-1 shadow-sm">{COMMENT_REACTIONS.map((emoji) => {
              const item = commentReactions.find((entry) => entry.reaction === emoji) || { reaction: emoji, count: 0, reacted: false }
              return <button key={emoji} type="button" disabled={Boolean(moderationBusyId)} onClick={() => void toggleCommentReaction(comment, item)} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-[#EEF2FF] disabled:opacity-40" aria-label={`Реакция ${emoji}`}>{emoji}</button>
            })}</span>}
          </div>
        </div>
      </div>
      {comment.replies?.map((reply) => renderComment(reply, depth + 1))}
    </div>
  }

  const detailTextBlocks = (pub.content_doc?.blocks || []).filter((block) => ['paragraph', 'heading', 'quote', 'checklist', 'table'].includes(block.type))
  const detailBlockText = (block: unknown) => {
    const runs = (block as { runs?: Array<{ text?: string }> }).runs
    return Array.isArray(runs) ? runs.map((run) => String(run?.text || '')).join('').trim() : ''
  }
  const detailLeadIndex = detailTextBlocks.findIndex((block) => ['paragraph', 'heading', 'quote'].includes(block.type) && detailBlockText(block).length > 0)
  const detailPlainParts = (pub.content || '').split(/\n+/).map((part) => part.trim()).filter(Boolean)
  const detailUsesDoc = detailTextBlocks.length > 0
  const detailLead = detailUsesDoc ? (detailLeadIndex >= 0 ? detailBlockText(detailTextBlocks[detailLeadIndex]) : '') : detailPlainParts[0] || ''
  const detailBodyBlocks = detailUsesDoc ? detailTextBlocks.filter((_, blockIndex) => blockIndex !== detailLeadIndex) : []
  const detailBodyText = detailUsesDoc ? '' : (pub.content || '').trim().split(/\n+/).slice(1).join('\n\n').trim()
  const detailHasBody = detailUsesDoc ? detailBodyBlocks.length > 0 : detailBodyText.length > 0

  return (
    <>
  <div ref={cardRef} className={`relative min-w-0 overflow-hidden publication-card content-visibility-auto contain-intrinsic-size-[300px] ${detailView ? 'mx-auto flex w-full max-w-[1280px] flex-col gap-0 border-0 p-0' : 'mx-auto w-full max-w-[860px] space-y-3.5 rounded-[20px] border border-[#E6EAF1] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)] sm:p-5'}`}>
      {/* Post Header */}
      <div className={`flex items-center justify-between gap-3 ${detailView ? 'order-1 mx-auto mb-6 w-full max-w-[860px]' : ''}`}>
        <div className={`flex min-w-0 items-center ${detailView ? 'gap-3' : 'gap-3.5'}`}>
          {isOfficial ? (
            <img
              src={kazakhstanCoatOfArms}
              alt="Герб Республики Казахстан"
              referrerPolicy="no-referrer"
              className={`${detailView ? 'h-10 w-10' : 'h-11 w-11'} shrink-0 rounded-full border border-[#ECEEF3] bg-white object-cover p-0.5`}
            />
          ) : (
            <GradientAvatar
              initials={pub.source_name ? pub.source_name.slice(0, 2).toUpperCase() : 'РК'}
              src={pub.source_avatar}
              size={detailView ? 36 : 42}
              seed={pub.source_name ? pub.source_name.charCodeAt(0) : 0}
            />
          )}
          <div className="min-w-0">
            <div className={`font-bold leading-tight text-[#0A1628] ${detailView ? 'text-[13px]' : 'text-[14px] leading-snug'}`}>
              {canOpenMinistry ? (
                <button
                  type="button"
                  onClick={() => onOpenMinistry?.(pub.ministry_id as number)}
                  className="inline-flex items-center gap-1.5 text-left text-[#0A1628] transition hover:text-[#2458D3]"
                >
                  <span>{pub.source_name}</span>
                  {isOfficial && detailView ? <MaterialSymbol name="verified" size={15} color="currentColor" /> : null}
                </button>
              ) : (
                <>
                  {pub.source_name}
                  {isOfficial && detailView && (
                    <span className="inline-flex items-center ml-1.5 align-middle text-[#2458D3]">
                      <MaterialSymbol name="verified" size={15} color="currentColor" />
                    </span>
                  )}
                </>
              )}
            </div>
            <div className={`mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 font-medium text-[#8497B4] ${detailView ? 'text-[11px]' : 'text-[12px]'}`}>
              <span>{formatPubDate(pub.published_at)}  •  {TYPE_LABELS[pub.type] || pub.type}</span>
              {!detailView && pub.is_pinned && (!pub.pinned_until || new Date(pub.pinned_until).getTime() > Date.now()) ? <span className="inline-flex items-center gap-1 rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[10px] font-semibold text-[#2458D3]"><MaterialSymbol name="push_pin" size={11} color="currentColor" />Закреплено</span> : null}
              {!detailView && pub.importance !== 'normal' ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${pub.importance === 'urgent' ? 'bg-[#FFF1F3] text-[#E11D48]' : 'bg-[#FFF7E6] text-[#B45309]'}`}>{pub.importance === 'urgent' ? 'Срочно' : 'Важное'}</span> : null}
            </div>
          </div>
        </div>
        
        <div className="flex shrink-0 items-center gap-1">
        {!detailView && isOfficial ? <span className="flex h-8 w-8 items-center justify-center text-[#0A1628]" title="Официальный источник"><BadgeCheck size={18} strokeWidth={1.8} /></span> : null}
        {(canModerate || onUnpublish || onArchive) && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setActionsAnchor(e.currentTarget)
                setShowActionsMenu((prev) => !prev)
              }}
              aria-label="Опции"
              aria-haspopup="menu"
              aria-expanded={showActionsMenu}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-[#F1F4F9] hover:text-[#0A1628] ${showActionsMenu ? 'bg-[#F1F4F9] text-[#0A1628]' : ''}`}
            >
              <MaterialSymbol name="more_vert" size={19} />
            </button>
            <FloatingMenu anchor={actionsAnchor} open={showActionsMenu} onClose={() => setShowActionsMenu(false)}>
              {onOpenReadAnalytics && <button type="button" role="menuitem" onClick={() => { setShowActionsMenu(false); onOpenReadAnalytics(pub) }} className={floatingMenuItemClass}>
                <MaterialSymbol name="analytics" size={16} />
                <span>Аналитика прочтений</span>
              </button>}
              {onOpenAlerts && <button type="button" role="menuitem" onClick={() => { setShowActionsMenu(false); onOpenAlerts(pub) }} className={floatingMenuItemClass}>
                <MaterialSymbol name="campaign" size={16} />
                <span>Важное оповещение</span>
              </button>}
              {onUnpublish && <button type="button" role="menuitem" disabled={statusActionBusy} onClick={() => { setShowActionsMenu(false); onUnpublish() }} className={`${floatingMenuItemClass} disabled:opacity-50`}>
                <MaterialSymbol name="visibility_off" size={16} /><span>{t('publicationActions.unpublish')}</span>
              </button>}
              {onArchive && <button type="button" role="menuitem" disabled={statusActionBusy} onClick={() => { setShowActionsMenu(false); onArchive() }} className={`${floatingMenuItemClass} disabled:opacity-50`}>
                <MaterialSymbol name="archive" size={16} /><span>{t('publicationActions.archive')}</span>
              </button>}
              {isAuthor && <>
                <button type="button" role="menuitem" onClick={() => { setShowActionsMenu(false); onEditPub(pub) }} className={floatingMenuItemClass}>
                  <MaterialSymbol name="edit" size={16} />
                  <span>Редактировать</span>
                </button>
                <button type="button" role="menuitem" onClick={() => { setShowActionsMenu(false); void onDeletePub(pub.id) }} className={floatingMenuDangerClass}>
                  <MaterialSymbol name="delete" size={16} />
                  <span>Удалить</span>
                </button>
              </>}
            </FloatingMenu>
          </>
        )}
        </div>
      </div>

      {detailView && pub.cover_image_url && !vacationDetails ? <button type="button" onClick={() => setPreviewImageUrl(pub.cover_image_url!)} className={`block w-full overflow-hidden border border-[#ECEEF3] bg-slate-50 text-left ${detailView ? 'order-3 mx-auto mb-8 w-full max-w-[860px] rounded-xl' : 'rounded-2xl'}`}>
        <img src={pub.cover_image_url} alt={`Обложка: ${pub.title}`} className={detailView ? 'max-h-[680px] w-full object-cover' : 'max-h-[420px] w-full object-cover'} loading={priority || detailView ? 'eager' : 'lazy'} fetchPriority={priority || detailView ? 'high' : 'auto'} decoding="async" />
      </button> : null}

      {/* Title & Content */}
      {vacationDetails ? (
        <div className="rounded-[28px] border border-[#D9E4FF] bg-[linear-gradient(180deg,#F8FBFF_0%,#FFFFFF_100%)] p-5 shadow-[0_10px_30px_rgba(47,75,226,0.08)] space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex items-start gap-3">
              <div className="mt-0.5 w-10 h-10 rounded-2xl bg-[#EEF2FF] text-[#2458D3] flex items-center justify-center shrink-0">
                <MaterialSymbol name="notifications" size={20} color="currentColor" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[13px] font-bold text-[#0A1628]">
                  <span>Системное уведомление</span>
                  <MaterialSymbol name="verified" size={16} color="#2458D3" />
                </div>
                <div className="text-[11.5px] text-[#8497B4] mt-0.5">
                  {formatPubDate(pub.published_at)} - Отпуск
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-[24px] font-bold text-[#0A1628] leading-[1.2]">{pub.title}</h3>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-[#E7ECF5] bg-white px-4 py-3">
                <div className="flex items-center gap-2 text-[#2458D3] mb-1.5">
                  <MaterialSymbol name="calendar_month" size={18} color="currentColor" />
                  <span className="text-[12px] font-semibold">Период отпуска</span>
                </div>
                <div className="text-[14px] font-bold text-[#0A1628]">{vacationDetails.periodLabel}</div>
              </div>

              <div className="rounded-2xl border border-[#E7ECF5] bg-white px-4 py-3">
                <div className="flex items-center gap-2 text-[#2458D3] mb-1.5">
                  <MaterialSymbol name="schedule" size={18} color="currentColor" />
                  <span className="text-[12px] font-semibold">Длительность</span>
                </div>
                <div className="text-[14px] font-bold text-[#0A1628]">{vacationDetails.durationLabel}</div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className={`min-w-0 max-w-full ${detailView ? 'order-2 mx-auto mb-7 w-full max-w-[860px] space-y-4' : 'space-y-2'}`}>
          {detailView && <div className="flex flex-wrap gap-2 pb-1">
            {/* <span className="rounded-full border border-[#ECEEF3] px-3 py-1 text-[12px] font-medium text-[#64748B]">{TYPE_LABELS[pub.type] || pub.type}</span> */}
            {pub.importance !== 'normal' && <span className="rounded-full border border-[#ECEEF3] px-3 py-1 text-[12px] font-medium text-[#64748B]">{pub.importance === 'urgent' ? 'Срочно' : 'Важное'}</span>}
          </div>}
          <h3 className={`${detailView ? 'text-[30px] sm:text-[40px] font-extrabold leading-[1.1] tracking-[-0.04em]' : 'text-[17px] sm:text-[18px] font-bold leading-snug tracking-[-0.01em]'} text-[#0A1628] break-words [overflow-wrap:anywhere] [word-break:break-word]`}>
            {!detailView && onOpenPublication ? (
              <button type="button" onClick={() => onOpenPublication(pub)} className="text-left transition hover:text-[#2458D3]">{pub.title}</button>
            ) : pub.title}</h3>
          {detailView && detailLead && <p className="text-[15px] sm:text-[17px] font-normal leading-relaxed text-[#6B7280] break-words [overflow-wrap:anywhere]">{detailLead}</p>}
          {!detailView && (pub.content || pub.content_doc?.blocks?.length) && (() => {
            const richText = publicationDocText(pub.content_doc)
            const displayContent = richText || pub.content || ''
            const isLong = displayContent.length > 280
            const displayText = isLong && !isExpanded ? displayContent.slice(0, 280) + '...' : displayContent
            const textBlocks = (pub.content_doc?.blocks || []).filter((block) => ['paragraph', 'heading', 'quote', 'checklist', 'table'].includes(block.type))
            const hasFormattedBlocks = textBlocks.some((block) => ['heading', 'quote'].includes(block.type) || (Array.isArray((block as any).runs) && (block as any).runs.some((run: any) => Array.isArray(run?.marks) && run.marks.length)))

            return (
              <div className="space-y-1.5 min-w-0 max-w-full">
                {richText && hasFormattedBlocks ? (
                  <div className="space-y-1.5 text-[13px] sm:text-[14px] font-normal text-[#64748B] leading-[1.6] break-words [overflow-wrap:anywhere] [word-break:break-word] max-w-full">
                    {renderPublicationContentDoc(isLong && !isExpanded ? limitedPublicationBlocks(textBlocks, 280) : textBlocks)}
                  </div>
                ) : (
                  <p className="text-[13px] sm:text-[14px] font-normal text-[#64748B] leading-[1.6] whitespace-pre-line break-words [overflow-wrap:anywhere] [word-break:break-word] max-w-full">
                    {renderTextWithLinks(displayText)}
                  </p>
                )}
                {isLong && !fullCard && (
                  <button
                    onClick={() => setIsExpanded(prev => !prev)}
                    className="mt-1 flex items-center gap-1 text-[13px] font-semibold text-[#2458D3] transition-all hover:text-[#253CB1] focus:outline-none"
                  >
                    <span>{isExpanded ? 'Свернуть' : 'Читать далее'}</span>
                    <MaterialSymbol name={isExpanded ? 'keyboard_arrow_up' : 'keyboard_arrow_down'} size={16} />
                  </button>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {detailView && detailHasBody && <div className="order-4 mx-auto mb-8 w-full max-w-[860px] whitespace-pre-line break-words text-[16px] leading-[1.85] text-[#343A40] [overflow-wrap:anywhere]">
        {detailUsesDoc ? renderPublicationContentDoc(detailBodyBlocks) : renderTextWithLinks(detailBodyText)}
      </div>}

      {!detailView && feedMedia.length > 0 ? (
        <FeedMediaCarousel items={feedMedia} priority={priority} onOpen={setPreviewImageUrl} />
      ) : null}

      {/* Attachments */}
      {((detailView && images.length > 0) || files.length > 0 || videos.length > 0) && (
        <div className={`space-y-2.5 pt-1 ${detailView ? 'order-5 mx-auto mb-8 w-full max-w-[860px]' : ''}`}>
          {/* Image Gallery */}
          {detailView && images.length > 0 && (
            <div className={`grid gap-2 ${
              images.length === 1 ? 'grid-cols-1' :
              images.length === 2 ? 'grid-cols-2' :
              'grid-cols-3'
            }`}>
              {images.map(img => (
                <div
                  key={img.id}
                  onClick={() => setPreviewImageUrl(img.file_url)}
                  className="relative group cursor-pointer overflow-hidden rounded-2xl border border-[#ECEEF3] aspect-video bg-gray-50 flex items-center justify-center"
                >
                  <img
                    src={detailView ? img.file_url : normalizeBackendAssetUrl(img.thumbnail_url) || img.file_url}
                    alt={img.caption || img.file_name}
                    loading={priority && !pub.cover_image_url ? 'eager' : 'lazy'}
                    fetchPriority={priority && !pub.cover_image_url ? 'high' : 'auto'}
                    decoding="async"
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-250 ease-out"
                  />
                  {/* Hover zoom icon overlay */}
                  <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                    <div className="bg-black/50 backdrop-blur-sm text-white rounded-full p-2.5 shadow-lg transform scale-90 group-hover:scale-100 transition-transform duration-200">
                      <MaterialSymbol name="zoom_in" size={20} color="#fff" />
                    </div>
                  </div>
                  {img.caption ? <span className="absolute bottom-0 left-0 right-0 bg-black/55 px-2 py-1 text-[11px] text-white">{img.caption}</span> : null}
                </div>
              ))}
            </div>
          )}

          {videos.length > 0 && (
            <div className="space-y-3">
              {videos.map((video) => {
                const embedUrl = safeVideoEmbed(video.video_embed_url)
                const videoUrl = video.video_url || video.file_url
                const isDirect = video.video_provider === 'direct' || /\.(mp4|webm)(\?|#|$)/i.test(videoUrl || '')
                return (
                  <div key={video.id} className="overflow-hidden rounded-2xl border border-[#ECEEF3] bg-black">
                    {isDirect ? (
                      <video src={videoUrl} controls preload={!detailView && video.thumbnail_url ? 'none' : 'metadata'} poster={normalizeBackendAssetUrl(video.thumbnail_url) || undefined} className="max-h-[480px] w-full" aria-label={video.caption || video.file_name} />
                    ) : embedUrl ? (
                      <iframe src={embedUrl} title={video.caption || video.file_name || 'Видео'} className="aspect-video w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
                    ) : (
                      <a href={videoUrl} target="_blank" rel="noreferrer" className="block p-4 text-sm text-white underline">Открыть видео: {video.caption || video.file_name}</a>
                    )}
                    {video.caption ? <p className="bg-white px-3 py-2 text-xs text-[#64748B]">{video.caption}</p> : null}
                  </div>
                )
              })}
            </div>
          )}

          {/* Other Files */}
          {files.length > 0 && (
            <div className="space-y-2">
              {files.map(att => (
                <div key={att.id} className="flex items-center justify-between p-3 rounded-2xl bg-[#F8FAFC] border border-[#ECEEF3]">
                  <div className="flex items-center gap-3">
                    <MaterialSymbol name="description" size={22} color="#64748B" />
                    <div>
                      <div className="text-[12.5px] font-semibold text-[#0A1628] truncate max-w-[280px]">{att.file_name}</div>
                      <div className="text-[10px] text-[#8497B4]">
                        {att.file_type.toUpperCase()}  •  {att.file_size ? `${(att.file_size / (1024 * 1024)).toFixed(1)} МБ` : '—'}
                      </div>
                    </div>
                  </div>
                  <a
                    href={att.file_url}
                    target="_blank"
                    rel="noreferrer"
                    download={att.file_name}
                    className="w-8 h-8 rounded-xl flex items-center justify-center bg-white border border-[#E5E7EB] hover:bg-[#F3F4F6] text-[#4B5563] transition"
                  >
                    <MaterialSymbol name="download" size={15} />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Acknowledge Box */}
      {pub.requires_acknowledgement && (
        <div className={`flex min-h-11 items-center justify-between gap-3 rounded-xl border border-[#E6EAF1] bg-[#F8FAFC] py-1.5 pl-3 pr-1.5 ${detailView ? 'order-6 mx-auto mb-5 w-full max-w-[860px]' : ''}`}>
          <div className={`flex min-w-0 items-center gap-2 text-[13px] ${pub.acknowledged ? 'text-[#15803D]' : 'text-[#475569]'}`}>
            {pub.acknowledged ? <CircleCheck size={16} className="shrink-0" /> : <CircleAlert size={16} className="shrink-0 text-[#2458D3]" />}
            <span className="truncate font-medium">{pub.acknowledged ? 'Вы ознакомились с материалом' : 'Требуется ознакомиться с материалом'}</span>
          </div>
          {pub.acknowledged
            ? onUnacknowledge && <button type="button" onClick={() => void onUnacknowledge(pub)} className="h-8 shrink-0 rounded-lg px-3 text-[12px] font-medium text-[#64748B] transition hover:bg-white hover:text-[#0A1628]">Отменить</button>
            : <button type="button" onClick={() => void onAcknowledge(pub)} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-[#2458D3] px-3 text-[12px] font-semibold text-white transition hover:bg-[#1D49B3]"><Check size={14} />Ознакомлен</button>}
        </div>
      )}

      {!detailView ? (
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-[#EEF1F6] pt-3.5 text-[13px] text-[#64748B]">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <button
              type="button"
              disabled={Boolean(pendingReaction)}
              onClick={() => void togglePublicationReaction(likeReaction)}
              aria-pressed={likeReaction.reacted}
              className={`inline-flex items-center gap-2 transition hover:text-[#0A1628] disabled:opacity-50 ${likeReaction.reacted ? 'text-[#E11D48]' : ''}`}
            >
              <Heart size={17} strokeWidth={1.8} className={likeReaction.reacted ? 'fill-current' : ''} />
              <span>Нравится {likeReaction.count}</span>
            </button>
            <button type="button" onClick={toggleComments} className={`inline-flex items-center gap-2 transition hover:text-[#0A1628] ${comments !== null ? 'text-[#2458D3]' : ''}`}>
              <MessageCircle size={17} strokeWidth={1.8} />
              <span>Комментарии {pub.comments_count}</span>
            </button>
            <button type="button" onClick={(event) => void onShare(pub, event.currentTarget)} className="inline-flex items-center gap-2 transition hover:text-[#0A1628]">
              <Share2 size={16} strokeWidth={1.8} />
              <span>Поделиться</span>
            </button>
          </div>
          <span className="text-[12px] text-[#8497B4]" aria-label={`Просмотров: ${viewsCount}`}>Просмотры: {viewsCount}</span>
        </div>
      ) : null}

      {/* Footer actions */}
      {detailView ? <div className={`grid min-w-0 grid-cols-1 gap-3 text-[12.5px] text-[#8497B4] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${detailView ? 'order-7 mx-auto w-full max-w-[860px] border-b border-[#ECEEF3] pb-5' : ''}`}>
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">
          <div className="relative flex min-w-0 max-w-full basis-full flex-wrap items-center gap-1.5 sm:basis-auto">
            {reactions.filter((reaction) => reaction.count > 0).map((reaction) => <button
              key={reaction.reaction}
              type="button"
              disabled={Boolean(pendingReaction)}
              onClick={() => void togglePublicationReaction(reaction)}
              title={`${reaction.count} реакций`}
              className={`inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 transition-colors disabled:opacity-50 ${reaction.reacted ? 'border-[#B8C7FF] bg-[#EEF2FF] text-[#2458D3]' : 'border-[#ECEEF3] bg-white hover:bg-[#F8FAFC]'}`}
            ><span>{reaction.reaction}</span><span className="text-[11px] font-semibold">{reaction.count}</span></button>)}
            <button type="button" disabled={Boolean(pendingReaction)} onClick={() => setReactionPickerOpen((open) => !open)} className="inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-[#ECEEF3] px-2 hover:bg-[#F8FAFC] disabled:opacity-40" aria-label="Добавить реакцию">😊 <span>+</span></button>
            {reactionPickerOpen && <div className="absolute bottom-full left-0 z-30 mb-2 grid w-56 grid-cols-7 gap-1 rounded-2xl border border-[#E5EAF2] bg-white p-2 shadow-xl">
              {PUBLICATION_REACTIONS.map((emoji) => {
                const reaction = reactions.find((item) => item.reaction === emoji) || { reaction: emoji, count: 0, reacted: false }
                return <button key={emoji} type="button" disabled={Boolean(pendingReaction)} onClick={() => void togglePublicationReaction(reaction)} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[#EEF2FF] disabled:opacity-40" aria-label={`Реакция ${emoji}`}>{emoji}</button>
              })}
            </div>}
          </div>
          <button
            type="button"
            onClick={toggleComments}
            className={`flex min-w-0 items-center gap-1.5 whitespace-nowrap hover:text-[#2458D3] transition-colors ${
              comments !== null ? 'text-[#2458D3] font-semibold' : ''
            }`}
          >
            <MaterialSymbol name="chat_bubble" size={15} color="currentColor" />
            <span className="truncate">Комментарии {pub.comments_count}</span>
          </button>

          <button
            onClick={(event) => void onShare(pub, event.currentTarget)}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap hover:text-[#2458D3] transition-colors"
          >
            <MaterialSymbol name="share" size={15} color="currentColor" />
            <span>Поделиться</span>
          </button>
        </div>

        <div className="select-none text-[12px] text-[#8497B4] sm:text-right" aria-label={`Просмотров: ${viewsCount}`}>
          Просмотры: {viewsCount}
        </div>
      </div> : null}

      {/* Comments Block */}
      {comments !== null && (
        <div className={detailView ? 'order-9 mx-auto mt-4 flex w-full max-w-[860px] flex-col space-y-0 pt-6' : 'flex flex-col gap-3 border-t border-[#EEF1F6] pt-3'}>
          <div className={`flex items-center justify-between gap-3 ${detailView ? 'order-1 mb-4' : ''}`}>
            <div className={`${detailView ? 'text-[16px] font-bold text-[#0A1628]' : 'text-[12px] font-semibold text-[#475569]'}`}>{detailView ? <>Комментарии <span className="ml-1 text-[13px] font-medium text-[#8497B4]">{pub.comments_count}</span></> : <span className="text-[15px] font-bold text-[#0A1628]">Комментарии <span className="font-medium text-[#64748B]">· {pub.comments_count}</span></span>}</div>
            {!detailView && <button type="button" onClick={() => setCommentSort((value) => value === 'new' ? 'old' : 'new')} className="ml-auto inline-flex items-center gap-1 text-[13px] font-medium text-[#2458D3] hover:text-[#1D49B3]">{commentSort === 'new' ? 'Сначала новые' : 'Сначала старые'}<ChevronDown size={15} className={commentSort === 'old' ? 'rotate-180' : ''} /></button>}
            {canModerate && <button type="button" onClick={() => void toggleCommentsLock()} className="text-[11px] font-semibold text-[#2458D3] hover:underline">{commentsAllowed ? 'Закрыть обсуждение' : 'Открыть обсуждение'}</button>}
          </div>
          {!commentsAllowed && <div className={`rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 ${detailView ? 'order-2 mb-4' : ''}`}>Обсуждение закрыто{canModerate ? ' для новых комментариев других пользователей.' : '.'}</div>}
          {commentError && <div className={`rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 ${detailView ? 'order-2 mb-4' : ''}`}>{commentError}</div>}
          {canComment && <div className={detailView ? 'order-3 mb-2' : 'order-last'}>
            {replyTarget && (
              <div className="mb-2 flex items-center justify-between rounded-xl border border-[#Dbeafe] bg-[#EEF2FF] px-3 py-1.5 text-left text-[11.5px] text-[#2458D3]">
                <span>Ответ пользователю <strong>@{replyTarget.authorName}</strong></span>
                <button onClick={() => setReplyTarget(null)} className="rounded-full p-0.5 text-[#8497B4] hover:bg-white"><MaterialSymbol name="close" size={14} /></button>
              </div>
            )}
            {detailView ? <div className="flex items-start gap-3">
              <GradientAvatar initials={currentProfile?.fullName?.slice(0, 2).toUpperCase() || '?'} src={currentProfile?.avatarUrl} size={32} seed={currentProfile?.id || 0} />
              <textarea
                value={commentInput}
                onChange={(event) => setCommentInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void handleAddComment()
                  }
                }}
                maxLength={5000}
                rows={1}
                placeholder="Напишите комментарий..."
                className="min-h-[38px] flex-1 resize-none rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-2 text-[13px] leading-5 text-[#0A1628] outline-none transition placeholder:text-[#8497B4] focus:border-[#2458D3] focus:ring-1 focus:ring-[#2458D3] [field-sizing:content] max-h-40"
              />
              <button type="button" onClick={() => void handleAddComment()} disabled={!commentInput.trim()} className="ts-button ts-button--primary h-[38px] shrink-0 cursor-pointer rounded-xl bg-[#2458D3] px-4 text-[13px] font-semibold text-white transition hover:bg-[#253CB1] disabled:opacity-50">Отправить</button>
            </div> : <div className="flex items-center gap-2.5">
              <GradientAvatar initials={currentProfile?.fullName?.slice(0, 2).toUpperCase() || '?'} src={currentProfile?.avatarUrl} size={34} seed={currentProfile?.id || 0} />
              <input value={commentInput} onChange={(event) => setCommentInput(event.target.value)} maxLength={5000} placeholder="Напишите комментарий..." className="h-10 min-w-0 flex-1 rounded-full border border-[#E2E8F0] bg-white px-4 text-[13px] text-[#0A1628] outline-none transition placeholder:text-[#94A3B8] focus:border-[#9DB4E8]" onKeyDown={(event) => { if (event.key === 'Enter') void handleAddComment() }} />
              <button type="button" onClick={() => void handleAddComment()} disabled={!commentInput.trim()} aria-label="Отправить" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2458D3] text-white transition hover:bg-[#1D49B3] disabled:opacity-50">
                <SendHorizontal size={18} />
              </button>
            </div>}
          </div>}
          <div className={`${detailView ? 'space-y-2.5' : 'space-y-5 py-1'} pr-1 ${detailView ? 'order-4 max-h-none space-y-0 overflow-visible' : fullCard ? 'overflow-x-hidden' : 'max-h-[250px] overflow-x-hidden overflow-y-auto'}`}>
            {loadingComments && <div className="py-4 text-center text-[13px] text-[#8497B4]">Загрузка комментариев…</div>}
            {(detailView ? comments : [...comments].sort((a, b) => {
              if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
              const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              return commentSort === 'new' ? -diff : diff
            })).map((comment) => renderComment(comment))}
            {comments.length === 0 && commentsAllowed && (
              !loadingComments && <div className="py-4 text-center text-[13px] text-[#8497B4]">Комментариев пока нет. Будьте первыми!</div>
            )}
          </div>
        </div>
      )}

      {moderationDialog && <div className="ts-legacy-backdrop fixed inset-0 z-[10080] flex items-center justify-center bg-[#0A1628]/45 p-4 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !moderationBusyId) setModerationDialog(null) }}>
        <section role="dialog" aria-modal="true" aria-labelledby={`discussion-dialog-${pub.id}`} className="w-full max-w-[440px] overflow-hidden rounded-[24px] border border-[#E5EAF2] bg-white shadow-[0_24px_80px_rgba(15,31,58,0.24)]">
          <header className="flex items-start justify-between gap-4 border-b border-[#EEF2F7] px-5 py-4">
            <div>
              <h3 id={`discussion-dialog-${pub.id}`} className="text-[16px] font-bold text-[#0A1628]">
                {moderationDialog.kind === 'delete-comment' ? 'Удалить комментарий?'
                  : moderationDialog.kind === 'discussion-lock'
                    ? moderationDialog.nextAllowed ? 'Открыть обсуждение?' : 'Закрыть обсуждение?'
                    : moderationDialog.action === 'hide' ? 'Скрыть комментарий?' : 'Восстановить комментарий?'}
              </h3>
              <p className="mt-1 text-[12px] leading-5 text-[#64748B]">
                {moderationDialog.kind === 'delete-comment'
                  ? 'Комментарий будет удалён без возможности восстановления.'
                  : moderationDialog.kind === 'discussion-lock'
                    ? moderationDialog.nextAllowed ? 'Пользователи снова смогут оставлять комментарии.' : 'Новые комментарии будут недоступны до повторного открытия.'
                    : moderationDialog.action === 'hide' ? 'Комментарий скроется из обсуждения. Можно указать причину.' : 'Комментарий снова станет виден участникам обсуждения.'}
              </p>
            </div>
            <button type="button" aria-label="Закрыть" disabled={Boolean(moderationBusyId)} onClick={() => setModerationDialog(null)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#8497B4] hover:bg-[#F1F4F9] hover:text-[#0A1628] disabled:opacity-40"><X size={17} /></button>
          </header>
          {moderationDialog.kind !== 'delete-comment' && <div className="px-5 pt-4">
            <label htmlFor={`discussion-reason-${pub.id}`} className="mb-1.5 block text-[11px] font-semibold text-[#475569]">Причина <span className="font-normal text-[#94A3B8]">· необязательно</span></label>
            <textarea id={`discussion-reason-${pub.id}`} value={moderationReason} onChange={(event) => setModerationReason(event.target.value)} maxLength={1000} rows={3} placeholder="Добавьте пояснение для участников" className="w-full resize-none rounded-xl border border-[#DDE3EE] bg-[#F9FBFE] px-3 py-2.5 text-[12px] text-[#0A1628] outline-none transition focus:border-[#2458D3] focus:ring-2 focus:ring-[#2458D3]/10" />
          </div>}
          {commentError && <p role="alert" className="mx-5 mt-3 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">{commentError}</p>}
          <footer className="flex justify-end gap-2 px-5 py-4">
            <button type="button" disabled={Boolean(moderationBusyId)} onClick={() => { setModerationDialog(null); setCommentError(null) }} className="h-9 rounded-xl border border-[#DDE3EE] px-4 text-[12px] font-semibold text-[#475569] hover:bg-[#F8FAFC] disabled:opacity-50">Отмена</button>
            <button type="button" disabled={Boolean(moderationBusyId)} onClick={() => void submitModerationDialog()} className={`inline-flex h-9 min-w-[112px] items-center justify-center gap-2 rounded-xl px-4 text-[12px] font-semibold text-white disabled:opacity-50 ${moderationDialog.kind === 'delete-comment' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#2458D3] hover:bg-[#253CB1]'}`}>
              {moderationBusyId ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : null}
              {moderationDialog.kind === 'delete-comment' ? 'Удалить' : moderationDialog.kind === 'discussion-lock' ? moderationDialog.nextAllowed ? 'Открыть' : 'Закрыть' : moderationDialog.action === 'hide' ? 'Скрыть' : 'Восстановить'}
            </button>
          </footer>
        </section>
      </div>}
      </div>
    </>
  )
}, (prevProps, nextProps) => {
  return (
    prevProps.pub === nextProps.pub &&
    prevProps.detailView === nextProps.detailView &&
    prevProps.fullCard === nextProps.fullCard &&
    prevProps.currentProfile?.id === nextProps.currentProfile?.id &&
    prevProps.currentProfile?.role === nextProps.currentProfile?.role &&
    prevProps.currentUserId === nextProps.currentUserId
  )
})
