import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  Publication,
  PublicationAcknowledgement,
  PublicationBannerColor,
  PublicationBroadcastStats,
} from '../../../infrastructure/repositories/HttpPublicationRepository'
import { HttpPublicationRepository } from '../../../infrastructure/repositories/HttpPublicationRepository'
import AppModal from '../../../shared/ui/AppModal'
import GradientAvatar from '../../../shared/ui/GradientAvatar'
import { notifyPublicationBannersChanged } from '../../../shared/news/publicationBannerEvents'

interface PublicationAlertsModalProps {
  publication: Publication
  repository: HttpPublicationRepository
  onClose: () => void
  onChanged: () => void
}

const BANNER_COLORS: Array<{ value: PublicationBannerColor; label: string; color: string }> = [
  { value: 'urgent', label: 'Срочно', color: '#E11D48' },
  { value: 'warning', label: 'Внимание', color: '#D97706' },
  { value: 'info', label: 'Информация', color: '#2563EB' },
  { value: 'primary', label: 'Основной', color: '#2458D3' },
]

const ACK_LIMIT = 20

const toLocalInput = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const toIso = (value: string) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

const formatDate = (value?: string | null) => value
  ? new Date(value).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '—'

const isActive = (flag?: boolean, until?: string | null) => Boolean(flag) && (!until || new Date(until).getTime() > Date.now())

const inputClass = 'h-9 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px] text-[#0A1628] outline-none transition focus:border-[#2458D3] focus:ring-1 focus:ring-[#2458D3]'
const primaryButton = 'h-9 rounded-xl bg-[#2458D3] px-4 text-[12.5px] font-semibold text-white transition hover:bg-[#253CB1] disabled:opacity-50'
const ghostButton = 'h-9 rounded-xl border border-[#DDE3EE] px-4 text-[12.5px] font-semibold text-[#475569] transition hover:bg-[#F8FAFC] disabled:opacity-50'

