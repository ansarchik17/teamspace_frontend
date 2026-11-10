import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import { DEFAULT_NOTE_FILTERS, NOTE_PERIOD_LABELS, NOTE_TYPE_LABELS, type NoteFilters } from './noteFilters'
import { nt } from './notesText'

interface Props {
  filters: NoteFilters
  onApply: (filters: NoteFilters) => void
  onClose: () => void
  anchorRef: RefObject<HTMLButtonElement | null>
}

export default function NotesFiltersDropdown({ filters, onApply, onClose, anchorRef }: Props) {
  const [draft, setDraft] = useState(filters)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useLayoutEffect(() => {
    const update = () => {
      const anchor = anchorRef.current
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      if (!rect.width || !rect.height) { closeRef.current(); return }
      setPosition({ top: rect.bottom + 8, left: rect.right - 320 })
    }
    update()
    const observer = new ResizeObserver(update)
    if (anchorRef.current) observer.observe(anchorRef.current)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [anchorRef])
  useEffect(() => {
    panelRef.current?.querySelector('select')?.focus({ preventScroll: true })
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panelRef.current?.contains(target) && !anchorRef.current?.contains(target)) closeRef.current()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeRef.current()
      anchorRef.current?.focus({ preventScroll: true })
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [anchorRef])
  // Portal avoids clipping by the scrollable notes list. CSS viewport bounds
  // also keep the panel usable on narrow screens and at browser zoom levels.
  const top = `clamp(8px, ${position.top}px, calc(100dvh - 180px))`
  return createPortal(
    <div ref={panelRef} id="notes-filters-dropdown" role="dialog" aria-labelledby="notes-filters-heading" className="studio-ui notes-filters-dropdown"
      style={{ top, left: `clamp(8px, ${position.left}px, calc(100vw - 328px))`, maxHeight: `calc(100dvh - ${top} - 8px)` }}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null
        if (next && !event.currentTarget.contains(next) && !anchorRef.current?.contains(next)) onClose()
      }}>
      <div className="notes-filters-heading">
        <h3 id="notes-filters-heading">{nt('filtersDropdown.t00')}</h3>
        <button type="button" className="action-icon" aria-label={nt('filtersDropdown.t01')} onClick={() => { onClose(); anchorRef.current?.focus() }}><MaterialSymbol name="close" size={18} /></button>
      </div>
      <form className="notes-filters-form" onSubmit={(event) => { event.preventDefault(); onApply(draft) }}>
        <p className="notes-filters-description">{nt('filtersDropdown.t02')}</p>
        <label>
          {nt('filtersDropdown.t03')}
          <select aria-label={nt('filtersDropdown.t03')} value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as NoteFilters['type'] })}>
            {Object.entries(NOTE_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          {nt('filtersDropdown.t04')}
          <select aria-label={nt('filtersDropdown.t04')} value={draft.period} onChange={(event) => setDraft({ ...draft, period: event.target.value as NoteFilters['period'] })}>
            {Object.entries(NOTE_PERIOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="notes-filters-checkbox">
          <input type="checkbox" checked={draft.pinnedOnly} onChange={(event) => setDraft({ ...draft, pinnedOnly: event.target.checked })} />
          {nt('filtersDropdown.t05')}
        </label>
        <div className="notes-filters-actions">
          <button type="button" className="editor-btn" onClick={() => setDraft({ ...DEFAULT_NOTE_FILTERS })}>{nt('filtersDropdown.t06')}</button>
          <button type="submit" className="primary-btn">{nt('filtersDropdown.t07')}</button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
