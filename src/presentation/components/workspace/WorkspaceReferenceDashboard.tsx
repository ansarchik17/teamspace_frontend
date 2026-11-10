import { GROWY_HOME_URL } from '../../../shared/config/growy'
import { odoSectionLaunchRoute } from '../../../application/use-cases/eps/odoNavigation'
import { useODODashboardCounts } from './useODODashboardCounts'
import { useSDTicketCount } from './useSDTicketCount'
import { MAIL_APP_URL, openWorkspaceMail } from '../../../shared/config/mailConfig'
import { normalizeBackendAssetUrl } from '../../../infrastructure/http/normalizeBackendAssetUrl'
import { SENIMDESK_LAUNCH_PATH, isSenimDeskApp } from '../../../shared/config/senimdesk'
import { openWorkspaceServiceInNewTab } from '../../../shared/config/serviceLaunch'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  ArrowUp,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileSignature,
  FileText,
  GraduationCap,
  Headset,
  LayoutGrid,
  Megaphone,
  Newspaper,
  Plus,
  ShieldCheck,
  TreePalm,
  Users,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { formatDate, formatTime } from '../../../shared/i18n'
import { Play } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { CalendarEventViewModel } from '../../view-models/CalendarViewModel'
import type { HomeDashboardViewModel } from '../../view-models/HomeDashboardViewModel'
import type { WorkspaceFavoriteAppViewModel } from '../../view-models/WorkspaceFavoritesViewModel'
import type { Publication } from '../../../infrastructure/repositories/HttpPublicationRepository'
import AppModal from '../../../shared/ui/AppModal'
import { toDayKey } from '../calendar/MiniCalendar'
import './WorkspaceReferenceDashboard.css'
import EdoIcon from '../../../shared/ui/icons/EdoIcon'
import tasksEmptyImage from '../../../assets/home/tasks-empty-3d-v2.png'

interface Props {
  hubData: HomeDashboardViewModel
  calendarEvents: CalendarEventViewModel[]
  apps: WorkspaceFavoriteAppViewModel[]
  publications: Publication[]
  userName: string
  isLoading: boolean
}

interface HeroBoardProps {
  userName: string
}
type TaskDeadline = 'overdue' | 'soon' | 'today' | 'thisWeek' | 'later' | 'none'
type Task = {
  id: string
  title: string
  board: string
  status: string
  statusTone: 'info' | 'muted' | 'warning'
  due: string
  dueAt?: string
  priority: string
  deadline: TaskDeadline
}
type News = { id: string; title: string; category: string; date: string; image?: string; video?: string; isVideo?: boolean; content: string; excerpt: string }

const IMAGE_FILE_PATTERN = /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?|#|$)/i

type NewsAttachment = { file_url: string; file_type: string; mime_type?: string; thumbnail_url?: string; video_provider?: string; video_embed_url?: string; video_url?: string }

const VIDEO_FILE_PATTERN = /\.(mp4|webm|mov|m4v)(\?|#|$)/i
const YOUTUBE_ID_PATTERN = /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=|shorts\/)|youtu\.be\/)([\w-]{6,})/

const resolveNewsPreview = (publication: { cover_image_url?: string; attachments?: NewsAttachment[] }): Pick<News, 'image' | 'video' | 'isVideo'> => {
  const attachments = publication.attachments ?? []
  const imageAttachment = attachments.find(a => a.file_type === 'image' || a.mime_type?.startsWith('image/') || IMAGE_FILE_PATTERN.test(a.file_url || ''))
  const rawImage = publication.cover_image_url || imageAttachment?.file_url
  if (rawImage) return { image: normalizeBackendAssetUrl(rawImage) ?? rawImage }
  const video = attachments.find(a => a.file_type === 'video' || Boolean(a.video_provider) || a.mime_type?.startsWith('video/') || VIDEO_FILE_PATTERN.test(a.file_url || ''))
  if (!video) {
    const rawThumb = attachments.find(a => a.thumbnail_url)?.thumbnail_url
    return rawThumb ? { image: normalizeBackendAssetUrl(rawThumb) ?? rawThumb } : {}
  }
  const videoUrl = video.video_url || video.file_url || ''
  const youtubeId = YOUTUBE_ID_PATTERN.exec(`${video.video_embed_url || ''} ${videoUrl}`)?.[1]
  const rawPoster = video.thumbnail_url || (youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : undefined)
  if (rawPoster) return { image: normalizeBackendAssetUrl(rawPoster) ?? rawPoster, isVideo: true }
  const isDirect = video.video_provider === 'direct' || video.mime_type?.startsWith('video/') || VIDEO_FILE_PATTERN.test(videoUrl)
  return isDirect && videoUrl ? { video: normalizeBackendAssetUrl(videoUrl) ?? videoUrl, isVideo: true } : {}
}

