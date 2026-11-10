const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
function load(file, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const item = { exports: {} }
  new Function('require', 'module', 'exports', code)(name => { assert.ok(dependencies[name]); return dependencies[name] }, item, item.exports)
  return item.exports
}
const { HttpError } = load('src/infrastructure/http/HttpError.ts')
let result = { count: 8 }
let failure
const store = {}
const signal = new AbortController().signal
const { HttpSDDashboardRepository } = load('src/infrastructure/repositories/HttpSDDashboardRepository.ts', {
  '../http/HttpError': { HttpError },
  '../http/authorizedFetch': { authorizedFetch: async (session, url, init) => {
    assert.equal(session, store)
    assert.equal(url, '/api/v1/organizations/current/sd-ticket-count')
    assert.equal(init.signal, signal)
    assert.equal(init.cache, 'no-store')
    if (failure) throw failure
    return { json: async () => result }
  } },
})
;(async () => {
  const repository = new HttpSDDashboardRepository(store)
  assert.equal(await repository.openTicketCount(signal), 8)
  result = { count: 0 }
  assert.equal(await repository.openTicketCount(signal), 0)
  for (const invalid of [undefined, null, -1, '8', 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    result = { count: invalid }
    await assert.rejects(repository.openTicketCount(signal), { status: 502 })
  }
  for (const status of [403, 503]) {
    failure = new HttpError('Safe error', status)
    await assert.rejects(repository.openTicketCount(signal), { status })
  }
  console.log('SD dashboard count: protected Workspace API, zero, invalid totals and unavailable/denied states passed')
})().catch(error => { console.error(error); process.exitCode = 1 })
