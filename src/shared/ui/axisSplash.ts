// Bridge to the splash screen from public/axis-splash.js (loaded by index.html before React).
declare global {
  interface Window {
    showAxisSplash?: (label?: string) => void
    hideAxisSplash?: () => void
    showAxisSplashBeforeRedirect?: (label?: string) => void
  }
}

export function showAppSplash(label?: string): void {
  if (typeof window !== 'undefined') window.showAxisSplash?.(label)
}

export function hideAppSplash(): void {
  if (typeof window !== 'undefined') window.hideAxisSplash?.()
}

/** For full-page redirects (e.g. logout): the label is carried over to the next page load. */
export function showAppSplashBeforeRedirect(label: string): void {
  if (typeof window === 'undefined') return
  if (window.showAxisSplashBeforeRedirect) window.showAxisSplashBeforeRedirect(label)
  else window.showAxisSplash?.(label)
}
