const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const text = fs.readFileSync('src/presentation/pages/alemai/AlemAIChat.tsx', 'utf8')
const ast = ts.createSourceFile('chat.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let loadSource, hydrateSource
function visit(node) {
 if (ts.isVariableDeclaration(node)) {
  if (node.name.getText(ast) === 'loadConversations') loadSource = node.initializer.getText(ast)
  if (node.name.getText(ast) === 'hydrateConversation') hydrateSource = node.initializer.arguments[0].getText(ast)
 }
 ts.forEachChild(node, visit)
}
visit(ast)
function bind(source, env) {
 const js = ts.transpileModule('const run = ' + source, {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText
 return new Function(...Object.keys(env), js + '; return run')(...Object.values(env))
}
async function load(stored, chats) {
 const state = {selected: stored, detailError: 'old 403', composerError: 'old 403', validated: ''}
 const env = {
  token: 'current-account', isAlive: true, selectedConversationIdRef: {current: stored}, conversationEpoch: {current: 0},
  setConversations() {}, setIsConversationsLoading() {}, setIsConversationLoading() {}, setConversationsError() {},
  listChatConversations: async () => chats, sortConversations: list => list, isEmptyDraft: () => false,
  setSelectedConversationId: id => {state.selected = id}, setConversationListToken: token => {state.validated = token},
  setConversationDetailError: error => {state.detailError = error}, setComposerError: error => {state.composerError = error},
 }
 await bind(loadSource, env)()
 return state
}
async function staleHistory(switchAccount) {
 let rejectHistory
 const state = {error: 'new chat', messages: ['new chat'], loading: false}
 const env = {
  token: 'old-account', currentChatTokenRef: {current: 'old-account'}, conversationEpoch: {current: 0},
  setIsConversationLoading: loading => {state.loading = loading}, setConversationDetailError: error => {state.error = error},
  setConversationHistory() {}, setDocumentStatuses() {}, setConversations() {},
  setMessages: messages => {state.messages = messages},
  getChatConversation: () => new Promise((_,reject) => {rejectHistory = reject}), listAIDocuments: async () => [],
 }
 const pending = bind(hydrateSource, env)('old-chat')
 state.messages = ['new chat']; state.error = 'new chat'; state.loading = false
 if (switchAccount) env.currentChatTokenRef.current = 'new-account'
 else env.conversationEpoch.current++
 rejectHistory(new Error('Forbidden from previous chat'))
 await pending
 assert.deepEqual(state.messages, ['new chat'])
 assert.equal(state.error, 'new chat')
 assert.equal(state.loading, false)
}
;(async () => {
 const own = [{conv_id: 'own-chat', archived: false}]
 const stale = await load('other-users-chat', own)
 assert.equal(stale.selected, 'own-chat')
 assert.equal(stale.detailError, '')
 assert.equal(stale.composerError, null)
 assert.equal(stale.validated, 'current-account')
 assert.equal((await load('other-users-chat', [])).selected, '')
 assert.equal((await load('own-chat', own)).selected, 'own-chat')
 await staleHistory(false)
 await staleHistory(true)
 console.log('Actual chat loaders: stored selection ownership and stale account/chat errors passed.')
})().catch(error => {console.error(error);process.exitCode = 1})
