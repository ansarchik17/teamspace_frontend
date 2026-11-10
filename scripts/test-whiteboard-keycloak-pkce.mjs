import assert from 'node:assert/strict'
import {readFile, writeFile} from 'node:fs/promises'
import {createHash, createPublicKey, randomBytes, verify} from 'node:crypto'
import {chromium} from 'playwright'
const [folder,phase]=process.argv.slice(2)
const {base,issuer}=JSON.parse(await readFile(folder+'/public.json','utf8'))
const verifier=randomBytes(40).toString('base64url'), state=randomBytes(20).toString('hex')
const discovery=await (await fetch(base+'/whiteboard/realms/whiteboard/.well-known/openid-configuration')).json()
assert.equal(discovery.issuer,issuer)
const browser=await chromium.launch({headless:true})
try {
 const page=await browser.newPage()
 await page.route('**/*',route => new URL(route.request().url()).origin===base ? route.continue():route.abort())
 const params=new URLSearchParams({client_id:'whiteboard-frontend',redirect_uri:base+'/callback',response_type:'code',scope:'openid email profile',state,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')})
 await page.goto(discovery.authorization_endpoint+'?'+params)
 await page.locator('#username').fill('fixture.member')
 await page.locator('#password').fill('Fixture-password-2026!')
 await page.locator('#kc-login').click()
 await page.waitForURL(base+'/callback?**')
 const callback=new URL(page.url()); assert.equal(callback.searchParams.get('state'),state)
 const result=await fetch(discovery.token_endpoint,{method:'POST',body:new URLSearchParams({grant_type:'authorization_code',client_id:'whiteboard-frontend',redirect_uri:base+'/callback',code:callback.searchParams.get('code'),code_verifier:verifier})})
 assert.equal(result.status,200)
 const token=await result.json(), claims=JSON.parse(Buffer.from(token.access_token.split('.')[1],'base64url'))
 assert.equal(claims.sub,'original-sub-0');assert.equal(claims.iss,issuer);assert.equal(claims.email_verified,true)
 const jwks=await (await fetch(discovery.jwks_uri)).json()
 const checkToken=jwt=>{
  const [head,payload,sig]=jwt.split('.'), {kid}=JSON.parse(Buffer.from(head,'base64url'))
  const key=jwks.keys.find(k=>k.kid===kid); assert.ok(key)
  assert.ok(verify('RSA-SHA256',Buffer.from(head+'.'+payload),createPublicKey({key,format:'jwk'}),Buffer.from(sig,'base64url')))
 }
 checkToken(token.access_token)
 if(phase==='before') await writeFile(folder+'/before-token.json',JSON.stringify(token),{mode:0o600})
 else checkToken(JSON.parse(await readFile(folder+'/before-token.json','utf8')).access_token)
 console.log(JSON.stringify({phase,pkce_login:true,password_preserved:true,subject_preserved:true,old_token_signature_valid:phase==='after'}))
} finally {await browser.close()}
