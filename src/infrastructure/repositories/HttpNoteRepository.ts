import { encodeNoteLists, decodeNoteLists } from '../../domain/notes/noteListCodec'
import type {
  AttachmentPresignInput,
  AttachmentPresignResult,
  CreateFolderInput,
  CreateNoteInput,
  MoveNoteInput,
  Note,
  NoteAttachment,
  NoteChecklistItem,
  NoteContentDoc,
  NoteFolder,
  NoteTagSummary,
  NotesListParams,
  NotesListResult,
  NoteVersionPayload,
  UpdateFolderInput,
  UpdateNoteInput,
} from '../../domain/entities/Note'
import { NoteVersionConflictError } from '../../domain/entities/Note'
import type { NoteRepository } from '../../domain/repositories/NoteRepository'
import type { AuthSessionStore } from '../../domain/services/AuthSessionStore'
import { authorizedFetch } from '../http/authorizedFetch'
import { HttpError, parseHttpError } from '../http/HttpError'
import { normalizeBackendAssetUrl } from '../http/normalizeBackendAssetUrl'

interface NoteDto {
  id: string
  user_id?: number
  folder_id?: string | null
  title?: string
  content?: string
  content_doc?: NoteContentDoc | null
  tags?: string[]
  content_text?: string | null
  type?: string
  checklist_items?: NoteChecklistItem[]
  is_pinned?: boolean
  is_archived?: boolean
  is_deleted?: boolean
  deleted_at?: string | null
  created_at?: string
  updated_at?: string
  version?: number
  attachments?: NoteAttachmentDto[]
}

interface NoteAttachmentDto {
  file_id?: string
  id?: string
  real_name?: string
  mime_type?: string
  size?: number
  download_url?: string | null
  status?: string
  width?: number | null
  height?: number | null
  created_at?: string | null
  duration?: number | null
  is_recording?: boolean
}

interface NotesListResponseDto {
  data?: NoteDto[] | { items?: NoteDto[]; notes?: NoteDto[]; next_cursor?: string | null }
  items?: NoteDto[]
  notes?: NoteDto[]
  next_cursor?: string | null
  nextCursor?: string | null
}

interface FolderDto {
  id: string
  user_id?: number
  name: string
  sort_order?: number
  color?: string
  created_at?: string
  updated_at?: string
}

interface PresignResponseDto {
  attachment_id: string
  upload_url: string
  storage_key: string
  expires_at: string
}

const parseJson = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    throw await parseHttpError(response)
  }
  const text = await response.text()
  return text ? (JSON.parse(text) as T) : ({} as T)
}

const unwrapNote = (payload: unknown): NoteDto => {
  if (!payload || typeof payload !== 'object') {
    throw new HttpError('Некорректный ответ сервера', 500)
  }
  const obj = payload as Record<string, unknown>
  if (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) {
    const inner = obj.data as Record<string, unknown>
    if (inner.note && typeof inner.note === 'object') {
      return inner.note as unknown as NoteDto
    }
    return inner as unknown as NoteDto
  }
  if (obj.note && typeof obj.note === 'object') {
    return obj.note as unknown as NoteDto
  }
  return obj as unknown as NoteDto
}

const mapAttachment = (dto: NoteAttachmentDto): NoteAttachment => {
  const fileId = dto.file_id ?? dto.id ?? ''
  const downloadUrl = normalizeBackendAssetUrl(dto.download_url) ?? dto.download_url ?? null
  return {
    file_id: fileId,
    id: dto.id ?? fileId,
    real_name: dto.real_name ?? '',
    mime_type: dto.mime_type ?? 'application/octet-stream',
    size: dto.size ?? 0,
    download_url: downloadUrl,
    status: dto.status ?? 'ready',
    width: dto.width ?? null,
    height: dto.height ?? null,
    created_at: dto.created_at ?? null,
    duration: dto.duration ?? null,
    is_recording: Boolean(dto.is_recording),
  }
}

