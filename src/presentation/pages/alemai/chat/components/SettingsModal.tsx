import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BellRing, Check, Info, Plus, Trash2 } from 'lucide-react'
import { ChatNotice } from './ChatNotice'
import AppModal from '../../../../../shared/ui/AppModal'
import AppSelect from '../../../../../shared/ui/AppSelect'
import AppTimePicker from '../../../../../shared/ui/AppTimePicker'
import BoardDatePicker from '../../../../components/board/BoardDatePicker'
import { toDayKey } from '../../../../components/calendar/MiniCalendar'
import type { AlemAiProfile, AlemAiReminder } from '../../../../../infrastructure/repositories/HttpAlemAiRepository'
import { createReminder, deleteReminder, getProfile, listReminders, markReminderDone, updateProfile } from '../api/client'
import { BTN_PRIMARY, BTN_SECONDARY, CHAT_FOCUS, FIELD, ICON_BTN, LABEL } from '../chatUi'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  token: string
  onProfileUpdated: (profile: AlemAiProfile) => void
}

const STYLES = [
  { value: 'friendly', key: 'styleFriendly' },
  { value: 'professional', key: 'styleProfessional' },
  { value: 'concise', key: 'styleConcise' },
  { value: 'detailed', key: 'styleDetailed' },
] as const
const PERSONAS = [
  { value: 'default', key: 'personaDefault' },
  { value: 'expert', key: 'personaExpert' },
  { value: 'coach', key: 'personaCoach' },
  { value: 'creative', key: 'personaCreative' },
] as const

const isNotFound = (error: unknown) => Boolean(error && typeof error === 'object' && 'status' in error && (error as { status?: number }).status === 404)
  || (error instanceof Error && (error.message === 'Not Found' || error.message.includes('404')))

const DEFAULT_PROFILE: AlemAiProfile = {
  assistant_name: '',
  response_style: 'friendly',
  persona_preset: 'default',
  chat_accent_color: '#2458D3',
  chat_background_type: 'default',
  chat_background_value: '',
}

