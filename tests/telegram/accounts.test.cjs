const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const dependencies={};
vm.runInNewContext(fs.readFileSync('public/growy-telegram/requests.js','utf8'),dependencies);
vm.runInNewContext(fs.readFileSync('public/growy-telegram/history.js','utf8'),dependencies);
const {createRequestContext}=dependencies.GrowyTelegramRequests;
const history=dependencies.GrowyTelegramHistory;

function page(initialAccounts, forum = false, fixture = {}) {
  const elements = new Map(), calls = [];
  function element() {
    return {value:'', hidden:false, disabled:false, textContent:'', children:[], files:[],
      dataset:{}, style:{}, parentNode:null, root:false,
      get firstChild(){return this.children[0] || null;},
      get nextSibling(){const children=this.parentNode?.children || [];return children[children.indexOf(this)+1] || null;},
      get childNodes(){return this.children;},
      get isConnected(){return this.root || !!this.parentNode?.isConnected;},
      setAttribute(){}, showModal(){this.open=true;}, close(){this.open=false;},
      remove(){if(this.parentNode){const children=this.parentNode.children;children.splice(children.indexOf(this),1);this.parentNode=null;}}, listeners:{}, classList:{add(){},remove(){},toggle(){}},
      addEventListener(name, fn) {this.listeners[name]=fn;},
      querySelectorAll() {return [];}, querySelector() {return element();},
      append(...children) {for(const child of children)this.insertBefore(child,null);},
      prepend(child){this.insertBefore(child,this.firstChild);},
      insertBefore(child,before){if(child.parentNode)child.remove();const index=before?this.children.indexOf(before):this.children.length;this.children.splice(index,0,child);child.parentNode=this;},
      replaceChildren(...children) {for(const child of this.children)child.parentNode=null;this.children=[];this.append(...children);}, removeAttribute(){}, focus(){}};
  }
  const html=fs.readFileSync('public/growy-telegram/index.html','utf8');
  for (const match of html.matchAll(/id="([^"]+)"/g)) {const node=element();node.root=true;elements.set(match[1],node);}
  const accounts=initialAccounts || [{id:11,label:'Sales',state:'connected'}, {id:22,label:'Support',state:'disconnected'}];
  let pendingDialogs = null, realtimeOptions = null, realtimeAccount = null;
  const context = {
    document: {getElementById: id=>{assert.ok(elements.has(id),`Missing DOM element ${id}`);return elements.get(id);},
      createElement:element,querySelectorAll:()=>[],addEventListener(){},hidden:false},
    GrowyTelegramRequests:{createRequestContext}, GrowyTelegramHistory:history,
    AbortController, FormData, URL, URLSearchParams, setTimeout:()=>1, clearTimeout(){},
    location:{origin:'https://example.test'}, crypto:{randomUUID:()=> 'test-request'},
    confirm:()=>true, prompt:()=>null,
    fetch:async(url,options={})=>{
      calls.push({url,options});
      let data;
      if(url==='/api/token/') data={access:'growy-access'};
      else if(url==='/api/my/telegram/accounts/') {
        if(options.method==='POST') {const account={id:33,label:'',state:'disconnected'};accounts.push(account);data=account;}
        else data={configured:true,results:accounts};
      } else if(url.endsWith('/status/')) {
        const id=Number(url.match(/accounts\/(\d+)/)[1]);data={configured:true,...accounts.find(a=>a.id===id)};
      } else if(url.includes('/stories/')) {
        if(/stories\/\d+\/\d+\/$/.test(url)) {if(options.method==='POST')data={ok:true};else return {ok:true,status:200,blob:async()=>new Blob(['jpeg'],{type:'image/jpeg'})};}
        else data={results:[{sender:{name:'Alice',peer_id:71},stories:[{id:7,caption:'My story',attachment:{mime_type:'image/jpeg'}}]}],next_cursor:null};
      } else if(url.includes('/participants/')) {data={results:[{name:'Alice',peer_id:71,telegram_id:'987',role:'member'}],next_offset:null};
      } else if(url.includes('/members/')) {data={ok:true};
      } else if(url.endsWith('/details/')) { data={forum,can_pin:true,can_ban:fixture.admin,can_invite:fixture.admin,can_add_admins:fixture.admin};
      } else if(url.endsWith('/pinned/')) {data={results:[]};
      } else if(url.includes('/topics/')) {data={results:[{id:17,title:'Frontend',top_message:5,closed:false}],messages:[],next_offset:null};
      } else if(url.endsWith('/attachment/')) {return {ok:true,status:200,blob:async()=>new Blob(['jpeg'],{type:'image/jpeg'})};
      } else if(url.includes('/messages/')) {data={results:[{id:url.includes('before=') ? 4 : 5,text:url.includes('before=') ? 'Older message' : 'Hello',sender:{name:'Alice'},...(fixture.media && !url.includes('before=')?{attachment:{name:'photo.jpg',mime_type:'image/jpeg',size:4,kind:'photo'}}:{}),outgoing:true,date:'2026-10-05T08:00:00Z'}],next_before:fixture.paging && !url.includes('before=') ? 4 : null};
      } else if(url.endsWith('/read/') || url.endsWith('/sponsored/')) {data={ok:true,results:[]};
      } else if(url.includes('/dialogs/')) {
        if(pendingDialogs) {const promise=pendingDialogs;pendingDialogs=null;await promise;}
        data={results:forum ? [{id:99,title:'Growy-Devs',kind:'channel',forum:true}] : [{id:99,title:'Client',kind:'user'}],next_cursor:fixture.paging && !url.includes('cursor=') ? 'next-dialogs' : null};
      } else throw new Error(`Unexpected request ${url}`);
      return {ok:true,status:200,json:async()=>data};
    },
  };
  context.window={parent:null,addEventListener(){}};context.window.parent=context.window;
  if(fixture.realtime)context.window.GrowyTelegramRealtime={create(options){realtimeOptions=options;return {
    start(id){realtimeAccount=id;},stop(){realtimeAccount=null;},isActive(){return realtimeAccount!==null;}
  };}};
  vm.runInNewContext(fs.readFileSync('public/growy-telegram/inbox.js','utf8'),context);
  return {elements,calls,event(value){realtimeOptions.onEvent(value);},realtimeAccount(){return realtimeAccount;},holdDialogs(promise){pendingDialogs=promise;},async login(){
    const form=elements.get('site-form');await form.listeners.submit({preventDefault(){},target:form});
  }};
}

