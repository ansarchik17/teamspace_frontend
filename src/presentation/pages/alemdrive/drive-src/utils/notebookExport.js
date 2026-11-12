import PptxGenJS from 'pptxgenjs';
import ExcelJS from 'exceljs';
import { citationFooter, getPresentationTheme, plainSlideText, slideBullets, slideLayout, slideParagraphs } from './presentationDesign';

const SLIDE_W = 10;
const MARGIN_X = 0.6;
const CONTENT_W = SLIDE_W - MARGIN_X * 2;
const FOOTER_Y = 5.08;

/** Слайд 16×9 в той же теме и раскладке, что и превью (utils/presentationDesign). */
function decoratePresentationSlide(slide, pptx, { index, total, title, body, deckTitle, theme }) {
    const registry = new Map();
    const layout = slideLayout({ title, body }, index, total);
    const { items, ordered } = slideBullets(body);
    const paragraphs = slideParagraphs(body);
    const plain = (text) => plainSlideText(text, registry);
    const isCover = layout === 'cover';

    slide.background = { color: theme.bg };
    if (theme.band) {
        slide.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: SLIDE_W, h: 0.09, fill: { color: theme.accent }, line: { type: 'none' } });
    }

    let y = isCover ? 1.05 : 0.42;
    if (index > 0 && deckTitle) {
        slide.addText(deckTitle.toUpperCase(), { x: MARGIN_X, y, w: CONTENT_W, h: 0.28, fontSize: 9, bold: true, color: theme.muted, charSpacing: 1, fit: 'shrink' });
        y += 0.3;
    }
    const titleH = isCover ? 0.9 : 0.72;
    slide.addText(title || ' ', { x: MARGIN_X, y, w: CONTENT_W, h: titleH, fontSize: isCover ? 32 : 24, bold: true, color: theme.text, valign: 'top', fit: 'shrink' });
    y += titleH + 0.05;
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: MARGIN_X, y, w: 0.6, h: 0.06, fill: { color: theme.accent }, line: { type: 'none' }, rectRadius: 0.03 });
    y += 0.28;
    const contentH = FOOTER_Y - 0.1 - y;

    if (layout === 'cards' && items.length <= 6) {
        const lead = paragraphs[0] ? plain(paragraphs[0]) : '';
        if (lead) {
            slide.addText(lead, { x: MARGIN_X, y, w: CONTENT_W, h: 0.5, fontSize: 13, color: theme.muted, valign: 'top', fit: 'shrink' });
            y += 0.58;
        }
        const rows = Math.ceil(items.length / 2);
        const gap = 0.16;
        const cardW = (CONTENT_W - gap) / 2;
        const cardH = Math.min(1.3, (FOOTER_Y - 0.1 - y - gap * (rows - 1)) / rows);
        items.forEach((item, i) => {
            const cx = MARGIN_X + (i % 2) * (cardW + gap);
            const cy = y + Math.floor(i / 2) * (cardH + gap);
            slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: cx, y: cy, w: cardW, h: cardH, fill: { color: theme.surface }, line: { color: theme.border, pt: 0.75 }, rectRadius: 0.08 });
            slide.addText([
                { text: `${String(i + 1).padStart(2, '0')}  `, options: { bold: true, color: theme.accent } },
                { text: plain(item), options: { color: theme.text } },
            ], { x: cx + 0.15, y: cy + 0.08, w: cardW - 0.3, h: cardH - 0.16, fontSize: 12, valign: 'middle', fit: 'shrink' });
        });
    } else if (layout === 'markdown') {
        slide.addText(stripMarkdownForPptx(plain(body)) || ' ', { x: MARGIN_X, y, w: CONTENT_W, h: contentH, fontSize: 13, color: theme.text, valign: 'top', fit: 'shrink', lineSpacingMultiple: 1.1 });
    } else {
        const runs = [];
        if (paragraphs[0]) runs.push({ text: plain(paragraphs[0]), options: { color: theme.muted, fontSize: isCover ? 16 : 14, breakLine: true, paraSpaceAfter: 10 } });
        const numbered = isCover || layout === 'steps' || ordered;
        items.forEach((item) => {
            runs.push({
                text: plain(item),
                options: { color: theme.text, breakLine: true, paraSpaceAfter: 6, bullet: numbered ? { type: 'number' } : { code: '25CF' } },
            });
        });
        paragraphs.slice(1).forEach((text) => runs.push({ text: plain(text), options: { color: theme.muted, breakLine: true, paraSpaceAfter: 6 } }));
        if (!runs.length) runs.push({ text: stripMarkdownForPptx(plain(body)) || ' ', options: { color: theme.text } });
        if (layout === 'summary') {
            slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: MARGIN_X, y, w: CONTENT_W, h: contentH, fill: { color: theme.accentSoft }, line: { type: 'none' }, rectRadius: 0.08 });
        }
        const inset = layout === 'summary' ? 0.25 : 0;
        slide.addText(runs, { x: MARGIN_X + inset, y: y + inset / 2, w: CONTENT_W - inset * 2, h: contentH - inset, fontSize: 14, valign: 'top', fit: 'shrink', lineSpacingMultiple: 1.1 });
    }

    if (registry.size) {
        slide.addText(citationFooter(registry), { x: MARGIN_X, y: FOOTER_Y, w: CONTENT_W - 0.9, h: 0.38, fontSize: 8, color: theme.muted, valign: 'top', fit: 'shrink' });
    }
    slide.addText(`${index + 1} / ${total}`, { x: SLIDE_W - MARGIN_X - 0.8, y: FOOTER_Y, w: 0.8, h: 0.3, fontSize: 9, color: theme.muted, align: 'right' });
}

