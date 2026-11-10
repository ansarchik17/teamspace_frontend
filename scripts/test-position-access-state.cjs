const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
function load(file, deps = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const output = { exports: {} }
  new Function('require', 'module', 'exports', code)(name => { assert.ok(deps[name], `Unexpected import ${name}`); return deps[name] }, output, output.exports)
  return output.exports
}
const stateModule = load('src/presentation/pages/organization/positionAccessState.ts')
const permissionSelection = load('src/application/access/permissionSelection.ts')
const { getAccessApplicationState: state, canToggleAccessManagement: canToggle } = stateModule
const data = () => ({ apps: Object.fromEntries(['odo', 'sd', 'iform'].map(app => [app, { available: true, module_enabled: true, enabled: false, revision: 0 }])), dependencies: { odo: [], sd: [], iform: [] }, sd_company_id: 'linked' })
const translations = ['ru', 'kk'].map(locale => JSON.parse(fs.readFileSync(path.join(__dirname, `../src/shared/i18n/locales/${locale}/administration.json`), 'utf8')).org.positions)
for (const app of ['odo', 'sd', 'iform']) {
  for (const available of [true, false]) for (const module_enabled of [true, false]) for (const enabled of [true, false]) {
    const snapshot = data()
    Object.assign(snapshot.apps[app], { available, module_enabled, enabled })
    const expected = !available ? 'unavailable' : !module_enabled ? 'module_disabled' : enabled ? 'managed' : app === 'iform' ? 'iform_disabled' : 'legacy'
    assert.equal(state(app, 'active', snapshot), expected)
    assert.equal(canToggle(app, 'active', snapshot), enabled || (available && module_enabled))
    assert.equal(state(app, 'suspended', snapshot), 'suspended')
    assert.equal(canToggle(app, 'suspended', snapshot), false)
    for (const catalog of translations) {
      assert.ok(catalog.applicationState[expected].label)
      assert.ok(catalog.applicationState[expected].hint)
    }
  }
}
const unlinked = data(); unlinked.sd_company_id = null
assert.equal(state('sd', 'active', unlinked), 'link_required')
assert.equal(canToggle('sd', 'active', unlinked), false)
unlinked.apps.sd.enabled = true
assert.equal(canToggle('sd', 'active', unlinked), true, 'disabling a broken configuration must remain possible')
const unknown = data(); delete unknown.apps.odo.available
assert.equal(state('odo', 'active', unknown), 'unknown')
assert.equal(canToggle('odo', 'active', unknown), false)

const jsx = (type, props) => ({ type, props: props || {} })
let settingsOpen = false, stateIndex = 0, stateOverrides = {}
const { default: Workspace } = load('src/presentation/pages/organization/PositionAccessWorkspace.tsx', {
  react: { useState: initial => { const index = stateIndex++; return [Object.hasOwn(stateOverrides, index) ? stateOverrides[index] : index === 1 ? settingsOpen : initial, value => { if (index === 1) settingsOpen = value }] }, useId: () => 'permission-group', useRef: () => ({ current: null }), useEffect: () => {} },
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
  'react-router-dom': { Link: 'link' },
  'lucide-react': new Proxy({}, { get: (_, key) => key }),
  '../../../shared/ui/AppSelect': { default: 'select' }, '../../../shared/ui/AppModal': { default: 'modal' },
  '../../../shared/ui/axisTokens': { AXIS_UI: {} }, './orgText': { ot: key => key }, './positionAccessState': stateModule,
  '../../../application/access/permissionSelection': permissionSelection,
})
function nodes(tree, predicate) {
  if (!tree) return []
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate))
  if (typeof tree !== 'object') return []
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)]
}
function render(overrides = {}) {
  stateIndex = 0
  const snapshot = { ...data(), positions: [], catalog: { odo: [], sd: [], iform: [] } }
  const position = { id: 'position', name: 'Prepared', user_count: 0, policies: Object.fromEntries(['odo', 'sd', 'iform'].map(app => [app, { permissions: [], configured: true, revision: 1 }])) }
  snapshot.positions.push(position)
  const props = { organization: { id: 'company', name: 'Company', status: 'active' }, companies: [], platformAdmin: true,
    data: snapshot, position, app: 'odo', selected: [], dirty: false, busy: false, onMode: () => {}, onLink: () => {}, ...overrides }
  return { tree: Workspace(props), props }
}
const prepared = render()
assert.ok(nodes(prepared.tree, n => n.props.children === 'positions.saveState.saved_inactive').length, 'saved policy must not be labelled applied while using legacy roles')
assert.ok(nodes(prepared.tree, n => n.props.children === 'positions.applicationState.legacy.hint').length)
prepared.props.data.apps.odo.enabled = true
const active = render(prepared.props)
assert.ok(nodes(active.tree, n => n.props.children === 'positions.saveState.saved_empty').length, 'configured empty set is an explicit denial')
active.props.position.policies.odo.configured = false
assert.ok(nodes(render(active.props).tree, n => n.props.children === 'positions.saveState.unconfigured').length)
const blocked = render({ refreshRequired: true })
assert.equal(nodes(blocked.tree, n => n.type === 'button' && n.props.children === 'positions.t67')[0].props.disabled, true)

