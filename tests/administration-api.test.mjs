import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

// Exercise the real TypeScript repository with Node's fetch/Response, without
// adding another browser or test framework to the production dependencies.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && context.parentURL) {
      for (const suffix of ['.ts', '.tsx']) {
        const url = new URL(specifier + suffix, context.parentURL)
        if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true }
      }
    }
    return next(specifier, context)
  },
  load(url, context, next) {
    if (url.endsWith('/shared/i18n/i18n.ts')) return { format: 'module', shortCircuit: true, source: String.raw`const catalogs = { ru: ${readFileSync(new URL('../src/shared/i18n/locales/ru/administration.json', import.meta.url), 'utf8')}, kk: ${readFileSync(new URL('../src/shared/i18n/locales/kk/administration.json', import.meta.url), 'utf8')} }; export const i18n = { language: 'ru', t(key, values = {}) { return catalogs[this.language][key.replace('administration:', '')].replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name] ?? '')); } };` }
    if (/\.tsx?$/.test(url)) return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText }
    return next(url, context)
  },
})

const { HttpAdministrationRepository } = await import('../src/infrastructure/repositories/HttpAdministrationRepository.ts')
const { HttpError } = await import('../src/infrastructure/http/HttpError.ts')
const { parseGiB, administrationError, isStorageBudgetError } = await import('../src/presentation/pages/organization/administrationHelpers.ts')
const { auditDifferences } = await import('../src/presentation/pages/organization/administrationDiff.ts')
const { requestedContactId, withoutContactDeepLink } = await import('../src/presentation/pages/alem-contact/contactDeepLink.ts')

test('employee links accept a single positive ID and consume only their own query parameter', () => {
  assert.equal(requestedContactId('?contact=48'), 48)
  assert.equal(requestedContactId('?contact=48', 40), 40)
  for (const value of ['', '0', '-1', '1.5', '1e3', '9007199254740992', '../admin', '48&contact=40']) {
    assert.equal(requestedContactId(`?contact=${value}`), 0, value)
  }
  assert.equal(withoutContactDeepLink('?contact=48&search=QA&department=team'), '?search=QA&department=team')
  assert.equal(withoutContactDeepLink('?contact=48'), '')
})
globalThis.localStorage = { getItem: () => null }
const store = { getTokens: () => ({ accessToken: 'test-only-token' }) }
const repo = new HttpAdministrationRepository(store)

test('company scope stays current for director; selected platform IDs and searches are encoded', async t => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (path, init) => { calls.push({ path, init }); return Response.json({}) })
  await repo.overview()
  await repo.users('company/id', 'Русский & қазақша', 25)
  assert.equal(calls[0].path, '/api/v1/organizations/current/administration/overview')
  const url = new URL(calls[1].path, 'http://test')
  assert.equal(url.pathname, '/api/v1/platform/organizations/company%2Fid/administration/users')
  assert.equal(url.searchParams.get('q'), 'Русский & қазақша')
  assert.equal(url.searchParams.get('offset'), '25')
  assert.equal(calls[0].init.headers.get('Authorization'), 'Bearer test-only-token')
  assert.equal(calls[0].init.cache, 'no-store')
})

test('zero quota and revisions survive JSON; forbidden and conflicting writes are not retried', async t => {
  const bodies = []
  t.mock.method(globalThis, 'fetch', async (_path, init) => { bodies.push(JSON.parse(init.body)); return new Response(null, { status: 204 }) })
  await repo.budget('company', 0, 9)
  await repo.quota(undefined, { user_id: 3, revision: 4 }, 0)
  assert.deepEqual(bodies, [{ quota_bytes: 0, revision: 9 }, { quota_bytes: 0, revision: 4 }])
  for (const status of [403, 409]) {
    let calls = 0
    globalThis.fetch = async () => { calls++; return Response.json({ error: { code: status === 403 ? 'FORBIDDEN' : 'CONFLICT', user_message: 'Қате' } }, { status }) }
    await assert.rejects(repo.module(undefined, { application: 'odo', revision: 3 }, { enabled: true }), error => error instanceof HttpError && error.status === status && error.message === 'Қате')
    assert.equal(calls, 1)
  }
})

test('CSV export retains snapshot and IP filtering', async t => {
  let path
  t.mock.method(globalThis, 'fetch', async value => { path = value; return value.includes('/export') ? new Response('time,action\n', { headers: { 'Content-Type': 'text/csv' } }) : Response.json({ items: [], snapshot_id: 0 }) })
  const blob = await repo.exportSecurity(undefined, { snapshot_id: 80, ip: '10.0.0.0/24', before_id: undefined })
  const query = new URL(path, 'http://test').searchParams
  assert.equal(query.get('format'), 'csv')
  assert.equal(query.get('snapshot_id'), '80')
  assert.equal(query.get('ip'), '10.0.0.0/24')
  assert.equal(query.has('before_id'), false)
  assert.equal(await blob.text(), 'time,action\n')
  await repo.security(undefined, {}, undefined, true)
  assert.equal(path, '/api/v1/platform/security-audit?limit=50')
})

test('quota validation distinguishes zero from empty and hides server diagnostics', () => {
  assert.equal(parseGiB('0'), 0)
  assert.equal(parseGiB('0,5'), 2 ** 29)
  for (const input of ['', '-1', 'NaN', 'Infinity', '1048577']) assert.throws(() => parseGiB(input), error => error instanceof HttpError && error.status === 400)
  assert.equal(administrationError(new HttpError('database password/private stack', 500)).includes('password'), false)
})