test('login lists tenant accounts; switching selects a distinct account URL and clears the old chat',async()=>{
  const ui=page();await ui.login();
  assert.equal(ui.elements.get('account-select').children.length,2);
  assert.ok(ui.calls.some(c=>c.url==='/api/my/telegram/accounts/11/status/'));
  assert.ok(ui.calls.some(c=>c.url.startsWith('/api/my/telegram/accounts/11/dialogs/')));
  ui.elements.get('messages').append({textContent:'Old account message'});
  ui.elements.get('account-select').value='22';
  await ui.elements.get('account-select').onchange();
  assert.equal(ui.elements.get('messages').children.length,0);
  assert.ok(ui.calls.some(c=>c.url==='/api/my/telegram/accounts/22/status/'));
  assert.equal(ui.elements.get('connect').hidden,false);
  assert.equal(ui.elements.get('inbox').hidden,true);
});

test('adding an account creates a new tenant connection and selects it',async()=>{
  const ui=page();await ui.login();await ui.elements.get('add-account').onclick();
  assert.ok(ui.calls.some(c=>c.url==='/api/my/telegram/accounts/' && c.options.method==='POST'));
  assert.ok(ui.calls.some(c=>c.url==='/api/my/telegram/accounts/33/status/'));
  assert.equal(ui.elements.get('account-select').children.length,3);
});

test('an old account response cannot restore its chat after switching accounts',async()=>{
  const ui=page();await ui.login();let release;
  ui.holdDialogs(new Promise(resolve=>{release=resolve;}));
  ui.elements.get('account-select').value='11';const first=ui.elements.get('account-select').onchange();
  // Let the sequential list/status requests reach the held dialogs call.
  for(let i=0;i<40;i++) await Promise.resolve();
  assert.ok(ui.calls.at(-1).url.includes('/accounts/11/dialogs/'));
  ui.elements.get('account-select').value='22';const second=ui.elements.get('account-select').onchange();
  release();await Promise.all([first,second]);
  assert.equal(ui.elements.get('connect').hidden,false);
  assert.equal(ui.elements.get('inbox').hidden,true);
  assert.equal(ui.elements.get('messages').children.length,0);
});


test('an empty tenant can add its first account; logout clears account labels and the empty state',async()=>{
  const ui=page([]);await ui.login();
  assert.equal(ui.elements.get('no-accounts').hidden,false);
  assert.equal(ui.elements.get('connect').hidden,true);
  assert.ok(!ui.calls.some(c=>c.url.includes('/null/')));
  await ui.elements.get('add-account').onclick();
  assert.equal(ui.elements.get('no-accounts').hidden,true);
  assert.equal(ui.elements.get('connect').hidden,false);
  ui.elements.get('logout').onclick();
  assert.equal(ui.elements.get('account-select').children.length,0);
  assert.equal(ui.elements.get('no-accounts').hidden,true);
  assert.equal(ui.elements.get('account-controls').hidden,true);
});

test('forum opens topics and sends history requests only inside the selected topic',async()=>{
  const ui=page(undefined,true);await ui.login();
  await ui.elements.get('dialogs').children[0].onclick();
  assert.equal(ui.elements.get('topics-aside').hidden,false);
  assert.equal(ui.elements.get('compose').hidden,true);
  assert.ok(!ui.calls.some(c=>c.url.includes('/messages/')));
  await ui.elements.get('topics-list').children[0].onclick();
  assert.equal(ui.elements.get('compose').hidden,false);
  assert.equal(ui.elements.get('topics-aside').hidden,false);
  assert.ok(ui.calls.some(c=>c.url.includes('/messages/?') && c.url.includes('topic_id=17')));
  const row=ui.elements.get('messages').children[0];
  assert.ok(row.children.some(child=>child.className==='message-author' && child.textContent==='Alice'));
  const menu=row.children.find(child=>child.className==='message-actions');
  const labels=menu.children.find(node=>node.className==='action-menu').children.filter(node=>node.className==='action-menu-item').map(node=>node.children[1].textContent);
  assert.ok(labels.includes('Копировать текст'));
  assert.ok(labels.includes('Редактировать'));
  assert.ok(labels.includes('Удалить у всех'));
  assert.ok(labels.includes('Закрепить'));
});


