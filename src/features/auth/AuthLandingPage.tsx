import type { ReactElement } from 'react'
import {
  BadgeCheck,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { BrandMark } from '../../presentation/design/ui'
import { joinClassNames } from '../../presentation/design/classNames'
import { SignInForm, SignUpForm } from './AuthLandingForms'
import { useAuthLanding } from './useAuthLanding'
import { ForgotPasswordModal } from '../../presentation/components/auth/ForgotPasswordModal'

export function AuthLandingPage(): ReactElement {
  const {
    activeAuthTab,
    emailAddress,
    password,
    fullName,
    phoneNumber,
    selectedRole,
    isPasswordVisible,
    isSubmitting,
    isForgotPasswordOpen,
    setActiveAuthTab,
    setEmailAddress,
    setPassword,
    setFullName,
    setPhoneNumber,
    setSelectedRole,
    togglePasswordVisibility,
    setIsForgotPasswordOpen,
    handleSignInSubmit,
    handleSignUpSubmit,
  } = useAuthLanding()

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
                <SignInForm
                  emailAddress={emailAddress}
                  password={password}
                  isPasswordVisible={isPasswordVisible}
                  isSubmitting={isSubmitting}
                  onEmailAddressChanged={setEmailAddress}
                  onPasswordChanged={setPassword}
                  onTogglePasswordVisibility={togglePasswordVisibility}
                  onRequestSignUp={() => setActiveAuthTab('signUp')}
                  onForgotPassword={() => setIsForgotPasswordOpen(true)}
                  onSubmit={handleSignInSubmit}
                />
              ) : (
                <SignUpForm
                  fullName={fullName}
                  phoneNumber={phoneNumber}
                  emailAddress={emailAddress}
                  password={password}
                  isPasswordVisible={isPasswordVisible}
                  isSubmitting={isSubmitting}
                  selectedRole={selectedRole}
                  onFullNameChanged={setFullName}
                  onPhoneNumberChanged={setPhoneNumber}
                  onEmailAddressChanged={setEmailAddress}
                  onPasswordChanged={setPassword}
                  onTogglePasswordVisibility={togglePasswordVisibility}
                  onRequestSignIn={() => setActiveAuthTab('signIn')}
                  onSubmit={handleSignUpSubmit}
                  onSelectedRoleChanged={setSelectedRole}
                />
              )}
            </div>
          </div>
        </section>
      </div>

      <ForgotPasswordModal
        isOpen={isForgotPasswordOpen}
        onClose={() => setIsForgotPasswordOpen(false)}
        initialEmailAddress={emailAddress.trim()}
      />
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
  readonly activeAuthTab: 'signIn' | 'signUp'
  readonly onAuthTabChange: (nextAuthTab: 'signIn' | 'signUp') => void
}

function AuthTabSwitcher({
  activeAuthTab,
  onAuthTabChange,
}: AuthTabSwitcherProps): ReactElement {
  const tabDefinitions: readonly { value: 'signIn' | 'signUp'; label: string }[] = [
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
