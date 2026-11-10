import { useTranslation } from 'react-i18next'
import type { CalendarMode } from '../../view-models/CalendarViewModel'

interface CalendarModeSwitchProps {
  mode: CalendarMode
  onChange: (mode: CalendarMode) => void
  fullWidth?: boolean
}

const items: CalendarMode[] = ['day', 'week', 'month']

export default function CalendarModeSwitch({ mode, onChange, fullWidth = false }: CalendarModeSwitchProps) {
  const { t } = useTranslation('calendar')
  return (
    <div className={`${fullWidth ? 'flex w-full' : 'inline-flex'} h-9 items-center rounded-lg border border-[var(--ts-border)] bg-[var(--ts-surface-muted)] p-0.5`} role="group" aria-label={t('widgets.modes.label')}>
      {items.map((item) => {
        const active = item === mode

        return (
          <button
            key={item}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item)}
            className={[
              `flex h-[30px] items-center justify-center rounded-md px-3 text-sm font-medium transition ${fullWidth ? 'flex-1' : ''}`,
              active ? 'bg-[var(--ts-selection)] text-[var(--ts-action)]' : 'text-[var(--ts-text-secondary)] hover:bg-[var(--ts-bg)]',
            ].join(' ')}
          >
            {t(`widgets.modes.${item}`)}
          </button>
        )
      })}
    </div>
  )
}
