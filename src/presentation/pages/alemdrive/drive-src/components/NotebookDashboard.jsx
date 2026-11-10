import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
    BookOpen,
    Briefcase,
    ChartNoAxesColumn,
    ChevronRight,
    GitCompare,
    GraduationCap,
    Layers,
    Lightbulb,
    ListChecks,
    Megaphone,
    Palette,
    Presentation,
    Scale,
    ShieldCheck,
    Table2,
    Wallet,
    Workflow,
    ExternalLink,
    FileText,
    MoreHorizontal,
    Plus,
    Rocket,
    Search,
    Settings,
    Sparkles,
    Trash2,
    Users,
    X,
} from 'lucide-react';
import ViewToggle from '../../../../../shared/ui/ViewToggle';
import DataTable, { DATA_TABLE_ROW_ICON, DataTableEmpty } from '../../../../../shared/ui/DataTable';
import { getChatDocuments, getNotebookChatMessages } from '../api/notebookChats';
import { FloatingMenu, MenuDivider, MenuItem } from './ItemActionsMenu';
import {
    Avatar,
    BUTTON_PRIMARY,
    FOCUS_RING,
    pluralize,
} from './driveUi';

export const getChatId = (chat) => chat?.id || chat?.chat_id || chat?.uuid || chat?.chatId;

// Icon tiles for notebooks. `keywords` match the notebook title/description (word stems).
const NOTEBOOK_THEMES = [
    { id: 'launch', icon: Rocket, bg: '#E3EBFD', fg: '#2458D3', stroke: 2, keywords: ['запуск', 'продукт', 'релиз', 'старт', 'launch', 'roadmap', 'дорожн'] },
    { id: 'research', icon: ChartNoAxesColumn, bg: '#D8F3E3', fg: '#1F9D5B', stroke: 3, keywords: ['рын', 'исследован', 'аналити', 'конкурент', 'метрик', 'статист', 'опрос', 'research'] },
    { id: 'knowledge', icon: BookOpen, bg: '#FDEBC2', fg: '#D98A00', stroke: 2, keywords: ['знан', 'инструкц', 'регламент', 'wiki', 'вики', 'справочн', 'документац', 'faq', 'вопрос'] },
    { id: 'people', icon: Users, bg: '#ECE8FF', fg: '#5B4BC4', stroke: 2, keywords: ['клиент', 'интервью', 'команд', 'сотрудн', 'hr', 'персонал', 'пользоват', 'отзыв'] },
    { id: 'design', icon: Palette, bg: '#FCE4F1', fg: '#C0357A', stroke: 2, keywords: ['дизайн', 'макет', 'ui', 'ux', 'визуал'] },
    { id: 'tech', icon: Settings, bg: '#EEF0F3', fg: '#586174', stroke: 2, keywords: ['архитект', 'платформ', 'техн', 'интеграц', 'api', 'разработ', 'инфраструкт', 'систем'] },
    { id: 'sales', icon: ChartNoAxesColumn, bg: '#FDDCDC', fg: '#D93A3A', stroke: 3, keywords: ['продаж', 'коммерч', 'презентац', 'предложен', 'сделк', 'sales', 'kpi'] },
    { id: 'finance', icon: Wallet, bg: '#D6F1F3', fg: '#0E7C86', stroke: 2, keywords: ['финанс', 'бюджет', 'расход', 'доход', 'бухгалт', 'отчётност', 'отчетност', 'налог'] },
    { id: 'legal', icon: Scale, bg: '#E6E9F0', fg: '#17202E', stroke: 2, keywords: ['юрид', 'договор', 'право', 'закон', 'контракт', 'legal'] },
    { id: 'marketing', icon: Megaphone, bg: '#FFE6D5', fg: '#D9572B', stroke: 2, keywords: ['маркетинг', 'реклам', 'бренд', 'smm', 'коммуникац', 'pr'] },
    { id: 'learning', icon: GraduationCap, bg: '#E0ECFF', fg: '#1D49B3', stroke: 2, keywords: ['обучен', 'курс', 'тренинг', 'онбординг', 'образован'] },
    { id: 'security', icon: ShieldCheck, bg: '#DDF3EA', fg: '#16734B', stroke: 2, keywords: ['безопасн', 'аудит', 'риск', 'комплаенс', 'security'] },
    { id: 'ideas', icon: Lightbulb, bg: '#FFF3C4', fg: '#B07A00', stroke: 2, keywords: ['идея', 'идеи', 'стратег', 'гипотез', 'инновац'] },
    { id: 'work', icon: Briefcase, bg: '#EAE7E2', fg: '#6B5B45', stroke: 2, keywords: ['проект', 'план', 'задач', 'встреч', 'протокол'] },
];

