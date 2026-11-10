import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Note, NoteFolder } from '../../../domain/entities/Note'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import { docOf, textOf, titleOf } from './noteDocumentUtils'
import { nt } from './notesText'
import { formatDate } from '../../../shared/i18n'

export type NoteRowAction = 'pin' | 'archive' | 'delete' | 'restore' | 'move'

export default function NotesListRow({ note, folders, selected, busy, onOpen, onAction }: {
  note: Note; folders: NoteFolder[]; selected: boolean; busy: boolean
  onOpen: () => void; onAction: (action: NoteRowAction, folderId?: string | null) => void
}) {
  const [menu, setMenu] = useState<{ left: number; top: number } | null>(null)
  const [moving, setMoving] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const folder = folders.find((item) => item.id === note.folder_id)
  const title = titleOf(note)
  const preview = textOf(docOf(note)).replace(/\s+/g, ' ').trim() || nt('row.t00')
  const close = () => { setMenu(null); trigger.current?.focus() }
  useEffect(() => {
    if (!menu) return
    popup.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    const outside = (event: PointerEvent) => {
      if (!popup.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setMenu(null)
    }
    const dismiss = () => setMenu(null)
    const scroll = (event: Event) => { if (!popup.current?.contains(event.target as Node)) setMenu(null) }
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', scroll, true)
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', dismiss); window.removeEventListener('scroll', scroll, true) }
  }, [menu, moving])
  const action = (name: NoteRowAction, id?: string | null) => { close(); onAction(name, id) }
  return <div className={`notes-list-row ${selected ? 'is-active' : ''}`}>
    <button type="button" className="notes-row-open" data-note-id={note.id} aria-label={nt('row.openNamed', { title })} aria-current={selected ? 'true' : undefined} onClick={onOpen} disabled={busy}>
      <MaterialSymbol name={note.type === 'checklist' ? 'checklist' : 'description'} size={23} />
      <span className="notes-row-copy"><span className="notes-row-title"><span>{title}</span>{note.is_pinned && <MaterialSymbol name="push_pin" size={13} />}</span><span className="notes-row-preview">{preview}</span></span>
      {folder && <span className="notes-row-folder" style={{ color: folder.color || '#1687FF', background: `${folder.color || '#1687FF'}14` }}>{folder.name}</span>}
      <time className="notes-row-date" dateTime={note.updated_at}>{formatDate(new Date(note.updated_at), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
    </button>
    <button ref={trigger} type="button" className="notes-row-more" data-tooltip={nt('row.t01')} aria-label={nt('row.actionsNamed', { title })} aria-haspopup="menu" aria-expanded={!!menu} disabled={busy} onClick={() => {
      if (menu) { close(); return }
      const rect = trigger.current!.getBoundingClientRect()
      setMoving(false)
      setMenu({ left: rect.right - 224, top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 280)) })
    }}><MaterialSymbol name="more_horiz" size={21} /></button>
    {menu && createPortal(<div ref={popup} className="notes-row-menu" role="menu" aria-label={nt('row.t02')} style={{ left: `clamp(8px, ${menu.left}px, calc(100vw - 232px))`, top: menu.top, maxHeight: `min(320px, calc(100dvh - ${menu.top + 8}px))` }} onKeyDown={(event) => {
      if (event.key === 'Escape') { event.stopPropagation(); close() }
      if (event.key === 'Tab') setMenu(null)
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        const buttons = Array.from(popup.current!.querySelectorAll<HTMLButtonElement>('button'))
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
        buttons[next]?.focus()
      }
    }}>
      {moving ? <>
        <button role="menuitem" onClick={() => setMoving(false)}><MaterialSymbol name="chevron_left" size={18} />{nt('row.t03')}</button>
        <button role="menuitem" onClick={() => action('move', null)}><MaterialSymbol name="folder" size={18} />{nt('row.t04')}</button>
        {folders.map((item) => <button key={item.id} role="menuitem" onClick={() => action('move', item.id)}><MaterialSymbol name="folder" size={18} color={item.color || '#1687FF'} /><span>{item.name}</span></button>)}
      </> : <>
        <button role="menuitem" onClick={() => { close(); onOpen() }}><MaterialSymbol name="description" size={18} />{nt('row.t05')}</button>
        {note.is_deleted ? <button role="menuitem" onClick={() => action('restore')}><MaterialSymbol name="restore" size={18} />{nt('row.t06')}</button> : <>
          <button role="menuitem" onClick={() => action('pin')}><MaterialSymbol name="push_pin" size={18} />{note.is_pinned ? nt('row.t07') : nt('row.t08')}</button>
          <button role="menuitem" onClick={() => setMoving(true)}><MaterialSymbol name="folder" size={18} />{nt('row.t09')}</button>
          <button role="menuitem" onClick={() => action('archive')}><MaterialSymbol name="archive" size={18} />{note.is_archived ? nt('row.t10') : nt('row.t11')}</button>
          <button role="menuitem" className="is-danger" onClick={() => action('delete')}><MaterialSymbol name="delete" size={18} />{nt('row.t12')}</button>
        </>}
      </>}
    </div>, document.body)}
  </div>
}
