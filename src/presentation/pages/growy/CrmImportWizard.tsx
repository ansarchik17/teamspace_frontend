import { useEffect, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRight, Check, Download, FileSpreadsheet, Upload, X } from 'lucide-react'
import type { HttpGrowyPlatformRepository } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { growyErrorMessage } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import AppButton from '../../../shared/ui/AppButton'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import { ErrorNotice } from './growyUi'
import { DUPLICATE_RULES, fileSize, type ImportPreview, type ImportSheet, type ImportType } from './crmDataFormat'
import CrmImportIssues from './CrmImportIssues'
import CrmSelect from './CrmSelect'

const chipClass = (active: boolean) => `inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-[13px] font-medium transition-colors ${AXIS_UI.focus} ${active ? 'border-[#2458D3] bg-[#EDF2FF] text-[#2458D3]' : 'border-[#E2E5EA] bg-white text-[#586174] hover:border-[#C4C9D2] hover:text-[#17202E]'}`

export default function CrmImportWizard({ repository, enabled, busy, action, onStarted }: {
  repository: HttpGrowyPlatformRepository
  enabled: boolean
  busy: boolean
  action: (work: () => Promise<void>) => Promise<void>
  onStarted: (runId: number) => void
}) {
  const { t } = useTranslation('shell')
  const [types, setTypes] = useState<ImportType[]>([])
  const [catalogError, setCatalogError] = useState('')
  const [catalogRevision, setCatalogRevision] = useState(0)
  const [entity, setEntity] = useState('lead')
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [sheets, setSheets] = useState<ImportSheet[]>([])
  const [sheetIndex, setSheetIndex] = useState(0)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [duplicateRule, setDuplicateRule] = useState('fill_empty')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [legalConfirmed, setLegalConfirmed] = useState(false)
  const sheet = sheets[sheetIndex]
  const type = types.find((item) => item.entity === entity)
  const step = preview ? 3 : sheet ? 2 : 1

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    repository.request<{ types: ImportType[] }>('crm/data-import/types/', { signal: controller.signal }).then((data) => {
      if (controller.signal.aborted) return
      const items = data.types.filter((item) => item.entity && item.import_mode === 'single_file')
      setTypes(items); setCatalogError('')
      setEntity((current) => items.some((item) => item.entity === current) ? current : items[0]?.entity || current)
    }).catch((error) => { if (!controller.signal.aborted) setCatalogError(growyErrorMessage(error)) })
    return () => controller.abort()
  }, [enabled, repository, catalogRevision])

  const resetFrom = (level: 'file' | 'sheets' | 'preview') => {
    if (level !== 'preview') { setSheets([]); setMapping({}) }
    setPreview(null); setLegalConfirmed(false)
  }
  const pickFile = (next: File | null) => { setFile(next); resetFrom('file') }
  const selectSheet = (index: number, items = sheets) => {
    setSheetIndex(index); setMapping(items[index]?.auto_mapping || {}); resetFrom('preview')
  }
  const inspect = () => action(async () => {
    if (!file) return
    if (!type) throw new Error(t('crm.data.errorType'))
    if (file.size > type.max_file_size) throw new Error(t('crm.data.errorSize'))
    const form = new FormData(); form.append('files', file); form.append('entity', entity)
    const result = await repository.request<{ files: { sheets: ImportSheet[] }[] }>('crm/data-import/inspect/', { method: 'POST', body: form })
    const items = result.files[0]?.sheets || []
    if (!items.length) throw new Error(t('crm.data.errorNoSheet'))
    setSheets(items); selectSheet(0, items)
  })
  const check = () => action(async () => {
    if (!file || !sheet) return
    const form = new FormData(); form.append('files', file); form.append('entity', entity)
    form.append('sheet_name', sheet.sheet_name); form.append('header_row', String(sheet.header_row))
    form.append('mapping', JSON.stringify(mapping)); form.append('mapping_confirmed', 'true'); form.append('duplicate_rule', duplicateRule)
    setPreview(null); setLegalConfirmed(false)
    setPreview(await repository.request<ImportPreview>('crm/data-import/preview/', { method: 'POST', body: form }))
  })
  const start = () => action(async () => {
    if (!preview || !legalConfirmed) return
    const result = await repository.request<{ run_id: number }>('crm/data-import/jobs/', { method: 'POST', body: JSON.stringify({ preview_token: preview.preview_token, source: entity, legal_confirmed: true }) })
    setFile(null); resetFrom('file'); onStarted(result.run_id)
  })
  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault(); setDragging(false)
    const dropped = event.dataTransfer.files?.[0]
    if (dropped) pickFile(dropped)
  }
  const steps = [t('crm.data.stepFile'), t('crm.data.stepMapping'), t('crm.data.stepCheck')]
  const unresolved = Boolean(preview?.unresolved_references?.length)

  return <section className="rounded-2xl border border-[#E6EAF1] bg-white">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E6EAF1] px-5 py-4 sm:px-6">
      <div>
        <h2 className="text-[16px] font-semibold text-[#17202E]">{t('crm.data.importTitle')}</h2>
        <p className="mt-0.5 text-[13px] text-[#586174]">{t('crm.data.importText')}</p>
      </div>
      <ol className="flex items-center gap-2 text-[13px]" aria-label={t('crm.data.steps')}>
        {steps.map((label, index) => {
          const number = index + 1
          const done = number < step
          const active = number === step
          return <li key={label} className="flex items-center gap-2" aria-current={active ? 'step' : undefined}>
            {index > 0 && <span className="h-px w-4 bg-[#D5DAE2] sm:w-6" aria-hidden />}
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold ${done ? 'bg-[#EDF2FF] text-[#2458D3]' : active ? 'bg-[#2458D3] text-white' : 'bg-[#F1F2F4] text-[#8A93A3]'}`}>
              {done ? <Check size={14} strokeWidth={2.5} /> : number}
            </span>
            <span className={`hidden sm:inline ${active ? 'font-medium text-[#17202E]' : 'text-[#586174]'}`}>{label}</span>
          </li>
        })}
      </ol>
    </header>

    <fieldset disabled={busy} className="space-y-5 px-5 py-5 sm:px-6">
      {catalogError && <ErrorNotice message={catalogError} retry={() => setCatalogRevision((value) => value + 1)} />}

      {step === 1 && <>
        <div>
          <span className="mb-2 block text-[13px] font-medium text-[#586174]">{t('crm.data.whatImport')}</span>
          <div className="flex flex-wrap gap-1.5">
            {types.length ? types.map((item) => <button key={item.entity} type="button" aria-pressed={entity === item.entity} className={chipClass(entity === item.entity)}
              onClick={() => { setEntity(item.entity || ''); resetFrom('file') }}>{item.name}</button>)
              : <span className="h-8 w-48 animate-pulse rounded-full bg-[#EEF0F3]" aria-hidden />}
          </div>
        </div>
        <label onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-6 py-8 text-center transition-colors focus-within:border-[#2458D3] ${dragging ? 'border-[#2458D3] bg-[#F5F8FF]' : 'border-[#C9CFD8] bg-[#FAFBFC] hover:border-[#9AA3B2]'}`}>
          <input type="file" className="sr-only" accept=".xlsx,.xls,.csv" onChange={(event) => { pickFile(event.target.files?.[0] || null); event.target.value = '' }} />
          {file ? <>
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#EDF8F1] text-[#16734B]"><FileSpreadsheet size={22} /></span>
            <span className="max-w-full truncate text-[14px] font-semibold text-[#17202E]">{file.name}</span>
            <span className="text-[13px] text-[#586174]">{fileSize(file.size)} · {t('crm.data.replaceFile')}</span>
          </> : <>
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#EDF2FF] text-[#2458D3]"><Upload size={20} /></span>
            <span className="text-[14px] font-semibold text-[#17202E]">{t('crm.data.dropTitle')}</span>
            <span className="text-[13px] text-[#586174]">{type ? t('crm.data.dropHint', { size: fileSize(type.max_file_size) }) : t('crm.data.dropHintShort')}</span>
          </>}
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {type?.template_available && <button type="button" className={AXIS_UI.secondaryButton}
              onClick={() => void action(() => repository.download(`crm/data-import/templates/${entity}/`, `crm-${entity}-template.xlsx`))}><Download size={16} />{t('crm.data.template')}</button>}
            {file && <button type="button" className={AXIS_UI.secondaryButton} onClick={() => pickFile(null)}><X size={16} />{t('crm.data.removeFile')}</button>}
          </div>
          <AppButton disabled={!file || !type} isLoading={busy} onClick={() => void inspect()}>{t('crm.data.toMapping')}<ArrowRight size={16} /></AppButton>
        </div>
      </>}

      {step === 2 && sheet && <>
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-[#F6F7F9] px-4 py-3 text-[13px] text-[#465066]">
          <FileSpreadsheet size={18} className="shrink-0 text-[#16734B]" />
          <span className="min-w-0 flex-1 truncate"><span className="font-medium text-[#17202E]">{file?.name}</span> · {type?.name}</span>
          {sheets.length > 1 ? <CrmSelect className="w-[240px]" ariaLabel={t('crm.data.sheet')} value={String(sheetIndex)} onChange={(value) => selectSheet(Number(value))}
            options={sheets.map((item, index) => ({ value: String(index), label: t('crm.data.sheetOption', { name: item.sheet_name, count: item.rows_count }) }))} /> : <span>{t('crm.data.sheetOption', { name: sheet.sheet_name, count: sheet.rows_count })}</span>}
        </div>
        <div className="overflow-hidden rounded-xl border border-[#E6EAF1]">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4 border-b border-[#E6EAF1] bg-[#FAFBFC] px-4 py-2.5 text-[13px] font-medium text-[#586174]">
            <span>{t('crm.data.crmField')}</span><span>{t('crm.data.fileColumn')}</span>
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {sheet.fields.filter((field) => field.importable).map((field) => {
              const value = mapping[field.field_key] || ''
              const mapped = Boolean(value && value !== '__skip__')
              return <div key={field.field_key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-4 border-b border-[#EEF0F3] px-4 py-2 last:border-b-0">
                <span className="flex min-w-0 items-center gap-2 text-[14px] text-[#17202E]">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${mapped ? 'bg-[#16734B]' : field.require_mapping ? 'bg-[#C03437]' : 'bg-[#C4C9D2]'}`} aria-hidden />
                  <span className="truncate">{field.label}</span>
                  {field.require_mapping && <span className="text-[#C03437]" title={t('crm.data.required')}>*</span>}
                </span>
                <CrmSelect ariaLabel={field.label} value={value} placeholder={t('crm.data.notChosen')} onChange={(next) => { setMapping((current) => ({ ...current, [field.field_key]: next || '__skip__' })); resetFrom('preview') }}
                  options={[{ value: '__skip__', label: t('crm.data.skipField') }, ...sheet.columns.map((column) => ({ value: column, label: column }))]} />
              </div>
            })}
          </div>
        </div>
        <div>
          <span className="mb-2 block text-[13px] font-medium text-[#586174]">{t('crm.data.duplicates')}</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {DUPLICATE_RULES.map((rule) => <label key={rule} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors ${duplicateRule === rule ? 'border-[#2458D3] bg-[#F5F8FF]' : 'border-[#E2E5EA] hover:border-[#C4C9D2]'}`}>
              <input type="radio" name="duplicate-rule" className="mt-0.5 h-4 w-4 shrink-0 accent-[#2458D3]" checked={duplicateRule === rule} onChange={() => { setDuplicateRule(rule); resetFrom('preview') }} />
              <span><span className="block text-[14px] font-medium text-[#17202E]">{t(`crm.data.rule.${rule}`)}</span><span className="block text-[12px] leading-4 text-[#586174]">{t(`crm.data.ruleHint.${rule}`)}</span></span>
            </label>)}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" className={AXIS_UI.secondaryButton} onClick={() => resetFrom('file')}><ArrowLeft size={16} />{t('crm.data.back')}</button>
          <AppButton isLoading={busy} onClick={() => void check()}>{t('crm.data.check')}<ArrowRight size={16} /></AppButton>
        </div>
      </>}

      {step === 3 && preview && <>
        {Object.entries(preview.summary).map(([key, values]) => <div key={key} className="grid grid-cols-2 overflow-hidden rounded-xl border border-[#E6EAF1] sm:grid-cols-4">
          {([['total', '#17202E'], ['created', '#16734B'], ['updated', '#2458D3'], ['errors', '#C03437']] as const).map(([metric, color], index) => <div key={metric}
            className={`px-4 py-3 ${index > 0 ? 'sm:border-l' : ''} ${index % 2 ? 'border-l' : ''} ${index > 1 ? 'border-t sm:border-t-0' : ''} border-[#E6EAF1]`}>
            <div className="text-[13px] text-[#586174]">{t(`crm.data.metric.${metric}`)}</div>
            <div className="mt-1 text-[22px] font-semibold leading-7 tabular-nums" style={{ color: metric === 'errors' && !values.errors ? '#17202E' : color }}>{values[metric] || 0}</div>
          </div>)}
        </div>)}
        {preview.issues.length > 0 && <CrmImportIssues issues={preview.issues} />}
        {unresolved && <p className="rounded-xl border border-[#F5DFB3] bg-[#FFF6E5] px-4 py-3 text-[14px] text-[#6B4600]">{t('crm.data.unresolved')}</p>}
        <label className="flex items-start gap-2 text-[14px] text-[#17202E]">
          <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#2458D3]" checked={legalConfirmed} onChange={(event) => setLegalConfirmed(event.target.checked)} />{t('crm.data.legal')}
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" className={AXIS_UI.secondaryButton} onClick={() => resetFrom('preview')}><ArrowLeft size={16} />{t('crm.data.backMapping')}</button>
          <AppButton disabled={!legalConfirmed || unresolved} isLoading={busy} onClick={() => void start()}>{t('crm.data.start')}</AppButton>
        </div>
      </>}
    </fieldset>
  </section>
}
