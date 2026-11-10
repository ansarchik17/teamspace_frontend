import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const mail = fileURLToPath(new URL('../deploy/mail/source/', import.meta.url))
const name = `workspace-mail-names-${process.pid}-${randomBytes(4).toString('hex')}`
const password = randomBytes(20).toString('hex')
const run = (cmd, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(cmd, args, { stdio: 'inherit', ...options })
  let output = ''
  child.stdout?.on('data', data => { output += data })
  child.on('error', reject)
  child.on('close', code => code === 0 ? resolve(output.trim()) : reject(new Error(`${cmd} exited ${code}`)))
})
let started = false
try {
  await run('docker', ['run', '-d', '--rm', '--name', name,
    '--memory=256m', '--memory-swap=384m', '--cpus=1',
    '--tmpfs', '/var/lib/postgresql/data:rw,size=256m',
    '-e', 'POSTGRES_USER=qa', '-e', `POSTGRES_PASSWORD=${password}`,
    '-e', 'POSTGRES_DB=mail_naming_test', '-p', '127.0.0.1::5432', 'postgres:16-alpine'])
  started = true
  let ready = false
  for (let n = 0; n < 60; n++) {
    try { await run('docker', ['exec', name, 'pg_isready', '-U', 'qa', '-d', 'mail_naming_test'], { stdio: 'ignore' }); ready = true; break }
    catch { await new Promise(resolve => setTimeout(resolve, 1000)) }
  }
  if (!ready) throw new Error('Disposable mail PostgreSQL did not become ready')
  const address = await run('docker', ['port', name, '5432/tcp'], { stdio: ['ignore', 'pipe', 'inherit'] })
  if (!/^127\.0\.0\.1:\d+$/.test(address)) throw new Error('Test PostgreSQL must be loopback only')
  await run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: mail })
  await run(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1', 'tests/workspace-mail-address.test.ts', 'tests/workspace-mail-address-change.test.ts'], {
    cwd: mail,
    env: { ...process.env, DATABASE_URL: `postgres://qa:${password}@${address}/mail_naming_test`,
      MAIL_MODE: 'local', MAIL_CREDENTIAL_KEY: randomBytes(32).toString('hex'),
      NODE_OPTIONS: '--max-old-space-size=512' },
  })
} finally {
  if (started) await run('docker', ['stop', '--time=10', name])
}
