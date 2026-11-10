import { adminText } from '../../../shared/i18n/adminText'
import { useTranslation } from 'react-i18next'
import { useId, useState, type ReactNode } from 'react';
import { storageSize } from './administrationHelpers';
import AppButton from '../../../shared/ui/AppButton';
import AppModal from '../../../shared/ui/AppModal';
import AppSelect from '../../../shared/ui/AppSelect';
import AppConfirmDialog from '../../../shared/ui/AppConfirmDialog';
import { ChevronLeft, ChevronRight } from 'lucide-react';
export function AdminStatus({ children, warning = false }: {
    children: ReactNode;
    warning?: boolean;
}) { useTranslation("administration"); return <span className={`company-admin-status${warning ? ' is-warning' : ''}`}><span />{children}</span>; }
export function AdminPanel({ title, action, children }: {
    title: string;
    action?: ReactNode;
    children: ReactNode;
}) { useTranslation("administration"); return <section className="ts-panel company-admin-panel"><div className="company-admin-panel-heading"><h2>{title}</h2>{action}</div>{children}</section>; }
export function StorageMeter({ label, used, total, icon }: {
    label: string;
    used: number | null;
    total: number | null;
    icon: ReactNode;
}) { useTranslation("administration"); return <div className="company-admin-meter"><div className="company-admin-icon">{icon}</div><div><div className="company-admin-meter-label"><strong>{label}</strong><span>{storageSize(used)} / {total == null ? adminText("text052") : storageSize(total)}</span></div><div className="company-admin-meter-track" role={used != null && total != null ? 'meter' : undefined} aria-label={label} aria-valuenow={used ?? undefined} aria-valuemin={0} aria-valuemax={total == null ? undefined : Math.max(used ?? 0, total)}><span style={{ width: total && used != null ? `${Math.min(100, used / total * 100)}%` : 0 }}/></div></div></div>; }
export const ADMIN_ROW_ACTION = 'inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[6px] bg-[#E8F0FE] px-2.5 text-[12px] font-medium text-[#1967D2] transition-colors hover:bg-[#D2E3FC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ts-action)] disabled:cursor-not-allowed disabled:bg-[#F1F3F4] disabled:text-[#9AA0A6]';
export const ADMIN_ROW_ACTION_DANGER = 'inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[6px] bg-[#FCE8E6] px-2.5 text-[12px] font-medium text-[#C5221F] transition-colors hover:bg-[#FAD2CF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ts-action)] disabled:cursor-not-allowed disabled:bg-[#F1F3F4] disabled:text-[#9AA0A6]';
export function AdminRowAction({ children, danger = false, disabled, onClick, title }: {
    children: ReactNode;
    danger?: boolean;
    disabled?: boolean;
    onClick: () => void;
    title?: string;
}) { return <button type="button" className={danger ? ADMIN_ROW_ACTION_DANGER : ADMIN_ROW_ACTION} disabled={disabled} onClick={onClick} title={title}>{children}</button>; }
export function AdminPager({ label, page, canPrev, canNext, onPrev, onNext, prevLabel = adminText("text054"), nextLabel = adminText("text055") }: {
    label: ReactNode;
    page: number;
    canPrev: boolean;
    canNext: boolean;
    onPrev: () => void;
    onNext: () => void;
    prevLabel?: string;
    nextLabel?: string;
}) { useTranslation("administration"); return <div className="company-admin-panel-footer"><span>{label}</span><div className="company-admin-inline"><AppButton variant="ghost" size="icon" aria-label={prevLabel} title={prevLabel} disabled={!canPrev} onClick={onPrev}><ChevronLeft size={18}/></AppButton><span className="company-admin-page-number">{page}</span><AppButton variant="ghost" size="icon" aria-label={nextLabel} title={nextLabel} disabled={!canNext} onClick={onNext}><ChevronRight size={18}/></AppButton></div></div>; }
export const ADMIN_PAGE_SIZE = 10;
export function AdminPagination({ offset, total, size = ADMIN_PAGE_SIZE, busy, change }: {
    offset: number;
    total: number;
    size?: number;
    busy: boolean;
    change: (offset: number) => void;
}) { return <AdminPager label={total ? adminText("template1", { p0: offset + 1, p1: Math.min(offset + size, total), p2: total }) : adminText("text053")} page={Math.floor(offset / size) + 1} canPrev={!busy && offset > 0} canNext={!busy && offset + size < total} onPrev={() => change(Math.max(0, offset - size))} onNext={() => change(offset + size)}/>; }
export interface AdminField {
    key: string;
    label: string;
    value: string;
    type?: 'text' | 'password' | 'url';
    options?: Array<{
        value: string;
        label: string;
    }>;
    hint?: string;
    optional?: boolean;
    maxLength?: number;
}
export interface AdminForm {
    title: string;
    description: string;
    fields: AdminField[];
    danger?: boolean;
    submit?: string;
    save: (values: Record<string, string>) => Promise<void>;
    confirmation?: (values: Record<string, string>) => string | undefined;
}
export function AdminFormDialog({ form, busy, onSave, onClose, serverError }: {
    form: AdminForm;
    busy: boolean;
    onSave: (run: () => Promise<void>) => Promise<boolean>;
    onClose: () => void;
    serverError?: string;
}) {
    useTranslation("administration");
    const [values, setValues] = useState(() => Object.fromEntries(form.fields.map(field => [field.key, field.value])));
    const [error, setError] = useState('');
    const id = useId();
    const [pending, setPending] = useState<{ message: string; run: () => void } | null>(null);
    const close = () => { if (busy)
        return; if (form.fields.some(field => values[field.key] !== field.value)) {
        setPending({ message: adminText("text056"), run: onClose });
        return;
    } onClose(); };
    const submit = async () => { try {
        if (await onSave(() => form.save(values)))
            onClose();
    }
    catch (cause) {
        setError(cause instanceof Error ? cause.message : adminText("text059"));
    } };
    return <AppModal title={form.title} onClose={close} animated closeOnBackdrop maxWidth={620} footer={<><AppButton variant="secondary" disabled={busy} onClick={close}>{adminText("text057")}</AppButton><AppButton type="submit" form={id} variant={form.danger ? 'danger' : 'primary'} isLoading={busy}>{form.submit ?? adminText("text058")}</AppButton></>}><form id={id} className="company-admin-form" onSubmit={async (event) => { event.preventDefault(); if (busy)
        return; setError(''); const message = form.confirmation?.(values); if (message) {
        setPending({ message, run: () => void submit() });
        return;
    } await submit(); }}><p>{form.description}</p>{form.fields.map(field => <label key={field.key}><span>{field.label}</span>{field.options ? <AppSelect portal disabled={busy} ariaLabel={field.label} value={values[field.key]} options={field.options} showButtonAvatar={false} showOptionAvatar={false} buttonClassName="!h-10 !rounded-[var(--ts-radius-control)] !border-[var(--ts-border)] !bg-white !text-[14px]" menuClassName="!max-w-[min(560px,calc(100vw-32px))]" onChange={value => setValues(current => ({ ...current, [field.key]: value }))}/> : <input disabled={busy} type={field.type ?? 'text'} required={!field.optional} maxLength={field.maxLength ?? 4096} value={values[field.key]} autoComplete={field.type === 'password' ? 'new-password' : 'off'} onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))}/>}{field.hint && <small>{field.hint}</small>}</label>)}{(error || serverError) && <div className="company-admin-form-error" role="alert">{error || serverError}</div>}</form><AppConfirmDialog open={Boolean(pending)} title={adminText("confirmTitle")} message={pending?.message ?? ''} confirmText={adminText("confirmContinue")} cancelText={adminText("text057")} onCancel={() => setPending(null)} onConfirm={() => { const action = pending?.run; setPending(null); action?.(); }}/></AppModal>;
}
