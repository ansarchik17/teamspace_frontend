const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
function loadTS(file) {
  const output = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('exports', 'module', code)(output.exports, output)
  return output.exports
}
const { HttpError } = loadTS('src/infrastructure/http/HttpError.ts')
const accessState = loadTS('src/presentation/pages/organization/positionAccessState.ts')
const permissionSelection = loadTS('src/application/access/permissionSelection.ts')

// Exercise the actual page and its async callbacks with the repository boundary
// mocked, using the same dependency-free approach as the other UI regressions.
const source = fs.readFileSync(path.join(__dirname, '../src/presentation/pages/organization/OrganizationAccessPage.tsx'), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText
const Workspace = () => null
const Modal = () => null
const jsx = (type, props) => ({ type, props: props || {} })
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const policy = permissions => ({ permissions, revision: 1, configured: true })
const position = (id, name, count = 0) => ({ id, name, user_count: count, revision: 1,
  policies: { odo: policy(['document.read']), sd: policy([]), iform: policy([]) } })
const initial = () => ({ positions: [position('filled', 'Reviewer', 1), position('empty', 'Prepared')],
  member_positions: { 3: 'filled' }, apps: Object.fromEntries(['odo', 'sd', 'iform'].map(app => [app, { available: true, module_enabled: true, enabled: true, revision: 1 }])),
  catalog: { odo: ['document.read', 'document.read_all', 'document.create'].map(code => ({ code, group: 'Documents', name: code, description: '' })), sd: [], iform: [] },
  dependencies: { odo: [{ permission: 'document.create', any_of: ['document.read', 'document.read_all'] }], sd: [], iform: [] }, sd_company_id: 'linked-sd' })

function createPage({ platform = false, canManage = true, userRole = platform ? 'admin' : 'user' } = {}) {
  const slots = [], pendingEffects = [], calls = [], reads = []
  let index = 0, changed = true, tree, Page
  let scope = platform ? 'company-a' : undefined
  const data = new Map([[undefined, initial()], ['company-a', initial()], ['company-b', { ...initial(), positions: [position('b', 'Company B')] }]])
  let changeGate, readGate, failRead = false
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]))
  const react = {
    useState(initialValue) {
      const key = index++
      slots[key] ??= { value: typeof initialValue === 'function' ? initialValue() : initialValue }
      return [slots[key].value, value => {
        const next = typeof value === 'function' ? value(slots[key].value) : value
        if (!Object.is(next, slots[key].value)) { slots[key].value = next; changed = true }
      }]
    },
    useRef(value) { const key = index++; slots[key] ??= { current: value }; return slots[key] },
    useMemo(fn, deps) {
      const key = index++
      if (!slots[key] || !sameDeps(slots[key].deps, deps)) slots[key] = { deps, value: fn() }
      return slots[key].value
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps) },
    useEffect(fn, deps) {
      const key = index++
      if (!slots[key] || !sameDeps(slots[key].deps, deps)) {
        const previous = slots[key]
        slots[key] = { deps, cleanup: previous?.cleanup }
        pendingEffects.push(() => { previous?.cleanup?.(); slots[key].cleanup = fn() })
      }
    },
  }
  const repository = {
    async get(org, signal) {
      reads.push({ org, signal })
      if (failRead) { failRead = false; throw new Error('refresh failed') }
      if (readGate && readGate.scope === org) { const gate = readGate; readGate = null; return gate.promise }
      return structuredClone(data.get(org))
    },
    async change(org, action, payload) {
      calls.push({ org, action, payload })
      if (changeGate) { const gate = changeGate; changeGate = null; await gate.promise }
      const state = data.get(org)
      if (action === 'position') {
        const name = payload.name.trim()
        if (state.positions.some(p => p.id !== payload.id && p.name.toLowerCase() === name.toLowerCase())) throw new Error('duplicate position')
        if (payload.id) Object.assign(state.positions.find(p => p.id === payload.id), { name })
        else {
          const created = position(`created-${state.positions.length}`, name)
          for (const app of ['odo', 'sd', 'iform']) created.policies[app] = { permissions: [], revision: 0, configured: false }
          state.positions.push(created)
        }
      }
      if (action === 'policy') {
        const p = state.positions.find(p => p.id === payload.id)
        if (p.policies[payload.application].revision !== payload.revision) throw new HttpError('policy changed', 409)
        p.policies[payload.application] = { permissions: payload.permissions, revision: payload.revision + 1, configured: true }
      }
      if (action === 'application') {
        const settings = state.apps[payload.application]
        if (settings.revision !== payload.revision) throw new HttpError('mode changed', 409)
        Object.assign(settings, { enabled: payload.enabled, revision: settings.revision + 1 })
      }
      if (action === 'member') state.member_positions[payload.user_id] = payload.id
      if (action === 'unassign') delete state.member_positions[payload.user_id]
      if (action === 'delete') state.positions = state.positions.filter(p => p.id !== payload.id)
      for (const p of state.positions) p.user_count = Object.values(state.member_positions).filter(id => id === p.id).length
    },
  }
  const company = org => ({ id: org || 'company-a', name: org || 'Company A', status: 'active', can_manage_structure: canManage })
  const people = async () => [{ id: 3, full_name: 'Employee', username: 'employee', email: 'test@example.invalid', is_active: true }]
  const orgRepo = { getCurrent: async () => company(), getPlatformOrganization: async org => company(org),
    listMembers: people, listPlatformMembers: people,
    listPlatformOrganizations: async () => ({ items: [company('company-a'), company('company-b')], total: 2 }) }
  const navigate = () => {}
  const deps = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'react-router-dom': { useNavigate: () => navigate, useParams: () => ({ organizationId: scope }), Link: 'link' },
    'react-i18next': { useTranslation: () => ({}) },
    '../../../infrastructure/repositories/HttpAccessRepository': { HttpAccessRepository: class { constructor() { return repository } } },
    '../../../infrastructure/repositories/HttpOrganizationRepository': { HttpOrganizationRepository: class { constructor() { return orgRepo } } },
    '../../../infrastructure/repositories/HttpAuthRepository': { HttpAuthRepository: class { async me() { return { role: userRole } } } },
    '../../../infrastructure/storage/LocalStorageAuthSessionStore': { LocalStorageAuthSessionStore: class {} },
    '../../../infrastructure/http/HttpError': { HttpError }, './positionAccessState': accessState,
    '../../../application/access/permissionSelection': permissionSelection,
    '../../components/people/PeopleSectionHeader': { default: () => null },
    './PositionAccessWorkspace': { default: Workspace }, '../../../shared/ui/AppModal': { default: Modal },
    '../../components/people/PeopleSkeletons': { AccessWorkspaceSkeleton: () => null },
    '../../../shared/ui/axisTokens': { AXIS_UI: {} }, './orgText': { ot: key => key },
  }
  const output = { exports: {} }
  new Function('require', 'module', 'exports', compiled)(name => {
    assert.ok(deps[name], `Unexpected import: ${name}`)
    return deps[name]
  }, output, output.exports)
  Page = output.exports.default
  async function flush() {
    for (let round = 0; round < 12; round++) {
      if (changed) { changed = false; index = 0; tree = Page(); while (pendingEffects.length) pendingEffects.shift()() }
      await new Promise(resolve => setImmediate(resolve))
    }
  }
  function find(node, predicate) {
    if (!node) return null
    if (Array.isArray(node)) { for (const child of node) { const found = find(child, predicate); if (found) return found } return null }
    if (typeof node !== 'object') return null
    if (predicate(node)) return node
    return find(node.props?.children, predicate)
  }
  const get = type => find(tree, node => node.type === type)
  const modal = () => { const found = get(Modal); assert.ok(found, 'dialog must remain visible'); return found.props }
  const button = () => modal().footer.props.children[1]
  const input = () => find(modal().children, node => node.type === 'input')
  const select = () => find(modal().children, node => node.type === 'select')
  return { flush, calls, reads, data, get, modal, button, input, select,
    workspace: () => { const found = get(Workspace); assert.ok(found, `authorized workspace must be visible: ${JSON.stringify(tree)}`); return found.props },
    holdChange: () => (changeGate = deferred()), failRefresh: () => { failRead = true },
    holdRead: org => (readGate = { ...deferred(), scope: org }),
    navigate: org => { scope = org; changed = true },
  }
}

