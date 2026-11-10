import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  HttpOrganizationRepository,
  type CreateOrganizationIdentityProviderInput,
  type CreateOrganizationUnitInput,
  type GrowyPositionRoleMapping,
  type OrganizationIdentityProvider,
  type OrganizationIdentityProviderType,
  type OrganizationMember,
  type OrganizationUnit,
  type PlatformOrganization,
  type UpdateOrganizationUnitInput,
} from '../../../infrastructure/repositories/HttpOrganizationRepository'
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore'
import MaterialSymbol from '../../../shared/ui/MaterialSymbol'
import AppModal from '../../../shared/ui/AppModal'
import OrganizationStructureWorkspace from '../organization/OrganizationStructureWorkspace'
import { PLATFORM_CREATE_ORGANIZATION_HREF, PLATFORM_ORGANIZATIONS_HREF, PLATFORM_STRUCTURE_HREF, rememberPlatformOrganizationId } from './platformStructureNavigation'

type IdentityProviderForm = {
  provider_type: OrganizationIdentityProviderType
  display_name: string
  enabled: boolean
  client_secret: string
  settings: Record<string, string>
}

const emptyIdentityProviderForm = (): IdentityProviderForm => ({
  provider_type: 'oidc',
  display_name: '',
  enabled: true,
  client_secret: '',
  settings: {
    issuer: '',
    authorizationUrl: '',
    tokenUrl: '',
    userInfoUrl: '',
    clientId: '',
    singleSignOnServiceUrl: '',
    entityId: '',
    signingCertificate: '',
  },
})

