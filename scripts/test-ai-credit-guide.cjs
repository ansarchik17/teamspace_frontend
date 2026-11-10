const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

function load(file, dependencies) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const item = { exports: {} }
  new Function('require', 'module', 'exports', code)(name => {
    if (name in dependencies) return dependencies[name]
    throw new Error(`Unexpected import ${name}`)
  }, item, item.exports)
  return item.exports
}

const limits = load('src/domain/entities/UserAILimits.ts', {})
const benchmark = require('../tests/fixtures/ai-credit-benchmark-20261020.json')
const sampleCosts = scenario => benchmark[scenario].map(sample => sample.reduce(
  (sum, [input, output]) => sum + BigInt(input) * 1000n + BigInt(output) * 3000n, 0n,
))
assert.deepEqual(sampleCosts('short_chat'), [869000n, 905000n, 800000n])
assert.deepEqual(sampleCosts('long_dialogue'), [12824000n, 12484000n, 13008000n])
assert.deepEqual(sampleCosts('document_text'), [7905000n, 7950000n, 7929000n])
assert.equal(['short_chat', 'long_dialogue', 'document_text'].flatMap(sampleCosts).reduce((a, b) => a + b), BigInt(benchmark.total_microcredits))

for (const language of ['ru', 'kk']) {
  const dictionary = JSON.parse(fs.readFileSync(path.join(__dirname, `../src/shared/i18n/locales/${language}/ai.json`), 'utf8'))
  const i18n = { useTranslation: () => ({ t(key, options = {}) {
    const value = key.split('.').reduce((item, part) => item?.[part], dictionary)
    assert.equal(typeof value, 'string', `Missing ${language}:${key}`)
    return value.replace(/{{(\w+)}}/g, (_, name) => String(options[name]))
  } }) }
  const base = { react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-i18next': i18n }
  const { AICreditGuide } = load('src/presentation/pages/organization/AICreditGuide.tsx', base)
  const html = renderToStaticMarkup(React.createElement(AICreditGuide))
  assert.ok(html.startsWith('<details '), 'Help stays collapsed until requested')
  assert.ok(!html.includes(' open='))
  assert.ok(!html.includes('<table'), 'Keep quota guidance short without the rate table')
  assert.equal((html.match(/<p(?:\s|>)/g) || []).length, 2)
  for (const key of ['variability', 'chooseLimit']) assert.ok(html.includes(dictionary.creditGuide[key]))
  assert.ok(Object.values(dictionary.creditGuide).join(' ').length < 650, 'Keep help concise in both languages')
  assert.ok(html.includes('GPT-OSS-120B'), 'Explain the token weights for the deployed default model')
  for (const value of ['20 000', '100 000']) assert.ok(dictionary.creditGuide.chooseLimit.includes(value))
  assert.ok(dictionary.creditGuide.variability.includes('0,528'), 'Show that the supplied token example is not a fixed per-message price')
  assert.ok(!html.includes('{{'))

  const { AIBudgetMeter } = load('src/presentation/pages/organization/CompanyAIBudgetSection.tsx', {
    ...base,
    'lucide-react': {},
    '../../../domain/entities/UserAILimits': limits,
    './administrationUi': {},
    '../../../shared/ui/AppButton': {},
    './CompanyAIBudgetModal': {},
    './CompanyAIUsersTable': {},
    './CompanyAIEmployeeQuotaModal': {},
    './AICreditGuide': { AICreditGuide },
    '../../../shared/ui/axisTokens': { AXIS_UI: {} },
    './aiBudgetFormat': { credits: value => String(value) },
    './aiBudgetUi': { Meter: () => null },
  })
  const meter = renderToStaticMarkup(React.createElement(AIBudgetMeter, {
    label: dictionary.admin.budgetTitle,
    usedMicrocredits: '60000000', reservedMicrocredits: '1500000',
    totalMicrocredits: '100000000', availableMicrocredits: '38500000', remainingPercent: 38.5, icon: null,
  }))
  assert.ok(meter.includes(`<strong>${limits.formatMicrocredits('38500000')}</strong>`), 'Display the server remainder, without recalculating away holds')
  assert.ok(!meter.includes(dictionary.admin.reserved))
  assert.ok(!meter.includes(dictionary.admin.carriedReserved))
  assert.ok(!meter.includes(`<strong>${limits.formatMicrocredits('1500000')}</strong>`), 'Do not display the held amount')
  assert.ok(meter.includes('width:61%'), 'Internal holds still affect budget availability')
}
console.log('PASS: ru/kk credit guidance and hidden reservations with unchanged server availability')
