import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { HttpOrganizationRepository, type Organization } from '../../../infrastructure/repositories/HttpOrganizationRepository'
import {
  HttpContactsSyncRepository,
  type ContactImportResult,
  type DirectoryConfig,
  type DirectorySettings,
  type DirectoryType,
} from '../../../infrastructure/repositories/HttpContactsSyncRepository'
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore'
import PeopleSectionHeader from '../../components/people/PeopleSectionHeader'
import { ChevronRight, Database, Download, Eye, EyeOff, FileUp, HelpCircle, Info, Server } from 'lucide-react'
import AppSelect from '../../../shared/ui/AppSelect'
import { useTranslation } from 'react-i18next'
import { ot } from './orgText'
import { formatDate } from '../../../shared/i18n'
import './companyAdministration.css'

const MAX_IMPORT_BYTES = 10 * 1024 * 1024
const FIELD = 'h-9 w-full rounded-[var(--ts-radius-control)] border border-[var(--ts-border)] bg-white px-3 text-[14px] text-[#17202E] outline-none focus:border-[#2458D3] focus:ring-2 focus:ring-[#EDF2FF] disabled:bg-[#F6F7F9] disabled:text-[#586174]'
const LABEL = 'block text-[12px] font-medium leading-4 text-[#3C4043]'
const CARD = '@container/card flex min-w-0 flex-col rounded-2xl border border-[#E6EAF1] bg-white p-5'
const ICON_TILE = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#EDF2FF] text-[#2458D3]'

const TEMPLATE_HEADER = 'external_id,username,email,first_name,last_name,position,department,manager_username,work_email,phone,is_active'
const TEMPLATE_ROW = 'employee-42,anna,anna@example.com,Анна,Иванова,Разработчик,Разработка,ansar,anna.work@example.com,+77011234567,true' // i18n-ignore

const ATTRIBUTE_FIELDS: Array<{ key: string; label: string; ldap: string; ad: string }> = [
  { key: 'external_id', get label() { return ot('sync.t01') }, ldap: 'entryUUID', ad: 'objectGUID' },
  { key: 'username', get label() { return ot('sync.t02') }, ldap: 'uid', ad: 'sAMAccountName' },
  { key: 'email', label: 'Email', ldap: 'mail', ad: 'mail' },
  { key: 'first_name', get label() { return ot('sync.t03') }, ldap: 'givenName', ad: 'givenName' },
  { key: 'last_name', get label() { return ot('sync.t04') }, ldap: 'sn', ad: 'sn' },
  { key: 'position', get label() { return ot('sync.t05') }, ldap: 'title', ad: 'title' },
  { key: 'department', get label() { return ot('sync.t06') }, ldap: 'department', ad: 'department' },
  { key: 'phone', get label() { return ot('sync.t07') }, ldap: 'telephoneNumber', ad: 'telephoneNumber' },
  { key: 'manager_dn', get label() { return ot('sync.t08') }, ldap: 'manager', ad: 'manager' },
  { key: 'account_control', get label() { return ot('sync.t09') }, ldap: '', ad: 'userAccountControl' },
]

const emptySettings = (): DirectorySettings => ({ type: 'ad', url: '', base_dn: '', bind_dn: '', filter: '', attributes: {}, ca_cert_pem: '', enabled: true })

