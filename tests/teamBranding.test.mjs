import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/shared/config/teamBranding.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
})
const { toTeamPath, toTeamServiceName, toTeamServiceLink } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
)

test('saved AI and organization links retain their destination and parameters', () => {
  assert.equal(toTeamPath('/alem-rag/tablet?mode=web#answer'), '/team-rag/tablet?mode=web#answer')
  assert.equal(toTeamPath('/alemai?prompt=hello%20world'), '/teamai?prompt=hello%20world')
  assert.equal(toTeamPath('/alem-contact/org-map'), '/team-contact/org-map')
  assert.equal(toTeamPath('/alemstore/'), '/teamstore/')
  assert.equal(toTeamPath('/team-rag'), '/team-rag')
  // A messenger username that happens to start with the old prefix is not a page.
  assert.equal(toTeamPath('/alemai_user'), '/alemai_user')
  assert.equal(toTeamPath('/drive/files'), '/drive/files')
})

test('catalog branding changes first-party names without changing unrelated services', () => {
  for (const [oldName, newName] of [
    ['Alem AI', 'Team AI'], ['AlemStore', 'TeamStore'], ['ALEM', 'Team'],
    ['AlemBoard', 'TeamBoard'], ['AlemAi.tasks', 'TeamAi.tasks'],
    ['SalemOffice', 'SalemOffice'], ['Alemannia', 'Alemannia'], ['Growy', 'Growy'],
  ]) assert.equal(toTeamServiceName(oldName), newName)
})

test('catalog links update local routes while preserving external integrations', () => {
  const origin = 'https://a.teamspace.kz'
  assert.equal(toTeamServiceLink('/web/alem-rag?mode=web#answer', origin), '/web/team-rag?mode=web#answer')
  assert.equal(toTeamServiceLink('/alemstore', origin), '/teamstore')
  assert.equal(toTeamServiceLink(`${origin}/web/alem-contact/org-map?user=6#profile`, origin), `${origin}/web/team-contact/org-map?user=6#profile`)
  assert.equal(toTeamServiceLink('https://external.example/alemai?token=abc', origin), 'https://external.example/alemai?token=abc')
  assert.equal(toTeamServiceLink('//external.example/alemai', origin), '//external.example/alemai')
  assert.equal(toTeamServiceLink('', origin), '')
})
