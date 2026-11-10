import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText, Image, MonitorPlay, Music, Video, Users } from 'lucide-react';
import { listFiles, getUsersWithAccess } from '../api/files';

const TreeIcon = ({ type, name, isOpen, isSelected, hasSubfolders }) => {
    if (type === 'dir' || type === 'folder') {
        return isOpen ? (
            <FolderOpen className={`h-[15px] w-[15px] mr-2 shrink-0 ${
                isSelected
                    ? hasSubfolders ? 'text-violet-600' : 'text-[#2458D3]'
                    : hasSubfolders ? 'text-violet-400' : 'text-[#94A3B8]'
            }`} />
        ) : (
            <Folder className={`h-[15px] w-[15px] mr-2 shrink-0 ${
                isSelected
                    ? hasSubfolders ? 'text-violet-600' : 'text-[#2458D3]'
                    : hasSubfolders ? 'text-violet-400' : 'text-[#94A3B8]'
            }`} />
        );
    }

    const lowerName = name.toLowerCase();
    const isImage = lowerName.match(/\.(jpg|jpeg|png|gif|webp|heic|heif|bmp)$/i) || type?.startsWith('image/');
    const isPdf = lowerName.endsWith('.pdf') || type === 'application/pdf';
    const isVideo = lowerName.match(/\.(mp4|mov|webm|avi|mkv|3gp)$/i) || type?.startsWith('video/');
    const isAudio = lowerName.match(/\.(mp3|wav|ogg|m4a|flac)$/i) || type?.startsWith('audio/');
    const isSheet = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || type?.includes('spreadsheet');
    const isPresentation = lowerName.endsWith('.pptx') || lowerName.endsWith('.ppt') || type?.includes('presentation');

    if (isImage) return <Image className="h-[15px] w-[15px] mr-2 shrink-0 text-purple-500" />;
    if (isPdf) return <FileText className="h-[15px] w-[15px] mr-2 shrink-0 text-red-500" />;
    if (isVideo) return <Video className="h-[15px] w-[15px] mr-2 shrink-0 text-pink-500" />;
    if (isAudio) return <Music className="h-[15px] w-[15px] mr-2 shrink-0 text-amber-500" />;
    if (isSheet) return <FileText className="h-[15px] w-[15px] mr-2 shrink-0 text-green-500" />;
    if (isPresentation) return <MonitorPlay className="h-[15px] w-[15px] mr-2 shrink-0 text-orange-500" />;

    return <FileText className="h-[15px] w-[15px] mr-2 shrink-0 text-blue-500" />;
};

