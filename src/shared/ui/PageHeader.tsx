import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
}

/** Page title at the left, primary action at the right, section tabs below. */
export default function PageHeader({ title, description, meta, actions, children, className = '' }: PageHeaderProps) {
  return (
    <header className={`ts-page-header ${className}`}>
      <div className="ts-page-header__row">
        <div className="ts-page-header__copy">
          <div className="ts-page-header__title-row">
            <h1>{title}</h1>
            {meta}
          </div>
          {description && <p className="ts-page-description">{description}</p>}
        </div>
        {actions && <div className="ts-page-header__actions">{actions}</div>}
      </div>
      {children && <div className="ts-page-header__tabs">{children}</div>}
    </header>
  )
}
