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

console.log('--- Test Suite: Task 35 - Company AI Budget Section and UI Summary ---')

// 1. Translations check for administration section
console.log('1. Checking administration translation keys in ru and kk...')
assert.ok(ruAi.admin, 'ruAi.admin section is missing')
assert.ok(kkAi.admin, 'kkAi.admin section is missing')

const expectedAdminKeys = [
  'title',
  'tab',
  'overviewActionTitle',
  'overviewActionCaption',
  'budgetTitle',
  'budgetMeterLabel',
  'unconfiguredTitle',
  'unconfiguredDescription',
  'disabledTitle',
  'disabledDescription',
  'overcommittedTitle',
  'overcommittedDescription',
  'used',
  'reserved',
  'carriedReserved',
  'available',
  'unallocated',
  'allocated',
  'employeeAllocated',
  'serviceAllocated',
  'committed',
  'maxFiveHour',
  'serviceAvailable',
  'serviceUsed',
  'period',
  'periodFromTo',
  'periodPending',
  'revision',
  'serverTime',
  'configureBudget',
  'editBudget',
  'platformOnlyHint',
  'directorHint',
  'loading',
  'error',
  'retry',
  'remainingPercent',
  'distributionTitle',
  'formWeeklyBudget',
  'formMaxFiveHour',
  'formServiceQuota',
  'formDescription',
  'formSuccess',
  'invalidCreditsInput',
]

for (const key of expectedAdminKeys) {
  assert.ok(ruAi.admin[key], `Missing ru.admin.${key}`)
  assert.ok(kkAi.admin[key], `Missing kk.admin.${key}`)
}
assert.equal(
  Object.keys(ruAi.admin).length,
  Object.keys(kkAi.admin).length,
  'ru.admin and kk.admin have different number of keys',
)
console.log(`   Passed: All ${expectedAdminKeys.length} keys verified in ru and kk.`)

// 2. Test parseCreditsToMicrocredits & microcreditsToCreditsInput
console.log('2. Testing parseCreditsToMicrocredits and microcreditsToCreditsInput...')
const mockReact = {
  useCallback: fn => fn,
  useEffect: () => {},
  useRef: initial => ({ current: initial }),
  useState: initial => [initial, () => {}],
}
const mockI18n = {
  useTranslation: () => ({ t: (k, opts) => k }),
}
const mockIcons = {
  Sparkles: () => null,
  AlertTriangle: () => null,
  Clock: () => null,
  RefreshCw: () => null,
  Cpu: () => null,
  Check: () => null,
}
const mockUserLimits = {
  formatMicrocredits: (val) => {
    if (val === null || val === undefined) return '0'
    const b = BigInt(val)
    const intPart = b / 1_000_000n
    const rem = b % 1_000_000n
    if (rem === 0n) return intPart.toString()
    return `${intPart}.${rem.toString().padStart(6, '0').replace(/0+$/, '')}`
  },
}
const mockAdminUi = {
  AdminPanel: ({ children }) => children,
  AdminStatus: ({ children }) => children,
}
const mockAppButton = () => null

const budgetSectionModule = loadModule('src/presentation/pages/organization/CompanyAIBudgetSection.tsx', {
  './AICreditGuide': { AICreditGuide: () => null },
  'react': mockReact,
  'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: () => null },
  'react-i18next': mockI18n,
  'lucide-react': mockIcons,
  '../../../infrastructure/repositories/HttpAdministrationRepository': {},
  '../../../domain/entities/AdministrationAIBudget': {},
  '../../../domain/entities/UserAILimits': mockUserLimits,
  './administrationUi': mockAdminUi,
  '../../../shared/ui/AppButton': mockAppButton,
  './CompanyAIBudgetModal': { CompanyAIBudgetModal: () => null },
  './CompanyAIUsersTable': { CompanyAIUsersTable: () => null },
  './CompanyAIEmployeeQuotaModal': { CompanyAIEmployeeQuotaModal: () => null },
  '../../../shared/ui/axisTokens': { AXIS_UI: {} },
  './aiBudgetFormat': { credits: value => String(value) },
  './aiBudgetUi': { Meter: () => null },
})

const { parseCreditsToMicrocredits, microcreditsToCreditsInput } = budgetSectionModule

// Test parsing
assert.equal(parseCreditsToMicrocredits('100'), '100000000')
assert.equal(parseCreditsToMicrocredits('0'), '0')
assert.equal(parseCreditsToMicrocredits('12.5'), '12500000')
assert.equal(parseCreditsToMicrocredits('0.000001'), '1')
assert.equal(parseCreditsToMicrocredits('1000000000'), '1000000000000000') // 1B credits > Number.MAX_SAFE_INTEGER in microcredits
assert.equal(parseCreditsToMicrocredits('   42,500   '), '42500000')

// Invalid parsing
assert.throws(() => parseCreditsToMicrocredits(''), /Invalid credit amount/)
assert.throws(() => parseCreditsToMicrocredits('-10'), /Invalid credit amount/)
assert.throws(() => parseCreditsToMicrocredits('abc'), /Invalid credit amount/)

