import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  ChevronDown,
  CalendarDays,
  Clock3,
  Copy,
  FileText,
  History,
  Link2,
  Mic,
  MonitorUp,
  MoreHorizontal,
  MoreVertical,
  PhoneOff,
  User,
  Video,
} from 'lucide-react'
import {
  meetApi,
  type MeetEvent,
  type MeetRecord,
} from '../../../infrastructure/meet/meetApi'
import MeetAccountGate from './MeetAccountGate'
import MeetMeetingDialog from './MeetMeetingDialog'
import MeetRecordDetails from './MeetRecordDetails'
import { MeetRecentSkeleton, MeetUpcomingSkeleton } from './MeetSkeleton'
import { meetErrorMessage, meetLink, parseMeetId } from './meetUtils'
import { loadCalendarMeetEvents, withoutMeetDuplicates, type MeetCalendarEvent } from './meetCalendarEvents'
import AppToast from '../../../shared/ui/AppToast'
import FloatingMenu, { floatingMenuItemClass } from '../../../shared/ui/FloatingMenu'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import './meet.css'

const formatDate = (date: string) =>
  new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))

type Attendee = { email: string; name: string | null }
interface MeetItem {
  key: string
  title: string
  subtitle: string
  start: string
  end: string | null
  live: boolean
  attendees: Attendee[]
  meetingId: string | null
  event: MeetEvent | null
  calendar: MeetCalendarEvent | null
}
type MenuState = { anchor: HTMLElement; meetingId?: string; calendar?: MeetCalendarEvent; record?: MeetRecord }

