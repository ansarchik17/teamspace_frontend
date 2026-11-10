const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load(file, dependencies = {}) {
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
      throw new Error(`Unexpected import ${name} in ${file}`)
    },
    item,
    item.exports,
  )
  return item.exports
}

const ruAi = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/shared/i18n/locales/ru/ai.json'), 'utf8'))
const kkAi = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/shared/i18n/locales/kk/ai.json'), 'utf8'))

const limitsEntities = load('src/domain/entities/UserAILimits.ts')

const tinyBalance = limitsEntities.parseUserAILimitsDto({
  server_time: '2026-10-21T08:00:00Z',
  five_hour: {
    state: 'active', limit_microcredits: '1000', used_microcredits: '999', available_microcredits: '1', remaining_percent: 0,
  },
}).fiveHour
assert.equal(limitsEntities.isAIQuotaWindowExhausted(tinyBalance), false)
assert.equal(limitsEntities.formatRemainingPercent(tinyBalance.remainingPercent, tinyBalance.availableMicrocredits), '< 1%')
assert.equal(limitsEntities.isAIQuotaWindowExhausted({ ...tinyBalance, availableMicrocredits: '0' }), true)
assert.equal(limitsEntities.isAIQuotaWindowExhausted({ ...tinyBalance, limitMicrocredits: '0' }), false)

