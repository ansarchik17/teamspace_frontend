import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Download, Plus, TriangleAlert } from 'lucide-react'
import type { WhatsAppStatus, WhatsAppTemplate } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import { growyErrorMessage } from '../../../infrastructure/repositories/HttpGrowyPlatformRepository'
import WhatsAppCallingSettings from './WhatsAppCallingSettings'
import WhatsAppChannelProfile from './WhatsAppChannelProfile'
import WhatsAppTemplateAttachment from './WhatsAppTemplateAttachment'
import type { TemplateAttachment } from './WhatsAppTemplateAttachment'
import WhatsAppRecipientPicker from './WhatsAppRecipientPicker'
import type { RecipientSelection } from './WhatsAppRecipientPicker'
import WhatsAppBroadcastDetails from './WhatsAppBroadcastDetails'
import WhatsAppTemplatesPanel from './WhatsAppTemplatesPanel'
import WhatsAppBroadcastsTable, { type BroadcastAction } from './WhatsAppBroadcastsTable'
import AppButton from '../../../shared/ui/AppButton'
import AppModal from '../../../shared/ui/AppModal'
import { AXIS_UI } from '../../../shared/ui/axisTokens'
import { EmptyState, ErrorNotice, Field } from './growyUi'
import { inputClass, useGrowyContext } from './growyShared'
import { templateParts, type WhatsAppBroadcast } from './whatsAppManageFormat'
import CrmSelect from './CrmSelect'

type Panel = 'templates' | 'broadcasts' | 'settings'
const PANELS: Panel[] = ['templates', 'broadcasts', 'settings']

