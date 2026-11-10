import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('../src/application/use-cases/auth/RestoreAuthCallbackSessionUseCase.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { RestoreAuthCallbackSessionUseCase } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
const policySource = readFileSync(new URL('../src/domain/entities/onboardingPasswordChange.ts', import.meta.url), 'utf8')
const policyCode = ts.transpileModule(policySource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { requiresOnboardingPasswordChange } = await import(`data:text/javascript;base64,${Buffer.from(policyCode).toString('base64')}`)
const tokenSource = readFileSync(new URL('../src/shared/utils/token.ts', import.meta.url), 'utf8')
const tokenCode = ts.transpileModule(tokenSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const tokenModule = `data:text/javascript;base64,${Buffer.from(tokenCode).toString('base64')}`
const viewSource = readFileSync(new URL('../src/presentation/view-models/AuthViewModel.ts', import.meta.url), 'utf8')
const viewCode = ts.transpileModule(viewSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace('../../shared/utils/token', tokenModule)
  .replace('../../domain/entities/onboardingPasswordChange', `data:text/javascript;base64,${Buffer.from(policyCode).toString('base64')}`)
const { toAuthViewModel } = await import(`data:text/javascript;base64,${Buffer.from(viewCode).toString('base64')}`)

const owner = { accessToken: 'old-owner-access', refreshToken: 'old-owner-refresh' }
const signer = {
  accessToken: 'new-signer-access', refreshToken: 'new-signer-refresh', tokenType: 'Bearer',
  expiresIn: 300, expiresAt: '2026-10-29T10:00:00Z', mustChangePassword: true, cannotSkipPasswordChange: true,
}
function store(initial = owner) {
  let tokens = initial
  return { getTokens: () => tokens, clearTokens: () => { tokens = null }, setTokens: value => { tokens = value } }
}

test('a tenant handoff replaces the former account using cookies, never its saved refresh token', async () => {
  const session = store()
  let release
  const pending = new Promise(resolve => { release = resolve })
  const restore = new RestoreAuthCallbackSessionUseCase({ refresh: async token => {
    assert.equal(token, '')
    assert.equal(session.getTokens(), null)
    return pending
  } }, session)
  const result = restore.execute()
  assert.equal(session.getTokens(), null, 'the old account cannot bootstrap while cookie restoration is pending')
  release(signer)
  await result
  assert.deepEqual(session.getTokens(), signer)
})

test('a first sign-in without local tokens restores the same cookie session', async () => {
  const session = store(null)
  await new RestoreAuthCallbackSessionUseCase({ refresh: async () => signer }, session).execute()
  assert.deepEqual(session.getTokens(), signer)
})

for (const failure of [Object.assign(new Error('expired cookie'), { status: 401 }), new Error('network unavailable')]) {
  test(`failed callback leaves no former identity: ${failure.message}`, async () => {
    const session = store()
    await assert.rejects(new RestoreAuthCallbackSessionUseCase({ refresh: async () => { throw failure } }, session).execute(), error => error === failure)
    assert.equal(session.getTokens(), null)
  })
}

test('an invalid refresh response cannot restore the previous account', async () => {
  for (const accessToken of ['', ' ', undefined]) {
    const session = store()
    await assert.rejects(new RestoreAuthCallbackSessionUseCase({ refresh: async () => ({ accessToken }) }, session).execute())
    assert.equal(session.getTokens(), null)
  }
})

test('cookie-only responses keep the existing expiry and token defaults', async () => {
  const session = store()
  const before = Date.now()
  await new RestoreAuthCallbackSessionUseCase({ refresh: async () => ({ accessToken: 'cookie-access' }) }, session).execute()
  const tokens = session.getTokens()
  assert.equal(tokens.refreshToken, '')
  assert.equal(tokens.tokenType, 'Bearer')
  assert.equal(tokens.expiresIn, 86400)
  assert.ok(Date.parse(tokens.expiresAt) >= before + 86400000)
})

test('native hires cannot skip the initial password change after cookie restoration loses token flags', () => {
  for (const username of ['onb.0675ab3a6ec147d5837c2a81a6e3c85a', 'onb.0675ab3a-6ec1-47d5-837c-2a81a6e3c85a']) {
    assert.equal(requiresOnboardingPasswordChange(username, true), true)
    assert.equal(requiresOnboardingPasswordChange(username, undefined), true, 'unknown server profile cannot unlock the hire')
    assert.equal(requiresOnboardingPasswordChange(username, false), false, 'server-confirmed change unlocks ordinary routes')
  }
})

test('the onboarding gate does not change existing accounts or classify unrelated usernames as hires', () => {
  for (const username of ['', 'q.hiringadmin', 't.qaflow', 'onb.unrelated', 'onb.0675ab3a6ec147d5837c2a81a6e3c85a-extra', 'prefix.onb.0675ab3a6ec147d5837c2a81a6e3c85a']) {
    assert.equal(requiresOnboardingPasswordChange(username, true), false, username)
  }
})

test('restored auth models derive the gate from the server profile even without password flags in renewed tokens', () => {
  const username = 'onb.0675ab3a6ec147d5837c2a81a6e3c85a'
  const tokens = { accessToken: `test.${Buffer.from(JSON.stringify({ preferred_username: username })).toString('base64url')}.test`, expiresAt: '2026-10-29T10:00:00Z' }
  assert.equal(toAuthViewModel(tokens, { username, isFirstLogin: true }).requiresOnboardingPasswordChange, true)
  assert.equal(toAuthViewModel(tokens, { username, isFirstLogin: false }).requiresOnboardingPasswordChange, false)
  assert.equal(toAuthViewModel(tokens, null).requiresOnboardingPasswordChange, true)
  assert.equal(toAuthViewModel(tokens, { username: 'q.hiringadmin', isFirstLogin: true }).requiresOnboardingPasswordChange, false)
  assert.equal(toAuthViewModel(null).requiresOnboardingPasswordChange, false)
})
