import { adminText } from '../../../shared/i18n/adminText'
import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Building2, Check, ChevronRight, X, KeyRound, Plus, Search } from 'lucide-react';
import { HttpAdministrationRepository, type AdministrationOverview, type AdministrationEmployee, type OffsetPage, type StorageEmployee, type SecurityPage } from '../../../infrastructure/repositories/HttpAdministrationRepository';
import { HttpOrganizationRepository, type OrganizationIdentityProvider, type OrganizationMember } from '../../../infrastructure/repositories/HttpOrganizationRepository';
import { HttpAccessRepository } from '../../../infrastructure/repositories/HttpAccessRepository';
import { HttpAuthRepository } from '../../../infrastructure/repositories/HttpAuthRepository';
import { HttpError } from '../../../infrastructure/http/HttpError';
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore';
import PeopleSectionHeader from '../../components/people/PeopleSectionHeader';
import AppButton from '../../../shared/ui/AppButton';
import AppConfirmDialog from '../../../shared/ui/AppConfirmDialog';
import { ADMIN_PAGE_SIZE, ADMIN_ROW_ACTION, AdminFormDialog, AdminPager, AdminPagination, AdminPanel, AdminRowAction, AdminStatus, type AdminForm } from './administrationUi';
import { administrationError, AUDIT_ACTION_OPTIONS, auditLabel, inputGiB, isStorageBudgetError, MODULE_NAMES, parseGiB, storageSize } from './administrationHelpers';
import './companyAdministration.css';
import AdminAuditDetails from './AdminAuditDetails';
import AdministrationModuleIcon from './AdministrationModuleIcon';
import MeetingRoomsAdminSection from './MeetingRoomsAdminSection';
import CompanyAIBudgetSection from './CompanyAIBudgetSection';
import OrganizationInvitationsPanel from './OrganizationInvitationsPanel';
import AdminStorageSection from './AdminStorageSection';
import AdminOverviewSection from './AdminOverviewSection';
import { AdminSectionSkeleton, CompanyAdministrationSkeleton } from '../../components/people/PeopleSkeletons';
import AppSelect from '../../../shared/ui/AppSelect';
import BoardDatePicker from '../../components/board/BoardDatePicker';
import { AXIS_UI } from '../../../shared/ui/axisTokens';
import { formatDate, i18n } from '../../../shared/i18n';
type Section = 'overview' | 'users' | 'modules' | 'storage' | 'ai' | 'rooms' | 'integrations' | 'audit';
interface PageData {
    key: string;
    section: Section;
    overview: AdministrationOverview;
    actorId: number;
    platform: boolean;
    users?: OffsetPage<AdministrationEmployee>;
    quotas?: OffsetPage<StorageEmployee>;
    providers?: OrganizationIdentityProvider[];
    security?: SecurityPage;
}
interface AuditFilter {
    action: string;
    ip: string;
    outcome: string;
    from: string;
    to: string;
}
const EMPTY_FILTER: AuditFilter = { action: '', ip: '', outcome: '', from: '', to: '' };
const AUDIT_CONTROL = '!h-9 !rounded-[var(--ts-radius-control)] !border-[var(--ts-border)] !bg-white !text-[14px]';
const AUDIT_PAGE_SIZE = ADMIN_PAGE_SIZE;
const AUDIT_TIME: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };
export default function CompanyAdministrationPage() {
    const { t } = useTranslation(["administration", "calendar", "ai"]);
    const SECTIONS: Array<[
        Section,
        string
    ]> = [['overview', adminText("text060")], ['users', adminText("text002")], ['modules', adminText("text061")], ['storage', adminText("text062")], ['ai', t('ai:admin.tab')], ['rooms', t('calendar:rooms.tab')], ['integrations', adminText("text063")], ['audit', adminText("text064")]];
    const { organizationId, section: sectionParam } = useParams<{
        organizationId?: string;
        section?: string;
    }>();
    const navigate = useNavigate();
    const section: Section = ['users', 'modules', 'storage', 'ai', 'rooms', 'integrations', 'audit'].includes(sectionParam ?? '') ? sectionParam as Section : 'overview';
    const base = organizationId ? `/platform/organizations/${encodeURIComponent(organizationId)}/administration` : '/organization/administration';
    const store = useMemo(() => new LocalStorageAuthSessionStore(), []);
    const repo = useMemo(() => new HttpAdministrationRepository(store), [store]);
    const orgRepo = useMemo(() => new HttpOrganizationRepository(store), [store]);
    const accessRepo = useMemo(() => new HttpAccessRepository(store), [store]);
    const auth = useMemo(() => new HttpAuthRepository(store), [store]);
    const [data, setData] = useState<PageData | null>(null);
    const [offset, setOffset] = useState(0);
    const [search, setSearch] = useState('');
    const [query, setQuery] = useState('');
    const [filterDraft, setFilterDraft] = useState<AuditFilter>(EMPTY_FILTER);
    const [members, setMembers] = useState<Map<number, OrganizationMember>>(() => new Map());
    useEffect(() => {
        let alive = true;
        new HttpOrganizationRepository(new LocalStorageAuthSessionStore()).listMembers()
            .then(list => { if (alive) setMembers(new Map(list.map(member => [member.id, member]))); })
            .catch(() => undefined);
        return () => { alive = false; };
    }, []);
    useEffect(() => {
        const timer = window.setTimeout(() => {
            if (filterDraft.from && filterDraft.to && new Date(filterDraft.from) >= new Date(filterDraft.to)) {
                setError(adminText("text180"));
                return;
            }
            const next = { ...filterDraft, action: filterDraft.action.trim(), ip: filterDraft.ip.trim() };
            setFilters(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
            setCursor(current => Object.keys(current).length ? {} : current);
            setCursorStack(current => current.length ? [] : current);
        }, 350);
        return () => window.clearTimeout(timer);
    }, [filterDraft]);
    const actorName = (id: number | null | undefined) => id == null ? adminText("text198") : members.get(id)?.full_name?.trim() || adminText("template9", { p0: id });
    const [filters, setFilters] = useState<AuditFilter>(EMPTY_FILTER);
    const [cursor, setCursor] = useState<{
        before_id?: number;
        snapshot_id?: number;
    }>({});
    const [cursorStack, setCursorStack] = useState<Array<{
        before_id?: number;
        snapshot_id?: number;
    }>>([]);
    const [version, setVersion] = useState(0);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [form, setForm] = useState<AdminForm | null>(null);
    const [moduleConfirm, setModuleConfirm] = useState<{ message: string; run: () => void } | null>(null);
    const requestKey = JSON.stringify([organizationId, section, offset, query, filters, cursor]);
    const scope = useRef(requestKey);
    scope.current = requestKey;
    const formScope = useRef('');
    const openForm = (value: AdminForm) => { formScope.current = requestKey; setError(''); setForm(value); };
    const lastRequest = useRef('');
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    useEffect(() => {
        const abort = new AbortController();
        const load = async () => {
            setLoading(true);
            if (lastRequest.current !== requestKey)
                setError('');
            lastRequest.current = requestKey;
            try {
                const user = await auth.me();
                if (abort.signal.aborted)
                    return;
                if (organizationId && user.role !== 'admin')
                    throw new HttpError(adminText("text065"), 403);
                if (!organizationId && user.role === 'admin') {
                    navigate('/platform/administration', { replace: true });
                    return;
                }
                const overview = await repo.overview(organizationId, abort.signal);
                const result: PageData = { key: requestKey, section, overview, actorId: user.id, platform: user.role === 'admin' };
                if (section === 'users')
                    result.users = await repo.users(organizationId, query, offset, abort.signal);
                if (section === 'storage')
                    result.quotas = await repo.storageUsers(organizationId, offset, abort.signal);
                if (section === 'audit' && overview.capabilities.read_audit)
                    result.security = await repo.security(organizationId, { ...filters, from: filters.from ? new Date(filters.from).toISOString() : '', to: filters.to ? new Date(filters.to).toISOString() : '', ...cursor }, abort.signal, false, AUDIT_PAGE_SIZE);
                if (section === 'integrations') {
                    if (!organizationId || user.role !== 'admin')
                        throw new HttpError(adminText("text066"), 403);
                    result.providers = await orgRepo.listPlatformIdentityProviders(organizationId);
                }
                if (!abort.signal.aborted)
                    setData(result);
            }
            catch (cause) {
                if (!abort.signal.aborted) {
                    setData(null);
                    setError(administrationError(cause));
                }
            }
            finally {
                if (!abort.signal.aborted)
                    setLoading(false);
            }
        };
        void load();
        return () => abort.abort();
    }, [auth, cursor, filters, navigate, offset, orgRepo, organizationId, query, repo, requestKey, section, version]);
    const current = data?.key === requestKey ? data : null;
    const shown = current ?? (data?.section === section ? data : null);
    const overview = (shown ?? data)?.overview;
    const caps = overview?.capabilities;
    const storage = overview?.storage;
    const go = (target: Section) => { if (busyRef.current)
        return; setOffset(0); setQuery(''); setSearch(''); setCursor({}); setCursorStack([]); setNotice(''); setError(''); navigate(`${base}/${target}`); };
    const reload = () => { setError(''); setCursor({}); setCursorStack([]); setVersion(value => value + 1); };
    const mutate = async (operation: () => Promise<void>): Promise<boolean> => {
        if (busyRef.current)
            return false;
        const startedScope = scope.current;
        busyRef.current = true;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await operation();
            if (mounted.current && scope.current === startedScope) {
                setNotice(adminText("text067"));
                setVersion(value => value + 1);
            }
            return true;
        }
        catch (cause) {
            if (mounted.current && scope.current === startedScope) {
                setError(administrationError(cause));
                if (cause instanceof HttpError && [403, 404, 409].includes(cause.status) && !isStorageBudgetError(cause)) {
                    setForm(null);
                    setVersion(value => value + 1);
                }
            }
            return false;
        }
        finally {
            busyRef.current = false;
            if (mounted.current)
                setBusy(false);
        }
    };
    const budget = async () => {
        if (!organizationId || !storage || !caps?.set_company_quota)
            return;
        const driveAllocated = storage.allocated_bytes;
        openForm({ title: adminText("text068"), description: adminText("template3", { p0: storageSize(driveAllocated) }), fields: [
                    { key: 'total', label: adminText("text069"), value: inputGiB(storage.quota_bytes ?? storage.allocated_bytes), hint: adminText("template3", { p0: storageSize(driveAllocated) }) },
                ], save: async (values) => {
                    const total = parseGiB(values.total);
                    if (total < driveAllocated)
                        throw new HttpError(adminText("text072"), 400);
                    await repo.budget(organizationId, total, storage.revision);
                } });
    };
    const setQuota = (employee: StorageEmployee) => openForm({ title: adminText("text073"), description: employee.full_name, fields: [{ key: 'quota', label: adminText("text074"), value: inputGiB(employee.quota_bytes), hint: adminText("template4", { p0: storageSize(employee.used_bytes) }) }], confirmation: values => { try {
            return parseGiB(values.quota) < employee.used_bytes ? adminText("text075") : undefined;
        }
        catch {
            return undefined;
        } }, save: async (values) => { const quota = parseGiB(values.quota); if (storage?.unallocated_bytes != null && quota > employee.quota_bytes + storage.unallocated_bytes)
            throw new HttpError(adminText("text076"), 400); await repo.quota(organizationId, employee, quota); } });
    const assignPosition = async (employee: AdministrationEmployee) => {
        if (busyRef.current)
            return;
        const before = scope.current;
        setError('');
        try {
            const access = await accessRepo.get(organizationId);
            if (scope.current !== before)
                return;
            const selected = access.member_positions[String(employee.id)];
            if (!access.positions.length) {
                navigate(organizationId ? `/platform/organizations/${organizationId}/access` : '/organization/access');
                return;
            }
            openForm({ title: adminText("text077"), description: adminText("template5", { p0: employee.full_name }), fields: [{ key: 'position', label: adminText("text078"), value: selected ?? access.positions[0].id, options: access.positions.map(item => ({ value: item.id, label: item.name })) }], save: async (values) => { await accessRepo.change(organizationId, 'member', { id: values.position, user_id: employee.id }); } });
        }
        catch (cause) {
            if (scope.current === before)
                setError(administrationError(cause));
        }
    };
    const providerForm = (type: 'oidc' | 'saml', provider?: OrganizationIdentityProvider) => {
        if (!organizationId || !current?.platform || !caps?.manage_identity_providers)
            return;
        const settings = provider?.settings ?? {};
        const keys = type === 'oidc' ? [['authorizationUrl', adminText("text079"), 'url'], ['tokenUrl', adminText("text080"), 'url'], ['clientId', 'Client ID', 'text']] : [['singleSignOnServiceUrl', adminText("text081"), 'url'], ['entityId', 'Entity ID', 'text']];
        openForm({ title: `${provider ? adminText("text082") : adminText("text083")} ${type === 'oidc' ? 'OpenID Connect' : 'SAML'}`, description: adminText("text084"), fields: [
                { key: 'name', label: adminText("text085"), value: provider?.display_name ?? '', maxLength: 255 },
                ...keys.map(([key, label, inputType]) => ({ key, label, value: settings[key] ?? '', type: inputType as 'url' | 'text' })),
                ...(type === 'oidc' ? [{ key: 'secret', label: 'Client secret', value: '', type: 'password' as const, optional: !!provider, hint: provider?.secret_set ? adminText("text086") : adminText("text087") }] : [{ key: 'signingCertificate', label: adminText("text088"), value: settings.signingCertificate ?? '', optional: true }]),
            ], save: async (values) => {
                const next = { ...settings };
                for (const [key] of keys)
                    next[key] = values[key].trim();
                if (type === 'saml') {
                    if (values.signingCertificate.trim())
                        next.signingCertificate = values.signingCertificate.trim();
                    else
                        delete next.signingCertificate;
                }
                const client_secret = values.secret?.trim() || undefined;
                if (provider)
                    await orgRepo.updatePlatformIdentityProvider(organizationId, provider.id, { display_name: values.name.trim(), settings: next, ...(client_secret ? { client_secret } : {}) });
                else
                    await orgRepo.createPlatformIdentityProvider(organizationId, { provider_type: type, display_name: values.name.trim(), settings: next, ...(client_secret ? { client_secret } : {}), enabled: false });
            } });
    };
    return <main className="company-admin-shell"><div className="company-admin-main">
    <PeopleSectionHeader active="administration" structureHref={organizationId ? `/platform/organizations/${organizationId}/structure` : '/organization'} accessHref={organizationId ? `/platform/organizations/${organizationId}/access` : '/organization/access'} administrationHref={base} description={adminText("text089")}/>
    {organizationId && <nav aria-label={adminText("text091")} className="flex min-w-0 flex-wrap items-center gap-1.5 text-[14px]">
      <Link to="/platform/administration" className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#E2E5EA] bg-white px-3 font-medium text-[#3C4657] transition-colors hover:border-[#C4C9D2] hover:text-[#2458D3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ts-action)]"><Building2 size={15}/>{adminText("text091")}</Link>
      <ChevronRight size={16} className="shrink-0 text-[#8A93A5]" aria-hidden/>
      <span aria-current="page" className="inline-flex h-8 min-w-0 items-center rounded-full bg-[#EDF2FF] px-3 font-medium text-[#2458D3]"><span className="truncate">{overview?.organization.name ?? '…'}</span></span>
    </nav>}
    {error && !form && <div className="company-admin-form-error" role="alert">{error}</div>}
    {notice && <div className="company-admin-notice" role="status"><Check size={17}/>{notice}</div>}
    {!data && loading && <CompanyAdministrationSkeleton label={adminText("text092")}/>}
    {!loading && !overview && <AppButton variant="secondary" onClick={reload}>{adminText("text093")}</AppButton>}
    {overview && data && <><div className="company-admin-context"><div><h2>{overview.organization.name}</h2><AdminStatus warning={overview.organization.status !== 'active'}>{overview.organization.status === 'active' ? adminText("text094") : adminText("text095")}</AdminStatus>{!organizationId && <span className="company-admin-muted">{adminText("text096")}</span>}</div></div>
    {overview.organization.status !== 'active' && <div className="company-admin-warning">{adminText("text098")}</div>}
    <nav className="ts-tabs company-admin-subtabs" aria-label={adminText("text099")}>{SECTIONS.filter(([id]) => (id !== 'integrations' || (data.platform && !!organizationId)) && (id !== 'rooms' || !organizationId)).map(([id, label]) => <button className={`ts-tab${section === id ? ' ts-tab--active' : ''}`} key={id} disabled={busy} aria-current={section === id ? 'page' : undefined} onClick={() => go(id)}>{label}</button>)}</nav>
    {!shown ? <AdminSectionSkeleton label={adminText("text092")}/> : <>
    {section === 'overview' && <AdminOverviewSection overview={overview} repo={repo} organizationId={organizationId} platform={shown.platform} busy={busy} actorName={actorName} onOpen={go}/>}
    {section === 'users' && <AdminPanel title={adminText("text119")} action={<Link className="company-admin-link" to={organizationId ? `/platform/organizations/${organizationId}/access` : '/organization/access'}>{adminText("text120")}<ArrowRight size={16}/></Link>}><form className="company-admin-toolbar" onSubmit={event => { event.preventDefault(); setOffset(0); setQuery(search.trim()); }}><label className="company-admin-search"><Search size={18}/><input aria-label={adminText("text121")} placeholder={adminText("text122")} maxLength={255} value={search} disabled={busy} onChange={event => setSearch(event.target.value)}/></label><AppButton type="submit" variant="secondary" disabled={busy}>{adminText("text123")}</AppButton></form><div className="company-admin-table-scroll"><table><thead><tr><th>{adminText("text124")}</th><th>{adminText("text078")}</th><th>{adminText("text125")}</th><th>{adminText("text126")}</th></tr></thead><tbody>{shown.users?.items?.map(employee => <tr key={employee.id}><td><strong>{employee.full_name || employee.username}</strong><small>{employee.email}</small>{employee.is_director && <span className="company-admin-owner">{adminText("text127")}</span>}</td><td>{employee.position || adminText("text128")}</td><td><AdminStatus warning={!employee.is_active || employee.is_blocked}>{employee.is_blocked ? adminText("text129") : employee.is_active ? adminText("text130") : adminText("text131")}</AdminStatus></td><td><div className="company-admin-inline"><AdminRowAction disabled={busy || !caps?.manage_permissions} onClick={() => void assignPosition(employee)}>{adminText("text078")}</AdminRowAction><AdminRowAction danger disabled={busy || !caps?.delete_users || employee.is_director || employee.role === 'admin' || employee.id === shown.actorId} onClick={() => { const targetOrg = organizationId; const targetId = employee.id; openForm({ title: adminText('deleteEmployeeTitle'), description: adminText('deleteEmployeeDescription', { name: employee.full_name || employee.username }), fields: [], danger: true, submit: adminText('deleteAction'), save: async () => { await repo.deleteEmployee(targetOrg, targetId); if (mounted.current && scope.current === formScope.current && shown.users?.items.length === 1 && offset > 0) setOffset(Math.max(0, offset - ADMIN_PAGE_SIZE)); } }); }}>{adminText('deleteAction')}</AdminRowAction></div></td></tr>)}</tbody></table></div>{!shown.users?.items?.length && <p className="company-admin-empty">{adminText("text139")}</p>}<AdminPagination offset={offset} total={shown.users?.total ?? 0} busy={busy || loading} change={setOffset}/></AdminPanel>}
    {section === 'users' && caps?.manage_permissions && <OrganizationInvitationsPanel key={organizationId ?? overview.organization.id} organizationId={organizationId} disabled={overview.organization.status !== 'active'} onAccepted={reload}/>}
    {section === 'modules' && <AdminPanel title={adminText("text140")}><p className="company-admin-description">{caps?.set_module_availability ? adminText("text141") : adminText("text142")}</p><div className="company-admin-module-grid">{overview.modules.map(module => <div className={`company-admin-module${!module.available ? ' is-unavailable' : ''}`} key={module.application}><div className="company-admin-module-heading"><AdministrationModuleIcon application={module.application}/><AdminStatus warning={!module.effective}>{!module.available ? adminText("text143") : module.effective ? adminText("text144") : adminText("text145")}</AdminStatus></div><h3>{MODULE_NAMES()[module.application]?.[0] ?? module.application}</h3><p>{MODULE_NAMES()[module.application]?.[1] ?? adminText("text146")}</p>{caps?.set_module_availability && <label className="company-admin-checkbox"><input type="checkbox" disabled={busy} checked={module.available} onChange={event => { const available = event.target.checked; const run = () => void mutate(() => repo.module(organizationId, module, { available })); if (!available)
            setModuleConfirm({ message: adminText("text147"), run });
        else
            run(); }}/>{adminText("text148")}</label>}<label className="company-admin-toggle"><span>{adminText("text149")}</span><input role="switch" type="checkbox" checked={module.enabled && module.available} disabled={busy || !caps?.manage_modules || !module.available} onChange={event => { const enabled = event.target.checked; const run = () => void mutate(() => repo.module(organizationId, module, { enabled })); if (!enabled)
            setModuleConfirm({ message: adminText("text150"), run });
        else
            run(); }}/></label>{['odo', 'sd', 'iform'].includes(module.application) && module.effective && <Link className="company-admin-link" to={organizationId ? `/platform/organizations/${organizationId}/access` : '/organization/access'}>{adminText("text151")}<ArrowRight size={15}/></Link>}</div>)}</div></AdminPanel>}
    {section === 'storage' && <AdminStorageSection storage={storage} quotas={shown.quotas} offset={offset} busy={busy} loading={loading} canSetBudget={!!caps?.set_company_quota} canSetQuotas={!!caps?.set_user_quotas} onOffset={setOffset} onBudget={() => void budget()} onQuota={setQuota}/>}
    {section === 'ai' && <CompanyAIBudgetSection key={organizationId ?? '__current__'} organizationId={organizationId} repo={repo} isPlatformAdmin={shown.platform} busy={busy}/> }
    {section === 'rooms' && !organizationId && <MeetingRoomsAdminSection/>}
    {section === 'integrations' && shown.platform && organizationId && <AdminPanel title={adminText("text107")} action={caps?.manage_identity_providers && <div className="company-admin-inline"><AppButton disabled={busy} onClick={() => providerForm('oidc')}><Plus size={17}/>OpenID Connect</AppButton><AppButton variant="secondary" disabled={busy} onClick={() => providerForm('saml')}><Plus size={17}/>SAML</AppButton></div>}><p className="company-admin-description">{adminText("text168")}</p>{shown.providers?.map(provider => <div className="company-admin-provider" key={provider.id}><div className="company-admin-icon"><KeyRound size={23}/></div><div><strong>{provider.display_name}</strong><small>{provider.provider_type === 'oidc' ? 'OpenID Connect' : 'SAML'} · {provider.status}</small><AdminStatus warning={!provider.enabled}>{provider.enabled ? adminText("text144") : adminText("text145")}</AdminStatus></div><div className="company-admin-inline"><AppButton variant="secondary" disabled={busy || !caps?.manage_identity_providers} onClick={() => providerForm(provider.provider_type, provider)}>{adminText("text169")}</AppButton><AppButton variant="ghost" disabled={busy || !caps?.manage_identity_providers} onClick={() => openForm({ title: provider.enabled ? adminText("text170") : adminText("text171"), description: adminText("template7", { p0: provider.display_name, p1: provider.enabled ? adminText("text172") : adminText("text173") }), fields: [], save: async () => { await orgRepo.updatePlatformIdentityProvider(organizationId, provider.id, { enabled: !provider.enabled }); } })}>{provider.enabled ? adminText("text174") : adminText("text175")}</AppButton><AppButton variant="ghost" disabled={busy || !caps?.manage_identity_providers} onClick={() => openForm({ title: adminText("text176"), description: adminText("template8", { p0: provider.display_name }), danger: true, submit: adminText("text177"), fields: [], save: () => orgRepo.deletePlatformIdentityProvider(organizationId, provider.id) })}>{adminText("text177")}</AppButton></div></div>)}{!shown.providers?.length && <p className="company-admin-empty">{adminText("text178")}</p>}</AdminPanel>}
    {section === 'audit' && <AdminPanel title={adminText("text179")}><form className="company-admin-audit-toolbar" onSubmit={event => event.preventDefault()}><AppSelect className="min-w-[180px] flex-1" buttonClassName={AUDIT_CONTROL} ariaLabel={adminText("text181")} value={filterDraft.action} searchable showButtonAvatar={false} showOptionAvatar={false} options={[{ value: '', label: i18n.t('administration:auditCatalog.allActions') }, ...AUDIT_ACTION_OPTIONS().map(action => ({ value: action, label: auditLabel(action) }))]} onChange={action => setFilterDraft(value => ({ ...value, action }))}/><label className={`${AXIS_UI.inputShell} w-[140px] shrink-0`}><input className={AXIS_UI.input} aria-label={adminText("text183")} placeholder={adminText("text183")} value={filterDraft.ip} onChange={event => setFilterDraft(value => ({ ...value, ip: event.target.value }))}/></label><AppSelect className="w-[170px] shrink-0" buttonClassName={AUDIT_CONTROL} ariaLabel={adminText("text184")} value={filterDraft.outcome} showButtonAvatar={false} showOptionAvatar={false} options={[{ value: '', label: adminText("text185") }, { value: 'success', label: adminText("text186") }, { value: 'failure', label: adminText("text187") }]} onChange={outcome => setFilterDraft(value => ({ ...value, outcome }))}/><div className="w-[150px] shrink-0"><BoardDatePicker buttonClassName={AUDIT_CONTROL} ariaLabel={adminText("text189")} placeholder={adminText("dateFrom")} value={filterDraft.from.slice(0, 10)} onChange={day => setFilterDraft(value => ({ ...value, from: day ? `${day}T00:00` : '' }))}/></div><div className="w-[150px] shrink-0"><BoardDatePicker buttonClassName={AUDIT_CONTROL} ariaLabel={adminText("text191")} placeholder={adminText("dateTo")} value={filterDraft.to.slice(0, 10)} onChange={day => setFilterDraft(value => ({ ...value, to: day ? `${day}T23:59:59` : '' }))}/></div>{Object.values(filterDraft).some(Boolean) && <AppButton variant="ghost" disabled={busy} onClick={() => { setFilterDraft(EMPTY_FILTER); setFilters(EMPTY_FILTER); setCursor({}); setCursorStack([]); }}><X size={16}/>{adminText("text193")}</AppButton>}</form><div className="company-admin-table-scroll"><table><thead><tr><th>{adminText("text194")}</th><th>{adminText("text195")}</th><th>{adminText("text165")}</th><th>IP</th><th>{adminText("text196")}</th><th>{adminText("text197")}</th></tr></thead><tbody>{shown.security?.items?.map(item => <tr key={item.id}><td className="whitespace-nowrap">{formatDate(item.created_at, AUDIT_TIME)}</td><td>{actorName(item.actor_id)}</td><td title={item.action}><strong>{auditLabel(item.action)}</strong></td><td>{item.ip ?? adminText("text198")}</td><td><AdminStatus warning={item.outcome !== 'success'}>{item.outcome === 'success' ? adminText("text186") : adminText("text187")}</AdminStatus></td><td>{item.administration_audit_id != null && <AdminAuditDetails repo={repo} org={organizationId} id={item.administration_audit_id} className={ADMIN_ROW_ACTION}/>}</td></tr>)}</tbody></table></div>{!shown.security?.items?.length && <p className="company-admin-empty">{adminText("text199")}</p>}<AdminPager label={adminText("auditPage", { page: cursorStack.length + 1, size: AUDIT_PAGE_SIZE })} page={cursorStack.length + 1} canPrev={!busy && !loading && cursorStack.length > 0} canNext={!busy && !loading && !!shown.security?.next_before_id} prevLabel={adminText("auditPrev")} nextLabel={adminText("text202")} onPrev={() => { setCursor(cursorStack[cursorStack.length - 1] ?? {}); setCursorStack(stack => stack.slice(0, -1)); }} onNext={() => { setCursorStack(stack => [...stack, cursor]); setCursor({ before_id: shown.security?.next_before_id, snapshot_id: shown.security?.snapshot_id }); }}/></AdminPanel>}
    </>}
    </>}
  </div><AppConfirmDialog open={Boolean(moduleConfirm)} title={adminText("confirmTitle")} message={moduleConfirm?.message ?? ''} confirmText={adminText("confirmDisable")} cancelText={adminText("text057")} onCancel={() => setModuleConfirm(null)} onConfirm={() => { const action = moduleConfirm?.run; setModuleConfirm(null); action?.(); }}/>{form && formScope.current === requestKey && current && !loading && <AdminFormDialog form={form} serverError={error} busy={busy} onSave={mutate} onClose={() => setForm(null)}/>}</main>;
}
