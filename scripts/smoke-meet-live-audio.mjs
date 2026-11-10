// Opt-in only: requires a session from an explicitly authorized test meeting.
// Never log the session or copy its tokens to an artifact.
import { readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const sessionFile = process.env.MEET_SMOKE_SESSION_FILE
const audioFile = process.env.MEET_SMOKE_AUDIO_FILE
const duration = Number(process.env.MEET_SMOKE_AUDIO_SECONDS)
if (!sessionFile || !audioFile || !Number.isFinite(duration) || duration <= 0 || duration > 300) throw new Error('Set authorized session file, audio file and duration (max 300 seconds)')
const session = JSON.parse(readFileSync(sessionFile, 'utf8'))
const root = fileURLToPath(new URL('..', import.meta.url))
const server = await createServer({ root, configLoader: 'runner', cacheDir: '/tmp/meet-live-audio-vite-cache', server: { host: '127.0.0.1', port: 5197, strictPort: true, fs: { allow: [root, realpathSync(`${root}/node_modules`)] } } })
await server.listen()
const browser = await chromium.launch({ headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${audioFile}`] })
try {
  const page = await browser.newPage()
  const diagnostics = await page.context().newCDPSession(page)
  await diagnostics.send('Network.enable')
  diagnostics.on('Network.webSocketHandshakeResponseReceived', event => console.log(`signal_handshake_status=${event.response.status}`))
  diagnostics.on('Network.webSocketFrameError', event => console.log(`signal_transport_error=${String(event.errorMessage).slice(0, 180)}`))
  await page.goto('http://127.0.0.1:5197/web/tests/fixtures/meet-live-audio.html')
  await page.waitForFunction(() => typeof window.runMeetingAudio === 'function')
  await page.evaluate(async value => { await window.runMeetingAudio(value) }, { livekit_url: session.livekit_url, participant_token: session.participant_token })
  console.log('synthetic_audio_publisher_connected')
  const start = Date.now()
  while ((Date.now() - start) / 1000 < duration) {
    await page.waitForTimeout(Math.min(30000, Math.max(1, duration * 1000 - (Date.now() - start))))
    console.log(`synthetic_audio_elapsed_seconds=${Math.round((Date.now() - start) / 1000)}`)
  }
  await page.evaluate(async () => { await window.stopMeetingAudio() })
  console.log('synthetic_audio_publisher_disconnected')
} catch (error) {
  const safeMessage = String(error?.message || error).replace(/eyJ[A-Za-z0-9_.-]+/g, '[redacted-token]').replace(/access_token=[^&\s]+/g, 'access_token=[redacted]')
  console.error(`synthetic_audio_smoke_failed: ${safeMessage.slice(0, 700)}`)
  process.exitCode = 1
} finally { await browser.close(); await server.close() }
