import client from './client';

export const listFiles = async (folderId = 'root', params = {}) => {
    const response = await client.get(`/drive/folders/${folderId}/children`, { params });
    const data = response.data;
    console.log(`Raw files API data (folder: ${folderId}):`, data);

    let rawItems = [];

    if (Array.isArray(data)) {
        rawItems = data;
    } else if (data && typeof data === 'object') {
        // Try to find the array in common properties
        if (Array.isArray(data.children)) {
            rawItems = data.children;
        } else if (Array.isArray(data.items)) {
            rawItems = data.items;
        } else if (Array.isArray(data.files) || Array.isArray(data.folders)) {
            // Merge files and folders if separate
            const f = data.files || [];
            const d = data.folders || [];
            rawItems = [...d, ...f];
        } else {
            // Fallback: check if data itself is a paginated response with data property
            if (Array.isArray(data.data)) {
                rawItems = data.data;
            }
        }
    }

    return rawItems.map(item => {
        const actualItem = item.file || item.folder || item;

        let type = actualItem.type || 'file';
        // Improved type detection
        if (item.folder) type = 'dir';
        if (item.type === 'folder' || item.type === 'dir') type = 'dir';
        if (actualItem.mime_type === 'application/x-directory') type = 'dir';
        if (actualItem.is_folder) type = 'dir'; // Common flag

        return {
            ...actualItem,
            id: actualItem.id || item.id, // Ensure ID is captured
            name: actualItem.name || actualItem.real_name || 'Untitled',
            type: type
        };
    });
};

export const getFile = async (fileId) => {
    const response = await client.get(`/drive/files/${fileId}`);
    const actualItem = response.data;
    let type = actualItem.type || 'file';

    // Improved type detection logic (reused)
    if (actualItem.folder) type = 'dir';
    if (actualItem.type === 'folder' || actualItem.type === 'dir') type = 'dir';
    if (actualItem.mime_type === 'application/x-directory') type = 'dir';
    if (actualItem.is_folder) type = 'dir';

    return {
        ...actualItem,
        id: actualItem.id || fileId,
        name: actualItem.name || actualItem.real_name || 'Untitled',
        type: type
    };
};

export const uploadFile = async (file, folderId = 'root', onProgress) => {
    const formData = new FormData();
    formData.append('file', file);
    if (folderId !== 'root') {
        formData.append('folder_id', folderId);
    }

    const response = await client.post('/drive/files', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
            if (onProgress && progressEvent.total) {
                const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                onProgress(percentCompleted);
            }
        }
    });
    const newItem = response.data;
    return {
        ...newItem,
        name: newItem.name || newItem.real_name || 'Untitled'
    };
};

export const deleteFile = async (fileId) => {
    const response = await client.delete(`/drive/files/${fileId}`);
    return response.data;
};

export const deleteFolder = async (folderId) => {
    // Add recursive=true to allow deleting non-empty folders
    const response = await client.delete(`/drive/folders/${folderId}?recursive=true`);
    return response.data;
};

export const getDownloadUrl = (fileId) => {
    // The browser loads media previews directly from the backend.
    const baseUrl = `${client.defaults.baseURL}/drive/files/${fileId}/download`;
    return baseUrl;
};

export const createFolder = async (name, parentId = 'root') => {
    const response = await client.post('/drive/folders', {
        name,
        parent_id: parentId === 'root' ? null : parentId
    });
    return response.data;
};

export const updateFolder = async (folderId, name) => {
    const response = await client.put(`/drive/folders/${folderId}`, { name });
    return response.data;
};

