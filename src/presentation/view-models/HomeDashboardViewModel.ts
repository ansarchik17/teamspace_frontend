import type { HomeDashboardData } from '../../domain/entities/HomeDashboard'
import { C, STATS } from '../pages/dashboard/model/constants'
import { formatDate, formatTime } from '../../shared/i18n'

const toShortDate = (iso: string): string => formatDate(iso, { day: 'numeric', month: 'short' }).replace(/\.$/, '') || '-'

const toShortTime = (iso: string): string => formatTime(iso) || '--:--'

const toDeltaLabel = (delta: number): string => (delta >= 0 ? 'vs прошлая неделя' : 'vs вчера')

const resolveServiceIcon = (name: string): string => {
  const value = name.toLowerCase()
  if (value.includes('calendar') || value.includes('календар')) return 'calendar_month'
  if (value.includes('meet') || value.includes('встреч')) return 'videocam'
  if (value.includes('ai') || value.includes('assistant')) return 'auto_awesome'
  if (value.includes('board') || value.includes('kanban')) return 'view_kanban'
  if (value.includes('chat') || value.includes('mess')) return 'forum'
  return 'apps'
}

const priorityLabels: Record<string, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  critical: 'Критичный',
}

const inferColumnKey = (status: string, columnKey?: string): string => {
  const normalizedKey = (columnKey || '').trim().toUpperCase()
  if (normalizedKey) return normalizedKey

  const value = status.toLowerCase()
  if (value.includes('progress') || value.includes('работ')) return 'IN_PROGRESS'
  if (value.includes('todo') || value.includes('выполн')) return 'TODO'
  if (value.includes('test') || value.includes('тест')) return 'TEST'
  return status.trim().toUpperCase()
}

const mapTaskStatusLabel = (columnKey: string, status: string): string => {
  switch (columnKey) {
    case 'TODO':
      return 'К выполнению'
    case 'IN_PROGRESS':
      return 'В работе'
    case 'TEST':
      return 'Тестирование'
    default:
      return status || columnKey
  }
}

const mapTaskPriorityLabel = (priority?: string): string => {
  const normalized = (priority || '').trim().toLowerCase()
  if (!normalized) return '—'
  return priorityLabels[normalized] ?? priority
}

export interface HomeDashboardViewModel {
  stats: Array<{
    id: string
    label: string
    value: number
    unit: string
    delta: number
    deltaLabel: string
    icon: string
    color: string
    bg: string
    sparkline: number[]
    backgroundImage?: string
  }>
  tasks: Array<{
    id: string
    title: string
    priority: string
    due: string
    dueAt?: string
    status: string
    columnKey: string
    boardName: string
    assignee: string
    prog: number
  }>
  events: Array<{
    id: string
    title: string
    time: string
    end: string
    tag: string
    color: string
    attendees: string[]
    startTime?: string
    endTime?: string
  }>
  notifications: Array<{
    id: string
    type: string
    icon: string
    title: string
    content: string
    sub: string
    read: boolean
    color: string
    createdAt: string
    metadata?: Record<string, unknown>
  }>
  services: Array<{
    id: number
    link: string
    icon: string
    label: string
    count: string
    color: string
    appPhoto: string | null
  }>
  performance: {
    periodScore: number
    totalScore: number
    level: number
    progressPercent: number
  }
  _extra?: {
    dynamics?: {
      average_load: number
      labels: string[]
      datasets: Array<{ name: string; data: number[] }>
    }
    structure?: {
      total_count: number
      stats: Array<{ label: string; count: number }>
    }
    progress?: {
      completed_count: number
      total_count: number
      percentage: number
    }
    // Advanced Metrics
    sla?: {
      compliance: number
      onTime: number
      overdue: number
    }
    cycleTime?: {
      hours: number
      days: number
    }
    reopenRate?: number
    workload?: Array<{ name: string; value: number }>
    capacity?: {
      usage: number
      active: number
    }
    efficiencyTrend?: Array<{ date: string; value: number }>
    overdueTasks?: Array<{ id: string; title: string; days: number }>
    staleTasks?: Array<{ id: string; title: string; days: number }>
  }
}

export const getDefaultHomeDashboardViewModel = (): HomeDashboardViewModel => ({
  stats: STATS.map((stat) => ({
    ...stat,
    value: 0,
    delta: 0,
    sparkline: [],
  })),
  tasks: [],
  events: [],
  notifications: [],
  services: [],
  performance: {
    periodScore: 0,
    totalScore: 0,
    level: 0,
    progressPercent: 0,
  },
})

