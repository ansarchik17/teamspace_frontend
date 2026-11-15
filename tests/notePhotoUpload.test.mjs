import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/infrastructure/repositories/HttpNoteRepository.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
const codecSource = readFileSync(new URL('../src/domain/notes/noteListCodec.ts', import.meta.url), 'utf8')
const codecExports = {}
runInNewContext(ts.transpileModule(codecSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: codecExports })
class HttpError extends Error { constructor(message, status) { super(message); this.status = status } }
const createRepo = (send) => {
  const exports = {}
  runInNewContext(outputText, { exports, FormData, File, Date, JSON, Error, encodeURIComponent, require(path) {
    if (path === 'heic2any') return { default: async () => new Blob(['jpeg data'], { type: 'image/jpeg' }) }
    if (path.endsWith('/noteListCodec')) return codecExports
    if (path.endsWith('/authorizedFetch')) return { authorizedFetch: send }
    if (path.endsWith('/HttpError')) return { HttpError, parseHttpError: async response => new HttpError('Upload failed', response.status) }
    if (path.endsWith('/normalizeBackendAssetUrl')) return { normalizeBackendAssetUrl: url => url }
    if (path.endsWith('/Note')) return { NoteVersionConflictError: class extends Error {} }
    throw new Error(`Unexpected import ${path}`)
  } })
  return new exports.HttpNoteRepository({})
}

test('note updates serialize and restore formatted table cells without dropping HTML', async () => {
  const doc = { type: 'doc', version: 1, blocks: [{ id: 'table', type: 'table', rows: [[
    { text: 'Bold', html: '<b>Bold</b>' },
    { text: '<literal>', html: '&lt;literal&gt;' },
    { text: 'Legacy text' },
  ]] }] }
  const repo = createRepo(async (_session, path, init) => {
    assert.equal(path, '/api/v1/notes/note-1')
    assert.equal(init.method, 'PATCH')
    const body = JSON.parse(init.body)
    assert.deepEqual(body.content_doc, doc)
    return Response.json({ id: 'note-1', version: 2, content_doc: body.content_doc })
  })
  const result = await repo.updateNote('note-1', { version: 1, content_doc: doc })
  assert.equal(JSON.stringify(result.content_doc), JSON.stringify(doc))
})

test('uploads through authorized notes API using multipart and server attachment ID', async () => {
  const file = new File(['png data'], 'picture.png', { type: 'image/png' })
  const calls = []
  const repo = createRepo(async (session, path, init) => {
    calls.push({ path, init })
    return new Response(JSON.stringify({ note: { id: 'note-1', version: 2, attachments: [{ file_id: 'attachment-1', download_url: '/api/v1/files/download' }] }, attachment_id: 'attachment-1' }), { status: 201 })
  })
  const result = await repo.uploadPhoto('note-1', file)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].path, '/api/v1/notes/note-1/attachments/upload')
  assert.equal(calls[0].init.method, 'POST')
  assert.equal(calls[0].init.headers, undefined, 'browser sets multipart boundary')
  assert.equal(calls[0].init.body.get('file').name, 'picture.png')
  assert.equal(result.attachmentId, 'attachment-1')
  assert.equal(result.note.attachments[0].file_id, result.attachmentId)
})

test('server upload errors propagate, without attempting direct MinIO upload', async () => {
  const repo = createRepo(async () => new Response('', { status: 403 }))
  await assert.rejects(repo.uploadPhoto('note-1', new File(['x'], 'picture.png')), error => error.status === 403)
})

test('empty and oversized files fail before a request', async () => {
  const repo = createRepo(async () => { throw new Error('must not send') })
  await assert.rejects(repo.uploadPhoto('note-1', new File([], 'empty.png')), error => error.status === 400)
  await assert.rejects(repo.uploadPhoto('note-1', new File([new Uint8Array(15 * 1024 * 1024 + 1)], 'large.png')), error => error.status === 400)
})

test('HEIC photos are converted to JPEG before multipart upload', async () => {
  const repo = createRepo(async (session, path, init) => {
    const file = init.body.get('file')
    assert.equal(file.name, 'iphone.jpg')
    assert.equal(file.type, 'image/jpeg')
    return new Response(JSON.stringify({ note: { id: 'note-1' }, attachment_id: 'photo-1' }), { status: 201 })
  })
  const result = await repo.uploadPhoto('note-1', new File(['heic data'], 'iphone.heic', { type: 'image/heic' }))
  assert.equal(result.attachmentId, 'photo-1')
})
