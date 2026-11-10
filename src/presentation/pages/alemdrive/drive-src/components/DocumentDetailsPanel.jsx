import React, { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ExternalLink, Folder, History, Info, Lock, RotateCcw, Share2, Sparkles, X } from 'lucide-react';
import { getDriveActivity, getUsersWithAccess } from '../api/files';
import {
    Avatar,
    BUTTON_PRIMARY,
    BUTTON_SECONDARY,
    BUTTON_SECONDARY_ACCENT,
    FOCUS_RING,
    FileTypeIcon,
    ICON_BUTTON,
    KIND_META,
    formatModified,
    formatSize,
    getItemDate,
    getItemKind,
    getOwnerAvatar,
    getOwnerName,
    isFolderItem,
    pluralize,
} from './driveUi';

const TABS = [
    { id: 'overview', label: 'Обзор' },
    { id: 'activity', label: 'Активность' },
    { id: 'versions', label: 'Версии' },
];

const ACTIVITY_LABELS = {
    created: 'создал(а) папку',
    uploaded: 'загрузил(а) файл',
    renamed: 'переименовал(а)',
    moved: 'переместил(а)',
    edited: 'изменил(а) файл',
    deleted: 'удалил(а)',
    copied: 'скопировал(а)',
    restored: 'восстановил(а)',
};

const participantName = (participant) => (
    `${participant?.first_name || ''} ${participant?.last_name || ''}`.trim()
    || participant?.full_name
    || participant?.username
    || 'Пользователь'
);

const MetaRow = ({ label, children }) => (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-3 text-[14px] leading-5">
        <dt className="text-[#586174]">{label}</dt>
        <dd className="min-w-0 text-[#17202E]">{children}</dd>
    </div>
);

const DocumentPreview = ({ item }) => {
    const kind = getItemKind(item);
    const isFolder = kind === 'folder';
    const title = String(item.name || '').replace(/\.[^.]+$/, '');

    return (
        <div className="flex h-[248px] items-center justify-center rounded-[8px] bg-[#F6F7F9] p-4">
            {isFolder ? (
                <div className="flex flex-col items-center text-center">
                    <FileTypeIcon item={item} size={72} />
                    <span className="mt-3 text-[14px] text-[#586174]">
                        {Number.isFinite(Number(item.files_count)) ? `${item.files_count} ${pluralize(Number(item.files_count), ['файл', 'файла', 'файлов'])}` : 'Папка'}
                    </span>
                </div>
            ) : ['word', 'text', 'pdf'].includes(kind) ? (
                <div className="flex h-full w-[74%] flex-col rounded-[4px] bg-white px-4 py-4 shadow-[0_1px_3px_rgba(23,32,46,0.12)]">
                    <p className="line-clamp-2 text-[14px] font-semibold leading-5 text-[#17202E]">{title}</p>
                    <p className="mt-1 text-[10px] leading-3 text-[#586174]">{KIND_META[kind].label} · {formatSize(item.size)}</p>
                    <div className="mt-4 space-y-2" aria-hidden="true">
                        {[92, 100, 84, 0, 60, 96, 78, 0, 88, 70].map((width, index) => (
                            width ? <div key={index} className="h-1.5 rounded-full bg-[#E2E5EA]" style={{ width: `${width}%` }} /> : <div key={index} className="h-1" />
                        ))}
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center text-center">
                    <FileTypeIcon item={item} size={64} />
                    <span className="mt-3 text-[14px] text-[#586174]">{KIND_META[kind].label} · {formatSize(item.size)}</span>
                </div>
            )}
        </div>
    );
};

