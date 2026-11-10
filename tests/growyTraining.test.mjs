import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const source = readFileSync(new URL('../src/infrastructure/repositories/HttpGrowyRepository.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })

function repository(sessionStore, request) {
  const module = { exports: {} }
  new Function('require', 'module', 'exports', outputText)(name => {
    if (name.endsWith('/growy')) return { GROWY_BASE_URL: '/growy' }
    if (name.endsWith('/authorizedFetch')) return { authorizedFetch: request }
    throw new Error(`Unexpected import: ${name}`)
  }, module, module.exports)
  return new module.exports.HttpGrowyRepository(sessionStore)
}

test('unfinished training uses the Workspace proxy instead of sending its token to Growy', async () => {
  const store = { getTokens: () => ({ accessToken: 'workspace-only-token' }) }
  let calls = 0
  const repo = repository(store, async (session, path, options) => {
    calls++
    assert.equal(session, store)
    assert.equal(path, '/api/v1/growy/api/training-programs/my-unfinished/')
    assert.equal(options.headers.Authorization, undefined)
    return new Response(JSON.stringify({
      in_progress: [{ id: 2, training_program: 20, training_program_name: 'Current', progress: 25 }],
      assigned: [{ id: 3, training_program: 30, training_program_name: 'Assigned' }],
    }))
  })
  const programs = await repo.getMyUnfinishedPrograms()
  assert.equal(calls, 1)
  assert.deepEqual(programs.map(item => item.title), ['Current', 'Assigned'])
  assert.equal(programs[0].progress, 25)
})

test('anonymous sessions do not request employee training', async () => {
  const repo = repository({ getTokens: () => null }, () => assert.fail('Unexpected request'))
  assert.deepEqual(await repo.getMyUnfinishedPrograms(), [])
})

test('proxy failures remain errors instead of appearing as an empty training list', async () => {
  const repo = repository({ getTokens: () => ({ accessToken: 'workspace-only-token' }) }, async () => { throw new Error('Company unavailable') })
  await assert.rejects(repo.getMyUnfinishedPrograms(), /Company unavailable/)
})
