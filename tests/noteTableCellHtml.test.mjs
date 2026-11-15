import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('../src/presentation/pages/notes/noteTableCellHtml.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { noteTableCellHtml } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)

test('restores the formatting returned by the notes API', () => {
  const html = '<b>Bold</b> <i>Italic</i> <s>Old</s><br><span style="color: #2458d3">Color</span>'
  assert.equal(noteTableCellHtml({ text: 'Bold Italic Old\nColor', html }), html)
})

test('literal encoded markup is never decoded into executable elements', () => {
  const html = '&lt;img src=x onerror=alert(1)&gt; &amp; &lt;b&gt;text&lt;/b&gt;'
  assert.equal(noteTableCellHtml({ text: '<img src=x onerror=alert(1)> & <b>text</b>', html }), html)
  assert.equal(noteTableCellHtml({ text: '<img src=x onerror=alert(1)> & <b>text</b>' }), html)
})

test('legacy and cleared cells keep plain text, line breaks and empty values', () => {
  assert.equal(noteTableCellHtml({ text: 'First & second\n<literal>' }), 'First &amp; second<br/>&lt;literal&gt;')
  assert.equal(noteTableCellHtml({ text: 'Legacy', html: '' }), 'Legacy')
  assert.equal(noteTableCellHtml({ text: '', html: '' }), '')
  assert.equal(noteTableCellHtml(null), '')
})
