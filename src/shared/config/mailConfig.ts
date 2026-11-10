import { LocalStorageAuthSessionStore } from '../../infrastructure/storage/LocalStorageAuthSessionStore'

const configuredMailUrl = import.meta.env.VITE_MAIL_APP_URL?.trim()

export const MAIL_APP_URL = configuredMailUrl || 'https://inbox.teamspace.kz'

export function openWorkspaceMail(): void {
  const accessToken = new LocalStorageAuthSessionStore().getTokens()?.accessToken
  if (!accessToken) {
    window.alert('Войдите в Workspace, чтобы открыть корпоративную почту.')
    return
  }
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = new URL('/api/auth/workspace', MAIL_APP_URL).toString()
  form.target = '_blank'
  form.rel = 'noopener'
  const input = document.createElement('input')
  input.type = 'hidden'
  input.name = 'accessToken'
  input.value = accessToken
  form.append(input)
  document.body.append(form)
  form.submit()
  form.remove()
}
