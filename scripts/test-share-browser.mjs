import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const origin = new URL(process.argv[2] || JSON.parse(readFileSync(resolve(root, '.frontend-workbench/share/state.json'), 'utf8')).origin).origin
const browser = await chromium.launch({ channel: 'chrome', headless: true })

try {
  for (const path of ['/', '/web/', '/web/workspace']) {
    const context = await browser.newContext()
    try {
      const page = await context.newPage()
      const errors = []
      const externalNavigations = []
      page.on('pageerror', error => errors.push(error.message))
      await page.route('**/*', route => {
        const request = route.request()
        if (request.isNavigationRequest() && request.frame() === page.mainFrame() && new URL(request.url()).origin !== origin) {
          externalNavigations.push(new URL(request.url()).origin)
          return route.abort()
        }
        return route.continue()
      })
      await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' })
      try {
        await page.locator('#login').waitFor({ state: 'visible', timeout: 20_000 })
      } catch (error) {
        assert.deepEqual(externalNavigations, [], `Anonymous ${path} tried to leave the public site`)
        throw error
      }
      assert.equal(new URL(page.url()).origin, origin)
      assert.equal(new URL(page.url()).pathname, '/web/login')
      assert.equal(await page.locator('#password').isVisible(), true)
      assert.equal(await page.locator('form button[type="submit"]').isVisible(), true)
      assert.deepEqual(externalNavigations, [])
      assert.deepEqual(errors, [])
      console.log(`PASS fresh visitor ${path} -> /web/login, no external SSO navigation`)
    } finally {
      await context.close()
    }
  }
} finally {
  await browser.close()
}
