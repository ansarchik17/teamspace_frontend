import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import ts from 'typescript'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const compile = code => ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
function load(path, dependencies = {}) {
  const module = { exports: {} }
  new Function('require', 'module', 'exports', compile(read(path)))(name => {
    if (!(name in dependencies)) throw new Error(`Unexpected import ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return module.exports
}
const { calendarEventDayKeys } = load('src/application/use-cases/calendar/calendarEventDays.ts')
const local = (day, time = '00:00:00') => new Date(`${day}T${time}`).toISOString()
const days = (start, end) => calendarEventDayKeys({ startTime: start, endTime: end, dayKey: 'fallback' })

test('REG-BUG-01: all-day event occupies only its selected date', () => {
  assert.deepEqual(days(local('2026-10-23'), local('2026-10-24')), ['2026-10-23'])
})
test('REG-BUG-01: inclusive editor dates become the exact multi-day display range', () => {
  assert.deepEqual(days(local('2026-10-23'), local('2026-10-26')), ['2026-10-23', '2026-10-24', '2026-10-25'])
})
test('midnight boundaries also work for timed events, while a real next-day overlap remains visible', () => {
  assert.deepEqual(days(local('2026-10-23', '23:00:00'), local('2026-10-24')), ['2026-10-23'])
  assert.deepEqual(days(local('2026-10-23', '23:00:00'), local('2026-10-24', '00:00:00.001')), ['2026-10-23', '2026-10-24'])
})
test('calendar date iteration respects DST and year boundaries', () => {
  assert.deepEqual(days(local('2026-03-07'), local('2026-03-10')), ['2026-03-07', '2026-03-08', '2026-03-09'])
  assert.deepEqual(days(local('2026-10-31'), local('2026-11-03')), ['2026-10-31', '2026-11-01', '2026-11-02'])
  assert.deepEqual(days(local('2026-12-31'), local('2027-01-02')), ['2026-12-31', '2027-01-01'])
})
test('invalid or zero-duration calendar data falls back without hanging', () => {
  for (const [start, end] of [['bad', 'bad'], [local('2026-10-23'), local('2026-10-23')], [local('2026-10-24'), local('2026-10-23')]]) {
    assert.deepEqual(days(start, end), ['fallback'])
  }
})

const codec = load('src/domain/notes/noteListCodec.ts')
const errors = load('src/infrastructure/http/HttpError.ts')
const noteErrors = load('src/domain/entities/Note.ts')
function noteStore() {
  let stored = { id: 'note', version: 1, tags: ['qa-regress-1023'], content: 'Keep text', content_doc: { version: 1, blocks: [], page: { description: 'Keep description' } } }
  const requests = []
  const { HttpNoteRepository } = load('src/infrastructure/repositories/HttpNoteRepository.ts', {
    '../../domain/notes/noteListCodec': codec,
    '../../domain/entities/Note': noteErrors,
    '../http/HttpError': errors,
    '../http/normalizeBackendAssetUrl': { normalizeBackendAssetUrl: value => value },
    '../http/authorizedFetch': { authorizedFetch: async (_store, _url, init) => {
      if (init?.body) {
        const body = JSON.parse(init.body)
        requests.push(body)
        stored = { ...stored, ...body, version: stored.version + 1 }
      }
      return new Response(JSON.stringify(stored))
    } },
  })
  return { repo: new HttpNoteRepository({}), requests }
}
test('REG-BUG-02: archive/unarchive and unrelated PATCH preserve tags and document content on reload', async () => {
  const { repo, requests } = noteStore()
  const archived = await repo.updateNote('note', { version: 1, is_archived: true })
  await repo.updateNote('note', { version: archived.version, is_archived: false })
  const note = await repo.getNote('note')
  assert.deepEqual(note.tags, ['qa-regress-1023'])
  assert.equal(note.content, 'Keep text')
  assert.equal(note.content_doc.page.description, 'Keep description')
  for (const request of requests) {
    assert.equal(Object.hasOwn(request, 'tags'), false)
    assert.equal(Object.hasOwn(request, 'content_doc'), false)
  }
})
test('explicit empty tags still clear tags, and editor tags are normalized and persisted separately', async () => {
  const { repo, requests } = noteStore()
  assert.deepEqual((await repo.updateNote('note', { version: 1, tags: [] })).tags, [])
  await repo.updateNote('note', { version: 2, content_doc: { version: 1, blocks: [], page: { tags: ['#QA ', 'qa', 'Тест'], description: 'Text' } } })
  assert.deepEqual(requests[1].tags, ['qa', 'тест'])
  assert.equal(Object.hasOwn(requests[1].content_doc.page, 'tags'), false)
  assert.deepEqual((await repo.getNote('note')).tags, ['qa', 'тест'])
  await repo.updateNote('note', { version: 3, content_doc: { version: 1, blocks: [], page: { description: 'Updated' } } })
  assert.deepEqual((await repo.getNote('note')).tags, ['qa', 'тест'])
})
