import { useId } from 'react'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import { nt } from './notesText'

type Props = {
  mode: 'notes' | 'meeting-ai' | 'archive' | 'trash'
  hasSearch: boolean
  hasFilters: boolean
  hasFolder: boolean
  busy: boolean
  onCreateNote: () => void
  onCreateFolder: () => void
  onReset: () => void
}

export default function NotesEmptyState({ mode, hasSearch, hasFilters, hasFolder, busy, onCreateNote, onCreateFolder, onReset }: Props) {
  const gradientId = useId()
  const narrowed = hasSearch || hasFilters
  const canCreate = !narrowed && mode === 'notes'
  const title = narrowed ? nt('empty.t00') : mode === 'trash' ? nt('empty.t01') : mode === 'archive' ? nt('empty.t02') : hasFolder ? nt('empty.t03') : nt('empty.t04')
  const description = narrowed
    ? nt('empty.t05')
    : mode === 'trash' ? nt('empty.t06')
      : mode === 'archive' ? nt('empty.t07')
        : hasFolder ? nt('empty.t08')
          : nt('empty.t09')

  return (
    <div className="notes-empty-state">
      <svg className="notes-empty-illustration" width="168" height="142" viewBox="0 0 168 142" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="42" y1="16" x2="135" y2="132" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F0F4FA" />
            <stop offset="1" stopColor="#E1E8F3" />
          </linearGradient>
        </defs>
        <rect x="27" y="28" width="84" height="104" rx="11" transform="rotate(-9 27 28)" fill="#CCDAF0" />
        <rect x="40" y="14" width="94" height="112" rx="12" fill={`url(#${gradientId})`} />
        <path d="M61 40H94M61 60H113M61 80H90" stroke="#A1B3CD" strokeWidth="5" strokeLinecap="round" />
        <path d="M145 45L158 38M147 54H164M145 63L159 70" stroke="#4285FF" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <div role="status" className="notes-empty-copy">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {canCreate && <div className="notes-empty-actions">
        <button type="button" className="notes-empty-primary" disabled={busy} onClick={onCreateNote}><MaterialSymbol name="add" size={18} />{nt('empty.t10')}</button>
        {!hasFolder && <button type="button" className="notes-empty-secondary" disabled={busy} onClick={onCreateFolder}><MaterialSymbol name="folder" size={18} />{nt('empty.t11')}</button>}
      </div>}
      {narrowed && <div className="notes-empty-actions"><button type="button" className="notes-empty-secondary" disabled={busy} onClick={onReset}>{nt('empty.t12')}</button></div>}
    </div>
  )
}
