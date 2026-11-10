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


const { HttpInvitationRepository, invitationTokenFromHash } = await import('../src/infrastructure/repositories/HttpInvitationRepository.ts')
const { rememberInvitation, rememberedInvitation, forgetInvitation } = await import('../src/shared/auth/invitationReturn.ts')
const { HttpError } = await import('../src/infrastructure/http/HttpError.ts')
globalThis.localStorage = { getItem: () => null }
const store = { getTokens: () => ({ accessToken: 'synthetic-test-token' }) }
const repo = new HttpInvitationRepository(store)
const token = 'A'.repeat(43)

test('public invitation secrets stay in POST bodies, without cookies, authorization or referrers', async t => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (path, init) => { calls.push({ path, init }); return Response.json({ sent: true, retry_after: 60 }) })
  await repo.preview(token)
  await repo.sendCode(token)
  await repo.register({ token, code: '123456', first_name: 'First', last_name: 'Last', iin: '123456789012', username: 'employee', password: 'synthetic-password' })
  for (const call of calls) {
    assert.equal(call.path.includes(token), false)
    assert.equal(call.init.method, 'POST')
    assert.equal(call.init.credentials, 'omit')
    assert.equal(call.init.referrerPolicy, 'no-referrer')
    assert.equal(call.init.cache, 'no-store')
    assert.equal(call.init.headers.Authorization, undefined)
    assert.equal(JSON.parse(call.init.body).token, token)
  }
  assert.deepEqual(JSON.parse(calls[2].init.body), { token, code: '123456', first_name: 'First', last_name: 'Last', iin: '123456789012', username: 'employee', password: 'synthetic-password' })
})

test('company administration is scoped and encoded; acceptance uses authenticated requests', async t => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (path, init) => { calls.push({ path, init }); return Response.json({}) })
  await repo.list()
  await repo.issue('person@example.invalid', 'unit-id', 'company/id')
  await repo.resend('invitation/id', 'company/id')
  await repo.revoke('invitation/id')
  await repo.accept(token, '123456')
  assert.equal(calls[0].path, '/api/v1/organizations/current/invitations?limit=10&offset=0')
  assert.equal(calls[1].path, '/api/v1/platform/organizations/company%2Fid/invitations')
  assert.deepEqual(JSON.parse(calls[1].init.body), { email: 'person@example.invalid', team_id: 'unit-id' })
  assert.equal(calls[2].path, '/api/v1/platform/organizations/company%2Fid/invitations/invitation%2Fid/resend')
  assert.equal(calls[3].init.method, 'DELETE')
  assert.equal(calls[4].path, '/api/v1/auth/invitations/accept')
  assert.equal(calls[4].init.headers.get('Authorization'), 'Bearer synthetic-test-token')
})

test('failed mutations are not automatically replayed and activation-pending remains distinguishable', async t => {
  for (const status of [400, 409, 429, 503]) {
    let calls = 0
    t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ error: { code: 'INVITATION_ACTIVATION_PENDING', message: 'Try later' } }, { status }) })
    await assert.rejects(repo.register({ token, code: '123456' }), error => error instanceof HttpError && error.status === status && error.code === 'INVITATION_ACTIVATION_PENDING')
    assert.equal(calls, 1)
  }
})

test('login return keeps the secret in tab storage, expires it, and validates malformed fragments', () => {
  const data = new Map()
  globalThis.window = { sessionStorage: { setItem: (key, value) => data.set(key, value), getItem: key => data.get(key) ?? null, removeItem: key => data.delete(key) } }
  assert.equal(invitationTokenFromHash('#token=' + token), token)
  for (const hash of ['', '#token=short', '#token=' + '!'.repeat(43)]) assert.equal(invitationTokenFromHash(hash), null)
  assert.equal(rememberInvitation(token), true)
  assert.equal(rememberedInvitation(), token)
  const key = [...data.keys()][0]
  data.set(key, JSON.stringify({ token, expires: Date.now() - 1 }))
  assert.equal(rememberedInvitation(), null)
  rememberInvitation(token); forgetInvitation(); assert.equal(rememberedInvitation(), null)
  globalThis.window.sessionStorage.setItem = () => { throw new Error('storage blocked') }
  assert.equal(rememberInvitation(token), false)
})
