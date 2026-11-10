export const selectionKey = (chatId) => `notebook_active_sources:${chatId}`;

// The model occasionally annotates an option as correct. The answer key is
// parsed separately; never reveal these annotations before the user's choice.
export function cleanQuizOption(option) {
    return String(option).replace(/[✔✓✅☑]\uFE0F?/g, '')
        .replace(/\((?:правильный|верный)(?: ответ)?\)/gi, '')
        .replace(/\*\*/g, '').trim();
}

export function readNotebookSelection(storage, chatId, attachedIds) {
    const attached = new Set(attachedIds);
    try {
        const raw = storage.getItem(selectionKey(chatId));
        if (raw == null) return attached;
        const ids = JSON.parse(raw);
        return Array.isArray(ids) ? new Set(ids.filter((id) => attached.has(id))) : attached;
    } catch { return attached; }
}

export function persistNotebookSelection(storage, chatId, ids) {
    if (!chatId) return;
    try { storage.setItem(selectionKey(chatId), JSON.stringify([...ids])); } catch { /* Selection still works without browser storage. */ }
}

export function normalizeAssistantMarkdown(text) {
    if (typeof text !== 'string') return text;
    let fence = '';
    return text.split('\n').map((line) => {
        const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
        if (marker) {
            if (!fence) fence = marker;
            else if (marker.startsWith(fence)) fence = '';
            return line;
        }
        if (fence) return line;
        // A physical newline inside a GFM table row terminates the table and
        // makes citations/cells appear as raw Markdown. Keep every cell intact.
        const replacement = /^\s*\|/.test(line) ? '; ' : '\n\n';
        return line.replace(/<br\s*\/?>/gi, replacement).replace(/&lt;br\s*\/?&gt;/gi, replacement);
    }).join('\n');
}

export function normalizeMarkdownTables(text) {
    if (typeof text !== 'string') return text;
    const lines = text.split('\n');
    const result = [];
    let fenced = false;
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (/^\s*```/.test(line)) fenced = !fenced;
        if (!fenced && !line.trim() && /^\s*\|/.test(result.at(-1) || '') && /^\s*\|/.test(lines[i + 1] || '')) continue;
        // Never collapse adjacent pipes or whitespace-only cells: each is a
        // genuine column. Leave escaped pipes and fenced code untouched.
        result.push(line);
    }
    return result.join('\n');
}

export function parseNotebookCitation(href) {
    try {
        const url = new URL(href, 'https://workspace.invalid');
        if (url.origin !== 'https://workspace.invalid' || url.pathname !== '/web/drive/notebook') return null;
        const chatId = url.searchParams.get('chat');
        const fileId = url.searchParams.get('source');
        const start = Number(url.searchParams.get('start_line'));
        const end = Number(url.searchParams.get('end_line'));
		const revision = url.searchParams.get('revision') || undefined;
        const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuid.test(chatId || '') || !uuid.test(fileId || '') || !Number.isInteger(start) || start < 1 || !Number.isInteger(end) || end < start || end - start > 200) return null;
        if (revision && !/^[0-9a-f]{64}$/i.test(revision)) return null;
        return { chatId, fileId, start, end, ...(revision ? { revision } : {}) };
    } catch { return null; }
}
