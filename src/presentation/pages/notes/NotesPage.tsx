/* eslint-disable */
// @ts-nocheck
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fixWebmDuration } from '@fix-webm-duration/fix'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Note, NoteFolder, NoteTagSummary } from '../../../domain/entities/Note'
import { NoteVersionConflictError } from '../../../domain/entities/Note'
import { HttpAlemAiRepository } from '../../../infrastructure/repositories/HttpAlemAiRepository'
import { HttpNoteRepository } from '../../../infrastructure/repositories/HttpNoteRepository'
import { HttpProfileRepository } from '../../../infrastructure/repositories/HttpProfileRepository'
import { HttpError } from '../../../infrastructure/http/HttpError'
import { noteTableCellHtml } from './noteTableCellHtml'
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore'
import { normalizeBackendAssetUrl } from '../../../infrastructure/http/normalizeBackendAssetUrl'
import AppToast from '../../../shared/ui/AppToast'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import AppModal from '../../../shared/ui/AppModal'
import AppButton from '../../../shared/ui/AppButton'
import {
  bid,
  buildAbsoluteNoteUrl,
  buildNotesUrl,
  docOf,
  draftKey,
  emptyDoc,
  hasRich,
  isChecklistOnly,
  isNoteNotFoundError,
  textOf,
  titleOf,
  type NoteBlock,
  type NoteDoc,
} from './noteDocumentUtils'
import NotesMeetingAiPanel from './NotesMeetingAiPanel'
import NotesListRow, { type NoteRowAction } from './NotesListRow'
import NotesEmptyState from './NotesEmptyState'
import NotesFiltersDropdown from './NotesFiltersDropdown'
import { DEFAULT_NOTE_FILTERS, loadFilteredNotes, matchesNoteFilters, noteFilterLabels, type NoteFilters } from './noteFilters'
import './notes-responsive.css'
import NoteSlashMenu, { filterSlashItems, type SlashItem } from './NoteSlashMenu'
import { Archive, Baseline, Bold, CalendarDays, ChartColumn, Check, ChevronDown, ChevronRight, CircleAlert, Clock3, Copy, Download, Ellipsis, FileText, Folder as FolderIcon, GripVertical, Heading1, History, Italic, ListChecks, LoaderCircle, Menu, Pause, Pencil, Play, Plus, Search, SlidersHorizontal, Sparkles, Square, Star, Strikethrough, Trash2, UserRound, UsersRound, Wand2 } from 'lucide-react'
import NotesVisualizationModal from './NotesVisualizationModal'
import { parseReportVisualizations, type NoteVisualization } from './noteReportParser'
import {
  getParagraphHeadingLevel,
  hasRawMarkdownSyntax,
  headingStyles,
  looksLikeMarkdown,
  normalizeMarkdownNote,
  parseMarkdownToNote,
} from './noteMarkdownParser'
import { useTranslation } from 'react-i18next'
import { nt } from './notesText'
import { formatDate } from '../../../shared/i18n'

type Mode = 'notes' | 'meeting-ai' | 'archive' | 'trash'
type Block = NoteBlock
type Doc = NoteDoc
type Folder = NoteFolder

interface LocalNoteDraft {
  noteId: string
  title: string
  doc: Doc
  baseVersion: number
  savedAt: number
}

const localDraftStorageKey = (noteId: string) => `alem_note_unsaved_draft:${noteId}`
const docForLocalDraft = (doc: Doc): Doc => {
  if (!doc.page) return doc
  const { icon: _icon, tags: _tags, ...page } = doc.page
  return { ...doc, page: Object.keys(page).length ? page : undefined }
}
const localDraftContentKey = (title: string, doc: Doc) => JSON.stringify({ title, doc: docForLocalDraft(doc) })
const readLocalNoteDraft = (noteId: string): LocalNoteDraft | null => {
  try {
    const raw = localStorage.getItem(localDraftStorageKey(noteId))
    if (!raw) return null
    const draft = JSON.parse(raw) as LocalNoteDraft
    return draft.noteId === noteId && typeof draft.title === 'string' && Array.isArray(draft.doc?.blocks) ? draft : null
  } catch { return null }
}
const writeLocalNoteDraft = (draft: LocalNoteDraft) => {
  try { localStorage.setItem(localDraftStorageKey(draft.noteId), JSON.stringify({ ...draft, doc: docForLocalDraft(draft.doc) })) } catch { /* server autosave remains the source of truth */ }
}
const clearLocalNoteDraft = (noteId: string) => {
  try { localStorage.removeItem(localDraftStorageKey(noteId)) } catch { /* ignore storage errors */ }
}

