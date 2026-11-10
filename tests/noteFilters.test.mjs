import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import ts from 'typescript'

// Compile the filter module with the existing compiler. Its i18n bridge uses
// the real Russian catalog; data: modules cannot resolve relative imports.
const source = readFileSync(new URL('../src/presentation/pages/notes/noteFilters.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } })
const catalog = JSON.parse(readFileSync(new URL('../src/shared/i18n/locales/ru/notes.json', import.meta.url), 'utf8'))
const translations = `const catalog = ${JSON.stringify(catalog)}; export const nt = key => key.split('.').reduce((value, part) => value[part], catalog);`
const translationsUrl = `data:text/javascript;base64,${Buffer.from(translations).toString('base64')}`
const executable = outputText.replace(/(['\"])\.\/notesText\1/, JSON.stringify(translationsUrl))
const { DEFAULT_NOTE_FILTERS, matchesNoteFilters, noteFilterLabels, loadFilteredNotes } = await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}`)
const now = new Date(2026, 8, 21, 14)
const note = (id, props = {}) => ({ id, type: 'text', is_pinned: false, updated_at: now.toISOString(), ...props })

test('defaults and active filter count', () => {
  assert.equal(matchesNoteFilters(note('a'), DEFAULT_NOTE_FILTERS, now), true)
  assert.deepEqual(noteFilterLabels(DEFAULT_NOTE_FILTERS), [])
  assert.equal(noteFilterLabels({ type: 'rich', period: 'week', pinnedOnly: true }).length, 3)
})

test('type and pin filters combine with AND', () => {
  const filters = { type: 'checklist', period: 'all', pinnedOnly: true }
  assert.equal(matchesNoteFilters(note('a', { type: 'checklist', is_pinned: true }), filters, now), true)
  assert.equal(matchesNoteFilters(note('b', { type: 'checklist' }), filters, now), false)
  assert.equal(matchesNoteFilters(note('c', { is_pinned: true }), filters, now), false)
})

test('calendar periods include the first local midnight and exclude earlier dates', () => {
  for (const [period, days] of [['today', 0], ['week', 6], ['month', 29]]) {
    const boundary = new Date(now)
    boundary.setHours(0, 0, 0, 0)
    boundary.setDate(boundary.getDate() - days)
    const filters = { ...DEFAULT_NOTE_FILTERS, period }
    assert.equal(matchesNoteFilters(note('a', { updated_at: boundary.toISOString() }), filters, now), true)
    assert.equal(matchesNoteFilters(note('b', { updated_at: new Date(+boundary - 1).toISOString() }), filters, now), false)
    assert.equal(matchesNoteFilters(note('c', { updated_at: 'invalid' }), filters, now), false)
    assert.equal(matchesNoteFilters(note('d', { updated_at: new Date(+now + 1).toISOString() }), filters, now), false)
  }
})

test('matches beyond the first page are returned; search/folder/archive stay in every request', async () => {
  const requests = []
  const pages = [
    { items: Array.from({ length: 20 }, (_, i) => note(`plain-${i}`)), nextCursor: 'page-2' },
    { items: [note('match', { is_pinned: true })], nextCursor: null },
  ]
  const result = await loadFilteredNotes(async params => { requests.push(params); return pages.shift() },
    { limit: 20, q: 'project', folderId: 'folder', isArchived: true }, { ...DEFAULT_NOTE_FILTERS, pinnedOnly: true })
  assert.deepEqual(result.items.map(item => item.id), ['match'])
  assert.equal(result.nextCursor, null)
  assert.deepEqual(requests.map(p => p.cursor), [null, 'page-2'])
  for (const request of requests) {
    assert.equal(request.q, 'project')
    assert.equal(request.folderId, 'folder')
    assert.equal(request.isArchived, true)
  }
})

test('pagination does not discard matches or repeat IDs', async () => {
  const result = await loadFilteredNotes(async () => ({ items: [note('a'), note('a'), note('b'), note('c')], nextCursor: 'next' }),
    { limit: 2, cursor: 'current' }, DEFAULT_NOTE_FILTERS)
  assert.deepEqual(result.items.map(item => item.id), ['a', 'b', 'c'])
  assert.equal(result.nextCursor, 'next')
})

test('no matches scans through the end', async () => {
  let calls = 0
  const result = await loadFilteredNotes(async () => ({ items: [note(String(calls))], nextCursor: ++calls < 3 ? String(calls) : null }),
    {}, { ...DEFAULT_NOTE_FILTERS, pinnedOnly: true })
  assert.equal(calls, 3)
  assert.deepEqual(result, { items: [], nextCursor: null })
})

test('a superseded request stops scanning and returns no stale result', async () => {
  let current = true
  const result = await loadFilteredNotes(async () => { current = false; return { items: [note('a')], nextCursor: 'next' } },
    {}, DEFAULT_NOTE_FILTERS, () => current)
  assert.equal(result, null)
})

test('broken repeating cursors fail instead of causing an infinite request loop', async () => {
  await assert.rejects(loadFilteredNotes(async () => ({ items: [], nextCursor: 'same' }),
    { cursor: 'same' }, DEFAULT_NOTE_FILTERS), /следующую страницу/)
})
