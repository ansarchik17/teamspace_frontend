import { i18n, formatDate, formatNumber } from '../../../../../shared/i18n';
import React, { useState } from 'react';
import clsx from 'clsx';
import { Check, Folder, Minus, Music, Play } from 'lucide-react';

// Reuse the same controls as Board, People and CRM.
export const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ts-action)]';
export const BUTTON_PRIMARY = 'ts-button ts-button--primary ts-button--compact';
export const BUTTON_SECONDARY = 'ts-button ts-button--secondary ts-button--compact';
export const BUTTON_SECONDARY_ACCENT = 'ts-button ts-button--secondary ts-button--compact text-[var(--ts-action)]';
export const ICON_BUTTON = 'ts-button ts-button--ghost ts-button--icon';

export const isFolderItem = (item) => item?.type === 'dir' || item?.type === 'folder' || item?.mime_type === 'application/x-directory';

export const getItemKind = (item) => {
    if (isFolderItem(item)) return 'folder';
    const name = String(item?.name || '').toLowerCase();
    const mime = String(item?.mime_type || '').toLowerCase();
    const ext = name.includes('.') ? name.split('.').pop() : '';
    if (['doc', 'docx', 'odt', 'rtf'].includes(ext) || mime.includes('wordprocessing')) return 'word';
    if (['xls', 'xlsx', 'csv', 'ods'].includes(ext) || mime.includes('spreadsheet')) return 'sheet';
    if (['ppt', 'pptx', 'odp'].includes(ext) || mime.includes('presentation')) return 'slides';
    if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
    if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic', 'heif', 'bmp'].includes(ext)) return 'image';
    if (mime.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'video';
    if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) return 'audio';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
    if (ext === 'txt' || mime.startsWith('text/')) return 'text';
    return 'file';
};

export const KIND_META = {
    folder: { label: 'Папка' },
    word: { label: 'Документ', badge: 'W', color: '#2B5FD9' },
    sheet: { label: 'Таблица', badge: 'X', color: '#1D7D4B' },
    slides: { label: 'Презентация', badge: 'P', color: '#D9572B' },
    pdf: { label: 'PDF', badge: 'PDF', color: '#C8312F' },
    image: { label: 'Изображение' },
    video: { label: 'Видео', color: '#5B4BC4' },
    audio: { label: 'Аудио', color: '#B45309' },
    archive: { label: 'Архив', badge: 'ZIP', color: '#586174' },
    text: { label: 'Текст', badge: 'T', color: '#586174' },
    file: { label: 'Файл', badge: '•', color: '#7B8494' },
};

const ImageGlyph = ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="1.5" y="3" width="21" height="18" rx="2.5" fill="#DDEBFF" />
        <circle cx="8" cy="9" r="2" fill="#F5B83D" />
        <path d="M1.5 17.5 8.2 12l4.3 3.6 3.4-2.8 6.6 5.2V18.5A2.5 2.5 0 0 1 20 21H4a2.5 2.5 0 0 1-2.5-2.5v-1Z" fill="#3FA56B" />
    </svg>
);

/** Colored file-type glyph. `size` is the outer box in px (20 dense, 24 list, 40+ previews). */
export const FileTypeIcon = ({ item, size = 24, className }) => {
    const kind = getItemKind(item);
    const meta = KIND_META[kind];

    const box = (content) => (
        <span aria-hidden="true" className={clsx('inline-flex shrink-0 items-center justify-center', className)} style={{ width: size, height: size }}>
            {content}
        </span>
    );

    if (kind === 'folder') {
        return box(<Folder style={{ width: size, height: size }} fill="#4A7EEA" stroke="#4A7EEA" strokeWidth={1.5} />);
    }
    if (kind === 'image') {
        return box(<ImageGlyph size={size} />);
    }

    const glyphSize = Math.round(size * 0.46);
    const badge = meta.badge || '';
    const fontSize = badge.length > 2 ? Math.round(size * 0.3) : badge.length > 1 ? Math.round(size * 0.34) : Math.round(size * 0.46);

    return box(
        <span
            className="inline-flex items-center justify-center font-semibold leading-none text-white"
            style={{ width: Math.round(size * 0.84), height: size, borderRadius: Math.max(3, Math.round(size / 8)), background: meta.color, fontSize }}
        >
            {kind === 'video' ? <Play style={{ width: glyphSize, height: glyphSize }} fill="currentColor" strokeWidth={0} />
                : kind === 'audio' ? <Music style={{ width: glyphSize, height: glyphSize }} strokeWidth={2} />
                    : badge}
        </span>
    );
};

export const getInitials = (value) => String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';

export const Avatar = ({ name, src, size = 24, className, ring = false }) => {
    const [failedSrc, setFailedSrc] = useState(null);
    return src && failedSrc !== src ? (
        <img
            src={src}
            alt=""
            title={name}
            onError={() => setFailedSrc(src)}
            className={clsx('shrink-0 rounded-full object-cover', ring && 'border-2 border-white', className)}
            style={{ width: size, height: size }}
        />
    ) : (
        <span
            title={name}
            className={clsx('inline-flex shrink-0 items-center justify-center rounded-full bg-[#EDF2FF] font-semibold text-[#2458D3]', ring && 'border-2 border-white', className)}
            style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.42)) }}
        >
            {getInitials(name)}
        </span>
    );
};

export const Checkbox = ({ checked, indeterminate = false, onChange, label, className }) => (
    <button
        type="button"
        role="checkbox"
        aria-checked={indeterminate ? 'mixed' : checked}
        aria-label={label}
        onClick={(event) => { event.stopPropagation(); onChange?.(event); }}
        onDoubleClick={(event) => event.stopPropagation()}
        className={clsx(
            'inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-[120ms]',
            checked || indeterminate ? 'border-[#2458D3] bg-[#2458D3] text-white' : 'border-[#7B8494] bg-white hover:border-[#2458D3]',
            FOCUS_RING,
            className,
        )}
    >
        {indeterminate ? <Minus className="h-3 w-3" strokeWidth={3} /> : checked ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
    </button>
);

export const pluralize = (count, forms) => {
    const n = Math.abs(count) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return forms[2];
    if (n1 > 1 && n1 < 5) return forms[1];
    if (n1 === 1) return forms[0];
    return forms[2];
};

const pad = (value) => String(value).padStart(2, '0');

export const getItemDate = (item) => item?.last_modified || item?.updated_at || item?.created_at || null;

export const formatModified = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const dayDiff = Math.round((startOfToday.getTime() - new Date(date).setHours(0, 0, 0, 0)) / 86400000);
    if (dayDiff === 0) return i18n.t('drive:time.today', { time });
    if (dayDiff === 1) return i18n.t('drive:time.yesterday', { time });
    return `${formatDate(date, { day: 'numeric', month: 'short', year: 'numeric' })}, ${time}`;
};

export const formatSize = (bytes) => {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return '—';
    const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
    const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    const scaled = value / Math.pow(1024, index);
    const digits = index === 0 || scaled >= 100 ? 0 : 1;
    return `${formatNumber(scaled, { maximumFractionDigits: digits })} ${units[index]}`;
};

export const getOwnerName = (item, user) => {
    if (item?.owner_fio) return item.owner_fio;
    if (item?.owner_name) return item.owner_name;
    if (user && item?.owner_id === user.id) {
        return `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.full_name || user.username || i18n.t('drive:owner.you');
    }
    return i18n.t('drive:owner.you');
};

export const getOwnerAvatar = (item, user) => (
    item?.owner_avatar_url || item?.owner_avatar || (user && item?.owner_id === user.id ? user.avatar_url : null) || null
);
