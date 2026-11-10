import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const source = readFileSync(new URL('../src/presentation/pages/alemdrive/drive-src/components/RenameModal.jsx', import.meta.url), 'utf8')
const parsed = ts.createSourceFile('RenameModal.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX)
let submitSource
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === 'handleSubmit') {
    submitSource = node.initializer.getText(parsed)
  }
  ts.forEachChild(node, visit)
}
visit(parsed)
assert.ok(submitSource, 'RenameModal submit handler must exist')

function submit(baseName, extension = '.txt') {
  const result = { names: [], errors: [], closed: false, prevented: false }
  const handler = new Function('baseName', 'extension', 'onConfirm', 'onClose', 'setValidationError', `return (${submitSource})`)(
    baseName, extension,
    name => result.names.push(name),
    () => { result.closed = true },
    error => result.errors.push(error),
  )
  handler({ preventDefault() { result.prevented = true } })
  assert.equal(result.prevented, true)
  return result
}

test('rename accepts Latin, Russian and Kazakh names and preserves the extension', () => {
  for (const name of ['QA-20261022-renamed', 'QA Проверка', 'report_01', 'Отпуск 2026', 'Құжат Ә Ғ Ң Ө Ұ Ү Һ І']) {
    const result = submit(name)
    assert.deepEqual(result.names, [name + '.txt'], name)
    assert.deepEqual(result.errors, [], name)
    assert.equal(result.closed, true, name)
  }
})

test('rename supports folders and trims surrounding spaces', () => {
  assert.deepEqual(submit('  QA Проверка  ', '').names, ['QA Проверка'])
})

test('rename rejects path separators and every U+0000 through U+001F control character', () => {
  for (const character of ['/', '\\', ...Array.from({ length: 32 }, (_, code) => String.fromCharCode(code))]) {
    const result = submit(`QA${character}name`)
    assert.deepEqual(result.names, [], JSON.stringify(character))
    assert.equal(result.errors.length, 1, JSON.stringify(character))
    assert.equal(result.closed, false, JSON.stringify(character))
  }
})

test('rename does not submit an empty name', () => {
  for (const name of ['', '   ']) {
    const result = submit(name)
    assert.deepEqual(result.names, [])
    assert.equal(result.closed, false)
  }
})
