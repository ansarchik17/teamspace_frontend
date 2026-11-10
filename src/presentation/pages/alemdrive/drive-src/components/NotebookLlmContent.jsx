import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { extractMessageFromPayload } from '../../../../../infrastructure/http/HttpError';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
    ArrowLeft, X, Loader2, FileText, Send, Key, BookOpen, Lightbulb, Search, ChevronDown, Plus,
    Layers, ClipboardList, Table2, FileBarChart, Workflow, Copy, Check,
    PanelLeft, MessageCircleMore,
    Presentation, ChevronLeft, ChevronRight, BarChart2, Download, Upload, CloudUpload, ArrowLeftRight,
    Folder, ArrowUp,
} from 'lucide-react';
import {
    ChartNoAxesColumn,
    ChevronsUpDown,
    CircleHelp,
    ExternalLink as ExternalLinkIcon,
    FileChartColumn,
    FolderOpen,
    Info,
    MoreHorizontal,
    PanelRight,
    Paperclip,
    Save,
    SendHorizontal,
    Sparkles,
    Trash2,
    Upload as UploadIcon,
} from 'lucide-react';
import clsx from 'clsx';
import {
    Avatar,
    BUTTON_PRIMARY,
    BUTTON_SECONDARY,
    BUTTON_SECONDARY_ACCENT,
    Checkbox,
    FOCUS_RING,
    FileTypeIcon,
    ICON_BUTTON,
    KIND_META,
    formatModified,
    formatSize as formatBytes,
    getItemKind,
    pluralize,
} from './driveUi';
import { FloatingMenu, MenuDivider, MenuItem } from './ItemActionsMenu';
import {
    NotebookIcon,
    RESULT_FORMATS,
    ThemeContext as NotebookThemeContext,
    assignNotebookThemes,
    describeResult,
    getChatId,
} from './NotebookDashboard';
import { uploadFile } from '../api/files';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useToast } from './Toast';
import client from '../api/client';
import { listFiles, listOwnItems, listSharedItems } from '../api/files';
import {
    getNotebookChatMessages,
    syncNotebookChat,
    getChatDocuments,
    addChatDocument,
    removeChatDocument,
    saveChatDocuments,
    askNotebook,
    getNotebookResearchContext,
    getNotebookStudioPresets,
    createNotebookAskJob,
    getNotebookAskJob,
    cancelNotebookAskJob,
} from '../api/notebookChats';
import {
    runNotebookResearch,
    waitForNotebookJob,
    readActiveJob,
    clearActiveJob,
    notebookJobProgressKey,
    stripNul,
    NOTEBOOK_STOP_REASON,
} from '../utils/notebookJobs';
import { getLanguage, i18n } from '../../../../../shared/i18n';
import {
    buildPresentationPptxBlob,
    buildChartPptxBlob,
    buildChartXlsxBlob,
    exportPresentationToPptx,
    exportChartToPptx,
    exportChartToXlsx,
} from '../utils/notebookExport';
import { uploadNotebookExportBlob } from '../api/notebookDriveUpload';
import AppSelect from '../../../../../shared/ui/AppSelect';
import AppModal from '../../../../../shared/ui/AppModal';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    LineChart,
    Line,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from 'recharts';
import { downloadMermaidDiagramAsPngFromSvg, renderMermaidSvg } from '../utils/mermaidRenderer';
import NotebookSourceLink, { CitationNumbers } from './NotebookSourceLink';
import {
    PRESENTATION_THEMES,
    css,
    getPresentationTheme,
    readPresentationTheme,
    storePresentationTheme,
    slideBullets,
    slideParagraphs,
    slideLayout,
} from '../utils/presentationDesign';
import { readNotebookSelection, persistNotebookSelection, normalizeAssistantMarkdown, normalizeMarkdownTables, cleanQuizOption, parseNotebookCitation } from '../utils/notebookResearch';
export { normalizeAssistantMarkdown, normalizeMarkdownTables } from '../utils/notebookResearch';
import {
    generateSlidesWithProvider,
    getSlidesJobWithProvider,
    SLIDE_PROVIDER_TWOSLIDES,
} from '../api/slideProviders';

const mermaidSvgClass =
    '[&_svg]:mx-auto [&_svg]:block [&_svg]:h-auto [&_svg]:w-full [&_svg]:max-h-[65vh] [&_svg]:max-w-full';

const notebookJobsApi = {
    createJob: createNotebookAskJob,
    getJob: getNotebookAskJob,
    cancelJob: cancelNotebookAskJob,
    ask: askNotebook,
};

const notebookLang = () => (getLanguage() === 'kk' ? 'kz' : 'ru');
const notebookJobText = (key, params) => i18n.t(`drive:notebookJobs.${key}`, params);
const describeNotebookJobProgress = (progress) => {
    const { key, params } = notebookJobProgressKey(progress);
    return notebookJobText(`progress.${key}`, params);
};

// Answers that explain missing or unreadable sources are not Studio results.
const NOTEBOOK_REFUSAL_STATUSES = new Set(['no_sources', 'unreadable']);

function normalizeNotebookHistory(messagesData) {
    const rawMessages = Array.isArray(messagesData?.data)
        ? messagesData.data
        : Array.isArray(messagesData?.messages)
            ? messagesData.messages
            : Array.isArray(messagesData)
                ? messagesData
                : [];
    return rawMessages.map((m) => {
        const role = m.role || (m.sender === 'user' || m.is_user ? 'user' : 'assistant');
        const content = m.content || m.text || m.message || '';
        const rawFormat =
            m.assistant_type ?? m.format ?? m.type ?? m.message_type ?? m.response_type;
        let format = normalizeNotebookMessageFormat(rawFormat);
        if (role === 'assistant' && !format && isLikelyChartJsonContent(content)) {
            format = 'chart';
        }
        return { role, content, format, createdAt: m.created_at || m.timestamp || null };
    });
}

function describeResearchRequestError(error) {
    if (error?.i18nKey) return notebookJobText(error.i18nKey);
    const publicMessage = extractMessageFromPayload(error?.response?.data).message;
    if (publicMessage) return publicMessage;
    const status = error?.response?.status ?? error?.status;
    if (status === 401) return 'Сессия истекла. Войдите снова и повторите вопрос.';
    if (status === 403) return 'Недостаточно прав для чтения выбранных источников.';
    if (status === 429) return 'Слишком много запросов. Подождите немного и повторите вопрос.';
    if (status === 504 || error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
        return 'Не удалось дождаться ответа ИИ. Повторите вопрос или уменьшите объём запроса.';
    }
    if (status >= 500) return 'Сервис Deep Research временно недоступен. Повторите вопрос через несколько минут.';
    if (error?.code === 'ERR_NETWORK' || error?.message === 'Network Error') {
        return 'Не удалось соединиться с Deep Research. Проверьте подключение и повторите вопрос.';
    }
    const message = error?.message;
    if (message && !/^Request failed with status code \d+$/i.test(message)) return message;
    return 'Не удалось получить ответ. Повторите вопрос.';
}

function mergeUniqueFiles(existing, incoming) {
    const map = new Map();
    (existing || []).forEach((file) => {
        if (file?.id) {
            map.set(file.id, file);
        }
    });
    (incoming || []).forEach((file) => {
        if (file?.id) {
            map.set(file.id, file);
        }
    });
    return Array.from(map.values());
}

/** Рендер блоков ```mermaid из ответа ИИ */
function MermaidDiagram({ chart }) {
    const [svgHtml, setSvgHtml] = useState('');
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);

    useEffect(() => {
        const text = (chart || '').trim();
        if (!text) {
            setSvgHtml('');
            setLoading(false);
            return undefined;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);
        setSvgHtml('');

        void renderMermaidSvg(text)
            .then((svg) => {
                if (!cancelled) {
                    setSvgHtml(svg);
                    setLoading(false);
                }
            })
            .catch((e) => {
                if (!cancelled) {
                    setError(e?.message || String(e));
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [chart]);

    const ready = Boolean(svgHtml) && !loading && !error;

    const handleDownloadPng = async () => {
        if (!svgHtml || downloading) return;
        setDownloading(true);
        try {
            const stamp = new Date().toISOString().slice(0, 10);
            await downloadMermaidDiagramAsPngFromSvg(svgHtml, `mermaid-diagram-${stamp}.png`);
        } catch (e) {
            setError(e?.message || 'Не удалось сохранить изображение');
        } finally {
            setDownloading(false);
        }
    };

    useEffect(() => {
        if (!previewOpen) return undefined;
        const onKeyDown = (event) => {
            if (event.key === 'Escape') setPreviewOpen(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [previewOpen]);

    const openPreview = () => {
        if (!ready) return;
        setPreviewOpen(true);
    };

    if (error) {
        return (
            <div className="my-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                <span className="font-medium">Ошибка Mermaid:</span> {error}
            </div>
        );
    }

    const previewModal =
        previewOpen &&
        ready &&
        typeof document !== 'undefined' &&
        createPortal(
            <div
                className="ts-legacy-backdrop fixed inset-0 z-[1200] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
                onClick={() => setPreviewOpen(false)}
                role="presentation"
            >
                <div
                    className="ts-legacy-dialog flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Диаграмма Mermaid"
                >
                    <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                        <span className="text-sm font-semibold text-gray-900">Диаграмма Mermaid</span>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => void handleDownloadPng()}
                                disabled={downloading}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
                            >
                                {downloading ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <Download className="w-3.5 h-3.5" />
                                )}
                                Скачать PNG
                            </button>
                            <button
                                type="button"
                                onClick={() => setPreviewOpen(false)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                                title="Закрыть"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto bg-slate-50/50 p-6">
                        <div
                            className={`mx-auto w-full max-w-5xl rounded-xl border border-gray-200 bg-white p-6 ${mermaidSvgClass}`}
                            dangerouslySetInnerHTML={{ __html: svgHtml }}
                        />
                    </div>
                </div>
            </div>,
            document.body,
        );

    return (
        <>
            <div className="my-3 w-full max-w-full overflow-hidden rounded-lg border border-indigo-100 bg-white shadow-sm">
                {ready ? (
                    <div className="flex items-center justify-between gap-2 border-b border-indigo-50 bg-slate-50/80 px-2 py-1.5">
                        <span className="text-[11px] text-gray-500">Нажмите на диаграмму, чтобы открыть</span>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                void handleDownloadPng();
                            }}
                            disabled={downloading}
                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                            title="Скачать диаграмму как PNG"
                        >
                            {downloading ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <Download className="w-3.5 h-3.5" />
                            )}
                            <span>{downloading ? 'Сохранение...' : 'Скачать PNG'}</span>
                        </button>
                    </div>
                ) : null}
                {loading ? (
                    <div className="flex items-center justify-center gap-2 p-8 text-sm text-gray-500">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Построение диаграммы...
                    </div>
                ) : (
                    <div
                        role="button"
                        tabIndex={ready ? 0 : -1}
                        onClick={openPreview}
                        onKeyDown={(e) => {
                            if (!ready) return;
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                openPreview();
                            }
                        }}
                        title={ready ? 'Открыть диаграмму' : undefined}
                        className={`overflow-x-auto p-4 transition-colors ${mermaidSvgClass} ${
                            ready ? 'cursor-zoom-in hover:bg-indigo-50/40' : ''
                        }`}
                        dangerouslySetInnerHTML={ready ? { __html: svgHtml } : undefined}
                    />
                )}
            </div>
            {previewModal}
        </>
    );
}

const isDocx = (file) => {
    const n = (file.name || '').toLowerCase();
    const m = (file.mime_type || '').toLowerCase();
    return n.endsWith('.docx') || m.includes('wordprocessingml') || m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
};

const isPdf = (file) => {
    const n = (file.name || '').toLowerCase();
    const m = (file.mime_type || '').toLowerCase();
    return n.endsWith('.pdf') || m === 'application/pdf';
};

/** Excel / Spreadsheet — только через внешний /parse (без URL файлы не обрабатываются) */
const isSpreadsheetForRemoteParse = (file) => {
    const n = (file.name || '').toLowerCase();
    const m = (file.mime_type || '').toLowerCase();
    if (n.endsWith('.xlsx') || n.endsWith('.xlsm') || n.endsWith('.xls')) return true;
    if (m.includes('spreadsheetml') || m === 'application/vnd.ms-excel') return true;
    return false;
};

/** PowerPoint — через тот же /parse */
const isPresentationForRemoteParse = (file) => {
    const n = (file.name || '').toLowerCase();
    const m = (file.mime_type || '').toLowerCase();
    if (n.endsWith('.pptx') || n.endsWith('.ppt')) return true;
    if (m.includes('presentationml') || m.includes('powerpoint')) return true;
    return false;
};

const isSupportedFile = (file) => {
    if (file.type === 'dir' || file.mime_type === 'application/x-directory') return true;
    const n = (file.name || '').toLowerCase();
    return (
        n.endsWith('.docx') ||
        n.endsWith('.pdf') ||
        n.endsWith('.txt') ||
        n.endsWith('.md') ||
        n.endsWith('.pptx') ||
        n.endsWith('.ppt') ||
        n.endsWith('.xlsx') ||
        n.endsWith('.xls') ||
        n.endsWith('.xlsm')
    );
};

const getFileIconAndColor = (file) => {
    if (file.type === 'dir' || file.mime_type === 'application/x-directory') {
        return { Icon: Folder, color: 'text-indigo-500 fill-indigo-50/30' };
    }
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.docx')) {
        return { Icon: FileText, color: 'text-blue-500' };
    }
    if (name.endsWith('.pdf')) {
        return { Icon: FileText, color: 'text-red-500' };
    }
    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.xlsm')) {
        return { Icon: Table2, color: 'text-emerald-500' };
    }
    if (name.endsWith('.pptx') || name.endsWith('.ppt')) {
        return { Icon: Presentation, color: 'text-orange-500' };
    }
    return { Icon: FileText, color: 'text-slate-500' };
};

export function formatSize(bytes) {
    if (bytes == null) return '—';
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/** Стили для Markdown + GFM-таблиц (как в ChatGPT), без плагина @tailwindcss/typography */
const ASSISTANT_MARKDOWN_COMPONENTS = {
    table: ({ children, ...props }) => (
        <div className="my-3 overflow-x-auto rounded-xl border border-[#E6EAF1] bg-white">
            <table
                className="w-full min-w-[min(100%,480px)] border-collapse text-left text-[14px]"
                {...props}
            >
                {children}
            </table>
        </div>
    ),
    thead: ({ children, ...props }) => (
        <thead
            className="sticky top-0 z-10 border-b border-[#E6EAF1] bg-[#FAFBFC]"
            {...props}
        >
            {children}
        </thead>
    ),
    tbody: ({ children, ...props }) => <tbody {...props}>{children}</tbody>,
    tr: ({ children, ...props }) => (
        <tr className="border-b border-[#EEF0F3] transition-colors last:border-0 hover:bg-[#F8F9FB]" {...props}>
            {children}
        </tr>
    ),
    th: ({ children, ...props }) => (
        <th className="px-3 py-2.5 align-top text-[13px] font-medium text-[#586174]" {...props}>
            {children}
        </th>
    ),
    td: ({ children, ...props }) => (
        <td className="px-3 py-2.5 align-top text-[14px] text-[#17202E] [&_p]:my-0 [&_ul]:my-1" {...props}>
            {children}
        </td>
    ),
    p: ({ children, ...props }) => (
        <p className="my-1.5 first:mt-0 last:mb-0 text-[#17202E]" {...props}>
            {children}
        </p>
    ),
    ul: ({ children, ...props }) => (
        <ul className="my-1.5 list-disc space-y-0.5 pl-5 text-[#17202E] marker:text-[#9AA3B2]" {...props}>
            {children}
        </ul>
    ),
    ol: ({ children, ...props }) => (
        <ol className="my-1.5 list-decimal space-y-0.5 pl-5 text-[#17202E] marker:text-[#7B8494]" {...props}>
            {children}
        </ol>
    ),
    li: ({ children, ...props }) => (
        <li className="pl-0.5" {...props}>
            {children}
        </li>
    ),
    h1: ({ children, ...props }) => (
        <h1 className="mb-1 mt-4 text-[16px] font-semibold leading-6 text-[#17202E] first:mt-0" {...props}>
            {children}
        </h1>
    ),
    h2: ({ children, ...props }) => (
        <h2 className="mb-1 mt-4 text-[15px] font-semibold leading-[22px] text-[#17202E] first:mt-0" {...props}>
            {children}
        </h2>
    ),
    h3: ({ children, ...props }) => (
        <h3 className="mb-0.5 mt-3 text-[14px] font-semibold leading-[22px] text-[#17202E] first:mt-0" {...props}>
            {children}
        </h3>
    ),
    strong: ({ children, ...props }) => (
        <strong className="font-semibold text-[#17202E]" {...props}>
            {children}
        </strong>
    ),
    code: ({ className, children, ...props }) => {
        const isBlock = className?.includes('language-');
        if (isBlock) {
            return (
                <code className={className} {...props}>
                    {children}
                </code>
            );
        }
        return (
            <code className="px-1 py-0.5 rounded bg-[#F1F3F6] text-[#17202E] text-[0.85em]" {...props}>
                {children}
            </code>
        );
    },
    pre: ({ children, ...props }) => {
        const first = React.Children.toArray(children)[0];
        if (
            React.isValidElement(first) &&
            typeof first.props?.className === 'string' &&
            first.props.className.includes('language-mermaid')
        ) {
            const raw = first.props.children;
            const chart = Array.isArray(raw)
                ? raw.map((c) => (typeof c === 'string' ? c : String(c ?? ''))).join('')
                : String(raw ?? '');
            return <MermaidDiagram chart={chart} />;
        }
        return (
            <pre className="my-3 p-3 rounded-lg bg-gray-900 text-gray-100 text-xs overflow-x-auto" {...props}>
                {children}
            </pre>
        );
    },
    blockquote: ({ children, ...props }) => (
        <blockquote className="my-2 pl-3 border-l-4 border-[#D3D9E3] text-[#465066] italic" {...props}>
            {children}
        </blockquote>
    ),
    hr: () => <hr className="my-4 border-[#E6EAF1]" />,
    a: NotebookSourceLink,
};

const CITATION_LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

const numberRanges = (list) => {
    const parts = [];
    list.forEach((value) => {
        const last = parts[parts.length - 1];
        if (last && value === last[1] + 1) last[1] = value;
        else parts.push([value, value]);
    });
    return parts.map(([from, to]) => (from === to ? String(from) : `${from}–${to}`)).join(', ');
};

const CITATION_GROUP = /\s*\(\s*((?:\[[^\]]+\]\([^)\s]+\)\s*[,;]?\s*)+)\)/g;

const unwrapCitationGroups = (markdown) => markdown.replace(CITATION_GROUP, (whole, inner) => {
    const links = [...inner.matchAll(CITATION_LINK)];
    return links.length && links.every((link) => parseNotebookCitation(link[2])) ? links.map((link) => link[0]).join('') : whole;
});

const collectCitations = (markdown) => {
    const numbers = new Map();
    const files = new Map();
    for (const match of markdown.matchAll(CITATION_LINK)) {
        const href = match[2];
        const citation = parseNotebookCitation(href);
        if (!citation) continue;
        if (!numbers.has(href)) numbers.set(href, numbers.size + 1);
        const number = numbers.get(href);
        const entry = files.get(citation.fileId) || { href, name: match[1].replace(/,\s*\S+\s+\d+(?:\s*[–-]\s*\d+)?\s*$/, '').trim(), numbers: [] };
        if (!entry.numbers.includes(number)) entry.numbers.push(number);
        files.set(citation.fileId, entry);
    }
    return { numbers, files: [...files.values()] };
};

function AssistantMarkdown({ children, withSources = true }) {
    const raw = typeof children === 'string' ? children : String(children ?? '');
    const normalized = normalizeMarkdownTables(normalizeAssistantMarkdown(raw));
    const citations = useMemo(() => (withSources ? collectCitations(normalized) : null), [withSources, normalized]);
    const text = useMemo(() => {
        const spaced = normalized.replace(/^(\s*\*\*[^*\n]+\*\*)[ \t]*\n(?=[^\n])/gm, '$1\n\n');
        return citations?.numbers.size ? unwrapCitationGroups(spaced) : spaced;
    }, [citations, normalized]);
    const body = (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={ASSISTANT_MARKDOWN_COMPONENTS}>
            {text}
        </ReactMarkdown>
    );
    if (!citations?.numbers.size) return body;
    return (
        <>
            <CitationNumbers.Provider value={citations.numbers}>{body}</CitationNumbers.Provider>
            <div className="mt-3 flex flex-wrap gap-1.5">
                {citations.files.map((file) => (
                    <NotebookSourceLink key={file.href} href={file.href} variant="chip" numbers={numberRanges(file.numbers)}>{file.name}</NotebookSourceLink>
                ))}
            </div>
        </>
    );
}

