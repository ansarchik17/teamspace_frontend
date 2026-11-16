import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

// Exercise real Caddy routing and certificate verification with isolated
// fixtures. No working database, users, DNS, router or public CA is touched.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temp = await mkdtemp(join(tmpdir(), 'unitespace-caddy-'))
const children = new Set()
const stub = createServer(async (req, res) => {
  let body = ''
  for await (const chunk of req) body += chunk
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ path: req.url, method: req.method, host: req.headers.host, proto: req.headers['x-forwarded-proto'], body }))
})
const listen = server => new Promise(resolvePromise => server.listen(0, '127.0.0.1', resolvePromise))
const close = server => new Promise(resolvePromise => server.close(resolvePromise))
async function freePort() {
  const server = createServer()
  await listen(server)
  const port = server.address().port
  await close(server)
  return port
}
function request(port, path, { tls = false, method = 'GET', body } = {}) {
  return new Promise((resolvePromise, reject) => {
    const req = (tls ? httpsRequest : httpRequest)({
      hostname: '127.0.0.1', port, path, method,
      headers: { Host: tls ? 'unitespace.kz' : `127.0.0.1:${port}` },
      ...(tls ? { servername: 'unitespace.kz', ca: certificate } : {}),
      timeout: 3_000,
    }, res => {
      let text = ''
      res.on('data', chunk => { text += chunk })
      res.on('end', () => resolvePromise({ status: res.statusCode, headers: res.headers, text }))
    })
    req.on('timeout', () => req.destroy(new Error('Request timed out')))
    req.on('error', reject)
    req.end(body)
  })
}
async function stop(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) { children.delete(child); return }
  const exited = new Promise(resolvePromise => child.once('exit', resolvePromise))
  child.kill('SIGTERM')
  const timer = setTimeout(() => child.kill('SIGKILL'), 3_000)
  try { await exited } finally { clearTimeout(timer); children.delete(child) }
}
let certificate
try {
  assert.equal(spawnSync('caddy', ['version'], { stdio: 'ignore' }).status, 0, 'Install Caddy before running this test')
  await listen(stub)
  const upstream = `127.0.0.1:${stub.address().port}`
  await mkdir(join(temp, 'dist/assets'), { recursive: true })
  await mkdir(join(temp, 'dist/.vite'))
  await writeFile(join(temp, 'dist/index.html'), '<!doctype html><title>UniteSpace fixture</title>')
  await writeFile(join(temp, 'dist/assets/app.js'), '/* fixture asset */')
  await writeFile(join(temp, 'dist/.vite/manifest.json'), '{}')
  const routes = (await readFile(join(root, 'deploy/mac/routes.caddy'), 'utf8'))
    .replaceAll('127.0.0.1:8080', upstream).replaceAll('127.0.0.1:19000', upstream)
  await writeFile(join(temp, 'routes.caddy'), routes)
  const key = join(temp, 'test.key')
  const cert = join(temp, 'test.crt')
  const openssl = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=unitespace.kz', '-addext', 'subjectAltName=DNS:unitespace.kz', '-keyout', key, '-out', cert], { stdio: 'ignore' })
  assert.equal(openssl.status, 0, 'Test requires OpenSSL with -addext support')
  certificate = await readFile(cert)

  for (const publicProfile of [false, true]) {
    const port = await freePort()
    const tlsPort = await freePort()
    let config = await readFile(join(root, 'deploy/mac', publicProfile ? 'Caddyfile' : 'preview.Caddyfile'), 'utf8')
    config = config.replaceAll('9080', String(port)).replaceAll('9443', String(tlsPort))
    config = config.replace('{\n', '{\n\tdefault_bind 127.0.0.1\n\tpersist_config off\n')
    if (publicProfile) config = config.replace(`https://unitespace.kz:${tlsPort} {`, `https://unitespace.kz:${tlsPort} {\n\ttls ${cert} ${key}`)
    const path = join(temp, 'Caddyfile')
    await writeFile(path, config)
    const child = spawn('caddy', ['run', '--config', path, '--adapter', 'caddyfile'], {
      cwd: temp, stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, MAC_DIST: join(temp, 'dist'), XDG_DATA_HOME: join(temp, 'data'), XDG_CONFIG_HOME: join(temp, 'config') },
    })
    children.add(child)
    let errorOutput = ''
    child.stderr.on('data', chunk => { errorOutput = (errorOutput + chunk).slice(-8_000) })
    child.on('error', () => {})
    let started = false
    for (let attempt = 0; attempt < 60; attempt++) {
      try { await request(publicProfile ? tlsPort : port, '/web/login', { tls: publicProfile }); started = true; break }
      catch { await delay(100) }
    }
    assert.ok(started, `Caddy did not start: ${errorOutput}`)
    const get = (path, options = {}) => request(publicProfile ? tlsPort : port, path, { tls: publicProfile, ...options })
    for (const path of ['/web/login', '/web/workspace', '/web/join']) {
      const response = await get(path)
      assert.equal(response.status, 200, path)
      assert.match(response.text, /UniteSpace fixture/)
      assert.equal(response.headers['cache-control'], 'no-store')
    }
    const redirect = await get('/')
    assert.equal(redirect.status, 308)
    assert.equal(redirect.headers.location, '/web/')
    const asset = await get('/web/assets/app.js')
    assert.equal(asset.status, 200)
    assert.match(asset.headers['cache-control'], /immutable/)
    for (const path of ['/web/assets/missing.js', '/web/.vite/manifest.json', '/web/node_modules/a.js', '/swagger/index.html', '/admin/', '/realms/Workspace', '/.env', '/api/v10/users', '/workspace/private-object']) {
      assert.equal((await get(path)).status, 404, path)
    }
    const api = await get('/api/v1/probe?test=1', { method: 'POST', body: 'fixture' })
    const payload = JSON.parse(api.text)
    assert.equal(api.status, 200)
    assert.equal(payload.path, '/api/v1/probe?test=1')
    assert.equal(payload.body, 'fixture')
    assert.equal(payload.proto, publicProfile ? 'https' : 'http')
    const s3Path = '/workspace/probe?X-Amz-Algorithm=AWS4-HMAC-SHA256&signature=fixture'
    assert.equal((await get(s3Path)).status, 404, 'Unsigned reads must not reach S3')
    assert.equal((await get('/workspace/probe', { method: 'PUT' })).status, 404)
    const upload = await get(s3Path, { method: 'PUT', body: 'upload fixture' })
    const uploaded = JSON.parse(upload.text)
    assert.equal(upload.status, 200)
    assert.equal(uploaded.path, s3Path, 'S3 signed path/query must remain intact')
    assert.equal(uploaded.host, publicProfile ? 'unitespace.kz' : `127.0.0.1:${port}`)
    assert.equal(uploaded.body, 'upload fixture')
    if (publicProfile) {
      // Match the public hostname while connecting only to a local test port.
      const result = await new Promise((resolvePromise, reject) => {
        const req = httpRequest({ hostname: '127.0.0.1', port, path: '/web/login?q=1', headers: { Host: 'unitespace.kz' } }, res => { res.resume(); resolvePromise(res) })
        req.on('error', reject)
        req.end()
      })
      assert.equal(result.statusCode, 308)
      assert.equal(result.headers.location, 'https://unitespace.kz/web/login?q=1')
    }
    await stop(child)
    console.log(`${publicProfile ? 'HTTPS' : 'Local'} gateway passed: SPA/assets, private paths, API forwarding, S3 PUT and canonical redirects.`)
  }
} finally {
  await Promise.all([...children].map(stop))
  await close(stub)
  await rm(temp, { recursive: true, force: true })
}
