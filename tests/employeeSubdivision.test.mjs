import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/presentation/pages/alem-contact/employeeSubdivision.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } })
const { employeeSubdivisionIssue } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
const firstScope = JSON.stringify(['company-a', false, 0])
const choices = { scope: firstScope, items: [{ id: 'team-a' }] }

test('an employee may be unassigned but a selected subdivision must belong to the loaded list', () => {
  assert.equal(employeeSubdivisionIssue(firstScope, choices, ''), null)
  assert.equal(employeeSubdivisionIssue(firstScope, choices, 'foreign-team'), 'unavailable')
  assert.equal(employeeSubdivisionIssue(firstScope, choices, 'team-a'), null)
})

test('loading or failed lists block only a selected subdivision, not unassigned employees', () => {
  assert.equal(employeeSubdivisionIssue(firstScope, null, 'team-a'), 'loading')
  assert.equal(employeeSubdivisionIssue(firstScope, { ...choices, failed: true }, 'team-a'), 'loadFailed')
  for (const state of [null, { ...choices, failed: true }, { scope: firstScope, items: [] }]) {
    assert.equal(employeeSubdivisionIssue(firstScope, state, ''), null)
  }
  assert.equal(employeeSubdivisionIssue(firstScope, { scope: firstScope, items: [] }, 'deleted-team'), 'unavailable')
})

test('old company or retry responses cannot validate the current selection', () => {
  for (const scope of [JSON.stringify(['company-b', false, 0]), JSON.stringify(['company-a', true, 0]), JSON.stringify(['company-a', false, 1])]) {
    assert.equal(employeeSubdivisionIssue(scope, choices, 'team-a'), 'loading')
    assert.equal(employeeSubdivisionIssue(scope, { scope, items: [{ id: 'team-b' }] }, 'team-a'), 'unavailable')
    assert.equal(employeeSubdivisionIssue(scope, { scope, items: [{ id: 'team-b' }] }, 'team-b'), null)
    assert.equal(employeeSubdivisionIssue(scope, choices, ''), null)
  }
})

test('read-only employee editing does not require choosing a new subdivision', () => {
  assert.equal(employeeSubdivisionIssue('', null, ''), null)
  assert.equal(employeeSubdivisionIssue('', choices, 'team-a'), null)
})
