import type { ReactElement } from 'react'
import { HardHat, Store, User } from 'lucide-react'
import type { SignUpRole } from '../../domain/models/AuthenticatedUser'
import { featureFlags } from '../../application/featureFlags'
import { joinClassNames } from '../../presentation/design/classNames'

interface RolePickerOption {
  readonly value: SignUpRole
  readonly title: string
  readonly description: string
  readonly icon: ReactElement
}

const rolePickerOptions: readonly RolePickerOption[] = [
  {
    value: 'customer',
    title: 'I need a wash',
    description: 'Book a professional car wash near you.',
    icon: <User className="h-5 w-5" />,
  },
  {
    value: 'owner',
    title: 'I own a car wash',
    description: 'Manage bookings, workers, and schedules.',
    icon: <Store className="h-5 w-5" />,
  },
  {
    value: 'worker',
    title: 'I want car wash work',
    description: 'Create a worker profile and link to a shop roster.',
    icon: <HardHat className="h-5 w-5" />,
  },
]

// Owner sign-up is a B2B feature. Hiding it is a release choice, not authorization.
const visibleRolePickerOptions = featureFlags.isB2bEnabled
  ? rolePickerOptions
  : rolePickerOptions
      .filter((rolePickerOption) => rolePickerOption.value !== 'owner')
      .map((rolePickerOption) =>
        rolePickerOption.value === 'worker'
          ? { ...rolePickerOption, description: 'Accept bookings as an independent washer.' }
          : rolePickerOption,
      )

interface RolePickerGridProps {
  readonly selectedRole: SignUpRole
  readonly onRoleSelected: (nextRole: SignUpRole) => void
}

/** The account type is fixed after sign-up; it cannot be changed from the app later. */
export function RolePickerGrid({
  selectedRole,
  onRoleSelected,
}: RolePickerGridProps): ReactElement {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-[var(--color-ink-900)]">
        Choose your account type
      </legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {visibleRolePickerOptions.map((rolePickerOption) => {
          const isSelected = rolePickerOption.value === selectedRole
          return (
            <button
              key={rolePickerOption.value}
              type="button"
              onClick={(): void => {
                onRoleSelected(rolePickerOption.value)
              }}
              aria-pressed={isSelected}
              className={joinClassNames(
                'flex flex-col items-start gap-2 rounded-[var(--radius-surface)] border px-4 py-3 text-left transition-all',
                isSelected
                  ? 'border-[var(--color-brand-600)] bg-[var(--color-brand-50)] shadow-[var(--shadow-card)]'
                  : 'border-[var(--color-ink-200)] bg-white hover:border-[var(--color-brand-300)]',
              )}
            >
              <span
                className={joinClassNames(
                  'flex h-9 w-9 items-center justify-center rounded-full',
                  isSelected
                    ? 'bg-[var(--color-brand-700)] text-white'
                    : 'bg-[var(--color-ink-100)] text-[var(--color-ink-700)]',
                )}
              >
                {rolePickerOption.icon}
              </span>
              <span className="text-sm font-semibold text-[var(--color-ink-900)]">
                {rolePickerOption.title}
              </span>
              <span className="text-xs text-[var(--color-ink-500)]">
                {rolePickerOption.description}
              </span>
            </button>
          )
        })}
      </div>
      <p className="text-xs text-[var(--color-ink-500)]">
        Your account type cannot be changed later.
      </p>
    </fieldset>
  )
}
