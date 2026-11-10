import MaterialSymbol from './MaterialSymbol'
import { useTranslation } from 'react-i18next'
import { AXIS_UI } from './axisTokens'

export interface ViewToggleOption<T extends string> {
  value: T
  icon: string
  label: string
}

interface ViewToggleProps<T extends string> {
  value: T
  options: ReadonlyArray<ViewToggleOption<T>>
  onChange: (value: T) => void
  ariaLabel?: string
}

const ITEM_WIDTH = 32

/** Переключатель вида: синяя подложка переезжает к выбранному варианту */
export default function ViewToggle<T extends string>({ value, options, onChange, ariaLabel }: ViewToggleProps<T>) {
  const { t } = useTranslation()
  const activeIndex = Math.max(0, options.findIndex((option) => option.value === value))

  return (
    <div
      className="relative inline-flex h-9 shrink-0 items-center rounded-[8px] border border-[#E2E5EA] bg-[#F1F2F4] p-0.5"
      role="group"
      aria-label={ariaLabel ?? t('view.label')}
    >
      <span
        aria-hidden
        className="absolute left-0.5 top-0.5 h-[30px] rounded-[6px] bg-[#2458D3] shadow-[0_1px_2px_rgba(23,32,46,0.2)] transition-transform duration-200 ease-out motion-reduce:transition-none"
        style={{ width: ITEM_WIDTH, transform: `translateX(${activeIndex * ITEM_WIDTH}px)` }}
      />
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            aria-label={option.label}
            title={option.label}
            className={`relative z-10 flex h-[30px] items-center justify-center rounded-[6px] transition-colors duration-200 ${AXIS_UI.focus} ${
              active ? 'text-white' : 'text-[#586174] hover:text-[#17202E]'
            }`}
            style={{ width: ITEM_WIDTH }}
          >
            <MaterialSymbol name={option.icon} size={16} color="currentColor" />
          </button>
        )
      })}
    </div>
  )
}
