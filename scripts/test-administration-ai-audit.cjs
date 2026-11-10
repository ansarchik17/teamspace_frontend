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
const ruAdmin = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/shared/i18n/locales/ru/administration.json'), 'utf8'))

console.log('--- Test Suite: Task 39 - Administration AI Budget & Quota Audit Events ---')

// 1. Translations check
console.log('1. Checking Task 39 audit translation keys in ru and kk catalogs...')
assert.ok(ruAi.audit, 'ruAi.audit section is missing')
assert.ok(kkAi.audit, 'kkAi.audit section is missing')

const expectedAuditKeys = [
  'budgetUpdate',
  'userQuotaUpdate',
  'weeklyBudget',
  'maxFiveHour',
  'serviceWeeklyQuota',
  'weeklyQuota',
  'fiveHourLimit',
  'revision',
  'unconfigured',
  'objectCompany',
  'objectUserQuota',
]

for (const key of expectedAuditKeys) {
  assert.ok(ruAi.audit[key], `Missing ru.audit.${key}`)
  assert.ok(kkAi.audit[key], `Missing kk.audit.${key}`)
}
assert.equal(
  Object.keys(ruAi.audit).length,
  Object.keys(kkAi.audit).length,
  'ru.audit and kk.audit have different number of keys',
)
console.log(`   Passed: All ${expectedAuditKeys.length} audit translations verified in ru and kk.`)

// Mock i18n
const mockI18n = {
  t: (key, opts) => {
    if (key.startsWith('ai:audit.')) {
      const subkey = key.replace('ai:audit.', '')
      let str = ruAi.audit[subkey] || subkey
      if (opts?.id !== undefined) str = str.replace('{{id}}', opts.id)
      return str
    }
    if (key === 'ai:limits.creditsUnit') return 'кредитов'
    if (key.startsWith('administration:')) {
      const subkey = key.replace('administration:', '')
      let value = subkey.split('.').reduce((item, part) => item?.[part], ruAdmin); if (typeof value !== 'string') return opts?.defaultValue ?? subkey; for (const [name, replacement] of Object.entries(opts ?? {})) value = value.replaceAll(`{{${name}}}`, String(replacement)); return value
    }
    return key
  },
}

const mockAdminText = {
  adminText: (k, opts) => {
    let str = ruAdmin[k] || k
    if (opts) {
      for (const [pk, pv] of Object.entries(opts)) {
        str = str.replace(`{{${pk}}}`, pv)
      }
    }
    return str
  },
}

const diffModule = loadModule('src/presentation/pages/organization/administrationDiff.ts', {
  '../../../shared/i18n/adminText': mockAdminText,
  '../../../shared/i18n/i18n': { i18n: mockI18n },
})
const {
  auditDifferences,
  auditFieldName,
  formatAuditMicrocredits,
  isMicrocreditsField,
} = diffModule

const helpersModule = loadModule('src/presentation/pages/organization/administrationHelpers.ts', {
  '../../../shared/i18n/adminText': mockAdminText,
  '../../../shared/i18n/i18n': { i18n: mockI18n },
  '../../../infrastructure/http/HttpError': { HttpError: class extends Error {} },
})
const { auditLabel, auditTargetLabel } = helpersModule

// 2. Testing action labels and target formatters
console.log('2. Testing audit action labels and target formatters...')
assert.equal(auditLabel('ai.budget.update'), 'Изменён ИИ-бюджет компании')
assert.equal(auditLabel('admin.ai.budget.update'), 'Изменён ИИ-бюджет компании')
assert.equal(auditLabel('ai.user_quota.update'), 'Изменена ИИ-квота сотрудника')
assert.equal(auditLabel('admin.ai.user_quota.update'), 'Изменена ИИ-квота сотрудника')
assert.equal(auditLabel('unknown.future.action'), ruAdmin.auditCatalog.generic, 'Unknown action should use the safe localized main catalog fallback')

assert.equal(auditTargetLabel('ai_budget', 'company-uuid-123'), 'Компания: company-uuid-123')
assert.equal(auditTargetLabel('ai_user_quota', '42'), 'ИИ-квота сотрудника #42')
assert.equal(auditTargetLabel('unknown_object', 'custom-id-99'), 'unknown_object · custom-id-99', 'Unknown object type should safely fallback')
console.log('   Passed: Action labels and target formatters verified.')

