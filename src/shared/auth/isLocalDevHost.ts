/** True when the app runs from a local dev server (Vite proxies /api to a remote backend). */
export function isLocalDevHost(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const { hostname } = window.location
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0'
}
