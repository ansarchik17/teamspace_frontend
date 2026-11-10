const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, '../src/application/use-cases/eps/odoNavigation.ts'), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const loaded = { exports: {} }
new Function('module', 'exports', code)(loaded, loaded.exports)
const { odoHandoffTarget, odoSectionLaunchRoute } = loaded.exports

for (const [section, expected] of [
  ['approvals', '/odo/approvals'],
  ['signings', '/odo/signings'],
  ['create-assignment', '/odo/assignments/create'],
]) {
  const route = odoSectionLaunchRoute(section)
  assert.equal(route, `/eps?section=${section}`)
  for (const hostname of ['sultan-corp.teamspace.kz', 'beles.teamspace.kz']) {
    const launch = new URL(`/web${route}`, `https://${hostname}`)
    const target = new URL(odoHandoffTarget(launch.search), launch.origin)
    assert.equal(target.hostname, hostname, 'handoff must preserve the tenant')
    assert.equal(target.pathname, expected)
  }
}

for (const section of ['', 'incoming', 'unknown', '__proto__', 'constructor', '//other.test', 'https://other.test', '../admin']) {
  assert.equal(odoHandoffTarget(`?section=${encodeURIComponent(section)}`), '/odo/')
}
assert.equal(odoHandoffTarget('?redirect=https://other.test'), '/odo/')
assert.equal(odoHandoffTarget(''), '/odo/')
assert.equal(odoHandoffTarget('?section=signings&document=doc-1'), '/odo/documents/doc-1', 'existing document links keep their priority')
assert.equal(odoHandoffTarget('?document=doc%2F1%3Fnext%3Dhttps%3A%2F%2Fother.test%23x'), '/odo/documents/doc%2F1%3Fnext%3Dhttps%3A%2F%2Fother.test%23x')
console.log('ODO navigation: dashboard destinations, tenant isolation, redirect allowlist and document handoff passed')
