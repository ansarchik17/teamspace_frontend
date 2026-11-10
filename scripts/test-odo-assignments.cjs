const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
function load(file, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(name => { assert.ok(dependencies[name], `Unexpected import ${name}`); return dependencies[name] }, module, module.exports)
  return module.exports
}
const { HttpError, parseHttpError } = load('src/infrastructure/http/HttpError.ts')
const policy = load('src/application/use-cases/assignments/assignmentPolicy.ts')
const org = '11111111-1111-4111-8111-111111111111'
const id = '22222222-2222-4222-8222-222222222222'
const event = '33333333-3333-4333-8333-333333333333'
const task = { id, sourceOrganizationId: org, sourceRevision: 4, sourceAssignmentId: 'asg', sourceDocumentId: 'doc', sourceStatus: 'assigned', sourceDueDate: '2026-10-14', sourceTimezone: 'Asia/Almaty', status: 'ГОТОВО' }
assert.equal(policy.assignmentStatus(task), 'assigned', 'source status wins over Kanban status')
assert.equal(policy.isOverdueAssignment(task, new Date('2026-10-14T18:59:59Z')), false)
assert.equal(policy.isOverdueAssignment(task, new Date('2026-10-14T19:00:00Z')), true, 'deadline follows company midnight, not browser timezone')
for (const sourceStatus of ['completed', 'closed', 'cancelled', 'unknown']) {
  assert.equal(policy.isOverdueAssignment({ ...task, sourceStatus }), false)
  assert.equal(policy.canCompleteAssignment({ ...task, sourceStatus }), false)
}
assert.equal(policy.canCompleteAssignment({ ...task, sourceRevision: 0 }), false)
assert.equal(policy.isOverdueAssignment({ ...task, sourceTimezone: 'not/a-zone' }), false)
assert.equal(policy.isOverdueAssignment({ ...task, sourceDueDate: '2026-02-31' }), false)
for (const url of ['javascript:alert(1)', '/doc', 'http://example.test/doc', 'https://user:pass@example.test', 'https://example.test?token=secret', 'https://example.test/#secret']) assert.equal(policy.safeAssignmentUrl(url), null)
assert.equal(policy.safeAssignmentUrl('https://odo.example.test/odo/assignments/asg'), 'https://odo.example.test/odo/assignments/asg')
assert.equal(policy.assignmentDocumentRoute('doc-1'), '/eps?document=doc-1')
assert.equal(policy.assignmentDocumentRoute('doc/1?next=https://other.test#token'), '/eps?document=doc%2F1%3Fnext%3Dhttps%3A%2F%2Fother.test%23token')
assert.equal(policy.assignmentDocumentRoute(''), null)
assert.equal(policy.assignmentDocumentRoute('  '), null)
assert.equal(policy.assignmentDocumentRoute(undefined), null)
for (const tenant of ['sultan-corp.teamspace.kz', 'beles.teamspace.kz']) {
  const href = new URL('/web' + policy.assignmentDocumentRoute('doc-1'), `https://${tenant}`)
  assert.equal(href.hostname, tenant, 'document handoff stays on the current tenant')
  assert.equal(href.pathname, '/web/eps')
  assert.equal(href.searchParams.get('document'), 'doc-1')
}
assert.equal(policy.validAssignmentResult(' '), false)
assert.equal(policy.validAssignmentResult('😀'.repeat(20000)), true)
assert.equal(policy.validAssignmentResult('😀'.repeat(20001)), false)
const command = policy.createAssignmentCommand(task, 'Result')
const reply = { confirmed: true, projection_pending: true, task_id: id, receipt: { command_id: command.command_id, organization_id: org, identity_issuer: 'https://id.example.test', actor_sub: 'executor', assignment_id: 'asg', document_id: 'doc', expected_revision: 4, revision: 5, status: 'completed', event_id: event, completed_at: '2026-10-15T00:00:00Z', outcome: 'completed' } }
assert.equal(policy.validCompletionReceipt(reply, task, command), true)
for (const change of [{ organization_id: event }, { revision: 6 }, { command_id: event }, { assignment_id: 'other' }, { status: 'assigned' }, { event_id: '' }, { actor_sub: '' }, { identity_issuer: undefined }, { completed_at: '2026' }]) assert.equal(policy.validCompletionReceipt({ ...reply, receipt: { ...reply.receipt, ...change } }, task, command), false)
assert.equal(policy.validCompletionReceipt({ confirmed: true }, task, command), false)
assert.equal(policy.projectionCaughtUp(task, { phase: 'confirmed', confirmedRevision: 5 }), false)
assert.equal(policy.projectionCaughtUp({ ...task, sourceRevision: 5, sourceStatus: 'completed' }, { phase: 'confirmed', confirmedRevision: 5 }), true)

