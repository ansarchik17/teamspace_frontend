import client from './client';

export async function askNotebook(chatId, payload, signal) {
    const response = await client.post(`/notebook/chats/${chatId}/ask`, payload, { signal, timeout: 240000 });
    return response.data;
}

/** Каталог карточек Студии; null, если бэкенд ещё не поддерживает пресеты. */
export async function getNotebookStudioPresets(lang) {
    try {
        const response = await client.get('/notebook/studio/presets', { params: { lang } });
        return Array.isArray(response.data) ? response.data : null;
    } catch (error) {
        if (error?.response?.status === 404) return null;
        throw error;
    }
}

export async function createNotebookAskJob(chatId, payload, signal) {
    const response = await client.post(`/notebook/chats/${chatId}/ask/jobs`, payload, { signal, timeout: 60000 });
    return response.data;
}

export async function getNotebookAskJob(chatId, jobId, signal) {
    const response = await client.get(`/notebook/chats/${chatId}/ask/jobs/${jobId}`, { signal, timeout: 30000 });
    return response.data;
}

export async function cancelNotebookAskJob(chatId, jobId) {
    const response = await client.delete(`/notebook/chats/${chatId}/ask/jobs/${jobId}`, { timeout: 30000 });
    return response.data;
}

export async function getNotebookResearchContext(chatId, payload, signal) {
    const response = await client.post(`/notebook/chats/${chatId}/context`, payload, { signal, timeout: 120000 });
    return response.data;
}

export async function getNotebookSourceExcerpt({ chatId, fileId, start, end, revision }, signal) {
    const response = await client.get(`/notebook/chats/${chatId}/sources/${fileId}`, {
        params: { start_line: start, end_line: end, revision }, signal,
    });
    return response.data;
}

// Временный дефолтный чат для синхронизации, пока список чатов пустой
export const DEFAULT_NOTEBOOK_CHAT_ID = 'cbea7b19-818c-4ce6-b9cb-2fefc22c0b41';

/** Получить список чатов Deep Research Assistant */
export async function listNotebookChats() {
    const res = await client.get('/notebook/chats');
    return res.data;
}

/** Получить сообщения конкретного чата Deep Research Assistant */
export async function getNotebookChatMessages(chatId) {
    if (!chatId) throw new Error('getNotebookChatMessages: chatId is required');
    const res = await client.get(`/notebook/chats/${chatId}/messages`);
    return res.data;
}

/**
 * Синхронизация чата после ответа ИИ.
 * Backend ожидает { assistant_message, assistant_type, user_message }.
 * assistant_type: 'text' | 'cards' | 'test' | 'table' | 'report' | 'presentation' | 'chart' | 'mermaid'
 */
export async function syncNotebookChat(chatId, { userMessage, assistantMessage, assistantType = 'text' }) {
    if (!chatId) throw new Error('syncNotebookChat: chatId is required');
    const payload = {
        user_message: userMessage,
        assistant_message: assistantMessage,
        assistant_type: assistantType,
    };
    const res = await client.post(`/notebook/chats/${chatId}/sync`, payload);
    return res.data;
}

/** Создать новый чат Deep Research Assistant */
export async function createNotebookChat(title) {
    const payload = { title };
    const res = await client.post('/notebook/chats', payload);
    return res.data;
}

/** Добавить документ в контекст чата */
export async function addChatDocument(chatId, documentId) {
    if (!chatId || !documentId) throw new Error('addChatDocument: chatId and documentId are required');
    const res = await client.post(`/notebook/chats/${chatId}/documents/${documentId}`);
    return res.data;
}

/** Получить документы в контексте чата */
export async function getChatDocuments(chatId) {
    if (!chatId) throw new Error('getChatDocuments: chatId is required');
    const res = await client.get(`/notebook/chats/${chatId}/documents`);
    return res.data;
}

/** РЎРѕС…СЂР°РЅРёС‚СЊ РїРѕР»РЅС‹Р№ СЃРїРёСЃРѕРє РґРѕРєСѓРјРµРЅС‚РѕРІ РІ РєРѕРЅС‚РµРєСЃС‚Рµ С‡Р°С‚Р° */
export async function saveChatDocuments(chatId, documentIds) {
    if (!chatId) throw new Error('saveChatDocuments: chatId is required');
    if (!Array.isArray(documentIds)) throw new Error('saveChatDocuments: documentIds must be an array');
    const res = await client.post(`/notebook/chats/${chatId}/documents`, {
        document_ids: documentIds,
    });
    return res.data;
}

/** РЈРґР°Р»РёС‚СЊ РґРѕРєСѓРјРµРЅС‚ РёР· РєРѕРЅС‚РµРєСЃС‚Р° С‡Р°С‚Р° */
export async function removeChatDocument(chatId, documentId) {
    if (!chatId || !documentId) throw new Error('removeChatDocument: chatId and documentId are required');
    const res = await client.delete(`/notebook/chats/${chatId}/documents/${documentId}`);
    return res.data;
}

/** Удалить чат/блокнот Deep Research Assistant */
export async function deleteNotebookChat(chatId) {
    if (!chatId) throw new Error('deleteNotebookChat: chatId is required');
    const res = await client.delete(`/notebook/chats/${chatId}`);
    return res.data;
}
