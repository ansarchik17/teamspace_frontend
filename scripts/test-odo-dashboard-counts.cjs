const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
function load(file, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const item = { exports: {} }
  new Function('require', 'module', 'exports', code)(name => { assert.ok(dependencies[name], `Unexpected import ${name}`); return dependencies[name] }, item, item.exports)
  return item.exports
}
const countsModel = load('src/domain/entities/ODODashboardCounts.ts')
const { HttpError } = load('src/infrastructure/http/HttpError.ts')
const { HttpODODashboardRepository } = load('src/infrastructure/repositories/HttpODODashboardRepository.ts', {
  '../../domain/entities/ODODashboardCounts': countsModel,
  '../http/HttpError': { HttpError },
})
let token = 'user-session'
let requests = []
const store = { getTokens: () => token ? { accessToken: token } : null, clearTokens: () => assert.fail('ODO errors must not log Workspace out') }
const repo = new HttpODODashboardRepository(store)
const signal = () => new AbortController().signal
const ok = total => ({ ok: true, json: async () => ({ scope: 'current_user', total }) })
;(async () => {
  global.fetch = async (url, init) => {
    requests.push({ url, init })
    const params = new URL(url, 'https://sultan-corp.teamspace.kz').searchParams
    assert.ok(['approvals', 'signing'].includes(params.get('kind')))
    assert.equal(params.has('user_id'), false, 'the server derives identity from the authenticated session')
    assert.equal(params.has('status'), false, 'company status totals are not personal work')
    return ok(params.get('kind') === 'approvals' ? 26 : 0)
  }
  assert.deepEqual(await repo.counts(signal()), {
    approvals: { value: 26, state: 'ready' }, signing: { value: 0, state: 'ready' },
  })
  assert.equal(requests.length, 2)
  for (const { url, init } of requests) {
    assert.ok(url.startsWith('/odo/api/v1/documents/my-pending-count?'))
    assert.equal(init.headers.Authorization, 'Bearer user-session')
    assert.equal(init.credentials, 'omit')
    assert.equal(init.redirect, 'error')
    assert.equal(init.cache, 'no-store')
    assert.ok(init.signal)
  }
  for (const badTotal of [undefined, null, '26', -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    global.fetch = async () => ok(badTotal)
    const counts = await repo.counts(signal())
    assert.deepEqual(counts, countsModel.emptyODOCounts('unavailable'), 'invalid/missing totals are not a zero or page length')
  }
  for (const body of [{ pagination: { total: 99 } }, { scope: 'company', total: 99 }, { total: 99 }]) {
    global.fetch = async () => ({ ok: true, json: async () => body })
    assert.deepEqual(await repo.counts(signal()), countsModel.emptyODOCounts('unavailable'), 'old/company responses must never appear as personal counts')
  }
  global.fetch = async url => url.includes('kind=approvals') ? { ok: false, status: 403 } : ok(7)
  assert.deepEqual(await repo.counts(signal()), {
    approvals: { value: null, state: 'denied' }, signing: { value: 7, state: 'ready' },
  })
  global.fetch = async () => ({ ok: false, status: 401 })
  assert.deepEqual(await repo.counts(signal()), countsModel.emptyODOCounts('unavailable'))
  global.fetch = async () => { token = 'different-user-session'; return ok(99) }
  await assert.rejects(repo.counts(signal()), /session changed/)
  token = null
  global.fetch = async () => assert.fail('no credentials: do not borrow an ambient EDO session')
  assert.deepEqual(await repo.counts(signal()), countsModel.emptyODOCounts('unavailable'))
  token = 'user-session'
  const controller = new AbortController()
  global.fetch = async () => { controller.abort(); throw new DOMException('Aborted', 'AbortError') }
  await assert.rejects(repo.counts(controller.signal), { name: 'AbortError' })
  console.log('ODO dashboard counts: API totals, per-card errors, scoped auth, missing sessions, cancellation and stale identity passed')
})().catch(error => { console.error(error); process.exitCode = 1 })
