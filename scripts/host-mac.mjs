import { spawn, spawnSync } from 'node:child_process'
import { resolve4 } from 'node:dns/promises'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const preview = process.argv[2] === '--preview'
const domain = 'unitespace.kz'
const origin = preview ? 'http://127.0.0.1:9080' : `https://${domain}`
const config = resolve(root, 'deploy/mac', preview ? 'preview.Caddyfile' : 'Caddyfile')
let child
let stopping = false
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true
    child?.kill(signal)
  })
}

function run(command, args, env = process.env) {
  if (stopping) return Promise.resolve()
  return new Promise((resolvePromise, reject) => {
    child = spawn(command, args, { cwd: root, env, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      child = undefined
      if (stopping || code === 0) resolvePromise()
      else reject(new Error(`${command} завершился: ${signal || code}`))
    })
  })
}

async function checkPort(port) {
  for (const host of ['127.0.0.1', '::']) {
    await new Promise((resolvePromise, reject) => {
      const probe = createServer()
      probe.once('error', () => reject(new Error(`Порт ${port} занят. Остановите предыдущий host:mac / host:mac:preview.`)))
      probe.listen(port, host, () => probe.close(resolvePromise))
    })
  }
}

async function main() {
  if (process.platform !== 'darwin') throw new Error('Эта команда предназначена для Mac.')
  if (process.argv.length > (preview ? 3 : 2)) throw new Error('Использование: npm run host:mac или npm run host:mac:preview')
  const caddy = spawnSync('caddy', ['version'], { encoding: 'utf8' })
  if (caddy.status !== 0) throw new Error('Установите Caddy: brew install caddy')
  await checkPort(9080)
  if (!preview) {
    await checkPort(9443)
    let addresses
    try { addresses = await resolve4(domain) }
    catch { throw new Error(`Домен ${domain} пока не опубликован в DNS. Проверьте статус и DNS-хостинг в Hoster.kz; затем повторите запуск.`) }
    const external = await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(8_000) }).then(response => {
      if (!response.ok) throw new Error('Не удалось проверить внешний IPv4.')
      return response.text()
    })
    if (!addresses.includes(external.trim())) {
      throw new Error(`A-запись ${domain} не совпадает с текущим внешним IPv4 этой сети. Обновите DNS перед запуском HTTPS.`)
    }
  }
  const ready = await fetch('http://127.0.0.1:8080/ready', { signal: AbortSignal.timeout(3_000) }).catch(() => null)
  if (!ready?.ok) throw new Error('Backend недоступен. Для публичного сайта запустите backend npm run host:mac; для локальной проверки подходит npm run dev.')
  const env = { ...process.env, MAC_DIST: resolve(root, 'dist') }
  await run('caddy', ['validate', '--config', config, '--adapter', 'caddyfile'], env)
  await run('npm', ['run', 'build'], {
    ...env,
    VITE_API_URL: '/api/v1',
    VITE_TENANT_BASE_DOMAIN: domain,
    VITE_TENANT_WORKSPACE_ENABLED: 'false',
    VITE_KEYCLOAK_BROWSER_SSO_ENABLED: 'false',
    // The separate corporate mail service is not deployed on this Mac.
    // Do not carry an old domain's credential bridge into this build.
    VITE_MAIL_APP_URL: origin,
  })
  if (stopping) return
  console.log(`UniteSpace: ${origin}/web/`)
  if (!preview) console.log('Нужны правила роутера: TCP 80 -> Mac:9080; TCP 443 -> Mac:9443. Mac и Docker Desktop должны оставаться включёнными.')
  await run('caffeinate', ['-i', 'caddy', 'run', '--config', config, '--adapter', 'caddyfile'], env)
}

main().catch(error => {
  if (!stopping) {
    console.error(error.message)
    process.exitCode = 1
  }
})