const toNewsExcerpt = (content?: string | null): string =>
  (content || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[#*_`>~]+/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
type Service = { name: string; labelKey?: 'services.edo'; icon: LucideIcon; tone: string; route: string }
type TaskTab = 'all' | 'today' | 'week' | 'overdue'
type NewsTab = 'all' | 'products' | 'team' | 'events'

const services: Service[] = [
  { name: 'ЭДО', labelKey: 'services.edo', icon: EdoIcon, tone: 'blue', route: '/eps' },
  { name: 'SenimDesk', icon: Headset, tone: 'blue', route: SENIMDESK_LAUNCH_PATH },
  { name: 'BeketOS', icon: ShieldCheck, tone: 'green', route: '/teamstore' },
  { name: 'HRM', icon: Users, tone: 'orange', route: '/team-contact' },
  { name: 'LMS', icon: GraduationCap, tone: 'blue', route: GROWY_HOME_URL },
]
const actions = [
  { key: 'vacation', icon: TreePalm, tone: 'blue', route: '/iform' },
  { key: 'itRequest', icon: Headset, tone: 'blue', route: SENIMDESK_LAUNCH_PATH },
  { key: 'document', icon: FileText, tone: 'orange', route: '/eps' },
  { key: 'task', icon: Plus, tone: 'green', route: '/board' },
] as const
const metrics = [
  { key: 'approvals', icon: Users, tone: 'red', route: odoSectionLaunchRoute('approvals') },
  { key: 'signing', icon: FileSignature, tone: 'blue', route: odoSectionLaunchRoute('signings') },
  { key: 'requests', icon: Headset, tone: 'green', route: SENIMDESK_LAUNCH_PATH },
] as const
const typingKeys = ['first', 'second', 'third', 'fourth'] as const
const weekdayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
const TASKS_PER_PAGE = 3
const taskTabs: TaskTab[] = ['all', 'today', 'week', 'overdue']
const newsTabs: NewsTab[] = ['all', 'products', 'team', 'events']
const time = (value: string) => formatTime(value)
const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)
const parseDayKey = (key: string) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d) }
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const SOON_DEADLINE_MS = 2 * 60 * 60 * 1000
const isDateOnlyDeadline = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) || /T00:00:00(?:\.\d+)?Z$/i.test(value)
const getTaskDeadline = (dueAt: string | undefined, today: Date): TaskDeadline => {
  if (!dueAt) return 'none'
  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return 'none'

  const dueDay = startOfDay(due).getTime()
  const todayDay = startOfDay(today).getTime()
  if (dueDay < todayDay) return 'overdue'
  if (dueDay === todayDay) {
    if (!isDateOnlyDeadline(dueAt) && due.getTime() < today.getTime()) return 'overdue'
    if (!isDateOnlyDeadline(dueAt) && due.getTime() - today.getTime() <= SOON_DEADLINE_MS) return 'soon'
    return 'today'
  }
  if (dueDay <= todayDay + 6 * 24 * 60 * 60 * 1000) return 'thisWeek'
  return 'later'
}

