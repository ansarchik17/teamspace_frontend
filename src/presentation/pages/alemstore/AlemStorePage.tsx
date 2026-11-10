import ServiceDetailsModal, { type ServiceSelection } from '../../components/workspace/ServiceDetailsModal'
import { workspaceFavoriteId, useWorkspaceFavoriteIds, notifyFavoritesChanged } from '../../components/workspace/workspaceFavorites'
import TeamStoreCategories from '../../components/alemstore/TeamStoreCategories'
import './teamstore.css'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createAlemStoreController } from '../../alemstore/createAlemStoreController'
import { groupAppsBySubcategory } from '../../alemstore/alemStoreSubcategories'
import AlemStoreAppGridCard from '../../components/alemstore/AlemStoreAppGridCard'
import AlemStoreHero from '../../components/alemstore/AlemStoreHero'
import AlemStoreCatalogSearch from '../../components/alemstore/AlemStoreCatalogSearch'
import AlemStoreSkeletons from '../../components/alemstore/AlemStoreSkeletons'
import type { AlemStoreAppViewModel } from '../../view-models/AlemStoreViewModel'
import { Search, ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import ServiceAppCard from '../../components/workspace/ServiceAppCard'
import { DataTableEmpty } from '../../../shared/ui/DataTable'
import {
  useWorkspaceAppCategories,
  useWorkspaceApps,
  type WorkspaceApp,
  type WorkspaceAppCategory,
} from '../../components/workspace/workspaceApps'
import AppToast from '../../../shared/ui/AppToast'
import { getErrorMessage } from '../../../shared/utils/getErrorMessage'
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore'
import { MAIL_APP_URL, openWorkspaceMail } from '../../../shared/config/mailConfig'
import { isSenimDeskApp, openWorkspaceSenimDesk } from '../../../shared/config/senimdesk'
import { openWorkspaceServiceInNewTab } from '../../../shared/config/serviceLaunch'

const sessionStore = new LocalStorageAuthSessionStore()

type SortKind = 'position' | 'rating'

type DownloadedKind = 'all' | 'downloaded' | 'not_downloaded'

export default function AlemStorePage() {
  const navigate = useNavigate()
  const workspaceApps = useWorkspaceApps()
  const workspaceAppCategories = useWorkspaceAppCategories()
  const [selectedService, setSelectedService] = useState<ServiceSelection | null>(null)
  const [storedApps, setApps] = useState<AlemStoreAppViewModel[]>([])
  const { ids: favoriteIds, toggle: toggleWorkspaceFavorite } = useWorkspaceFavoriteIds()
  const apps = useMemo(() => storedApps.filter(app => app.appName.trim().toLowerCase() !== 'crm').map(app => {
    const id = workspaceFavoriteId(app.appName)
    return id ? { ...app, isFavorite: favoriteIds.includes(id) } : app
  }), [storedApps, favoriteIds])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKind>('position')
  const [downloaded, setDownloaded] = useState<DownloadedKind>('all')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [appQuery, setAppQuery] = useState('')
  const [appCategory, setAppCategory] = useState<'all' | WorkspaceAppCategory>('all')
  const { t: st } = useTranslation('shell')
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [pendingRatingId, setPendingRatingId] = useState<number | null>(null)
  const [removedIds, setRemovedIds] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('workspace_removed_ids')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    localStorage.setItem('workspace_removed_ids', JSON.stringify(removedIds))
  }, [removedIds])

  const { alemStoreController } = useMemo(() => createAlemStoreController(), [])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 2500)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const loadApps = useCallback(
    async (options?: { force?: boolean; name?: string; downloaded?: boolean; category?: string }) => {
      setIsLoading(true)
      setError('')

      try {
        const viewModel = await alemStoreController.load({
          ...options,
          sort,
          category: options?.category,
        })
        setApps(viewModel.apps)
      } catch (error) {
        setError(getErrorMessage(error, 'Не удалось загрузить список приложений. Попробуйте снова.'))
      } finally {
        setIsLoading(false)
      }
    },
    [alemStoreController, sort],
  )

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadApps({
        name: query.trim() || undefined,
        downloaded: downloaded === 'all' ? undefined : downloaded === 'downloaded',
        category: selectedCategory || undefined,
      })
    }, 280)

    return () => window.clearTimeout(timeout)
  }, [downloaded, loadApps, query, selectedCategory])

  const tagOptions = useMemo(() => {
    const counts = new Map<string, number>()

    apps.forEach((app) => {
      app.tags.forEach((tag) => {
        const normalizedTag = tag.trim()
        if (!normalizedTag) {
          return
        }
        counts.set(normalizedTag, (counts.get(normalizedTag) ?? 0) + 1)
      })
    })

    return Array.from(counts.entries())
      .sort((left, right) => {
        if (left[1] !== right[1]) {
          return right[1] - left[1]
        }
        return left[0].localeCompare(right[0], 'ru')
      })
      .map(([tag, count]) => ({ tag, count }))
  }, [apps])

  useEffect(() => {
    const availableTags = new Set(tagOptions.map(({ tag }) => tag))
    setSelectedTags((current) => current.filter((tag) => availableTags.has(tag)))
  }, [tagOptions])

  const filteredApps = useMemo(() => {
    if (selectedTags.length === 0) {
      return apps
    }

    return apps.filter((app) => app.tags.some((tag) => selectedTags.includes(tag)))
  }, [apps, selectedTags])

  const heroApps = useMemo(
    () =>
      [...filteredApps]
        .sort((left, right) => {
          if (left.averageRating !== right.averageRating) {
            return right.averageRating - left.averageRating
          }
          if (left.ratingCount !== right.ratingCount) {
            return right.ratingCount - left.ratingCount
          }
          if (left.position !== right.position) {
            return left.position - right.position
          }
          return left.appName.localeCompare(right.appName, 'ru')
        })
        .slice(0, 3),
    [filteredApps],
  )
  const heroIds = useMemo(() => new Set(heroApps.map((app) => app.id)), [heroApps])
  const showStoreHero = heroApps.length === 3
  const listApps = useMemo(() => (showStoreHero ? filteredApps.filter((app) => !heroIds.has(app.id)) : filteredApps), [filteredApps, heroIds, showStoreHero])

  const catalogGroups = useMemo(() => groupAppsBySubcategory(listApps), [listApps])

  const clearTags = useCallback(() => {
    setSelectedTags([])
  }, [])

  const toggleFavorite = async (targetApp: AlemStoreAppViewModel) => {
    const workspaceId = workspaceFavoriteId(targetApp.appName)
    if (workspaceId) {
      toggleWorkspaceFavorite(workspaceId)
      return
    }
    if (pendingId !== null) {
      return
    }

    const previous = apps
    const nextFavorite = !targetApp.isFavorite

    setPendingId(targetApp.id)
    setError('')
    setApps((current) =>
      current.map((app) =>
        app.id === targetApp.id
          ? {
              ...app,
              isFavorite: nextFavorite,
            }
          : app,
      ),
    )

    try {
      if (nextFavorite) {
        await alemStoreController.addToFavorites(targetApp.id)
        setRemovedIds((prev) => prev.filter((id) => id !== targetApp.id))
        setToast('Добавлено в избранное')
      } else {
        await alemStoreController.removeFromFavorites(targetApp.id)
        setToast('Удалено из избранного')
      }
      notifyFavoritesChanged()
    } catch (error) {
      setApps(previous)
      setError(getErrorMessage(error, 'Операция не выполнена. Попробуйте еще раз.'))
    } finally {
      setPendingId(null)
    }
  }

  const rateApp = async (targetApp: AlemStoreAppViewModel, rating: number) => {
    if (pendingRatingId !== null) {
      return
    }

    const previous = apps
    const next = apps.map((app) =>
      app.id === targetApp.id
        ? {
            ...app,
            myRating: rating,
          }
        : app,
    )

    setPendingRatingId(targetApp.id)
    setApps(next)
    setError('')

    try {
      const updated = await alemStoreController.rateApp(targetApp.id, rating)
      setApps((current) => current.map((app) => (app.id === updated.id ? updated : app)))
      setToast('Оценка сохранена')
    } catch (error) {
      setApps(previous)
      setError(getErrorMessage(error, 'Не удалось сохранить оценку. Попробуйте снова.'))
    } finally {
      setPendingRatingId(null)
    }
  }

  const clearRating = async (targetApp: AlemStoreAppViewModel) => {
    if (pendingRatingId !== null) {
      return
    }

    const previous = apps
    setPendingRatingId(targetApp.id)
    setApps((current) => current.map((app) => (app.id === targetApp.id ? { ...app, myRating: null } : app)))
    setError('')

    try {
      const updated = await alemStoreController.clearRating(targetApp.id)
      setApps((current) => current.map((app) => (app.id === updated.id ? updated : app)))
      setToast('Оценка удалена')
    } catch (error) {
      setApps(previous)
      setError(getErrorMessage(error, 'Не удалось удалить оценку. Попробуйте снова.'))
    } finally {
      setPendingRatingId(null)
    }
  }

  const handleOpen = (app: AlemStoreAppViewModel) => {
    if (isSenimDeskApp(app.appName)) {
      openWorkspaceSenimDesk()
      return
    }
    if (app.id === 42) {
      navigate('/teamai')
      return
    }

    if (app.id === 38) {
      navigate('/board')
      return
    }

    if (!app.link) {
      return
    }

    let finalUrl = app.link
    if (app.id === 39 || app.appName.toLowerCase().includes('drive')) {
      try {
        const url = new URL(app.link)
        const token = sessionStore.getTokens()?.accessToken
        if (token) {
          url.searchParams.set('token', token)
        }
        finalUrl = url.toString()
      } catch {
        // use original
      }
    }

    window.open(finalUrl, '_blank', 'noopener,noreferrer')
  }

  const totalAppsLabel =
    selectedTags.length > 0 ? `${filteredApps.length} из ${apps.length} приложений` : `${apps.length} приложений`

  const normalizedAppQuery = appQuery.trim().toLowerCase()
  const visibleWorkspaceApps = workspaceApps
    .filter((app) => {
      if (appCategory !== 'all' && app.category !== appCategory) return false
      return !normalizedAppQuery || `${app.label} ${app.description}`.toLowerCase().includes(normalizedAppQuery)
    })
  const catalogHasApps = apps.length > 0 || query.trim() !== '' || selectedTags.length > 0 || downloaded !== 'all' || selectedCategory !== ''

  const favoriteApps = favoriteIds.map((id) => workspaceApps.find((app) => app.id === id)).filter((app): app is WorkspaceApp => Boolean(app))
  const openWorkspaceApp = (app: WorkspaceApp) => {
    if (!app.route) return
    if (openWorkspaceServiceInNewTab(app.route)) return
    if (app.id === 'mail' || app.route === MAIL_APP_URL) openWorkspaceMail()
    else if (app.route.startsWith('http')) window.open(app.route, '_blank', 'noopener,noreferrer')
    else navigate(app.route)
  }

  return (
    <main className="teamstore-page custom-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden subpixel-antialiased">
      {error ? <AppToast variant="error" message={error} onClose={() => setError('')} /> : null}
      {toast ? <AppToast variant="success" message={toast} onClose={() => setToast('')} /> : null}

      <div className="teamstore-content">
        <header className="teamstore-header">
          <div className="teamstore-title"><h1>{st('services.title')}</h1><span className="teamstore-total">{workspaceApps.length}</span></div>
          <label className="teamstore-search">
            <span className="sr-only">{st('services.search')}</span><Search size={18} strokeWidth={1.75} />
            <input type="search" value={appQuery} onChange={event => setAppQuery(event.target.value)} placeholder={st('services.search')} />
          </label>
        </header>

        <section aria-labelledby="services-favorites">
          <h2 id="services-favorites" className="teamstore-section-title">{st('services.favorites')}{' '}<span className="teamstore-section-count">{favoriteApps.length}</span></h2>
          {favoriteApps.length ? <div className="teamstore-favorites">
            {favoriteApps.map(app => <ServiceAppCard key={app.id} app={app} variant="favorite"
              onOpen={app => setSelectedService({ kind: 'workspace', app })} onLaunch={openWorkspaceApp} />)}
          </div> : <p className="teamstore-favorites-empty">{st('services.favoritesEmpty')}</p>}
        </section>

        <TeamStoreCategories apps={workspaceApps} selectedCategory={appCategory} onSelect={setAppCategory} />

        <section id="teamstore-services" aria-labelledby="teamstore-services-title" className="teamstore-services">
          <div className="teamstore-services-heading">
            <h2 id="teamstore-services-title" className="teamstore-section-title">
              {normalizedAppQuery ? st('services.searchResults') : appCategory === 'all' ? st('services.allServices') : workspaceAppCategories[appCategory]}
              {' '}<span className="teamstore-section-count">{visibleWorkspaceApps.length}</span>
            </h2>
            {appCategory !== 'all' && <button type="button" onClick={() => setAppCategory('all')} className="teamstore-reset"><ArrowLeft size={15} />{st('services.allServices')}</button>}
          </div>
          {!visibleWorkspaceApps.length ? <DataTableEmpty title={st('services.emptyTitle')} text={st('services.emptyText')} icon={<Search size={22} strokeWidth={1.75} />} />
            : <div className="teamstore-service-list">
              {visibleWorkspaceApps.map(app => <ServiceAppCard key={app.id} app={app} variant="favorite"
                onOpen={app => setSelectedService({ kind: 'workspace', app })} onLaunch={openWorkspaceApp} />)}
            </div>}
        </section>

        {catalogHasApps || isLoading ? (
          <section className="mt-10 border-t border-[#E2E5EA] pt-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-[24px] font-semibold leading-8 text-[#17202E]">Каталог организации</h2>
                <p className="mt-1 text-[14px] leading-5 text-[#586174]">
                  Дополнительные приложения, которые подключила ваша организация{apps.length ? ` · ${totalAppsLabel}` : ''}.
                </p>
              </div>
            </div>

            <AlemStoreCatalogSearch
              query={query}
              onQueryChange={setQuery}
              sort={sort}
              onSortChange={setSort}
              downloaded={downloaded}
              onDownloadedChange={setDownloaded}
              tagOptions={tagOptions}
              selectedTags={selectedTags}
              onSelectedTagsChange={setSelectedTags}
              onClearTags={clearTags}
              category={selectedCategory}
              onCategoryChange={setSelectedCategory}
            />

            <div className="mt-6">
              {isLoading ? <AlemStoreSkeletons /> : null}

              {!isLoading && showStoreHero ? (
                <AlemStoreHero
                  apps={heroApps}
                  pendingId={pendingId}
                  pendingRatingId={pendingRatingId}
                  onOpen={app => setSelectedService({kind: 'catalog', app})}
                  onToggleFavorite={(target) => {
                    void toggleFavorite(target)
                  }}
                  onRate={(target, rating) => {
                    void rateApp(target, rating)
                  }}
                  onClearRating={(target) => {
                    void clearRating(target)
                  }}
                />
              ) : null}

              {!isLoading && filteredApps.length === 0 ? (
                <div className="flex flex-col items-center rounded-[8px] border border-dashed border-[#E2E5EA] py-10 text-center">
                  <h3 className="text-[16px] font-semibold text-[#17202E]">Ничего не найдено</h3>
                  <p className="mt-1 text-[14px] text-[#586174]">Измените поиск, фильтр по установке или выбранные теги.</p>
                </div>
              ) : null}

              {!isLoading && catalogGroups.length > 0 ? (
                <div className="flex flex-col gap-8">
                  {catalogGroups.map((group) => (
                    <div key={group.id}>
                      <h3 className="mb-3 text-[18px] font-semibold leading-[26px] text-[#17202E]">{group.title}</h3>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {group.apps.map((app) => (
                          <AlemStoreAppGridCard
                            key={app.id}
                            app={app}
                            isPendingFavorite={pendingId === app.id}
                            isPendingRating={pendingRatingId === app.id}
                            onOpen={app => setSelectedService({kind: 'catalog', app})}
                            onToggleFavorite={(target) => {
                              void toggleFavorite(target)
                            }}
                            onRate={(target, rating) => {
                              void rateApp(target, rating)
                            }}
                            onClearRating={(target) => {
                              void clearRating(target)
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
      {selectedService && <ServiceDetailsModal selection={selectedService}
        active={selectedService.kind === 'workspace' ? favoriteIds.includes(selectedService.app.id) : Boolean(apps.find(app => app.id === selectedService.app.id)?.isFavorite)}
        pending={selectedService.kind === 'catalog' && pendingId === selectedService.app.id}
        onClose={() => setSelectedService(null)}
        onFavorite={() => { if (selectedService.kind === 'workspace') toggleWorkspaceFavorite(selectedService.app.id); else { const app = apps.find(item => item.id === selectedService.app.id); if (app) void toggleFavorite(app) } }}
        onLaunch={() => { if (selectedService.kind === 'workspace') openWorkspaceApp(selectedService.app); else handleOpen(selectedService.app); setSelectedService(null) }}
      />}
    </main>
  )
}
