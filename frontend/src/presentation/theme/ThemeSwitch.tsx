import type { KeyboardEvent, ReactElement } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import type { ThemePreference } from '../../application/theme/themePreference'
import { joinClassNames } from '../design/classNames'
import { useTheme } from './ThemeContext'

const options: readonly { readonly value: ThemePreference; readonly label: string; readonly icon: ReactElement }[] = [
  { value: 'light', label: 'Light', icon: <Sun className="h-4 w-4" aria-hidden="true" /> },
  { value: 'dark', label: 'Dark', icon: <Moon className="h-4 w-4" aria-hidden="true" /> },
  { value: 'auto', label: 'Auto', icon: <Monitor className="h-4 w-4" aria-hidden="true" /> },
]

/** Light / Dark / Auto, as a radio group so screen readers announce the current choice. Remembered per device. */
export function ThemeSwitch({ className }: { readonly className?: string }): ReactElement {
  const { preference, setPreference } = useTheme()
  // Radio group keyboard rules: Tab reaches the chosen option; arrow keys move and choose.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (step === 0) {
      return
    }
    event.preventDefault()
    const current = options.findIndex((option) => option.value === preference)
    const next = (current + step + options.length) % options.length
    const nextOption = options.at(next)
    if (nextOption === undefined) {
      return
    }
    setPreference(nextOption.value)
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]').item(next).focus()
  }
  return (
    <div role="radiogroup" aria-label="Appearance" onKeyDown={onKeyDown}
      className={joinClassNames('inline-flex rounded-full border border-[var(--color-card-border)] bg-[var(--color-surface-muted)] p-0.5', className)}>
      {options.map((option) => {
        const isSelected = option.value === preference
        return (
          <button key={option.value} type="button" role="radio" aria-checked={isSelected} tabIndex={isSelected ? 0 : -1}
            onClick={(): void => { setPreference(option.value) }}
            className={joinClassNames(
              'inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors',
              isSelected
                ? 'bg-[var(--color-card)] text-[var(--color-ink-900)] shadow-[var(--shadow-card)]'
                : 'text-[var(--color-ink-500)] hover:text-[var(--color-ink-900)]',
            )}>
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
