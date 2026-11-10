import React, { useEffect, useMemo, useState } from 'react';
import { FolderTree, X, MoveRight } from 'lucide-react';
import FolderTreeView from './FolderTree';

const ROOT_ID = 'root';

const isFolderItem = (item) => item?.type === 'dir' || item?.type === 'folder' || item?.mime_type === 'application/x-directory';
const parentIdOf = (item) => (isFolderItem(item) ? item?.parent_id : item?.folder_id) || ROOT_ID;

const MoveItemModal = ({ isOpen, onClose, item, items: itemsProp, onConfirm, submitting = false }) => {
    const items = useMemo(() => (Array.isArray(itemsProp) && itemsProp.length ? itemsProp : item ? [item] : []), [itemsProp, item]);
    const isFolder = items.length === 1 && isFolderItem(items[0]);
    const excludedFolderIds = useMemo(() => items.filter(isFolderItem).map((entry) => entry.id), [items]);

    const currentParentId = useMemo(() => {
        return items.length === 1 ? parentIdOf(items[0]) : null;
    }, [items]);

    const [selectedTargetId, setSelectedTargetId] = useState(ROOT_ID);

    useEffect(() => {
        if (!isOpen) return;
        setSelectedTargetId(currentParentId || ROOT_ID);
    }, [isOpen, currentParentId]);

    if (!isOpen || items.length === 0) return null;

    const itemLabel = items.length > 1 ? `${items.length} элементов` : isFolder ? 'Папка' : 'Файл';
    const hasChanged = items.some((entry) => parentIdOf(entry) !== selectedTargetId);

    return (
        <div className="ts-legacy-backdrop fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/45 px-4" onClick={onClose}>
            <div
                className="ts-legacy-dialog w-full max-w-3xl rounded-[28px] border border-[#E2E8F0] bg-white shadow-[0_24px_64px_rgba(15,23,42,0.18)]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between border-b border-[#E2E8F0] px-6 py-5">
                    <div className="min-w-0">
                        <div className="inline-flex items-center gap-2 rounded-full bg-[#EEF2FF] px-3 py-1 text-[11px] font-bold text-[#2458D3]">
                            <MoveRight className="h-3.5 w-3.5" />
                            Перемещение
                        </div>
                        <h2 className="mt-3 text-lg font-bold text-[#0F172A]">Переместить: {itemLabel}{items.length === 1 ? ` — ${items[0].name}` : ''}</h2>
                        <p className="mt-1 text-sm text-[#64748B]">
                            Выберите папку назначения или перенесите элемент в корень диска.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-2xl p-2 text-[#94A3B8] transition-colors hover:bg-slate-100 hover:text-[#334155]"
                        disabled={submitting}
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="grid gap-4 px-6 py-5 lg:grid-cols-2">
                    <div className="rounded-3xl border border-[#E2E8F0] bg-[#F8FAFC] p-4">
                        <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-[#94A3B8]">БЫСТРЫЙ ВЫБОР</p>
                        <button
                            type="button"
                            onClick={() => setSelectedTargetId(ROOT_ID)}
                            className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                                selectedTargetId === ROOT_ID
                                    ? 'border-[#2458D3] bg-[#EEF2FF] text-[#2458D3]'
                                    : 'border-[#E2E8F0] bg-white text-[#334155] hover:border-[#2458D3]/40 hover:bg-[#F8FBFF]'
                            }`}
                        >
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm">
                                <FolderTree className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-bold">Корень диска</p>
                                <p className="text-xs text-[#94A3B8]">Без вложенной папки</p>
                            </div>
                        </button>

                        <div className="mt-4 rounded-2xl border border-dashed border-[#CBD5E1] bg-white px-4 py-3">
                            <p className="text-xs font-semibold text-[#64748B]">Текущее расположение</p>
                            <p className="mt-1 text-sm font-bold text-[#0F172A]">
                                {currentParentId === ROOT_ID ? 'Корень диска' : 'Вложенная папка'}
                            </p>
                        </div>
                    </div>

                    <div className="rounded-3xl border border-[#E2E8F0] bg-white p-4">
                        <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-[#94A3B8]">ПАПКИ НАЗНАЧЕНИЯ</p>
                        <div className="max-h-[360px] overflow-y-auto pr-1">
                            <div className="mb-4">
                                <p className="mb-2 text-xs font-semibold text-[#64748B]">Мой диск</p>
                                <FolderTreeView
                                    currentFolderId={selectedTargetId}
                                    onItemClick={(folder) => setSelectedTargetId(folder.id)}
                                    isShared={false}
                                    excludeFolderId={isFolder ? items[0]?.id : null}
                                    excludeFolderIds={excludedFolderIds}
                                />
                            </div>
                            <div>
                                <p className="mb-2 text-xs font-semibold text-[#64748B]">Доступные мне</p>
                                <FolderTreeView
                                    currentFolderId={selectedTargetId}
                                    onItemClick={(folder) => setSelectedTargetId(folder.id)}
                                    isShared
                                    excludeFolderId={isFolder ? items[0]?.id : null}
                                    excludeFolderIds={excludedFolderIds}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between border-t border-[#E2E8F0] px-6 py-4">
                    <p className="text-xs text-[#94A3B8]">
                        {hasChanged ? 'Элементы, уже находящиеся здесь, будут пропущены.' : 'Выберите папку назначения.'}
                    </p>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-2xl border border-[#E2E8F0] px-4 py-2.5 text-sm font-semibold text-[#475569] transition-colors hover:bg-slate-50"
                            disabled={submitting}
                        >
                            Отмена
                        </button>
                        <button
                            type="button"
                            onClick={() => onConfirm(selectedTargetId, items)}
                            disabled={!hasChanged || submitting}
                            className="ts-button ts-button--primary rounded-2xl bg-[#2458D3] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#1976D2] disabled:cursor-not-allowed disabled:bg-[#DBEAFE]"
                        >
                            {submitting ? 'Перемещаем...' : 'Переместить'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MoveItemModal;
