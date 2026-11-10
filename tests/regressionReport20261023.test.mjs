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

// Execute the actual React callbacks without copying their state transitions.
const messenger = ts.createSourceFile('Messenger.tsx', read('src/presentation/components/messenger/MessengerPageContent.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function callback(name, deps) {
  let expression
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(messenger) === name) expression = node.initializer.arguments[0].getText(messenger)
    ts.forEachChild(node, visit)
  }
  visit(messenger)
  assert.ok(expression, `Missing callback ${name}`)
  return new Function(...Object.keys(deps), `${compile(`const run = ${expression}`)}; return run`)(...Object.values(deps))
}
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { resolve, promise } }
function groupState() {
  const state = { details: null, members: [], calls: [] }
  const deps = {
    activeChatRef: { current: 'group-a' }, groupDetailsRequestRef: { current: 0 },
    chatRepository: { getGroupDetails: () => { const request = deferred(); state.calls.push(request); return request.promise } },
    setActiveGroupMembers: value => { state.members = value },
    setActiveGroupDetails: value => { state.details = value }, setGroupMembersError() {},
  }
  return { state, deps, refresh: callback('refreshActiveGroupMembers', deps) }
}
test('REG-BUG-04: refreshing group metadata replaces the local description and members together', async () => {
  const { state, refresh } = groupState()
  const pending = refresh('group-a')
  state.calls[0].resolve({ id: 'group-a', description: 'GROUP-UPDATE-OK', members: [{ id: 1 }] })
  await pending
  assert.equal(state.details.description, 'GROUP-UPDATE-OK')
  assert.deepEqual(state.members, [{ id: 1 }])
})
test('REG-BUG-04: older responses and responses for a different chat cannot overwrite current metadata', async () => {
  const { state, deps, refresh } = groupState()
  const old = refresh('group-a'), fresh = refresh('group-a')
  state.calls[1].resolve({ description: 'new', members: [] }); await fresh
  state.calls[0].resolve({ description: 'old', members: [] }); await old
  assert.equal(state.details.description, 'new')
  const late = refresh('group-a')
  deps.activeChatRef.current = 'group-b'
  state.calls[2].resolve({ description: 'wrong chat', members: [] }); await late
  assert.equal(state.details.description, 'new')
  await refresh('group-a')
  assert.equal(state.calls.length, 3, 'inactive group is not loaded')
})
test('REG-BUG-04: real save handler refreshes metadata after server update and avatar update', async () => {
  const order = []
  const noop = () => {}
  const deps = {
    groupEditName: ' Group ', groupEditTargetId: 'group-a', groupEditDescription: ' New description ', groupEditAvatar: {},
    chatRepository: { updateGroup: async (id, input) => { assert.equal(id, 'group-a'); assert.equal(input.description, 'New description'); order.push('update') }, updateGroupAvatar: async () => order.push('avatar') },
    refreshActiveGroupMembers: async id => { assert.equal(id, 'group-a'); order.push('details') },
    loadChats: async () => order.push('list'), mt: key => key,
  }
  for (const key of ['setGroupEditError', 'setIsGroupEditSaving', 'setIsGroupEditModalOpen', 'setGroupEditTargetId', 'setGroupEditName', 'setGroupEditDescription', 'setGroupEditAvatar', 'setGroupEditCurrentAvatarUrl']) deps[key] = noop
  await callback('handleSubmitGroupEdit', deps)()
  assert.deepEqual(order, ['update', 'avatar', 'details', 'list'])
})
