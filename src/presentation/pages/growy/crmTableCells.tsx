import type { ReactNode } from 'react'
import { UserRound } from 'lucide-react'
import type { CrmRecord } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import AxisAvatar from '../../components/board/AxisAvatar'
import { recordName } from './growyShared'

const initialsOf = (name: string) => /^[+\d<]/.test(name.trim()) ? '' : name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('')

export function Muted({ children = '—' }: { children?: ReactNode }) {
  return <span className="text-[#8A93A5]">{children}</span>
}

export function NameCell({ record, subtitle, icon }: { record: CrmRecord; subtitle?: ReactNode; icon?: ReactNode }) {
  const name = recordName(record)
  const letters = icon ? '' : initialsOf(name)
  return <div className="flex min-w-0 items-center gap-3">
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EDF1FE] text-[12px] font-semibold text-[#2446D1]">
      {icon || letters || <UserRound size={16} />}
    </span>
    <span className="min-w-0">
      <span className="block truncate font-semibold text-[#17202E]" title={name}>{name}</span>
      {subtitle && <span className="block truncate text-[12px] text-[#586174]">{subtitle}</span>}
    </span>
  </div>
}

export function Chip({ label, bg, color, dot }: { label: string; bg: string; color: string; dot?: string }) {
  return <span className="inline-flex h-[22px] max-w-full items-center gap-1.5 truncate rounded-[6px] px-2 text-[12px] font-medium" style={{ backgroundColor: bg, color }}>
    {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />}
    <span className="truncate">{label}</span>
  </span>
}

export function Person({ record, empty }: { record: CrmRecord; empty: string }) {
  const person = record.assigned_to || record.manager
  const name = person?.full_name || person?.name || ''
  if (!person) return <Muted>{empty}</Muted>
  return <span className="flex min-w-0 items-center gap-2">
    <AxisAvatar initials={initialsOf(name) || String(person.id).slice(-2)} size={24} seed={person.id} title={name} />
    <span className="truncate">{name}</span>
  </span>
}

