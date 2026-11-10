import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, FileInput, Plug, Settings } from 'lucide-react'
import { AXIS_UI } from '../../../shared/ui/axisTokens'

const tools = [
  { label: 'Интеграции', path: '/crm/integrations', icon: Plug },
  { label: 'Импорт и экспорт', path: '/crm/data', icon: FileInput },
  { label: 'Настройки CRM', path: '/crm/settings', icon: Settings },
]

export default function CrmTools() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={root} className="relative shrink-0" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
    }}>
      <button ref={trigger} type="button" className={AXIS_UI.secondaryButton}
        aria-expanded={open} aria-controls="crm-tools" onClick={() => setOpen((value) => !value)}>
        <Settings size={16} /> Инструменты <ChevronDown size={14} />
      </button>
      {open && (
        <div id="crm-tools" className="absolute right-0 top-[calc(100%+8px)] z-30 w-56 rounded-[8px] border border-[#E2E5EA] bg-white p-1 shadow-[0_8px_24px_rgba(23,32,46,0.12)]">
          {tools.map(({ label, path, icon: Icon }) => (
            <button key={path} type="button" onClick={() => { setOpen(false); navigate(path) }}
              className={`flex h-10 w-full items-center gap-2 rounded-[6px] px-3 text-left text-[14px] text-[#17202E] hover:bg-[#F6F7F9] ${AXIS_UI.focus}`}>
              <Icon size={16} className="text-[#586174]" /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