const browser = new EventTarget()
const values = new Map()
browser.sessionStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => { values.set(key, value); browser.sessionStorage[key] = value }, removeItem: key => { values.delete(key); delete browser.sessionStorage[key] } }
global.window = browser
const events = { AUTH_SESSION_CLEARED_EVENT: 'clear-auth' }
const { AssignmentCommandJournal } = load('src/infrastructure/storage/AssignmentCommandJournal.ts', { '../../shared/auth/authSessionEvents': events })
const journal = new AssignmentCommandJournal(1, org)
journal.write({ [id]: { taskId: id, assignmentId: 'asg', command, phase: 'pending' } })
assert.deepEqual(journal.read()[id].command, command)
assert.equal(new AssignmentCommandJournal(1, org).read()[id].phase, 'uncertain', 'unmount/reload does not lose the frozen command')
assert.deepEqual(new AssignmentCommandJournal(2, org).read(), {})
assert.deepEqual(new AssignmentCommandJournal(1, event).read(), {})
browser.dispatchEvent(new Event(events.AUTH_SESSION_CLEARED_EVENT))
assert.deepEqual(new AssignmentCommandJournal(1, org).read(), {})

let requests = []
const { HttpBoardRepository } = load('src/infrastructure/repositories/HttpBoardRepository.ts', {
  '../http/authorizedFetch': { authorizedFetch: async (_store, url, init, options) => { requests.push({ url, init, options }); return { json: async () => init?.method === 'POST' ? reply : [{ id, title: 'Task', source_status: 'closed', source_organization_id: org, source_revision: 4, source_due_date: null, source_timezone: 'Asia/Almaty', source_completed_at: null, source_closed_at: '2026-10-15T00:00:00Z' }] } } },
  '../http/normalizeBackendAssetUrl': { normalizeBackendAssetUrl: value => value },
  '../http/HttpError': { HttpError },
})
;(async () => {
  const repository = new HttpBoardRepository({})
  const tasks = await repository.listMyDocumentologAssignments()
  assert.equal(tasks[0].sourceStatus, 'closed'); assert.equal(tasks[0].sourceRevision, 4); assert.equal(tasks[0].sourceDueDate, null)
  await repository.completeDocumentologAssignment(id, command)
  assert.equal(requests[1].url, `/api/v1/kanban/documentolog/assignments/${id}/complete`)
  assert.equal(requests[1].init.headers['Idempotency-Key'], `odo-command:${command.command_id}`)
  assert.deepEqual(JSON.parse(requests[1].init.body), command)
  assert.equal(requests[1].options.preserveIntegrationSession, true)
  assert.ok(!requests.some(req => req.url.endsWith('/status')))
  const { HttpAccessRepository } = load('src/infrastructure/repositories/HttpAccessRepository.ts', {
    '../http/authorizedFetch': { authorizedFetch: async () => ({ json: async () => ({ active: true, organization_id: org, permissions: null }) }) },
  })
  const access = await new HttpAccessRepository({}).current('odo')
  assert.deepEqual(access.permissions, [], 'null permissions do not crash the UI or grant completion')
  assert.equal(access.managed, true, 'an incomplete policy fails closed')
  let refreshes = 0, expirations = 0
  const { authorizedFetch } = load('src/infrastructure/http/authorizedFetch.ts', {
    '../../shared/auth/authSessionEvents': { dispatchAuthSessionExpired: () => expirations++ },
    '../repositories/HttpAuthRepository': { HttpAuthRepository: class { async refresh() { refreshes++; throw new Error('must not refresh Workspace for EDO failure') } } },
    '../storage/WebDeviceSessionStore': { WebDeviceSessionStore: class { getCurrentDeviceId() { return null } } },
    './HttpError': { HttpError, parseHttpError },
  })
  const originalFetch = global.fetch
  global.fetch = async () => new Response(JSON.stringify({ error: { code: 'ODO_REAUTH_REQUIRED', user_message: 'Reauth EDO' } }), { status: 401, headers: { 'content-type': 'application/json' } })
  try {
    await assert.rejects(authorizedFetch({ getTokens: () => ({ accessToken: 'test' }) }, '/api/v1/kanban/documentolog/assignments/task/complete', { method: 'POST' }, { preserveIntegrationSession: true }), error => error.code === 'ODO_REAUTH_REQUIRED')
    assert.equal(refreshes, 0); assert.equal(expirations, 0)
  } finally { global.fetch = originalFetch }
  console.log('ODO assignments: statuses, timezone, safe links, durable commands, API mapping and integration auth passed')
})().catch(error => { console.error(error); process.exitCode = 1 })
