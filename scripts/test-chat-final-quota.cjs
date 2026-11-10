const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const code = ts.transpileModule(fs.readFileSync('src/infrastructure/repositories/HttpAlemAiRepository.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText
const notice = 'Пятичасовой лимит исчерпан. Продолжить можно после его обновления.'
const requests = []
const moduleValue = { exports: {} }
const dependencies = {
  '../../presentation/pages/alemai/chat/dataPresentation': { normalizeDataCards: value => value, normalizeDataSources: value => value },
  '../http/HttpError': { HttpError: class extends Error {} },
  '../http/authorizedFetch': { authorizedFetch: async (_, path, init) => {
    requests.push({ path, content: init.body.get('content') })
    return new Response(JSON.stringify({
      object: 'chat.quota_stop', model: 'system',
      choices: [{ finish_reason: 'quota_exhausted', message: { role: 'assistant', content: notice } }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      quota_stop: { scope: 'five_hour', consumed_microcredits: '5000000', resets_at: '2026-10-22T17:00:00Z' },
    }), { headers: { 'content-type': 'application/json' } })
  } },
}
new Function('require', 'module', 'exports', code)(name => {
  if (dependencies[name]) return dependencies[name]
  throw new Error(`Unexpected import ${name}`)
}, moduleValue, moduleValue.exports)
;(async () => {
  const api = new moduleValue.exports.HttpAlemAiRepository({})
  const result = await api.askQuestion({ conv_id: 'owned-chat', question: 'последний запрос' })
  assert.equal(result.answer, notice)
  assert.equal(result.convId, 'owned-chat')
  assert.deepEqual(result.conversationHistory.map(message => message.role), ['user', 'assistant'])
  assert.deepEqual(requests, [{ path: '/api/v1/ai/chats/owned-chat/messages', content: 'последний запрос' }])
  console.log('Accepted final-quota response is displayed as chat history without transport retries or draft rejection.')
})().catch(error => { console.error(error); process.exitCode = 1 })
