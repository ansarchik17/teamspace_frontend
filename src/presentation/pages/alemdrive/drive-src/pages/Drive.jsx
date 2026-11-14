import { useTranslation } from 'react-i18next';
import { formatDateTime } from '../../../../../shared/i18n';
import React, { useCallback, useEffect, useState, useRef } from 'react';
import { listFiles, uploadFile, createFolder, listSharedItems, listOwnItems, listAllItems, listRecentFiles, listFavoriteItems, listTrashItems, addFavorite, removeFavorite, restoreTrashItem, deleteFile, deleteFolder, updateFolder, updateFile, getFileTypes, getMyPermission, getSharedUsers, copyItem, moveItem, exportFolderAccessReport, getFolder, getDriveActivity, searchDrive, downloadFile } from '../api/files';
import { getMe } from '../api/auth';
import AppModal from '../../../../../shared/ui/AppModal';
import FileTableRow from '../components/FileTableRow';
import DriveGridCard from '../components/DriveGridCard';
import { FloatingMenu, MenuItem } from '../components/ItemActionsMenu';
import {
    BUTTON_PRIMARY,
    BUTTON_SECONDARY,
    BUTTON_SECONDARY_ACCENT,
    Checkbox,
    FOCUS_RING,
    ICON_BUTTON,
    getItemDate,
    isFolderItem,
    pluralize,
} from '../components/driveUi';
import {
    ArrowDown,
    ArrowUp,
    Check,
    ChevronDown,
    ChevronRight,
    ClipboardPaste,
    Copy,
    Download,
    FolderInput,
    FolderPlus,
    LayoutGrid,
    List,
    ListFilter,
    Loader2,
    MoreHorizontal,
    History,
    ChevronLeft,
    RefreshCcw,
    Share2,
    SquareCheck,
    Trash2,
    Upload,
    UploadCloud,
    X,
} from 'lucide-react';
import clsx from 'clsx';
import { useNavigate, useParams, useOutletContext } from 'react-router-dom';
import ShareModal from '../components/ShareModal';
import { useToast } from '../components/Toast';
import ImagePreviewModal from '../components/ImagePreviewModal';
import ArchivePreviewModal from '../components/ArchivePreviewModal';
import CreateFileModal from '../components/CreateFileModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import MoveItemModal from '../components/MoveItemModal';
import RenameModal from '../components/RenameModal';
import DocumentDetailsPanel from '../components/DocumentDetailsPanel';
import { generateTxt, generateDocx, generateXlsx, generatePptx } from '../utils/fileGenerators';
import { canWriteFolder } from '../utils/folderAccess';

const ALLOWED_UPLOAD_EXTENSIONS = [
    'docx', 'xlsx', 'pdf', 'pptx', 'txt', 'zip', 'rar',
    'mp3', 'wav', 'ogg', 'm4a', 'flac',
    'mp4', 'mov', 'avi', 'mkv'
];
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'application/zip',
    'application/x-zip-compressed',
    'application/vnd.rar',
    'application/x-rar-compressed',
    'audio/mpeg',
    'audio/wav',
    'audio/x-wav',
    'audio/ogg',
    'audio/mp4',
    'audio/m4a',
    'audio/x-m4a',
    'audio/flac',
    'audio/x-flac',
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska'
]);

const DRIVE_ACTIVITY_LABELS = {
    created: 'history.created',
    uploaded: 'history.uploaded',
    renamed: 'history.renamed',
    moved: 'history.moved',
    edited: 'history.edited',
    deleted: 'history.deleted',
    copied: 'history.copied',
    restored: 'history.restored',
    downloaded: 'history.downloaded',
    download: 'history.downloaded',
    file_downloaded: 'history.downloaded',
    file_download: 'history.downloaded',
    file_deleted: 'history.fileDeleted',
};

const DRIVE_ACTIVITY_PAGE_SIZE = 20;

