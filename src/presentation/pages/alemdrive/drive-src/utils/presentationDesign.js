// Shared design of Deep Research presentations: one theme for the whole deck,
// used by the on-screen slides (NotebookLlmContent) and the .pptx export.

export const PRESENTATION_THEME_STORAGE_KEY = 'notebook_presentation_theme';

// Colors are hex without '#', as PptxGenJS expects; css() adds it.
export const PRESENTATION_THEMES = [
    { id: 'light', bg: 'FFFFFF', surface: 'F5F6FA', text: '17202E', muted: '586174', accent: '4F46E5', accentSoft: 'EEF0FF', onAccent: 'FFFFFF', border: 'E6EAF1' },
    { id: 'business', bg: 'F4F6FA', surface: 'FFFFFF', text: '0B1F3A', muted: '51607A', accent: '1D4ED8', accentSoft: 'E3EBFF', onAccent: 'FFFFFF', border: 'DCE3EE', band: true },
    { id: 'warm', bg: 'FFF8F0', surface: 'FFFFFF', text: '2B1D12', muted: '7A6250', accent: 'C2410C', accentSoft: 'FDEBDD', onAccent: 'FFFFFF', border: 'F1E1D2' },
    { id: 'dark', bg: '0F172A', surface: '1E293B', text: 'F1F5F9', muted: '94A3B8', accent: '38BDF8', accentSoft: '0C2A3E', onAccent: '0F172A', border: '334155', dark: true },
];

export const css = (hex) => `#${hex}`;

export function getPresentationTheme(id) {
    return PRESENTATION_THEMES.find((theme) => theme.id === id) || PRESENTATION_THEMES[0];
}

export function readPresentationTheme(storage) {
    try {
        return getPresentationTheme(storage?.getItem(PRESENTATION_THEME_STORAGE_KEY)).id;
    } catch {
        return PRESENTATION_THEMES[0].id;
    }
}

export function storePresentationTheme(storage, id) {
    try {
        storage?.setItem(PRESENTATION_THEME_STORAGE_KEY, id);
    } catch {
        // a convenience only
    }
}

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;
const ORDERED = /^\s*\d+[.)]\s+/;
// "Text — [file, lines 1–2](url) and [other](url).": the dash and the
// conjunctions only separate citations, which render as number chips.
const LINK_SRC = '\\[[^\\]]+\\]\\([^)\\s]+\\)';
const JOIN_SRC = '\\s*(?:,|;|и|және|and)?\\s*'; // i18n-ignore
const DASH_BEFORE_LINK = new RegExp(`\\s*[—–-]\\s*(?=${LINK_SRC}(?:${JOIN_SRC}${LINK_SRC})*\\s*[.;,]?\\s*$)`);
const JOIN_BETWEEN_LINKS = new RegExp(`(${LINK_SRC})${JOIN_SRC}(?=${LINK_SRC})`, 'g');
const tidyCitations = (text) => text.replace(JOIN_BETWEEN_LINKS, '$1').replace(DASH_BEFORE_LINK, ' ').trim();

export function slideBullets(body) {
    if (!body || typeof body !== 'string') return { items: [], ordered: false };
    const lines = body.split('\n').filter((line) => BULLET.test(line) && !/^\s{2,}/.test(line));
    return {
        items: lines.map((line) => tidyCitations(line.replace(BULLET, ''))).filter(Boolean),
        ordered: lines.length > 0 && lines.every((line) => ORDERED.test(line)),
    };
}

export function slideParagraphs(body) {
    if (!body || typeof body !== 'string') return [];
    return body
        .split(/\n{2,}/)
        .map((chunk) => chunk.trim())
        .filter((chunk) => chunk && !BULLET.test(chunk) && !/^```/.test(chunk) && !/^\|/.test(chunk) && !/^#{1,6}\s/.test(chunk))
        .map(tidyCitations);
}

const STEP_TITLE = /процесс|этап|шаг|порядок|хронолог|план|алгоритм|процедур|кезең|қадам|process|steps?|timeline|roadmap/i; // i18n-ignore
const CLOSING_TITLE = /итог|вывод|заключ|рекомендац|следующ|қорытынд|summary|conclusion|next steps/i; // i18n-ignore

// Layout of one slide. Content that is neither bullets nor paragraphs (tables,
// diagrams, code, nested lists) is rendered as Markdown, never dropped.
export function slideLayout(slide, index, total) {
    const body = slide?.body || '';
    if (/```mermaid/i.test(body) || /^\|.+\|\s*$/m.test(body) || /^\s{2,}(?:[-*]|\d+[.)])\s+/m.test(body) || /^#{3,6}\s/m.test(body)) return 'markdown';
    const { items, ordered } = slideBullets(body);
    if (index === 0) return 'cover';
    if (items.length && (ordered || STEP_TITLE.test(slide.title || ''))) return 'steps';
    if (index === total - 1 && CLOSING_TITLE.test(slide.title || '')) return 'summary';
    if (items.length >= 4) return 'cards';
    return 'list';
}

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const isCitationHref = (href) => /[?&]start_line=\d+/.test(href) && /[?&]source=/.test(href);

// For .pptx: citation links become [n] and are listed once per slide.
export function plainSlideText(markdown, registry) {
    return String(markdown || '')
        .replace(LINK, (whole, label, href) => {
            if (!isCitationHref(href)) return label;
            if (!registry.has(href)) registry.set(href, { n: registry.size + 1, label });
            return `[${registry.get(href).n}]`;
        })
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*\n]+)\*/g, '$1')
        .replace(/\s+\[(\d+)\]/g, ' [$1]')
        .trim();
}

const ranges = (numbers) => {
    const parts = [];
    numbers.forEach((value) => {
        const last = parts[parts.length - 1];
        if (last && value === last[1] + 1) last[1] = value;
        else parts.push([value, value]);
    });
    return parts.map(([from, to]) => (from === to ? String(from) : `${from}–${to}`)).join(', ');
};

// Footer of a .pptx slide: one entry per source file, e.g. "[1–3] report.docx".
export function citationFooter(registry) {
    const files = new Map();
    for (const { n, label } of registry.values()) {
        const name = label.replace(/,\s*\S+\s+\d+(?:\s*[–-]\s*\d+)?\s*$/, '').trim() || label;
        if (!files.has(name)) files.set(name, []);
        files.get(name).push(n);
    }
    return [...files.entries()].map(([name, numbers]) => `[${ranges(numbers)}] ${name}`).join('    ');
}
