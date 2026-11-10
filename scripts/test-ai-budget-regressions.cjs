const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

// Execute the actual handlers, retaining their business validation and await paths.
function extract(file, name, deps) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let expression
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) expression = node.initializer.getText(source)
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) expression = node.getText(source).replace(/^export\s+/, '')
    if (name === 'loadEffect' && ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect' && node.arguments[1]?.getText(source) === '[load]') {
      expression = node.arguments[0].getText(source)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(expression, name)
  const js = ts.transpileModule(`const handler = ${expression}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText
  return new Function(...Object.keys(deps), `${js}; return handler`)(...Object.values(deps))
}

const base = 'src/presentation/pages/organization/'
const validateBudgetCreditField = extract(base + 'CompanyAIBudgetModal.tsx', 'validateBudgetCreditField', {
  MAX_AIBUDGET_MICROCREDITS: 1_000_000_000_000_000n,
})
const event = { preventDefault() {} }
function context(extra) {
  let errors = {}
  let payload
  return {
    deps: {
      ...extra,
      submittingRef: { current: false }, refreshingRef: { current: false },
      setServerError() {}, setFieldErrors: value => { errors = value }, setSubmitting() {},
      setRevisionConflict() {}, t: key => key, formatMicrocredits: String,
      revision: '1', companyRevision: '1', organizationId: 'A', currentOrgRef: { current: 'A' },
      validateBudgetCreditField, onSuccess() {}, onClose() {},
      isAIRevisionConflict: () => false, isAIBudgetConflict: () => false,
      repo: {
        setAiBudget: async (_, value) => { payload = value },
        setAiUserQuota: async (_, __, value) => { payload = value },
      },
    },
    errors: () => errors, payload: () => payload,
  }
}

;(async () => {
  const quota = context({
    weeklyQuota: '30', fiveHourLimit: '20',
    employee: { user_id: 1, five_hour_limit_microcredits: '20000000' },
    currentUserRef: { current: 1 }, budget: { max_five_hour_microcredits: '15000000' },
  })
  await extract(base + 'CompanyAIEmployeeQuotaModal.tsx', 'handleSubmit', quota.deps)(event)
  assert.deepEqual(quota.errors(), {})
  assert.equal(quota.payload().weekly_quota_microcredits, '30000000')
  assert.equal(quota.payload().five_hour_limit_microcredits, '20000000')
  const increase = context({ ...quota.deps, fiveHourLimit: '31' })
  await extract(base + 'CompanyAIEmployeeQuotaModal.tsx', 'handleSubmit', increase.deps)(event)
  assert.ok(increase.errors().five_hour_limit, 'Personal H must not exceed Q; company maximum does not apply')

  const budget = context({
    weeklyBudget: '30', maxFiveHour: '100', serviceWeeklyQuota: '20',
    budget: {
      committed_microcredits: '80000000', used_microcredits: '0', reserved_microcredits: '0',
      service_weekly_quota_microcredits: '80000000',
      service: { used_microcredits: '0', reserved_microcredits: '0' },
    },
  })
  await extract(base + 'CompanyAIBudgetModal.tsx', 'handleSubmit', budget.deps)(event)
  assert.deepEqual(budget.errors(), {})
  assert.equal(budget.payload().weekly_budget_microcredits, '30000000')
  assert.equal(budget.payload().service_weekly_quota_microcredits, '0', 'Removed service allocation cannot be submitted')
  const held = context({ ...budget.deps, budget: {
    ...budget.deps.budget,
    reserved_microcredits: '40000000',
    service: { used_microcredits: '0', reserved_microcredits: '40000000' },
  } })
  await extract(base + 'CompanyAIBudgetModal.tsx', 'handleSubmit', held.deps)(event)
  assert.ok(held.errors().weekly_budget, 'A service decrease cannot release an active hold')

  const pending = []
  let displayed = null
  const ref = { current: null }
  const org = { current: 'A' }
  const load = extract(base + 'CompanyAIBudgetSection.tsx', 'load', {
    useCallback: fn => fn, activeLoadRef: ref, currentOrgRef: org, organizationId: 'A',
    repo: { aiBudget: (_, signal) => new Promise(resolve => pending.push({ resolve, signal })) },
    t: key => key, setLoading() {}, setError() {}, setBudget: value => { displayed = value },
  })
  const first = load()
  const latest = load()
  assert.equal(pending[0].signal.aborted, true)
  pending[1].resolve({ revision: '2' })
  await latest
  pending[0].resolve({ revision: '1' })
  await first
  assert.equal(displayed.revision, '2', 'An aborted A request must not overwrite fresh A data')
  const effect = extract(base + 'CompanyAIBudgetSection.tsx', 'loadEffect', { load, activeLoadRef: ref })
  const cleanup = effect()
  cleanup()
  assert.equal(pending[2].signal.aborted, true, 'Effect cleanup must abort before the read finishes')
  pending[2].resolve({ revision: 'obsolete' })
  for (let i = 0; i < 10; i++) await Promise.resolve()
  assert.equal(displayed.revision, '2')
  console.log('Actual AI admin handlers: quota decrease, recalculated commitments, active holds and stale reads passed')
})().catch(error => { console.error(error); process.exitCode = 1 })
