import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ChevronDown,
    Clock3,
    FilePlus2,
    FileSpreadsheet,
    FileText,
    Folder,
    FolderPlus,
    HardDrive,
    Inbox,
    Plus,
    Presentation,
    Star,
    Trash2,
    Upload,
    Users,
    BookOpen,
} from 'lucide-react';
import clsx from 'clsx';
import { getDriveSummary, listFavoriteItems, listOwnItems } from '../api/files';
import { BUTTON_PRIMARY, FOCUS_RING, formatSize, isFolderItem } from '../components/driveUi';
import { FloatingMenu, MenuDivider, MenuItem } from '../components/ItemActionsMenu';

const NAV_ITEMS = [
    { label: 'nav.myDrive', icon: HardDrive, path: '/drive', exact: true },
    { label: 'nav.all', icon: Inbox, path: '/drive/all' },
    { label: 'nav.shared', icon: Users, path: '/drive/shared' },
    { label: 'nav.recent', icon: Clock3, path: '/drive/recent' },
    { label: 'nav.favorites', icon: Star, path: '/drive/favorites' },
    { label: 'nav.notebook', icon: BookOpen, path: '/drive/notebook' },
];

const TRASH_ITEM = { label: 'nav.trash', icon: Trash2, path: '/drive/trash' };

export const CREATE_ITEMS = [
    { type: 'folder', label: 'create.folder', icon: FolderPlus },
    { type: 'docx', label: 'create.docx', icon: FileText },
    { type: 'xlsx', label: 'create.xlsx', icon: FileSpreadsheet },
    { type: 'pptx', label: 'create.pptx', icon: Presentation },
    { type: 'txt', label: 'create.txt', icon: FilePlus2 },
];

export const dispatchDriveCreate = (type) => {
    document.dispatchEvent(new CustomEvent('alem-drive-create', { detail: type }));
};

const QUICK_ACCESS_LIMIT = 5;

const pickNumber = (...values) => {
    for (const value of values) {
        const number = Number(value);
        if (value !== null && value !== undefined && value !== '' && Number.isFinite(number)) return number;
    }
    return null;
};

const NavItem = ({ icon: Icon, label, active, onClick, compact = false }) => (
    <button
        type="button"
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={clsx(
            'flex h-9 items-center gap-3 rounded-[6px] text-left text-[14px] font-normal transition-colors duration-[120ms]',
            compact ? 'shrink-0 px-3' : 'w-full px-3',
            active ? 'bg-[#EDF2FF] text-[#2458D3]' : 'text-[#17202E] hover:bg-[#EEF0F3]',
            FOCUS_RING,
        )}
    >
        <Icon className={clsx('h-5 w-5 shrink-0', active ? 'text-[#2458D3]' : 'text-[#586174]')} strokeWidth={1.75} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
);

const CreateButton = ({ disabled, className }) => {
    const { t } = useTranslation('drive');
    const anchorRef = useRef(null);
    const [open, setOpen] = useState(false);
    const close = useCallback(() => setOpen(false), []);
    const pick = (type) => {
        close();
        dispatchDriveCreate(type);
    };

    return (
        <>
            <button
                ref={anchorRef}
                type="button"
                disabled={disabled}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
                className={clsx(BUTTON_PRIMARY, 'h-9 justify-between', className)}
            >
                <span className="inline-flex items-center gap-2">
                    <Plus className="h-5 w-5" strokeWidth={2} />
                    {t('common:actions.create')}
                </span>
                <ChevronDown className="h-4 w-4" strokeWidth={2} />
            </button>
            <FloatingMenu anchorRef={anchorRef} open={open} onClose={close} align="start" width={224}>
                {CREATE_ITEMS.map(({ type, label, icon }) => (
                    <MenuItem key={type} icon={icon} label={t(label)} onClick={() => pick(type)} />
                ))}
                <MenuDivider />
                <MenuItem icon={Upload} label={t('create.upload')} onClick={() => pick('upload')} />
            </FloatingMenu>
        </>
    );
};

