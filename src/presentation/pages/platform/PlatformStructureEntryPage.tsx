import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { HttpOrganizationRepository } from '../../../infrastructure/repositories/HttpOrganizationRepository'
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import PeopleSectionHeader from '../../components/people/PeopleSectionHeader'
import { PLATFORM_CREATE_ORGANIZATION_HREF, PLATFORM_STRUCTURE_HREF, readLastPlatformOrganizationId } from './platformStructureNavigation'

/**
 * Вход во вкладку «Структура» для системного администратора:
 * сразу открывает схему последней выбранной (или первой) компании.
 */
export default function PlatformStructureEntryPage() {
  const navigate = useNavigate()
  const sessionStore = useMemo(() => new LocalStorageAuthSessionStore(), [])
  const repository = useMemo(() => new HttpOrganizationRepository(sessionStore), [sessionStore])
  const [targetId, setTargetId] = useState<string | null>(null)
  const [empty, setEmpty] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    repository
      .listPlatformOrganizations({ limit: 100, offset: 0 })
      .then((result) => {
        if (cancelled) return
        const items = result.items ?? []
        if (items.length === 0) {
          setEmpty(true)
          return
        }
        const lastId = readLastPlatformOrganizationId()
        setTargetId(items.some((item) => item.id === lastId) ? lastId : items[0].id)
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить компании')
      })
    return () => {
      cancelled = true
    }
  }, [repository])

  if (targetId) return <Navigate to={`/platform/organizations/${targetId}/structure`} replace />

  return (
    <main className="min-h-full min-w-0 bg-[#F6F7F9] px-4 py-6 [font-family:Inter,sans-serif] md:px-6 xl:px-8">
      <PeopleSectionHeader active="structure" title="Структура" structureHref={PLATFORM_STRUCTURE_HREF} accessHref="/organization/access" description="Подразделения, руководители и команды" />
      <div className="mx-auto mt-10 max-w-xl rounded-[12px] border border-[#E2E5EA] bg-white p-8 text-center">
        {empty || error ? (
          <>
            <span className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${error ? 'bg-[#FFF0F0] text-[#C03437]' : 'bg-[#EDF2FF] text-[#2458D3]'}`}>
              <MaterialSymbol name={error ? 'error_outline' : 'business'} size={22} color="currentColor" />
            </span>
            <h2 className="mt-4 text-[18px] font-semibold leading-[26px] text-[#17202E]">{error ? 'Не удалось загрузить компании' : 'Компаний пока нет'}</h2>
            <p className="mx-auto mt-2 max-w-md text-[14px] leading-5 text-[#586174]">
              {error ?? 'Создайте компанию и назначьте ей владельца, после этого здесь появится её структура.'}
            </p>
            <button type="button" onClick={() => navigate(PLATFORM_CREATE_ORGANIZATION_HREF)} className={`${AXIS_UI.primaryButton} mt-6`}>
              <MaterialSymbol name="business" size={18} color="currentColor" />
              Добавить компанию
            </button>
          </>
        ) : (
          <p className="text-[14px] text-[#586174]">Загрузка структуры…</p>
        )}
      </div>
    </main>
  )
}
