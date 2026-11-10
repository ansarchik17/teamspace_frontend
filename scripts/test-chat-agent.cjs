const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

function load(file, deps = {}) {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', js)(name => deps[name] || require(name), module, module.exports)
  return module.exports
}

const presentation = load('src/presentation/pages/alemai/chat/dataPresentation.ts')
const token = 'fe89bfce-5f00-443a-b5ba-5fb43c100cef'
const card = {
  id: `action-${token}`, source_id: 'agent-action', service: 'Team AI', title: 'Создать встречу', status: 'pending',
  confirmation: { token, expires_at: new Date(Date.now() + 300000).toISOString() },
  fields: [{ label: 'Начало', value: '2026-10-23T10:00:00+05:00' }],
}
const normalized = presentation.normalizeDataCards([card, {
  id: 'source', source_id: 'S1', title: 'Source', service: 'example.org', external_url: 'https://example.org/news',
}, { id: 'bad', source_id: 'S2', title: 'Bad', service: 'web', external_url: 'javascript:alert(1)', href: '//evil.org', confirmation: { token, expires_at: 'invalid' } }])
assert.deepEqual(normalized[0].confirmation, card.confirmation, 'Reloading must preserve a server-issued confirmation')
assert.equal(normalized[1].external_url, 'https://example.org/news')
assert.equal(normalized[2].external_url, undefined)
assert.equal(normalized[2].href, undefined)
assert.equal(normalized[2].confirmation, undefined)

const requests = []
const { HttpAlemAiRepository } = load('src/infrastructure/repositories/HttpAlemAiRepository.ts', {
  '../../presentation/pages/alemai/chat/dataPresentation': presentation,
  '../http/HttpError': { HttpError: class extends Error {} },
  '../http/authorizedFetch': { authorizedFetch: async (_store, path, init) => {
    requests.push({ path, init })
    const data = init.method === 'POST'
      ? { choices: [{ message: { content: 'Действие отменено.' } }], data_cards: [] }
      : [{ role: 'assistant', content: 'Проверьте параметры.', data_cards: [card] }]
    return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
  } },
})

// Exercise the actual send handler: confirmation must not attach or erase a draft,
// target another conversation, or issue another request on a double click.
const source = fs.readFileSync('src/presentation/pages/alemai/AlemAIChat.tsx', 'utf8')
const ast = ts.createSourceFile('chat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let handler
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'sendMessage') handler = node.initializer.getText(ast)
  ts.forEachChild(node, visit)
}
visit(ast)
const handlerJS = ts.transpileModule(`const send = ${handler}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText

async function testHandler() {
  const state = { input: 'Несохранённый черновик', messages: [], attachment: { name: 'draft.txt', file: new Blob(['draft']) }, requests: [] }
  let finish
  const env = {
    input: state.input, messages: [], attachment: state.attachment,
    isSendingRef: { current: false }, isTyping: false, isConversationLoading: false, isSelectedConversationPending: false,
    conversationEpoch: { current: 0 }, selectedConversationId: 'current-chat', selectedConversationIdRef: { current: 'current-chat' },
    token: 'user-session', conversationHistory: [], conversations: [], searchMode: 'auto', textareaRef: { current: null },
    isReasoningActive: false, isCreateImageActive: false, isDeepResearchActive: false,
    t: key => key, getCurrentRuTime: () => '10:00', buildNewConversationName: value => value,
    setIsTyping() {}, setComposerError() {}, setConversations() {}, setConversationHistory() {}, setSelectedConversationId() {},
    setInput: value => { state.input = value }, setAttachment: value => { state.attachment = value },
    setMessages: value => { state.messages = typeof value === 'function' ? value(state.messages) : value },
    adaptQuestionForSearchMode: value => value, formatAssistantText: payload => payload.answer, hasNoLiveSources: () => false,
    notifyAIOperationCompleted() {},
    askQuestion: params => { state.requests.push(params); return new Promise(resolve => { finish = resolve }) },
    classifyAICallError: error => { throw error },
  }
  const send = new Function(...Object.keys(env), `${handlerJS}; return send`)(...Object.values(env))
  const pending = send({ token, decision: 'confirm' })
  assert.equal(state.requests.length, 1)
  assert.equal(state.requests[0].convId, 'current-chat')
  assert.deepEqual(state.requests[0].actionDecision, { token, decision: 'confirm' })
  assert.equal(state.requests[0].file, null)
  assert.equal(state.input, 'Несохранённый черновик')
  assert.equal(state.attachment.name, 'draft.txt')
  assert.equal(await send({ token, decision: 'confirm' }), false)
  assert.equal(state.requests.length, 1)
  finish({ convId: 'current-chat', conversationHistory: [], fullResponse: { answer: 'Встреча создана.', data_cards: [], data_sources: [] } })
  assert.equal(await pending, true)
  assert.equal(state.messages.at(-1).text, 'Встреча создана.')
  assert.equal(state.input, 'Несохранённый черновик')
}

;(async () => {
  const repo = new HttpAlemAiRepository({})
  const detail = await repo.getChatConversation('owned-chat')
  assert.deepEqual(detail.messages[0].data_cards[0].confirmation, card.confirmation)
  await repo.askQuestion({ question: 'Отменить действие', conv_id: 'owned-chat', actionDecision: { token, decision: 'cancel' } })
  const { path, init } = requests.at(-1)
  assert.equal(path, '/api/v1/ai/chats/owned-chat/messages')
  assert.equal(init.body.get('confirmation_token'), token)
  assert.equal(init.body.get('action_decision'), 'cancel')
  assert.equal(init.body.get('content'), 'Отменить действие')
  await testHandler()

  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const { DataCards } = load('src/presentation/pages/alemai/chat/components/DataCards.tsx', {
    '../dataPresentation': presentation, '../chatUi': { CHAT_FOCUS: 'focus-visible:outline' },
    'react-i18next': { useTranslation: () => ({ t: key => key }) },
  })
  const html = renderToStaticMarkup(React.createElement(DataCards, { cards: normalized.slice(0, 2), disabled: true }))
  assert.ok(html.includes('chat.agentActionConfirm'))
  assert.ok(html.includes('disabled=""'), 'Submitting a request must disable the confirmation controls')
  assert.ok(html.includes('https://example.org/news') && html.includes('noopener noreferrer'))
  assert.ok(html.includes('chat.openSource'))
  console.log('Main chat agent: persistent confirmations, exact request routing, draft preservation, duplicate-click protection, source URL safety and disabled controls passed.')
})().catch(error => { console.error(error); process.exitCode = 1 })
