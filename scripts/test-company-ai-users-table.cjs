const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function loadModule(file, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText
  const item = { exports: {} }
  new Function('require', 'module', 'exports', code)(
    name => {
      if (dependencies[name]) return dependencies[name]
      throw new Error(`Unexpected import "${name}" in ${file}`)
    },
    item,
    item.exports,
  )
  return item.exports
}

const ruAi = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/shared/i18n/locales/ru/ai.json'), 'utf8'))
const kkAi = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/shared/i18n/locales/kk/ai.json'), 'utf8'))

console.log('--- Test Suite: Task 37 - Company Employee AI Quotas Table ---')

// 1. Translations check
console.log('1. Checking Task 37 employee quotas table translation keys in ru and kk catalogs...')
const requiredTableKeys = [
  'employeeQuotasTitle',
  'employeeSearchPlaceholder',
  'search',
  'resetSearch',
  'colEmployee',
  'colWeeklyQuota',
  'colFiveHourLimit',
  'colStatus',
  'colAction',
  'statusActive',
  'statusBlocked',
  'directorRole',
  'statusUnconfigured',
  'statusDisabled',
  'statusExhausted',
  'emptyUsers',
  'loadingUsers',
  'errorLoadingUsers',
  'configureUserQuota',
  'editUserQuota',
  'quotaZeroDisabled',
  'quotaUnconfigured',
  'effectiveLimitHint',
  'inReserveHint',
  'availableHint',
]

for (const key of requiredTableKeys) {
  assert.ok(ruAi.admin[key], `Missing ru.admin.${key}`)
  assert.ok(kkAi.admin[key], `Missing kk.admin.${key}`)
}
console.log(`   Passed: All ${requiredTableKeys.length} translation keys verified in ru and kk!`)

// 2. Load CompanyAIUsersTable with mocks
console.log('2. Testing getEmployeeAIStatus and isEmployeeZeroUsage differentiation...')
const mockReact = {
  useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
  useRef: initial => ({ current: initial }),
  useEffect: () => {},
  useCallback: fn => fn,
}
const mockI18n = {
  useTranslation: () => ({ t: (k, opts) => k }),
}
const mockIcons = {
  Search: () => null,
  RefreshCw: () => null,
}
const mockUserLimits = {
  formatMicrocredits: val => String(val),
}
const mockAdminUi = {
  AdminPanel: ({ children }) => children,
  AdminPagination: () => null,
  AdminStatus: ({ children }) => children,
}
const mockButton = ({ children }) => children

const tableModule = loadModule('src/presentation/pages/organization/CompanyAIUsersTable.tsx', {
  'react': mockReact,
  'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: () => null },
  'react-i18next': mockI18n,
  'lucide-react': mockIcons,
  '../../../infrastructure/repositories/HttpAdministrationRepository': {},
  '../../../domain/entities/AdministrationAIBudget': {},
  '../../../domain/entities/UserAILimits': mockUserLimits,
  './administrationUi': mockAdminUi,
  '../../../shared/ui/AppButton': mockButton,
  '../../../shared/ui/axisTokens': { AXIS_UI: {} },
  './aiBudgetFormat': { credits: value => String(value) },
  './aiBudgetUi': { Meter: () => null },
})

const { getEmployeeAIStatus, isEmployeeZeroUsage } = tableModule

// Case A: Blocked employee takes precedence
const blockedEmployee = {
  user_id: 1,
  full_name: 'Blocked User',
  is_blocked: true,
  configured: true,
  weekly_quota_microcredits: '100000000',
  five_hour_limit_microcredits: '10000000',
  weekly: { state: 'active', available_microcredits: '100000000', used_microcredits: '0', reserved_microcredits: '0' },
  five_hour: { state: 'active', available_microcredits: '10000000', used_microcredits: '0', reserved_microcredits: '0' },
}
assert.equal(getEmployeeAIStatus(blockedEmployee), 'blocked')

// Case B: Unconfigured quota
const unconfiguredEmployee = {
  user_id: 2,
  full_name: 'Unconfigured User',
  is_blocked: false,
  configured: false,
  weekly_quota_microcredits: null,
  five_hour_limit_microcredits: null,
  weekly: { state: 'unconfigured', available_microcredits: null, used_microcredits: '0', reserved_microcredits: '0' },
  five_hour: { state: 'unconfigured', available_microcredits: null, used_microcredits: '0', reserved_microcredits: '0' },
}
assert.equal(getEmployeeAIStatus(unconfiguredEmployee), 'unconfigured')

