import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Info, X } from 'lucide-react'
import AppModal from '../../../shared/ui/AppModal'
import AppButton from '../../../shared/ui/AppButton'
import AppTimePicker from '../../../shared/ui/AppTimePicker'
import BoardDatePicker from '../../components/board/BoardDatePicker'
import { toDayKey } from '../../components/calendar/MiniCalendar'
import { AXIS_UI } from '../../../shared/ui/axisTokens'

export interface MeetMeetingDraft {
  title: string
  start: Date
  end: Date
  attendees: string[]
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DURATIONS = [15, 30, 45, 60]
const pad = (value: number) => String(value).padStart(2, '0')
const toTime = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`
const combine = (day: string, time: string) => {
  const [year, month, date] = day.split('-').map(Number)
  const [hours, minutes] = time.split(':').map(Number)
  return new Date(year, month - 1, date, hours, minutes)
}
const nextSlot = () => {
  const date = new Date()
  date.setMinutes(Math.ceil((date.getMinutes() + 1) / 30) * 30, 0, 0)
  return date
}

export default function MeetMeetingDialog({ mode, busy, error, onClose, onSubmit }: {
  mode: 'instant' | 'schedule'
  busy: boolean
  error: string
  onClose: () => void
  onSubmit: (draft: MeetMeetingDraft) => void
}) {
  const { t } = useTranslation('shell')
  const slot = nextSlot()
  const [title, setTitle] = useState('')
  const [day, setDay] = useState(() => toDayKey(slot))
  const [start, setStart] = useState(() => toTime(slot))
  const [end, setEnd] = useState(() => toTime(new Date(slot.getTime() + 30 * 60000)))
  const [emails, setEmails] = useState<string[]>([])
  const [emailInput, setEmailInput] = useState('')
  const [localError, setLocalError] = useState('')
  const schedule = mode === 'schedule'
  const minutes = day ? Math.round((combine(day, end).getTime() - combine(day, start).getTime()) / 60000) : 0

  const addEmails = (raw: string) => {
    const parts = raw.split(/[,;\s]+/).map((part) => part.trim()).filter(Boolean)
    const invalid = parts.find((part) => !EMAIL.test(part))
    if (invalid) {
      setLocalError(t('meet.form.invalidEmail', { value: invalid }))
      return false
    }
    setEmails((current) => [...new Set([...current, ...parts.map((part) => part.toLowerCase())])])
    setEmailInput('')
    setLocalError('')
    return true
  }
  const onEmailKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if ((event.key === 'Enter' || event.key === ',' || event.key === ' ') && emailInput.trim()) {
      event.preventDefault()
      addEmails(emailInput)
    }
    if (event.key === 'Backspace' && !emailInput && emails.length) setEmails((current) => current.slice(0, -1))
  }
  const setDuration = (value: number) => {
    if (!day) return
    setEnd(toTime(new Date(combine(day, start).getTime() + value * 60000)))
  }
  const changeStart = (value: string) => {
    if (day && minutes > 0) setEnd(toTime(new Date(combine(day, value).getTime() + minutes * 60000)))
    setStart(value)
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) return
    if (!schedule) {
      onSubmit({ title: title.trim(), start: new Date(), end: new Date(), attendees: [] })
      return
    }
    if (!day) { setLocalError(t('meet.form.dateRequired')); return }
    if (emailInput.trim() && !addEmails(emailInput)) return
    const startAt = combine(day, start)
    const endAt = combine(day, end)
    if (endAt <= startAt) { setLocalError(t('meet.form.endAfterStart')); return }
    setLocalError('')
    const pending = emailInput.trim() ? emailInput.split(/[,;\s]+/).map((part) => part.trim().toLowerCase()).filter(Boolean) : []
    onSubmit({ title: title.trim(), start: startAt, end: endAt, attendees: [...new Set([...emails, ...pending])] })
  }
  const message = localError || error

  return <AppModal title={schedule ? t('meet.form.scheduleTitle') : t('meet.form.newTitle')} onClose={() => { if (!busy) onClose() }} maxWidth={schedule ? 600 : 480} animated
    footer={<>
      <AppButton type="button" variant="secondary" onClick={onClose} disabled={busy}>{t('meet.form.cancel')}</AppButton>
      <AppButton type="submit" form="meet-meeting-form" isLoading={busy} disabled={busy || !title.trim()}>{busy ? t('meet.form.saving') : schedule ? t('meet.form.schedule') : t('meet.form.create')}</AppButton>
    </>}>
    <form id="meet-meeting-form" className="flex flex-col gap-5" onSubmit={submit}>
      <label className="ts-field">
        {t('meet.form.name')}
        <input className="ts-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t('meet.form.namePlaceholder')} maxLength={300} required autoFocus />
      </label>

      {schedule ? <>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="ts-field">
            <span>{t('meet.form.date')}</span>
            <BoardDatePicker value={day} onChange={setDay} placeholder={t('meet.form.pickDate')} ariaLabel={t('meet.form.date')} />
          </div>
          <div className="ts-field">
            <span>{t('meet.form.start')}</span>
            <AppTimePicker value={start} onChange={changeStart} buttonClassName="!h-10" />
          </div>
          <div className="ts-field">
            <span>{t('meet.form.end')}</span>
            <AppTimePicker value={end} onChange={setEnd} buttonClassName="!h-10" />
          </div>
        </div>
        <div className="ts-field">
          <span>{t('meet.form.duration')}</span>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((value) => <button key={value} type="button" aria-pressed={minutes === value} onClick={() => setDuration(value)}
              className={`h-8 rounded-lg border px-3 text-[13px] font-medium transition-colors duration-200 ${minutes === value ? 'border-[#C9D6FB] bg-[#F3F6FF] text-[#2458D3]' : 'border-[#E2E5EA] bg-white text-[#465066] hover:bg-[#F8F9FB]'} ${AXIS_UI.focus}`}>
              {value === 60 ? t('meet.form.hour') : t('meet.form.minutes', { value })}
            </button>)}
          </div>
        </div>
        <div className="ts-field">
          <label htmlFor="meet-participants">{t('meet.form.participants')}</label>
          <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-[var(--ts-radius-control)] border border-[var(--ts-border)] bg-white px-2 py-1.5 transition-colors focus-within:border-[#2458D3]">
            {emails.map((email) => <span key={email} className="inline-flex h-7 items-center gap-1 rounded-md bg-[#F1F3F6] pl-2 pr-1 text-[13px] font-normal text-[#17202E]">
              {email}
              <button type="button" aria-label={t('meet.form.removeParticipant', { value: email })} onClick={() => setEmails((current) => current.filter((item) => item !== email))}
                className="flex h-5 w-5 items-center justify-center rounded text-[#586174] hover:bg-[#E3E7ED] hover:text-[#17202E]"><X size={13} /></button>
            </span>)}
            <input id="meet-participants" data-ui="bare" value={emailInput} onChange={(event) => setEmailInput(event.target.value)} onKeyDown={onEmailKey} onBlur={() => { if (emailInput.trim()) addEmails(emailInput) }}
              placeholder={emails.length ? '' : t('meet.form.participantsPlaceholder')} className="h-7 min-w-[180px] flex-1 border-0 bg-transparent px-1 text-[14px] font-normal text-[#17202E] outline-none placeholder:text-[#7B8494]" />
          </div>
          <span className="text-[12px] font-normal text-[#586174]">{t('meet.form.participantsHint')}</span>
        </div>
      </> : <p className="flex gap-2.5 rounded-xl bg-[#F6F7FB] px-4 py-3 text-[13px] leading-5 text-[#465066]"><Info size={17} className="mt-0.5 shrink-0 text-[#2458D3]" />{t('meet.form.instantHint')}</p>}

      {message && <p role="alert" className="rounded-xl border border-[#F1C9C9] bg-[#FFF5F5] px-4 py-2.5 text-[13px] text-[#B32626]">{message}</p>}
    </form>
  </AppModal>
}
