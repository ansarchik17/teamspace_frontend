import { useTranslation } from 'react-i18next';
import React from 'react';
import clsx from 'clsx';
import ItemActionsMenu from './ItemActionsMenu';
import {
    Avatar,
    Checkbox,
    FileTypeIcon,
    formatModified,
    formatSize,
    getItemDate,
    getOwnerAvatar,
    getOwnerName,
    isFolderItem,
} from './driveUi';

const cardFrame = (highlighted) => clsx(
    'group relative cursor-pointer rounded-[8px] border bg-white transition-colors duration-[120ms]',
    highlighted ? 'border-[#2458D3] bg-[#EDF2FF]' : 'border-[#E2E5EA] hover:border-[#C9CED6]',
);

export default function DriveGridCard({
    item,
    selected,
    active,
    onRowClick,
    onToggleSelect,
    user,
    canCreate,
    currentFolderId,
    actions,
    isFavorite,
    trashMode,
}) {
    const { t } = useTranslation('drive');
    const isFolder = isFolderItem(item);
    const highlighted = selected || active;
    const ownerName = getOwnerName(item, user);
    const menu = (
        <ItemActionsMenu
            item={item}
            user={user}
            canCreate={canCreate}
            currentFolderId={currentFolderId}
            actions={actions}
            isFavorite={isFavorite}
            trashMode={trashMode}
        />
    );
    const checkbox = (
        <Checkbox
            checked={selected}
            onChange={() => onToggleSelect(item.id)}
            label={t('actions.selectItem', { name: item.name })}
            className={clsx(!selected && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')}
        />
    );

    if (isFolder) {
        return (
            <div
                aria-selected={highlighted}
                className={clsx(cardFrame(highlighted), 'flex h-14 items-center gap-3 pl-3 pr-1.5')}
                tabIndex={trashMode ? undefined : 0}
                onKeyDown={(event) => {
                    if (trashMode || event.target !== event.currentTarget) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onRowClick(item, event);
                    }
                }}
                onClick={(event) => onRowClick(item, event)}
            >
                <span className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center">
                    <FileTypeIcon item={item} size={24} className={clsx('transition-opacity duration-[120ms]', selected ? 'opacity-0' : 'group-hover:opacity-0')} />
                    <span className="absolute inset-0 flex items-center justify-center">{checkbox}</span>
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-[#17202E]" title={item.name}>{item.name}</span>
                {menu}
            </div>
        );
    }

    return (
        <div
            aria-selected={highlighted}
            className={clsx(cardFrame(highlighted), 'flex flex-col overflow-hidden')}
            tabIndex={trashMode ? undefined : 0}
            onKeyDown={(event) => {
                if (trashMode || event.target !== event.currentTarget) return;
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onRowClick(item, event);
                }
            }}
            onClick={(event) => onRowClick(item, event)}
        >
            <div className={clsx('relative flex aspect-[4/3] items-center justify-center border-b', highlighted ? 'border-[#C9D7F7] bg-[#E3EBFD]' : 'border-[#E2E5EA] bg-[#F6F7F9]')}>
                <FileTypeIcon item={item} size={48} />
                <div className="absolute left-3 top-3">{checkbox}</div>
            </div>
            <div className="flex items-start gap-2 p-3 pr-1.5">
                <FileTypeIcon item={item} size={20} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium leading-5 text-[#17202E]" title={item.name}>{item.name}</p>
                    <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] leading-4 text-[#586174]" title={`${ownerName} · ${formatSize(item.size)}`}>
                        <Avatar name={ownerName} src={getOwnerAvatar(item, user)} size={16} />
                        <span className="truncate">{formatModified(getItemDate(item))}</span>
                    </div>
                </div>
                {menu}
            </div>
        </div>
    );
}
