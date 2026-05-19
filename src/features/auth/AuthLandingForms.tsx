import type { ReactElement } from 'react'
import { Eye, EyeOff, Lock, Mail, Phone, Store, User } from 'lucide-react'
import type { ApplicationUserRole } from '../../domain/models/AuthenticatedUser'
import { Button, Card, IconButton, Input } from '../../presentation/design/ui'

interface SignInFormProps {
  readonly emailAddress: string
  readonly password: string
  readonly isPasswordVisible: boolean
  readonly isSubmitting: boolean
  readonly onEmailAddressChanged: (nextEmail: string) => void
  readonly onPasswordChanged: (nextPassword: string) => void
  readonly onTogglePasswordVisibility: () => void
  readonly onRequestSignUp: () => void
  readonly onForgotPassword: () => void
  readonly onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>
}

export function SignInForm({
  emailAddress,
  password,
  isPasswordVisible,
  isSubmitting,
  onEmailAddressChanged,
  onPasswordChanged,
  onTogglePasswordVisibility,
  onRequestSignUp,
  onForgotPassword,
  onSubmit,
}: SignInFormProps): ReactElement {
  return (
    <Card elevation="flat" className="space-y-4 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-[var(--color-ink-900)]">
          Welcome back
        </h1>
        <p className="text-sm text-[var(--color-ink-500)]">
          Sign in to book a wash or manage your shop.
        </p>
      </header>

      <form className="space-y-4" onSubmit={onSubmit}>
        <Input
          name="emailAddress"
          type="email"
          autoComplete="email"
          label="Email address"
          placeholder="you@example.com"
          required
          value={emailAddress}
          onChange={(event) => onEmailAddressChanged(event.target.value)}
          leadingIcon={<Mail className="h-4 w-4" />}
        />

        <Input
          name="password"
          type={isPasswordVisible ? 'text' : 'password'}
          autoComplete="current-password"
          label="Password"
          placeholder="Enter your password"
          required
          minLength={6}
          value={password}
          onChange={(event) => onPasswordChanged(event.target.value)}
          leadingIcon={<Lock className="h-4 w-4" />}
          trailingAccessory={
            <button
              type="button"
              aria-label={
                isPasswordVisible ? 'Hide password' : 'Show password'
              }
              onClick={onTogglePasswordVisibility}
              className="text-[var(--color-ink-500)] hover:text-[var(--color-ink-900)]"
            >
              {isPasswordVisible ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          }
        />

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onForgotPassword}
            className="text-xs font-semibold text-[var(--color-brand-700)] hover:text-[var(--color-brand-800)]"
          >
            Forgot password?
          </button>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          isFullWidth
          isLoading={isSubmitting}
        >
          Sign in
        </Button>
      </form>

      <p className="text-center text-sm text-[var(--color-ink-500)]">
        New to WashLink?{' '}
        <button
          type="button"
          onClick={onRequestSignUp}
          className="font-semibold text-[var(--color-brand-700)] hover:text-[var(--color-brand-800)]"
        >
          Create an account
        </button>
      </p>
    </Card>
  )
}

interface SignUpFormProps {
  readonly fullName: string
  readonly phoneNumber: string
  readonly emailAddress: string
  readonly password: string
  readonly isPasswordVisible: boolean
  readonly isSubmitting: boolean
  readonly selectedRole: ApplicationUserRole
  readonly onFullNameChanged: (nextFullName: string) => void
  readonly onPhoneNumberChanged: (nextPhoneNumber: string) => void
  readonly onEmailAddressChanged: (nextEmail: string) => void
  readonly onPasswordChanged: (nextPassword: string) => void
  readonly onTogglePasswordVisibility: () => void
  readonly onRequestSignIn: () => void
  readonly onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>
  readonly onSelectedRoleChanged: (nextRole: ApplicationUserRole) => void
}

