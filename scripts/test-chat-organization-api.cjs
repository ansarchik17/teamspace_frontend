const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
function load(file, deps) {
 const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022,module: ts.ModuleKind.CommonJS}}).outputText
 const module = {exports: {}}
 new Function('require', 'module', 'exports', js)(name => {if (deps[name]) return deps[name];throw new Error('Unexpected import '+name)},module,module.exports)
 return module.exports
}
const requests = []
const {HttpAlemAiRepository} = load('src/infrastructure/repositories/HttpAlemAiRepository.ts', {
 '../../presentation/pages/alemai/chat/dataPresentation': {normalizeDataCards: value => value,normalizeDataSources: value => value},
 '../http/HttpError': {HttpError: class extends Error {}},
 '../http/authorizedFetch': {authorizedFetch: async (_store,path,init) => {
  requests.push({path,method: init.method || 'GET',body: init.body ? JSON.parse(init.body) : undefined})
  const data = path.endsWith('/sections') && init.method === 'POST' ? {id:'section',name:'Work',description:'',color:'#2458D3'}
   : path.endsWith('/chats') && init.method === 'POST' ? {id:'chat'} : []
  return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}})
 }},
})
;(async () => {
 const api = new HttpAlemAiRepository({})
 const section = await api.createChatSection({name:'Work',color:'#2458D3'})
 assert.equal(section.id,'section')
 const chat = await api.createChatConversation('First in section',section.id)
 assert.equal(chat.conv_id,'chat');assert.equal(chat.section_id,'section')
 assert.deepEqual(requests.at(-1).body,{title:'First in section',section_id:'section'})
 await api.updateChatConversation('chat',{archived:true})
 assert.deepEqual(requests.at(-1),{path:'/api/v1/ai/chats/chat',method:'PATCH',body:{archived:true}})
 await api.updateChatConversation('chat',{archived:false,section_id:null})
 assert.deepEqual(requests.at(-1).body,{archived:false,section_id:null})
 await api.listChatConversations()
 assert.equal(requests.at(-1).path,'/api/v1/ai/chats?include_archived=true')
 console.log('Chat organization API: section creation, atomic chat assignment, archive/restore and list contract passed.')
})().catch(error => {console.error(error);process.exitCode=1})