const hashString = (value) => {
    let hash = 0;
    for (const char of String(value || '')) hash = (hash * 31 + char.charCodeAt(0)) | 0;
    return Math.abs(hash);
};

// Short Latin keywords (ui, hr, api…) must be whole words; Russian stems match inside words.
const keywordMatches = (text, keyword) => (
    /^[a-z]{1,3}$/.test(keyword) ? new RegExp(`\\b${keyword}\\b`).test(text) : text.includes(keyword)
);

const matchTheme = (chat) => {
    const text = `${chat?.title || ''} ${chat?.description || ''}`.toLowerCase();
    let best = null;
    let bestScore = 0;
    NOTEBOOK_THEMES.forEach((theme) => {
        const score = theme.keywords.filter((keyword) => keywordMatches(text, keyword)).length;
        if (score > bestScore) {
            best = theme;
            bestScore = score;
        }
    });
    return best;
};

/**
 * Picks an icon per notebook: by meaning first, then the first theme not yet used,
 * so neighbouring cards differ. Assignment follows creation order to stay stable.
 */
export const assignNotebookThemes = (chats) => {
    const ordered = [...chats].sort((left, right) => new Date(left?.created_at || 0) - new Date(right?.created_at || 0));
    const result = new Map();
    const used = new Set();
    const pending = [];
    ordered.forEach((chat) => {
        const theme = matchTheme(chat);
        if (theme && !used.has(theme.id)) {
            result.set(getChatId(chat), theme);
            used.add(theme.id);
        } else {
            pending.push({ chat, preferred: theme });
        }
    });
    pending.forEach(({ chat, preferred }) => {
        const free = NOTEBOOK_THEMES.filter((theme) => !used.has(theme.id));
        const theme = free.length
            ? free[hashString(getChatId(chat) || chat?.title) % free.length]
            : preferred || NOTEBOOK_THEMES[hashString(getChatId(chat) || chat?.title) % NOTEBOOK_THEMES.length];
        result.set(getChatId(chat), theme);
        used.add(theme.id);
    });
    return result;
};

export const ThemeContext = React.createContext(new Map());

export const NotebookIcon = ({ chat, size = 56 }) => {
    const themes = React.useContext(ThemeContext);
    const theme = themes.get(getChatId(chat)) || matchTheme(chat) || NOTEBOOK_THEMES[hashString(getChatId(chat)) % NOTEBOOK_THEMES.length];
    const Icon = theme.icon;
    return (
        <span
            aria-hidden="true"
            className="inline-flex shrink-0 items-center justify-center"
            style={{ width: size, height: size, borderRadius: Math.max(6, Math.round(size * 0.3)), background: theme.bg, color: theme.fg }}
        >
            <Icon style={{ width: size * 0.46, height: size * 0.46 }} strokeWidth={theme.stroke} />
        </span>
    );
};

const MONTHS_GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export const formatLongDate = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return `${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]} ${date.getFullYear()} г.`;
};

const chatDate = (chat) => chat?.updated_at || chat?.created_at || null;

export const getChatOwnerId = (chat) => chat?.owner_id ?? chat?.user_id ?? chat?.created_by ?? chat?.author_id ?? null;

const getChatPeople = (chat, user) => {
    const list = chat?.participants || chat?.members || chat?.shared_with || [];
    if (Array.isArray(list) && list.length) {
        return list.map((person) => ({
            id: person.id || person.user_id,
            name: `${person.first_name || ''} ${person.last_name || ''}`.trim() || person.full_name || person.username || 'Пользователь',
            avatar: person.avatar_url || null,
        }));
    }
    const ownerId = getChatOwnerId(chat);
    if (user && (ownerId === null || ownerId === user.id)) {
        return [{ id: user.id, name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || 'Вы', avatar: user.avatar_url || null }];
    }
    const ownerName = chat?.owner_fio || chat?.owner_name;
    return ownerName ? [{ id: ownerId, name: ownerName, avatar: chat?.owner_avatar_url || null }] : [];
};