export const toHomeDashboardViewModel = (data: HomeDashboardData): HomeDashboardViewModel => {
  const summary = data.summary?.summary
  const dynamics = data.summary?.efficiency_dynamics
  const structure = data.summary?.task_structure
  const progress = data.summary?.completion_progress

  // 1. Stats
  const stats = [
    {
      ...STATS[0],
      value: summary?.active_tasks.count ?? (data.myTodoTasks || []).length,
      delta: summary?.active_tasks.trend_percentage ?? 0,
      deltaLabel: toDeltaLabel(summary?.active_tasks.trend_percentage ?? 0),
      sparkline: summary?.active_tasks.sparkline ?? [0, 0, 0, 0, 0, 0, 0],
    },
    {
      ...STATS[1],
      value: summary?.meetings_today.count ?? (data.weekEvents || { count: 0 }).count,
      delta: summary?.meetings_today.trend_percentage ?? 0,
      deltaLabel: toDeltaLabel(summary?.meetings_today.trend_percentage ?? 0),
    },
    {
      ...STATS[2],
      value: summary?.documents.count ?? (data.sharedItems || { count: 0 }).count,
      delta: summary?.documents.trend_percentage ?? 0,
      deltaLabel: 'новых за неделю',
    },
    {
      ...STATS[3],
      value: summary?.weekly_points.count ?? (data.gamification || { periodScore: 0 }).periodScore,
      delta: summary?.weekly_points.trend_percentage ?? 0,
      deltaLabel: `+${summary?.weekly_points.today_points ?? 0} сегодня`,
    },
  ]

  // 2. Tasks
  const tasks = (data.myTodoTasks || []).map((task) => {
    const columnKey = inferColumnKey(task.status, task.columnKey)
    return {
      id: task.id,
      title: task.title,
      priority: mapTaskPriorityLabel(task.priority),
      due: task.dueAt ? toShortDate(task.dueAt) : '—',
      dueAt: task.dueAt,
      status: mapTaskStatusLabel(columnKey, task.status),
      columnKey,
      boardName: task.boardName ?? '',
      assignee: '',
      prog: 0,
    }
  })

  // 3. Events
  const events = (data.upcomingEvents || []).map((event) => ({
    id: event.id,
    title: event.title,
    time: toShortTime(event.startTime),
    end: toShortTime(event.endTime),
    tag: event.isOnline ? 'Онлайн' : event.location || 'Оффлайн',
    color: event.isOnline ? C.blue : C.green,
    attendees: [],
    startTime: event.startTime,
    endTime: event.endTime,
  }))

  // 4. Notifications
  const notifications = (data.notifications || []).map((notification) => ({
    id: notification.id,
    type: notification.type ?? '',
    icon: notification.type?.includes('calendar')
      ? 'event'
      : notification.type?.includes('task') || notification.metadata?.kind === 'kanban_task'
      ? 'task_alt'
      : 'description',
    title: notification.title,
    content: notification.content,
    sub: `${notification.content} · ${toShortDate(notification.createdAt)}`,
    read: notification.isRead,
    color: notification.isRead ? C.inkMuted : C.blue,
    createdAt: notification.createdAt,
    metadata: notification.metadata,
  }))

  // 5. Services — из GET /api/v1/public-apps/favorites (см. HttpHomeRepository.getFavorites)
  const services = (data.favorites || []).map((app) => ({
    id: app.id,
    link: app.link,
    icon: resolveServiceIcon(app.appName),
    label: app.appName,
    count: app.isGlobal ? 'Глобальный' : 'Личный',
    color: app.isGlobal ? C.blue : C.green,
    appPhoto: app.appPhoto,
  }))

  return {
    stats,
    tasks,
    events,
    notifications,
    services,
    performance: {
      periodScore: summary?.weekly_points.count ?? (data.gamification || { periodScore: 0 }).periodScore,
      totalScore: (data.gamification || { totalScore: 0 }).totalScore,
      level: (data.gamification || { level: 0 }).level,
      progressPercent: progress?.percentage ?? Math.min(100, Math.max(0, (data.gamification || { totalScore: 0 }).totalScore)),
    },
    // Adding extra fields for the charts if needed, 
    // although DashboardPage uses local derived data for some charts, 
    // we should update DashboardPage to use these if possible.
    _extra: {
      dynamics,
      structure,
      progress,
      sla: data.sla ? {
        compliance: data.sla.compliance_percent,
        onTime: data.sla.closed_on_time,
        overdue: data.sla.closed_overdue,
      } : undefined,
      cycleTime: data.cycleTime ? {
        hours: data.cycleTime.avg_cycle_hours,
        days: data.cycleTime.avg_cycle_days,
      } : undefined,
      reopenRate: data.reopenRate?.reopen_rate_percent,
      workload: data.workload?.items?.map(i => {
        let name = i.name
        if (name === 'critical') name = 'Критический'
        else if (name === 'high') name = 'Высокий'
        else if (name === 'medium') name = 'Средний'
        else if (name === 'low') name = 'Низкий'
        else if (name === 'none') name = 'Без приоритета'
        else if (name === 'unknown') name = 'Неизвестно'
        return { name, value: i.count }
      }) || [],
      capacity: data.capacity ? {
        usage: data.capacity.usage_percent,
        active: data.capacity.active_task_count,
      } : undefined,
      efficiencyTrend: data.efficiencyTrend?.data_points?.map(p => ({
        date: toShortDate(p.date),
        value: p.efficiency_percent,
      })) || [],
      overdueTasks: (data.overdueTasks || []).map(t => ({ id: t.id, title: t.title, days: t.days_overdue })),
      staleTasks: (data.staleTasks || []).map(t => ({ id: t.id, title: t.title, days: t.days_since_last_activity })),
    },
  }
}