const mapNote = (dto: NoteDto): Note => ({
  id: dto.id,
  user_id: dto.user_id,
  folder_id: dto.folder_id ?? null,
  title: dto.title ?? '',
  content: dto.content ?? '',
  content_doc: dto.content_doc ? (() => {
    const decoded = decodeNoteLists(dto.content_doc!)
    return Array.isArray(dto.tags)
      ? { ...decoded, page: { ...decoded.page, tags: normalizeNoteTags(dto.tags) } }
      : decoded
  })() : null,
  tags: Array.isArray(dto.tags) ? normalizeNoteTags(dto.tags) : normalizeNoteTags(dto.content_doc?.page?.tags ?? []),
  content_text: dto.content_text ?? null,
  type: (dto.type === 'checklist' || dto.type === 'rich' || dto.type === 'audio' ? dto.type : 'text') as Note['type'],
  checklist_items: (dto.checklist_items ?? []).map((item) => ({
    ...item,
    is_done: Boolean(item.is_done ?? item.checked),
    checked: Boolean(item.checked ?? item.is_done),
  })),
  is_pinned: Boolean(dto.is_pinned),
  is_archived: Boolean(dto.is_archived),
  is_deleted: Boolean(dto.is_deleted),
  deleted_at: dto.deleted_at ?? null,
  created_at: dto.created_at ?? new Date().toISOString(),
  updated_at: dto.updated_at ?? new Date().toISOString(),
  version: dto.version ?? 1,
  attachments: (dto.attachments ?? []).map(mapAttachment),
})