const normalizeDocuments = (data) => {
    const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.documents) ? data.documents : [];
    return list.map((doc) => {
        if (typeof doc === 'string') return { id: doc, name: '' };
        const item = doc.file || doc.folder || doc;
        return { ...item, id: item.id || doc.id, name: item.name || item.real_name || item.file_name || item.title || '' };
    });
};

const normalizeMessages = (data) => {
    const list = Array.isArray(data?.data) ? data.data : Array.isArray(data?.messages) ? data.messages : Array.isArray(data) ? data : [];
    return list.map((message) => ({
        role: message.role || (message.sender === 'user' || message.is_user ? 'user' : 'assistant'),
        content: String(message.content || message.text || message.message || ''),
        format: String(message.assistant_type ?? message.format ?? message.type ?? message.message_type ?? message.response_type ?? '').toLowerCase(),
        createdAt: message.created_at || message.timestamp || null,
    }));
};

// Only structured answers count as saved results; plain chat replies do not.
export const RESULT_FORMATS = {
    report: { label: 'Отчёт', kind: 'word' },
    presentation: { label: 'Презентация', kind: 'slides' },
    table: { label: 'Таблица', kind: 'sheet' },
    test: { label: 'Тест', kind: 'text' },
    chart: { label: 'График', kind: 'file' },
    mermaid: { label: 'Схема', kind: 'file' },
    cards: { label: 'Карточки', kind: 'text' },
    compare: { label: 'Сравнение', kind: 'word' },
};