const FolderTreeItem = ({ item, currentFolderId, onItemClick, excludeFolderId = null, excludeFolderIds = [] }) => {
    const isFolder = item.type === 'dir' || item.mime_type === 'application/x-directory';
    const [isOpen, setIsOpen] = useState(false);
    const [subItems, setSubItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [usersCount, setUsersCount] = useState(null);

    const fetchUsersCount = async () => {
        try {
            const data = await getUsersWithAccess(item.id, 'folder');
            setUsersCount(data?.total ?? (Array.isArray(data) ? data.length : data?.items?.length || 0));
        } catch (err) {
            console.error("Failed to fetch users count in tree", err);
        }
    };

    useEffect(() => {
        fetchUsersCount();
    }, [item.id]);

    useEffect(() => {
        const handleSync = () => {
            fetchUsersCount();
        };
        document.addEventListener('alem-drive-folders-updated', handleSync);
        return () => {
            document.removeEventListener('alem-drive-folders-updated', handleSync);
        };
    }, [item.id]);

    const loadSubItems = async () => {
        setLoading(true);
        try {
            const data = await listFiles(item.id);
            setSubItems(data || []);
        } catch (err) {
            console.error('Failed to load sub items in tree', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isFolder && isOpen) {
            loadSubItems();
        }
    }, [isOpen, isFolder]);

    useEffect(() => {
        const handleSync = () => {
            if (isFolder && isOpen) {
                loadSubItems();
            }
        };
        document.addEventListener('alem-drive-folders-updated', handleSync);
        return () => {
            document.removeEventListener('alem-drive-folders-updated', handleSync);
        };
    }, [isOpen, isFolder]);

    const visibleSubItems = useMemo(() => {
        const excluded = new Set([excludeFolderId, ...excludeFolderIds].filter(Boolean).map(String));
        if (!excluded.size) return subItems;
        return subItems.filter((sub) => !excluded.has(String(sub.id)));
    }, [excludeFolderId, excludeFolderIds, subItems]);

    const handleToggle = (e) => {
        e.stopPropagation();
        if (isFolder) {
            setIsOpen(!isOpen);
        }
    };

    const isSelected = currentFolderId === item.id;

    return (
        <div className="w-full text-left">
            <div
                onClick={() => onItemClick(item)}
                className={`group/tree flex items-center h-8.5 px-2 rounded-xl cursor-pointer transition-all min-w-0 select-none ${
                    isSelected
                        ? item.has_subfolders
                            ? 'bg-violet-50 text-violet-600 font-semibold'
                            : 'bg-[#EEF2FF] text-[#2458D3] font-semibold'
                        : item.has_subfolders
                            ? 'text-[#64748B] hover:bg-violet-50/50 hover:text-violet-600'
                            : 'text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B]'
                }`}
            >
                {isFolder ? (
                    <button
                        type="button"
                        onClick={handleToggle}
                        className="w-5 h-5 flex items-center justify-center rounded-md hover:bg-slate-200/50 text-[#94A3B8] hover:text-[#475569] mr-1 shrink-0 transition-colors"
                    >
                        {isOpen ? (
                            <ChevronDown className="h-3.5 w-3.5 stroke-[2.5]" />
                        ) : (
                            <ChevronRight className="h-3.5 w-3.5 stroke-[2.5]" />
                        )}
                    </button>
                ) : (
                    <div className="w-5 h-5 mr-1 shrink-0" />
                )}

                <TreeIcon type={item.type || item.mime_type} name={item.name} isOpen={isOpen} isSelected={isSelected} hasSubfolders={item.has_subfolders} />

                <span className="truncate text-xs min-w-0 flex-1 leading-none flex items-center justify-between" title={item.name}>
                    <span className="truncate">{item.name}</span>
                    <div className="flex items-center gap-1 ml-1.5 shrink-0">
                        {item.files_count !== undefined && item.files_count >= 0 && (
                            <span className="text-[10px] text-[#94A3B8] font-bold bg-slate-100/80 px-1.5 py-0.5 rounded-full shrink-0" title={`Файлов: ${item.files_count}`}>
                                {item.files_count}
                            </span>
                        )}
                        {usersCount !== null && (
                            <span className="text-[10px] text-[#2458D3] font-extrabold bg-[#EEF2FF] border border-[#BBDEFB]/40 px-1.5 py-0.5 rounded-full shrink-0 flex items-center gap-0.5" title={`Доступно пользователям: ${usersCount}`}>
                                <Users className="h-2.5 w-2.5" />
                                <span>{usersCount}</span>
                            </span>
                        )}
                    </div>
                </span>
            </div>

            {isFolder && isOpen && (
                <div className="pl-2 border-l border-[#E2E8F0] ml-2 mt-0.5 space-y-0.5">
                    {loading && visibleSubItems.length === 0 ? (
                        <div className="px-3 py-1.5 text-[10px] font-medium text-[#94A3B8] italic">
                            Загрузка...
                        </div>
                    ) : visibleSubItems.length === 0 ? (
                        <div className="px-3 py-1.5 text-[10px] font-medium text-[#94A3B8] italic">
                            Пусто
                        </div>
                    ) : (
                        visibleSubItems.map((sub) => (
                            <FolderTreeItem
                                key={sub.id}
                                item={sub}
                                currentFolderId={currentFolderId}
                                onItemClick={onItemClick}
                                excludeFolderId={excludeFolderId}
                                excludeFolderIds={excludeFolderIds}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default FolderTreeItem;
