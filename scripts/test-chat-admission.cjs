const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, '../src/presentation/pages/alemai/AlemAIChat.tsx'), 'utf8')
const ast = ts.createSourceFile('chat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let handler
let resetComposer
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'sendMessage') handler = node.initializer.getText(ast)
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'resetComposer') resetComposer = node.initializer.getText(ast)
  ts.forEachChild(node, visit)
}
visit(ast)
assert.ok(handler, 'Test the actual chat send handler')
const js = ts.transpileModule(`const send = ${handler}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const resetJs = ts.transpileModule(`const reset = ${resetComposer}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText

function setup(loading = false) {
  const savedMessages = [{ id: Date.now() + 10_000, role: 'assistant', text: 'Previous answer' }]
  const state = { messages: savedMessages, input: 'дай текст', calls: 0, error: null, typing: false }
  let rejectRequest
  const env = {
    isSendingRef: { current: false }, isTyping: false, isConversationLoading: loading, isSelectedConversationPending: false,
    input: state.input, attachment: null, messages: savedMessages,
    conversationEpoch: { current: 0 }, textareaRef: { current: null },
    token: 'synthetic-test-token', selectedConversationId: 'existing-chat', conversationHistory: [],
    isReasoningActive: false, isCreateImageActive: false, isDeepResearchActive: false, searchMode: 'auto',
    setIsTyping: value => { state.typing = value },
    setComposerError: value => { state.error = value },
    setInput: value => { state.input = value }, setAttachment: () => {}, clearAttachment: () => {},
    setMessages: value => { state.messages = typeof value === 'function' ? value(state.messages) : value },
    getCurrentRuTime: () => '14:17', adaptQuestionForSearchMode: text => text,
    askQuestion: async () => { state.calls++; return new Promise((_, reject) => { rejectRequest = reject }) },
    classifyAICallError: () => ({ kind: 'pre_call_rejection', userMessage: 'Request rejected', retryAt: null, retryKind: null }),
    dispatchAILimitsInvalidated: () => {}, t: key => key,
    conversations: [], buildNewConversationName: text => text, isPlaceholderName: () => false,
    setDraftTitle: () => {}, setConversations: () => {}, updateChatConversation: async () => ({}),
  }
  return {
    send: new Function(...Object.keys(env), `${js}; return send`)(...Object.values(env)),
    reset: new Function(...Object.keys(env), `${resetJs}; return reset`)(...Object.values(env)),
    state, env, savedMessages, reject: () => rejectRequest(new Error('AI_CONCURRENCY_LIMIT')),
  }
}

;(async () => {
  const test = setup()
  const pending = test.send()
  assert.equal(test.state.calls, 1)
  assert.equal(test.state.messages.length, 2, 'Pending requests may show an optimistic bubble')
  await test.send()
  assert.equal(test.state.calls, 1, 'A double click must not send another request')
  test.reject()
  await pending
  assert.deepEqual(test.state.messages, test.savedMessages, 'Rejection restores the snapshot, regardless of timestamp IDs')
  assert.equal(test.state.input, 'дай текст')
  assert.equal(test.state.typing, false)
  assert.equal(test.env.isSendingRef.current, false)
  assert.equal(test.state.error.message, 'Request rejected')
  const retry = test.send()
  assert.equal(test.state.error, null, 'An explicit retry clears the old rejection banner')
  assert.equal(test.state.calls, 2, 'Only the explicit retry may issue a second request')
  test.reject()
  await retry
  assert.deepEqual(test.state.messages, test.savedMessages)
  test.reset()
  assert.equal(test.state.error, null, 'Creating a new chat must clear the previous chat rejection')
  const loading = setup(true)
  await loading.send()
  assert.equal(loading.state.calls, 0, 'Do not send while the selected chat history is loading')
  assert.ok(source.includes('isSendingRef.current || isConversationLoading || isSelectedConversationPending || (!input.trim()'), 'The send button must also reflect history loading')
  const unvalidated = setup()
  unvalidated.env.isSelectedConversationPending = true
  const blockedSend = new Function(...Object.keys(unvalidated.env), `${js}; return send`)(...Object.values(unvalidated.env))
  await blockedSend()
  assert.equal(unvalidated.state.calls, 0, 'Do not send to a stored chat until current ownership is validated')
  const sectionChat = setup()
  const creates = []
  Object.assign(sectionChat.env, {
   selectedConversationId: '', draftSectionId: 'owned-section',
   createChatConversation: async (...args) => { creates.push(args); return {conv_id: 'new-own-chat', name: 'Section chat'} },
   upsertConversation: (items, chat) => [...items, chat],
   askQuestion: async () => { throw new Error('quota') },
  })
  const sectionSend = new Function(...Object.keys(sectionChat.env), `${js}; return send`)(...Object.values(sectionChat.env))
  await sectionSend()
  assert.equal(creates.length, 1)
  assert.equal(creates[0][2], 'owned-section', 'Create chat in the chosen section as part of the creation request')
  const final = setup()
  let invalidated = 0
  const notice = 'Пятичасовой лимит исчерпан. Продолжить можно после его обновления.'
  Object.assign(final.env, {
    selectedConversationIdRef: { current: 'existing-chat' }, skipHydrateRef: { current: null },
    setSelectedConversationId() {}, setConversationHistory() {},
    formatAssistantText: payload => payload.answer, hasNoLiveSources: () => false,
    notifyAIOperationCompleted: () => { invalidated++ },
    askQuestion: async () => ({ convId: 'existing-chat', conversationHistory: [], fullResponse: { answer: notice, route: 'model', sources: [] } }),
  })
  await new Function(...Object.keys(final.env), `${js}; return send`)(...Object.values(final.env))()
  assert.equal(final.state.messages.length, 3, 'Accepted cutoff retains both the prompt and terminal notice')
  assert.equal(final.state.messages.at(-1).text, notice)
  assert.equal(final.state.input, '', 'Accepted cutoff must not restore the submitted draft')
  assert.equal(final.state.error, null, 'A quota stop is a completed turn, not a rejection banner')
  assert.equal(final.state.typing, false)
  assert.equal(invalidated, 1, 'Completion invalidates cached limits so the header refreshes to zero')
  console.log('Actual chat send handler: double clicks, rejected drafts, retry banners, history loading and rollback passed.')
})().catch(error => { console.error(error); process.exitCode = 1 })
