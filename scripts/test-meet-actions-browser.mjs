import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { realpathSync } from 'node:fs'
import { createServer } from 'vite'
import { chromium } from 'playwright'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const output = process.env.MEET_ACTIONS_QA_OUTPUT || '/tmp/meet-actions-browser-qa'
await mkdir(output, { recursive: true })
// Bound discovery to this fixture, so the test does not prebundle unrelated
// application routes or write bundled config files into a read-only checkout.
const server = await createServer({ root, configFile: false, base: '/web/', plugins: [react(), tailwindcss()], optimizeDeps: { entries: ['tests/fixtures/meet-actions.html'] }, cacheDir: `${output}/vite-cache`, server: { host: '127.0.0.1', port: 5196, strictPort: true, fs: { allow: [root, realpathSync(`${root}/node_modules`)] } } })
await server.listen()
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 980 } })
  const errors = []
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message) })
  const meetingId = '11111111-1111-4111-8111-111111111111'
  const boardId = '22222222-2222-4222-8222-222222222222'
  const taskId = '33333333-3333-4333-8333-333333333333'
  const candidate = { title: 'Подготовить спецификацию', description: 'Подготовить согласованную спецификацию.', kind: 'commitment', owner_text: 'Айдар', deadline_text: 'до пятницы', verification: 'supported', review_reason: 'Явное обязательство участника.', evidence: [{ segment_id: 'track:1', quote: 'Я подготовлю спецификацию до пятницы.', speaker: 'Айдар', start_ms: 1000, end_ms: 2000 }] }
  let analysis = null
  let proposals = []
  let commits = 0
  await page.route('**/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    let payload
    if (url.pathname.endsWith('/meeting-actions/capabilities')) payload = { enabled: true }
    else if (url.pathname.endsWith('/kanban/boards')) payload = [{ id: boardId, name: 'Разработка', owner_id: 1 }]
    else if (url.pathname.endsWith(`/kanban/boards/${boardId}`)) payload = { board: { id: boardId, name: 'Разработка', owner_id: 1 }, columns: [], members: [], sprints: [], goals: [], projects: [] }
    else if (url.pathname.endsWith(`/meet/calls/${meetingId}`)) payload = { id: meetingId, title: 'Обсуждение спецификации', status: 'completed', started_at: '2026-11-02T05:00:00Z', completed_at: '2026-11-02T06:00:00Z', transcript: '', chunks: [{ track_sid: 'track', track_sequence: 1, participant_identity: 'user-1', participant_name: 'Айдар', start_ms: 1000, end_ms: 2000, transcript: candidate.evidence[0].quote }] }
    else if (url.pathname.endsWith('/meeting-actions') && request.method() === 'POST') {
      analysis = { id: 'analysis', status: 'ready', source_hash: 'v1', rejected_count: 0 }
      proposals = [{ id: 'proposal', analysis_id: 'analysis', candidate, draft: { title: candidate.title, description: candidate.description, assignee_id: null, due_at: null }, status: 'proposed', version: 1, source_hash: 'v1', task_id: null }]
      payload = analysis
    } else if (url.pathname.endsWith('/meeting-actions')) payload = { analysis, proposals, members: [{ user_id: 1, full_name: 'Айдар' }], current_source_hash: 'v1' }
    else if (url.pathname.endsWith('/proposals/proposal/decision')) {
      const body = request.postDataJSON()
      assert.equal(body.source_reviewed, true)
      assert.equal(body.draft.assignee_id, null)
      assert.equal(body.draft.due_at, null)
      commits++
      proposals = [{ ...proposals[0], status: 'created', version: 2, task_id: taskId, task_key: 'DEV-2', task_status: 'К ВЫПОЛНЕНИЮ' }]
      payload = proposals[0]
    } else throw new Error(`Unexpected API call ${request.method()} ${url.pathname}`)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
  })
  await page.goto('http://127.0.0.1:5196/web/tests/fixtures/meet-actions.html')
  await page.getByLabel('Доска Kanban', { exact: true }).selectOption(boardId)
  await page.getByRole('button', { name: 'Найти поручения', exact: true }).click()
  const create = page.getByRole('button', { name: 'Создать задачу', exact: true })
  await create.waitFor()
  assert.equal(await create.isDisabled(), true)
  assert.equal(await page.getByLabel('Исполнитель', { exact: true }).inputValue(), '')
  assert.equal(await page.getByLabel('Срок · ваше местное время', { exact: true }).inputValue(), '')
  await page.screenshot({ path: `${output}/desktop.png`, fullPage: true })
  await create.scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${output}/desktop-review.png` })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: `${output}/mobile.png`, fullPage: true })
  const overflowing = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  assert.equal(overflowing, false)
  await page.getByRole('checkbox').check()
  assert.equal(await create.isEnabled(), true)
  await create.click()
  await page.getByRole('link', { name: 'DEV-2' }).waitFor()
  assert.equal(commits, 1)
  assert.equal(await page.getByRole('button', { name: 'Создать задачу', exact: true }).count(), 0)
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ passed: true, commits, screenshots: [`${output}/desktop.png`, `${output}/mobile.png`] }))
} finally { await browser.close(); await server.close() }
