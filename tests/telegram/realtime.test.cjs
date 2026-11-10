const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'), vm=require('node:vm');
const context={URL,setTimeout,clearTimeout};
vm.runInNewContext(fs.readFileSync('public/growy-telegram/realtime.js','utf8'),context);
const {create}=context.GrowyTelegramRealtime;
function harness(ticket=async()=>({enabled:true,url:'wss://growy.kz/ws/telegram/accounts/2/?ticket=opaque'})){
  const sockets=[],states=[],events=[],timers=[];
  class Socket{constructor(url){this.url=url;sockets.push(this);}close(){this.onclose?.();}receive(data){this.onmessage?.({data:JSON.stringify(data)});}}
  const client=create({ticket,Socket,onEvent:e=>events.push(e),onState:s=>states.push(s),
    setTimer:(fn,delay)=>{timers.push({fn,delay});return timers.length;},clearTimer(){},random:()=>0.5});
  return {client,sockets,states,events,timers};
}
async function settle(){for(let i=0;i<10;i++)await Promise.resolve();}
test('events activate only after authenticated handshake and stay within selected account',async()=>{
  const h=harness();h.client.start(2);await settle();assert.equal(h.client.isActive(),false);
  h.sockets[0].receive({kind:'connected',account_id:2});assert.equal(h.client.isActive(),true);
  h.sockets[0].receive({kind:'message_new',account_id:3});assert.equal(h.events.length,1);
  h.sockets[0].receive({kind:'message_new',account_id:2,message:{id:7}});assert.equal(h.events[1].message.id,7);
});
test('disconnect switches to fallback and renews the one-use ticket before reconnecting',async()=>{
  let tickets=0;const h=harness(async()=>{tickets++;return {enabled:true,url:'wss://growy.kz/ws/telegram/accounts/2/?ticket='+tickets};});
  h.client.start(2);await settle();h.sockets[0].receive({kind:'connected',account_id:2});h.sockets[0].close();
  assert.equal(h.client.isActive(),false);await h.timers.at(-1).fn();await settle();assert.equal(tickets,2);assert.equal(h.sockets.length,2);
});
test('account switch and logout discard stale ticket responses and old events',async()=>{
  let resolve;const h=harness(()=>new Promise(r=>resolve=r));h.client.start(2);h.client.stop();
  resolve({enabled:true,url:'wss://growy.kz/ws/telegram/accounts/2/?ticket=old'});await settle();assert.equal(h.sockets.length,0);
});
test('disabled deployment remains on polling; denied access stops reconnect attempts',async()=>{
  const h=harness(async()=>({enabled:false}));h.client.start(2);await settle();assert.equal(h.sockets.length,0);assert.equal(h.states.at(-1),'fallback');
  const denied=harness(async()=>{throw Object.assign(new Error('forbidden'),{status:403});});denied.client.start(2);await settle();assert.equal(denied.states.at(-1),'forbidden');assert.equal(denied.timers.length,0);
});
