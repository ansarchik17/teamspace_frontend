import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Megaphone, X } from 'lucide-react'
import { HttpPublicationRepository } from '../../../infrastructure/repositories/HttpPublicationRepository'
import type { Publication, PublicationBannerColor } from '../../../infrastructure/repositories/HttpPublicationRepository'
import type { AuthSessionStore } from '../../../domain/services/AuthSessionStore'
import { PUBLICATION_BANNERS_CHANGED_EVENT } from '../../../shared/news/publicationBannerEvents'

interface PublicationBannerHostProps {
  sessionStore: AuthSessionStore
  refreshKey?: number
}

const BANNER_STYLES: Record<PublicationBannerColor, { background: string; border: string; text: string; button: string }> = {
  urgent: { background: '#FFF1F3', border: '#FECDD3', text: '#9F1239', button: '#E11D48' },
  warning: { background: '#FFF7E6', border: '#FDE2A7', text: '#92400E', button: '#D97706' },
  info: { background: '#EFF6FF', border: '#BFDBFE', text: '#1E3A8A', button: '#2563EB' },
  primary: { background: '#EEF2FF', border: '#C7D2FE', text: '#1E2A78', button: '#2458D3' },
}

const REFRESH_INTERVAL_MS = 5 * 60 * 1000

export default function PublicationBannerHost({ sessionStore, refreshKey = 0 }: PublicationBannerHostProps) {
  const navigate = useNavigate()
  const repository = useMemo(() => new HttpPublicationRepository(sessionStore), [sessionStore])
  const [banners, setBanners] = useState<Publication[]>([])
  const [index, setIndex] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const next = await repository.getActiveBanners()
      setBanners(next)
    } catch (error) {
      console.warn('Failed to load publication banners', error)
    }
  }, [repository])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  useEffect(() => {
    const reload = () => { void load() }
    const onVisibility = () => { if (document.visibilityState === 'visible') reload() }
    const timer = window.setInterval(reload, REFRESH_INTERVAL_MS)
    window.addEventListener(PUBLICATION_BANNERS_CHANGED_EVENT, reload)
    window.addEventListener('focus', reload)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener(PUBLICATION_BANNERS_CHANGED_EVENT, reload)
      window.removeEventListener('focus', reload)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [load])

  if (banners.length === 0) return null

  const safeIndex = Math.min(index, banners.length - 1)
  const banner = banners[safeIndex]
  const style = BANNER_STYLES[banner.banner_color || 'urgent'] || BANNER_STYLES.urgent
  const busy = busyId === banner.id

  const removeLocal = (id: string) => {
    setBanners((current) => current.filter((item) => item.id !== id))
    setIndex(0)
  }

  const openPublication = () => navigate(`/news/${encodeURIComponent(banner.id)}`)

  const openAction = () => {
    const url = (banner.banner_action_url || '').trim()
    if (!url) {
      openPublication()
      return
    }
    if (url.startsWith('/')) {
      navigate(url)
      return
    }
    if (/^https:\/\//i.test(url)) {
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }
    openPublication()
  }

  const dismiss = async () => {
    setBusyId(banner.id)
    try {
      await repository.dismissBanner(banner.id)
      removeLocal(banner.id)
    } catch (error) {
      console.warn('Failed to dismiss publication banner', error)
    } finally {
      setBusyId(null)
    }
  }

  const acknowledge = async () => {
    setBusyId(banner.id)
    try {
      await repository.acknowledgePublication(banner.id)
      removeLocal(banner.id)
    } catch (error) {
      console.warn('Failed to acknowledge publication banner', error)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="publication-banner-host relative z-[480] flex shrink-0 justify-center border-b border-[var(--ts-border)] bg-white px-4 py-3 md:px-6 xl:px-8">
      <div
        role="alert"
        className="flex w-full items-center gap-3 rounded-lg border px-4 py-3"
        style={{ background: style.background, borderColor: style.border, color: style.text, fontFamily: 'var(--ts-font)' }}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/70">
          <Megaphone size={18} />
        </span>
        <button type="button" onClick={openPublication} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[13px] font-bold">{banner.title}</span>
          {banner.content ? <span className="block truncate text-[12px] opacity-80">{banner.content.replace(/\s+/g, ' ').trim()}</span> : null}
        </button>
        {banners.length > 1 ? (
          <span className="hidden shrink-0 items-center gap-1 text-[11px] font-semibold sm:flex">
            <button type="button" aria-label="Предыдущее объявление" onClick={() => setIndex((safeIndex - 1 + banners.length) % banners.length)} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-white/70"><ChevronLeft size={14} /></button>
            <span>{safeIndex + 1}/{banners.length}</span>
            <button type="button" aria-label="Следующее объявление" onClick={() => setIndex((safeIndex + 1) % banners.length)} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-white/70"><ChevronRight size={14} /></button>
          </span>
        ) : null}
        <button type="button" onClick={openAction} className="shrink-0 rounded-xl border bg-white/70 px-3 py-1.5 text-[12px] font-semibold transition hover:bg-white" style={{ borderColor: style.border }}>
          {banner.banner_action_text || 'Открыть'}
        </button>
        {banner.requires_acknowledgement ? (
          <button type="button" disabled={busy} onClick={() => void acknowledge()} className="shrink-0 rounded-xl px-3 py-1.5 text-[12px] font-bold text-white transition disabled:opacity-50" style={{ background: style.button }}>
            Ознакомлен
          </button>
        ) : (
          <button type="button" disabled={busy} aria-label="Скрыть баннер" title="Скрыть" onClick={() => void dismiss()} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:bg-white/70 disabled:opacity-50">
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
