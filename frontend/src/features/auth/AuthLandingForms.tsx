import type { ReactElement, SyntheticEvent } from 'react'
import { featureFlags } from '../../application/featureFlags'
import { Eye, EyeOff, Lock, Mail, Phone, User } from 'lucide-react'
import type { SignUpRole } from '../../domain/models/AuthenticatedUser'
import { Button, Card, IconButton, Input } from '../../presentation/design/ui'
import { isRolePickerShown, RolePickerGrid } from './RolePickerGrid'
import { SignUpFeedbackNotice, type SignUpFeedback } from './SignUpFeedbackNotice'

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
  readonly onSubmit: (event: SyntheticEvent<HTMLFormElement>) => Promise<void>
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
    <Card className="space-y-4 p-6 shadow-[var(--shadow-card-hover)] sm:p-7">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-[var(--color-ink-900)]">
          Welcome back
        </h1>
        <p className="text-sm text-[var(--color-ink-500)]">
          {featureFlags.isB2bEnabled ? 'Sign in to book a wash or manage your shop.' : 'Sign in to book a wash or manage your work.'}
        </p>
      </header>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          void onSubmit(event)
        }}
      >
        <Input
          name="emailAddress"
          type="email"
          autoComplete="email"
          label="Email address"
          placeholder="you@example.com"
          required
          value={emailAddress}
          onChange={(event): void => {
            onEmailAddressChanged(event.target.value)
          }}
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
          onChange={(event): void => {
            onPasswordChanged(event.target.value)
          }}
          leadingIcon={<Lock className="h-4 w-4" />}
          trailingAccessory={
            <button
              type="button"
              aria-label={
                isPasswordVisible ? 'Hide password' : 'Show password'
              }
              onClick={(): void => {
                onTogglePasswordVisibility()
              }}
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
            onClick={(): void => {
              onForgotPassword()
            }}
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
          onClick={(): void => {
            onRequestSignUp()
          }}
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
  readonly selectedRole: SignUpRole
  readonly signUpFeedback: SignUpFeedback | null
  readonly onFullNameChanged: (nextFullName: string) => void
  readonly onPhoneNumberChanged: (nextPhoneNumber: string) => void
  readonly onEmailAddressChanged: (nextEmail: string) => void
  readonly onPasswordChanged: (nextPassword: string) => void
  readonly onTogglePasswordVisibility: () => void
  readonly onRequestSignIn: () => void
  readonly onRequestPasswordReset: () => void
  readonly onSubmit: (event: SyntheticEvent<HTMLFormElement>) => Promise<void>
  readonly onSelectedRoleChanged: (nextRole: SignUpRole) => void
}

export function SignUpForm({
  fullName,
  phoneNumber,
  emailAddress,
  password,
  isPasswordVisible,
  isSubmitting,
  selectedRole,
  signUpFeedback,
  onFullNameChanged,
  onPhoneNumberChanged,
  onEmailAddressChanged,
  onPasswordChanged,
  onTogglePasswordVisibility,
  onRequestSignIn,
  onRequestPasswordReset,
  onSubmit,
  onSelectedRoleChanged,
}: SignUpFormProps): ReactElement {
  return (
    <Card className="space-y-4 p-6 shadow-[var(--shadow-card-hover)] sm:p-7">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-[var(--color-ink-900)]">
          Create your account
        </h1>
        <p className="text-sm text-[var(--color-ink-500)]">
          {isRolePickerShown
            ? 'Book a wash, list your car wash shop, or find car wash work.'
            : 'Book a professional car wash near you.'}
        </p>
      </header>

      {isRolePickerShown ? (
        <RolePickerGrid
          selectedRole={selectedRole}
          onRoleSelected={onSelectedRoleChanged}
        />
      ) : null}

      {signUpFeedback !== null ? (
        <SignUpFeedbackNotice
          signUpFeedback={signUpFeedback}
          onRequestSignIn={onRequestSignIn}
          onRequestPasswordReset={onRequestPasswordReset}
        />
      ) : null}

      <form
        className="space-y-4"
        onSubmit={(event) => {
          void onSubmit(event)
        }}
      >
        <Input
          name="fullName"
          label="Full name"
          placeholder="Juan Dela Cruz"
          required
          value={fullName}
          onChange={(event): void => {
            onFullNameChanged(event.target.value)
          }}
          leadingIcon={<User className="h-4 w-4" />}
        />

        <Input
          name="phoneNumber"
          type="tel"
          label="Phone number"
          placeholder="09XX XXX XXXX"
          required
          value={phoneNumber}
          onChange={(event): void => {
            onPhoneNumberChanged(event.target.value)
          }}
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
          onChange={(event): void => {
            onEmailAddressChanged(event.target.value)
          }}
          leadingIcon={<Mail className="h-4 w-4" />}
        />

        <Input
          name="password"
          type={isPasswordVisible ? 'text' : 'password'}
          autoComplete="new-password"
          label="Password"
          placeholder="At least 8 characters"
          required
          minLength={8}
          value={password}
          onChange={(event): void => {
            onPasswordChanged(event.target.value)
          }}
          leadingIcon={<Lock className="h-4 w-4" />}
          helperText="At least 8 characters, the same as in the WashLink app."
          trailingAccessory={
            <IconButton
              size="sm"
              accessibleLabel={
                isPasswordVisible ? 'Hide password' : 'Show password'
              }
              onClick={(): void => {
                onTogglePasswordVisibility()
              }}
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
          onClick={(): void => {
            onRequestSignIn()
          }}
          className="font-semibold text-[var(--color-brand-700)] hover:text-[var(--color-brand-800)]"
        >
          Sign in
        </button>
      </p>
    </Card>
  )
}