export const exportFolderAccessReport = async (folderId) => {
    const response = await client.get(`/drive/folders/${folderId}/access-report`, {
        responseType: 'blob'
    });

    const disposition = response.headers['content-disposition'] || '';
    const match = disposition.match(/filename="?([^"]+)"?/i);
    const fileName = match?.[1] || `folder-${folderId}-access-report.csv`;

    const blob = response.data instanceof Blob
        ? response.data
        : new Blob([response.data], { type: response.headers['content-type'] || 'application/octet-stream' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
};

export const updateFile = async (fileId, name) => {
    const response = await client.put(`/drive/files/${fileId}`, { name });
    return response.data;
};

export const fetchDownloadUrl = async (objectName) => {
    const response = await client.get('/files/url', { params: { object_name: objectName } });
    return response.data;
};

// Helper to normalize item structure
const normalizeItems = (items) => {
    if (!Array.isArray(items)) return [];
    return items.map(item => {
        const actualItem = item.file || item.folder || item;
        let type = actualItem.type || 'file';

        // Use the wrapper type if available to determine directory vs file
        if (item.type === 'folder') {
            type = 'dir';
        } else if (item.folder) {
            type = 'dir';
        } else if (actualItem.mime_type === 'application/x-directory') {
            type = 'dir';
        }

        return {
            ...actualItem,
            name: actualItem.name || actualItem.real_name || 'Untitled',
            type: type
        };
    });
};

export const listSharedItems = async (params = {}) => {
    const response = await client.get('/drive/items/shared', { params });
    const data = response.data;
    // Expected structure: array of items under 'shared' key or usage of specific endpoint returning array
    // Based on user request "http://.../get_drive_items_shared", assuming it returns string or list directly or wrapped.
    // If it returns { shared: [...] } or just [...]?
    // User showed JSON { own: [...], shared: [...] } for /drive/items.
    // Assuming /drive/items/shared returns just the array or { shared: [...] }.
    // Let's assume it returns { shared: [...] } or just array based on standard swaggers, but let's be safe.
    // Actually, usually specific endpoints return the list. Let's try to handle both.

    let items = [];
    if (Array.isArray(data)) items = data;
    else if (data.shared && Array.isArray(data.shared)) items = data.shared;
    // Fallback if the user meant filtering the main endpoint:
    // But they linked specific endpoints. Let's trust the endpoint returns data.

    return normalizeItems(items);
};

export const listOwnItems = async (params = {}) => {
    const response = await client.get('/drive/items/own', { params });
    const data = response.data;

    let items = [];
    if (Array.isArray(data)) items = data;
    else if (data.own && Array.isArray(data.own)) items = data.own;

    return normalizeItems(items);
};

export const listAllItems = async (params = {}) => {
    const response = await client.get('/drive/items', { params });
    const data = response.data || {};
    return normalizeItems([...(Array.isArray(data.own) ? data.own : []), ...(Array.isArray(data.shared) ? data.shared : [])]);
};

export const listRecentFiles = async (limit = 10, offset = 0, extraParams = {}) => {
    const response = await client.get('/drive/recent', {
        params: { limit, offset, ...extraParams }
    });
    const data = response.data;

    let items = [];
    if (Array.isArray(data)) items = data;
    // Handle potential wrapper if needed, similar to logic above

    return normalizeItems(items);
};

export const grantPermission = async (fileId, userIdOrIds, role = 'viewer', resourceType = 'file') => {
    const userIds = Array.isArray(userIdOrIds) ? userIdOrIds : [userIdOrIds];
    const response = await client.post('/drive/permissions', {
        resource_id: fileId,
        user_id: userIds,
        role: role,
        resource_type: resourceType
    });
    return response.data;
    return response.data;
};

export const updatePermission = async (fileId, userId, role, resourceType = 'file') => {
    // The API expects user_id as an array for PUT as well? The example showed user_id: [0].
    // Let's assume it wants an array or single ID. The example used an array [0].
    // But logically updating usually targets one user or multiple.
    // I will wrap userId in array if it's not one, to match the example structure.
    const userIds = Array.isArray(userId) ? userId : [userId];

    const response = await client.put('/drive/permissions', {
        resource_id: fileId,
        user_id: userIds,
        role: role,
        resource_type: resourceType
    });
    return response.data;
};

export const revokePermission = async (fileId, userId, resourceType = 'file') => {
    const userIds = Array.isArray(userId) ? userId : [userId];
    const response = await client.delete('/drive/permissions', {
        data: {
            resource_id: fileId,
            user_id: userIds,
            resource_type: resourceType
        }
    });
    return response.data;
};

export const getUsersWithAccess = async (resourceId, resourceType = 'file', options = {}) => {
    let params = {
        resource_id: resourceId,
        resource_type: resourceType,
    };

    if (typeof options === 'object' && options !== null) {
        if (options.page) params.page = options.page;
        if (options.limit) params.limit = options.limit;
        if (options.offset !== undefined) params.offset = options.offset;
        if (options.paginated) params.paginated = options.paginated;
        if (options.q) params.q = options.q;
        if (options.search) params.search = options.search;
    }

    const response = await client.get('/drive/permissions/users-with-access', { params });
    const { data } = response;

    if (Array.isArray(data)) {
        const arr = [...data];
        arr.items = data;
        arr.total = data.length;
        arr.page = 1;
        arr.limit = data.length;
        arr.offset = 0;
        return arr;
    }

    const items = Array.isArray(data?.items) ? data.items : [];
    const total = data?.total ?? items.length;
    const page = data?.page ?? 1;
    const limit = data?.limit ?? 20;
    const offset = data?.offset ?? 0;

    return {
        items,
        total,
        page,
        limit,
        offset,
        length: items.length
    };
};

export const getUsersWithoutAccess = async (resourceId, resourceType = 'file') => {
    const response = await client.get('/drive/permissions/users-without-access', {
        params: { resource_id: resourceId, resource_type: resourceType }
    });
    const candidateKeys = ['items', 'users', 'results', 'without_access', 'users_without_access', 'data'];
    const findUsers = (value, depth = 0) => {
        if (Array.isArray(value)) return value;
        if (!value || typeof value !== 'object' || depth > 3) return null;
        for (const key of candidateKeys) {
            const result = findUsers(value[key], depth + 1);
            if (result) return result;
        }
        return null;
    };
    return findUsers(response.data) || [];
};

export const getFileTypes = async () => {
    const response = await client.get('/drive/file-types');
    return response.data;
};

export const getMyPermission = async (resourceId, resourceType = 'file') => {
    try {
        const response = await client.get('/drive/permissions/my', {
            params: { resource_id: resourceId, resource_type: resourceType }
        });
        return response.data;
    } catch (error) {
        if (error?.response?.status === 404) {
            return { role: 'viewer' };
        }
        throw error;
    }
};

export const createShareLink = async (resourceId, resourceType = 'file', role = 'viewer', expiresInSec = 0) => {
    const response = await client.post('/drive/share/link', {
        resource_id: resourceId,
        resource_type: resourceType,
        role: role,
        expires_in_sec: expiresInSec
    });
    return response.data;
};

export const revokeShareLink = async (token) => {
    const response = await client.delete(`/drive/share/link/${encodeURIComponent(token)}`);
    return response.data;
};

export const getSharedUsers = async () => {
    const response = await client.get('/drive/shared/users');
    return response.data;
};

export const getPublicItem = async (token) => {
    const response = await client.get(`/public/drive/items/${token}`);
    return response.data;
};

export const acceptPublicLink = async (token) => {
    const response = await client.post(`/drive/share/link/${token}/accept`);
    return response.data;
};

export const copyItem = async (resourceId, resourceType, targetParentId) => {
    const response = await client.post('/drive/items/copy', {
        resource_id: resourceId,
        resource_type: resourceType,
        target_parent_id: targetParentId === 'root' ? null : targetParentId
    });
    return response.data;
};

export const moveItem = async (resourceId, resourceType, targetParentId) => {
    const response = await client.post('/drive/items/move', {
        resource_id: resourceId,
        resource_type: resourceType,
        target_parent_id: targetParentId === 'root' ? null : targetParentId
    });
    return response.data;
};

export const getFolder = async (folderId) => {
    const response = await client.get(`/drive/folders/${folderId}`);
    return response.data;
};

export const getDriveActivity = async ({ folderId = null, limit = 20, offset = 0 } = {}) => {
    const response = await client.get('/drive/activity', {
        params: {
            ...(folderId && folderId !== 'root' ? { folder_id: folderId } : {}),
            limit,
            offset
        }
    });
    const data = response.data || {};
    return {
        items: Array.isArray(data.items) ? data.items : [],
        page: Number.isFinite(data.page) ? data.page : 1,
        limit: Number.isFinite(data.limit) ? data.limit : limit,
        total_count: Number.isFinite(data.total_count) ? data.total_count : 0,
        total_pages: Number.isFinite(data.total_pages) ? data.total_pages : 0,
        has_next: Boolean(data.has_next),
        has_prev: Boolean(data.has_prev)
    };
};

export const searchDrive = async (q, type = '', limit = 100, page = 1) => {
    const response = await client.get('/drive/search', {
        params: { q, type, limit, page }
    });
    return normalizeItems(response.data);
};

export const getDriveSummary = async () => {
    const response = await client.get('/drive/summary');
    return response.data || {};
};

export const listFavoriteItems = async (params = {}) => {
    const response = await client.get('/drive/favorites', { params });
    return normalizeItems(response.data);
};

export const addFavorite = async (resourceId, resourceType = 'file') => {
    const response = await client.post('/drive/favorites', {
        resource_id: resourceId,
        resource_type: resourceType
    });
    return response.data;
};

export const removeFavorite = async (resourceId, resourceType = 'file') => {
    const response = await client.delete(`/drive/favorites/${resourceType}/${resourceId}`);
    return response.data;
};

export const listTrashItems = async (params = {}) => {
    const response = await client.get('/drive/trash', { params });
    const items = Array.isArray(response.data) ? response.data : [];
    return items.map((entry) => ({
        ...normalizeItems([entry])[0],
        deleted_at: entry.deleted_at
    }));
};

export const restoreTrashItem = async (resourceId, resourceType = 'file') => {
    const response = await client.post(`/drive/trash/${resourceType}/${resourceId}/restore`);
    return response.data;
};

export const downloadFile = async (fileId, fileName = 'file') => {
    const response = await client.get(`/drive/files/${fileId}/download`, { responseType: 'blob' });
    const blob = response.data instanceof Blob
        ? response.data
        : new Blob([response.data], { type: response.headers['content-type'] || 'application/octet-stream' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
};
