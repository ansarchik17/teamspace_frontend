import { adminText } from '../../../shared/i18n/adminText'
import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { HttpAdministrationRepository, type SecurityPage } from '../../../infrastructure/repositories/HttpAdministrationRepository';
import { LocalStorageAuthSessionStore } from '../../../infrastructure/storage/LocalStorageAuthSessionStore';
import PeopleSectionHeader from '../../components/people/PeopleSectionHeader';
import AppButton from '../../../shared/ui/AppButton';
import { AdminPanel, AdminStatus } from '../organization/administrationUi';
import { administrationError, auditLabel, auditTargetLabel } from '../organization/administrationHelpers';
import '../organization/companyAdministration.css';
import AdminAuditDetails from '../organization/AdminAuditDetails';
const EMPTY = { action: '', ip: '', outcome: '', from: '', to: '' };
export default function PlatformSecurityAuditPage() {
    useTranslation("administration");
    const repo = useMemo(() => new HttpAdministrationRepository(new LocalStorageAuthSessionStore()), []);
    const [draft, setDraft] = useState(EMPTY);
    const [filters, setFilters] = useState(EMPTY);
    const [cursor, setCursor] = useState<{
        before_id?: number;
        snapshot_id?: number;
    }>({});
    const [page, setPage] = useState<SecurityPage | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [version, setVersion] = useState(0);
    useEffect(() => {
        const abort = new AbortController();
        const load = async () => {
            setLoading(true);
            setPage(null);
            setError('');
            try {
                const overview = await repo.platformOverview(abort.signal);
                if (!overview.capabilities.read_global_audit)
                    return;
                const result = await repo.security(undefined, { ...filters, ...cursor }, abort.signal, true);
                if (!abort.signal.aborted)
                    setPage(result);
            }
            catch (cause) {
                if (!abort.signal.aborted)
                    setError(administrationError(cause));
            }
            finally {
                if (!abort.signal.aborted)
                    setLoading(false);
            }
        };
        void load();
        return () => abort.abort();
    }, [repo, filters, cursor, version]);
    return <main className="company-admin-shell"><div className="company-admin-main">
    <PeopleSectionHeader active="administration" administrationHref="/platform/administration" administrationLabel={adminText("text006")} structureHref="/platform/structure" description={adminText("text263")}/>
    <Link className="company-admin-link" to="/platform/administration"><ArrowLeft size={16}/>{adminText("text091")}</Link>
    <AdminPanel title={adminText("text264")}>
      <form className="company-admin-toolbar" onSubmit={event => {
            event.preventDefault();
            if (draft.from && draft.to && new Date(draft.from) >= new Date(draft.to)) {
                setError(adminText("text180"));
                return;
            }
            setCursor({});
            setFilters({ ...draft, action: draft.action.trim(), ip: draft.ip.trim(), from: draft.from ? new Date(draft.from).toISOString() : '', to: draft.to ? new Date(draft.to).toISOString() : '' });
        }}>
        <input aria-label={adminText("text181")} placeholder={adminText("text182")} maxLength={120} disabled={loading} value={draft.action} onChange={event => setDraft(value => ({ ...value, action: event.target.value }))}/>
        <input aria-label={adminText("text183")} placeholder={adminText("text183")} disabled={loading} value={draft.ip} onChange={event => setDraft(value => ({ ...value, ip: event.target.value }))}/>
        <select aria-label={adminText("text184")} disabled={loading} value={draft.outcome} onChange={event => setDraft(value => ({ ...value, outcome: event.target.value }))}><option value="">{adminText("text185")}</option><option value="success">{adminText("text186")}</option><option value="failure">{adminText("text187")}</option></select>
        <label>{adminText("text188")}<input type="datetime-local" aria-label={adminText("text189")} disabled={loading} value={draft.from} onChange={event => setDraft(value => ({ ...value, from: event.target.value }))}/></label>
        <label>{adminText("text190")}<input type="datetime-local" aria-label={adminText("text191")} disabled={loading} value={draft.to} onChange={event => setDraft(value => ({ ...value, to: event.target.value }))}/></label>
        <AppButton type="submit" variant="secondary" disabled={loading}>{adminText("text192")}</AppButton>
        <AppButton variant="ghost" disabled={loading} onClick={() => { setDraft(EMPTY); setFilters(EMPTY); setCursor({}); }}>{adminText("text193")}</AppButton>
      </form>
      {error && <div role="alert" className="company-admin-form-error">{error}<AppButton variant="ghost" onClick={() => setVersion(value => value + 1)}>{adminText("text012")}</AppButton></div>}
      {loading ? <p role="status">{adminText("text265")}</p> : page && <><div className="company-admin-table-scroll"><table><thead><tr><th>{adminText("text194")}</th><th>{adminText("text242")}</th><th>{adminText("text195")}</th><th>{adminText("text165")}</th><th>IP</th><th>{adminText("text196")}</th><th>{adminText("text197")}</th></tr></thead><tbody>{page.items.map(item => <tr key={item.id}><td>{new Date(item.created_at).toLocaleString('ru-RU')}</td><td>{item.organization_id ? <Link className="company-admin-link" to={`/platform/organizations/${encodeURIComponent(item.organization_id)}/administration/audit`}>{item.organization_id}</Link> : adminText("text266")}</td><td>{item.actor_id == null ? adminText("text198") : adminText("template9", { p0: item.actor_id })}</td><td><strong>{auditLabel(item.action)}</strong><small>{item.action} · {auditTargetLabel(item.object_type, item.object_id)}</small></td><td>{item.ip ?? adminText("text198")}</td><td><AdminStatus warning={item.outcome !== 'success'}>{item.outcome === 'success' ? adminText("text186") : adminText("text187")}</AdminStatus></td><td>{item.administration_audit_id != null && <AdminAuditDetails repo={repo} id={item.administration_audit_id} global/>}</td></tr>)}</tbody></table></div>{!page.items.length && <p className="company-admin-empty">{adminText("text267")}</p>}<div className="company-admin-panel-footer"><span>{adminText("text200")}</span><div className="company-admin-inline"><AppButton variant="secondary" disabled={loading || !cursor.before_id} onClick={() => setCursor({})}>{adminText("text201")}</AppButton><AppButton variant="secondary" disabled={loading || !page.next_before_id} onClick={() => setCursor({ before_id: page.next_before_id, snapshot_id: page.snapshot_id })}>{adminText("text202")}</AppButton></div></div></>}
    </AdminPanel>
  </div></main>;
}