function AssistantInlineMarkdown({ children }) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{ a: NotebookSourceLink, p: ({ children: content }) => <span>{content}</span> }}
        >
            {String(children ?? '')}
        </ReactMarkdown>
    );
}

function cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i += 1) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    if (!normA || !normB) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function chunkText(text, maxChars = 1500) {
    const chunks = [];
    let start = 0;
    while (start < text.length) {
        const end = Math.min(start + maxChars, text.length);
        chunks.push(text.slice(start, end));
        start = end;
    }
    return chunks;
}

/** Не отправлять бинарные файлы в эмбеддинги — там сырые байты (PK, %PDF и т.д.) превращаются в "мусор". */
function isLikelyBinary(content) {
    if (!content || content.length < 4) return false;
    const start = content.slice(0, 8);
    if (start.startsWith('PK')) return true;   // ZIP / .docx, .xlsx, .pptx
    if (start.startsWith('%PDF')) return true; // PDF
    const controlCount = [...content.slice(0, 500)].filter((c) => {
        const code = c.charCodeAt(0);
        return code < 32 && code !== 9 && code !== 10 && code !== 13;
    }).length;
    return controlCount / Math.min(500, content.length) > 0.15;
}

const STUDIO_TONES = {
    blue: { color: '#2458D3', soft: '#EDF2FF' },
    green: { color: '#15803D', soft: '#E9F7EF' },
    purple: { color: '#7C3AED', soft: '#F2ECFE' },
    orange: { color: '#C2410C', soft: '#FFF1E6' },
    teal: { color: '#0E8F80', soft: '#E6F6F4' },
    gray: { color: '#465066', soft: '#EEF1F5' },
};

const SUGGESTIONS = [
    { text: 'Сделай краткое резюме документа', icon: FileText },
    { text: 'Какие ключевые моменты в документе?', icon: Key },
    { text: 'Объясни основную идею простыми словами', icon: Lightbulb },
    { text: 'Найди интересные факты в тексте', icon: Search },
];

const FLASHCARD_BORDERS = ['border-red-400', 'border-teal-400', 'border-amber-400', 'border-blue-400'];

/** Превью карточки в сетке: клик открывает окно */
function FlashCardPreview({ card, index, borderClass, onClick }) {
    const title = card.title || 'Без названия';

    return (
        <button
            type="button"
            onClick={() => onClick(index)}
            className="w-full text-left focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:ring-offset-2 rounded-xl transition-transform hover:scale-[1.02] active:scale-[0.98]"
            style={{
                transform: `translate(${index * 6}px, ${index * 6}px)`,
                zIndex: 20 - index,
            }}
        >
            <div
                className={`relative w-full h-44 rounded-xl border-2 ${borderClass} bg-white shadow-lg overflow-hidden flex flex-col p-4`}
            >
                <div
                    className="flex-1 flex flex-col items-center justify-center min-h-0 text-center"
                    style={{
                        background: 'repeating-linear-gradient(transparent 0, transparent 20px, rgba(147,197,253,0.1) 20px, rgba(147,197,253,0.1) 21px)',
                    }}
                >
                    <div className="font-bold text-gray-800 text-sm leading-snug px-1 line-clamp-4 overflow-hidden break-words">
                        {title}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-2 font-normal flex-shrink-0">Нажмите, чтобы открыть</p>
                </div>
            </div>
        </button>
    );
}

