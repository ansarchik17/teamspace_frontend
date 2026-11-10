const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

class HttpError extends Error {
  constructor(status) { super(String(status)); this.status = status }
}
let requests = []
let status = 404
const message = { id: 'm1', conversation_id: 'c1', sender_id: 1, content: '123', type: 'text', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' }
const dependencies = {
  '../http/HttpError': { HttpError },
  '../http/authorizedFetch': { authorizedFetch: async (_, url) => {
    requests.push(url)
    if (url.startsWith('/api/v1/search/messages/global') || url.startsWith('/api/v1/search/attachments')) throw new HttpError(status)
    if (url.startsWith('/api/v1/search/all')) return { json: async () => ({ messages: [message] }) }
    if (url.startsWith('/api/v1/search/messages?')) return { json: async () => ({ messages: [message] }) }
    throw new Error(`Unexpected request: ${url}`)
  } },
  '../http/normalizeBackendAssetUrl': { normalizeBackendAssetUrl: (value) => value },
  '../storage/WebDeviceSessionStore': { WebDeviceSessionStore: class {} },
}
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/infrastructure/repositories/HttpChatRepository.ts'), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const loaded = { exports: {} }
new Function('require', 'module', 'exports', code)((name) => {
  assert.ok(dependencies[name], `Unexpected import ${name}`)
  return dependencies[name]
}, loaded, loaded.exports)

;(async () => {
  const repo = new loaded.exports.HttpChatRepository({})
  repo.getUnifiedChats = async () => [{ id: 'c1', type: 'group', groupName: 'Test' }]
  const global = await repo.searchMessagesGlobal('123')
  assert.equal(global.results[0].message.id, 'm1')
  assert.equal(global.results[0].chatType, 'group')
  assert.equal(global.hasMore, false)
  requests = []
  const local = await repo.searchMessagesGlobal('123', { chatId: 'c1' })
  assert.equal(local.results.length, 1)
  assert.ok(requests.some((url) => url.includes('conversation_id=c1')))
  assert.ok(!requests.some((url) => url.startsWith('/api/v1/search/all')))
  assert.equal((await repo.searchAttachments({ query: '123' })).attachments.length, 0)
  status = 500
  await assert.rejects(repo.searchMessagesGlobal('123'), (error) => error.status === 500)
  await assert.rejects(repo.searchAttachments({ query: '123' }), (error) => error.status === 500)
  console.log('Messenger search compatibility checks passed')
})().catch((error) => { console.error(error); process.exitCode = 1 })
