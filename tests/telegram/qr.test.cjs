const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function inbox(options = {}) {
  let now = 100000, nextTimer = 0, authListener;
  const timers = new Map(), elements = new Map(), calls = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, {id, value:'', disabled:false, hidden:true, textContent:'',
      handlers:{}, addEventListener(name, handler) {this.handlers[name] = handler;},
      replaceChildren() {}, append() {}, removeAttribute() {}, classList:{add(){},remove(){},toggle(){}},
      querySelectorAll() {return id === 'code-form' ? [element('resend-code'), element('code-qr')] : [];}});
    return elements.get(id);
  };
  const fetch = async (path, request) => {
    calls.push({path, request});
    if (path.endsWith('accounts/')) return Response.json({configured:true, results:[{id:12,state:'code_required'}]});
    if (path.endsWith('status/')) return Response.json({state:options.state || 'code_required'});
    if (path.endsWith('auth/qr/')) return Response.json({state:options.qrState || 'qr_required',url:'tg://login?token=example',qr_image:'example'});
    if (path.endsWith('auth/password/')) return Response.json({code:'invalid_credentials'}, {status:400});
    throw new Error(`Unexpected path ${path}`);
  };
  const parent = {};
  const context = {document:{getElementById:element,createElement:()=>element('option'),querySelectorAll:()=>[],addEventListener(){},hidden:false},
    window:{parent,addEventListener:(_,handler)=>{authListener=handler;}},location:{origin:'https://workspace.test'},
    GrowyTelegramRequests:{createRequestContext:()=>({enqueue:fn=>fn(()=>{}),invalidate(){}})},
    Date:class extends Date {static now(){return now;}},fetch,Response,FormData,AbortController,URL,URLSearchParams,
    setTimeout:(fn,delay)=>{timers.set(++nextTimer,{fn,delay});return nextTimer;},clearTimeout:id=>timers.delete(id),
  };
  context.window.parent = context.window; // suppress the embedding ready event
  vm.runInNewContext(fs.readFileSync('public/growy-telegram/inbox.js','utf8'),context);
  authListener({origin:context.location.origin,source:context.window,data:{type:'growy:telegram-auth',access:'test'}});
  return {element,calls,async ready(){for(let i=0;i<15;i++)await new Promise(setImmediate);},advance(seconds){
    now += seconds*1000;
    for (const [id,timer] of [...timers]) if (timer.delay === 1000) {timers.delete(id);timer.fn();}
  }};
}

test('pending phone login can switch to QR without requesting another code', async()=>{
  const ui=inbox();await ui.ready();
  assert.equal(ui.element('connect-options').hidden,false);
  await ui.element('qr-start').onclick();
  assert.equal(ui.element('qr-panel').hidden,false);
  assert.equal(ui.element('connect-options').hidden,true);
  assert.equal(ui.calls.filter(call=>call.path.endsWith('auth/qr/')).length,1);
  assert.ok(!ui.calls.some(call=>/auth\/(phone|code|resend)\//.test(call.path)));
});
test('QR login still requests the Telegram two-step password', async()=>{
  const ui=inbox({state:'disconnected',qrState:'password_required'});await ui.ready();
  await ui.element('qr-start').onclick();
  assert.equal(ui.element('password-form').hidden,false);
  assert.equal(ui.element('qr-panel').hidden,true);
  assert.equal(ui.element('connect-options').hidden,true);
  ui.element('password').value='test-password';
  await ui.element('password-form').handlers.submit({preventDefault(){},target:ui.element('password-form')});
  assert.equal(ui.element('password').value,'');
  assert.ok(ui.calls.some(call=>call.path.endsWith('auth/password/')));
});
test('Telegram phone controls are absent from the page',()=>{
  const html=fs.readFileSync('public/growy-telegram/index.html','utf8');
  assert.ok(!/id="(phone-form|phone|code-form|code|resend-code|code-qr)"/.test(html));
  assert.ok(!html.includes('Войти по номеру'));
});
