import { useTranslation } from 'react-i18next';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import {
    Copy,
    Download,
    ExternalLink,
    FileDown,
    FolderInput,
    Info,
    MessageCircle,
    MoreHorizontal,
    PencilLine,
    RotateCcw,
    Share2,
    Star,
    Trash2,
} from 'lucide-react';
import { getMyPermission } from '../api/files';
import { FOCUS_RING, ICON_BUTTON, isFolderItem } from './driveUi';

const MENU_WIDTH = 224;

export const MenuItem = ({ icon: Icon, label, onClick, danger = false, disabled = false }) => (
    <button
        type="button"
        role="menuitem"
        disabled={disabled}
        onClick={onClick}
        className={clsx(
            'flex h-9 w-full items-center gap-2.5 px-3 text-left text-[14px] transition-colors duration-[120ms] disabled:cursor-not-allowed disabled:opacity-60',
            danger ? 'text-[#C03437] hover:bg-[#FFF0F0]' : 'text-[#17202E] hover:bg-[#F6F7F9]',
            FOCUS_RING,
        )}
    >
        {Icon ? <Icon className={clsx('h-4 w-4 shrink-0', danger ? 'text-[#C03437]' : 'text-[#586174]')} strokeWidth={1.75} /> : null}
        <span className="truncate">{label}</span>
    </button>
);

export const MenuDivider = () => <div className="my-1 h-px bg-[#E2E5EA]" />;

/** Positions a floating panel next to an anchor and closes it on outside click, scroll or Escape. */
export const FloatingMenu = ({ anchorRef, open, onClose, width = MENU_WIDTH, align = 'end', children, className }) => {
    const panelRef = useRef(null);
    const [coords, setCoords] = useState(null);

    useLayoutEffect(() => {
        if (!open || !anchorRef.current) return;
        const rect = anchorRef.current.getBoundingClientRect();
        const panelHeight = panelRef.current?.offsetHeight || 280;
        const openUp = window.innerHeight - rect.bottom < panelHeight + 12 && rect.top > panelHeight + 12;
        const left = align === 'start' ? rect.left : rect.right - width;
        setCoords({
            top: openUp ? rect.top - panelHeight - 4 : rect.bottom + 4,
            left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
        });
    }, [open, anchorRef, width, align, children]);

    useEffect(() => {
        if (!open) return undefined;
        const handlePointer = (event) => {
            if (panelRef.current?.contains(event.target) || anchorRef.current?.contains(event.target)) return;
            onClose();
        };
        const handleKey = (event) => {
            if (event.key === 'Escape') onClose();
        };
        const handleScroll = (event) => {
            if (panelRef.current?.contains(event.target)) return;
            onClose();
        };
        document.addEventListener('mousedown', handlePointer);
        document.addEventListener('keydown', handleKey);
        window.addEventListener('scroll', handleScroll, true);
        window.addEventListener('resize', onClose);
        return () => {
            document.removeEventListener('mousedown', handlePointer);
            document.removeEventListener('keydown', handleKey);
            window.removeEventListener('scroll', handleScroll, true);
            window.removeEventListener('resize', onClose);
        };
    }, [open, onClose, anchorRef]);

    if (!open) return null;

    return createPortal(
        <div
            ref={panelRef}
            role="menu"
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            style={{ position: 'fixed', top: coords?.top ?? -9999, left: coords?.left ?? -9999, width }}
            className={clsx(
                'z-[9999] overflow-hidden rounded-[8px] border border-[#E2E5EA] bg-white py-1 font-[Inter,sans-serif] antialiased shadow-[0_12px_32px_rgba(23,32,46,0.12)]',
                'motion-safe:animate-[drive-menu-in_120ms_ease-out]',
                className,
            )}
        >
            {children}
        </div>,
        document.body,
    );
};

/**
 * Context menu for a drive item. `actions` holds the handlers the current mode allows;
 * write actions stay hidden until the user's role on the item is known.
 */