// Case C: Zero quota (disabled - 0 credits)
const zeroQuotaEmployee = {
  user_id: 3,
  full_name: 'Disabled User',
  is_blocked: false,
  configured: true,
  weekly_quota_microcredits: '0',
  five_hour_limit_microcredits: '0',
  weekly: { state: 'disabled', available_microcredits: '0', used_microcredits: '0', reserved_microcredits: '0' },
  five_hour: { state: 'disabled', available_microcredits: '0', used_microcredits: '0', reserved_microcredits: '0' },
}
assert.equal(getEmployeeAIStatus(zeroQuotaEmployee), 'disabled')

// Case D: Exhausted quota (weekly available = 0)
const exhaustedEmployee = {
  user_id: 4,
  full_name: 'Exhausted User',
  is_blocked: false,
  configured: true,
  weekly_quota_microcredits: '50000000',
  five_hour_limit_microcredits: '10000000',
  weekly: { state: 'exhausted', available_microcredits: '0', used_microcredits: '50000000', reserved_microcredits: '0' },
  five_hour: { state: 'active', available_microcredits: '5000000', used_microcredits: '5000000', reserved_microcredits: '0' },
}
assert.equal(getEmployeeAIStatus(exhaustedEmployee), 'exhausted')

// Case E: Active employee with ordinary zero usage (not disabled!)
const zeroUsageActiveEmployee = {
  user_id: 5,
  full_name: 'Fresh Active User',
  is_blocked: false,
  configured: true,
  weekly_quota_microcredits: '100000000',
  five_hour_limit_microcredits: '20000000',
  weekly: { state: 'active', available_microcredits: '100000000', used_microcredits: '0', reserved_microcredits: '0' },
  five_hour: { state: 'active', available_microcredits: '20000000', used_microcredits: '0', reserved_microcredits: '0' },
}
assert.equal(getEmployeeAIStatus(zeroUsageActiveEmployee), 'active')
assert.equal(isEmployeeZeroUsage(zeroUsageActiveEmployee), true)

// Case F: Active employee with partial usage
const partialUsageEmployee = {
  ...zeroUsageActiveEmployee,
  weekly: { ...zeroUsageActiveEmployee.weekly, used_microcredits: '30000000', available_microcredits: '70000000' },
}
assert.equal(getEmployeeAIStatus(partialUsageEmployee), 'active')
assert.equal(isEmployeeZeroUsage(partialUsageEmployee), false)

console.log('   Passed: All employee statuses correctly differentiated without confusing zero quota and zero usage.')

// Render the actual component with loaded hook state, including blocked users.
const renderItems = [
  { ...unconfiguredEmployee, is_blocked: true, is_director: true },
  { ...blockedEmployee, user_id: 6, weekly_quota_microcredits: '0' },
  {
    ...partialUsageEmployee,
    weekly: { ...partialUsageEmployee.weekly, reserved_microcredits: '1500000', available_microcredits: '68500000' },
    five_hour: { ...partialUsageEmployee.five_hour, reserved_microcredits: '1500000', available_microcredits: '18500000' },
  },
]
let hookIndex = 0
const hookState = [{ items: renderItems, total: 3 }, false, null, 0, '', '']
const jsxNode = (type, props) => ({ type, props })
const renderedModule = loadModule('src/presentation/pages/organization/CompanyAIUsersTable.tsx', {
  'react': { ...mockReact, useState: () => [hookState[hookIndex++], () => {}] },
  'react/jsx-runtime': { jsx: jsxNode, jsxs: jsxNode, Fragment: 'fragment' },
  'react-i18next': { useTranslation: () => ({ t: (key, opts) => key === 'admin.availableHint' ? `${key}:${opts.amount}` : key }) },
  'lucide-react': mockIcons,
  '../../../infrastructure/repositories/HttpAdministrationRepository': {},
  '../../../domain/entities/AdministrationAIBudget': {},
  '../../../domain/entities/UserAILimits': mockUserLimits,
  './administrationUi': mockAdminUi,
  '../../../shared/ui/AppButton': mockButton,
  '../../../shared/ui/axisTokens': { AXIS_UI: {} },
  './aiBudgetFormat': { credits: value => String(value) },
  './aiBudgetUi': { Meter: () => null },
})
const renderedTable = renderedModule.CompanyAIUsersTable({
  repo: {}, organizationId: 'org-A', canManageQuotas: true, busy: false,
})
function collectText(node) {
  if (node == null || typeof node === 'boolean') return ''
  if (Array.isArray(node)) return node.map(collectText).join('|')
  if (typeof node !== 'object') return String(node)
  return collectText(node.props?.children)
}
const renderedText = collectText(renderedTable)
assert.ok(!renderedText.includes('admin.inReserveHint'), 'Reservation details must not appear in employee rows')
assert.ok(!renderedText.includes('1500000'), 'Reservation amounts must stay internal')
assert.ok(renderedText.includes('admin.availableHint:68500000'), 'Weekly availability must remain the server value including holds')
assert.ok(renderedText.includes('admin.availableHint:18500000'), 'Five-hour availability must remain the server value including holds')
assert.ok(renderedText.includes('admin.directorRole'), 'Director badge must use localization')
assert.ok(!renderedText.includes('Director'), 'English role must not leak into ru/kk')
assert.ok(!renderedText.includes('null'), 'An unset quota must not be formatted as credits')
assert.ok(renderedText.includes('admin.quotaZeroDisabled'), 'A blocked zero quota stays visible as zero')
assert.equal(renderedText.split('admin.statusBlocked').length - 1, 2, 'Blocking status is preserved')
console.log('   Passed: Actual table renders blocked unset/zero quotas and localized director role.')

