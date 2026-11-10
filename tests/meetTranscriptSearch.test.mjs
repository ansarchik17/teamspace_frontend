import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/presentation/pages/meet/meetTranscriptSearch.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } })
const { transcriptMatches } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)

test('matches Cyrillic and Kazakh without changing original offsets or casing', () => {
  const text = 'Текст. мәтін. ТЕКСТ. МӘТІН.'
  assert.deepEqual(transcriptMatches(text, 'мәтін').map(({ start, end }) => text.slice(start, end)), ['мәтін', 'МӘТІН'])
  assert.deepEqual(transcriptMatches(text, 'текст'), [{ start: 0, end: 5 }, { start: 14, end: 19 }])
})
test('treats regular expression syntax and markup as literal speech', () => {
  for (const query of ['[a]+', '.*', '(x)', '<script>', '\\']) {
    const text = `До ${query} после ${query}`
    const matches = transcriptMatches(text, query)
    assert.equal(matches.length, 2)
    assert.ok(matches.every(({ start, end }) => text.slice(start, end) === query))
  }
})
test('ignores surrounding search whitespace and yields no empty matches', () => {
  assert.deepEqual(transcriptMatches('текст', '   '), [])
  assert.deepEqual(transcriptMatches('текст', ' текст '), [{ start: 0, end: 5 }])
  assert.deepEqual(transcriptMatches('текст', 'запись'), [])
})