export default function ItemActionsMenu({
    item,
    user,
    canCreate,
    currentFolderId,
    actions = {},
    isFavorite = false,
    trashMode = false,
    buttonClassName,
}) {
    const { t } = useTranslation('drive');
    const anchorRef = useRef(null);
    const [open, setOpen] = useState(false);
    const [role, setRole] = useState(null);
    const [fetchingRole, setFetchingRole] = useState(false);
    const isFolder = isFolderItem(item);
    const isOwner = (item.owner_id != null && user?.id != null && String(item.owner_id) === String(user.id)) || role === 'owner';
    const hasEditAccess = isOwner || role === 'editor';
    const canManageAccess = isOwner;

    const close = () => setOpen(false);

    const toggle = async (event) => {
        event.stopPropagation();
        const next = !open;
        setOpen(next);
        if (next && !(item.owner_id != null && user?.id != null && String(item.owner_id) === String(user.id))) {
            setFetchingRole(true);
            setRole(null);
            try {
                const permission = await getMyPermission(item.id, isFolder ? 'folder' : 'file');
                setRole(permission?.role || 'viewer');
            } catch (err) {
                console.error('Failed to fetch item permission', err);
                setRole('viewer');
            } finally {
                setFetchingRole(false);
            }
        }
    };

    const run = (handler) => (event) => {
        event.stopPropagation();
        close();
        handler?.(item);
    };

    return (
        <>
            <button
                ref={anchorRef}
                type="button"
                aria-label={t('actions.forItem', { name: item.name })}
                data-tooltip-align="end"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={toggle}
                onDoubleClick={(event) => event.stopPropagation()}
                className={clsx(ICON_BUTTON, 'h-8 w-8', open && 'bg-[#F6F7F9] text-[#17202E]', buttonClassName)}
            >
                <MoreHorizontal className="h-5 w-5" strokeWidth={1.75} />
            </button>
            <FloatingMenu anchorRef={anchorRef} open={open} onClose={close}>
                {trashMode ? (
                    <MenuItem icon={RotateCcw} label={t('actions.restore')} onClick={run(actions.restore)} />
                ) : (
                    <>
                        <MenuItem icon={ExternalLink} label={t('common:actions.open')} onClick={run(actions.open)} />
                        {!isFolder && actions.details ? <MenuItem icon={Info} label={t('actions.details')} onClick={run(actions.details)} /> : null}
                        {!isFolder && actions.download ? <MenuItem icon={Download} label={t('common:actions.download')} onClick={run(actions.download)} /> : null}
                        {actions.favorite ? (
                            <MenuItem icon={Star} label={isFavorite ? t('actions.unfavorite') : t('actions.favorite')} onClick={run(actions.favorite)} />
                        ) : null}
                        {actions.copy ? <MenuItem icon={Copy} label={t('actions.copy')} onClick={run(actions.copy)} /> : null}
                        {actions.messenger && !isFolder ? <MenuItem icon={MessageCircle} label={t('actions.sendToChat')} onClick={run(actions.messenger)} /> : null}
                        {fetchingRole ? (
                            <div className="flex h-9 items-center px-3 text-[13px] text-[#586174]">{t('actions.checkingAccess')}</div>
                        ) : hasEditAccess || canManageAccess ? (
                            <>
                                {canManageAccess && actions.share ? <MenuItem icon={Share2} label={t('common:actions.share')} onClick={run(actions.share)} /> : null}
                                {hasEditAccess && actions.rename ? <MenuItem icon={PencilLine} label={t('actions.rename')} onClick={run(actions.rename)} /> : null}
                                {hasEditAccess && actions.move ? <MenuItem icon={FolderInput} label={t('actions.move')} onClick={run(actions.move)} /> : null}
                                {isFolder && canManageAccess && actions.accessReport ? <MenuItem icon={FileDown} label={t('actions.accessReport')} onClick={run(actions.accessReport)} /> : null}
                                {hasEditAccess && actions.delete ? (
                                    <>
                                        <MenuDivider />
                                        <MenuItem icon={Trash2} label={t('common:actions.delete')} danger onClick={run(actions.delete)} />
                                    </>
                                ) : null}
                            </>
                        ) : null}
                    </>
                )}
            </FloatingMenu>
        </>
    );
}
