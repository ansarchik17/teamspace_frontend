import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/presentation/pages/meet/meetingActionsUtils.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } })
const { canCommitProposal, isoDateTime, localDateTime, meetingSourceURL, meetingTaskURL, possiblySimilarTaskTitles } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
test('requires source review and a current source revision before committing', () => {
  const proposal = { status: 'proposed', source_hash: 'v1' }
  const draft = { title: 'Prepare specification' }
  assert.equal(canCommitProposal(proposal, 'v1', true, draft), true)
  assert.equal(canCommitProposal(proposal, 'v2', true, draft), false)
  assert.equal(canCommitProposal(proposal, 'v1', false, draft), false)
  assert.equal(canCommitProposal({ ...proposal, status: 'created' }, 'v1', true, draft), false)
  assert.equal(canCommitProposal(proposal, 'v1', true, { title: ' ' }), false)
})
test('does not shift a manually selected local date during editing', () => {
  const value = '2027-01-15T10:30'
  assert.equal(localDateTime(isoDateTime(value)), value)
  assert.equal(isoDateTime(''), null)
  assert.equal(isoDateTime('invalid'), null)
  assert.equal(localDateTime(null), '')
})
test('source and task links encode IDs as query values and cannot change routes', () => {
  const meeting = 'id&record=other'
  const url = new URL(meetingSourceURL(meeting, -1, 'track:1&segment=other'), 'https://workspace.test')
  assert.equal(url.pathname, '/meet')
  assert.equal(url.searchParams.get('record'), meeting)
  assert.equal(url.searchParams.get('at'), '0')
  assert.equal(url.searchParams.get('segment'), 'track:1&segment=other')
  const task = new URL(meetingTaskURL('b&x=y', 't?x=z'), 'https://workspace.test')
  assert.equal(task.pathname, '/board')
  assert.equal(task.searchParams.get('boardId'), 'b&x=y')
  assert.equal(task.searchParams.get('task'), 't?x=z')
})
test('similar-title hints are conservative and do not equate unrelated work', () => {
  assert.equal(possiblySimilarTaskTitles('Подготовить спецификацию', 'подготовить   спецификацию!'), true)
  assert.equal(possiblySimilarTaskTitles('Подготовить спецификацию для клиента', 'Подготовить спецификацию'), true)
  assert.equal(possiblySimilarTaskTitles('Подготовить спецификацию', 'Отправить договор'), false)
  assert.equal(possiblySimilarTaskTitles('Отчёт', 'Отчёт за ноябрь'), false)
  assert.equal(possiblySimilarTaskTitles('', ''), false)
})
