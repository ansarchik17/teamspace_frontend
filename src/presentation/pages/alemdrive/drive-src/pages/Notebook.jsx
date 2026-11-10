import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { AlertCircle, Loader2, RefreshCcw, Trash2, X } from 'lucide-react';
import { uploadFile } from '../api/files';
import { getMe } from '../api/auth';
import { NOTEBOOK_DRIVE_FOLDER_ID } from '../constants/notebookDrive';
import { listNotebookChats, createNotebookChat, deleteNotebookChat } from '../api/notebookChats';
import { useToast } from '../components/Toast';
import NotebookLlmContent from '../components/NotebookLlmContent';
import NotebookDashboard, { getChatId } from '../components/NotebookDashboard';
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FOCUS_RING, ICON_BUTTON } from '../components/driveUi';

// Module-level cache to persist chats across page navigation (unmounts)
let cachedChats = null;
const EMPTY_FILES = [];

const Notebook = () => {
    const files = EMPTY_FILES; // Local empty array for backward compatibility
    const [chats, setChats] = useState(() => cachedChats || []);
    const [loading, setLoading] = useState(() => !cachedChats);
    const [error, setError] = useState(null);
    const [searchParams, setSearchParams] = useSearchParams();
    const selectedChatId = searchParams.get('chat');
    const setSelectedChatId = useCallback((id) => {
        setSearchParams((current) => {
            const next = new URLSearchParams(current);
            if (id) next.set('chat', id);
            else next.delete('chat');
            return next;
        });
    }, [setSearchParams]);
    const [searchQuery, setSearchQuery] = useState('');
    const [creatingChat, setCreatingChat] = useState(false);
    const [chatNameModalOpen, setChatNameModalOpen] = useState(false);
    const [chatNameInput, setChatNameInput] = useState('');
    const [chatNameSuggested, setChatNameSuggested] = useState('Чат Deep Research Assistant');
    const [notebookImportBusy, setNotebookImportBusy] = useState(false);
    const { addToast } = useToast();

    const [dashboardSearch, setDashboardSearch] = useState('');
    const [user, setUser] = useState(null);
    const [chatToDelete, setChatToDelete] = useState(null);
    const [deletingChat, setDeletingChat] = useState(false);

    useEffect(() => {
        getMe().then(setUser).catch((err) => console.error('Failed to load current user', err));
    }, []);

    // The workspace header search filters notebooks while this page is open.
    useEffect(() => {
        const handleSearch = (event) => setDashboardSearch(String(event.detail || ''));
        document.addEventListener('alem-drive-search', handleSearch);
        return () => document.removeEventListener('alem-drive-search', handleSearch);
    }, []);

    const refreshNotebookFiles = useCallback(async () => {
        // No-op: files are loaded on-demand per folder in the workspace explorer
    }, []);

    const handleImportNotebookFile = useCallback(
        async (file) => {
            const n = (file?.name || '').toLowerCase();
            const ok =
                n.endsWith('.txt') ||
                n.endsWith('.md') ||
                n.endsWith('.docx') ||
                n.endsWith('.pdf') ||
                n.endsWith('.pptx') ||
                n.endsWith('.ppt') ||
                n.endsWith('.xlsx') ||
                n.endsWith('.xls') ||
                n.endsWith('.xlsm');
            if (!ok) {
                addToast('Допустимые форматы: .txt, .md, .docx, .pdf, .pptx, .ppt, .xlsx, .xls, .xlsm', 'warning');
                return;
            }
            setNotebookImportBusy(true);
            try {
                const uploaded = await uploadFile(file, NOTEBOOK_DRIVE_FOLDER_ID);
                addToast(`Файл «${file.name}» загружен`, 'success');
                await refreshNotebookFiles();
                return uploaded?.data || uploaded;
            } catch (err) {
                console.error('Notebook file upload failed', err);
                addToast('Не удалось загрузить файл. Повторите попытку', 'error');
                return null;
            } finally {
                setNotebookImportBusy(false);
            }
        },
        [addToast, refreshNotebookFiles]
    );

    useEffect(() => {
        const load = async () => {
            try {
                if (!cachedChats) {
                    setLoading(true);
                }
                const chatsData = await listNotebookChats();
                const rawChats = Array.isArray(chatsData?.data)
                    ? chatsData.data
                    : Array.isArray(chatsData?.chats)
                        ? chatsData.chats
                        : Array.isArray(chatsData)
                            ? chatsData
                            : [];
                setChats(rawChats);
                cachedChats = rawChats;
                // Keep selectedChatId as null so the grid dashboard is showed initially
            } catch (err) {
                console.error('Failed to load chats for Deep Research Assistant', err);
                if (!cachedChats) {
                    setError('Не удалось загрузить блокноты');
                }
            } finally {
                setLoading(false);
            }
        };
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const openCreateChatModal = () => {
        const suggestedTitle = `Новый блокнот ${chats.length + 1}`;
        setChatNameSuggested(suggestedTitle);
        setChatNameInput(suggestedTitle);
        setChatNameModalOpen(true);
    };

    const handleConfirmCreateChat = async () => {
        try {
            setCreatingChat(true);
            const title = (chatNameInput || chatNameSuggested || 'Чат Deep Research Assistant').trim();
            const data = await createNotebookChat(title);
            const newChat = data?.data || data;
            if (!newChat) return;
            setChats((prev) => {
                const next = [...prev, newChat];
                cachedChats = next;
                return next;
            });
            const id = newChat.id || newChat.chat_id || newChat.uuid || newChat.chatId;
            if (id) setSelectedChatId(id);
            setChatNameModalOpen(false);
        } catch (err) {
            console.error('Failed to create Notebook chat', err);
            addToast('Не удалось создать блокнот. Повторите попытку', 'error');
        } finally {
            setCreatingChat(false);
        }
    };

    const confirmDeleteChat = async () => {
        if (!chatToDelete) return;
        const id = getChatId(chatToDelete);
        const title = chatToDelete.title || 'Без названия';
        try {
            setDeletingChat(true);
            await deleteNotebookChat(id);
            setChats((prev) => {
                const next = prev.filter((chat) => getChatId(chat) !== id);
                cachedChats = next;
                return next;
            });
            if (selectedChatId === id) setSelectedChatId(null);
            addToast(`Блокнот «${title}» удалён`, 'success');
            setChatToDelete(null);
        } catch (err) {
            console.error('Failed to delete notebook chat', err);
            addToast('Не удалось удалить блокнот. Повторите попытку', 'error');
        } finally {
            setDeletingChat(false);
        }
    };

    const rootClass = 'flex h-full min-h-0 w-full min-w-0 flex-col bg-white font-[Inter,sans-serif] text-[#17202E] antialiased';

    if (loading) {
        return (
            <div className={clsx(rootClass, 'items-center justify-center gap-2')}>
                <Loader2 className="h-6 w-6 animate-spin text-[#2458D3]" />
                <p className="text-[14px] text-[#586174]">Загружаем блокноты…</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className={clsx(rootClass, 'items-center justify-center px-4 text-center')}>
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FFF0F0]">
                    <AlertCircle className="h-7 w-7 text-[#C03437]" strokeWidth={1.75} />
                </span>
                <p className="mt-4 text-[14px] text-[#17202E]">{error}. Повторите попытку</p>
                <button type="button" onClick={() => window.location.reload()} className={clsx(BUTTON_SECONDARY, 'mt-4 h-9')}>
                    <RefreshCcw className="h-5 w-5" strokeWidth={1.75} /> Повторить
                </button>
            </div>
        );
    }

    return (
        <div className={rootClass}>
            {selectedChatId ? (
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                    <NotebookLlmContent
                        files={files}
                        embedded
                        activeChatId={selectedChatId}
                        chats={chats}
                        onSelectChat={setSelectedChatId}
                        onCreateChat={openCreateChatModal}
                        creatingChat={creatingChat}
                        chatSearchQuery={searchQuery}
                        onChatSearchChange={setSearchQuery}
                        onImportNotebookFile={handleImportNotebookFile}
                        notebookImportBusy={notebookImportBusy}
                        onBack={() => setSelectedChatId(null)}
                    />
                </div>
            ) : (
                <NotebookDashboard
                    chats={chats}
                    user={user}
                    search={dashboardSearch}
                    onSearchChange={setDashboardSearch}
                    onOpenChat={(chat) => setSelectedChatId(getChatId(chat))}
                    onCreate={openCreateChatModal}
                    onDeleteChat={setChatToDelete}
                />
            )}

            {chatNameModalOpen &&
                createPortal(
                    <div
                        className="ts-legacy-backdrop fixed inset-0 z-[1000] flex items-center justify-center bg-[#17202E]/40 p-4 font-[Inter,sans-serif] antialiased"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="notebook-new-chat-title"
                        onKeyDown={(event) => { if (event.key === 'Escape' && !creatingChat) setChatNameModalOpen(false); }}
                    >
                        <form
                            onSubmit={(event) => { event.preventDefault(); handleConfirmCreateChat(); }}
                            className="w-full max-w-md rounded-[12px] border border-[#E2E5EA] bg-white p-6 shadow-[0_24px_64px_rgba(23,32,46,0.18)] motion-safe:animate-[drive-menu-in_180ms_ease-out]"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <h3 id="notebook-new-chat-title" className="text-[18px] font-semibold leading-[26px] text-[#17202E]">Новый блокнот</h3>
                                    <p className="mt-1 text-[14px] leading-5 text-[#586174]">Название поможет быстро найти исследование.</p>
                                </div>
                                <button type="button" onClick={() => setChatNameModalOpen(false)} aria-label="Закрыть" className={clsx(ICON_BUTTON, 'h-8 w-8')}>
                                    <X className="h-5 w-5" strokeWidth={1.75} />
                                </button>
                            </div>
                            <label htmlFor="notebook-title" className="mt-5 block text-[14px] text-[#17202E]">Название</label>
                            <input
                                id="notebook-title"
                                type="text"
                                value={chatNameInput}
                                onChange={(e) => setChatNameInput(e.target.value)}
                                placeholder={chatNameSuggested}
                                autoFocus
                                className="mt-1.5 h-9 w-full rounded-[6px] border border-[#7B8494] px-3 text-[14px] text-[#17202E] placeholder:text-[#586174] focus:border-[#2458D3] focus:outline-2 focus:outline-offset-2 focus:outline-[#2458D3]"
                            />
                            <div className="mt-6 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => { setChatNameModalOpen(false); setChatNameInput(''); }}
                                    disabled={creatingChat}
                                    className={clsx(BUTTON_SECONDARY, 'h-9')}
                                >
                                    Отмена
                                </button>
                                <button type="submit" disabled={creatingChat || !chatNameInput.trim()} className={clsx(BUTTON_PRIMARY, 'h-9 min-w-[128px]')}>
                                    {creatingChat ? <><Loader2 className="h-4 w-4 animate-spin" /> Создаём…</> : 'Создать'}
                                </button>
                            </div>
                        </form>
                    </div>,
                    document.body
                )}

            {chatToDelete &&
                createPortal(
                    <div
                        className="ts-legacy-backdrop fixed inset-0 z-[1000] flex items-center justify-center bg-[#17202E]/40 p-4 font-[Inter,sans-serif] antialiased"
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="notebook-delete-title"
                    >
                        <div className="ts-legacy-dialog w-full max-w-md rounded-[12px] border border-[#E2E5EA] bg-white p-6 shadow-[0_24px_64px_rgba(23,32,46,0.18)] motion-safe:animate-[drive-menu-in_180ms_ease-out]">
                            <div className="flex items-start gap-4">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FFF0F0]">
                                    <Trash2 className="h-5 w-5 text-[#C03437]" strokeWidth={1.75} />
                                </span>
                                <div className="min-w-0">
                                    <h3 id="notebook-delete-title" className="text-[18px] font-semibold leading-[26px] text-[#17202E]">Удалить блокнот?</h3>
                                    <p className="mt-1 break-words text-[14px] leading-5 text-[#586174]">
                                        «{chatToDelete.title || 'Без названия'}» и история вопросов будут удалены. Файлы на диске останутся.
                                    </p>
                                </div>
                            </div>
                            <div className="mt-6 flex justify-end gap-2">
                                <button type="button" onClick={() => setChatToDelete(null)} disabled={deletingChat} className={clsx(BUTTON_SECONDARY, 'h-9')}>Отмена</button>
                                <button
                                    type="button"
                                    onClick={confirmDeleteChat}
                                    disabled={deletingChat}
                                    className={clsx('inline-flex h-9 min-w-[128px] items-center justify-center gap-2 rounded-[6px] bg-[#C03437] px-4 text-[14px] font-medium text-white hover:bg-[#A42B2E] disabled:cursor-not-allowed disabled:opacity-70', FOCUS_RING)}
                                >
                                    {deletingChat ? <><Loader2 className="h-4 w-4 animate-spin" /> Удаляем…</> : 'Удалить'}
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
        </div>
    );
};

export default Notebook;
