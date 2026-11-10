const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
function load(file, dependencies) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const output = { exports: {} }
  new Function('require', 'module', 'exports', code)(name => {
    assert.ok(dependencies[name], `Unexpected import ${name}`)
    return dependencies[name]
  }, output, output.exports)
  return output.exports
}
const requests = [], effects = [], states = []
const { UserAILimitsSyncCoordinator: Coordinator } = load('src/infrastructure/services/UserAILimitsSyncCoordinator.ts', {
  '../../application/use-cases/ai/GetUserAILimitsUseCase': {},
  '../repositories/HttpUserAILimitsRepository': {
    HttpUserAILimitsRepository: class {}, isAbortError: e => e.name === 'AbortError',
    isSessionChangedError: e => e.name === 'SessionChangedError',
  },
  '../storage/LocalStorageAuthSessionStore': {},
  '../../shared/auth/authSessionEvents': { AUTH_SESSION_CLEARED_EVENT: 'clear' },
})
let token = 'session-A'
const coordinator = new Coordinator({
  sessionStore: { getTokens: () => token ? { accessToken: token } : null },
  useCase: { execute: signal => new Promise((resolve, reject) => requests.push({ signal, resolve, reject })) },
})
Coordinator.setInstanceForTesting(coordinator)
const { useUserAILimits } = load('src/presentation/alemai/useUserAILimits.ts', {
  react: {
    useMemo: fn => fn(), useCallback: fn => fn,
    useState: initial => {
      const i = states.length
      states.push(typeof initial === 'function' ? initial() : initial)
      return [states[i], next => { states[i] = next }]
    },
    useEffect: fn => effects.push(fn),
  },
  '../../infrastructure/services/UserAILimitsSyncCoordinator': { UserAILimitsSyncCoordinator: Coordinator },
})
global.window = new EventTarget()
const originalChannel = global.BroadcastChannel
global.BroadcastChannel = undefined
const data = label => ({ label, serverTime: new Date().toISOString(), fiveHour: { period: null }, weekly: { period: null } })
;(async () => {
  try {
    const hook = useUserAILimits()
    const cleanup = effects[0]()
    const first = hook.refetch()
    assert.equal(requests.length, 1, 'Hook and subscription share one read')
    token = 'session-B'
    const second = hook.refetch()
    assert.equal(requests[0].signal.aborted, true)
    const current = data('B')
    requests[1].resolve(current); await second
    requests[0].resolve(data('A')); await first
    assert.equal(states[0].limits, current, 'Late A response must not replace B')
    const pending = hook.refetch()
    token = null
    window.dispatchEvent(new Event('clear'))
    assert.equal(requests[2].signal.aborted, true)
    requests[2].resolve(data('old-B')); await pending
    assert.equal(states[0].limits, null)
    assert.equal(states[0].loading, false)
    token = 'session-C'
    const last = hook.refetch()
    cleanup()
    const afterUnmount = states[0]
    requests[3].reject(new Error('late error')); await last
    assert.equal(states[0], afterUnmount, 'Unmounted hook must not receive updates')
    console.log('Actual hook + coordinator: deduplication, session change, logout and unmount passed')
  } finally {
    coordinator.destroy()
    Coordinator.setInstanceForTesting(null)
    global.BroadcastChannel = originalChannel
    delete global.window
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
