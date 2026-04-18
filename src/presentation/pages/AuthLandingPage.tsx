import type { FormEvent, ReactElement } from 'react'
import { useState } from 'react'
import {
  BadgeCheck,
  Building2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react'
import type { ApplicationUserRole } from '../../domain/models/AuthenticatedUser'
import { useAuthenticatedUser } from '../auth/AuthenticatedUserContext'
import {
  applicationToast,
  BrandMark,
  Button,
  Card,
  IconButton,
  Input,
} from '../design/ui'
import { joinClassNames } from '../design/classNames'

type AuthLandingTabKey = 'signIn' | 'signUp'

export function AuthLandingPage(): ReactElement {
  const [activeAuthTab, setActiveAuthTab] = useState<AuthLandingTabKey>('signIn')

  return (
    <div className="min-h-[100dvh] bg-[var(--color-surface-sunken)]">
      <div className="mx-auto grid min-h-[100dvh] w-full max-w-6xl grid-cols-1 lg:grid-cols-2">
        <AuthBrandHeroPanel />
        <section className="flex items-center justify-center px-5 py-8 sm:px-8 lg:px-10">
          <div className="w-full max-w-md">
            <div className="mb-6 lg:hidden">
              <BrandMark size="md" />
            </div>

            <AuthTabSwitcher
              activeAuthTab={activeAuthTab}
              onAuthTabChange={setActiveAuthTab}
            />

            <div className="mt-5 wl-animate-in">
              {activeAuthTab === 'signIn' ? (
                <SignInForm onRequestSignUp={() => setActiveAuthTab('signUp')} />
              ) : (
                <SignUpForm onRequestSignIn={() => setActiveAuthTab('signIn')} />
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function AuthBrandHeroPanel(): ReactElement {
  return (
    <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[var(--color-brand-700)] via-[var(--color-brand-800)] to-[var(--color-brand-900)] lg:block">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute -left-16 top-8 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-10 right-0 h-80 w-80 rounded-full bg-[var(--color-brand-400)]/20 blur-3xl" />
      </div>
      <div className="relative flex h-full flex-col justify-between p-10 text-white">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-[var(--radius-control)] bg-white/15 text-white shadow-[var(--shadow-card)] backdrop-blur-sm">
            <Sparkles className="h-6 w-6" />
          </span>
          <span className="text-2xl font-extrabold tracking-tight">
            Wash<span className="text-[var(--color-brand-200)]">Link</span>
          </span>
        </div>

        <div className="max-w-md space-y-4">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-[var(--color-brand-100)]">
            <Sparkles className="h-3.5 w-3.5" /> Shine in minutes
          </p>
          <h2 className="text-3xl font-bold leading-tight sm:text-4xl">
            Your car wash, on demand.
          </h2>
          <p className="text-sm leading-relaxed text-white/80">
            Book a detail in seconds, track it live, and let verified pros bring
            the shine to your driveway.
          </p>

          <ul className="mt-6 space-y-3 text-sm">
            <AuthHeroFeatureRow
              icon={<BadgeCheck className="h-4 w-4" />}
              text="Verified car wash professionals"
            />
            <AuthHeroFeatureRow
              icon={<ShieldCheck className="h-4 w-4" />}
              text="Secure payments & transparent pricing"
            />
            <AuthHeroFeatureRow
              icon={<Sparkles className="h-4 w-4" />}
              text="Realtime status from booking to sparkle"
            />
          </ul>
        </div>

        <p className="text-xs text-white/60">
          &copy; {new Date().getFullYear()} WashLink. All rights reserved.
        </p>
      </div>
    </aside>
  )
}

function AuthHeroFeatureRow({
  icon,
  text,
}: {
  readonly icon: ReactElement
  readonly text: string
}): ReactElement {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-white">
        {icon}
      </span>
      <span className="text-white/85">{text}</span>
    </li>
  )
}

interface AuthTabSwitcherProps {
  readonly activeAuthTab: AuthLandingTabKey
  readonly onAuthTabChange: (nextAuthTab: AuthLandingTabKey) => void
}

function AuthTabSwitcher({
  activeAuthTab,
  onAuthTabChange,
}: AuthTabSwitcherProps): ReactElement {
  const tabDefinitions: readonly { value: AuthLandingTabKey; label: string }[] = [
    { value: 'signIn', label: 'Sign in' },
    { value: 'signUp', label: 'Create account' },
  ]

  return (
    <div
      role="tablist"
      aria-label="Authentication"
      className="inline-flex w-full rounded-full bg-[var(--color-ink-100)] p-1"
    >
      {tabDefinitions.map((tabDefinition) => {
        const isActive = tabDefinition.value === activeAuthTab
        return (
          <button
            key={tabDefinition.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onAuthTabChange(tabDefinition.value)}
            className={joinClassNames(
              'flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-colors',
              isActive
                ? 'bg-white text-[var(--color-ink-900)] shadow-[var(--shadow-card)]'
                : 'text-[var(--color-ink-500)] hover:text-[var(--color-ink-900)]',
            )}
          >
            {tabDefinition.label}
          </button>
        )
      })}
    </div>
  )
}

interface SignInFormProps {
  readonly onRequestSignUp: () => void
}

function SignInForm({ onRequestSignUp }: SignInFormProps): ReactElement {
  const { signIn } = useAuthenticatedUser()
  const [emailAddress, setEmailAddress] = useState<string>('')
  const [password, setPassword] = useState<string>('')
  const [isPasswordVisible, setIsPasswordVisible] = useState<boolean>(false)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  const handleSignInSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault()
    setIsSubmitting(true)
    try {
      await signIn(emailAddress.trim(), password)
      applicationToast.success('Welcome back!')
    } catch (error) {
      applicationToast.error(
        error instanceof Error ? error.message : 'Unable to sign in.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

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

      <form
        className="space-y-4"
        onSubmit={(event) => {
          void handleSignInSubmit(event)
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
          onChange={(event) => setEmailAddress(event.target.value)}
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
          onChange={(event) => setPassword(event.target.value)}
          leadingIcon={<Lock className="h-4 w-4" />}
          trailingAccessory={
            <button
              type="button"
              aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
              onClick={() => setIsPasswordVisible((previous) => !previous)}
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
  readonly onRequestSignIn: () => void
}

function SignUpForm({ onRequestSignIn }: SignUpFormProps): ReactElement {
  const { signUpCustomer, signUpOwner } = useAuthenticatedUser()
  const [selectedRole, setSelectedRole] = useState<ApplicationUserRole>('customer')
  const [fullName, setFullName] = useState<string>('')
  const [phoneNumber, setPhoneNumber] = useState<string>('')
  const [emailAddress, setEmailAddress] = useState<string>('')
  const [password, setPassword] = useState<string>('')
  const [isPasswordVisible, setIsPasswordVisible] = useState<boolean>(false)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  const handleSignUpSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault()
    setIsSubmitting(true)

    try {
      const signUpInput = {
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
        emailAddress: emailAddress.trim(),
        password,
      }
      if (selectedRole === 'owner') {
        await signUpOwner(signUpInput)
      } else {
        await signUpCustomer(signUpInput)
      }
      applicationToast.success('Account created. You can sign in now.')
      onRequestSignIn()
    } catch (error) {
      applicationToast.error(
        error instanceof Error ? error.message : 'Unable to sign up.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

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
        onRoleSelected={setSelectedRole}
      />

      <form
        className="space-y-4"
        onSubmit={(event) => {
          void handleSignUpSubmit(event)
        }}
      >
        <Input
          name="fullName"
          label="Full name"
          placeholder="Juan Dela Cruz"
          required
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          leadingIcon={<User className="h-4 w-4" />}
        />

        <Input
          name="phoneNumber"
          type="tel"
          label="Phone number"
          placeholder="09XX XXX XXXX"
          required
          value={phoneNumber}
          onChange={(event) => setPhoneNumber(event.target.value)}
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
          onChange={(event) => setEmailAddress(event.target.value)}
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
          onChange={(event) => setPassword(event.target.value)}
          leadingIcon={<Lock className="h-4 w-4" />}
          helperText="Use 6+ characters for better security."
          trailingAccessory={
            <IconButton
              size="sm"
              accessibleLabel={
                isPasswordVisible ? 'Hide password' : 'Show password'
              }
              onClick={() => setIsPasswordVisible((previous) => !previous)}
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
      icon: <Building2 className="h-5 w-5" />,
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
  )
}
