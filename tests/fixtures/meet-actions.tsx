import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { initI18n } from '../../src/shared/i18n/i18n'
import MeetRecordDetails from '../../src/presentation/pages/meet/MeetRecordDetails'
import '../../src/index.css'
import '../../src/shared/ui/teamspace.css'

await initI18n()
const meeting = {
  id: '11111111-1111-4111-8111-111111111111', title: 'Обсуждение спецификации', status: 'completed',
  started_at: '2026-11-02T05:00:00Z', completed_at: '2026-11-02T06:00:00Z', agenda: null, transcript: '',
  chunks: [{ track_sid: 'track', track_sequence: 1, participant_identity: 'user-1', participant_name: 'Айдар', start_ms: 1000, end_ms: 2000, transcript: 'Я подготовлю спецификацию до пятницы.' }],
}
createRoot(document.getElementById('root')!).render(<BrowserRouter basename="/web"><MeetRecordDetails meeting={meeting} formatDate={value => value} onClose={() => undefined} /></BrowserRouter>)
