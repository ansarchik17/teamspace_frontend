import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { registerHooks } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import axios from 'axios'
import ts from 'typescript'

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && context.parentURL) {
      for (const suffix of ['.js', '.ts', '.tsx']) {
        const url = new URL(specifier + suffix, context.parentURL)
        if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true }
      }
    }
    return next(specifier, context)
  },
  load(url, context, next) {
    if (url.endsWith('.ts')) return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText }
    return next(url, context)
  },
})

const { default: client } = await import('../src/presentation/pages/alemdrive/drive-src/api/client.js')
const { LocalStorageAuthSessionStore } = await import('../src/infrastructure/storage/LocalStorageAuthSessionStore.ts')
const { authorizedFetch } = await import('../src/infrastructure/http/authorizedFetch.ts')
const { HttpError } = await import('../src/infrastructure/http/HttpError.ts')
const session = new LocalStorageAuthSessionStore()
const originalAdapter = client.defaults.adapter
const token = (subject, signature) => `test.${Buffer.from(JSON.stringify({ sub: subject, iss: 'test', organization_id: 'company' })).toString('base64url')}.${signature}`
const initial = { accessToken: token('employee', 'original'), refreshToken: 'test-refresh', tokenType: 'Bearer', expiresIn: 300, expiresAt: '2030-01-01T00:00:00Z' }
const renewed = { access_token: token('employee', 'renewed'), refresh_token: 'rotated-refresh', token_type: 'Bearer', expires_in: 300, expires_at: '2030-01-01T00:00:00Z' }
let events

function storage() {
  const data = new Map()
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) }
}

function respond(config, status = 200, data = {}) {
  const response = { config, status, statusText: String(status), headers: {}, data }
  if (status < 400) return response
  throw new axios.AxiosError('Request failed', axios.AxiosError.ERR_BAD_REQUEST, config, undefined, response)
}

beforeEach(t => {
  events = []
  globalThis.localStorage = storage()
  globalThis.window = { localStorage, sessionStorage: storage(), location: { origin: 'http://localhost:5173', pathname: '/web/drive', href: 'http://localhost:5173/web/drive' }, dispatchEvent: event => { events.push(event); return true } }
  session.setTokens(initial)
  // Reproduce restoration with only the canonical Workspace session saved.
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  t.after(() => { client.defaults.adapter = originalAdapter })
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected refresh request') })
})

test('Drive uses the canonical localStorage access token without cookies or a refresh', async () => {
  localStorage.setItem('superapp.chat.currentWebDeviceId', 'test-device')
  client.defaults.adapter = async config => {
    assert.equal(config.headers.get('Authorization'), `Bearer ${initial.accessToken}`)
    assert.equal(config.headers.get('X-Web-Device-ID'), 'test-device')
    assert.equal(config.withCredentials, true)
    return respond(config, 200, { items: [{ id: 'own-file' }] })
  }
  assert.deepEqual((await client.get('/drive/items/own')).data.items, [{ id: 'own-file' }])
  assert.equal(events.length, 0)
})

test('cookie-only sessions remain usable without an Authorization header', async () => {
  session.clearTokens()
  events.length = 0
  client.defaults.adapter = async config => {
    assert.equal(config.headers.get('Authorization'), undefined)
    assert.equal(config.withCredentials, true)
    return respond(config)
  }
  await client.get('/auth/me')
  assert.equal(events.length, 0)
})

test('Drive renews with the stored refresh token, saves rotation and retries the original upload', async t => {
  let attempts = 0
  const upload = new FormData()
  upload.append('file', new Blob(['test contents']), 'test.txt')
  const progress = () => {}
  t.mock.method(globalThis, 'fetch', async (path, init) => {
    assert.equal(path, '/api/v1/auth/refresh')
    assert.equal(init.method, 'POST')
    assert.equal(init.credentials, 'include')
    assert.deepEqual(JSON.parse(init.body), { refresh_token: 'test-refresh' })
    return Response.json(renewed)
  })
  client.defaults.adapter = async config => {
    attempts++
    assert.equal(config.data, upload)
    assert.equal(config.onUploadProgress, progress)
    assert.equal(config.headers.get('Authorization'), `Bearer ${attempts === 1 ? initial.accessToken : renewed.access_token}`)
    return respond(config, attempts === 1 ? 401 : 200)
  }
  await client.post('/drive/files', upload, { headers: { 'Content-Type': 'multipart/form-data' }, onUploadProgress: progress })
  assert.equal(attempts, 2)
  assert.equal(session.getTokens().accessToken, renewed.access_token)
  assert.equal(session.getTokens().refreshToken, renewed.refresh_token)
  assert.equal(localStorage.getItem('access_token'), renewed.access_token)
  assert.equal(localStorage.getItem('refresh_token'), renewed.refresh_token)
  assert.equal(events.length, 0)
})

