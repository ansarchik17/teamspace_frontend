import { useState, type FormEvent } from 'react'
import { CircleAlert, Eye, EyeOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export interface PasswordLoginSubmitOptions {
  restoreHistory: boolean
}

interface LoginFormProps {
  loading: boolean
  loadingLabel?: string
  error: string
  onSubmit: (login: string, password: string, options: PasswordLoginSubmitOptions) => Promise<void>
  onLoginChange?: (login: string) => void
  onKeycloakLogin?: (loginHint?: string) => void
  onEgovLogin?: () => void
  onUseFreshKeyFallback?: () => void
  onUseQrFallback?: () => void
}

const IIN_PATTERN = /^\d{12}$/
const isValidLoginValue = (value: string) => IIN_PATTERN.test(value) || value.includes('@')

export function LoginForm({ loading, loadingLabel, error, onSubmit, onLoginChange, onKeycloakLogin }: LoginFormProps) {
  const { t } = useTranslation(['auth', 'common'])
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loginError, setLoginError] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedLogin = login.trim()

    if (!isValidLoginValue(normalizedLogin)) {
      setLoginError(t('form.loginInvalid'))
      return
    }

    setLoginError('')
    await onSubmit(normalizedLogin, password, { restoreHistory: false })
  }

  return (
    <form onSubmit={handleSubmit} className="axis-login-form" noValidate>
      <div className="axis-field">
        <label htmlFor="login">{t('form.loginLabel')}</label>
        <input
          id="login"
          className={`axis-input${loginError ? ' is-error' : ''}`}
          type="text"
          inputMode="email"
          autoComplete="username"
          placeholder={t('form.loginPlaceholder')}
          value={login}
          onChange={(event) => {
            setLogin(event.target.value)
            onLoginChange?.(event.target.value)
            if (loginError) setLoginError('')
          }}
          aria-invalid={Boolean(loginError)}
          aria-describedby={loginError ? 'login-error' : undefined}
          required
        />
        {loginError ? (
          <p id="login-error" className="axis-field-error">
            <CircleAlert size={16} strokeWidth={2} aria-hidden="true" />
            {loginError}
          </p>
        ) : null}
      </div>

      <div className="axis-field">
        <label htmlFor="password">{t('form.passwordLabel')}</label>
        <div className="axis-input-wrap">
          <input
            id="password"
            className="axis-input has-action"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder={t('form.passwordPlaceholder')}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="axis-input-action absolute"
            aria-label={showPassword ? t('common:password.hide') : t('common:password.show')}
          >
            {showPassword ? <EyeOff size={20} strokeWidth={1.75} /> : <Eye size={20} strokeWidth={1.75} />}
          </button>
        </div>
      </div>

      {error ? (
        <div className="axis-login-error" role="alert">
          <CircleAlert size={20} strokeWidth={1.75} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      <button type="submit" disabled={loading} aria-busy={loading} className="axis-primary-button">
        {loading ? (
          <>
            <span className="axis-spinner" aria-hidden="true" />
            {loadingLabel ?? t('login.signingIn')}
          </>
        ) : t('form.submit')}
      </button>

      {onKeycloakLogin ? (
        <>
          <div className="axis-form-divider"><span>{t('form.or')}</span></div>
          <button
            type="button"
            disabled={loading}
            onClick={() => onKeycloakLogin(login.trim() || undefined)}
            className="axis-secondary-button"
          >
            {t('form.sso')}
          </button>
        </>
      ) : null}
    </form>
  )
}
