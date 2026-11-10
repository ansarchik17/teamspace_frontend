import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/infrastructure/http/HttpError.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } })
const { parseHttpError, HttpError } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
const response = (body, status = 500) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

test('uses the public message from the backend news error envelope', async () => {
  const error = await parseHttpError(response({ error: { code: 'INTERNAL_ERROR', message: 'SQLSTATE 42P08', user_message: 'Попробуйте позже.', details: { request_id: '123' } } }))
  assert.ok(error instanceof HttpError)
  assert.equal(error.message, 'Попробуйте позже.')
  assert.equal(error.status, 500)
  assert.equal(error.code, 'INTERNAL_ERROR')
  assert.deepEqual(error.details, { request_id: '123' })
})

test('accepts public messages at the top level', async () => {
  for (const body of [
    { user_message: 'Проверьте данные.' },
    { error: 'technical', user_message: 'Проверьте данные.' },
    { error: { message: 'technical' }, user_message: 'Проверьте данные.' },
  ]) {
    assert.equal((await parseHttpError(response(body, 400))).message, 'Проверьте данные.')
  }
})

test('preserves legacy messages when no public message is supplied', async () => {
  for (const body of [
    { error: 'legacy' },
    { error: { message: 'legacy', user_message: '  ' } },
    { message: 'legacy' },
    { detail: 'legacy' },
  ]) {
    assert.equal((await parseHttpError(response(body, 422))).message, 'legacy')
  }
})

test('prefers the nested public message over the top level message', async () => {
  const error = await parseHttpError(response({ user_message: 'top', error: { user_message: ' nested ', message: 'technical' } }))
  assert.equal(error.message, 'nested')
})

test('retains safe fallback for malformed JSON and HTML', async () => {
  for (const contentType of ['application/json', 'text/html']) {
    const error = await parseHttpError(new Response('<html>bad gateway</html>', { status: 502, headers: { 'content-type': contentType } }))
    assert.equal(error.message, 'Сервер временно недоступен. Попробуйте позже.')
    assert.equal(error.status, 502)
  }
})
