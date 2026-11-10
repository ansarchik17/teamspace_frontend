import { useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, EyeOff, Folder, Mail, MessageSquareDot, Plus, UserRound } from 'lucide-react'
import type { ChatFolder } from '../../../domain/entities/Chat'
import { mt } from './messengerText'

interface ChatListFiltersProps {
  filter: 'all' | 'personal'
  unreadOnly: boolean
  unreadCount: number
  hiddenGroupsCount: number
  onOpenHiddenGroups: () => void
  folders: ChatFolder[]
  selectedFolderId: string | null
  folderUnreadCounts: Record<string, number>
  onFilterChange: (filter: 'all' | 'personal') => void
  onToggleUnread: () => void
  onFolderChange: (id: string | null) => void
  onCreateFolder: () => void
}

const formatCount = (count: number) => count > 99 ? '99+' : count

export default function ChatListFilters(props: ChatListFiltersProps) {
  const [open, setOpen] = useState<'chats' | 'folders' | null>(null)
  const chatsButton = useRef<HTMLButtonElement>(null)
  const foldersButton = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const selectedFolder = props.folders.find((folder) => folder.id === props.selectedFolderId)

  useLayoutEffect(() => {
    if (!open) return
    const anchor = (open === 'chats' ? chatsButton : foldersButton).current
    const popup = menu.current
    if (!anchor || !popup) return

    const position = () => {
      const rect = anchor.getBoundingClientRect()
      const width = Math.min(260, document.documentElement.clientWidth - 24)
      const viewportHeight = document.documentElement.clientHeight
      const below = viewportHeight - rect.bottom - 16
      const above = rect.top - 16
      const height = Math.min(popup.scrollHeight, 340)
      const upwards = below < height && above > below
      popup.style.width = `${width}px`
      popup.style.left = `${Math.max(12, Math.min(open === 'folders' ? rect.right - width : rect.left, document.documentElement.clientWidth - width - 12))}px`
      popup.style.maxHeight = `${Math.max(0, Math.min(340, upwards ? above : below))}px`
      popup.style.top = upwards ? 'auto' : `${rect.bottom + 7}px`
      popup.style.bottom = upwards ? `${viewportHeight - rect.top + 7}px` : 'auto'
    }
    position()
    const observer = new ResizeObserver(position)
    observer.observe(anchor)
    observer.observe(popup)
    popup.querySelector<HTMLButtonElement>('[aria-checked="true"], button')?.focus({ preventScroll: true })
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!popup.contains(target) && !chatsButton.current?.contains(target) && !foldersButton.current?.contains(target)) setOpen(null)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(null)
        anchor.focus({ preventScroll: true })
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      observer.disconnect()
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [open])

  const choose = (action: () => void) => {
    const anchor = (open === 'chats' ? chatsButton : foldersButton).current
    setOpen(null)
    anchor?.focus({ preventScroll: true })
    action()
  }

  return (
    <div className="messenger-list-filters">
      <button ref={chatsButton} type="button" className="messenger-filter-button" aria-haspopup="menu" aria-expanded={open === 'chats'} aria-controls={open === 'chats' ? menuId : undefined} onClick={() => setOpen(open === 'chats' ? null : 'chats')}>
        <span>{props.filter === 'personal' ? mt('chatListFilters.t00') : mt('chatListFilters.t01')}</span><ChevronDown size={16} />
      </button>
      <button type="button" className="messenger-filter-button messenger-unread-filter" aria-label={mt('chatListFilters.t02')} aria-pressed={props.unreadOnly} onClick={props.onToggleUnread}>
        <MessageSquareDot size={16} className="messenger-unread-filter__icon" aria-hidden="true" /><span>{mt('chatListFilters.t02')}</span>{props.unreadCount > 0 ? <span className="messenger-filter-count">{formatCount(props.unreadCount)}</span> : null}
      </button>
      <button ref={foldersButton} type="button" className="messenger-filter-button messenger-folders-filter" aria-label={selectedFolder ? mt('filters.foldersSelected', { name: selectedFolder.name }) : mt('chatListFilters.t03')} aria-haspopup="menu" aria-expanded={open === 'folders'} aria-controls={open === 'folders' ? menuId : undefined} data-selected={Boolean(selectedFolder)} onClick={() => setOpen(open === 'folders' ? null : 'folders')}>
        <Folder size={19} />
      </button>
      {open ? createPortal(
        <div ref={menu} id={menuId} role="menu" aria-label={open === 'chats' ? mt('chatListFilters.t04') : mt('chatListFilters.t05')} className="messenger-filter-menu" onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== chatsButton.current && event.relatedTarget !== foldersButton.current) setOpen(null)
        }} onKeyDown={(event) => {
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'))
          const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
          buttons[next]?.focus()
        }}>
          {open === 'chats' ? <>{(['all', 'personal'] as const).map((filter) => (
            <button key={filter} type="button" role="menuitemradio" aria-checked={props.filter === filter} onClick={() => choose(() => props.onFilterChange(filter))}>
              {filter === 'all' ? <Mail size={20} /> : <UserRound size={20} />}<span>{filter === 'all' ? mt('chatListFilters.t01') : mt('chatListFilters.t00')}</span>{props.filter === filter ? <Check size={21} className="messenger-filter-check" /> : null}
            </button>
          ))}
            <div role="separator" className="messenger-filter-divider" />
            <button type="button" role="menuitem" onClick={() => choose(props.onOpenHiddenGroups)}>
              <EyeOff size={20} /><span>{mt('chatListFilters.t06')}</span>
              {props.hiddenGroupsCount > 0 ? <span className="messenger-filter-count">{formatCount(props.hiddenGroupsCount)}</span> : null}
            </button>
          </> : <>
            <button type="button" role="menuitemradio" aria-checked={!props.selectedFolderId} onClick={() => choose(() => props.onFolderChange(null))}><Mail size={20} /><span>{mt('chatListFilters.t07')}</span>{!props.selectedFolderId ? <Check size={21} className="messenger-filter-check" /> : null}</button>
            {props.folders.map((folder) => (
              <button key={folder.id} type="button" role="menuitemradio" aria-checked={props.selectedFolderId === folder.id} onClick={() => choose(() => props.onFolderChange(folder.id))}>
                <Folder size={20} /><span>{folder.name}</span>{props.folderUnreadCounts[folder.id] > 0 ? <span className="messenger-filter-count">{formatCount(props.folderUnreadCounts[folder.id])}</span> : null}{props.selectedFolderId === folder.id ? <Check size={21} className="messenger-filter-check" /> : null}
              </button>
            ))}
            {props.folders.length === 0 ? <p className="messenger-filter-empty">{mt('chatListFilters.t08')}</p> : null}
            <div role="separator" className="messenger-filter-divider" />
            <button type="button" role="menuitem" onClick={() => choose(props.onCreateFolder)}><Plus size={20} /><span>{mt('chatListFilters.t09')}</span></button>
          </>}
        </div>, document.body,
      ) : null}
    </div>
  )
}
