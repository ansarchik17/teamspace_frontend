import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { UIEvent } from 'react'
import MaterialSymbol from './MaterialSymbol'
import { useTranslation } from 'react-i18next'

export interface AppSelectOption {
  label: string
  value: string
  disabled?: boolean
  description?: string
  image?: string
  avatarBg?: string
  avatarColor?: string
}

interface AppSelectProps {
  value: string
  options: AppSelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  buttonClassName?: string
  menuClassName?: string
  ariaLabel?: string
  searchable?: boolean
  searchPlaceholder?: string
  onSearchChange?: (value: string) => void
  multiple?: boolean
  selectedValues?: string[]
  onSelectedValuesChange?: (values: string[]) => void
  closeOnSelect?: boolean
  selectedSummaryText?: (options: AppSelectOption[]) => string
  showButtonAvatar?: boolean
  showOptionAvatar?: boolean
  onMenuScrollEnd?: () => void
  loadingMore?: boolean
  hasMore?: boolean
  loadingMoreText?: string
  portal?: boolean
}

function OptionAvatar({
  name,
  image,
  identity,
  avatarBg,
  avatarColor,
}: {
  name: string
  image?: string
  identity?: string
  avatarBg?: string
  avatarColor?: string
}) {
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [image])

  const initials = name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .join('')
    .toUpperCase()
    .slice(0, 2)

  if (!initials) return null

  if (image && !imageFailed) {
    return (
      <img
        src={image}
        alt={name}
        className="h-6 w-6 shrink-0 rounded-full object-cover"
        onError={() => setImageFailed(true)}
      />
    )
  }

  if (avatarBg || avatarColor) {
    return (
      <div
        style={{ backgroundColor: avatarBg, color: avatarColor }}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
      >
        {initials}
      </div>
    )
  }

  if (identity) {
    const palette = [
      ['#E9F0FF', '#1765FF'],
      ['#F3E8FF', '#7C3AED'],
      ['#E5F7EE', '#16895A'],
      ['#FFF2DE', '#C46900'],
      ['#FDE9EF', '#C2305B'],
      ['#E7F6F7', '#087D86'],
    ] as const
    const hash = Array.from(identity).reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 0)
    const [backgroundColor, color] = palette[hash % palette.length]

    return (
      <div
        style={{ backgroundColor, color }}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
      >
        {initials}
      </div>
    )
  }

  // Automatic heuristics based on standard project status names
  let bgStyle = 'bg-[#EEF2FF]'
  let textStyle = 'text-[#2458D3]'

  const upperName = name.toUpperCase()
  if (upperName.includes('ГОТОВО') || upperName === 'Г' || upperName === 'DONE') { // i18n-ignore: matches status names from data
    bgStyle = 'bg-[#E2FBE9]'
    textStyle = 'text-[#0E9F6E]'
  } else if (upperName.includes('НА ПРОВЕРКЕ') || upperName === 'НП' || upperName === 'TEST') { // i18n-ignore
    bgStyle = 'bg-[#FEF3C7]'
    textStyle = 'text-[#D97706]'
  } else if (upperName.includes('К ВЫПОЛНЕНИЮ') || upperName === 'КВ' || upperName === 'TODO') { // i18n-ignore
    bgStyle = 'bg-[#F1F3F5]'
    textStyle = 'text-[#495057]'
  }

  return (
    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${bgStyle} ${textStyle}`}>
      {initials}
    </div>
  )
}

export default function AppSelect({
  value,
  options,
  onChange,
  placeholder: placeholderProp,
  disabled = false,
  className = '',
  buttonClassName = '',
  menuClassName = '',
  ariaLabel,
  searchable = false,
  searchPlaceholder: searchPlaceholderProp,
  onSearchChange,
  multiple = false,
  selectedValues,
  onSelectedValuesChange,
  closeOnSelect,
  selectedSummaryText,
  showButtonAvatar = true,
  showOptionAvatar = true,
  onMenuScrollEnd,
  loadingMore = false,
  hasMore = false,
  loadingMoreText: loadingMoreTextProp,
  portal = false,
}: AppSelectProps) {
  const { t } = useTranslation()
  const placeholder = placeholderProp ?? t('select.placeholder')
  const searchPlaceholder = searchPlaceholderProp ?? t('select.search')
  const loadingMoreText = loadingMoreTextProp ?? t('status.loading')
  const rootRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const isMultiple = multiple && Array.isArray(selectedValues) && typeof onSelectedValuesChange === 'function'

  const selected = useMemo(() => options.find((option) => option.value === value), [options, value])
  const selectedSet = useMemo(() => new Set(selectedValues ?? []), [selectedValues])
  const selectedOptions = useMemo(
    () => options.filter((option) => selectedSet.has(option.value)),
    [options, selectedSet],
  )
  const shouldCloseOnSelect = closeOnSelect ?? !isMultiple

  const filteredOptions = useMemo(() => {
    if (!searchable) return options
    const query = search.trim().toLowerCase()
    if (!query) return options

    return options.filter((option) => {
      const label = option.label.toLowerCase()
      const optionValue = option.value.toLowerCase()
      return label.includes(query) || optionValue.includes(query)
    })
  }, [options, search, searchable])

  const closeMenu = () => {
    setOpen(false)
    setSearch('')
    onSearchChange?.('')
  }

  const handleMenuScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!onMenuScrollEnd || loadingMore || !hasMore) return
    const target = event.currentTarget
    if (target.scrollTop + target.clientHeight >= target.scrollHeight - 24) {
      onMenuScrollEnd()
    }
  }

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!rootRef.current) return
      if (menuRef.current?.contains(event.target as Node)) return
      if (!rootRef.current.contains(event.target as Node)) {
        closeMenu()
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeMenu()
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  useLayoutEffect(() => {
    if (!portal || !open) return
    const place = () => {
      const rect = rootRef.current?.getBoundingClientRect()
      if (!rect) return
      const height = menuRef.current?.offsetHeight ?? 0
      const below = rect.bottom + 4
      const top = below + height > window.innerHeight - 8 && rect.top - 4 - height > 8 ? rect.top - 4 - height : below
      setMenuPosition({ top, left: rect.left, width: rect.width })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, portal, filteredOptions.length])

  const menuElement = (
    <div
      ref={menuRef}
      role="listbox"
      aria-multiselectable={isMultiple || undefined}
      style={portal ? { top: menuPosition?.top ?? 0, left: menuPosition?.left ?? 0, minWidth: menuPosition?.width, visibility: menuPosition ? 'visible' : 'hidden' } : undefined}
      className={`${portal ? 'fixed z-[2100]' : 'absolute left-0 top-[calc(100%+4px)] z-[1200]'} flex max-h-72 w-max min-w-full max-w-[min(320px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg bg-white py-1.5 shadow-[0_1px_2px_rgba(60,64,67,0.3),0_2px_6px_2px_rgba(60,64,67,0.15)] ${portal ? '' : 'animate-in fade-in duration-100'} ${menuClassName}`}
    >
      {searchable ? (
        <div className="mb-1.5 border-b border-[#E8EAED] px-2 pb-1.5">
          <div className="flex h-9 items-center gap-2 rounded-md bg-[#F1F3F4] px-3 transition-colors focus-within:bg-white focus-within:shadow-[inset_0_0_0_2px_#1A73E8]">
            <MaterialSymbol name="search" size={16} color="#5F6368" />
            <input
              autoFocus
              value={search}
              onChange={(event) => { const nextValue = event.target.value; setSearch(nextValue); onSearchChange?.(nextValue) }}
              placeholder={searchPlaceholder}
              className="h-full w-full border-none bg-transparent text-[14px] text-[#1F1F1F] outline-none placeholder:text-[#5F6368]"
            />
          </div>
        </div>
      ) : null}

      <div className="flex-1 overflow-auto custom-scrollbar" onScroll={handleMenuScroll}>
        {filteredOptions.length ? (
          <>
          {filteredOptions.map((option) => {
            const isActive = isMultiple ? selectedSet.has(option.value) : option.value === value
            const isSpecial = option.value === '' // placeholder option

            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isActive}
                disabled={option.disabled}
                onClick={() => {
                  if (option.disabled) return
                  if (isMultiple) {
                    const nextValues = isActive
                      ? (selectedValues ?? []).filter((selectedValue) => selectedValue !== option.value)
                      : [...(selectedValues ?? []), option.value]
                    onSelectedValuesChange(nextValues)
                    if (shouldCloseOnSelect) {
                      closeMenu()
                    }
                    return
                  }
                  onChange(option.value)
                  if (shouldCloseOnSelect) {
                    closeMenu()
                  }
                }}
                className={`flex min-h-9 w-full items-center gap-3 px-4 py-1.5 text-left text-[14px] transition-colors ${
                  isActive && !isMultiple ? 'bg-[#E8F0FE] text-[#1967D2]' : 'text-[#1F1F1F] hover:bg-[#F1F3F4]'
                } ${option.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                {showOptionAvatar && !isSpecial && (
                  <OptionAvatar
                    name={option.label}
                    image={option.image}
                    identity={option.value}
                    avatarBg={option.avatarBg}
                    avatarColor={option.avatarColor}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-[14px] leading-5"
                    title={option.label}
                  >
                    {option.label}
                  </p>
                  {option.description && (
                    <p className={`truncate text-[12px] leading-4 ${isActive && !isMultiple ? 'text-[#1967D2]/80' : 'text-[#5F6368]'}`}>
                      {option.description}
                    </p>
                  )}
                </div>
                {isMultiple ? (
                  <div
                    className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[2px] border-2 transition-all ${
                      isActive ? 'border-[#1A73E8] bg-[#1A73E8]' : 'border-[#5F6368] bg-white'
                    }`}
                  >
                    {isActive ? <MaterialSymbol name="check" size={12} color="#fff" /> : null}
                  </div>
                ) : isActive ? <MaterialSymbol name="check" size={18} color="#1967D2" /> : null}
              </button>
            )
          })}
          {loadingMore ? (
            <div className="px-4 py-2 text-[13px] text-[#5F6368]">
              {loadingMoreText}
            </div>
          ) : null}
          </>
        ) : (
          <p className="px-4 py-2 text-[14px] text-[#5F6368]">{t('status.empty')}</p>
        )}
      </div>
    </div>
  )

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen((prev) => {
            const next = !prev
            if (!next) {
              setSearch('')
              onSearchChange?.('')
            }
            return next
          })
        }}
        className={`flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-[#DDE3EE] bg-[#F9FBFE] px-3 text-left text-sm text-[#0A1628] outline-none transition-all hover:border-[#C5D2E5] focus:ring-2 focus:ring-[#2458D3]/10 disabled:cursor-not-allowed disabled:opacity-60 ${buttonClassName} ${
          open ? 'border-[#2458D3] ring-2 ring-[#2458D3]/10' : ''
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {!isMultiple && selected && value && showButtonAvatar && (
            <OptionAvatar
              name={selected.label}
              image={selected.image}
              identity={selected.value}
              avatarBg={selected.avatarBg}
              avatarColor={selected.avatarColor}
            />
          )}
          <span
            className={`truncate ${
              isMultiple
                ? selectedOptions.length ? 'text-[#0A1628]' : 'text-[#8497B4]'
                : selected ? 'text-[#0A1628]' : 'text-[#8497B4]'
            }`}
          >
            {isMultiple
              ? selectedOptions.length
                ? selectedSummaryText
                  ? selectedSummaryText(selectedOptions)
                  : t('select.selected', { count: selectedOptions.length })
                : placeholder
              : selected?.label || placeholder}
          </span>
        </div>
        <MaterialSymbol
          name="expand_more"
          size={18}
          color="#64748B"
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 160ms cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </button>

      {open && !disabled ? (portal ? createPortal(menuElement, document.body) : menuElement) : null}
    </div>
  )
}