test('parallel Drive and Workspace requests share one refresh and reuse it for a late 401', async t => {
  let refreshes = 0
  let releaseRefresh
  const refreshPending = new Promise(resolve => { releaseRefresh = resolve })
  let lateResponse
  client.defaults.adapter = async config => {
    if (config.headers.get('Authorization') === `Bearer ${renewed.access_token}`) return respond(config)
    if (config.url === '/drive/recent') return new Promise((_resolve, reject) => { lateResponse = () => { try { respond(config, 401) } catch (error) { reject(error) } } })
    return respond(config, 401)
  }
  t.mock.method(globalThis, 'fetch', async (path, init) => {
    if (path === '/api/v1/auth/refresh') {
      refreshes++
      await refreshPending
      return Response.json(renewed)
    }
    return Response.json({}, { status: init.headers.get('Authorization') === `Bearer ${renewed.access_token}` ? 200 : 401 })
  })
  const late = client.get('/drive/recent')
  const pending = Promise.all([client.get('/drive/items/own'), client.get('/drive/summary'), authorizedFetch(session, '/api/v1/auth/me')])
  // Allow both Axios response interceptors to join the pending shared refresh.
  await new Promise(resolve => setImmediate(resolve))
  releaseRefresh()
  await pending
  lateResponse()
  await late
  assert.equal(refreshes, 1)
  assert.equal(events.length, 0)
})

test('a late 401 cannot replay an operation under a different signed-in account', async () => {
  let release
  let attempts = 0
  client.defaults.adapter = async config => {
    attempts++
    return new Promise((_resolve, reject) => { release = () => { try { respond(config, 401) } catch (error) { reject(error) } } })
  }
  const pending = client.post('/drive/folders', { name: 'Former account folder' })
  await new Promise(resolve => setImmediate(resolve))
  const otherAccount = { ...initial, accessToken: token('another-employee', 'other') }
  session.setTokens(otherAccount)
  release()
  await assert.rejects(pending, error => error.response?.status === 401)
  assert.equal(attempts, 1)
  assert.deepEqual(session.getTokens(), otherAccount)
  assert.equal(events.length, 0)
})

test('rejected renewal clears the whole Workspace session and emits the common expiry event', async t => {
  for (const status of [401, 403]) {
    session.setTokens(initial)
    events.length = 0
    client.defaults.adapter = async config => respond(config, 401)
    t.mock.method(globalThis, 'fetch', async () => Response.json({ message: 'Expired' }, { status }))
    await assert.rejects(client.get('/drive/items/own'), error => error instanceof HttpError && error.status === status)
    assert.equal(session.getTokens(), null)
    for (const key of ['superapp.auth.tokens', 'access_token', 'refresh_token']) assert.equal(localStorage.getItem(key), null)
    assert.equal(events.filter(event => event.type === 'superapp:auth-session-expired').length, 1)
  }
})

test('network and server refresh failures preserve the session for a later retry', async t => {
  for (const unavailable of [false, true]) {
    events.length = 0
    client.defaults.adapter = async config => respond(config, 401)
    t.mock.method(globalThis, 'fetch', async () => {
      if (unavailable) throw new TypeError('Network unavailable')
      return Response.json({}, { status: 503 })
    })
    await assert.rejects(client.get('/drive/items/own'))
    assert.deepEqual(session.getTokens(), initial)
    assert.equal(events.length, 0)
    assert.equal(window.location.href, 'http://localhost:5173/web/drive')
  }
})

test('a second 401 ends the session without another refresh or an infinite retry', async t => {
  let attempts = 0
  let refreshes = 0
  client.defaults.adapter = async config => { attempts++; return respond(config, 401) }
  t.mock.method(globalThis, 'fetch', async () => { refreshes++; return Response.json(renewed) })
  await assert.rejects(client.get('/drive/items/own'), error => error.response?.status === 401)
  assert.equal(attempts, 2)
  assert.equal(refreshes, 1)
  assert.equal(session.getTokens(), null)
  assert.equal(events.filter(event => event.type === 'superapp:auth-session-expired').length, 1)
})

test('forbidden resources and public or login errors do not invalidate a valid session', async () => {
  for (const [path, status] of [['/drive/files/foreign', 403], ['/public/drive/items/shared', 401], ['/auth/login', 401]]) {
    client.defaults.adapter = async config => {
      if (path.startsWith('/public/') || path === '/auth/login') assert.equal(config.headers.get('Authorization'), undefined)
      return respond(config, status)
    }
    await assert.rejects(client.get(path), error => error.response?.status === status)
    assert.deepEqual(session.getTokens(), initial)
    assert.equal(events.length, 0)
  }
})

test('absolute requests outside the configured API never receive the Workspace token or refresh it', async () => {
  client.defaults.adapter = async config => {
    assert.equal(config.headers.get('Authorization'), undefined)
    return respond(config, 401)
  }
  for (const path of ['https://external.example.invalid/drive/files', 'http://localhost:5173/api/v1-other/drive/files']) {
    await assert.rejects(client.get(path), error => error.response?.status === 401)
  }
  assert.deepEqual(session.getTokens(), initial)
  assert.equal(events.length, 0)
})
