import { useEffect, useRef, useState } from 'react'
import type { HttpGrowyPlatformRepository } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { growyErrorMessage } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import AppButton from '../../../shared/ui/AppButton'
import { ErrorNotice, Field } from './growyUi'
import { dateLabel, inputClass } from './growyShared'

interface Calling { status?: string; callIconVisibility?: string; callbackPermissionStatus?: string; callHours?: { status?: string; timezoneId?: string; weeklyOperatingHours?: { dayOfWeek: string; openTime: string; closeTime: string }[] } }
interface State { last_status: { calling?: Calling } | null; last_status_at: string | null }
const days: Record<string, string> = { MONDAY: 'Пн', TUESDAY: 'Вт', WEDNESDAY: 'Ср', THURSDAY: 'Чт', FRIDAY: 'Пт', SATURDAY: 'Сб', SUNDAY: 'Вс' }
const asTime = (value?: string) => value && /^\d{4}$/.test(value) ? `${value.slice(0, 2)}:${value.slice(2)}` : value || ''
export default function WhatsAppCallingSettings({ repository }: { repository: HttpGrowyPlatformRepository }) {
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const [hours, setHours] = useState(false)
  const [timezone, setTimezone] = useState('Asia/Almaty')
  const [selectedDays, setSelectedDays] = useState(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'])
  const [openTime, setOpenTime] = useState('09:00')
  const [closeTime, setCloseTime] = useState('18:00')
  const [icon, setIcon] = useState(true)
  const [callback, setCallback] = useState(true)
  const locked = useRef(false)
  useEffect(() => {
    const controller = new AbortController()
    repository.request<State>('whatsapp/calling/', { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return
      setState(result)
      const calling = result.last_status?.calling
      if (calling) {
        setIcon(calling.callIconVisibility !== 'HIDDEN'); setCallback(calling.callbackPermissionStatus !== 'DISABLED')
        setHours(calling.callHours?.status === 'ENABLED')
        if (calling.callHours?.timezoneId) setTimezone(calling.callHours.timezoneId)
        const weekly = calling.callHours?.weeklyOperatingHours
        if (weekly?.length) { setSelectedDays(weekly.map((item) => item.dayOfWeek)); setOpenTime(asTime(weekly[0].openTime)); setCloseTime(asTime(weekly[0].closeTime)) }
      }
    }).catch((error) => { if (!controller.signal.aborted) setError(growyErrorMessage(error)) })
    return () => controller.abort()
  }, [repository, revision])
  const change = async (enabled?: boolean) => {
    if (locked.current) return
    if (enabled && hours && (!selectedDays.length || !openTime || !closeTime || openTime >= closeTime)) { setError('Выберите дни и время работы. Время закрытия должно быть позже открытия.'); return }
    if (enabled && hours) {
      try { new Intl.DateTimeFormat('ru', { timeZone: timezone }).format(new Date()) }
      catch { setError('Укажите корректный часовой пояс, например Asia/Almaty.'); return }
    }
    locked.current = true; setBusy(true); setError(''); setNotice('')
    try {
      if (enabled === undefined) {
        await repository.request('whatsapp/calling/status/', { method: 'POST', body: '{}' })
        setNotice('Статус запрошен. Нажмите «Обновить» после ответа провайдера.')
      } else {
        await repository.request('whatsapp/calling/', { method: 'POST', body: JSON.stringify({ calling: enabled ? {
          status: 'ENABLED', callIconVisibility: icon ? 'DEFAULT' : 'HIDDEN', callbackPermissionStatus: callback ? 'ENABLED' : 'DISABLED', srtpKeyExchangeProtocol: 'DTLS',
          callHours: { status: hours ? 'ENABLED' : 'DISABLED', ...(hours ? { timezoneId: timezone, weeklyOperatingHours: selectedDays.map((dayOfWeek) => ({ dayOfWeek, openTime: openTime.replace(':', ''), closeTime: closeTime.replace(':', '') })) } : {}) },
        } : { status: 'DISABLED' } }) })
        setNotice('Изменение отправлено. Текущий статус подтвердится ответом провайдера.')
      }
    } catch (error) { setError(growyErrorMessage(error)) }
    finally { locked.current = false; setBusy(false) }
  }
  const status = state?.last_status?.calling?.status
  return <section className="space-y-4 rounded-xl border border-[#DDE3EE] bg-white p-5"><h2 className="font-bold text-[#0A1628]">Звонки WhatsApp Business</h2><p className="text-sm text-[#374C6B]">Подтверждённый статус: {status === 'ENABLED' ? 'Включены' : status === 'DISABLED' ? 'Выключены' : 'Пока не получен'}</p>{state?.last_status_at && <p className="text-xs text-[#8497B4]">Последний ответ: {dateLabel(state.last_status_at)}</p>}{error && <ErrorNotice message={error} />}{notice && <p role="status" className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">{notice}</p>}<fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={icon} onChange={(event) => setIcon(event.target.checked)} />Показывать значок звонка</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={callback} onChange={(event) => setCallback(event.target.checked)} />Разрешать обратный звонок</label><label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={hours} onChange={(event) => setHours(event.target.checked)} />Принимать звонки только в рабочее время</label>{hours && <><Field label="Часовой пояс"><input className={inputClass} value={timezone} onChange={(event) => setTimezone(event.target.value)} /></Field><div className="flex flex-wrap items-center gap-3">{Object.entries(days).map(([key, label]) => <label key={key} className="flex gap-1 text-sm"><input type="checkbox" checked={selectedDays.includes(key)} onChange={(event) => setSelectedDays((current) => event.target.checked ? [...current, key] : current.filter((day) => day !== key))} />{label}</label>)}</div><Field label="Начало работы"><input className={inputClass} type="time" value={openTime} onChange={(event) => setOpenTime(event.target.value)} /></Field><Field label="Окончание работы"><input className={inputClass} type="time" value={closeTime} onChange={(event) => setCloseTime(event.target.value)} /></Field></>}</fieldset><div className="flex flex-wrap gap-2"><AppButton disabled={busy} isLoading={busy} onClick={() => void change(true)}>Включить и сохранить</AppButton><AppButton variant="secondary" disabled={busy} onClick={() => void change(false)}>Выключить</AppButton><AppButton variant="secondary" disabled={busy} onClick={() => void change()}>Запросить статус</AppButton><AppButton variant="secondary" disabled={busy} onClick={() => { setError(''); setRevision((value) => value + 1) }}>Обновить</AppButton></div></section>
}
