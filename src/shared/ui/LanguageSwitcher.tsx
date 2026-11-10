import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HttpUserLanguageRepository } from '../../infrastructure/repositories/HttpUserLanguageRepository'
import { SUPPORTED_LANGUAGES, changeLanguage, normalizeLanguage, setLanguage, type AppLanguage } from '../i18n'

const SHORT_LABELS: Record<AppLanguage, string> = { ru: 'RU', kk: 'KZ' }

export default function LanguageSwitcher({ className = '', persist = true }: { className?: string; persist?: boolean }) {
  const { t, i18n } = useTranslation(['shell', 'common'])
  const repository = useMemo(() => new HttpUserLanguageRepository(), [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const current = normalizeLanguage(i18n.resolvedLanguage ?? i18n.language) ?? 'ru'

  const select = async (language: AppLanguage) => {
    if (busy || language === current) return
    setBusy(true)
    setError('')
    if (!persist) {
      await setLanguage(language)
      setBusy(false)
      return
    }
    const result = await changeLanguage(language, (next) => repository.saveLanguage(next))
    if (result === 'rejected') setError(t('language.saveFailed'))
    setBusy(false)
  }

  return (
    <div className={`relative ${className}`}>
      <div
        role="group"
        aria-label={t('language.title')}
        className="flex h-9 items-center gap-0.5 rounded-xl bg-[#F4F7FB] p-0.5"
      >
        {SUPPORTED_LANGUAGES.map((language) => {
          const active = language === current
          const name = t(`common:language.${language}`)
          return (
            <button
              key={language}
              type="button"
              lang={language}
              aria-pressed={active}
              aria-label={name}
              title={name}
              disabled={busy}
              onClick={() => { void select(language) }}
              className={[
                'flex h-8 min-w-9 items-center justify-center rounded-[10px] border-0 px-2 text-[12px] font-bold transition-colors duration-150 cursor-pointer disabled:cursor-default',
                active ? 'bg-white text-[#2F4BE2] shadow-[0_1px_3px_rgba(15,35,62,0.12)]' : 'bg-transparent text-[#6B7F99] hover:text-[#1A1F36]',
              ].join(' ')}
            >
              {SHORT_LABELS[language]}
            </button>
          )
        })}
      </div>
      {error ? (
        <p role="alert" className="absolute right-0 top-11 z-300 w-56 rounded-xl border border-[#F5B5B5] bg-[#FFF0F0] px-3 py-2 text-[11px] font-semibold text-[#C53030] shadow-sm">
          {error}
        </p>
      ) : null}
    </div>
  )
}
