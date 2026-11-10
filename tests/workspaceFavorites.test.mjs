import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/presentation/components/workspace/workspaceFavorites.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
function setup() {
  const storage = new Map()
  let user = 1
  let unavailable = false
  const session = { getTokens: () => ({ accessToken: `header.${Buffer.from(JSON.stringify({ user_id: user })).toString('base64url')}.signature` }) }
  const localStorage = { getItem: key => { if (unavailable) throw Error('Unavailable'); return storage.get(key) ?? null }, setItem: (key, value) => { if (unavailable) throw Error('Unavailable'); storage.set(key, value) } }
  const exports = {}
  runInNewContext(outputText, { exports, atob, Event, localStorage, window: { dispatchEvent() {}, addEventListener() {}, removeEventListener() {} }, require(name) {
    if (name === 'react') return { useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}], useEffect() {}, useMemo: fn => fn() }
    if (name.endsWith('LocalStorageAuthSessionStore')) return { LocalStorageAuthSessionStore: class { getTokens() { return session.getTokens() } } }
    if (name.endsWith('HttpHomeRepository')) return { HttpHomeRepository: class {} }
    if (name === './workspaceApps') return { WORKSPACE_APPS: ['iform', 'edo', 'senimdesk', 'whiteboard'].map(id => ({ id, label: id })) }
    throw Error(name)
  } })
  return { favorites: exports.useWorkspaceFavoriteIds, changeUser: value => { user = value }, disableStorage: () => { unavailable = true } }
}
const ids = state => Array.from(state.ids)
test('defaults are removable, additions persist and empty selection stays empty', () => {
  const app = setup()
  assert.deepEqual(ids(app.favorites()), ['iform', 'edo', 'senimdesk'])
  app.favorites().toggle('senimdesk')
  assert.deepEqual(ids(app.favorites()), ['iform', 'edo'])
  app.favorites().toggle('whiteboard')
  assert.deepEqual(ids(app.favorites()), ['iform', 'edo', 'whiteboard'])
  for (const id of ids(app.favorites())) app.favorites().toggle(id)
  assert.deepEqual(ids(app.favorites()), [])
})
test('different users keep separate selections', () => {
  const app = setup()
  app.favorites().toggle('senimdesk')
  app.changeUser(2)
  assert.deepEqual(ids(app.favorites()), ['iform', 'edo', 'senimdesk'])
  app.favorites().toggle('whiteboard')
  app.changeUser(1)
  assert.deepEqual(ids(app.favorites()), ['iform', 'edo'])
})
test('favorites work when browser storage is unavailable', () => {
  const app = setup()
  app.disableStorage()
  app.favorites().toggle('senimdesk')
  assert.deepEqual(ids(app.favorites()), ['iform', 'edo'])
})
