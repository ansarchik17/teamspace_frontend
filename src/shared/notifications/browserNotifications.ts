export type BrowserNotificationPermission = NotificationPermission | 'unsupported'

export const canUseBrowserNotifications = (): boolean =>
  typeof window !== 'undefined' && 'Notification' in window

export const getBrowserNotificationPermission = (): BrowserNotificationPermission => {
  if (!canUseBrowserNotifications()) return 'unsupported'
  return window.Notification.permission
}

export const requestBrowserNotificationPermission = async (): Promise<BrowserNotificationPermission> => {
  if (!canUseBrowserNotifications()) return 'unsupported'
  if (window.Notification.permission !== 'default') return window.Notification.permission
  try {
    return await window.Notification.requestPermission()
  } catch {
    return window.Notification.permission
  }
}

export const showBrowserNotification = (
  title: string,
  options: NotificationOptions & { onClick?: () => void },
): boolean => {
  if (getBrowserNotificationPermission() !== 'granted') return false
  const { onClick, ...notificationOptions } = options
  try {
    const notification = new window.Notification(title, notificationOptions)
    if (onClick) {
      notification.onclick = () => {
        window.focus()
        onClick()
        notification.close()
      }
    }
    return true
  } catch {
    return false
  }
}
