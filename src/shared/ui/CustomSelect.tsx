import { useEffect, useMemo, useRef, useState } from 'react'
import MaterialSymbol from './MaterialSymbol'
import { useTranslation } from 'react-i18next'

export type CustomSelectOption = string | {
  value: string
  label: string
  depth?: number
  parentValue?: string
  title?: string
}

type CustomSelectProps = {
  label: string
  value: string
  options: readonly CustomSelectOption[]
  disabled?: boolean
  /** Подпись для «пустого» значения */
  emptyLabel?: string
  /** false — без пункта «пустое значение» (когда нужно выбрать ровно одно) */
  allowEmpty?: boolean
  searchable?: boolean
  searchPlaceholder?: string
  tree?: boolean
  /** compact — кнопка-селектор для тулбара: подпись внутри кнопки, без заголовка над полем */
  variant?: 'default' | 'compact'
  onChange: (next: string) => void
}

function getOptionValue(option: CustomSelectOption): string {
  return typeof option === 'string' ? option : option.value
}

function getOptionLabel(option: CustomSelectOption): string {
  return typeof option === 'string' ? option : option.label
}

function getOptionDepth(option: CustomSelectOption): number {
  return typeof option === 'string' ? 0 : option.depth ?? 0
}

function getOptionParent(option: CustomSelectOption): string | undefined {
  return typeof option === 'string' ? undefined : option.parentValue
}

function getOptionTitle(option: CustomSelectOption): string {
  return typeof option === 'string' ? option : option.title ?? option.label
}

/**
 * Выпадающий список без нативного <select>: ограниченная высота списка, скролл и встроенный поиск.
 */