/** Тест: правильный ответ показывается после клика; выбранный неверный вариант подсвечивается красным */
function TestView({ questions }) {
    const [revealed, setRevealed] = React.useState(new Set());
    const [clickedOption, setClickedOption] = React.useState({}); // questionIndex -> optionIndex

    const handleOptionClick = (questionIndex, optionIndex) => {
        setRevealed((prev) => new Set(prev).add(questionIndex));
        setClickedOption((prev) => ({ ...prev, [questionIndex]: optionIndex }));
    };

    return (
        <div className="space-y-5">
            {questions.map((q, i) => {
                const isRevealed = revealed.has(i);
                const chosenOptionIndex = clickedOption[i];
                return (
                    <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                        <div className="font-medium text-gray-900 mb-3 flex items-start gap-2">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs flex items-center justify-center font-semibold">
                                {i + 1}
                            </span>
                            <span>{q.questionText || 'Выберите правильный ответ.'}</span>
                        </div>
                        <ul className="space-y-2 ml-8">
                            {q.options.length > 0 ? (
                                q.options.map((opt, j) => {
                                    const letter = (opt.match(/^\s*([a-dа-г])[\.\)]/i) || [])[1] || '';
                                    const isCorrect = q.correct && letter.toLowerCase() === String(q.correct).toLowerCase().slice(0, 1);
                                    const showAsCorrect = isRevealed && isCorrect;
                                    const showAsWrong = isRevealed && chosenOptionIndex === j && !isCorrect;
                                    return (
                                        <li key={j}>
                                            <button
                                                type="button"
                                                onClick={() => handleOptionClick(i, j)}
                                                disabled={isRevealed}
                                                className={`w-full flex items-center gap-2 text-sm py-1.5 px-3 rounded-lg text-left transition-colors ${
                                                    showAsCorrect
                                                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                                        : showAsWrong
                                                            ? 'bg-red-50 text-red-800 border border-red-200'
                                                            : isRevealed
                                                                ? 'bg-gray-50 text-gray-600 border border-gray-100'
                                                                : 'bg-gray-50 text-gray-700 border border-gray-100 hover:bg-gray-100 hover:border-indigo-200'
                                                } ${isRevealed ? 'cursor-default' : 'cursor-pointer'}`}
                                            >
                                                <span className="font-medium w-5">{letter.toUpperCase()})</span>
                                                <span className="flex-1">{opt.replace(/^\s*[a-dа-г][\.\)]\s*/i, '').trim()}</span>
                                                {showAsCorrect && (
                                                    <span className="text-emerald-600 text-xs font-medium">✓ Правильный ответ</span>
                                                )}
                                                {showAsWrong && (
                                                    <span className="text-red-600 text-xs font-medium">✗ Неверно</span>
                                                )}
                                            </button>
                                        </li>
                                    );
                                })
                            ) : (
                                q.fallbackLines?.length > 0 ? (
                                    q.fallbackLines.map((line, j) => (
                                        <li key={j}>
                                            <button
                                                type="button"
                                                onClick={() => handleOptionClick(i, j)}
                                                disabled={isRevealed}
                                                className={`w-full text-sm py-1.5 px-3 rounded-lg text-left bg-gray-50 text-gray-700 border border-gray-100 hover:bg-gray-100 ${isRevealed ? 'cursor-default' : 'cursor-pointer'}`}
                                            >
                                                {line.trim()}
                                            </button>
                                        </li>
                                    ))
                                ) : (
                                    <li className="text-sm text-gray-500 italic">Варианты ответа не распознаны. Попробуйте переформулировать запрос или выберите другой формат.</li>
                                )
                            )}
                        </ul>
                        {isRevealed && q.correct && !q.options.some((o) => /^[a-dа-г][\.\)]/i.test(o) && o.toLowerCase().startsWith(q.correct.toLowerCase().slice(0, 1))) && (
                            <div className="mt-2 text-emerald-600 text-sm font-medium">Правильный ответ: {q.correct}</div>
                        )}
                        {!isRevealed && (
                            <p className="text-xs text-gray-500 mt-2 ml-8">Нажмите на любой вариант, чтобы показать правильный ответ</p>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

/** Сетка карточек + модальное окно при клике */
function FlashCardsGrid({ cards }) {
    const [openIndex, setOpenIndex] = React.useState(null);
    const openCard = openIndex !== null ? cards[openIndex] : null;

    return (
        <div className="relative min-h-[12rem] pl-2 pt-2 pb-8">
            <p className="text-xs text-gray-500 mb-3">Нажмите на карточку, чтобы открыть</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {cards.map((card, i) => (
                    <FlashCardPreview
                        key={i}
                        card={card}
                        index={i}
                        borderClass={FLASHCARD_BORDERS[i % FLASHCARD_BORDERS.length]}
                        onClick={setOpenIndex}
                    />
                ))}
            </div>
            {openCard && (
                <FlashCardModal card={openCard} onClose={() => setOpenIndex(null)} />
            )}
        </div>
    );
}

/** Окно карточки: заголовок + описание, кнопка закрыть */
function FlashCardModal({ card, onClose }) {
    React.useEffect(() => {
        const handleEscape = (e) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    if (!card || typeof document === 'undefined') return null;
    const title = card.title || 'Без названия';
    const body = (card.body || '').trim();
    const isEmptyBody = body === '' || /^[\s\-—]+$/.test(body);

    return createPortal(
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden border-2 border-indigo-100"
                >
                    <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 bg-gray-50/50 flex-shrink-0 gap-3">
                        <h3 className="font-bold text-base text-gray-900 leading-snug break-words flex-1 min-w-0">{title}</h3>
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-shrink-0 w-8 h-8 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-200 flex items-center justify-center transition-colors"
                            aria-label="Закрыть"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div
                        className="flex-1 overflow-auto p-5 text-sm leading-relaxed max-w-none text-gray-800"
                        style={{
                            background: 'repeating-linear-gradient(transparent 0, transparent 21px, rgba(147,197,253,0.08) 21px, rgba(147,197,253,0.08) 22px)',
                        }}
                    >
                        {isEmptyBody ? (
                            <AssistantMarkdown>{title}</AssistantMarkdown>
                        ) : (
                            <AssistantMarkdown>{body}</AssistantMarkdown>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>,
        document.body
    );
}

/** Разбор слайдов: разделитель `---` между слайдами или несколько блоков `## …` */
function parsePresentationSlides(markdown) {
    const raw = (markdown || '').trim();
    if (!raw) return [];
    let chunks = raw.split(/\n---\s*\n/).map((s) => s.trim()).filter(Boolean);
    if (chunks.length <= 1) {
        const alt = raw.split(/(?=\n##\s+)/).map((s) => s.trim()).filter(Boolean);
        if (alt.length > 1) chunks = alt;
    }
    return chunks.map((body, i) => {
        let title = `Слайд ${i + 1}`;
        let rest = body;
        const m2 = body.match(/^##\s+([^\n]+)/);
        const m1 = body.match(/^#\s+([^\n]+)/);
        if (m2) {
            title = m2[1].trim();
            rest = body.slice(m2[0].length).trim();
        } else if (m1) {
            title = m1[1].trim();
            rest = body.slice(m1[0].length).trim();
        }
        return { title, body: rest || body };
    });
}

/** Кнопки экспорта графика в PPTX и таблицы в XLSX */
function ChartExportActions({ normalized }) {
    const { addToast } = useToast();
    const [busy, setBusy] = useState(false);

    const handlePptx = async () => {
        setBusy(true);
        try {
            await exportChartToPptx(normalized, `grafik-${Date.now()}.pptx`);
            addToast('Файл .pptx с графиком сохранён', 'success');
        } catch (e) {
            console.error(e);
            addToast('Не удалось создать PPTX', 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleXlsx = async () => {
        setBusy(true);
        try {
            await exportChartToXlsx(normalized, `dannye-grafika-${Date.now()}.xlsx`);
            addToast('Файл Excel сохранён', 'success');
        } catch (e) {
            console.error(e);
            addToast('Не удалось создать Excel', 'error');
        } finally {
            setBusy(false);
        }
    };

    const handlePptxToDrive = async () => {
        setBusy(true);
        try {
            const name = `grafik-${Date.now()}.pptx`;
            const blob = await buildChartPptxBlob(normalized);
            await uploadNotebookExportBlob(blob, name);
            addToast(`Файл «${name}» загружен на диск`, 'success');
        } catch (e) {
            console.error(e);
            addToast('Не удалось загрузить PPTX на диск', 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleXlsxToDrive = async () => {
        setBusy(true);
        try {
            const name = `dannye-grafika-${Date.now()}.xlsx`;
            const blob = await buildChartXlsxBlob(normalized);
            await uploadNotebookExportBlob(blob, name);
            addToast(`Файл «${name}» загружен на диск`, 'success');
        } catch (e) {
            console.error(e);
            addToast('Не удалось загрузить Excel на диск', 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 border-t border-slate-100/80 pt-3">
            <button
                type="button"
                onClick={handlePptx}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
            >
                <Download className="h-3.5 w-3.5" />
                {busy ? 'Создание…' : 'Скачать .pptx'}
            </button>
            <button
                type="button"
                onClick={handlePptxToDrive}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-900 hover:bg-violet-100 disabled:opacity-50"
                title="Сохранить презентацию в Drive"
            >
                <CloudUpload className="h-3.5 w-3.5" />
                {busy ? 'Загрузка…' : 'На диск (.pptx)'}
            </button>
            <button
                type="button"
                onClick={handleXlsx}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
            >
                <Download className="h-3.5 w-3.5" />
                {busy ? 'Создание…' : 'Скачать .xlsx'}
            </button>
            <button
                type="button"
                onClick={handleXlsxToDrive}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-900 hover:bg-teal-100 disabled:opacity-50"
            >
                <CloudUpload className="h-3.5 w-3.5" />
                {busy ? 'Загрузка…' : 'На диск (.xlsx)'}
            </button>
        </div>
    );
}

/** Просмотр презентации: слайды с навигацией */
const presentationText = (key, params) => i18n.t(`drive:presentation.${key}`, params);

// One slide item: Markdown inline text whose citations render as numbered chips
// (CitationNumbers is provided by PresentationSlidesView).
function SlideText({ children }) {
    return <AssistantInlineMarkdown>{children}</AssistantInlineMarkdown>;
}

function PresentationSlideBody({ slide, layout, theme }) {
    const { items, ordered } = slideBullets(slide.body);
    const paragraphs = slideParagraphs(slide.body);
    const lead = paragraphs[0] || '';
    const rest = paragraphs.slice(1);
    const accent = css(theme.accent);
    const muted = { color: css(theme.muted) };
    const surface = { background: css(theme.surface), borderColor: css(theme.border) };

    if (layout === 'markdown') {
        return (
            <div className="nb-slide-markdown text-[15px] leading-7" style={{ color: css(theme.text) }}>
                <AssistantMarkdown withSources={false}>{slide.body}</AssistantMarkdown>
            </div>
        );
    }

    const paragraphsBlock = (list) => list.map((text, i) => (
        <p key={`p-${i}`} className="text-[15px] leading-7" style={muted}><SlideText>{text}</SlideText></p>
    ));

    if (layout === 'cover') {
        return (
            <div className="flex flex-col gap-5">
                {lead ? <p className="max-w-3xl text-[17px] leading-8" style={muted}><SlideText>{lead}</SlideText></p> : null}
                {items.length ? (
                    <ol className="grid gap-x-8 gap-y-3 @2xl:grid-cols-2">
                        {items.map((item, i) => (
                            <li key={`c-${i}`} className="flex gap-3 text-[15px] leading-7">
                                <span className="mt-0.5 text-[13px] font-semibold tabular-nums" style={{ color: accent }}>{String(i + 1).padStart(2, '0')}</span>
                                <span className="min-w-0"><SlideText>{item}</SlideText></span>
                            </li>
                        ))}
                    </ol>
                ) : null}
                {paragraphsBlock(rest)}
            </div>
        );
    }

    if (layout === 'steps') {
        return (
            <div className="flex flex-col gap-4">
                {lead ? <p className="text-[15px] leading-7" style={muted}><SlideText>{lead}</SlideText></p> : null}
                <ol className="flex flex-col">
                    {items.map((item, i) => (
                        <li key={`s-${i}`} className="relative flex gap-4 pb-4 last:pb-0">
                            {i < items.length - 1 ? <span aria-hidden className="absolute left-[15px] top-8 bottom-0 w-px" style={{ background: css(theme.border) }} /> : null}
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold" style={{ background: accent, color: css(theme.onAccent) }}>{i + 1}</span>
                            <span className="min-w-0 pt-1 text-[15px] leading-7"><SlideText>{item}</SlideText></span>
                        </li>
                    ))}
                </ol>
                {paragraphsBlock(rest)}
            </div>
        );
    }

    if (layout === 'cards') {
        return (
            <div className="flex flex-col gap-4">
                {lead ? <p className="text-[15px] leading-7" style={muted}><SlideText>{lead}</SlideText></p> : null}
                <div className="grid gap-3 @2xl:grid-cols-2">
                    {items.map((item, i) => (
                        <div key={`k-${i}`} className="rounded-xl border px-4 py-3.5 text-[15px] leading-7" style={surface}>
                            <span className="mr-2 text-[13px] font-semibold tabular-nums" style={{ color: accent }}>{String(i + 1).padStart(2, '0')}</span>
                            <SlideText>{item}</SlideText>
                        </div>
                    ))}
                </div>
                {paragraphsBlock(rest)}
            </div>
        );
    }

    if (layout === 'summary') {
        return (
            <div className="flex flex-col gap-4">
                {lead ? <p className="text-[15px] leading-7" style={muted}><SlideText>{lead}</SlideText></p> : null}
                {items.length ? (
                    <ul className="flex flex-col gap-3 rounded-xl px-5 py-4" style={{ background: css(theme.accentSoft) }}>
                        {items.map((item, i) => (
                            <li key={`t-${i}`} className="flex gap-3 text-[15px] leading-7">
                                <Check className="mt-1.5 h-4 w-4 shrink-0" strokeWidth={2.4} style={{ color: accent }} />
                                <span className="min-w-0"><SlideText>{item}</SlideText></span>
                            </li>
                        ))}
                    </ul>
                ) : null}
                {paragraphsBlock(rest)}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            {lead ? <p className="text-[16px] leading-7" style={muted}><SlideText>{lead}</SlideText></p> : null}
            {items.length ? (
                <ul className="flex flex-col gap-3">
                    {items.map((item, i) => (
                        <li key={`l-${i}`} className="flex gap-3 text-[15px] leading-7">
                            {ordered
                                ? <span className="mt-0.5 text-[13px] font-semibold tabular-nums" style={{ color: accent }}>{i + 1}.</span>
                                : <span aria-hidden className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />}
                            <span className="min-w-0"><SlideText>{item}</SlideText></span>
                        </li>
                    ))}
                </ul>
            ) : null}
            {paragraphsBlock(rest)}
        </div>
    );
}

function PresentationSlidesView({ text }) {
    const { addToast } = useToast();
    const slides = useMemo(() => parsePresentationSlides(text), [text]);
    const [idx, setIdx] = useState(0);
    const [themeId, setThemeId] = useState(() => readPresentationTheme(typeof window === 'undefined' ? null : window.localStorage));
    const [exportingPptx, setExportingPptx] = useState(false);
    const [uploadingPptxToDrive, setUploadingPptxToDrive] = useState(false);
    const theme = getPresentationTheme(themeId);

    useEffect(() => {
        setIdx(0);
    }, [text]);

    useEffect(() => {
        const onKey = (e) => {
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setIdx((i) => Math.max(0, i - 1));
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                setIdx((i) => Math.min(Math.max(0, slides.length - 1), i + 1));
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [slides.length]);

    const n = slides.length;
    const safeIdx = Math.min(Math.max(0, idx), Math.max(0, n - 1));
    const slide = slides[safeIdx];
    const slideBody = useMemo(() => (slide ? unwrapCitationGroups(normalizeAssistantMarkdown(slide.body)) : ''), [slide]);
    const citations = useMemo(() => collectCitations(slideBody), [slideBody]);

    if (n === 0) {
        return (
            <div className="text-sm text-gray-600 rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-4 py-6 text-center">
                Не удалось разобрать слайды. Попросите модель разделить слайды строкой <code className="text-xs bg-white px-1 rounded">---</code> и
                начинать каждый слайд с <code className="text-xs bg-white px-1 rounded">## Заголовок</code>.
            </div>
        );
    }

    const layout = slideLayout(slide, safeIdx, n);
    const deckTitle = slides[0]?.title || '';
    const chooseTheme = (id) => {
        setThemeId(id);
        storePresentationTheme(window.localStorage, id);
    };
    const safeFileTitle = () => (slides[0]?.title || 'prezentatsiya').slice(0, 40).replace(/[/\\?%*:|"<>]/g, '-');

    return (
        <div className="@container space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2" role="radiogroup" aria-label={presentationText('theme')}>
                    <span className="text-[12px] text-slate-500">{presentationText('theme')}</span>
                    {PRESENTATION_THEMES.map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            role="radio"
                            aria-checked={option.id === theme.id}
                            onClick={() => chooseTheme(option.id)}
                            title={presentationText(`themes.${option.id}`)}
                            aria-label={presentationText(`themes.${option.id}`)}
                            className={clsx('flex h-7 items-center gap-1.5 rounded-full border px-2 text-[12px] transition-colors', option.id === theme.id ? 'border-slate-900 text-slate-900' : 'border-slate-200 text-slate-600 hover:border-slate-300')}
                        >
                            <span aria-hidden className="flex h-4 w-4 overflow-hidden rounded-full border border-black/10">
                                <span className="h-full w-1/2" style={{ background: css(option.bg) }} />
                                <span className="h-full w-1/2" style={{ background: css(option.accent) }} />
                            </span>
                            <span className="hidden @lg:inline">{presentationText(`themes.${option.id}`)}</span>
                        </button>
                    ))}
                </div>
                <span className="text-[12px] font-medium tabular-nums text-slate-500">{safeIdx + 1} / {n}</span>
            </div>

            <div
                className={clsx(
                    'overflow-hidden rounded-2xl border shadow-[0_16px_40px_-18px_rgba(15,23,42,0.25)]',
                    // Citation chips are styled for light backgrounds.
                    theme.dark && '[&_a[aria-label]]:!bg-white/15 [&_a[aria-label]]:!text-sky-200 [&_footer_a]:!border-white/15 [&_footer_a]:!bg-white/10 [&_footer_a]:!text-slate-200 [&_footer_a_span]:!text-slate-200',
                )}
                style={{ background: css(theme.bg), color: css(theme.text), borderColor: css(theme.border) }}
            >
                {theme.band ? <div aria-hidden className="h-1.5" style={{ background: css(theme.accent) }} /> : null}
                <motion.div
                    key={`${safeIdx}-${theme.id}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22 }}
                    className={clsx('flex min-h-[320px] flex-col gap-5 p-6 @2xl:p-9', layout === 'cover' && '@2xl:min-h-[380px] @2xl:justify-center')}
                >
                    <header className="flex flex-col gap-3">
                        {safeIdx > 0 && deckTitle ? (
                            <p className="truncate text-[12px] font-medium uppercase tracking-[0.14em]" style={{ color: css(theme.muted) }}>{deckTitle}</p>
                        ) : null}
                        <h3 className={clsx('font-semibold leading-tight tracking-tight', layout === 'cover' ? 'text-[26px] @2xl:text-[34px]' : 'text-[22px] @2xl:text-[27px]')}>
                            {slide.title}
                        </h3>
                        <span aria-hidden className="h-1 w-12 rounded-full" style={{ background: css(theme.accent) }} />
                    </header>
                    <CitationNumbers.Provider value={citations.numbers}>
                        <PresentationSlideBody slide={{ ...slide, body: slideBody }} layout={layout} theme={theme} />
                    </CitationNumbers.Provider>
                    {citations.files.length ? (
                        <footer className="mt-auto flex flex-wrap gap-1.5 pt-2">
                            {citations.files.map((file) => (
                                <NotebookSourceLink key={file.href} href={file.href} variant="chip" numbers={numberRanges(file.numbers)}>{file.name}</NotebookSourceLink>
                            ))}
                        </footer>
                    ) : null}
                </motion.div>
            </div>

            <div className="flex items-center justify-between gap-2">
                <button
                    type="button"
                    onClick={() => setIdx((i) => Math.max(0, i - 1))}
                    disabled={safeIdx === 0}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40"
                    aria-label="Предыдущий слайд"
                >
                    <ChevronLeft className="h-4 w-4" />
                    Назад
                </button>
                <div className="flex flex-wrap justify-center gap-1.5">
                    {slides.map((_, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => setIdx(i)}
                            className={`h-2 rounded-full transition-all duration-300 ${i === safeIdx ? 'w-6' : 'w-2 bg-slate-300 hover:bg-slate-400'}`}
                            style={i === safeIdx ? { background: css(theme.accent) } : undefined}
                            aria-label={`Слайд ${i + 1}`}
                            aria-current={i === safeIdx ? 'step' : undefined}
                        />
                    ))}
                </div>
                <button
                    type="button"
                    onClick={() => setIdx((i) => Math.min(n - 1, i + 1))}
                    disabled={safeIdx >= n - 1}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40"
                    aria-label="Следующий слайд"
                >
                    Далее
                    <ChevronRight className="h-4 w-4" />
                </button>
            </div>
            <div className="flex flex-wrap justify-center gap-2 pt-1">
                <button
                    type="button"
                    onClick={async () => {
                        setExportingPptx(true);
                        try {
                            await exportPresentationToPptx(slides, `${safeFileTitle()}-${Date.now()}.pptx`, theme.id);
                            addToast('Файл .pptx скачан', 'success');
                        } catch (e) {
                            console.error(e);
                            addToast('Не удалось создать презентацию', 'error');
                        } finally {
                            setExportingPptx(false);
                        }
                    }}
                    disabled={exportingPptx || uploadingPptxToDrive}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-800 shadow-sm hover:bg-indigo-100 disabled:opacity-50"
                >
                    <Download className="h-3.5 w-3.5" />
                    {exportingPptx ? 'Создание…' : 'Скачать все слайды (.pptx)'}
                </button>
                <button
                    type="button"
                    onClick={async () => {
                        setUploadingPptxToDrive(true);
                        try {
                            const fname = `${safeFileTitle()}-${Date.now()}.pptx`;
                            const blob = await buildPresentationPptxBlob(slides, fname, theme.id);
                            await uploadNotebookExportBlob(blob, fname);
                            addToast(`Презентация «${fname}» загружена на диск`, 'success');
                        } catch (e) {
                            console.error(e);
                            addToast('Не удалось загрузить презентацию на диск', 'error');
                        } finally {
                            setUploadingPptxToDrive(false);
                        }
                    }}
                    disabled={exportingPptx || uploadingPptxToDrive}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-900 shadow-sm hover:bg-violet-100 disabled:opacity-50"
                    title="Сохранить презентацию в Drive"
                >
                    <CloudUpload className="h-3.5 w-3.5" />
                    {uploadingPptxToDrive ? 'Загрузка…' : 'На диск (.pptx)'}
                </button>
            </div>
        </div>
    );
}

const CHART_PALETTE = ['#6366f1', '#8b5cf6', '#14b8a6', '#f59e0b', '#ec4899', '#0ea5e9', '#22c55e'];

function parseChartSpecFromText(raw) {
    const t = (raw || '').trim();
    if (!t) return null;
    const block = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = block ? block[1].trim() : t;
    try {
        const obj = JSON.parse(jsonStr);
        return obj && typeof obj === 'object' ? obj : null;
    } catch {
        return null;
    }
}

/** Нормализует ответ модели в spec для Recharts */
function normalizeChartSpec(spec) {
    if (!spec || typeof spec !== 'object') return null;
    const kindRaw = spec.kind || spec.chart || spec.type;
    const kind = String(kindRaw || 'bar').toLowerCase();
    const data = Array.isArray(spec.data) ? spec.data : null;
    if (!data || data.length === 0) return null;

    if (kind === 'pie') {
        const nameKey = spec.nameKey || 'name';
        const valueKey = spec.valueKey || 'value';
        return { kind: 'pie', title: spec.title, data, nameKey, valueKey };
    }

    if (kind !== 'bar' && kind !== 'line') return null;

    const xKey = spec.xKey || spec.categoryKey || 'name';
    const series =
        Array.isArray(spec.series) && spec.series.length > 0
            ? spec.series.map((s, i) => ({
                  key: s.key,
                  name: s.name || s.key,
                  color: s.color || CHART_PALETTE[i % CHART_PALETTE.length],
              }))
            : [{ key: spec.valueKey || 'value', name: spec.yLabel || 'Значение', color: CHART_PALETTE[0] }];

    if (!series.every((s) => s.key)) return null;

    return { kind, title: spec.title, data, xKey, series };
}

/** true, если текст — валидная спека графика (в т.ч. в ```json), даже без assistant_type с бэкенда */
function isLikelyChartJsonContent(text) {
    if (!text || typeof text !== 'string') return false;
    const spec = parseChartSpecFromText(text);
    if (!spec) return false;
    if (isEmptyChartDataSpec(spec)) return true;
    return normalizeChartSpec(spec) != null;
}

/** Нормализация типа ответа из API (регистр, алиасы, лишние поля) */
function normalizeNotebookMessageFormat(raw) {
    if (raw == null || raw === '') return null;
    const s = String(raw).trim().toLowerCase();
    const aliases = {
        graph: 'chart',
        diagram: 'chart',
        barchart: 'chart',
        bar_chart: 'chart',
        linechart: 'chart',
        piechart: 'chart',
    };
    const mapped = aliases[s] || s;
    const allowed = new Set(['cards', 'test', 'table', 'report', 'presentation', 'chart', 'mermaid', 'compare', 'text']);
    if (!allowed.has(mapped)) return null;
    return mapped === 'text' ? null : mapped;
}

/**
 * Формат отрисовки ответа ассистента: учитывает сохранённый format и подстраховку по JSON графика
 * (если бэкенд не вернул assistant_type при загрузке истории).
 */
function getAssistantMessageFormat(msg) {
    if (msg.role !== 'assistant') return null;
    const explicit = msg.format;
    const explicitUseful = explicit && explicit !== 'text';
    if (explicitUseful) return explicit;
    if (isLikelyChartJsonContent(msg.content)) return 'chart';
    return null;
}

/** Валидный объект графика, но без строк в data — не ошибка формата */
function isEmptyChartDataSpec(spec) {
    if (!spec || typeof spec !== 'object') return false;
    const kind = spec.kind || spec.chart || spec.type;
    if (!kind) return false;
    const data = spec.data;
    return Array.isArray(data) && data.length === 0;
}

/** График по JSON (bar / line / pie) */
function ChartResponseView({ text }) {
    const spec = useMemo(() => parseChartSpecFromText(text), [text]);
    const normalized = useMemo(() => normalizeChartSpec(spec), [spec]);

    const fallbackMd = (
        <div className="text-sm text-gray-700 max-w-none">
            <AssistantMarkdown>{normalizeMarkdownTables(normalizeAssistantMarkdown(text))}</AssistantMarkdown>
        </div>
    );

    if (!normalized) {
        if (isEmptyChartDataSpec(spec)) {
            const title =
                typeof spec.title === 'string' && spec.title.trim()
                    ? spec.title.trim()
                    : 'Недостаточно данных для построения графика.';
            return (
                <div className="space-y-3">
                    <div className="rounded-xl border border-slate-200/90 bg-gradient-to-br from-slate-50 to-white px-4 py-3 shadow-sm ring-1 ring-slate-100">
                        <p className="text-sm font-medium text-slate-900">{title}</p>
                        <p className="mt-2 text-xs leading-relaxed text-slate-600">
                            В источниках не нашлось числовых рядов для оси и значений. Пожалуйста, добавьте в документы таблицу или список с числами (например, «Январь: 10, Февраль: 20») и повторите запрос.
                        </p>
                    </div>
                    <details className="text-xs text-slate-500">
                        <summary className="cursor-pointer select-none text-slate-600 hover:text-slate-800">
                            Показать ответ модели
                        </summary>
                        <div className="mt-2 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-950/95 p-3 font-mono text-[11px] text-slate-200">
                            <AssistantMarkdown>{normalizeMarkdownTables(normalizeAssistantMarkdown(text))}</AssistantMarkdown>
                        </div>
                    </details>
                </div>
            );
        }
        return (
            <div className="space-y-3">
                <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-900 leading-relaxed">
                    <strong>Не удалось построить график.</strong> ИИ не обнаружил в документах данных, пригодных для визуализации.
                    Пожалуйста, убедитесь, что в источниках есть числовые данные (например, таблица или список вида «Январь: 10, Февраль: 20»), и повторите запрос.
                </div>
                {fallbackMd}
            </div>
        );
    }

    const tooltipStyle = {
        borderRadius: '12px',
        border: '1px solid rgb(226 232 240)',
        fontSize: '12px',
    };

    if (normalized.kind === 'pie') {
        const { data, nameKey, valueKey, title } = normalized;
        return (
            <div className="space-y-0">
                <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/80 p-4 shadow-md ring-1 ring-slate-100">
                    {title ? <h4 className="mb-3 text-center text-sm font-semibold tracking-tight text-slate-900">{title}</h4> : null}
                    <div className="h-[min(300px,40vh)] w-full min-w-0" style={{ minWidth: 0 }}>
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                            <PieChart>
                                <Pie
                                    data={data}
                                    dataKey={valueKey}
                                    nameKey={nameKey}
                                    cx="50%"
                                    cy="50%"
                                    outerRadius={100}
                                    paddingAngle={2}
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                >
                                    {data.map((_, i) => (
                                        <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} stroke="#fff" strokeWidth={1} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={tooltipStyle} />
                                <Legend wrapperStyle={{ fontSize: '12px' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                <ChartExportActions normalized={normalized} />
            </div>
        );
    }

    const { kind, title, data, xKey, series } = normalized;
    const ChartComp = kind === 'line' ? LineChart : BarChart;

    return (
        <div className="space-y-0">
            <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/80 p-4 shadow-md ring-1 ring-slate-100">
                {title ? <h4 className="mb-3 text-center text-sm font-semibold tracking-tight text-slate-900">{title}</h4> : null}
                <div className="h-[min(300px,40vh)] w-full min-w-0" style={{ minWidth: 0 }}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                        <ChartComp data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                            <XAxis dataKey={xKey} tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
                            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} width={40} />
                            <Tooltip contentStyle={tooltipStyle} />
                            <Legend wrapperStyle={{ fontSize: '12px' }} />
                            {series.map((s) =>
                                kind === 'line' ? (
                                    <Line
                                        key={s.key}
                                        type="monotone"
                                        dataKey={s.key}
                                        name={s.name}
                                        stroke={s.color}
                                        strokeWidth={2}
                                        dot={{ r: 3 }}
                                        activeDot={{ r: 5 }}
                                    />
                                ) : (
                                    <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[6, 6, 0, 0]} maxBarSize={48} />
                                )
                            )}
                        </ChartComp>
                    </ResponsiveContainer>
                </div>
            </div>
            <ChartExportActions normalized={normalized} />
        </div>
    );
}

/** Красивый рендер ответа по формату: карточки, тест, таблица, отчёт, Mermaid */
function FormattedMessage({ content, format }) {
    if (!content || typeof content !== 'string') return <span>{String(content)}</span>;
    const text = normalizeMarkdownTables(normalizeAssistantMarkdown(content));

    const lowerContent = text.toLowerCase();
    const isRefusal =
        lowerContent.includes('к сожалению') ||
        lowerContent.includes('недостаточно информации') ||
        lowerContent.includes('информации недостаточно') ||
        lowerContent.includes('нет информации') ||
        lowerContent.includes('в запросе не указано') ||
        lowerContent.includes('не предоставлены') ||
        lowerContent.includes('не удалось получить') ||
        lowerContent.includes('не удалось найти') ||
        lowerContent.includes('уточните требуемую') ||
        lowerContent.includes('предоставьте конкретные') ||
        lowerContent.includes('в предоставленных документах не');

    if (isRefusal) {
        return (
            <div className="text-sm text-gray-800 leading-relaxed max-w-none">
                <AssistantMarkdown>{text}</AssistantMarkdown>
            </div>
        );
    }

    // Диаграммы Mermaid: markdown с блоками ```mermaid (рендер в AssistantMarkdown)
    if (format === 'mermaid') {
        return (
            <div className="text-sm text-gray-800 leading-relaxed max-w-none">
                <AssistantMarkdown>{text}</AssistantMarkdown>
            </div>
        );
    }

    if (format === 'presentation') {
        return <PresentationSlidesView text={text} />;
    }

    if (format === 'chart') {
        return <ChartResponseView text={text} />;
    }

    // Карточки: клик открывает карточку в модальном окне
    if (format === 'cards') {
        const blocks = text.split(/\n\n+/).filter(Boolean);
        const cards = blocks.map((block) => {
            const trimmed = block.trim();
            const m = trimmed.match(/^\s*\*\*([^*]+)\*\*\s*[—\-]?\s*\n?(.*)$/s);
            let title;
            let body;
            if (m) {
                title = m[1].trim();
                body = m[2].trim();
            } else {
                // Нет **Заголовок** — берём первую строку как заголовок, остальное как описание
                const firstNewline = trimmed.indexOf('\n');
                if (firstNewline === -1) {
                    title = trimmed || null;
                    body = '';
                } else {
                    title = trimmed.slice(0, firstNewline).trim() || null;
                    body = trimmed.slice(firstNewline + 1).trim();
                }
            }
            // Пустое тело (только дефисы/пробелы) не показываем как "---"
            if (/^[\s\-—]+$/.test(body)) body = '';
            // Заголовок из одних дефисов/пробелов считаем пустым
            if (title !== null && /^[\s\-—]+$/.test(title)) title = null;
            return { title, body };
        });
        return <FlashCardsGrid cards={cards} />;
    }

    // Тест: правильный ответ показывается только после клика по варианту
    if (format === 'test') {
        const optionRegex = /^\s*[a-dа-г]\s*[\.\)]\s*/i;
        // Поддержка форматов: "1. текст", "**Вопрос 1:** текст", "Вопрос 1: текст"
        const partsByNum = text.split(/(?=\d+\.\s)/).filter((p) => /^\d+\.\s/.test(p.trim()));
        const partsByBold = text.split(/(?=\*\*Вопрос\s+\d+\*\*:?\s*)/i).filter((p) => {
            const t = p.trim();
            return t.length > 0 && /^\*\*Вопрос\s+\d+\*\*:?\s*/i.test(t);
        });
        const partsByPlain = text.split(/(?=Вопрос\s+\d+\s*:?\s*)/i).filter((p) => {
            const t = p.trim();
            return t.length > 0 && /^Вопрос\s+\d+\s*:?\s*/i.test(t);
        });
        let parts = partsByBold.length >= partsByNum.length ? partsByBold : partsByNum;
        if (partsByPlain.length > parts.length) parts = partsByPlain;

        const extractCorrectAnswer = (text) => {
            if (!text || typeof text !== 'string') return null;
            // Явная буква после двоеточия (в т.ч. **A**, «A», A.)
            const direct = text.match(
                /(?:\*\*)?Правильный ответ(?:\*\*)?\s*:\s*(?:\*\*)?([A-Da-dа-г])(?:\*\*)?/i
            );
            if (direct?.[1]) return direct[1].toLowerCase();
            // Строка «Правильный ответ: …» — берём хвост и вытаскиваем первую букву a–d / а–г
            const tail = text.match(/Правильный ответ\s*:\s*(.+)$/im);
            if (tail?.[1]) {
                const cleaned = tail[1].replace(/\*\*/g, '').trim();
                const letter = cleaned.match(/([a-dа-г])/i);
                if (letter) return letter[1].toLowerCase();
            }
            return null;
        };

        const questions = parts.map((part) => {
            const rawLines = part.trim().split(/\n/).map((l) => l.trim()).filter(Boolean);
            const lines = rawLines.filter((l) => !/Правильный ответ\s*:\s*/i.test(l));
            const correct = extractCorrectAnswer(part);

            const first = lines[0] || '';
            let questionText = '';
            let optionLines = [];

            const boldHeaderMatch = first.match(/^\*\*Вопрос\s+\d+\*\*:?\s*(.*)$/i);
            const plainHeaderMatch = first.match(/^Вопрос\s+\d+\s*:?\s*(.*)$/i);
            if (boldHeaderMatch) {
                questionText = boldHeaderMatch[1].trim();
                const rest = lines.slice(1);
                const optionStart = rest.findIndex((l) => optionRegex.test(l));
                if (optionStart >= 0) {
                    const questionRest = rest.slice(0, optionStart).filter((l) => !optionRegex.test(l));
                    if (questionRest.length) questionText += ' ' + questionRest.join(' ').trim();
                    optionLines = rest.slice(optionStart);
                } else {
                    optionLines = rest;
                }
            } else if (plainHeaderMatch) {
                questionText = plainHeaderMatch[1].trim();
                const rest = lines.slice(1);
                const optionStart = rest.findIndex((l) => optionRegex.test(l));
                if (optionStart >= 0) {
                    const questionRest = rest.slice(0, optionStart).filter((l) => !optionRegex.test(l));
                    if (questionRest.length) questionText += ' ' + questionRest.join(' ').trim();
                    optionLines = rest.slice(optionStart);
                } else {
                    optionLines = rest;
                }
            } else {
                const numMatch = first.match(/^(\d+)\.\s*(.*)$/);
                questionText = numMatch ? numMatch[2].trim() : first.trim();
                optionLines = lines.slice(1).filter((l) => !/Правильный ответ\s*:\s*/i.test(l));
                if (questionText && optionRegex.test(questionText)) {
                    optionLines = [questionText, ...optionLines];
                    questionText = '';
                }
            }

            const options = optionLines.filter((l) => optionRegex.test(l)).map(cleanQuizOption);
            const fallbackLines = options.length === 0 ? optionLines : [];
            return { questionText: questionText.replace(/\*\*/g, '').trim(), options, correct, fallbackLines };
        });
        const hasVisibleQuestions = questions.some((q) => q.options.length > 0 || q.fallbackLines?.length > 0);
        if (questions.length === 0 || !hasVisibleQuestions) {
            return (
                <div className="text-sm text-gray-800 max-w-none">
                    <AssistantMarkdown>{text}</AssistantMarkdown>
                </div>
            );
        }
        return <TestView questions={questions} />;
    }

    // Отчёт / по умолчанию: полный markdown (жирный, списки, заголовки, GFM-таблицы)
    return (
        <div className="text-sm text-gray-800 leading-relaxed max-w-none">
            <AssistantMarkdown>{text}</AssistantMarkdown>
        </div>
    );
}

const GENERATION_FORMATS = [
    {
        id: 'cards',
        label: 'Карточки',
        icon: Layers,
        instruction:
            'Ответь в виде набора карточек. Каждая карточка: краткий заголовок и 1–2 предложения. Разделяй карточки пустой строкой. Используй формат: **Заголовок** — описание.',
    },
    {
        id: 'test',
        label: 'Тест',
        icon: ClipboardList,
        instruction:
            'Ответь в виде теста: несколько вопросов по содержимому. Для каждого вопроса: текст вопроса, варианты ответа (a, b, c, d), отдельной строкой в конце вопроса: «Правильный ответ: A» (одна латинская буква A–D без markdown вокруг буквы).',
    },
    {
        id: 'table',
        label: 'Таблица',
        icon: Table2,
        instruction:
            'Только GFM-таблица Markdown. Первая строка — заголовки колонок со смысловыми названиями на русском (например: «Документ», «Релевантность», «Фрагмент» или под задачу пользователя). Не используй буквы A, B, C как заголовки — это был лишь пример структуры. Затем строка-разделитель | --- | --- | --- | (по числу колонок), затем строки данных. Каждая строка — с | в начале и конце. Без списков внутри таблицы; без пустых строк между строками таблицы. При необходимости после таблицы — краткий вывод текстом.',
    },
    {
        id: 'report',
        label: 'Отчёт',
        icon: FileBarChart,
        instruction:
            'Ответь кратким отчётом: разделы **Цель**, **Основные пункты**, **Выводы**. Для сравнения документов или сводок по файлам используй GFM-таблицу (| заголовок | … |, строка |---|---|, строки данных). Опирайся только на контекст документов.',
    },
    {
        id: 'presentation',
        label: 'Презентация',
        icon: Presentation,
        instruction:
            'Составь презентацию по материалу документов. Каждый слайд — отдельный блок: первая строка слайда — заголовок в виде ## Краткий заголовок, затем 2–5 тезисов маркированным списком или короткий абзац. Слайды строго разделяй одной строкой из трёх дефисов --- на отдельной строке (между слайдами). Не вставляй строку --- внутри слайда. Обычно 5–12 слайдов. Первый слайд может быть титульным (тема). Без HTML, только Markdown.',
    },
    {
        id: 'chart',
        label: 'График',
        icon: BarChart2,
        instruction:
            'Верни ТОЛЬКО один блок кода ```json (без текста до и после), с валидным JSON для графика по данным из документов. Схема: { "title": "краткий заголовок", "kind": "bar" | "line" | "pie", "data": [ ... ] }. Для bar/line: "xKey" — имя поля категории на оси X (например "name"), "series": [ { "key": "поле_числа", "name": "Подпись в легенде" } ] — одна или несколько серий; каждая строка в data содержит xKey и ключи из series. Для pie: "nameKey": "name", "valueKey": "value", data: [ { "name": "…", "value": число } ]. Числа — реальные из контекста или агрегированные; если точных чисел нет — оцени и подпиши в title что это оценка.',
    },
    {
        id: 'mermaid',
        label: 'Диаграмма Mermaid',
        icon: Workflow,
        instruction:
            'Дай краткое пояснение и одну или несколько диаграмм в блоках кода с языком mermaid: ```mermaid ... ```. Используй подходящий синтаксис: graph TD/LR, flowchart, sequenceDiagram, stateDiagram и т.д. по смыслу вопроса и контекста документов. ВАЖНО: любые текстовые значения узлов (особенно с пробелами, слэшами / или кириллицей) обязательно заключай в двойные кавычки, например: A["Текст блока / API"]. Без лишнего текста вне диаграммы, кроме короткого вступления или итога при необходимости.',
    },
    {
        id: 'compare',
        label: 'Сравнить файлы',
        icon: ArrowLeftRight,
        instruction:
            'Сравни выбранные документы между собой. Верни структурированный ответ на русском: сначала краткий итог, затем разделы **Совпадает**, **Отличается**, **Только в одном файле**, **Вывод**. Если уместно, добавь GFM-таблицу вида | Параметр | Файл A | Файл B | Отличие |. Обязательно называй файлы по именам и опирайся только на переданные документы.',
    },
];

function readStoredGenerationFormat() {
    if (typeof window === 'undefined') return null;
    const ids = new Set(GENERATION_FORMATS.map((f) => f.id));
    const raw = window.localStorage.getItem('notebook_generation_format');
    return raw && ids.has(raw) ? raw : null;
}

function buildCompareFilesPrompt(question, selectedFiles) {
    const namedFiles = (selectedFiles || []).filter((file) => file?.id);
    const fileNames = namedFiles.map((file, index) => `${index + 1}. ${file.name || `Документ ${index + 1}`}`);
    const compareTask = question?.trim()
        ? question.trim()
        : 'Сравни выбранные документы и покажи ключевые сходства и различия.';

    return [
        'Сравни между собой выбранные документы.',
        '',
        'Документы для сравнения:',
        fileNames.join('\n'),
        '',
        'Что нужно сделать:',
        compareTask,
        '',
        'Требования к ответу:',
        '- сначала короткий итог сравнения',
        '- затем разделы: Совпадает, Отличается, Только в одном файле, Вывод',
        '- обязательно указывай названия файлов',
        '- если есть удобные поля для сопоставления, добавь GFM-таблицу сравнения',
        '- не выдумывай данные, опирайся только на текст документов',
    ].join('\n');
}

const PRESENTATION_PROVIDER_MARKDOWN = 'llm-markdown';

const PRESENTATION_PROVIDER_OPTIONS = [
    { id: SLIDE_PROVIDER_TWOSLIDES, label: 'Сервис 2slides' },
    { id: PRESENTATION_PROVIDER_MARKDOWN, label: 'Встроенная генерация' },
];

const PRESENTATION_RENDER_MODE_OPTIONS = [
    { id: 'fast_ppt', label: 'Fast PPT', hint: 'Дешевле и быстрее для черновиков' },
    { id: 'pdf_slides', label: 'PDF Slides', hint: 'Красивее, но дороже' },
];

const DEFAULT_FAST_PPT_THEME_ID = 'minimal-dark';

function readStoredPresentationProvider() {
    if (typeof window === 'undefined') return PRESENTATION_PROVIDER_MARKDOWN;
    const ids = new Set(PRESENTATION_PROVIDER_OPTIONS.map((option) => option.id));
    const raw = window.localStorage.getItem('notebook_presentation_provider');
    return raw && ids.has(raw) ? raw : PRESENTATION_PROVIDER_MARKDOWN;
}

function readStoredPresentationRenderMode() {
    if (typeof window === 'undefined') return 'fast_ppt';
    const ids = new Set(PRESENTATION_RENDER_MODE_OPTIONS.map((option) => option.id));
    const raw = window.localStorage.getItem('notebook_presentation_render_mode');
    return raw && ids.has(raw) ? raw : 'fast_ppt';
}

function readStoredFastPptThemeId() {
    if (typeof window === 'undefined') return DEFAULT_FAST_PPT_THEME_ID;
    return window.localStorage.getItem('notebook_fast_ppt_theme_id') || DEFAULT_FAST_PPT_THEME_ID;
}

function findDeepValue(input, candidateKeys, depth = 0) {
    if (depth > 5 || input == null) return undefined;
    if (Array.isArray(input)) {
        for (const item of input) {
            const found = findDeepValue(item, candidateKeys, depth + 1);
            if (found !== undefined) return found;
        }
        return undefined;
    }
    if (typeof input !== 'object') return undefined;
    for (const [key, value] of Object.entries(input)) {
        const normalizedKey = key.toLowerCase();
        if (candidateKeys.includes(normalizedKey) && value != null && value !== '') {
            return value;
        }
    }
    for (const value of Object.values(input)) {
        const found = findDeepValue(value, candidateKeys, depth + 1);
        if (found !== undefined) return found;
    }
    return undefined;
}

function truncateForMarkdown(value, limit = 1600) {
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    if (text.length <= limit) return text;
    return `${text.slice(0, limit)}\n...`;
}

function buildTwoSlidesUserInput(question, context, renderMode = 'fast_ppt') {
    const slideCountLine =
        renderMode === 'pdf_slides'
            ? '- 3 слайда / страницы максимум, каждый слайд ёмкий, но визуально свободный'
            : '- 6–8 слайдов';
    const taskBlock = [
        'Задача пользователя:',
        question,
        '',
        'Требования к презентации:',
        slideCountLine,
        '- стиль: executive / деловой',
        '- язык: русский',
        '- структура: контекст, ключевые этапы, архитектурные ограничения, риски, выводы',
        '- формулировки короткие, ясные и презентационные',
        '- на каждом слайде мало текста: 1 заголовок и 2–4 коротких тезиса',
        '- не перегружать слайды длинными абзацами',
        '- визуальный стиль как у интерфейса GovWorkspace: светлый фон, чистый минимализм, единая палитра глубокого синего/индиго с мягкими светло-голубыми оттенками, аккуратные золотистые акценты только в деталях',
        '- единая цветовая гамма на всей презентации, без случайных цветов и без пестроты',
        '- типографика аккуратная и современная: крупные уверенные заголовки, читабельный нейтральный sans-serif, без декоративных шрифтов',
        '- много воздуха и ровная сетка, избегать визуального шума, избыточных иконок, тяжёлых декоративных элементов и переполнения блоков',
        '- композиция должна быть спокойной, премиальной и корпоративной, а не кричащей или шаблонно-яркой',
        '- не использовать markdown-символы: #, ##, ###, -, *, **, ```',
        '- не писать служебные маркеры вроде "Слайд 1", если это не нужно визуально',
        '- не выходить за пределы предоставленного контекста',
        '- если данных недостаточно, явно указать это на финальном слайде',
    ].join('\n');

    if (!context) {
        return `${taskBlock}\n\nЕсли контекста недостаточно, не выдумывай факты.`;
    }

    return [
        'Контекст из документов Drive:',
        '',
        context,
        '',
        taskBlock,
        '',
        'Подготовь содержательную презентацию только по этому контексту.',
        renderMode === 'pdf_slides'
            ? 'Сделай результат максимально цельным и дизайнерски собранным в 3 страницах без переполнения.'
            : 'Сделай результат структурным, понятным и пригодным для чернового согласования.',
    ].join('\n');
}

function formatTwoSlidesAssistantMessage(response, provider, kind) {
    const providerLabel =
        PRESENTATION_PROVIDER_OPTIONS.find((option) => option.id === provider)?.label || provider;
    const jobId = findDeepValue(response, ['jobid', 'job_id', 'id']);
    const status = findDeepValue(response, ['status', 'state']);
    const downloadUrl = findDeepValue(response, ['downloadurl', 'download_url', 'pdfurl', 'pptxurl', 'resulturl']);
    const previewUrl = findDeepValue(response, ['previewurl', 'preview_url', 'viewerurl', 'viewer_url']);
    const presentationId = findDeepValue(response, ['presentationid', 'presentation_id']);

    const lines = [
        '## Генерация 2slides запущена',
        '',
        `- Провайдер: ${providerLabel}`,
        `- Режим: ${kind}`,
    ];

    if (status) lines.push(`- Статус: ${status}`);
    if (jobId) lines.push(`- Job ID: ${jobId}`);
    if (presentationId) lines.push(`- Presentation ID: ${presentationId}`);
    if (downloadUrl) lines.push(`- Скачать результат: ${downloadUrl}`);
    if (previewUrl) lines.push(`- Открыть предпросмотр: ${previewUrl}`);

    lines.push('');
    lines.push('Сервис ответил успешно. Если файл ещё не готов, подожди немного и повтори запрос или проверь статус job в ответе.');

    if (!jobId && !downloadUrl && !previewUrl) {
        lines.push('');
        lines.push('```json');
        lines.push(truncateForMarkdown(response));
        lines.push('```');
    }

    return lines.join('\n');
}

function getTwoSlidesJobInfo(response) {
    return {
        jobId: findDeepValue(response, ['jobid', 'job_id', 'id']),
        status: findDeepValue(response, ['status', 'state']),
        downloadUrl: findDeepValue(response, ['downloadurl', 'download_url', 'pdfurl', 'pptxurl', 'resulturl']),
        previewUrl: findDeepValue(response, ['previewurl', 'preview_url', 'viewerurl', 'viewer_url']),
        presentationId: findDeepValue(response, ['presentationid', 'presentation_id']),
    };
}

function isTwoSlidesJobFinished(status) {
    if (!status) return false;
    const normalized = String(status).trim().toLowerCase();
    return ['completed', 'complete', 'done', 'finished', 'success', 'succeeded', 'ready'].includes(normalized);
}

function isTwoSlidesJobFailed(status) {
    if (!status) return false;
    const normalized = String(status).trim().toLowerCase();
    return ['failed', 'error', 'cancelled', 'canceled'].includes(normalized);
}

function sleep(ms) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

async function pollTwoSlidesJobUntilSettled(provider, initialResponse, options = {}) {
    const {
        maxAttempts = 20,
        intervalMs = 4000,
        signal,
    } = options;
    const initialInfo = getTwoSlidesJobInfo(initialResponse);
    if (!initialInfo.jobId) {
        return { finalResponse: initialResponse, finalInfo: initialInfo, polled: false };
    }
    if (initialInfo.downloadUrl || isTwoSlidesJobFinished(initialInfo.status) || isTwoSlidesJobFailed(initialInfo.status)) {
        return { finalResponse: initialResponse, finalInfo: initialInfo, polled: false };
    }

    let latestResponse = initialResponse;
    let latestInfo = initialInfo;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (signal?.aborted) throw new Error('Запрос остановлен');
        await sleep(intervalMs);
        if (signal?.aborted) throw new Error('Запрос остановлен');
        const jobResponse = await getSlidesJobWithProvider(provider, initialInfo.jobId);
        latestResponse = jobResponse;
        latestInfo = getTwoSlidesJobInfo(jobResponse);

        if (latestInfo.downloadUrl || isTwoSlidesJobFinished(latestInfo.status) || isTwoSlidesJobFailed(latestInfo.status)) {
            return { finalResponse: latestResponse, finalInfo: latestInfo, polled: true };
        }
    }

    return { finalResponse: latestResponse, finalInfo: latestInfo, polled: true, timedOut: true };
}

/** Пастельные подложки для карточек «Студии» (светлая тема, стиль NotebookLM). */
const STUDIO_CARD_THEMES = [
    'bg-gradient-to-br from-amber-50 to-orange-50/90 border-amber-100/90',
    'bg-gradient-to-br from-violet-50 to-fuchsia-50/90 border-violet-100/90',
    'bg-gradient-to-br from-sky-50 to-cyan-50/90 border-sky-100/90',
    'bg-gradient-to-br from-emerald-50 to-teal-50/90 border-emerald-100/90',
    'bg-gradient-to-br from-rose-50 to-pink-50/90 border-rose-100/90',
    'bg-gradient-to-br from-indigo-50 to-blue-50/90 border-indigo-100/90',
    'bg-gradient-to-br from-cyan-50 to-sky-50/90 border-cyan-100/90',
];

function sourcesCountLabel(n) {
    const x = Math.abs(n) % 100;
    const x1 = x % 10;
    if (x > 10 && x < 20) return 'источников';
    if (x1 === 1) return 'источник';
    if (x1 >= 2 && x1 <= 4) return 'источника';
    return 'источников';
}

/** Row menu for a notebook source. */
function SourceRowMenu({ file, onRemove }) {
    const anchorRef = useRef(null);
    const [open, setOpen] = useState(false);
    const close = useCallback(() => setOpen(false), []);
    return (
        <>
            <button
                ref={anchorRef}
                type="button"
                aria-label={`Действия: ${file.name}`}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
                className={clsx(ICON_BUTTON, 'h-8 w-8', open && 'bg-white text-[#17202E]')}
            >
                <MoreHorizontal className="h-5 w-5" strokeWidth={1.75} />
            </button>
            <FloatingMenu anchorRef={anchorRef} open={open} onClose={close}>
                <MenuItem icon={Trash2} label="Убрать из блокнота" danger onClick={() => { close(); onRemove(file); }} />
            </FloatingMenu>
        </>
    );
}

/** Встраиваемый блок чата Deep Research Assistant. embedded=true — режим страницы (без overlay, без кнопки закрыть, загрузка док. при смене files). */
const NotebookLlmContent = ({
    files = [],
    embedded = false,
    onClose = null,
    isOpen = true,
    activeChatId = null,
    chats = [],
    onCreateChat = null,
    onSelectChat = () => {},
    creatingChat = false,
    chatSearchQuery = '',
    onChatSearchChange = () => {},
    onImportNotebookFile = null,
    notebookImportBusy = false,
    onBack = null,
}) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const requestControllerRef = useRef(null);
    const requestTokenRef = useRef(0);
    const [jobProgress, setJobProgress] = useState(null);
    const [studioPresets, setStudioPresets] = useState(null);
    const [studioPresetId, setStudioPresetId] = useState(null);
    useEffect(() => () => { requestTokenRef.current += 1; requestControllerRef.current?.abort(); }, [activeChatId]);
    useEffect(() => {
        let cancelled = false;
        getNotebookStudioPresets(notebookLang())
            .then((presets) => { if (!cancelled) setStudioPresets(presets); })
            .catch(() => { if (!cancelled) setStudioPresets(null); });
        return () => { cancelled = true; };
    }, []);
    const persistSelection = useCallback((id, ids) => persistNotebookSelection(window.localStorage, id, ids), []);
    const [currentFileIndex, setCurrentFileIndex] = useState(0);
    const [docDropdownOpen, setDocDropdownOpen] = useState(false);
    const [docSearch, setDocSearch] = useState('');
    const [currentFolderId, setCurrentFolderId] = useState('root');
    const [path, setPath] = useState([{ id: 'root', name: 'Диск' }]);
    const [folderFiles, setFolderFiles] = useState([]);
    const [loadingFolder, setLoadingFolder] = useState(false);
    const [additionalFiles, setAdditionalFiles] = useState([]);
    // По умолчанию документы НЕ выбраны — embeddings считаем только после явного выбора
    const [activeFileIds, setActiveFileIds] = useState(() => new Set());
    const [chatId, setChatId] = useState(null);
    const [generationFormat, setGenerationFormatState] = useState(() => readStoredGenerationFormat()); // 'cards' | 'test' | ...
    const [presentationProvider, setPresentationProviderState] = useState(() => readStoredPresentationProvider());
    const [presentationRenderMode, setPresentationRenderModeState] = useState(() => readStoredPresentationRenderMode());
    const [fastPptThemeId, setFastPptThemeIdState] = useState(() => readStoredFastPptThemeId());
    const setGenerationFormat = useCallback((value) => {
        setGenerationFormatState(value);
        setStudioPresetId(null);
        if (typeof window !== 'undefined') {
            if (value == null) {
                window.localStorage.removeItem('notebook_generation_format');
            } else {
                window.localStorage.setItem('notebook_generation_format', value);
            }
        }
    }, []);
    const setPresentationProvider = useCallback((value) => {
        const next =
            PRESENTATION_PROVIDER_OPTIONS.find((option) => option.id === value)?.id || SLIDE_PROVIDER_TWOSLIDES;
        setPresentationProviderState(next);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem('notebook_presentation_provider', next);
        }
    }, []);
    const setPresentationRenderMode = useCallback((value) => {
        const next =
            PRESENTATION_RENDER_MODE_OPTIONS.find((option) => option.id === value)?.id || 'fast_ppt';
        setPresentationRenderModeState(next);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem('notebook_presentation_render_mode', next);
        }
    }, []);
    const setFastPptThemeId = useCallback((value) => {
        const next = value?.trim() || DEFAULT_FAST_PPT_THEME_ID;
        setFastPptThemeIdState(next);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem('notebook_fast_ppt_theme_id', next);
        }
    }, []);
    const [chatModelMode, setChatModelMode] = useState(() => {
        if (typeof window === 'undefined') return 'thinking';
        const s = window.localStorage.getItem('notebook_chat_model_mode');
        return s === 'fast' ? 'fast' : 'thinking';
    });
    const { addToast } = useToast();
    const messagesScrollRef = useRef(null);
    const notebookImportInputRef = useRef(null);
    const copyFeedbackTimeoutRef = useRef(null);
    const [copiedIndex, setCopiedIndex] = useState(null);
    const navigate = useNavigate();
    // On narrow screens side panels open as overlays, so start with them closed.
    const [sourcesOpen, setSourcesOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1240);

    const folderCacheRef = useRef({});
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [folderSelectionBusyIds, setFolderSelectionBusyIds] = useState(() => new Set());

    const setFolderSelectionBusy = useCallback((folderId, isBusy) => {
        setFolderSelectionBusyIds((prev) => {
            const next = new Set(prev);
            if (isBusy) {
                next.add(folderId);
            } else {
                next.delete(folderId);
            }
            return next;
        });
    }, []);

    const refreshFolder = useCallback(() => {
        if (folderCacheRef.current) {
            delete folderCacheRef.current[currentFolderId];
        }
        setRefreshTrigger(prev => prev + 1);
    }, [currentFolderId]);
    const [openResultIdx, setOpenResultIdx] = useState(null);
    const [studioOpen, setStudioOpen] = useState(true);
    const [sourceSearch, setSourceSearch] = useState('');
    const [drivePickerOpen, setDrivePickerOpen] = useState(false);
    const [savingMessageIndex, setSavingMessageIndex] = useState(null);
    const addSourceAnchorRef = useRef(null);
    const [addSourceMenuOpen, setAddSourceMenuOpen] = useState(false);
    const composerSourcesAnchorRef = useRef(null);
    const [composerSourcesOpen, setComposerSourcesOpen] = useState(false);
    const headerMenuAnchorRef = useRef(null);
    const [headerMenuOpen, setHeaderMenuOpen] = useState(false);

    const chatSearchLower = (chatSearchQuery || '').trim().toLowerCase();
    const visibleChats = useMemo(() => {
        if (!chatSearchLower) return chats;
        return chats.filter((c) => (c.title || c.name || '').toLowerCase().includes(chatSearchLower));
    }, [chats, chatSearchLower]);

    // Загрузка файлов и папок текущего каталога
    useEffect(() => {
        let isMounted = true;
        const fetchFolderContents = async () => {
            const cached = folderCacheRef.current[currentFolderId];
            if (cached) {
                setFolderFiles(cached);
                return;
            }

            setLoadingFolder(true);
            try {
                let items = [];
                if (currentFolderId === 'root') {
                    const [own, shared] = await Promise.all([
                        listOwnItems().catch(e => { console.error(e); return []; }),
                        listSharedItems().catch(e => { console.error(e); return []; })
                    ]);
                    const mergedMap = new Map();
                    own.forEach(item => {
                        if (item && item.id) mergedMap.set(item.id, item);
                    });
                    shared.forEach(item => {
                        if (item && item.id && !mergedMap.has(item.id)) {
                            mergedMap.set(item.id, item);
                        }
                    });
                    items = Array.from(mergedMap.values());
                } else {
                    items = await listFiles(currentFolderId);
                }

                if (isMounted) {
                    const validItems = items.filter(isSupportedFile);
                    setFolderFiles(validItems);
                    folderCacheRef.current[currentFolderId] = validItems;
                }
            } catch (err) {
                console.error('Failed to load folder items', err);
                if (isMounted) {
                    addToast('Не удалось загрузить содержимое папки', 'error');
                }
            } finally {
                if (isMounted) {
                    setLoadingFolder(false);
                }
            }
        };

        fetchFolderContents();
        return () => {
            isMounted = false;
        };
    }, [currentFolderId, refreshTrigger, addToast]);

    const handleFolderClick = useCallback((folder) => {
        setCurrentFolderId(folder.id);
        setPath(prev => [...prev, { id: folder.id, name: folder.name }]);
    }, []);

    const handleGoBack = useCallback(() => {
        if (path.length <= 1) return;
        const newPath = path.slice(0, -1);
        setPath(newPath);
        setCurrentFolderId(newPath[newPath.length - 1].id);
    }, [path]);

    const handlePathClick = useCallback((index) => {
        if (index === path.length - 1) return;
        const newPath = path.slice(0, index + 1);
        setPath(newPath);
        setCurrentFolderId(newPath[newPath.length - 1].id);
    }, [path]);

    const loadFolderFilesRecursively = useCallback(async (folderId, visited = new Set()) => {
        if (!folderId || visited.has(folderId)) {
            return [];
        }

        visited.add(folderId);
        let items = folderCacheRef.current[folderId];

        if (!items) {
            items = folderId === 'root'
                ? (() => Promise.all([
                    listOwnItems().catch((e) => {
                        console.error(e);
                        return [];
                    }),
                    listSharedItems().catch((e) => {
                        console.error(e);
                        return [];
                    }),
                ]).then(([own, shared]) => {
                    const mergedMap = new Map();
                    own.forEach((item) => {
                        if (item?.id) mergedMap.set(item.id, item);
                    });
                    shared.forEach((item) => {
                        if (item?.id && !mergedMap.has(item.id)) {
                            mergedMap.set(item.id, item);
                        }
                    });
                    return Array.from(mergedMap.values());
                }))()
                : await listFiles(folderId);

            items = items.filter(isSupportedFile);
            folderCacheRef.current[folderId] = items;
        }

        const directFiles = items.filter((item) => item && item.type !== 'dir' && item.mime_type !== 'application/x-directory');
        const subfolders = items.filter((item) => item && (item.type === 'dir' || item.mime_type === 'application/x-directory'));

        if (!subfolders.length) {
            return directFiles;
        }

        const nestedGroups = await Promise.all(
            subfolders.map((folder) => loadFolderFilesRecursively(folder.id, visited))
        );

        return mergeUniqueFiles(directFiles, nestedGroups.flat());
    }, []);

    const getCachedFolderSelectionState = useCallback((folderId, visited = new Set()) => {
        if (!folderId || visited.has(folderId)) {
            return { total: 0, selected: 0 };
        }

        visited.add(folderId);
        const items = folderCacheRef.current[folderId];
        if (!items) {
            return { total: 0, selected: 0 };
        }

        let total = 0;
        let selected = 0;

        items.forEach((item) => {
            if (!item) return;
            const isDir = item.type === 'dir' || item.mime_type === 'application/x-directory';
            if (isDir) {
                const nested = getCachedFolderSelectionState(item.id, visited);
                total += nested.total;
                selected += nested.selected;
                return;
            }

            total += 1;
            if (activeFileIds.has(item.id)) {
                selected += 1;
            }
        });

        return { total, selected };
    }, [activeFileIds]);

    // Объединяем все файлы для правильной обработки контекста (поиск чанков, индексов и т.д.)
    const allFiles = useMemo(() => {
        const map = new Map();
        // 1. Файлы из props
        (files || []).forEach(f => {
            if (f && f.id) map.set(f.id, f);
        });
        // 2. Файлы из папки
        (folderFiles || []).forEach(f => {
            if (f && f.id && f.type !== 'dir') map.set(f.id, f);
        });
        // 3. Дополнительные файлы (например, при загрузке чата)
        (additionalFiles || []).forEach(f => {
            if (f && f.id) map.set(f.id, f);
        });
        return Array.from(map.values());
    }, [files, folderFiles, additionalFiles]);

    // Сортировка текущих элементов папки: сначала папки, затем файлы по алфавиту
    const sortedFolderItems = useMemo(() => {
        const items = [...folderFiles];
        return items.sort((a, b) => {
            const aIsDir = a.type === 'dir' || a.mime_type === 'application/x-directory';
            const bIsDir = b.type === 'dir' || b.mime_type === 'application/x-directory';
            if (aIsDir && !bIsDir) return -1;
            if (!aIsDir && bIsDir) return 1;
            return (a.name || '').localeCompare(b.name || '');
        });
    }, [folderFiles]);

    // Фильтрация элементов в текущей папке по поисковому запросу (глобальный поиск по всем файлам, если введен запрос)
    const filteredFolderItems = useMemo(() => {
        if (!docSearch.trim()) return sortedFolderItems;
        const q = docSearch.toLowerCase();
        return allFiles.filter(item => (item.name || '').toLowerCase().includes(q));
    }, [sortedFolderItems, allFiles, docSearch]);

    // Файлы из текущей папки, которые можно выбрать (исключая директории)
    const currentFolderFilesOnly = useMemo(() => {
        return folderFiles.filter(f => f.type !== 'dir' && f.mime_type !== 'application/x-directory');
    }, [folderFiles]);

    // Выбранные файлы из других папок (не входящие в текущую папку)
    const otherSelectedFiles = useMemo(() => {
        const currentFolderFileIds = new Set(currentFolderFilesOnly.map(f => f.id));
        return allFiles.filter(f => activeFileIds.has(f.id) && !currentFolderFileIds.has(f.id));
    }, [allFiles, activeFileIds, currentFolderFilesOnly]);

    // Выбраны ли все файлы в текущей папке
    const visibleFilesAllSelected = useMemo(() => {
        const visibleFiles = filteredFolderItems.filter(f => f.type !== 'dir' && f.mime_type !== 'application/x-directory');
        return visibleFiles.length > 0 && visibleFiles.every(f => activeFileIds.has(f.id));
    }, [filteredFolderItems, activeFileIds]);

    const copyAssistantText = useCallback(
        async (text, idx) => {
            const plain = typeof text === 'string' ? text : String(text ?? '');
            try {
                await navigator.clipboard.writeText(plain);
                if (copyFeedbackTimeoutRef.current) {
                    clearTimeout(copyFeedbackTimeoutRef.current);
                }
                setCopiedIndex(idx);
                addToast('Ответ скопирован', 'success');
                copyFeedbackTimeoutRef.current = window.setTimeout(() => {
                    setCopiedIndex(null);
                    copyFeedbackTimeoutRef.current = null;
                }, 2000);
            } catch {
                addToast('Не удалось скопировать', 'error');
            }
        },
        [addToast]
    );

    // Прокрутка к последнему сообщению после ответа ИИ (и после длинных таблиц в DOM)
    useEffect(() => {
        if (messages.length === 0) return;
        const el = messagesScrollRef.current;
        if (!el) return;
        const scrollToBottom = () => {
            el.scrollTop = el.scrollHeight;
        };
        requestAnimationFrame(() => {
            requestAnimationFrame(scrollToBottom);
        });
        const t = setTimeout(scrollToBottom, 100);
        const t2 = setTimeout(scrollToBottom, 400);
        return () => {
            clearTimeout(t);
            clearTimeout(t2);
        };
    }, [messages, sending]);

    const currentFile = allFiles?.length ? allFiles[currentFileIndex] : null;
    const activeSelectedFiles = useMemo(
        () => allFiles.filter((file) => activeFileIds.has(file.id) && file.type !== 'dir' && file.mime_type !== 'application/x-directory'),
        [allFiles, activeFileIds],
    );
    const fileModifiedLabel = currentFile
        ? (() => {
            const d = currentFile.last_modified || currentFile.updated_at || currentFile.created_at;
            if (!d) return '';
            try {
                return formatDistanceToNow(new Date(d), { addSuffix: true, locale: ru });
            } catch {
                return '';
            }
        })()
        : '';

    // Сброс / синхронизация выбора при смене списка файлов
    useEffect(() => {
        if (!allFiles || allFiles.length === 0) {
            if (activeFileIds.size > 0) {
                setActiveFileIds(new Set());
            }
            setCurrentFileIndex(0);
            return;
        }
        setActiveFileIds((prev) => {
            const ids = new Set(allFiles.map((f) => f.id));
            let changed = false;
            const next = new Set();
            prev.forEach((id) => {
                if (ids.has(id)) {
                    next.add(id);
                } else {
                    changed = true;
                }
            });
            if (next.size !== prev.size) {
                changed = true;
            }
            return changed ? next : prev;
        });
        setCurrentFileIndex((prev) => {
            if (prev >= allFiles.length) return 0;
            return prev;
        });
    }, [allFiles, activeFileIds.size]);

    const loadDocuments = useCallback(
        async (driveFiles) => {
            // No-op: documents are queried directly from Elastic Search on backend
        },
        []
    );

    // Загрузка сообщений и документов выбранного чата при смене activeChatId
    useEffect(() => {
        if (!activeChatId) return;

        setSending(false);
        const loadChatData = async () => {
            try {
                setChatId(activeChatId);
                if (typeof window !== 'undefined') {
                    window.localStorage.setItem('notebook_chat_id', activeChatId);
                }

                const [messagesData, documentsData] = await Promise.all([
                    getNotebookChatMessages(activeChatId),
                    getChatDocuments(activeChatId).catch((e) => {
                        console.warn('getChatDocuments failed', e);
                        return null;
                    }),
                ]);

                setMessages(normalizeNotebookHistory(messagesData));
                const pendingJob = readActiveJob(window.localStorage, activeChatId);
                if (pendingJob) resumeNotebookJob(activeChatId, pendingJob);

                if (documentsData != null) {
                    let docList = [];
                    if (Array.isArray(documentsData)) docList = documentsData;
                    else if (documentsData?.data && Array.isArray(documentsData.data)) docList = documentsData.data;
                    else if (documentsData?.documents && Array.isArray(documentsData.documents)) docList = documentsData.documents;
                    
                    const normalizedDocs = docList.map(d => {
                        if (typeof d === 'string') {
                            return { id: d, name: 'Документ ' + d };
                        }
                        const actualItem = d.file || d.folder || d;
                        return {
                            ...actualItem,
                            id: actualItem.id || d.id,
                            name: actualItem.name || actualItem.real_name || 'Без названия',
                            type: actualItem.type || 'file'
                        };
                    });
                    setAdditionalFiles(normalizedDocs);

                    const docIds = new Set(normalizedDocs.map((d) => d.id));
                    setActiveFileIds(readNotebookSelection(window.localStorage, activeChatId, docIds));

                    // Сразу находим правильный индекс с учетом подгруженных документов
                    const tempAllFilesMap = new Map();
                    (files || []).forEach(f => { if (f && f.id) tempAllFilesMap.set(f.id, f); });
                    (folderFiles || []).forEach(f => { if (f && f.id && f.type !== 'dir') tempAllFilesMap.set(f.id, f); });
                    normalizedDocs.forEach(f => { if (f && f.id) tempAllFilesMap.set(f.id, f); });
                    const tempAllFiles = Array.from(tempAllFilesMap.values());

                    if (docIds.size > 0 && tempAllFiles.length > 0) {
                        const firstInContextIdx = tempAllFiles.findIndex((f) => docIds.has(f.id));
                        if (firstInContextIdx >= 0) setCurrentFileIndex(firstInContextIdx);
                    }
                }
            } catch (err) {
                console.error('Failed to load chat data', err);
            }
        };

        loadChatData();
    }, [activeChatId]);

    // Режим страницы: при смене выбранных документов слева или набора активных файлов — перезагружаем контекст
    useEffect(() => {
        // No-op: documents are queried directly from Elastic Search on backend
    }, []);

    // Режим модалки: при открытии — сброс
    useEffect(() => {
        if (!embedded && isOpen) {
            setMessages([]);
            setInput('');
            setCurrentFileIndex(0);
            setDocDropdownOpen(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [embedded, isOpen]);

    const handleNewChat = () => {
        setMessages([]);
        setInput('');
        setGenerationFormat(null);
    };

    const requireActiveChat = useCallback(() => {
        const effectiveChatId = chatId || activeChatId;
        if (effectiveChatId) {
            return effectiveChatId;
        }

        addToast('Сначала создайте блокнот, затем добавляйте документы в контекст.', 'warning');
        onCreateChat?.();
        return null;
    }, [chatId, activeChatId, addToast, onCreateChat]);

    const handleSend = async () => {
        if (!input.trim() || sending) return;
        const effectiveChatId = requireActiveChat();
        if (!effectiveChatId) return;
        if (generationFormat === 'compare' && activeFileIds.size < 2) {
            addToast('Для сравнения выберите минимум 2 источника.', 'warning');
            return;
        }
        const question = stripNul(input.trim());
        const preset = studioPresetId || (studioPresets?.some((item) => item.id === generationFormat) ? generationFormat : null);
        const presetMeta = preset ? studioPresets?.find((item) => item.id === preset) : null;
        if (presetMeta?.min_sources > activeFileIds.size) {
            addToast(notebookJobText('errors.minSources', { count: presetMeta.min_sources }), 'warning');
            return;
        }
        const controller = new AbortController();
        requestControllerRef.current = controller;
        const requestToken = ++requestTokenRef.current;
        setMessages((prev) => [...prev, { role: 'user', content: question, createdAt: new Date().toISOString() }]);
        setInput('');
        setSending(true);
        // preset is used by the current backend; format keeps older backends working.
        const payload = {
            question,
            file_ids: [...activeFileIds],
            mode: chatModelMode,
            format: generationFormat || 'text',
            lang: notebookLang(),
            persist: true,
            ...(preset ? { preset } : {}),
        };
        let content = '';
        let formatUsed = generationFormat || 'text';
        let requestFailed = false;
        let response = null;
        let activeJob = null;
        setJobProgress(null);
        try {
            // External slide providers remain opt-in. A failed provider can fall
            // back to the built-in slide generator using the same sources.
            if (generationFormat === 'presentation' && presentationProvider !== PRESENTATION_PROVIDER_MARKDOWN) {
                try {
                    const { sources } = await getNotebookResearchContext(effectiveChatId, payload, controller.signal);
                    if (!(sources || []).some((source) => source.status === 'ready' && source.excerpts?.length)) throw new Error('Нет читаемых источников');
                    const context = (sources || []).map((source) => `Документ: ${source.file_name}\n${source.excerpts.map((x) => x.text).join('\n\n')}`).join('\n\n');
                    const requestPayload = presentationRenderMode === 'fast_ppt'
                        ? { kind: 'fast_ppt', themeId: fastPptThemeId || DEFAULT_FAST_PPT_THEME_ID, responseLanguage: 'ru', mode: 'async', userInput: buildTwoSlidesUserInput(question, context, presentationRenderMode) }
                        : { kind: 'pdf_slides', designStyle: 'executive', responseLanguage: 'ru', mode: 'async', page: 3, contentDetail: 'standard', userInput: buildTwoSlidesUserInput(question, context, presentationRenderMode) };
                    const providerResponse = await generateSlidesWithProvider(presentationProvider, requestPayload);
                    const pollResult = await pollTwoSlidesJobUntilSettled(presentationProvider, providerResponse, { signal: controller.signal });
                    const hasResult = pollResult.finalInfo?.downloadUrl || pollResult.finalInfo?.previewUrl;
                    if (isTwoSlidesJobFailed(pollResult.finalInfo?.status) || (isTwoSlidesJobFinished(pollResult.finalInfo?.status) && !hasResult) || (!pollResult.finalInfo?.jobId && !hasResult)) throw new Error('Не удалось создать презентацию');
                    content = formatTwoSlidesAssistantMessage(pollResult.finalResponse, presentationProvider, requestPayload.kind);
                    if (pollResult.timedOut) content += '\n\nПрезентация ещё создаётся. Ссылка на задание сохранена в этом ответе.';
                    formatUsed = 'report';
                } catch (error) {
                    if (controller.signal.aborted) throw error;
                    addToast('Сервис презентаций недоступен. Создаём слайды встроенным ИИ.', 'warning');
                }
            }
            if (!content) {
                response = await runNotebookResearch({
                    api: notebookJobsApi,
                    chatId: effectiveChatId,
                    payload,
                    signal: controller.signal,
                    onProgress: (job) => { if (requestToken === requestTokenRef.current) setJobProgress(job.progress); },
                    storage: window.localStorage,
                });
                content = response.content?.trim();
                formatUsed = response.format || 'text';
                if (!content) throw new Error('Модель вернула пустой ответ. Повторите запрос.');
                if (response.fallback) addToast('Ответ подготовлен резервной моделью.', 'info');
                const incomplete = (response.sources || []).filter((source) => source.status !== 'ready' || !source.complete);
                if (incomplete.length) {
                    addToast(incomplete.map((source) => `${source.file_name}: ${source.message}`).join('\n'), 'warning');
                }
            }
            if (controller.signal.aborted) throw new Error('Запрос остановлен');
        } catch (error) {
            requestFailed = true;
            response = null;
            activeJob = error?.activeJob?.sameChat ? error.activeJob : null;
            content = controller.signal.aborted ? 'Запрос остановлен.' : describeResearchRequestError(error);
            formatUsed = 'text';
            if (!controller.signal.aborted && requestToken === requestTokenRef.current) addToast(content, 'error');
        } finally {
            if (requestToken === requestTokenRef.current) { requestControllerRef.current = null; setSending(false); setJobProgress(null); }
        }
        if (requestToken !== requestTokenRef.current) return;
        setMessages((prev) => [...prev, {
            role: 'assistant',
            content,
            format: formatUsed,
            createdAt: new Date().toISOString(),
            failed: requestFailed,
            status: response?.status,
            suggestions: response?.suggestions,
            stats: response?.stats,
        }]);
        if (activeJob) {
            resumeNotebookJob(effectiveChatId, { job_id: activeJob.job_id });
            return;
        }
        // Failures are shown but not saved; the server saves answers itself
        // when it reports persisted (backends without persist need /sync).
        if (requestFailed || response?.persisted || NOTEBOOK_REFUSAL_STATUSES.has(response?.status)) return;
        try {
            await syncNotebookChat(effectiveChatId, { userMessage: question, assistantMessage: content, assistantType: formatUsed });
        } catch {
            addToast('Ответ получен, но история не сохранена. Скопируйте ответ и повторите сохранение позже.', 'warning');
        }
    };

    // resumeNotebookJob shows a background job started earlier (page reload,
    // another tab, or a 409 for the user's unfinished job) until it ends.
    const resumeNotebookJob = async (effectiveChatId, stored) => {
        const controller = new AbortController();
        requestControllerRef.current = controller;
        const requestToken = ++requestTokenRef.current;
        setSending(true);
        setJobProgress(null);
        if (stored.question) {
            setMessages((prev) => (prev[prev.length - 1]?.role === 'user' && prev[prev.length - 1]?.content === stored.question
                ? prev
                : [...prev, { role: 'user', content: stored.question, createdAt: new Date().toISOString() }]));
        }
        let response = null;
        let content = '';
        let failed = false;
        try {
            const job = await getNotebookAskJob(effectiveChatId, stored.job_id, controller.signal);
            response = await waitForNotebookJob({
                api: notebookJobsApi,
                chatId: effectiveChatId,
                job,
                signal: controller.signal,
                onProgress: (current) => { if (requestToken === requestTokenRef.current) setJobProgress(current.progress); },
                storage: window.localStorage,
            });
            content = response?.content?.trim() || '';
        } catch (error) {
            failed = true;
            if (error?.response?.status === 404) {
                // The job no longer exists (finished long ago or notebook removed).
                clearActiveJob(window.localStorage, effectiveChatId);
            } else {
                content = controller.signal.aborted ? 'Запрос остановлен.' : describeResearchRequestError(error);
            }
        } finally {
            if (requestToken === requestTokenRef.current) { requestControllerRef.current = null; setSending(false); setJobProgress(null); }
        }
        if (requestToken !== requestTokenRef.current) return;
        if (response?.persisted) {
            try {
                const history = normalizeNotebookHistory(await getNotebookChatMessages(effectiveChatId));
                const last = history[history.length - 1];
                if (last?.role === 'assistant') {
                    history[history.length - 1] = { ...last, status: response.status, suggestions: response.suggestions, stats: response.stats };
                }
                if (requestToken === requestTokenRef.current) setMessages(history);
                return;
            } catch {
                // fall through and show the answer locally
            }
        }
        if (!content) return;
        setMessages((prev) => [...prev, {
            role: 'assistant',
            content,
            format: failed ? 'text' : (response?.format || 'text'),
            createdAt: new Date().toISOString(),
            failed,
            status: response?.status,
            suggestions: response?.suggestions,
            stats: response?.stats,
        }]);
    };

    const toggleFileSelection = useCallback(async (file) => {
        const id = requireActiveChat();
        if (!id) return;
        const wasSelected = activeFileIds.has(file.id);
        const attached = additionalFiles.some((item) => item.id === file.id);
        try {
            if (!attached) {
                await addChatDocument(id, file.id);
                setAdditionalFiles((prev) => mergeUniqueFiles(prev, [file]));
            }
            setActiveFileIds((previous) => {
                const next = new Set(previous);
                if (wasSelected) next.delete(file.id); else next.add(file.id);
                persistSelection(id, next);
                return next;
            });
            setCurrentFileIndex(Math.max(0, allFiles.findIndex((item) => item.id === file.id)));
        } catch {
            addToast('Не удалось добавить источник. Повторите попытку.', 'error');
        }
    }, [activeFileIds, additionalFiles, allFiles, requireActiveChat, addToast, persistSelection]);

    const toggleFolderSelection = useCallback(async (folder) => {
        const effectiveChatId = requireActiveChat();
        if (!effectiveChatId) return;

        setFolderSelectionBusy(folder.id, true);
        const previousActiveIds = new Set(activeFileIds);
        const previousAdditionalFiles = additionalFiles;

        try {
            const folderFilesRecursive = await loadFolderFilesRecursively(folder.id);
            if (!folderFilesRecursive.length) {
                addToast('В выбранной папке нет поддерживаемых файлов', 'info');
                return;
            }

            const everySelected = folderFilesRecursive.every((file) => previousActiveIds.has(file.id));
            const nextActiveIds = new Set(previousActiveIds);

            if (everySelected) {
                folderFilesRecursive.forEach((file) => nextActiveIds.delete(file.id));
            } else {
                folderFilesRecursive.forEach((file) => nextActiveIds.add(file.id));
            }

            setActiveFileIds(nextActiveIds);
            setAdditionalFiles((prev) => mergeUniqueFiles(prev, folderFilesRecursive));
            await saveChatDocuments(effectiveChatId, mergeUniqueFiles(previousAdditionalFiles, folderFilesRecursive).map((file) => file.id));
            persistSelection(effectiveChatId, nextActiveIds);

            addToast(
                everySelected
                    ? `Файлы из папки "${folder.name}" убраны из источников`
                    : `Файлы из папки "${folder.name}" добавлены в источники`,
                'success',
            );
        } catch (err) {
            console.error('Failed to toggle folder selection', err);
            setActiveFileIds(previousActiveIds);
            setAdditionalFiles(previousAdditionalFiles);
            addToast('Не удалось обновить источники для выбранной папки', 'error');
        } finally {
            setFolderSelectionBusy(folder.id, false);
        }
    }, [
        activeFileIds,
        additionalFiles,
        addToast,
        loadFolderFilesRecursively,
        requireActiveChat,
        setFolderSelectionBusy,
        persistSelection,
    ]);

    const handleClearAllActive = useCallback(() => {
        const id = requireActiveChat();
        if (!id) return;
        setActiveFileIds(new Set());
        persistSelection(id, new Set());
    }, [requireActiveChat, persistSelection]);

    const handleSelectAllVisible = useCallback(async () => {
        const id = requireActiveChat();
        if (!id) return;
        const visible = filteredFolderItems.filter((f) => f.type !== 'dir' && f.mime_type !== 'application/x-directory');
        if (!visible.length) return;
        const allOn = visible.every((file) => activeFileIds.has(file.id));
        const next = new Set(activeFileIds);
        visible.forEach((file) => { if (allOn) next.delete(file.id); else next.add(file.id); });
        try {
            await saveChatDocuments(id, mergeUniqueFiles(additionalFiles, visible).map((file) => file.id));
            setAdditionalFiles((prev) => mergeUniqueFiles(prev, visible));
            setActiveFileIds(next);
            persistSelection(id, next);
        } catch { addToast('Не удалось добавить источники.', 'error'); }
    }, [filteredFolderItems, activeFileIds, additionalFiles, requireActiveChat, persistSelection, addToast]);

    const recentChatForStudio = visibleChats[0] || chats[0];
    const recentChatLabel = recentChatForStudio
        ? (() => {
              const d = recentChatForStudio.updated_at || recentChatForStudio.created_at;
              if (!d) return '';
              try {
                  return formatDistanceToNow(new Date(d), { addSuffix: true, locale: ru });
              } catch {
                  return '';
              }
          })()
        : '';

    const persistChatModelMode = (mode) => {
        const v = mode === 'fast' ? 'fast' : 'thinking';
        setChatModelMode(v);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem('notebook_chat_model_mode', v);
        }
    };

    const activeChat = chats.find((chat) => getChatId(chat) === (chatId || activeChatId)) || null;
    const chatTitle = activeChat?.title || 'Блокнот';
    const notebookThemes = useMemo(() => assignNotebookThemes(chats), [chats]);

    const sourceFiles = useMemo(() => {
        const map = new Map();
        additionalFiles.forEach((file) => {
            if (file?.id && file.type !== 'dir' && file.mime_type !== 'application/x-directory') map.set(file.id, file);
        });
        allFiles.forEach((file) => {
            if (file?.id && activeFileIds.has(file.id) && !map.has(file.id)) map.set(file.id, file);
        });
        return Array.from(map.values());
    }, [additionalFiles, allFiles, activeFileIds]);

    const visibleSourceFiles = useMemo(() => {
        const query = sourceSearch.trim().toLowerCase();
        return query ? sourceFiles.filter((file) => (file.name || '').toLowerCase().includes(query)) : sourceFiles;
    }, [sourceFiles, sourceSearch]);

    const activeSourceCount = sourceFiles.filter((file) => activeFileIds.has(file.id)).length;
    const allSourcesActive = sourceFiles.length > 0 && activeSourceCount === sourceFiles.length;

    const setAllSourcesActive = useCallback((makeActive) => {
        const id = requireActiveChat();
        if (!id) return;
        const next = makeActive ? new Set(sourceFiles.map((file) => file.id)) : new Set();
        setActiveFileIds(next);
        persistSelection(id, next);
    }, [sourceFiles, requireActiveChat, persistSelection]);

    const removeSource = useCallback(async (file) => {
        const id = requireActiveChat();
        if (!id) return;
        try {
            // A deselected source is still attached and must also be unlinked.
            await removeChatDocument(id, file.id);
            setAdditionalFiles((prev) => prev.filter((item) => item.id !== file.id));
            setActiveFileIds((previous) => {
                const next = new Set(previous);
                next.delete(file.id);
                persistSelection(id, next);
                return next;
            });
        } catch { addToast('Не удалось убрать источник. Повторите попытку.', 'error'); }
    }, [activeFileIds, requireActiveChat, persistSelection, addToast]);

    const handleDeviceFile = useCallback(async (file) => {
        if (!file || !onImportNotebookFile) return;
        if (file.size === 0) { addToast('Файл пустой. Добавьте документ с текстом.', 'error'); return; }
        if (file.size > 50 * 1024 * 1024) { addToast('Для Deep Research допустимы файлы до 50 МБ. Разделите документ на части или уменьшите его размер.', 'error'); return; }
        if (/\.(docx|pptx|xlsx|xlsm)$/i.test(file.name)) {
            try {
                const { default: JSZip } = await import('jszip');
                const zip = await JSZip.loadAsync(file);
                const entry = /\.docx$/i.test(file.name) ? 'word/document.xml' : /\.pptx$/i.test(file.name) ? 'ppt/presentation.xml' : 'xl/workbook.xml';
                if (!zip.file('[Content_Types].xml') || !zip.file(entry)) throw new Error('Повреждённый документ');
            } catch { addToast('Файл повреждён или его содержимое не соответствует расширению.', 'error'); return; }
        }
        const uploaded = await onImportNotebookFile(file);
        refreshFolder();
        if (uploaded?.id && !activeFileIds.has(uploaded.id)) {
            await toggleFileSelection({ ...uploaded, name: uploaded.name || file.name, size: uploaded.size ?? file.size });
        }
    }, [onImportNotebookFile, refreshFolder, activeFileIds, toggleFileSelection]);

    const saveMessageToDrive = useCallback(async (msg, idx) => {
        const format = getAssistantMessageFormat(msg);
        const { title } = describeResult(msg.content || '', RESULT_FORMATS[format]?.label || 'Ответ');
        const safeTitle = String(title || 'Ответ').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'Ответ';
        try {
            setSavingMessageIndex(idx);
            const file = new File([msg.content || ''], `${safeTitle}.txt`, { type: 'text/plain' });
            await uploadFile(file, 'root');
            addToast(`Сохранено в Drive: «${safeTitle}.txt»`, 'success');
        } catch (err) {
            console.error('Failed to save answer to Drive', err);
            addToast('Не удалось сохранить в Drive. Повторите попытку', 'error');
        } finally {
            setSavingMessageIndex(null);
        }
    }, [addToast]);

    const results = useMemo(() => messages
        .map((msg, idx) => ({ msg, idx }))
        .filter(({ msg }) => msg.role === 'assistant' && !msg.failed && !NOTEBOOK_REFUSAL_STATUSES.has(msg.status) && RESULT_FORMATS[getAssistantMessageFormat(msg)])
        .map(({ msg, idx }) => {
            const format = getAssistantMessageFormat(msg);
            const meta = RESULT_FORMATS[format];
            const { title } = describeResult(msg.content || '', meta.label);
            return { idx, title, label: meta.label, kind: meta.kind, format, createdAt: msg.createdAt };
        })
        .reverse(), [messages]);

    const scrollToMessage = (idx) => {
        document.getElementById(`nb-msg-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const lastAssistantIndex = messages.reduce((last, msg, idx) => (msg.role === 'assistant' ? idx : last), -1);
    const activeFormat = GENERATION_FORMATS.find((format) => format.id === generationFormat) || null;
    const activePreset = studioPresetId ? studioPresets?.find((item) => item.id === studioPresetId) || null : null;

    const STUDIO_TILES = [
        { id: 'report', label: 'Отчёт', icon: FileChartColumn, tone: 'blue' },
        { id: 'table', label: 'Таблица', icon: Table2, tone: 'green' },
        { id: 'test', label: 'Тест', icon: ClipboardList, tone: 'purple' },
        { id: 'chart', label: 'График', icon: ChartNoAxesColumn, tone: 'orange' },
        { id: 'mermaid', label: 'Диаграмма', icon: Workflow, tone: 'teal' },
        { id: 'cards', label: 'Карточки', icon: Layers, tone: 'blue' },
        { id: 'presentation', label: 'Презентация', icon: Presentation, tone: 'orange' },
        { id: 'compare', label: 'Сравнить', icon: ArrowLeftRight, tone: 'gray' },
    ];
    // Studio cards the backend offers beyond the built-in formats (summary,
    // risks, timeline, checklist, faq); they send preset with its format.
    const extraStudioTiles = (studioPresets || [])
        .filter((item) => !STUDIO_TILES.some((tile) => tile.id === item.id) && GENERATION_FORMATS.some((format) => format.id === item.format))
        .map((item) => ({ id: item.id, label: item.title, icon: Sparkles, tone: 'gray', presetFormat: item.format, description: item.description }));

    const sourceMeta = (file) => {
        const kind = getItemKind(file);
        const size = formatBytes(file.size);
        return [KIND_META[kind]?.label || 'Файл', size !== '—' ? size : null].filter(Boolean).join(' · ');
    };


    if (embedded) {
        const openResult = openResultIdx !== null && messages[openResultIdx]?.role === 'assistant' ? messages[openResultIdx] : null;
        const openResultFormat = openResult ? getAssistantMessageFormat(openResult) : null;
        const openResultMeta = openResultFormat ? RESULT_FORMATS[openResultFormat] : null;
        const openResultTitle = openResult ? describeResult(openResult.content || '', openResultMeta?.label || 'Ответ').title : '';
        const openResultTone = STUDIO_TONES[STUDIO_TILES.find((tile) => tile.id === openResultFormat)?.tone || 'gray'];
        const OpenResultIcon = STUDIO_TILES.find((tile) => tile.id === openResultFormat)?.icon || FileText;
        const openStudioResult = (idx) => setOpenResultIdx(idx);
        const showStudioResult = Boolean(openResult && openResultFormat !== 'presentation');
        const panelIconButton = clsx('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[#586174] transition-colors hover:bg-[#EEF1F5] hover:text-[#17202E]', FOCUS_RING);
        const allNotebooksLabel = 'Все блокноты';
        const headerIconButton = clsx('inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-[#586174] transition-colors hover:bg-[#F1F3F6] hover:text-[#17202E]', FOCUS_RING);
        return (
            <NotebookThemeContext.Provider value={notebookThemes}>
            <div data-no-tooltip className="@container relative flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-white font-[Inter,sans-serif] text-[#17202E] antialiased">

                <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[#E6EAF1] px-3 sm:px-4">
                    <button type="button" onClick={() => onBack?.()} aria-label={allNotebooksLabel} className={headerIconButton}>
                        <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2} />
                    </button>
                    <nav aria-label="Путь" className="flex min-w-0 flex-1 items-center gap-1 text-[14px]">
                        <button type="button" onClick={() => navigate('/drive')} className={clsx('inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] px-1.5 text-[#586174] transition-colors hover:bg-[#F1F3F6] hover:text-[#17202E] @max-[720px]:hidden', FOCUS_RING)}>
                            <Folder className="h-4 w-4" strokeWidth={1.8} />
                            Drive
                        </button>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#9AA3B2] @max-[720px]:hidden" strokeWidth={2} />
                        <button type="button" onClick={() => onBack?.()} className={clsx('inline-flex h-8 shrink-0 items-center rounded-[8px] px-1.5 text-[#586174] transition-colors hover:bg-[#F1F3F6] hover:text-[#17202E] @max-[520px]:hidden', FOCUS_RING)}>
                            Deep Research
                        </button>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#9AA3B2] @max-[520px]:hidden" strokeWidth={2} />
                        <span aria-current="page" className="truncate px-1.5 text-[15px] font-medium text-[#17202E]" title={chatTitle}>{chatTitle}</span>
                    </nav>
                    <button
                        ref={headerMenuAnchorRef}
                        type="button"
                        aria-label="Ещё"
                        aria-haspopup="menu"
                        aria-expanded={headerMenuOpen}
                        data-no-tooltip
                        onClick={() => setHeaderMenuOpen((value) => !value)}
                        className={clsx(headerIconButton, headerMenuOpen && 'bg-[#F1F3F6] text-[#17202E]')}
                    >
                        <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={2} />
                    </button>
                    <FloatingMenu anchorRef={headerMenuAnchorRef} open={headerMenuOpen} onClose={() => setHeaderMenuOpen(false)}>
                        {onCreateChat ? <MenuItem icon={Plus} label="Новый блокнот" onClick={() => { setHeaderMenuOpen(false); onCreateChat(); }} /> : null}
                        <MenuItem icon={FolderOpen} label={allNotebooksLabel} onClick={() => { setHeaderMenuOpen(false); onBack?.(); }} />
                    </FloatingMenu>
                </header>
                <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
                    <aside aria-label="Источники" className={clsx('relative flex h-full shrink-0 flex-col overflow-hidden border-r border-[#E6EAF1] bg-[#FAFBFC] transition-[width] duration-300 ease-out', sourcesOpen ? 'w-[280px]' : 'w-[52px]')}>
                        <button type="button" onClick={() => setSourcesOpen((value) => !value)} aria-expanded={sourcesOpen} aria-label={sourcesOpen ? 'Скрыть источники' : 'Показать источники'} className={clsx(headerIconButton, 'absolute right-2 top-3.5 z-10')}>
                            <PanelLeft className="h-[18px] w-[18px]" strokeWidth={1.8} />
                        </button>
                        <div inert={!sourcesOpen} className={clsx('flex w-[280px] min-h-0 flex-1 flex-col transition-opacity duration-200', sourcesOpen ? 'opacity-100' : 'pointer-events-none opacity-0')}>
                            <div className="flex flex-col gap-3 px-3.5 pb-2 pt-4">
                                <div className="flex items-center gap-2 pr-10">
                                    <h2 className="workspace-people-panel__title min-w-0 truncate !px-1 text-[#17202E]">Источники</h2>
                                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#EEF1F5] px-1.5 text-[12px] font-medium tabular-nums text-[#465066]">{sourceFiles.length}</span>
                                </div>
                                <button
                                    ref={addSourceAnchorRef}
                                    type="button"
                                    aria-haspopup="menu"
                                    aria-expanded={addSourceMenuOpen}
                                    disabled={notebookImportBusy}
                                    onClick={() => setAddSourceMenuOpen((value) => !value)}
                                    className={clsx('flex h-10 items-center justify-center gap-2 rounded-[10px] bg-[#2458D3] px-3 text-[14px] font-medium text-white shadow-[0_6px_14px_-8px_rgba(36,88,211,0.8)] transition-colors hover:bg-[#1D47B0] disabled:opacity-60', FOCUS_RING)}
                                >
                                    {notebookImportBusy ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Plus className="h-[18px] w-[18px]" strokeWidth={2} />}
                                    Добавить
                                </button>
                                <FloatingMenu anchorRef={addSourceAnchorRef} open={addSourceMenuOpen} onClose={() => setAddSourceMenuOpen(false)} align="start" width={272}>
                                    <MenuItem icon={Folder} label="Из Drive" onClick={() => { setAddSourceMenuOpen(false); setDrivePickerOpen(true); }} />
                                    {onImportNotebookFile ? (
                                        <MenuItem icon={UploadIcon} label="С устройства" onClick={() => { setAddSourceMenuOpen(false); notebookImportInputRef.current?.click(); }} />
                                    ) : null}
                                </FloatingMenu>
                                <input
                                    ref={notebookImportInputRef}
                                    type="file"
                                    accept=".txt,.md,.docx,.pdf,.pptx,.ppt,.xlsx,.xls,.xlsm,application/pdf"
                                    className="hidden"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        e.target.value = '';
                                        handleDeviceFile(f);
                                    }}
                                />
                                {sourceFiles.length ? (
                                    <label className="flex h-9 items-center gap-2 rounded-[10px] bg-[#F1F3F6] px-2.5 text-[#586174] focus-within:bg-white focus-within:shadow-[0_0_0_1px_#2458D3]">
                                        <span className="sr-only">Найти источник</span>
                                        <Search className="h-[15px] w-[15px] shrink-0" strokeWidth={1.8} />
                                        <input
                                            type="search"
                                            value={sourceSearch}
                                            onChange={(e) => setSourceSearch(e.target.value)}
                                            placeholder="Найти источник"
                                            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[#17202E] outline-none placeholder:text-[#7B8494]"
                                        />
                                    </label>
                                ) : null}
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                                {sourceFiles.length ? (
                                    <>
                                        <div className="flex h-9 items-center gap-2.5 px-2.5 text-[13px] text-[#465066]">
                                            <Checkbox
                                                checked={allSourcesActive}
                                                indeterminate={activeSourceCount > 0 && !allSourcesActive}
                                                onChange={() => setAllSourcesActive(!allSourcesActive)}
                                                label="Выбрать все источники"
                                            />
                                            <span className="flex-1">Выбрать все</span>
                                            <span className="text-[12px] tabular-nums text-[#7B8494]">{activeSourceCount} из {sourceFiles.length}</span>
                                        </div>
                                        <ul className="flex flex-col gap-0.5">
                                            {visibleSourceFiles.map((file) => {
                                                const selected = activeFileIds.has(file.id);
                                                return (
                                                    <li key={file.id} className={clsx('group flex min-h-[52px] items-center gap-2.5 rounded-[10px] py-1.5 pl-2.5 pr-1 transition-colors', selected ? 'hover:bg-[#EEF1F5]' : 'hover:bg-[#F1F3F6]')}>
                                                        <Checkbox checked={selected} onChange={() => toggleFileSelection(file)} label={`Использовать ${file.name}`} />
                                                        <FileTypeIcon item={file} size={28} />
                                                        <div className="min-w-0 flex-1">
                                                            <p className={clsx('truncate text-[13px] font-medium leading-5', selected ? 'text-[#17202E]' : 'text-[#586174]')} title={file.name}>{file.name}</p>
                                                            <p className="truncate text-[12px] leading-4 text-[#7B8494]">{sourceMeta(file)}</p>
                                                        </div>
                                                        <SourceRowMenu file={file} onRemove={removeSource} />
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                        {!visibleSourceFiles.length ? <p className="px-2.5 py-4 text-[13px] text-[#586174]">Ничего не найдено.</p> : null}
                                    </>
                                ) : (
                                    <div className="mx-1.5 mt-1 flex flex-col items-center gap-2.5 rounded-[14px] border-[1.5px] border-dashed border-[#D3D9E3] px-4 py-7 text-center">
                                        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E6EAF1] bg-white text-[#586174]">
                                            <UploadIcon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                                        </span>
                                        <p className="text-[13px] font-medium text-[#17202E]">Источников пока нет</p>
                                        <p className="text-[12px] leading-[18px] text-[#586174]">Добавьте документы из Drive или загрузите с устройства.</p>
                                    </div>
                                )}
                            </div>

                            <div className="shrink-0 border-t border-[#E6EAF1] px-3.5 py-2.5">
                                <button type="button" onClick={() => navigate('/drive')} className={clsx('flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2 text-[13px] text-[#465066] transition-colors hover:bg-[#F1F3F6] hover:text-[#17202E]', FOCUS_RING)}>
                                    <Folder className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                                    <span className="flex-1 truncate text-left">Источники из вашего Drive</span>
                                    <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
                                </button>
                            </div>
                        </div>
                    </aside>

                    <main className="relative flex min-h-0 min-w-[320px] flex-1 flex-col bg-white">
                        <div ref={messagesScrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-6">
                            {messages.length === 0 && !sending ? (
                                <div className="mx-auto flex min-h-full max-w-[640px] flex-col items-center justify-center gap-6 py-8 text-center">
                                    <div>
                                        <h2 className="text-[28px] font-semibold leading-9 tracking-[-0.02em] text-[#17202E]">{sourceFiles.length ? 'Задайте вопрос по источникам' : 'С чего начнём исследование?'}</h2>
                                        <p className="mt-2 text-[15px] leading-6 text-[#586174]">Ответ опирается только на выбранные документы.</p>
                                    </div>
                                    {sourceFiles.length ? (
                                        <div className="flex flex-wrap justify-center gap-2">
                                            {SUGGESTIONS.map((suggestion) => (
                                                <button key={suggestion.text} type="button" onClick={() => setInput(suggestion.text)} className={clsx('inline-flex h-9 items-center rounded-full border border-[#E2E5EA] bg-white px-4 text-[13px] text-[#17202E] transition-colors hover:border-[#D3D9E3] hover:bg-[#F8F9FB]', FOCUS_RING)}>
                                                    {suggestion.text}
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                                            <button type="button" onClick={() => setDrivePickerOpen(true)} className={clsx('flex flex-col items-start gap-3 rounded-2xl border border-[#E6EAF1] bg-white p-[18px] text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-[border-color,box-shadow] hover:border-[#D3D9E3] hover:shadow-[0_8px_24px_-16px_rgba(16,24,40,0.25)]', FOCUS_RING)}>
                                                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EDF2FF] text-[#2458D3]"><Folder className="h-5 w-5" strokeWidth={1.8} /></span>
                                                <span className="block text-[15px] font-semibold text-[#17202E]">Из Drive</span>
                                            </button>
                                            {onImportNotebookFile ? (
                                                <button type="button" onClick={() => notebookImportInputRef.current?.click()} disabled={notebookImportBusy} className={clsx('flex flex-col items-start gap-3 rounded-2xl border border-[#E6EAF1] bg-white p-[18px] text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-[border-color,box-shadow] hover:border-[#D3D9E3] hover:shadow-[0_8px_24px_-16px_rgba(16,24,40,0.25)] disabled:opacity-60', FOCUS_RING)}>
                                                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E9F7EF] text-[#15803D]">{notebookImportBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadIcon className="h-5 w-5" strokeWidth={1.8} />}</span>
                                                    <span className="block text-[15px] font-semibold text-[#17202E]">С устройства</span>
                                                </button>
                                            ) : null}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="mx-auto flex max-w-[720px] flex-col gap-6">
                                    {messages.map((msg, idx) => (
                                        msg.role === 'user' ? (
                                            <div key={idx} id={`nb-msg-${idx}`} className="flex flex-col items-end gap-1.5">
                                                <div className="max-w-[80%] whitespace-pre-wrap rounded-[18px] bg-[#F1F3F6] px-4 py-2 text-[14px] leading-[22px] text-[#17202E]">{msg.content}</div>
                                                {msg.createdAt ? <span className="text-[12px] text-[#7B8494]">{formatModified(msg.createdAt)}</span> : null}
                                            </div>
                                        ) : (
                                            <div key={idx} id={`nb-msg-${idx}`} className="flex flex-col gap-2.5">
                                                <div className="flex items-center gap-2.5">
                                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-[#EDF2FF] text-[#2458D3]">
                                                        <Sparkles className="h-[15px] w-[15px]" strokeWidth={1.9} />
                                                    </span>
                                                    <span className="text-[14px] font-semibold text-[#17202E]">Ассистент</span>
                                                    {msg.createdAt ? <span className="text-[12px] text-[#7B8494]">{formatModified(msg.createdAt)}</span> : null}
                                                </div>
                                                <div className="min-w-0 pl-[38px]">
                                                    <div className="nb-answer select-text text-[14px] leading-[22px] text-[#17202E]">
                                                        {(() => {
                                                            const af = getAssistantMessageFormat(msg);
                                                            return ['cards', 'test', 'table', 'report', 'presentation', 'chart', 'mermaid', 'compare'].includes(af) ? (
                                                                <FormattedMessage content={msg.content} format={af} />
                                                            ) : (
                                                                <AssistantMarkdown withSources>{normalizeAssistantMarkdown(msg.content)}</AssistantMarkdown>
                                                            );
                                                        })()}
                                                    </div>
                                                    <div className="-ml-1.5 mt-2.5 flex flex-wrap items-center gap-0.5">
                                                        <button type="button" onClick={() => copyAssistantText(msg.content, idx)} aria-label="Копировать ответ" className={panelIconButton}>
                                                            {copiedIndex === idx ? <Check className="h-4 w-4 text-[#16734B]" strokeWidth={2} /> : <Copy className="h-4 w-4" strokeWidth={1.8} />}
                                                        </button>
                                                        <span aria-hidden="true" className="mx-1.5 h-4 w-px bg-[#E6EAF1]" />
                                                        <button
                                                            type="button"
                                                            onClick={() => saveMessageToDrive(msg, idx)}
                                                            disabled={savingMessageIndex === idx}
                                                            className={clsx('inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-[13px] font-medium text-[#465066] transition-colors hover:bg-[#EEF1F5] hover:text-[#17202E] disabled:opacity-60', FOCUS_RING)}
                                                        >
                                                            {savingMessageIndex === idx ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" strokeWidth={1.8} />}
                                                            Сохранить в Drive
                                                        </button>
                                                    </div>
                                                    {msg.stats?.mode === 'deep' ? (
                                                        <p className="mt-2 text-[12px] text-[#7B8494]">
                                                            {notebookJobText('deepStats', { analyzed: msg.stats.chunks_analyzed, total: msg.stats.chunks_total })}
                                                        </p>
                                                    ) : null}
                                                    {idx === lastAssistantIndex && !sending && msg.suggestions?.length ? (
                                                        <div className="mt-3 flex flex-wrap gap-2">
                                                            {msg.suggestions.map((text) => (
                                                                <button key={text} type="button" onClick={() => setInput(text)} className={clsx('inline-flex h-8 items-center rounded-full border border-[#E2E5EA] bg-white px-3 text-[13px] text-[#17202E] transition-colors hover:border-[#D3D9E3] hover:bg-[#F8F9FB]', FOCUS_RING)}>
                                                                    {text}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>
                                        )
                                    ))}
                                    {sending ? (
                                        <div className="flex items-center gap-2.5" role="status">
                                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-[#EDF2FF] text-[#2458D3]">
                                                <Loader2 className="h-[15px] w-[15px] animate-spin" />
                                            </span>
                                            <span className="text-[14px] text-[#586174]">{describeNotebookJobProgress(jobProgress)}</span>
                                        </div>
                                    ) : null}
                                </div>
                            )}
                        </div>

                        <div className="shrink-0 px-6 pb-3.5 pt-2">
                            <div className="mx-auto max-w-[720px]">
                                {!activeSourceCount && sourceFiles.length ? (
                                    <p className="mb-2 flex items-center gap-2 rounded-xl border border-[#E6EAF1] bg-[#F8F9FB] px-3.5 py-2.5 text-[13px] text-[#465066]">
                                        <Info className="h-4 w-4 shrink-0 text-[#D9480F]" strokeWidth={1.8} />
                                        Выберите источники слева, чтобы ответы опирались на документы
                                    </p>
                                ) : null}
                                <div className="rounded-[18px] border border-[#E2E5EA] bg-white px-3.5 pb-2.5 pt-3 shadow-[0_8px_24px_-14px_rgba(16,24,40,0.18)] transition-[border-color] focus-within:border-[#C9D3E6]">
                                    {activeFormat || activePreset ? (
                                        <div className="mb-2 flex">
                                            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[#EDF2FF] pl-3 pr-1 text-[12px] font-medium text-[#2458D3]">
                                                Формат: {activePreset?.title || activeFormat?.label}
                                                <button type="button" onClick={() => setGenerationFormat(null)} aria-label="Сбросить формат" data-no-tooltip className={clsx('inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-white', FOCUS_RING)}>
                                                    <X className="h-3.5 w-3.5" strokeWidth={2} />
                                                </button>
                                            </span>
                                        </div>
                                    ) : null}
                                    <label htmlFor="notebook-composer" className="sr-only">Вопрос по источникам</label>
                                    <textarea
                                        id="notebook-composer"
                                        rows={1}
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSend();
                                            }
                                        }}
                                        placeholder={generationFormat === 'compare' ? 'Опишите, что сравнить в выбранных файлах…' : 'Задайте вопрос по источникам…'}
                                        className="block max-h-40 min-h-7 w-full resize-none border-0 bg-transparent text-[15px] leading-6 text-[#17202E] [field-sizing:content] placeholder:text-[#7B8494] focus:outline-none"
                                    />
                                    <div className="mt-2 flex items-center gap-1.5">
                                        <button
                                            ref={composerSourcesAnchorRef}
                                            type="button"
                                            aria-haspopup="menu"
                                            aria-expanded={composerSourcesOpen}
                                            onClick={() => setComposerSourcesOpen((value) => !value)}
                                            className={clsx('inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[9px] border border-[#E6EAF1] bg-[#FAFBFC] px-2.5 text-[13px] text-[#465066] transition-colors hover:bg-[#F1F3F6]', FOCUS_RING)}
                                        >
                                            <FileText className="h-3.5 w-3.5" strokeWidth={1.8} />
                                            {activeSourceCount} {sourcesCountLabel(activeSourceCount)}
                                            <ChevronDown className="h-3.5 w-3.5 text-[#7B8494]" strokeWidth={2} />
                                        </button>
                                        <FloatingMenu anchorRef={composerSourcesAnchorRef} open={composerSourcesOpen} onClose={() => setComposerSourcesOpen(false)} align="start" width={300} className="max-h-80 overflow-y-auto">
                                            {sourceFiles.length ? sourceFiles.map((file) => (
                                                <button
                                                    key={file.id}
                                                    type="button"
                                                    role="menuitemcheckbox"
                                                    aria-checked={activeFileIds.has(file.id)}
                                                    onClick={() => toggleFileSelection(file)}
                                                    className={clsx('flex h-9 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-left text-[13px] text-[#17202E] hover:bg-[#F1F3F6]', FOCUS_RING)}
                                                >
                                                    <span className={clsx('inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border', activeFileIds.has(file.id) ? 'border-[#2458D3] bg-[#2458D3] text-white' : 'border-[#B4BAC5] bg-white')}>
                                                        {activeFileIds.has(file.id) ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                                                    </span>
                                                    <FileTypeIcon item={file} size={20} />
                                                    <span className="truncate">{file.name}</span>
                                                </button>
                                            )) : <p className="px-3 py-2 text-[13px] text-[#586174]">Источников пока нет</p>}
                                            <MenuDivider />
                                            <MenuItem icon={Plus} label="Добавить из Drive" onClick={() => { setComposerSourcesOpen(false); setDrivePickerOpen(true); }} />
                                        </FloatingMenu>
                                        {onImportNotebookFile ? (
                                            <button type="button" onClick={() => notebookImportInputRef.current?.click()} disabled={notebookImportBusy} aria-label="Прикрепить файл с устройства" className={panelIconButton}>
                                                {notebookImportBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" strokeWidth={1.8} />}
                                            </button>
                                        ) : null}
                                        <span className="flex-1" />
                                        <div role="radiogroup" aria-label="Режим ответа модели" className="flex shrink-0 gap-0.5 rounded-[9px] bg-[#F1F3F6] p-[3px]">
                                            {[
                                                { value: 'fast', label: 'Быстро', hint: 'Короткий ответ без долгого анализа' },
                                                { value: 'thinking', label: 'Подробно', hint: 'Глубже анализирует источники' },
                                            ].map((option) => (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={chatModelMode === option.value}
                                                    onClick={() => persistChatModelMode(option.value)}
                                                    className={clsx('h-[26px] rounded-[7px] px-2.5 text-[12px] transition-colors', chatModelMode === option.value ? 'bg-white font-medium text-[#17202E] shadow-[0_1px_2px_rgba(16,24,40,0.10)]' : 'text-[#586174] hover:text-[#17202E]', FOCUS_RING)}
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={sending ? () => requestControllerRef.current?.abort(NOTEBOOK_STOP_REASON) : handleSend}
                                            disabled={!sending && !input.trim()}
                                            aria-label={sending ? 'Остановить' : 'Отправить'}
                                            className={clsx('inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] transition-colors', sending ? 'bg-[#17202E] text-white' : 'bg-[#2458D3] text-white hover:bg-[#1D47B0] disabled:bg-[#E3E8F0] disabled:text-[#9AA3B2]', FOCUS_RING)}
                                        >
                                            {sending ? <span aria-hidden="true" className="h-3 w-3 rounded-[2px] bg-current" /> : <ArrowUp className="h-4 w-4" strokeWidth={2.2} />}
                                        </button>
                                    </div>
                                </div>
                                <p className="mt-2 text-center text-[12px] leading-4 text-[#7B8494]">Ответы могут быть неточными — сверяйтесь с источниками.</p>
                            </div>
                        </div>
                    </main>

                    <aside aria-label="Студия" className={clsx('relative flex h-full shrink-0 flex-col overflow-hidden border-l border-[#E6EAF1] transition-[width,background-color] duration-300 ease-out', !studioOpen ? 'w-[52px] bg-[#FAFBFC]' : showStudioResult ? 'w-[480px] bg-white @max-[1100px]:w-[400px]' : 'w-[300px] bg-[#FAFBFC] @max-[1100px]:w-[290px]')}>
                        <button type="button" onClick={() => setStudioOpen((value) => !value)} aria-expanded={studioOpen} aria-label={studioOpen ? 'Скрыть студию' : 'Показать студию'} className={clsx(headerIconButton, 'absolute right-2 top-3.5 z-10')}>
                            <PanelRight className="h-[18px] w-[18px]" strokeWidth={1.8} />
                        </button>
                        <div inert={!studioOpen} className={clsx('flex min-h-0 flex-1 flex-col self-end transition-opacity duration-200', showStudioResult ? 'w-[480px] @max-[1100px]:w-[400px]' : 'w-[300px] @max-[1100px]:w-[290px]', studioOpen ? 'opacity-100' : 'pointer-events-none opacity-0')}>
                    {showStudioResult ? (
                        <>
                            <div className="flex h-16 shrink-0 items-center gap-2 border-b border-[#EEF0F3] pl-3 pr-12">
                                <button type="button" onClick={() => setOpenResultIdx(null)} aria-label="Назад в студию" className={panelIconButton}>
                                    <ChevronLeft className="h-[17px] w-[17px]" strokeWidth={2} />
                                </button>
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]" style={{ background: openResultTone.soft, color: openResultTone.color }}>
                                    <OpenResultIcon className="h-4 w-4" strokeWidth={1.9} />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[12px] text-[#586174]">Студия · {openResultMeta?.label}</p>
                                    <h2 className="truncate text-[15px] font-semibold leading-5 text-[#17202E]" title={openResultTitle}>{openResultTitle}</h2>
                                </div>
                                <button type="button" onClick={() => copyAssistantText(openResult.content, openResultIdx)} aria-label="Копировать ответ" className={panelIconButton}>
                                    {copiedIndex === openResultIdx ? <Check className="h-4 w-4 text-[#16734B]" strokeWidth={2} /> : <Copy className="h-4 w-4" strokeWidth={1.8} />}
                                </button>
                                <button type="button" onClick={() => saveMessageToDrive(openResult, openResultIdx)} disabled={savingMessageIndex === openResultIdx} aria-label="Сохранить в Drive" className={panelIconButton}>
                                    {savingMessageIndex === openResultIdx ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" strokeWidth={1.8} />}
                                </button>
                            </div>
                            <div className="nb-answer min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[14px] leading-[22px] text-[#17202E]">
                                <FormattedMessage content={openResult.content} format={openResultFormat} />
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="min-h-0 flex-1 overflow-y-auto pb-4">
                                <div className="px-3.5 pt-4">
                                    <div className="flex items-center gap-2 pr-10">
                                        <h2 className="workspace-people-panel__title min-w-0 flex-1 truncate !px-1 text-[#17202E]">Студия</h2>
                                    </div>
                                    <p className="px-1 text-[12px] text-[#586174]">Создайте материал по источникам</p>
                                </div>

                                <div className="grid grid-cols-2 gap-1.5 px-3 pt-3">
                                    {[...STUDIO_TILES, ...extraStudioTiles].map((tile) => {
                                        const active = tile.presetFormat ? studioPresetId === tile.id : generationFormat === tile.id && !studioPresetId;
                                        const Icon = tile.icon;
                                        const tone = STUDIO_TONES[tile.tone];
                                        return (
                                            <button
                                                key={tile.id}
                                                type="button"
                                                aria-pressed={active}
                                                title={tile.description}
                                                onClick={() => {
                                                    if (active) { setGenerationFormat(null); return; }
                                                    setGenerationFormat(tile.presetFormat || tile.id);
                                                    if (tile.presetFormat) setStudioPresetId(tile.id);
                                                }}
                                                className={clsx(
                                                    'flex h-11 min-w-0 items-center gap-1.5 rounded-[10px] border px-2 text-left text-[13px] font-medium tracking-[-0.005em] transition-colors duration-[120ms]',
                                                    active ? 'border-[#C9D6F5] bg-[#EDF2FF] text-[#17202E]' : 'border-[#E6EAF1] bg-white text-[#17202E] hover:border-[#D3D9E3]',
                                                    FOCUS_RING,
                                                )}
                                            >
                                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px]" style={{ background: tone.soft, color: tone.color }}>
                                                    <Icon className="h-3.5 w-3.5" strokeWidth={1.9} />
                                                </span>
                                                <span className="min-w-0 truncate">{tile.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {generationFormat === 'presentation' ? (
                                    <div className="mx-3.5 mt-3 flex flex-col gap-3 rounded-xl border border-[#E6EAF1] bg-white p-3">
                                        <div>
                                            <p className="text-[13px] font-medium text-[#17202E]">Способ генерации</p>
                                            <div className="mt-2 flex flex-col gap-1.5">
                                                {PRESENTATION_PROVIDER_OPTIONS.map((option) => (
                                                    <label key={option.id} className="flex cursor-pointer items-center gap-2 text-[13px] text-[#17202E]">
                                                        <input type="radio" name="presentation-provider" checked={presentationProvider === option.id} onChange={() => setPresentationProvider(option.id)} className="h-4 w-4 accent-[#2458D3]" />
                                                        {option.label}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                        {presentationProvider !== PRESENTATION_PROVIDER_MARKDOWN ? (
                                            <div>
                                                <p className="text-[13px] font-medium text-[#17202E]">Режим</p>
                                                <div className="mt-2 grid grid-cols-2 gap-1.5">
                                                    {PRESENTATION_RENDER_MODE_OPTIONS.map((option) => (
                                                        <button
                                                            key={option.id}
                                                            type="button"
                                                            aria-pressed={presentationRenderMode === option.id}
                                                            onClick={() => setPresentationRenderMode(option.id)}
                                                            className={clsx('rounded-[8px] border px-2.5 py-2 text-left', presentationRenderMode === option.id ? 'border-[#C9D6F5] bg-[#EDF2FF]' : 'border-[#E6EAF1] hover:bg-[#F8F9FB]', FOCUS_RING)}
                                                        >
                                                            <span className="block text-[13px] text-[#17202E]">{option.label}</span>
                                                            <span className="block text-[11px] leading-4 text-[#586174]">{option.hint}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                                {presentationRenderMode === 'fast_ppt' ? (
                                                    <label className="mt-3 block text-[13px] text-[#17202E]">
                                                        Тема оформления
                                                        <input
                                                            type="text"
                                                            value={fastPptThemeId}
                                                            onChange={(e) => setFastPptThemeId(e.target.value)}
                                                            placeholder={DEFAULT_FAST_PPT_THEME_ID}
                                                            className="mt-1.5 h-9 w-full rounded-[10px] border border-[#E2E5EA] px-3 text-[13px] focus:border-[#2458D3] focus:outline-none focus:shadow-[0_0_0_3px_rgba(36,88,211,0.12)]"
                                                        />
                                                    </label>
                                                ) : null}
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}

                                <div className="mx-[18px] mt-4 border-t border-[#E6EAF1]" />
                                <section className="px-2 pt-3">
                                    <h3 className="px-2.5 pb-1.5 text-[12px] font-medium text-[#7B8494]">Результаты · {results.length}</h3>
                                    {results.length ? (
                                        <ul className="flex flex-col gap-0.5">
                                            {results.map((result) => {
                                                const tile = STUDIO_TILES.find((item) => item.id === result.format);
                                                const tone = STUDIO_TONES[tile?.tone || 'gray'];
                                                const Icon = tile?.icon || FileText;
                                                return (
                                                    <li key={result.idx}>
                                                        <button
                                                            type="button"
                                                            onClick={() => openStudioResult(result.idx)}
                                                            className={clsx('flex min-h-[50px] w-full items-center gap-2.5 rounded-[10px] py-1.5 pl-2.5 pr-1 text-left transition-colors hover:bg-[#F1F3F6]', FOCUS_RING)}
                                                        >
                                                            <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px]" style={{ background: tone.soft, color: tone.color }}>
                                                                <Icon className="h-[15px] w-[15px]" strokeWidth={1.8} />
                                                            </span>
                                                            <span className="min-w-0 flex-1">
                                                                <span className="block truncate text-[13px] font-medium leading-5 text-[#17202E]">{result.title}</span>
                                                                <span className="block truncate text-[12px] leading-4 text-[#586174]">{result.label}{result.createdAt ? ` · ${formatModified(result.createdAt)}` : ''}</span>
                                                            </span>
                                                            <ChevronRight className="h-4 w-4 shrink-0 text-[#9AA3B2]" strokeWidth={2} />
                                                        </button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    ) : (
                                        <p className="px-2.5 text-[13px] leading-5 text-[#586174]">Выберите формат выше и задайте вопрос — готовый материал появится здесь.</p>
                                    )}
                                </section>
                            </div>
                        </>
                    )}
                        </div>
                    </aside>
                </div>

                {openResult && openResultFormat === 'presentation' ? (
                    <AppModal title={openResultTitle} onClose={() => setOpenResultIdx(null)} maxWidth={1000} animated closeOnBackdrop>
                        <div className="text-[14px] leading-6 text-[#17202E]">
                            <FormattedMessage content={openResult.content} format="presentation" />
                        </div>
                    </AppModal>
                ) : null}

                {drivePickerOpen ? createPortal(
                    <div
                        className="ts-legacy-backdrop fixed inset-0 z-[1000] flex items-center justify-center bg-[#17202E]/[0.22] p-4 font-[Inter,sans-serif] antialiased"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="drive-picker-title"
                        onKeyDown={(event) => { if (event.key === 'Escape') setDrivePickerOpen(false); }}
                    >
                        <div className="flex max-h-[80vh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-[#E6EAF1] bg-white shadow-[0_24px_60px_-20px_rgba(16,24,40,0.35)] motion-safe:animate-[drive-menu-in_180ms_ease-out]">
                            <div className="flex items-start justify-between gap-4 pl-6 pr-5 pt-[18px]">
                                <div>
                                    <h3 id="drive-picker-title" className="text-[18px] font-semibold leading-[26px] text-[#17202E]">Добавить из Drive</h3>
                                    <p className="mt-0.5 text-[14px] text-[#586174]">Отмеченные файлы сразу становятся источниками блокнота.</p>
                                </div>
                                <button type="button" onClick={() => setDrivePickerOpen(false)} aria-label="Закрыть" className={clsx('inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[8px] text-[#586174] transition-colors hover:bg-[#F1F3F6] hover:text-[#17202E]', FOCUS_RING)}>
                                    <X className="h-5 w-5" strokeWidth={1.75} />
                                </button>
                            </div>
                            <div className="px-6 pt-4">
                                <label className="flex h-9 items-center gap-2 rounded-[10px] border border-[#E2E5EA] px-3 text-[#586174] transition-colors focus-within:border-[#2458D3] focus-within:shadow-[0_0_0_3px_rgba(36,88,211,0.12)]">
                                    <span className="sr-only">Поиск файлов</span>
                                    <Search className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                                    <input
                                        type="search"
                                        value={docSearch}
                                        onChange={(e) => setDocSearch(e.target.value)}
                                        placeholder="Поиск файлов"
                                        autoFocus
                                        className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-[#17202E] outline-none placeholder:text-[#7B8494]"
                                    />
                                </label>
                                <nav aria-label="Папка" className="mt-3 flex items-center gap-1 overflow-x-auto text-[13px] text-[#586174]">
                                    {path.map((p, idx) => (
                                        <React.Fragment key={p.id}>
                                            {idx > 0 ? <ChevronRight className="h-4 w-4 shrink-0 text-[#7B8494]" strokeWidth={1.75} /> : null}
                                            <button type="button" onClick={() => handlePathClick(idx)} className={clsx('shrink-0 rounded-[4px] hover:text-[#17202E]', idx === path.length - 1 && 'font-medium text-[#17202E]', FOCUS_RING)}>
                                                {idx === 0 ? 'Мой диск' : p.name}
                                            </button>
                                        </React.Fragment>
                                    ))}
                                </nav>
                            </div>
                            <div className="mx-6 mt-3 min-h-[240px] flex-1 overflow-y-auto rounded-xl border border-[#E6EAF1] p-1.5">
                                {loadingFolder ? (
                                    <div className="flex items-center justify-center gap-2 py-10 text-[14px] text-[#586174]">
                                        <Loader2 className="h-5 w-5 animate-spin text-[#2458D3]" /> Загружаем файлы…
                                    </div>
                                ) : filteredFolderItems.length === 0 ? (
                                    <p className="py-10 text-center text-[14px] text-[#586174]">{docSearch.trim() ? 'Ничего не найдено.' : 'Папка пуста.'}</p>
                                ) : (
                                    <ul>
                                        {filteredFolderItems.map((f) => {
                                            const isDir = f.type === 'dir' || f.mime_type === 'application/x-directory';
                                            if (isDir) {
                                                const state = getCachedFolderSelectionState(f.id);
                                                const checked = state.total > 0 && state.selected === state.total;
                                                const partial = state.selected > 0 && !checked;
                                                const busy = folderSelectionBusyIds.has(f.id);
                                                return (
                                                    <li key={f.id} className="flex min-h-11 items-center gap-3 rounded-[8px] px-2.5 py-1.5 hover:bg-[#F8F9FB]">
                                                        {busy ? <Loader2 className="h-[18px] w-[18px] animate-spin text-[#2458D3]" /> : (
                                                            <Checkbox checked={checked} indeterminate={partial} onChange={() => toggleFolderSelection(f)} label={`Все файлы в папке ${f.name}`} />
                                                        )}
                                                        <button type="button" onClick={() => handleFolderClick(f)} className={clsx('flex min-w-0 flex-1 items-center gap-3 rounded-[4px] text-left', FOCUS_RING)}>
                                                            <FileTypeIcon item={f} size={24} />
                                                            <span className="min-w-0 flex-1 truncate text-[14px] text-[#17202E]">{f.name}</span>
                                                            <ChevronRight className="h-4 w-4 shrink-0 text-[#7B8494]" strokeWidth={1.75} />
                                                        </button>
                                                    </li>
                                                );
                                            }
                                            return (
                                                <li key={f.id}>
                                                    <label className={clsx('flex min-h-11 cursor-pointer items-center gap-3 rounded-[8px] px-2.5 py-1.5', activeFileIds.has(f.id) ? 'bg-[#F7F9FF]' : 'hover:bg-[#F8F9FB]')}>
                                                        <Checkbox checked={activeFileIds.has(f.id)} onChange={() => toggleFileSelection(f)} label={`Добавить ${f.name}`} />
                                                        <FileTypeIcon item={f} size={24} />
                                                        <span className="min-w-0 flex-1 truncate text-[14px] text-[#17202E]">{f.name}</span>
                                                        <span className="shrink-0 text-[12px] tabular-nums text-[#586174]">{formatBytes(f.size)}</span>
                                                    </label>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                            <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#EEF0F3] bg-[#FAFBFC] px-6 py-3.5">
                                <span className="text-[13px] font-semibold text-[#17202E]">Выбрано: {activeFileIds.size}</span>
                                <button type="button" onClick={() => setDrivePickerOpen(false)} className={clsx('inline-flex h-10 items-center rounded-[10px] bg-[#2458D3] px-5 text-[14px] font-medium text-white transition-colors hover:bg-[#1D47B0]', FOCUS_RING)}>Готово</button>
                            </div>
                        </div>
                    </div>,
                    document.body,
                ) : null}
            </div>
            </NotebookThemeContext.Provider>
        );
    }

    return (
        <div className={`flex flex-col overflow-hidden bg-white ${embedded ? 'h-full rounded-none shadow-none' : ''}`}>
            {/* Шапка */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-[#7c3aed] flex items-center justify-center text-white font-bold text-lg">
                        N
                    </div>
                    <span className="font-semibold text-gray-800 hidden sm:block">Deep Research Assistant</span>
                    {allFiles?.length > 0 && (
                        <div className="relative min-w-0 flex-1 max-w-[320px] sm:max-w-[360px]">
                            <button
                                type="button"
                                onClick={() => setDocDropdownOpen((v) => !v)}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50/80 hover:bg-white hover:shadow-sm text-left truncate transition-colors"
                            >
                                <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
                                <div className="flex flex-col min-w-0">
                                    <span className="truncate text-sm text-gray-800">
                                        {currentFile?.name || 'Документ'}
                                    </span>
                                    <span className="text-[11px] text-gray-500">
                                        В контексте: {activeFileIds.size} док.
                                    </span>
                                </div>
                                <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 ml-auto" />
                            </button>
                            <AnimatePresence>
                                {docDropdownOpen && (
                                    <>
                                        <div className="fixed inset-0 z-10" aria-hidden onClick={() => setDocDropdownOpen(false)} />
                                        <motion.div
                                            initial={{ opacity: 0, y: -4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -4 }}
                                            className="absolute top-full left-0 right-0 mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-2 max-h-72 flex flex-col"
                                        >
                                            <div className="px-3 pb-1 text-[11px] text-gray-500 uppercase tracking-wide">
                                                Документы в контексте
                                            </div>
                                            <div className="px-3 pb-2">
                                                <div className="relative">
                                                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                                    <input
                                                        type="text"
                                                        value={docSearch}
                                                        onChange={(e) => setDocSearch(e.target.value)}
                                                        placeholder="Поиск по названию..."
                                                        className="w-full pl-7 pr-2 py-1.5 text-[11px] border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-transparent bg-gray-50"
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex-1 overflow-auto">
                                            {allFiles
                                                .filter((f) => (f.name || '').toLowerCase().includes(docSearch.trim().toLowerCase()))
                                                .map((f) => {
                                                const selected = activeFileIds.has(f.id);
                                                const isCurrent = f.id === currentFile?.id;
                                                const fullIndex = allFiles.indexOf(f);
                                                return (
                                                    <button
                                                        key={f.id}
                                                        type="button"
                                                        onClick={() => toggleFileSelection(f)}
                                                        className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 ${
                                                            selected ? 'bg-indigo-50/60 text-indigo-800' : 'text-gray-700'
                                                        }`}
                                                    >
                                                        <div
                                                            className={`flex-shrink-0 w-4 h-4 rounded-[6px] border flex items-center justify-center text-[9px] ${
                                                                selected
                                                                    ? 'border-indigo-500 bg-indigo-500 text-white'
                                                                    : 'border-gray-300 bg-white text-transparent'
                                                            }`}
                                                        >
                                                            ✓
                                                        </div>
                                                        <FileText className="w-4 h-4 flex-shrink-0 text-indigo-500" />
                                                        <span className="truncate flex-1">{f.name}</span>
                                                        {isCurrent && (
                                                            <span className="text-[10px] text-indigo-600 font-medium flex-shrink-0">
                                                                текущий
                                                            </span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                            </div>
                                        </motion.div>
                                    </>
                                )}
                            </AnimatePresence>
                        </div>
                    )}
                    {/* Встраиваемый режим: доп. подпись не нужна — счётчик в дропдауне */}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Кнопка «Новый чат» убрана — управление чатами слева в списке */}
                    {!embedded && onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-9 h-9 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Приветствие или чат */}
            <div className="flex-1 flex flex-col overflow-hidden bg-white min-h-0">
                {messages.length === 0 ? (
                    <div className="flex-1 overflow-auto flex flex-col items-center justify-center px-4 py-8">
                        <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mb-4">
                            <BookOpen className="w-8 h-8 text-indigo-600" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
                            Привет! Готов работать с документом
                        </h2>
                        <p className="text-sm text-gray-500 text-center max-w-md mb-6">
                            Задавайте вопросы о содержимом документа, и я помогу вам найти нужную информацию и получить инсайты.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
                            {SUGGESTIONS.map((s, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    onClick={() => setInput(s.text)}
                                    className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 hover:border-indigo-200 text-left text-sm text-gray-700"
                                >
                                    <s.icon className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
                                    <span>{s.text}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                                <div ref={messagesScrollRef} className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto p-4 space-y-3">
                                    {messages.map((msg, idx) => (
                                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            {msg.role === 'user' ? (
                                                <div className="max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm bg-indigo-600 text-white rounded-br-sm">
                                                    <div className="whitespace-pre-wrap">{msg.content}</div>
                                                </div>
                                            ) : (
                                                <div
                                                    className={`flex flex-col items-stretch gap-1.5 ${
                                                        getAssistantMessageFormat(msg) === 'mermaid'
                                                            ? 'w-full max-w-full'
                                                            : 'max-w-[85%]'
                                                    }`}
                                                >
                                        <div className="rounded-2xl px-4 py-3 text-sm shadow-sm bg-gray-50 text-gray-800 rounded-bl-sm border border-gray-100 select-text">
                                            {(() => {
                                                const af = getAssistantMessageFormat(msg);
                                                const useFormatted =
                                                    af === 'cards' ||
                                                    af === 'test' ||
                                                    af === 'table' ||
                                                    af === 'report' ||
                                                    af === 'presentation' ||
                                                    af === 'chart' ||
                                                    af === 'mermaid';
                                                return useFormatted ? (
                                                    <FormattedMessage content={msg.content} format={af} />
                                                ) : (
                                                    <div className="max-w-none">
                                                        <AssistantMarkdown>
                                                            {normalizeAssistantMarkdown(msg.content)}
                                                        </AssistantMarkdown>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                        <div className="flex items-center gap-1 px-0.5">
                                            <button
                                                type="button"
                                                onClick={() => copyAssistantText(msg.content, idx)}
                                                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                                                title="Копировать"
                                            >
                                                {copiedIndex === idx ? (
                                                    <>
                                                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                                                        <span>Скопировано</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Copy className="w-3.5 h-3.5" />
                                                        <span>Копировать</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                <div className="border-t border-gray-100 flex-shrink-0">
                    <div className="px-3 pt-2 pb-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-gray-500">Формат ответа (необязательно):</span>
                            {GENERATION_FORMATS.map((f) => {
                                const active = generationFormat === f.id;
                                const Icon = f.icon;
                                return (
                                    <button
                                        key={f.id}
                                        type="button"
                                        onClick={() => setGenerationFormat(active ? null : f.id)}
                                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                            active
                                                ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                                                : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                                        }`}
                                        title={f.instruction.slice(0, 80) + '…'}
                                    >
                                        <Icon className="w-3.5 h-3.5" />
                                        {f.label}
                                    </button>
                                );
                            })}
                        </div>
                        {generationFormat && (
                            <p className="text-[11px] text-amber-800/90 mt-1.5 leading-snug">
                                Формат действует для следующих сообщений, пока не отмените — нажмите ту же кнопку ещё раз.
                            </p>
                        )}
                        {generationFormat === 'presentation' && (
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                                <span className="text-[11px] text-gray-500">Провайдер:</span>
                                <AppSelect
                                    value={presentationProvider}
                                    onChange={setPresentationProvider}
                                    options={PRESENTATION_PROVIDER_OPTIONS.map((option) => ({ value: option.id, label: option.label }))}
                                    showButtonAvatar={false}
                                    showOptionAvatar={false}
                                    ariaLabel="Провайдер генерации презентации"
                                    className="w-[180px]"
                                    buttonClassName="!h-8 !rounded-xl !bg-white !px-2.5 !text-xs"
                                />
                                <span className="text-[11px] text-gray-500">Режим:</span>
                                <AppSelect
                                    value={presentationRenderMode}
                                    onChange={setPresentationRenderMode}
                                    options={PRESENTATION_RENDER_MODE_OPTIONS.map((option) => ({ value: option.id, label: option.label }))}
                                    showButtonAvatar={false}
                                    showOptionAvatar={false}
                                    ariaLabel="Режим генерации презентации"
                                    className="w-[170px]"
                                    buttonClassName="!h-8 !rounded-xl !bg-white !px-2.5 !text-xs"
                                />
                                {presentationRenderMode === 'fast_ppt' && (
                                    <input
                                        type="text"
                                        value={fastPptThemeId}
                                        onChange={(e) => setFastPptThemeId(e.target.value)}
                                        placeholder={DEFAULT_FAST_PPT_THEME_ID}
                                        className="min-w-[160px] rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        aria-label="Theme ID для Fast PPT"
                                    />
                                )}
                            </div>
                        )}
                    </div>
                    <div className="p-3 pt-1 flex items-center gap-2 flex-wrap">
                    <AppSelect
                        value={chatModelMode}
                        onChange={persistChatModelMode}
                        options={[{ value: 'fast', label: 'Быстрый' }, { value: 'thinking', label: 'Thinking Mode' }]}
                        showButtonAvatar={false}
                        showOptionAvatar={false}
                        ariaLabel="Режим ответа модели"
                        className="w-[135px] shrink-0"
                        buttonClassName="!h-9 !rounded-xl !bg-white !px-2.5 !text-xs"
                    />
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder={
                            generationFormat === 'compare'
                                ? 'Опишите, что сравнить в выбранных файлах...'
                                : 'Спросите что-нибудь о документе...'
                        }
                        className="flex-1 min-w-[140px] px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    <button
                        type="button"
                        onClick={sending ? () => requestControllerRef.current?.abort(NOTEBOOK_STOP_REASON) : handleSend}
                        disabled={!sending && !input.trim()}
                        className="flex items-center justify-center w-10 h-10 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                    >
                        {sending ? <span aria-hidden="true">■</span> : <Send className="w-5 h-5" />}
                    </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default NotebookLlmContent;
