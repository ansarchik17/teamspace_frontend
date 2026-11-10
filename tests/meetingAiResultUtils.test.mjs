import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/presentation/pages/notes/meetingAiResultUtils.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } })
const { normalizeMeetingJobResult } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)

test('keeps all structured result sections for saving', () => {
  const result = normalizeMeetingJobResult({ transcription: { text: 'Transcript' }, summary: {
    short_summary: 'Short', detailed_summary: 'Detailed', topics: ['Topic'], decisions: ['Decision'],
    action_items: [{ task: 'Task', owner: 'Owner', deadline: 'Friday' }], open_questions: ['Question'], risks: ['Risk'],
  } })
  assert.equal(result.transcriptText, 'Transcript')
  assert.equal(result.summaryText, 'Short\n\nDetailed')
  assert.deepEqual(result.decisions, ['Decision'])
  assert.deepEqual(result.topics, ['Topic'])
  assert.deepEqual(result.openQuestions, ['Question'])
  assert.deepEqual(result.risks, ['Risk'])
  assert.equal(result.actionItems[0].task, 'Task')
})

test('a result with only decisions, questions or risks is not discarded', () => {
  for (const key of ['decisions', 'open_questions', 'risks']) assert.ok(normalizeMeetingJobResult({ summary: { [key]: ['Result'] } }))
  assert.equal(normalizeMeetingJobResult({}), null)
})

test('legacy flat results still normalize', () => {
  const result = normalizeMeetingJobResult({ transcript: 'Text', summary: 'Summary', action_items: ['Task'] })
  assert.equal(result.transcriptText, 'Text')
  assert.equal(result.summaryText, 'Summary')
  assert.deepEqual(result.actionItems, ['Task'])
  assert.deepEqual(result.decisions, [])
})