// 3. Testing company budget diff (ai.budget.update)
console.log('3. Testing company budget audit differences (ai.budget.update)...')
const budgetBefore = {
  weekly_budget_microcredits: '500000000',
  max_five_hour_microcredits: '50000000',
  service_weekly_quota_microcredits: '100000000',
  revision: '1',
}
const budgetAfter = {
  weekly_budget_microcredits: '600000000',
  max_five_hour_microcredits: '60000000',
  service_weekly_quota_microcredits: '100000000', // Unchanged
  revision: '2',
}

const budgetDiff = auditDifferences(budgetBefore, budgetAfter)
const budgetRowsMap = Object.fromEntries(budgetDiff.map(r => [r.field, r]))

assert.equal(budgetRowsMap['Недельный ИИ-бюджет'].before, '500 кредитов')
assert.equal(budgetRowsMap['Недельный ИИ-бюджет'].after, '600 кредитов')
assert.equal(budgetRowsMap['Недельный ИИ-бюджет'].changed, true)

assert.equal(budgetRowsMap['Максимум за 5 часов'].before, '50 кредитов')
assert.equal(budgetRowsMap['Максимум за 5 часов'].after, '60 кредитов')
assert.equal(budgetRowsMap['Максимум за 5 часов'].changed, true)

assert.equal(budgetRowsMap['Служебная квота'].before, '100 кредитов')
assert.equal(budgetRowsMap['Служебная квота'].after, '100 кредитов')
assert.equal(budgetRowsMap['Служебная квота'].changed, false)

assert.equal(budgetRowsMap['Ревизия'].before, '1')
assert.equal(budgetRowsMap['Ревизия'].after, '2')
assert.equal(budgetRowsMap['Ревизия'].changed, true)
console.log('   Passed: Company budget event diff accurately reflects changes with localized labels and units.')

// 4. Testing employee quota diff (ai.user_quota.update)
console.log('4. Testing employee personal quota audit differences (ai.user_quota.update)...')
const quotaBefore = {
  weekly_quota_microcredits: '100000000',
  five_hour_limit_microcredits: '20000000',
  revision: '5',
}
const quotaAfter = {
  weekly_quota_microcredits: '50000000',
  five_hour_limit_microcredits: '10000000',
  revision: '6',
}

const quotaDiff = auditDifferences(quotaBefore, quotaAfter)
const quotaRowsMap = Object.fromEntries(quotaDiff.map(r => [r.field, r]))

assert.equal(quotaRowsMap['Недельная ИИ-квота'].before, '100 кредитов')
assert.equal(quotaRowsMap['Недельная ИИ-квота'].after, '50 кредитов')
assert.equal(quotaRowsMap['Недельная ИИ-квота'].changed, true)

assert.equal(quotaRowsMap['Лимит на 5 часов'].before, '20 кредитов')
assert.equal(quotaRowsMap['Лимит на 5 часов'].after, '10 кредитов')
assert.equal(quotaRowsMap['Лимит на 5 часов'].changed, true)

assert.equal(quotaRowsMap['Ревизия'].before, '5')
assert.equal(quotaRowsMap['Ревизия'].after, '6')
assert.equal(quotaRowsMap['Ревизия'].changed, true)
console.log('   Passed: Employee quota event diff verified.')

// 5. Testing strict distinction: 0 vs null (unconfigured) vs undefined (missing field)
console.log('5. Testing strict distinction: 0 vs null (unconfigured) vs missing field...')
// Case A: Quota configured from null to 0
const nullToZeroBefore = { weekly_quota_microcredits: null }
const nullToZeroAfter = { weekly_quota_microcredits: '0' }
const diffNullToZero = auditDifferences(nullToZeroBefore, nullToZeroAfter)
assert.equal(diffNullToZero[0].before, 'Не настроено', 'null must be displayed as "Не настроено"')
assert.equal(diffNullToZero[0].after, '0 кредитов', '0 must be displayed as "0 кредитов", not unconfigured!')
assert.equal(diffNullToZero[0].changed, true)

// Case B: Snapshot was null (first time creation)
const initialCreationDiff = auditDifferences(null, { weekly_quota_microcredits: '100000000' })
assert.equal(initialCreationDiff[0].before, 'Отсутствовало', 'Absent initial field must be "Отсутствовало"')
assert.equal(initialCreationDiff[0].after, '100 кредитов')
assert.equal(initialCreationDiff[0].changed, true)