export default function SettingsModal({ isOpen, onClose, token, onProfileUpdated }: SettingsModalProps) {
  const { t, i18n } = useTranslation('ai')
  const [tab, setTab] = useState<'assistant' | 'reminders'>('assistant')
  const [profile, setProfile] = useState<AlemAiProfile>(DEFAULT_PROFILE)
  const [reminders, setReminders] = useState<AlemAiReminder[]>([])
  const [reminderText, setReminderText] = useState('')
  const [reminderDay, setReminderDay] = useState(() => toDayKey(new Date()))
  const [reminderTime, setReminderTime] = useState('10:00')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen || !token) return
    let alive = true
    setLoading(true)
    setError('')
    setTab('assistant')
    void Promise.all([
      getProfile(token).then((data) => {
        if (!alive || !data) return
        setProfile({ ...DEFAULT_PROFILE, ...data })
        onProfileUpdated(data)
      }).catch((err: unknown) => {
        if (alive && !isNotFound(err)) setError(err instanceof Error ? err.message : t('chat.actionFailed'))
      }),
      listReminders(token).then((data) => { if (alive && data) setReminders(data) }).catch(() => undefined),
    ]).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [isOpen, token, onProfileUpdated, t])

  if (!isOpen) return null

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const saved = await updateProfile(token, { ...profile, assistant_name: profile.assistant_name.trim() })
      if (saved) onProfileUpdated(saved)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('chat.actionFailed'))
    } finally {
      setSaving(false)
    }
  }
  const reload = async () => setReminders(await listReminders(token))
  const addReminder = async () => {
    if (!reminderText.trim()) { setError(t('chat.reminderTextRequired')); return }
    if (!reminderDay || !reminderTime) { setError(t('chat.reminderDateRequired')); return }
    const [year, month, day] = reminderDay.split('-').map(Number)
    const [hours, minutes] = reminderTime.split(':').map(Number)
    try {
      setError('')
      await createReminder(token, reminderText.trim(), new Date(year, month - 1, day, hours, minutes).toISOString())
      setReminderText('')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('chat.actionFailed'))
    }
  }
  const reminderAction = async (task: () => Promise<void>) => {
    try { setError(''); await task(); await reload() } catch (err) { setError(err instanceof Error ? err.message : t('chat.actionFailed')) }
  }
  const locale = i18n.language === 'kk' ? 'kk-KZ' : 'ru-RU'
  const active = reminders.filter((item) => item.status !== 'done')

  return <AppModal title={t('chat.settings')} onClose={() => { if (!saving) onClose() }} maxWidth={540} animated closeOnBackdrop
    footer={tab === 'assistant' ? <><button type="button" className={BTN_SECONDARY} onClick={onClose} disabled={saving}>{t('chat.cancel')}</button><button type="button" className={BTN_PRIMARY} onClick={() => void save()} disabled={saving || loading}>{t('chat.save')}</button></> : undefined}>
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label={t('chat.settings')} className="-mt-3 flex gap-5 border-b border-[#EEF0F3]">
        {(['assistant', 'reminders'] as const).map((id) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
          className={`-mb-px inline-flex h-10 items-center gap-1.5 border-b-2 text-[14px] transition-colors ${tab === id ? 'border-[#2458D3] font-medium text-[#17202E]' : 'border-transparent text-[#586174] hover:text-[#17202E]'} ${CHAT_FOCUS}`}>
          {id === 'assistant' ? t('chat.settingsAssistant') : t('chat.settingsReminders')}
          {id === 'reminders' && active.length > 0 && <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#F1F3F6] px-1 text-[11px] font-semibold tabular-nums text-[#465066]">{active.length}</span>}
        </button>)}
      </div>

      {tab === 'assistant' && (loading
        ? <div className="space-y-4" role="status" aria-label={t('chat.settings')}>{[40, 40, 40].map((height, index) => <div key={index} className="animate-pulse rounded-[10px] bg-[#F1F3F6]" style={{ height }} />)}</div>
        : <>
          <label className={LABEL}>{t('chat.assistantName')}
            <input className={FIELD} value={profile.assistant_name} placeholder={t('chat.settingsAssistant')} maxLength={60} onChange={(event) => setProfile({ ...profile, assistant_name: event.target.value })} />
            <span className="text-[12px] font-normal text-[#7B8494]">{t('chat.assistantNameHint')}</span>
          </label>
          <fieldset>
            <legend className="mb-2 text-[13px] font-medium text-[#465066]">{t('chat.responseStyle')}</legend>
            <div role="radiogroup" aria-label={t('chat.responseStyle')} className="grid grid-cols-2 gap-1 rounded-xl bg-[#F1F3F6] p-1 sm:grid-cols-4">
              {STYLES.map((item) => {
                const on = profile.response_style === item.value
                return <button key={item.value} type="button" role="radio" aria-checked={on} onClick={() => setProfile({ ...profile, response_style: item.value })}
                  className={`h-[34px] rounded-[9px] text-[13px] transition-[background-color,box-shadow,color] duration-200 ${on ? 'bg-white font-medium text-[#17202E] shadow-[0_1px_2px_rgba(16,24,40,0.10)]' : 'text-[#586174] hover:text-[#17202E]'} ${CHAT_FOCUS}`}>{t(`chat.${item.key}`)}</button>
              })}
            </div>
          </fieldset>
          <div className={LABEL}>
            <span>{t('chat.persona')}</span>
            <AppSelect portal showButtonAvatar={false} showOptionAvatar={false} value={profile.persona_preset} onChange={(value: string) => setProfile({ ...profile, persona_preset: value })} ariaLabel={t('chat.persona')}
              options={PERSONAS.map((item) => ({ value: item.value, label: t(`chat.${item.key}`) }))} />
          </div>
          <p className="flex gap-2.5 rounded-xl bg-[#F6F7F9] px-3.5 py-3 text-[13px] leading-5 text-[#465066]"><Info size={16} className="mt-0.5 shrink-0 text-[#2458D3]" />{t('chat.settingsScope')}</p>
        </>)}

      {tab === 'reminders' && <>
        <div className="flex flex-col gap-2.5 rounded-xl border border-[#EBEEF3] p-3.5">
          <label className={LABEL}><span className="sr-only">{t('chat.reminderText')}</span>
            <input className={FIELD} value={reminderText} placeholder={t('chat.reminderText')} maxLength={300} onChange={(event) => setReminderText(event.target.value)} />
          </label>
          <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_130px_auto]">
            <BoardDatePicker value={reminderDay} onChange={setReminderDay} ariaLabel={t('chat.reminderWhen')} />
            <AppTimePicker value={reminderTime} onChange={setReminderTime} buttonClassName="!h-10" />
            <button type="button" className={BTN_PRIMARY} onClick={() => void addReminder()}><Plus size={16} />{t('chat.addReminder')}</button>
          </div>
        </div>
        {active.length === 0
          ? <p className="flex flex-col items-center gap-2 py-6 text-center text-[14px] text-[#586174]"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F1F3F6] text-[#7B8494]"><BellRing size={18} /></span>{t('chat.remindersEmpty')}</p>
          : <ul className="overflow-hidden rounded-xl border border-[#E6EAF1]">
            {active.map((item) => <li key={item.id} className="flex items-center gap-3 border-b border-[#EEF0F3] px-3.5 py-2.5 last:border-b-0">
              <span className="min-w-0 flex-1"><span className="block truncate text-[14px] text-[#17202E]">{item.text}</span>
                <span className="block text-[12px] tabular-nums text-[#586174]">{new Date(item.due_at).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></span>
              <button type="button" aria-label={t('chat.reminderDone')} title={t('chat.reminderDone')} onClick={() => void reminderAction(() => markReminderDone(token, item.id))} className={ICON_BTN}><Check size={16} /></button>
              <button type="button" aria-label={t('chat.reminderDelete')} title={t('chat.reminderDelete')} onClick={() => void reminderAction(() => deleteReminder(token, item.id))} className={ICON_BTN}><Trash2 size={16} /></button>
            </li>)}
          </ul>}
      </>}

      {error && <ChatNotice message={error} onClose={() => setError('')} />}
    </div>
  </AppModal>
}
