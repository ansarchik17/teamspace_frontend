import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('../src/shared/auth/corporateLogin.ts', import.meta.url), 'utf8')
const moduleCode = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { loginOrganization, corporateLoginAvailable } = await import(`data:text/javascript;base64,${Buffer.from(moduleCode).toString('base64')}`)

test('company link takes precedence; managed email works without a company link', () => {
  assert.equal(loginOrganization(' ACME ', 'user@other.teamspace.kz', 'teamspace.kz'), 'acme')
  assert.equal(loginOrganization('', ' USER@SULTAN-CORP.TEAMSPACE.KZ ', 'teamspace.kz'), 'sultan-corp')
  assert.equal(loginOrganization('', 'user@acme.example.org', 'example.org'), 'acme')
  for (const login of ['', '000000000000', 'person@gmail.com', 'user@teamspace.kz', 'user@nested.acme.teamspace.kz', 'user@acme.teamspace.kz.evil.com', 'user@@acme.teamspace.kz', 'user@-bad.teamspace.kz']) {
    assert.equal(loginOrganization('', login, 'teamspace.kz'), null, login)
  }
  assert.equal(loginOrganization('../invalid', 'user@acme.teamspace.kz', 'teamspace.kz'), null)
})

test('discovery sends only company slug, with no credentials, and requires explicit true', async t => {
  let call
  t.mock.method(globalThis, 'fetch', async (path, init) => { call = { path, init }; return Response.json({ corporate_login: true }) })
  assert.equal(await corporateLoginAvailable('acme'), true)
  assert.equal(call.path, '/api/v1/auth/login-options?organization=acme')
  assert.equal(call.init.credentials, 'omit')
  assert.equal(call.init.cache, 'no-store')
  assert.equal(call.init.body, undefined)
  for (const data of [{ corporate_login: false }, {}, null, { corporate_login: 'true' }, { enabled: true }]) {
    globalThis.fetch = async () => Response.json(data)
    assert.equal(await corporateLoginAvailable('acme'), false)
  }
})

test('server, transport, malformed response and aborted checks hide corporate login', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }))
  assert.equal(await corporateLoginAvailable('acme'), false)
  globalThis.fetch = async () => { throw new Error('network unavailable') }
  assert.equal(await corporateLoginAvailable('acme'), false)
  globalThis.fetch = async () => new Response('not JSON')
  assert.equal(await corporateLoginAvailable('acme'), false)
  const controller = new AbortController()
  globalThis.fetch = async (_path, options) => { assert.equal(options.signal, controller.signal); throw new DOMException('aborted', 'AbortError') }
  controller.abort()
  assert.equal(await corporateLoginAvailable('acme', controller.signal), false)
})
