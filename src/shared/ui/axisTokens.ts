/**
 * Токены брендбука UniteSpace v0.9 для раздела «Работа» (доски и канбан).
 * Цвет действия один — #2458D3. Статусные цвета не используются как цвета модулей.
 */
export const AXIS = {
  action: '#2458D3',
  actionHover: '#1D49B3',
  actionPressed: '#173B91',
  selection: '#EDF2FF',
  borderSubtle: '#E2E5EA',
  borderControl: '#7B8494',
  textPrimary: '#17202E',
  textSecondary: '#586174',
  bg: '#F6F7F9',
  surface: '#FFFFFF',
  success: { fg: '#16734B', bg: '#EDF8F1' },
  warning: { fg: '#946000', bg: '#FFF6E5' },
  error: { fg: '#C03437', bg: '#FFF0F0' },
  neutral: { fg: '#586174', bg: '#F1F2F4' },
} as const

export type AxisTone = 'action' | 'success' | 'warning' | 'error' | 'neutral'

export const AXIS_TONE_CLASS: Record<AxisTone, string> = {
  action: 'bg-[#EDF2FF] text-[#2458D3]',
  success: 'bg-[#EDF8F1] text-[#16734B]',
  warning: 'bg-[#FFF6E5] text-[#946000]',
  error: 'bg-[#FFF0F0] text-[#C03437]',
  neutral: 'bg-[#F1F2F4] text-[#586174]',
}

const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ts-action)]'

/** Compatibility names for Board, People and CRM; all use the application UI. */
export const AXIS_UI = {
  focus,
  primaryButton: 'ts-button ts-button--primary',
  secondaryButton: 'ts-button ts-button--secondary ts-button--compact',
  secondaryButtonActive: 'ts-button ts-button--active ts-button--compact',
  iconButton: 'ts-button ts-button--secondary ts-button--icon',
  ghostIconButton: 'ts-button ts-button--ghost ts-button--icon',
  inputShell: 'flex h-9 min-w-0 items-center gap-2 rounded-[var(--ts-radius-control)] border border-[var(--ts-border)] bg-white px-3 transition-colors hover:border-[var(--ts-border-hover)] focus-within:border-[var(--ts-action)] focus-within:shadow-[var(--ts-focus)]',
  input: 'h-full w-full min-w-0 border-none bg-transparent text-[14px] text-[var(--ts-text)] outline-none placeholder:text-[var(--ts-text-muted)]',
  panel: 'ts-panel',
  h1: 'ts-page-title',
  h3: 'text-[18px] font-semibold leading-[26px] text-[var(--ts-text)]',
  body: 'text-[14px] leading-5 text-[var(--ts-text)]',
  caption: 'text-[12px] leading-4 text-[var(--ts-text-secondary)]',
  countBadge: 'ts-count',
  tab: 'ts-tab',
  tabActive: 'ts-tab--active',
  tabIdle: '',
  fontFamily: '[font-family:var(--ts-font)]',
} as const

/** Цвета аватаров: бренд и графитовые оттенки, без случайной радуги */
export const AXIS_AVATAR_COLORS = ['#2458D3', '#17202E', '#1D49B3', '#586174', '#173B91'] as const

const DONE_COLUMN_KEYS = new Set(['DONE', 'COMPLETED', 'CLOSED'])

/** Колонка «Готово» по ключу колонки */
export const isDoneColumn = (key: string): boolean =>
  DONE_COLUMN_KEYS.has(key.trim().toUpperCase().replace(/[\s-]+/g, '_'))
