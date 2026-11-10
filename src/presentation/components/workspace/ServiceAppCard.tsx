import { Bookmark } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import { useWorkspaceFavoriteIds } from './workspaceFavorites'
import { type WorkspaceApp } from './workspaceApps'

export function ServiceSoonChip() {
  const { t } = useTranslation('shell')
  return <span className="inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-[6px] bg-[#FFF6E5] px-2 text-[12px] font-medium text-[#946000]"><span className="h-1.5 w-1.5 rounded-full bg-current" />{t('services.soon')}</span>
}

export function ServicePinButton({ app, className = '' }: { app: WorkspaceApp; className?: string }) {
  const { t } = useTranslation('shell')
  const { ids, toggle } = useWorkspaceFavoriteIds()
  const active = ids.includes(app.id)
  const label = active ? t('services.unpin') : t('services.pin')
  return <button type="button" aria-pressed={active} aria-label={`${label}: ${app.label}`} title={label}
    onClick={(event) => { event.stopPropagation(); toggle(app.id) }}
    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] transition-colors duration-[120ms] hover:bg-[#F1F3F6] ${active ? 'text-[#2458D3]' : 'text-[#7B8494] hover:text-[#17202E]'} ${AXIS_UI.focus} ${className}`}>
    <Bookmark size={17} strokeWidth={1.75} fill={active ? 'currentColor' : 'none'} />
  </button>
}

export default function ServiceAppCard({ app, onOpen, onLaunch, variant = 'list' }: {
  app: WorkspaceApp
  onOpen: (app: WorkspaceApp) => void
  onLaunch: (app: WorkspaceApp) => void
  variant?: 'list' | 'favorite'
}) {
  const { t } = useTranslation('shell')
  const Icon = app.icon
  const color = app.route ? app.color : '#7B8494'

  return <article className={`teamstore-service teamstore-service--${variant}`}>
    <span aria-hidden="true" className="teamstore-service-icon" style={{ backgroundColor: color }}>
      <Icon size={25} strokeWidth={1.75} />
    </span>
    <div className="teamstore-service-copy">
      <h3 className="teamstore-service-name">
        <button type="button" onClick={() => onOpen(app)} aria-label={t('services.details', { name: app.label })}
          className={`teamstore-service-details ${AXIS_UI.focus}`}>{app.label}</button>
        {!app.route && <ServiceSoonChip />}
      </h3>
      <p className="teamstore-service-description">{app.description}</p>
    </div>
    <div className="teamstore-service-actions">
      <ServicePinButton app={app} className="min-h-10 min-w-10" />
      <button type="button" disabled={!app.route} onClick={() => onLaunch(app)} aria-label={`${t('services.open')}: ${app.label}`}
        className={`teamstore-service-launch ${AXIS_UI.focus}`}>{t('services.open')}</button>
    </div>
  </article>
}