const CARD = 'rounded-[20px] border border-[#EBEEF3] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]'
const LINK = `inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md text-[14px] font-medium text-[#2458D3] transition-colors hover:text-[#1D47B0] ${AXIS_UI.focus}`
const DOTS = ['bg-[#2458D3]', 'bg-[#16A34A]', 'bg-[#F97316]', 'bg-[#7C3AED]']
const AVATAR_TONES = ['bg-[#DCE6FF] text-[#2446D1]', 'bg-[#DDF3E6] text-[#0F7A55]', 'bg-[#FDE9D3] text-[#A85A00]', 'bg-[#ECE6FD] text-[#6545D6]']
const ICON_BUTTON = `flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#586174] transition-colors hover:bg-[#F1F3F6] hover:text-[#17202E] ${AXIS_UI.focus}`

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
const initials = (person: Attendee) => (person.name || person.email).trim().split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
const duration = (start: string, end: string | null) => {
  if (!end) return ''
  const total = Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

function Avatars({ people }: { people: Attendee[] }) {
  if (!people.length) return null
  const shown = people.slice(0, 3)
  return <div className="flex items-center">
    {shown.map((person, index) => <span key={person.email} title={person.name || person.email} className={`flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold ring-2 ring-white ${AVATAR_TONES[index % AVATAR_TONES.length]} ${index ? '-ml-2.5' : ''}`}>{initials(person)}</span>)}
    {people.length > 3 && <span className="-ml-2.5 flex h-8 min-w-8 items-center justify-center rounded-full bg-[#F1F3F6] px-1.5 text-[12px] font-medium text-[#586174] ring-2 ring-white">+{people.length - 3}</span>}
  </div>
}

function SectionHeader({ id, icon, title, action }: { id: string; icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 border-b border-[#EEF0F3] px-6 py-4">
    <h2 id={id} className="flex min-w-0 items-center gap-3 text-[17px] font-semibold text-[#17202E]">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF3FF] text-[#2458D3]">{icon}</span>
      <span className="truncate">{title}</span>
    </h2>
    {action}
  </div>
}

function CallIllustration({ label }: { label: string }) {
  return <div role="img" aria-label={label} className="relative hidden h-[200px] w-[230px] shrink-0 md:block 2xl:w-[290px]">
    <span aria-hidden="true" className="absolute -right-24 -top-24 h-[360px] w-[360px] rounded-full bg-[#E3EBFF] opacity-80" />
    <span aria-hidden="true" className="absolute -left-20 bottom-[-90px] h-[220px] w-[220px] rounded-full bg-[#EEF3FF] opacity-80" />
    <div aria-hidden="true" className="absolute left-2 right-6 top-2 h-[150px] rounded-2xl border border-white bg-white/95 p-3 shadow-[0_16px_40px_-18px_rgba(23,32,46,0.25)]">
      <div className="flex gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[#D5DBE5]" /><span className="h-1.5 w-1.5 rounded-full bg-[#D5DBE5]" /><span className="h-1.5 w-1.5 rounded-full bg-[#D5DBE5]" /></div>
      <div className="mt-2 grid h-[112px] grid-cols-[1fr_76px] gap-2">
        <div className="flex items-center justify-center rounded-xl bg-[#F3F6FF]"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#2458D3] text-white shadow-[0_8px_18px_-8px_rgba(36,88,211,0.7)]"><User size={26} /></span></div>
        <div className="grid gap-2">
          <span className="flex items-center justify-center rounded-lg bg-[#F1F3F6] text-[#A0A8B6]"><User size={17} /></span>
          <span className="flex items-center justify-center rounded-lg bg-[#E6F5EE] text-[#0F7A55]"><User size={17} /></span>
        </div>
      </div>
    </div>
    <div aria-hidden="true" className="absolute bottom-3 left-10 flex items-center gap-4 rounded-2xl border border-white bg-white px-4 py-3 text-[#465066] shadow-[0_14px_32px_-14px_rgba(23,32,46,0.30)]">
      <Mic size={18} /><Video size={18} /><MonitorUp size={18} /><MoreHorizontal size={18} />
      <span className="flex h-9 w-11 items-center justify-center rounded-xl bg-[#EF4444] text-white"><PhoneOff size={17} /></span>
    </div>
  </div>
}

function MeetHome() {
  const navigate = useNavigate()
  const location = useLocation()
  const sourceParams = new URLSearchParams(location.search)
  const sourceRecord = sourceParams.get('record') || ''
  const sourceOffset = Number(sourceParams.get('at') || '0')
  const sourceSegment = sourceParams.get('segment') || undefined
  const { t, i18n } = useTranslation('shell')
  const locale = i18n.language === 'kk' ? 'kk-KZ' : 'ru-RU'
  const [now, setNow] = useState(() => Date.now())
  const [records, setRecords] = useState<MeetRecord[]>([])
  const [events, setEvents] = useState<MeetEvent[]>([])
  const [calendarEvents, setCalendarEvents] = useState<MeetCalendarEvent[]>([])
  const [showAllUpcoming, setShowAllUpcoming] = useState(false)
  const [showAllRecent, setShowAllRecent] = useState(false)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [joinLink, setJoinLink] = useState('')
  const [form, setForm] = useState<'instant' | 'schedule' | null>(null)
  const [dialogError, setDialogError] = useState('')
  const [selected, setSelected] = useState<MeetRecord | null>(null)
  useEffect(() => {
    if (!sourceRecord) return
    const controller = new AbortController()
    void meetApi.meeting(sourceRecord, controller.signal)
      .then(meeting => { if (!controller.signal.aborted) setSelected({ meeting, role: '' }) })
      .catch(err => { if (!controller.signal.aborted) setError(meetErrorMessage(err)) })
    return () => controller.abort()
  }, [sourceRecord])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000)
    return () => window.clearInterval(timer)
  }, [])
  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true)
      setError('')
    }
    const calendarRequest = loadCalendarMeetEvents(Date.now()).catch(() => null)
    try {
      const [nextRecords, nextEvents] = await Promise.all([meetApi.records(), meetApi.calendar()])
      setRecords(nextRecords)
      setEvents(nextEvents)
    } catch (err) {
      if (!silent) setError(meetErrorMessage(err))
    } finally {
      const nextCalendar = await calendarRequest
      if (nextCalendar) setCalendarEvents(nextCalendar)
      if (!silent) setLoading(false)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') void load(true) }
    const timer = window.setInterval(refresh, 60000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [load])
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 2500)
    return () => window.clearTimeout(timer)
  }, [notice])

  const active = records.filter(({ meeting }) => meeting.status !== 'completed' && !events.some((event) => event.meeting_id === meeting.id && Date.parse(event.end_at) >= now))
  const history = records
    .filter(({ meeting }) => meeting.status === 'completed')
    .sort((a, b) => Date.parse(b.meeting.started_at) - Date.parse(a.meeting.started_at))
  const upcoming = events
    .filter((event) => Date.parse(event.end_at) >= now && event.my_status !== 'declined')
    .sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at))
  const upcomingCalendar = withoutMeetDuplicates(calendarEvents, events).filter((event) => Date.parse(event.end) >= now)
  const roleText = (owner: boolean) => owner ? t('meet.organizer') : t('meet.invited')
  const items: MeetItem[] = [
    ...active.map((record) => ({
      key: `record-${record.meeting.id}`,
      title: record.meeting.title || t('meet.meeting'),
      subtitle: record.meeting.agenda || (record.role === 'organizer' ? t('meet.organizer') : t('meet.participant')),
      start: record.meeting.started_at,
      end: null,
      live: true,
      attendees: [],
      meetingId: record.meeting.id,
      event: null,
      calendar: null,
    })),
    ...upcoming.map((event) => ({
      key: `event-${event.id}`,
      title: event.title,
      subtitle: event.agenda || roleText(event.is_owner),
      start: event.start_at,
      end: event.end_at,
      live: Boolean(event.meeting_id) && Date.parse(event.start_at) <= now,
      attendees: event.attendees,
      meetingId: event.meeting_id,
      event,
      calendar: null,
    })),
    ...upcomingCalendar.map((event) => ({
      key: `calendar-${event.id}`,
      title: event.title,
      subtitle: roleText(event.isOrganizer),
      start: event.start,
      end: event.end,
      live: Date.parse(event.start) <= now,
      attendees: event.attendees,
      meetingId: null,
      event: null,
      calendar: event,
    })),
  ].sort((a, b) => Number(b.live) - Number(a.live) || Date.parse(a.start) - Date.parse(b.start))
  const visibleItems = showAllUpcoming ? items : items.slice(0, 4)
  const visibleHistory = showAllRecent ? history : history.slice(0, 4)
  const primaryKey = items.find((item) => item.meetingId || item.event?.is_owner || item.calendar)?.key
  const today = dayKey(new Date(now))
  const time = (value: string) => new Date(value).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  const shortDay = (value: string) => new Date(value).toLocaleDateString(locale, { day: 'numeric', month: 'short' }).replace('.', '')

  const copy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link)
      setNotice(t('meet.linkCopied'))
    } catch {
      setError(t('meet.copyFailed'))
    }
  }
  const startEvent = async (event: MeetEvent) => {
    if (event.meeting_id) {
      navigate(`/meet/${event.meeting_id}`)
      return
    }
    setBusy(true)
    setError('')
    try {
      const session = await meetApi.startEvent(event.id)
      navigate(`/meet/${session.meeting_id}`)
    } catch (err) {
      setError(meetErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  const openCalendarMeeting = (event: MeetCalendarEvent) => {
    if (event.meetingId) navigate(`/meet/${event.meetingId}`)
    else if (event.roomName) navigate(`/calls/calendar/${encodeURIComponent(event.roomName)}`)
    else window.open(event.joinUrl, '_blank', 'noopener,noreferrer')
  }
  const enter = (item: MeetItem) => {
    if (item.calendar) openCalendarMeeting(item.calendar)
    else if (item.event) void startEvent(item.event)
    else if (item.meetingId) navigate(`/meet/${item.meetingId}`)
  }
  const submitJoin = (event: FormEvent) => {
    event.preventDefault()
    const meetingId = parseMeetId(joinLink)
    if (meetingId) navigate(`/meet/${meetingId}`)
    else setError(t('meet.joinInvalid'))
  }
  const actionFor = (item: MeetItem) => {
    const canJoin = Boolean(item.meetingId || item.calendar)
    const canStart = Boolean(item.event?.is_owner && !item.meetingId)
    const primary = item.key === primaryKey
    const base = `inline-flex h-10 min-w-[148px] shrink-0 items-center justify-center rounded-xl px-4 text-[14px] font-medium transition-colors duration-200 ${AXIS_UI.focus}`
    if (!canJoin && !canStart) return <span title={t('meet.waiting')} className={`${base} border border-[#E2E5EA] bg-white text-[#7B8494]`}>{t('meet.scheduled')}</span>
    return <button type="button" disabled={busy} onClick={() => enter(item)}
      className={`${base} disabled:opacity-60 ${primary ? 'bg-[#2458D3] text-white shadow-[0_6px_14px_-8px_rgba(36,88,211,0.8)] hover:bg-[#1D47B0]' : 'border border-[#E2E5EA] bg-white text-[#17202E] hover:bg-[#F8F9FB]'}`}>
      {canJoin ? t('meet.join') : t('meet.begin')}
    </button>
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden bg-[#F7F8FA] font-[Inter,sans-serif] text-[#17202E]">
      {error && <AppToast variant="error" message={error} onClose={() => setError('')} />}
      {notice && <AppToast variant="success" message={notice} onClose={() => setNotice('')} />}
      <div className="w-full px-4 py-6 md:px-6 md:py-7 lg:px-8">
        <header className="flex items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[18px] bg-[#EAF0FF] text-[#2458D3]"><Video size={30} strokeWidth={1.75} /></span>
          <div className="min-w-0">
            <h1 className="text-[30px] font-bold leading-9 tracking-[-0.02em]">Meet</h1>
            <p className="mt-0.5 text-[14px] text-[#586174]">{t('meet.description')}</p>
          </div>
        </header>

        <div className="mt-6 grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_440px]">
          <div className="flex min-w-0 flex-col gap-5">
          <section className={`${CARD} relative flex min-h-[256px] items-center justify-between gap-4 overflow-hidden px-7 py-8 2xl:px-8`}>
            <div className="relative z-10 min-w-0 max-w-[440px] flex-1">
              <h2 className="max-w-[340px] text-[28px] font-bold leading-[36px] tracking-[-0.02em]">{t('meet.heroTitle')}</h2>
              <p className="mt-3 text-[15px] leading-6 text-[#586174]">{t('meet.heroText')}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <button type="button" onClick={() => { setForm('instant'); setDialogError('') }}
                  className={`inline-flex h-12 items-center gap-2.5 whitespace-nowrap rounded-xl bg-[#2458D3] px-5 text-[15px] font-medium text-white shadow-[0_8px_18px_-10px_rgba(36,88,211,0.9)] transition-colors duration-200 hover:bg-[#1D47B0] ${AXIS_UI.focus}`}>
                  <Video size={19} />{t('meet.start')}
                </button>
                <button type="button" onClick={() => { setForm('schedule'); setDialogError('') }}
                  className={`inline-flex h-12 items-center gap-2.5 whitespace-nowrap rounded-xl border border-[#E2E5EA] bg-white px-5 text-[15px] font-medium text-[#17202E] transition-colors duration-200 hover:bg-[#F8F9FB] ${AXIS_UI.focus}`}>
                  <CalendarDays size={19} />{t('meet.schedule')}
                </button>
              </div>
            </div>
            <CallIllustration label={t('meet.illustration')} />
          </section>

          <section className={CARD} aria-labelledby="meet-upcoming">
            <SectionHeader id="meet-upcoming" icon={<Clock3 size={17} />} title={t('meet.upcoming')}
              action={items.length > 4 && <button type="button" className={LINK} aria-expanded={showAllUpcoming} onClick={() => setShowAllUpcoming((value) => !value)}>{showAllUpcoming ? t('meet.showLess') : t('meet.allMeetings')}<ChevronDown size={16} className={`transition-transform duration-200 ${showAllUpcoming ? 'rotate-180' : ''}`} /></button>} />
            {loading ? <div role="status" aria-label={t('meet.loading')}><MeetUpcomingSkeleton /></div>
              : items.length === 0 ? <div className="px-6 py-8">
                <p className="text-[15px] font-medium">{t('meet.emptyUpcoming')}</p>
                <p className="mt-1 text-[14px] text-[#586174]">{t('meet.emptyUpcomingText')}</p>
              </div>
              : <ul className={`px-3 py-2 ${showAllUpcoming ? 'custom-scrollbar max-h-[360px] overflow-y-auto overscroll-contain' : ''}`}>
                {visibleItems.map((item, index) => {
                  const otherDay = dayKey(new Date(item.start)) !== today
                  return <li key={item.key} className="flex min-w-0 items-center gap-4 border-b border-[#F0F2F5] px-3 py-3.5 last:border-b-0">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.live ? 'bg-[#EF4444]' : DOTS[index % DOTS.length]}`} />
                    <div className="w-[118px] shrink-0">
                      <p className="whitespace-nowrap text-[15px] font-medium tabular-nums">{time(item.start)}{item.end ? ` — ${time(item.end)}` : ''}</p>
                      {(otherDay || item.live) && <p className={`text-[12px] ${item.live ? 'font-medium text-[#DC2626]' : 'text-[#7B8494]'}`}>{item.live ? t('meet.live') : shortDay(item.start)}</p>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold">{item.title}</p>
                      <p className="truncate text-[13px] text-[#586174]">{item.subtitle}</p>
                    </div>
                    <div className="hidden shrink-0 lg:block"><Avatars people={item.attendees} /></div>
                    {actionFor(item)}
                    {item.meetingId || item.calendar
                      ? <button type="button" aria-label={t('meet.actions')} onClick={(event) => setMenu({ anchor: event.currentTarget, meetingId: item.meetingId ?? undefined, calendar: item.calendar ?? undefined })} className={ICON_BUTTON}><MoreVertical size={18} /></button>
                      : <span className="w-9 shrink-0" />}
                  </li>
                })}
              </ul>}
          </section>

          </div>
          <div className="grid min-w-0 grid-cols-1 items-start gap-5 md:grid-cols-2 xl:grid-cols-1">
          <section className={`${CARD} p-6`} aria-labelledby="meet-join">
            <h2 id="meet-join" className="flex items-center gap-3 text-[18px] font-semibold">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EEF3FF] text-[#2458D3]"><Link2 size={18} /></span>
              {t('meet.joinTitle')}
            </h2>
            <form className="mt-5 flex gap-2.5" onSubmit={submitJoin}>
              <label className="sr-only" htmlFor="meet-join-link">{t('meet.joinPlaceholder')}</label>
              <input id="meet-join-link" value={joinLink} onChange={(event) => setJoinLink(event.target.value)} placeholder={t('meet.joinPlaceholder')} required
                className="h-12 min-w-0 flex-1 rounded-xl border border-[#E7EAEF] bg-[#F6F7F9] px-4 text-[14px] text-[#17202E] outline-none transition-colors placeholder:text-[#7B8494] hover:border-[#D3D9E3] focus:border-[#2458D3] focus:bg-white" />
              <button type="submit" aria-label={t('meet.join')} className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#E2E5EA] bg-white text-[#17202E] transition-colors hover:border-[#C9D3E6] hover:text-[#2458D3] ${AXIS_UI.focus}`}><ArrowRight size={19} /></button>
            </form>
            <p className="mt-3 text-[13px] leading-5 text-[#586174]">{t('meet.joinHint')}</p>
          </section>

          <section className={CARD} aria-labelledby="meet-recent">
            <SectionHeader id="meet-recent" icon={<History size={17} />} title={t('meet.recent')}
              action={history.length > 4 && <button type="button" className={LINK} aria-expanded={showAllRecent} onClick={() => setShowAllRecent((value) => !value)}>{showAllRecent ? t('meet.showLess') : t('meet.allRecords')}<ChevronDown size={16} className={`transition-transform duration-200 ${showAllRecent ? 'rotate-180' : ''}`} /></button>} />
            {loading ? <div role="status" aria-label={t('meet.loading')}><MeetRecentSkeleton /></div>
              : history.length === 0 ? <div className="px-6 py-8">
                <p className="text-[15px] font-medium">{t('meet.emptyRecent')}</p>
                <p className="mt-1 text-[14px] text-[#586174]">{t('meet.emptyRecentText')}</p>
              </div>
              : <ul className={`grid grid-cols-1 gap-1 p-3 ${showAllRecent ? 'custom-scrollbar max-h-[440px] overflow-y-auto overscroll-contain' : ''}`}>
                {visibleHistory.map((record) => {
                  const length = duration(record.meeting.started_at, record.meeting.completed_at)
                  return <li key={record.meeting.id} className="group flex min-w-0 items-center gap-3 rounded-2xl p-2.5 transition-colors duration-200 hover:bg-[#F7F8FA]">
                    <button type="button" onClick={() => setSelected(record)} className={`flex min-w-0 flex-1 items-center gap-4 rounded-xl text-left ${AXIS_UI.focus}`}>
                      <span className="relative flex h-[68px] w-[112px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[radial-gradient(120%_120%_at_20%_10%,#5B6B86_0%,#3A465C_45%,#2A3344_100%)] text-white/45">
                        <span aria-hidden="true" className="absolute -left-6 -top-8 h-20 w-20 rounded-full bg-white/10" />
                        <Video size={22} />
                        {length && <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold leading-4 text-white tabular-nums">{length}</span>}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold text-[#17202E]">{record.meeting.title || t('meet.meeting')}</span>
                        <span className="mt-0.5 block truncate text-[13px] text-[#586174] tabular-nums">{shortDay(record.meeting.started_at)}, {time(record.meeting.started_at)}</span>
                      </span>
                    </button>
                    <button type="button" aria-label={t('meet.actions')} onClick={(event) => setMenu({ anchor: event.currentTarget, meetingId: record.meeting.id, record })} className={ICON_BUTTON}><MoreVertical size={18} /></button>
                  </li>
                })}
              </ul>}
          </section>
          </div>
        </div>
      </div>

      <FloatingMenu anchor={menu?.anchor ?? null} open={Boolean(menu)} onClose={() => setMenu(null)} className="min-w-[220px]">
        {menu && <>
          {menu.record
            ? <button type="button" className={floatingMenuItemClass} onClick={() => { const record = menu.record as MeetRecord; setMenu(null); setSelected(record) }}><FileText size={17} />{t('meet.details')}</button>
            : <button type="button" className={floatingMenuItemClass} onClick={() => { const { calendar, meetingId } = menu; setMenu(null); if (calendar) openCalendarMeeting(calendar); else if (meetingId) navigate(`/meet/${meetingId}`) }}><Video size={17} />{t('meet.join')}</button>}
          <button type="button" className={floatingMenuItemClass} onClick={() => { const link = menu.calendar ? menu.calendar.joinUrl : menu.meetingId ? meetLink(menu.meetingId) : ''; setMenu(null); if (link) void copy(link) }}><Copy size={17} />{t('meet.copyLink')}</button>
        </>}
      </FloatingMenu>

      {form && <MeetMeetingDialog mode={form} busy={busy} error={dialogError}
        onClose={() => { setForm(null); setDialogError('') }}
        onSubmit={(draft) => {
          setBusy(true)
          setDialogError('')
          void (async () => {
            try {
              if (form === 'instant') {
                const session = await meetApi.create(draft.title)
                navigate(`/meet/${session.meeting_id}`)
              } else {
                await meetApi.schedule(draft.title, draft.start.toISOString(), draft.end.toISOString(), draft.attendees)
                setForm(null)
                setNotice(t('meet.form.scheduled'))
                await load()
              }
            } catch (err) {
              setDialogError(meetErrorMessage(err))
            } finally {
              setBusy(false)
            }
          })()
        }} />}

      {selected && (
        <MeetRecordDetails
          key={selected.meeting.id}
          meeting={selected.meeting}
          formatDate={formatDate}
          initialOffset={sourceRecord === selected.meeting.id && Number.isFinite(sourceOffset) ? Math.max(0, sourceOffset) : undefined}
          initialSegment={sourceRecord === selected.meeting.id ? sourceSegment : undefined}
          onClose={() => { setSelected(null); if (sourceRecord) navigate('/meet', { replace: true }) }}
        />
      )}
    </div>
  )
}

export default function MeetPage() {
  return (
    <MeetAccountGate>
      <MeetHome />
    </MeetAccountGate>
  )
}
