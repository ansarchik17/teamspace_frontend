import type { MeetTranscriptChunk } from '../../../infrastructure/meet/meetApi'

/** Below this the speech model was unsure (K5 STT confidence scale): shown dimmed. */
export const LOW_CONFIDENCE = 0.7

/** How often the live transcript panel asks QMeet for new phrases. */
export const TRANSCRIPT_POLL_MS = 3000
/** Back-off after a failed poll, so a QMeet outage does not hammer the proxy. */
export const TRANSCRIPT_RETRY_MS = 10000

const keyOf = (chunk: MeetTranscriptChunk) =>
  `${chunk.track_sid}:${chunk.track_sequence}`

/** Phrases with text, in spoken order. Empty chunks (silence, filtered noise) are dropped. */
export function orderedChunks(
  chunks: readonly MeetTranscriptChunk[] | null | undefined,
): MeetTranscriptChunk[] {
  const unique = new Map<string, MeetTranscriptChunk>()
  for (const chunk of chunks ?? []) {
    if (!chunk || !String(chunk.transcript ?? '').trim()) continue
    unique.set(keyOf(chunk), chunk)
  }
  return [...unique.values()].sort(
    (a, b) =>
      a.start_ms - b.start_ms ||
      a.track_sid.localeCompare(b.track_sid) ||
      a.track_sequence - b.track_sequence,
  )
}

/** Number of phrases in `next` that were not in `previous` (for the "new phrases" hint). */
export function countNew(
  previous: readonly MeetTranscriptChunk[],
  next: readonly MeetTranscriptChunk[],
): number {
  const seen = new Set(previous.map(keyOf))
  return next.filter((chunk) => !seen.has(keyOf(chunk))).length
}

export function speakerOf(chunk: MeetTranscriptChunk): string {
  return (
    chunk.speaker_label ||
    chunk.participant_name ||
    chunk.participant_identity ||
    ''
  ).trim()
}

/** 0:05, 12:34, 1:02:03 — offset from the meeting (or recording) start. */
export function formatOffset(ms: number | null | undefined): string {
  const total = Math.max(0, Math.floor((ms ?? 0) / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`
}

/** Where a phrase sits on the recording; null when the meeting has no recording timeline. */
export function playbackSeconds(chunk: MeetTranscriptChunk): number | null {
  const ms = chunk.playback_ms ?? null
  return ms === null || ms < 0 ? null : ms / 1000
}

export function isLowConfidence(chunk: MeetTranscriptChunk): boolean {
  return (
    typeof chunk.confidence === 'number' && chunk.confidence < LOW_CONFIDENCE
  )
}

export function languageBadge(chunk: MeetTranscriptChunk): string {
  const code = (chunk.language || '').toLowerCase()
  return code === 'ru' || code === 'kk' || code === 'en'
    ? code.toUpperCase()
    : ''
}

/** Plain-text transcript for download: "[mm:ss] Speaker: text" per line. */
export function transcriptToText(
  chunks: readonly MeetTranscriptChunk[],
): string {
  return orderedChunks(chunks)
    .map((chunk) => {
      const speaker = speakerOf(chunk)
      return `[${formatOffset(chunk.start_ms)}] ${speaker ? `${speaker}: ` : ''}${chunk.transcript.trim()}`
    })
    .join('\n')
}

/** Index of the phrase being heard at `seconds` of the recording, or -1. */
export function activeChunkIndex(
  chunks: readonly MeetTranscriptChunk[],
  seconds: number,
): number {
  let active = -1
  chunks.forEach((chunk, index) => {
    const start = playbackSeconds(chunk)
    if (start !== null && start <= seconds + 0.25) active = index
  })
  return active
}