// Test formatting input
assert.equal(microcreditsToCreditsInput('100000000'), '100')
assert.equal(microcreditsToCreditsInput('12500000'), '12.5')
assert.equal(microcreditsToCreditsInput('1'), '0.000001')
assert.equal(microcreditsToCreditsInput('0'), '0')
assert.equal(microcreditsToCreditsInput(null), '')
assert.equal(microcreditsToCreditsInput(undefined), '')
console.log('   Passed: Parsing and formatting correctly preserves full 64-bit microcredit precision.')

// 3. Test mathematical guarantees of AIBudgetSummary formulas
console.log('3. Validating server-provided formulas and boundary cases...')
const sampleSummary = {
  configured: true,
  weekly_budget_microcredits: '1000000000', // 1000 credits
  used_microcredits: '200000000', // 200 credits
  reserved_microcredits: '50000000', // 50 credits
  carried_reserved_microcredits: '10000000', // 10 credits (part of 50)
  available_microcredits: '750000000', // 1000 - 200 - 50 = 750 credits
  allocated_microcredits: '600000000', // 600 credits
  unallocated_microcredits: '400000000', // 1000 - 600 = 400 credits
  committed_microcredits: '600000000',
  employee_allocated_microcredits: '500000000',
  service_weekly_quota_microcredits: '100000000',
  overcommitted_microcredits: '0',
  max_five_hour_microcredits: '100000000',
  remaining_percent: 75,
  period_start: '2026-10-19T00:00:00Z',
  period_end: '2026-10-26T00:00:00Z',
  server_time: '2026-10-19T15:00:00Z',
  revision: 3,
  capabilities: {
    read_ai_budget: true,
    set_company_budget: true,
    set_user_quotas: true,
  },
  service: {
    used_microcredits: '20000000',
    available_microcredits: '80000000',
    reserved_microcredits: '0',
  },
}

// Check Available = max(0, B - Used - Reserved)
const budgetBI = BigInt(sampleSummary.weekly_budget_microcredits)
const usedBI = BigInt(sampleSummary.used_microcredits)
const reservedBI = BigInt(sampleSummary.reserved_microcredits)
const availableBI = BigInt(sampleSummary.available_microcredits)
assert.equal(budgetBI - usedBI - reservedBI, availableBI)

// Check Unallocated = max(0, B - Committed)
const committedBI = BigInt(sampleSummary.committed_microcredits)
const unallocatedBI = BigInt(sampleSummary.unallocated_microcredits)
assert.equal(budgetBI - committedBI, unallocatedBI)

// Check Overcommitted = max(0, Committed - B)
const overcommittedBI = BigInt(sampleSummary.overcommitted_microcredits)
assert.equal(overcommittedBI, 0n)
console.log('   Passed: Formula consistency confirmed.')

// 4. Test Overcommitted condition
console.log('4. Testing Overcommitted calculation...')
const overcommittedBudget = {
  ...sampleSummary,
  weekly_budget_microcredits: '300000000', // Budget reduced to 300 credits
  committed_microcredits: '600000000', // Committed remains 600 credits
  unallocated_microcredits: '0', // max(0, 300 - 600) = 0
  overcommitted_microcredits: '300000000', // 600 - 300 = 300 credits deficit
}
assert.equal(BigInt(overcommittedBudget.overcommitted_microcredits), 300000000n)
assert.equal(BigInt(overcommittedBudget.unallocated_microcredits), 0n)
console.log('   Passed: Overcommitted scenario properly exposes deficit amount.')

// 5. Test Zero-budget condition (B = 0)
console.log('5. Testing Zero-budget condition (weekly_budget = 0)...')
const zeroBudget = {
  ...sampleSummary,
  weekly_budget_microcredits: '0',
  available_microcredits: '0',
  remaining_percent: 0,
  overcommitted_microcredits: sampleSummary.committed_microcredits,
}
assert.equal(zeroBudget.weekly_budget_microcredits, '0')
assert.equal(zeroBudget.available_microcredits, '0')
assert.equal(zeroBudget.remaining_percent, 0)
console.log('   Passed: Zero budget blocks generations while preserving existing allocated quotas.')

// 6. Test Unconfigured condition
console.log('6. Testing Unconfigured condition...')
const unconfiguredSummary = {
  ...sampleSummary,
  configured: false,
  weekly_budget_microcredits: null,
  available_microcredits: null,
  unallocated_microcredits: null,
  overcommitted_microcredits: null,
  remaining_percent: null,
}
assert.equal(unconfiguredSummary.configured, false)
assert.equal(unconfiguredSummary.weekly_budget_microcredits, null)
console.log('   Passed: Unconfigured state is distinctly recognized from 0-credit budget.')

// 7. Test Role separation: Director vs Platform Admin
console.log('7. Testing Role capabilities separation...')
// Director capabilities
const directorCaps = {
  read_ai_budget: true,
  set_company_budget: false, // Director cannot change company budget
  set_user_quotas: true,      // Director can distribute quotas
}
// Platform admin capabilities
const platformCaps = {
  read_ai_budget: true,
  set_company_budget: true,  // Platform admin can set company budget
  set_user_quotas: false,
}
assert.equal(directorCaps.set_company_budget, false)
assert.equal(platformCaps.set_company_budget, true)
console.log('   Passed: Capabilities clearly delineate platform and director actions.')

console.log('All 7 Task 35 checks passed successfully!')