export default function WhatsAppManagementPage() {
  const { t } = useTranslation('shell')
  const { repository, context, error: contextError, loading: contextLoading, retry } = useGrowyContext()
  const [params, setParams] = useSearchParams()
  const panel: Panel = PANELS.includes(params.get('panel') as Panel) ? params.get('panel') as Panel : 'templates'
  const [integration, setIntegration] = useState<WhatsAppStatus | null>(null)
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([])
  const [broadcasts, setBroadcasts] = useState<WhatsAppBroadcast[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const mutationLocked = useRef(false)
  const [revision, setRevision] = useState(0)
  const [modal, setModal] = useState<'template' | 'broadcast' | null>(null)
  const [name, setName] = useState('')
  const [templateText, setTemplateText] = useState('')
  const [language, setLanguage] = useState('ru')
  const [category, setCategory] = useState('UTILITY')
  const [examples, setExamples] = useState('')
  const [otpType, setOtpType] = useState('COPY_CODE')
  const [buttonText, setButtonText] = useState('')
  const [packageName, setPackageName] = useState('')
  const [signature, setSignature] = useState('')
  const [autofill, setAutofill] = useState('')
  const [expiration, setExpiration] = useState('5')
  const [ttl, setTtl] = useState('300')
  const [security, setSecurity] = useState(true)
  const [templateId, setTemplateId] = useState('')
  const [variables, setVariables] = useState<Record<number, string>>({})
  const [headerVariables, setHeaderVariables] = useState('')
  const [buttonVariables, setButtonVariables] = useState('')
  const [phones, setPhones] = useState('')
  const [contacts, setContacts] = useState<RecipientSelection[]>([])
  const [leads, setLeads] = useState<RecipientSelection[]>([])
  const [attachment, setAttachment] = useState<TemplateAttachment | null>(null)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadPending, setUploadPending] = useState(false)
  const [schedule, setSchedule] = useState('')
  const [optIn, setOptIn] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [confirm, setConfirm] = useState<{ id: number; name: string; action: BroadcastAction } | null>(null)
  const selected = templates.find((template) => String(template.id) === templateId)
  const enabled = Boolean(context?.modules.whatsapp)
  const ready = Boolean(integration?.connected && integration.provider === 'edna')

  useEffect(() => {
    if (!context?.modules.whatsapp) return
    const controller = new AbortController()
    setLoading(true); setError('')
    void (async () => {
      try {
        const status = await repository.whatsappStatus(controller.signal)
        if (controller.signal.aborted) return
        setIntegration(status)
        if (status.connected && status.provider === 'edna') {
          const results = await Promise.allSettled([repository.templates(controller.signal), repository.request<WhatsAppBroadcast[]>('whatsapp/broadcasts/', { signal: controller.signal })])
          if (!controller.signal.aborted) {
            const errors: string[] = []
            if (results[0].status === 'fulfilled') setTemplates(results[0].value)
            else errors.push(`${t('crm.waManage.tabTemplates')}: ${growyErrorMessage(results[0].reason)}`)
            if (results[1].status === 'fulfilled') setBroadcasts(results[1].value)
            else errors.push(`${t('crm.waManage.tabBroadcasts')}: ${growyErrorMessage(results[1].reason)}`)
            setError(errors.join(' · '))
          }
        }
      } catch (error) { if (!controller.signal.aborted) setError(growyErrorMessage(error)) }
      finally { if (!controller.signal.aborted) setLoading(false) }
    })()
    return () => controller.abort()
  }, [repository, context, revision, t])

  const mutate = async (path: string, payload: Record<string, unknown>) => {
    if (mutationLocked.current || uploadBusy || uploadPending) return
    mutationLocked.current = true
    setBusy(true); setError(''); setNotice('')
    try { await repository.request(`whatsapp/${path}`, { method: 'POST', body: JSON.stringify(payload) }); setModal(null); setConfirm(null); setRevision((value) => value + 1); setNotice(t('crm.waManage.done')) }
    catch (error) { setError(growyErrorMessage(error)) }
    finally { mutationLocked.current = false; setBusy(false) }
  }
  const exportBroadcasts = async () => {
    if (mutationLocked.current) return
    mutationLocked.current = true; setBusy(true); setError('')
    try { await repository.download('whatsapp/broadcasts/export/', 'whatsapp-broadcasts.csv') }
    catch (error) { setError(growyErrorMessage(error)) }
    finally { mutationLocked.current = false; setBusy(false) }
  }
  const open = (kind: 'template' | 'broadcast') => {
    setModal(kind); setName(''); setTemplateText(''); setTemplateId(''); setPhones(''); setContacts([]); setLeads([]); setAttachment(null); setUploadPending(false)
    setSchedule(''); setOptIn(false); setVariables({}); setHeaderVariables(''); setButtonVariables(''); setExamples(''); setLanguage('ru'); setCategory('UTILITY'); setOtpType('COPY_CODE')
    setButtonText(t('crm.waManage.copyCode')); setPackageName(''); setSignature(''); setAutofill(''); setExpiration('5'); setTtl('300'); setSecurity(true); setError(''); setNotice('')
  }
  const applyTemplate = (template: WhatsAppTemplate, values: Record<number, string>) => {
    open('broadcast'); setTemplateId(String(template.id)); setVariables(values)
  }
  const switchPanel = (next: Panel) => { const value = new URLSearchParams(params); value.set('panel', next); setParams(value) }
  const lines = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean)
  const submit = () => {
    if (modal === 'template') {
      void mutate('templates/', {
        name, language, category,
        content: {
          text: templateText, textExampleParams: lines(examples),
          ...(category === 'AUTHENTICATION' ? {
            keyboard: { rows: [{ buttons: [{ text: buttonText, buttonType: 'OTP', otpType, ...(otpType === 'ONE_TAP' ? { packageName, hash: signature, ...(autofill ? { autofillText: autofill } : {}) } : {}) }] }] },
            securityRecommendation: security, ...(expiration ? { codeExpirationMinutes: Number(expiration) } : {}),
          } : {}),
        },
        ...(category === 'AUTHENTICATION' && ttl ? { message_ttl: Number(ttl) } : {}),
      })
    } else if (selected && optIn) {
      void mutate('broadcasts/', {
        name, template_id: selected.id, template_name: selected.name,
        text_variables: (selected.variable_indexes || []).map((index) => variables[index]?.trim() || ''),
        header_variables: lines(headerVariables), button_variables: lines(buttonVariables), attachment,
        contact_ids: contacts.map((item) => item.id), lead_ids: leads.map((item) => item.id),
        phones: [...new Set(phones.split(/[\n,;]/).map((phone) => phone.replace(/\D/g, '')).filter(Boolean))],
        confirm_opt_in: true, ...(schedule ? { scheduled_at: new Date(schedule).toISOString() } : {}),
      })
    }
  }
  const counts: Record<Panel, number | null> = { templates: ready ? templates.length : null, broadcasts: ready ? broadcasts.length : null, settings: null }
  const panelLabel: Record<Panel, string> = { templates: t('crm.waManage.tabTemplates'), broadcasts: t('crm.waManage.tabBroadcasts'), settings: t('crm.waManage.tabSettings') }
  const checkbox = 'mt-0.5 h-4 w-4 shrink-0 accent-[#2458D3]'

  return <section className={`flex min-h-0 min-w-0 w-full flex-1 flex-col bg-[#F6F7F9] px-4 pb-4 pt-6 text-[#17202E] md:px-6 xl:px-8 ${AXIS_UI.fontFamily}`}>
    <div className="flex shrink-0 flex-wrap items-end justify-between gap-3 pb-4">
      <div className="min-w-0">
        <Link to="/crm/messenger/whatsapp" className={`inline-flex items-center gap-1 rounded text-[13px] text-[#586174] hover:text-[#17202E] ${AXIS_UI.focus}`}><ChevronLeft size={14} />WhatsApp</Link>
        <h1 className="mt-0.5 text-[28px] font-semibold leading-9 tracking-[-0.02em] text-[#17202E]">{t('crm.waManage.title')}</h1>
      </div>
      {ready && <div className="flex flex-wrap items-center gap-2">
        {panel === 'templates' && <button type="button" className={AXIS_UI.primaryButton} disabled={loading} onClick={() => open('template')}><Plus size={16} />{t('crm.waManage.createTemplate')}</button>}
        {panel === 'broadcasts' && <>
          <button type="button" className={AXIS_UI.secondaryButton} disabled={busy || loading} onClick={() => void exportBroadcasts()}><Download size={16} />{t('crm.waManage.exportCsv')}</button>
          <button type="button" className={AXIS_UI.primaryButton} disabled={busy || loading} onClick={() => open('broadcast')}><Plus size={16} />{t('crm.waManage.createBroadcast')}</button>
        </>}
      </div>}
    </div>

    {contextLoading && <p role="status" className="py-10 text-center text-sm text-[#586174]">{t('crm.whatsapp.connecting')}</p>}
    {contextError && <ErrorNotice message={contextError} retry={retry} />}
    {context && !enabled && <EmptyState title={t('crm.whatsapp.disabledTitle')} description={t('crm.whatsapp.disabledText')} />}

    {enabled && <>
      <nav aria-label={t('crm.waManage.sections')} className="mb-4 flex shrink-0 gap-5 overflow-x-auto border-b border-[#E2E5EA] [scrollbar-width:none]">
        {PANELS.map((key) => <button key={key} type="button" aria-current={panel === key ? 'page' : undefined} onClick={() => switchPanel(key)}
          className={`${AXIS_UI.tab} !h-9 ${panel === key ? AXIS_UI.tabActive : AXIS_UI.tabIdle}`}>
          {panelLabel[key]}{counts[key] !== null && <span className={`ml-1.5 text-[12px] tabular-nums ${panel === key ? 'text-[#2458D3]' : 'text-[#586174]'}`}>{counts[key]}</span>}
        </button>)}
      </nav>

      {error && !modal && !confirm && <div className="mb-4 shrink-0"><ErrorNotice message={error} retry={() => setRevision((value) => value + 1)} /></div>}
      {notice && <p role="status" className="mb-4 shrink-0 rounded-xl border border-[#CFDCF8] bg-[#EDF2FF] px-4 py-3 text-[14px] text-[#173B91]">{notice}</p>}
      {integration && !ready && <div className="mb-4 flex shrink-0 items-start gap-3 rounded-xl border border-[#F5DFB3] bg-[#FFF6E5] px-4 py-3 text-[14px] text-[#6B4600]">
        <TriangleAlert size={18} className="mt-0.5 shrink-0 text-[#946000]" />{t('crm.waManage.ednaRequired')}
      </div>}

      {(ready || (loading && !integration)) && panel === 'templates' && <WhatsAppTemplatesPanel templates={templates} loading={loading && !templates.length} onUse={applyTemplate} />}
      {(ready || (loading && !integration)) && panel === 'broadcasts' && <WhatsAppBroadcastsTable broadcasts={broadcasts} loading={loading && !broadcasts.length} busy={busy}
        onDetails={setDetailId} onAction={(broadcast, action) => { setError(''); setConfirm({ id: broadcast.id, name: broadcast.name, action }) }} />}
      {ready && panel === 'settings' && <div className="grid max-w-[880px] gap-4"><WhatsAppChannelProfile repository={repository} /><WhatsAppCallingSettings repository={repository} /></div>}
    </>}

    {modal && <AppModal maxWidth={modal === 'broadcast' ? 640 : 560} title={modal === 'template' ? t('crm.waManage.newTemplate') : t('crm.waManage.newBroadcast')} onClose={() => { if (!busy && !uploadBusy) setModal(null) }}>
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); submit() }}>
        <fieldset disabled={busy || uploadBusy} className="space-y-4">
          <Field label={modal === 'template' ? t('crm.waManage.templateName') : t('crm.waManage.broadcastName')}>
            <input required maxLength={modal === 'template' ? 60 : 150} pattern={modal === 'template' ? '[A-Za-z0-9_]+' : undefined} className={inputClass} value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          {modal === 'template' ? <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('crm.waManage.language')}><input required className={inputClass} value={language} onChange={(event) => setLanguage(event.target.value)} /></Field>
              <Field label={t('crm.waManage.colCategory')}>
                <CrmSelect value={category} onChange={setCategory} options={[
                  { value: 'UTILITY', label: t('crm.waManage.categoryUtility') },
                  { value: 'MARKETING', label: t('crm.waManage.categoryMarketing') },
                  { value: 'AUTHENTICATION', label: t('crm.waManage.categoryAuth') },
                ]} />
              </Field>
            </div>
            <Field label={t('crm.waManage.text')}><textarea required className={inputClass} rows={5} placeholder={t('crm.waManage.textPlaceholder', { 1: '{{1}}' })} value={templateText} onChange={(event) => setTemplateText(event.target.value)} /></Field>
            <Field label={t('crm.waManage.examples')}><textarea className={inputClass} rows={3} required={category === 'AUTHENTICATION'} placeholder={category === 'AUTHENTICATION' ? '123456' : t('crm.waManage.examplesPlaceholder')} value={examples} onChange={(event) => setExamples(event.target.value)} /></Field>
            {category === 'AUTHENTICATION' && <div className="space-y-4 rounded-xl border border-[#E6EAF1] bg-[#FAFBFC] p-4">
              <p className="text-[13px] text-[#586174]">{t('crm.waManage.authHint', { 1: '{{1}}' })}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('crm.waManage.codeButton')}>
                  <CrmSelect value={otpType} onChange={setOtpType} options={[
                    { value: 'COPY_CODE', label: t('crm.waManage.copyCode') },
                    { value: 'ONE_TAP', label: t('crm.waManage.oneTap') },
                  ]} />
                </Field>
                <Field label={t('crm.waManage.buttonText')}><input required maxLength={25} className={inputClass} value={buttonText} onChange={(event) => setButtonText(event.target.value)} /></Field>
              </div>
              {otpType === 'ONE_TAP' && <>
                <Field label={t('crm.waManage.packageName')}><input required className={inputClass} value={packageName} onChange={(event) => setPackageName(event.target.value)} /></Field>
                <Field label={t('crm.waManage.signature')}><input required className={inputClass} value={signature} onChange={(event) => setSignature(event.target.value)} /></Field>
                <Field label={t('crm.waManage.autofill')}><input maxLength={25} className={inputClass} value={autofill} onChange={(event) => setAutofill(event.target.value)} /></Field>
              </>}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('crm.waManage.expiration')}><input type="number" min="1" max="90" step="1" className={inputClass} value={expiration} onChange={(event) => setExpiration(event.target.value)} /></Field>
                <Field label={t('crm.waManage.ttl')}><input type="number" min="30" max="900" step="1" className={inputClass} value={ttl} onChange={(event) => setTtl(event.target.value)} /></Field>
              </div>
              <label className="flex items-start gap-2 text-[14px] text-[#17202E]"><input type="checkbox" className={checkbox} checked={security} onChange={(event) => setSecurity(event.target.checked)} />{t('crm.waManage.security')}</label>
            </div>}
            <p className="text-[13px] text-[#586174]">{t('crm.waManage.approvalHint')}</p>
          </> : <>
            <Field label={t('crm.waManage.approvedTemplate')}>
              <CrmSelect required value={templateId} placeholder={t('crm.waManage.chooseTemplate')}
                onChange={(next) => { setTemplateId(next); setVariables({}); setHeaderVariables(''); setButtonVariables(''); setAttachment(null); setUploadPending(false) }}
                options={templates.filter((template) => template.status.toUpperCase() === 'APPROVED').map((template) => ({ value: String(template.id), label: template.name, description: template.content?.text }))} />
            </Field>
            {selected?.content?.text && <div className="rounded-xl bg-[#EFEAE2] p-3">
              <p className="max-w-[420px] whitespace-pre-wrap break-words rounded-[4px_12px_12px_12px] bg-white px-3 py-2.5 text-[14px] leading-5 shadow-[0_1px_1px_rgba(16,24,40,0.08)]">
                {templateParts(selected.content.text).map((part, index) => part.variable === null ? <span key={index}>{part.text}</span>
                  : <span key={index} className="rounded bg-[#EDF2FF] px-1 text-[#2458D3]">{variables[part.variable]?.trim() || part.text}</span>)}
              </p>
            </div>}
            {selected?.variable_indexes?.length ? <div className="grid gap-4 sm:grid-cols-2">
              {selected.variable_indexes.map((index) => <Field key={index} label={t('crm.waManage.variableValue', { index })}>
                <input required className={inputClass} value={variables[index] || ''} onChange={(event) => setVariables((current) => ({ ...current, [index]: event.target.value }))} />
              </Field>)}
            </div> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('crm.waManage.headerVariables')}><textarea className={inputClass} rows={2} value={headerVariables} onChange={(event) => setHeaderVariables(event.target.value)} /></Field>
              <Field label={t('crm.waManage.buttonVariables')}><textarea className={inputClass} rows={2} value={buttonVariables} onChange={(event) => setButtonVariables(event.target.value)} /></Field>
            </div>
            <WhatsAppTemplateAttachment key={templateId} repository={repository} value={attachment} disabled={busy} onChange={setAttachment} onBusy={setUploadBusy} onPending={setUploadPending} />
            <WhatsAppRecipientPicker repository={repository} resource="contacts" value={contacts} onChange={setContacts} disabled={busy || uploadBusy} />
            <WhatsAppRecipientPicker repository={repository} resource="leads" value={leads} onChange={setLeads} disabled={busy || uploadBusy} />
            <Field label={t('crm.waManage.phones')}><textarea required={!contacts.length && !leads.length} rows={4} className={inputClass} value={phones} onChange={(event) => setPhones(event.target.value)} /></Field>
            <Field label={t('crm.waManage.schedule')}><input type="datetime-local" className={inputClass} value={schedule} onChange={(event) => setSchedule(event.target.value)} /></Field>
            <label className="flex items-start gap-2 text-[14px] text-[#17202E]"><input type="checkbox" required className={checkbox} checked={optIn} onChange={(event) => setOptIn(event.target.checked)} />{t('crm.waManage.optIn')}</label>
          </>}
        </fieldset>
        {error && <ErrorNotice message={error} />}
        <div className="flex justify-end gap-2 border-t border-[#E6EAF1] pt-4">
          <AppButton type="button" variant="secondary" disabled={busy || uploadBusy} onClick={() => setModal(null)}>{t('crm.waManage.cancel')}</AppButton>
          <AppButton type="submit" disabled={busy || uploadBusy || uploadPending} isLoading={busy}>{t('crm.waManage.create')}</AppButton>
        </div>
      </form>
    </AppModal>}
    {detailId && <WhatsAppBroadcastDetails repository={repository} id={detailId} onClose={() => setDetailId(null)} />}
    {confirm && <AppModal title={t(`crm.waManage.confirm.${confirm.action}`)} onClose={() => { if (!busy) setConfirm(null) }}>
      <p className="mb-4 text-[14px] text-[#465066]">{t('crm.waManage.confirmText', { name: confirm.name })}</p>
      {error && <div className="mb-4"><ErrorNotice message={error} /></div>}
      <div className="flex justify-end gap-2">
        <AppButton variant="secondary" disabled={busy} onClick={() => setConfirm(null)}>{t('crm.waManage.cancel')}</AppButton>
        <AppButton variant={confirm.action === 'cancel' ? 'danger' : 'primary'} isLoading={busy} onClick={() => void mutate(`broadcasts/${confirm.id}/${confirm.action}/`, {})}>{t(`crm.waManage.action.${confirm.action}`)}</AppButton>
      </div>
    </AppModal>}
  </section>
}
