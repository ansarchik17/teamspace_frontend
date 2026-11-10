const SOURCE='../src/application/use-cases/senimdesk/sdNavigation.ts';
const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
const loaded={exports:{}};const code=ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,SOURCE),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('module','exports',code)(loaded,loaded.exports);
const {sdHandoffTarget:nav}=loaded.exports;
const id='4a3bdee7-ff2c-48bb-90f8-9095e61719dc';const redirect='https://sultan-corp.teamspace.kz/sd/auth/callback#handoff=test-code';
const target=new URL(nav(redirect,'?ticket='+id));assert.equal(target.origin,'https://sultan-corp.teamspace.kz');assert.equal(target.pathname,'/sd/auth/callback');assert.equal(new URLSearchParams(target.hash.slice(1)).get('handoff'),'test-code');assert.equal(new URLSearchParams(target.hash.slice(1)).get('ticket'),id);
for(const invalid of ['', '//other.test','https://other.test','../admin','bad-id'])assert.equal(nav(redirect,'?ticket='+encodeURIComponent(invalid)),redirect);
console.log('SD launch: tenant, handoff code and ticket identity preserved; invalid destinations ignored');
