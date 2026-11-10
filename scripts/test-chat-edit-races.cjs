const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const sourceText = fs.readFileSync('src/presentation/pages/alemai/AlemAIChat.tsx', 'utf8')
const source = ts.createSourceFile('chat.tsx', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let handler
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'handleEditSubmit') handler = node.initializer.getText(source)
  ts.forEachChild(node, visit)
}
visit(source)
assert.ok(handler)
const js = ts.transpileModule(`const handler = ${handler}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText
function scenario() {
  const messages = [{ id: 1, role: 'user', text: 'original' }, { id: 2, role: 'assistant', text: 'tail' }]
  let displayed = messages
  let rejectRequest
  const deps = {
    messages, isSendingRef: { current: false }, isTyping: false, isConversationLoading: false, isSelectedConversationPending: false, conversationEpoch: { current: 0 },
    setIsTyping() {}, setComposerError() {}, getCurrentRuTime: () => '12:00',
    setMessages: value => { displayed = typeof value === 'function' ? value(displayed) : value },
    isReasoningActive: false, isCreateImageActive: false, isDeepResearchActive: false,
    t: key => key, token: 'test', searchMode: 'all', selectedConversationId: 'old',
    askQuestion: () => new Promise((_, reject) => { rejectRequest = reject }),
    adaptQuestionForSearchMode: text => text,
    classifyAICallError: () => ({ kind: 'pre_call_rejection', userMessage: 'quota', retryAt: null }),
    dispatchAILimitsInvalidated() {},
  }
  const fn = new Function(...Object.keys(deps), `${js}; return handler`)(...Object.values(deps))
  return { deps, fn, reject: () => rejectRequest(new Error('quota')), get: () => displayed }
}
;(async () => {
  const edit = scenario()
  const result = edit.fn('edited draft', 1)
  edit.reject()
  assert.equal(await result, false, 'editor must remain open with its draft')
  assert.deepEqual(edit.get(), edit.deps.messages, 'quota failure must restore the full history')
  const moved = scenario()
  const late = moved.fn('edited draft', 1)
  moved.deps.conversationEpoch.current++
  const nextChat = [{ id: 9, text: 'new chat' }]
  moved.deps.setMessages(nextChat)
  moved.reject()
  await late
  assert.deepEqual(moved.get(), nextChat, 'late failure must not restore another conversation')
  console.log('Actual chat edit handler: full rollback and stale-conversation isolation passed')
})().catch(error => { console.error(error); process.exitCode = 1 })
