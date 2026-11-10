import AppSelect, { type AppSelectOption } from '../../../shared/ui/AppSelect'

export type CrmSelectOption = AppSelectOption

const BUTTON = '!h-9 !rounded-[var(--ts-radius-control)] !border-[var(--ts-border)] !bg-white !text-[14px] !font-normal hover:!border-[var(--ts-border-hover)] focus-visible:!border-[var(--ts-action)]'

export default function CrmSelect({ value, options, onChange, placeholder, ariaLabel, disabled, required, searchable, multiple, values, onValuesChange, avatars = false, searchPlaceholder, onSearchChange, onMenuScrollEnd, hasMore, loadingMore, className = '', menuClassName = '' }: {
  value: string
  avatars?: boolean
  searchPlaceholder?: string
  onSearchChange?: (value: string) => void
  onMenuScrollEnd?: () => void
  hasMore?: boolean
  loadingMore?: boolean
  multiple?: boolean
  values?: string[]
  onValuesChange?: (values: string[]) => void
  options: CrmSelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel?: string
  disabled?: boolean
  required?: boolean
  searchable?: boolean
  className?: string
  menuClassName?: string
}) {
  return <div className={`relative min-w-0 ${className}`}>
    <AppSelect portal value={value} options={options} onChange={onChange} placeholder={placeholder} ariaLabel={ariaLabel} disabled={disabled}
      multiple={multiple} selectedValues={values} onSelectedValuesChange={onValuesChange}
      searchable={searchable ?? options.length > 8} searchPlaceholder={searchPlaceholder} onSearchChange={onSearchChange}
      onMenuScrollEnd={onMenuScrollEnd} hasMore={hasMore} loadingMore={loadingMore}
      showButtonAvatar={avatars} showOptionAvatar={avatars}
      buttonClassName={BUTTON} menuClassName={`!max-w-[min(420px,calc(100vw-32px))] ${menuClassName}`} />
    {required && <input tabIndex={-1} aria-hidden required value={multiple ? (values || []).join(',') : value} onChange={() => undefined}
      className="pointer-events-none absolute bottom-0 left-1/2 h-px w-px opacity-0" />}
  </div>
}