const getGreetingKey = () => {
  const hour = new Date().getHours()
  if (hour < 5) return 'greeting.night' as const
  if (hour >= 5 && hour < 12) return 'greeting.morning' as const
  if (hour >= 12 && hour < 18) return 'greeting.afternoon' as const
  return 'greeting.evening' as const
}
function TypingHint({ phrases }: { phrases: string[] }) {
  const [state, setState] = useState({ index: 0, length: 0, deleting: false })
  const reducedMotion = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, [])
  const current = phrases[state.index % phrases.length] ?? ''
  useEffect(() => {
    if (reducedMotion || !current) return
    const typed = state.length >= current.length
    const timer = window.setTimeout(() => {
      setState((value) => {
        if (value.deleting) return value.length <= 0 ? { index: value.index + 1, length: 0, deleting: false } : { ...value, length: value.length - 1 }
        return value.length >= current.length ? { ...value, deleting: true } : { ...value, length: value.length + 1 }
      })
    }, state.deleting ? 26 : typed ? 1800 : 60)
    return () => window.clearTimeout(timer)
  }, [current, reducedMotion, state])
  return <span className="wr-ask-hint" aria-hidden="true">{reducedMotion ? phrases[0] : current.slice(0, state.length)}<i /></span>
}
function HeroBoard( {userName}: HeroBoardProps) {
  const { t } = useTranslation('home')
  const column = (key: 'backlog' | 'inProgress' | 'review', count: number) => <span className={'wr-board-col-head ' + key}><i aria-hidden="true" />{t(`board.${key}`)} · {count}</span>
  return <div className="wr-board" aria-hidden="true">
    <div className="wr-board-head"><span className="wr-board-avatar">S</span>{t('board.sprint')}</div>
    <div className="wr-board-cols">
      <div className="wr-board-col">
        {column('backlog', 3)}
        <span className="wr-board-slot wr-board-slot-from" />
        <span className="wr-board-card"><b>{t('board.report')}</b><small>{t('board.dateFirst')}</small></span>
        <span className="wr-board-card"><b>{t('board.onboarding')}</b><small>{t('board.dateSecond')}</small></span>
      </div>
      <div className="wr-board-col">
        {column('inProgress', 2)}
        <span className="wr-board-card"><b>{t('board.api')}</b><span className="wr-board-progress"><i style={{ width: '64%' }} /></span></span>
        <span className="wr-board-slot wr-board-slot-to" />
      </div>
      <div className="wr-board-col">
        {column('review', 1)}
        <span className="wr-board-card"><b>{t('board.landing')}</b><span className="wr-board-progress"><i style={{ width: '88%' }} /></span></span>
      </div>
      <span className="wr-board-card wr-board-drag">
        <b>{t('board.design')}</b>
        <em>{t('board.high')}</em>
        <span className="wr-board-cursor"><svg width="14" height="14" viewBox="0 0 24 24"><path d="M4 3l16 8-7 2-3 7z" fill="currentColor" /></svg><span>{userName}</span></span>
      </span>
    </div>
  </div>
}
function SectionLink({ children, onClick }: { children: string; onClick: () => void }) {
  return <button className="wr-link" type="button" onClick={onClick}>{children}<ArrowRight size={16} strokeWidth={2} /></button>
}
function Tabs<T extends string>({ items, value, onChange, label }: { items: Array<{ id: T; label: string }>; value: T; onChange: (value: T) => void; label: string }) {
  return <div className="wr-tabs" role="tablist" aria-label={label}>{items.map(item => <button key={item.id} type="button" role="tab" aria-selected={item.id === value} className={item.id === value ? 'active' : ''} onClick={() => onChange(item.id)}>{item.label}</button>)}</div>
}
export default function WorkspaceReferenceDashboard({ hubData, calendarEvents, apps, publications, userName, isLoading }: Props) {
  const navigate = useNavigate()
  const { t } = useTranslation('home')
  const odoCounts = useODODashboardCounts()
  const sdCount = useSDTicketCount()
  const [taskTab, setTaskTab] = useState<TaskTab>('all')
  const [taskPage, setTaskPage] = useState(0)
  const [newsTab, setNewsTab] = useState<NewsTab>('all')
  const [aiQuery, setAiQuery] = useState('')
  const [aiFocused, setAiFocused] = useState(false)
  const [selectedNews, setSelectedNews] = useState<News | null>(null)
  const [allNews, setAllNews] = useState(false)
  const [weekAnchor, setWeekAnchor] = useState(() => startOfDay(new Date()))
  const [selectedDayKey, setSelectedDayKey] = useState(() => toDayKey(new Date()))
  const today = new Date()
  const tasks: Task[] = hubData.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    board: task.boardName,
    status: task.status,
    statusTone: task.columnKey === 'IN_PROGRESS' ? 'info' : task.columnKey === 'TEST' ? 'warning' : 'muted',
    due: task.due,
    dueAt: task.dueAt,
    priority: task.priority,
    deadline: getTaskDeadline(task.dueAt, today),
  }))
  const filteredTasks = tasks.filter((task) => {
    if (taskTab === 'today') return task.deadline === 'today' || task.deadline === 'soon'
    if (taskTab === 'week') return task.deadline === 'soon' || task.deadline === 'today' || task.deadline === 'thisWeek'
    if (taskTab === 'overdue') return task.deadline === 'overdue'
    return true
  }).sort((a, b) => (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity))
  const taskPages = Math.max(1, Math.ceil(filteredTasks.length / TASKS_PER_PAGE))
  const currentTaskPage = Math.min(taskPage, taskPages - 1)
  const visibleTasks = filteredTasks.slice(currentTaskPage * TASKS_PER_PAGE, (currentTaskPage + 1) * TASKS_PER_PAGE)
  const emptyTasksTitle = t(`tasks.empty.${taskTab}`)
  const changeTaskTab = (tab: TaskTab) => { setTaskTab(tab); setTaskPage(0) }
  const dueLabel = (dueAt?: string) => {
    if (!dueAt) return t('tasks.noDue')
    const due = new Date(dueAt)
    if (Number.isNaN(due.getTime())) return t('tasks.noDue')
    return formatDate(due, { day: 'numeric', month: 'short' }).replace('.', '')
  }

  const isTodaySelected = selectedDayKey === toDayKey(today)
  const selectedDayLabel = formatDate(parseDayKey(selectedDayKey), { day: 'numeric', month: 'long' })
  const monthTitle = capitalize(formatDate(weekAnchor, { month: 'long', year: 'numeric' }))
  const eventKeys = new Set(calendarEvents.filter(e => !e.isDeclined).map(e => toDayKey(new Date(e.startTime))))
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekAnchor.getFullYear(), weekAnchor.getMonth(), weekAnchor.getDate() + index - 3)
    const key = toDayKey(date)
    return { key, day: date.getDate(), weekday: weekdayKeys[date.getDay()], isToday: key === toDayKey(today), isSelected: key === selectedDayKey, hasEvent: eventKeys.has(key) }
  })
  const shiftWeek = (delta: number) => setWeekAnchor(d => new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta * 7))
  const selectDay = (key: string) => setSelectedDayKey(key)
  const events = calendarEvents
    .filter(e => !e.isDeclined && toDayKey(new Date(e.startTime)) === selectedDayKey)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .slice(0, 4)
    .map(e => ({ id: e.id, title: e.title, time: time(e.startTime) + ' – ' + time(e.endTime), subtitle: e.isOnline ? t('calendar.online') : e.location || t('calendar.meeting'), join: e.isOnline }))

  const news: News[] = publications.map(p => ({ id: p.id, title: p.title, content: p.content || '', category: p.type === 'event' ? 'events' : 'team', date: formatDate(p.published_at), ...resolveNewsPreview(p), excerpt: toNewsExcerpt(p.content) }))
  const visibleNews = news.filter(n => newsTab === 'all' || n.category === newsTab).slice(0, 3)
  const categoryLabel = (category: string) => t(category === 'events' ? 'news.tabs.events' : 'news.tabs.team')
  const announcements = publications
    .filter(p => p.type === 'announcement' || p.importance !== 'normal' || p.is_pinned)
    .sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''))
    .slice(0, 2)
    .map(p => ({ id: p.id, title: p.title, date: formatDate(p.published_at, { day: 'numeric', month: 'short' }), level: (p.importance === 'urgent' ? 'urgent' : p.importance === 'important' ? 'important' : 'normal') as 'urgent' | 'important' | 'normal', acknowledge: p.requires_acknowledgement }))

  const myServices = apps.length
    ? apps.slice(0, 6).map(a => {
        const descriptor = services.find(s => s.name === a.appName || (s.name === 'SenimDesk' && isSenimDeskApp(a.appName)))
        const route = isSenimDeskApp(a.appName) ? SENIMDESK_LAUNCH_PATH : descriptor?.name === 'LMS' ? GROWY_HOME_URL : a.link || descriptor?.route || '/teamstore'
        return { key: String(a.id), name: descriptor?.labelKey && a.appName === descriptor.name ? t(descriptor.labelKey) : a.appName, icon: descriptor?.icon || LayoutGrid, route }
      })
    : services.map(s => ({ key: s.name, name: s.labelKey ? t(s.labelKey) : s.name, icon: s.icon, route: s.route }))
  const openRoute = (route: string) => {
    if (openWorkspaceServiceInNewTab(route)) return
    if (route === MAIL_APP_URL) openWorkspaceMail()
    else if (route === GROWY_HOME_URL || /^https?:/.test(route)) window.open(route, '_blank', 'noopener,noreferrer')
    else navigate(route)
  }
  const openAi = (query: string) => { if (query.trim()) navigate('/teamai?prompt=' + encodeURIComponent(query.trim())) }
  const firstName = userName.trim().split(/\s+/)[0] || t('userFallback')

  return <main className="wr-dashboard" aria-label={t('aria')}>
    <div className="wr-page">
      <div className="wr-main">
        <section className="wr-card wr-hero">
          <form className="wr-hero-main" onSubmit={e => { e.preventDefault(); openAi(aiQuery) }}>
            <h1>{t(getGreetingKey())}, {firstName}!</h1>
            <p className="wr-hero-sub">{t('ai.subtitle')}</p>
            <div className="wr-ask-field">
              <input
                aria-label={t('ai.inputLabel')}
                value={aiQuery}
                onChange={e => setAiQuery(e.target.value)}
                onFocus={() => setAiFocused(true)}
                onBlur={() => setAiFocused(false)}
              />
              {!aiQuery && !aiFocused ? <TypingHint phrases={typingKeys.map(key => t(`ai.typing.${key}`))} /> : null}
              <button type="submit" aria-label={t('ai.submit')}><ArrowUp size={18} strokeWidth={2.2} /></button>
            </div>
          </form>
          <HeroBoard userName={firstName} />
        </section>

        <section className="wr-metrics" aria-label={t('metrics.label')}>
          {metrics.map((m) => {
            const counter = m.key === 'requests' ? sdCount : odoCounts[m.key]
            const hint = counter.state === 'ready' ? undefined : m.key === 'requests'
              ? t(counter.state === 'loading' ? 'metrics.sdLoading' : counter.state === 'denied' ? 'metrics.noSdAccess' : 'metrics.noSdData')
              : t(counter.state === 'loading' ? 'metrics.loading' : counter.state === 'denied' ? 'metrics.noAccess' : 'metrics.noOdoData')
            return <button type="button" key={m.key} className="wr-card wr-metric" onClick={() => openRoute(m.route)} aria-label={hint ? `${t(`metrics.${m.key}.title`)}: ${hint}` : undefined}>
              <span className="wr-tile" aria-hidden="true"><m.icon size={18} strokeWidth={1.75} /></span>
              <span className="wr-metric-label">{t(`metrics.${m.key}.short`)}</span>
              <b className={counter.state === 'ready' ? undefined : 'muted'} aria-busy={counter.state === 'loading'}>{counter.value ?? '—'}</b>
            </button>
          })}
        </section>

        <section className="wr-actions" aria-label={t('actions.label')}>
          {actions.map(a => <button key={a.key} type="button" className="wr-card wr-action" onClick={() => openRoute(a.route)}>
            <span className="wr-tile" aria-hidden="true"><a.icon size={20} strokeWidth={1.75} /></span>
            <span className="wr-action-copy"><strong>{t(`actions.${a.key}.title`)}</strong><small>{t(`actions.${a.key}.subtitle`)}</small></span>
            <ChevronRight className="wr-chevron" size={18} aria-hidden="true" />
          </button>)}
        </section>

        <section className="wr-card wr-panel wr-tasks">
          <header>
            <h2>{t('tasks.title')}</h2>
            <div className="wr-header-actions">
              <Tabs items={taskTabs.map(id => ({ id, label: t(`tasks.tabs.${id}`) }))} value={taskTab} onChange={changeTaskTab} label={t('tasks.filterLabel')} />
              <button type="button" className="wr-primary" onClick={() => navigate('/board')}><Plus size={18} strokeWidth={2} />{t('tasks.create')}</button>
            </div>
          </header>
          {isLoading ? <p className="wr-loading">{t('tasks.loading')}</p> : visibleTasks.length ? <>
            <div className="wr-task-table" role="table" aria-label={t('tasks.title')}>
              <div className="wr-task-row wr-task-head" role="row">
                <span role="columnheader">{t('tasks.columns.title')}</span>
                <span role="columnheader">{t('tasks.columns.board')}</span>
                <span role="columnheader">{t('tasks.columns.due')}</span>
                <span role="columnheader">{t('tasks.columns.status')}</span>
              </div>
              {visibleTasks.map((task) => <button type="button" role="row" key={task.id} className="wr-task-row" onClick={() => navigate('/board?task=' + task.id)} aria-label={t('tasks.open', { title: task.title })}>
                <span role="cell" className="wr-task-title"><span className="wr-task-check" aria-hidden="true" /><strong>{task.title}</strong></span>
                <span role="cell" className="wr-task-board">{task.board || '—'}</span>
                <span role="cell" className={'wr-task-due ' + task.deadline}>{dueLabel(task.dueAt)}</span>
                <span role="cell"><span className={'wr-status ' + task.statusTone}>{task.status}</span></span>
              </button>)}
            </div>
            {taskPages > 1 ? <nav className="wr-pager" aria-label={t('tasks.pager.label')}>
              <button type="button" onClick={() => setTaskPage(currentTaskPage - 1)} disabled={currentTaskPage === 0} aria-label={t('tasks.pager.prev')}><ChevronLeft size={18} /></button>
              <span>{t('tasks.pager.status', { page: currentTaskPage + 1, total: taskPages })}</span>
              <button type="button" onClick={() => setTaskPage(currentTaskPage + 1)} disabled={currentTaskPage >= taskPages - 1} aria-label={t('tasks.pager.next')}><ChevronRight size={18} /></button>
            </nav> : null}
          </> : <div className="wr-empty">
            <img src={tasksEmptyImage} alt="" className="wr-empty-art" width={96} height={96} />
            <strong>{emptyTasksTitle}</strong>
            <small>{t('tasks.emptyHint')}</small>
          </div>}
        </section>

        <section className="wr-card wr-panel wr-news" id="workspace-ref-news">
          <header>
            <h2>{t('news.title')}</h2>
            <div className="wr-header-actions">
              <Tabs items={newsTabs.map(id => ({ id, label: t(`news.tabs.${id}`) }))} value={newsTab} onChange={setNewsTab} label={t('news.categoriesLabel')} />
              <SectionLink onClick={() => navigate('/news')}>{t('news.seeAll')}</SectionLink>
            </div>
          </header>
          {visibleNews.length ? <div className="wr-news-list">{visibleNews.map(n => <button type="button" key={n.id} className="wr-news-item" onClick={() => navigate(`/news/${encodeURIComponent(n.id)}`)}>
            <span className="wr-news-image" style={n.image ? { backgroundImage: 'url(' + n.image + ')' } : undefined}>{n.video && <video className="wr-news-video" src={n.video + '#t=0.1'} muted playsInline preload="metadata" tabIndex={-1} aria-hidden="true" />}{!n.image && !n.video && <Newspaper size={26} strokeWidth={1.5} />}{n.isVideo && <span className="wr-news-play"><Play size={14} fill="currentColor" strokeWidth={0} /></span>}</span>
            <span className="wr-news-copy">
              <strong>{n.title}</strong>
              {n.excerpt ? <span className="wr-news-excerpt">{n.excerpt}</span> : null}
              <time>{n.date} · {categoryLabel(n.category)}</time>
            </span>
          </button>)}</div> : <div className="wr-empty wr-empty-news">
            <Newspaper className="wr-empty-icon" size={36} strokeWidth={1.5} aria-hidden="true" />
            <strong>{t('news.emptyTitle')}</strong>
            <small>{t('news.emptyHint')}</small>
          </div>}
        </section>
      </div>

      <aside className="wr-side">
        <section className="wr-card wr-panel wr-calendar" aria-labelledby="wr-calendar-title">
          <div className="wr-cal-head">
            <h2 id="wr-calendar-title">{monthTitle}</h2>
            <div className="wr-cal-nav">
              <button type="button" onClick={() => shiftWeek(-1)} aria-label={t('calendar.prevWeek')}><ChevronLeft size={18} /></button>
              <button type="button" onClick={() => shiftWeek(1)} aria-label={t('calendar.nextWeek')}><ChevronRight size={18} /></button>
            </div>
          </div>
          <div className="wr-week">
            {weekDays.map(day => <button
              key={day.key}
              type="button"
              aria-pressed={day.isSelected}
              aria-label={formatDate(parseDayKey(day.key))}
              className={'wr-week-day' + (day.isSelected ? ' selected' : '') + (day.isToday ? ' today' : '')}
              onClick={() => selectDay(day.key)}
            >
              <small>{t(`calendar.weekdays.${day.weekday}`)}</small>
              <b>{day.day}</b>
              <i className={day.hasEvent ? 'has-event' : undefined} aria-hidden="true" />
            </button>)}
          </div>
          <h3 className="wr-day-title">{isTodaySelected ? t('calendar.today') : selectedDayLabel}</h3>
          {events.length ? <div className="wr-events">{events.map(e => <div key={e.id} className="wr-event">
            <button type="button" className="wr-event-copy" onClick={() => navigate('/calendar?event=' + e.id)}><strong>{e.title}</strong><small>{e.time} · {e.subtitle}</small></button>
            {e.join && <button type="button" className="wr-join" onClick={() => navigate('/calendar?event=' + e.id)}>{t('calendar.enter')}</button>}
          </div>)}</div> : <div className="wr-events-empty"><CalendarDays size={18} strokeWidth={1.6} aria-hidden="true" />{isTodaySelected ? t('calendar.emptyToday') : t('calendar.emptyDay')}</div>}
        </section>

        <section className="wr-card wr-panel wr-announcements" aria-labelledby="wr-announcements-title">
          <header><h2 id="wr-announcements-title">{t('announcements.title')}</h2><button type="button" className="wr-link" onClick={() => navigate('/news')}>{t('announcements.all')}</button></header>
          {announcements.length ? <ul className="wr-announcement-list">{announcements.map(a => <li key={a.id}>
            <button type="button" className={'wr-announcement ' + a.level} onClick={() => navigate(`/news/${encodeURIComponent(a.id)}`)}>
              <span className="wr-announcement-mark" aria-hidden="true"><Megaphone size={16} strokeWidth={1.8} /></span>
              <span className="wr-announcement-copy">
                <strong>{a.title}</strong>
                <small>{a.level !== 'normal' ? <b>{t(`announcements.${a.level}`)}</b> : null}{a.date}{a.acknowledge ? ' · ' + t('announcements.acknowledge') : ''}</small>
              </span>
            </button>
          </li>)}</ul> : <div className="wr-events-empty wr-announcements-empty"><Megaphone size={18} strokeWidth={1.6} aria-hidden="true" />{t('announcements.empty')}</div>}
        </section>

        <section className="wr-card wr-panel wr-services" id="favorites">
          <header><h2>{t('services.title')}</h2><button type="button" className="wr-link" onClick={() => navigate('/teamstore')}>{t('services.configure')}</button></header>
          <div className="wr-service-list">{myServices.map(({ key, name, icon: Icon, route }) => <button type="button" className="wr-service" key={key} onClick={() => openRoute(route)}>
            <span className="wr-service-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.75} /></span>
            <strong>{name}</strong>
          </button>)}</div>
        </section>
      </aside>
    </div>
    {selectedNews && <AppModal title={selectedNews.title} onClose={() => setSelectedNews(null)} maxWidth={660}><div className="wr-detail">{selectedNews.image && <span className="wr-news-image" style={{ backgroundImage: 'url(' + selectedNews.image + ')' }} />}<small>{categoryLabel(selectedNews.category)} · {selectedNews.date}</small><p>{selectedNews.content || t('news.noDetails')}</p></div></AppModal>}
    {allNews && <AppModal title={t('news.title')} onClose={() => setAllNews(false)} maxWidth={760}><div className="wr-all-news">{news.length ? news.map(n => <button type="button" key={n.id} onClick={() => { setAllNews(false); setSelectedNews(n) }}><strong>{n.title}</strong><small>{n.date} · {categoryLabel(n.category)}</small><ArrowRight size={18} /></button>) : <p className="wr-loading">{t('news.emptyTitle')}</p>}</div></AppModal>}
  </main>
}
