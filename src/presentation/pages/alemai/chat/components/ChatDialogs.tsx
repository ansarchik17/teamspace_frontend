import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Archive, Check, Clock, Folder, Plus, Search, Trash2 } from 'lucide-react'
import AppModal from '../../../../../shared/ui/AppModal'
import { ChatNotice } from './ChatNotice'
import { useUserAILimits } from '../../../../alemai/useUserAILimits'
import { type AIQuotaWindow, isAIQuotaWindowExhausted } from '../../../../../domain/entities/UserAILimits'
import { formatDate, formatTime } from '../../../../../shared/i18n/format'
import type { AlemAiChatSection, AlemAiChatSectionInput } from '../../../../../infrastructure/repositories/HttpAlemAiRepository'
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, CHAT_FOCUS, FIELD, LABEL, SECTION_COLORS, sectionTone, usedPercent } from '../chatUi'

export function UsageRing({ value, size = 18 }: { value: number | null; size?: number }) {
  const stroke = 2.5
  const radius = (size - stroke) / 2
  const length = 2 * Math.PI * radius
  const used = value === null ? 0 : Math.max(0, Math.min(100, value))
  const color = value === null ? '#C3C9D4' : used >= 85 ? '#C5301B' : used >= 50 ? '#E07B00' : '#2458D3'
  return <svg aria-hidden="true" width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
    <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#E6EAF1" strokeWidth={stroke} />
    <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
      strokeDasharray={length} strokeDashoffset={length * (1 - used / 100)} className="transition-[stroke-dashoffset] duration-500" />
  </svg>
}

function DialogError({ message }: { message: string }) {
  if (!message) return null
  return <ChatNotice message={message} />
}

export function RenameChatDialog({ name, busy, error, onClose, onSave }: { name: string; busy: boolean; error: string; onClose: () => void; onSave: (name: string) => void }) {
  const { t } = useTranslation('ai')
  const [value, setValue] = useState(name)
  const submit = (event: FormEvent) => { event.preventDefault(); if (value.trim()) onSave(value.trim()) }
  return <AppModal title={t('chat.renameTitle')} onClose={() => { if (!busy) onClose() }} maxWidth={440} animated closeOnBackdrop
    footer={<><button type="button" className={BTN_SECONDARY} onClick={onClose} disabled={busy}>{t('chat.cancel')}</button><button type="submit" form="ai-rename-form" className={BTN_PRIMARY} disabled={busy || !value.trim() || value.trim() === name}>{t('chat.save')}</button></>}>
    <form id="ai-rename-form" onSubmit={submit} className="flex flex-col gap-4">
      <label className={LABEL}>{t('chat.nameLabel')}<input className={FIELD} value={value} maxLength={200} onChange={(event) => setValue(event.target.value)} autoFocus /></label>
      <DialogError message={error} />
    </form>
  </AppModal>
}

export function DangerDialog({ title, text, hint, confirmText, busy, error, onClose, onConfirm, onArchive }: {
  title: string; text: string; hint?: string; confirmText: string; busy: boolean; error: string; onClose: () => void; onConfirm: () => void; onArchive?: () => void
}) {
  const { t } = useTranslation('ai')
  return <AppModal title={title} onClose={() => { if (!busy) onClose() }} maxWidth={460} animated closeOnBackdrop
    footer={<>
      <button type="button" className={BTN_SECONDARY} onClick={onClose} disabled={busy}>{t('chat.cancel')}</button>
      {onArchive && <button type="button" className={BTN_SECONDARY} onClick={onArchive} disabled={busy}>{t('chat.toArchive')}</button>}
      <button type="button" className={BTN_DANGER} onClick={onConfirm} disabled={busy}>{confirmText}</button>
    </>}>
    <div className="flex flex-col gap-4">
      <div className="flex gap-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FDECEC] text-[#C5301B]"><Trash2 size={19} strokeWidth={1.8} /></span>
        <p className="pt-0.5 text-[14px] leading-[22px] text-[#465066]">{text}</p>
      </div>
      {hint && <p className="flex gap-2.5 rounded-xl bg-[#F6F7F9] px-3.5 py-3 text-[13px] leading-5 text-[#465066]"><Archive size={16} strokeWidth={1.8} className="mt-0.5 shrink-0 text-[#2458D3]" />{hint}</p>}
      <DialogError message={error} />
    </div>
  </AppModal>
}

