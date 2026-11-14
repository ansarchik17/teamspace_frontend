import assert from 'node:assert/strict'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

// Exercise the emitted JS, including chunk initialization, without real accounts
// or a backend. CI also runs this container with --network=none.
const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist')
const authRu = JSON.parse(await readFile(new URL('../src/shared/i18n/locales/ru/auth.json', import.meta.url), 'utf8'))
const loginHeading = authRu.login.title
await stat(resolve(dist, 'index.html'))
const manifest = JSON.parse(await readFile(resolve(dist, '.vite/manifest.json'), 'utf8'))
assert.equal(Object.keys(manifest).some(key => /presentation\/pages\/messenger\//.test(key)), false, 'Removed messenger must not ship a page chunk')
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' }
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    if (pathname.startsWith('/api/')) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }))
      return
    }
    if (!pathname.startsWith('/web/')) { res.writeHead(404).end(); return }
    let file = resolve(dist, pathname.slice('/web/'.length) || 'index.html')
    if (!file.startsWith(dist + sep)) { res.writeHead(404).end(); return }
    try { if (!(await stat(file)).isFile()) throw new Error('Not a file') }
    catch {
      if (extname(pathname)) { res.writeHead(404).end(); return }
      file = resolve(dist, 'index.html')
    }
    res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
    createReadStream(file).pipe(res)
  } catch { res.writeHead(500).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const screenshotDir = process.env.BROWSER_CHECK_SCREENSHOTS
if (screenshotDir) await mkdir(screenshotDir, { recursive: true })
let browser
let page
const errors = []
try {
  browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHECK_CHANNEL || undefined })
  const context = await browser.newContext({ locale: 'ru-RU', serviceWorkers: 'block' })
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
  page = await context.newPage()
  page.setDefaultTimeout(15_000)
  page.on('pageerror', error => errors.push(error.stack ?? error.message))
  const open = async (path, heading) => {
    await page.goto(origin + path)
    await page.getByRole('heading', { name: heading, exact: true }).waitFor({ state: 'visible' })
    await page.locator('#axis-splash').waitFor({ state: 'hidden' })
    assert.deepEqual(errors, [], 'Production bundle raised a JavaScript error')
  }
  await open('/web/login', loginHeading)
  for (const path of ['/web/messenger', '/web/messenger/@saved-user', '/web/@saved-user']) {
    await page.goto(origin + path)
    await page.waitForURL(origin + '/web/login')
    await page.getByRole('heading', { name: loginHeading, exact: true }).waitFor({ state: 'visible' })
  }
  await page.getByLabel(authRu.form.loginLabel, { exact: true }).waitFor({ state: 'visible' })
  await page.getByLabel(authRu.form.passwordLabel, { exact: true }).waitFor({ state: 'visible' })
  await page.getByRole('button', { name: authRu.form.submit, exact: true }).waitFor({ state: 'visible' })
  await page.getByRole('link', { name: 'Забыли пароль?', exact: true }).click()
  await page.getByRole('heading', { name: 'Восстановление пароля', exact: true }).waitFor({ state: 'visible' })
  await page.getByRole('textbox', { name: 'Логин или почта', exact: true }).waitFor({ state: 'visible' })
  // Direct SPA entry and lazy route chunks must work too.
  await open('/web/recover#token=invalid', 'Восстановление пароля')
  assert.match(await page.getByRole('alert').innerText(), /Ссылка недействительна/)
  assert.equal(await page.locator('input[type=password]').count(), 0)
  await open('/web/join#token=invalid', 'Приглашение в компанию')
  assert.match(await page.getByRole('alert').innerText(), /Приглашение недоступно/)
  // A valid invitation renders a much longer form than an unavailable link.
  // Stub only the preview/code endpoints; never create an account or send mail.
  await page.route('**/api/v1/auth/invitations/preview', route => route.fulfill({ json: {
    organization_name: 'Browser test company', email_hint: 't***@example.invalid',
    expires_at: '2099-01-01T00:00:00Z',
  } }))
  await page.route('**/api/v1/auth/invitations/code', route => route.fulfill({ json: { sent: true, retry_after: 60 } }))
  const submit = page.getByRole('button', { name: 'Зарегистрироваться и присоединиться', exact: true })
  for (const viewport of [{ width: 1280, height: 650 }, { width: 390, height: 600 }]) {
    await page.goto(origin + '/web/login')
    await page.setViewportSize(viewport)
    await open('/web/join#token=' + (viewport.width > 560 ? 'A' : 'B').repeat(43), 'Присоединиться к Browser test company')
    await page.getByRole('button', { name: 'Получить код', exact: true }).click()
    await page.getByText('Код отправлен. Он действует 10 минут.', { exact: true }).waitFor()
    await page.getByLabel('Код из письма', { exact: true }).fill('123456')
    const scroller = page.locator('.invitation-join')
    assert.equal(await scroller.evaluate(el => el.scrollHeight > el.clientHeight), true, 'Long invitation needs a scrollable viewport')
    assert.equal(await scroller.evaluate(el => ['auto', 'scroll'].includes(getComputedStyle(el).overflowY)), true, 'Invitation must own scrolling when the app root clips overflow')
    await page.mouse.move(viewport.width / 2, viewport.height / 2)
    await page.mouse.wheel(0, 2500)
    await page.waitForFunction(() => document.querySelector('.invitation-join').scrollTop > 0)
    await page.waitForFunction(() => {
      const rect = document.querySelector('.invitation-form button[type=submit]').getBoundingClientRect()
      return rect.top >= 0 && rect.bottom <= innerHeight
    })
    await submit.click({ trial: true })
    if (screenshotDir) await page.screenshot({ path: resolve(screenshotDir, `invitation-${viewport.width}-bottom.png`) })
    assert.equal(await page.getByLabel('Код из письма', { exact: true }).inputValue(), '123456')
    // Shrinking the viewport models a mobile keyboard/landscape transition.
    await page.setViewportSize({ width: viewport.width, height: 320 })
    await page.locator('input[name=confirm]').focus()
    await page.keyboard.press('Tab')
    assert.equal(await submit.evaluate(el => el === document.activeElement), true)
    await page.waitForFunction(() => {
      const rect = document.querySelector('.invitation-form button[type=submit]').getBoundingClientRect()
      return rect.top >= 0 && rect.bottom <= innerHeight + 1
    })
    const button = await submit.boundingBox()
    assert.ok(button && button.y >= 0 && button.y + button.height <= 321, 'Keyboard navigation must reveal the submit button')
    await page.mouse.move(viewport.width / 2, 160)
    await page.mouse.wheel(0, -3000)
    await page.waitForFunction(() => document.querySelector('.invitation-join').scrollTop === 0)
    const brand = await page.locator('.invitation-brand').boundingBox()
    assert.ok(brand && brand.y >= 0, 'The start of the form must remain reachable')
    assert.equal(await scroller.evaluate(el => el.scrollWidth <= el.clientWidth), true, 'Mobile form must not overflow horizontally')
  }
  // Observe the browser's real Origin header on a cross-origin POST after SPA
  // navigation. Removing a no-referrer meta alone leaves the policy active and
  // turns Origin into "null", which the tenant handoff correctly rejects.
  const handoffProbe = 'https://tenant.example.invalid/handoff-probe'
  const privacyProbe = 'https://tenant.example.invalid/referrer-probe'
  await page.route(handoffProbe, route => route.fulfill({ contentType: 'text/plain', body: 'Local browser probe' }))
  await page.route(privacyProbe, route => route.fulfill({ contentType: 'text/plain', body: 'Local privacy probe' }))
  for (const from of ['invitation', 'recovery']) {
    await page.goto(origin + '/web/login')
    if (from === 'invitation') {
      await open('/web/join#token=' + 'C'.repeat(43), 'Присоединиться к Browser test company')
    } else {
      await open('/web/recover#token=invalid', 'Восстановление пароля')
    }
    const privacyRequestPromise = page.waitForRequest(privacyProbe)
    await page.evaluate(url => fetch(url, { mode: 'no-cors', credentials: 'omit' }).then(() => {}), privacyProbe)
    assert.equal((await privacyRequestPromise).headers().referer, undefined, 'Secret-link page must still suppress referrers while mounted')
    if (from === 'invitation') await page.getByRole('button', { name: 'У меня уже есть аккаунт', exact: true }).click()
    else await page.getByRole('link', { name: 'Вернуться ко входу', exact: true }).click()
    await page.getByRole('heading', { name: loginHeading, exact: true }).waitFor()
    const requestPromise = page.waitForRequest(handoffProbe)
    await page.evaluate(action => {
      const form = document.createElement('form')
      form.method = 'POST'; form.action = action
      document.body.append(form); form.submit()
    }, handoffProbe)
    const request = await requestPromise
    assert.equal(request.headers().origin, origin, `Tenant handoff after ${from} must retain the platform Origin`)
    assert.equal(request.headers().referer, origin + '/', 'Only the platform origin may enter the cross-origin handoff referrer')
    await page.waitForURL(handoffProbe)
  }
  assert.deepEqual(errors, [], 'Production bundle raised a JavaScript error')
  console.log('Production browser check passed: login, recovery, invalid links, desktop/mobile invitation scrolling, keyboard access, referrer privacy and platform Origin after SPA navigation; no uncaught JavaScript errors.')
} catch (error) {
  for (const message of errors) console.error(message)
  if (page) {
    console.error('Browser check location:', page.url())
    console.error('Rendered headings:', await page.getByRole('heading').allTextContents().catch(() => []))
    if (screenshotDir) await page.screenshot({ path: resolve(screenshotDir, 'failure.png') }).catch(() => {})
  }
  throw error
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
