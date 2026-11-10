import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface FloatingMenuProps {
  anchor: HTMLElement | null
  open: boolean
  onClose: () => void
  align?: 'start' | 'end'
  className?: string
  children: ReactNode
}

const GAP = 6
const MARGIN = 8

export default function FloatingMenu({ anchor, open, onClose, align = 'end', className = '', children }: FloatingMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !anchor) return
    const place = () => {
      const rect = anchor.getBoundingClientRect()
      const menu = menuRef.current
      const width = menu?.offsetWidth ?? 0
      const height = menu?.offsetHeight ?? 0
      let left = align === 'end' ? rect.right - width : rect.left
      left = Math.max(MARGIN, Math.min(left, window.innerWidth - width - MARGIN))
      let top = rect.bottom + GAP
      if (top + height > window.innerHeight - MARGIN && rect.top - GAP - height > MARGIN) top = rect.top - GAP - height
      setPosition({ top, left })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [align, anchor, open])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || anchor?.contains(target)) return
      onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [anchor, onClose, open])

  if (!open || !anchor) return null

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      onClick={(event) => event.stopPropagation()}
      style={{ position: 'fixed', top: position?.top ?? -9999, left: position?.left ?? -9999, visibility: position ? 'visible' : 'hidden' }}
      className={`z-[10050] min-w-[200px] overflow-hidden rounded-lg bg-white py-1.5 shadow-[0_1px_2px_rgba(60,64,67,0.3),0_2px_6px_2px_rgba(60,64,67,0.15)] ${className}`}
    >
      {children}
    </div>,
    document.body,
  )
}

export const floatingMenuItemClass = 'flex min-h-9 w-full items-center gap-3 px-4 py-1.5 text-left text-[14px] text-[#1F1F1F] transition-colors hover:bg-[#F1F3F4] disabled:pointer-events-none disabled:opacity-40'
export const floatingMenuDangerClass = 'flex min-h-9 w-full items-center gap-3 px-4 py-1.5 text-left text-[14px] text-[#D93025] transition-colors hover:bg-[#FCE8E6] disabled:pointer-events-none disabled:opacity-40'
