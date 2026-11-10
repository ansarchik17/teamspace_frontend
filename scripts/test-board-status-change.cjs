const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../src/presentation/controllers/BoardController.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const moduleValue = { exports: {} }
new Function('require', 'module', 'exports', compiled)(() => ({}), moduleValue, moduleValue.exports)
const { BoardController } = moduleValue.exports
const statusModule = { exports: {} }
const statusSource = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/shared/utils/boardStatus.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
new Function('module', 'exports', statusSource)(statusModule, statusModule.exports)
const { normalizeBoardStatus } = statusModule.exports
// These are the actual task status values returned by the Kanban backend.
for (const [serverStatus, expected] of [['К ВЫПОЛНЕНИЮ', 'TODO'], ['В РАБОТЕ', 'IN_PROGRESS'], ['В ПРОЦЕССЕ ПРОВЕРКИ', 'TEST'], ['ГОТОВО', 'DONE']]) {
  assert.equal(normalizeBoardStatus(serverStatus), expected, 'reopened tasks must preserve the server status')
  assert.equal(normalizeBoardStatus(expected), expected)
}
assert.equal(normalizeBoardStatus('custom-stage'), 'CUSTOM_STAGE', 'custom columns must not silently become TODO')

;(async () => {
  const calls = []
  let failure = null
  const record = async (...args) => { calls.push(args); if (failure) throw failure }
  const controller = new BoardController({}, {}, {}, { moveTask: (...args) => record('move', ...args) }, {}, {}, { updateTaskStatus: (...args) => record('status', ...args) })
  controller.invalidateBoard = board => calls.push(['invalidate', board])
  await controller.updateTaskStatus('board', 'task', 'DONE', 'done-column-2')
  assert.deepEqual(calls, [['move', 'task', 'done-column-2'], ['invalidate', 'board']], 'an explicit column uses one atomic server operation, even with repeated status keys')
  calls.length = 0
  await controller.updateTaskStatus('board', 'task', 'TEST')
  assert.deepEqual(calls, [['status', 'task', 'TEST'], ['invalidate', 'board']])
  for (const column of ['done-column-2', undefined]) {
    calls.length = 0
    failure = new Error('write rejected')
    await assert.rejects(controller.updateTaskStatus('board', 'task', 'DONE', column), failure)
    assert.equal(calls.length, 1, 'failed writes must not trigger a second mutation')
  }
  console.log('Board status: atomic column move, status-only update, duplicate status keys and write failures passed')
})().catch(error => { console.error(error); process.exitCode = 1 })