settingsOpen = true
const settings = render()
settings.props.data.apps.odo.module_enabled = false
const settingsNode = nodes(render(settings.props).tree, n => typeof n.type === 'function' && n.type.name === 'CompanySettings')[0]
const settingsTree = settingsNode.type(settingsNode.props)
const sections = nodes(settingsTree, n => n.type === 'section')
assert.equal(nodes(sections[0], n => n.type === 'button')[0].props.disabled, true)
assert.equal(nodes(sections[1], n => n.type === 'button')[0].props.disabled, false)
assert.ok(nodes(sections[0], n => n.type === 'link' && n.props.to === '/platform/organizations/company/administration/modules').length)
const unsaved = render({ dirty: true })
const unsavedSettings = nodes(unsaved.tree, n => typeof n.type === 'function' && n.type.name === 'CompanySettings')[0]
assert.ok(nodes(unsavedSettings.type(unsavedSettings.props), n => n.type === 'section').every(section => nodes(section, n => n.type === 'button').every(button => button.props.disabled)), 'unsaved selections must not be silently discarded by switching management or linking')
console.log('Position access state: module/management combinations, iForm, SD linking, saved versus applied, explicit empty denial and enable guards passed')

settingsOpen = false
const catalog = ['document.read', 'document.create', 'document.read_all'].map(code => ({ code, name: code, group: 'Documents', description: 'Scope' }))
let groupSelection
const filtered = render({ onGroup: (permissions, enabled) => { groupSelection = { codes: permissions.map(p => p.code), enabled } } })
filtered.props.data.catalog.odo = catalog
const permissionList = nodes(render(filtered.props).tree, n => n.type?.name === 'PermissionList')[0]
stateIndex = 0; stateOverrides = { 0: 'document.create', 1: '', 2: false }
const listTree = permissionList.type(permissionList.props)
stateOverrides = {}; stateIndex = 0
const groupNode = nodes(listTree, n => n.type?.name === 'PermissionGroup')[0]
const groupTree = groupNode.type(groupNode.props)
const groupCheckbox = nodes(groupTree, n => n.type === 'input' && n.props.type === 'checkbox')[0]
groupCheckbox.props.onChange()
assert.deepEqual(groupSelection, { codes: ['document.create'], enabled: true }, 'search must not grant invisible rights through the group checkbox')
assert.ok(nodes(groupTree, n => n.type === 'label' && n.props.children?.includes('positions.selectVisible')).length)

const oldServer = render()
delete oldServer.props.data.dependencies
const oldTree = render(oldServer.props).tree
assert.ok(nodes(oldTree, n => n.props.children === 'positions.dependenciesUnavailable').length)
assert.equal(nodes(oldTree, n => n.type === 'button' && n.props.children === 'positions.t67')[0].props.disabled, true, 'old server without dependency rules must not allow a misleading save')
console.log('Permission UI: filtered group selection and missing-server-contract guard passed')

const unsupported = render({ selected: ['document.create'] })
unsupported.props.data.catalog.odo = catalog
unsupported.props.data.unavailable_permissions = { odo: ['document.create'], sd: [], iform: [] }
const unsupportedTree = render(unsupported.props).tree
assert.ok(nodes(unsupportedTree, n => n.props.children === 'positions.saveState.unavailable').length, 'a saved unsupported grant must not be labelled applied')
assert.equal(nodes(unsupportedTree, n => n.type === 'button' && n.props.children === 'positions.t67')[0].props.disabled, true)
const unsupportedList = nodes(unsupportedTree, n => n.type?.name === 'PermissionList')[0]
stateIndex = 0; stateOverrides = { 0: '', 1: '', 2: false }
const unsupportedGroupNode = nodes(unsupportedList.type(unsupportedList.props), n => n.type?.name === 'PermissionGroup')[0]
stateOverrides = {}; stateIndex = 0
const selectedUnsupported = unsupportedGroupNode.type(unsupportedGroupNode.props)
const selectedRow = nodes(selectedUnsupported, n => n.type === 'label' && nodes(n, child => child.props.children === 'document.create').length)[0]
assert.equal(nodes(selectedRow, n => n.type === 'input')[0].props.disabled, false, 'old unsupported selection can be unchecked')
stateIndex = 0
const unselectedUnsupported = unsupportedGroupNode.type({ ...unsupportedGroupNode.props, selected: [] })
const unselectedRow = nodes(unselectedUnsupported, n => n.type === 'label' && nodes(n, child => child.props.children === 'document.create').length)[0]
assert.equal(nodes(unselectedRow, n => n.type === 'input')[0].props.disabled, true, 'unsupported action cannot be newly granted')
console.log('Permission UI: unavailable actions, removal of historical grants and truthful saved state passed')