export function MoveChatDialog({ chatName, currentSectionId, sections, busy, error, onClose, onMove, onCreateSection }: {
  chatName: string; currentSectionId: string | null; sections: AlemAiChatSection[]; busy: boolean; error: string
  onClose: () => void; onMove: (sectionId: string | null) => void; onCreateSection: () => void
}) {
  const { t } = useTranslation('ai')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(currentSectionId)
  const normalized = query.trim().toLowerCase()
  const rows: { id: string | null; name: string; meta: string; color: string }[] = [
    { id: null, name: t('chat.noSection'), meta: t('chat.noSectionHint'), color: '#586174' },
    ...sections.map((section) => ({ id: section.id, name: section.name, meta: section.chat_count === null ? section.description : t('chat.chatsCount', { count: section.chat_count }), color: section.color })),
  ].filter((row) => !normalized || row.name.toLowerCase().includes(normalized))
  return <AppModal title={t('chat.moveTitle')} onClose={() => { if (!busy) onClose() }} maxWidth={480} animated closeOnBackdrop
    footer={<div className="flex w-full items-center justify-between gap-2">
      <button type="button" onClick={onCreateSection} className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-[14px] font-medium text-[#2458D3] hover:bg-[#EDF2FF] ${CHAT_FOCUS}`}><Plus size={16} />{t('chat.newSection')}</button>
      <div className="flex gap-2">
        <button type="button" className={BTN_SECONDARY} onClick={onClose} disabled={busy}>{t('chat.cancel')}</button>
        <button type="button" className={BTN_PRIMARY} onClick={() => onMove(selected)} disabled={busy || selected === currentSectionId}>{t('chat.moveConfirm')}</button>
      </div>
    </div>}>
    <div className="flex flex-col gap-3">
      <p className="-mt-2 truncate text-[13px] text-[#586174]">«{chatName}»</p>
      <label className="flex h-10 items-center gap-2 rounded-[10px] border border-[#E2E5EA] px-3 text-[#586174] focus-within:border-[#2458D3]">
        <Search size={16} strokeWidth={1.8} /><span className="sr-only">{t('chat.findSection')}</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('chat.findSection')} className="min-w-0 flex-1 bg-transparent text-[14px] text-[#17202E] outline-none placeholder:text-[#7B8494]" />
      </label>
      <div role="radiogroup" aria-label={t('chat.moveTitle')} className="-mx-2 flex max-h-[320px] flex-col gap-0.5 overflow-y-auto px-2">
        {rows.map((row) => {
          const on = row.id === selected
          const tone = sectionTone(row.color)
          return <button key={row.id ?? 'none'} type="button" role="radio" aria-checked={on} onClick={() => setSelected(row.id)}
            className={`flex min-h-[52px] items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition-colors ${on ? 'border-[#C9D6FB] bg-[#F5F8FF]' : 'border-transparent hover:bg-[#F6F7F9]'} ${CHAT_FOCUS}`}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]" style={{ background: tone.soft, color: tone.color }}><Folder size={16} strokeWidth={1.8} /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-medium text-[#17202E]">{row.name}{row.id === currentSectionId && <span className="ml-1.5 text-[12px] font-normal text-[#7B8494]">· {t('chat.current')}</span>}</span>{row.meta && <span className="block truncate text-[12px] text-[#586174]">{row.meta}</span>}</span>
            <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${on ? 'border-[#2458D3]' : 'border-[#C3C9D4]'}`}>{on && <span className="h-2 w-2 rounded-full bg-[#2458D3]" />}</span>
          </button>
        })}
      </div>
      <DialogError message={error} />
    </div>
  </AppModal>
}

export function SectionDialog({ section, busy, error, onClose, onSave }: {
  section?: AlemAiChatSection | null; busy: boolean; error: string; onClose: () => void; onSave: (input: AlemAiChatSectionInput) => void
}) {
  const { t } = useTranslation('ai')
  const [name, setName] = useState(section?.name ?? '')
  const [description, setDescription] = useState(section?.description ?? '')
  const [color, setColor] = useState(section?.color ?? SECTION_COLORS[0])
  const tone = sectionTone(color)
  const submit = (event: FormEvent) => { event.preventDefault(); if (name.trim()) onSave({ name: name.trim(), description: description.trim(), color }) }
  return <AppModal title={section ? t('chat.editSection') : t('chat.newSection')} onClose={() => { if (!busy) onClose() }} maxWidth={480} animated closeOnBackdrop
    footer={<><button type="button" className={BTN_SECONDARY} onClick={onClose} disabled={busy}>{t('chat.cancel')}</button><button type="submit" form="ai-section-form" className={BTN_PRIMARY} disabled={busy || !name.trim()}>{section ? t('chat.save') : t('chat.createSection')}</button></>}>
    <form id="ai-section-form" onSubmit={submit} className="flex flex-col gap-[18px]">
      <label className={LABEL}>{t('chat.nameLabel')}<input className={FIELD} value={name} maxLength={80} placeholder={t('chat.sectionNamePlaceholder')} onChange={(event) => setName(event.target.value)} autoFocus /></label>
      <label className={LABEL}><span>{t('chat.sectionDescription')} <span className="font-normal text-[#7B8494]">· {t('chat.optional')}</span></span>
        <textarea rows={3} value={description} maxLength={300} placeholder={t('chat.sectionDescriptionPlaceholder')} onChange={(event) => setDescription(event.target.value)} className={`${FIELD} h-auto resize-none py-2.5 leading-5`} />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[13px] font-medium text-[#465066]">{t('chat.sectionColor')}</legend>
        <div className="flex gap-2.5">{SECTION_COLORS.map((value) => <button key={value} type="button" aria-pressed={value === color} aria-label={value} onClick={() => setColor(value)}
          className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors ${CHAT_FOCUS}`} style={{ borderColor: value === color ? value : 'transparent' }}>
          <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-white" style={{ background: value }}>{value === color && <Check size={13} strokeWidth={3} />}</span>
        </button>)}</div>
      </fieldset>
      <div className="flex items-center gap-3 rounded-xl bg-[#F6F7F9] p-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px]" style={{ background: tone.soft, color: tone.color }}><Folder size={18} strokeWidth={1.8} /></span>
        <span className="min-w-0"><span className="block truncate text-[14px] font-medium text-[#17202E]">{name.trim() || t('chat.sectionNamePlaceholder')}</span><span className="block text-[12px] text-[#586174]">{t('chat.sectionPreview')}</span></span>
      </div>
      <DialogError message={error} />
    </form>
  </AppModal>
}

