import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { request as httpRequest } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync, openSync, closeSync, cpSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const backend = resolve(root, '../teamspace_backend')
const args = process.argv.slice(2)
const domainMode = args.includes('--domain')
const stopOnly = args.includes('--stop')
const cacheName = domainMode ? 'domain' : 'share'
const cache = resolve(root, `.frontend-workbench/${cacheName}`)
const apiPort = domainMode ? 8086 : 8085
const gatewayPort = domainMode ? 9082 : 9081
const stopCommand = domainMode ? 'npm run host:tunnel:stop' : 'npm run share:stop'
const stateFile = resolve(cache, 'state.json')
const children = new Set()
let stopping = false
let ownsState = false
let stopRequested
const stopped = new Promise(resolvePromise => { stopRequested = resolvePromise })
let fail
const failed = new Promise((_, reject) => { fail = reject })
void failed.catch(() => {})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopping = true; stopRequested() })

function ownsProcess(pid) {
  if (!Number.isSafeInteger(pid) || pid < 2) return false
  const command = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' }).stdout || ''
  const cwd = spawnSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { encoding: 'utf8' }).stdout || ''
  return command.includes('scripts/share.mjs') && command.split(/\s+/).includes('--domain') === domainMode
    && cwd.split('\n').includes(`n${root}`)
}

function launch(name, command, args, options = {}) {
  if (stopping) throw new Error('Запуск остановлен.')
  const log = openSync(resolve(cache, `${name}.log`), 'w', 0o600)
  const proc = spawn(command, args, {
    cwd: options.cwd || root, env: options.env || process.env,
    stdio: options.onText ? ['ignore', 'pipe', 'pipe'] : ['ignore', log, log],
  })
  if (options.onText) {
    for (const stream of [proc.stdout, proc.stderr]) stream.on('data', chunk => {
      writeFileSync(log, chunk)
      options.onText(chunk.toString())
    })
  }
  const finished = new Promise((resolvePromise, reject) => {
    proc.once('error', () => reject(new Error(`Не удалось запустить ${name}.`)))
    proc.once('close', (code, signal) => {
      closeSync(log)
      children.delete(proc)
      if (stopping || code === 0) resolvePromise()
      else reject(new Error(`${name} завершился (${signal || code}). Журнал: .frontend-workbench/${cacheName}/${name}.log`))
      if (options.permanent && !stopping) fail(new Error(`${name} остановился. Публикация завершена.`))
    })
  })
  void finished.catch(error => { if (!stopping) fail(error) })
  children.add(proc)
  proc.finished = finished
  return proc
}

async function run(name, command, args, options) {
  await Promise.race([launch(name, command, args, options).finished, failed, stopped.then(() => { throw new Error('Запуск остановлен.') })])
}

async function freePort(port) {
  for (const host of ['127.0.0.1', '::']) {
    await new Promise((resolvePromise, reject) => {
      const probe = createServer()
      probe.once('error', () => reject(new Error(`Порт ${port} занят. Остановка предыдущего запуска: ${stopCommand}.`)))
      probe.listen(port, host, () => probe.close(resolvePromise))
    })
  }
}

// fetch can discard a custom Host header. A local probe must exercise the
// same hostname routing as cloudflared, without changing system DNS.
function probeLocalHost(url, headers) {
  return new Promise((resolvePromise, reject) => {
    const req = httpRequest(url, { headers, timeout: 5_000 }, response => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', chunk => { body += chunk })
      response.on('error', reject)
      response.on('end', () => resolvePromise(new Response(body, {
        status: response.statusCode,
        headers: Object.fromEntries(Object.entries(response.headers)
          .filter(([, value]) => value !== undefined)
          .map(([name, value]) => [name, Array.isArray(value) ? value.join(', ') : value])),
      })))
    })
    req.on('timeout', () => req.destroy(new Error('Local readiness timed out')))
    req.on('error', reject)
    req.end()
  })
}

async function waitFor(url, valid, timeout = 90_000, headers = {}) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline && !stopping) {
    await Promise.race([failed, delay(500)])
    try {
      const response = headers.Host ? await probeLocalHost(url, headers)
        : await fetch(url, { headers, signal: AbortSignal.timeout(5_000), redirect: 'manual' })
      if (await valid(response)) return
    } catch { /* Startup, tunnel registration and DNS may need a few seconds. */ }
  }
  throw new Error(`Не удалось дождаться готовности сайта. Подробности в .frontend-workbench/${cacheName}/.`)
}

