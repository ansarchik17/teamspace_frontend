import React, { useEffect, useMemo, useState } from 'react';
import { listFiles, listSharedItems } from '../api/files';
import FolderTreeItem from './FolderTreeItem';

const FolderTree = ({ currentFolderId, onItemClick, isShared, excludeFolderId = null, excludeFolderIds = [] }) => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);

    const loadRootItems = async () => {
        setLoading(true);
        try {
            const data = isShared ? await listSharedItems() : await listFiles('root');
            const foldersOnly = (data || []).filter(
                (item) => item.type === 'dir' || item.mime_type === 'application/x-directory'
            );
            setItems(foldersOnly);
        } catch (err) {
            console.error('Failed to load root items in tree', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadRootItems();
    }, [isShared]);

    useEffect(() => {
        const handleSync = () => {
            loadRootItems();
        };
        document.addEventListener('alem-drive-folders-updated', handleSync);
        return () => {
            document.removeEventListener('alem-drive-folders-updated', handleSync);
        };
    }, [isShared]);

    const visibleItems = useMemo(() => {
        const excluded = new Set([excludeFolderId, ...excludeFolderIds].filter(Boolean).map(String));
        if (!excluded.size) return items;
        return items.filter((item) => !excluded.has(String(item.id)));
    }, [excludeFolderId, excludeFolderIds, items]);

    if (loading && visibleItems.length === 0) {
        return (
            <div className="px-3 py-2 text-xs font-semibold text-[#94A3B8] italic select-none">
                Загрузка...
            </div>
        );
    }

    if (visibleItems.length === 0) {
        return (
            <div className="px-3 py-2 text-xs font-semibold text-[#94A3B8] italic select-none">
                Пусто
            </div>
        );
    }

    return (
        <div className="space-y-0.5 max-w-full overflow-hidden">
            {visibleItems.map((item) => (
                <FolderTreeItem
                    key={item.id}
                    item={item}
                    currentFolderId={currentFolderId}
                    onItemClick={onItemClick}
                    excludeFolderId={excludeFolderId}
                    excludeFolderIds={excludeFolderIds}
                />
            ))}
        </div>
    );
};

export default FolderTree;
