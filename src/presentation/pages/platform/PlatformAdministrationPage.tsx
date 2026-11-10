import { adminText } from '../../../shared/i18n/adminText'
import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, History, PauseCircle, Pencil, Plus, Search, Users } from 'lucide-react';
import { AXIS_UI } from '../../../shared/ui/axisTokens';
import { HttpAdministrationRepository, type AdministrationOverview, type PlatformOverview } from '../../../infrastructure/repositories/HttpAdministrationRepository';
import { HttpOrganizationRepository, type PlatformOrganization, type PlatformOrganizationList } from '../../../infrastructure/repositories/HttpOrganizationRepository';
import { HttpAuthRepository } from '../../../infrastructure/repositories/HttpAuthRepository';
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore';
import { HttpError } from '../../../infrastructure/http/HttpError';
import PeopleSectionHeader from '../../components/people/PeopleSectionHeader';
import AppButton from '../../../shared/ui/AppButton';
import AppModal from '../../../shared/ui/AppModal';
import { ADMIN_PAGE_SIZE, ADMIN_ROW_ACTION, AdminFormDialog, AdminRowAction, type AdminForm } from '../organization/administrationUi';
import DataTable, { DataTableEmpty, DataTablePager } from '../../../shared/ui/DataTable';
import { administrationError, storageSize } from '../organization/administrationHelpers';
import '../organization/companyAdministration.css';
function AssignOwnerDialog({ org, repo, busy, save, close, serverError }: {
    org: AdministrationOverview;
    repo: HttpOrganizationRepository;
    busy: boolean;
    save: (id: number) => Promise<boolean>;
    close: () => void;
    serverError: string;
}) {
    useTranslation("administration");
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState('');
    const [candidates, setCandidates] = useState<Array<{
        id: number;
        full_name: string;
        email: string;
    }>>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    useEffect(() => {
        let active = true;
        const timer = setTimeout(() => { setLoading(true); setError(''); setSelected(''); void repo.listPlatformOrganizationOwnerCandidates(org.organization.id, query).then(items => { if (active)
            setCandidates(items); }).catch(cause => { if (active) {
            setCandidates([]);
            setError(administrationError(cause));
        } }).finally(() => { if (active)
            setLoading(false); }); }, 300);
        return () => { active = false; clearTimeout(timer); };
    }, [org.organization.id, query, repo]);
    return <AppModal title={adminText("text217")} closeOnBackdrop animated onClose={() => { if (!busy)
        close(); }} footer={<><AppButton variant="secondary" disabled={busy} onClick={close}>{adminText("text057")}</AppButton><AppButton disabled={busy || loading || !selected} isLoading={busy} onClick={async () => { if (await save(Number(selected)))
        close(); }}>{adminText("text217")}</AppButton></>}><div className="company-admin-form"><p>{adminText("text218")}{org.organization.name}{adminText("text219")}</p><label>{adminText("text220")}<input disabled={busy} placeholder={adminText("text221")} value={query} maxLength={255} onChange={event => { setLoading(true); setSelected(''); setQuery(event.target.value); }}/></label>{loading ? <p role="status">{adminText("text222")}</p> : <label>{adminText("text223")}<select disabled={busy} value={selected} onChange={event => setSelected(event.target.value)}><option value="">{adminText("text224")}</option>{candidates.map(item => <option key={item.id} value={item.id}>{item.full_name} · {item.email}</option>)}</select><small>{adminText("text225")}</small></label>}{(error || serverError) && <div className="company-admin-form-error" role="alert">{error || serverError}</div>}</div></AppModal>;
}
export default function PlatformAdministrationPage() {
    useTranslation("administration");
    const store = useMemo(() => new LocalStorageAuthSessionStore(), []);
    const repo = useMemo(() => new HttpOrganizationRepository(store), [store]);
    const admin = useMemo(() => new HttpAdministrationRepository(store), [store]);
    const auth = useMemo(() => new HttpAuthRepository(store), [store]);
    const navigate = useNavigate();
    const [platform, setPlatform] = useState<PlatformOverview | null>(null);
    const [page, setPage] = useState<PlatformOrganizationList | null>(null);
    const [selected, setSelected] = useState('');
    const [overview, setOverview] = useState<AdministrationOverview | null>(null);
    const [ownerName, setOwnerName] = useState('');
    const [search, setSearch] = useState('');
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState<'active' | 'suspended' | ''>('');
    const [offset, setOffset] = useState(0);
    const [version, setVersion] = useState(0);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const [error, setError] = useState('');
    const [detailError, setDetailError] = useState('');
    const [notice, setNotice] = useState('');
    const [form, setForm] = useState<AdminForm | null>(null);
    const [ownerDialog, setOwnerDialog] = useState(false);
    const mounted = useRef(true);
    useEffect(() => {
        const next = search.trim();
        if (next === query)
            return;
        const timer = window.setTimeout(() => { setOffset(0); setQuery(next); }, 300);
        return () => window.clearTimeout(timer);
    }, [search, query]);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    useEffect(() => {
        let active = true;
        setLoading(true);
        void (async () => {
            try {
                const user = await auth.me();
                if (user.role !== 'admin')
                    throw new HttpError(adminText("text226"), 403);
                const [summary, list] = await Promise.all([admin.platformOverview(), repo.listPlatformOrganizations({ q: query, status, limit: ADMIN_PAGE_SIZE, offset })]);
                if (active) {
                    setPlatform(summary);
                    setPage(list);
                    setSelected(current => list.items.some(item => item.id === current) ? current : list.items[0]?.id ?? '');
                }
            }
            catch (cause) {
                if (active) {
                    setPlatform(null);
                    setSelected('');
                    setError(administrationError(cause));
                }
            }
            finally {
                if (active)
                    setLoading(false);
            }
        })();
        return () => { active = false; };
    }, [admin, auth, offset, query, repo, status, version]);
    useEffect(() => {
        let active = true;
        setDetailError('');
        setOwnerDialog(false);
        if (!selected)
            return;
        void Promise.all([admin.overview(selected), repo.getPlatformOrganization(selected)]).then(([summary, organization]) => { if (active) {
            setOverview(summary);
            setOwnerName(organization.owner_name ?? '');
        } }).catch(cause => { if (active)
            setDetailError(administrationError(cause)); });
        return () => { active = false; };
    }, [admin, repo, selected, version]);
    const mutate = async (operation: () => Promise<void>) => {
        if (busyRef.current)
            return false;
        busyRef.current = true;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await operation();
            if (mounted.current) {
                setNotice(adminText("text067"));
                setVersion(value => value + 1);
            }
            ;
            return true;
        }
        catch (cause) {
            if (mounted.current) {
                setError(administrationError(cause));
                if (cause instanceof HttpError && [403, 404, 409].includes(cause.status)) {
                    setForm(null);
                    setOwnerDialog(false);
                    setVersion(value => value + 1);
                }
            }
            ;
            return false;
        }
        finally {
            busyRef.current = false;
            if (mounted.current)
                setBusy(false);
        }
    };
    const create = () => setForm({ title: adminText("text227"), description: adminText("text228"), fields: [{ key: 'name', label: adminText("text229"), value: '', maxLength: 255 }, { key: 'slug', label: adminText("text230"), value: '', maxLength: 63, hint: adminText("text231") }], save: async (values) => {
            if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.slug))
                throw new HttpError(adminText("text232"), 400);
            const result = await repo.createPlatformOrganization({ name: values.name.trim(), slug: values.slug });
            navigate(`/platform/organizations/${result.id}/administration`);
        } });
    const items = page?.items ?? [];
    const current = items.find(item => item.id === selected);
    const detail = overview && overview.organization.id === selected ? overview : null;
    const statusTone = (value: string) => value === 'active' ? 'bg-[#E7F5EE] text-[#16734B]' : 'bg-[#FDF2E1] text-[#A85A00]';
    const statusText = (value: string) => value === 'active' ? adminText("text094") : adminText("text095");
    const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || '?';
    const directorName = (name: string | null | undefined, id: number | null | undefined) => name || (id ? adminText("template9", { p0: id }) : adminText("text244"));
    const chips: Array<[typeof status, string]> = [['', adminText("platformAll")], ['active', adminText("text239")], ['suspended', adminText("text240")]];
    const stats: Array<[typeof Users, string, number | undefined]> = [[Building2, adminText("text006"), platform?.companies.total], [Users, adminText("text002"), platform?.users.total], [PauseCircle, adminText("text235"), platform?.companies.suspended]];
    const shimmer = (width: string) => <span className={`inline-block h-4 animate-pulse rounded bg-[#EEF0F3] align-middle ${width}`} />;
    return <main className="company-admin-shell"><div className="company-admin-main">
    <PeopleSectionHeader active="administration" structureHref="/platform/structure" accessHref={selected ? `/platform/organizations/${selected}/access` : '/organization/access'} administrationHref="/platform/administration" administrationLabel={adminText("text006")} description={adminText("text233")} actions={<>
      {platform?.capabilities.read_global_audit && <Link className={AXIS_UI.secondaryButton} to="/platform/administration/audit"><History size={16}/>{adminText("platformJournal")}</Link>}
      {platform?.capabilities.create_companies && <button type="button" className={AXIS_UI.primaryButton} disabled={busy} onClick={create}><Plus size={17}/>{adminText("text227")}</button>}
    </>}/>
    {error && !form && !ownerDialog && <div className="company-admin-form-error" role="alert">{error}</div>}{notice && <div className="company-admin-notice" role="status">{notice}</div>}

    <div className="grid overflow-hidden rounded-2xl border border-[#E6EAF1] bg-white sm:grid-cols-3">
      {stats.map(([Icon, label, value], index) => <div key={label} className={`flex min-w-0 items-center gap-3.5 px-5 py-4 ${index ? 'border-t border-[#E6EAF1] sm:border-l sm:border-t-0' : ''}`}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#EDF2FF] text-[#2458D3]"><Icon size={20} strokeWidth={1.8}/></span>
        <div className="min-w-0"><div className="truncate text-[13px] text-[#586174]">{label}</div><div className="mt-0.5 text-[22px] font-semibold leading-7 tabular-nums text-[#17202E]">{value ?? shimmer('w-10')}</div></div>
      </div>)}
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <label className={`${AXIS_UI.inputShell} w-full sm:w-[300px]`}>
        <Search size={16} className="shrink-0 text-[#586174]"/>
        <input data-ui="bare" type="search" className={AXIS_UI.input} aria-label={adminText("text236")} value={search} maxLength={255} placeholder={adminText("text236")} onChange={event => setSearch(event.target.value)}/>
      </label>
      <div className="flex items-center gap-1" role="group" aria-label={adminText("text237")}>
        {chips.map(([value, label]) => <button key={value || 'all'} type="button" aria-pressed={status === value} onClick={() => { setStatus(value); setOffset(0); }}
          className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium transition-colors ${AXIS_UI.focus} ${status === value ? 'border-[#2458D3] bg-[#EDF2FF] text-[#2458D3]' : 'border-[#E2E5EA] bg-white text-[#586174] hover:border-[#C4C9D2] hover:text-[#17202E]'}`}>{label}</button>)}
      </div>
    </div>

    <div className="grid items-start gap-5 min-[1250px]:grid-cols-[minmax(0,1fr)_340px]">
      <DataTable<PlatformOrganization>
        ariaLabel={adminText("text006")}
        rows={items}
        rowKey={(item) => item.id}
        loading={!page && loading}
        skeletonRows={5}
        selectedKey={selected || null}
        onRowClick={(item) => { setSelected(item.id); setNotice(''); }}
        empty={<DataTableEmpty title={adminText("text245")} />}
        columns={[
          { key: 'company', label: adminText("text242"), track: 'minmax(0,1.6fr)', render: (item) => <span className="flex min-w-0 items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EDF1FE] text-[#2446D1]"><Building2 size={16}/></span><span className="min-w-0"><span className="block truncate font-semibold text-[#17202E]">{item.name}</span><span className="flex items-center gap-1.5 truncate text-[12px] text-[#586174]"><span className="truncate">{item.slug}</span><span aria-hidden>·</span><Users size={12} className="shrink-0" aria-label={adminText("text002")}/><span className="tabular-nums">{item.user_count}</span></span></span></span> },
          { key: 'director', label: adminText("platformDirector"), track: 'minmax(0,1.2fr)', skeleton: 'w-28', render: (item) => item.owner_name ? <span className="flex min-w-0 items-center gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#2458D3] text-[10px] font-semibold text-white">{initials(item.owner_name)}</span><span className="truncate text-[#17202E]">{item.owner_name}</span></span> : <span className="text-[#8A93A5]">{directorName(item.owner_name, item.owner_id)}</span> },
          { key: 'status', label: adminText("text125"), track: '150px', skeleton: 'w-16', render: (item) => <span className={`inline-flex h-[22px] items-center gap-1.5 rounded-[6px] px-2 text-[12px] font-medium ${statusTone(item.status)}`}><span className="h-1.5 w-1.5 rounded-full bg-current"/>{statusText(item.status)}</span> },
        ]}
        footer={<DataTablePager label={page?.total ? adminText("template1", { p0: offset + 1, p1: Math.min(offset + ADMIN_PAGE_SIZE, page.total), p2: page.total }) : adminText("text053")}
          page={Math.floor(offset / ADMIN_PAGE_SIZE) + 1} canPrev={!loading && offset > 0} canNext={!loading && offset + ADMIN_PAGE_SIZE < (page?.total ?? 0)}
          onPrev={() => setOffset(Math.max(0, offset - ADMIN_PAGE_SIZE))} onNext={() => setOffset(offset + ADMIN_PAGE_SIZE)} prevLabel={adminText("text054")} nextLabel={adminText("text055")}/>}
      />

      <section className="rounded-2xl border border-[#E6EAF1] bg-white p-6">
        {!current ? <p className="py-10 text-center text-[14px] text-[#586174]">{loading ? adminText("text241") : adminText("platformSelect")}</p> : <>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[#EDF2FF] text-[#2458D3]"><Building2 size={22}/></span>
              <div className="min-w-0"><h2 className="truncate text-[18px] font-semibold leading-6 text-[#17202E]">{detail?.organization.name ?? current.name}</h2><p className="truncate text-[13px] text-[#586174]">{current.slug}</p></div>
            </div>
            <span className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-[6px] px-2 text-[12px] font-medium ${statusTone(detail?.organization.status ?? current.status)}`}><span className="h-1.5 w-1.5 rounded-full bg-current"/>{statusText(detail?.organization.status ?? current.status)}</span>
          </div>
          {detailError ? <div className="company-admin-form-error mt-4" role="alert">{detailError}</div> : <dl className="mt-5 divide-y divide-[#EEF0F3] border-y border-[#EEF0F3]">
            <div className="flex items-center justify-between gap-3 py-3.5"><div className="min-w-0"><dt className="text-[12px] text-[#586174]">{adminText("platformDirector")}</dt><dd className="mt-0.5 truncate text-[14px] font-medium text-[#17202E]">{detail ? directorName(ownerName, detail.organization.owner_id) : directorName(current.owner_name, current.owner_id)}</dd></div>
              <AdminRowAction disabled={busy || !detail?.capabilities.assign_owner} onClick={() => setOwnerDialog(true)}>{adminText("text217")}</AdminRowAction></div>
            <div className="flex items-center justify-between gap-3 py-3.5"><div className="min-w-0"><dt className="text-[12px] text-[#586174]">{adminText("text247")}</dt><dd className="mt-0.5 text-[14px] font-medium text-[#17202E]">{detail ? (detail.storage?.quota_bytes == null ? adminText("text152") : storageSize(detail.storage.quota_bytes)) : shimmer('w-20')}</dd></div>
              <Link className={ADMIN_ROW_ACTION} to={`/platform/organizations/${selected}/administration/storage`}>{adminText("text248")}</Link></div>
            <div className="flex items-center justify-between gap-3 py-3.5"><div className="min-w-0"><dt className="text-[12px] text-[#586174]">{adminText("text249")}</dt><dd className="mt-0.5 text-[14px] font-medium text-[#17202E]">{detail ? adminText("platformModulesOf", { on: detail.modules.filter(module => module.available).length, total: detail.modules.length }) : shimmer('w-14')}</dd></div>
              <Link className={ADMIN_ROW_ACTION} to={`/platform/organizations/${selected}/administration/modules`}>{adminText("text169")}</Link></div>
          </dl>}
          <div className="mt-5 flex flex-col gap-2">
            <Link className="ts-button ts-button--primary w-full" to={`/platform/organizations/${selected}/administration`}>{adminText("text251")}<ArrowRight size={17}/></Link>
            <div className="grid gap-2 sm:max-[1249px]:grid-cols-2">
              <button type="button" className={`${AXIS_UI.secondaryButton} !h-9 w-full justify-center`} disabled={busy || !detail?.capabilities.manage_company_lifecycle} onClick={() => detail && setForm({ title: adminText("text252"), description: adminText("text253"), fields: [{ key: 'name', label: adminText("text229"), value: detail.organization.name, maxLength: 255 }], save: async (values) => { await repo.updatePlatformOrganization(selected, { name: values.name.trim() }); } })}><Pencil size={15}/>{adminText("text254")}</button>
              <button type="button" className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-[var(--ts-radius-control)] bg-[#FCE8E6] px-3 text-[14px] font-medium text-[#C5221F] transition-colors hover:bg-[#FAD2CF] disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || !detail?.capabilities.manage_company_lifecycle}
                onClick={() => { if (!detail) return; const target = selected; setForm({ title: adminText('deleteCompanyTitle'), description: adminText('deleteCompanyDescription', { name: detail.organization.name }), danger: true, submit: adminText('deleteAction'), fields: [], save: async () => { await repo.deletePlatformOrganization(target); if (mounted.current) { setSelected(''); setOffset(0); } } }); }}>
                {adminText('deleteAction')}</button>
            </div>
          </div>
        </>}
      </section>
    </div>
  </div>{form && <AdminFormDialog form={form} serverError={error} busy={busy} onSave={mutate} onClose={() => setForm(null)}/>}{ownerDialog && detail && <AssignOwnerDialog serverError={error} org={detail} repo={repo} busy={busy} save={id => mutate(async () => { await repo.assignPlatformOrganizationOwner(selected, id); })} close={() => setOwnerDialog(false)}/>}</main>;
}
