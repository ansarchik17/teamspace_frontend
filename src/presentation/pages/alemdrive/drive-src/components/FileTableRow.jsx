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

const NEW_FILE_WINDOW_MS = 24 * 60 * 60 * 1000;

const isNewFile = (file) => {
    if (!file?.created_at) return false;
    const createdAt = new Date(file.created_at).getTime();
    return !Number.isNaN(createdAt) && Date.now() - createdAt <= NEW_FILE_WINDOW_MS;
};

export const getExternalSourceLabel = (file) => {
    const sourceSystemCode = String(file?.source_system_code || '').trim().toLowerCase();
    const sourceSystemName = String(file?.source_system_name || '').trim();
    if (sourceSystemCode === 'documentolog' || sourceSystemName.toLowerCase().includes('documentolog')) {
        return 'Documentolog';
    }
    return sourceSystemName || file?.source_system_code || '';
};

const FileTableRow = ({
    file,
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
}) => {
    const { t } = useTranslation('drive');
    const isFolder = isFolderItem(file);
    const sourceLabel = isFolder ? '' : getExternalSourceLabel(file);
    const ownerName = getOwnerName(file, user);
    const highlighted = selected || active;

    return (
        <tr
            aria-selected={highlighted}
            className={clsx(
                'group h-12 cursor-pointer border-b border-[#E2E5EA] transition-colors duration-[120ms]',
                highlighted ? 'bg-[#EDF2FF]' : 'hover:bg-[#F6F7F9]',
            )}
            tabIndex={trashMode ? undefined : 0}
            onKeyDown={(event) => {
                if (trashMode || event.target !== event.currentTarget) return;
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onRowClick(file, event);
                }
            }}
            onClick={(event) => onRowClick(file, event)}
        >
            <td className={clsx('w-12 pl-4 pr-2', active && 'shadow-[inset_2px_0_0_#2458D3]')}>
                <Checkbox checked={selected} onChange={() => onToggleSelect(file.id)} label={t('actions.selectItem', { name: file.name })} />
            </td>
            <td className="py-2 pl-3 pr-4">
                <div className="flex min-w-0 items-center gap-3">
                    <FileTypeIcon item={file} size={24} />
                    <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="min-w-0 line-clamp-2 break-words text-[14px] font-medium leading-5 text-[#17202E]">{file.name}</span>
                            {isNewFile(file) ? (
                                <span className="shrink-0 rounded-[4px] bg-[#EDF8F1] px-1.5 py-0.5 text-[12px] font-medium leading-4 text-[#16734B]">{t('view.new')}</span>
                            ) : null}
                        </div>
                        {sourceLabel ? <span className="text-[12px] leading-4 text-[#586174]">{sourceLabel}</span> : null}
                    </div>
                </div>
            </td>
            <td className="px-4 @max-[800px]:hidden">
                <div className="flex min-w-0 items-center gap-2">
                    <Avatar name={ownerName} src={getOwnerAvatar(file, user)} size={24} />
                    <span className="truncate text-[14px] text-[#586174]">{ownerName}</span>
                </div>
            </td>
            <td className="whitespace-nowrap px-4 text-[14px] tabular-nums text-[#586174] @max-[520px]:hidden">
                {formatModified(getItemDate(file))}
            </td>
            <td className="whitespace-nowrap px-4 text-[14px] tabular-nums text-[#586174] @max-[660px]:hidden">
                {isFolder ? '—' : formatSize(file.size)}
            </td>
            <td className="w-14 pr-3 text-right">
                <ItemActionsMenu
                    item={file}
                    user={user}
                    canCreate={canCreate}
                    currentFolderId={currentFolderId}
                    actions={actions}
                    isFavorite={isFavorite}
                    trashMode={trashMode}
                    buttonClassName={clsx(!highlighted && 'opacity-80 group-hover:opacity-100')}
                />
            </td>
        </tr>
    );
};

export default FileTableRow;
