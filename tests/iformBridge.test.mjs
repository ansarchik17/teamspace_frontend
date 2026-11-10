import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
const source=readFileSync(new URL('../src/presentation/pages/iform/iformBridge.ts',import.meta.url),'utf8')
const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}})
const {isIFormRequest}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
const request=path=>({type:'iform:request',id:'abc',path,method:'GET'})
test('iframe bridge allows business requests and pagination',()=>{
 assert.equal(isIFormRequest(request('/processes?page=0&pageSize=100')),true)
 assert.equal(isIFormRequest(request('/forms/p_123/lookups/department')),true)
 assert.equal(isIFormRequest(request('/approval-delegations')),true)
 assert.equal(isIFormRequest({...request('/approval-delegations/test-delegation/revoke'),method:'POST'}),true)
})
test('iframe cannot proxy arbitrary URLs, traversal or internal APIs',()=>{
 for(const path of ['/api/internal/iform/context','https://other.test/me','//me','/me/../tenants','/me/%2e%2e/tenants','/me#fragment','/me?x=y?z','/me?x=\u0000','/me?x=\n','/actuator/health'])assert.equal(isIFormRequest(request(path)),false,path)
 assert.equal(isIFormRequest({...request('/me'),method:'TRACE'}),false)
 assert.equal(isIFormRequest({...request('/me'),idempotencyKey:'x\r\nAuthorization: other'}),false)
})
test('multipart requests accept files and reject malformed entries',()=>{
 assert.equal(isIFormRequest({...request('/files'),method:'POST',form:[['file',new Blob(['test'])]]}),true)
 assert.equal(isIFormRequest({...request('/files'),form:[['file',{token:'x'}]]}),false)
})
test('company consistency accepts only canonical Workspace tenant UUIDs',()=>{
 assert.equal(isIFormRequest({...request('/requests/drafts'),method:'POST',expectedTenant:'00000000-0000-0000-0000-000000000001'}),true)
 for(const expectedTenant of ['beles','other\r\nAuthorization: injected',1,null])assert.equal(isIFormRequest({...request('/requests/drafts'),method:'POST',expectedTenant}),false)
})