const formatDateTime = (value?: string | null) => value ? formatDate(value, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

function ResultPanel({ result }: { result: ContactImportResult }) {
  const hasIssues = result.issues.length > 0
  const tone = hasIssues ? 'border-[#F5C2C2] bg-[#FFF7F7]' : result.applied ? 'border-[#BFE5D0] bg-[#F3FBF6]' : 'border-[#C9D6F6] bg-[#F5F8FF]'
  const title = hasIssues
    ? ot('sync.t10')
    : result.applied
      ? ot('sync.t11')
      : ot('sync.t12')
  return (
    <div className={`mt-4 rounded-[8px] border p-4 ${tone}`}>
      <div className="text-[14px] font-semibold text-[#17202E]">{title}</div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          [ot('sync.t13'), result.total],
          [hasIssues || !result.applied ? ot('sync.t14') : ot('sync.t15'), result.created],
          [hasIssues || !result.applied ? ot('sync.t16') : ot('sync.t17'), result.updated],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-[6px] bg-white px-3 py-2">
            <div className="text-[12px] text-[#586174]">{label}</div>
            <div className="mt-0.5 text-[18px] font-semibold tabular-nums text-[#17202E]">{value}</div>
          </div>
        ))}
      </div>
      {hasIssues ? (
        <div className="mt-3 max-h-64 overflow-auto rounded-[6px] bg-white">
          <table className="w-full text-left text-[13px]">
            <thead className="sticky top-0 bg-[#FAFBFC] text-[13px] text-[#586174]">
              <tr><th className="px-3 py-2 font-medium">{ot('sync.t18')}</th><th className="px-3 py-2 font-medium">{ot('sync.t19')}</th><th className="px-3 py-2 font-medium">{ot('sync.t20')}</th></tr>
            </thead>
            <tbody>
              {result.issues.map((issue, index) => (
                <tr key={`${issue.row}-${issue.field}-${index}`} className="border-t border-[#EEF0F3]">
                  <td className="px-3 py-2 tabular-nums text-[#17202E]">{issue.row || '—'}</td>
                  <td className="px-3 py-2 font-mono text-[12px] text-[#17202E]">{issue.field || '—'}</td>
                  <td className="px-3 py-2 text-[#C03437]">{issue.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className={LABEL}>{label}</span>
      <div className="mt-1">{children}</div>
      {hint ? <span className="mt-1 block text-[12px] leading-4 text-[#7B8494]">{hint}</span> : null}
    </label>
  )
}

export default function ContactsSyncPage() {
  useTranslation('administration')
  const sessionStore = useMemo(() => new LocalStorageAuthSessionStore(), [])
  const organizationRepository = useMemo(() => new HttpOrganizationRepository(sessionStore), [sessionStore])
  const repository = useMemo(() => new HttpContactsSyncRepository(sessionStore), [sessionStore])
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [pageError, setPageError] = useState('')

  const [file, setFile] = useState<File | null>(null)
  const [importBusy, setImportBusy] = useState<'check' | 'apply' | null>(null)
  const [importError, setImportError] = useState('')
  const [importResult, setImportResult] = useState<ContactImportResult | null>(null)
  const [checkedFile, setCheckedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const [config, setConfig] = useState<DirectoryConfig | null>(null)
  const [configLoading, setConfigLoading] = useState(true)
  const [settings, setSettings] = useState<DirectorySettings>(emptySettings)
  const [bindPassword, setBindPassword] = useState('')
  const [configBusy, setConfigBusy] = useState<'save' | 'preview' | 'sync' | null>(null)
  const [configError, setConfigError] = useState('')
  const [configNotice, setConfigNotice] = useState('')
  const [syncResult, setSyncResult] = useState<ContactImportResult | null>(null)

  const loadConfig = useCallback(async () => {
    setConfigLoading(true)
    setConfigError('')
    try {
      const next = await repository.getDirectoryConfig()
      setConfig(next)
      setSettings(next ? { type: next.type, url: next.url, base_dn: next.base_dn, bind_dn: next.bind_dn, filter: next.filter, attributes: next.attributes, ca_cert_pem: next.ca_cert_pem ?? '', enabled: next.enabled } : emptySettings())
      setBindPassword('')
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : ot('sync.t21'))
    } finally {
      setConfigLoading(false)
    }
  }, [repository])

  useEffect(() => {
    void organizationRepository.getCurrent().then(setOrganization).catch((error) => setPageError(error instanceof Error ? error.message : ot('sync.t22')))
    void loadConfig()
  }, [loadConfig, organizationRepository])

  const canManage = organization?.can_manage_structure === true
  const sourceLocked = Boolean(config?.last_sync_at)

  const pickFile = (next: File | null) => {
    setImportError('')
    setImportResult(null)
    setCheckedFile(null)
    if (!next) { setFile(null); return }
    if (!/\.(csv|xlsx)$/i.test(next.name)) {
      setFile(null)
      setImportError(ot('sync.t23'))
      return
    }
    if (next.size === 0 || next.size > MAX_IMPORT_BYTES) {
      setFile(null)
      setImportError(next.size === 0 ? ot('sync.t24') : ot('sync.t25'))
      return
    }
    setFile(next)
  }

  const runImport = async (dryRun: boolean) => {
    if (!file) return
    setImportBusy(dryRun ? 'check' : 'apply')
    setImportError('')
    try {
      const result = await repository.importFile(file, dryRun)
      setImportResult(result)
      setCheckedFile(dryRun && result.issues.length === 0 ? file : null)
    } catch (error) {
      setImportResult(null)
      setCheckedFile(null)
      setImportError(error instanceof Error ? error.message : ot('sync.t26'))
    } finally {
      setImportBusy(null)
    }
  }

  const downloadTemplate = () => {
    const blob = new Blob([`﻿${TEMPLATE_HEADER}\n${TEMPLATE_ROW}\n`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'employees-template.csv'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const saveConfig = async () => {
    setConfigError('')
    setConfigNotice('')
    if (!/^ldaps?:\/\//i.test(settings.url.trim())) {
      setConfigError(ot('sync.t27'))
      return
    }
    if (!settings.base_dn.trim() || !settings.bind_dn.trim()) {
      setConfigError(ot('sync.t28'))
      return
    }
    if (!config?.has_bind_password && !bindPassword) {
      setConfigError(ot('sync.t29'))
      return
    }
    setConfigBusy('save')
    try {
      const attributes = Object.fromEntries(Object.entries(settings.attributes).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value))
      await repository.saveDirectoryConfig({ ...settings, url: settings.url.trim(), base_dn: settings.base_dn.trim(), bind_dn: settings.bind_dn.trim(), filter: settings.filter.trim(), attributes }, bindPassword ? bindPassword : null)
      setConfigNotice(ot('sync.t30'))
      setSyncResult(null)
      await loadConfig()
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : ot('sync.t31'))
    } finally {
      setConfigBusy(null)
    }
  }

  const runSync = async (dryRun: boolean) => {
    setConfigBusy(dryRun ? 'preview' : 'sync')
    setConfigError('')
    setConfigNotice('')
    try {
      const result = await repository.syncDirectory(dryRun)
      setSyncResult(result)
      if (!dryRun) await loadConfig()
    } catch (error) {
      setSyncResult(null)
      setConfigError(error instanceof Error ? error.message : ot('sync.t32'))
    } finally {
      setConfigBusy(null)
    }
  }

  const setAttribute = (key: string, value: string) => setSettings((current) => ({ ...current, attributes: { ...current.attributes, [key]: value } }))

  return (
    <main className="min-h-full bg-[#F6F7F9] px-4 py-6 [font-family:Inter,sans-serif] md:px-6 xl:px-8">
      <PeopleSectionHeader
        active="import"
        title={ot('sync.t33')}
        structureHref="/organization"
        accessHref={canManage ? '/organization/access' : undefined}
        importHref={canManage ? '/organization/import' : undefined}
        description={ot('sync.t34')}
      />

      {pageError ? <div className="mt-6 rounded-[8px] bg-[#FFF0F0] px-4 py-3 text-[14px] text-[#C03437]">{pageError}</div> : null}
      {organization && !canManage ? (
        <div className="mt-6 rounded-[8px] border border-[#E2E5EA] bg-white px-4 py-3 text-[14px] text-[#586174]">{ot('sync.t35')}</div>
      ) : null}

      <div className="@container mt-5"><div className="grid items-start gap-4 @min-[960px]:grid-cols-2">
        <section className={CARD}>
          <div className="flex items-start gap-3">
            <span className={ICON_TILE}><FileUp size={20} strokeWidth={1.75} /></span>
            <div className="min-w-0">
              <h2 className="text-[16px] font-semibold leading-6 text-[#17202E]">{ot('sync.t36')}</h2>
              <p className="mt-0.5 text-[13px] leading-5 text-[#586174]">{ot('sync.fileFormats')}</p>
            </div>
          </div>

          <div
            onDragOver={(event) => { if (!canManage || importBusy) return; event.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); if (canManage && !importBusy) pickFile(event.dataTransfer.files?.[0] ?? null) }}
            className={`mt-4 flex flex-col items-center rounded-[12px] border border-dashed px-5 py-5 text-center transition-colors ${dragging ? 'border-[#2458D3] bg-[#F5F8FF]' : 'border-[#C9D3E3] bg-[#FAFBFC]'}`}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-white text-[#3C4043] shadow-[0_1px_2px_rgba(23,32,46,0.08)]"><FileUp size={20} strokeWidth={1.75} /></span>
            {file ? (
              <>
                <p className="mt-3 max-w-full truncate text-[14px] font-semibold text-[#17202E]">{file.name}</p>
                <p className="mt-1 text-[13px] text-[#586174]">{ot('sync.kb', { size: (file.size / 1024).toFixed(0) })}</p>
              </>
            ) : (
              <>
                <p className="mt-3 text-[14px] font-semibold text-[#17202E]">{ot('sync.dropTitle')}</p>
                <p className="mt-0.5 text-[13px] text-[#586174]">{ot('sync.dropSubtitle')}</p>
              </>
            )}
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={!canManage || importBusy !== null} className="ts-button ts-button--primary ts-button--compact mt-3 !h-8 !px-3 !text-[13px]">
              {file ? ot('sync.t41') : ot('sync.t42')}
            </button>
            <p className="mt-2 text-[12px] text-[#586174]">{ot('sync.dropLimits')}</p>
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(event) => { pickFile(event.target.files?.[0] ?? null); event.target.value = '' }} />
          </div>

          {importError ? <p className="mt-3 rounded-[8px] bg-[#FFF0F0] px-3 py-2 text-[13px] text-[#C03437]">{importError}</p> : null}
          {importResult ? <ResultPanel result={importResult} /> : null}

          <div className="mt-3 flex items-start gap-2.5 rounded-[10px] bg-[#F5F8FF] px-3 py-2.5 text-[13px] leading-5 text-[#3C4043]">
            <Info size={16} className="mt-0.5 shrink-0 text-[#2458D3]" />
            {ot('sync.atomicNote')}
          </div>

          <div className="mt-4 flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#EDF2FF] text-[#2458D3]"><Database size={16} strokeWidth={1.75} /></span>
            <div className="min-w-0">
              <h3 className="text-[14px] font-semibold leading-5 text-[#17202E]">{ot('sync.requirements')}</h3>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[13px] leading-5 text-[#586174] marker:text-[#9AA0A6]">
                <li>{ot('sync.t37')} <span className="text-[#3C4043]">username, email, first_name, last_name</span></li>
                <li>{ot('sync.t38')} <span className="text-[#3C4043]">external_id, position, department, manager_username, work_email, phone, is_active</span></li>
                <li>{ot('sync.t39')}</li>
                <li>{ot('sync.t40')}</li>
              </ul>
            </div>
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
            <button type="button" onClick={downloadTemplate} className="ts-button ts-button--secondary ts-button--compact">
              <Download size={16} />
              {ot('sync.templateDownload')}
            </button>
            <span className="ml-auto flex flex-wrap gap-2">
            <button type="button" onClick={() => void runImport(true)} disabled={!canManage || !file || importBusy !== null} className="ts-button ts-button--secondary ts-button--compact">
              {importBusy === 'check' ? ot('sync.t44') : ot('sync.checkFile')}
            </button>
            <button type="button" onClick={() => void runImport(false)} disabled={!canManage || !file || checkedFile !== file || importBusy !== null} className="ts-button ts-button--primary ts-button--compact" title={checkedFile !== file ? ot('sync.t46') : undefined}>
              {importBusy === 'apply' ? ot('sync.t47') : ot('sync.t48')}
            </button>
            </span>
          </div>
        </section>

        <section className={CARD}>
          <div className="flex items-start gap-3">
            <span className={ICON_TILE}><Server size={20} strokeWidth={1.75} /></span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[16px] font-semibold leading-6 text-[#17202E]">LDAP / Active Directory</h2>
              <p className="mt-0.5 text-[13px] leading-5 text-[#586174]">{ot('sync.t49')}</p>
              {config?.last_sync_at ? <p className="mt-1 text-[12px] text-[#7B8494]">{ot('sync.lastSync', { date: formatDateTime(config.last_sync_at) })} · {ot('sync.lastSyncStats', { count: config.last_sync_count, revision: config.revision })}</p> : null}
            </div>
          </div>

          {configLoading ? <p className="mt-4 text-[14px] text-[#586174]">{ot('sync.t50')}</p> : (
            <div className="mt-4 flex flex-1 flex-col gap-3">
              {sourceLocked ? <p className="rounded-[8px] bg-[#F5F8FF] px-3 py-2 text-[12px] leading-4 text-[#1E3A8A]">{ot('sync.t51')}</p> : null}
              <div className="grid gap-x-3 gap-y-3 @min-[400px]/card:grid-cols-2">
                <div className="min-w-0">
                  <span className={LABEL}>{ot('sync.t52')}</span>
                  <AppSelect
                    className="mt-1"
                    value={settings.type}
                    disabled={!canManage || sourceLocked}
                    ariaLabel={ot('sync.t52')}
                    showButtonAvatar={false}
                    showOptionAvatar={false}
                    buttonClassName="!h-9 !rounded-[var(--ts-radius-control)] !border-[var(--ts-border)] !bg-white !text-[14px]"
                    options={[{ value: 'ad', label: 'Active Directory' }, { value: 'ldap', label: 'LDAP' }]}
                    onChange={(value) => setSettings((current) => ({ ...current, type: value as DirectoryType }))}
                  />
                </div>
                <Field label={ot('sync.t53')} hint={ot('sync.t54')}>
                  <input value={settings.url} disabled={!canManage || sourceLocked} onChange={(event) => setSettings((current) => ({ ...current, url: event.target.value }))} placeholder="ldaps://ad.company.kz:636" className={FIELD} />
                </Field>
                <Field label="Base DN">
                  <input value={settings.base_dn} disabled={!canManage || sourceLocked} onChange={(event) => setSettings((current) => ({ ...current, base_dn: event.target.value }))} placeholder="DC=company,DC=kz" className={FIELD} />
                </Field>
                <Field label={ot('sync.t55')}>
                  <input value={settings.bind_dn} disabled={!canManage} onChange={(event) => setSettings((current) => ({ ...current, bind_dn: event.target.value }))} placeholder="svc-directory@company.kz" className={FIELD} />
                </Field>
                <Field label={ot('sync.t56')} hint={config?.has_bind_password ? ot('sync.t57') : ot('sync.t58')}>
                  <span className="relative block">
                    <input value={bindPassword} type={showPassword ? 'text' : 'password'} autoComplete="new-password" disabled={!canManage} onChange={(event) => setBindPassword(event.target.value)} placeholder={config?.has_bind_password ? '••••••••' : ''} className={`${FIELD} pr-10`} />
                    <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[#586174] hover:bg-[#F1F3F4]" aria-label={showPassword ? ot('sync.hidePassword') : ot('sync.showPassword')} title={showPassword ? ot('sync.hidePassword') : ot('sync.showPassword')}>
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </span>
                </Field>
                <Field label={ot('sync.t59')} hint={ot('sync.filterExample')}>
                  <span className="relative block">
                    <input value={settings.filter} disabled={!canManage} onChange={(event) => setSettings((current) => ({ ...current, filter: event.target.value }))} placeholder="(objectClass=user)" className={`${FIELD} pr-10`} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#586174]" title={ot('sync.filterHelp')}><HelpCircle size={18} /></span>
                  </span>
                </Field>
              </div>

              <details className="group rounded-[12px] border border-[#E6EAF1]">
                <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                  <ChevronRight size={16} className="shrink-0 text-[#3C4043] transition-transform group-open:rotate-90" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-[#17202E]">{ot('sync.t60')}</span>
                    <span className="mt-0.5 block text-[12px] text-[#586174]">{ot('sync.attributesSubtitle')}</span>
                  </span>
                </summary>
                <div className="border-t border-[#EEF0F3] px-3 py-3">
                  <p className="text-[12px] leading-4 text-[#7B8494]">{ot('sync.t61')}</p>
                  <div className="mt-3 grid gap-3 @min-[400px]/card:grid-cols-2">
                    {ATTRIBUTE_FIELDS.filter((field) => settings.type === 'ad' || field.ldap).map((field) => (
                      <Field key={field.key} label={field.label}>
                        <input
                          value={settings.attributes[field.key] ?? ''}
                          disabled={!canManage || (field.key === 'external_id' && sourceLocked)}
                          onChange={(event) => setAttribute(field.key, event.target.value)}
                          placeholder={settings.type === 'ad' ? field.ad : field.ldap}
                          className={FIELD}
                        />
                      </Field>
                    ))}
                  </div>
                </div>
              </details>
              <details className="group rounded-[12px] border border-[#E6EAF1]">
                <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                  <ChevronRight size={16} className="shrink-0 text-[#3C4043] transition-transform group-open:rotate-90" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-[#17202E]">{ot('sync.t62')}</span>
                    <span className="mt-0.5 block text-[12px] text-[#586174]">{ot('sync.caSubtitle')}</span>
                  </span>
                </summary>
                <div className="border-t border-[#EEF0F3] px-3 py-3">
                  <textarea value={settings.ca_cert_pem ?? ''} disabled={!canManage} onChange={(event) => setSettings((current) => ({ ...current, ca_cert_pem: event.target.value }))} rows={5} placeholder="-----BEGIN CERTIFICATE-----" className={`${FIELD} !h-auto py-2 font-mono text-[12px]`} />
                </div>
              </details>

              <div className="flex flex-wrap items-center gap-3">
                <label className="company-admin-toggle !w-auto">
                  <input role="switch" type="checkbox" checked={settings.enabled} disabled={!canManage} onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))} aria-label={ot('sync.t63')} />
                </label>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-[#17202E]">{ot('sync.t63')}</span>
                  <span className="mt-0.5 block text-[12px] text-[#586174]">{ot('sync.connectorSubtitle')}</span>
                </span>
                <span className={`inline-flex h-7 items-center gap-1.5 rounded-[6px] px-2.5 text-[12px] font-medium ${config && config.enabled ? 'bg-[#E6F4EA] text-[#137333]' : 'bg-[#F1F3F4] text-[#5F6368]'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${config && config.enabled ? 'bg-[#137333]' : 'bg-[#9AA0A6]'}`} />
                  {!config ? ot('sync.statusNotConfigured') : config.enabled ? ot('sync.statusConnected') : ot('sync.statusDisabled')}
                </span>
              </div>

              {configNotice ? <p className="rounded-[8px] bg-[#F3FBF6] px-3 py-2 text-[13px] text-[#16734B]">{configNotice}</p> : null}
              {configError ? <p className="rounded-[8px] bg-[#FFF0F0] px-3 py-2 text-[13px] text-[#C03437]">{configError}</p> : null}
              {syncResult ? <ResultPanel result={syncResult} /> : null}

              <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                <button type="button" onClick={() => void runSync(false)} disabled={!canManage || !config || !config.enabled || configBusy !== null} className="ts-button ts-button--secondary ts-button--compact">
                  {configBusy === 'sync' ? ot('sync.t67') : ot('sync.t68')}
                </button>
                <span className="ml-auto flex flex-wrap gap-2">
                <button type="button" onClick={() => void runSync(true)} disabled={!canManage || !config || configBusy !== null} className="ts-button ts-button--secondary ts-button--compact">
                  {configBusy === 'preview' ? ot('sync.t44') : ot('sync.t66')}
                </button>
                <button type="button" onClick={() => void saveConfig()} disabled={!canManage || configBusy !== null} className="ts-button ts-button--primary ts-button--compact">
                  {configBusy === 'save' ? ot('sync.t64') : ot('sync.t65')}
                </button>
                </span>
              </div>
            </div>
          )}
        </section>
      </div></div>
    </main>
  )
}
