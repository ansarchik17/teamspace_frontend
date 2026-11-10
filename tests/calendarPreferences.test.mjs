import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'

const source = readFileSync(new URL('../src/infrastructure/repositories/HttpCalendarRepository.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
let stored
const module = { exports: {} }
new Function('require', 'module', 'exports', outputText)(name => {
  if (name.endsWith('/authorizedFetch')) return { authorizedFetch: async (_store, _url, options) => {
    if (options?.body) {
      const body = JSON.parse(options.body)
      stored = { ...stored, ...body, id: 'event-1' }
    }
    return new Response(JSON.stringify(stored), { status: 200 })
  } }
  if (name.endsWith('/normalizeBackendAssetUrl')) return { normalizeBackendAssetUrl: value => value }
  throw new Error(`Unexpected import: ${name}`)
}, module, module.exports)
const { HttpCalendarRepository } = module.exports
const payload = { calendarId: 'calendar-1', title: 'Personal event', startTime: '2026-10-24T10:00:00Z', endTime: '2026-10-24T11:00:00Z' }

test('calendar and explicit no reminder survive create, update and a fresh details request', async () => {
  stored = undefined
  const repo = new HttpCalendarRepository({})
  const created = await repo.createEvent({ ...payload, reminderMinutes: null })
  assert.equal(stored.reminder_minutes, null)
  assert.equal(created.calendarId, payload.calendarId)
  assert.equal(created.reminderMinutes, null)
  const updated = await repo.updateEvent(created.id, { ...payload, title: 'Renamed', reminderMinutes: null })
  assert.equal(stored.calendar_id, payload.calendarId)
  assert.equal(stored.reminder_minutes, null)
  assert.equal(updated.reminderMinutes, null)
  const reopened = await new HttpCalendarRepository({}).getEvent(created.id)
  assert.equal(reopened.calendarId, payload.calendarId)
  assert.equal(reopened.reminderMinutes, null)
})

test('zero and numeric reminders are sent without replacing them with defaults', async () => {
  for (const reminderMinutes of [0, 15, 30]) {
    const event = await new HttpCalendarRepository({}).createEvent({ ...payload, reminderMinutes })
    assert.equal(stored.reminder_minutes, reminderMinutes)
    assert.equal(event.reminderMinutes, reminderMinutes)
  }
})
