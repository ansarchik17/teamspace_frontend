import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import ts from 'typescript'

const source = readFileSync(
  new URL('../src/presentation/pages/meet/meetTranscript.ts', import.meta.url),
  'utf8',
)
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
})
const {
  activeChunkIndex,
  countNew,
  formatOffset,
  isLowConfidence,
  languageBadge,
  orderedChunks,
  playbackSeconds,
  speakerOf,
  transcriptToText,
} = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
)

const chunk = (overrides) => ({
  track_sid: 'TR_a',
  track_sequence: 0,
  participant_identity: 'user-1',
  participant_name: 'Айгерим',
  start_ms: 0,
  end_ms: 1000,
  transcript: 'сәлеметсіздер ме',
  ...overrides,
})

test('orders phrases by when they were spoken across participants', () => {
  const rows = orderedChunks([
    chunk({ track_sid: 'TR_b', start_ms: 9000, transcript: 'второй' }),
    chunk({ start_ms: 2000, transcript: 'первый' }),
    chunk({ track_sequence: 1, start_ms: 15000, transcript: 'третий' }),
  ])
  assert.deepEqual(
    rows.map((row) => row.transcript),
    ['первый', 'второй', 'третий'],
  )
})

test('drops silent chunks and keeps one copy of a re-delivered phrase', () => {
  const rows = orderedChunks([
    chunk({ transcript: '   ' }),
    chunk({ track_sequence: 1, transcript: 'бір' }),
    chunk({ track_sequence: 1, transcript: 'бір' }),
    null,
  ])
  assert.equal(rows.length, 1)
  assert.equal(orderedChunks(undefined).length, 0)
})

test('counts only phrases that were not shown before', () => {
  const before = [chunk({})]
  const after = [
    chunk({}),
    chunk({ track_sequence: 1 }),
    chunk({ track_sid: 'TR_b' }),
  ]
  assert.equal(countNew(before, after), 2)
  assert.equal(countNew(after, after), 0)
})

test('formats offsets the way a player shows them', () => {
  assert.equal(formatOffset(0), '0:00')
  assert.equal(formatOffset(65_400), '1:05')
  assert.equal(formatOffset(3_723_000), '1:02:03')
  assert.equal(formatOffset(-5), '0:00')
  assert.equal(formatOffset(null), '0:00')
})

test('prefers the organiser label, then the name, then the identity', () => {
  assert.equal(speakerOf(chunk({ speaker_label: 'Учитель' })), 'Учитель')
  assert.equal(speakerOf(chunk({})), 'Айгерим')
  assert.equal(speakerOf(chunk({ participant_name: '' })), 'user-1')
})

test('seeks only when the phrase is on the recording timeline', () => {
  assert.equal(playbackSeconds(chunk({ playback_ms: 4500 })), 4.5)
  assert.equal(playbackSeconds(chunk({ playback_ms: null })), null)
  assert.equal(playbackSeconds(chunk({})), null)
})

test('flags unsure phrases below 0.7 and leaves unknown confidence alone', () => {
  assert.equal(isLowConfidence(chunk({ confidence: 0.55 })), true)
  assert.equal(isLowConfidence(chunk({ confidence: 0.9 })), false)
  assert.equal(isLowConfidence(chunk({ confidence: null })), false)
})

test('shows a language badge only for languages the model writes', () => {
  assert.equal(languageBadge(chunk({ language: 'kk' })), 'KK')
  assert.equal(languageBadge(chunk({ language: 'ru' })), 'RU')
  assert.equal(languageBadge(chunk({ language: 'und' })), '')
  assert.equal(languageBadge(chunk({})), '')
})

test('builds a downloadable transcript with time and speaker', () => {
  const text = transcriptToText([
    chunk({
      track_sid: 'TR_b',
      participant_name: 'Ерлан',
      start_ms: 61_000,
      transcript: 'да согласен ',
    }),
    chunk({ start_ms: 1000 }),
  ])
  assert.equal(
    text,
    '[0:01] Айгерим: сәлеметсіздер ме\n[1:01] Ерлан: да согласен',
  )
})

test('highlights the phrase being heard on the recording', () => {
  const rows = [
    chunk({ playback_ms: 0 }),
    chunk({ track_sequence: 1, playback_ms: 5000 }),
    chunk({ track_sequence: 2, playback_ms: null }),
    chunk({ track_sequence: 3, playback_ms: 12_000 }),
  ]
  assert.equal(activeChunkIndex(rows, 6), 1)
  assert.equal(activeChunkIndex(rows, 12), 3)
  assert.equal(activeChunkIndex([chunk({})], 3), -1)
})
