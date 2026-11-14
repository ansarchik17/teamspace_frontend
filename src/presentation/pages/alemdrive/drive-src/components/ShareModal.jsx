import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Check, UserMinus, UserPlus, Link as LinkIcon, Copy, ChevronLeft, ChevronRight, Link2Off, Loader2 } from 'lucide-react';
import { useToast } from './Toast';
import AppSelect from '../../../../../shared/ui/AppSelect';
import { grantPermission, revokePermission, getUsersWithAccess, getUsersWithoutAccess, updatePermission, createShareLink, revokeShareLink, getMyPermission } from '../api/files';

const ShareModal = ({ isOpen, onClose, file }) => {
    const isInheritedPermission = (permission) => Boolean(
        permission?.is_inherited || permission?.inherited || permission?.permission_source === 'inherited' || permission?.inherited_from_folder_id || permission?.inherited_from_folder_name
    );
    const [query, setQuery] = useState('');
    const [usersWithAccess, setUsersWithAccess] = useState([]);
    const [usersWithAccessPage, setUsersWithAccessPage] = useState(1);
    const [usersWithAccessTotal, setUsersWithAccessTotal] = useState(0);
    const [usersWithAccessLimit] = useState(10);
    const [usersWithoutAccess, setUsersWithoutAccess] = useState([]); // All potential users to share with
    const [filteredUsers, setFilteredUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [usersLoadError, setUsersLoadError] = useState('');
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [selectedRole, setSelectedRole] = useState('viewer');
    const [sharing, setSharing] = useState(false);
    const { addToast } = useToast();

    const [userToRevoke, setUserToRevoke] = useState(null);
    const [isOwner, setIsOwner] = useState(false);
    const [linkExpiration, setLinkExpiration] = useState(7 * 24 * 60 * 60);
    const [createdShareLink, setCreatedShareLink] = useState(null);
    const [creatingShareLink, setCreatingShareLink] = useState(false);
    const [revokingShareLink, setRevokingShareLink] = useState(false);
    const [selectedExistingUsers, setSelectedExistingUsers] = useState([]);
    const [isBulkRevoking, setIsBulkRevoking] = useState(false);
    const isFolder = file?.type === 'dir' || file?.type === 'folder' || file?.mime_type === 'application/x-directory';
    const itemLabel = isFolder ? 'папка' : 'файл';
    const itemLabelCapitalized = isFolder ? 'Папка' : 'Файл';

    const filterUsers = (users, searchValue) => {
        const normalizedQuery = String(searchValue || '').trim().toLocaleLowerCase();
        if (!normalizedQuery) return users;
        return users.filter((user) => [
            user?.username,
            user?.full_name,
            user?.first_name,
            user?.last_name,
            user?.email,
            user?.name,
            user?.display_name,
        ].some((value) => String(value || '').toLocaleLowerCase().includes(normalizedQuery)));
    };

    useEffect(() => {
        if (isOpen && file) {
            setUsersWithAccessPage(1);
            fetchUsers(1, '');
            fetchMyPermission();
            setQuery('');
            setSelectedUsers([]);
            setUserToRevoke(null);
            setSelectedExistingUsers([]);
            setIsBulkRevoking(false);
            setCreatedShareLink(null);
            setLinkExpiration(7 * 24 * 60 * 60);
        }
    }, [isOpen, file]);

    const fetchMyPermission = async () => {
        if (!file) return;
        try {
            const resourceType = isFolder ? 'folder' : 'file';
            const perm = await getMyPermission(file.id, resourceType);
            setIsOwner(perm?.role === 'owner');
        } catch {
            setIsOwner(false);
        }
    };

    const fetchUsers = async (targetPage = usersWithAccessPage, searchValue = query) => {
        setLoading(true);
        setUsersLoadError('');
        try {
            const resourceType = isFolder ? 'folder' : 'file';
            const [withAccessResult, withoutAccessResult] = await Promise.allSettled([
                getUsersWithAccess(file.id, resourceType, { page: targetPage, limit: usersWithAccessLimit, paginated: true }),
                getUsersWithoutAccess(file.id, resourceType)
            ]);

            const withAccessRes = withAccessResult.status === 'fulfilled' ? withAccessResult.value : null;
            const withoutAccess = withoutAccessResult.status === 'fulfilled' ? withoutAccessResult.value : [];
            const accessItems = Array.isArray(withAccessRes) ? withAccessRes : (withAccessRes?.items || []);
            const totalCount = withAccessRes?.total ?? accessItems.length;

            setUsersWithAccess(accessItems);
            setUsersWithAccessTotal(totalCount);
            setUsersWithAccessPage(targetPage);
            setUsersWithoutAccess(withoutAccess);
            setFilteredUsers(filterUsers(withoutAccess, searchValue));
            if (withAccessResult.status === 'rejected' || withoutAccessResult.status === 'rejected') {
                const failedResult = withoutAccessResult.status === 'rejected' ? withoutAccessResult : withAccessResult;
                const message = failedResult.reason?.response?.data?.user_message || failedResult.reason?.response?.data?.message || 'Не удалось загрузить часть данных о доступе';
                setUsersLoadError(message);
                console.error('Failed to load part of share dialog data', failedResult.reason);
            }
        } catch (err) {
            console.error("Failed to fetch users", err);
            const message = err?.response?.data?.user_message || err?.response?.data?.message || 'Не удалось загрузить список пользователей';
            setUsersLoadError(message);
            addToast(message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e) => {
        const val = e.target.value;
        setQuery(val);
        setFilteredUsers(filterUsers(usersWithoutAccess, val));
    };

    const toggleUserSelection = (user) => {
        setSelectedUsers(prev => {
            const exists = prev.find(u => u.id === user.id);
            if (exists) {
                return prev.filter(u => u.id !== user.id);
            } else {
                return [...prev, user];
            }
        });
    };

    const handleShare = async () => {
        if (selectedUsers.length === 0 || !file) return;
        try {
            setSharing(true);
            const resourceType = isFolder ? 'folder' : 'file';
            const userIds = selectedUsers.map(u => u.id);
            await grantPermission(file.id, userIds, selectedRole, resourceType);

            const names = selectedUsers
                .map(u => [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.full_name || u.username)
                .join(', ');
            addToast(`${itemLabelCapitalized} "${file.name}" доступ${isFolder ? 'на' : 'ен'} для: ${names}`, 'success');

            // Refresh lists
            fetchUsers();
            setSelectedUsers([]);
            document.dispatchEvent(new CustomEvent('alem-drive-folders-updated'));
        } catch (err) {
            console.error("Share failed", err);
            addToast("Не удалось предоставить доступ", 'error');
        } finally {
            setSharing(false);
        }
    };

    const handleRevoke = (user) => {
        setUserToRevoke(user);
    };

    const confirmRevoke = async () => {
        if (!file || !userToRevoke) return;

        try {
            const resourceType = isFolder ? 'folder' : 'file';
            await revokePermission(file.id, userToRevoke.id, resourceType);
            const userName =
                [userToRevoke.first_name, userToRevoke.last_name].filter(Boolean).join(' ').trim() ||
                userToRevoke.full_name ||
                userToRevoke.username;
            addToast(`Доступ для ${userName} закрыт`, 'success');
            fetchUsers();
            document.dispatchEvent(new CustomEvent('alem-drive-folders-updated'));
        } catch (err) {
            console.error("Revoke failed", err);
            addToast("Не удалось закрыть доступ", 'error');
        } finally {
            setUserToRevoke(null);
        }
    };

    const nonOwnerUsers = usersWithAccess.filter(u => u.role !== 'owner' && !isInheritedPermission(u));
    const isAllSelected = nonOwnerUsers.length > 0 && nonOwnerUsers.every(u => selectedExistingUsers.includes(u.id));

    const toggleExistingUserSelection = (userId) => {
        setSelectedExistingUsers(prev =>
            prev.includes(userId)
                ? prev.filter(id => id !== userId)
                : [...prev, userId]
        );
    };

    const handleToggleSelectAll = () => {
        if (isAllSelected) {
            setSelectedExistingUsers([]);
        } else {
            setSelectedExistingUsers(nonOwnerUsers.map(u => u.id));
        }
    };

    const confirmBulkRevoke = async () => {
        if (!file || selectedExistingUsers.length === 0) return;

        try {
            const resourceType = isFolder ? 'folder' : 'file';
            await revokePermission(file.id, selectedExistingUsers, resourceType);
            addToast("Доступ для выбранных пользователей закрыт", 'success');
            fetchUsers();
            setSelectedExistingUsers([]);
            document.dispatchEvent(new CustomEvent('alem-drive-folders-updated'));
        } catch (err) {
            console.error("Bulk revoke failed", err);
            addToast("Не удалось закрыть доступ для выбранных пользователей", 'error');
        } finally {
            setIsBulkRevoking(false);
        }
    };

    const copyText = async (value) => {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            return;
        }
        const textArea = document.createElement('textarea');
        textArea.value = value;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            if (!document.execCommand('copy')) throw new Error('Clipboard copy failed');
        } finally {
            document.body.removeChild(textArea);
        }
    };

    const handleCreateShareLink = async () => {
        if (!file || creatingShareLink) return;
        setCreatingShareLink(true);
        try {
            const resourceType = isFolder ? 'folder' : 'file';
            const result = await createShareLink(file.id, resourceType, 'viewer', linkExpiration);
            const rawLink = result?.link || result?.url || (typeof result === 'string' ? result : '');
            const token = result?.token || result?.share_token || rawLink.match(/\/share\/([^/?#]+)/)?.[1] || null;
            const link = rawLink || (token ? `${window.location.origin}/share/${encodeURIComponent(token)}` : '');
            if (!link) throw new Error('Сервер не вернул ссылку или токен');

            const shareLink = {
                link,
                token,
                expiresAt: result?.expires_at || result?.expiresAt || null,
                expiresInSec: result?.expires_in_sec ?? linkExpiration,
            };
            setCreatedShareLink(shareLink);
            await copyText(link);
            addToast('Ссылка создана и скопирована', 'success');
        } catch (err) {
            console.error('Failed to create share link', err);
            addToast(err?.response?.data?.user_message || err?.response?.data?.message || err?.message || 'Не удалось создать ссылку', 'error');
        } finally {
            setCreatingShareLink(false);
        }
    };

    const handleRevokeShareLink = async () => {
        if (!createdShareLink?.token || revokingShareLink) return;
        setRevokingShareLink(true);
        try {
            await revokeShareLink(createdShareLink.token);
            setCreatedShareLink(null);
            addToast('Публичная ссылка отозвана', 'success');
        } catch (err) {
            console.error('Failed to revoke share link', err);
            addToast(err?.response?.data?.user_message || err?.response?.data?.message || 'Не удалось отозвать ссылку', 'error');
        } finally {
            setRevokingShareLink(false);
        }
    };

    const expirationLabel = (shareLink) => {
        if (shareLink?.expiresAt) {
            const date = new Date(shareLink.expiresAt);
            if (!Number.isNaN(date.getTime())) return `Истекает ${date.toLocaleString('ru-RU')}`;
        }
        if (!shareLink?.expiresInSec || Number(shareLink.expiresInSec) <= 0) return 'Без срока действия';
        const hours = Math.round(Number(shareLink.expiresInSec) / 3600);
        if (hours % 24 === 0) return `Действует ${hours / 24} дн.`;
        return `Действует ${hours} ч.`;
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="ts-legacy-backdrop fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] relative border border-gray-100"
                >
                    {/* Confirmation Overlay */}
                    <AnimatePresence>
                        {userToRevoke && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 z-10 bg-white/95 flex items-center justify-center p-6 text-center"
                            >
                                <div className="space-y-4 max-w-sm">
                                    <div className="mx-auto w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-500">
                                        <UserMinus className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-900">Закрыть доступ?</h3>
                                        <p className="text-sm text-gray-500 mt-2">
                                            Пользователь{' '}
                                            <span className="font-semibold text-gray-700">
                                                {[userToRevoke.first_name, userToRevoke.last_name].filter(Boolean).join(' ').trim() ||
                                                    userToRevoke.full_name ||
                                                    userToRevoke.username}
                                            </span>{' '}
                                            больше не сможет просматривать эту {itemLabel}.
                                        </p>
                                    </div>
                                    <div className="flex items-center justify-center gap-3 pt-2">
                                        <button
                                            onClick={() => setUserToRevoke(null)}
                                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                                        >
                                            Отмена
                                        </button>
                                        <button
                                            onClick={confirmRevoke}
                                            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
                                        >
                                            Закрыть доступ
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                        {isBulkRevoking && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 z-10 bg-white/95 flex items-center justify-center p-6 text-center"
                            >
                                <div className="space-y-4 max-w-sm">
                                    <div className="mx-auto w-12 h-12 bg-red-50 rounded-full flex items-center justify-center text-red-500">
                                        <UserMinus className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-900">Закрыть доступ?</h3>
                                        <p className="text-sm text-gray-500 mt-2">
                                            Выбранные пользователи ({selectedExistingUsers.length}) больше не смогут просматривать эту {itemLabel}.
                                        </p>
                                    </div>
                                    <div className="flex items-center justify-center gap-3 pt-2">
                                        <button
                                            onClick={() => setIsBulkRevoking(false)}
                                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                                        >
                                            Отмена
                                        </button>
                                        <button
                                            onClick={confirmBulkRevoke}
                                            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
                                        >
                                            Закрыть доступ
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                        <div>
                            <h3 className="text-xl font-bold text-gray-900">Настройки доступа</h3>
                            <p className="text-sm text-gray-500 mt-1">{file?.name}</p>
                        </div>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 bg-white rounded-full shadow-sm hover:bg-gray-100 transition-colors">
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {/* Public link controls — only the resource owner can manage public links. */}
                        {isOwner && (
                        <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center space-x-3">
                                    <div className="h-10 w-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                                        <LinkIcon className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-gray-900">Публичная ссылка</h4>
                                        <p className="text-xs text-gray-500">Доступ только для просмотра</p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <select
                                        aria-label="Срок действия ссылки"
                                        value={linkExpiration}
                                        onChange={(event) => setLinkExpiration(Number(event.target.value))}
                                        disabled={creatingShareLink || Boolean(createdShareLink)}
                                        className="h-9 rounded-lg border border-blue-200 bg-white px-2 text-sm text-gray-700 disabled:opacity-60"
                                    >
                                        <option value={60 * 60}>1 час</option>
                                        <option value={24 * 60 * 60}>1 день</option>
                                        <option value={7 * 24 * 60 * 60}>7 дней</option>
                                        <option value={30 * 24 * 60 * 60}>30 дней</option>
                                        <option value={0}>Без срока</option>
                                    </select>
                                    <button
                                        onClick={handleCreateShareLink}
                                        disabled={creatingShareLink || Boolean(createdShareLink)}
                                        className="inline-flex h-9 items-center justify-center rounded-lg border border-transparent bg-indigo-600 px-3 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {creatingShareLink ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LinkIcon className="mr-2 h-4 w-4" />}
                                        Создать ссылку
                                    </button>
                                </div>
                            </div>
                            {createdShareLink ? (
                                <div className="mt-3 rounded-lg border border-blue-100 bg-white p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <a href={createdShareLink.link} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm text-blue-700 underline" title={createdShareLink.link}>
                                            {createdShareLink.link}
                                        </a>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                try { await copyText(createdShareLink.link); addToast('Ссылка скопирована', 'success'); }
                                                catch (err) { addToast(err?.message || 'Не удалось скопировать ссылку', 'error'); }
                                            }}
                                            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                        >
                                            <Copy className="h-3.5 w-3.5" /> Скопировать
                                        </button>
                                        {createdShareLink.token ? (
                                            <button
                                                type="button"
                                                onClick={handleRevokeShareLink}
                                                disabled={revokingShareLink}
                                                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 px-2.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                                            >
                                                {revokingShareLink ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2Off className="h-3.5 w-3.5" />}
                                                Отозвать
                                            </button>
                                        ) : null}
                                    </div>
                                    <p className="mt-2 text-xs text-gray-500">{expirationLabel(createdShareLink)}</p>
                                </div>
                            ) : null}
                        </div>
                        )}
                        {!isOwner && (
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                <p className="text-sm text-gray-500">Делиться ссылкой могут только владельцы {itemLabel}.</p>
                            </div>
                        )}


                        {/* Section: Who has access */}
                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">У кого есть доступ</h4>
                                {isOwner && nonOwnerUsers.length > 0 && (
                                    <div className="flex items-center space-x-4 text-sm">
                                        <label className="flex items-center space-x-2 cursor-pointer select-none text-gray-600 hover:text-gray-900">
                                            <input
                                                type="checkbox"
                                                checked={isAllSelected}
                                                onChange={handleToggleSelectAll}
                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer"
                                            />
                                            <span>Выбрать всех</span>
                                        </label>
                                        {selectedExistingUsers.length > 0 && (
                                            <button
                                                onClick={() => setIsBulkRevoking(true)}
                                                className="text-red-600 hover:text-red-700 font-medium flex items-center space-x-1 transition-colors"
                                            >
                                                <UserMinus className="h-4 w-4" />
                                                <span>Убрать выбранных ({selectedExistingUsers.length})</span>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="space-y-3">
                                {loading && usersWithAccess.length === 0 ? (
                                    <div className="animate-pulse space-y-3">
                                        {[1, 2].map(i => <div key={i} className="h-12 bg-gray-100 rounded-lg"></div>)}
                                    </div>
                                ) : usersWithAccess.length <= 1 && usersWithAccess.every(u => u.role === 'owner') ? (
                                    <div className="text-sm text-gray-500 italic">Только у вас</div>
                                ) : (
                                    usersWithAccess.map(user => {
                                        const roleNames = {
                                            viewer: 'Читатель',
                                            editor: 'Редактор',
                                            owner: 'Владелец'
                                        };
                                        const inheritedPermission = isInheritedPermission(user);
                                        const inheritedFolderName = user.inherited_from_folder_name || user.inherited_from?.name || user.source_folder_name;
                                        const isUserSelected = selectedExistingUsers.includes(user.id);
                                        return (
                                            <div key={user.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 transition-colors">
                                                <div className="flex items-center flex-1">
                                                    {isOwner && user.role !== 'owner' && (
                                                        <input
                                                            type="checkbox"
                                                            checked={isUserSelected}
                                                            onChange={() => toggleExistingUserSelection(user.id)}
                                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4 mr-3 cursor-pointer"
                                                        />
                                                    )}
                                                    <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-sm mr-3">
                                                        {(user.first_name?.[0] || user.username?.[0] || '?').toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div className="font-medium text-gray-900">
                                                            {[user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.username}
                                                        </div>
                                                        {inheritedPermission ? (
                                                            <div className="mt-0.5 text-xs text-gray-500">
                                                                {inheritedFolderName ? `Доступ наследуется от папки «${inheritedFolderName}»` : 'Доступ наследуется от родительской папки'}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                </div>
                                                <div className="flex items-center space-x-3">
                                                    {isOwner && !inheritedPermission ? (
                                                        <>
                                                            <AppSelect
                                                                value={user.role}
                                                                onChange={async (newRole) => {
                                                                    try {
                                                                        const resourceType = isFolder ? 'folder' : 'file';
                                                                        await updatePermission(file.id, user.id, newRole, resourceType);
                                                                        addToast(`Права для ${user.full_name || user.username} изменены`, 'success');
                                                                        fetchUsers();
                                                                        document.dispatchEvent(new CustomEvent('alem-drive-folders-updated'));
                                                                    } catch (err) {
                                                                        console.error("Failed to update permission", err);
                                                                        addToast("Не удалось изменить права", 'error');
                                                                    }
                                                                }}
                                                                options={[{ value: 'viewer', label: 'Читатель' }, { value: 'editor', label: 'Редактор' }, { value: 'owner', label: 'Владелец' }]}
                                                                showButtonAvatar={false}
                                                                showOptionAvatar={false}
                                                                ariaLabel={`Права для ${user.full_name || user.username}`}
                                                                className="w-[126px]"
                                                                buttonClassName="!h-8 !rounded-lg !border-gray-200 !bg-gray-50 !px-2 !text-xs !font-medium !text-gray-600"
                                                                menuClassName="!w-[156px]"
                                                            />
                                                            {user.role !== 'owner' && (
                                                                <button
                                                                    onClick={() => handleRevoke(user)}
                                                                    className="text-red-500 bg-red-50 hover:bg-red-100 p-2 rounded-lg transition-colors"
                                                                    title="Закрыть доступ"
                                                                >
                                                                    <UserMinus className="h-4 w-4" />
                                                                </button>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-medium text-gray-500">
                                                                {roleNames[user.role] || user.role}
                                                            </span>
                                                            {inheritedPermission ? <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">Наследуется</span> : null}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                            {/* Pagination controls */}
                            {usersWithAccessTotal > usersWithAccessLimit && (
                                <div className="flex items-center justify-between pt-3 mt-2 border-t border-gray-100 text-xs text-gray-500">
                                    <div>
                                        Показаны {((usersWithAccessPage - 1) * usersWithAccessLimit) + 1}–{Math.min(usersWithAccessPage * usersWithAccessLimit, usersWithAccessTotal)} из {usersWithAccessTotal}
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <button
                                            type="button"
                                            disabled={usersWithAccessPage <= 1 || loading}
                                            onClick={() => fetchUsers(usersWithAccessPage - 1)}
                                            className="p-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                            title="Предыдущая страница"
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                        </button>
                                        <span className="font-medium text-gray-700">
                                            Страница {usersWithAccessPage} из {Math.ceil(usersWithAccessTotal / usersWithAccessLimit)}
                                        </span>
                                        <button
                                            type="button"
                                            disabled={usersWithAccessPage >= Math.ceil(usersWithAccessTotal / usersWithAccessLimit) || loading}
                                            onClick={() => fetchUsers(usersWithAccessPage + 1)}
                                            className="p-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                            title="Следующая страница"
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {isOwner && <hr className="border-gray-100" />}

                        {/* Section: Add people — только для владельца */}
                        {isOwner && (
                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Добавить пользователей</h4>
                                {filteredUsers.length > 0 && (
                                    <div className="flex items-center space-x-3 text-xs font-semibold">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedUsers(prev => {
                                                    const unique = new Set(prev.map(u => u.id));
                                                    filteredUsers.forEach(u => unique.add(u.id));
                                                    const allMap = [...prev, ...filteredUsers].reduce((acc, u) => {
                                                        acc[u.id] = u;
                                                        return acc;
                                                    }, {});
                                                    return Array.from(unique).map(id => allMap[id]);
                                                });
                                            }}
                                            className="text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                                        >
                                            Выбрать всех
                                        </button>
                                        {selectedUsers.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setSelectedUsers([])}
                                                className="text-red-600 hover:text-red-800 transition-colors cursor-pointer"
                                            >
                                                Убрать выбранных ({selectedUsers.length})
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="relative mb-4">
                                <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Поиск по имени..."
                                    value={query}
                                    onChange={handleSearch}
                                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white text-gray-900 placeholder-gray-400"
                                />
                            </div>
                            {usersLoadError ? (
                                <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                    <span>{usersLoadError}</span>
                                    <button type="button" onClick={() => fetchUsers(1)} disabled={loading} className="shrink-0 font-semibold underline disabled:opacity-50">Повторить</button>
                                </div>
                            ) : null}

                            <div className="max-h-60 overflow-y-auto space-y-2 mb-4 border border-gray-100 rounded-xl p-2 bg-gray-50/50">
                                {loading && filteredUsers.length === 0 ? (
                                    <div className="text-center py-4 text-gray-500 text-sm">Загрузка...</div>
                                ) : filteredUsers.length === 0 ? (
                                    <div className="text-center py-4 text-gray-500 text-sm">
                                        {usersLoadError ? 'Не удалось получить пользователей. Попробуйте загрузить список ещё раз.' : usersWithoutAccess.length === 0 ? 'Все пользователи уже имеют доступ' : 'Ничего не найдено'}
                                    </div>
                                ) : (
                                    filteredUsers.map(user => {
                                        const isSelected = selectedUsers.some(u => u.id === user.id);
                                        return (
                                            <div
                                                key={user.id}
                                                onClick={() => toggleUserSelection(user)}
                                                className={`flex items-center p-3 rounded-xl cursor-pointer transition-all ${isSelected ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-white shadow-sm'}`}
                                            >
                                                <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-bold text-xs mr-3">
                                                    {(user.first_name?.[0] || user.username?.[0] || '?').toUpperCase()}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="font-medium text-gray-900">
                                                        {[user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.username}
                                                    </div>
                                                </div>
                                                {isSelected ? (
                                                    <Check className="h-5 w-5 text-blue-600" />
                                                ) : (
                                                    <UserPlus className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100" />
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            <div className="flex items-end space-x-3">
                                <div className="flex-1 space-y-1">
                                    <label className="text-xs font-medium text-gray-500 ml-1">Роль доступа</label>
                                    <AppSelect
                                        value={selectedRole}
                                        onChange={setSelectedRole}
                                        options={[{ value: 'viewer', label: 'Читатель' }, { value: 'editor', label: 'Редактор' }, { value: 'owner', label: 'Владелец' }]}
                                        showButtonAvatar={false}
                                        showOptionAvatar={false}
                                        ariaLabel="Роль доступа"
                                        buttonClassName="!h-[42px] !rounded-xl !bg-white !text-sm !text-gray-900"
                                    />
                                </div>
                                <button
                                    onClick={handleShare}
                                    disabled={selectedUsers.length === 0 || sharing}
                                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-200 h-[42px]"
                                >
                                    {sharing ? '...' : (selectedUsers.length > 0 ? `Добавить (${selectedUsers.length})` : 'Добавить')}
                                </button>
                            </div>
                        </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default ShareModal;
