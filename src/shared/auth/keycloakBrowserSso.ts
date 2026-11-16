/** Password login can use a private Keycloak even when browser SSO is unavailable. */
export function isKeycloakBrowserSsoEnabled(): boolean {
  return import.meta.env.VITE_KEYCLOAK_BROWSER_SSO_ENABLED !== 'false'
}
