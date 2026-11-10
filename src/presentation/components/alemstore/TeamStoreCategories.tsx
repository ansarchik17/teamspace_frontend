import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { WORKSPACE_APP_CATEGORY_IDS, useWorkspaceAppCategories, type WorkspaceApp, type WorkspaceAppCategory } from '../workspace/workspaceApps'

interface TeamStoreCategoriesProps {
  apps: WorkspaceApp[]
  selectedCategory: 'all' | WorkspaceAppCategory
  onSelect: (category: WorkspaceAppCategory) => void
}

export default function TeamStoreCategories({ apps, selectedCategory, onSelect }: TeamStoreCategoriesProps) {
  const { t } = useTranslation('shell')
  const categories = useWorkspaceAppCategories()

  return <section aria-labelledby="teamstore-categories-title" className="teamstore-categories">
    <h2 id="teamstore-categories-title" className="teamstore-section-title">{t('services.categories')}</h2>
    <div className="teamstore-category-grid">
      {WORKSPACE_APP_CATEGORY_IDS.map(category => {
        const count = apps.filter(app => app.category === category).length
        return <button key={category} type="button" className={`teamstore-category teamstore-category--${category}`}
          aria-pressed={selectedCategory === category} aria-controls="teamstore-services" onClick={() => onSelect(category)}>
          <span aria-hidden="true" className="teamstore-category-art" />
          <span className="teamstore-category-copy">
            <span className="teamstore-category-title">{categories[category]}</span>
            <span className="teamstore-category-count">{t('services.categoryCount', { count })}</span>
          </span>
          <span aria-hidden="true" className="teamstore-category-arrow"><ArrowRight size={19} strokeWidth={1.8} /></span>
        </button>
      })}
    </div>
  </section>
}
