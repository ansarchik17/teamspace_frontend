import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/shared/notifications/internalChatNotifications.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
})
const { isInternalChatNotification } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)

test('native chat events and old messenger destinations are hidden', () => {
  for (const type of ['new_message', 'chat_message', 'message_created', 'message_deleted', 'chat_hidden', 'new_channel_post', 'typing', 'unread_count_updated', 'read_receipt']) {
    assert.equal(isInternalChatNotification({ type }), true, type)
  }
  for (const actionUrl of ['/messenger', '/messenger/@old-user', '/web/messenger?chat=old', 'https://company.example/web/messenger/old']) {
    assert.equal(isInternalChatNotification({ type: 'notification', actionUrl }), true, actionUrl)
  }
})

test('task, calendar, document and security notifications remain available', () => {
  for (const type of ['kanban_task_updated', 'task_due', 'calendar_invite', 'incoming_call', 'drive_delete_request', 'security_alert', 'publication_alert']) {
    assert.equal(isInternalChatNotification({ type }), false, type)
  }
  assert.equal(isInternalChatNotification({ type: 'notification', actionUrl: '/board?task=1' }), false)
  assert.equal(isInternalChatNotification({}), false)
})

test('separate CRM channels are preserved even when their notification type is new_message', () => {
  for (const actionUrl of ['/crm/messenger/whatsapp', '/web/crm/messenger/telegram']) {
    assert.equal(isInternalChatNotification({ type: 'new_message', actionUrl }), false)
  }
})