async function main() {
  if (process.platform !== 'darwin') throw new Error('Публикация с этого профиля предназначена для Mac.')
  if (args.some(arg => !['--domain', '--stop'].includes(arg)) || new Set(args).size !== args.length) {
    throw new Error('Использование: npm run share, npm run host:tunnel; остановка: share:stop / host:tunnel:stop')
  }
  if (stopOnly) {
    if (existsSync(stateFile)) {
      const state = JSON.parse(readFileSync(stateFile, 'utf8'))
      if (ownsProcess(state.pid)) {
        process.kill(state.pid, 'SIGTERM')
        console.log('Останавливаю шлюз и отдельный API публикации…')
        return
      }
      rmSync(stateFile)
    }
    console.log('Активной публикации нет.')
    return
  }
  for (const command of domainMode ? ['caddy', 'go'] : ['caddy', 'cloudflared', 'go']) {
    const result = spawnSync(command, [command === 'cloudflared' ? '--version' : 'version'], { encoding: 'utf8' })
    if (result.status !== 0) {
      throw new Error(`Не найден ${command}. Установите зависимости: brew install caddy cloudflared; Go нужен backend.`)
    }
  }
  mkdirSync(cache, { recursive: true, mode: 0o700 })
  if (existsSync(stateFile)) {
    const state = JSON.parse(readFileSync(stateFile, 'utf8'))
    if (ownsProcess(state.pid)) throw new Error(`Публикация уже работает: ${state.origin || 'запускается'}. Остановка: ${stopCommand}`)
    rmSync(stateFile)
  }
  for (const port of [apiPort, gatewayPort]) await freePort(port)
  const privateEnv = parseEnv(readFileSync(resolve(backend, '.env'), 'utf8'))
  if (privateEnv.ENV !== 'development' || !['127.0.0.1', 'localhost'].includes(privateEnv.POSTGRES_HOST)
    || !['127.0.0.1', 'localhost'].includes(privateEnv.REDIS_HOST)
    || privateEnv.MINIO_BUCKET !== 'workspace') throw new Error('Ожидаются локальный backend .env и bucket workspace. Рабочий .env не изменён.')
  const localReady = await fetch('http://127.0.0.1:8080/ready', { signal: AbortSignal.timeout(3_000) }).catch(() => null)
  if (!localReady?.ok) throw new Error('Сначала запустите backend npm run dev: нужны подготовленная база, Redis, Keycloak и MinIO.')
  writeFileSync(stateFile, JSON.stringify({ pid: process.pid, origin: null }), { flag: 'wx', mode: 0o600 })
  ownsState = true
  console.log('Собираю отдельный API для публичной ссылки…')
  mkdirSync(resolve(backend, '.cache'), { recursive: true, mode: 0o700 })
  const binary = resolve(backend, domainMode ? '.cache/domain-api' : '.cache/share-api')
  await run('go-build', 'go', ['build', '-o', binary, './cmd/api'], { cwd: backend })
  let origin = 'https://unitespace.kz'
  if (!domainMode) {
    writeFileSync(resolve(cache, 'cloudflared.yml'), '{}\n', { mode: 0o600 })
    let resolveOrigin
    const gotOrigin = new Promise(resolvePromise => { resolveOrigin = resolvePromise })
    let output = ''
    console.log('Создаю бесплатную временную ссылку…')
    launch('cloudflared', 'cloudflared', ['tunnel', '--config', resolve(cache, 'cloudflared.yml'), '--no-autoupdate', '--protocol', 'http2', '--url', 'http://127.0.0.1:9081'], {
      permanent: true,
      onText(chunk) {
        output = (output + chunk).slice(-16_000)
        const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/)
        if (match) resolveOrigin(match[0])
      },
    })
    origin = await Promise.race([gotOrigin, failed,
      stopped.then(() => { throw new Error('Запуск остановлен.') }),
      delay(45_000, undefined, { ref: false }).then(() => { throw new Error('Не удалось получить временную ссылку Cloudflare. Проверьте cloudflared.log.') }),
    ])
  }
  const gatewayEnv = { ...process.env, MAC_API_UPSTREAM: `127.0.0.1:${apiPort}`, MAC_DIST: resolve(cache, 'dist'), SHARE_HOST: new URL(origin).hostname }
  console.log('Настраиваю API и ссылки на файлы для нового адреса…')
  launch('api', binary, [], { cwd: backend, permanent: true, env: {
    ...process.env, ...privateEnv,
    HTTP_HOST: '127.0.0.1', HTTP_PORT: String(apiPort), GIN_MODE: 'release',
    APP_PUBLIC_URL: origin, TENANT_BASE_DOMAIN: 'unitespace.kz',
    MINIO_PUBLIC_BASE_URL: `${origin}/workspace`, CORS_ALLOWED_ORIGINS: origin,
    RUN_DB_MIGRATIONS: 'false', AI_DOCUMENT_WORKER_DISABLED: 'true', AI_RECONCILIATION_ENABLED: 'false',
  } })
  await run('frontend-build', 'npm', ['run', 'build'], { env: {
    ...process.env, VITE_API_URL: '/api/v1', VITE_MAIL_APP_URL: origin,
    VITE_TENANT_BASE_DOMAIN: 'unitespace.kz', VITE_TENANT_WORKSPACE_ENABLED: 'false',
    VITE_KEYCLOAK_BROWSER_SSO_ENABLED: 'false',
  } })
  rmSync(resolve(cache, 'dist'), { recursive: true, force: true })
  cpSync(resolve(root, 'dist'), resolve(cache, 'dist'), { recursive: true })
  const config = resolve(root, domainMode ? 'deploy/mac/named-tunnel.Caddyfile' : 'deploy/mac/tunnel.Caddyfile')
  await run('caddy-validate', 'caddy', ['validate', '--config', config, '--adapter', 'caddyfile'], { env: gatewayEnv })
  await waitFor(`http://127.0.0.1:${apiPort}/ready`, response => response.ok)
  launch('caddy', 'caddy', ['run', '--config', config, '--adapter', 'caddyfile'], { permanent: true, env: gatewayEnv })
  launch('caffeinate', 'caffeinate', ['-i', '-w', String(process.pid)], { permanent: true })
  if (domainMode) {
    const localHeaders = { Host: 'unitespace.kz', 'X-Forwarded-Proto': 'https' }
    await waitFor(`http://127.0.0.1:${gatewayPort}/web/login`, async response => response.ok && (await response.text()).includes('/web/assets/'), 90_000, localHeaders)
    await waitFor(`http://127.0.0.1:${gatewayPort}/api/v1/auth/me`, response => response.status === 401 && response.headers.get('content-type')?.includes('application/json'), 90_000, localHeaders)
    writeFileSync(stateFile, JSON.stringify({ pid: process.pid, origin, localReady: true, ready: false, startedAt: new Date().toISOString() }), { mode: 0o600 })
    console.log(`LOCAL_READY http://127.0.0.1:${gatewayPort}`)
    console.log('Cloudflare Tunnel: hostname unitespace.kz, service HTTP 127.0.0.1:9082. Для www добавьте такой же маршрут.')
    console.log('Локальный шлюз готов. Публичный доступ требует маршрутов туннеля, DNS Cloudflare и активного HTTPS-сертификата.')
    console.log('Проверка после активации: npm run test:share-browser -- https://unitespace.kz')
    console.log(`Остановка шлюза: ${stopCommand}. Туннель в отдельном терминале продолжает работать независимо.`)
    await Promise.race([failed, stopped])
    return
  }
  console.log('Проверяю доступ через интернет…')
  await waitFor(`${origin}/web/login`, async response => response.ok && (await response.text()).includes('/web/assets/'))
  await waitFor(`${origin}/api/v1/auth/me`, response => response.status === 401 && response.headers.get('content-type')?.includes('application/json'))
  writeFileSync(stateFile, JSON.stringify({ pid: process.pid, origin, ready: true, startedAt: new Date().toISOString() }), { mode: 0o600 })
  console.log(`READY ${origin}/web/`)
  console.log('Ссылку можно отправить другим. Для входа используются существующие аккаунты проекта.')
  console.log('Остановка: npm run share:stop или Ctrl+C. Mac и Docker Desktop должны оставаться включёнными.')
  await Promise.race([failed, stopped])
}

try { await main() }
catch (error) { if (!stopping) { console.error(error.message); process.exitCode = 1 } }
finally {
  stopping = true
  const active = [...children]
  for (const proc of active) proc.kill('SIGTERM')
  const timer = setTimeout(() => { for (const proc of active) proc.kill('SIGKILL') }, 7_000)
  try { await Promise.allSettled(active.map(proc => proc.finished)) }
  finally { clearTimeout(timer); if (ownsState) rmSync(stateFile, { force: true }) }
}
