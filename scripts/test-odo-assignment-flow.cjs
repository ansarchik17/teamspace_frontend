const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
function load(file, dependencies = {}) {
  const code = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(name => {
    if (name === 'react/jsx-runtime') return require(name)
    assert.ok(dependencies[name], `Unexpected import: ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return module.exports
}
const policy = load('src/application/use-cases/assignments/assignmentPolicy.ts')
const { HttpError } = load('src/infrastructure/http/HttpError.ts')
const source = read('src/presentation/pages/assignments/useAssignments.ts')
const ast = ts.createSourceFile('useAssignments.ts', source, ts.ScriptTarget.Latest, true)
const handlers = {}
function visit(node) {
  if (ts.isVariableDeclaration(node) && ['refresh', 'complete', 'startNew', 'errorKey'].includes(node.name.getText(ast))) handlers[node.name.getText(ast)] = node.initializer.getText(ast)
  ts.forEachChild(node, visit)
}
visit(ast)
const compile = (expression, env) => new Function(...Object.keys(env), ts.transpileModule(`return ${expression}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)(...Object.values(env))
const company = '11111111-1111-4111-8111-111111111111'
const event = '33333333-3333-4333-8333-333333333333'
const access = { active: true, managed: true, organization_id: company, permissions: ['document.read', 'assignment.read', 'assignment.complete'] }
const task = () => ({ id: 'task', sourceOrganizationId: company, sourceAssignmentId: 'assignment', sourceDocumentId: 'document', sourceRevision: 4, sourceStatus: 'assigned', title: 'Assignment' })
const tick = () => new Promise(resolve => setImmediate(resolve))
function receipt(task, command) {
  return { confirmed: true, projection_pending: true, task_id: task.id, receipt: { ...command, organization_id: company, assignment_id: task.sourceAssignmentId, document_id: task.sourceDocumentId, identity_issuer: 'https://identity.example.test', actor_sub: 'employee', revision: command.expected_revision + 1, status: 'completed', event_id: event, completed_at: '2026-10-22T00:00:00Z', outcome: 'completed' } }
}
function setup() {
  const item = task()
  const state = { tasks: [item], commands: {}, calls: [], policy: access }
  const env = {
    ...policy, HttpError, useCallback: value => value, allowed: true,
    live: { current: true }, scopeRef: { current: `1:${company}` }, userId: { current: 1 }, commandsRef: { current: {} },
    journal: { current: { write() {} } }, reads: { current: null }, writes: { current: null }, sequence: { current: 0 }, busy: { current: false },
    tasks: state.tasks,
    AssignmentCommandJournal: class { read() { return {} } },
    setCommandError: value => { state.error = value }, setTasks: value => { state.visible = value }, setSending: value => { state.sending = value },
    setAccess: value => { state.access = value }, setLoadError: value => { state.loadError = value }, setRefreshing() {}, setLoading() {}, setScope() {},
    dependencies: {
      authController: { refreshIfExpiringSoon: async () => ({ userId: 1 }) },
      access: { current: async () => state.policy },
      repository: { listMyDocumentologAssignments: async () => state.tasks, completeDocumentologAssignment: async (_id, command) => { state.calls.push(command); return receipt(item, command) } },
    },
  }
  env.publish = next => { env.commandsRef.current = next; state.commands = next }
  env.errorKey = compile(handlers.errorKey, env)
  env.refresh = compile(handlers.refresh, env)
  return { state, env, item, complete: compile(handlers.complete, env), startNew: compile(handlers.startNew, env), refresh: env.refresh }
}

;(async () => {
  let test = setup()
  await test.complete(test.item, ' ')
  assert.equal(test.state.error, 'errors.invalid'); assert.equal(test.state.calls.length, 0)

  test = setup()
  test.state.policy = { ...access, permissions: ['assignment.complete'] }
  await test.complete(test.item, 'result'); await tick()
  assert.equal(test.state.calls.length, 0, 'fresh access denial happens before the command POST')
  assert.equal(test.state.commands.task.phase, 'denied')

  test = setup()
  test.env.dependencies.repository.completeDocumentologAssignment = async (_id, command) => {
    test.state.calls.push(command)
    if (test.state.calls.length === 1) throw new HttpError('timeout', 503)
    return receipt(test.item, command)
  }
  await test.complete(test.item, 'Original result')
  assert.equal(test.state.commands.task.phase, 'uncertain')
  await test.complete(test.item, 'Edited result'); await tick()
  assert.equal(test.state.calls[0].command_id, test.state.calls[1].command_id)
  assert.equal(test.state.calls[1].result_comment, 'Original result')
  assert.equal(test.state.commands.task.phase, 'confirmed')
  test.item.sourceRevision = 5; test.item.sourceStatus = 'completed'
  await test.refresh()
  assert.deepEqual(test.state.commands, {}, 'confirmation remains until the source projection catches up')

  test = setup()
  test.env.dependencies.repository.completeDocumentologAssignment = async (_id, command) => { test.state.calls.push(command); throw new HttpError('conflict', 409) }
  await test.complete(test.item, 'Original'); await tick()
  const old = test.state.commands.task.command.command_id
  test.startNew(test.item)
  assert.equal(test.state.commands.task.command.command_id, old, 'same revision cannot start a new command')
  test.item.sourceRevision = 5
  test.startNew(test.item)
  assert.deepEqual(test.state.commands, {})
  test.env.dependencies.repository.completeDocumentologAssignment = async (_id, command) => { test.state.calls.push(command); return receipt(test.item, command) }
  await test.complete(test.item, 'New result')
  assert.notEqual(test.state.calls[1].command_id, old)
  assert.equal(test.state.calls[1].expected_revision, 5)

  test = setup()
  let resolveRequest
  test.env.dependencies.repository.completeDocumentologAssignment = async (_id, command) => {
    test.state.calls.push(command)
    return new Promise(resolve => { resolveRequest = () => resolve(receipt(test.item, command)) })
  }
  const pending = test.complete(test.item, 'result'); await tick()
  await test.complete(test.item, 'duplicate')
  assert.equal(test.state.calls.length, 1, 'double submit sends one command')
  test.state.policy = { ...access, permissions: ['document.read', 'assignment.read'] }
  await test.refresh()
  assert.equal(test.env.writes.current.signal.aborted, true)
  assert.equal(test.state.commands.task.phase, 'uncertain')
  resolveRequest(); await pending
  assert.equal(test.state.commands.task.phase, 'uncertain', 'a late response cannot override revoked access')

  test = setup()
  const oldDialogTask={...test.item}; test.item.sourceRevision=5
  await test.complete(oldDialogTask,'Result typed against revision 4'); await tick()
  assert.equal(test.state.calls.length,0,'an open form cannot silently adopt a newer revision')
  assert.equal(test.state.commands.task.phase,'conflict')
  assert.equal(test.state.commands.task.command.expected_revision,4)

  test = setup(); test.state.tasks.splice(0)
  await test.complete(test.item, 'result')
  assert.equal(test.state.calls.length, 0, 'a removed/reassigned task cannot be completed by an old UI')
  assert.equal(test.state.error, 'errors.denied')

  const { default: Dialog } = load('src/presentation/pages/assignments/AssignmentResultDialog.tsx', {
    'react-i18next': { useTranslation: () => ({ t: key => key }) },
    '../../../application/use-cases/assignments/assignmentPolicy': policy,
    '../../../shared/ui/AppModal': { __esModule: true, default: ({ children, footer }) => React.createElement('section', null, children, footer) },
  })
  const command = policy.createAssignmentCommand(task(), 'Frozen result')
  const props = { task: task(), draft: 'Edited text', pending: { taskId: 'task', assignmentId: 'assignment', command, phase: 'uncertain' }, allowed: true, sending: false, error: null, onDraft() {}, onSubmit() {}, onStartNew() {}, onClose() {} }
  const html = renderToStaticMarkup(React.createElement(Dialog, props))
  assert.match(html, /Frozen result/); assert.doesNotMatch(html, /Edited text/); assert.match(html, /readOnly/); assert.match(html, /dialog.retry/)
  const finalized = renderToStaticMarkup(React.createElement(Dialog, { ...props, task: { ...task(), sourceRevision: 5, sourceStatus: 'closed' }, pending: { ...props.pending, phase: 'conflict' } }))
  assert.doesNotMatch(finalized, /dialog.newCommand/)
  console.log('ODO assignment flow: fresh permissions, frozen retry, conflict, revocation, reassignment, double submit, source confirmation and result dialog passed')
})().catch(error => { console.error(error); process.exitCode = 1 })