function Section({ title, status, children }: { title: string; status?: string; children: ReactNode }) {
  return (
    <section className="border-b border-[#F1F4F9] py-4 last:border-b-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="text-[13px] font-bold text-[#0A1628]">{title}</h4>
        {status ? <span className="text-[11px] font-semibold text-[#8497B4]">{status}</span> : null}
      </div>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-semibold text-[#64748B]">{label}</span>
      {children}
    </label>
  )
}

export default function PublicationAlertsModal({ publication, repository, onClose, onChanged }: PublicationAlertsModalProps) {
  const [pinned, setPinned] = useState(isActive(publication.is_pinned, publication.pinned_until))
  const [pinnedUntil, setPinnedUntil] = useState(toLocalInput(publication.pinned_until))
  const [bannerOn, setBannerOn] = useState(isActive(publication.is_banner, publication.banner_until))
  const [bannerUntil, setBannerUntil] = useState(toLocalInput(publication.banner_until))
  const [bannerText, setBannerText] = useState(publication.banner_action_text || '')
  const [bannerUrl, setBannerUrl] = useState(publication.banner_action_url || '')
  const [bannerColor, setBannerColor] = useState<PublicationBannerColor>(publication.banner_color || 'urgent')
  const [sendPush, setSendPush] = useState(true)
  const [sendEmail, setSendEmail] = useState(publication.importance === 'urgent')
  const [force, setForce] = useState(false)
  const [stats, setStats] = useState<PublicationBroadcastStats | null>(null)
  const [statsError, setStatsError] = useState('')
  const [acknowledgements, setAcknowledgements] = useState<PublicationAcknowledgement[]>([])
  const [ackTotal, setAckTotal] = useState(0)
  const [ackPage, setAckPage] = useState(1)
  const [ackLoading, setAckLoading] = useState(false)
  const [busy, setBusy] = useState<'pin' | 'banner' | 'broadcast' | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadStats = useCallback(async () => {
    try {
      setStats(await repository.getPublicationBroadcastStats(publication.id))
      setStatsError('')
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : 'Не удалось загрузить статистику')
    }
  }, [publication.id, repository])

  const loadAcknowledgements = useCallback(async (page: number) => {
    setAckLoading(true)
    try {
      const result = await repository.getPublicationAcknowledgements(publication.id, page, ACK_LIMIT)
      setAcknowledgements((current) => page === 1 ? result.items : [...current, ...result.items])
      setAckTotal(result.total)
      setAckPage(page)
    } catch (err) {
      console.warn('Failed to load publication acknowledgements', err)
    } finally {
      setAckLoading(false)
    }
  }, [publication.id, repository])

  useEffect(() => {
    void loadStats()
    void loadAcknowledgements(1)
  }, [loadAcknowledgements, loadStats])

  const run = async (kind: 'pin' | 'banner' | 'broadcast', action: () => Promise<void>, success: string) => {
    setBusy(kind)
    setError('')
    setMessage('')
    try {
      await action()
      setMessage(success)
      onChanged()
      notifyPublicationBannersChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось выполнить действие')
    } finally {
      setBusy(null)
    }
  }

  const savePin = () => run('pin', async () => {
    await repository.pinPublication(publication.id, toIso(pinnedUntil))
    setPinned(true)
  }, 'Публикация закреплена')

  const removePin = () => run('pin', async () => {
    await repository.unpinPublication(publication.id)
    setPinned(false)
    setPinnedUntil('')
  }, 'Публикация откреплена')

  const saveBanner = () => {
    const url = bannerUrl.trim()
    if (url && !url.startsWith('/') && !/^https:\/\//i.test(url)) {
      setError('Ссылка должна начинаться с https:// или с / для страницы внутри системы')
      return
    }
    void run('banner', async () => {
      await repository.setPublicationBanner(publication.id, {
        is_banner: true,
        banner_until: toIso(bannerUntil),
        banner_action_text: bannerText.trim() || null,
        banner_action_url: url || null,
        banner_color: bannerColor,
      })
      setBannerOn(true)
    }, 'Баннер сохранён')
  }

  const removeBanner = () => run('banner', async () => {
    await repository.removePublicationBanner(publication.id)
    setBannerOn(false)
  }, 'Баннер отключён')

  const sendBroadcast = () => run('broadcast', async () => {
    await repository.broadcastPublication(publication.id, { send_push: sendPush, send_email: sendEmail, force })
    await loadStats()
  }, 'Рассылка отправлена')

  return (
    <AppModal title="Важное оповещение" onClose={onClose} maxWidth={560}>
      <div className="max-h-[72vh] overflow-y-auto px-5 pb-2" style={{ fontFamily: 'var(--ts-font)' }}>
        <p className="truncate pt-4 text-[12px] text-[#8497B4]">{publication.title}</p>
        {error ? <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div> : null}
        {message ? <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700">{message}</div> : null}

        <Section title="Закрепление в ленте" status={pinned ? 'Закреплена' : 'Не закреплена'}>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1">
              <Field label="Закрепить до (необязательно)">
                <input type="datetime-local" value={pinnedUntil} onChange={(event) => setPinnedUntil(event.target.value)} className={inputClass} />
              </Field>
            </div>
            <button type="button" disabled={busy !== null} onClick={() => void savePin()} className={primaryButton}>{pinned ? 'Обновить' : 'Закрепить'}</button>
            {pinned ? <button type="button" disabled={busy !== null} onClick={() => void removePin()} className={ghostButton}>Открепить</button> : null}
          </div>
        </Section>

        <Section title="Баннер поверх страниц" status={bannerOn ? 'Показывается' : 'Выключен'}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Текст кнопки">
              <input value={bannerText} maxLength={100} onChange={(event) => setBannerText(event.target.value)} placeholder="Ознакомиться" className={inputClass} />
            </Field>
            <Field label="Показывать до (необязательно)">
              <input type="datetime-local" value={bannerUntil} onChange={(event) => setBannerUntil(event.target.value)} className={inputClass} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Ссылка кнопки (необязательно)">
                <input value={bannerUrl} maxLength={500} onChange={(event) => setBannerUrl(event.target.value)} placeholder="https://… или /news/…" className={inputClass} />
              </Field>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {BANNER_COLORS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={bannerColor === option.value}
                onClick={() => setBannerColor(option.value)}
                className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[12px] font-semibold transition ${bannerColor === option.value ? 'border-[#2458D3] bg-[#EEF2FF] text-[#2458D3]' : 'border-[#ECEEF3] text-[#64748B] hover:bg-[#F8FAFC]'}`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: option.color }} />
                {option.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-[#8497B4]">
            {publication.requires_acknowledgement ? 'Баннер будет виден, пока сотрудник не нажмёт «Ознакомлен».' : 'Сотрудник сможет закрыть баннер.'}
          </p>
          <div className="mt-3 flex justify-end gap-2">
            {bannerOn ? <button type="button" disabled={busy !== null} onClick={() => void removeBanner()} className={ghostButton}>Отключить</button> : null}
            <button type="button" disabled={busy !== null} onClick={saveBanner} className={primaryButton}>{bannerOn ? 'Сохранить' : 'Включить баннер'}</button>
          </div>
        </Section>

        <Section title="Рассылка" status={stats?.last_broadcast_at ? `Последняя: ${formatDate(stats.last_broadcast_at)}` : 'Ещё не отправлялась'}>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-[#374151]">
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={sendPush} onChange={(event) => setSendPush(event.target.checked)} /> Push-уведомление</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={sendEmail} onChange={(event) => setSendEmail(event.target.checked)} /> Email</label>
            <label className="inline-flex items-center gap-2" title="Без этого повторная отправка в течение 5 минут блокируется"><input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} /> Отправить повторно</label>
            <button type="button" disabled={busy !== null || (!sendPush && !sendEmail)} onClick={() => void sendBroadcast()} className={`${primaryButton} ml-auto`}>{busy === 'broadcast' ? 'Отправка…' : 'Отправить'}</button>
          </div>
          {statsError ? <p className="mt-3 text-[12px] text-red-700">{statsError}</p> : null}
          {stats ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: 'Получателей', value: stats.total_target_users },
                  { label: 'Push', value: stats.sent_push_count },
                  { label: 'Email', value: stats.sent_email_count },
                  { label: 'Ознакомились', value: `${stats.acknowledged_count} · ${Math.round(stats.acknowledgement_percent)}%` },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-[#ECEEF3] px-3 py-2">
                    <div className="text-[11px] text-[#8497B4]">{item.label}</div>
                    <div className="mt-0.5 text-[15px] font-bold text-[#0A1628]">{item.value}</div>
                  </div>
                ))}
              </div>
              {stats.broadcasts.length > 0 ? (
                <ul className="mt-3 space-y-1.5">
                  {stats.broadcasts.slice(0, 5).map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#64748B]">
                      <span>{formatDate(item.sent_at)}</span>
                      <span>Push {item.sent_push_count} · Email {item.sent_email_count}{item.status && item.status !== 'completed' ? ` · ${item.status}` : ''}</span>
                      {item.error_message ? <span className="w-full text-red-700">{item.error_message}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
        </Section>

        <Section title="Ознакомились" status={String(ackTotal)}>
          {acknowledgements.length === 0 ? (
            <p className="text-[12px] text-[#8497B4]">{ackLoading ? 'Загрузка…' : 'Пока никто не подтвердил ознакомление.'}</p>
          ) : (
            <ul className="space-y-2">
              {acknowledgements.map((item, itemIndex) => (
                <li key={`${item.user_id}-${itemIndex}`} className="flex items-center gap-3">
                  <GradientAvatar initials={item.full_name.slice(0, 2).toUpperCase()} src={item.avatar_url} size={28} seed={item.user_id} />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#0A1628]">{item.full_name}</span>
                  <span className="shrink-0 text-[12px] text-[#8497B4]">{formatDate(item.acknowledged_at)}</span>
                </li>
              ))}
            </ul>
          )}
          {acknowledgements.length < ackTotal ? (
            <button type="button" disabled={ackLoading} onClick={() => void loadAcknowledgements(ackPage + 1)} className="mt-3 text-[12px] font-semibold text-[#2458D3] hover:underline disabled:opacity-50">Показать ещё</button>
          ) : null}
        </Section>
      </div>
    </AppModal>
  )
}
