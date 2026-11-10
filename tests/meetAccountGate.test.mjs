import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import ts from 'typescript'

function load(file, dependencies = {}) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', outputText)(name => {
    assert.ok(name in dependencies, `Unexpected import: ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return module.exports
}
const { HttpError } = load('../src/infrastructure/http/HttpError.ts')
const catalogs = Object.fromEntries(['ru', 'kk'].map(locale => [locale, JSON.parse(readFileSync(new URL(`../src/shared/i18n/locales/${locale}/shell.json`, import.meta.url), 'utf8'))]))
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)]
const flush = () => new Promise(resolve => setImmediate(resolve))
function harness(api, locale = 'ru') {
  const values = [], effects = [], dependencies = []
  let index = 0
  const jsx = (type, props) => ({ type, props })
  const { default: Gate } = load('../src/presentation/pages/meet/MeetAccountGate.tsx', {
    react: {
      useState(initial) { const id = index++; if (!(id in values)) values[id] = initial; return [values[id], next => { values[id] = typeof next === 'function' ? next(values[id]) : next }] },
      useEffect(effect, deps) { const id = index++; if (!dependencies[id] || deps.some((value, i) => value !== dependencies[id][i])) { dependencies[id] = deps; effects.push(effect) } },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'react-i18next': { useTranslation: () => ({ t: key => key.split('.').reduce((obj, part) => obj?.[part], catalogs[locale]) ?? key }) },
    'lucide-react': { ShieldCheck: 'shield', Video: 'video' },
    '../../../infrastructure/meet/meetApi': { meetApi: api },
    '../../../infrastructure/http/HttpError': { HttpError },
    './meetUtils': { meetErrorMessage: error => error.message },
    './MeetSkeleton': { default: 'skeleton' },
  })
  return { render() { index = 0; const tree = Gate({ children: 'MEETING CONTENT' }); effects.splice(0).forEach(effect => effect()); return tree } }
}

test('existing local account shows a migration form without a false error, in both languages', async () => {
  for (const locale of ['ru', 'kk']) {
    const gate = harness({ me: async () => { throw new HttpError('Данные изменились', 409, 'meet_account_link_required') } }, locale)
    gate.render(); await flush()
    const tree = gate.render()
    assert.equal(nodes(tree).filter(n => n.type === 'form').length, 1)
    assert.equal(nodes(tree).filter(n => n.props?.role === 'alert').length, 0)
    assert.ok(nodes(tree).some(n => n.props?.children === catalogs[locale].meet.accountLink.description))
  }
})

test('SSO mismatch and service failures never ask for a separate password or expose meeting content', async () => {
  for (const code of ['meet_account_sso_link_required', 'meet_unavailable', 'meet_account_unavailable']) {
    const gate = harness({ me: async () => { throw new HttpError('Specific actionable message', 409, code) } })
    gate.render(); await flush(); const tree = gate.render()
    assert.equal(nodes(tree).filter(n => n.type === 'form').length, 0)
    assert.equal(nodes(tree).find(n => n.props?.role === 'alert').props.children, 'Specific actionable message')
    assert.notEqual(tree, 'MEETING CONTENT')
  }
})

test('bad credentials clear the password; successful linking rechecks the actual Meet identity', async () => {
  let linked = false, requests = 0, attempts = 0
  const gate = harness({
    me: async () => { requests++; if (!linked) throw new HttpError('Link required', 409, 'meet_account_link_required'); return { id: 'original-account' } },
    link: async (email, password) => { assert.equal(email, 'person@example.test'); attempts++; if (attempts === 1) { assert.equal(password, 'wrong'); throw new HttpError('Неверный email или пароль Meet', 422, 'meet_invalid_credentials') } assert.equal(password, 'correct'); linked = true },
  })
  gate.render(); await flush()
  let tree = gate.render()
  nodes(tree).find(n => n.props?.type === 'email').props.onChange({ target: { value: 'person@example.test' } })
  nodes(tree).find(n => n.props?.type === 'password').props.onChange({ target: { value: 'wrong' } })
  tree = gate.render()
  nodes(tree).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); await flush()
  tree = gate.render()
  assert.equal(nodes(tree).find(n => n.props?.type === 'password').props.value, '')
  assert.match(nodes(tree).find(n => n.props?.role === 'alert').props.children, /Неверный email/)
  nodes(tree).find(n => n.props?.type === 'password').props.onChange({ target: { value: 'correct' } })
  tree = gate.render(); nodes(tree).find(n => n.type === 'form').props.onSubmit({ preventDefault() {} }); await flush()
  assert.notEqual(gate.render(), 'MEETING CONTENT'); await flush()
  assert.equal(gate.render(), 'MEETING CONTENT')
  assert.equal(requests, 2)
})
