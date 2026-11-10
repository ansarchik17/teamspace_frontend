import { adminText } from '../../../shared/i18n/adminText'
import { i18n } from '../../../shared/i18n/i18n'
import { HttpError } from '../../../infrastructure/http/HttpError';
export const GiB = 1024 ** 3;
export function storageSize(bytes: number | null | undefined) { return bytes == null ? adminText("text025") : adminText("template0", { p0: new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(bytes / GiB) }); }
export function inputGiB(bytes: number) { return String(bytes / GiB); }
export function parseGiB(value: string) {
    if (!value.trim() || !/^\d+(?:[.,]\d+)?$/.test(value.trim()))
        throw new HttpError(adminText("text026"), 400);
    const bytes = Math.round(Number(value.replace(',', '.')) * GiB);
    if (!Number.isSafeInteger(bytes) || bytes > 2 ** 50)
        throw new HttpError(adminText("text027"), 400);
    return bytes;
}
export function administrationError(error: unknown) {
    if (error instanceof HttpError && error.code === 'ADMIN_DELETION_PROTECTED') return error.message;
    if (isStorageBudgetError(error))
        return error.message;
    if (error instanceof HttpError)
        return error.status === 409 ? adminText("text028") : error.status >= 500 ? adminText("text029") : error.message;
    return adminText("text030");
}
export function isStorageBudgetError(error: unknown): error is HttpError {
    return error instanceof HttpError && error.status === 409 && [
        'COMPANY_BUDGET_BELOW_USAGE',
        'COMPANY_BUDGET_CAPACITY_EXCEEDED',
    ].includes(error.code ?? '');
}
export const MODULE_NAMES = (): Record<string, [
    string,
    string
]> => ({ crm: ['CRM', adminText('crmModuleDescription')], iform: ['iForm', adminText("text031")], odo: [adminText("text032"), adminText("text033")], sd: ['SenimDesk', adminText("text034")], growy: [adminText("text035"), adminText("text036")] });
export const AUDIT_LABELS = (): Record<string, string> => ({ 'organization.create': adminText("text037"), 'organization.update': adminText("text038"), 'organization.owner.assign': adminText("text039"), 'module.update': adminText("text040"), 'user.block.update': adminText("text041"), 'user.delete': adminText('deleteEmployeeAudit'), 'organization.delete': adminText('deleteCompanyAudit'), 'storage.quota.update': adminText("text042"), 'storage.user_quota.update': adminText("text043"), 'identity_provider.create': adminText("text044"), 'identity_provider.update': adminText("text045"), 'identity_provider.delete': adminText("text046"), 'auth.login': adminText("text047"), 'auth.logout': adminText("text048"), 'access.denied': adminText("text049"), 'audit.export': adminText("text050"), 'access.application': adminText("auditAccessApplication"), 'ai.budget.update': i18n.t('ai:audit.budgetUpdate'), 'ai.user_quota.update': i18n.t('ai:audit.userQuotaUpdate') });
const auditCatalog = (key: string, values?: Record<string, unknown>) => {
    const value = i18n.t(`administration:auditCatalog.${key}`, { defaultValue: '', ...values })
    return typeof value === 'string' && !value.includes('auditCatalog.') ? value : ''
}
function describeAction(action: string) {
    const parts = action.split('.').filter(Boolean);
    const last = parts.at(-1) ?? '';
    const verb = last === 'create' && parts.includes('upload') ? 'upload' : last;
    const resources = parts.slice(1, -1).reverse();
    const noun = resources.map(part => auditCatalog(`nouns.${part}`)).find(Boolean) || (parts.length === 2 ? auditCatalog(`nouns.${parts[0]}`) : '');
    const phrase = noun ? auditCatalog(`verbs.${verb}`, { what: noun }) : '';
    if (phrase)
        return phrase;
    const module = auditCatalog(`modules.${parts[0] ?? ''}`);
    return module ? auditCatalog('inModule', { module }) : auditCatalog('generic');
}
export const AUDIT_ACTION_OPTIONS = (): string[] => Object.keys(AUDIT_LABELS());
export function auditLabel(action: string) {
  if (action.replace(/^admin\./, '') === 'ai.budget.update') return i18n.t('ai:audit.budgetUpdate');
  if (action.replace(/^admin\./, '') === 'ai.user_quota.update') return i18n.t('ai:audit.userQuotaUpdate'); const normalized = action.replace(/^admin\./, ''); return normalized === 'mailbox.quota.update' ? adminText("text051") : AUDIT_LABELS()[normalized] ?? describeAction(normalized); }

export function auditTargetLabel(objectType: string, objectId: string): string {
  if (objectType === 'ai_budget') {
    return `${i18n.t('ai:audit.objectCompany')}: ${objectId}`;
  }
  if (objectType === 'ai_user_quota') {
    return i18n.t('ai:audit.objectUserQuota', { id: objectId });
  }
  return `${objectType} · ${objectId}`;
}
