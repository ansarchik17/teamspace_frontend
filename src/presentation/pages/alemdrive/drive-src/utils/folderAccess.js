/** Folder URLs never imply ownership, including URLs under My Drive. */
export function canWriteFolder(mode, folderId, permission) {
    if (mode === 'trash') return false;
    if (folderId === 'root') return mode === 'my-drive';
    return permission?.role === 'owner' || permission?.role === 'editor';
}
