import { useEffect, useRef } from 'react'
import type { CalendarEvent } from '../../domain/entities/CalendarEvent'
import { showBrowserNotification } from '../../shared/notifications/browserNotifications'
import type { CalendarController } from '../controllers/CalendarController'

export const CALENDAR_CHANGED_EVENT = 'calendar:changed'

export interface CalendarReminderItem {
  eventId: string
  title: string
  startTime: string
  endTime: string
  minutesBefore: number
  message: string
}

interface UseCalendarRemindersOptions {
  calendarController: CalendarController
  userId: number | null
  onReminder: (reminder: CalendarReminderItem) => void
  onOpenEvent: (eventId: string) => void
}

const MINUTE_MS = 60 * 1000
const CHECK_INTERVAL_MS = 20 * 1000
const RELOAD_INTERVAL_MS = 2 * 60 * 1000
const LOOKBEHIND_MS = 60 * MINUTE_MS
const LOOKAHEAD_MS = 26 * 60 * MINUTE_MS
const STARTED_GRACE_MS = MINUTE_MS
const FIRED_STORAGE_KEY = 'calendar-reminders-fired'
const FIRED_TTL_MS = 2 * 24 * 60 * MINUTE_MS

const timeFormatter = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })

const readFired = (): Record<string, number> => {
  try {
    const raw = window.localStorage.getItem(FIRED_STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : {}
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {}
  } catch {
    return {}
  }
}

const writeFired = (value: Record<string, number>) => {
  try {
    window.localStorage.setItem(FIRED_STORAGE_KEY, JSON.stringify(value))
  } catch {
    return
  }
}

const hasDeclined = (event: CalendarEvent, userId: number | null): boolean =>
  userId !== null &&
  event.attendees.some(
    (attendee) =>
      Number(attendee.userId || attendee.user?.id || 0) === userId && attendee.status === 'declined',
  )

const buildMessage = (event: CalendarEvent, minutesLeft: number): string => {
  const start = new Date(event.startTime)
  const end = new Date(event.endTime)
  const range = Number.isNaN(end.valueOf())
    ? timeFormatter.format(start)
    : `${timeFormatter.format(start)}–${timeFormatter.format(end)}`
  if (event.isAllDay) return 'Событие на весь день'
  if (minutesLeft <= 0) return `Начинается сейчас · ${range}`
  if (minutesLeft < 60) return `Через ${minutesLeft} мин · ${range}`
  const hours = Math.floor(minutesLeft / 60)
  const minutes = minutesLeft % 60
  return `Через ${hours} ч${minutes ? ` ${minutes} мин` : ''} · ${range}`
}

export function useCalendarReminders({
  calendarController,
  userId,
  onReminder,
  onOpenEvent,
}: UseCalendarRemindersOptions) {
  const eventsRef = useRef<CalendarEvent[]>([])
  const memoryFiredRef = useRef<Set<string>>(new Set())
  const onReminderRef = useRef(onReminder)
  const onOpenEventRef = useRef(onOpenEvent)

  useEffect(() => {
    onReminderRef.current = onReminder
    onOpenEventRef.current = onOpenEvent
  }, [onOpenEvent, onReminder])

  useEffect(() => {
    if (userId === null) {
      eventsRef.current = []
      return
    }

    let disposed = false

    const check = () => {
      const now = Date.now()
      const fired = readFired()
      let changed = false

      Object.entries(fired).forEach(([key, firedAt]) => {
        if (now - firedAt > FIRED_TTL_MS) {
          delete fired[key]
          changed = true
        }
      })

      eventsRef.current.forEach((event) => {
        if (event.reminderMinutes === null || event.reminderMinutes < 0) return
        if (hasDeclined(event, userId)) return
        const start = Date.parse(event.startTime)
        if (!Number.isFinite(start)) return
        const fireAt = start - event.reminderMinutes * MINUTE_MS
        if (now < fireAt || now > start + STARTED_GRACE_MS) return

        const key = `${event.id}:${event.startTime}:${event.reminderMinutes}`
        if (fired[key] || memoryFiredRef.current.has(key)) return
        fired[key] = now
        memoryFiredRef.current.add(key)
        changed = true

        const minutesLeft = Math.max(0, Math.round((start - now) / MINUTE_MS))
        const reminder: CalendarReminderItem = {
          eventId: event.id,
          title: event.title,
          startTime: event.startTime,
          endTime: event.endTime,
          minutesBefore: event.reminderMinutes,
          message: buildMessage(event, minutesLeft),
        }

        showBrowserNotification(event.title, {
          body: reminder.message,
          tag: `calendar-reminder-${key}`,
          onClick: () => onOpenEventRef.current(event.id),
        })
        onReminderRef.current(reminder)
      })

      if (changed) writeFired(fired)
    }

    const reload = async () => {
      const now = Date.now()
      try {
        const events = await calendarController.loadMyEvents(
          new Date(now - LOOKBEHIND_MS).toISOString(),
          new Date(now + LOOKAHEAD_MS).toISOString(),
        )
        if (disposed) return
        eventsRef.current = events
        check()
      } catch {
        return
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void reload()
    }
    const handleChanged = () => {
      void reload()
    }

    void reload()
    const checkTimer = window.setInterval(check, CHECK_INTERVAL_MS)
    const reloadTimer = window.setInterval(() => {
      void reload()
    }, RELOAD_INTERVAL_MS)
    window.addEventListener(CALENDAR_CHANGED_EVENT, handleChanged)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      disposed = true
      window.clearInterval(checkTimer)
      window.clearInterval(reloadTimer)
      window.removeEventListener(CALENDAR_CHANGED_EVENT, handleChanged)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [calendarController, userId])
}
