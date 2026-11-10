import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import ts from 'typescript'

function moduleUrl(path, replacements = []) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  let { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  for (const [from, to] of replacements)
    outputText = outputText.replace(from, to)
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
}
const errorUrl = moduleUrl('../src/infrastructure/http/HttpError.ts')
const { HttpError } = await import(errorUrl)
const { meetGuestApi } = await import(
  moduleUrl('../src/infrastructure/meet/meetGuestApi.ts', [
    ['../http/HttpError', errorUrl],
  ])
)

test('guest admission sends only a name, using a meeting-scoped cookie instead of Workspace authorization', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init })
    return Response.json({ guest: { name: 'Айдана', status: 'pending' } })
  })
  const result = await meetGuestApi.requestJoin('meeting-id', 'Айдана')
  assert.equal(result.guest.status, 'pending')
  assert.equal(calls[0].url, '/api/v1/meet-guest/meeting-id/session')
  assert.equal(calls[0].init.credentials, 'same-origin')
  assert.equal(calls[0].init.cache, 'no-store')
  assert.deepEqual(JSON.parse(calls[0].init.body), { name: 'Айдана' })
  assert.equal(new Headers(calls[0].init.headers).has('Authorization'), false)
})

test('an expired guest session does not invoke Workspace refresh or log out a signed-in user', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url)
    return Response.json({ message: 'Сессия гостя истекла' }, { status: 401 })
  })
  await assert.rejects(
    meetGuestApi.status('meeting-id'),
    (error) => error instanceof HttpError && error.status === 401,
  )
  assert.deepEqual(calls, ['/api/v1/meet-guest/meeting-id/join-requests/me'])
})

test('guest exit handles an empty response and keeps admission status separate from the media token', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.equal(init.method, 'DELETE')
    assert.equal(init.body, undefined)
    return new Response(null, { status: 204 })
  })
  assert.equal(await meetGuestApi.leave('meeting-id'), undefined)
})