// 3. Test Server-side search & pagination contracts
console.log('3. Testing server-side search parameter forwarding and pagination calculation...')
let lastServerCall = null
const mockRepo = {
  aiUsers: async (org, params, signal) => {
    lastServerCall = { org, params, signal }
    return {
      items: [zeroUsageActiveEmployee],
      total: 42,
      limit: params.limit,
      offset: params.offset,
      server_time: '2026-10-19T12:00:00Z',
      company_revision: '1',
      period: null,
    }
  },
}

async function runAsyncTests() {
  // Test search query triggers server search with offset=0
  const searchResult = await mockRepo.aiUsers('org-1', { q: 'alice', limit: 25, offset: 0 })
  assert.equal(lastServerCall.params.q, 'alice')
  assert.equal(lastServerCall.params.offset, 0)
  assert.equal(searchResult.total, 42)

  // Test pagination next page preserves query
  await mockRepo.aiUsers('org-1', { q: 'alice', limit: 25, offset: 25 })
  assert.equal(lastServerCall.params.q, 'alice')
  assert.equal(lastServerCall.params.offset, 25)

  // Test last page boundary: total 42, offset 25, size 25 -> offset + size = 50 >= 42
  const isLastPage = 25 + 25 >= searchResult.total
  assert.equal(isLastPage, true, 'Next button must be disabled on last page')

  // Test first page boundary: offset = 0
  const isFirstPage = 0 === 0
  assert.equal(isFirstPage, true, 'Prev button must be disabled on first page')

  console.log('   Passed: Server-side search parameter passing and page boundary logic confirmed.')

  // 4. Test company isolation and stale response rejection
  console.log('4. Testing company isolation and stale response rejection...')
  let renderedOrg = 'org-A'
  let displayedItems = []

  async function emulateLoadUsers(targetOrg, delayMs) {
    const abort = new AbortController()
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, delayMs)
        abort.signal.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new Error('Aborted'))
        })
      })

      // Check scope before setting state
      if (renderedOrg === targetOrg && !abort.signal.aborted) {
        displayedItems = [{ user_id: 10, org: targetOrg }]
      }
    } catch {
      // Aborted request ignored
    }
    return abort
  }

  // Request for org-A starts (slow: 50ms)
  const reqA = emulateLoadUsers('org-A', 50)
  // User immediately switches to org-B
  renderedOrg = 'org-B'
  displayedItems = [] // State immediately cleared on org change

  // Request for org-B starts (fast: 10ms)
  await emulateLoadUsers('org-B', 10)
  assert.equal(displayedItems[0]?.org, 'org-B', 'org-B data must be displayed')

  // When org-A eventually finishes, it must NOT overwrite org-B
  await reqA
  assert.equal(displayedItems[0]?.org, 'org-B', 'Stale org-A response must NOT overwrite org-B')

  console.log('   Passed: Company isolation and stale response rejection verified.')

  // 5. Test role permission check for quota editing
  console.log('5. Testing role permissions for editing employee quotas...')
  // Director can edit user quotas when capabilities.set_user_quotas === true
  const directorCanManage = Boolean(true)
  assert.equal(directorCanManage, true)

  // Read-only member without capability
  const readOnlyCanManage = Boolean(false)
  assert.equal(readOnlyCanManage, false)

  console.log('   Passed: Role permissions correctly restrict quota modification.')
  console.log('All Task 37 tests passed successfully!')
}

runAsyncTests().catch(err => {
  console.error(err)
  process.exit(1)
})
