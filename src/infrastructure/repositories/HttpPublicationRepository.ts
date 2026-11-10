import type { AuthSessionStore } from '../../domain/services/AuthSessionStore'
import { authorizedFetch } from '../http/authorizedFetch'
import { normalizeBackendAssetUrl } from '../http/normalizeBackendAssetUrl'

export interface PublicationAttachment {
  id: string
  publication_id?: string
  file_url: string
  file_name: string
  file_type: string
  file_size?: number
  caption?: string
  order_index?: number
  mime_type?: string
  thumbnail_url?: string
  video_provider?: 'youtube' | 'rutube' | 'vimeo' | 'direct'
  video_embed_url?: string
  video_url?: string
  created_at?: string
}

export interface PublicationContentBlock {
  id: string
  type: string
  [key: string]: unknown
}

export interface PublicationContentDoc {
  type: 'doc'
  version: number
  blocks: PublicationContentBlock[]
}

export interface Publication {
  id: string
  author_id: number
  approved_by_id?: number
  source_type: 'user' | 'ministry' | 'department'
  ministry_id?: number
  department_id?: number
  type: 'news' | 'announcement' | 'document' | 'event' | 'appeal'
  title: string
  content?: string
  content_doc?: PublicationContentDoc
  cover_image_url?: string
  status?: string
  target_audience: 'all' | 'ministry' | 'branch' | 'department'
  target_ministry_id?: number
  target_department_id?: number
  target_ministry_ids?: number[]
  target_department_ids?: number[]
  importance: 'normal' | 'important' | 'urgent'
  is_pinned: boolean
  pinned_at?: string | null
  pinned_until?: string | null
  is_banner?: boolean
  banner_until?: string | null
  banner_action_text?: string | null
  banner_action_url?: string | null
  banner_color?: PublicationBannerColor
  notification_sent_at?: string | null
  allow_comments: boolean
  requires_acknowledgement: boolean
  scheduled_at?: string
  archive_at?: string
  archived_at?: string
  published_at: string
  created_at: string
  updated_at: string

  // Enriched fields
  source_name: string
  source_subtitle: string
  source_avatar?: string
  views_count: number
  comments_count: number
  shares_count: number
  acknowledged: boolean
  attachments?: PublicationAttachment[]
  reactions?: PublicationReactionSummary[]
}

export type PublicationBannerColor = 'urgent' | 'warning' | 'info' | 'primary'

export interface PublicationBannerSettings {
  is_banner: boolean
  banner_until?: string | null
  banner_action_text?: string | null
  banner_action_url?: string | null
  banner_color?: PublicationBannerColor
}

export interface PublicationBroadcastRun {
  id: string
  importance?: string
  target_audience?: string
  sent_push_count: number
  sent_email_count: number
  sent_at: string
  status?: string
  error_message?: string | null
}

export interface PublicationBroadcastStats {
  publication_id: string
  importance: string
  total_target_users: number
  acknowledged_count: number
  acknowledgement_percent: number
  sent_push_count: number
  sent_email_count: number
  last_broadcast_at?: string | null
  broadcasts: PublicationBroadcastRun[]
}

export interface PublicationAcknowledgement {
  user_id: number
  full_name: string
  avatar_url?: string
  position?: string
  acknowledged_at?: string | null
}

export interface PublicationAcknowledgementsPage {
  items: PublicationAcknowledgement[]
  total: number
}

export interface PublicationReactionUser {
  id: number
  full_name: string
  avatar?: string
}

export interface PublicationReactionSummary {
  reaction: string
  count: number
  reacted: boolean
  users?: PublicationReactionUser[]
}

export interface PublicationReadGroupStats {
  department_id?: number
  department_name?: string
  ministry_id?: number
  ministry_name?: string
  total_users: number
  views_count: number
  view_percent: number
  acknowledged_count: number
  acknowledgement_percent: number
}

