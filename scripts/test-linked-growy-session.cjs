const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

class MemoryStorage {
  data = new Map()
  getItem(key) { return this.data.get(key) ?? null }
  setItem(key, value) { this.data.set(key, String(value)) }
  removeItem(key) { this.data.delete(key) }
}
const browser = new EventTarget()
browser.localStorage = new MemoryStorage()
browser.sessionStorage = new MemoryStorage()
function load(file, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', 'window', code)(
    name => {
      const key = Object.keys(dependencies).find(key => name.endsWith(key))
      if (!key) throw new Error(`Unexpected dependency ${name}`)
      return dependencies[key]
    }, module, module.exports, browser,
  )
  return module.exports
}
const helpers = load('src/shared/auth/legacyAuthStorage.ts')
const { LocalStorageAuthSessionStore } = load('src/infrastructure/storage/LocalStorageAuthSessionStore.ts', {
  legacyAuthStorage: helpers,
  authSessionEvents: { AUTH_SESSION_CLEARED_EVENT: 'superapp:auth-session-cleared' },
})
const store = new LocalStorageAuthSessionStore()
const token = (sub, company = 'sultan', exp = 1, iss = 'workspace') =>
  `header.${Buffer.from(JSON.stringify({ sub, organization_id: company, exp, iss })).toString('base64url')}.signature`
const session = accessToken => ({ accessToken, refreshToken: 'workspace-refresh', tokenType: 'Bearer', expiresIn: 3600, expiresAt: '' })
const seedGrowy = () => {
  for (const key of ['access_token', 'refresh_token', 'user_role', 'tenant_slug', 'auth_provider', 'must_change_password']) {
    browser.localStorage.setItem(`aigent_${key}`, 'previous-user')
  }
  browser.localStorage.setItem('lang', 'ru')
}

store.setTokens(session(token('director')))
seedGrowy()
store.setTokens(session(token('director', 'sultan', 2)))
assert.equal(browser.localStorage.getItem('aigent_access_token'), 'previous-user', 'same-user refresh must preserve Growy')
for (const next of [token('developer'), token('developer', 'other'), token('developer', 'other', 1, 'different-issuer')]) {
  seedGrowy()
  store.setTokens(session(next))
  assert.equal(browser.localStorage.getItem('aigent_access_token'), null, 'account, company or issuer change must discard old Growy identity')
  assert.equal(browser.localStorage.getItem('aigent_refresh_token'), null)
  assert.equal(browser.localStorage.getItem('lang'), 'ru')
}
seedGrowy()
store.clearTokens()
assert.equal(store.getTokens(), null)
assert.equal(browser.localStorage.getItem('aigent_access_token'), null, 'Workspace logout must also clear linked Growy credentials')
seedGrowy()
store.setTokens(session(token('director')))
assert.equal(browser.localStorage.getItem('aigent_access_token'), null, 'fresh Workspace login must not restore an unrelated Growy session')
assert.equal(helpers.workspaceIdentityChanged('malformed-before', 'malformed-after'), true)
assert.equal(helpers.workspaceIdentityChanged(token('same'), token('same', 'sultan', 99)), false)
assert.equal(browser.localStorage.getItem('lang'), 'ru')
console.log('PASS: linked Growy credentials follow Workspace account, company, issuer and logout; token refresh and language are preserved')