// Case C: Deleted setting (after is null)
const deletionDiff = auditDifferences({ weekly_quota_microcredits: '100000000' }, null)
assert.equal(deletionDiff[0].before, '100 кредитов')
assert.equal(deletionDiff[0].after, 'Отсутствует', 'Missing after field must be "Отсутствует"')
assert.equal(deletionDiff[0].changed, true)
console.log('   Passed: 0, unconfigured (null) and missing field strictly differentiated.')

// 6. Testing 64-bit microcredits precision and fractional formatting
console.log('6. Testing microcredit precision and fractional credit formatting...')
// Large 64-bit integer > Number.MAX_SAFE_INTEGER
const hugeMicrocredits = '10000000000000000' // 10 billion credits
assert.equal(formatAuditMicrocredits(hugeMicrocredits), '10000000000 кредитов')

// Fractional credits: 12.5 credits = 12,500,000 microcredits
assert.equal(formatAuditMicrocredits('12500000'), '12.5 кредитов')

// Microcredit fraction: 1 microcredit = 0.000001 credit
assert.equal(formatAuditMicrocredits('1'), '0.000001 кредитов')

// Zero microcredits
assert.equal(formatAuditMicrocredits('0'), '0 кредитов')
assert.equal(formatAuditMicrocredits(0), '0 кредитов')
console.log('   Passed: Microcredit formatting preserves full 64-bit precision without float loss.')

// 7. Testing old format events (backward compatibility)
console.log('7. Testing old format events (backward compatibility)...')
const oldFormatBefore = { weekly_budget_microcredits: '500000000' } // Missing service_weekly_quota & max_five_hour
const oldFormatAfter = {
  weekly_budget_microcredits: '500000000',
  service_weekly_quota_microcredits: '100000000',
}

const oldFormatDiff = auditDifferences(oldFormatBefore, oldFormatAfter)
const oldMap = Object.fromEntries(oldFormatDiff.map(r => [r.field, r]))

assert.equal(oldMap['Недельный ИИ-бюджет'].before, '500 кредитов')
assert.equal(oldMap['Недельный ИИ-бюджет'].after, '500 кредитов')
assert.equal(oldMap['Недельный ИИ-бюджет'].changed, false)

assert.equal(oldMap['Служебная квота'].before, 'Отсутствовало')
assert.equal(oldMap['Служебная квота'].after, '100 кредитов')
assert.equal(oldMap['Служебная квота'].changed, true)
console.log('   Passed: Old format events render safely with "Отсутствовало" for newly introduced fields.')

// 8. Testing unknown future events and sensitive data masking
console.log('8. Testing unknown events, secrets, and diagnostic data masking...')
const unknownBefore = {
  custom_model_tier: 'gpt-4o',
  provider_secret_token: 'secret-key-xyz-12345',
  diagnostic_trace_dump: 'system failure stack at line 42',
  user_prompt_text: 'internal prompt secret',
}
const unknownAfter = {
  custom_model_tier: 'gpt-4o-mini',
  provider_secret_token: 'secret-key-new-67890',
  diagnostic_trace_dump: 'system normal',
  user_prompt_text: 'new prompt',
}

const unknownDiff = auditDifferences(unknownBefore, unknownAfter)
const unknownMap = Object.fromEntries(unknownDiff.map(r => [r.field, r]))

// Safe field is displayed
assert.equal(unknownMap['custom_model_tier'].before, 'gpt-4o')
assert.equal(unknownMap['custom_model_tier'].after, 'gpt-4o-mini')
assert.equal(unknownMap['custom_model_tier'].changed, true)

// Sensitive secrets, tokens, diagnostic dumps, and prompts are masked
assert.equal(unknownMap['provider_secret_token'].before, 'Скрыто', 'Secrets must be masked')
assert.equal(unknownMap['provider_secret_token'].after, 'Скрыто', 'Secrets must be masked')

assert.equal(unknownMap['diagnostic_trace_dump'].before, 'Скрыто', 'Diagnostics must be masked')
assert.equal(unknownMap['diagnostic_trace_dump'].after, 'Скрыто', 'Diagnostics must be masked')

assert.equal(unknownMap['user_prompt_text'].before, 'Скрыто', 'Prompts must be masked')
assert.equal(unknownMap['user_prompt_text'].after, 'Скрыто', 'Prompts must be masked')

console.log('   Passed: Secrets, diagnostics and prompts are masked; unknown events do not crash.')

console.log('All 8 Task 39 audit tests passed successfully!')