export interface PublicationReadAnalytics {
  publication_id: string
  total_target_users: number
  views_count: number
  view_percent: number
  acknowledged_count: number
  acknowledgement_percent: number
  unread_count: number
  unacknowledged_count: number
  first_view_at?: string | null
  last_view_at?: string | null
  first_acknowledged_at?: string | null
  last_acknowledged_at?: string | null
  department_stats?: PublicationReadGroupStats[]
  ministry_stats?: PublicationReadGroupStats[]
}

export interface PublicationReader {
  user: {
    id: number
    first_name?: string
    last_name?: string
    full_name: string
    avatar_url?: string
    position?: string
  }
  email?: string
  department_id?: number
  department_name?: string
  ministry_id?: number
  ministry_name?: string
  is_viewed: boolean
  viewed_at?: string | null
  is_acknowledged: boolean
  acknowledged_at?: string | null
}

export type PublicationReaderStatus = 'all' | 'read' | 'unread' | 'acknowledged' | 'unacknowledged'

export interface PublicationReadersPage {
  publication_id: string
  total_count: number
  page: number
  limit: number
  readers: PublicationReader[]
}

export interface PublicationReadersFilter {
  status?: PublicationReaderStatus
  department_id?: number
  ministry_id?: number
  search?: string
  page?: number
  limit?: number
}

export interface PublicationReadersExport {
  blob: Blob
  fileName: string
}

export interface PublicationComment {
  id: string
  publication_id: string
  parent_id?: string
  author_id: number
  content: string
  created_at: string
  updated_at?: string

  // Enriched fields
  author_name: string
  author_avatar?: string
  author_position?: string
  author?: { id: number; full_name: string; avatar_url?: string; position?: string }
  reply_to_user?: { id: number; full_name: string; avatar_url?: string; position?: string }
  is_pinned?: boolean
  pinned_at?: string
  pinned_by?: { id: number; full_name: string; avatar_url?: string }
  is_hidden?: boolean
  status?: 'active' | 'hidden' | 'deleted_by_moderator'
  moderation_reason?: string
  replies_count?: number
  replies?: PublicationComment[]
  reactions?: PublicationReactionSummary[]
}

export interface CreatePublicationInput {
  source_type: 'user' | 'ministry' | 'department'
  type: 'news' | 'announcement' | 'document' | 'event' | 'appeal'
  title: string
  content: string
  status?: string
  scheduled_at?: string
  archive_at?: string
  content_doc?: PublicationContentDoc
  cover_image_url?: string
  target_audience: 'all' | 'ministry' | 'branch' | 'department'
  target_ministry_id?: number
  target_department_id?: number
  target_ministry_ids?: number[]
  target_department_ids?: number[]
  importance: 'normal' | 'important' | 'urgent'
  allow_comments: boolean
  requires_acknowledgement: boolean
  attachments?: Array<{
    file_url: string
    file_name: string
    file_type: string
    file_size?: number
  }>
}

export interface UpdatePublicationInput extends Omit<CreatePublicationInput, 'attachments'> {}

const normalizeAsset = (value: string | null | undefined): string | null =>
  normalizeBackendAssetUrl(value) ?? value ?? null

const publicationRequestError = async (response: Response, fallback: string): Promise<Error> => {
  const body = await response.json().catch(() => ({})) as any
  const rawDetail = body?.error?.user_message || body?.error?.message || body?.user_message || body?.message
  const detail = typeof rawDetail === 'string' ? rawDetail : undefined
  if (response.status === 401) return new Error(detail || 'Сессия завершилась. Войдите в систему и повторите попытку.')
  if (response.status === 403) return new Error(detail || 'Недостаточно прав для выполнения этого действия')
  if (response.status === 413) return new Error(detail || 'Размер файлов превышает допустимый лимит')
  if (response.status === 400 || response.status === 422) return new Error(detail || 'Проверьте формат и размер передаваемых данных')
  if (response.status === 404) return new Error(detail || 'Публикация или вложение не найдены')
  if (response.status >= 500) return new Error(detail || 'Сервер временно недоступен. Попробуйте позже.')
  return new Error(detail || `${fallback} (${response.status})`)
}

export class HttpPublicationRepository {
  private readonly sessionStore: AuthSessionStore

  constructor(sessionStore: AuthSessionStore) {
    this.sessionStore = sessionStore
  }