const normalizeNoteTags = (tags: string[]): string[] => [...new Set(tags
  .map((tag) => Array.from(String(tag).trim().replace(/^#+/, '').replace(/\s+/g, ' ')).slice(0, 50).join('').toLocaleLowerCase())
  .filter(Boolean))].slice(0, 50)

const serializeContentDoc = (contentDoc?: NoteContentDoc | null): NoteContentDoc | null | undefined => {
  if (!contentDoc) return contentDoc
  const encoded = encodeNoteLists(contentDoc)
  if (!encoded.page) return encoded
  const { tags: _tags, ...page } = encoded.page
  return { ...encoded, page: Object.keys(page).length ? page : undefined }
}

const serializeNoteInput = <T extends CreateNoteInput | UpdateNoteInput>(input: T) => {
  const tags = input.tags ?? input.content_doc?.page?.tags
  return {
    ...input,
    // PATCH must distinguish an omitted field from an explicit empty list.
    ...(tags === undefined ? {} : { tags: normalizeNoteTags(tags) }),
    content_doc: serializeContentDoc(input.content_doc),
  }
}

const mapFolder = (dto: FolderDto): NoteFolder => ({
  id: dto.id,
  user_id: dto.user_id,
  name: dto.name,
  sort_order: dto.sort_order ?? 0,
  color: dto.color || '#1687FF',
  created_at: dto.created_at,
  updated_at: dto.updated_at,
})

const parseNotesList = (payload: NotesListResponseDto): NotesListResult => {
  let items: NoteDto[] = []
  let nextCursor: string | null = null

  if (Array.isArray(payload.data)) {
    items = payload.data
    nextCursor = payload.next_cursor ?? payload.nextCursor ?? null
  } else if (payload.data && typeof payload.data === 'object') {
    const nested = payload.data as { items?: NoteDto[]; notes?: NoteDto[]; next_cursor?: string | null }
    items = nested.items ?? nested.notes ?? []
    nextCursor = nested.next_cursor ?? payload.next_cursor ?? payload.nextCursor ?? null
  } else if (Array.isArray(payload.items)) {
    items = payload.items
    nextCursor = payload.next_cursor ?? payload.nextCursor ?? null
  } else if (Array.isArray(payload.notes)) {
    items = payload.notes
    nextCursor = payload.next_cursor ?? payload.nextCursor ?? null
  }

  return {
    items: items.map(mapNote),
    nextCursor: nextCursor || null,
  }
}

const parseFolders = (payload: unknown): NoteFolder[] => {
  if (Array.isArray(payload)) {
    return payload.map((item) => mapFolder(item as FolderDto))
  }
  if (payload && typeof payload === 'object') {
    const obj = payload as { data?: FolderDto[]; items?: FolderDto[]; folders?: FolderDto[] }
    const list = obj.data ?? obj.items ?? obj.folders ?? []
    if (Array.isArray(list)) {
      return list.map(mapFolder)
    }
  }
  return []
}

export class HttpNoteRepository implements NoteRepository {
  private readonly sessionStore: AuthSessionStore

  constructor(sessionStore: AuthSessionStore) {
    this.sessionStore = sessionStore
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await authorizedFetch(this.sessionStore, path, init)
    return parseJson<T>(response)
  }

  private async requestNote(path: string, init: RequestInit = {}): Promise<Note> {
    try {
      const payload = await this.request<unknown>(path, init)
      return mapNote(unwrapNote(payload))
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        throw new NoteVersionConflictError(error.message)
      }
      throw error
    }
  }

  async listNotes(params: NotesListParams = {}): Promise<NotesListResult> {
    const search = new URLSearchParams()
    const limit = params.limit ?? 20
    search.set('limit', String(limit))
    if (params.folderId) search.set('folderId', params.folderId)
    if (params.isDeleted !== undefined) search.set('isDeleted', String(params.isDeleted))
    if (params.isArchived !== undefined) search.set('isArchived', String(params.isArchived))
    if (params.q?.trim()) search.set('q', params.q.trim())
    if (params.tag?.trim()) search.set('tag', normalizeNoteTags([params.tag])[0] ?? '')
    if (params.cursor) search.set('cursor', params.cursor)
    if (params.scope) search.set('scope', params.scope)

    const payload = await this.request<NotesListResponseDto>(`/api/v1/notes?${search}`)
    return parseNotesList(payload)
  }

  getNote(id: string): Promise<Note> {
    return this.requestNote(`/api/v1/notes/${id}`)
  }

  createNote(input: CreateNoteInput): Promise<Note> {
    return this.requestNote('/api/v1/notes', {
      method: 'POST',
      body: JSON.stringify(serializeNoteInput(input)),
    })
  }

  saveMeetingResult(jobId: string, input: CreateNoteInput): Promise<Note> {
    return this.requestNote('/api/v1/notes/meeting-result', {
      method: 'POST',
      body: JSON.stringify({ ...serializeNoteInput(input), job_id: jobId }),
    })
  }

  updateNote(id: string, input: UpdateNoteInput): Promise<Note> {
    return this.requestNote(`/api/v1/notes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(serializeNoteInput(input)),
    })
  }

  async listTags(): Promise<NoteTagSummary[]> {
    const payload = await this.request<unknown>('/api/v1/notes/tags')
    const candidates = Array.isArray(payload)
      ? payload
      : payload && typeof payload === 'object'
        ? ((payload as { data?: unknown; tags?: unknown; items?: unknown }).data ?? (payload as { tags?: unknown }).tags ?? (payload as { items?: unknown }).items)
        : []
    if (!Array.isArray(candidates)) return []
    return candidates.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const entry = item as { tag?: unknown; count?: unknown }
      const tag = normalizeNoteTags([String(entry.tag ?? '')])[0]
      return tag ? [{ tag, count: Number(entry.count) || 0 }] : []
    })
  }

  pinNote(id: string, payload: NoteVersionPayload): Promise<Note> {
    return this.requestNote(`/api/v1/notes/${id}/pin`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  unpinNote(id: string, payload: NoteVersionPayload): Promise<Note> {
    return this.requestNote(`/api/v1/notes/${id}/unpin`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  moveNote(id: string, input: MoveNoteInput): Promise<Note> {
    return this.requestNote(`/api/v1/notes/${id}/move`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  async deleteNote(id: string, payload: NoteVersionPayload): Promise<void> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/notes/${id}`, {
      method: 'DELETE',
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      throw await parseHttpError(response)
    }
  }

  restoreNote(id: string, payload: NoteVersionPayload): Promise<Note> {
    return this.requestNote(`/api/v1/notes/${id}/restore`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async hardDeleteNote(id: string, payload: NoteVersionPayload): Promise<void> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/notes/${id}/hard`, {
      method: 'DELETE',
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      throw await parseHttpError(response)
    }
  }

  async listFolders(): Promise<NoteFolder[]> {
    const payload = await this.request<unknown>('/api/v1/notes/folders')
    return parseFolders(payload).sort((a, b) => a.sort_order - b.sort_order)
  }

  async createFolder(input: CreateFolderInput): Promise<NoteFolder> {
    const payload = await this.request<FolderDto>('/api/v1/notes/folders', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    return mapFolder(payload)
  }

  async updateFolder(id: string, input: UpdateFolderInput): Promise<NoteFolder> {
    const payload = await this.request<FolderDto>(`/api/v1/notes/folders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
    return mapFolder(payload)
  }

  async deleteFolder(id: string): Promise<void> {
    const response = await authorizedFetch(this.sessionStore, `/api/v1/notes/folders/${id}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      throw await parseHttpError(response)
    }
  }

  async presignAttachment(noteId: string, input: AttachmentPresignInput): Promise<AttachmentPresignResult> {
    const payload = await this.request<PresignResponseDto | { data: PresignResponseDto }>(`/api/v1/notes/${noteId}/attachments/presign`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
    const result = 'data' in payload ? payload.data : payload
    if (!result?.attachment_id || !result?.upload_url) {
      throw new HttpError('Сервер не вернул адрес загрузки изображения', 500)
    }
    return result
  }

  async uploadPhoto(noteId: string, file: File): Promise<{ note: Note; attachmentId: string }> {
    if (file.size === 0 || file.size > 15 * 1024 * 1024) {
      throw new HttpError('Выберите изображение размером до 15 МБ', 400)
    }
    // The API multipart route accepts standard browser image formats, not HEIC.
    // Preserve photo uploads from iPhones by converting them before sending.
    if (file.type === 'image/heic' || file.type === 'image/heif' || /\.hei[cf]$/i.test(file.name)) {
      try {
        const { default: heic2any } = await import('heic2any')
        const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 })
        const blob = Array.isArray(converted) ? converted[0] : converted
        file = new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' })
      } catch {
        throw new HttpError('Не удалось преобразовать HEIC. Выберите изображение JPEG или PNG', 400)
      }
      if (file.size > 15 * 1024 * 1024) {
        throw new HttpError('Изображение после преобразования превышает 15 МБ', 400)
      }
    }
    const body = new FormData()
    body.append('file', file, file.name)
    const payload = await this.request<{ note: NoteDto; attachment_id: string }>(
      `/api/v1/notes/${encodeURIComponent(noteId)}/attachments/upload`,
      { method: 'POST', body },
    )
    if (!payload.note?.id || !payload.attachment_id) {
      throw new HttpError('Некорректный ответ сервера при загрузке изображения', 500)
    }
    return { note: mapNote(payload.note), attachmentId: payload.attachment_id }
  }

  async uploadAudio(noteId: string, file: File, isRecording: boolean, duration?: number): Promise<{ note: Note; attachmentId: string }> {
    if (!file.size || file.size > 100 * 1024 * 1024 || !/\.(mp3|m4a|wav|webm|ogg|aac|flac)$/i.test(file.name)) {
      throw new HttpError('Выберите аудиофайл mp3, m4a, wav, webm, ogg, aac или flac размером до 100 МБ', 400)
    }
    const body = new FormData()
    body.append('file', file, file.name)
    body.append('is_recording', String(isRecording))
    if (duration !== undefined && Number.isFinite(duration)) body.append('duration', String(duration))
    const payload = await this.request<{ note: NoteDto; audio: { id: string } }>(`/api/v1/notes/${encodeURIComponent(noteId)}/audio`, { method: 'POST', body })
    if (!payload.note?.id || !payload.audio?.id) throw new HttpError('Сервер не вернул аудиозапись', 500)
    return { note: mapNote(payload.note), attachmentId: payload.audio.id }
  }

  async deleteAudio(noteId: string, attachmentId: string): Promise<void> {
    await this.request<unknown>(`/api/v1/notes/${encodeURIComponent(noteId)}/audio/${encodeURIComponent(attachmentId)}`, { method: 'DELETE' })
  }

  async completeAttachment(noteId: string, attachmentId: string): Promise<Note> {
    await this.request<unknown>(`/api/v1/notes/${noteId}/attachments/${attachmentId}/complete`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    // Completion can return an attachment or an empty response, not a note.
    return this.getNote(noteId)
  }

  async deleteAttachment(noteId: string, fileId: string): Promise<void> {
    const response = await authorizedFetch(
      this.sessionStore,
      `/api/v1/notes/${noteId}/attachments/${fileId}`,
      { method: 'DELETE' },
    )
    if (!response.ok) {
      throw await parseHttpError(response)
    }
  }

  async uploadAttachmentFile(uploadUrl: string, file: File, mimeType: string): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: file,
    })
    if (!response.ok) {
      throw new HttpError('Не удалось загрузить файл в хранилище', response.status)
    }
  }

  async deleteTableColumn(noteId: string, blockId: string, colIndex: number): Promise<void> {
    const paths = [
      `/api/v1/notes/${noteId}/tables/${blockId}/columns/${colIndex}`,
      `/api/v1/notes/${noteId}/table/${blockId}/columns/${colIndex}`,
    ]
    let lastError: HttpError | null = null
    for (const path of paths) {
      const response = await authorizedFetch(this.sessionStore, path, { method: 'DELETE' })
      if (response.ok) return
      lastError = await parseHttpError(response)
      if (response.status !== 404) break
    }
    if (lastError) throw lastError
  }

  async clearTableCell(noteId: string, blockId: string, rowIndex: number, colIndex: number): Promise<void> {
    const paths = [
      `/api/v1/notes/${noteId}/tables/${blockId}/cells/${rowIndex}/${colIndex}`,
      `/api/v1/notes/${noteId}/table/${blockId}/cells/${rowIndex}/${colIndex}`,
    ]
    let lastError: HttpError | null = null
    for (const path of paths) {
      const response = await authorizedFetch(this.sessionStore, path, { method: 'DELETE' })
      if (response.ok) return
      lastError = await parseHttpError(response)
      if (response.status !== 404) break
    }
    if (lastError) throw lastError
  }
}
