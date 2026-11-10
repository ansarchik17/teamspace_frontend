import { adminText } from '../../../shared/i18n/adminText'
import { useTranslation } from 'react-i18next'
import { useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AXIS_UI } from '../../../shared/ui/axisTokens';
import PageHeader from '../../../shared/ui/PageHeader';
import { usePeopleNavPublisher, type PeopleSectionTab } from './peopleNav';
export type { PeopleSectionTab } from './peopleNav';
interface PeopleSectionHeaderProps {
    active: PeopleSectionTab;
    /** Адрес вкладки «Структура»: у системного администратора это список компаний */
    structureHref: string;
    accessHref?: string;
    importHref?: string;
    administrationHref?: string;
    administrationLabel?: string;
    /** Заголовок страницы: «Люди» по умолчанию, «Структура» на вкладке структуры */
    title?: string;
    meta?: ReactNode;
    description?: string;
    actions?: ReactNode;
}
/** Общая шапка раздела «Люди»: сотрудники, структура и доступное управление правами. */
export default function PeopleSectionHeader({ active, structureHref, accessHref, importHref, administrationHref, administrationLabel, title, meta, description = adminText("text001"), actions, }: PeopleSectionHeaderProps) {
    useTranslation("administration");
    const { pathname } = useLocation();
    const platformCompany = pathname.match(/^\/platform\/organizations\/([^/]+)/)?.[1];
    const platformScope = Boolean(platformCompany) || pathname.startsWith('/platform') || structureHref.startsWith('/platform');
    const companyHref = platformScope ? '/platform/administration' : administrationHref ?? (accessHref ? '/organization/administration' : undefined);
    const tabs: Array<{
        id: PeopleSectionTab;
        label: string;
        to: string;
    }> = [
        { id: 'employees', label: adminText("text002"), to: '/team-contact' },
        { id: 'structure', label: adminText("text003"), to: structureHref },
        ...(accessHref ? [{ id: 'access' as const, label: adminText("text004"), to: accessHref }] : []),
        ...(importHref ? [{ id: 'import' as const, label: adminText("text005"), to: importHref }] : []),
        ...(companyHref ? [{ id: 'administration' as const, label: platformScope ? adminText("text006") : administrationLabel ?? adminText("text007"), to: companyHref }] : []),
    ];
    const publish = usePeopleNavPublisher();
    const tabsKey = JSON.stringify(tabs);
    useEffect(() => {
        if (!publish)
            return;
        publish({ tabs: JSON.parse(tabsKey) as typeof tabs, active });
        return () => publish(null);
    }, [publish, tabsKey, active]);
    const activeLabel = platformCompany && active === 'administration' ? adminText("text007") : tabs.find((tab) => tab.id === active)?.label ?? adminText("text000");
    return (<PageHeader title={title ?? activeLabel} description={description} meta={meta} actions={actions}>

      <nav className="ts-tabs people-section-tabs" aria-label={adminText("text008")}>
        {tabs.map((tab) => {
            const isActive = tab.id === active;
            return (<Link key={tab.id} to={tab.to} aria-current={isActive ? 'page' : undefined} className={`${AXIS_UI.tab} ${isActive ? AXIS_UI.tabActive : AXIS_UI.tabIdle}`}>
              {tab.label}
            </Link>);
        })}
      </nav>
    </PageHeader>);
}