export default function DocumentDetailsPanel({
    item,
    user,
    folderPath = [],
    rootLabel = 'Мой диск',
    onClose,
    onOpen,
    onShare,
    onRestore,
    trashMode = false,
    className,
}) {
    const navigate = useNavigate();
    const [tab, setTab] = useState('overview');
    const [participants, setParticipants] = useState([]);
    const [participantsTotal, setParticipantsTotal] = useState(0);
    const [activity, setActivity] = useState([]);
    const [loading, setLoading] = useState(false);
    const isFolder = isFolderItem(item);

    useEffect(() => {
        setTab('overview');
    }, [item?.id]);

    useEffect(() => {
        let active = true;
        if (!item?.id) return undefined;
        setLoading(true);
        Promise.all([
            getUsersWithAccess(item.id, isFolder ? 'folder' : 'file', { limit: 8, paginated: true }).catch(() => ({ items: [] })),
            getDriveActivity({ limit: 50, offset: 0 }).catch(() => ({ items: [] })),
        ]).then(([access, history]) => {
            if (!active) return;
            const items = Array.isArray(access?.items) ? access.items : Array.isArray(access) ? access : [];
            setParticipants(items);
            setParticipantsTotal(Number.isFinite(access?.total) ? access.total : items.length);
            setActivity((Array.isArray(history?.items) ? history.items : []).filter((entry) => entry.resource_id === item.id).slice(0, 8));
        }).finally(() => active && setLoading(false));
        return () => { active = false; };
    }, [item?.id, isFolder]);

    const locationLabel = useMemo(() => {
        const names = folderPath.map((entry) => entry.name).filter(Boolean);
        return [rootLabel, ...names].join(' / ');
    }, [folderPath, rootLabel]);

    if (!item) return null;

    const ownerName = getOwnerName(item, user);

    return (
        <aside
            aria-label={`Сведения: ${item.name}`}
            className={clsx(
                'flex w-[340px] shrink-0 flex-col overflow-y-auto border-l border-[#E2E5EA] bg-white',
                'motion-safe:animate-[drive-panel-in_200ms_ease-out]',
                className,
            )}
        >
            <div className="flex items-center gap-3 px-5 pt-5">
                <FileTypeIcon item={item} size={24} />
                <h2 className="min-w-0 flex-1 truncate text-[18px] font-semibold leading-[26px] text-[#17202E]" title={item.name}>{item.name}</h2>
                <button type="button" onClick={onClose} className={clsx(ICON_BUTTON, 'h-8 w-8')} aria-label="Закрыть сведения">
                    <X className="h-5 w-5" strokeWidth={1.75} />
                </button>
            </div>

            <div role="tablist" className="mt-3 flex gap-6 border-b border-[#E2E5EA] px-5">
                {TABS.map((entry) => (
                    <button
                        key={entry.id}
                        type="button"
                        role="tab"
                        aria-selected={tab === entry.id}
                        onClick={() => setTab(entry.id)}
                        className={clsx(
                            'relative h-9 text-[14px] font-normal transition-colors duration-[120ms]',
                            tab === entry.id ? 'text-[#2458D3]' : 'text-[#586174] hover:text-[#17202E]',
                            FOCUS_RING,
                        )}
                    >
                        {entry.label}
                        {tab === entry.id ? <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[#2458D3]" /> : null}
                    </button>
                ))}
            </div>

            {tab === 'overview' ? (
                <div className="flex flex-col gap-5 p-5">
                    <DocumentPreview item={item} />

                    {trashMode ? (
                        <button type="button" onClick={() => onRestore?.(item)} className={clsx(BUTTON_PRIMARY, 'h-9 w-full')}>
                            <RotateCcw className="h-5 w-5" strokeWidth={1.75} /> Восстановить
                        </button>
                    ) : (
                        <div className="grid grid-cols-2 gap-2">
                            <button type="button" onClick={() => onOpen?.(item)} className={clsx(BUTTON_PRIMARY, 'h-9')}>
                                <ExternalLink className="h-5 w-5" strokeWidth={1.75} /> Открыть
                            </button>
                            <button type="button" onClick={() => onShare?.(item)} className={clsx(BUTTON_SECONDARY_ACCENT, 'h-9')}>
                                <Share2 className="h-5 w-5" strokeWidth={1.75} /> Поделиться
                            </button>
                        </div>
                    )}

                    <dl className="flex flex-col gap-3">
                        <MetaRow label="Владелец">
                            <span className="flex min-w-0 items-center gap-2">
                                <Avatar name={ownerName} src={getOwnerAvatar(item, user)} size={24} />
                                <span className="truncate">{ownerName}</span>
                            </span>
                        </MetaRow>
                        <MetaRow label="Изменено">{formatModified(getItemDate(item))}</MetaRow>
                        <MetaRow label="Размер">{isFolder ? '—' : formatSize(item.size)}</MetaRow>
                        <MetaRow label="Расположение">
                            <span className="flex min-w-0 items-center gap-2">
                                <Folder className="h-4 w-4 shrink-0 text-[#586174]" strokeWidth={1.75} />
                                <span className="truncate" title={locationLabel}>{locationLabel}</span>
                            </span>
                        </MetaRow>
                    </dl>

                    <section className="border-t border-[#E2E5EA] pt-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-[14px] font-semibold text-[#17202E]">Доступ</h3>
                            {!trashMode ? (
                                <button type="button" onClick={() => onShare?.(item)} className={clsx('rounded-[4px] text-[14px] font-medium text-[#2458D3] hover:text-[#1D49B3]', FOCUS_RING)}>
                                    Настроить
                                </button>
                            ) : null}
                        </div>
                        <div className="mt-3 flex items-center gap-3">
                            {participants.length ? (
                                <div className="flex -space-x-2">
                                    {participants.slice(0, 4).map((participant) => (
                                        <Avatar key={participant.id} name={participantName(participant)} src={participant.avatar_url} size={28} ring />
                                    ))}
                                </div>
                            ) : null}
                            <span className="text-[14px] text-[#586174]">
                                {loading && !participants.length
                                    ? 'Загружаем…'
                                    : participantsTotal
                                        ? `${participantsTotal} ${pluralize(participantsTotal, ['участник', 'участника', 'участников'])}`
                                        : 'Только владелец'}
                            </span>
                        </div>
                        <div className="mt-3 flex items-center gap-2 text-[14px] text-[#586174]">
                            <Lock className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                            <span>Доступ ограничен</span>
                            <span title="Файл видят только владелец и добавленные участники" className="inline-flex">
                                <Info className="h-4 w-4 text-[#7B8494]" strokeWidth={1.75} aria-label="Файл видят только владелец и добавленные участники" />
                            </span>
                        </div>
                    </section>

                    {!isFolder && !trashMode ? (
                        <section className="rounded-[8px] bg-[#EDF2FF] p-4">
                            <div className="flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-[#2458D3]" strokeWidth={1.75} />
                                <h3 className="text-[14px] font-semibold text-[#17202E]">Кратко о документе</h3>
                            </div>
                            <p className="mt-1.5 text-[13px] leading-5 text-[#586174]">
                                Задайте вопрос по содержимому файла. Ответ будет опираться на этот документ.
                            </p>
                            <button
                                type="button"
                                onClick={() => navigate('/drive/notebook', { state: { fileId: item.id, fileName: item.name } })}
                                className={clsx('mt-2 inline-flex items-center gap-1.5 rounded-[4px] text-[14px] font-medium text-[#2458D3] hover:text-[#1D49B3]', FOCUS_RING)}
                            >
                                Спросить по файлу <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
                            </button>
                        </section>
                    ) : null}
                </div>
            ) : null}

            {tab === 'activity' ? (
                <div className="p-5">
                    {loading ? (
                        <p className="text-[14px] text-[#586174]">Загружаем историю…</p>
                    ) : activity.length ? (
                        <ol className="flex flex-col gap-4">
                            {activity.map((entry) => {
                                const actor = entry.actor_full_name || entry.actor_username || 'Пользователь';
                                return (
                                    <li key={entry.id} className="flex gap-3">
                                        <Avatar name={actor} size={28} />
                                        <div className="min-w-0">
                                            <p className="text-[14px] leading-5 text-[#17202E]">
                                                <span className="font-medium">{actor}</span> {ACTIVITY_LABELS[entry.action] || entry.action}
                                            </p>
                                            <p className="text-[12px] leading-4 text-[#586174]">{formatModified(entry.created_at)}</p>
                                        </div>
                                    </li>
                                );
                            })}
                        </ol>
                    ) : (
                        <p className="text-[14px] text-[#586174]">По этому элементу пока нет событий.</p>
                    )}
                </div>
            ) : null}

            {tab === 'versions' ? (
                <div className="p-5">
                    <div className="flex items-start gap-3 rounded-[8px] border border-[#E2E5EA] p-3">
                        <History className="mt-0.5 h-5 w-5 shrink-0 text-[#2458D3]" strokeWidth={1.75} />
                        <div className="min-w-0">
                            <p className="text-[14px] font-medium text-[#17202E]">Текущая версия</p>
                            <p className="mt-0.5 text-[12px] leading-4 text-[#586174]">{formatModified(getItemDate(item))} · {ownerName}</p>
                        </div>
                    </div>
                    <p className="mt-3 text-[13px] leading-5 text-[#586174]">Предыдущие версии для этого элемента не сохранены.</p>
                </div>
            ) : null}
        </aside>
    );
}