function LimitWindow({ title, window, weekly }: { title: string; window: AIQuotaWindow | null | undefined; weekly?: boolean }) {
  const { t } = useTranslation('ai')
  if (!window) return null
  const used = usedPercent(window)
  const color = used === null ? '#C3C9D4' : used >= 85 ? '#C5301B' : used >= 50 ? '#E07B00' : '#2458D3'
  const endsAt = window.period?.endsAt ? new Date(window.period.endsAt) : null
  const reset = endsAt && !Number.isNaN(endsAt.getTime())
    ? (new Date().toDateString() === endsAt.toDateString() && !weekly ? t('limits.resetsAt', { time: formatTime(endsAt) }) : t('limits.resetsOn', { date: formatDate(endsAt, { day: 'numeric', month: 'long' }), time: formatTime(endsAt) }))
    : window.state === 'active' ? t('limits.periodPending') : ''
  const status = window.state === 'unconfigured' || window.limitMicrocredits === null ? t('limits.statusUnconfigured')
    : window.state === 'disabled' || window.limitMicrocredits === '0' ? t('limits.statusDisabled')
      : isAIQuotaWindowExhausted(window) ? t('limits.statusExhausted') : null
  return <div className="flex flex-col gap-2.5 rounded-[14px] border border-[#EBEEF3] p-4">
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2.5 text-[14px] font-medium text-[#17202E]"><UsageRing value={used} size={20} />{title}</span>
      <span className="text-[13px] tabular-nums text-[#586174]">{status ?? t('chat.limitsUsed', { value: `${used}%` })}</span>
    </div>
    <div role="meter" aria-label={title} aria-valuenow={used ?? 0} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-[#EEF1F5]">
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${used ?? 0}%`, background: color }} />
    </div>
    {reset && <p className="flex items-center gap-1.5 text-[12px] text-[#586174]"><Clock size={13} />{reset}</p>}
  </div>
}

export function LimitsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('ai')
  const { limits, loading, error } = useUserAILimits()
  const blocked = limits?.access ? !limits.access.canStartRequest : false
  return <AppModal title={t('chat.limits')} onClose={onClose} maxWidth={480} animated closeOnBackdrop
    footer={<button type="button" className={BTN_PRIMARY} onClick={onClose}>{t('chat.understood')}</button>}>
    <div className="flex flex-col gap-3">
      {limits && <span className={`inline-flex h-[22px] w-fit items-center gap-1.5 rounded-md px-2 text-[12px] font-medium ${blocked ? 'bg-[#FFF1E6] text-[#9A3412]' : 'bg-[#EDF8F1] text-[#16734B]'}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{blocked ? t('limits.accessBlocked') : t('limits.accessGranted')}</span>}
      <p className="text-[14px] leading-[22px] text-[#586174]">{t('chat.limitsText')}</p>
      {limits && !blocked && <p className="text-[12px] leading-[18px] text-[#7B8494]">{t('limits.requestSizeHint')}</p>}
      {loading && !limits ? <div className="space-y-3" role="status" aria-label={t('limits.loading')}>{[0, 1].map((index) => <div key={index} className="h-[96px] animate-pulse rounded-[14px] bg-[#F1F3F6] motion-reduce:animate-none" />)}</div>
        : error && !limits ? <ChatNotice message={t('limits.error')} />
          : <>
            <LimitWindow title={t('limits.fiveHourFull')} window={limits?.fiveHour} />
            <LimitWindow title={t('limits.weeklyFull')} window={limits?.weekly} weekly />
          </>}
    </div>
  </AppModal>
}