export function SignUpForm({
  fullName,
  phoneNumber,
  emailAddress,
  password,
  isPasswordVisible,
  isSubmitting,
  selectedRole,
  onFullNameChanged,
  onPhoneNumberChanged,
  onEmailAddressChanged,
  onPasswordChanged,
  onTogglePasswordVisibility,
  onRequestSignIn,
  onSubmit,
  onSelectedRoleChanged,
}: SignUpFormProps): ReactElement {
  return (
    <Card elevation="flat" className="space-y-4 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-[var(--color-ink-900)]">
          Create your account
        </h1>
        <p className="text-sm text-[var(--color-ink-500)]">
          Join as a customer or list your car wash shop.
        </p>
      </header>

      <RolePickerGrid
        selectedRole={selectedRole}
        onRoleSelected={onSelectedRoleChanged}
      />

      <form className="space-y-4" onSubmit={onSubmit}>
        <Input
          name="fullName"
          label="Full name"
          placeholder="Juan Dela Cruz"
          required
          value={fullName}
          onChange={(event) => onFullNameChanged(event.target.value)}
          leadingIcon={<User className="h-4 w-4" />}
        />

        <Input
          name="phoneNumber"
          type="tel"
          label="Phone number"
          placeholder="09XX XXX XXXX"
          required
          value={phoneNumber}
          onChange={(event) => onPhoneNumberChanged(event.target.value)}
          leadingIcon={<Phone className="h-4 w-4" />}
        />

        <Input
          name="emailAddress"
          type="email"
          autoComplete="email"
          label="Email address"
          placeholder="you@example.com"
          required
          value={emailAddress}
          onChange={(event) => onEmailAddressChanged(event.target.value)}
          leadingIcon={<Mail className="h-4 w-4" />}
        />

        <Input
          name="password"
          type={isPasswordVisible ? 'text' : 'password'}
          autoComplete="new-password"
          label="Password"
          placeholder="At least 6 characters"
          required
          minLength={6}
          value={password}
          onChange={(event) => onPasswordChanged(event.target.value)}
          leadingIcon={<Lock className="h-4 w-4" />}
          helperText="Use 6+ characters for better security."
          trailingAccessory={
            <IconButton
              size="sm"
              accessibleLabel={
                isPasswordVisible ? 'Hide password' : 'Show password'
              }
              onClick={onTogglePasswordVisibility}
              icon={
                isPasswordVisible ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )
              }
              className="border-0 bg-transparent hover:bg-[var(--color-surface-muted)]"
            />
          }
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          isFullWidth
          isLoading={isSubmitting}
        >
          Create account
        </Button>
      </form>

      <p className="text-center text-sm text-[var(--color-ink-500)]">
        Already have an account?{' '}
        <button
          type="button"
          onClick={onRequestSignIn}
          className="font-semibold text-[var(--color-brand-700)] hover:text-[var(--color-brand-800)]"
        >
          Sign in
        </button>
      </p>
    </Card>
  )
}

interface RolePickerGridProps {
  readonly selectedRole: ApplicationUserRole
  readonly onRoleSelected: (nextRole: ApplicationUserRole) => void
}

function RolePickerGrid({
  selectedRole,
  onRoleSelected,
}: RolePickerGridProps): ReactElement {
  const rolePickerOptions: readonly {
    readonly value: ApplicationUserRole
    readonly title: string
    readonly description: string
    readonly icon: ReactElement
  }[] = [
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
  ]

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {rolePickerOptions.map((rolePickerOption) => {
        const isSelected = rolePickerOption.value === selectedRole
        return (
          <button
            key={rolePickerOption.value}
            type="button"
            onClick={() => onRoleSelected(rolePickerOption.value)}
            aria-pressed={isSelected}
            className={
              'flex flex-col items-start gap-2 rounded-[var(--radius-surface)] border px-4 py-3 text-left transition-all ' +
              (isSelected
                ? 'border-[var(--color-brand-600)] bg-[var(--color-brand-50)] shadow-[var(--shadow-card)]'
                : 'border-[var(--color-ink-200)] bg-white hover:border-[var(--color-brand-300)]')
            }
          >
            <span
              className={
                'flex h-9 w-9 items-center justify-center rounded-full ' +
                (isSelected
                  ? 'bg-[var(--color-brand-700)] text-white'
                  : 'bg-[var(--color-ink-100)] text-[var(--color-ink-700)]')
              }
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
  )
}
