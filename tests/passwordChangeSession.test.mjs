import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function moduleUrl(path, replacements = []) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  let code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  for (const [from, to] of replacements) code = code.replace(from, to)
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
}
const flash = moduleUrl('../src/shared/auth/authFlashNotice.ts')
const translations = `data:text/javascript;base64,${Buffer.from('export const i18n = { t: key => key }').toString('base64')}`
const { finishPasswordChangeSession } = await import(moduleUrl('../src/presentation/auth/finishPasswordChangeSession.ts', [
  ['../../shared/auth/authFlashNotice', flash], ['../../shared/i18n', translations], ['import.meta.env.BASE_URL', JSON.stringify('/web/')],
]))

function fixture(t, restricted = false) {
  const previous = globalThis.window
  t.after(() => { globalThis.window = previous })
  const saved = new Map()
  const destinations = []
  let tokens = { accessToken: 'previous-session', refreshToken: 'previous-refresh' }
  globalThis.window = {
    sessionStorage: { setItem: (key, value) => { if (restricted) throw new Error('storage disabled'); saved.set(key, value) } },
    location: { assign: path => destinations.push(path) },
  }
  return { saved, destinations, store: { clearTokens: () => { tokens = null }, getTokens: () => tokens } }
}

test('a password change with revoked sessions clears credentials and explains the new sign-in', t => {
  const f = fixture(t)
  assert.equal(finishPasswordChangeSession({ message: 'changed', reauthenticationRequired: true }, f.store), true)
  assert.equal(f.store.getTokens(), null)
  assert.deepEqual(f.destinations, ['/web/login'])
  const notice = JSON.parse(f.saved.get('superapp.auth.flashNotice'))
  assert.equal(notice.kind, 'info')
  assert.equal(notice.title, 'profile:password.changed')
  assert.equal(notice.message, 'profile:password.signInAgain')
})

test('existing provider responses without session revocation keep the current session', t => {
  const f = fixture(t)
  for (const result of [{ message: 'changed' }, { message: 'changed', reauthenticationRequired: false }]) {
    assert.equal(finishPasswordChangeSession(result, f.store), false)
    assert.equal(f.store.getTokens().accessToken, 'previous-session')
  }
  assert.deepEqual(f.destinations, [])
  assert.equal(f.saved.size, 0)
})

test('blocked browser storage cannot retain revoked credentials or prevent sign-in navigation', t => {
  const f = fixture(t, true)
  assert.equal(finishPasswordChangeSession({ message: 'changed', reauthenticationRequired: true }, f.store), true)
  assert.equal(f.store.getTokens(), null)
  assert.deepEqual(f.destinations, ['/web/login'])
})
