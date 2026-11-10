import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Bookmark, LoaderCircle } from 'lucide-react'

export default function FavoriteToggle({ label, active, pending = false, onToggle, className = '' }: {
  label: string; active: boolean; pending?: boolean; onToggle: () => void; className?: string
}) {
  const [position, setPosition] = useState<{top: number; left: number} | null>(null)
  const text = active ? 'Убрать из избранного' : 'Добавить в избранное'
  const show = (button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect()
    setPosition({top: Math.min(rect.bottom + 8, window.innerHeight - 40), left: Math.max(8, Math.min(rect.left, window.innerWidth - 220))})
  }
  return <>
    <button type="button" data-no-tooltip disabled={pending} aria-label={`${text}: ${label}`} aria-pressed={active}
      className={`flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/95 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2458D3] disabled:opacity-60 ${active ? 'text-[#2458D3]' : 'text-[#61769C] hover:text-[#2458D3]'} ${className}`}
      onMouseEnter={event => show(event.currentTarget)} onMouseLeave={() => setPosition(null)}
      onFocus={event => show(event.currentTarget)} onBlur={() => setPosition(null)}
      onClick={event => { event.stopPropagation(); setPosition(null); onToggle() }}>
      {pending ? <LoaderCircle size={20} className="animate-spin" /> : <Bookmark size={22} strokeWidth={1.75} fill={active ? 'currentColor' : 'none'} />}
    </button>
    {position && createPortal(<div role="tooltip" className="pointer-events-none fixed z-[10000] whitespace-nowrap rounded-lg bg-[#17202E] px-3 py-2 text-xs text-white shadow-lg" style={position}>{text}</div>, document.body)}
  </>
}
