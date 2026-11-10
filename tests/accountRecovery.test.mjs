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
const { HttpRecoveryRepository, recoveryTokenFromHash } = await import('../src/infrastructure/repositories/HttpRecoveryRepository.ts')
const { ChangeMyPasswordUseCase } = await import('../src/application/use-cases/profile/ChangeMyPasswordUseCase.ts')
const { HttpError } = await import('../src/infrastructure/http/HttpError.ts')
globalThis.localStorage = { getItem: () => null }
const store = { getTokens: () => ({ accessToken: 'synthetic-test-token' }) }
const repo = new HttpRecoveryRepository(store)
const token = 'A'.repeat(43)

test('public recovery secrets use POST bodies with no cookies, authorization or referrer', async t => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (path, init) => { calls.push({ path, init }); return Response.json({ ok: true }) })
  await repo.request('employee')
  await repo.preview(token)
  await repo.complete(token, 'SyntheticPassword123!')
  for (const call of calls) {
    assert.equal(call.init.method, 'POST')
    assert.equal(call.init.credentials, 'omit')
    assert.equal(call.init.cache, 'no-store')
    assert.equal(call.init.referrerPolicy, 'no-referrer')
    assert.equal(call.init.headers.Authorization, undefined)
    assert.equal(call.path.includes(token), false)
    assert.equal(call.path.includes('SyntheticPassword'), false)
  }
  assert.deepEqual(JSON.parse(calls[2].init.body), { token, new_password: 'SyntheticPassword123!' })
})
test('backup email mutations use authenticated endpoints and explicit password proof', async t => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (path, init) => { calls.push({ path, init }); return Response.json({ ok: true }) })
  await repo.state()
  await repo.sendCode('personal@example.invalid', 'bind', 'CurrentPassword123!')
  await repo.confirm('challenge', '123456', 'CurrentPassword123!')
  await repo.sendCode('', 'remove', 'CurrentPassword123!')
  assert.equal(calls[0].path, '/api/v1/auth/recovery-email')
  for (const call of calls) assert.equal(call.init.headers.get('Authorization'), 'Bearer synthetic-test-token')
  assert.deepEqual(JSON.parse(calls[1].init.body), { email: 'personal@example.invalid', purpose: 'bind', password: 'CurrentPassword123!' })
  assert.deepEqual(JSON.parse(calls[2].init.body), { id: 'challenge', code: '123456', password: 'CurrentPassword123!' })
  assert.deepEqual(JSON.parse(calls[3].init.body), { email: '', purpose: 'remove', password: 'CurrentPassword123!' })
})
test('uncertain reset or code submission is never automatically replayed', async t => {
  for (const operation of [() => repo.complete(token, 'SyntheticPassword123!'), () => repo.sendCode('personal@example.invalid', 'bind', 'CurrentPassword123!'), () => repo.confirm('id', '123456', 'CurrentPassword123!')]) {
    let calls = 0
    t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({ error: { code: 'RECOVERY_PENDING', message: 'Retry the link' } }, { status: 503 }) })
    await assert.rejects(operation(), error => error instanceof HttpError && error.code === 'RECOVERY_PENDING')
    assert.equal(calls, 1)
  }
})
test('password changes no longer require chat encryption keys', async () => {
  let payload
  const useCase = new ChangeMyPasswordUseCase({ changePassword: async input => { payload = input; return { message: 'ok' } } })
  await useCase.execute('CurrentPassword123!', 'NewPassword123!')
  assert.equal(payload.oldPassword, 'CurrentPassword123!')
  assert.equal(payload.newPassword, 'NewPassword123!')
  assert.equal(payload.e2eeBackup, undefined)
})
test('recovery fragment rejects absent, duplicated and malformed tokens', () => {
  assert.equal(recoveryTokenFromHash('#token=' + token), token)
  for (const hash of ['', '?token=' + token, '#token=short', '#token=' + token + '&token=' + token, '#token=' + '!'.repeat(43)]) assert.equal(recoveryTokenFromHash(hash), null)
})
