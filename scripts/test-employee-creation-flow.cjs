const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const jsx = (type, props) => ({ type, props: props || {} })
const runtime = { jsx, jsxs: jsx, Fragment: 'fragment' }
function load(file, deps) {
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'react/jsx-runtime') return runtime
    assert.ok(deps[name], `Unexpected dependency ${name}`)
    return deps[name]
  }, module, module.exports)
  return module.exports
}
function harness() {
  const slots = [], effects = []
  let index = 0, changed = true, render, tree
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]))
  const react = {
    useState(initial) {
      const key = index++
      slots[key] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [slots[key].value, value => {
        const next = typeof value === 'function' ? value(slots[key].value) : value
        if (!Object.is(next, slots[key].value)) { slots[key].value = next; changed = true }
      }]
    },
    useRef(value) { const key = index++; slots[key] ??= { current: value }; return slots[key] },
    useMemo(fn, deps) {
      const key = index++
      if (!slots[key] || !same(slots[key].deps, deps)) slots[key] = { deps, value: fn() }
      return slots[key].value
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps) },
    useEffect(fn, deps) {
      const key = index++
      if (!slots[key] || !same(slots[key].deps, deps)) {
        const previous = slots[key]
        slots[key] = { deps, cleanup: previous?.cleanup }
        effects.push(() => { previous?.cleanup?.(); slots[key].cleanup = fn() })
      }
    },
  }
  react.useLayoutEffect = react.useEffect
  return { react, get tree() { return tree },
    render(fn) { render = fn; changed = true },
    async flush() {
      for (let round = 0; round < 15; round++) {
        if (changed) { changed = false; index = 0; tree = render(); while (effects.length) effects.shift()() }
        await new Promise(resolve => setImmediate(resolve))
      }
      assert.equal(changed, false, 'render should settle')
    },
    unmount() { for (const slot of slots) slot?.cleanup?.() },
  }
}
function all(node, predicate) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(child => all(child, predicate))
  return [...(predicate(node) ? [node] : []), ...['children', 'actions', 'footer'].flatMap(key => all(node.props?.[key], predicate))]
}
const get = (tree, type) => all(tree, node => node.type === type)[0]
const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join(' ') : node?.props ? text(node.props.children) : ''
const translate = (key, values) => key + (values ? JSON.stringify(values) : '')
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const event = value => ({ target: { value }, preventDefault() {} })
const apps = ['odo', 'sd', 'iform']
function access(name = 'Reviewer') {
  return { positions: [{ id: name, name, policies: Object.fromEntries(apps.map(app => [app, { configured: true, permissions: ['read'], revision: 1 }])) }],
    apps: Object.fromEntries(apps.map(app => [app, { available: true, module_enabled: true, enabled: true }])),
    catalog: Object.fromEntries(apps.map(app => [app, [{ code: 'read', name: 'Read documents', description: 'Can read', group: 'Documents' }]])) }
}
function peoplePage(platform = false) {
  const h = harness(), creates = [], reads = [], positionReads = []
  let createGate, contactGate, unitGate, positionGate
  const organizations = [{ id: 'a', name: 'Company A', slug: 'a', owner_id: 10, can_manage_structure: true }, { id: 'b', name: 'Company B', slug: 'b' }]
  const me = { id: 10, role: platform ? 'admin' : 'user' }
  const profile = { getMe: async () => me, createUser: async payload => {
    creates.push(payload); if (createGate) await createGate.promise
    return { id: 44, ...payload }
  } }
  const org = { getCurrent: async () => organizations[0], listUnits: async () => [{ id: 'a-team', name: 'Team A' }],
    listPlatformOrganizations: async () => ({ items: organizations }), listPlatformUnits: async id => {
      if (unitGate?.id === id) return unitGate.promise
      return [{ id: `${id}-team`, name: `Team ${id}` }]
    } }
  const positions = { get: async (org, signal) => {
    positionReads.push({ org, signal });
    if (positionGate && positionGate.org === org) { const gate = positionGate; positionGate = null; return gate.promise }
    return access(org === 'b' ? 'Company B role' : 'Reviewer')
  } }
  const Header = () => null, Modal = () => null, Select = () => null
  const deps = {
    react: h.react, 'react-dom': { createPortal: value => value },
    'react-router-dom': { useNavigate: () => navigate, useLocation: () => location, useOutletContext: () => ({ workspaceBootstrapReady: true, userEmail: 'director@example.invalid', userRole: me.role }), Link: 'link', Navigate: 'navigate' },
    'react-i18next': { useTranslation: () => ({ i18n: { language: 'ru' } }) },
    '../../../infrastructure/repositories/HttpProfileRepository': { HttpProfileRepository: class { constructor() { return profile } } },
    '../../../infrastructure/repositories/HttpOrganizationRepository': { HttpOrganizationRepository: class { constructor() { return org } } },
    '../../../infrastructure/repositories/HttpAccessRepository': { HttpAccessRepository: class { constructor() { return positions } } },
    '../../../infrastructure/storage/LocalStorageAuthSessionStore': { LocalStorageAuthSessionStore: class {} },
    './contactsText': { ct: translate },
    './loadOrganizationDirectory': { loadOrganizationDirectory: async () => ({ contacts: [], organizations: ['Company A', 'Company B'] }) },
    '../../../shared/ui/AppSelect': { default: Select }, '../../../shared/ui/DataTable': { default: () => null, DATA_TABLE_ROW_ICON: '', DataTableEmpty: () => null, DataTablePager: () => null },
    '../../../shared/i18n/adminText': { adminText: value => value },
    '../../../shared/ui/CustomSelect': { default: Select }, '../../../shared/ui/MaterialSymbol': { default: () => null },
    '../../../shared/ui/AppModal': { default: Modal }, '../../../shared/ui/AppConfirmDialog': { default: () => null },
    '../../../shared/config/alemContactAccess': { canAccessAlemContact: () => true },
    '../../calls/useCallManager': { useCallManager: () => ({}) }, './AlemContactRatingsSection': { default: () => null },
    '../../../shared/lib/companyMailAddress': { suggestedEmployeeLogin: (first, last) => first && last ? `${first[0].toLowerCase()}.${last.toLowerCase()}` : '', companyMailDomain: slug => slug ? `${slug}.teamspace.kz` : '' },
    '../../../shared/ui/axisTokens': { AXIS_UI: {} }, '../../../shared/ui/ViewToggle': { default: () => null },
    '../../components/people/PeopleSectionHeader': { default: Header },
    '../../../infrastructure/http/authorizedFetch': { authorizedFetch: async (store, url, options) => {
      if (url.includes('/filters')) return { ok: true, json: async () => ({ positions: ['Old'], units: [{ id: 'old-unit', name: 'Old unit' }] }) }
      reads.push({ url, signal: options?.signal })
      if (contactGate) { const pending = contactGate; contactGate = null; return pending.promise }
      return { ok: true, status: 200, json: async () => ({ items: [{ id: 20, full_name: 'Existing employee', email: 'existing@example.invalid' }], total: 60 }) }
    } },
    '../../../shared/messenger/lastActiveChat': { writeLastActiveChatId() {} },
    '../../../infrastructure/http/normalizeBackendAssetUrl': { normalizeBackendAssetUrl: value => value },
    '../../../shared/i18n/adminText': { adminText: key => key },
    '../../../shared/i18n': { formatDate: value => value },
  }
  const navigate = () => {}, location = { pathname: '/people', state: null }
  const Page = load('src/presentation/pages/alem-contact/AlemContactPage.tsx', deps).default
  h.render(() => Page())
  return { ...h, flush: h.flush, get tree() { return h.tree }, creates, reads, positionReads,
    open: async () => { const add = all(h.tree, n => n.type === 'button' && text(n).includes('page.t148'))[0]; assert.ok(add, 'director can create'); add.props.onClick(); await h.flush() },
    form: () => get(h.tree, 'form'), position: () => all(get(h.tree, 'form'), n => n.type === 'select' && n.props.id === 'employee-position')[0],
    newName: () => all(get(h.tree, 'form'), n => n.type === 'input' && n.props['aria-label'] === 'positionChoice.newName')[0],
    company: () => all(get(h.tree, 'form'), n => n.type === 'select' && n.props.required)[0],
    modal: () => get(h.tree, Modal), selectType: Select,
    holdCreate: () => (createGate = deferred()), holdPositions: org => (positionGate = { ...deferred(), org }), holdContacts: () => (contactGate = deferred()), holdUnits: id => (unitGate = { ...deferred(), id }),
    fill: async () => {
      const inputs = all(get(h.tree, 'form'), n => n.type === 'input' && !n.props.readOnly)
      inputs[0].props.onChange(event('Test')); inputs[1].props.onChange(event('Employee'))
      inputs.find(n => n.props.type === 'password').props.onChange(event('test-password'))
      inputs.find(n => n.props.inputMode === 'numeric').props.onChange(event('123456789012'))
      await h.flush()
    },
  }
}
async function peopleTests() {
  const p = peoplePage(); await p.flush(); await p.open(); await p.fill()
  assert.equal(p.position().props.disabled, false, 'company director can select company positions')
  assert.ok(text(p.position()).includes('Reviewer'))
  assert.ok(!text(p.form()).includes('positionAccess'), 'existing modal has no extra rights panel')
  const inputOrder = all(p.form(), n => n.type === 'input' && !n.props.readOnly)
  assert.equal(inputOrder[0].props.value, 'Test'); assert.equal(inputOrder[1].props.value, 'Employee')
  p.position().props.onChange(event('Reviewer')); await p.flush()
  assert.equal(p.newName(), undefined)
  await p.form().props.onSubmit(event()); await p.flush()
  assert.equal(p.creates[0].position, 'Reviewer'); assert.equal(p.creates[0].organization_id, 'a')
  assert.equal(p.creates[0].team_id, undefined, 'no subdivision remains optional')
  await p.open(); await p.fill()
  p.position().props.onChange(event('__new__')); await p.flush()
  assert.ok(p.newName(), 'new name input appears in the existing modal')
  p.newName().props.onChange(event(' reviewer ')); await p.flush()
  await p.form().props.onSubmit(event()); await p.flush()
  assert.equal(p.creates.length, 1, 'case and spaces cannot create a duplicate title')
  p.newName().props.onChange(event('New title')); await p.flush()
  const failed = p.holdCreate(), attempt = p.form().props.onSubmit(event()); await p.flush()
  failed.reject(new Error('identity conflict')); await attempt; await p.flush()
  assert.ok(p.modal()); assert.equal(p.newName().props.value, 'New title')
  assert.ok(text(p.form()).includes('identity conflict'), 'creation failure preserves values')
  const next = p.holdCreate(), retry = p.form().props.onSubmit(event()); await p.flush()
  next.resolve(); await retry; await p.flush()
  assert.equal(p.creates.at(-1).position, 'New title')
  assert.equal(p.modal(), undefined)
  await p.open(); await p.fill()
  await p.form().props.onSubmit(event()); await p.flush()
  assert.equal(p.creates.at(-1).position, undefined, 'no position is still permitted')
  p.unmount()
  const admin = peoplePage(true); await admin.flush(); await admin.open()
  assert.equal(admin.position().props.disabled, true, 'choose a company first')
  const pending = admin.holdPositions('a'); admin.company().props.onChange(event('a')); await admin.flush()
  assert.equal(admin.position().props.disabled, true)
  admin.company().props.onChange(event('b')); await admin.flush()
  assert.ok(text(admin.position()).includes('Company B role'))
  assert.equal(admin.positionReads[0].signal.aborted, true)
  pending.resolve(access('Foreign company title')); await admin.flush()
  assert.ok(!text(admin.position()).includes('Foreign company title'), 'late company response is ignored')
  admin.position().props.onChange(event('Company B role')); await admin.flush()
  admin.company().props.onChange(event('a')); await admin.flush()
  assert.equal(admin.position().props.value, '', 'company change resets the selected position')
  const errorRead = admin.holdPositions('b'); admin.company().props.onChange(event('b')); await admin.flush()
  errorRead.reject(new Error('internal details')); await admin.flush()
  assert.equal(admin.position().props.disabled, true)
  assert.ok(text(admin.position()).includes('positionChoice.error'))
  assert.ok(!text(admin.form()).includes('internal details'))
  all(admin.form(), n => n.type === 'button' && text(n) === 'page.t168')[0].props.onClick(); await admin.flush()
  assert.equal(admin.position().props.disabled, false, 'position loading can be retried')
  admin.modal().props.onClose(); await admin.flush()
  const canceled = admin.holdPositions('a'); await admin.open(); admin.company().props.onChange(event('a')); await admin.flush()
  admin.modal().props.onClose(); await admin.flush(); canceled.resolve(access('Old form')); await admin.flush()
  assert.equal(admin.modal(), undefined, 'a late answer cannot reopen a canceled form')
  admin.unmount()
}
let timers = new Map(), nextTimer = 0
function runTimers() { const current = [...timers.values()]; timers.clear(); current.forEach(fn => fn()) }
global.window = Object.assign(new EventTarget(), { setTimeout: fn => { timers.set(++nextTimer, fn); return nextTimer }, clearTimeout: id => timers.delete(id) })
;(async () => {
  await peopleTests()
  console.log('Existing employee modal: position selection, new title, retries and company isolation: OK')
})().catch(error => { console.error(error); process.exitCode = 1 })