  async getPublications(params: {
    page?: number
    limit?: number
    type?: string
    importance?: string
    ministry_id?: number
    department_id?: number
    status?: 'published' | 'draft' | 'scheduled' | 'archived' | 'all'
  } = {}): Promise<Publication[]> {
    const query = new URLSearchParams()
    if (params.page !== undefined) query.append('page', String(params.page))
    if (params.limit !== undefined) query.append('limit', String(params.limit))
    if (params.type) query.append('type', params.type)
    if (params.importance) query.append('importance', params.importance)
    if (params.ministry_id !== undefined) query.append('ministry_id', String(params.ministry_id))
    if (params.department_id !== undefined) query.append('department_id', String(params.department_id))
    if (params.status) query.append('status', params.status)

    const url = `/api/v1/publications?${query.toString()}`
    const response = await authorizedFetch(this.sessionStore, url)
    if (!response.ok) {
      throw new Error(`Failed to load publications: ${response.statusText}`)
    }
    const data = (await response.json()) as { publications: any[] }
    return (data.publications || []).map((pub) => ({
      ...pub,
      author_id: pub.author?.id || pub.author_id,
      acknowledged: pub.acknowledged ?? pub.is_acknowledged ?? false,
      source_avatar: normalizeAsset(pub.source_avatar) || undefined,
      cover_image_url: normalizeAsset(pub.cover_image_url) || undefined,
      attachments: (pub.attachments || []).slice().sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0)),
      ...(Array.isArray(pub.reactions) ? { reactions: pub.reactions } : {}),
    }))
  }

  async getPublicationById(id: string): Promise<Publication> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${id}`)
    if (!response.ok) {
      throw new Error(`Failed to load publication details: ${response.statusText}`)
    }
    const pub = (await response.json()) as any
    return {
      ...pub,
      author_id: pub.author?.id || pub.author_id,
      acknowledged: pub.acknowledged ?? pub.is_acknowledged ?? false,
      source_avatar: normalizeAsset(pub.source_avatar) || undefined,
      cover_image_url: normalizeAsset(pub.cover_image_url) || undefined,
      attachments: (pub.attachments || []).slice().sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0)),
      ...(Array.isArray(pub.reactions) ? { reactions: pub.reactions } : {}),
    }
  }

  async createPublication(input: CreatePublicationInput): Promise<Publication> {
    const response = await authorizedFetch(this.sessionStore, '/api/v1/publications', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    if (!response.ok) {
      throw await publicationRequestError(response, 'Не удалось создать публикацию')
    }
    const pub = (await response.json()) as any
    return {
      ...pub,
      author_id: pub.author?.id || pub.author_id,
      acknowledged: pub.acknowledged ?? pub.is_acknowledged ?? false,
      cover_image_url: normalizeAsset(pub.cover_image_url) || undefined,
    }
  }

  async updatePublication(id: string, input: UpdatePublicationInput): Promise<Publication> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    })
    if (!response.ok) {
      throw await publicationRequestError(response, 'Не удалось сохранить публикацию')
    }
    const pub = (await response.json()) as any
    return {
      ...pub,
      author_id: pub.author?.id || pub.author_id,
      acknowledged: pub.acknowledged ?? pub.is_acknowledged ?? false,
      source_avatar: normalizeAsset(pub.source_avatar) || undefined,
      cover_image_url: normalizeAsset(pub.cover_image_url) || undefined,
      attachments: (pub.attachments || []).slice().sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0)),
    }
  }

  async deletePublication(id: string): Promise<void> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${id}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      throw new Error(`Failed to delete publication: ${response.statusText}`)
    }
  }

  async publishPublication(id: string, input: { scheduled_at?: string; archive_at?: string } = {}): Promise<void> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${id}/publish`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось опубликовать новость')
  }

  async unpublishPublication(id: string): Promise<void> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${id}/unpublish`, { method: 'POST' })
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось снять новость с публикации')
  }

  async archivePublication(id: string): Promise<void> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${id}/archive`, { method: 'POST' })
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось переместить новость в архив')
  }

  async unarchivePublication(id: string, target_status: 'draft' | 'published' = 'draft'): Promise<void> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${id}/unarchive`, {
      method: 'POST',
      body: JSON.stringify({ target_status }),
    })
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось восстановить новость из архива')
  }

  async archiveObsoletePublications(input: { older_than_days?: number; before_date?: string; types?: Publication['type'][] }): Promise<{ archived_count: number; cutoff_date?: string }> {
    const response = await authorizedFetch(this.sessionStore, '/api/v1/publications/archive/obsolete', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось архивировать устаревшие новости')
    return await response.json() as { archived_count: number; cutoff_date?: string }
  }

  private normalizeComment(comment: any): PublicationComment {
    const author = comment.author || {}
    return {
      ...comment,
      author_id: author.id ?? comment.author_id,
      author_name: author.full_name || comment.author_name || 'Пользователь',
      author_position: author.position || comment.author_position,
      author_avatar: normalizeAsset(author.avatar_url) || normalizeAsset(comment.author_avatar) || undefined,
      author: author.id ? { ...author, avatar_url: normalizeAsset(author.avatar_url) || undefined } : undefined,
      reply_to_user: comment.reply_to_user ? { ...comment.reply_to_user, avatar_url: normalizeAsset(comment.reply_to_user.avatar_url) || undefined } : undefined,
      pinned_by: comment.pinned_by ? { ...comment.pinned_by, avatar_url: normalizeAsset(comment.pinned_by.avatar_url) || undefined } : undefined,
      reactions: Array.isArray(comment.reactions) ? comment.reactions : [],
      replies: Array.isArray(comment.replies) ? comment.replies.map((reply: any) => this.normalizeComment(reply)) : [],
      replies_count: comment.replies_count ?? comment.replies?.length ?? 0,
    }
  }

  async getComments(publicationId: string): Promise<PublicationComment[]> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${publicationId}/comments`)
    if (!response.ok) {
      throw await publicationRequestError(response, 'Не удалось загрузить комментарии')
    }
    const data = (await response.json()) as { comments: any[] }
    return (data.comments || []).map((comment) => this.normalizeComment(comment))
  }

  async getCommentReplies(publicationId: string, commentId: string): Promise<PublicationComment[]> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${publicationId}/comments/${commentId}/replies`)
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось загрузить ответы')
    const data = await response.json() as { replies?: any[] }
    return (data.replies || []).map((reply) => this.normalizeComment(reply))
  }

  async addComment(publicationId: string, input: { content: string; parent_id?: string; reply_to_user_id?: number }): Promise<PublicationComment> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${publicationId}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        content: input.content,
        ...(input.parent_id ? { parent_id: input.parent_id } : {}),
        ...(input.reply_to_user_id ? { reply_to_user_id: input.reply_to_user_id } : {}),
      }),
    })
    if (!response.ok) {
      throw await publicationRequestError(response, 'Не удалось отправить комментарий')
    }
    const comment = (await response.json()) as any
    return this.normalizeComment(comment)
  }

  async deleteComment(publicationId: string, commentId: string): Promise<void> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${publicationId}/comments/${commentId}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      throw await publicationRequestError(response, 'Не удалось удалить комментарий')
    }
  }

  async getPublicationReactions(publicationId: string): Promise<PublicationReactionSummary[]> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${publicationId}/reactions`)
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось загрузить реакции')
    const data = await response.json() as { reactions?: PublicationReactionSummary[] }
    return data.reactions || []
  }

  async addPublicationReaction(publicationId: string, reaction: string): Promise<PublicationReactionSummary[]> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${publicationId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ reaction }),
    })
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось поставить реакцию')
    const data = await response.json() as { reactions?: PublicationReactionSummary[] }
    return data.reactions || []
  }

  async removePublicationReaction(publicationId: string, reaction: string): Promise<PublicationReactionSummary[]> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${publicationId}/reactions/${encodeURIComponent(reaction)}`, { method: 'DELETE' })
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось убрать реакцию')
    const data = await response.json() as { reactions?: PublicationReactionSummary[] }
    return data.reactions || []
  }

  async addCommentReaction(publicationId: string, commentId: string, reaction: string): Promise<PublicationReactionSummary[]> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${publicationId}/comments/${commentId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ reaction }),
    })
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось поставить реакцию на комментарий')
    const data = await response.json() as { reactions?: PublicationReactionSummary[] }
    return data.reactions || []
  }

  async removeCommentReaction(publicationId: string, commentId: string, reaction: string): Promise<PublicationReactionSummary[]> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${publicationId}/comments/${commentId}/reactions/${encodeURIComponent(reaction)}`, { method: 'DELETE' })
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось убрать реакцию с комментария')
    const data = await response.json() as { reactions?: PublicationReactionSummary[] }
    return data.reactions || []
  }

  async pinComment(publicationId: string, commentId: string, pinned: boolean): Promise<void> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${publicationId}/comments/${commentId}/pin`, { method: pinned ? 'PUT' : 'DELETE' })
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось изменить закрепление комментария')
  }

  async moderateComment(publicationId: string, commentId: string, action: 'hide' | 'restore' | 'delete', reason?: string): Promise<void> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${publicationId}/comments/${commentId}/moderate`, {
      method: 'PUT',
      body: JSON.stringify({ action, ...(reason ? { reason } : {}) }),
    })
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось выполнить модерацию комментария')
  }

  async lockPublicationComments(publicationId: string, allow_comments: boolean, reason?: string): Promise<Publication> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${publicationId}/comments/lock`, {
      method: 'PUT',
      body: JSON.stringify({ allow_comments, ...(reason ? { reason } : {}) }),
    })
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось изменить настройки обсуждения')
    return await response.json() as Publication
  }

  async acknowledgePublication(id: string): Promise<void> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${id}/acknowledge`, {
      method: 'POST',
    })
    if (!response.ok) {
      throw await publicationRequestError(response, 'Не удалось подтвердить ознакомление')
    }
  }

  async unacknowledgePublication(id: string): Promise<void> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${encodeURIComponent(id)}/acknowledge`, {
      method: 'DELETE',
    })
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось отменить подтверждение ознакомления')
  }

  async getPublicationReadAnalytics(id: string): Promise<PublicationReadAnalytics> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${encodeURIComponent(id)}/analytics`)
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось загрузить аналитику прочтений')
    const payload = await response.json() as any
    return (payload.analytics || payload.data || payload) as PublicationReadAnalytics
  }

  async getPublicationReaders(id: string, filter: PublicationReadersFilter = {}): Promise<PublicationReadersPage> {
    const query = new URLSearchParams()
    if (filter.status && filter.status !== 'all') query.set('status', filter.status)
    if (filter.department_id) query.set('department_id', String(filter.department_id))
    if (filter.ministry_id) query.set('ministry_id', String(filter.ministry_id))
    if (filter.search?.trim()) query.set('search', filter.search.trim())
    query.set('page', String(filter.page ?? 1))
    query.set('limit', String(filter.limit ?? 50))
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${encodeURIComponent(id)}/readers?${query}`)
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось загрузить список сотрудников')
    const payload = await response.json() as any
    const data = payload.data || payload
    return {
      publication_id: data.publication_id || id,
      total_count: Number(data.total_count) || 0,
      page: Number(data.page) || filter.page || 1,
      limit: Number(data.limit) || filter.limit || 50,
      readers: (Array.isArray(data.readers) ? data.readers : []).map((reader: PublicationReader) => ({
        ...reader,
        user: {
          ...reader.user,
          avatar_url: normalizeAsset(reader.user?.avatar_url) || undefined,
        },
      })),
    }
  }

  async exportPublicationReaders(id: string, filter: Omit<PublicationReadersFilter, 'page' | 'limit'> & { format?: 'xlsx' | 'csv' } = {}): Promise<PublicationReadersExport> {
    const query = new URLSearchParams()
    query.set('format', filter.format || 'xlsx')
    if (filter.status && filter.status !== 'all') query.set('status', filter.status)
    if (filter.department_id) query.set('department_id', String(filter.department_id))
    if (filter.ministry_id) query.set('ministry_id', String(filter.ministry_id))
    if (filter.search?.trim()) query.set('search', filter.search.trim())
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${encodeURIComponent(id)}/readers/export?${query}`)
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось выгрузить список сотрудников')
    const disposition = response.headers.get('Content-Disposition') || ''
    const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
    const plainName = disposition.match(/filename="?([^";]+)"?/i)?.[1]
    let fileName = encodedName ? decodeURIComponent(encodedName) : plainName || `readers_${id}.${filter.format || 'xlsx'}`
    fileName = fileName.replace(/[\\/]/g, '_')
    return { blob: await response.blob(), fileName }
  }

  async getActiveBanners(): Promise<Publication[]> {
    const response = await authorizedFetch(this.sessionStore, '/api/v1/publications/banners')
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось загрузить баннеры')
    const data = await response.json() as unknown
    const record = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
    const list = Array.isArray(data) ? data : Array.isArray(record.banners) ? record.banners : Array.isArray(record.publications) ? record.publications : Array.isArray(record.items) ? record.items : []
    return (list as Publication[]).map((pub) => ({
      ...pub,
      acknowledged: pub.acknowledged ?? (pub as unknown as { is_acknowledged?: boolean }).is_acknowledged ?? false,
      cover_image_url: normalizeAsset(pub.cover_image_url) || undefined,
    }))
  }

  async dismissBanner(id: string): Promise<void> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${id}/banner/dismiss`, { method: 'POST' })
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось скрыть баннер')
  }

  async setPublicationBanner(id: string, input: PublicationBannerSettings): Promise<void> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${id}/banner`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось сохранить баннер')
  }

  async removePublicationBanner(id: string): Promise<void> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${id}/banner`, { method: 'DELETE' })
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось отключить баннер')
  }

  async pinPublication(id: string, pinnedUntil?: string | null): Promise<void> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${id}/pin`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pinnedUntil ? { pinned_until: pinnedUntil } : {}),
    })
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось закрепить публикацию')
  }

  async unpinPublication(id: string): Promise<void> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${id}/pin`, { method: 'DELETE' })
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось открепить публикацию')
  }

  async broadcastPublication(id: string, input: { send_push: boolean; send_email: boolean; force?: boolean }): Promise<void> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${id}/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось отправить рассылку')
  }

  async getPublicationBroadcastStats(id: string): Promise<PublicationBroadcastStats> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${id}/broadcast/stats`)
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось загрузить статистику рассылки')
    const data = await response.json() as Partial<PublicationBroadcastStats>
    return {
      publication_id: data.publication_id || id,
      importance: data.importance || 'normal',
      total_target_users: Number(data.total_target_users) || 0,
      acknowledged_count: Number(data.acknowledged_count) || 0,
      acknowledgement_percent: Number(data.acknowledgement_percent) || 0,
      sent_push_count: Number(data.sent_push_count) || 0,
      sent_email_count: Number(data.sent_email_count) || 0,
      last_broadcast_at: data.last_broadcast_at ?? null,
      broadcasts: Array.isArray(data.broadcasts) ? data.broadcasts : [],
    }
  }

  async getPublicationAcknowledgements(id: string, page = 1, limit = 20): Promise<PublicationAcknowledgementsPage> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${id}/acknowledgements?page=${page}&limit=${limit}`)
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось загрузить список ознакомившихся')
    const data = await response.json() as unknown
    const record = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
    const list = Array.isArray(data) ? data : Array.isArray(record.acknowledgements) ? record.acknowledgements : Array.isArray(record.items) ? record.items : Array.isArray(record.users) ? record.users : []
    const items = (list as Array<Record<string, unknown>>).map((row) => {
      const user = (row.user && typeof row.user === 'object' ? row.user : row) as Record<string, unknown>
      return {
        user_id: Number(row.user_id ?? user.id) || 0,
        full_name: String(user.full_name ?? row.full_name ?? user.name ?? 'Сотрудник'),
        avatar_url: normalizeAsset((user.avatar_url ?? user.avatar ?? row.avatar_url) as string | undefined) || undefined,
        position: (user.position ?? row.position) as string | undefined,
        acknowledged_at: (row.acknowledged_at ?? row.created_at ?? null) as string | null,
      }
    })
    return { items, total: Number(record.total ?? record.total_count ?? items.length) || items.length }
  }

  async sharePublication(id: string): Promise<void> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${id}/share`, {
      method: 'POST',
    })
    if (!response.ok) {
      throw new Error(`Failed to share publication: ${response.statusText}`)
    }
  }

  async uploadPublicationGallery(publicationId: string, images: Array<{ file: File; caption: string }>): Promise<PublicationAttachment[]> {
    const formData = new FormData()
    images.forEach(({ file, caption }) => {
      formData.append('images', file)
      formData.append('captions', caption)
    })
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${publicationId}/gallery`, {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось загрузить изображения')
    const data = await response.json() as { gallery?: PublicationAttachment[] }
    return (data.gallery || []).slice().sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
  }

  async uploadPublicationCover(publicationId: string, file: File): Promise<string> {
    const formData = new FormData()
    formData.append('cover', file)
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${publicationId}/cover`, {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось загрузить обложку')
    const data = await response.json() as { cover_image_url?: string; publication?: { cover_image_url?: string } }
    const url = data.cover_image_url || data.publication?.cover_image_url
    if (!url) throw new Error('Сервер не вернул ссылку на обложку')
    return normalizeAsset(url) || url
  }

  async deletePublicationCover(publicationId: string): Promise<void> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${publicationId}/cover`, { method: 'DELETE' })
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось удалить обложку')
  }

  async uploadPublicationAttachments(publicationId: string, files: Array<{ file: File; caption: string }>): Promise<PublicationAttachment[]> {
    const formData = new FormData()
    files.forEach(({ file, caption }) => {
      formData.append('files', file)
      formData.append('captions', caption)
    })
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${publicationId}/attachments`, {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось загрузить вложения')
    const data = await response.json() as { attachments?: PublicationAttachment[] }
    return (data.attachments || []).slice().sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
  }

  async addPublicationVideo(publicationId: string, input: { video_url: string; caption?: string; title?: string }): Promise<PublicationAttachment> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${publicationId}/videos`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось добавить видео')
    return await response.json() as PublicationAttachment
  }

  async reorderPublicationAttachments(publicationId: string, attachmentIds: string[]): Promise<PublicationAttachment[]> {
    const uniqueIds = Array.from(new Set(attachmentIds))
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${publicationId}/attachments/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ attachment_ids: uniqueIds }),
    })
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось изменить порядок вложений')
    const data = await response.json() as { attachments?: PublicationAttachment[] }
    return (data.attachments || []).slice().sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
  }

  async deletePublicationAttachment(publicationId: string, attachmentId: string): Promise<void> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${publicationId}/attachments/${attachmentId}`, {
      method: 'DELETE',
    })
    if (!response.ok) throw await publicationRequestError(response, 'Не удалось удалить вложение')
  }

  async recordView(id: string): Promise<void> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/publications/${id}/view`, {
      method: 'POST',
    })
    if (!response.ok) {
      throw new Error(`Failed to record view: ${response.statusText}`)
    }
  }

  async uploadFile(file: File, type: 'image' | 'video' | 'document' | 'file' | 'audio' | 'voice'): Promise<UploadedFile> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', type)

    const response = await authorizedFetch(this.sessionStore, '/api/v1/files/upload', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      throw new Error(`Failed to upload file: ${response.statusText}`)
    }

    interface UploadedFileDto {
      object_name: string
      url: string
      filename: string
      size: number
      type: string
    }

    const data = (await response.json()) as UploadedFileDto
    return {
      objectName: data.object_name,
      url: normalizeBackendAssetUrl(data.url) ?? data.url,
      filename: data.filename,
      size: data.size,
      type: data.type,
    }
  }

  async getMinistries(): Promise<Array<{ id: number; name: string }>> {
    return []
  }
}

export interface UploadedFile {
  objectName: string
  url: string
  filename: string
  size: number
  type: string
}