const dialogsSource = fs.readFileSync(path.join(__dirname, '../src/presentation/pages/alemai/chat/components/ChatDialogs.tsx'), 'utf8')
const dialogsAst = ts.createSourceFile('dialogs.tsx', dialogsSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const chatUiSource = fs.readFileSync(path.join(__dirname, '../src/presentation/pages/alemai/chat/chatUi.ts'), 'utf8')
const chatUiAst = ts.createSourceFile('chatUi.ts', chatUiSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const {
  parseUserAILimitsDto,
  formatMicrocredits,
  formatRemainingPercent,
} = limitsEntities

// 1. Check all required translation keys exist in both ru and kk
console.log('1. Verifying translation keys in ru and kk catalogs...')
const requiredLimitKeys = [
  'title',
  'fiveHour',
  'fiveHourFull',
  'weekly',
  'weeklyFull',
  'remaining',
  'available',
  'used',
  'reserved',
  'limit',
  'creditsUnit',
  'resetsAt',
  'resetsOn',
  'statusActive',
  'statusExhausted',
  'statusUnconfigured',
  'statusDisabled',
  'loading',
  'error',
  'retry',
  'accessGranted',
  'accessBlocked',
  'blockersTitle',
  'retryEstimated',
  'retryRequiresAction',
  'retryUnknown',
  'openDetails',
  'closeDetails',
  'reservedHint',
  'periodPending',
  'refresh',
]

for (const key of requiredLimitKeys) {
  assert.ok(ruAi.limits[key], `Missing ru.limits.${key}`)
  assert.ok(kkAi.limits[key], `Missing kk.limits.${key}`)
}

const requiredReasonKeys = [
  'NO_ORGANIZATION',
  'COMPANY_SUSPENDED',
  'AI_ACCESS_DENIED',
  'COMPANY_BUDGET_UNCONFIGURED',
  'COMPANY_BUDGET_DISABLED',
  'USER_QUOTA_UNCONFIGURED',
  'USER_QUOTA_DISABLED',
  'FIVE_HOUR_DISABLED',
  'SERVICE_QUOTA_DISABLED',
  'CREDIT_POLICY_UNAVAILABLE',
  'COMPANY_WEEKLY_EXHAUSTED',
  'USER_WEEKLY_EXHAUSTED',
  'FIVE_HOUR_EXHAUSTED',
  'SERVICE_WEEKLY_EXHAUSTED',
  'RESERVATION_PENDING',
  'RESERVATION_TOO_LARGE',
]

for (const key of requiredReasonKeys) {
  assert.ok(ruAi.reasons[key], `Missing ru.reasons.${key}`)
  assert.ok(kkAi.reasons[key], `Missing kk.reasons.${key}`)
}
console.log('   All 47 translation keys verified in ru and kk!')

// 2. Test percentage and status representation
console.log('2. Testing percentage and status representations...')

// Unconfigured window: percent must be "—", not 100% or 0%
const unconfiguredParsed = parseUserAILimitsDto({
  server_time: '2026-10-19T14:00:00Z',
  five_hour: { state: 'unconfigured', limit_microcredits: null, remaining_percent: null },
})
assert.equal(
  formatRemainingPercent(
    unconfiguredParsed.fiveHour.remainingPercent,
    unconfiguredParsed.fiveHour.availableMicrocredits,
  ),
  '—',
)
assert.equal(unconfiguredParsed.fiveHour.limitMicrocredits, null)

// Disabled window: percent must be "—"
const disabledParsed = parseUserAILimitsDto({
  server_time: '2026-10-19T14:00:00Z',
  weekly: { state: 'disabled', limit_microcredits: '0', remaining_percent: null },
})
assert.equal(
  formatRemainingPercent(
    disabledParsed.weekly.remainingPercent,
    disabledParsed.weekly.availableMicrocredits,
  ),
  '—',
)

// Active with 0% but available balance > 0 => "< 1%"
const subOnePercentParsed = parseUserAILimitsDto({
  server_time: '2026-10-19T14:00:00Z',
  five_hour: {
    state: 'active',
    limit_microcredits: '100000000',
    used_microcredits: '99800000',
    reserved_microcredits: '100000',
    available_microcredits: '100000', // 0.1 credit available
    remaining_percent: 0,
  },
})
assert.equal(
  formatRemainingPercent(
    subOnePercentParsed.fiveHour.remainingPercent,
    subOnePercentParsed.fiveHour.availableMicrocredits,
  ),
  '< 1%',
)

// Active normal percentages
assert.equal(formatRemainingPercent(100, '50000000'), '100%')
assert.equal(formatRemainingPercent(45, '22500000'), '45%')
assert.equal(formatRemainingPercent(12, '6000000'), '12%')
assert.equal(formatRemainingPercent(0, '0'), '0%')

console.log('   Percentage formatting conforms to specification!')

// 3. Test active reserve isolation and calculation
console.log('3. Testing reserved funds and carried reserves...')
const reservedSample = parseUserAILimitsDto({
  server_time: '2026-10-19T14:00:00Z',
  five_hour: {
    state: 'active',
    limit_microcredits: '10000000',
    used_microcredits: '3000000',
    reserved_microcredits: '2000000',
    carried_reserved_microcredits: '500000',
    available_microcredits: '5000000',
    remaining_percent: 50,
  },
})

assert.equal(reservedSample.fiveHour.usedMicrocredits, '3000000')
assert.equal(reservedSample.fiveHour.reservedMicrocredits, '2000000')
assert.equal(reservedSample.fiveHour.carriedReservedMicrocredits, '500000')
assert.equal(reservedSample.fiveHour.availableMicrocredits, '5000000')
assert.equal(formatMicrocredits(reservedSample.fiveHour.availableMicrocredits), '5.00')
assert.equal(formatMicrocredits(reservedSample.fiveHour.reservedMicrocredits), '2.00')
console.log('   Reserved funds and carried reserves correctly isolated!')

// Render the actual employee card: holds affect the remainder but stay internal.
const usedPercentNode = chatUiAst.statements.find(node => ts.isVariableStatement(node) && node.getText(chatUiAst).includes('usedPercent'))
assert.ok(usedPercentNode, 'Usage percentage helper must exist')
const usedPercentJs = ts.transpileModule(usedPercentNode.getText(chatUiAst).replace('export ', ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText
const usedPercent = new Function('isAIQuotaWindowExhausted', `${usedPercentJs}; return usedPercent`)(limitsEntities.isAIQuotaWindowExhausted)
const usageSample = (used, reserved, remaining) => ({
  ...reservedSample.fiveHour, limitMicrocredits: '100000000',
  usedMicrocredits: used, reservedMicrocredits: reserved, remainingPercent: remaining,
})
assert.equal(usedPercent(usageSample('75000000', '24000000', 1)), 75)
assert.equal(usedPercent(usageSample('75000000', '0', 25)), 75, 'Released reservation must not reduce displayed usage')
assert.equal(usedPercent(usageSample('99000000', '0', 1)), 99)
assert.equal(usedPercent(usageSample('99999999', '0', 0)), 99, 'Positive remainder is not exhaustion')
assert.equal(usedPercent(usageSample('100000000', '0', 0)), 100, 'Final debit reaches 100%')
assert.equal(usedPercent(usageSample('101000000', '0', 0)), 100)
assert.equal(usedPercent({ ...reservedSample.fiveHour, limitMicrocredits: '0' }), null)
assert.equal(usedPercent({ ...reservedSample.fiveHour, limitMicrocredits: 'invalid' }), null)
assert.equal(usedPercent({ ...reservedSample.fiveHour, limitMicrocredits: '9223372036854775807', usedMicrocredits: '9131138316486228049' }), 99, 'Preserve int64 precision')
const cardFunctions = dialogsAst.statements
  .filter(node => ts.isFunctionDeclaration(node) && ['LimitWindow', 'UsageRing'].includes(node.name?.text))
  .map(node => node.getText(dialogsAst).replace('export ', '')).join('\n')
assert.ok(cardFunctions.includes('function LimitWindow'), 'Test the actual limits window card')
const cardJs = ts.transpileModule(cardFunctions, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText
const WindowCard = new Function('require', 'useTranslation', 'usedPercent', 'isAIQuotaWindowExhausted', 'formatDate', 'formatTime',
  `const exports = {}; const Clock = () => null; ${cardJs}; return LimitWindow`)(require, () => ({ t: (key, values) => values?.value ? `${key}:${values.value}` : key }), usedPercent, limitsEntities.isAIQuotaWindowExhausted, () => '', () => '')
const cardHtml = require('react-dom/server').renderToStaticMarkup(WindowCard({ title: 'Five hours', window: reservedSample.fiveHour }))
assert.ok(cardHtml.includes('30%'), 'Committed spending drives usage; reservations are excluded')
const tinyCardHtml = require('react-dom/server').renderToStaticMarkup(WindowCard({ title: 'Five hours', window: tinyBalance }))
assert.ok(tinyCardHtml.includes('99%'), 'A tiny balance rounded to 0% must not be shown as fully used')
assert.ok(!tinyCardHtml.includes('limits.statusExhausted'))
for (const key of ['limits.reserved', 'limits.reservedHint', 'limits.used', 'limits.limit']) {
  assert.ok(!cardHtml.includes(key), `Employee card must not expose accounting detail: ${key}`)
}
console.log('   Employee card shows the available remainder without accounting internals.')

// 4. Test access blockers and reasons
console.log('4. Testing access state and blockers...')
const blockedSample = parseUserAILimitsDto({
  server_time: '2026-10-19T14:00:00Z',
  access: {
    can_start_request: false,
    retry_kind: 'estimated',
    retry_at: '2026-10-19T18:00:00Z',
    blockers: [
      { reason: 'FIVE_HOUR_EXHAUSTED', scope: 'five_hour', enforced: true, resets_at: '2026-10-19T18:00:00Z' },
      { reason: 'RESERVATION_PENDING', scope: 'service', enforced: true, resets_at: null },
    ],
  },
})

assert.equal(blockedSample.access.canStartRequest, false)
assert.equal(blockedSample.access.blockers.length, 2)
assert.equal(blockedSample.access.blockers[0].reason, 'FIVE_HOUR_EXHAUSTED')
assert.equal(ruAi.reasons[blockedSample.access.blockers[0].reason], 'Пятичасовой лимит исчерпан')
assert.equal(kkAi.reasons[blockedSample.access.blockers[0].reason], 'Бес сағаттық лимит таусылды')

assert.equal(blockedSample.access.blockers[1].reason, 'RESERVATION_PENDING')
assert.equal(ruAi.reasons[blockedSample.access.blockers[1].reason], 'Часть кредитов зарезервирована по предыдущим запросам. Свободного остатка недостаточно для этого запроса.')
assert.equal(kkAi.reasons[blockedSample.access.blockers[1].reason], 'Кредиттердің бір бөлігі алдыңғы сұраныстарға резервтелген. Бос қалдық бұл сұранысқа жеткіліксіз.')
console.log('   Access state blockers and translations verified!')

// 5. Test company isolation: employee limits do not contain corporate budget
console.log('5. Testing company isolation (no corporate budgets in employee view)...')
const employeeDto = {
  server_time: '2026-10-19T14:00:00Z',
  organization_id: 'org-123',
  enforcement_mode: 'enforced',
  five_hour: { state: 'active', limit_microcredits: '10000000' },
  weekly: { state: 'active', limit_microcredits: '50000000' },
  access: { can_start_request: true, blockers: [] },
}
const employeeParsed = parseUserAILimitsDto(employeeDto)
assert.equal(employeeParsed.organizationId, 'org-123')
assert.equal(employeeParsed.fiveHour.limitMicrocredits, '10000000')
assert.equal(employeeParsed.weekly.limitMicrocredits, '50000000')
// Verify no company budget fields leaked into UserAILimits
assert.equal('companyBudget' in employeeParsed, false)
assert.equal('company_budget' in employeeParsed, false)
console.log('   Company budget is strictly isolated from employee limits!')

console.log('\nAll Task 31 verification tests passed successfully!')