/** Скачивание Blob в браузере */
export function triggerDownloadBlob(blob, filename) {
    const safe = String(filename || 'export').replace(/[/\\?%*:|"<>]/g, '-');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safe;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
}

/** Упрощённое снятие Markdown для текста слайда в PowerPoint */
export function stripMarkdownForPptx(md) {
    if (!md || typeof md !== 'string') return '';
    return md
        .replace(/\r\n/g, '\n')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/\[([^\]]+)\]\([^\s)]+\)/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/^[-*]\s+/gm, '• ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * @param {Array<{ title: string, body: string }>} slides
 * @param {string} [filename]
 * @param {string} [themeId] id from PRESENTATION_THEMES
 * @returns {Promise<Blob>}
 */
export async function buildPresentationPptxBlob(slides, filename, themeId) {
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';
    pptx.author = 'UniteSpace';
    pptx.title = slides?.[0]?.title || 'Deep Research Assistant';
    pptx.subject = filename || 'Презентация';
    const theme = getPresentationTheme(themeId);

    const n = slides?.length || 0;

    if (!n) {
        const slide = pptx.addSlide();
        slide.background = { color: theme.bg };
        slide.addText('Нет слайдов', { x: 0.5, y: 2, w: 9, fontSize: 18, color: theme.muted });
    } else {
        const deckTitle = slides[0]?.title || '';
        slides.forEach(({ title, body }, index) => {
            decoratePresentationSlide(pptx.addSlide(), pptx, { index, total: n, title: title || ' ', body: body || '', deckTitle, theme });
        });
    }

    return pptx.write('blob');
}

export async function exportPresentationToPptx(slides, filename = 'prezentatsiya.pptx', themeId) {
    const blob = await buildPresentationPptxBlob(slides, filename, themeId);
    triggerDownloadBlob(blob, filename);
}

const CSS_GRADIENT_RE = /gradient\s*\(/i;
/** Всё, что ломает парсер цветов/градиентов html2canvas */
const UNSAFE_CSS_RE = /oklab|oklch|color-mix|lab\(|lch\(|color\(srgb|gradient\s*\(/i;

function tryCanvasRgbFromCssValue(v) {
    if (typeof v !== 'string') return null;
    try {
        const c = document.createElement('canvas');
        c.width = c.height = 1;
        const ctx = c.getContext('2d');
        if (!ctx) return null;
        ctx.fillStyle = v;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        return `rgb(${d[0]}, ${d[1]}, ${d[2]})`;
    } catch {
        return null;
    }
}

/**
 * Любое значение свойства для клона: html2canvas не понимает oklab/oklch/градиенты в стопах.
 * Вызывается для каждого свойства из getComputedStyle.
 */
function sanitizeCssPropertyForHtml2Canvas(propName, raw) {
    const val = String(raw ?? '').trim();
    if (!val) return '';

    if (!UNSAFE_CSS_RE.test(val)) return val;

    if (CSS_GRADIENT_RE.test(val) || /gradient/i.test(val)) {
        if (
            propName.includes('background') ||
            propName.includes('mask') ||
            propName.startsWith('border-image')
        ) {
            return 'none';
        }
    }

    if (
        propName === 'box-shadow' ||
        propName === 'text-shadow' ||
        propName === 'filter' ||
        propName === 'backdrop-filter'
    ) {
        return 'none';
    }

    if (propName === 'border' || /^border(-top|-right|-bottom|-left)?$/.test(propName)) {
        return '1px solid #e2e8f0';
    }

    const rgb = tryCanvasRgbFromCssValue(val);
    if (rgb && !UNSAFE_CSS_RE.test(rgb)) return rgb;

    if (propName === 'color' || propName.endsWith('-color') || propName === 'fill' || propName === 'stroke') {
        return '#334155';
    }
    if (propName === 'background-color') return '#ffffff';
    if (propName === 'outline' || propName === 'outline-color') return 'none';

    const coerced = coerceCssValueForHtml2Canvas(propName, val);
    if (typeof coerced === 'string' && coerced && !UNSAFE_CSS_RE.test(coerced)) return coerced;
    return '';
}

/**
 * Браузер может отдавать в getComputedStyle строки с oklab — html2canvas их не парсит.
 * Пытаемся свести к rgb через Canvas 2D или скрытый элемент; иначе обнуляем проблемное свойство.
 */
function coerceCssValueForHtml2Canvas(propName, raw) {
    if (typeof raw !== 'string') return raw;
    const v = raw.trim();
    if (!v || !UNSAFE_CSS_RE.test(v)) return v;

    const tryProbe = () => {
        try {
            const probe = document.createElement('div');
            probe.style.cssText =
                'position:fixed!important;left:-99999px!important;top:0!important;visibility:hidden!important;pointer-events:none!important;';
            probe.style.setProperty(propName, v);
            document.body.appendChild(probe);
            const out = getComputedStyle(probe).getPropertyValue(propName).trim();
            document.body.removeChild(probe);
            return UNSAFE_CSS_RE.test(out) ? null : out;
        } catch {
            return null;
        }
    };

    const solid = tryCanvasRgbFromCssValue(v) || tryProbe();
    if (solid) return solid;

    if (
        propName === 'box-shadow' ||
        propName === 'text-shadow' ||
        propName === 'filter' ||
        propName === 'backdrop-filter'
    ) {
        return 'none';
    }
    if (
        propName === 'background-image' ||
        propName === 'background' ||
        propName === '-webkit-background-image' ||
        propName === '-webkit-mask-image' ||
        propName === 'mask-image' ||
        propName === 'mask'
    ) {
        return 'none';
    }
    if (propName === 'color' || propName.endsWith('-color') || propName === 'fill' || propName === 'stroke') {
        return '#64748b';
    }
    return '';
}

/**
 * Имена свойств, которые читает CSSParsedDeclaration в html2canvas (getComputedStyle → parse).
 * Обход «источник + клон» по детям ломается на узлах html2canvaspseudoelement (::before/::after),
 * где copyCSSStyles копирует oklab в inline — парсер падает. Поэтому санитизируем всё поддерево клона.
 */
const HTML2CANVAS_STYLE_PROPS = [
    'animation-duration',
    'background-clip',
    'background-color',
    'background-image',
    'background-origin',
    'background-position',
    'background-repeat',
    'background-size',
    'border-top-color',
    'border-right-color',
    'border-bottom-color',
    'border-left-color',
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-right-radius',
    'border-bottom-left-radius',
    'border-top-style',
    'border-right-style',
    'border-bottom-style',
    'border-left-style',
    'border-top-width',
    'border-right-width',
    'border-bottom-width',
    'border-left-width',
    'box-shadow',
    'color',
    'direction',
    'display',
    'float',
    'font-family',
    'font-size',
    'font-style',
    'font-variant',
    'font-weight',
    'letter-spacing',
    'line-break',
    'line-height',
    'list-style-image',
    'list-style-position',
    'list-style-type',
    'margin-top',
    'margin-right',
    'margin-bottom',
    'margin-left',
    'opacity',
    'overflow',
    'overflow-wrap',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'paint-order',
    'position',
    'text-align',
    'text-decoration-color',
    'text-decoration-line',
    'text-decoration',
    'text-shadow',
    'text-transform',
    'transform',
    'transform-origin',
    'visibility',
    '-webkit-text-stroke-color',
    '-webkit-text-stroke-width',
    'word-break',
    'z-index',
];

function sanitizeHtml2CanvasCloneSubtree(cloneRoot) {
    const win = cloneRoot.ownerDocument?.defaultView;
    if (!win) return;
    const nodes = [cloneRoot, ...cloneRoot.querySelectorAll('*')];
    for (const el of nodes) {
        if (el.nodeType !== Node.ELEMENT_NODE) continue;
        const cs = win.getComputedStyle(el);
        for (const prop of HTML2CANVAS_STYLE_PROPS) {
            const raw = cs.getPropertyValue(prop);
            if (raw === undefined || raw === null) continue;
            const rawStr = String(raw).trim();
            if (rawStr === '') continue;
            const val = sanitizeCssPropertyForHtml2Canvas(prop, rawStr);
            try {
                if (val === '') {
                    el.style.removeProperty(prop);
                } else {
                    el.style.setProperty(prop, val, 'important');
                }
            } catch {
                /* ignore */
            }
        }
    }
}

/** SVG / атрибуты fill и stroke могут содержать oklab без участия CSSOM */
function sanitizeSvgAttributesOnClone(root) {
    root.querySelectorAll('svg, svg *').forEach((el) => {
        ['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color'].forEach((attr) => {
            const v = el.getAttribute(attr);
            if (v && UNSAFE_CSS_RE.test(v)) {
                el.setAttribute(attr, attr === 'stroke' ? 'none' : 'currentColor');
            }
        });
    });
}

/** После удаления таблиц стилей кастомные маркеры (Tailwind ::before) пропадают — включаем обычные. */
function restoreListMarkersForPdf(cloneRoot) {
    cloneRoot.querySelectorAll('ul > li').forEach((li) => {
        li.style.setProperty('list-style-type', 'disc', 'important');
        li.style.setProperty('list-style-position', 'outside', 'important');
        li.style.setProperty('padding-left', '0.35em', 'important');
        li.style.setProperty('margin-left', '1.1em', 'important');
    });
    cloneRoot.querySelectorAll('ol > li').forEach((li) => {
        li.style.setProperty('list-style-type', 'decimal', 'important');
        li.style.setProperty('list-style-position', 'outside', 'important');
        li.style.setProperty('padding-left', '0.35em', 'important');
        li.style.setProperty('margin-left', '1.1em', 'important');
    });
    cloneRoot.querySelectorAll('ul, ol').forEach((list) => {
        list.style.setProperty('list-style', 'inherit', 'important');
        list.style.setProperty('padding-left', '1.25em', 'important');
    });
}

/**
 * После удаления Tailwind в клоне остаётся «голый» текст. Вставляем тему только с #hex / rgb —
 * html2canvas это парсит; oklab в инжекте не используем.
 * Селекторы завязаны на data-* из PresentationSlidesView (NotebookLlmContent.jsx).
 */
const PDF_SLIDE_THEME_CSS = `
[data-pdf-slide-root] {
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
  color: #0f172a !important;
  background: linear-gradient(145deg, #ede9fe 0%, #ffffff 42%, #e0e7ff 100%) !important;
  border: 1px solid rgba(255, 255, 255, 0.9) !important;
  box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.15) !important;
}
[data-pdf-slide-root] p,
[data-pdf-slide-root] li,
[data-pdf-slide-root] span {
  font-family: inherit !important;
  color: #334155 !important;
  font-size: 15px !important;
  line-height: 1.65 !important;
}
[data-pdf-slide-root] strong {
  color: #0f172a !important;
  font-weight: 600 !important;
}
[data-pdf-slide-root] h1,
[data-pdf-slide-root] h2,
[data-pdf-slide-root] h3 {
  color: #0f172a !important;
  font-weight: 700 !important;
}
[data-pdf-slide-card] {
  background: rgba(255, 255, 255, 0.93) !important;
  border: 1px solid rgba(255, 255, 255, 0.75) !important;
  border-radius: 16px !important;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 1px 2px rgba(15, 23, 42, 0.06) !important;
}
[data-pdf-accent-bar] {
  background: linear-gradient(90deg, #4f46e5, #7c3aed, #db2777) !important;
  box-shadow: 0 1px 2px rgba(79, 70, 229, 0.35) !important;
}
[data-pdf-nav-strip] {
  display: none !important;
}
[data-pdf-slide-root] ul {
  list-style: disc outside !important;
  padding-left: 1.25em !important;
  margin: 0.5em 0 !important;
}
[data-pdf-slide-root] ol {
  list-style: decimal outside !important;
  padding-left: 1.35em !important;
  margin: 0.5em 0 !important;
}
[data-pdf-slide-root] ul > li::before,
[data-pdf-slide-root] ul > li::after {
  content: none !important;
  display: none !important;
}
`;

function injectPdfSlidePresentationCss(clonedDoc) {
    if (!clonedDoc?.head) return;
    const style = clonedDoc.createElement('style');
    style.setAttribute('data-pdf-injected-theme', 'true');
    style.textContent = PDF_SLIDE_THEME_CSS;
    clonedDoc.head.appendChild(style);
}

function stripStylesheetsFromClone(clonedDoc) {
    clonedDoc.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => node.remove());
}

/** Классы Tailwind могут тянуть oklab через оставшиеся правила; оставляем только inline после копирования. */
function stripClassNamesFromClone(root) {
    root.removeAttribute('class');
    root.querySelectorAll('*').forEach((el) => {
        el.removeAttribute('class');
    });
}

/** Фон html/body в клоне может быть в oklab — parseBackgroundColor в html2canvas тоже падает или даёт сбой. */
function forceRgbPageBackgroundInClone(clonedDoc) {
    const html = clonedDoc.documentElement;
    const body = clonedDoc.body;
    if (html) {
        html.style.setProperty('background-color', '#ffffff', 'important');
        html.style.setProperty('background', '#ffffff', 'important');
    }
    if (body) {
        body.style.setProperty('background-color', '#ffffff', 'important');
        body.style.setProperty('background', '#ffffff', 'important');
    }
}

/**
 * PDF: каждый слайд — скриншот превью в DOM (как на экране), кириллица и оформление сохраняются.
 *
 * @param {HTMLElement} slideEl — корневой блок одного слайда (превью 16:10)
 * @param {number} slideCount
 * @param {(index: number) => Promise<void>} gotoSlide — переключить индекс и дождаться отрисовки
 * @returns {Promise<Blob>}
 */
export async function buildPresentationPdfBlob(slideEl, slideCount, gotoSlide) {
    if (!slideEl || !slideCount) {
        throw new Error('Нет данных для PDF');
    }

    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
    ]);

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    for (let i = 0; i < slideCount; i++) {
        await gotoSlide(i);

        const canvas = await html2canvas(slideEl, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            logging: false,
            backgroundColor: '#ffffff',
            windowWidth: slideEl.scrollWidth,
            windowHeight: slideEl.scrollHeight,
            // foreignObjectRendering даёт часто пустой/белый растр при SVG→img (пустые страницы PDF).
            foreignObjectRendering: false,
            onclone: (clonedDoc, clonedEl) => {
                stripStylesheetsFromClone(clonedDoc);
                stripClassNamesFromClone(clonedEl);
                injectPdfSlidePresentationCss(clonedDoc);
                forceRgbPageBackgroundInClone(clonedDoc);
                sanitizeHtml2CanvasCloneSubtree(clonedEl);
                sanitizeSvgAttributesOnClone(clonedEl);
                restoreListMarkersForPdf(clonedEl);
            },
        });

        const cw = canvas.width;
        const ch = canvas.height;
        const imgAspect = ch / cw;
        let w = pageW;
        let h = pageW * imgAspect;
        if (h > pageH) {
            h = pageH;
            w = pageH / imgAspect;
        }
        const x = (pageW - w) / 2;
        const y = (pageH - h) / 2;

        if (i > 0) {
            pdf.addPage();
        }
        pdf.addImage(canvas, 'PNG', x, y, w, h, undefined, 'FAST');
    }

    return pdf.output('blob');
}

export async function exportPresentationToPdf(slideEl, slideCount, gotoSlide, filename = 'prezentatsiya.pdf') {
    const blob = await buildPresentationPdfBlob(slideEl, slideCount, gotoSlide);
    triggerDownloadBlob(blob, filename);
}

/**
 * Данные для PptxGenJS из нормализованной спеки графика (как в NotebookLlmContent).
 */
function normalizedToPptxChartData(normalized) {
    if (normalized.kind === 'pie') {
        const nk = normalized.nameKey;
        const vk = normalized.valueKey;
        return [
            {
                name: normalized.title || 'Данные',
                labels: normalized.data.map((d) => String(d[nk] ?? '')),
                values: normalized.data.map((d) => Number(d[vk]) || 0),
            },
        ];
    }
    const { xKey, series, data } = normalized;
    return series.map((s) => ({
        name: String(s.name || s.key),
        labels: data.map((row) => String(row[xKey] ?? '')),
        values: data.map((row) => Number(row[s.key]) || 0),
    }));
}

/** Строки для slide.addTable — Keynote часто не рисует диаграммы из PptxGenJS, таблица всегда видна. */
function normalizedToPptxTableRows(normalized) {
    if (normalized.kind === 'pie') {
        const nk = normalized.nameKey;
        const vk = normalized.valueKey;
        const header = [
            { text: String(nk), options: { bold: true, color: '1e293b' } },
            { text: String(vk), options: { bold: true, color: '1e293b' } },
        ];
        const body = normalized.data.map((d) => [
            String(d[nk] ?? ''),
            String(d[vk] ?? ''),
        ]);
        return [header, ...body];
    }
    const { xKey, series, data } = normalized;
    const keys = [xKey, ...series.map((s) => s.key)];
    const header = keys.map((k) => ({
        text: String(k),
        options: { bold: true, color: '1e293b' },
    }));
    const body = data.map((row) => keys.map((k) => String(row[k] ?? '')));
    return [header, ...body];
}

/**
 * @returns {Promise<Blob>}
 */
export async function buildChartPptxBlob(normalized) {
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';
    pptx.author = 'UniteSpace';
    pptx.title = 'Deep Research Assistant';

    const slide = pptx.addSlide();
    if (normalized.title) {
        slide.addText(String(normalized.title), {
            x: 0.5,
            y: 0.25,
            w: 9,
            h: 0.55,
            fontSize: 20,
            bold: true,
            color: '1e293b',
        });
    }

    const chartData = normalizedToPptxChartData(normalized);
    const chartType =
        normalized.kind === 'line'
            ? pptx.ChartType.line
            : normalized.kind === 'pie'
              ? pptx.ChartType.pie
              : pptx.ChartType.bar;

    slide.addChart(chartType, chartData, {
        x: 0.5,
        y: normalized.title ? 0.95 : 0.5,
        w: 9,
        h: 4.35,
        showLegend: true,
        showTitle: false,
        // Встроенная таблица у диаграммы — частично помогает в PowerPoint; в Keynote диаграмма может быть пустой.
        showDataTable: normalized.kind !== 'pie',
        showDataTableKeys: true,
    });

    const tableRows = normalizedToPptxTableRows(normalized);
    const colCount = tableRows[0]?.length || 1;
    const colW = Array(colCount).fill(9 / colCount);

    const dataSlide = pptx.addSlide();
    dataSlide.addText('Исходные данные', {
        x: 0.5,
        y: 0.35,
        w: 9,
        h: 0.55,
        fontSize: 20,
        bold: true,
        color: '1e293b',
    });
    dataSlide.addText(
        'Если диаграмма на первом слайде не отображается (например, в Apple Keynote), используйте эту таблицу или откройте файл в Microsoft PowerPoint / Google Slides.',
        {
            x: 0.5,
            y: 0.88,
            w: 9,
            h: 0.55,
            fontSize: 10,
            color: '64748b',
            italic: true,
        },
    );
    dataSlide.addTable(tableRows, {
        x: 0.5,
        y: 1.45,
        w: 9,
        colW,
        fontSize: 11,
        color: '334155',
        border: { type: 'solid', color: 'e2e8f0', pt: 0.5 },
        autoPage: true,
        autoPageRepeatHeader: true,
        autoPageHeaderRows: 1,
    });

    const blob = await pptx.write('blob');
    return blob;
}

export async function exportChartToPptx(normalized, filename = 'grafik.pptx') {
    const blob = await buildChartPptxBlob(normalized);
    triggerDownloadBlob(blob, filename);
}

/**
 * Таблица исходных данных графика в Excel
 * @returns {Promise<Blob>}
 */
export async function buildChartXlsxBlob(normalized) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Данные', {
        views: [{ state: 'frozen', ySplit: 1 }],
    });

    if (normalized.kind === 'pie') {
        const nk = normalized.nameKey;
        const vk = normalized.valueKey;
        ws.addRow([nk, vk]);
        normalized.data.forEach((row) => ws.addRow([row[nk], row[vk]]));
    } else {
        const { xKey, series, data } = normalized;
        const keys = [xKey, ...series.map((s) => s.key)];
        ws.addRow(keys);
        data.forEach((row) => {
            ws.addRow(keys.map((k) => row[k]));
        });
    }

    ws.getRow(1).font = { bold: true };
    const buffer = await wb.xlsx.writeBuffer();
    return new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
}

export async function exportChartToXlsx(normalized, filename = 'grafik.xlsx') {
    const blob = await buildChartXlsxBlob(normalized);
    triggerDownloadBlob(blob, filename);
}
