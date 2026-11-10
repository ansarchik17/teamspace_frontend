const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const browser = new EventTarget()
let now = Date.now()
class Clock extends Date { static now() { return now } }
const events = {
  AUTH_SESSION_CLEARED_EVENT: 'superapp:auth-session-cleared',
  AUTH_SESSION_EXPIRED_EVENT: 'superapp:auth-session-expired',
}
function load(relativePath, dependencies = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText
  const module = { exports: {} }
  new Function('require', 'exports', 'module', 'window', 'Date', code)(
    (name) => {
      const dependency = Object.entries(dependencies).find(([suffix]) => name.endsWith(suffix))
      if (!dependency) throw new Error(`Unexpected dependency: ${name}`)
      return dependency[1]
    }, module.exports, module, browser, Clock,
  )
  return module.exports
}
const cache = load('src/presentation/components/messenger/messengerListSnapshot.ts', {
  authSessionEvents: events,
})
const tokens = { accessToken: 'session-a', expiresAt: new Date(now + 60 * 60_000).toISOString() }
const scope = cache.messengerSnapshotScope(tokens, 'device-a')
const data = {
  currentUser: { id: 1, name: 'Test' },
  cryptoState: { currentDeviceId: 'device-a', privateKey: null },
  chats: [{ chat: { id: 'chat-a' }, subtitle: 'preview' }], folders: [],
}

cache.writeMessengerListSnapshot(scope, data)
now += 30_000
assert.equal(cache.readMessengerListSnapshot(scope), data, 'Reopening after auth bootstrap TTL must retain the list')
cache.writeMessengerListSnapshot(scope, { ...data, chats: [] })
assert.deepEqual(cache.readMessengerListSnapshot(scope).chats, [], 'A fresh empty list must replace removed chats')

cache.writeMessengerListSnapshot(scope, data)
assert.equal(cache.readMessengerListSnapshot(cache.messengerSnapshotScope(tokens, 'device-b')), null)
cache.writeMessengerListSnapshot(scope, data)
assert.equal(cache.readMessengerListSnapshot(cache.messengerSnapshotScope({ ...tokens, accessToken: 'session-b' }, 'device-a')), null)
assert.equal(cache.messengerSnapshotScope(null, 'device-a'), null)
assert.equal(cache.messengerSnapshotScope({ ...tokens, expiresAt: new Date(now - 1).toISOString() }, 'device-a'), null)
assert.equal(cache.messengerSnapshotScope({ ...tokens, expiresAt: 'invalid' }, 'device-a'), null)

cache.writeMessengerListSnapshot(scope, data)
now += 5 * 60_000 + 1
assert.equal(cache.readMessengerListSnapshot(scope), null, 'Old snapshots must expire')

for (const name of Object.values(events)) {
  cache.writeMessengerListSnapshot(scope, data)
  browser.dispatchEvent(new Event(name))
  assert.equal(cache.readMessengerListSnapshot(scope), null)
}
cache.writeMessengerListSnapshot(scope, data)
const storageEvent = new Event('storage')
Object.defineProperty(storageEvent, 'key', { value: 'superapp.auth.tokens' })
browser.dispatchEvent(storageEvent)
assert.equal(cache.readMessengerListSnapshot(scope), null, 'Account change in another tab must clear the snapshot')

const { LocalStorageAuthSessionStore } = load('src/infrastructure/storage/LocalStorageAuthSessionStore.ts', {
  legacyAuthStorage: { safeClearAuthStorage() {} }, authSessionEvents: events,
})
cache.writeMessengerListSnapshot(scope, data)
new LocalStorageAuthSessionStore().clearTokens()
assert.equal(cache.readMessengerListSnapshot(scope), null, 'Real logout path must clear the snapshot')
console.log('PASS: repeat navigation, fresh empty list, session/device isolation, expiry and logout invalidation')
