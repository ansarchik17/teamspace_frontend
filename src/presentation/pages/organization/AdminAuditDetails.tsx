import { adminText } from '../../../shared/i18n/adminText'
import { formatDate } from '../../../shared/i18n'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react';
import { HttpAdministrationRepository, type AdministrationAudit } from '../../../infrastructure/repositories/HttpAdministrationRepository';
import AppButton from '../../../shared/ui/AppButton';
import AppModal from '../../../shared/ui/AppModal';
import { administrationError, auditLabel, auditTargetLabel } from './administrationHelpers';
import { auditDifferences } from './administrationDiff';
export default function AdminAuditDetails({ repo, org, id, global = false, className = 'company-admin-link' }: {
    className?: string;
    repo: HttpAdministrationRepository;
    org?: string;
    id: number;
    global?: boolean;
}) {
    useTranslation("administration");
    const [open, setOpen] = useState(false);
    const [entry, setEntry] = useState<AdministrationAudit | null>(null);
    const [error, setError] = useState('');
    const [all, setAll] = useState(false);
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        if (!open)
            return;
        const abort = new AbortController();
        const load = async () => {
            setEntry(null);
            setError('');
            try {
                const value = await repo.auditEntry(org, id, abort.signal, global);
                if (!abort.signal.aborted)
                    setEntry(value);
            }
            catch (cause) {
                if (!abort.signal.aborted)
                    setError(administrationError(cause));
            }
        };
        void load();
        return () => abort.abort();
    }, [repo, org, id, global, open, retry]);
    const rows = entry ? auditDifferences(entry.before, entry.after).filter(row => all || row.changed) : [];
    return <><button type="button" className={className} onClick={() => { setAll(false); setOpen(true); }}>{adminText("text009")}</button>{open && <AppModal title={adminText("text010")} maxWidth={900} animated closeOnBackdrop onClose={() => setOpen(false)} footer={<AppButton variant="secondary" onClick={() => setOpen(false)}>{adminText("text011")}</AppButton>}>
    {error ? <div className="company-admin-form-error" role="alert">{error}<AppButton variant="ghost" onClick={() => setRetry(value => value + 1)}>{adminText("text012")}</AppButton></div> : !entry ? <p role="status">{adminText("text013")}</p> : <div className="company-admin-form">
      <p><strong>{auditLabel(entry.action)}</strong><br />{formatDate(entry.created_at, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}{adminText("text014")}{entry.actor_id}<br />{auditTargetLabel(entry.object_type, entry.object_id)}</p>
      <label className="company-admin-diff-toggle"><input type="checkbox" checked={all} onChange={event => setAll(event.target.checked)}/>{adminText("text015")}</label>
      <div className="company-admin-diff"><table><thead><tr><th>{adminText("text016")}</th><th>{adminText("text017")}</th><th>{adminText("text018")}</th></tr></thead><tbody>{rows.map(row => <tr key={row.field} className={row.changed ? 'is-changed' : ''}><th scope="row">{row.field}</th><td>{row.before}</td><td>{row.after}</td></tr>)}</tbody></table></div>
      {!rows.length && <p>{adminText("text019")}</p>}
    </div>}
  </AppModal>}</>;
}
