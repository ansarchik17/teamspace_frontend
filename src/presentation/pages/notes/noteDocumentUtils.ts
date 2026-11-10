import type { Note, NoteContentDoc } from '../../../domain/entities/Note'
import { nt } from './notesText'

export type NoteBlock =
  | { id: string; type: 'paragraph'; runs: { text: string; marks?: string[] }[] }
  | { id: string; type: 'checklist'; items: { id: string; text: string; checked?: boolean; is_done?: boolean }[] }
  | { id: string; type: 'table'; rows: { text: string; html?: string }[][] }
  | { id: string; type: 'image'; attachmentId: string; alt?: string }
  | { id: string; type: 'audio'; attachmentId: string; caption?: string; duration?: number | null; is_recording?: boolean }

export type NoteDoc = NoteContentDoc

export const bid = (p = 'b') => `${p}_${Date.now()}_${Math.random().toString(16).slice(2)}`

export const emptyDoc = (): NoteDoc => ({
  type: 'doc',
  version: 1,
  blocks: [{ id: 'p0', type: 'paragraph', runs: [{ text: '' }] }],
})

export const textOf = (doc?: NoteDoc | null) =>
  doc?.blocks
    ?.map((b) =>
      b.type === 'paragraph'
        ? (b.runs ?? []).map((r) => r.text).join('')
        : b.type === 'checklist'
          ? (b.items ?? []).map((i) => `${i.checked || i.is_done ? '✓' : '○'} ${i.text}`).join('\n')
          : b.type === 'table'
            ? (b.rows ?? []).map((r) => r.map((cell) => cell.text).join(' | ')).join('\n')
            : b.type === 'audio' ? nt('doc.t00') : nt('doc.t01'),
    )
    .join('\n') ?? ''

export const titleOf = (n?: Note | null) =>
  n?.title?.trim() || (n?.content_text || n?.content || textOf(n?.content_doc)).split('\n').find((v) => v.trim()) || nt('doc.t02')

export const docOf = (n?: Note | null): NoteDoc => {
  const withNoteTags = (doc: NoteDoc): NoteDoc => Array.isArray(n?.tags)
    ? { ...doc, page: { ...doc.page, tags: n.tags } }
    : doc
  if (n?.content_doc?.blocks?.length) {
    return withNoteTags(n.content_doc as NoteDoc)
  }
  if (n?.checklist_items?.length) {
    return withNoteTags({
      type: 'doc',
      version: 1,
      blocks: [{ id: 'c0', type: 'checklist', items: n.checklist_items }],
    })
  }
  const lines = (n?.content || n?.content_text || '').split('\n')
  if (lines.length > 0 && lines.some((line) => line.length > 0)) {
    return withNoteTags({
      type: 'doc',
      version: 1,
      blocks: lines.map((line, i) => ({
        id: `p${i}`,
        type: 'paragraph',
        runs: [{ text: line }],
      })),
    })
  }
  return withNoteTags(emptyDoc())
}

export const isChecklistOnly = (d: NoteDoc) => d.blocks.length === 1 && d.blocks[0]?.type === 'checklist'

export const hasRich = (d: NoteDoc) =>
  d.blocks.some(
    (b) =>
      b.type === 'table' ||
      b.type === 'image' ||
      (b.type === 'paragraph' && (b.runs ?? []).some((r) => r.marks?.length)),
  )

export const draftKey = (title: string, doc: NoteDoc) => JSON.stringify({ title, doc })

export const buildNotesUrl = (noteId?: string) => {
  const normalizedNoteId = noteId?.trim()
  return normalizedNoteId ? `/notes?noteId=${encodeURIComponent(normalizedNoteId)}` : '/notes'
}

export const buildAbsoluteNoteUrl = (noteId: string) => {
  const url = new URL(window.location.href)
  url.search = `?noteId=${encodeURIComponent(noteId)}`
  url.hash = ''
  return url.toString()
}

export const isNoteNotFoundError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false
  const status = (error as { status?: number }).status
  const code = (error as { code?: string }).code
  return status === 404 || code === 'NOTE_NOT_FOUND'
}