const formatDriveActivityDate = (value, t) => {
    const date = value ? new Date(value) : null;
    return !date || Number.isNaN(date.getTime()) ? t('history.justNow') : formatDateTime(date, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const getDriveActivityDescription = (item) => {
    if (!item) return '';
    if ((item.action === 'moved' || item.action === 'renamed') && item.from_path && item.to_path) {
        return `${item.from_path} -> ${item.to_path}`;
    }
    return item.to_path || item.resource_path || item.from_path || item.resource_name || '';
};

const getUploadErrorMessage = (err, fileName) => {
    const response = err?.response;
    const data = response?.data || {};
    const status = response?.status;
    const code = data?.code;

    if (data?.user_message) {
        return data.user_message;
    }

    if (status === 409 || code === 'CONFLICT') {
        return `Файл "${fileName}" не загружен: в этой папке уже есть такой же файл.`;
    }

    if (status === 413 || code === 'FILE_TOO_BIG') {
        return `Файл "${fileName}" не загружен: превышен допустимый размер.`;
    }

    if (status === 415 || code === 'INVALID_FILE_TYPE') {
        return `Файл "${fileName}" не загружен: формат файла не поддерживается.`;
    }

    if (status === 401 || status === 403) {
        return `Файл "${fileName}" не загружен: у вас нет прав для загрузки в эту папку.`;
    }

    if (status >= 500) {
        return `Файл "${fileName}" не загружен: ошибка на сервере. Попробуйте ещё раз.`;
    }

    if (data?.message) {
        return `Файл "${fileName}" не загружен: ${data.message}`;
    }

    return `Файл "${fileName}" не удалось загрузить.`;
};

const getDeleteResultMessage = (result, fallbackName, isFolder) => {
    if (result?.message) {
        return result.message;
    }

    if (result?.status === 'pending_approval') {
        return `Запрос на удаление ${isFolder ? 'папки' : 'файла'} "${fallbackName}" отправлен владельцу.`;
    }

    return `${isFolder ? 'Папка' : 'Файл'} "${fallbackName}" удален${isFolder ? 'а' : ''}`;
};

// In-memory cache to preserve folder contents across page visits (e.g. Back button)
const driveCache = {};

// The search field lives in the workspace header, so keep its value across Drive remounts.
let lastDriveSearch = '';

const MODIFIED_FILTERS = [
    { value: '', label: 'filters.anyTime' },
    { value: 'today', label: 'filters.today' },
    { value: 'week', label: 'filters.week' },
    { value: 'month', label: 'filters.month' },
    { value: 'year', label: 'filters.year' },
];

const SORT_OPTIONS = [
    { value: 'name:asc', label: 'sort.nameAsc' },
    { value: 'name:desc', label: 'sort.nameDesc' },
    { value: 'updated_at:desc', label: 'sort.newest' },
    { value: 'updated_at:asc', label: 'sort.oldest' },
    { value: 'size:desc', label: 'sort.largest' },
    { value: 'size:asc', label: 'sort.smallest' },
];

const matchesModifiedFilter = (item, filter) => {
    if (!filter) return true;
    const date = new Date(getItemDate(item) || 0);
    if (Number.isNaN(date.getTime())) return false;
    const now = new Date();
    if (filter === 'today') return date.toDateString() === now.toDateString();
    if (filter === 'year') return date.getFullYear() === now.getFullYear();
    const days = filter === 'week' ? 7 : 30;
    return now.getTime() - date.getTime() <= days * 86400000;
};

const describeSelection = (items, t) => {
    const folders = items.filter(isFolderItem).length;
    const kind = folders === items.length ? 'folders' : folders === 0 ? 'files' : 'items';
    return t(`selection.${kind}`, { count: items.length });
};

const FilterChip = ({ label, value, options, onChange }) => {
    const anchorRef = useRef(null);
    const [open, setOpen] = useState(false);
    const close = useCallback(() => setOpen(false), []);
    const current = options.find((option) => option.value === value && option.value !== '');

    return (
        <>
            <button
                ref={anchorRef}
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((next) => !next)}
                className={clsx(
                    'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[14px] font-medium transition-colors duration-[120ms]',
                    current ? 'border-[#2458D3] bg-[#EDF2FF] text-[#2458D3]' : 'border-[#E2E5EA] bg-white text-[#17202E] hover:bg-[#F6F7F9]',
                    FOCUS_RING,
                )}
            >
                <span className="max-w-[180px] truncate">{current ? current.label : label}</span>
                <ChevronDown className={clsx('h-4 w-4 transition-transform duration-[120ms]', open && 'rotate-180')} strokeWidth={1.75} />
            </button>
            <FloatingMenu anchorRef={anchorRef} open={open} onClose={close} align="start" width={232} className="max-h-80 overflow-y-auto">
                {options.map((option) => (
                    <button
                        key={option.value || 'all'}
                        type="button"
                        role="menuitemradio"
                        aria-checked={option.value === value}
                        onClick={() => { onChange(option.value); close(); }}
                        className={clsx('flex h-9 w-full items-center gap-2.5 px-3 text-left text-[14px] hover:bg-[#F6F7F9]', option.value === value ? 'text-[#2458D3]' : 'text-[#17202E]', FOCUS_RING)}
                    >
                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                        {option.value === value ? <Check className="h-4 w-4 shrink-0" strokeWidth={2} /> : null}
                    </button>
                ))}
            </FloatingMenu>
        </>
    );
};

const MenuButton = ({ icon: Icon, label, ariaLabel, className, children, width = 232 }) => {
    const anchorRef = useRef(null);
    const [open, setOpen] = useState(false);
    const close = useCallback(() => setOpen(false), []);

    return (
        <>
            <button
                ref={anchorRef}
                type="button"
                aria-label={ariaLabel}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={(event) => { event.stopPropagation(); setOpen((next) => !next); }}
                className={clsx(className, open && 'bg-[#F6F7F9] text-[#17202E]')}
            >
                {Icon ? <Icon className="h-5 w-5" strokeWidth={1.75} /> : null}
                {label}
            </button>
            <FloatingMenu anchorRef={anchorRef} open={open} onClose={close} width={width}>
                {typeof children === 'function' ? children(close) : children}
            </FloatingMenu>
        </>
    );
};

const BulkAction = ({ icon: Icon, label, onClick, danger = false }) => (
    <button
        type="button"
        onClick={onClick}
        title={label}
        className={clsx(
            'inline-flex h-8 shrink-0 items-center gap-2 rounded-[6px] px-2.5 text-[14px] font-normal transition-colors duration-[120ms]',
            danger ? 'text-[#C03437] hover:bg-[#FFF0F0]' : 'text-[#17202E] hover:bg-white',
            FOCUS_RING,
        )}
    >
        <Icon className={clsx('h-5 w-5 shrink-0', danger ? 'text-[#C03437]' : 'text-[#2458D3]')} strokeWidth={1.75} />
        <span className="@max-[780px]:sr-only">{label}</span>
    </button>
);

const Drive = ({ mode = 'my-drive' }) => {
    const { t, i18n } = useTranslation('drive');
    const { folderId: urlFolderId } = useParams();
    const currentFolderId = urlFolderId || 'root';
    
    const { setCanCreate, summary = {}, refreshSummary } = useOutletContext() || {};
    const [canCreate, setCanCreateState] = useState(false);
    
    // Look up cache for initial mount
    const initialCacheKey = `${currentFolderId}-${mode}--null-updated_at-desc`;
    const cachedData = driveCache[initialCacheKey];

    const [files, setFiles] = useState(cachedData ? cachedData.files : []);
    const [loading, setLoading] = useState(!cachedData);
    const [error, setError] = useState(null);
    const [folderPath, setFolderPath] = useState(cachedData ? cachedData.folderPath : []);
    const [uploadProgress, setUploadProgress] = useState(null);
    const [uploadingFileName, setUploadingFileName] = useState(null);
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [shareModalOpen, setShareModalOpen] = useState(false);
    const [fileToShare, setFileToShare] = useState(null);
    const [previewModalOpen, setPreviewModalOpen] = useState(false);
    const [archiveModalOpen, setArchiveModalOpen] = useState(false);
    const [fileToPreview, setFileToPreview] = useState(null);
    const [selectedPreviewItem, setSelectedPreviewItem] = useState(null);
    const [createFileModalOpen, setCreateFileModalOpen] = useState(false);
    const [fileTypeToCreate, setFileTypeToCreate] = useState('txt');
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [fileToDelete, setFileToDelete] = useState(null);
    const [renameModalOpen, setRenameModalOpen] = useState(false);
    const [fileToRename, setFileToRename] = useState(null);
    const [moveModalOpen, setMoveModalOpen] = useState(false);
    const [fileToMove, setFileToMove] = useState(null);
    const [isMovingItem, setIsMovingItem] = useState(false);
    const [searchQuery, setSearchQuery] = useState(lastDriveSearch);
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(lastDriveSearch);

    useEffect(() => {
        const handleSearch = (event) => {
            lastDriveSearch = String(event.detail || '');
            setSearchQuery(lastDriveSearch);
        };
        document.addEventListener('alem-drive-search', handleSearch);
        return () => document.removeEventListener('alem-drive-search', handleSearch);
    }, []);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 300);
        return () => {
            clearTimeout(handler);
        };
    }, [searchQuery]);

    const [clipboard, setClipboard] = useState(null);
    
    // View state
    const [viewMode, setViewMode] = useState(() => {
        try {
            return localStorage.getItem('alem_drive_view_mode') || 'list';
        } catch {
            return 'list';
        }
    });

    const [isSubmittingFolder, setIsSubmittingFolder] = useState(false);

    // Bulk selection state
    const [selectedItems, setSelectedItems] = useState(new Set());
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);
    const [selectedAccess, setSelectedAccess] = useState({ key: '', loading: false, roles: {} });

    const navigate = useNavigate();
    const { addToast } = useToast();
    const fileInputRef = useRef(null);

    // Filter states
    const [fileTypes, setFileTypes] = useState([]);
    const [activeFileType, setActiveFileType] = useState(null);
    const [sortBy, setSortBy] = useState('updated_at');
    const [sortOrder, setSortOrder] = useState('desc');
    const [user, setUser] = useState(null);

    const [sharedUsers, setSharedUsers] = useState([]);
    const [ownerFilter, setOwnerFilter] = useState('');
    const [modifiedFilter, setModifiedFilter] = useState('');
    const [activityOpen, setActivityOpen] = useState(false);
    const [activityItems, setActivityItems] = useState([]);
    const [activityLoading, setActivityLoading] = useState(false);
    const [activityRefreshKey, setActivityRefreshKey] = useState(0);
    const [activityPage, setActivityPage] = useState(1);
    const [activityTotalPages, setActivityTotalPages] = useState(0);
    const [activityHasNext, setActivityHasNext] = useState(false);
    const [activityHasPrev, setActivityHasPrev] = useState(false);

    const refreshActivity = () => setActivityRefreshKey(prev => prev + 1);
    const canShowActivity = mode === 'my-drive' || mode === 'shared';
    const canViewAllActivity = Boolean(user?.can_view_full_drive_activity_effective);
    const activityScopeDescription = t(canViewAllActivity ? 'history.allActions' : 'history.ownActions');

    useEffect(() => {
        getMe().then(setUser).catch(err => console.error(err));
        getFileTypes()
            .then(types => {
                const excludedExtensions = new Set([
                    // Photo
                    'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'heic', 'heif', 'ico', 'psd', 'ai',
                    // Video
                    'mp4', 'avi', 'mkv', 'mov', 'webm', 'flv', 'wmv', '3gp', 'mpeg', 'mpg',
                    // Audio
                    'mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma',
                    // Archive
                    'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz',
                    'csv', 'json', 'xml'
                ]);
                const filtered = (types || []).filter(item => {
                    const typeKey = (item.type || '').toLowerCase();
                    return !excludedExtensions.has(typeKey);
                });
                setFileTypes(filtered);
            })
            .catch(err => console.error(err));
    }, []);

    useEffect(() => {
        if (mode === 'shared') {
            getSharedUsers().then(data => setSharedUsers(data || [])).catch(console.error);
        } else {
            setSharedUsers([]);
        }
        setOwnerFilter('');
    }, [mode]);

    useEffect(() => {
        setActivityOpen(false);
        setSelectedPreviewItem(null);
    }, [mode]);

    useEffect(() => {
        if (setCanCreate) {
            setCanCreate(canCreate);
        }
        return () => {
            if (setCanCreate) {
                setCanCreate(false);
            }
        };
    }, [canCreate, setCanCreate]);

    // Reset folder items selection when mode or folder changes
    useEffect(() => {
        setSelectedItems(new Set());
        setSelectedPreviewItem(null);
    }, [mode, currentFolderId]);

    useEffect(() => {
        const cacheKey = `${currentFolderId}-${mode}-${debouncedSearchQuery}-${activeFileType?.type || ''}-${sortBy}-${sortOrder}`;
        const cached = driveCache[cacheKey];
        if (cached) {
            setFiles(cached.files);
            setFolderPath(cached.folderPath);
            setLoading(false);
        } else {
            setLoading(true);
        }
        loadFiles(currentFolderId, debouncedSearchQuery);
        setSelectedItems(new Set());
    }, [currentFolderId, activeFileType, sortBy, sortOrder, mode, debouncedSearchQuery]);

    // Listen to sidebar create actions
    useEffect(() => {
        const handleSidebarCreate = (e) => {
            if (!canCreate) return;
            const actionType = e.detail;
            if (actionType === 'folder') {
                setIsCreatingFolder(true);
            } else if (actionType === 'upload') {
                handleUploadClick();
            } else {
                handleCreateFileClick(actionType);
            }
        };
        document.addEventListener('alem-drive-create', handleSidebarCreate);
        return () => document.removeEventListener('alem-drive-create', handleSidebarCreate);
    }, [currentFolderId, canCreate]);

    useEffect(() => {
        const refresh = () => {
            loadFiles(currentFolderId, debouncedSearchQuery);
            refreshSummary?.();
        };
        document.addEventListener('alem-drive-refresh', refresh);
        return () => document.removeEventListener('alem-drive-refresh', refresh);
    }, [currentFolderId, debouncedSearchQuery, activeFileType, sortBy, sortOrder, mode, refreshSummary]);

    const reqIdRef = useRef(0);
    const activityReqIdRef = useRef(0);

    const loadFiles = async (folderId, sQuery = '') => {
        const reqId = ++reqIdRef.current;
        try {
            setLoading(true);
            setError(null);

            // Keep write actions closed until this exact folder has loaded.
            setCanCreateState(false);
            let permission;
            if (folderId !== 'root' && mode !== 'trash') {
                try {
                    permission = await getMyPermission(folderId, 'folder');
                } catch (err) {
                    console.error('Failed to check folder permission', err);
                }
            }
            const allowed = canWriteFolder(mode, folderId, permission);

            const params = {
                sort_by: sortBy,
                sort_order: sortOrder,
                type: activeFileType ? activeFileType.type : undefined
            };

            let data;
            let pathData = [];
            if (sQuery && !['favorites', 'trash'].includes(mode)) {
                data = await searchDrive(sQuery, activeFileType ? activeFileType.type : undefined);
                pathData = [];
            } else if (folderId === 'root') {
                if (mode === 'shared') {
                    data = await listSharedItems(params);
                } else if (mode === 'all') {
                    data = await listAllItems(params);
                } else if (mode === 'recent') {
                    data = await listRecentFiles(10, 0, params);
                } else if (mode === 'favorites') {
                    data = await listFavoriteItems(params);
                } else if (mode === 'trash') {
                    data = await listTrashItems(params);
                } else {
                    data = await listOwnItems(params);
                }
            } else {
                data = await listFiles(folderId, params);
                try {
                    const folderMeta = await getFolder(folderId);
                    pathData = folderMeta.path || [];
                } catch (err) {
                    console.error("Failed to load folder path", err);
                }
            }

            if (reqId === reqIdRef.current) {
                const rawData = data ? (Array.isArray(data) ? data : data.files || []) : [];
                
                const flattenedData = rawData.map(item => {
                    if (item.id && (item.name || item.real_name)) return item;

                    const base = item.folder || item.file || item;
                    if (!base || typeof base !== 'object') return item;

                    return {
                        ...base,
                        type: item.type === 'folder' || item.type === 'dir' || base.mime_type === 'application/x-directory' ? 'dir' : 'file',
                        name: base.name || base.real_name || '',
                        last_accessed_at: item.last_accessed_at || base.last_accessed_at,
                        id: base.id || item.id
                    };
                });
                
                const direction = sortOrder === 'asc' ? 1 : -1;
                const sortedData = [...flattenedData].sort((left, right) => {
                    if (sortBy === 'name') {
                        return String(left.name || '').localeCompare(String(right.name || ''), 'ru', { sensitivity: 'base' }) * direction;
                    }
                    if (sortBy === 'size') {
                        return (Number(left.size || 0) - Number(right.size || 0)) * direction;
                    }
                    const leftDate = new Date(left[sortBy] || left.updated_at || left.created_at || 0).getTime();
                    const rightDate = new Date(right[sortBy] || right.updated_at || right.created_at || 0).getTime();
                    return ((Number.isFinite(leftDate) ? leftDate : 0) - (Number.isFinite(rightDate) ? rightDate : 0)) * direction;
                });

                setCanCreateState(allowed);
                setFiles(sortedData);
                setFolderPath(pathData);
                setSelectedPreviewItem((current) => current && sortedData.some((item) => item.id === current.id) ? current : null);
                
                // Save to cache
                const cacheKey = `${folderId}-${mode}-${sQuery}-${activeFileType?.type || ''}-${sortBy}-${sortOrder}`;
                driveCache[cacheKey] = { files: sortedData, folderPath: pathData };
            }
        } catch (err) {
            if (reqId === reqIdRef.current) {
                console.error("Failed to load files", err);
                setCanCreateState(false);
                setFiles([]);
                setFolderPath([]);
                delete driveCache[`${folderId}-${mode}-${sQuery}-${activeFileType?.type || ''}-${sortBy}-${sortOrder}`];
                setError(t('errors.loadFiles'));
            }
        } finally {
            if (reqId === reqIdRef.current) {
                setLoading(false);
            }
        }
    };

    const loadActivity = async (folderId, page = 1) => {
        if (!canShowActivity) {
            setActivityItems([]);
            setActivityLoading(false);
            setActivityPage(1);
            setActivityTotalPages(0);
            setActivityHasNext(false);
            setActivityHasPrev(false);
            return;
        }

        const reqId = ++activityReqIdRef.current;
        try {
            setActivityLoading(true);
            const data = await getDriveActivity({
                folderId: folderId === 'root' ? null : folderId,
                limit: DRIVE_ACTIVITY_PAGE_SIZE,
                offset: (Math.max(page, 1) - 1) * DRIVE_ACTIVITY_PAGE_SIZE
            });
            if (reqId === activityReqIdRef.current) {
                setActivityItems(Array.isArray(data?.items) ? data.items : []);
                setActivityPage(Number.isFinite(data?.page) ? data.page : 1);
                setActivityTotalPages(Number.isFinite(data?.total_pages) ? data.total_pages : 0);
                setActivityHasNext(Boolean(data?.has_next));
                setActivityHasPrev(Boolean(data?.has_prev));
            }
        } catch (err) {
            if (reqId === activityReqIdRef.current) {
                console.error('Failed to load drive activity', err);
                setActivityItems([]);
                setActivityPage(1);
                setActivityTotalPages(0);
                setActivityHasNext(false);
                setActivityHasPrev(false);
            }
        } finally {
            if (reqId === activityReqIdRef.current) {
                setActivityLoading(false);
            }
        }
    };

    useEffect(() => {
        if (activityOpen) {
            loadActivity(currentFolderId, activityPage);
        }
    }, [currentFolderId, mode, activityRefreshKey, activityOpen, activityPage, canShowActivity]);

    useEffect(() => {
        setActivityOpen(false);
        setActivityPage(1);
    }, [currentFolderId, mode]);

    const handleFileClick = async (file) => {
        const isImage = (file.mime_type && file.mime_type.startsWith('image/')) ||
            /\.(jpg|jpeg|png|gif|webp|avif|svg|heic|heif|bmp|tif|tiff|ico)$/i.test(file.name);
        const isPdf = (file.mime_type === 'application/pdf') || /\.pdf$/i.test(file.name);
        const isVideo = (file.mime_type && file.mime_type.startsWith('video/')) ||
            /\.(mp4|m4v|mov|webm|avi|mkv|3gp|mpeg|mpg|wmv|flv)$/i.test(file.name);
        const isAudio = (file.mime_type && file.mime_type.startsWith('audio/')) ||
            /\.(mp3|wav|ogg|m4a|flac|aac|wma|aiff|aif)$/i.test(file.name);

        const isArchive = /\.(zip|rar|7z|tar|gz|bz2|xz)$/i.test(file.name || '');

        if (isFolderItem(file)) {
            if (mode === 'trash') return;
            setSelectedItems(new Set());
            setSelectedPreviewItem(null);
            const prefix = {
                shared: '/drive/shared/f',
                all: '/drive/all/f',
                recent: '/drive/recent/f',
                favorites: '/drive/favorites/f',
            }[mode] || '/drive/f';
            navigate(`${prefix}/${file.id}`);
        } else if (isImage || isPdf || isVideo || isAudio) {
            setFileToPreview(file);
            setPreviewModalOpen(true);
        } else if (isArchive) {
            setFileToPreview(file);
            setArchiveModalOpen(true);
        } else {
            try {
                const permission = await getMyPermission(file.id, 'file');
                const editMode = permission?.role === 'editor' || permission?.role === 'owner' ? 'edit' : 'view';
                navigate(`/drive/editor/${file.id}`, { state: { file, mode: editMode, role: permission?.role } });
            } catch (error) {
                console.error("Failed to check permissions", error);
                navigate(`/drive/editor/${file.id}`, { state: { file, mode: 'view' } });
            }
        }
    };

    const handleGoBack = () => {
        navigate(-1);
    };

    const notifyDriveChanged = () => {
        refreshSummary?.();
        document.dispatchEvent(new CustomEvent('alem-drive-data-changed'));
    };

    const handleFavoriteToggle = async (item) => {
        const isFolder = item.type === 'dir' || item.mime_type === 'application/x-directory';
        const resourceType = isFolder ? 'folder' : 'file';
        try {
            if (mode === 'favorites') {
                await removeFavorite(item.id, resourceType);
                setFiles((current) => current.filter((entry) => entry.id !== item.id));
                if (selectedPreviewItem?.id === item.id) setSelectedPreviewItem(null);
                addToast(`«${item.name}» удален${isFolder ? 'а' : ''} из избранного`, 'success');
            } else {
                await addFavorite(item.id, resourceType);
                addToast(`«${item.name}» добавлен${isFolder ? 'а' : ''} в избранное`, 'success');
            }
            notifyDriveChanged();
        } catch (err) {
            console.error('Favorite update failed', err);
            addToast(err?.response?.data?.user_message || t('errors.favorite'), 'error');
        }
    };

    const handleRestoreItem = async (item) => {
        const isFolder = item.type === 'dir' || item.mime_type === 'application/x-directory';
        try {
            await restoreTrashItem(item.id, isFolder ? 'folder' : 'file');
            setFiles((current) => current.filter((entry) => entry.id !== item.id));
            if (selectedPreviewItem?.id === item.id) setSelectedPreviewItem(null);
            addToast(`${isFolder ? 'Папка' : 'Файл'} «${item.name}» восстановлен${isFolder ? 'а' : ''}`, 'success');
            notifyDriveChanged();
            document.dispatchEvent(new CustomEvent('alem-drive-folders-updated'));
        } catch (err) {
            console.error('Restore failed', err);
            addToast(err?.response?.data?.user_message || t('errors.restore'), 'error');
        }
    };

    const handleToggleSelection = (id) => {
        setSelectedPreviewItem(null);
        setSelectedItems(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const confirmBulkDelete = async () => {
        if (selectedItems.size === 0) return;
        setFileToDelete({
            id: 'bulk',
            name: `${selectedItems.size} элементов`,
            isBulk: true,
            count: selectedItems.size
        });
        setDeleteModalOpen(true);
    };

    const handleCreateFolder = async (e) => {
        e.preventDefault();
        if (!canCreate || !newFolderName.trim() || isSubmittingFolder) return;
        try {
            setIsSubmittingFolder(true);
            await createFolder(newFolderName, currentFolderId);
            setNewFolderName('');
            setIsCreatingFolder(false);
            loadFiles(currentFolderId);
            refreshActivity();
            notifyDriveChanged();
            document.dispatchEvent(new CustomEvent('alem-drive-folders-updated'));
        } catch (err) {
            console.error("Failed to create folder", err);
            addToast(t('errors.createFolder'), 'error');
        } finally {
            setIsSubmittingFolder(false);
        }
    };

    const handleShareClick = (file) => {
        setFileToShare(file);
        setShareModalOpen(true);
    };

    const handleCopyClick = (item) => {
        setClipboard([{
            id: item.id,
            type: isFolderItem(item) ? 'folder' : 'file',
            name: item.name
        }]);
        addToast('Элемент скопирован в буфер обмена', 'success');
    };

    const handleBulkCopy = () => {
        if (selectedItems.size === 0) return;
        const itemsToCopy = [];
        selectedItems.forEach(id => {
            const item = files.find(f => f.id === id);
            if (item) {
                itemsToCopy.push({
                    id: item.id,
                    type: isFolderItem(item) ? 'folder' : 'file',
                    name: item.name
                });
            }
        });
        setClipboard(itemsToCopy);
        setSelectedItems(new Set()); // Clear selection after copy
        addToast(`Выбрано элементов для копирования: ${itemsToCopy.length}`, 'success');
    };

    const handlePaste = async () => {
        if (!canCreate) return;
        if (!clipboard || clipboard.length === 0) return;
        const uniqueClipboardItems = Array.from(
            new Map(clipboard.filter((item) => item?.id && ['file', 'folder'].includes(item.type)).map((item) => [String(item.id), item])).values()
        );
        if (!uniqueClipboardItems.length) {
            addToast('В буфере нет корректных элементов для копирования', 'error');
            setClipboard(null);
            return;
        }

        addToast(`Копирование ${uniqueClipboardItems.length} элементов...`, 'info');
        const results = await Promise.allSettled(uniqueClipboardItems.map((item) => {
            if (item.type === 'folder' && String(item.id) === String(currentFolderId)) {
                return Promise.reject(new Error('Нельзя скопировать папку внутрь самой себя'));
            }
            return copyItem(item.id, item.type, currentFolderId);
        }));
        const succeededCount = results.filter((result) => result.status === 'fulfilled').length;
        const failedItems = uniqueClipboardItems.filter((_, index) => results[index].status === 'rejected');
        const firstError = results.find((result) => result.status === 'rejected')?.reason;

        if (failedItems.length) {
            setClipboard(failedItems);
            const errorMessage = firstError?.response?.data?.user_message || firstError?.response?.data?.message || firstError?.message;
            addToast(`${succeededCount} скопировано, ${failedItems.length} не удалось${errorMessage ? `: ${errorMessage}` : ''}`, succeededCount ? 'info' : 'error');
        } else {
            setClipboard(null);
            addToast(`${succeededCount} ${pluralize(succeededCount, ['элемент скопирован', 'элемента скопировано', 'элементов скопировано'])}`, 'success');
        }

        if (succeededCount) {
            await loadFiles(currentFolderId);
            refreshActivity();
            notifyDriveChanged();
            document.dispatchEvent(new CustomEvent('alem-drive-folders-updated'));
        }
    };

    const handleCreateFileClick = (type) => {
        if (!canCreate) return;
        setFileTypeToCreate(type);
        setCreateFileModalOpen(true);
    };

    const handleCreateFileConfirm = async (name) => {
        if (!canCreate) return;
        try {
            const type = fileTypeToCreate;
            let blob;
            let extension;
            let mimeType;

            switch (type) {
                case 'txt':
                    blob = generateTxt();
                    extension = 'txt';
                    mimeType = 'text/plain';
                    break;
                case 'docx':
                    blob = await generateDocx();
                    extension = 'docx';
                    mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                    break;
                case 'xlsx':
                    blob = await generateXlsx();
                    extension = 'xlsx';
                    mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                    break;
                case 'pptx':
                    blob = await generatePptx();
                    extension = 'pptx';
                    mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
                    break;
                default:
                    return;
            }

            const fileName = name.endsWith(`.${extension}`) ? name : `${name}.${extension}`;
            const file = new File([blob], fileName, { type: mimeType });

            const newFile = await uploadFile(file, currentFolderId);
            addToast(t('success.created', { name: fileName }), 'success');

            setFiles(prev => [newFile, ...prev]);
            loadFiles(currentFolderId);
            refreshActivity();
            notifyDriveChanged();
        } catch (err) {
            console.error("File creation failed", err);
            addToast(t('errors.createFile'), 'error');
        } finally {
            setCreateFileModalOpen(false);
        }
    };

    const handleDeleteClick = (file) => {
        setFileToDelete(file);
        setDeleteModalOpen(true);
    };

    const handleRenameClick = (file) => {
        setFileToRename(file);
        setRenameModalOpen(true);
    };

    const handleMoveClick = (fileOrItems) => {
        const items = Array.isArray(fileOrItems) ? fileOrItems : [fileOrItems];
        setFileToMove(items.filter(Boolean));
        setMoveModalOpen(true);
    };

    const handleExportFolderAccessReport = async (folder) => {
        try {
            await exportFolderAccessReport(folder.id);
            addToast(`Отчет по доступам для папки "${folder.name}" выгружен`, 'success');
        } catch (err) {
            console.error("Folder access report export failed", err);
            addToast(
                err?.response?.data?.user_message ||
                err?.response?.data?.message ||
                `Не удалось выгрузить отчет по папке "${folder.name}"`,
                'error'
            );
        }
    };

    const confirmRename = async (newName) => {
        if (!fileToRename || !newName.trim()) return;
        try {
            const isFolder = fileToRename.type === 'dir' || fileToRename.mime_type === 'application/x-directory';
            if (isFolder) {
                await updateFolder(fileToRename.id, newName.trim());
            } else {
                await updateFile(fileToRename.id, newName.trim());
            }
            addToast(`${isFolder ? 'Папка' : 'Файл'} переименован`, 'success');
            setFiles(prev => prev.map(f =>
                f.id === fileToRename.id ? { ...f, name: newName.trim() } : f
            ));
            refreshActivity();
            if (isFolder) {
                document.dispatchEvent(new CustomEvent('alem-drive-folders-updated'));
            }
        } catch (err) {
            console.error("Rename failed", err);
            addToast("Не удалось переименовать: " + (err.response?.data?.message || err.message), 'error');
        } finally {
            setFileToRename(null);
        }
    };

    const confirmMoveItem = async (targetParentId, itemsFromModal = fileToMove) => {
        const uniqueItems = Array.from(new Map((itemsFromModal || []).filter((item) => item?.id).map((item) => [String(item.id), item])).values());
        if (!uniqueItems.length) return;

        const itemsToMove = uniqueItems.filter((item) => {
            if (String(targetParentId) === String(item.id) && isFolderItem(item)) return false;
            const currentParentId = (isFolderItem(item) ? item.parent_id : item.folder_id) || 'root';
            return String(currentParentId) !== String(targetParentId || 'root');
        });
        const skippedCount = uniqueItems.length - itemsToMove.length;
        if (!itemsToMove.length) {
            addToast(`Перемещать нечего: ${skippedCount} элементов уже находятся в папке назначения или выбрана исходная папка`, 'info');
            setMoveModalOpen(false);
            setFileToMove(null);
            return;
        }

        setIsMovingItem(true);
        const results = await Promise.allSettled(itemsToMove.map((item) =>
            moveItem(item.id, isFolderItem(item) ? 'folder' : 'file', targetParentId)
        ));
        const movedItems = itemsToMove.filter((_, index) => results[index].status === 'fulfilled');
        const failedItems = itemsToMove.filter((_, index) => results[index].status === 'rejected');
        const firstError = results.find((result) => result.status === 'rejected')?.reason;

        if (movedItems.length) {
            const movedIds = new Set(movedItems.map((item) => String(item.id)));
            setSelectedItems((previous) => new Set(Array.from(previous).filter((id) => !movedIds.has(String(id)))));
            await loadFiles(currentFolderId);
            refreshActivity();
            notifyDriveChanged();
            document.dispatchEvent(new CustomEvent('alem-drive-folders-updated'));
        }

        if (failedItems.length) {
            const errorMessage = firstError?.response?.data?.user_message || firstError?.response?.data?.message || firstError?.message;
            addToast(`${movedItems.length} перемещено, ${failedItems.length} не удалось${skippedCount ? `, ${skippedCount} пропущено` : ''}${errorMessage ? `: ${errorMessage}` : ''}`, movedItems.length ? 'info' : 'error');
        } else {
            addToast(`${movedItems.length} перемещено${skippedCount ? `, ${skippedCount} пропущено` : ''}`, 'success');
        }

        setMoveModalOpen(false);
        setFileToMove(null);
        setIsMovingItem(false);
    };

    const confirmDeleteFile = async () => {
        if (!fileToDelete) return;

        if (fileToDelete.isBulk) {
            try {
                setIsBulkDeleting(true);
                addToast(`Удаление ${selectedItems.size} элементов...`, 'info');

                const selectedIds = Array.from(selectedItems);
                const deletePromises = selectedIds.map(id => {
                    const file = files.find(f => f.id === id);
                    const isFolder = file && (file.type === 'dir' || file.mime_type === 'application/x-directory');
                    return isFolder ? deleteFolder(id) : deleteFile(id);
                });
                const results = await Promise.allSettled(deletePromises);
                const rejected = results.filter(result => result.status === 'rejected');
                const fulfilledResults = results
                    .filter(result => result.status === 'fulfilled')
                    .map(result => result.value);
                const deletedCount = fulfilledResults.filter(result => result?.status === 'deleted').length;
                const pendingCount = fulfilledResults.filter(result => result?.status === 'pending_approval').length;

                if (deletedCount > 0 || pendingCount > 0) {
                    const summaryParts = [];
                    if (deletedCount > 0) {
                        summaryParts.push(`Удалено: ${deletedCount}`);
                    }
                    if (pendingCount > 0) {
                        summaryParts.push(`На согласовании: ${pendingCount}`);
                    }

                    addToast(
                        rejected.length > 0
                            ? `${summaryParts.join(', ')}. Часть элементов не удалось обработать.`
                            : summaryParts.join(', '),
                        rejected.length > 0 || pendingCount > 0 ? 'info' : 'success'
                    );
                    setFiles(prev => prev.filter((f) => {
                        const index = selectedIds.indexOf(f.id);
                        if (index === -1) {
                            return true;
                        }
                        const result = results[index];
                        return result?.status !== 'fulfilled' || result.value?.status !== 'deleted';
                    }));
                    if (deletedCount > 0) {
                        document.dispatchEvent(new CustomEvent('alem-drive-folders-updated'));
                    }
                }

                if (rejected.length > 0) {
                    const firstError = rejected[0]?.reason;
                    addToast(
                        firstError?.response?.data?.user_message ||
                        firstError?.response?.data?.message ||
                        'Часть элементов не удалось удалить',
                        'error'
                    );
                }

                setSelectedItems(new Set());
                if (deletedCount > 0 || pendingCount > 0) {
                    refreshActivity();
                }
            } catch (err) {
                console.error("Bulk delete failed", err);
                addToast(
                    err?.response?.data?.user_message ||
                    err?.response?.data?.message ||
                    "Ошибка при массовом удалении",
                    'error'
                );
            } finally {
                setIsBulkDeleting(false);
                loadFiles(currentFolderId);
                refreshActivity();
                notifyDriveChanged();
            }
        } else {
            try {
                const isFolder = fileToDelete.type === 'dir' || fileToDelete.mime_type === 'application/x-directory';
                const result = isFolder
                    ? await deleteFolder(fileToDelete.id)
                    : await deleteFile(fileToDelete.id);

                if (result?.status === 'pending_approval') {
                    addToast(getDeleteResultMessage(result, fileToDelete.name, isFolder), 'info');
                    refreshActivity();
                } else {
                    addToast(getDeleteResultMessage(result, fileToDelete.name, isFolder), 'success');
                    setFiles(prev => prev.filter(f => f.id !== fileToDelete.id));
                    refreshActivity();
                    notifyDriveChanged();
                    if (isFolder) {
                        document.dispatchEvent(new CustomEvent('alem-drive-folders-updated'));
                    }
                }
            } catch (err) {
                console.error("Delete failed", err, err.response?.data);
                addToast(
                    err?.response?.data?.user_message ||
                    err?.response?.data?.message ||
                    "Не удалось удалить элемент",
                    'error'
                );
            }
        }
    };

    const handleUploadClick = () => {
        if (!canCreate) return;
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e) => {
        if (!canCreate) { e.target.value = ''; return; }
        const file = e.target.files[0];
        if (!file) return;

        const extension = file.name.split('.').pop()?.toLowerCase() || '';
        const isAllowedExtension = ALLOWED_UPLOAD_EXTENSIONS.includes(extension);
        const isAllowedMime = ALLOWED_UPLOAD_MIME_TYPES.has(file.type);
        if (!isAllowedExtension && !isAllowedMime) {
            addToast('Разрешены только файлы: docx, xlsx, pdf, pptx, txt, zip, rar, mp3, wav, ogg, m4a, flac, mp4, mov, avi, mkv', 'error');
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        // Validate category size limit
        const isAudio = ['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(extension) || file.type.startsWith('audio/');
        const isVideo = ['mp4', 'mov', 'avi', 'mkv'].includes(extension) || file.type.startsWith('video/');
        const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension) || file.type.startsWith('image/');
        const isDocument = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt'].includes(extension) || file.type.includes('document') || file.type.includes('sheet') || file.type.includes('presentation') || file.type.includes('text');

        let maxSize = 500 * 1024 * 1024; // Default: 500MB (Generic & Audio)
        let limitName = '500 МБ';

        if (isVideo) {
            maxSize = 1024 * 1024 * 1024; // 1GB
            limitName = '1 ГБ';
        } else if (isImage) {
            maxSize = 50 * 1024 * 1024; // 50MB
            limitName = '50 МБ';
        } else if (isDocument) {
            maxSize = 100 * 1024 * 1024; // 100MB
            limitName = '100 МБ';
        }

        if (file.size > maxSize) {
            addToast(`Файл слишком большой. Максимальный размер для этого типа файлов: ${limitName}`, 'error');
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        try {
            setUploadProgress(0);
            setUploadingFileName(file.name);
            await uploadFile(file, currentFolderId, (percent) => {
                setUploadProgress(percent);
            });
            addToast(`Файл "${file.name}" успешно загружен`, 'success');
            loadFiles(currentFolderId);
            notifyDriveChanged();
        } catch (err) {
            console.error("Upload failed", err);
            addToast(getUploadErrorMessage(err, file.name), 'error');
        } finally {
            setUploadProgress(null);
            setUploadingFileName(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleMultipleFileChange = async (e) => {
        if (!canCreate) { e.target.value = ''; return; }
        const selectedFiles = Array.from(e.target.files || []);
        if (selectedFiles.length === 0) return;

        const invalidTypeFiles = [];
        const oversizedFiles = [];
        const filesToUpload = [];

        for (const file of selectedFiles) {
            const extension = file.name.split('.').pop()?.toLowerCase() || '';
            const isAllowedExtension = ALLOWED_UPLOAD_EXTENSIONS.includes(extension);
            const isAllowedMime = ALLOWED_UPLOAD_MIME_TYPES.has(file.type);

            if (!isAllowedExtension && !isAllowedMime) {
                invalidTypeFiles.push(file.name);
                continue;
            }

            const isAudio = ['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(extension) || file.type.startsWith('audio/');
            const isVideo = ['mp4', 'mov', 'avi', 'mkv'].includes(extension) || file.type.startsWith('video/');
            const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension) || file.type.startsWith('image/');
            const isDocument = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt'].includes(extension) || file.type.includes('document') || file.type.includes('sheet') || file.type.includes('presentation') || file.type.includes('text');

            let maxSize = 500 * 1024 * 1024;
            let limitName = '500 МБ';

            if (isVideo) {
                maxSize = 1024 * 1024 * 1024;
                limitName = '1 ГБ';
            } else if (isImage) {
                maxSize = 50 * 1024 * 1024;
                limitName = '50 МБ';
            } else if (isDocument) {
                maxSize = 100 * 1024 * 1024;
                limitName = '100 МБ';
            }

            if (file.size > maxSize) {
                oversizedFiles.push(`${file.name} (${limitName})`);
                continue;
            }

            filesToUpload.push(file);
        }

        if (invalidTypeFiles.length > 0) {
            addToast(`Неподдерживаемый формат: ${invalidTypeFiles.join(', ')}`, 'error');
        }

        if (oversizedFiles.length > 0) {
            addToast(`Превышен лимит размера: ${oversizedFiles.join(', ')}`, 'error');
        }

        if (filesToUpload.length === 0) {
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
            return;
        }

        let uploadedCount = 0;

        try {
            for (const file of filesToUpload) {
                try {
                    setUploadProgress(0);
                    setUploadingFileName(file.name);
                    await uploadFile(file, currentFolderId, (percent) => {
                        setUploadProgress(percent);
                    });
                    uploadedCount += 1;
                } catch (err) {
                    console.error("Upload failed", err);
                    addToast(getUploadErrorMessage(err, file.name), 'error');
                }
            }

            if (uploadedCount === 1) {
                addToast(`Файл "${filesToUpload[0].name}" успешно загружен`, 'success');
            } else if (uploadedCount > 1) {
                addToast(`Загружено файлов: ${uploadedCount}`, 'success');
            }

            if (uploadedCount > 0) {
                loadFiles(currentFolderId);
                notifyDriveChanged();
            }
        } finally {
            setUploadProgress(null);
            setUploadingFileName(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const toggleViewMode = (modeVal) => {
        setViewMode(modeVal);
        try {
            localStorage.setItem('alem_drive_view_mode', modeVal);
        } catch {}
    };

    const handleRowClick = (item, event) => {
        // Opening a file can await a permission request. Ignore the second
        // click of a double-click while that first open is still pending.
        if (event?.detail > 1) return;
        if (event?.metaKey || event?.ctrlKey) {
            handleToggleSelection(item.id);
            return;
        }
        setSelectedPreviewItem(null);
        if (mode === 'trash') {
            setSelectedItems(new Set([item.id]));
            return;
        }
        setSelectedItems(new Set());
        void handleFileClick(item);
    };

    const handleDownload = async (item) => {
        try {
            await downloadFile(item.id, item.name);
            refreshActivity();
        } catch (err) {
            console.error('Download failed', err);
            addToast(`Не удалось скачать «${item.name}». Повторите попытку`, 'error');
        }
    };

    const handleSortColumn = (column) => {
        if (sortBy === column) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(column);
            setSortOrder(column === 'name' ? 'asc' : 'desc');
        }
    };

    const clearSelection = () => {
        setSelectedItems(new Set());
        setSelectedPreviewItem(null);
    };

    const resetFilters = () => {
        setActiveFileType(null);
        setOwnerFilter('');
        setModifiedFilter('');
    };

    const filteredFiles = files.filter(file => {
        const isFolder = isFolderItem(file);

        // Search API is authoritative for normal Drive views and can match tags as well as names.
        // Favorites and trash use their own endpoints, so filter those locally by both fields.
        const localSearchQuery = searchQuery.trim().toLocaleLowerCase();
        if (localSearchQuery && ['favorites', 'trash'].includes(mode)) {
            const rawTags = file.tags ?? file.tag_names ?? file.labels ?? file.tag ?? file.metadata?.tags ?? file.metadata?.labels ?? [];
            const tags = Array.isArray(rawTags) ? rawTags : [rawTags];
            const searchText = [file.name, ...tags.map((tag) => typeof tag === 'string' ? tag : tag?.name || tag?.tag || '')]
                .filter(Boolean)
                .join(' ')
                .toLocaleLowerCase();
            if (!searchText.includes(localSearchQuery)) return false;
        }

        if (ownerFilter === 'me' && file.owner_id !== user?.id) return false;
        if (ownerFilter === 'others' && file.owner_id === user?.id) return false;
        if (ownerFilter.startsWith('u:') && String(file.owner_id) !== ownerFilter.slice(2)) return false;

        if (!matchesModifiedFilter(file, modifiedFilter)) return false;

        if (activeFileType) {
            if (activeFileType.type === 'folder' && !isFolder) return false;
            if (activeFileType.type !== 'folder' && isFolder) return false;

            const ext = file.name.split('.').pop()?.toLowerCase();
            if (activeFileType.type === 'docx' && ext !== 'docx' && ext !== 'doc') return false;
            if (activeFileType.type === 'xlsx' && ext !== 'xlsx' && ext !== 'xls') return false;
            if (activeFileType.type === 'pptx' && ext !== 'pptx') return false;
            if (activeFileType.type === 'pdf' && ext !== 'pdf') return false;
            if (activeFileType.type === 'txt' && ext !== 'txt') return false;
        }

        return true;
    });

    // Folders always come first, like in the file manager.
    const foldersList = filteredFiles.filter(isFolderItem);
    const filesList = filteredFiles.filter((file) => !isFolderItem(file));
    const orderedItems = [...foldersList, ...filesList];
    const selectedList = files.filter((file) => selectedItems.has(file.id));
    const selectedSingle = selectedList.length === 1 ? selectedList[0] : null;
    const selectedAccessKey = selectedList.map((item) => String(item.id)).sort().join('|');
    useEffect(() => {
        if (!selectedList.length) {
            setSelectedAccess({ key: '', loading: false, roles: {} });
            return;
        }

        let cancelled = false;
        setSelectedAccess({ key: selectedAccessKey, loading: true, roles: {} });
        Promise.all(selectedList.map(async (item) => {
            if (item.owner_id != null && user?.id != null && String(item.owner_id) === String(user.id)) {
                return [String(item.id), 'owner'];
            }
            try {
                const permission = await getMyPermission(item.id, isFolderItem(item) ? 'folder' : 'file');
                return [String(item.id), permission?.role || 'viewer'];
            } catch (error) {
                console.error('Failed to check selected item permission', error);
                return [String(item.id), 'viewer'];
            }
        })).then((entries) => {
            if (!cancelled) setSelectedAccess({ key: selectedAccessKey, loading: false, roles: Object.fromEntries(entries) });
        });

        return () => { cancelled = true; };
    }, [selectedAccessKey, user?.id]);
    const selectionPermissionsReady = selectedAccess.key === selectedAccessKey && !selectedAccess.loading;
    const canEditSelection = selectionPermissionsReady && selectedList.every((item) => ['editor', 'owner'].includes(selectedAccess.roles[String(item.id)]));
    const canManageSelectedSingle = selectedSingle && selectionPermissionsReady && selectedAccess.roles[String(selectedSingle.id)] === 'owner';
    const selectedFilesOnly = selectedList.filter((file) => !isFolderItem(file));
    const allVisibleSelected = orderedItems.length > 0 && orderedItems.every((file) => selectedItems.has(file.id));
    const someVisibleSelected = orderedItems.some((file) => selectedItems.has(file.id));
    const hasActiveFilters = Boolean(activeFileType || ownerFilter || modifiedFilter);
    const trashMode = mode === 'trash';

    const modeMeta = {
        'my-drive': { title: t('nav.myDrive'), path: '/drive' },
        all: { title: t('nav.all'), path: '/drive/all' },
        shared: { title: t('nav.shared'), path: '/drive/shared' },
        recent: { title: t('nav.recent'), path: '/drive/recent' },
        favorites: { title: t('nav.favorites'), path: '/drive/favorites' },
        trash: { title: t('nav.trash'), path: '/drive/trash' },
    }[mode] || { title: t('nav.myDrive'), path: '/drive' };

    const inFolder = currentFolderId !== 'root' && folderPath.length > 0;
    const pageTitle = inFolder ? folderPath[folderPath.length - 1].name : modeMeta.title;
    const folderPrefix = mode === 'my-drive' ? '/drive/f' : `${modeMeta.path}/f`;

    const countSummary = filesList.length && foldersList.length
        ? t('summary.join', { files: t('count.files', { count: filesList.length }), folders: t('count.folders', { count: foldersList.length }) })
        : filesList.length ? t('count.files', { count: filesList.length })
            : foldersList.length ? t('count.folders', { count: foldersList.length }) : t('empty.items');

    const typeOptions = [{ value: '', label: t('filters.allTypes') }, ...fileTypes.map((item) => ({ value: item.type, label: i18n.exists(`drive:fileTypes.${item.type}`) ? t(`fileTypes.${item.type}`) : item.label }))];
    const ownerOptions = [
        { value: '', label: t('filters.allOwners') },
        { value: 'me', label: t('filters.me') },
        { value: 'others', label: t('filters.others') },
        ...sharedUsers.map((entry) => ({ value: `u:${entry.id}`, label: entry.full_name || entry.username })),
    ];

    const itemActions = trashMode
        ? { restore: handleRestoreItem }
        : {
            open: handleFileClick,
            details: (item) => setSelectedPreviewItem(item),
            download: handleDownload,
            favorite: handleFavoriteToggle,
            copy: handleCopyClick,
            share: handleShareClick,
            rename: handleRenameClick,
            move: handleMoveClick,
            delete: handleDeleteClick,
            accessReport: handleExportFolderAccessReport,
        };

    const itemProps = (item) => ({
        selected: selectedItems.has(item.id),
        active: selectedPreviewItem?.id === item.id,
        onRowClick: handleRowClick,
        onToggleSelect: handleToggleSelection,
        user,
        canCreate,
        currentFolderId,
        actions: itemActions,
        isFavorite: mode === 'favorites',
        trashMode,
    });

    const renderSortableHeader = (column, label, className) => (
        <th scope="col" aria-sort={sortBy === column ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'} className={clsx('px-4 font-normal', className)}>
            <button type="button" onClick={() => handleSortColumn(column)} className={clsx('inline-flex h-8 items-center gap-1.5 rounded-[4px] hover:text-[#17202E]', sortBy === column && 'text-[#17202E]', FOCUS_RING)}>
                {label}
                {sortBy === column
                    ? (sortOrder === 'asc' ? <ArrowUp className="h-4 w-4 text-[#2458D3]" strokeWidth={2} /> : <ArrowDown className="h-4 w-4 text-[#2458D3]" strokeWidth={2} />)
                    : null}
            </button>
        </th>
    );

    const emptyTitle = {
        shared: t('empty.shared'),
        recent: t('empty.recent'),
        favorites: t('empty.favorites'),
        trash: t('empty.trash'),
        all: t('empty.all'),
    }[mode] || t('empty.folder');

    const emptyText = trashMode
        ? t('empty.trashHint')
        : mode === 'favorites'
            ? t('empty.favoritesHint')
            : canCreate
                ? t('empty.createHint')
                : t('empty.accessHint');

    return (
        <div className="relative flex min-h-0 min-w-0 flex-1 select-none font-[Inter,sans-serif] text-[#17202E] antialiased">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="@container flex min-h-0 flex-1 flex-col px-4 pt-6 sm:px-6 xl:px-8">
                    {/* Page header */}
                    <div className="ts-page-header flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                            {inFolder ? (
                                <nav aria-label={t('folder.path')} className="mb-1 flex min-w-0 flex-wrap items-center gap-1 text-[14px] text-[#586174]">
                                    <button type="button" onClick={() => navigate(modeMeta.path)} className={clsx('rounded-[4px] hover:text-[#2458D3]', FOCUS_RING)}>{modeMeta.title}</button>
                                    {folderPath.slice(0, -1).map((entry) => (
                                        <React.Fragment key={entry.id}>
                                            <ChevronRight className="h-4 w-4 shrink-0 text-[#7B8494]" strokeWidth={1.75} />
                                            <button type="button" onClick={() => navigate(`${folderPrefix}/${entry.id}`)} className={clsx('max-w-[200px] truncate rounded-[4px] hover:text-[#2458D3]', FOCUS_RING)}>{entry.name}</button>
                                        </React.Fragment>
                                    ))}
                                </nav>
                            ) : null}
                            <h1 className="ts-page-title truncate">{pageTitle}</h1>
                            <p className="mt-1 text-[14px] leading-5 text-[#586174]">{loading && files.length === 0 ? t('status.loading') : countSummary}</p>
                        </div>

                        <div className="ts-page-header__actions">
                            {canShowActivity ? (
                                <button type="button" onClick={() => { setActivityPage(1); setActivityOpen(true); }} className={clsx(BUTTON_SECONDARY, 'h-9 px-3')}>
                                    <History className="h-4 w-4" strokeWidth={1.75} />
                                    {t('actions.history')}
                                </button>
                            ) : null}
                            {canCreate ? (
                                <button type="button" onClick={handleUploadClick} className={clsx(BUTTON_SECONDARY_ACCENT, 'h-9 px-4')}>
                                    <Upload className="h-5 w-5 text-[#2458D3]" strokeWidth={1.75} />
                                    {t('common:actions.upload')}
                                </button>
                            ) : null}
                            <div role="group" aria-label={t('view.label')} className="flex h-9 overflow-hidden rounded-[6px] border border-[#E2E5EA] bg-white">
                                {[
                                    { value: 'list', icon: List, label: t('view.list') },
                                    { value: 'grid', icon: LayoutGrid, label: t('view.grid') },
                                ].map(({ value, icon: Icon, label }) => (
                                    <button
                                        key={value}
                                        type="button"
                                        aria-label={label}
                                        aria-pressed={viewMode === value}
                                        onClick={() => toggleViewMode(value)}
                                        className={clsx(
                                            'inline-flex w-9 items-center justify-center transition-colors duration-[120ms]',
                                            viewMode === value ? 'bg-[#2458D3] text-white' : 'text-[#586174] hover:bg-[#F6F7F9] hover:text-[#17202E]',
                                            FOCUS_RING,
                                        )}
                                    >
                                        <Icon className="h-5 w-5" strokeWidth={1.75} />
                                    </button>
                                ))}
                            </div>
                            <MenuButton icon={MoreHorizontal} ariaLabel={t('common:actions.more')} className={clsx(ICON_BUTTON, 'h-9 w-9 border border-[#E2E5EA] bg-white')}>
                                {(close) => (
                                    <>
                                        {canCreate ? <MenuItem icon={FolderPlus} label={t('actions.newFolder')} onClick={() => { close(); setIsCreatingFolder(true); }} /> : null}
                                        {canCreate && clipboard?.length ? <MenuItem icon={ClipboardPaste} label={t('actions.paste')} onClick={() => { close(); handlePaste(); }} /> : null}
                                        {orderedItems.length ? (
                                            <MenuItem icon={SquareCheck} label={allVisibleSelected ? t('actions.deselect') : t('actions.selectAll')} onClick={() => { close(); allVisibleSelected ? clearSelection() : setSelectedItems(new Set(orderedItems.map((item) => item.id))); }} />
                                        ) : null}
                                    </>
                                )}
                            </MenuButton>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <FilterChip
                            label={t('filters.type')}
                            value={activeFileType?.type || ''}
                            options={typeOptions}
                            onChange={(type) => setActiveFileType(fileTypes.find((item) => item.type === type) || null)}
                        />
                        <FilterChip label={t('columns.owner')} value={ownerFilter} options={ownerOptions} onChange={setOwnerFilter} />
                        <FilterChip label={t('columns.modified')} value={modifiedFilter} options={MODIFIED_FILTERS.map((option) => ({ ...option, label: t(option.label) }))} onChange={setModifiedFilter} />
                        {hasActiveFilters ? (
                            <button type="button" onClick={resetFilters} className={clsx('ml-1 h-9 rounded-[6px] px-2 text-[14px] font-medium text-[#2458D3] hover:text-[#1D49B3]', FOCUS_RING)}>
                                {t('actions.reset')}
                            </button>
                        ) : null}
                        {searchQuery ? (
                            <span className="ml-1 text-[14px] text-[#586174]">{t('filters.results', { query: searchQuery })}</span>
                        ) : null}
                    </div>

                    {/* Clipboard */}
                    {clipboard?.length && canCreate && selectedItems.size === 0 ? (
                        <div className="mt-4 flex h-12 items-center gap-3 rounded-[8px] border border-[#E2E5EA] bg-white px-3">
                            <Copy className="h-5 w-5 shrink-0 text-[#586174]" strokeWidth={1.75} />
                            <span className="min-w-0 flex-1 truncate text-[14px] text-[#17202E]">
                                {t('clipboard.label', { name: clipboard.length === 1 ? clipboard[0].name : t('count.items', { count: clipboard.length }) })}
                            </span>
                            <button type="button" onClick={handlePaste} className={clsx(BUTTON_PRIMARY, 'h-9 px-3')}>{t('actions.pasteHere')}</button>
                            <button type="button" onClick={() => setClipboard(null)} aria-label={t('actions.clearClipboard')} className={clsx(ICON_BUTTON, 'h-9 w-9')}>
                                <X className="h-5 w-5" strokeWidth={1.75} />
                            </button>
                        </div>
                    ) : null}

                    {/* New folder */}
                    {canCreate && isCreatingFolder ? (
                        <form onSubmit={handleCreateFolder} className="mt-4 flex items-center gap-2 rounded-[8px] border border-[#E2E5EA] bg-white p-2 pl-3">
                            <FolderPlus className="h-5 w-5 shrink-0 text-[#586174]" strokeWidth={1.75} />
                            <label htmlFor="drive-new-folder" className="sr-only">{t('folder.name')}</label>
                            <input
                                id="drive-new-folder"
                                autoFocus
                                type="text"
                                value={newFolderName}
                                onChange={(e) => setNewFolderName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Escape') { setIsCreatingFolder(false); setNewFolderName(''); } }}
                                placeholder={t('folder.name')}
                                disabled={isSubmittingFolder}
                                className="h-9 min-w-0 flex-1 rounded-[6px] border border-[#7B8494] px-3 text-[14px] text-[#17202E] placeholder:text-[#586174] focus:border-[#2458D3] focus:outline-2 focus:outline-offset-2 focus:outline-[#2458D3]"
                            />
                            <button type="submit" disabled={isSubmittingFolder || !newFolderName.trim()} className={clsx(BUTTON_PRIMARY, 'h-9 min-w-[112px] px-3')}>
                                {isSubmittingFolder ? <><Loader2 className="h-4 w-4 animate-spin" /> {t('folder.creating')}</> : t('common:actions.create')}
                            </button>
                            <button type="button" onClick={() => { setIsCreatingFolder(false); setNewFolderName(''); }} className={clsx(BUTTON_SECONDARY, 'h-9 px-3')}>{t('common:actions.cancel')}</button>
                        </form>
                    ) : null}

                    {/* Bulk actions */}
                    {selectedList.length > 0 ? (
                        <div className="mt-4 flex min-h-11 items-center gap-1 rounded-[8px] bg-[#EDF2FF] px-2 py-1">
                            <button type="button" onClick={clearSelection} aria-label={t('actions.deselect')} className={clsx(ICON_BUTTON, 'h-9 w-9 text-[#2458D3] hover:bg-white hover:text-[#1D49B3]')}>
                                <X className="h-5 w-5" strokeWidth={1.75} />
                            </button>
                            <span className="mr-auto min-w-0 truncate pl-1 pr-4 text-[14px] font-normal text-[#17202E]">{describeSelection(selectedList, t)}</span>
                            {trashMode ? (
                                <BulkAction icon={RefreshCcw} label={t('actions.restore')} onClick={() => selectedList.forEach(handleRestoreItem)} />
                            ) : (
                                <>
                                    {canManageSelectedSingle ? <BulkAction icon={Share2} label={t('common:actions.share')} onClick={() => handleShareClick(selectedSingle)} /> : null}
                                    {selectedFilesOnly.length ? <BulkAction icon={Download} label={t('common:actions.download')} onClick={() => selectedFilesOnly.forEach(handleDownload)} /> : null}
                                    {canEditSelection ? <BulkAction icon={FolderInput} label={t('actions.move')} onClick={() => handleMoveClick(selectedList)} /> : null}
                                    {canEditSelection ? <BulkAction icon={Trash2} label={t('common:actions.delete')} onClick={confirmBulkDelete} /> : null}
                                    <MenuButton icon={MoreHorizontal} ariaLabel={t('actions.other')} className={clsx(ICON_BUTTON, 'h-9 w-9 hover:bg-white')}>
                                        {(close) => (
                                            <>
                                                <MenuItem icon={Copy} label={t('actions.copy')} onClick={() => { close(); handleBulkCopy(); }} />
                                                <MenuItem
                                                    icon={SquareCheck}
                                                    label={allVisibleSelected ? t('actions.deselect') : t('actions.selectAll')}
                                                    onClick={() => { close(); allVisibleSelected ? clearSelection() : setSelectedItems(new Set(orderedItems.map((item) => item.id))); }}
                                                />
                                            </>
                                        )}
                                    </MenuButton>
                                </>
                            )}
                        </div>
                    ) : null}

                    {/* Content */}
                    <div className="mt-4 flex min-h-0 flex-1 flex-col">
                        {loading && files.length === 0 ? (
                            <div className="flex items-center justify-center gap-2 py-24 text-[14px] text-[#586174]">
                                <Loader2 className="h-5 w-5 animate-spin text-[#2458D3]" />
                                {t('status.loadingFiles')}
                            </div>
                        ) : error ? (
                            <div className="flex flex-col items-center py-20 text-center">
                                <p className="text-[14px] font-medium text-[#C03437]">{t('status.retry', { message: error })}</p>
                                <button type="button" onClick={() => loadFiles(currentFolderId, debouncedSearchQuery)} className={clsx(BUTTON_SECONDARY, 'mt-4 h-9')}>
                                    <RefreshCcw className="h-5 w-5" strokeWidth={1.75} /> {t('common:actions.retry')}
                                </button>
                            </div>
                        ) : orderedItems.length === 0 ? (
                            <div className="flex flex-col items-center rounded-[8px] border border-dashed border-[#E2E5EA] py-20 text-center">
                                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F6F7F9]">
                                    <UploadCloud className="h-7 w-7 text-[#586174]" strokeWidth={1.5} />
                                </div>
                                <h2 className="mt-4 text-[18px] font-semibold leading-[26px] text-[#17202E]">
                                    {files.length && (hasActiveFilters || searchQuery) ? t('empty.search') : emptyTitle}
                                </h2>
                                <p className="mt-1 max-w-sm text-[14px] leading-5 text-[#586174]">
                                    {files.length && (hasActiveFilters || searchQuery) ? t('empty.searchHint') : emptyText}
                                </p>
                                {files.length && hasActiveFilters ? (
                                    <button type="button" onClick={resetFilters} className={clsx(BUTTON_SECONDARY, 'mt-4 h-9')}>{t('filters.reset')}</button>
                                ) : !files.length && canCreate ? (
                                    <button type="button" onClick={handleUploadClick} className={clsx(BUTTON_PRIMARY, 'mt-4 h-9')}>
                                        <Upload className="h-5 w-5" strokeWidth={1.75} /> {t('create.upload')}
                                    </button>
                                ) : null}
                            </div>
                        ) : viewMode === 'list' ? (
                            <div className="min-h-0 w-full flex-1 overflow-y-auto overflow-x-hidden pb-8">
                                <table className="w-full table-fixed border-collapse text-left">
                                    <thead className="sticky top-0 z-10 bg-white">
                                        <tr className="h-9 border-b border-[#E2E5EA] text-[14px] text-[#586174]">
                                            <th scope="col" className="w-12 pl-4 pr-2 font-normal">
                                                <Checkbox
                                                    checked={allVisibleSelected}
                                                    indeterminate={someVisibleSelected && !allVisibleSelected}
                                                    onChange={() => (allVisibleSelected ? clearSelection() : setSelectedItems(new Set(orderedItems.map((item) => item.id))))}
                                                    label={t('actions.selectAll')}
                                                />
                                            </th>
                                            {renderSortableHeader('name', t('columns.name'), 'pl-3')}
                                            <th scope="col" className="w-[168px] px-4 font-normal @max-[800px]:hidden">{t('columns.owner')}</th>
                                            {renderSortableHeader('updated_at', t('columns.modified'), 'w-[184px] @max-[520px]:hidden')}
                                            {renderSortableHeader('size', t('columns.size'), 'w-[100px] @max-[660px]:hidden')}
                                            <th scope="col" data-tooltip-align="end" className="w-14 pr-3 text-right font-normal">
                                                <MenuButton icon={ListFilter} ariaLabel={t('view.sort')} className={clsx(ICON_BUTTON, 'h-8 w-8')}>
                                                    {(close) => SORT_OPTIONS.map((entry) => {
                                                        const option = { ...entry, label: t(entry.label) };
                                                        const checked = `${sortBy}:${sortOrder}` === option.value;
                                                        return (
                                                            <button
                                                                key={option.value}
                                                                type="button"
                                                                role="menuitemradio"
                                                                aria-checked={checked}
                                                                onClick={() => {
                                                                    const [nextSortBy, nextSortOrder] = option.value.split(':');
                                                                    setSortBy(nextSortBy);
                                                                    setSortOrder(nextSortOrder);
                                                                    close();
                                                                }}
                                                                className={clsx('flex h-9 w-full items-center gap-2.5 px-3 text-left text-[14px] hover:bg-[#F6F7F9]', checked ? 'text-[#2458D3]' : 'text-[#17202E]', FOCUS_RING)}
                                                            >
                                                                <span className="flex-1">{option.label}</span>
                                                                {checked ? <Check className="h-4 w-4" strokeWidth={2} /> : null}
                                                            </button>
                                                        );
                                                    })}
                                                </MenuButton>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {orderedItems.map((file) => (
                                            <FileTableRow key={file.id} file={file} {...itemProps(file)} />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overflow-x-hidden pb-8">
                                {foldersList.length ? (
                                    <section>
                                        <h2 className="mb-3 text-[14px] font-medium text-[#586174]">{t('folder.folders')}</h2>
                                        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                                            {foldersList.map((folder) => (
                                                <DriveGridCard key={folder.id} item={folder} {...itemProps(folder)} />
                                            ))}
                                        </div>
                                    </section>
                                ) : null}
                                {filesList.length ? (
                                    <section>
                                        <h2 className="mb-3 text-[14px] font-medium text-[#586174]">{t('folder.files')}</h2>
                                        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                                            {filesList.map((file) => (
                                                <DriveGridCard key={file.id} item={file} {...itemProps(file)} />
                                            ))}
                                        </div>
                                    </section>
                                ) : null}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {selectedPreviewItem && !isFolderItem(selectedPreviewItem) ? (
                <DocumentDetailsPanel
                    item={selectedPreviewItem}
                    user={user}
                    folderPath={folderPath}
                    rootLabel={modeMeta.title}
                    onClose={() => setSelectedPreviewItem(null)}
                    onOpen={handleFileClick}
                    onShare={handleShareClick}
                    onRestore={handleRestoreItem}
                    trashMode={trashMode}
                    className="absolute inset-y-0 right-0 z-30 shadow-[-12px_0_32px_rgba(23,32,46,0.08)] xl:static xl:shadow-none"
                />
            ) : null}

            {activityOpen ? (
                <AppModal
                    title={t('history.title')}
                    onClose={() => setActivityOpen(false)}
                    maxWidth={560}
                    closeOnBackdrop
                    footer={<div className="flex w-full items-center justify-between gap-3 text-[12px] text-[#586174]">
                        <span>{activityTotalPages ? t('history.page', { page: activityPage, total: activityTotalPages }) : t('history.drive')}</span>
                        <div className="flex items-center gap-2">
                            <button type="button" onClick={() => setActivityPage((page) => Math.max(1, page - 1))} disabled={!activityHasPrev || activityLoading} aria-label={t('history.previous')} className={clsx(ICON_BUTTON, 'h-8 w-8 disabled:opacity-40')}><ChevronLeft className="h-4 w-4" /></button>
                            <button type="button" onClick={() => setActivityPage((page) => page + 1)} disabled={!activityHasNext || activityLoading} aria-label={t('history.next')} className={clsx(ICON_BUTTON, 'h-8 w-8 disabled:opacity-40')}><ChevronRight className="h-4 w-4" /></button>
                        </div>
                    </div>}
                >
                    <p className="-mt-2 mb-2 flex items-center gap-2 text-[12px] text-[#586174]">
                        <History className="h-4 w-4 shrink-0 text-[#2458D3]" strokeWidth={1.75} />
                        <span className="min-w-0 truncate">{activityScopeDescription}{currentFolderId !== 'root' ? ` · ${folderPath.at(-1)?.name || t('history.currentFolder')}` : ''}</span>
                    </p>
                    <div className="custom-scrollbar h-[min(460px,55vh)] overflow-y-auto pr-1">
                    {activityLoading ? (
                        <ol className="animate-pulse divide-y divide-[#EEF0F3]" aria-busy="true" aria-label={t('history.loading')}>
                            {Array.from({ length: 8 }).map((_, index) => <li key={index} className="flex items-start gap-3 py-3">
                                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#E3E8F0]" />
                                <div className="min-w-0 flex-1 space-y-2">
                                    <div className="h-3 rounded bg-[#EEF1F5]" style={{ width: `${[78, 62, 70, 55, 84, 66, 58, 74][index]}%` }} />
                                    {index % 3 === 1 ? <div className="h-2.5 w-2/5 rounded bg-[#F2F4F7]" /> : null}
                                </div>
                                <div className="h-2.5 w-20 shrink-0 rounded bg-[#EEF1F5]" />
                            </li>)}
                        </ol>
                    ) : activityItems.length ? (
                        <ol className="divide-y divide-[#EEF0F3]">
                            {activityItems.map((entry) => {
                                const action = String(entry.action || '').toLowerCase();
                                const label = (DRIVE_ACTIVITY_LABELS[action] ? t(DRIVE_ACTIVITY_LABELS[action]) : '') || entry.action_label || entry.action || t('history.action');
                                const resource = entry.resource_name || entry.file_name || entry.name || getDriveActivityDescription(entry);
                                const actor = entry.actor_full_name || entry.actor_username || t('history.user');
                                return <li key={entry.id} className="flex items-start gap-3 py-3">
                                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#7B9AF0]" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[13px] leading-5 text-[#17202E]"><span className="font-medium">{actor}</span> {label}{resource ? <> · <span className="font-medium">{resource}</span></> : null}</p>
                                        {entry.from_path && entry.to_path && <p className="mt-0.5 truncate text-[11px] text-[#7B8494]">{entry.from_path} → {entry.to_path}</p>}
                                    </div>
                                    <time className="shrink-0 pt-0.5 text-[11px] text-[#7B8494]">{formatDriveActivityDate(entry.created_at || entry.occurred_at, t)}</time>
                                </li>;
                            })}
                        </ol>
                    ) : (
                        <p className="flex h-full items-center justify-center text-[13px] text-[#586174]">{t('history.empty')}</p>
                    )}
                    </div>
                </AppModal>
            ) : null}

            <ShareModal
                isOpen={shareModalOpen}
                onClose={() => setShareModalOpen(false)}
                file={fileToShare}
            />


            <ImagePreviewModal
                isOpen={previewModalOpen}
                onClose={() => setPreviewModalOpen(false)}
                file={fileToPreview}
            />

            <ArchivePreviewModal
                isOpen={archiveModalOpen}
                onClose={() => setArchiveModalOpen(false)}
                file={fileToPreview}
            />

            <CreateFileModal
                isOpen={createFileModalOpen}
                onClose={() => setCreateFileModalOpen(false)}
                type={fileTypeToCreate}
                onCreate={handleCreateFileConfirm}
            />

            <input
                type="file"
                ref={fileInputRef}
                onChange={handleMultipleFileChange}
                multiple
                accept=".docx,.xlsx,.pdf,.pptx,.txt,.zip,.rar,.mp3,.wav,.ogg,.m4a,.flac,.mp4,.mov,.avi,.mkv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,application/zip,application/x-zip-compressed,application/vnd.rar,application/x-rar-compressed,audio/mpeg,audio/wav,audio/x-wav,audio/ogg,audio/mp4,audio/m4a,audio/x-m4a,audio/flac,audio/x-flac,video/mp4,video/quicktime,video/x-msvideo,video/x-matroska"
                className="hidden"
            />

            <DeleteConfirmModal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                file={fileToDelete}
                onConfirm={confirmDeleteFile}
            />

            <RenameModal
                isOpen={renameModalOpen}
                onClose={() => { setRenameModalOpen(false); setFileToRename(null); }}
                file={fileToRename}
                onConfirm={confirmRename}
            />

            <MoveItemModal
                isOpen={moveModalOpen}
                onClose={() => {
                    if (isMovingItem) return;
                    setMoveModalOpen(false);
                    setFileToMove(null);
                }}
                items={fileToMove}
                onConfirm={confirmMoveItem}
                submitting={isMovingItem}
            />

            {/* Upload progress */}
            {uploadProgress !== null && (
                <div role="status" className="fixed bottom-6 right-6 z-[9998] flex w-80 flex-col gap-3 rounded-[8px] border border-[#E2E5EA] bg-white p-4 shadow-[0_12px_32px_rgba(23,32,46,0.12)]">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#2458D3]" />
                            <div className="min-w-0">
                                <p className="truncate text-[14px] font-medium text-[#17202E]" title={uploadingFileName}>{uploadingFileName}</p>
                                <p className="text-[12px] text-[#586174]">{t('status.uploading')}</p>
                            </div>
                        </div>
                        <span className="text-[14px] font-medium tabular-nums text-[#2458D3]">{uploadProgress}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E2E5EA]">
                        <div className="h-full rounded-full bg-[#2458D3] transition-[width] duration-200 ease-out" style={{ width: `${uploadProgress}%` }} />
                    </div>
                </div>
            )}
        </div>
    );
};

export default Drive;
