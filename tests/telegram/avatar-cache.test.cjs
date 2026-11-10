const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function browser() {
  const rows=new Map();let now=1000;
  const db={createObjectStore(){},transaction(){
    const tx={pending:0};
    function request(work){const result={};tx.pending++;setImmediate(()=>{work(result);tx.pending--;setImmediate(()=>{if(!tx.pending)tx.oncomplete?.();});});return result;}
    const store={get:key=>request(req=>{req.result=rows.get(key);req.onsuccess?.();}),put:row=>rows.set(row.key,row),delete:key=>rows.delete(key),getAll:()=>request(req=>{req.result=[...rows.values()];req.onsuccess?.();}),openCursor(){
      const keys=[...rows.keys()];let index=0;const req={};
      const step=()=>{tx.pending++;setImmediate(()=>{const key=keys[index++];req.result=key?{key,value:rows.get(key),delete:()=>rows.delete(key),continue:step}:null;req.onsuccess?.();tx.pending--;setImmediate(()=>{if(!tx.pending)tx.oncomplete?.();});});};step();return req;
    }};tx.objectStore=()=>store;return tx;
  }};
  const context={indexedDB:{open(){const req={result:db};setImmediate(()=>{req.onupgradeneeded?.();req.onsuccess?.();});return req;}},Date:class extends Date{static now(){return now;}}};
  vm.runInNewContext(fs.readFileSync('public/growy-telegram/avatar-cache.js','utf8'),context);
  return {cache:context.GrowyTelegramAvatarCache,rows,advance(){now+=86400001;}};
}
test('avatar cache survives independent reads and isolates users and accounts',async()=>{
  const {cache}=browser(),blob=new Blob(['jpeg']);
  await cache.put('tenant:user','2:18:photo',blob);
  assert.equal(await cache.get('tenant:user','2:18:photo'),blob);
  assert.equal(await cache.get('tenant:other','2:18:photo'),null);
  assert.equal(await cache.get('tenant:user','3:18:photo'),null);
});
test('cached avatars expire; disconnect clears only the selected account',async()=>{
  const ui=browser(),blob=new Blob(['jpeg']);
  await ui.cache.put('scope','2:18:photo',blob);await ui.cache.put('scope','3:18:photo',blob);
  await ui.cache.clear('scope',2);
  assert.equal(await ui.cache.get('scope','2:18:photo'),null);
  assert.equal(await ui.cache.get('scope','3:18:photo'),blob);
  ui.advance();assert.equal(await ui.cache.get('scope','3:18:photo'),null);
});
test('unavailable browser storage falls back without breaking the inbox',async()=>{
  const context={};vm.runInNewContext(fs.readFileSync('public/growy-telegram/avatar-cache.js','utf8'),context);
  assert.equal(await context.GrowyTelegramAvatarCache.get('scope','key'),null);
  await context.GrowyTelegramAvatarCache.put('scope','key',new Blob(['jpeg']));
});