const c = {
  bg: '#F7F9FD',
  panel: '#FFFFFF',
  glass: '#FFFFFF',
  surface: '#FFFFFF',
  border: '#E3E9F3',
  borderHover: '#EAEFF8',
  text: '#0A1628',
  muted: '#8497B4',
  accent: '#0A1628',
  primary: '#0B63F6',
  brand: '#0B63F6',
  danger: '#DC2626',
  success: '#15803D',
  indigo: '#4F46E5',
}
const dateOf = (v?: string) => {
  const d = new Date(v || '')
  return Number.isNaN(d.getTime()) ? '' : formatDate(d, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
const isAudioAttachment = (attachment: Note['attachments'][number]) =>
  attachment.mime_type?.startsWith('audio/') ||
  (attachment.mime_type === 'video/webm' && (attachment.is_recording || /\.webm$/i.test(attachment.real_name)))
const withAudioBlocks = (doc: Doc, attachments: Note['attachments']): Doc => {
  const missing = (attachments ?? []).filter((attachment) => isAudioAttachment(attachment) &&
    !doc.blocks.some((block) => block.type === 'audio' && block.attachmentId === (attachment.id || attachment.file_id)))
  if (!missing.length) return doc
  const blocks = [...doc.blocks]
  const last = blocks[blocks.length - 1]
  const insertAt = last?.type === 'paragraph' && !(last.runs ?? []).some((run) => run.text.trim()) ? blocks.length - 1 : blocks.length
  blocks.splice(insertAt, 0, ...missing.map((attachment) => ({
    id: `audio_${attachment.id || attachment.file_id}`,
    type: 'audio' as const,
    attachmentId: attachment.id || attachment.file_id,
    caption: attachment.real_name,
    duration: attachment.duration,
    is_recording: attachment.is_recording,
  })))
  return { ...doc, blocks }
}
const sameMarks = (a?: string[], b?: string[]) => JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort())
const colorMark = (marks?: string[]) => (marks ?? []).find((m) => m.startsWith('color:')) ?? ''
const stripColorMarks = (marks?: string[]) => (marks ?? []).filter((m) => !m.startsWith('color:'))
const toggleMarkInRuns = (runs: { text: string; marks?: string[] }[], start: number, end: number, markName: string) => {
  const textLength = runs.reduce((sum, run) => sum + run.text.length, 0)
  const from = Math.max(0, Math.min(start, end, textLength))
  const to = Math.max(0, Math.min(Math.max(start, end), textLength))
  if (from === to) return runs
  let pos = 0
  const selected = runs.filter((run) => { const s = pos; const e = pos + run.text.length; pos = e; return e > from && s < to })
  const shouldAdd = selected.some((run) => !(run.marks ?? []).includes(markName))
  pos = 0
  const next: { text: string; marks?: string[] }[] = []
  for (const run of runs) {
    const runStart = pos
    const runEnd = pos + run.text.length
    pos = runEnd
    if (runEnd <= from || runStart >= to) { next.push(run); continue }
    const localFrom = Math.max(0, from - runStart)
    const localTo = Math.min(run.text.length, to - runStart)
    if (localFrom > 0) next.push({ text: run.text.slice(0, localFrom), marks: run.marks })
    const marks = new Set(run.marks ?? [])
    shouldAdd ? marks.add(markName) : marks.delete(markName)
    next.push({ text: run.text.slice(localFrom, localTo), marks: [...marks] })
    if (localTo < run.text.length) next.push({ text: run.text.slice(localTo), marks: run.marks })
  }
  return next.filter((run) => run.text).reduce((merged, run) => {
    const prev = merged[merged.length - 1]
    if (prev && sameMarks(prev.marks, run.marks)) prev.text += run.text
    else merged.push({ text: run.text, marks: run.marks ?? [] })
    return merged
  }, [] as { text: string; marks?: string[] }[])
}

export default function NotesPage() {
  useTranslation('notes')
  const pageRef = useRef<HTMLDivElement | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const session = useMemo(() => new LocalStorageAuthSessionStore(), [])
  const notesRepo = useMemo(() => new HttpNoteRepository(session), [session])
  const fileRef = useRef<HTMLInputElement | null>(null)
  const audioFileRef = useRef<HTMLInputElement | null>(null)
  const audioRecorderRef = useRef<MediaRecorder | null>(null)
  const audioStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioRecordedBytesRef = useRef(0)
  const audioTargetRef = useRef<string | null>(null)
  const audioTargetBlockRef = useRef<string | null>(null)
  const audioStartedAtRef = useRef(0)
  const audioRecorderGeneration = useRef(0)
  const imageTargetRef = useRef<string | null>(null)
  const folderSelectRef = useRef<HTMLDivElement | null>(null)
  const noteFolderSelectRef = useRef<HTMLDivElement | null>(null)
  const noteActionsRef = useRef<HTMLDetailsElement | null>(null)
  const isDeleting = useRef(false)
  const hydrating = useRef(false)
  const openingNoteId = useRef('')
  const openNoteRequest = useRef(0)
  const lastDeletedNoteId = useRef<string | null>(null)
  const deletedIds = useRef<Set<string>>(new Set())
  const saveTimer = useRef<number | null>(null)
  const savedDraft = useRef('')
  const selectedText = useRef<{ blockId: string; start: number; end: number } | null>(null)
  const [mode, setMode] = useState<Mode>('notes')
  const [folders, setFolders] = useState<Folder[]>([])
  const [folderId, setFolderId] = useState<string | null>(null)
  const [folderName, setFolderName] = useState('')
  const [folderColor, setFolderColor] = useState('#1687FF')
  const [query, setQuery] = useState('')
  const [q, setQ] = useState('')
  const [filters, setFilters] = useState<NoteFilters>(DEFAULT_NOTE_FILTERS)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [tagDraft, setTagDraft] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filtersButtonRef = useRef<HTMLButtonElement | null>(null)
  const activeFilterLabels = noteFilterLabels(filters)
  const listRequest = useRef(0)
  const loadingMore = useRef(false)
  const [items, setItems] = useState<Note[]>([])
  const [tagSummaries, setTagSummaries] = useState<NoteTagSummary[]>([])
  const itemsRef = useRef<Note[]>([])
  const listScrollTop = useRef(0)
  const listScrollRef = useRef<HTMLDivElement | null>(null)
  const attachListScroll = useCallback((element: HTMLDivElement | null) => {
    listScrollRef.current = element
    if (element) element.scrollTop = listScrollTop.current
  }, [])
  useEffect(() => { itemsRef.current = items }, [items])
  const [cursor, setCursor] = useState('')
  const cursorRef = useRef(cursor)
  useEffect(() => { cursorRef.current = cursor }, [cursor])
  const [note, setNote] = useState<Note | null>(null)
  const [pendingLocalDraft, setPendingLocalDraft] = useState<LocalNoteDraft | null>(null)
  const [title, setTitle] = useState('')
  const [doc, setDoc] = useState<Doc>(emptyDoc)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [uploadingAudio, setUploadingAudio] = useState(false)
  const [recordingAudio, setRecordingAudio] = useState(false)
  const [audioPendingBlockId, setAudioPendingBlockId] = useState<string | null>(null)
  const imageUploadInFlight = useRef<Promise<void> | null>(null)
  const [saveError, setSaveError] = useState('')
  const saveInFlight = useRef<Promise<boolean> | null>(null)
  const draftSnapshot = useRef({ note, title, doc, mode })
  draftSnapshot.current = { note, title, doc, mode }
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [forbiddenNoteIds, setForbiddenNoteIds] = useState<string[]>([])
  useEffect(() => {
    let active = true
    void new HttpProfileRepository(session).getMe()
      .then((profile) => { if (active && profile?.id != null) setCurrentUserId(String(profile.id)) })
      .catch(() => {})
    return () => { active = false }
  }, [session])
  const isNoteOwner = useCallback((target: Note | null | undefined) => {
    if (!target || currentUserId == null) return false
    if (forbiddenNoteIds.includes(target.id)) return false
    return target.user_id == null || String(target.user_id) === currentUserId
  }, [currentUserId, forbiddenNoteIds])
  const isForeignNote = useCallback((target: Note | null | undefined) => Boolean(target && currentUserId != null && target.user_id != null && String(target.user_id) !== currentUserId), [currentUserId])
  const sharedStorageKey = currentUserId ? `notes:shared-with-me:${currentUserId}` : ''
  const [sharedWithMe, setSharedWithMe] = useState<Array<{ id: string; title: string; updatedAt: string }>>([])
  const [sharedOpen, setSharedOpen] = useState(true)
  useEffect(() => {
    if (!sharedStorageKey) return
    try {
      const parsed = JSON.parse(localStorage.getItem(sharedStorageKey) || '[]') as unknown
      setSharedWithMe(Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.id === 'string').slice(0, 100) : [])
    } catch {
      setSharedWithMe([])
    }
  }, [sharedStorageKey])
  const rememberSharedNotes = useCallback((targets: Note[]) => {
    if (!sharedStorageKey || !targets.length) return
    setSharedWithMe((current) => {
      const next = [...current]
      let changed = false
      targets.forEach((target) => {
        const entry = { id: target.id, title: (target.title || '').trim() || nt('page.t000'), updatedAt: target.updated_at || '' }
        const index = next.findIndex((item) => item.id === target.id)
        if (index === -1) { next.unshift(entry); changed = true }
        else if (next[index].title !== entry.title || next[index].updatedAt !== entry.updatedAt) { next[index] = entry; changed = true }
      })
      if (!changed) return current
      const limited = next.slice(0, 100)
      try { localStorage.setItem(sharedStorageKey, JSON.stringify(limited)) } catch { /* ignore */ }
      return limited
    })
  }, [sharedStorageKey])
  const [sharedServerNotes, setSharedServerNotes] = useState<Note[]>([])
  const [sharedCursor, setSharedCursor] = useState('')
  const [sharedLoading, setSharedLoading] = useState(false)
  const sharedRequestRef = useRef(0)
  const loadSharedNotes = useCallback(async (reset: boolean, cursorValue = '') => {
    if (currentUserId == null) return
    const requestId = reset ? ++sharedRequestRef.current : sharedRequestRef.current
    setSharedLoading(true)
    try {
      const page = await notesRepo.listNotes({ scope: 'shared', limit: 30, q: q.trim() || undefined, cursor: reset ? undefined : cursorValue })
      if (requestId !== sharedRequestRef.current) return
      const foreign = page.items.filter((item) => item.user_id != null && String(item.user_id) !== currentUserId)
      setSharedServerNotes((current) => reset ? foreign : [...current, ...foreign.filter((item) => !current.some((existing) => existing.id === item.id))])
      setSharedCursor(page.nextCursor ?? '')
    } catch {
      if (requestId === sharedRequestRef.current && reset) { setSharedServerNotes([]); setSharedCursor('') }
    } finally {
      if (requestId === sharedRequestRef.current) setSharedLoading(false)
    }
  }, [currentUserId, notesRepo, q])
  useEffect(() => { void loadSharedNotes(true) }, [loadSharedNotes])
  const sharedList = useMemo(() => {
    const fromServer = sharedServerNotes.map((item) => ({ id: item.id, title: (item.title || '').trim() || nt('page.t000'), local: false }))
    const query = q.trim().toLocaleLowerCase()
    const localOnly = sharedWithMe
      .filter((item) => !sharedServerNotes.some((serverItem) => serverItem.id === item.id))
      .filter((item) => !query || item.title.toLocaleLowerCase().includes(query))
      .map((item) => ({ id: item.id, title: item.title, local: true }))
    return [...fromServer, ...localOnly]
  }, [q, sharedServerNotes, sharedWithMe])
  const forgetSharedNote = useCallback((id: string) => {
    if (!sharedStorageKey) return
    setSharedWithMe((current) => {
      const next = current.filter((item) => item.id !== id)
      try { localStorage.setItem(sharedStorageKey, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }, [sharedStorageKey])
  const canEdit = isNoteOwner(note)
  const editable = mode === 'notes' && canEdit
  const canEditRef = useRef(canEdit)
  canEditRef.current = canEdit
  const [isActionPending, setIsActionPending] = useState(false)
  const [err, setErr] = useState('')
  const [folderMenu, setFolderMenu] = useState<{ folder: Folder; x: number; y: number } | null>(null)
  const [folderSelectOpen, setFolderSelectOpen] = useState(false)
  const [noteFolderSelectOpen, setNoteFolderSelectOpen] = useState(false)
  const [createFolderModal, setCreateFolderModal] = useState(false)
  const [renameFolderModal, setRenameFolderModal] = useState<Folder | null>(null)
  const [renameFolderName, setRenameFolderName] = useState('')
  const [activeMarks, setActiveMarks] = useState<string[]>([])
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [shareToast, setShareToast] = useState<{ message: string; variant: 'success' | 'error' | 'info' } | null>(null)
  const showError = useCallback((msg: string) => setShareToast({ message: msg, variant: 'error' }), [])
  const showSuccess = useCallback((msg: string) => setShareToast({ message: msg, variant: 'success' }), [])
  const [isMobile, setIsMobile] = useState(false)
  const [view, setView] = useState<'folders' | 'list' | 'note'>('list')
  const [editorExpanded, setEditorExpanded] = useState(true)
  const [showListHint, setShowListHint] = useState(true)
  const showEditor = mode === 'meeting-ai' || view === 'note'
  const showList = mode !== 'meeting-ai' && (!showEditor || (!isMobile && !editorExpanded))
  const [tablePicker, setTablePicker] = useState<{ x: number, y: number } | null>(null)
  const [isProofreading, setIsProofreading] = useState(false)
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [aiSelection, setAiSelection] = useState<{ blockId: string; start: number; end: number; originalText: string } | null>(null)
  const [aiResult, setAiResult] = useState<{ type: 'proofread' | 'summarize', data: any } | null>(null)
  const [visualizations, setVisualizations] = useState<NoteVisualization[] | null>(null)
  const alemAiRepository = useMemo(() => new HttpAlemAiRepository(session), [session])
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const requestedNoteId = searchParams.get('noteId')?.trim() || ''
  const wordCount = useMemo(() => textOf(doc).trim().split(/\s+/u).filter((word) => /[\p{L}\p{N}]/u.test(word)).length, [doc])

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (noteActionsRef.current && !noteActionsRef.current.contains(event.target as Node)) noteActionsRef.current.open = false
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  useEffect(() => {
    if (!folderSelectOpen && !noteFolderSelectOpen) return
    const close = (event: MouseEvent) => {
      if (!folderSelectRef.current?.contains(event.target as Node)) setFolderSelectOpen(false)
      if (!noteFolderSelectRef.current?.contains(event.target as Node)) setNoteFolderSelectOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [folderSelectOpen, noteFolderSelectOpen])


  const syncNotesUrl = useCallback((noteId?: string) => {
    const nextUrl = buildNotesUrl(noteId)
    const currentUrl = `${location.pathname}${location.search}`

    if (currentUrl !== nextUrl) {
      navigate(nextUrl, { replace: true })
    }
  }, [location.pathname, location.search, navigate])
  const upsert = (n: Note) => setItems((prev) => (prev.some((x) => x.id === n.id) ? prev.map((x) => x.id === n.id ? n : x) : [n, ...prev]).sort((a, b) => Number(Boolean(b.is_pinned)) - Number(Boolean(a.is_pinned)) || new Date(b.updated_at || '').getTime() - new Date(a.updated_at || '').getTime()))
  const loadFolders = useCallback(async () => {
    try {
      setFolders(await notesRepo.listFolders())
    } catch (e) {
      setErr(e instanceof Error ? e.message : nt('page.t001'))
    }
  }, [notesRepo])

  const loadNotes = useCallback(async (reset = true) => {
    if (!reset && loadingMore.current) return
    const requestId = ++listRequest.current
    const isCurrent = () => listRequest.current === requestId
    if (mode === 'meeting-ai') { setLoading(false); return }
    loadingMore.current = !reset
    setLoading(true)
    setErr('')
    try {
      const result = await loadFilteredNotes((params) => notesRepo.listNotes({ ...params, scope: 'owned' }), {
        limit: 20,
        isDeleted: mode === 'trash',
        isArchived: mode === 'archive',
        folderId: folderId || undefined,
        q: q.trim() || undefined,
        cursor: !reset && cursorRef.current ? cursorRef.current : undefined,
        tag: tagFilter || undefined,
      }, filters, isCurrent, (item) => !tagFilter || (docOf(item).page?.tags ?? []).some((tag) => tag.toLocaleLowerCase() === tagFilter.toLocaleLowerCase()), Boolean(tagFilter))
      if (!result || !isCurrent()) return
      setItems((old) => (reset ? result.items : [...old, ...result.items.filter((item) => !old.some((existing) => existing.id === item.id))]))
      setCursor(result.nextCursor ?? '')
    } catch (e) {
      if (isCurrent()) setErr(e instanceof Error ? e.message : nt('page.t002'))
    } finally {
      if (isCurrent()) { setLoading(false); loadingMore.current = false }
    }
  }, [folderId, mode, notesRepo, q, filters, tagFilter])

  const loadNoteContent = useCallback((sourceNote: Note) => {
    if (noteActionsRef.current) noteActionsRef.current.open = false
    const initialDoc = docOf(sourceNote)
    const normalized = normalizeMarkdownNote(initialDoc, sourceNote.title || '')
    const localDraft = readLocalNoteDraft(sourceNote.id)
    if (localDraft && localDraftContentKey(localDraft.title, localDraft.doc) !== localDraftContentKey(normalized.title, normalized.doc)) {
      setPendingLocalDraft(localDraft)
    } else {
      if (localDraft) clearLocalNoteDraft(sourceNote.id)
      setPendingLocalDraft(null)
    }
    normalized.doc = withAudioBlocks(normalized.doc, sourceNote.attachments)
    hydrating.current = true
    savedDraft.current = draftKey(normalized.title, normalized.doc)
    draftSnapshot.current = { ...draftSnapshot.current, note: sourceNote, title: normalized.title, doc: normalized.doc }
    setSaveError('')
    setTagDraft('')
    audioTargetBlockRef.current = null
    setAudioPendingBlockId(null)
    setNote(sourceNote)
    setTitle(normalized.title)
    setDoc(normalized.doc)
    window.setTimeout(() => {
      hydrating.current = false
    }, 0)
  }, [])

  const flushNote = useCallback(async (): Promise<boolean> => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    if (imageUploadInFlight.current) await imageUploadInFlight.current
    while (saveInFlight.current) {
      if (!await saveInFlight.current) return false
    }
    const snapshot = draftSnapshot.current
    const currentDraft = draftKey(snapshot.title, snapshot.doc)
    if (!snapshot.note || snapshot.mode !== 'notes' || !canEditRef.current) return true
    if (currentDraft === savedDraft.current) { setSaveError(''); return true }
    const checklist = isChecklistOnly(snapshot.doc)
    setSaving(true)
    setSaveError('')
    const pending = (async () => {
      try {
        const updated = await notesRepo.updateNote(snapshot.note.id, {
          version: snapshot.note.version,
          title: snapshot.title,
          content: checklist ? '' : textOf(snapshot.doc),
          content_doc: checklist && !snapshot.doc.page ? null : snapshot.doc,
          type: snapshot.note.type === 'audio' ? 'audio' : checklist ? 'checklist' : hasRich(snapshot.doc) ? 'rich' : 'text',
          checklist_items: checklist ? snapshot.doc.blocks[0].items : [],
        })
        if (draftSnapshot.current.note?.id === updated.id) {
          savedDraft.current = currentDraft
          draftSnapshot.current = { ...draftSnapshot.current, note: updated }
          setNote(updated)
        }
        upsert(updated)
        const pendingLocalDraft = readLocalNoteDraft(updated.id)
        if (pendingLocalDraft && localDraftContentKey(pendingLocalDraft.title, pendingLocalDraft.doc) === localDraftContentKey(snapshot.title, snapshot.doc)) {
          clearLocalNoteDraft(updated.id)
        } else if (pendingLocalDraft) {
          writeLocalNoteDraft({ ...pendingLocalDraft, baseVersion: updated.version, savedAt: Date.now() })
        }
        if (JSON.stringify(snapshot.note.tags ?? snapshot.note.content_doc?.page?.tags ?? []) !== JSON.stringify(snapshot.doc.page?.tags ?? [])) {
          void notesRepo.listTags().then(setTagSummaries).catch(() => {})
        }
        return true
      } catch (error) {
        if (error instanceof HttpError && error.status === 403) {
          const forbiddenId = snapshot.note.id
          canEditRef.current = false
          setForbiddenNoteIds((ids) => ids.includes(forbiddenId) ? ids : [...ids, forbiddenId])
          clearLocalNoteDraft(forbiddenId)
          setSaveError('')
          showError(nt('page.t003'))
          try {
            const fresh = await notesRepo.getNote(forbiddenId)
            if (draftSnapshot.current.note?.id === forbiddenId) loadNoteContent(fresh)
          } catch {
            savedDraft.current = currentDraft
          }
          return true
        }
        const message = error instanceof NoteVersionConflictError
          ? nt('page.t004')
          : nt('page.t005')
        setSaveError(message)
        showError(message)
        return false
      } finally {
        setSaving(false)
        saveInFlight.current = null
      }
    })()
    saveInFlight.current = pending
    if (!await pending) return false
    // Include edits entered while the previous save request was in flight.
    return flushNote()
  }, [notesRepo, showError])

  const closeEditor = async () => {
    if (!await flushNote()) return
    openNoteRequest.current += 1
    openingNoteId.current = ''
    setIsActionPending(false)
    setView('list')
    setEditorExpanded(true)
    setNoteFolderSelectOpen(false)
    syncNotesUrl()
    if (note) window.requestAnimationFrame(() => pageRef.current?.querySelector<HTMLButtonElement>(`[data-note-id="${CSS.escape(note.id)}"]`)?.focus({ preventScroll: true }))
  }

  const openNote = useCallback(async (id: string) => {
    if (id && deletedIds.current.has(id)) {
      if (requestedNoteId === id) syncNotesUrl()
      return
    }

    if (isActionPending || openingNoteId.current === id) return
    if (note?.id === id) { setView('note'); syncNotesUrl(id); return }

    setIsActionPending(true)
    if (!await flushNote()) { setIsActionPending(false); return }

    const requestId = openNoteRequest.current + 1
    openNoteRequest.current = requestId
    openingNoteId.current = id
    setIsActionPending(true)
    syncNotesUrl(id)
    setView('note')

    try {
      const cachedNote = itemsRef.current.find((item) => item.id === id)
      if (!cachedNote) setNote(null)
      if (cachedNote && note?.id !== id) {
        loadNoteContent(cachedNote)
      }

      if (mode === 'trash' && cachedNote) {
        loadNoteContent(cachedNote)
        return
      }

      const n = await notesRepo.getNote(id)
      if (openNoteRequest.current !== requestId) return

      loadNoteContent(n)
      setMode(n.is_deleted ? 'trash' : n.is_archived ? 'archive' : 'notes')
      setErr('') // Clear error on success
      if (n.id && n.id !== id) syncNotesUrl(n.id)
      window.setTimeout(() => { hydrating.current = false }, 0)
    } catch (e) {
      if (openNoteRequest.current === requestId) {
        const errorMsg = e instanceof Error ? e.message : nt('page.t006')
        showError(errorMsg)
        
        // If the note is not found, clear the URL and current note state to prevent infinite loops
        if (isNoteNotFoundError(e)) {
          deletedIds.current.add(id)
          setItems((old) => old.filter((item) => item.id !== id))
          setNote(null)
          setView('list')
          syncNotesUrl()
        }
      }
    } finally {
      if (openNoteRequest.current === requestId) {
        openingNoteId.current = ''
        setIsActionPending(false)
      }
    }
  }, [loadNoteContent, mode, note?.id, notesRepo, syncNotesUrl, isActionPending, flushNote])

  const changeMode = async (nextMode: Mode) => {
    if (isActionPending && !openingNoteId.current) return
    if (!await flushNote()) return
    // Ignore an in-flight note response after leaving its section.
    if (openingNoteId.current) {
      openNoteRequest.current += 1
      openingNoteId.current = ''
      setIsActionPending(false)
    }
    setMode(nextMode)
    setNote(null)
    setView('list')
    setEditorExpanded(true)
    setFolderSelectOpen(false)
    setNoteFolderSelectOpen(false)
    setFiltersOpen(false)
    syncNotesUrl()
  }

  useEffect(() => {
    const page = pageRef.current
    if (!page) return
    const observer = new ResizeObserver(([entry]) => {
      setIsMobile(entry.contentRect.width < 850)
    })
    observer.observe(page)
    return () => observer.disconnect()
  }, [])

  useEffect(() => { const t = window.setTimeout(() => setQ(query), 450); return () => window.clearTimeout(t) }, [query])
  useEffect(() => { void loadFolders() }, [loadFolders])
  useEffect(() => { 
    setCursor(''); 
    listScrollTop.current = 0
    if (listScrollRef.current) listScrollRef.current.scrollTop = 0
    deletedIds.current.clear();
    lastDeletedNoteId.current = null;
    setItems([]);
    void loadNotes(true)
    return () => { listRequest.current += 1; loadingMore.current = false }
  }, [mode, folderId, q, loadNotes])
  useEffect(() => {
    if (!requestedNoteId || note?.id === requestedNoteId) return
    if (openingNoteId.current || isDeleting.current || requestedNoteId === lastDeletedNoteId.current || deletedIds.current.has(requestedNoteId)) return
    void openNote(requestedNoteId)
  // Only URL selection changes should reopen the editor. Background refreshes
  // and clearing a selection while switching tabs must not navigate back to it.
  }, [requestedNoteId])
  useEffect(() => {
    const close = () => setFolderMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', close)
    }
  }, [])
  useEffect(() => {
    if (!note || hydrating.current || !editable) return
    const currentDraft = draftKey(title, doc)
    if (currentDraft === savedDraft.current) {
      setSaveError('')
      clearLocalNoteDraft(note.id)
      return
    }
    writeLocalNoteDraft({ noteId: note.id, title, doc, baseVersion: note.version, savedAt: Date.now() })
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => { void flushNote() }, 700)
    return () => saveTimer.current && window.clearTimeout(saveTimer.current)
  }, [doc, editable, note, flushNote, title])

  const restoreLocalDraft = () => {
    if (!pendingLocalDraft || pendingLocalDraft.noteId !== note?.id) return
    const serverPage = doc.page ?? {}
    setTitle(pendingLocalDraft.title)
    setDoc({
      ...pendingLocalDraft.doc,
      page: { ...pendingLocalDraft.doc.page, icon: serverPage.icon, tags: serverPage.tags },
    })
    setPendingLocalDraft(null)
  }

  const discardLocalDraft = () => {
    if (pendingLocalDraft) clearLocalNoteDraft(pendingLocalDraft.noteId)
    setPendingLocalDraft(null)
  }

  const titleRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (note && titleRef.current) {
      const t = titleRef.current
      t.style.height = 'auto'
      t.style.height = `${t.scrollHeight}px`
    }
  }, [note, title])

  const createNote = async (folderOverride?: string | null) => {
    if (isActionPending) return
    setIsActionPending(true)
    if (!await flushNote()) { setIsActionPending(false); return }
    try {
      const n = await notesRepo.createNote({
        folder_id: folderOverride !== undefined ? folderOverride : folderId,
        title: '',
        content: '',
        content_doc: emptyDoc(),
        type: 'text',
        checklist_items: [],
      })
      upsert(n)
      loadNoteContent(n)
      setMode('notes')
      setView('note')
      setEditorExpanded(true)
      setSidebarOpen(false)
      syncNotesUrl(n.id)
      setIsActionPending(false)
      window.requestAnimationFrame(() => titleRef.current?.focus())
    } catch (e) {
      showError(e instanceof Error ? e.message : nt('page.t007'))
      setIsActionPending(false)
    }
  }
  const createFolder = async () => {
    if (!folderName.trim()) return
    try {
      await notesRepo.createFolder({ name: folderName.trim(), sort_order: folders.length, color: folderColor })
      setFolderName('')
      setFolderColor('#1687FF')
      setCreateFolderModal(false)
      await loadFolders()
      showSuccess(nt('page.t008'))
    } catch (e) {
      showError(e instanceof Error ? e.message : nt('page.t009'))
    }
  }
  const openRenameFolderModal = (folder: Folder) => {
    setRenameFolderModal(folder)
    setRenameFolderName(folder.name)
  }
  const renameFolder = async () => {
    if (!renameFolderModal) return
    const folder = renameFolderModal
    const name = renameFolderName.trim()
    if (!name || name === folder.name) return
    await notesRepo.updateFolder(folder.id, { name })
    setRenameFolderModal(null)
    setRenameFolderName('')
    await loadFolders()
  }
  const deleteFolder = async (folder: Folder) => {
    if (!window.confirm(nt('page.deleteFolderConfirm', { name: folder.name }))) return
    await notesRepo.deleteFolder(folder.id)
    if (folderId === folder.id) setFolderId(null)
    if (note?.folder_id === folder.id) setNote({ ...note, folder_id: null })
    await loadFolders()
  }
  const openFolderMenu = (event: React.MouseEvent, folder: Folder) => {
    event.preventDefault()
    event.stopPropagation()
    setFolderMenu({ folder, x: event.clientX, y: event.clientY })
  }
  const handleRowAction = async (action: NoteRowAction, target: Note, destination?: string | null) => {
    if (isActionPending) return
    if (!isNoteOwner(target)) { showError(nt('page.t003')); return }
    setIsActionPending(true)
    try {
      if (!await flushNote()) return
      const current = target.is_deleted ? target : await notesRepo.getNote(target.id)
      let next: Note | null = null
      if (action === 'pin') next = await (current.is_pinned ? notesRepo.unpinNote(current.id, { version: current.version }) : notesRepo.pinNote(current.id, { version: current.version }))
      if (action === 'move') next = await notesRepo.moveNote(current.id, { version: current.version, folder_id: destination ?? null })
      if (action === 'archive') next = await notesRepo.updateNote(current.id, { version: current.version, is_archived: !current.is_archived })
      if (action === 'delete') await notesRepo.deleteNote(current.id, { version: current.version })
      if (action === 'restore') await notesRepo.restoreNote(current.id, { version: current.version })
      const leavesList = action === 'delete' || action === 'restore' || action === 'archive' || (action === 'move' && folderId && destination !== folderId)
      if (leavesList) {
        setItems((old) => old.filter((item) => item.id !== current.id))
        if (note?.id === current.id) { setView('list'); setNote(null); syncNotesUrl() }
      } else if (next) {
        upsert(next)
        if (note?.id === next.id) { draftSnapshot.current = { ...draftSnapshot.current, note: next }; setNote(next) }
      }
      showSuccess(action === 'delete' ? nt('page.t010') : action === 'restore' ? nt('page.t011') : action === 'move' ? nt('page.t012') : action === 'archive' ? (current.is_archived ? nt('page.t013') : nt('page.t014')) : (current.is_pinned ? nt('page.t015') : nt('page.t016')))
    } catch (error) { showError(error instanceof Error ? error.message : nt('page.t017')) }
    finally { setIsActionPending(false) }
  }
  const pin = async (n = note) => { if (n) await handleRowAction('pin', n) }
  const move = async (destination: string | null) => { if (note) await handleRowAction('move', note, destination) }
  const del = async (n = note) => { if (n) await handleRowAction('delete', n) }
  const restore = async () => { if (note) await handleRowAction('restore', note) }
  const unarchive = async () => { if (note) await handleRowAction('archive', note) }
  const archiveNote = async () => { if (note) await handleRowAction('archive', note) }
  const hardDelete = async () => { 
    if (!note || isActionPending) return; 
    if (!window.confirm(nt('page.t018'))) return
    console.log('Starting hard delete for note:', note.id);
    isDeleting.current = true;
    setIsActionPending(true)
    const noteId = note.id;
    deletedIds.current.add(noteId);
    try {
      await notesRepo.hardDeleteNote(noteId, { version: note.version }) 
      clearLocalNoteDraft(noteId)
      setItems((old) => old.filter((x) => x.id !== noteId)); 
      setNote(null); 
      setView('list');
      syncNotesUrl() 
      showSuccess(nt('page.t019'))
    } catch (e) {
      if (isNoteNotFoundError(e)) {
        clearLocalNoteDraft(noteId)
        setItems((old) => old.filter((x) => x.id !== noteId))
        setNote(null)
        syncNotesUrl()
      } else {
        showError(nt('page.t020'))
        deletedIds.current.delete(noteId)
        console.error('Hard delete error:', e);
      }
    } finally {
      isDeleting.current = false;
      setIsActionPending(false)
    }
  }
  const copyShareText = async (value: string) => {
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
    if (!copied) throw new Error(nt('page.t021'))
  }
  const shareNote = async () => {
    if (!note || !canEditRef.current) return

    const shareTitle = titleOf({ ...note, title, content_doc: doc })
    const shareUrl = buildAbsoluteNoteUrl(note.id)

    try {
      if (navigator.share) {
        await navigator.share({ title: shareTitle, url: shareUrl })
        return
      }

      await copyShareText(shareUrl)
      setShareToast({ message: nt('page.t022'), variant: 'success' })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      try {
        await copyShareText(shareUrl)
        setShareToast({ message: nt('page.t022'), variant: 'success' })
      } catch {
        setShareToast({ message: nt('page.t023'), variant: 'error' })
      }
    }
  }

  const patchBlock = (id: string, next: Block) => setDoc((d) => ({ ...d, blocks: d.blocks.map((b) => b.id === id ? next : b) }))
  const removeBlock = (id: string) => setDoc((d) => {
    const nextBlocks = d.blocks.filter((b) => b.id !== id)
    if (nextBlocks.length === 0) {
      return { ...d, blocks: [{ id: bid('p'), type: 'paragraph', runs: [{ text: '' }] }] }
    }
    return { ...d, blocks: nextBlocks }
  })
  const addBlock = (b: Block) => { setDoc((d) => ({ ...d, blocks: [...d.blocks, b] })); setActiveMarks([]) }
  const insertBlockAfter = (afterId: string, b: Block) => {
    setDoc((d) => {
      const idx = d.blocks.findIndex((x) => x.id === afterId)
      if (idx < 0) return { ...d, blocks: [...d.blocks, b] }
      const blocks = [...d.blocks]
      blocks.splice(idx + 1, 0, b)
      return { ...d, blocks }
    })
    setActiveMarks([])
  }
  const mark = (m: string) => {
    const command = m === 'bold' ? 'bold' : m === 'italic' ? 'italic' : 'strikeThrough'
    document.execCommand(command, false)
    setActiveMarks((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m])
    // Синхронизация произойдет через onInput
  }
  const setTextColor = (color: string) => {
    document.execCommand('foreColor', false, color)
    setActiveMarks((prev) => [...stripColorMarks(prev), `color:${color}`])
  }
  const upload = async (file: File) => {
    if (!note || imageUploadInFlight.current || !canEditRef.current) return
    const noteId = note.id
    const target = imageTargetRef.current
    imageTargetRef.current = null
    if (!await flushNote()) return
    if (draftSnapshot.current.note?.id !== noteId) return
    setUploadingImage(true)
    let finishUpload!: () => void
    imageUploadInFlight.current = new Promise<void>((resolve) => { finishUpload = resolve })
    try {
      const { note: n, attachmentId } = await notesRepo.uploadPhoto(noteId, file)
      upsert(n)
      if (draftSnapshot.current.note?.id !== noteId) return
      draftSnapshot.current = { ...draftSnapshot.current, note: n }
      setNote(n)
      const imageBlock = { id: bid('img'), type: 'image' as const, attachmentId, alt: file.name }
      // Вставляем картинку на место пустого блока, из которого её вызвали (или сразу после него).
      setDoc((d) => {
        const idx = target ? d.blocks.findIndex((b) => b.id === target) : -1
        if (idx < 0) return { ...d, blocks: [...d.blocks, imageBlock] }
        const blocks = [...d.blocks]
        const current = blocks[idx]
        const isEmpty = current.type === 'paragraph' && !(current.runs ?? []).some((run) => run.text.trim())
        blocks.splice(isEmpty ? idx : idx + 1, isEmpty ? 1 : 0, imageBlock)
        return { ...d, blocks }
      })
      setActiveMarks([])
    } catch (e) {
      const message = e instanceof Error && e.message ? nt('page.imageUploadError', { message: e.message }) : nt('page.t026')
      setErr(message)
      showError(message)
    } finally {
      imageUploadInFlight.current = null
      finishUpload()
      setUploadingImage(false)
    }
  }

  const uploadAudioFile = async (file: File, isRecording = false, duration?: number, targetNoteId = note?.id) => {
    if (!targetNoteId || uploadingAudio || !canEditRef.current) return
    const targetBlockId = audioTargetBlockRef.current
    if (!await flushNote()) return
    setUploadingAudio(true)
    try {
      const { note: updated, attachmentId } = await notesRepo.uploadAudio(targetNoteId, file, isRecording, duration)
      upsert(updated)
      if (draftSnapshot.current.note?.id === targetNoteId) {
        draftSnapshot.current = { ...draftSnapshot.current, note: updated }
        setNote(updated)
        setDoc((current) => {
          if (current.blocks.some((block) => block.type === 'audio' && block.attachmentId === attachmentId)) return current
          const audioBlock = { id: bid('audio'), type: 'audio' as const, attachmentId, caption: file.name, duration, is_recording: isRecording }
          const blocks = [...current.blocks]
          const index = targetBlockId ? blocks.findIndex((block) => block.id === targetBlockId) : -1
          if (index < 0) blocks.push(audioBlock)
          else {
            const currentBlock = blocks[index]
            const isEmpty = currentBlock.type === 'paragraph' && !(currentBlock.runs ?? []).some((run) => run.text.trim())
            blocks.splice(isEmpty ? index : index + 1, isEmpty ? 1 : 0, audioBlock)
          }
          if (blocks[blocks.length - 1]?.type !== 'paragraph') blocks.push({ id: bid('p'), type: 'paragraph', runs: [{ text: '' }] })
          return { ...current, blocks }
        })
      }
      showSuccess(nt('page.t027'))
    } catch (error) {
      showError(error instanceof Error ? error.message : nt('page.t028'))
    } finally {
      setUploadingAudio(false)
      audioTargetBlockRef.current = null
      setAudioPendingBlockId(null)
    }
  }

  const startAudioRecording = async () => {
    if (!note || recordingAudio || uploadingAudio) return
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { showError(nt('page.t029')); return }
    const generation = audioRecorderGeneration.current
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (generation !== audioRecorderGeneration.current) { stream.getTracks().forEach((track) => track.stop()); return }
      audioStreamRef.current = stream
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      audioRecorderRef.current = recorder
      audioTargetRef.current = note.id
      audioChunksRef.current = []
      audioRecordedBytesRef.current = 0
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return
        audioChunksRef.current.push(event.data)
        audioRecordedBytesRef.current += event.data.size
        if (audioRecordedBytesRef.current > 100 * 1024 * 1024 && recorder.state === 'recording') recorder.stop()
      }
      recorder.onstop = async () => {
        const durationMs = Math.max(1, Date.now() - audioStartedAtRef.current)
        const targetNoteId = audioTargetRef.current ?? undefined
        stream.getTracks().forEach((track) => track.stop())
        audioStreamRef.current = null
        audioRecorderRef.current = null
        setRecordingAudio(false)
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType })
        audioChunksRef.current = []
        if (!blob.size) { showError(nt('page.t030')); return }
        if (blob.size > 100 * 1024 * 1024) { showError(nt('page.t031')); return }
        const extension = recorder.mimeType.includes('mp4') ? 'm4a' : recorder.mimeType.includes('ogg') ? 'ogg' : 'webm'
        try {
          const playableBlob = extension === 'webm'
            ? await fixWebmDuration(blob, durationMs, { logger: false })
            : blob
          const file = new File([playableBlob], `recording-${Date.now()}.${extension}`, { type: blob.type })
          await uploadAudioFile(file, true, durationMs / 1000, targetNoteId)
        } catch {
          showError(nt('page.t032'))
        }
      }
      audioStartedAtRef.current = Date.now()
      recorder.start(1000)
      setRecordingAudio(true)
    } catch {
      audioStreamRef.current?.getTracks().forEach((track) => track.stop())
      audioStreamRef.current = null
      audioTargetBlockRef.current = null
      setAudioPendingBlockId(null)
      showError(nt('page.t033'))
    }
  }

  useEffect(() => () => {
    audioRecorderGeneration.current += 1
    const recorder = audioRecorderRef.current
    if (recorder) {
      recorder.onstop = null
      if (recorder.state !== 'inactive') recorder.stop()
    }
    audioStreamRef.current?.getTracks().forEach((track) => track.stop())
    audioRecorderRef.current = null
    audioStreamRef.current = null
  }, [note?.id])

  const handleAiProofread = async () => {
    if (!note || isProofreading) return
    
    const sel = selectedText.current
    if (!sel || sel.start === sel.end) {
      setErr(nt('page.t034'))
      return
    }

    const block = doc.blocks.find(b => b.id === sel.blockId)
    if (!block || block.type !== 'paragraph') {
      setErr(nt('page.t035'))
      return
    }

    const fullText = block.runs.map(r => r.text).join('')
    const content = fullText.slice(sel.start, sel.end)

    if (!content.trim()) {
      setErr(nt('page.t036'))
      return
    }
    
    setIsProofreading(true)
    setAiSelection({ ...sel, originalText: content })
    try {
      const res = await alemAiRepository.proofreadNote({ content })
      setAiResult({ type: 'proofread', data: res })
    } catch (e) {
      setErr(e instanceof Error ? e.message : nt('page.t037'))
    } finally {
      setIsProofreading(false)
    }
  }

  const handleAiSummarize = async () => {
    if (!note || isSummarizing) return
    setIsSummarizing(true)
    try {
      const content = textOf(doc)
      if (!content.trim()) return
      const res = await alemAiRepository.summarizeNote({ content })
      setAiResult({ type: 'summarize', data: res })
    } catch (e) {
      setErr(e instanceof Error ? e.message : nt('page.t037'))
    } finally {
      setIsSummarizing(false)
    }
  }

  const handleVisualizeReport = () => {
    const content = textOf(doc)
    if (!content.trim()) {
      setErr(nt('page.t038'))
      return
    }
    const parsed = parseReportVisualizations(content)
    if (parsed.length === 0) {
      setErr(nt('page.t039'))
      return
    }
    setVisualizations(parsed)
  }

  const insertVisualizationTables = () => {
    if (!visualizations?.length) return
    const tables = visualizations.filter((item) => item.kind === 'table')
    if (tables.length === 0) return
    tables.forEach((table) => {
      addBlock({
        id: bid('t'),
        type: 'table',
        rows: [table.columns.map((column) => ({ text: column })), ...table.rows.map((row) => row.map((cell) => ({ text: cell })))],
      })
    })
    setVisualizations(null)
    showSuccess(nt('page.t040'))
  }

  const applyMarkdownFromDoc = useCallback((sourceDoc: Doc, sourceTitle = title) => {
    const normalized = normalizeMarkdownNote(sourceDoc, sourceTitle)
    if (!normalized.changed) return false
    setTitle(normalized.title)
    setDoc(normalized.doc)
    savedDraft.current = draftKey(normalized.title, normalized.doc)
    return true
  }, [title])

  const applyMarkdownContent = useCallback((markdown: string, replaceBlockId?: string) => {
    if (replaceBlockId) {
      setDoc((current) => {
        const index = current.blocks.findIndex((block) => block.id === replaceBlockId)
        if (index < 0) return current
        const merged = [...current.blocks]
        const before = merged.slice(0, index).map((block) =>
          block.type === 'paragraph' ? (block.runs ?? []).map((run) => run.text).join('') : '',
        ).filter(Boolean).join('\n')
        const after = merged.slice(index + 1).map((block) =>
          block.type === 'paragraph' ? (block.runs ?? []).map((run) => run.text).join('') : '',
        ).filter(Boolean).join('\n')
        const combined = [before, markdown, after].filter(Boolean).join('\n')
        const parsed = parseMarkdownToNote(combined)
        if (parsed.title) setTitle(parsed.title)
        const nextBlocks = [...merged.slice(0, index), ...parsed.blocks, ...merged.slice(index + 1)]
        return { ...current, blocks: nextBlocks.length ? nextBlocks : emptyDoc().blocks }
      })
      return
    }

    const parsed = parseMarkdownToNote(markdown)
    if (parsed.title) setTitle(parsed.title)
    setDoc((current) => ({ ...current, blocks: parsed.blocks }))
  }, [])

  const handleFormatMarkdown = () => {
    const changed = applyMarkdownFromDoc(doc, title)
    if (!changed) {
      setErr(nt('page.t041'))
      return
    }
    showSuccess(nt('page.t042'))
  }

  useEffect(() => {
    if (!note?.id || hydrating.current || !editable) return
    if (!hasRawMarkdownSyntax(doc)) return
    applyMarkdownFromDoc(doc, title)
  }, [applyMarkdownFromDoc, doc, editable, note?.id, title])

  const handleMeetingNoteCreated = useCallback((created: Note) => {
    upsert(created)
    setMode('notes')
    loadNoteContent(created)
    setView('note')
    syncNotesUrl(created.id)
  }, [loadNoteContent, syncNotesUrl])

  const applyAiResult = () => {
    if (!aiResult || aiResult.type !== 'proofread') return
    const correctedText = aiResult.data.corrected_text
    if (!correctedText) return
    
    if (aiSelection) {
      const { blockId, start, end } = aiSelection
      const block = doc.blocks.find(b => b.id === blockId)
      if (block && block.type === 'paragraph') {
        const fullText = block.runs.map(r => r.text).join('')
        const before = fullText.slice(0, start)
        const after = fullText.slice(end)
        const newFullText = before + correctedText + after
        
        patchBlock(blockId, { 
          ...block, 
          runs: [{ text: newFullText }]
        })
      }
    } else {
      setDoc({
        ...doc,
        type: 'doc',
        version: doc.version,
        blocks: correctedText.split('\n').map((line, i) => ({
          id: bid('p'),
          type: 'paragraph',
          runs: [{ text: line }]
        }))
      })
    }
    setAiResult(null)
    setAiSelection(null)
  }

  // ---- UI: боковая панель, дерево страниц, слэш-меню, перетаскивание блоков ----
  const searchRef = useRef<HTMLInputElement | null>(null)
  const slashMenuRef = useRef<HTMLDivElement | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [treeNotes, setTreeNotes] = useState<Note[]>([])
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({})
  const [focusBlockId, setFocusBlockId] = useState<string | null>(null)
  const [focusAtStart, setFocusAtStart] = useState(false)
  const [formatBar, setFormatBar] = useState<{ top: number; left: number } | null>(null)
  const [colorMenuOpen, setColorMenuOpen] = useState(false)
  const listNumbers = useMemo(() => {
    const numbers: Record<string, number> = {}
    let counter = 0
    doc.blocks.forEach((b) => {
      const ordered = b.type === 'paragraph' && (b.runs ?? []).some((run) => (run.marks ?? []).includes('list:ordered'))
      counter = ordered ? counter + 1 : 0
      if (ordered) numbers[b.id] = counter
    })
    return numbers
  }, [doc.blocks])
  useEffect(() => {
    const update = () => {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) { setFormatBar(null); setColorMenuOpen(false); return }
      const range = selection.getRangeAt(0)
      const node = range.commonAncestorContainer
      const element = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) as HTMLElement | null
      if (!element?.closest?.('.notes-paragraph[contenteditable="true"]')) { setFormatBar(null); setColorMenuOpen(false); return }
      const rect = range.getBoundingClientRect()
      setFormatBar({ top: Math.max(8, rect.top - 46), left: Math.max(8, Math.min(rect.left + rect.width / 2 - 70, window.innerWidth - 200)) })
    }
    document.addEventListener('selectionchange', update)
    return () => document.removeEventListener('selectionchange', update)
  }, [])
  const applyColor = (kind: 'text' | 'bg', value: string) => {
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand(kind === 'text' ? 'foreColor' : 'hiliteColor', false, value)
    setColorMenuOpen(false)
  }
  const [slash, setSlash] = useState<{ blockId: string; query: string; index: number; position: { top: number; left: number } } | null>(null)
  const [blockMenu, setBlockMenu] = useState<{ blockId: string; x: number; y: number } | null>(null)
  const [dragBlockId, setDragBlockId] = useState<string | null>(null)
  const [dropBlockId, setDropBlockId] = useState<string | null>(null)

  const sortNotes = (list: Note[]) => [...list].sort((a, b) => new Date(b.updated_at || '').getTime() - new Date(a.updated_at || '').getTime())
  const loadTree = useCallback(async () => {
    try {
      const collected: Note[] = []
      let nextCursor: string | null = null
      do {
        const page = await notesRepo.listNotes({ limit: 50, isDeleted: false, isArchived: false, cursor: nextCursor, scope: 'owned' })
        collected.push(...page.items.filter((item) => !collected.some((existing) => existing.id === item.id)))
        nextCursor = page.nextCursor
      } while (nextCursor && collected.length < 200)
      setTreeNotes(sortNotes(collected))
    } catch {
      // дерево — вспомогательное, ошибки списка показываются в основной области
    }
    try { setTagSummaries(await notesRepo.listTags()) } catch { /* tag list can fall back to loaded notes */ }
  }, [notesRepo])
  useEffect(() => { void loadTree() }, [loadTree])
  useEffect(() => {
    setTreeNotes((prev) => {
      const map = new Map(prev.map((item) => [item.id, item]))
      let changed = false
      items.forEach((item) => {
        const active = !item.is_deleted && !item.is_archived
        if (!active) { if (map.delete(item.id)) changed = true; return }
        if (map.get(item.id) !== item) { map.set(item.id, item); changed = true }
      })
      return changed ? sortNotes([...map.values()]) : prev
    })
  }, [items])
  useEffect(() => {
    if (!note || note.is_deleted || note.is_archived) return
    if (isForeignNote(note)) {
      rememberSharedNotes([note])
      setTreeNotes((prev) => prev.filter((item) => item.id !== note.id))
      return
    }
    setTreeNotes((prev) => prev.some((item) => item.id === note.id) ? prev.map((item) => item.id === note.id ? note : item) : sortNotes([note, ...prev]))
  }, [isForeignNote, note, rememberSharedNotes])
  useEffect(() => {
    const foreign = [...treeNotes, ...items].filter((item) => isForeignNote(item))
    if (foreign.length) rememberSharedNotes(foreign)
  }, [isForeignNote, items, rememberSharedNotes, treeNotes])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (isMobile) setSidebarOpen(true)
        else setSidebarCollapsed(false)
        window.requestAnimationFrame(() => searchRef.current?.focus())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isMobile])

  useEffect(() => { setSlash(null); setBlockMenu(null) }, [note?.id, view])
  useEffect(() => {
    if (!slash) return
    const onDown = (event: MouseEvent) => {
      if (slashMenuRef.current?.contains(event.target as Node)) return
      setSlash(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [slash])

  const slashMenuPosition = (rect: DOMRect) => {
    const menuW = 234
    const menuH = 340
    const sideLeft = rect.left + 440
    const fitsSide = sideLeft + menuW + 12 < window.innerWidth
    let left = fitsSide ? sideLeft : Math.min(rect.left + 16, window.innerWidth - menuW - 12)
    let top = fitsSide ? rect.top - 205 : rect.bottom + 6
    if (!fitsSide && top + menuH > window.innerHeight - 8) top = rect.top - menuH - 6
    top = Math.max(64, Math.min(top, window.innerHeight - menuH - 8))
    left = Math.max(8, left)
    return { top, left }
  }

  const applySlashItem = (item: SlashItem) => {
    if (!slash) return
    const block = doc.blocks.find((b) => b.id === slash.blockId)
    setSlash(null)
    if (!block) return
    const emptyParagraph = (marks?: string[]) => ({ id: block.id, type: 'paragraph' as const, runs: [{ text: '', marks: marks ?? [] }] })
    const trailing = () => { const next = { id: bid('p'), type: 'paragraph' as const, runs: [{ text: '' }] }; insertBlockAfter(block.id, next); setFocusBlockId(next.id) }
    if (item.key === 'text') { patchBlock(block.id, emptyParagraph()); setFocusBlockId(block.id) }
    if (item.key === 'heading') { patchBlock(block.id, emptyParagraph(['heading2'])); setFocusBlockId(block.id) }
    if (item.key === 'subheading') { patchBlock(block.id, emptyParagraph(['heading3'])); setFocusBlockId(block.id) }
    if (item.key === 'bullet') { patchBlock(block.id, emptyParagraph(['list:bullet'])); setFocusBlockId(block.id) }
    if (item.key === 'ordered') { patchBlock(block.id, emptyParagraph(['list:ordered'])); setFocusBlockId(block.id) }
    if (item.key === 'todo') { patchBlock(block.id, { id: block.id, type: 'checklist', items: [{ id: bid('i'), text: '', checked: false }] }); setFocusBlockId(block.id) }
    if (item.key === 'table') { patchBlock(block.id, { id: block.id, type: 'table', rows: Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({ text: '' }))) }); trailing() }
    if (item.key === 'image') { patchBlock(block.id, emptyParagraph()); imageTargetRef.current = block.id; fileRef.current?.click() }
    if (item.key === 'audio-upload' || item.key === 'audio-record') {
      if (uploadingAudio || recordingAudio) { showError(nt('page.t043')); return }
      patchBlock(block.id, emptyParagraph())
      audioTargetBlockRef.current = block.id
      setAudioPendingBlockId(block.id)
      if (item.key === 'audio-upload') audioFileRef.current?.click()
      else void startAudioRecording()
    }
    if (item.key === 'ai') { patchBlock(block.id, emptyParagraph()); void handleAiSummarize() }
  }

  const handleSlashKey = (event: React.KeyboardEvent): boolean => {
    if (!slash) return false
    const list = filterSlashItems(slash.query)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (list.length) setSlash({ ...slash, index: (slash.index + (event.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length })
      return true
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (list[slash.index]) applySlashItem(list[slash.index])
      return true
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setSlash(null)
      return true
    }
    return false
  }

  const addSlashBlockAfter = (afterId: string) => {
    const next = { id: bid('p'), type: 'paragraph' as const, runs: [{ text: '/' }] }
    insertBlockAfter(afterId, next)
    setFocusBlockId(next.id)
  }

  const moveBlockBefore = (blockId: string, beforeId: string) => setDoc((d) => {
    if (blockId === beforeId) return d
    const moving = d.blocks.find((b) => b.id === blockId)
    if (!moving) return d
    const rest = d.blocks.filter((b) => b.id !== blockId)
    const index = rest.findIndex((b) => b.id === beforeId)
    rest.splice(index < 0 ? rest.length : index, 0, moving)
    return { ...d, blocks: rest }
  })

  const duplicateBlock = (blockId: string) => {
    const source = doc.blocks.find((b) => b.id === blockId)
    if (!source) return
    const copy = JSON.parse(JSON.stringify(source))
    copy.id = bid(source.type === 'paragraph' ? 'p' : source.type === 'checklist' ? 'c' : source.type === 'table' ? 't' : 'img')
    if (copy.type === 'checklist') copy.items = copy.items.map((it: any) => ({ ...it, id: bid('i') }))
    insertBlockAfter(blockId, copy)
  }

  const focusOrAppendParagraph = () => {
    if (!editable || isActionPending) return
    const last = doc.blocks[doc.blocks.length - 1]
    if (last?.type === 'paragraph' && !(last.runs ?? []).some((run) => run.text)) { setFocusBlockId(last.id); return }
    const next = { id: bid('p'), type: 'paragraph' as const, runs: [{ text: '' }] }
    addBlock(next)
    setFocusBlockId(next.id)
  }

  const commitTag = () => {
    if (!editable) return
    const tag = Array.from(tagDraft.trim().replace(/^#+/, '').replace(/\s+/g, ' ')).slice(0, 50).join('').toLocaleLowerCase()
    setTagDraft('')
    if (!tag) return
    const tags = doc.page?.tags ?? []
    if (tags.some((item) => item.toLocaleLowerCase() === tag)) return
    if (tags.length >= 50) { setShareToast({ message: nt('page.t044'), variant: 'error' }); return }
    setDoc((current) => ({ ...current, page: { ...current.page, tags: [...(current.page?.tags ?? []), tag] } }))
  }

  const removeTag = (tag: string) => {
    if (!editable) return
    setDoc((current) => ({ ...current, page: { ...current.page, tags: (current.page?.tags ?? []).filter((item) => item !== tag) } }))
  }

  const availableTags = useMemo(() => [...new Set([
    ...tagSummaries.map((item) => item.tag),
    ...[...treeNotes, ...items].flatMap((item) => docOf(item).page?.tags ?? []),
  ])].sort((a, b) => a.localeCompare(b, 'ru')), [items, tagSummaries, treeNotes])

  const groupedNotes = useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const weekStart = today - 6 * 24 * 60 * 60 * 1000
    const groups = [
      { key: 'today', label: nt('page.t045'), items: [] as Note[] },
      { key: 'week', label: nt('page.t046'), items: [] as Note[] },
      { key: 'earlier', label: nt('page.t047'), items: [] as Note[] },
    ]
    items.filter((item) => !isForeignNote(item)).filter((item) => matchesNoteFilters(item, filters) && (!tagFilter || (docOf(item).page?.tags ?? []).some((tag) => tag.toLocaleLowerCase() === tagFilter.toLocaleLowerCase()))).forEach((item) => {
      const timestamp = new Date(item.updated_at || item.created_at || '').getTime()
      if (timestamp >= today) groups[0].items.push(item)
      else if (timestamp >= weekStart) groups[1].items.push(item)
      else groups[2].items.push(item)
    })
    return groups.filter((group) => group.items.length)
  }, [items, filters, tagFilter, isForeignNote])

  const sidebarRow = (active: boolean) => `notes-nav-row${active ? ' is-active' : ''}`
  const modeLabel = mode === 'archive' ? nt('page.t048') : mode === 'trash' ? nt('page.t049') : mode === 'meeting-ai' ? nt('page.t050') : folderId ? (folders.find((f) => f.id === folderId)?.name || nt('page.t051')) : filters.period === 'week' ? nt('page.t052') : nt('page.t053')
  const modeDescription = mode === 'archive' ? nt('page.t054') : mode === 'trash' ? nt('page.t055') : folderId ? nt('page.t056') : filters.period === 'week' ? nt('page.t057') : nt('page.t058')
  const currentFolder = note ? folders.find((f) => f.id === note.folder_id) : undefined
  const saveLabel = note && !canEdit ? nt('page.t059') : mode === 'archive' ? nt('page.t060') : mode === 'trash' ? nt('page.t061') : saving ? nt('page.t062') : saveError ? nt('page.t063') : draftKey(title, doc) !== savedDraft.current ? nt('page.t064') : nt('page.t065')
  const ownTreeNotes = treeNotes.filter((item) => !isForeignNote(item))
  const pinnedNotes = ownTreeNotes.filter((item) => item.is_pinned)
  const unfiledNotes = ownTreeNotes.filter((item) => !item.folder_id || !folders.some((f) => f.id === item.folder_id))
  const goOverview = async (period: NoteFilters['period']) => {
    await changeMode('notes')
    setFolderId(null)
    setFilters({ ...DEFAULT_NOTE_FILTERS, period })
    setSidebarOpen(false)
  }
  const goFolder = async (id: string) => {
    await changeMode('notes')
    setFolderId(id)
    setFilters(DEFAULT_NOTE_FILTERS)
    setSidebarOpen(false)
  }
  const openFromSidebar = (id: string) => {
    setSidebarOpen(false)
    if (mode !== 'notes') setMode('notes')
    void openNote(id)
  }
  const isChecklistNote = (n: Note) => {
    if (n.type === 'checklist' || (n.checklist_items?.length ?? 0) > 0) return true
    const blocks = n.content_doc?.blocks ?? []
    return blocks.length > 0 && blocks.every((block) => block.type === 'checklist' || (block.type === 'paragraph' && !(block.runs ?? []).some((run) => run.text?.trim())))
      && blocks.some((block) => block.type === 'checklist')
  }
  const treeNoteRow = (n: Note) => (
    <button key={n.id} type="button" className={sidebarRow(view === 'note' && note?.id === n.id)} style={{ paddingLeft: 30 }} onClick={() => openFromSidebar(n.id)}>
      {isChecklistNote(n) ? <ListChecks size={16} strokeWidth={1.7} /> : <FileText size={16} strokeWidth={1.7} />}
      <span className="notes-nav-label">{titleOf(n)}</span>
    </button>
  )
  const treeSection = (key: string, label: string, icon: React.ReactNode, children: Note[], folder?: Folder) => {
    const expanded = expandedFolders[key] ?? true
    return (
      <div key={key}>
        <div className={`${sidebarRow(mode === 'notes' && view !== 'note' && (folder ? folderId === folder.id : false))} notes-nav-section`} onContextMenu={folder ? (e) => openFolderMenu(e, folder) : undefined}>
          <button type="button" className="notes-nav-chevron" aria-label={expanded ? nt('page.t066') : nt('page.t067')} onClick={() => setExpandedFolders((prev) => ({ ...prev, [key]: !expanded }))}>
            {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
          <button type="button" className="notes-nav-section-main" onClick={() => (folder ? void goFolder(folder.id) : void goOverview('all'))}>
            {icon}
            <span className="notes-nav-label">{label}</span>
          </button>
          {folder && <>
            <button type="button" className="notes-nav-hover-btn" aria-label={nt('page.folderActions', { name: label })} onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setFolderMenu({ folder, x: r.left, y: r.bottom + 4 }) }}><Ellipsis size={15} /></button>
            <button type="button" className="notes-nav-hover-btn" aria-label={nt('page.newNoteInFolder', { name: label })} onClick={() => void createNote(folder.id)}><Plus size={15} /></button>
          </>}
        </div>
        {expanded && (children.length ? children.map(treeNoteRow) : <div className="notes-nav-empty">{nt('page.t068')}</div>)}
      </div>
    )
  }

  return (
    <>
      <style>{`
        .studio-ui * { box-sizing: border-box; }
        .studio-ui ::-webkit-scrollbar { width: 8px; height: 8px; }
        .studio-ui ::-webkit-scrollbar-thumb { background: rgba(15, 23, 42, 0.14); border-radius: 999px; }
        .studio-ui .primary-btn { display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px; border-radius: 8px; background: var(--ts-action); color: #fff; font-size: 12.5px; font-weight: 600; border: none; cursor: pointer; }
        .studio-ui .primary-btn:hover { background: var(--ts-action-hover); }
        .studio-ui .primary-btn:disabled { opacity: .6; cursor: default; }
        .studio-ui .search-input { width: 100%; height: 40px; padding: 8px 12px; border-radius: 9px; border: 1px solid #E3E6EA; background: #fff; font-size: 14px; outline: none; color: #111827; }
        .studio-ui .search-input:focus { border-color: #2458D3; }
        .studio-ui .action-icon { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 8px; color: #374151; border: none; background: transparent; cursor: pointer; }
        .studio-ui .action-icon:hover { background: #F3F4F6; color: #111827; }
        .studio-ui .action-icon:disabled { opacity: .5; cursor: default; }
        .studio-ui .editor-block { position: relative; padding: 2px 0; }
        .studio-ui .editor-input { border: none; background: transparent; outline: none; width: 100%; font-size: 14.5px; color: #1F2937; resize: none; overflow: hidden; font-family: inherit; }
        .studio-ui .editor-btn { border: 1px solid #E3E6EA; background: #fff; padding: 6px 10px; border-radius: 8px; font-size: 12.5px; font-weight: 600; cursor: pointer; color: #374151; }
        .studio-ui .editor-btn:hover { background: #F9FAFB; }
        .studio-ui .notes-paragraph { position: relative; }
        .studio-ui .notes-paragraph[data-empty="true"]:focus::before { content: attr(data-placeholder); position: absolute; left: 0; color: #B4BAC3; pointer-events: none; }
        .notes-sidebar { width: 236px; flex: 0 0 236px; display: flex; flex-direction: column; min-height: 0; background: #F7F8FA; border-right: 1px solid #EDEFF2; }
        .notes-nav-row { display: flex; align-items: center; gap: 10px; width: 100%; height: 28px; padding: 0 8px; border: 0; border-radius: 6px; background: transparent; color: #1F2937; font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
        .notes-nav-row:hover { background: #EEF0F3; }
        .notes-nav-row.is-active { background: var(--ts-selection); color: var(--ts-action); font-weight: 600; }
        .notes-nav-row svg { flex: 0 0 auto; color: #4B5563; }
        .notes-nav-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .notes-nav-caption { display: flex; align-items: center; justify-content: space-between; height: 24px; margin: 16px 0 2px; padding: 0 8px; font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: #6B7280; }
        .notes-nav-caption button, .notes-nav-hover-btn, .notes-nav-chevron { display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: #6B7280; cursor: pointer; }
        .notes-nav-caption button:hover, .notes-nav-hover-btn:hover, .notes-nav-chevron:hover { background: #E2E5EA; }
        .notes-nav-section { gap: 4px; padding-right: 4px; }
        .notes-nav-section-main { display: flex; flex: 1; min-width: 0; align-items: center; gap: 8px; padding: 0; border: 0; background: transparent; font: inherit; font-weight: 600; color: #111827; cursor: pointer; text-align: left; }
        .notes-nav-hover-btn { opacity: 0; }
        .notes-nav-section:hover .notes-nav-hover-btn { opacity: 1; }
        .notes-nav-empty { padding: 3px 8px 3px 30px; font-size: 12px; color: #9CA3AF; }
        .notes-kbd { position: absolute; right: 7px; top: 50%; transform: translateY(-50%); padding: 1px 6px; border-radius: 6px; background: #F1F2F4; color: #6B7280; font-size: 10.5px; pointer-events: none; }
        .notes-block-row { position: relative; }
        .notes-block-handles { position: absolute; left: -52px; top: 3px; display: flex; align-items: center; gap: 1px; opacity: 0; transition: opacity .12s; color: #9CA3AF; }
        .notes-block-row:hover > .notes-block-handles, .notes-block-row:focus-within > .notes-block-handles { opacity: 1; }
        .notes-block-handles button { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: inherit; cursor: pointer; }
        .notes-block-handles button:hover { background: #F3F4F6; color: #4B5563; }
        .notes-block-handles .is-grip { width: 20px; cursor: grab; }
        .notes-drop-line { position: absolute; top: -1px; left: 0; right: 0; height: 2px; border-radius: 2px; background: var(--ts-action); pointer-events: none; }
        .notes-popover { position: absolute; z-index: 90; min-width: 200px; padding: 6px; border: 1px solid #E5E7EB; border-radius: 12px; background: #fff; box-shadow: 0 12px 32px rgba(15,23,42,.12); }
        .notes-popover button { display: flex; width: 100%; align-items: center; gap: 10px; padding: 7px 10px; border: 0; border-radius: 6px; background: transparent; color: #374151; font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
        .notes-popover button:hover { background: #F3F4F6; }
        .notes-popover button:disabled { opacity: .5; cursor: default; }
        .notes-popover .is-danger { color: #DC2626; }
        .notes-popover hr { margin: 4px 0; border: 0; border-top: 1px solid #EEF0F3; }
        .notes-more-actions > summary { list-style: none; }
        .notes-more-actions > summary::-webkit-details-marker { display: none; }
        .notes-format-bar { position: fixed; z-index: 120; display: flex; align-items: center; gap: 2px; padding: 4px; border: 1px solid #E5E7EB; border-radius: 10px; background: #fff; box-shadow: 0 10px 28px rgba(15,23,42,.14); }
        .notes-format-bar > button { display: flex; align-items: center; gap: 2px; height: 28px; min-width: 28px; padding: 0 6px; border: 0; border-radius: 6px; background: transparent; color: #374151; cursor: pointer; }
        .notes-format-bar > button:hover { background: #F3F4F6; }
        .notes-format-sep { width: 1px; height: 18px; margin: 0 3px; background: #E5E7EB; }
        .notes-color-menu { position: absolute; top: 40px; right: 0; width: 212px; padding: 10px; border: 1px solid #E5E7EB; border-radius: 12px; background: #fff; box-shadow: 0 12px 32px rgba(15,23,42,.14); }
        .notes-color-caption { margin: 2px 2px 6px; font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: #6B7280; }
        .notes-color-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; margin-bottom: 8px; }
        .notes-color-grid button { display: flex; align-items: center; justify-content: center; height: 28px; border: 1px solid transparent; border-radius: 6px; background: transparent; font-size: 14px; cursor: pointer; }
        .notes-color-grid button:hover { background: #F3F4F6; border-color: #E5E7EB; }
        .notes-meta-sep { width: 1px; height: 20px; margin: 0 18px; background: #E5E7EB; }
      `}</style>
      <div
        ref={pageRef}
        className="studio-ui notes-page"
        style={{ position: 'relative', height: '100%', flex: '1 1 0', minHeight: 0, minWidth: 0, display: 'flex', overflow: 'hidden', background: '#fff', color: '#111827', fontFamily: 'var(--ts-font)' }}
      >
        {isMobile && sidebarOpen && <div onClick={() => setSidebarOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: 70, background: 'rgba(15,23,42,.28)' }} />}
        {((!isMobile && !sidebarCollapsed) || (isMobile && sidebarOpen)) && (
          <aside className="notes-sidebar" style={isMobile ? { position: 'absolute', top: 0, bottom: 0, left: 0, zIndex: 80, boxShadow: '0 20px 50px rgba(15,23,42,.2)' } : undefined}>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 12px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', marginBottom: 10 }}>
                <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, letterSpacing: '-0.01em', color: '#111827' }}>{nt('page.t069')}</h2>
                <button type="button" aria-label={nt('page.t070')} onClick={() => void createNote()} disabled={isActionPending} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #E3E6EA', borderRadius: 8, background: '#fff', color: '#374151', cursor: 'pointer' }}>
                  <Plus size={16} />
                </button>
              </div>
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <Search size={15} color="#6B7280" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); if (mode === 'meeting-ai') void changeMode('notes') }}
                  onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur() } }}
                  placeholder={nt('page.t071')}
                  aria-label={nt('page.t072')}
                  style={{ width: '100%', height: 32, padding: '0 44px 0 32px', border: '1px solid #E3E6EA', borderRadius: 8, background: '#fff', fontSize: 12.5, color: '#111827', outline: 'none', fontFamily: 'inherit' }}
                />
                <kbd className="notes-kbd">⌘ K</kbd>
              </div>

              <button type="button" className={sidebarRow(mode === 'notes' && !folderId && filters.period !== 'week' && view !== 'note')} onClick={() => void goOverview('all')}><Clock3 size={16} strokeWidth={1.7} />{nt('page.t053')}</button>
              <button type="button" className={sidebarRow(mode === 'notes' && !folderId && filters.period === 'week' && view !== 'note')} onClick={() => void goOverview('week')}><History size={16} strokeWidth={1.7} />{nt('page.t052')}</button>
              <button type="button" className={sidebarRow(view === 'note' && Boolean(note) && isForeignNote(note))} aria-expanded={sharedOpen} onClick={() => setSharedOpen((open) => !open)}>
                <UsersRound size={16} strokeWidth={1.7} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nt('page.t073')}</span>
                {sharedList.length > 0 && <span style={{ fontSize: 11, color: '#6B7280' }}>{sharedList.length}{sharedCursor ? '+' : ''}</span>}
                {sharedOpen ? <ChevronDown size={14} color="#6B7280" /> : <ChevronRight size={14} color="#6B7280" />}
              </button>
              {sharedOpen && (sharedList.length === 0
                ? <div style={{ padding: '4px 8px 6px 34px', fontSize: 12, color: '#9CA3AF' }}>{sharedLoading ? nt('page.t074') : nt('page.t075')}</div>
                : sharedList.map((item) => (
                  <div key={item.id} className={sidebarRow(note?.id === item.id && view === 'note')} style={{ paddingLeft: 34 }} role="button" tabIndex={0} title={item.title}
                    onClick={() => { setSidebarOpen(false); void openNote(item.id) }}
                    onKeyDown={(event) => { if (event.key === 'Enter') { setSidebarOpen(false); void openNote(item.id) } }}>
                    <FileText size={14} strokeWidth={1.7} color="#6B7280" style={{ flex: '0 0 auto' }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                    {item.local && <button type="button" className="notes-nav-hover-btn" aria-label={nt('page.t076')} title={nt('page.t076')} onClick={(event) => { event.stopPropagation(); forgetSharedNote(item.id) }}>×</button>}
                  </div>
                )))}
              {sharedOpen && sharedCursor && <button type="button" className="notes-nav-row" style={{ paddingLeft: 34, color: '#2458D3' }} disabled={sharedLoading} onClick={() => void loadSharedNotes(false, sharedCursor)}>{sharedLoading ? nt('page.t074') : nt('page.t077')}</button>}
              <button type="button" className={sidebarRow(mode === 'meeting-ai')} onClick={() => { setSidebarOpen(false); void changeMode('meeting-ai') }}><CalendarDays size={16} strokeWidth={1.7} />{nt('page.t050')}</button>

              <div className="notes-nav-caption"><span>{nt('page.t078')}</span></div>
              {pinnedNotes.length ? pinnedNotes.map((n) => (
                <button key={n.id} type="button" className={sidebarRow(view === 'note' && note?.id === n.id)} onClick={() => openFromSidebar(n.id)}>
                  <span>{doc.page?.icon}</span>
                  <span className="notes-nav-label">{titleOf(n)}</span>
                </button>
              )) : <div className="notes-nav-empty" style={{ paddingLeft: 8 }}>{nt('page.t079')}</div>}

              <div className="notes-nav-caption"><span>{nt('page.t081')}</span>{tagFilter && <button type="button" aria-label={nt('page.t080')} onClick={() => setTagFilter(null)}>{nt('page.t082')}</button>}</div>
              {availableTags.length ? availableTags.map((tag) => <button
                key={tag}
                type="button"
                className={sidebarRow(tagFilter === tag)}
                aria-pressed={tagFilter === tag}
                onClick={() => {
                  if (mode !== 'notes') void changeMode('notes')
                  setFolderId(null)
                  setTagFilter((current) => current === tag ? null : tag)
                  setSidebarOpen(false)
                }}
                title={nt('page.showTag', { tag })}
              ><span aria-hidden="true" style={{ color: '#8497B4' }}>#</span><span className="notes-nav-label">{tag}</span></button>)
                : <div className="notes-nav-empty" style={{ paddingLeft: 8 }}>{nt('page.t083')}</div>}

              <div className="notes-nav-caption"><span>{nt('page.t085')}</span><button type="button" aria-label={nt('page.t084')} onClick={() => setCreateFolderModal(true)}><Plus size={15} /></button></div>
              {folders.map((f) => treeSection(f.id, f.name, <FolderIcon size={16} strokeWidth={1.7} color={f.color || '#374151'} />, treeNotes.filter((n) => n.folder_id === f.id), f))}
              {unfiledNotes.length > 0 && treeSection('__unfiled', nt('page.t086'), <UserRound size={16} strokeWidth={1.7} />, unfiledNotes)}
              <button type="button" className={sidebarRow(false)} onClick={() => void createNote()} disabled={isActionPending} style={{ color: '#374151' }}><Plus size={16} />{nt('page.t087')}</button>
            </div>
            <div style={{ padding: '8px 12px 12px', borderTop: '1px solid #E7E9ED' }}>
              <button type="button" className={sidebarRow(mode === 'archive')} onClick={() => { setSidebarOpen(false); void changeMode('archive') }}><Archive size={16} strokeWidth={1.7} />{nt('page.t048')}</button>
              <button type="button" className={sidebarRow(mode === 'trash')} onClick={() => { setSidebarOpen(false); void changeMode('trash') }}><Trash2 size={16} strokeWidth={1.7} />{nt('page.t049')}</button>
            </div>
          </aside>
        )}

        {folderMenu && <div onClick={(e) => e.stopPropagation()} className="notes-popover" style={{ position: 'fixed', left: `clamp(8px, ${folderMenu.x}px, calc(100vw - 208px))`, top: `clamp(8px, ${folderMenu.y}px, calc(100dvh - 120px))`, zIndex: 1000, width: 200 }}>
          <button type="button" onClick={() => { const f = folderMenu.folder; setFolderMenu(null); openRenameFolderModal(f) }}><Pencil size={15} />{nt('page.t088')}</button>
          <hr />
          <button type="button" className="is-danger" onClick={() => { const f = folderMenu.folder; setFolderMenu(null); void deleteFolder(f).then(() => loadTree()) }}><Trash2 size={15} />{nt('page.t089')}</button>
        </div>}

        <main style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {mode === 'meeting-ai' ? (
            <>
              <header style={headerBar}>
                  {!isMobile && <button type="button" className="action-icon" aria-label={sidebarCollapsed ? nt('page.t090') : nt('page.t091')} aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed((value) => !value)}><Menu size={18} /></button>}
                {isMobile && <button type="button" className="action-icon" aria-label={nt('page.t092')} onClick={() => setSidebarOpen(true)}><Menu size={18} /></button>}
                <CalendarDays size={17} strokeWidth={1.7} color="#374151" />
                <span style={{ fontSize: 13.5 }}>{nt('page.t050')}</span>
              </header>
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <NotesMeetingAiPanel
                  repository={alemAiRepository}
                  notesRepo={notesRepo}
                  onNoteCreated={handleMeetingNoteCreated}
                  showError={showError}
                  showSuccess={showSuccess}
                />
              </div>
            </>
          ) : view === 'note' ? (
            note ? (
              <>
                <header style={headerBar}>
                  {!isMobile && <button type="button" className="action-icon" aria-label={sidebarCollapsed ? nt('page.t090') : nt('page.t091')} aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed((value) => !value)}><Menu size={18} /></button>}
                  {isMobile && <button type="button" className="action-icon" aria-label={nt('page.t092')} onClick={() => setSidebarOpen(true)}><Menu size={18} /></button>}
                  <nav aria-label={nt('page.t093')} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
                    <FileText size={17} strokeWidth={1.7} color="#374151" style={{ flex: '0 0 auto' }} />
                    <button type="button" onClick={() => void (currentFolder ? goFolder(currentFolder.id) : closeEditor())} style={crumbBtn}>{mode === 'archive' ? nt('page.t048') : mode === 'trash' ? nt('page.t049') : currentFolder?.name || nt('page.t069')}</button>
                    <span style={{ color: '#9CA3AF' }}>/</span>
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#111827' }}>{title.trim() || nt('page.t000')}</span>
                  </nav>
                  <span role="status" aria-label={uploadingImage ? nt('page.t094') : saveLabel} title={uploadingImage ? nt('page.t094') : saveLabel} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: saveError ? '#DC2626' : '#6B7280', whiteSpace: 'nowrap' }}>
                    {!canEdit ? null : saving || uploadingImage ? <LoaderCircle size={14} className="animate-spin" /> : saveError ? <CircleAlert size={14} /> : <Check size={14} />}
                    {!isMobile && (uploadingImage ? nt('page.t094') : saveLabel)}
                  </span>
                  {mode === 'trash' ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="editor-btn" onClick={() => void restore().then(() => loadTree())} disabled={isActionPending}>{nt('page.t095')}</button>
                      <button className="editor-btn" onClick={() => void hardDelete()} disabled={isActionPending} style={{ color: c.danger }}>{nt('page.t096')}</button>
                    </div>
                  ) : mode === 'archive' ? (
                    <button className="editor-btn" onClick={() => void unarchive().then(() => loadTree())} disabled={isActionPending}>{nt('page.t097')}</button>
                  ) : !canEdit ? null : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button type="button" aria-label={nt('page.t098')} title={nt('page.t098')} onClick={() => void shareNote()} disabled={isActionPending} style={{ display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 12px', marginLeft: 6, border: '1px solid #E3E6EA', borderRadius: 8, background: '#fff', color: '#111827', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        <UsersRound size={15} strokeWidth={1.8} />{!isMobile && nt('page.t098')}
                      </button>
                      <button type="button" className="action-icon" aria-label={note.is_pinned ? nt('page.t100') : nt('page.t101')} aria-pressed={note.is_pinned} onClick={() => void pin()} disabled={isActionPending}>
                        <Star size={18} strokeWidth={1.7} fill={note.is_pinned ? '#F5B301' : 'none'} color={note.is_pinned ? '#F5B301' : 'currentColor'} />
                      </button>
                      <details ref={noteActionsRef} className="notes-more-actions" style={{ position: 'relative' }} onKeyDown={(event) => { if (event.key === 'Escape') { event.currentTarget.open = false } }}>
                        <summary className="action-icon" aria-label={nt('page.t102')}><Ellipsis size={18} /></summary>
                        <div className="notes-popover" style={{ right: 0, top: 38, width: 250 }}>
                          <button type="button" disabled={isActionPending} onClick={() => { noteActionsRef.current!.open = false; setNoteFolderSelectOpen(true) }}><FolderIcon size={15} />{nt('page.t103')}</button>
                          <button type="button" disabled={isActionPending} onClick={() => { noteActionsRef.current!.open = false; void archiveNote().then(() => loadTree()) }}><Archive size={15} />{nt('page.t104')}</button>
                          <hr />
                          <button type="button" disabled={isActionPending || isProofreading || isSummarizing} onClick={() => { noteActionsRef.current!.open = false; void handleAiProofread() }}><Wand2 size={15} />{nt('page.t105')}</button>
                          <button type="button" disabled={isActionPending || isProofreading || isSummarizing} onClick={() => { noteActionsRef.current!.open = false; void handleAiSummarize() }}><Sparkles size={15} />{nt('page.t106')}</button>
                          <button type="button" disabled={isActionPending} onClick={() => { noteActionsRef.current!.open = false; handleVisualizeReport() }}><ChartColumn size={15} />{nt('page.t107')}</button>
                          <button type="button" disabled={isActionPending} onClick={() => { noteActionsRef.current!.open = false; handleFormatMarkdown() }}><Heading1 size={15} />{nt('page.t108')}</button>
                          <hr />
                          <button type="button" className="is-danger" disabled={isActionPending} onClick={() => { noteActionsRef.current!.open = false; void del().then(() => loadTree()) }}><Trash2 size={15} />{nt('page.t109')}</button>
                        </div>
                      </details>
                    </div>
                  )}
                </header>
                {saveError && <div role="alert" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '8px 16px', background: '#FEF2F2', borderBottom: '1px solid #FECACA', color: '#B91C1C', fontSize: 13 }}>{saveError}<button className="editor-btn" onClick={() => void flushNote()}>{nt('page.t110')}</button></div>}
                {pendingLocalDraft?.noteId === note.id && <div role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, padding: '10px 16px', background: '#FFFBEB', borderBottom: '1px solid #FDE68A', color: '#92400E', fontSize: 13 }}>
                  <span>
                    {nt('page.draftFound', { date: formatDate(pendingLocalDraft.savedAt, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) })}
                    {pendingLocalDraft.baseVersion !== note.version ? ` ${nt('page.draftVersion', { draft: pendingLocalDraft.baseVersion, current: note.version })}` : ''}.
                  </span>
                  <span style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="editor-btn" onClick={restoreLocalDraft}>{nt('page.t111')}</button>
                    <button type="button" className="editor-btn" onClick={discardLocalDraft}>{nt('page.t112')}</button>
                  </span>
                </div>}
                <div className="notes-editor-content" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                  <div className="notes-document">
                    <div className="notes-page-icon-row">
                      <details className="notes-icon-picker" key={note.id}>
                        <summary aria-label={nt('page.t113')}>{doc.page?.icon || '📄'}</summary>
                        {editable && <div className="notes-icon-options">
                          {['📄', '🚀', '💡', '📝', '📚', '🎯', '🗓️', '💼', '✨', '🌿', '🧩', '📌'].map((icon) => <button type="button" key={icon} aria-label={nt('page.iconN', { icon })} disabled={isActionPending} onClick={(event) => {
                            setDoc((current) => ({ ...current, page: { ...current.page, icon } }))
                            event.currentTarget.closest('details')?.removeAttribute('open')
                          }}>{icon}</button>)}
                        </div>}
                      </details>
                    </div>
                    <textarea
                      ref={titleRef}
                      value={title}
                      onChange={(e) => editable && setTitle(e.target.value.replace(/\n/g, ''))}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return
                        e.preventDefault()
                        const first = doc.blocks.find((b) => b.type === 'paragraph')
                        if (first) setFocusBlockId(first.id)
                      }}
                      readOnly={!editable || isActionPending}
                      aria-label={nt('page.t114')}
                      placeholder={nt('page.t000')}
                      rows={1}
                      style={{ display: 'block', width: '100%', border: 'none', outline: 'none', resize: 'none', overflow: 'hidden', padding: 0, background: 'transparent', fontFamily: 'inherit', fontSize: isMobile ? 30 : 38, lineHeight: 1.2, fontWeight: 700, letterSpacing: '-0.02em', color: '#111827' }}
                    />
                    {(editable || doc.page?.description) && <input
                      className="notes-page-description"
                      aria-label={nt('page.t115')}
                      placeholder={nt('page.t116')}
                      value={doc.page?.description || ''}
                      readOnly={!editable || isActionPending}
                      onChange={(event) => setDoc((current) => ({ ...current, page: { ...current.page, description: event.target.value } }))}
                    />}
                    <div className="notes-document-properties" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', rowGap: 8, marginTop: 18, fontSize: 13 }}>
                      <div ref={noteFolderSelectRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ color: '#6B7280' }}>{nt('page.t051')}</span>
                        <button type="button" disabled={isActionPending || !editable} onClick={() => setNoteFolderSelectOpen((open) => !open)} aria-haspopup="menu" aria-expanded={noteFolderSelectOpen} style={metaBtn}>
                          <FolderIcon size={16} strokeWidth={1.7} color={currentFolder?.color || '#374151'} />{currentFolder?.name || nt('page.t086')}
                        </button>
                        {noteFolderSelectOpen && (
                          <div role="menu" className="notes-popover" style={{ left: 44, top: 30, width: 210 }}>
                            <button type="button" role="menuitem" onClick={() => { void move(null).then(() => loadTree()); setNoteFolderSelectOpen(false) }}>
                              <Check size={15} color={!note.folder_id ? '#2458D3' : 'transparent'} />{nt('page.t086')}</button>
                            <hr />
                            {folders.map((f) => (
                              <button key={f.id} type="button" role="menuitem" onClick={() => { void move(f.id).then(() => loadTree()); setNoteFolderSelectOpen(false) }}>
                                <FolderIcon size={15} color={f.color || '#1687FF'} /><span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                                {note.folder_id === f.id && <Check size={15} color="#2458D3" />}
                              </button>
                            ))}
                            <hr />
                            <button type="button" role="menuitem" onClick={() => { setNoteFolderSelectOpen(false); setCreateFolderModal(true) }}><Plus size={15} />{nt('page.t084')}</button>
                          </div>
                        )}
                      </div>
                      <span className="notes-meta-sep" />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ color: '#6B7280' }}>{nt('page.t117')}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#111827' }}><CalendarDays size={16} strokeWidth={1.7} color="#374151" />{dateOf(note.updated_at)}</span>
                      </div>
                      <span className="notes-meta-sep" />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ color: '#6B7280' }}>{nt('page.t118')}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 6, fontWeight: 500, background: note.is_pinned ? '#EAF1FF' : '#F3F4F6', color: note.is_pinned ? '#2F5FD0' : '#4B5563' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: note.is_pinned ? '#2458D3' : '#9CA3AF' }} />
                          {mode === 'archive' ? nt('page.t060') : mode === 'trash' ? nt('page.t061') : note.is_pinned ? nt('page.t119') : nt('page.words', { count: wordCount })}
                        </span>
                      </div>
                    </div>
                    {(editable || (doc.page?.tags?.length ?? 0) > 0) && <div aria-label={nt('page.t120')} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7, marginTop: 12 }}>
                      <span style={{ color: '#6B7280', fontSize: 13 }}>{nt('page.t081')}</span>
                      {(doc.page?.tags ?? []).map((tag) => <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 999, background: '#F1F5F9', color: '#475569', fontSize: 12 }}>
                        {tag}
                        {editable && <button type="button" aria-label={nt('page.removeTag', { tag })} onClick={() => removeTag(tag)} style={{ display: 'inline-flex', padding: 0, border: 0, background: 'transparent', color: '#64748B', cursor: 'pointer' }}>×</button>}
                      </span>)}
                      {editable && <input
                        value={tagDraft}
                        onChange={(event) => setTagDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); commitTag() }
                          if (event.key === 'Backspace' && !tagDraft && doc.page?.tags?.length) removeTag(doc.page.tags[doc.page.tags.length - 1])
                        }}
                        onBlur={commitTag}
                        placeholder={nt('page.t121')}
                        aria-label={nt('page.t121')}
                        maxLength={50}
                        style={{ width: 120, height: 27, padding: '0 8px', border: '1px dashed #CBD5E1', borderRadius: 999, outline: 'none', font: 'inherit', fontSize: 12 }}
                      />}
                    </div>}
                    <div style={{ height: 1, background: '#ECEEF1', margin: '18px 0 20px' }} />
                    <div style={{ position: 'relative' }}>
                      {doc.blocks.map((b) => (
                        <div
                          key={`${note.id}:${b.id}`}
                          className="notes-block-row"
                          style={{ opacity: dragBlockId === b.id ? 0.4 : 1 }}
                          onDragOver={(e) => { if (!dragBlockId) return; e.preventDefault(); if (dropBlockId !== b.id) setDropBlockId(b.id) }}
                          onDrop={(e) => { e.preventDefault(); if (dragBlockId) moveBlockBefore(dragBlockId, b.id); setDragBlockId(null); setDropBlockId(null) }}
                        >
                          {dropBlockId === b.id && dragBlockId && dragBlockId !== b.id && <div className="notes-drop-line" />}
                          {editable && (
                            <div className="notes-block-handles">
                              <button type="button" aria-label={nt('page.t122')} onClick={() => addSlashBlockAfter(b.id)}><Plus size={16} /></button>
                              <button
                                type="button"
                                className="is-grip"
                                draggable
                                aria-label={nt('page.t123')}
                                onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', b.id); setDragBlockId(b.id) }}
                                onDragEnd={() => { setDragBlockId(null); setDropBlockId(null) }}
                                onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setBlockMenu({ blockId: b.id, x: r.left, y: r.bottom + 4 }) }}
                              ><GripVertical size={15} /></button>
                            </div>
                          )}
                          {audioPendingBlockId === b.id && (recordingAudio || uploadingAudio) ? <div className="editor-block" role="status" style={{ padding: 14, border: '1px solid #DCE7F7', borderRadius: 10, background: '#F7FAFF', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                            <span style={{ color: recordingAudio ? '#DC2626' : '#6078A1', fontSize: 13 }}>{recordingAudio ? nt('page.t124') : nt('page.t125')}</span>
                            {recordingAudio && <button type="button" className="editor-btn" onClick={() => { if (audioRecorderRef.current?.state === 'recording') audioRecorderRef.current.stop() }}><Square size={15} />{nt('page.t126')}</button>}
                          </div> : <BlockEditor
                            block={b}
                            readOnly={!editable || isActionPending}
                            activeMarks={activeMarks}
                            autoFocus={focusBlockId === b.id}
                            focusAtStart={focusAtStart}
                            listNumber={listNumbers[b.id]}
                            onFocused={() => { setFocusBlockId(null); setFocusAtStart(false) }}
                            onRequestFocus={() => { setFocusAtStart(false); setFocusBlockId(b.id) }}
                            onRemoveEmpty={() => {
                              const index = doc.blocks.findIndex((x) => x.id === b.id)
                              const prev = doc.blocks.slice(0, index).reverse().find((x) => x.type === 'paragraph' || x.type === 'checklist')
                              if (!prev) return
                              removeBlock(b.id)
                              setFocusAtStart(false)
                              setFocusBlockId(prev.id)
                            }}
                            slashActive={slash?.blockId === b.id}
                            onSlash={(state) => setSlash(state ? { blockId: b.id, query: state.query, index: slash?.blockId === b.id && slash.query === state.query ? slash.index : 0, position: slash?.blockId === b.id ? slash.position : slashMenuPosition(state.rect) } : (slash?.blockId === b.id ? null : slash))}
                            onSlashKey={handleSlashKey}
                            attachment={note.attachments?.find((a) => a.id === (b as any).attachmentId || a.file_id === (b as any).attachmentId)}
                            onChange={(next) => editable && patchBlock(b.id, next)}
                            onInsertAfter={(nextBlock) => { insertBlockAfter(b.id, nextBlock); if (nextBlock.type === 'paragraph') { setFocusAtStart(true); setFocusBlockId(nextBlock.id) } }}
                            onPasteMarkdown={(markdown) => {
                              const isStructured = /(^|\n)\s*#{1,3}\s/.test(markdown) || markdown.split('\n').length > 2
                              applyMarkdownContent(markdown, isStructured ? undefined : b.id)
                            }}
                            onImageClick={setPreviewImageUrl}
                            onPasteImage={(file) => { imageTargetRef.current = b.id; void upload(file) }}
                            onTextSelect={(range) => {
                              selectedText.current = range
                              if (range && range.start !== range.end && b.type === 'paragraph') {
                                const run = b.runs.find((_, i, arr) => {
                                  let pos = 0
                                  for (let j = 0; j < i; j++) pos += arr[j].text.length
                                  return range.start >= pos && range.start < pos + arr[i].text.length
                                })
                                if (run) setActiveMarks(run.marks || [])
                              }
                            }}
                            onRemove={() => removeBlock(b.id)}
                          />}
                        </div>
                      ))}
                      <div
                        style={{ minHeight: 140, cursor: editable ? 'text' : 'default' }}
                        onClick={focusOrAppendParagraph}
                        onDragOver={(e) => { if (!dragBlockId) return; e.preventDefault(); setDropBlockId('__end') }}
                        onDrop={(e) => { e.preventDefault(); if (dragBlockId) moveBlockBefore(dragBlockId, '__end'); setDragBlockId(null); setDropBlockId(null) }}
                      >
                        {dropBlockId === '__end' && dragBlockId && <div style={{ height: 2, borderRadius: 2, background: '#2458D3' }} />}
                      </div>
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
                    <input ref={audioFileRef} type="file" accept=".mp3,.m4a,.wav,.webm,.ogg,.aac,.flac,audio/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAudioFile(file); else { audioTargetBlockRef.current = null; setAudioPendingBlockId(null) } event.target.value = '' }} />
                  </div>
                </div>
              </>
            ) : (
              <div style={{ margin: 'auto', textAlign: 'center', color: '#6B7280' }}>
                <FileText size={34} color="#C4C9D0" />
                <div style={{ marginTop: 10, fontSize: 14 }}>{isActionPending ? nt('page.t127') : nt('page.t128')}</div>
                <button className="editor-btn" style={{ marginTop: 12 }} type="button" onClick={() => void closeEditor()}>{nt('page.t129')}</button>
              </div>
            )
          ) : (
            <>
              <header style={headerBar}>
                  {!isMobile && <button type="button" className="action-icon" aria-label={sidebarCollapsed ? nt('page.t090') : nt('page.t091')} aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed((value) => !value)}><Menu size={18} /></button>}
                {isMobile && <button type="button" className="action-icon" aria-label={nt('page.t092')} onClick={() => setSidebarOpen(true)}><Menu size={18} /></button>}
                {mode === 'archive' ? <Archive size={17} strokeWidth={1.7} color="#374151" /> : mode === 'trash' ? <Trash2 size={17} strokeWidth={1.7} color="#374151" /> : folderId ? <FolderIcon size={17} strokeWidth={1.7} color="#374151" /> : <Clock3 size={17} strokeWidth={1.7} color="#374151" />}
                <span style={{ flex: 1, fontSize: 13.5 }}>{modeLabel}</span>
                <button ref={filtersButtonRef} type="button" className="editor-btn" aria-label={activeFilterLabels.length ? nt('page.filtersCount', { count: activeFilterLabels.length }) : nt('page.t130')} aria-haspopup="dialog" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, color: activeFilterLabels.length ? '#2458D3' : '#374151', borderColor: activeFilterLabels.length ? '#BFD1FF' : '#E3E6EA' }}>
                  <SlidersHorizontal size={15} />{!isMobile && nt('page.t130')}{activeFilterLabels.length > 0 && ` · ${activeFilterLabels.length}`}
                </button>
                {mode === 'notes' && <>
                  <button type="button" className="primary-btn" aria-label={nt('page.t070')} onClick={() => void createNote()} disabled={isActionPending || loading}><Plus size={15} />{!isMobile && nt('page.t070')}</button>
                </>}
              </header>
              <div ref={attachListScroll} onScroll={(event) => { listScrollTop.current = event.currentTarget.scrollTop }} aria-busy={loading} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                <div style={{ maxWidth: 860, margin: '0 auto', padding: isMobile ? '22px 14px 48px' : '34px 32px 64px' }}>
                  <h1 style={{ margin: 0, fontSize: isMobile ? 26 : 30, fontWeight: 700, letterSpacing: '-0.02em', color: '#111827' }}>{modeLabel}</h1>
                  <p style={{ margin: '4px 0 0', fontSize: 15, color: '#6B7280' }}>{modeDescription}</p>
                  {activeFilterLabels.length > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, fontSize: 12.5, color: '#4B5563' }}>
                    <span>{activeFilterLabels.join(' · ')}</span>
                    <button type="button" onClick={() => setFilters(DEFAULT_NOTE_FILTERS)} style={{ border: 0, background: 'transparent', color: '#2458D3', cursor: 'pointer', padding: 0, font: 'inherit' }}>{nt('page.t131')}</button>
                  </div>}
                  <div style={{ height: 1, background: '#ECEEF1', margin: '20px 0 8px' }} />
                  {err && <div role="alert" className="notes-list-error">{err}<button type="button" className="editor-btn" onClick={() => void loadNotes(!items.length)} disabled={loading}>{nt('page.t132')}</button></div>}
                  {loading && !items.length ? (
                    <div style={{ textAlign: 'center', color: '#6B7280', fontSize: 13, padding: '24px 10px' }}>{nt('page.t074')}</div>
                  ) : groupedNotes.length ? groupedNotes.map((group) => (
                    <div key={group.key} style={{ marginTop: 14 }}>
                      <div style={{ padding: '6px 12px 5px', color: '#6B7280', fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase' }}>{group.label}</div>
                      {group.items.map((n) => (
                        <NotesListRow key={n.id} note={n} folders={folders} selected={false} busy={isActionPending} onOpen={() => void openNote(n.id)} onAction={(action, destination) => void handleRowAction(action, n, destination).then(() => loadTree())} />
                      ))}
                    </div>
                  )) : (
                    !err && <NotesEmptyState
                      mode={mode}
                      hasSearch={Boolean(q.trim())}
                      hasFilters={activeFilterLabels.length > 0}
                      hasFolder={Boolean(folderId)}
                      busy={isActionPending || loading}
                      onCreateNote={() => void createNote()}
                      onCreateFolder={() => setCreateFolderModal(true)}
                      onReset={() => { setQuery(''); setQ(''); setFilters(DEFAULT_NOTE_FILTERS); setFolderId(null) }}
                    />
                  )}
                  {cursor && <button className="editor-btn" style={{ marginTop: 12 }} disabled={loading} onClick={() => void loadNotes(false)}>{loading ? nt('page.t074') : nt('page.t133')}</button>}
                </div>
              </div>
            </>
          )}
        </main>

        {slash && (
          <NoteSlashMenu
            ref={slashMenuRef}
            query={slash.query}
            activeIndex={slash.index}
            position={slash.position}
            onHover={(index) => setSlash({ ...slash, index })}
            onSelect={applySlashItem}
            onQueryChange={(value) => setSlash({ ...slash, query: value, index: 0 })}
            onKeyDown={(e) => { handleSlashKey(e) }}
          />
        )}
        {formatBar && editable && view === 'note' && (
          <div className="notes-format-bar" style={{ top: formatBar.top, left: formatBar.left }} onMouseDown={(e) => e.preventDefault()}>
            <button type="button" aria-label={nt('page.t134')} title={nt('page.t135')} onClick={() => mark('bold')}><Bold size={15} /></button>
            <button type="button" aria-label={nt('page.t136')} title={nt('page.t137')} onClick={() => mark('italic')}><Italic size={15} /></button>
            <button type="button" aria-label={nt('page.t138')} title={nt('page.t139')} onClick={() => mark('strike')}><Strikethrough size={15} /></button>
            <span className="notes-format-sep" />
            <button type="button" aria-label={nt('page.t140')} title={nt('page.t141')} aria-expanded={colorMenuOpen} onClick={() => setColorMenuOpen((open) => !open)}><Baseline size={16} /><ChevronDown size={12} /></button>
            {colorMenuOpen && (
              <div className="notes-color-menu">
                <div className="notes-color-caption">{nt('page.t142')}</div>
                <div className="notes-color-grid">
                  {TEXT_COLORS.map((color) => (
                    <button key={color.value} type="button" title={color.label} aria-label={nt('page.textColorN', { name: color.label })} onClick={() => applyColor('text', color.value)}>
                      <span style={{ color: color.value, fontWeight: 600 }}>A</span>
                    </button>
                  ))}
                </div>
                <div className="notes-color-caption">{nt('page.t143')}</div>
                <div className="notes-color-grid">
                  {HIGHLIGHT_COLORS.map((color) => (
                    <button key={color.value} type="button" title={color.label} aria-label={nt('page.highlightN', { name: color.label })} onClick={() => applyColor('bg', color.value)}>
                      <span style={{ width: 16, height: 16, borderRadius: 4, background: color.value === 'transparent' ? '#fff' : color.value, border: '1px solid #E5E7EB', display: 'block' }} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {blockMenu && <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 95 }} onClick={() => setBlockMenu(null)} />
          <div className="notes-popover" role="menu" style={{ position: 'fixed', left: blockMenu.x, top: blockMenu.y, zIndex: 96 }}>
            <button type="button" onClick={() => { duplicateBlock(blockMenu.blockId); setBlockMenu(null) }}><Copy size={15} />{nt('page.t144')}</button>
            <button type="button" className="is-danger" onClick={() => { removeBlock(blockMenu.blockId); setBlockMenu(null) }}><Trash2 size={15} />{nt('page.t145')}</button>
          </div>
        </>}

        {filtersOpen && <NotesFiltersDropdown anchorRef={filtersButtonRef} filters={filters} onClose={() => setFiltersOpen(false)} onApply={(next) => { setFilters(next); setFiltersOpen(false); filtersButtonRef.current?.focus() }} />}
        {createFolderModal && <div style={modalOverlay} onClick={() => { setCreateFolderModal(false); setFolderName(''); setFolderColor('#1687FF') }}>
          <div style={{ ...modalPanel, padding: 24, borderRadius: 16 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>{nt('page.t084')}</h3>
            <p style={{ margin: '0 0 16px', color: c.muted, fontSize: 13 }}>{nt('page.t146')}</p>
            <input value={folderName} onChange={(e) => setFolderName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void createFolder()} autoFocus placeholder={nt('page.t147')} className="search-input" style={{ background: '#fff', paddingLeft: 14 }} />
            <div style={{ marginTop: 18 }}>
              <div style={{ marginBottom: 10, color: '#607397', fontSize: 12, fontWeight: 600 }}>{nt('page.t148')}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {['#1687FF', '#19B96B', '#FF9D1A', '#8B3DFF', '#F04461', '#6B7F9F'].map((color) => (
                  <button key={color} type="button" aria-label={nt('page.pickColor', { color })} onClick={() => setFolderColor(color)} style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 9, border: folderColor === color ? '2px solid #243858' : '2px solid transparent', background: `${color}18`, cursor: 'pointer' }}>
                    <MaterialSymbol name="folder" size={21} color={color} />
                  </button>
                ))}
              </div>
            </div>
            <div style={{ ...row('flex-end', 10), marginTop: 18 }}>
              <button onClick={() => { setCreateFolderModal(false); setFolderName(''); setFolderColor('#1687FF') }} style={{ border: 'none', background: 'transparent', color: c.muted, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>{nt('page.t149')}</button>
              <button className="primary-btn" disabled={!folderName.trim()} onClick={() => void createFolder()} style={{ borderRadius: 10, padding: '8px 14px', opacity: folderName.trim() ? 1 : .55 }}>{nt('page.t150')}</button>
            </div>
          </div>
        </div>}

        {renameFolderModal && <div style={modalOverlay} onClick={() => setRenameFolderModal(null)}>
          <div style={{ ...modalPanel, padding: 24, borderRadius: 16 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>{nt('page.t151')}</h3>
            <p style={{ margin: '0 0 16px', color: c.muted, fontSize: 13 }}>{nt('page.t152')}</p>
            <input value={renameFolderName} onChange={(e) => setRenameFolderName(e.target.value)} autoFocus className="search-input" style={{ background: '#fff' }} />
            <div style={{ ...row('flex-end', 10), marginTop: 18 }}>
              <button onClick={() => setRenameFolderModal(null)} style={{ border: 'none', background: 'transparent', color: c.muted, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>{nt('page.t149')}</button>
              <button className="primary-btn" onClick={() => void renameFolder()} style={{ borderRadius: 10, padding: '8px 12px' }}>{nt('page.t153')}</button>
            </div>
          </div>
        </div>}
        {shareToast ? (
          <AppToast
            compact
            message={shareToast.message}
            variant={shareToast.variant}
            onClose={() => setShareToast(null)}
          />
        ) : null}
        {visualizations && visualizations.length > 0 ? (
          <NotesVisualizationModal
            items={visualizations}
            onClose={() => setVisualizations(null)}
            onInsertTables={insertVisualizationTables}
          />
        ) : null}
        {aiResult && (
          <AppModal 
            title={aiResult.type === 'proofread' ? nt('page.t154') : nt('page.t155')} 
            onClose={() => { setAiResult(null); setAiSelection(null); }}
            maxWidth={600}
          >
            {aiResult.type === 'proofread' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ padding: '16px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748B', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{nt('page.t156')}</div>
                  <div style={{ color: '#1E293B', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                    {aiSelection ? aiSelection.originalText : nt('page.t157')}
                  </div>
                </div>
                
                <div style={{ padding: '16px', background: '#F0F9FF', borderRadius: '12px', border: '1px solid #BAE6FD' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#0369A1', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{nt('page.t154')}</div>
                  <div style={{ color: '#0C4A6E', lineHeight: '1.6', fontWeight: 500, whiteSpace: 'pre-wrap' }}>
                    {aiResult.data.corrected_text}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                  <AppButton 
                    onClick={applyAiResult} 
                    style={{ flex: 1, height: '44px' }}
                  >
                    {nt('page.t158')}
                  </AppButton>
                  <AppButton 
                    variant="secondary" 
                    onClick={() => { setAiResult(null); setAiSelection(null); }}
                    style={{ flex: 1, height: '44px' }}
                  >
                    {nt('page.t159')}
                  </AppButton>
                </div>
              </div>
            )}
            
            {aiResult.type === 'summarize' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ 
                  background: '#F8FAFC', 
                  padding: 16, 
                  borderRadius: 12, 
                  fontSize: 14, 
                  lineHeight: 1.6,
                  color: '#334155',
                  maxHeight: 400,
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap'
                }}>
                  {aiResult.data.summary}
                </div>
                {aiResult.data.bullets?.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{nt('page.t160')}</div>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#475569', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {aiResult.data.bullets.map((b: string, i: number) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
                  <AppButton variant="secondary" onClick={() => setAiResult(null)}>{nt('page.t161')}</AppButton>
                </div>
              </div>
            )}
          </AppModal>
        )}
        {tablePicker && (
          <TableDimensionPicker
            x={tablePicker.x}
            y={tablePicker.y}
            onClose={() => setTablePicker(null)}
            onSelect={(r, c) => {
              const rows = Array.from({ length: r }, () => 
                Array.from({ length: c }, () => ({ text: '' }))
              )
              addBlock({ id: bid('t'), type: 'table', rows })
              setTablePicker(null)
            }}
          />
        )}

        {/* Fullscreen premium image preview/lightbox */}
        {previewImageUrl && (
          <div 
            onClick={() => setPreviewImageUrl(null)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              background: 'rgba(0, 0, 0, 0.85)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'zoom-out',
              animation: 'fadeIn 0.2s ease-out'
            }}
          >
            <div 
              style={{
                position: 'absolute',
                top: 20,
                right: 20,
                zIndex: 10000,
                display: 'flex',
                gap: 12
              }}
            >
              <a
                href={previewImageUrl}
                download
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                  textDecoration: 'none'
                }}
                title={nt('page.t163')}
              >
                <MaterialSymbol name="download" size={24} />
              </a>

              <button
                onClick={() => setPreviewImageUrl(null)}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
                title={nt('page.t161')}
              >
                <MaterialSymbol name="close" size={24} />
              </button>
            </div>
            
            <img 
              src={previewImageUrl} 
              alt={nt('page.t164')} 
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: '90vw',
                maxHeight: '90vh',
                objectFit: 'contain',
                borderRadius: 16,
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                cursor: 'default',
                userSelect: 'none'
              }} 
            />
          </div>
        )}
      </div>
    </>
  )
}

const formatAudioTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

function AudioAttachmentPlayer({ block, attachment }: any) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const source = normalizeBackendAssetUrl(attachment?.download_url)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(Number(block.duration ?? attachment?.duration) || 0)
  const [failed, setFailed] = useState(false)
  const fileName = block.caption || attachment?.real_name || nt('page.t165')

  useEffect(() => {
    setPlaying(false)
    setCurrentTime(0)
    setDuration(Number(block.duration ?? attachment?.duration) || 0)
    setFailed(false)
  }, [source, block.duration, attachment?.duration])

  const togglePlayback = async () => {
    const audio = audioRef.current
    if (!audio || !source || failed) return
    if (audio.paused) {
      try { await audio.play(); setPlaying(true) } catch { setFailed(true) }
    } else {
      audio.pause()
      setPlaying(false)
    }
  }

  return (
    <div className="editor-block notes-audio-block" style={{ display: 'grid', gridTemplateColumns: '30px minmax(0, 1fr) 26px', alignItems: 'center', gap: 9, maxWidth: 560, padding: '9px 11px', margin: '5px 0', border: '1px solid #E8E8ED', borderRadius: 13, background: '#F5F5F7', boxShadow: 'none', fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" }}>
      {source && <audio
        ref={audioRef}
        src={source}
        preload="metadata"
        hidden
        onLoadedMetadata={(event) => {
          const mediaDuration = event.currentTarget.duration
          if (Number.isFinite(mediaDuration) && mediaDuration > 0) setDuration(mediaDuration)
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrentTime(duration) }}
        onError={() => setFailed(true)}
      />}
      <button type="button" onClick={() => void togglePlayback()} disabled={!source || failed} aria-label={playing ? nt('page.t166') : nt('page.playFile', { name: fileName })} title={playing ? nt('page.t166') : nt('page.t167')} style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, padding: 0, border: 0, borderRadius: '50%', background: '#E5E5EA', color: '#1D1D1F', cursor: source && !failed ? 'pointer' : 'default', opacity: source && !failed ? 1 : .5 }}>
        {playing ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" style={{ marginLeft: 1 }} />}
      </button>
      <div style={{ minWidth: 0 }}>
        <div title={fileName} style={{ overflow: 'hidden', marginBottom: 5, color: '#1D1D1F', fontSize: 12.5, fontWeight: 600, lineHeight: 1.2, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</div>
        {source && !failed ? <div style={{ display: 'grid', gridTemplateColumns: 'minmax(30px, 1fr) auto', alignItems: 'center', gap: 8 }}>
          <input
            className="notes-audio-seek"
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration || currentTime)}
            disabled={!duration}
            aria-label={nt('page.audioPosition', { name: fileName })}
            onChange={(event) => {
              const nextTime = Number(event.currentTarget.value)
              if (audioRef.current) audioRef.current.currentTime = nextTime
              setCurrentTime(nextTime)
            }}
            style={{ width: '100%', height: 3, margin: 0, background: `linear-gradient(to right, #8E8E93 ${duration ? Math.min(100, currentTime / duration * 100) : 0}%, #D1D1D6 ${duration ? Math.min(100, currentTime / duration * 100) : 0}%)`, cursor: duration ? 'pointer' : 'default' }}
          />
          <span style={{ minWidth: 64, color: '#86868B', fontSize: 10.5, fontVariantNumeric: 'tabular-nums', textAlign: 'right', whiteSpace: 'nowrap' }}>{formatAudioTime(currentTime)} / {formatAudioTime(duration)}</span>
        </div> : <div role={failed ? 'alert' : 'status'} style={{ color: failed ? '#B91C1C' : '#86868B', fontSize: 10.5 }}>{failed ? nt('page.t168') : nt('page.t169')}</div>}
      </div>
      {source && <a href={source} download={attachment?.real_name || fileName} aria-label={nt('page.downloadFile', { name: fileName })} title={nt('page.t170')} style={{ display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: '50%', color: '#8E8E93', textDecoration: 'none' }}><Download size={14} /></a>}
    </div>
  )
}

function BlockEditor({ block, readOnly, activeMarks, attachment, autoFocus, focusAtStart, listNumber, onRequestFocus, onRemoveEmpty, onFocused, slashActive, onSlash, onSlashKey, onChange, onInsertAfter, onPasteMarkdown, onPasteImage, onTextSelect, onRemove, onImageClick }: any) {
  if (block.type === 'audio') return <AudioAttachmentPlayer block={block} attachment={attachment} />
  if (block.type === 'paragraph') {
    return (
      <ParagraphEditor
        key={blockMarksOf(block.runs).join('|')}
        block={block}
        readOnly={readOnly}
        activeMarks={activeMarks}
        autoFocus={autoFocus}
        focusAtStart={focusAtStart}
        listNumber={listNumber}
        onRequestFocus={onRequestFocus}
        onRemoveEmpty={onRemoveEmpty}
        onFocused={onFocused}
        slashActive={slashActive}
        onSlash={onSlash}
        onSlashKey={onSlashKey}
        onChange={onChange}
        onInsertAfter={onInsertAfter}
        onTextSelect={onTextSelect}
        onRemove={onRemove}
        onPasteMarkdown={onPasteMarkdown}
        onPasteImage={onPasteImage}
      />
    )
  }

  if (block.type === 'checklist') return <ChecklistEditor block={block} readOnly={readOnly} autoFocus={autoFocus} onFocused={onFocused} onChange={onChange} onInsertAfter={onInsertAfter} onRemove={onRemove} />

  if (block.type === 'table') {
    return (
      <TableEditor
        block={block}
        readOnly={readOnly}
        onChange={onChange}
        onRemove={onRemove}
      />
    )
  }

  const url = normalizeBackendAssetUrl(attachment?.download_url)
  return (
    <div className="editor-block">
      {url ? (
        <div 
          onClick={() => onImageClick?.(url)}
          style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: '#f8fafc', margin: '6px 0', cursor: 'zoom-in' }}
          title={nt('page.t171')}
        >
          <img src={url} alt={block.alt || attachment?.real_name} style={{ display: 'block', width: '100%', maxHeight: 500, objectFit: 'contain', transition: 'transform 0.2s' }} />
        </div>
      ) : <div style={{ margin: '6px 0', padding: '28px 16px', borderRadius: 10, border: '1px dashed #D5DAE1', textAlign: 'center', color: '#6B7280', fontSize: 13 }}>{attachment ? nt('page.t172') : nt('page.t173')}</div>}
    </div>
  )
}

function TableEditor({ block, readOnly, onChange, onRemove }: any) {
  const [menu, setMenu] = useState<{ type: 'row' | 'col'; index: number; x: number; y: number } | null>(null)
  const [hoveredRow, setHoveredRow] = useState<number | null>(null)
  const [hoveredCol, setHoveredCol] = useState<number | null>(null)
  const [hoveredLine, setHoveredLine] = useState<{ type: 'row' | 'col'; index: number } | null>(null)
  const colCount = block.rows[0]?.length || 0

  const updateCell = (ri: number, ci: number, nextCell: { text: string; html?: string }) => {
    onChange({
      ...block,
      rows: block.rows.map((r: any[], rix: number) =>
        r.map((x, cix) => (rix === ri && cix === ci ? { ...x, ...nextCell } : x)),
      ),
    })
  }

  const insertRow = (index: number) => {
    const nextRow = new Array(colCount || 2).fill(null).map(() => ({ text: '' }))
    const nextRows = [...block.rows]
    nextRows.splice(index, 0, nextRow)
    onChange({ ...block, rows: nextRows })
  }

  const removeRow = (index: number) => {
    if (block.rows.length <= 1) return
    onChange({ ...block, rows: block.rows.filter((_: any, ri: number) => ri !== index) })
  }

  const insertColumn = (index: number) => {
    onChange({
      ...block,
      rows: block.rows.map((r: any[]) => {
        const next = [...r]
        next.splice(index, 0, { text: '' })
        return next
      }),
    })
  }

  const removeColumn = (index: number) => {
    if (colCount <= 1) return
    // Persist the complete table through the same versioned autosave as rows
    // and cell edits, rather than racing it with a second mutation request.
    onChange({
      ...block,
      rows: block.rows.map((r: any[]) => r.filter((_: any, ci: number) => ci !== index)),
    })
  }

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menu])

  return (
    <div className="editor-block" style={{ overflowX: 'visible', padding: '22px 44px 14px 20px' }}>
      <div 
        style={{ position: 'relative', width: '100%', userSelect: 'none' }}
        onMouseLeave={() => { setHoveredRow(null); setHoveredCol(null); setHoveredLine(null) }}
      >
        {/* Column Handles */}
        {!readOnly && <div style={{ position: 'absolute', top: -18, left: 0, right: 0, display: 'flex', height: 18 }}>
          {Array.from({ length: colCount }).map((_, ci) => (
            <div
              key={`col-h-${ci}`}
              onMouseEnter={() => setHoveredCol(ci)}
              style={{
                flex: 1,
                position: 'relative',
                display: 'flex',
                justifyContent: 'center'
              }}
            >
              <div 
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  removeColumn(ci)
                }}
                style={{
                  ...tableHandle,
                  width: 32,
                  height: 14,
                  top: 2,
                  opacity: hoveredCol === ci ? 1 : 0,
                  transform: hoveredCol === ci ? 'translateY(0)' : 'translateY(4px)',
                  background: '#FEF2F2',
                  color: '#EF4444'
                }}
                title={nt('page.t174')}
              >
                <MaterialSymbol name="delete" size={12} />
              </div>

              {/* Column Insertion Line */}
              <div 
                onMouseEnter={() => setHoveredLine({ type: 'col', index: ci + 1 })}
                style={{
                  position: 'absolute',
                  right: -10,
                  top: 0,
                  bottom: 0,
                  width: 20,
                  zIndex: 60,
                  cursor: 'pointer'
                }}
              >
                <div style={{
                  ...tableInsertionLine,
                  right: 9,
                  top: 0,
                  bottom: 0,
                  width: 2,
                  opacity: hoveredLine?.type === 'col' && hoveredLine.index === ci + 1 ? 1 : 0
                }}>
                  <div 
                    onClick={() => insertColumn(ci + 1)}
                    style={{ ...tableActionBtn, width: 18, height: 18, color: '#2458D3', border: '1px solid #2458D3' }}
                  >
                    <MaterialSymbol name="add" size={14} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>}

        {/* Row Handles */}
        {!readOnly && <div style={{ position: 'absolute', left: -18, top: 0, bottom: 0, width: 18, display: 'flex', flexDirection: 'column' }}>
          {block.rows.map((_: any, ri: number) => (
            <div
              key={`row-h-${ri}`}
              onMouseEnter={() => setHoveredRow(ri)}
              style={{
                flex: 1,
                position: 'relative',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <div 
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  removeRow(ri)
                }}
                style={{
                  ...tableHandle,
                  width: 14,
                  height: 32,
                  left: 2,
                  opacity: hoveredRow === ri ? 1 : 0,
                  transform: hoveredRow === ri ? 'translateX(0)' : 'translateX(4px)',
                  background: '#FEF2F2',
                  color: '#EF4444'
                }}
                title={nt('page.t175')}
              >
                <MaterialSymbol name="delete" size={12} />
              </div>

              {/* Row Insertion Line */}
              <div 
                onMouseEnter={() => setHoveredLine({ type: 'row', index: ri + 1 })}
                style={{
                  position: 'absolute',
                  bottom: -10,
                  left: 0,
                  right: 0,
                  height: 20,
                  zIndex: 60,
                  cursor: 'pointer'
                }}
              >
                <div style={{
                  ...tableInsertionLine,
                  bottom: 9,
                  left: 0,
                  right: 0,
                  height: 2,
                  opacity: hoveredLine?.type === 'row' && hoveredLine.index === ri + 1 ? 1 : 0
                }}>
                  <div 
                    onClick={() => insertRow(ri + 1)}
                    style={{ ...tableActionBtn, width: 18, height: 18, color: '#2458D3', border: '1px solid #2458D3' }}
                  >
                    <MaterialSymbol name="add" size={14} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>}

        <table 
          style={{ 
            borderCollapse: 'collapse', 
            tableLayout: 'fixed',
            width: '100%',
            border: '1px solid #E2E8F0',
            borderRadius: 6,
            background: '#fff',
            boxShadow: '0 4px 12px rgba(15,23,42,0.03)'
          }}
        >
          <tbody>
            {block.rows.map((rowArr: any[], ri: number) => (
              <tr key={ri} style={{ background: hoveredRow === ri ? '#F8FAFC' : 'transparent' }}>
                {rowArr.map((cell, ci) => (
                  <td
                    key={`${ri}-${ci}`}
                    onMouseEnter={() => { setHoveredRow(ri); setHoveredCol(ci) }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setMenu({ type: 'row', index: ri, x: e.clientX, y: e.clientY })
                    }}
                    style={{ 
                      border: '1px solid #E2E8F0',
                      padding: 0,
                      verticalAlign: 'top',
                      background: hoveredCol === ci ? '#F8FAFC' : 'transparent',
                      transition: 'background 0.1s'
                    }}
                  >
                    <div style={{ padding: '10px 12px', minHeight: 40, wordBreak: 'break-word' }}>
                      <TableCellEditor
                        cell={cell}
                        readOnly={readOnly}
                        onChange={(next) => {
                          updateCell(ri, ci, next)
                        }}
                      />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Global Delete Button (Close to table) */}
        {!readOnly && <div style={{ position: 'absolute', top: 0, right: -48, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={onRemove}
            style={{
              ...tableActionBtn,
              position: 'relative',
              width: 32,
              height: 32,
              borderRadius: 8,
              color: '#EF4444',
              background: '#FEF2F2',
              border: '1px solid #FEE2E2'
            }}
            title={nt('page.t176')}
          >
            <MaterialSymbol name="delete" size={18} />
          </button>
        </div>}
      </div>

      {/* Premium Context Menu */}
      {menu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: `clamp(8px, ${menu.x}px, calc(100vw - 188px))`,
            top: `clamp(8px, ${menu.y}px, calc(100dvh - 240px))`,
            zIndex: 1000,
            width: 180,
            background: '#fff',
            border: '1px solid #E2E8F0',
            borderRadius: 12,
            boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
            padding: 6,
            animation: 'fadeIn 0.1s ease-out'
          }}
        >
          <div style={{ padding: '4px 8px 8px', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>
            {menu.type === 'row' ? nt('page.t177') : nt('page.t178')}
          </div>
          <button style={tableMenuBtn} onClick={() => { menu.type === 'row' ? insertRow(menu.index) : insertColumn(menu.index); setMenu(null) }}>
            <MaterialSymbol name="keyboard_arrow_up" size={16} /> {menu.type === 'row' ? nt('page.insertAbove') : nt('page.insertLeft')}
          </button>
          <button style={tableMenuBtn} onClick={() => { menu.type === 'row' ? insertRow(menu.index + 1) : insertColumn(menu.index + 1); setMenu(null) }}>
            <MaterialSymbol name="keyboard_arrow_down" size={16} /> {menu.type === 'row' ? nt('page.insertBelow') : nt('page.insertRight')}
          </button>
          <div style={{ height: 1, background: '#F1F5F9', margin: '4px 0' }} />
          <button 
            style={{ ...tableMenuBtn, color: '#EF4444' }} 
            onClick={() => { menu.type === 'row' ? removeRow(menu.index) : removeColumn(menu.index); setMenu(null) }}
          >
            <MaterialSymbol name="delete" size={16} /> {menu.type === 'row' ? nt('page.deleteRow') : nt('page.deleteColumn')}
          </button>
        </div>
      )}
    </div>
  )
}

function TableCellEditor({ cell, readOnly, onChange }: any) {
  const ref = useRef<HTMLDivElement | null>(null)
  const isTyping = useRef(false)

  useEffect(() => {
    if (!ref.current || isTyping.current) return
    const nextHtml = noteTableCellHtml(cell)
    if (ref.current.innerHTML !== nextHtml) {
      ref.current.innerHTML = nextHtml
    }
  }, [cell?.html, cell?.text])

  return (
    <div
      ref={ref}
      className="editor-input"
      contentEditable={!readOnly}
      suppressContentEditableWarning
      onPaste={(e) => {
        e.preventDefault()
        const text = e.clipboardData.getData('text/plain')
        document.execCommand('insertText', false, text)
      }}
      onKeyDown={(e) => {
        const isMod = e.metaKey || e.ctrlKey
        const key = e.key.toLowerCase()
        if (isMod && key === 'b') {
          e.preventDefault()
          document.execCommand('bold', false)
          return
        }
        if (isMod && key === 'i') {
          e.preventDefault()
          document.execCommand('italic', false)
          return
        }
        if (isMod && e.shiftKey && key === 'x') {
          e.preventDefault()
          document.execCommand('strikeThrough', false)
        }
      }}
      onInput={(e) => {
        isTyping.current = true
        const el = e.currentTarget
        onChange({ text: el.innerText || '', html: el.innerHTML || '' })
        setTimeout(() => { isTyping.current = false }, 10)
      }}
      style={{
        fontSize: 14,
        minHeight: 30,
        lineHeight: 1.45,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        padding: '2px 0',
      }}
    />
  )
}

function ChecklistEditor({ block, readOnly, autoFocus, onFocused, onChange, onInsertAfter, onRemove }: any) {
  const firstRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (!autoFocus) return
    firstRef.current?.focus()
    onFocused?.()
  }, [autoFocus])

  return (
    <div className="editor-block" style={{ display: 'grid', gap: 1 }}>
      {block.items.map((it: any, i: number) => {
        const done = Boolean(it.checked || it.is_done)
        return (
          <div key={it.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              type="button"
              role="checkbox"
              aria-checked={done}
              aria-label={done ? nt('page.t185') : nt('page.t186')}
              disabled={readOnly}
              onClick={() => onChange({ ...block, items: block.items.map((x: any, ix: number) => ix === i ? { ...x, checked: !done, is_done: !done } : x) })}
              style={{ width: 16, height: 16, flex: '0 0 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, borderRadius: 4, border: `1px solid ${done ? '#A3ADBA' : '#C5CAD1'}`, background: done ? '#A3ADBA' : '#fff', color: '#fff', cursor: readOnly ? 'default' : 'pointer' }}
            >
              {done && <Check size={11} strokeWidth={3.2} />}
            </button>
            <input
              ref={i === 0 ? firstRef : undefined}
              className="editor-input"
              value={it.text}
              readOnly={readOnly}
              onChange={(e) => onChange({ ...block, items: block.items.map((x: any, ix: number) => ix === i ? { ...x, text: e.target.value } : x) })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (!it.text.trim()) {
                    const restItems = block.items.filter((_: any, ix: number) => ix !== i)
                    if (restItems.length) onChange({ ...block, items: restItems })
                    else onRemove()
                    onInsertAfter?.({ id: bid('p'), type: 'paragraph', runs: [{ text: '' }] })
                    return
                  }
                  const nextItems = [...block.items]
                  nextItems.splice(i + 1, 0, { id: bid('i'), text: '', checked: false })
                  onChange({ ...block, items: nextItems })
                  window.requestAnimationFrame(() => {
                    const inputs = (e.target as HTMLElement).closest('.editor-block')?.querySelectorAll<HTMLInputElement>('input.editor-input')
                    inputs?.[i + 1]?.focus()
                  })
                  return
                }
                if (e.key === 'Backspace' && !it.text) {
                  e.preventDefault()
                  if (block.items.length > 1) onChange({ ...block, items: block.items.filter((_: any, ix: number) => ix !== i) })
                  else onChange({ id: block.id, type: 'paragraph', runs: [{ text: '' }] })
                }
              }}
              placeholder={nt('page.t187')}
              style={{ padding: '3px 0', lineHeight: 1.6, color: done ? '#9CA3AF' : '#1F2937', textDecoration: done ? 'line-through' : 'none' }}
            />
          </div>
        )
      })}
    </div>
  )
}

const paragraphHeadingStyles: Record<1 | 2 | 3, React.CSSProperties> = {
  1: { fontSize: 26, fontWeight: 700, lineHeight: 1.25, marginTop: 22, letterSpacing: '-0.015em', color: '#111827' },
  2: { fontSize: 20, fontWeight: 700, lineHeight: 1.3, marginTop: 20, letterSpacing: '-0.01em', color: '#111827' },
  3: { fontSize: 17, fontWeight: 650, lineHeight: 1.35, marginTop: 14, color: '#111827' },
}
const SLASH_TEXT = /^\/[^\s/]*$/
// Блочные метки абзаца: заголовки и списки. Хранятся в marks каждого run, как и heading1..3 из markdown-парсера.
const BLOCK_MARK = /^(heading[1-3]|list:(bullet|ordered))$/
const blockMarksOf = (runs?: { marks?: string[] }[]) => [...new Set((runs ?? []).flatMap((run) => (run.marks ?? []).filter((m) => BLOCK_MARK.test(m))))]
const listTypeOf = (runs?: { marks?: string[] }[]): 'bullet' | 'ordered' | null => {
  const marks = blockMarksOf(runs)
  return marks.includes('list:bullet') ? 'bullet' : marks.includes('list:ordered') ? 'ordered' : null
}
const DEFAULT_TEXT_COLORS = new Set(['rgb(31, 41, 55)', '#1f2937', '#1F2937'])
const isTransparentColor = (value: string) => !value || value === 'transparent' || value === 'rgba(0, 0, 0, 0)' || value === 'initial' || value === 'inherit'
const TEXT_COLORS = [
  { get label() { return nt('page.t188') }, value: '#1F2937' },
  { get label() { return nt('page.t189') }, value: '#6B7280' },
  { get label() { return nt('page.t190') }, value: '#DC2626' },
  { get label() { return nt('page.t191') }, value: '#EA580C' },
  { get label() { return nt('page.t192') }, value: '#CA8A04' },
  { get label() { return nt('page.t193') }, value: '#16A34A' },
  { get label() { return nt('page.t194') }, value: '#2563EB' },
  { get label() { return nt('page.t195') }, value: '#7C3AED' },
  { get label() { return nt('page.t196') }, value: '#DB2777' },
  { get label() { return nt('page.t197') }, value: '#0D9488' },
  { get label() { return nt('page.t198') }, value: '#92400E' },
  { get label() { return nt('page.t199') }, value: '#111827' },
]
const HIGHLIGHT_COLORS = [
  { get label() { return nt('page.t200') }, value: 'transparent' },
  { get label() { return nt('page.t201') }, value: '#F1F2F4' },
  { get label() { return nt('page.t202') }, value: '#FEE2E2' },
  { get label() { return nt('page.t203') }, value: '#FFEDD5' },
  { get label() { return nt('page.t204') }, value: '#FEF3C7' },
  { get label() { return nt('page.t205') }, value: '#DCFCE7' },
  { get label() { return nt('page.t206') }, value: '#DBEAFE' },
  { get label() { return nt('page.t207') }, value: '#EDE9FE' },
  { get label() { return nt('page.t208') }, value: '#FCE7F3' },
  { get label() { return nt('page.t209') }, value: '#CCFBF1' },
  { get label() { return nt('page.t210') }, value: '#F5EBDD' },
  { get label() { return nt('page.t211') }, value: '#E0F2FE' },
]
const MARKDOWN_SHORTCUTS: [RegExp, string][] = [
  [/^###\s/, 'heading3'],
  [/^##\s/, 'heading2'],
  [/^#\s/, 'heading1'],
  [/^[-*•]\s/, 'list:bullet'],
  [/^1[.)]\s/, 'list:ordered'],
]
const dropPrefix = (runs: any[], length: number) => {
  let rest = length
  return runs.map((run) => {
    if (rest <= 0) return run
    const cut = Math.min(rest, run.text.length)
    rest -= cut
    return { ...run, text: run.text.slice(cut) }
  }).filter((run, index, arr) => run.text || arr.length === 1)
}

function ParagraphEditor({ block, readOnly, activeMarks, autoFocus, focusAtStart, listNumber, onRequestFocus, onRemoveEmpty, onFocused, slashActive, onSlash, onSlashKey, onChange, onInsertAfter, onTextSelect, onRemove, onPasteMarkdown, onPasteImage }: any) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const isTyping = useRef(false)
  const headingLevel = getParagraphHeadingLevel(block.runs)
  const blockMarks = blockMarksOf(block.runs)
  const listType = listTypeOf(block.runs)
  const escapeHtml = (value: string) => value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

  const runsToHtml = (runs: any[]) => {
    return runs.map(run => {
      const cMark = colorMark(run.marks)
      const cValue = cMark ? cMark.replace('color:', '') : ''
      const bgValue = (run.marks ?? []).find((m: string) => m.startsWith('bg:'))?.slice(3) || ''
      const safeText = escapeHtml(run.text || '').replace(/\n/g, '<br/>')
      const style = `${cValue ? `color:${escapeHtml(cValue)};` : ''}${bgValue ? `background-color:${escapeHtml(bgValue)};border-radius:3px;padding:0 2px;` : ''}`
      let node = `<span style="${style}">${safeText}</span>`
      if (run.marks?.includes('bold')) node = `<b>${node}</b>`
      if (run.marks?.includes('italic')) node = `<i>${node}</i>`
      if (run.marks?.includes('strike')) node = `<s>${node}</s>`
      return node
    }).join('') || ''
  }

  useEffect(() => {
    if (!rootRef.current || (isTyping.current && !autoFocus)) return
    const html = runsToHtml(block.runs)
    if (rootRef.current.innerHTML !== html) {
      rootRef.current.innerHTML = html
    }
  }, [block.runs, autoFocus])

  useEffect(() => {
    const el = rootRef.current
    if (!autoFocus || !el) return
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(Boolean(focusAtStart))
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    const text = el.innerText || ''
    if (SLASH_TEXT.test(text)) onSlash?.({ query: text.slice(1), rect: el.getBoundingClientRect() })
    onFocused?.()
  }, [autoFocus])

  const serialize = (el: HTMLElement) => {
    const runs: any[] = []
    const walk = (node: Node, marks: string[]) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent) runs.push({ text: node.textContent, marks: [...marks] })
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement
        const tag = element.tagName
        if (tag === 'BR') {
          runs.push({ text: '\n', marks: [...marks] })
          return
        }
        let nextMarks = [...marks]
        if (tag === 'B' || tag === 'STRONG' || element.style.fontWeight === 'bold' || Number(element.style.fontWeight) >= 600) nextMarks.push('bold')
        if (tag === 'I' || tag === 'EM' || element.style.fontStyle === 'italic') nextMarks.push('italic')
        const textDecoration = element.style.textDecoration || element.style.textDecorationLine || ''
        if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || textDecoration.includes('line-through')) nextMarks.push('strike')
        const styleColor = element.style.color
        const fontColor = tag === 'FONT' ? element.getAttribute('color') : ''
        const pickedColor = styleColor || fontColor || ''
        if (pickedColor) {
          nextMarks = nextMarks.filter((m) => !m.startsWith('color:'))
          if (!DEFAULT_TEXT_COLORS.has(pickedColor)) nextMarks.push(`color:${pickedColor}`)
        }
        const background = element.style.backgroundColor
        if (background) {
          nextMarks = nextMarks.filter((m) => !m.startsWith('bg:'))
          if (!isTransparentColor(background)) nextMarks.push(`bg:${background}`)
        }
        node.childNodes.forEach(child => walk(child, [...new Set(nextMarks)]))
      }
    }
    el.childNodes.forEach(child => walk(child, []))
    return runs.length ? runs : [{ text: '', marks: [] }]
  }

  // Сохраняем блочные метки (заголовок/список) при наборе текста — в DOM они не хранятся.
  const withBlockMarks = (runs: any[], marks: string[] = blockMarks) => runs.map((run) => ({
    ...run,
    marks: [...(run.marks ?? []).filter((m: string) => !BLOCK_MARK.test(m)), ...marks],
  }))

  const caretAtStart = () => {
    const root = rootRef.current
    const selection = window.getSelection()
    if (!root || !selection || selection.rangeCount === 0 || !selection.isCollapsed) return false
    const range = selection.getRangeAt(0)
    if (!root.contains(range.startContainer)) return false
    const before = document.createRange()
    before.selectNodeContents(root)
    before.setEnd(range.startContainer, range.startOffset)
    return before.toString().length === 0
  }

  const splitBlock = () => {
    const root = rootRef.current
    const selection = window.getSelection()
    if (!root || !selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    if (!root.contains(range.startContainer)) return
    range.deleteContents()
    const tail = document.createRange()
    tail.setStart(range.endContainer, range.endOffset)
    tail.setEnd(root, root.childNodes.length)
    const holder = document.createElement('div')
    holder.appendChild(tail.extractContents())
    const headRuns = serialize(root)
    const tailRuns = serialize(holder)
    const headText = headRuns.map((run: any) => run.text).join('')
    const tailText = tailRuns.map((run: any) => run.text).join('')
    isTyping.current = false
    if (listType && !headText.trim() && !tailText.trim()) {
      // Enter в пустом пункте списка — выходим из списка.
      onChange({ ...block, runs: [{ text: '', marks: [] }] })
      onRequestFocus?.()
      return
    }
    onChange({ ...block, runs: withBlockMarks(headRuns) })
    onInsertAfter?.({ id: bid('p'), type: 'paragraph', runs: withBlockMarks(tailRuns, listType ? [`list:${listType}`] : []) })
  }

  const onInput = (e: React.FormEvent<HTMLDivElement>) => {
    isTyping.current = true
    const el = e.currentTarget
    const text = el.innerText || ''
    const raw = serialize(el)
    if (!blockMarks.length) {
      const shortcut = MARKDOWN_SHORTCUTS.find(([pattern]) => pattern.test(text))
      if (shortcut) {
        const prefix = text.match(shortcut[0])![0].length
        isTyping.current = false
        onChange({ ...block, runs: withBlockMarks(dropPrefix(raw, prefix), [shortcut[1]]) })
        onRequestFocus?.()
        return
      }
      if (/^\[\]\s/.test(text)) {
        isTyping.current = false
        onChange({ id: block.id, type: 'checklist', items: [{ id: bid('i'), text: text.slice(3).replace(/\n$/, ''), checked: false }] })
        onRequestFocus?.()
        return
      }
    }
    onChange({ ...block, runs: withBlockMarks(raw) })
    if (SLASH_TEXT.test(text)) onSlash?.({ query: text.slice(1), rect: el.getBoundingClientRect() })
    else if (slashActive) onSlash?.(null)
    setTimeout(() => { isTyping.current = false }, 10)
  }

  const rememberSelection = () => {
    const root = rootRef.current
    const selection = window.getSelection()
    if (!root || !selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return
    
    const beforeRange = range.cloneRange()
    beforeRange.selectNodeContents(root)
    beforeRange.setEnd(range.startContainer, range.startOffset)
    const start = beforeRange.toString().length
    
    const endRange = range.cloneRange()
    endRange.selectNodeContents(root)
    endRange.setEnd(range.endContainer, range.endOffset)
    const end = endRange.toString().length

    onTextSelect?.({ blockId: block.id, start, end })
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      {listType && (
        <span
          aria-hidden="true"
          style={{ flex: '0 0 auto', minWidth: 24, padding: '3px 6px 0 2px', lineHeight: 1.6, fontSize: 14.5, color: '#374151', userSelect: 'none', textAlign: listType === 'ordered' ? 'right' : 'center' }}
        >
          {listType === 'bullet' ? '•' : `${listNumber || 1}.`}
        </span>
      )}
      <div
        ref={rootRef}
        className="editor-input notes-paragraph"
        role="textbox"
        aria-label={headingLevel ? nt('page.t212') : listType ? nt('page.t213') : nt('page.t214')}
        aria-multiline="true"
        aria-readonly={readOnly}
        data-empty={!block.runs?.some((run) => run.text)}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onPaste={(e) => {
          const imageFile = Array.from(e.clipboardData.files || []).find((file) => file.type.startsWith('image/'))
          if (imageFile && onPasteImage) {
            e.preventDefault()
            onPasteImage(imageFile)
            return
          }
          const text = e.clipboardData.getData('text/plain')
          if (onPasteMarkdown && looksLikeMarkdown(text)) {
            e.preventDefault()
            onPasteMarkdown(text)
            return
          }
          e.preventDefault()
          document.execCommand('insertText', false, text)
        }}
        onMouseUp={rememberSelection}
        onKeyDown={(e) => {
          if (slashActive && onSlashKey?.(e)) return
          const isMod = e.metaKey || e.ctrlKey
          const key = e.key.toLowerCase()
          if (isMod && key === 'b') {
            e.preventDefault()
            document.execCommand('bold', false)
            return
          }
          if (isMod && key === 'i') {
            e.preventDefault()
            document.execCommand('italic', false)
            return
          }
          if (isMod && e.shiftKey && key === 'x') {
            e.preventDefault()
            document.execCommand('strikeThrough', false)
            return
          }
          if (e.key === 'Backspace' && caretAtStart()) {
            if (blockMarks.length) {
              // Backspace в начале заголовка/пункта списка превращает его в обычный текст.
              e.preventDefault()
              isTyping.current = false
              onChange({ ...block, runs: withBlockMarks(serialize(e.currentTarget), []) })
              onRequestFocus?.()
              return
            }
            if (!(e.currentTarget.innerText || '').replace(/\n$/, '')) {
              e.preventDefault()
              onRemoveEmpty?.()
              return
            }
          }
          if (e.key === 'Enter' && !(e.nativeEvent as KeyboardEvent).isComposing) {
            e.preventDefault()
            if (e.shiftKey) document.execCommand('insertLineBreak')
            else splitBlock()
          }
        }}
        onKeyUp={() => {
          rememberSelection()
        }}
        onInput={onInput}
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 24,
          padding: '3px 0',
          background: 'transparent',
          lineHeight: 1.6,
          fontSize: 14.5,
          color: '#1F2937',
          outline: 'none',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          ...(headingLevel ? paragraphHeadingStyles[headingLevel] : {}),
        }}
        data-placeholder={headingLevel ? nt('page.t212') : listType ? nt('page.t213') : nt('page.t215')}
      />
    </div>
  )
}

const headerBar: React.CSSProperties = { height: 58, flex: '0 0 58px', display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', borderBottom: '1px solid #EDEFF2', background: '#fff' }
const crumbBtn: React.CSSProperties = { flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: 0, border: 0, background: 'transparent', color: '#374151', font: 'inherit', cursor: 'pointer' }
const metaBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, padding: '2px 4px', border: 0, borderRadius: 6, background: 'transparent', color: '#111827', font: 'inherit', fontSize: 13, cursor: 'pointer' }
const row = (justify = 'flex-start', gap = 8): React.CSSProperties => ({ display: 'flex', alignItems: 'center', justifyContent: justify, gap, flexWrap: 'wrap' })
const sidebarBtn = (active: boolean): React.CSSProperties => ({ 
  display: 'flex', 
  alignItems: 'center', 
  gap: 14, 
  width: '100%', 
  padding: '10px 16px', 
  borderRadius: 14, 
  cursor: 'pointer', 
  fontSize: 14, 
  fontWeight: 600, 
  transition: 'all 0.2s cubic-bezier(0.2, 0, 0, 1)',
  background: active ? 'rgba(255, 255, 255, 0.7)' : 'transparent',
  border: active ? '1px solid rgba(255, 255, 255, 0.5)' : '1px solid transparent',
  backdropFilter: active ? 'blur(10px)' : 'none',
  boxShadow: active ? '0 4px 12px rgba(0,0,0,0.03)' : 'none',
  color: active ? '#0F172A' : '#64748B'
})
const menuBtn: React.CSSProperties = { width: '100%', border: 0, borderRadius: 12, background: 'transparent', color: c.text, padding: '12px 16px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }
const folderDropdownItem: React.CSSProperties = { width: '100%', minHeight: 42, border: 0, background: '#fff', color: '#243858', padding: '8px 12px', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }
const iconBtn: React.CSSProperties = { border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.muted }
const editor: React.CSSProperties = { position: 'relative', padding: 20, background: '#fff', border: `1px solid ${c.border}`, borderRadius: 20 }
const input: React.CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 16, padding: '14px 20px', fontSize: 15, fontWeight: 500, outline: 'none', width: '100%' }
const btn = (bg: string, border: string, color = '#fff'): React.CSSProperties => ({ background: bg, border: `1px solid ${border}`, color, borderRadius: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.2s' })
const actionIconBtn: React.CSSProperties = { border: 'none', background: 'transparent', width: 36, height: 36, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }
const pill: React.CSSProperties = { background: 'rgba(0,0,0,0.04)', padding: '4px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, color: c.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }
const toolBtn: React.CSSProperties = { border: 'none', background: 'transparent', width: 44, height: 44, borderRadius: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' }
const noteModalOverlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(9, 9, 11, 0.4)', backdropFilter: 'blur(3px)', padding: 20 }
const noteModalPanel: React.CSSProperties = { background: '#fff', width: 'min(100%, 1100px)', height: 'min(100%, 92vh)', borderRadius: 16, overflow: 'auto', boxShadow: 'var(--ts-shadow-dialog)', position: 'relative' }
const modalOverlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(9, 9, 11, 0.6)', backdropFilter: 'blur(3px)', padding: 20 }
const modalPanel: React.CSSProperties = { background: '#fff', borderRadius: 16, width: 'min(100%, 480px)', maxHeight: 'calc(100dvh - 40px)', overflowY: 'auto', boxShadow: 'var(--ts-shadow-dialog)' }
const tableMenuBtn: React.CSSProperties = { width: '100%', border: 0, borderRadius: 8, background: 'transparent', color: '#334155', padding: '9px 12px', fontSize: 13, fontWeight: 500, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, transition: 'background 0.1s' }
const tableActionBtn: React.CSSProperties = {
  position: 'absolute',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 20,
  height: 20,
  borderRadius: 4,
  background: '#fff',
  border: '1px solid #E2E8F0',
  color: '#94A3B8',
  cursor: 'pointer',
  boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  zIndex: 100
}
const tableHandle: React.CSSProperties = {
  position: 'absolute',
  background: '#F1F5F9',
  borderRadius: 4,
  cursor: 'pointer',
  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 50,
  color: '#94A3B8'
}
const tableInsertionLine: React.CSSProperties = {
  position: 'absolute',
  background: '#2458D3',
  opacity: 0,
  transition: 'opacity 0.2s',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 60
}

function TableDimensionPicker({ x, y, onSelect, onClose }: { x: number, y: number, onSelect: (r: number, c: number) => void, onClose: () => void }) {
  const [hovered, setHovered] = useState({ r: 0, c: 0 })
  const grid = Array.from({ length: 10 }, (_, r) => Array.from({ length: 10 }, (_, c) => ({ r: r + 1, c: c + 1 })))

  return (
    <div 
      style={{ 
        position: 'fixed', 
        left: `clamp(8px, ${x}px, calc(100vw - 268px))`,
        top: `clamp(8px, ${y - 270}px, calc(100dvh - 280px))`,
        width: 260,
        maxWidth: 'calc(100vw - 16px)',
        maxHeight: 'calc(100dvh - 16px)',
        overflowY: 'auto',
        zIndex: 1400, 
        background: '#fff', 
        border: '1px solid #E2E8F0', 
        borderRadius: 14, 
        boxShadow: '0 20px 50px rgba(15,23,42,0.2)', 
        padding: 12 
      }}
      onMouseLeave={() => setHovered({ r: 0, c: 0 })}
    >
      <div style={{ marginBottom: 10, fontSize: 12, fontWeight: 700, color: '#1E293B', display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'space-between' }}>
        <span>{nt('page.t216')}</span>
        <span style={{ color: '#2458D3' }}>{hovered.r > 0 ? `${hovered.r} x ${hovered.c}` : nt('page.t217')}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 3 }}>
        {grid.flat().map((cell) => {
          const isSelected = cell.r <= hovered.r && cell.c <= hovered.c
          return (
            <div
              key={`${cell.r}-${cell.c}`}
              onMouseEnter={() => setHovered({ r: cell.r, c: cell.c })}
              onClick={() => onSelect(cell.r, cell.c)}
              style={{
                width: 18,
                height: 18,
                border: '1px solid #E2E8F0',
                borderRadius: 4,
                background: isSelected ? '#EEF2FF' : '#F8FAFC',
                borderColor: isSelected ? '#2458D3' : '#E2E8F0',
                cursor: 'pointer',
                transition: 'all 0.1s'
              }}
            />
          )
        })}
      </div>
      <div 
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: -1 }}
      />
    </div>
  )
}
