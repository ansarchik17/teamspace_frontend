import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, FileText, X } from 'lucide-react';
import { extractMessageFromPayload } from '../../../../../infrastructure/http/HttpError';
import { getNotebookSourceExcerpt } from '../api/notebookChats';
import { parseNotebookCitation } from '../utils/notebookResearch';

export const CitationNumbers = createContext(null);

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ts-action)]';

const textOf = (node) => {
    if (node == null || typeof node === 'boolean') return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(textOf).join('');
    return textOf(node.props?.children);
};

export default function NotebookSourceLink({ href, children, node: _node, variant, numbers: chipNumbers, ...props }) {
    const citation = useMemo(() => parseNotebookCitation(href), [href]);
    const registry = useContext(CitationNumbers);
    const [open, setOpen] = useState(false);
    const [source, setSource] = useState(null);
    const [error, setError] = useState('');
    useEffect(() => {
        if (!open || !citation) return undefined;
        const controller = new AbortController();
        setSource(null);
        setError('');
        getNotebookSourceExcerpt(citation, controller.signal).then(setSource).catch((e) => {
            if (!controller.signal.aborted) setError(extractMessageFromPayload(e?.response?.data).message || 'Источник сейчас недоступен. Возможно, он удалён или доступ изменился.');
        });
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => { controller.abort(); window.removeEventListener('keydown', onKey); };
    }, [open, citation]);
    if (!citation) return <a href={href} className="text-[#2458D3] hover:underline" target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
    const label = textOf(children).trim();
    const number = variant === 'chip' ? null : registry?.get(href);
    const show = (e) => { e.preventDefault(); setOpen(true); };
    return <>
        {variant === 'chip' ? (
            <a href={href} onClick={show} title={label} className={`inline-flex h-7 max-w-full items-center gap-1.5 rounded-[8px] border border-[#E6EAF1] bg-[#FAFBFC] px-2.5 text-[12px] text-[#465066] no-underline transition-colors hover:border-[#D3D9E3] hover:bg-white ${FOCUS}`}>
                {chipNumbers ? <span className="shrink-0 font-semibold text-[#2458D3]">{chipNumbers}</span> : <FileText className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />}
                <span className="truncate">{children}</span>
            </a>
        ) : number ? (
            <a href={href} onClick={show} aria-label={`Источник ${number}: ${label}`} title={label} className={`ml-[3px] mr-px inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] bg-[#EDF2FF] px-1 align-[2px] text-[11px] font-semibold leading-none text-[#2458D3] no-underline transition-colors hover:bg-[#DCE6FD] ${FOCUS}`}>{number}</a>
        ) : (
            <a href={href} onClick={show} className={`text-[#2458D3] underline decoration-[#C9D6F5] underline-offset-2 hover:decoration-[#2458D3] ${FOCUS}`} {...props}>{children}</a>
        )}
        {open && createPortal(
            <div className="ts-legacy-backdrop fixed inset-0 z-[10000] flex items-center justify-center bg-[#17202E]/[0.22] p-4 font-[Inter,sans-serif]" onClick={() => setOpen(false)}>
                <section role="dialog" aria-modal="true" aria-labelledby="nb-source-title" className="flex max-h-[80vh] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl border border-[#E6EAF1] bg-white shadow-[0_24px_60px_-20px_rgba(16,24,40,0.35)]" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-start gap-3 px-6 pb-3 pt-5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#EDF2FF] text-[#2458D3]"><FileText className="h-[18px] w-[18px]" strokeWidth={1.8} /></span>
                        <div className="min-w-0 flex-1">
                            <h2 id="nb-source-title" className="truncate text-[17px] font-semibold leading-6 text-[#17202E]">{source?.file_name || 'Фрагмент источника'}</h2>
                            <p className="text-[13px] text-[#586174]">Строки {citation.start}–{citation.end}</p>
                        </div>
                        <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть источник" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] text-[#586174] transition-colors hover:bg-[#F1F3F6] hover:text-[#17202E] ${FOCUS}`}><X className="h-[18px] w-[18px]" strokeWidth={1.8} /></button>
                    </div>
                    <div className="mx-6 min-h-0 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-[#F6F7F9] p-4 text-[14px] leading-6 text-[#17202E]">
                        {error || source?.excerpts?.map((x) => x.text).join('\n\n') || 'Загружаем источник…'}
                    </div>
                    <div className="mt-4 flex justify-end border-t border-[#EEF0F3] bg-[#FAFBFC] px-6 py-3.5">
                        <a href={`/web/drive/editor/${citation.fileId}`} target="_blank" rel="noopener noreferrer" className="ts-button ts-button--secondary ts-button--compact no-underline"><ExternalLink className="h-4 w-4" strokeWidth={1.8} />Открыть документ в Drive</a>
                    </div>
                </section>
            </div>, document.body)}
    </>;
}