test('Drive budget business errors are shown while stale revisions still refresh', () => {
  for (const code of ['COMPANY_BUDGET_BELOW_USAGE', 'COMPANY_BUDGET_CAPACITY_EXCEEDED']) {
    const error = new HttpError('Недостаточно бюджета Drive', 409, code)
    assert.equal(isStorageBudgetError(error), true)
    assert.equal(administrationError(error), error.message)
  }
  const stale = new HttpError('storage revision changed', 409, 'CONFLICT')
  assert.equal(isStorageBudgetError(stale), false)
  assert.notEqual(administrationError(stale), stale.message)
})

test('audit details fetch only the selected company entry and redact sensitive fields', async t => {
  const paths = []
  t.mock.method(globalThis, 'fetch', async path => {
    paths.push(path)
    return Response.json({ items: [{ id: 72, before: { quota_bytes: 1, settings: { token: 'old' }, secret_set: false }, after: { quota_bytes: 2, settings: { token: 'new' }, secret_set: true } }] })
  })
  const entry = await repo.auditEntry('company-id', 72)
  assert.equal(paths[0], '/api/v1/platform/organizations/company-id/administration/audit?before_id=73&limit=1')
  const differences = auditDifferences(entry.before, entry.after)
  assert.deepEqual(differences.find(row => row.field === 'quota_bytes'), { field: 'quota_bytes', rawField: 'quota_bytes', before: '1', after: '2', changed: true })
  assert.deepEqual(differences.find(row => row.field === 'settings'), { field: 'settings', rawField: 'settings', before: 'Скрыто', after: 'Скрыто', changed: false })
  assert.deepEqual(differences.find(row => row.field === 'secret_set'), { field: 'secret_set', rawField: 'secret_set', before: 'false', after: 'true', changed: true })
  await assert.rejects(repo.auditEntry('company-id', 71), error => error instanceof HttpError && error.status === 404)
  const lists = auditDifferences([{ roles: ['old'], token: 'private-old' }], [{ roles: ['new'], token: 'private-new' }])
  assert.equal(lists.length, 1)
  assert.equal(lists[0].changed, true)
  assert.equal(JSON.stringify(lists).includes('private-'), false)
})



test('administration labels follow the language and interpolate quota values', async () => {
  const { i18n } = await import('../src/shared/i18n/i18n.ts')
  const { adminText } = await import('../src/shared/i18n/adminText.ts')
  const { auditLabel, MODULE_NAMES } = await import('../src/presentation/pages/organization/administrationHelpers.ts')
  try {
    i18n.language = 'kk'
    assert.equal(auditLabel('admin.mailbox.quota.update'), 'Пошта квотасы өзгерді')
    assert.equal(MODULE_NAMES().growy[0], 'Оқыту')
    assert.equal(adminText('template11', { p0: '2 ГиБ' }).includes('2 ГиБ'), true)
    assert.equal(adminText('template11', { p0: '2 ГиБ' }).includes('{{'), false)
  } finally { i18n.language = 'ru' }
})

// Deletions use the same tenant boundary as reads, without a caller-supplied company for directors.
test('employee deletion preserves tenant scope, accepts 204 and invalidates quota cache', async t => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (path, init) => { calls.push({path,init}); return new Response(null,{status:204}) })
  repo.setCachedAiEntry(undefined, 'users', {stale:true})
  await repo.deleteEmployee(undefined, 3)
  await repo.deleteEmployee('company/id', 5)
  assert.equal(calls[0].path, '/api/v1/organizations/current/administration/users/3')
  assert.equal(calls[1].path, '/api/v1/platform/organizations/company%2Fid/administration/users/5')
  assert.ok(calls.every(call => call.init.method === 'DELETE' && call.init.body === undefined))
  assert.equal(repo.getCachedAiEntry(undefined, 'users'), null)
})
test('company deletion uses DELETE and does not parse a 204 response', async t => {
  const { HttpOrganizationRepository } = await import('../src/infrastructure/repositories/HttpOrganizationRepository.ts')
  const calls = []
  t.mock.method(globalThis, 'fetch', async (path, init) => {calls.push({path,init});return new Response(null,{status:204})})
  await new HttpOrganizationRepository(store).deletePlatformOrganization('company/id')
  assert.equal(calls[0].path, '/api/v1/platform/organizations/company%2Fid')
  assert.equal(calls[0].init.method, 'DELETE')
})
test('protected account deletion keeps its specific safe error', () => {
  assert.equal(administrationError(new HttpError('Assign a different owner first',409,'ADMIN_DELETION_PROTECTED')), 'Assign a different owner first')
})

const { loadCurrentOrganizationContact } = await import('../src/presentation/pages/alem-contact/loadOrganizationDirectory.ts')
test('employee deep links use current-company membership and propagate denied access', async t => {
  const paths = []
  t.mock.method(globalThis, 'fetch', async path => {
    paths.push(path)
    if (path === '/api/v1/organizations/current') return Response.json({ id: 'qa', name: 'QA' })
    if (path === '/api/v1/organizations/current/units') return Response.json([])
    if (path === '/api/v1/organizations/current/users') return Response.json([{ id: 48, full_name: 'QA Employee', username: 'qa.employee', email: 'qa@example.invalid', first_name: 'QA', last_name: 'Employee' }])
    return new Response(null, { status: 404 })
  })
  assert.equal((await loadCurrentOrganizationContact(store, 48)).id, 48)
  assert.equal(await loadCurrentOrganizationContact(store, 999), undefined)
  assert.equal(paths.some(path => path.includes('/platform/') || path.startsWith('/api/v1/contacts')), false)
  globalThis.fetch = async () => Response.json({ message: 'Denied' }, { status: 403 })
  await assert.rejects(loadCurrentOrganizationContact(store, 48))
})