const stripMarkdown = (line) => line
    .replace(/\[[^\]]+\]\((?:https?:\/\/[^/ )]+)?\/web\/drive\/notebook\?[^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^[#>*\-\d.\s]+/, '')
    .replace(/[*_`#|]/g, '')
    .replace(/[\s—–-]+$/, '')
    .trim();

export const describeResult = (content, fallback) => {
    const trimmed = content.trim();
    const jsonSource = trimmed.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    if (jsonSource.startsWith('{')) {
        try {
            const parsed = JSON.parse(jsonSource);
            return {
                title: parsed.title || parsed.name || fallback,
                description: parsed.subtitle || parsed.description || '',
            };
        } catch {
            // Not JSON after all — fall through to text parsing.
        }
    }
    let fence = '';
    const lines = trimmed.split('\n').filter((line) => {
        const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
        if (marker) {
            if (!fence) fence = marker;
            else if (marker[0] === fence[0] && marker.length >= fence.length) fence = '';
            return false;
        }
        return !fence && !/^\s*(?:---+|\|\s*:?-+:?\s*\|)/.test(line);
    }).map(stripMarkdown).filter((line) => line.length > 1);
    return { title: lines[0]?.slice(0, 90) || fallback, description: lines[1]?.slice(0, 120) || '' };
};

const extractResults = (chat, messages) => messages
    .filter((message) => message.role === 'assistant' && RESULT_FORMATS[message.format])
    .map((message, index) => {
        const meta = RESULT_FORMATS[message.format];
        const { title, description } = describeResult(message.content, meta.label);
        return {
            id: `${getChatId(chat)}-${index}`,
            chat,
            title,
            description,
            label: meta.label,
            kind: meta.kind,
            format: message.format,
            createdAt: message.createdAt || chatDate(chat),
        };
    });

const RESULT_ICONS = {
    report: FileText,
    presentation: Presentation,
    table: Table2,
    test: ListChecks,
    chart: ChartNoAxesColumn,
    mermaid: Workflow,
    cards: Layers,
    compare: GitCompare,
};

const AvatarStack = ({ people, size = 22 }) => (
    people.length ? (
        <div className="flex -space-x-1.5">
            {people.slice(0, 3).map((person, index) => (
                <Avatar key={person.id || index} name={person.name} src={person.avatar} size={size} ring />
            ))}
        </div>
    ) : null
);

const NotebookMenu = ({ chat, onOpen, onDelete, canDelete }) => {
    const anchorRef = useRef(null);
    const [open, setOpen] = useState(false);
    const close = useCallback(() => setOpen(false), []);
    return (
        <>
            <button
                ref={anchorRef}
                type="button"
                aria-label={`Действия: ${chat.title || 'блокнот'}`}
                aria-haspopup="menu"
                aria-expanded={open}
                data-no-tooltip
                onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }}
                className={clsx(DATA_TABLE_ROW_ICON, open && 'bg-[#EEF0F3] text-[#17202E]')}
            >
                <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={2} />
            </button>
            <FloatingMenu anchorRef={anchorRef} open={open} onClose={close}>
                <MenuItem icon={ExternalLink} label="Открыть" onClick={() => { close(); onOpen(chat); }} />
                {canDelete ? (
                    <>
                        <MenuDivider />
                        <MenuItem icon={Trash2} label="Удалить" danger onClick={() => { close(); onDelete(chat); }} />
                    </>
                ) : null}
            </FloatingMenu>
        </>
    );
};

const sourcesLabel = (documents) => {
    if (!documents) return 'Загружаем источники…';
    if (!documents.length) return 'Нет источников';
    return `${documents.length} ${pluralize(documents.length, ['источник', 'источника', 'источников'])}`;
};

const NotebookCard = ({ chat, documents, people, onOpen, onDelete, canDelete }) => (
    <article
        tabIndex={0}
        aria-label={chat.title || 'Без названия'}
        onClick={() => onOpen(chat)}
        onKeyDown={(event) => { if (event.target === event.currentTarget && event.key === 'Enter') onOpen(chat); }}
        className={clsx(
            'flex min-h-[172px] cursor-pointer flex-col gap-3.5 rounded-2xl border border-[#EBEEF3] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-[border-color,box-shadow] duration-150 hover:border-[#D3D9E3] hover:shadow-[0_8px_24px_-16px_rgba(16,24,40,0.25)]',
            FOCUS_RING,
        )}
    >
        <div className="flex items-start justify-between gap-2">
            <NotebookIcon chat={chat} size={40} />
            <span onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                <NotebookMenu chat={chat} onOpen={onOpen} onDelete={onDelete} canDelete={canDelete} />
            </span>
        </div>
        <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-[15px] font-semibold leading-[21px] text-[#17202E]">{chat.title || 'Без названия'}</h3>
            {chat.description ? <p className="mt-1 line-clamp-1 text-[13px] leading-5 text-[#586174]">{chat.description}</p> : null}
            <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[#586174]">
                <FileText className="h-[13px] w-[13px] shrink-0" strokeWidth={1.8} />
                {sourcesLabel(documents)}
            </p>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-[#EEF0F3] pt-3 text-[12px] text-[#7B8494]">
            <span className="min-w-0 truncate">{formatLongDate(chatDate(chat))}</span>
            <AvatarStack people={people} />
        </div>
    </article>
);

const BANNER_KEY = 'alem_deep_research_banner_hidden';
const VIEW_KEY = 'alem_deep_research_view_mode';
const RESULTS_CHAT_LIMIT = 6;
const RESULTS_PREVIEW = 5;

const readStorage = (key, fallback) => {
    try {
        return localStorage.getItem(key) ?? fallback;
    } catch {
        return fallback;
    }
};

const writeStorage = (key, value) => {
    try {
        localStorage.setItem(key, value);
    } catch {
        return;
    }
};

const VIEW_OPTIONS = [
    { value: 'grid', icon: 'grid_view', label: 'Плитка' },
    { value: 'list', icon: 'view_list', label: 'Список' },
];

export default function NotebookDashboard({ chats, user, search, onSearchChange, onOpenChat, onCreate, onDeleteChat }) {
    const [tab, setTab] = useState('all');
    const [viewMode, setViewMode] = useState(() => (readStorage(VIEW_KEY, 'grid') === 'list' ? 'list' : 'grid'));
    const [bannerHidden, setBannerHidden] = useState(() => readStorage(BANNER_KEY, '') === 'true');
    const [documentsByChat, setDocumentsByChat] = useState({});
    const [results, setResults] = useState(null);
    const [showAllResults, setShowAllResults] = useState(false);

    const isMine = useCallback((chat) => {
        const ownerId = getChatOwnerId(chat);
        return ownerId === null || !user || ownerId === user.id;
    }, [user]);

    const mineCount = chats.filter(isMine).length;
    const sharedCount = chats.length - mineCount;

    const visibleChats = useMemo(() => {
        const query = search.trim().toLowerCase();
        return chats
            .filter((chat) => (tab === 'mine' ? isMine(chat) : tab === 'shared' ? !isMine(chat) : true))
            .filter((chat) => !query || `${chat.title || ''} ${chat.description || ''}`.toLowerCase().includes(query))
            .sort((left, right) => new Date(chatDate(right) || 0) - new Date(chatDate(left) || 0));
    }, [chats, tab, search, isMine]);

    const chatKey = chats.map(getChatId).join('|');
    const themes = useMemo(() => assignNotebookThemes(chats), [chats]);

    useEffect(() => {
        let active = true;
        chats.forEach((chat) => {
            const id = getChatId(chat);
            if (!id || documentsByChat[id]) return;
            if (Array.isArray(chat.documents)) {
                setDocumentsByChat((current) => ({ ...current, [id]: normalizeDocuments(chat.documents) }));
                return;
            }
            getChatDocuments(id)
                .then((data) => active && setDocumentsByChat((current) => ({ ...current, [id]: normalizeDocuments(data) })))
                .catch(() => active && setDocumentsByChat((current) => ({ ...current, [id]: [] })));
        });
        return () => { active = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chatKey]);

    useEffect(() => {
        let active = true;
        const recent = [...chats]
            .sort((left, right) => new Date(chatDate(right) || 0) - new Date(chatDate(left) || 0))
            .slice(0, RESULTS_CHAT_LIMIT);
        if (!recent.length) {
            setResults([]);
            return undefined;
        }
        Promise.all(recent.map((chat) => getNotebookChatMessages(getChatId(chat))
            .then((data) => extractResults(chat, normalizeMessages(data)))
            .catch(() => [])))
            .then((lists) => {
                if (!active) return;
                setResults(lists.flat().sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0)));
            });
        return () => { active = false; };
    }, [chatKey]); // eslint-disable-line react-hooks/exhaustive-deps

    const changeView = (value) => {
        setViewMode(value);
        writeStorage(VIEW_KEY, value);
    };

    const hideBanner = () => {
        setBannerHidden(true);
        writeStorage(BANNER_KEY, 'true');
    };

    const shownResults = results ? (showAllResults ? results : results.slice(0, RESULTS_PREVIEW)) : [];
    const query = search.trim();
    const tabs = [
        { id: 'all', label: 'Все', count: chats.length },
        { id: 'mine', label: 'Мои', count: mineCount },
        { id: 'shared', label: 'Общие', count: sharedCount },
    ];

    const emptyState = (
        <DataTableEmpty
            icon={<BookOpen className="h-5 w-5" strokeWidth={1.8} />}
            title={query ? 'Ничего не найдено' : tab === 'shared' ? 'С вами пока не поделились блокнотами' : 'Блокнотов пока нет'}
            text={query ? 'Измените запрос поиска.' : 'Создайте блокнот, добавьте документы и задавайте вопросы по ним.'}
        />
    );

    const notebookColumns = [
        {
            key: 'title',
            label: 'Блокнот',
            track: 'minmax(220px,1fr)',
            render: (chat) => (
                <div className="flex min-w-0 items-center gap-3">
                    <NotebookIcon chat={chat} size={34} />
                    <div className="min-w-0">
                        <p className="truncate font-medium text-[#17202E]">{chat.title || 'Без названия'}</p>
                        {chat.description ? <p className="truncate text-[12px] text-[#586174]">{chat.description}</p> : null}
                    </div>
                </div>
            ),
        },
        { key: 'sources', label: 'Источники', track: '150px', render: (chat) => <span className="truncate">{sourcesLabel(documentsByChat[getChatId(chat)])}</span> },
        { key: 'people', label: 'Участники', track: '100px', render: (chat) => <AvatarStack people={getChatPeople(chat, user)} size={24} /> },
        { key: 'updated', label: 'Обновлено', track: '150px', render: (chat) => <span className="truncate text-[13px]">{formatLongDate(chatDate(chat))}</span> },
    ];

    const resultColumns = [
        {
            key: 'title',
            label: 'Название',
            track: 'minmax(220px,1fr)',
            render: (result) => {
                const Icon = RESULT_ICONS[result.format] || FileText;
                return (
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-[#F1F3F6] text-[#465066]">
                            <Icon className="h-[15px] w-[15px]" strokeWidth={1.8} />
                        </span>
                        <div className="min-w-0">
                            <p className="truncate font-medium text-[#17202E]">{result.title}</p>
                            {result.description ? <p className="truncate text-[12px] text-[#586174]">{result.description}</p> : null}
                        </div>
                    </div>
                );
            },
        },
        { key: 'type', label: 'Тип', track: '120px', render: (result) => <span className="inline-flex h-[22px] items-center rounded-[6px] bg-[#F1F3F6] px-2 text-[12px] text-[#465066]">{result.label}</span> },
        {
            key: 'notebook',
            label: 'Блокнот',
            track: 'minmax(160px,0.7fr)',
            wide: true,
            render: (result) => (
                <div className="flex min-w-0 items-center gap-2">
                    <NotebookIcon chat={result.chat} size={22} />
                    <span className="truncate">{result.chat.title || 'Без названия'}</span>
                </div>
            ),
        },
        { key: 'created', label: 'Создано', track: '150px', render: (result) => <span className="truncate text-[13px]">{formatLongDate(result.createdAt)}</span> },
    ];

    return (
        <ThemeContext.Provider value={themes}>
        <div data-no-tooltip className="@container min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-4 pb-16 pt-6 sm:px-6 xl:px-8">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div className="min-w-0">
                        <nav aria-label="Путь" className="mb-1 flex items-center gap-1.5 text-[13px] text-[#586174]">
                            <span>Drive</span>
                            <ChevronRight className="h-3.5 w-3.5 text-[#9AA3B2]" strokeWidth={2} />
                            <span className="text-[#17202E]">Deep Research</span>
                        </nav>
                        <h1 className="text-[28px] font-semibold leading-9 tracking-[-0.02em] text-[#17202E]">Deep Research</h1>
                        <p className="mt-0.5 text-[14px] text-[#586174]">Исследуйте документы и собирайте знания в одном месте.</p>
                    </div>
                    <button type="button" onClick={onCreate} className={BUTTON_PRIMARY}>
                        <Plus className="h-4 w-4" strokeWidth={2} />
                        Новый блокнот
                    </button>
                </div>

                {!bannerHidden ? (
                    <div className="flex items-start gap-3 rounded-xl border border-[#E6EAF1] bg-[#F8F9FB] py-3 pl-3.5 pr-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-[#EDF2FF] text-[#2458D3]">
                            <Sparkles className="h-[15px] w-[15px]" strokeWidth={1.9} />
                        </span>
                        <p className="min-w-0 flex-1 pt-1 text-[13px] leading-5">
                            <span className="font-semibold text-[#17202E]">От документов — к выводам. </span>
                            <span className="text-[#586174]">Добавьте источники, задавайте вопросы и сохраняйте отчёты, тесты и презентации.</span>
                        </p>
                        <button type="button" onClick={hideBanner} aria-label="Скрыть подсказку" className={DATA_TABLE_ROW_ICON}>
                            <X className="h-4 w-4" strokeWidth={2} />
                        </button>
                    </div>
                ) : null}

                <div className="flex flex-wrap items-end gap-y-3">
                    <div role="tablist" aria-label="Блокноты" className="flex min-w-[220px] flex-1 gap-5 overflow-x-auto border-b border-[#E2E5EA] [scrollbar-width:none]">
                        {tabs.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                role="tab"
                                aria-selected={tab === item.id}
                                onClick={() => setTab(item.id)}
                                className={clsx('ts-tab !h-10', tab === item.id && 'ts-tab--active', FOCUS_RING)}
                            >
                                {item.label}
                                <span className="text-[12px] font-normal tabular-nums text-[#7B8494]">{item.count}</span>
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 border-b border-[#E2E5EA] pb-2 pl-4 @max-[620px]:w-full @max-[620px]:border-b-0 @max-[620px]:pb-0 @max-[620px]:pl-0">
                        <label className="flex h-9 w-[260px] max-w-full min-w-0 @max-[620px]:flex-1 items-center gap-2 rounded-[var(--ts-radius-control)] border border-[var(--ts-border)] bg-white px-3 transition-colors hover:border-[var(--ts-border-hover)] focus-within:border-[var(--ts-action)] focus-within:shadow-[var(--ts-focus)]">
                            <Search className="h-4 w-4 shrink-0 text-[#586174]" strokeWidth={1.8} />
                            <span className="sr-only">Найти блокнот</span>
                            <input
                                type="search"
                                value={search}
                                onChange={(event) => onSearchChange(event.target.value)}
                                placeholder="Найти блокнот"
                                className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-[#17202E] outline-none placeholder:text-[#7B8494]"
                            />
                        </label>
                        <ViewToggle value={viewMode} options={VIEW_OPTIONS} onChange={changeView} />
                    </div>
                </div>

                {viewMode === 'grid' ? (
                    visibleChats.length === 0 && (query || tab === 'shared') ? (
                        <div className="rounded-2xl border border-[#E6EAF1] bg-white">{emptyState}</div>
                    ) : (
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3.5">
                            {visibleChats.map((chat) => (
                                <NotebookCard
                                    key={getChatId(chat)}
                                    chat={chat}
                                    documents={documentsByChat[getChatId(chat)]}
                                    people={getChatPeople(chat, user)}
                                    onOpen={onOpenChat}
                                    onDelete={onDeleteChat}
                                    canDelete={isMine(chat)}
                                />
                            ))}
                            {!query && tab !== 'shared' ? (
                                <button
                                    type="button"
                                    onClick={onCreate}
                                    className={clsx('flex min-h-[172px] flex-col items-center justify-center gap-2.5 rounded-2xl border-[1.5px] border-dashed border-[#D3D9E3] text-[14px] font-medium text-[#586174] transition-colors duration-150 hover:border-[#B4BCC9] hover:bg-[#FAFBFC] hover:text-[#17202E]', FOCUS_RING)}
                                >
                                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F1F3F6]">
                                        <Plus className="h-[18px] w-[18px]" strokeWidth={2} />
                                    </span>
                                    Новый блокнот
                                </button>
                            ) : null}
                        </div>
                    )
                ) : (
                    <DataTable
                        ariaLabel="Блокноты"
                        rows={visibleChats}
                        rowKey={(chat) => getChatId(chat)}
                        columns={notebookColumns}
                        loading={false}
                        empty={emptyState}
                        actionsTrack="48px"
                        actionsLabel={<span className="sr-only">Действия</span>}
                        actions={(chat) => <NotebookMenu chat={chat} onOpen={onOpenChat} onDelete={onDeleteChat} canDelete={isMine(chat)} />}
                        onRowClick={onOpenChat}
                    />
                )}

                <section aria-labelledby="dr-recent-title" className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                        <h2 id="dr-recent-title" className="text-[16px] font-semibold leading-6 text-[#17202E]">Недавние результаты</h2>
                        {results && results.length > RESULTS_PREVIEW ? (
                            <button
                                type="button"
                                onClick={() => setShowAllResults((value) => !value)}
                                className={clsx('rounded-[4px] text-[13px] font-medium text-[#2458D3] hover:text-[#1D47B0]', FOCUS_RING)}
                            >
                                {showAllResults ? 'Свернуть' : 'Все результаты'}
                            </button>
                        ) : null}
                    </div>
                    <DataTable
                        ariaLabel="Недавние результаты"
                        rows={shownResults}
                        rowKey={(result) => result.id}
                        columns={resultColumns}
                        loading={results === null}
                        skeletonRows={3}
                        empty={<DataTableEmpty title="Результатов пока нет" text="Отчёты, таблицы и презентации из блокнотов появятся здесь." />}
                        actionsTrack="48px"
                        actionsLabel={<span className="sr-only">Действия</span>}
                        actions={(result) => <NotebookMenu chat={result.chat} onOpen={onOpenChat} onDelete={onDeleteChat} canDelete={false} />}
                        onRowClick={(result) => onOpenChat(result.chat)}
                    />
                </section>
            </div>
        </div>
        </ThemeContext.Provider>
    );
}