export default function CustomSelect({
  label,
  value,
  options,
  disabled,
  emptyLabel: emptyLabelProp,
  allowEmpty = true,
  searchable = true,
  searchPlaceholder: searchPlaceholderProp,
  tree = false,
  variant = 'default',
  onChange,
}: CustomSelectProps) {
  const { t } = useTranslation()
  const emptyLabel = emptyLabelProp ?? t('select.all')
  const searchPlaceholder = searchPlaceholderProp ?? t('select.search')
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedValues, setExpandedValues] = useState<Set<string>>(new Set())
  const rootRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      setSearchQuery('')
      return
    }

    if (searchable) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [open, searchable])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const selectedOption = options.find((option) => getOptionValue(option) === value)
  const showText = selectedOption ? getOptionTitle(selectedOption) : value || emptyLabel
  const buttonDisplay = showText.length > 40 ? `${showText.slice(0, 38)}…` : showText

  const trimmedQuery = searchQuery.trim().toLowerCase()
  const filteredOptions = useMemo(() => {
    if (!trimmedQuery) return options
    return options.filter((opt) => getOptionTitle(opt).toLowerCase().includes(trimmedQuery))
  }, [options, trimmedQuery])

  const visibleOptions = useMemo(() => {
    if (!tree || trimmedQuery) return filteredOptions
    const byValue = new Map(filteredOptions.map((option) => [getOptionValue(option), option]))
    return filteredOptions.filter((option) => {
      let parent = getOptionParent(option)
      while (parent) {
        if (!expandedValues.has(parent)) return false
        parent = getOptionParent(byValue.get(parent) ?? '')
      }
      return true
    })
  }, [expandedValues, filteredOptions, tree, trimmedQuery])

  const showEmptyOption = allowEmpty && (!trimmedQuery || emptyLabel.toLowerCase().includes(trimmedQuery))
  const isCompact = variant === 'compact'
  const isActiveCompact = isCompact && Boolean(value)
  const compactText = selectedOption ? getOptionLabel(selectedOption) : value || label

  return (
    <div ref={rootRef} className={`relative flex min-w-0 flex-col gap-1 ${isCompact ? 'shrink-0' : ''}`}>
      <span className={isCompact ? 'sr-only' : 'text-[12px] font-semibold text-[#8497B4]'}>{label}</span>
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          if (!disabled) setOpen((o) => !o)
        }}
        className={
          isCompact
            ? `flex h-9 max-w-[240px] shrink-0 items-center justify-between gap-2 rounded-[var(--ts-radius-control)] border px-3 text-left text-[14px] font-medium shadow-[0_1px_2px_rgba(23,32,46,0.04)] outline-none transition-colors duration-[120ms] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2458D3] disabled:cursor-not-allowed disabled:opacity-50 ${
                isActiveCompact
                  ? 'border-[#2458D3] bg-[#EDF2FF] text-[#2458D3]'
                  : 'border-[var(--ts-border)] bg-white text-[#17202E] hover:border-[var(--ts-border-hover)] hover:bg-[#F6F7F9]'
              }`
            : 'flex h-[38px] w-full items-center justify-between gap-2 rounded-xl border border-[#E8EDF5] bg-[#FAFBFD] py-0 pl-2.5 pr-2 text-left text-[13px] text-[#0A1628] outline-none transition hover:border-[#C5D8EE] focus-visible:border-[#B9D4F5] focus-visible:ring-2 focus-visible:ring-[#2458D3]/25 disabled:cursor-not-allowed disabled:opacity-50'
        }
      >
        <span className="min-w-0 truncate">
          {isCompact ? compactText : buttonDisplay}
        </span>
        <MaterialSymbol
          name="expand_more"
          size={isCompact ? 16 : 20}
          color={isCompact ? 'currentColor' : '#6B7F99'}
          className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <div
          className={`absolute top-[calc(100%+4px)] z-[80] flex max-h-[min(340px,55vh)] flex-col overflow-hidden rounded-[8px] border border-[#E2E5EA] bg-white shadow-[0_8px_24px_rgba(23,32,46,0.12)] [font-family:Inter,sans-serif] ${isCompact ? 'right-0 w-[280px] max-w-[calc(100vw-32px)]' : 'left-0 right-0'}`}
        >
          {searchable ? (
            <div className="relative shrink-0 border-b border-[#E2E5EA] p-2">
              <span className="pointer-events-none absolute inset-y-0 left-5 flex items-center text-[#586174]">
                <MaterialSymbol name="search" size={16} color="currentColor" />
              </span>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="h-9 w-full rounded-[6px] border border-[#E2E5EA] bg-white pl-9 pr-8 text-[14px] text-[#17202E] outline-none transition-colors duration-[120ms] placeholder:text-[#586174] focus:border-[#2458D3]"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('')
                    searchInputRef.current?.focus()
                  }}
                  className="absolute inset-y-0 right-4 flex items-center text-[#586174] hover:text-[#17202E]"
                  aria-label={t('select.clearSearch')}
                >
                  <MaterialSymbol name="close" size={14} color="currentColor" />
                </button>
              ) : null}
            </div>
          ) : null}

          <ul role="listbox" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
            {showEmptyOption ? (
              <li role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={!value}
                  onClick={() => {
                    onChange('')
                    setOpen(false)
                  }}
                  className={`flex min-h-9 w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[14px] leading-5 transition-colors duration-[120ms] ${
                    !value ? 'bg-[#EDF2FF] font-medium text-[#2458D3]' : 'text-[#17202E] hover:bg-[#F6F7F9]'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{emptyLabel}</span>
                  {!value ? <MaterialSymbol name="check" size={16} color="currentColor" className="shrink-0" /> : null}
                </button>
              </li>
            ) : null}

            {visibleOptions.map((opt) => {
              const selected = value === getOptionValue(opt)
              const optValue = getOptionValue(opt)
              const hasChildren = tree && options.some((child) => getOptionParent(child) === optValue)
              const expanded = expandedValues.has(optValue)
              const depth = tree && !trimmedQuery ? getOptionDepth(opt) : 0
              return (
                <li key={optValue} role="presentation" className="flex items-center gap-0.5" style={{ paddingLeft: depth * 16 }}>
                  {tree && hasChildren ? (
                    <button
                      type="button"
                      aria-label={expanded ? t('select.collapseGroup') : t('select.expandGroup')}
                      aria-expanded={expanded}
                      onClick={() => setExpandedValues((current) => {
                        const next = new Set(current)
                        if (next.has(optValue)) next.delete(optValue)
                        else next.add(optValue)
                        return next
                      })}
                      className="flex h-7 w-6 shrink-0 items-center justify-center rounded-[4px] text-[#586174] hover:bg-[#F1F2F4] hover:text-[#17202E]"
                    >
                      <MaterialSymbol name={expanded ? 'expand_more' : 'chevron_right'} size={16} color="currentColor" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(optValue)
                      setOpen(false)
                    }}
                    className={`flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[14px] leading-5 transition-colors duration-[120ms] ${
                      selected ? 'bg-[#EDF2FF] font-medium text-[#2458D3]' : 'text-[#17202E] hover:bg-[#F6F7F9]'
                    }`}
                  >
                    <span className="min-w-0 flex-1 break-words">{trimmedQuery ? getOptionTitle(opt) : getOptionLabel(opt)}</span>
                    {selected ? <MaterialSymbol name="check" size={16} color="currentColor" className="shrink-0" /> : null}
                  </button>
                </li>
              )
            })}

            {!showEmptyOption && visibleOptions.length === 0 ? (
              <li className="px-3 py-4 text-center text-[14px] text-[#586174]">{t('status.empty')}</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