export default function PlatformOrganizationStructurePage() {
  const { organizationId = '' } = useParams<{ organizationId: string }>()
  const sessionStore = useMemo(() => new LocalStorageAuthSessionStore(), [])
  const repository = useMemo(() => new HttpOrganizationRepository(sessionStore), [sessionStore])
  const [organization, setOrganization] = useState<PlatformOrganization | null>(null)
  const [units, setUnits] = useState<OrganizationUnit[]>([])
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [growyPositionRoles, setGrowyPositionRoles] = useState<GrowyPositionRoleMapping[]>([])
  const [identityProviders, setIdentityProviders] = useState<OrganizationIdentityProvider[]>([])
  const [identityProviderForm, setIdentityProviderForm] = useState<IdentityProviderForm>(emptyIdentityProviderForm)
  const [editingIdentityProvider, setEditingIdentityProvider] = useState<OrganizationIdentityProvider | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [companyOptions, setCompanyOptions] = useState<Array<{ id: string; name: string }>>([])
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!organizationId) return
    setLoading(true)
    setError(null)
    try {
      const [nextOrganization, nextUnits, nextMembers, nextIdentityProviders, nextGrowyRoles] = await Promise.all([
        repository.getPlatformOrganization(organizationId),
        repository.listPlatformUnits(organizationId),
        repository.listPlatformMembers(organizationId),
        repository.listPlatformIdentityProviders(organizationId),
        repository.listPlatformGrowyPositionRoles(organizationId),
      ])
      setOrganization(nextOrganization)
      setUnits(nextUnits)
      setMembers(nextMembers)
      setIdentityProviders(nextIdentityProviders)
      setGrowyPositionRoles(nextGrowyRoles)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить структуру компании')
    } finally {
      setLoading(false)
    }
  }, [organizationId, repository])

  useEffect(() => {
    void reload()
  }, [reload])

  // Запоминаем компанию, чтобы вкладка «Структура» открывала её в следующий раз
  useEffect(() => {
    if (organizationId) rememberPlatformOrganizationId(organizationId)
  }, [organizationId])

  // Список компаний для селектора в тулбаре схемы
  useEffect(() => {
    let cancelled = false
    repository
      .listPlatformOrganizations({ limit: 100, offset: 0 })
      .then((result) => {
        if (!cancelled) setCompanyOptions((result.items ?? []).map((item) => ({ id: item.id, name: item.name })))
      })
      .catch(() => {
        if (!cancelled) setCompanyOptions([])
      })
    return () => {
      cancelled = true
    }
  }, [repository])

  const resetIdentityProviderForm = () => {
    setIdentityProviderForm(emptyIdentityProviderForm())
    setEditingIdentityProvider(null)
    setSettingsError(null)
  }

  const startIdentityProviderEdit = (provider: OrganizationIdentityProvider) => {
    setEditingIdentityProvider(provider)
    setIdentityProviderForm({
      provider_type: provider.provider_type,
      display_name: provider.display_name,
      enabled: provider.enabled,
      client_secret: '',
      settings: { ...emptyIdentityProviderForm().settings, ...(provider.settings ?? {}) },
    })
    setSettingsError(null)
  }

  const updateIdentityProviderSetting = (key: string, value: string) => {
    setIdentityProviderForm((current) => ({ ...current, settings: { ...current.settings, [key]: value } }))
  }

  const saveIdentityProvider = async () => {
    const form = identityProviderForm
    const settings = Object.fromEntries(
      Object.entries(form.settings)
        .map(([key, value]) => [key, value.trim()])
        .filter(([, value]) => value),
    )
    if (!form.display_name.trim()) return
    if (form.provider_type === 'oidc' && (!settings.authorizationUrl || !settings.tokenUrl || !settings.clientId)) {
      setSettingsError('Заполните Authorization URL, Token URL и Client ID.')
      return
    }
    if (form.provider_type === 'saml' && (!settings.singleSignOnServiceUrl || !settings.entityId)) {
      setSettingsError('Заполните Single Sign-On Service URL и Entity ID.')
      return
    }
    if (!editingIdentityProvider && form.provider_type === 'oidc' && !form.client_secret.trim()) {
      setSettingsError('Укажите Client Secret для нового OIDC-подключения.')
      return
    }

    setSettingsSaving(true)
    setSettingsError(null)
    try {
      if (editingIdentityProvider) {
        await repository.updatePlatformIdentityProvider(organizationId, editingIdentityProvider.id, {
          display_name: form.display_name.trim(),
          settings,
          enabled: form.enabled,
          ...(form.client_secret.trim() ? { client_secret: form.client_secret.trim() } : {}),
        })
      } else {
        const input: CreateOrganizationIdentityProviderInput = {
          provider_type: form.provider_type,
          display_name: form.display_name.trim(),
          settings,
          enabled: form.enabled,
          ...(form.client_secret.trim() ? { client_secret: form.client_secret.trim() } : {}),
        }
        await repository.createPlatformIdentityProvider(organizationId, input)
      }
      resetIdentityProviderForm()
      await reload()
    } catch (saveError) {
      setSettingsError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить корпоративный вход')
    } finally {
      setSettingsSaving(false)
    }
  }

  const deleteIdentityProvider = async (provider: OrganizationIdentityProvider) => {
    if (!window.confirm(`Удалить подключение «${provider.display_name}»? Пользователи этого подключения не смогут войти через него.`)) return
    setSettingsError(null)
    try {
      await repository.deletePlatformIdentityProvider(organizationId, provider.id)
      if (editingIdentityProvider?.id === provider.id) resetIdentityProviderForm()
      await reload()
    } catch (deleteError) {
      setSettingsError(deleteError instanceof Error ? deleteError.message : 'Не удалось удалить корпоративный вход')
    }
  }

  if (!organizationId) return <Navigate to={PLATFORM_STRUCTURE_HREF} replace />

  return (
    <>
      <OrganizationStructureWorkspace
        key={organizationId}
        organization={{
          id: organization?.id ?? organizationId,
          name: organization?.name ?? 'Компания',
          ownerId: organization?.owner_id,
          ownerName: organization?.owner_name,
        }}
        canManageStructure
        units={units}
        members={members}
        loading={loading}
        error={error}
        onReload={reload}
        onOpenOrganizationSettings={() => setSettingsOpen(true)}
        onCreateOrganization={() => navigate(PLATFORM_CREATE_ORGANIZATION_HREF)}
        onViewOrganizations={() => navigate(PLATFORM_ORGANIZATIONS_HREF)}
        structureHref={PLATFORM_STRUCTURE_HREF}
        companyOptions={companyOptions}
        onCompanyChange={(nextId) => {
          rememberPlatformOrganizationId(nextId)
          navigate(`/platform/organizations/${nextId}/structure`)
        }}
        onAddEmployee={() => navigate('/team-contact', { state: { openAddUser: true } })}
        onCreateUnit={async (input: CreateOrganizationUnitInput) => {
          await repository.createPlatformUnit(organizationId, input)
          await reload()
        }}
        onUpdateUnit={async (unit: OrganizationUnit, input: UpdateOrganizationUnitInput) => {
          await repository.updatePlatformUnit(organizationId, unit.id, input)
          await reload()
        }}
        onReorderUnits={async (operations) => {
          try {
            await Promise.all(operations.map(({ unit, input }) => repository.updatePlatformUnit(organizationId, unit.id, input)))
          } finally {
            await reload()
          }
        }}
        onArchiveUnit={async (unit: OrganizationUnit) => {
          await repository.archivePlatformUnit(organizationId, unit.id)
          await reload()
        }}
        onAssignMember={async (member: OrganizationMember, unitId: string) => {
          await repository.assignPlatformUser(organizationId, member.id, {
            unit_id: unitId || null,
            manager_id: member.manager_id ?? null,
          })
          await reload()
        }}
        growyPositionRoles={growyPositionRoles}
        onSaveGrowyPositionRoles={async (mappings) => {
          const updated = await repository.savePlatformGrowyPositionRoles(organizationId, mappings)
          setGrowyPositionRoles(updated)
          return updated
        }}
      />

      {settingsOpen ? (
        <AppModal title="Корпоративный вход" onClose={() => setSettingsOpen(false)} maxWidth={896} animated closeOnBackdrop>
            <p className="text-[13px] text-[#586174]">Настройки компании</p>
            <p className="mt-1 max-w-2xl text-[14px] leading-5 text-[#586174]">Подключите OIDC или SAML через Keycloak. Секрет приложения передаётся в Keycloak и не хранится в Workspace.</p>

            {settingsError ? <div className="mt-4 rounded-[8px] bg-[#FFF0F0] px-3 py-2 text-[13px] text-[#C03437]">{settingsError}</div> : null}

            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <label className="ts-field">Тип подключения<select disabled={Boolean(editingIdentityProvider)} value={identityProviderForm.provider_type} onChange={(event) => setIdentityProviderForm({ ...identityProviderForm, provider_type: event.target.value as OrganizationIdentityProviderType })} className="ts-input"><option value="oidc">OIDC / OpenID Connect</option><option value="saml">SAML 2.0</option></select></label>
              <label className="ts-field">Название подключения<input value={identityProviderForm.display_name} onChange={(event) => setIdentityProviderForm({ ...identityProviderForm, display_name: event.target.value })} className="ts-input" placeholder="Вход сотрудников" /></label>
              <label className="mt-[26px] flex h-10 items-center gap-3 rounded-[var(--ts-radius-control)] border border-[var(--ts-border)] px-3 text-[14px] text-[#17202E]"><input type="checkbox" checked={identityProviderForm.enabled} onChange={(event) => setIdentityProviderForm({ ...identityProviderForm, enabled: event.target.checked })} className="h-4 w-4 accent-[#3154F4]" />Подключение включено</label>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {identityProviderForm.provider_type === 'oidc' ? (
                <>
                  <ProviderInput label="Issuer (необязательно)" value={identityProviderForm.settings.issuer} onChange={(value) => updateIdentityProviderSetting('issuer', value)} placeholder="https://idp.example.com" />
                  <ProviderInput label="Authorization URL" value={identityProviderForm.settings.authorizationUrl} onChange={(value) => updateIdentityProviderSetting('authorizationUrl', value)} placeholder="https://idp.example.com/authorize" />
                  <ProviderInput label="Token URL" value={identityProviderForm.settings.tokenUrl} onChange={(value) => updateIdentityProviderSetting('tokenUrl', value)} placeholder="https://idp.example.com/token" />
                  <ProviderInput label="UserInfo URL (необязательно)" value={identityProviderForm.settings.userInfoUrl} onChange={(value) => updateIdentityProviderSetting('userInfoUrl', value)} placeholder="https://idp.example.com/userinfo" />
                  <ProviderInput label="Client ID" value={identityProviderForm.settings.clientId} onChange={(value) => updateIdentityProviderSetting('clientId', value)} />
                  <ProviderInput label={editingIdentityProvider ? 'Client Secret (оставьте пустым, чтобы не менять)' : 'Client Secret'} value={identityProviderForm.client_secret} onChange={(value) => setIdentityProviderForm({ ...identityProviderForm, client_secret: value })} type="password" />
                </>
              ) : (
                <>
                  <ProviderInput label="Single Sign-On Service URL" value={identityProviderForm.settings.singleSignOnServiceUrl} onChange={(value) => updateIdentityProviderSetting('singleSignOnServiceUrl', value)} placeholder="https://idp.example.com/sso" />
                  <ProviderInput label="Entity ID" value={identityProviderForm.settings.entityId} onChange={(value) => updateIdentityProviderSetting('entityId', value)} />
                  <label className="ts-field md:col-span-2">Сертификат подписи (необязательно)<textarea value={identityProviderForm.settings.signingCertificate} onChange={(event) => updateIdentityProviderSetting('signingCertificate', event.target.value)} className="ts-input" placeholder="-----BEGIN CERTIFICATE-----" /></label>
                </>
              )}
            </div>

            {organization?.slug ? <div className="mt-4 rounded-[8px] bg-[#FAFBFC] px-3 py-2 text-[13px] text-[#586174]">Ссылка входа: <code className="font-medium text-[#17202E]">/login?organization={organization.slug}</code></div> : null}

            <div className="mt-5 flex justify-end gap-2">
              {editingIdentityProvider ? <button type="button" onClick={resetIdentityProviderForm} className="ts-button ts-button--secondary">Отмена</button> : null}
              <button type="button" onClick={() => void saveIdentityProvider()} disabled={settingsSaving || !identityProviderForm.display_name.trim()} className="ts-button ts-button--primary"><MaterialSymbol name={editingIdentityProvider ? 'save' : 'add'} size={16} />{settingsSaving ? 'Сохранение…' : editingIdentityProvider ? 'Сохранить' : 'Добавить подключение'}</button>
            </div>

            <div className="mt-6 overflow-hidden rounded-2xl border border-[#E6EAF1]">
              <div className="grid grid-cols-[minmax(0,1fr)_90px_100px_150px] gap-3 bg-[#FAFBFC] px-4 py-3 text-[13px] font-medium text-[#586174]"><span>Подключение</span><span>Тип</span><span>Статус</span><span className="text-right">Действия</span></div>
              {identityProviders.length === 0 ? <div className="px-4 py-8 text-center text-[14px] text-[#586174]">Подключения пока не настроены</div> : identityProviders.map((provider) => (
                <div key={provider.id} className="grid grid-cols-[minmax(0,1fr)_90px_100px_150px] items-center gap-3 border-t border-[#EEF0F3] px-4 py-3">
                  <div className="min-w-0"><div className="truncate text-[14px] font-medium text-[#17202E]">{provider.display_name}</div><div className="mt-0.5 truncate text-[12px] text-[#586174]">{provider.secret_set ? 'Секрет настроен' : 'Без секрета'} · {provider.alias}</div></div>
                  <span className="text-[13px] uppercase text-[#3C4043]">{provider.provider_type}</span>
                  <span className={`inline-flex h-6 w-fit items-center rounded-[6px] px-2 text-[12px] font-medium ${provider.status === 'active' ? 'bg-[#E6F4EA] text-[#137333]' : provider.status === 'error' ? 'bg-[#FFF0F0] text-[#C03437]' : 'bg-[#F1F3F4] text-[#5F6368]'}`}>{provider.status === 'active' ? 'Активно' : provider.status === 'disabled' ? 'Выключено' : provider.status === 'error' ? 'Ошибка' : provider.status}</span>
                  <div className="flex justify-end gap-2"><button type="button" onClick={() => startIdentityProviderEdit(provider)} className="h-7 rounded-[8px] px-2 text-[13px] font-medium text-[#1967D2] hover:bg-[#E8F0FE]">Изменить</button><button type="button" onClick={() => void deleteIdentityProvider(provider)} className="h-7 rounded-[8px] px-2 text-[13px] font-medium text-[#C03437] hover:bg-[#FFF0F0]">Удалить</button></div>
                </div>
              ))}
            </div>
        </AppModal>
      ) : null}
    </>
  )
}

function ProviderInput({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: 'text' | 'password' }) {
  return (
    <label className="ts-field">{label}<input type={type} autoComplete={type === 'password' ? 'new-password' : undefined} value={value} onChange={(event) => onChange(event.target.value)} className="ts-input" placeholder={placeholder} /></label>
  )
}