global.window = Object.assign(new EventTarget(), { confirm: () => true })
;(async () => {
  const unavailablePage = createPage()
  unavailablePage.data.get(undefined).unavailable_permissions = { odo: ['document.create'], sd: [], iform: [] }
  unavailablePage.data.get(undefined).positions[0].policies.odo.permissions = ['document.read', 'document.create']
  await unavailablePage.flush()
  unavailablePage.workspace().onSave(); await unavailablePage.flush()
  assert.equal(unavailablePage.calls.length, 0, 'saved unsupported rights require explicit removal')
  unavailablePage.workspace().onToggle('document.create'); await unavailablePage.flush()
  assert.deepEqual(unavailablePage.workspace().selected, ['document.read'], 'an old unsupported grant can be removed')
  unavailablePage.workspace().onToggle('document.create'); await unavailablePage.flush()
  assert.deepEqual(unavailablePage.workspace().selected, ['document.read'], 'unsupported grant cannot be selected again')
  unavailablePage.workspace().onSave(); await unavailablePage.flush()
  assert.deepEqual(unavailablePage.calls[0].payload.permissions, ['document.read'])
  const hiddenUnavailable = createPage()
  hiddenUnavailable.data.get(undefined).unavailable_permissions = { odo: ['retired.action'], sd: [], iform: [] }
  hiddenUnavailable.data.get(undefined).positions[0].policies.odo.permissions = ['document.read', 'retired.action']
  await hiddenUnavailable.flush()
  hiddenUnavailable.workspace().onRemoveUnavailable(); await hiddenUnavailable.flush()
  assert.deepEqual(hiddenUnavailable.workspace().selected, ['document.read'], 'explicit cleanup removes historical unavailable codes absent from the current catalog without clearing other grants')
  assert.equal(hiddenUnavailable.calls.length, 0, 'cleanup must require explicit saving')
  const dependencyPage = createPage()
  await dependencyPage.flush()
  dependencyPage.workspace().onToggle('document.create'); await dependencyPage.flush()
  assert.deepEqual(dependencyPage.workspace().selected, ['document.read', 'document.create'])
  dependencyPage.workspace().onToggle('document.read'); await dependencyPage.flush()
  assert.deepEqual(dependencyPage.workspace().selected, [], 'revoking read removes the dependent create action')
  dependencyPage.workspace().onSave(); await dependencyPage.flush()
  assert.deepEqual(dependencyPage.calls[0].payload.permissions, [], 'the exact visible selection must be sent, including empty denial')
  dependencyPage.workspace().onToggle('document.create'); await dependencyPage.flush()
  assert.deepEqual(dependencyPage.workspace().selected, ['document.create', 'document.read'], 'adding an action selects its visible prerequisites')
  dependencyPage.workspace().onSave(); await dependencyPage.flush()
  assert.deepEqual(dependencyPage.calls[1].payload.permissions, ['document.create', 'document.read'])
  const incomplete = createPage()
  incomplete.data.get(undefined).positions[0].policies.odo.permissions = ['document.create']
  await incomplete.flush()
  assert.deepEqual(incomplete.workspace().selected, ['document.create'], 'loading an older policy must not silently grant read')
  incomplete.workspace().onSave(); await incomplete.flush()
  assert.equal(incomplete.calls.length, 0, 'an incomplete saved policy needs an explicit repair before saving')
  incomplete.workspace().onGroup(incomplete.workspace().data.catalog.odo.filter(p => p.code === 'document.create'), true); await incomplete.flush()
  incomplete.workspace().onSave(); await incomplete.flush()
  assert.deepEqual(incomplete.calls[0].payload.permissions, ['document.create', 'document.read'])
  const page = createPage()
  await page.flush()
  assert.equal(page.workspace().data.positions.length, 2, 'empty prepared positions must be visible')
  page.workspace().onCreate(); await page.flush()
  assert.equal(page.select(), null, 'creation must not require or assign an employee')
  page.input().props.onChange({ target: { value: ' New role ' } }); await page.flush()
  assert.equal(page.button().props.disabled, false)
  const gate = page.holdChange()
  const create = page.button().props.onClick
  create(); create()
  assert.equal(page.calls.length, 1, 'rapid double-click must send one mutation')
  assert.deepEqual(page.calls[0], { org: undefined, action: 'position', payload: { name: 'New role' } })
  gate.resolve(); await page.flush()
  assert.equal(page.workspace().position.name, 'New role', 'new empty position must be selected')
  assert.deepEqual(page.workspace().selected, [])
  page.workspace().onSave(); await page.flush()
  assert.equal(page.workspace().position.policies.odo.configured, true, 'empty policy can be prepared before assignment')

  page.workspace().onCreate(); await page.flush()
  page.input().props.onChange({ target: { value: ' Reviewer ' } }); await page.flush()
  page.button().props.onClick(); await page.flush()
  assert.equal(page.input().props.value, ' Reviewer ', 'duplicate error preserves entered name')
  assert.equal(page.calls.at(-1).action, 'position', 'duplicate creation must never become a member assignment')
  page.modal().onClose(); await page.flush()

  const prepared = page.workspace().data.positions.find(p => p.id === 'empty')
  page.workspace().onPosition(prepared); await page.flush()
  page.workspace().onMembers(); await page.flush()
  page.select().props.onChange({ target: { value: '3' } }); await page.flush()
  page.button().props.onClick(); await page.flush()
  assert.equal(page.workspace().position.id, 'empty')
  assert.equal(page.workspace().position.user_count, 1)
  assert.equal(page.workspace().data.positions.find(p => p.id === 'filled').user_count, 0)
  const remove = (function find(node) {
    if (Array.isArray(node)) return node.map(find).find(Boolean)
    if (!node || typeof node !== 'object') return null
    if (node.type === 'button' && node.props.children === 'access.t35') return node
    return find(node.props?.children)
  })(page.modal().children)
  assert.ok(remove)
  remove.props.onClick(); await page.flush()
  assert.equal(page.workspace().position.id, 'empty', 'unassigning the last employee keeps the selected position')
  assert.equal(page.workspace().position.user_count, 0)
  assert.deepEqual(page.workspace().position.policies.odo.permissions, ['document.read'], 'unassignment keeps prepared rights')
  page.modal().onClose(); await page.flush()
  page.workspace().onRename(); await page.flush()
  page.input().props.onChange({ target: { value: 'Renamed' } }); await page.flush()
  page.button().props.onClick(); await page.flush()
  assert.equal(page.workspace().position.name, 'Renamed')
  page.workspace().onDelete(); await page.flush()
  page.button().props.onClick(); await page.flush()
  assert.ok(!page.workspace().data.positions.some(p => p.id === 'empty'))

  page.workspace().onCreate(); await page.flush()
  page.input().props.onChange({ target: { value: 'Saved before refresh failure' } }); await page.flush()
  page.failRefresh(); page.button().props.onClick(); await page.flush()
  assert.equal(page.get(Modal), null, 'committed create must not remain open for accidental repeat on refresh error')
  assert.equal(page.workspace().refreshRequired, true)
  const committedCalls = page.calls.length
  page.workspace().onSave(); await page.flush()
  assert.equal(page.calls.length, committedCalls, 'a failed read after commit must block further writes until refresh')

  const preparing = createPage()
  Object.assign(preparing.data.get(undefined).apps.odo, { module_enabled: false, enabled: false })
  await preparing.flush()
  preparing.workspace().onToggle('document.create'); await preparing.flush()
  preparing.workspace().onSave(); await preparing.flush()
  assert.equal(preparing.calls.length, 1)
  assert.equal(preparing.calls[0].action, 'policy')
  assert.equal(preparing.data.get(undefined).apps.odo.enabled, false, 'preparing rights must not enable management')
  preparing.workspace().onMode('odo'); await preparing.flush()
  assert.equal(preparing.get(Modal), null, 'management cannot be enabled while the module is off')

  const conflict = createPage()
  await conflict.flush()
  conflict.workspace().onToggle('document.create'); await conflict.flush()
  conflict.data.get(undefined).positions[0].policies.odo = { permissions: ['document.update'], revision: 2, configured: true }
  conflict.workspace().onSave(); await conflict.flush()
  assert.deepEqual(conflict.workspace().selected, ['document.read', 'document.create'], 'a conflict must retain the chosen checkboxes')
  assert.deepEqual(conflict.workspace().position.policies.odo.permissions, ['document.update'], 'the server set must be available for comparison')
  assert.equal(conflict.workspace().policyConflict, true)
  assert.equal(conflict.calls.length, 1, '409 must never automatically retry a write')
  conflict.workspace().onSave(); await conflict.flush()
  assert.equal(conflict.calls[1].payload.revision, 2, 'explicit retry uses the refreshed revision')
  assert.equal(conflict.workspace().policyConflict, false)
  assert.deepEqual(conflict.workspace().position.policies.odo.permissions, ['document.read', 'document.create'])

  const resetConflict = createPage()
  await resetConflict.flush()
  resetConflict.workspace().onToggle('document.create'); await resetConflict.flush()
  resetConflict.data.get(undefined).positions[0].policies.odo = { permissions: [], revision: 2, configured: true }
  resetConflict.workspace().onSave(); await resetConflict.flush()
  resetConflict.workspace().onReset(); await resetConflict.flush()
  assert.deepEqual(resetConflict.workspace().selected, [])
  assert.equal(resetConflict.calls.length, 1, 'accepting the server policy must not issue a write')

  const failedConflict = createPage()
  await failedConflict.flush()
  failedConflict.workspace().onToggle('document.create'); await failedConflict.flush()
  failedConflict.data.get(undefined).positions[0].policies.odo = { permissions: [], revision: 2, configured: true }
  failedConflict.failRefresh(); failedConflict.workspace().onSave(); await failedConflict.flush()
  assert.deepEqual(failedConflict.workspace().selected, ['document.read', 'document.create'], 'failed conflict refresh must not discard the draft')
  failedConflict.workspace().onSave(); await failedConflict.flush()
  assert.equal(failedConflict.calls[1].payload.revision, 1, 'failed refresh must not invent a new revision')
  assert.equal(failedConflict.workspace().policyConflict, true)

  const alreadyCurrent = createPage()
  await alreadyCurrent.flush()
  alreadyCurrent.workspace().onToggle('document.create'); await alreadyCurrent.flush()
  alreadyCurrent.data.get(undefined).positions[0].policies.odo = { permissions: ['document.create', 'document.read'], revision: 2, configured: true }
  alreadyCurrent.workspace().onSave(); await alreadyCurrent.flush()
  assert.equal(alreadyCurrent.workspace().policyConflict, false, 'an identical server set needs no overwrite')
  assert.equal(alreadyCurrent.workspace().dirty, false)
  assert.equal(alreadyCurrent.calls.length, 1)

  const mode = createPage()
  Object.assign(mode.data.get(undefined).apps.odo, { enabled: false })
  await mode.flush()
  mode.workspace().onMode('odo'); await mode.flush()
  Object.assign(mode.data.get(undefined).apps.odo, { enabled: true, revision: 2 })
  mode.button().props.onClick(); await mode.flush()
  assert.equal(mode.get(Modal), null, 'stale mode confirmation must close after refreshing')
  assert.equal(mode.workspace().data.apps.odo.enabled, true)
  assert.equal(mode.calls.length, 1, 'a mode conflict must never toggle the refreshed state automatically')

  const denied = createPage({ canManage: false })
  await denied.flush()
  assert.equal(denied.get(Workspace), null, 'ordinary staff cannot open management')
  const forgedPlatform = createPage({ platform: true, userRole: 'user' })
  await forgedPlatform.flush()
  assert.equal(forgedPlatform.get(Workspace), null, 'a company owner cannot use platform routes')

  const moving = createPage({ platform: true })
  const late = moving.holdRead('company-a')
  await moving.flush()
  const oldRequest = moving.reads[0]
  moving.navigate('company-b'); await moving.flush()
  assert.equal(oldRequest.signal.aborted, true, 'navigation cancels old access reads')
  late.resolve(initial()); await moving.flush()
  assert.equal(moving.workspace().organization.id, 'company-b', 'late company A must not replace B')
  assert.equal(moving.workspace().position.id, 'b')

  const returning = createPage({ platform: true })
  await returning.flush()
  returning.workspace().onCreate(); await returning.flush()
  returning.input().props.onChange({ target: { value: 'Old request' } }); await returning.flush()
  const oldChange = returning.holdChange()
  returning.button().props.onClick(); await returning.flush()
  returning.navigate('company-b'); await returning.flush()
  returning.navigate('company-a'); await returning.flush()
  returning.workspace().onCreate(); await returning.flush()
  returning.input().props.onChange({ target: { value: 'Current request' } }); await returning.flush()
  const currentChange = returning.holdChange()
  returning.button().props.onClick(); await returning.flush()
  oldChange.resolve(); await returning.flush()
  assert.equal(returning.workspace().busy, true, 'late mutation must not unlock a newer request after returning to the same company')
  currentChange.resolve(); await returning.flush()
  assert.equal(returning.workspace().position.name, 'Current request')

  console.log('Position access: creation/assignment, mode guards, save conflicts, failed refresh, duplicate submits and company isolation passed')
})().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => { delete global.window })