test('scrolling to either boundary loads one page and stops after the final page',async()=>{
  const ui=page(undefined,false,{paging:true});await ui.login();
  const dialogs=ui.elements.get('dialogs');dialogs.scrollHeight=1000;dialogs.clientHeight=200;dialogs.scrollTop=800;
  await Promise.all([dialogs.onscroll(),dialogs.onscroll()]);
  assert.equal(ui.calls.filter(c=>c.url.includes('cursor=next-dialogs')).length,1);
  await dialogs.onscroll();assert.equal(ui.calls.filter(c=>c.url.includes('cursor=')).length,1);
  await dialogs.children[0].onclick();
  const pane=ui.elements.get('messages');pane.scrollTop=0;
  await Promise.all([pane.onscroll(),pane.onscroll()]);
  assert.equal(ui.calls.filter(c=>c.url.includes('before=4')).length,1);
  await pane.onscroll();assert.equal(ui.calls.filter(c=>c.url.includes('before=')).length,1);
  assert.equal(ui.elements.get('more-messages').hidden,true);
  assert.equal(ui.elements.get('more-dialogs').hidden,true);
});

test('an image is displayed inline and its blob is reused when history expands',async()=>{
  const ui=page(undefined,false,{paging:true,media:true});await ui.login();
  await ui.elements.get('dialogs').children[0].onclick();
  for(let i=0;i<50;i++)await Promise.resolve();
  const row=ui.elements.get('messages').children[0];
  const holder=row.children.find(child=>child.className==='media-holder');assert.ok(holder);
  assert.match(holder.children[0].src,/^blob:/);
  ui.elements.get('messages').scrollTop=0;await ui.elements.get('messages').onscroll();
  for(let i=0;i<50;i++)await Promise.resolve();
  assert.equal(ui.calls.filter(c=>c.url.endsWith('/attachment/')).length,1);
  assert.equal(ui.elements.get('messages').children[1],row,'Existing media element survives prepending older history');
});


test('opening a story loads authenticated media and acknowledges only the displayed story',async()=>{
  const ui=page();await ui.login();await ui.elements.get('show-stories').onclick();
  const listing=ui.elements.get('modal-content').children[1];assert.equal(listing.children.length,1);
  await listing.children[0].onclick();
  const viewer=ui.elements.get('modal-content').children[0];assert.match(viewer.children[0].src,/^blob:/);
  const read=ui.calls.find(c=>c.url.endsWith('/stories/71/7/') && c.options.method==='POST');
  assert.equal(JSON.parse(read.options.body).action,'read');
});

// The upstream layout removed the participant modal; its API stays covered by backend tests.
test('reconnecting resynchronizes the latest history instead of keeping an old window',async()=>{
  const ui=page(undefined,false,{realtime:true,paging:true});await ui.login();await ui.elements.get('dialogs').children[0].onclick();
  ui.elements.get('messages').scrollTop=0;await ui.elements.get('messages').onscroll();
  assert.equal(ui.elements.get('messages').children.length,2);
  ui.event({kind:'resync',account_id:11});for(let i=0;i<50;i++)await Promise.resolve();
  assert.equal(ui.elements.get('messages').children.length,1);
  assert.equal(ui.elements.get('messages').children[0].dataset.messageId,'5');
});

test('realtime merges new/edit/delete events and stops delivery on account switch',async()=>{
  const ui=page(undefined,false,{realtime:true});await ui.login();await ui.elements.get('dialogs').children[0].onclick();
  assert.equal(ui.realtimeAccount(),11);
  ui.event({kind:'message_new',account_id:11,peer_id:99,message:{id:6,text:'Live message',date:'2026-10-06T08:00:00Z'}});
  assert.equal(ui.elements.get('messages').children.length,2);
  ui.event({kind:'message_edited',account_id:11,peer_id:99,message:{id:6,text:'Edited live',date:'2026-10-06T08:00:00Z'}});
  assert.ok(ui.elements.get('messages').children[1].children.some(node=>node.textContent==='Edited live'));
  ui.event({kind:'message_new',account_id:22,peer_id:99,message:{id:7,text:'Other account'}});
  assert.equal(ui.elements.get('messages').children.length,2);
  ui.event({kind:'message_deleted',account_id:11,peer_id:99,message_ids:[6]});
  assert.equal(ui.elements.get('messages').children.length,1);
  ui.elements.get('account-select').value='22';await ui.elements.get('account-select').onchange();
  assert.equal(ui.realtimeAccount(),null);assert.equal(ui.elements.get('messages').children.length,0);
});
