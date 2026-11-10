const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const source=fs.readFileSync('src/presentation/pages/growy/telegramBridge.ts','utf8');
const context={exports:{}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
const valid=context.exports.telegramBridgePath;

test('bridge allows tenant account selection, login, chat APIs and opaque cursors',()=>{
  for(const route of ['accounts/','accounts/12/','accounts/12/status/','accounts/12/ws-ticket/','accounts/12/auth/qr/','accounts/12/auth/qr/poll/','accounts/12/auth/phone/','accounts/12/auth/resend/','accounts/12/auth/code/','accounts/12/auth/password/','accounts/12/disconnect/','accounts/12/dialogs/','accounts/12/dialogs/3/messages/','accounts/12/dialogs/3/messages/7/attachment/','accounts/12/dialogs/3/details/','accounts/12/dialogs/3/topics/','accounts/12/dialogs/3/participants/','accounts/12/dialogs/3/members/','accounts/12/stories/','accounts/12/stories/3/7/','accounts/12/dialogs/3/members/','accounts/12/stories/','accounts/12/stories/3/7/','accounts/12/dialogs/3/members/','accounts/12/stories/','accounts/12/stories/3/7/','accounts/12/dialogs/3/members/','accounts/12/stories/','accounts/12/stories/3/7/','accounts/12/dialogs/3/members/','accounts/12/stories/','accounts/12/stories/3/7/','accounts/12/dialogs/3/pinned/','accounts/12/dialogs/3/messages/7/edit/','accounts/12/dialogs/3/messages/7/delete/','accounts/12/dialogs/3/messages/7/reaction/','accounts/12/dialogs/3/messages/7/forward/','accounts/12/dialogs/3/messages/7/pin/','accounts/12/dialogs/3/avatar/', 'accounts/12/dialogs/3/attachments/','accounts/12/dialogs/3/sponsored/','accounts/12/dialogs/3/typing/','accounts/12/dialogs/3/read/']) assert.equal(valid('telegram/'+route),'telegram/'+route);
  assert.equal(valid('telegram/accounts/12/dialogs/?cursor=a%2Fb'), 'telegram/accounts/12/dialogs/?cursor=a%2Fb');
});
test('bridge rejects privileged routes, other APIs, encoded paths and traversal',()=>{
  for(const value of [null,{},'https://evil.test/telegram/accounts/','telegram/inbox/','crm/leads/','telegram/accounts/0/','telegram/accounts/12/../../token/','telegram/accounts/%31%32/','telegram/accounts/12//status/','telegram/accounts/12/status/#x','telegram/accounts/12/arbitrary/']) assert.equal(valid(value),null);
});
function bridge(){
  let listener;const messages=[];const parent={postMessage:data=>messages.push(data)};
  const window={parent,addEventListener:(_,callback)=>{listener=callback;}};
  const context={window,location:{origin:'https://workspace.test'},crypto:{randomUUID:()=> 'request-id'},Response,FormData,DOMException};
  vm.runInNewContext(fs.readFileSync('public/growy-telegram/bridge.js','utf8'),context);
  return {window,messages,parent,reply(data,overrides={}){listener({origin:'https://workspace.test',source:parent,data:{type:'workspace:telegram-response',id:'request-id',...data},...overrides});}};
}
test('transport rejects foreign responses and forwards the body and Retry-After without credentials',async()=>{
  const ui=bridge();let settled=false;
  const promise=ui.window.fetch('/api/my/telegram/accounts/12/auth/qr/',{method:'POST',body:'{}',headers:{Authorization:'should-not-forward'}}).then(response=>{settled=true;return response;});
  assert.equal(ui.messages[0].path,'telegram/accounts/12/auth/qr/');
  assert.equal(ui.messages[0].headers,undefined);
  ui.reply({status:200,body:'{}'},{origin:'https://evil.test'});await Promise.resolve();assert.equal(settled,false);
  ui.reply({status:200,body:'{}'},{source:{}});await Promise.resolve();assert.equal(settled,false);
  ui.reply({status:429,headers:{'Retry-After':'30'},body:'{"code":"rate_limited"}'});
  const response=await promise;assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'30');assert.equal((await response.json()).code,'rate_limited');
});
test('transport preserves multipart attachments and cancels abandoned requests',async()=>{
  const ui=bridge(),controller=new AbortController(),form=new FormData();form.append('caption','hello');form.append('file',new Blob(['contents']),'test.txt');
  const promise=ui.window.fetch('/api/my/telegram/accounts/12/dialogs/3/attachments/',{method:'POST',body:form,signal:controller.signal});
  assert.equal(ui.messages[0].form[0][1],'hello');assert.equal(ui.messages[0].form[1][1].name,'test.txt');
  controller.abort();await assert.rejects(promise,{name:'AbortError'});assert.equal(ui.messages[1].type,'workspace:telegram-cancel');
});
