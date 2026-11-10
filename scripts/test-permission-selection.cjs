const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/application/access/permissionSelection.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const output = { exports: {} }
new Function('exports', 'module', code)(output.exports, output)
const { changePermissionSelection: change, missingPermissionDependencies: missing } = output.exports
const rule = (permission, ...any_of) => ({ permission, any_of })
const rules = [rule('approval.start', 'approval.read'), rule('approval.start', 'document.send_to_approval'),
  rule('document.send_to_approval', 'document.read', 'document.read_department', 'document.read_all'),
  rule('approval.read', 'document.read', 'document.read_department', 'document.read_all'), rule('archive.manage', 'archive.export'),
  rule('tickets:read_all', 'tickets:read')]
const codes = [...new Set(rules.flatMap(r => [r.permission, ...r.any_of])), 'signature.sign', 'document.update', 'iform.finance', 'iform.approve']
const catalog = codes.map(code => ({ code, group: 'Test', name: code, description: '' }))
const sorted = values => [...values].sort()
const start = change([], ['approval.start'], true, catalog, rules)
assert.deepEqual(sorted(start), sorted(['approval.start', 'approval.read', 'document.send_to_approval', 'document.read']))
assert.deepEqual(missing(start, rules), [])
assert.deepEqual(change(start, ['approval.start'], true, catalog, rules), start, 'selection must be idempotent')
assert.deepEqual(change(start, ['document.read'], false, catalog, rules), [], 'revoking a prerequisite removes transitive dependents')
assert.deepEqual(sorted(change(['document.read_all'], ['approval.start'], true, catalog, rules)), sorted(start.filter(c => c !== 'document.read').concat('document.read_all')), 'keep the chosen scope without adding another')
assert.deepEqual(change(['document.read', 'document.read_all', 'document.send_to_approval'], ['document.read'], false, catalog, rules), ['document.read_all', 'document.send_to_approval'], 'an existing alternative keeps the action usable')
assert.deepEqual(change([], ['document.read_all'], true, catalog, rules), ['document.read_all'], 'broad read must not add write/signature rights')
assert.deepEqual(change([], ['archive.manage'], true, catalog, rules), ['archive.manage', 'archive.export'], 'archive management must not open all company documents')
assert.deepEqual(change([], ['iform.finance'], true, catalog, rules), ['iform.finance'], 'route functions must not silently grant approval')
assert.deepEqual(change([], ['tickets:read_all'], true, catalog, rules), ['tickets:read_all', 'tickets:read'])
assert.deepEqual(change(['tickets:read', 'tickets:read_all'], ['tickets:read'], false, catalog, rules), [])
assert.deepEqual(change([], ['admin', 'foreign:read'], true, catalog, rules), [], 'unknown codes cannot be selected')
const restricted = catalog.filter(p => p.code !== 'archive.export')
const incomplete = change([], ['archive.manage'], true, restricted, rules)
assert.deepEqual(incomplete, ['archive.manage'], 'never import hidden or unavailable permissions')
assert.equal(missing(incomplete, rules).length, 1, 'missing catalog dependency blocks saving')
const cyclic = [rule('a', 'b'), rule('b', 'a')], cycleCatalog = ['a', 'b'].map(code => ({ code }))
assert.deepEqual(change([], ['a'], true, cycleCatalog, cyclic), ['a', 'b'])
assert.deepEqual(change(['a', 'b'], ['a'], false, cycleCatalog, cyclic), [], 'cyclic rules must terminate on revoke')
assert.deepEqual(change(['approval.start'], [], false, catalog, rules), ['approval.start'], 'unrelated changes do not silently clear an existing incomplete policy')
console.log('Permission selection: transitive dependencies, revoke, alternative scopes, restricted catalogs, independent iForm roles and cycles passed')
