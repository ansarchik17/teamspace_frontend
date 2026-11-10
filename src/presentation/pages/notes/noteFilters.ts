import type { Note, NoteType, NotesListParams, NotesListResult } from '../../../domain/entities/Note'
import { nt } from './notesText'

export interface NoteFilters {
  type: 'all' | NoteType
  period: 'all' | 'today' | 'week' | 'month'
  pinnedOnly: boolean
}

export const DEFAULT_NOTE_FILTERS: NoteFilters = { type: 'all', period: 'all', pinnedOnly: false }
export const NOTE_TYPE_LABELS = {
  get all() { return nt('filters.t00') },
  get text() { return nt('filters.t01') },
  get checklist() { return nt('filters.t02') },
  get rich() { return nt('filters.t03') },
  get audio() { return nt('filters.t04') },
}
export const NOTE_PERIOD_LABELS = {
  get all() { return nt('filters.t05') },
  get today() { return nt('filters.t06') },
  get week() { return nt('filters.t07') },
  get month() { return nt('filters.t08') },
}

export function noteFilterLabels(filters: NoteFilters): string[] {
  return [
    filters.type !== 'all' ? NOTE_TYPE_LABELS[filters.type] : '',
    filters.period !== 'all' ? NOTE_PERIOD_LABELS[filters.period] : '',
    filters.pinnedOnly ? nt('filters.t09') : '',
  ].filter(Boolean)
}

export function matchesNoteFilters(note: Note, filters: NoteFilters, now = new Date()): boolean {
  if (filters.type !== 'all' && note.type !== filters.type) return false
  if (filters.pinnedOnly && !note.is_pinned) return false
  if (filters.period !== 'all') {
    const since = new Date(now)
    since.setHours(0, 0, 0, 0)
    if (filters.period === 'week') since.setDate(since.getDate() - 6)
    if (filters.period === 'month') since.setDate(since.getDate() - 29)
    const updated = new Date(note.updated_at || note.created_at).getTime()
    if (!Number.isFinite(updated) || updated < since.getTime() || updated > now.getTime()) return false
  }
  return true
}

// The API paginates before these filters. Scan consecutive pages until a full
// filtered batch or the end, keeping the server cursor and every matching item.
export async function loadFilteredNotes(
  listNotes: (params: NotesListParams) => Promise<NotesListResult>,
  params: NotesListParams,
  filters: NoteFilters,
  isCurrent: () => boolean = () => true,
  predicate: (note: Note) => boolean = () => true,
  scanAll = false,
): Promise<NotesListResult | null> {
  const items: Note[] = []
  const seenIds = new Set<string>()
  const seenCursors = new Set<string>()
  const now = new Date()
  let cursor = params.cursor || null
  do {
    if (!isCurrent()) return null
    if (cursor) seenCursors.add(cursor)
    const page = await listNotes({ ...params, cursor })
    if (!isCurrent()) return null
    for (const note of page.items) {
      if (!seenIds.has(note.id) && matchesNoteFilters(note, filters, now) && predicate(note)) {
        seenIds.add(note.id)
        items.push(note)
      }
    }
    cursor = page.nextCursor || null
    if (cursor && seenCursors.has(cursor)) throw new Error(nt('filters.t10'))
  } while (cursor && items.length < (scanAll ? 2000 : params.limit ?? 20))
  return { items, nextCursor: cursor }
}
