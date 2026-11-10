import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  runNotebookResearch,
  waitForNotebookJob,
  readActiveJob,
  notebookJobProgressKey,
  stripNul,
  NOTEBOOK_STOP_REASON,
} from '../src/presentation/pages/alemdrive/drive-src/utils/notebookJobs.js'

const memoryStorage = () => {
  const data = new Map()
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k), data }
}
const httpError = (status, data) => Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data } })
const noSleep = async () => {}
const job = (status, extra = {}) => ({ job_id: 'j1', chat_id: 'c1', operation_id: 'op', status, progress: { stage: status === 'queued' ? 'queued' : 'analyzing', chunks_done: 1, chunks_total: 3 }, ...extra })

test('runs a background job and reports progress until done', async () => {
  const storage = memoryStorage()
  const states = [job('running'), job('done', { result: { content: 'Ответ', status: 'answered', persisted: true } })]
  const calls = []
  const api = {
    createJob: async (chat, body) => { calls.push(['create', chat, body]); return job('queued') },
    getJob: async () => states.shift(),
    cancelJob: async () => assert.fail('must not cancel'),
    ask: async () => assert.fail('must not use synchronous ask'),
  }
  const progress = []
  const result = await runNotebookResearch({ api, chatId: 'c1', payload: { question: 'q', persist: true }, onProgress: (j) => progress.push(j.status), sleep: noSleep, storage })
  assert.equal(result.content, 'Ответ')
  assert.deepEqual(progress, ['queued', 'running', 'done'])
  assert.ok(calls[0][2].operation_id, 'operation_id is generated before the POST')
  assert.equal(readActiveJob(storage, 'c1'), null, 'finished job is forgotten')
})

test('falls back to the synchronous ask when jobs are not deployed', async () => {
  const api = {
    createJob: async () => { throw httpError(404, 'page not found') },
    ask: async (chat, body) => ({ content: 'sync', operation_id: body.operation_id }),
  }
  const result = await runNotebookResearch({ api, chatId: 'c1', payload: { question: 'q' }, sleep: noSleep, storage: memoryStorage() })
  assert.equal(result.content, 'sync')
  assert.ok(result.operation_id)
})

test('a failed job raises the synchronous /ask error contract', async () => {
  const body = { error: { code: 'AI_QUOTA_EXCEEDED', message: 'Лимит исчерпан' } }
  const api = { createJob: async () => job('failed', { error: { http_status: 429, code: 'AI_QUOTA_EXCEEDED', message: 'Лимит исчерпан', body } }) }
  await assert.rejects(
    runNotebookResearch({ api, chatId: 'c1', payload: { question: 'q' }, sleep: noSleep, storage: memoryStorage() }),
    (error) => error.response.status === 429 && error.response.data === body,
  )
})

test('409 names the active job instead of starting a second analysis', async () => {
  const api = { createJob: async () => { throw httpError(409, { error: { code: 'CONFLICT', details: { job_id: 'other', chat_id: 'c1' } } }) } }
  await assert.rejects(
    runNotebookResearch({ api, chatId: 'c1', payload: { question: 'q' }, sleep: noSleep, storage: memoryStorage() }),
    (error) => error.activeJob.job_id === 'other' && error.activeJob.sameChat && error.i18nKey === 'errors.activeJobSameChat',
  )
})

test('Stop cancels the job on the server, leaving the page does not', async () => {
  for (const [reason, cancels] of [[NOTEBOOK_STOP_REASON, true], [undefined, false]]) {
    const storage = memoryStorage()
    storage.setItem('notebook_active_job:c1', JSON.stringify({ job_id: 'j1' }))
    const controller = new AbortController()
    let cancelled = false
    const api = {
      getJob: async () => job('running'),
      cancelJob: async () => { cancelled = true },
    }
    const sleep = async () => { controller.abort(reason); throw Object.assign(new Error('aborted'), { name: 'AbortError' }) }
    await assert.rejects(waitForNotebookJob({ api, chatId: 'c1', job: job('running'), signal: controller.signal, sleep, storage }), { name: 'AbortError' })
    assert.equal(cancelled, cancels)
    assert.equal(readActiveJob(storage, 'c1') === null, cancels, 'only Stop forgets the job; otherwise it is resumed later')
  }
})

test('transient polling errors are retried', async () => {
  let calls = 0
  const api = {
    getJob: async () => {
      calls += 1
      if (calls < 3) throw httpError(502, '')
      return job('done', { result: { content: 'ok' } })
    },
  }
  const result = await waitForNotebookJob({ api, chatId: 'c1', job: job('running'), sleep: noSleep, storage: memoryStorage() })
  assert.equal(result.content, 'ok')
})

test('progress text and NUL stripping', () => {
  assert.deepEqual(notebookJobProgressKey({ stage: 'analyzing', chunks_done: 2, chunks_total: 5 }), { key: 'analyzing', params: { done: 2, total: 5 } })
  assert.equal(notebookJobProgressKey({ stage: 'answering' }).key, 'answering')
  assert.equal(notebookJobProgressKey(null).key, 'default')
  assert.equal(stripNul('a\u0000b'), 'ab')
})