export default function DashboardLayout() {
    const { t } = useTranslation('drive');
    const navigate = useNavigate();
    const location = useLocation();
    const [canCreate, setCanCreate] = useState(false);
    const [summary, setSummary] = useState({});
    const [quickFolders, setQuickFolders] = useState([]);
    const mainRef = useRef(null);
    const viewKey = `${location.pathname}?${new URLSearchParams(location.search).get('chat') || ''}`;
    const previousViewKeyRef = useRef(viewKey);

    // Soft fade-in when switching Drive sections, folders or opening a notebook.
    useEffect(() => {
        if (previousViewKeyRef.current === viewKey) return;
        previousViewKeyRef.current = viewKey;
        const element = mainRef.current;
        if (!element || typeof element.animate !== 'function') return;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
        element.animate(
            [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }],
            { duration: 180, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
        );
    }, [viewKey]);

    const isTablet = location.pathname.includes('/tablet');
    // An open notebook uses the full width, like a document editor.
    const isNotebookOpen = location.pathname.startsWith('/drive/notebook') && new URLSearchParams(location.search).has('chat');

    const refreshSummary = useCallback(async () => {
        try {
            setSummary(await getDriveSummary());
        } catch (error) {
            console.error('Failed to load Drive summary', error);
        }
    }, []);

    const refreshQuickFolders = useCallback(async () => {
        try {
            const favorites = (await listFavoriteItems()).filter(isFolderItem);
            if (favorites.length) {
                setQuickFolders(favorites.slice(0, QUICK_ACCESS_LIMIT));
                return;
            }
            const own = (await listOwnItems({ sort_by: 'updated_at', sort_order: 'desc' })).filter(isFolderItem);
            setQuickFolders(own.slice(0, 3));
        } catch (error) {
            console.error('Failed to load quick access folders', error);
        }
    }, []);

    useEffect(() => {
        if (isTablet) return undefined;
        refreshSummary();
        refreshQuickFolders();
        const refresh = () => {
            refreshSummary();
            refreshQuickFolders();
        };
        document.addEventListener('alem-drive-data-changed', refresh);
        document.addEventListener('alem-drive-folders-updated', refreshQuickFolders);
        return () => {
            document.removeEventListener('alem-drive-data-changed', refresh);
            document.removeEventListener('alem-drive-folders-updated', refreshQuickFolders);
        };
    }, [isTablet, refreshSummary, refreshQuickFolders]);

    const isActive = (item) => item.exact
        ? location.pathname === item.path || location.pathname.startsWith('/drive/f/')
        : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);

    const storage = useMemo(() => {
        const used = pickNumber(summary.storage?.used_bytes, summary.used_bytes, summary.storage_used_bytes, summary.storage_used, summary.total_size, summary.used_size);
        const limit = pickNumber(summary.storage?.quota_bytes, summary.quota_bytes, summary.storage_limit_bytes, summary.storage_limit, summary.quota, summary.limit_bytes);
        if (used === null) return null;
        return { used, limit: limit !== null && limit >= 0 ? limit : null };
    }, [summary]);

    const outletContext = { setCanCreate, summary, refreshSummary };

    if (isTablet) {
        return (
            <main className="h-full min-w-0 overflow-auto p-4 sm:p-6">
                <Outlet context={outletContext} />
            </main>
        );
    }

    const allNav = [...NAV_ITEMS, TRASH_ITEM];

    return (
        <div className="flex min-h-0 flex-1 bg-white font-[Inter,sans-serif] text-[#17202E] antialiased">
            <aside className={clsx('w-[240px] shrink-0 flex-col border-r border-[#E2E5EA] bg-[#F6F7F9]', isNotebookOpen ? 'hidden' : 'hidden lg:flex')}>
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4 pt-6">
                    <h1 className="px-2 text-[24px] font-semibold leading-8 tracking-[-0.01em]">Drive</h1>

                    <CreateButton disabled={!canCreate} className="mt-4 w-full" />

                    <nav aria-label={t('nav.sections')} className="mt-4 flex flex-col gap-1">
                        {NAV_ITEMS.map((item) => (
                            <NavItem key={item.path} {...item} label={t(item.label)} active={isActive(item)} onClick={() => navigate(item.path)} />
                        ))}
                        <div className="mt-2">
                            <NavItem {...TRASH_ITEM} label={t(TRASH_ITEM.label)} active={isActive(TRASH_ITEM)} onClick={() => navigate(TRASH_ITEM.path)} />
                        </div>
                    </nav>

                    {quickFolders.length ? (
                        <section className="mt-4 border-t border-[#E2E5EA] pt-4">
                            <h2 className="px-3 text-[12px] font-medium uppercase leading-4 tracking-[0.04em] text-[#586174]">{t('nav.quickAccess')}</h2>
                            <div className="mt-2 flex flex-col gap-1">
                                {quickFolders.map((folder) => (
                                    <NavItem
                                        key={folder.id}
                                        icon={Folder}
                                        label={folder.name}
                                        active={location.pathname.endsWith(`/f/${folder.id}`)}
                                        onClick={() => navigate(`/drive/f/${folder.id}`)}
                                    />
                                ))}
                            </div>
                        </section>
                    ) : null}
                </div>

                {storage ? (
                    <div className="shrink-0 px-6 pb-6 pt-2">
                        <p className="text-[12px] leading-4 text-[#586174]">
                            {t(storage.limit !== null ? 'common:driveStorage.usedOf' : 'common:driveStorage.used', {
                                used: storage.used === 0 ? t('common:driveStorage.zeroBytes') : formatSize(storage.used),
                                limit: storage.limit === 0 ? t('common:driveStorage.zeroBytes') : formatSize(storage.limit),
                            })}
                        </p>
                        {storage.limit > 0 ? (
                            <div
                                className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E2E5EA]"
                                role="progressbar"
                                aria-label={t('common:driveStorage.fullness')}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={Math.round(Math.min(storage.used / storage.limit, 1) * 100)}
                            >
                                <div className="h-full rounded-full bg-[#2458D3]" style={{ width: `${Math.min(storage.used / storage.limit, 1) * 100}%` }} />
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </aside>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className={clsx('flex shrink-0 items-center gap-2 overflow-x-auto border-b border-[#E2E5EA] px-4 py-2 lg:hidden', isNotebookOpen && 'hidden')}>
                    <CreateButton disabled={!canCreate} className="shrink-0 gap-3" />
                    {allNav.map((item) => (
                        <NavItem key={item.path} {...item} label={t(item.label)} compact active={isActive(item)} onClick={() => navigate(item.path)} />
                    ))}
                </div>
                <main ref={mainRef} className="flex min-h-0 min-w-0 flex-1 overflow-auto">
                    <Outlet context={outletContext} />
                </main>
            </div>
        </div>
    );
}
