const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load(file, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
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

const { HttpError } = load('src/infrastructure/http/HttpError.ts')
const { classifyAICallError } = load('src/domain/entities/AICallError.ts', {
  '../../infrastructure/http/HttpError': { HttpError },
})

const ruAi = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/shared/i18n/locales/ru/ai.json'), 'utf8'))
const kkAi = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/shared/i18n/locales/kk/ai.json'), 'utf8'))

const tRu = (key) => {
  const [ns, sub] = key.split('.')
  if (ns === 'reasons' && ruAi.reasons[sub]) return ruAi.reasons[sub]
  if (ns === 'errors' && ruAi.errors[sub]) return ruAi.errors[sub]
  if (ns === 'limits' && ruAi.limits[sub]) return ruAi.limits[sub]
  return key
}

const tKk = (key) => {
  const [ns, sub] = key.split('.')
  if (ns === 'reasons' && kkAi.reasons[sub]) return kkAi.reasons[sub]
  if (ns === 'errors' && kkAi.errors[sub]) return kkAi.errors[sub]
  if (ns === 'limits' && kkAi.limits[sub]) return kkAi.limits[sub]
  return key
}

console.log('=== Task 32 Verification Test Suite ===\n')

// 1. Test scenario: Quota exhaustion after page load (pre-call rejection)
console.log('1. Testing quota exhausted after page load (FIVE_HOUR_EXHAUSTED & USER_WEEKLY_EXHAUSTED)...')
const fiveHourExhaustedError = new HttpError(
  'Исчерпан 5-часовой лимит ИИ-кредитов.',
  429,
  'AI_QUOTA_EXCEEDED',
  {
    blockers: [
      { reason: 'FIVE_HOUR_EXHAUSTED', scope: 'five_hour', enforced: true, resets_at: '2026-10-19T18:00:00Z' },
    ],
    retry_kind: 'estimated',
    retry_at: '2026-10-19T18:00:00Z',
    server_time: '2026-10-19T14:30:00Z',
  },
)

const classified5h = classifyAICallError(fiveHourExhaustedError, tRu)
assert.equal(classified5h.kind, 'pre_call_rejection')
assert.equal(classified5h.preservesDraft, true, 'Must preserve draft text and attachments')
assert.equal(classified5h.canAutoRetry, false, 'Must never auto-retry paid generation')
assert.equal(classified5h.retryAt, '2026-10-19T18:00:00Z')
assert.equal(classified5h.reason, 'FIVE_HOUR_EXHAUSTED')
assert.equal(classified5h.userMessage, 'Пятичасовой лимит исчерпан')

const classified5hKk = classifyAICallError(fiveHourExhaustedError, tKk)
assert.equal(classified5hKk.userMessage, 'Бес сағаттық лимит таусылды')

// Weekly exhaustion
const weeklyExhaustedError = new HttpError(
  'Недельная квота исчерпана.',
  429,
  'AI_QUOTA_EXCEEDED',
  {
    blockers: [
      { reason: 'USER_WEEKLY_EXHAUSTED', scope: 'weekly', enforced: true, resets_at: '2026-10-26T00:00:00Z' },
    ],
    retry_kind: 'estimated',
    retry_at: '2026-10-26T00:00:00Z',
  },
)
const classifiedWeekly = classifyAICallError(weeklyExhaustedError, tRu)
assert.equal(classifiedWeekly.kind, 'pre_call_rejection')
assert.equal(classifiedWeekly.preservesDraft, true)
assert.equal(classifiedWeekly.reason, 'USER_WEEKLY_EXHAUSTED')
assert.equal(classifiedWeekly.userMessage, 'Недельная квота исчерпана')
console.log('   Pre-call quota exhaustion correctly handled with draft preservation!')

// A positive balance that cannot fit this request is not an exhausted period.
for (const [scope, key] of [
  ['five_hour', 'insufficientFiveHour'],
  ['weekly', 'insufficientWeekly'],
  ['company', 'insufficientCompany'],
]) {
  const error = new HttpError('Not enough capacity for this request', 429, 'AI_QUOTA_EXCEEDED', {
    blockers: [{ reason: 'RESERVATION_TOO_LARGE', scope, enforced: true, resets_at: null }],
    retry_kind: 'requires_action', retry_at: null,
  })
  for (const [translate, locale] of [[tRu, ruAi], [tKk, kkAi]]) {
    const classified = classifyAICallError(error, translate)
    assert.equal(classified.userMessage, locale.errors[key])
    assert.equal(classified.reason, 'RESERVATION_TOO_LARGE')
    assert.equal(classified.scope, scope)
    assert.equal(classified.retryAt, null, 'Must not promise access restoration at a reset')
    assert.equal(classified.preservesDraft, true)
    assert.equal(classified.canAutoRetry, false)
  }
}
assert.ok(ruAi.limits.requestSizeHint)
assert.ok(kkAi.limits.requestSizeHint)
assert.equal(ruAi.limits.retryUnknown, 'Время восстановления пока неизвестно')
assert.ok(kkAi.limits.retryUnknown)
assert.ok(!ruAi.limits.retryUnknown.includes('активных генераций'), 'An unknown outcome must not claim that generation is running')

// 2. Test company budget exhaustion (requires action, no retry_at)
console.log('2. Testing company budget exhaustion (COMPANY_WEEKLY_EXHAUSTED)...')
const companyExhaustedError = new HttpError(
  'Бюджет компании исчерпан.',
  429,
  'AI_QUOTA_EXCEEDED',
  {
    blockers: [
      { reason: 'COMPANY_WEEKLY_EXHAUSTED', scope: 'company', enforced: true, resets_at: null },
    ],
    retry_kind: 'requires_action',
    retry_at: null,
  },
)
const classifiedCompany = classifyAICallError(companyExhaustedError, tRu)
assert.equal(classifiedCompany.kind, 'pre_call_rejection')
assert.equal(classifiedCompany.preservesDraft, true)
assert.equal(classifiedCompany.retryAt, null)
assert.equal(classifiedCompany.retryKind, 'requires_action')
assert.equal(classifiedCompany.userMessage, 'Недельный бюджет компании исчерпан')
console.log('   Company budget exhaustion handled without leaking internal balances!')

// 3. Test Rate Limiting and Concurrency Limits
console.log('3. Testing AI_RATE_LIMIT and AI_CONCURRENCY_LIMIT...')
const rateLimitError = new HttpError('Rate limit exceeded', 429, 'AI_RATE_LIMIT')
const classifiedRate = classifyAICallError(rateLimitError, tRu)
assert.equal(classifiedRate.kind, 'pre_call_rejection')
assert.equal(classifiedRate.preservesDraft, true)
assert.equal(classifiedRate.canAutoRetry, false)
assert.equal(classifiedRate.userMessage, 'Слишком много запросов к ИИ. Пожалуйста, подождите немного перед следующей отправкой.')

const concurrencyLimitError = new HttpError('Concurrency limit', 429, 'AI_CONCURRENCY_LIMIT')
const classifiedConcurrency = classifyAICallError(concurrencyLimitError, tRu)
assert.equal(classifiedConcurrency.kind, 'pre_call_rejection')
assert.equal(classifiedConcurrency.preservesDraft, true)
assert.equal(classifiedConcurrency.userMessage, ruAi.errors.concurrencyLimit)

for (const [translate, locale] of [[tRu, ruAi], [tKk, kkAi]]) {
  const unconfirmed = classifyAICallError(new HttpError('Pending confirmation', 429, 'AI_QUOTA_EXCEEDED', {
    blockers: [{ reason: 'RESERVATION_PENDING', scope: 'account', enforced: true, resets_at: null }],
    retry_kind: 'unknown', retry_at: null,
  }), translate)
  assert.equal(unconfirmed.userMessage, locale.errors.generationPending)
  assert.equal(unconfirmed.preservesDraft, true)
  assert.equal(unconfirmed.canAutoRetry, false)
  assert.equal(unconfirmed.retryKind, 'unknown')
  assert.equal(unconfirmed.retryAt, null)
}
console.log('   Rate and concurrency limits classified as pre-call rejections!')

// 4. Test Access Disabled and Suspension
console.log('4. Testing AI_ACCESS_DISABLED (NO_ORGANIZATION, COMPANY_SUSPENDED, AI_ACCESS_DENIED)...')
const suspendedError = new HttpError('Company suspended', 403, 'AI_ACCESS_DISABLED', {
  reason: 'COMPANY_SUSPENDED',
  scope: 'company',
})
const classifiedSuspended = classifyAICallError(suspendedError, tRu)
assert.equal(classifiedSuspended.kind, 'pre_call_rejection')
assert.equal(classifiedSuspended.preservesDraft, true)
assert.equal(classifiedSuspended.userMessage, 'Организация приостановлена')

const noOrgError = new HttpError('No organization', 403, 'AI_ACCESS_DISABLED', {
  reason: 'NO_ORGANIZATION',
  scope: 'account',
})
const classifiedNoOrg = classifyAICallError(noOrgError, tRu)
assert.equal(classifiedNoOrg.userMessage, 'Необходимо состоять в организации')
console.log('   Access disabled reasons correctly mapped to user messages!')

// 5. Test Operation Conflict (409 AI_RESERVATION_CONFLICT)
console.log('5. Testing AI_RESERVATION_CONFLICT (double submission rejection)...')
const conflictError = new HttpError('Operation conflict', 409, 'AI_RESERVATION_CONFLICT')
const classifiedConflict = classifyAICallError(conflictError, tRu)
assert.equal(classifiedConflict.kind, 'pre_call_rejection')
assert.equal(classifiedConflict.preservesDraft, true)
assert.equal(classifiedConflict.canAutoRetry, false, 'Must prevent automatic duplicate resubmission')
assert.equal(classifiedConflict.userMessage, 'Операция уже обрабатывается. Повторный запуск отклонён.')
console.log('   Conflict correctly halts retry!')

// 6. Test Timeout / Deadline Exceeded (Unknown Outcome)
console.log('6. Testing timeout & unknown outcome (HTTP 504 / DeadlineExceeded)...')
const timeout504 = new HttpError('Gateway Timeout', 504, 'INTERNAL_ERROR')
const classified504 = classifyAICallError(timeout504, tRu)
assert.equal(classified504.kind, 'unknown_outcome')
assert.equal(classified504.preservesDraft, false, 'Message was dispatched; user message stays in history')
assert.equal(classified504.canAutoRetry, false, 'CRITICAL: Never auto-retry paid generation after timeout')
assert.equal(classified504.userMessage, 'Ответ не был получен вовремя. Проверьте результат позже или обновите историю чата.')

const deadlineError = new Error('context deadline exceeded')
const classifiedDeadline = classifyAICallError(deadlineError, tRu)
assert.equal(classifiedDeadline.kind, 'unknown_outcome')
assert.equal(classifiedDeadline.canAutoRetry, false)
console.log('   Timeout and unknown outcomes verified with strict no-auto-retry guarantee!')

// 7. Test Upstream Provider Failure (HTTP 502 / 503 INTERNAL_ERROR)
console.log('7. Testing upstream provider errors (HTTP 502 Bad Gateway)...')
const providerError502 = new HttpError('Bad Gateway', 502, 'INTERNAL_ERROR')
const classified502 = classifyAICallError(providerError502, tRu)
assert.equal(classified502.kind, 'provider_error')
assert.equal(classified502.preservesDraft, false)
assert.equal(classified502.canAutoRetry, false)
assert.equal(classified502.userMessage, 'Не получилось получить ответ от ИИ. Попробуйте ещё раз.')
console.log('   Provider errors correctly differentiated from pre-call rejections!')

// 8. Test Client-side unauthenticated / session error
console.log('8. Testing client-side errors (no token / unauthenticated)...')
const clientError = new Error('Сначала выполните вход')
const classifiedClient = classifyAICallError(clientError, tRu)
assert.equal(classifiedClient.kind, 'client_error')
assert.equal(classifiedClient.preservesDraft, true)
console.log('   Client-side errors preserve input draft!')

// 9. Test Double-click Protection Logic (State machine emulation)
console.log('9. Emulating double-click & race condition protection...')
let isSending = false
let isTyping = false
let sendCallCount = 0

async function mockSendMessage(rejectWith) {
  if (isSending || isTyping) {
    // Second click blocked synchronously!
    return 'BLOCKED'
  }
  isSending = true
  isTyping = true
  sendCallCount += 1

  try {
    // Simulate network flight time
    await new Promise(resolve => setTimeout(resolve, 20))
    if (rejectWith) {
      throw rejectWith
    }
    return 'SUCCESS'
  } finally {
    isSending = false
    isTyping = false
  }
}

;(async () => {
  // First click starts sending with error rejection
  const p1 = mockSendMessage(fiveHourExhaustedError).catch(e => e)
  // Rapid second click during flight
  const p2 = mockSendMessage()
  assert.equal(sendCallCount, 1, 'Only first click is permitted to start network call')

  const [err1, r2] = await Promise.all([p1, p2])
  const classified1 = classifyAICallError(err1, tRu)
  assert.equal(classified1.kind, 'pre_call_rejection')
  assert.equal(r2, 'BLOCKED', 'Second concurrent click was rejected without invoking server')
  console.log('   Double-click race condition blocked synchronously by isSending guard!')

  console.log('\nAll Task 32 verification tests passed successfully!')
})()

assert.equal(classifyAICallError(new TypeError('Failed to fetch'), tRu).kind, 'unknown_outcome')
assert.equal(classifyAICallError(new TypeError('Failed to fetch'), tRu).preservesDraft, false)
assert.equal(classifyAICallError(new HttpError('pending', 429, 'AI_QUOTA_EXCEEDED', {
  retry_at: null, retry_kind: 'unknown', blockers: [{ resets_at: '2026-10-20T00:00:00Z' }],
}), tRu).retryAt, null)

// A financial hold is not evidence of a generation still running.
for (const [translate, locale] of [[tRu, ruAi], [tKk, kkAi]]) {
 const error = new HttpError('Financial reservation', 429, 'AI_QUOTA_EXCEEDED', {
  blockers: [{reason: 'RESERVATION_PENDING', scope: 'five_hour', enforced: true, resets_at: null}],
  retry_kind: 'unknown', retry_at: null,
 })
 const classified = classifyAICallError(error, translate)
 assert.equal(classified.userMessage, locale.reasons.RESERVATION_PENDING)
 assert.equal(classified.preservesDraft, true)
 assert.equal(classified.canAutoRetry, false)
 assert.notEqual(classified.userMessage, locale.errors.generationPending)
}
assert.ok(ruAi.reasons.RESERVATION_PENDING.includes('Свободного остатка недостаточно'))
assert.ok(!ruAi.reasons.RESERVATION_PENDING.includes('незавершённый'))
