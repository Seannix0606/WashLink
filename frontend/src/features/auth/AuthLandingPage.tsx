import type { ReactElement } from 'react'
import {
  ArrowLeft,
  Car,
  Check,
  Tag,
  Sparkles,
} from 'lucide-react'
import { joinClassNames } from '../../presentation/design/classNames'
import { SignInForm, SignUpForm } from './AuthLandingForms'
import { useAuthLanding } from './useAuthLanding'
import { ForgotPasswordModal } from '../../presentation/components/auth/ForgotPasswordModal'
import { ThemeSwitch } from '../../presentation/theme/ThemeSwitch'

interface AuthLandingPageProps {
  /** Shown as "Back to WashLink" in the top bar when the page was opened from the public site. */
  readonly onBack?: () => void
}

/**
 * Sign in and create account. Desktop: a split screen, the brand panel filling the left half and the form centred in the
 * right half. Phones and tablets: a short brand band above the form.
 */
export function AuthLandingPage({ onBack }: AuthLandingPageProps = {}): ReactElement {
  const {
    activeAuthTab,
    emailAddress,
    password,
    fullName,
    phoneNumber,
    selectedRole,
    signUpFeedback,
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
    <div className="grid min-h-[100dvh] grid-cols-1 bg-[var(--color-surface-sunken)] lg:grid-cols-2">
      <AuthBrandHeroPanel />
      <section className="wl-auth-backdrop flex min-h-[100dvh] min-w-0 flex-col">
        <div className="flex items-center justify-between gap-3 px-4 pt-3 sm:px-6 lg:px-8 lg:pt-5">
          {onBack !== undefined ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to WashLink"
              className="inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] px-2 text-sm font-medium text-[var(--color-ink-700)] hover:bg-[var(--color-card)] hover:text-[var(--color-ink-900)] sm:px-3"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span className="sm:hidden">Back</span>
              <span className="hidden sm:inline">Back to WashLink</span>
            </button>
          ) : <span />}
          <ThemeSwitch />
        </div>
        <AuthCompactBrandHeader />
        <div className="flex flex-1 items-start justify-center px-4 pb-10 pt-5 sm:px-6 lg:items-center lg:px-10 lg:pt-4">
          <div className="w-full max-w-[26rem]">
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
                  onRequestSignUp={(): void => {
                    setActiveAuthTab('signUp')
                  }}
                  onForgotPassword={(): void => {
                    setIsForgotPasswordOpen(true)
                  }}
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
                  signUpFeedback={signUpFeedback}
                  onFullNameChanged={setFullName}
                  onPhoneNumberChanged={setPhoneNumber}
                  onEmailAddressChanged={setEmailAddress}
                  onPasswordChanged={setPassword}
                  onTogglePasswordVisibility={togglePasswordVisibility}
                  onRequestSignIn={(): void => {
                    setActiveAuthTab('signIn')
                  }}
                  onRequestPasswordReset={(): void => {
                    setIsForgotPasswordOpen(true)
                  }}
                  onSubmit={handleSignUpSubmit}
                  onSelectedRoleChanged={setSelectedRole}
                />
              )}
            </div>
          </div>
        </div>
      </section>

      <ForgotPasswordModal
        isOpen={isForgotPasswordOpen}
        onClose={(): void => {
          setIsForgotPasswordOpen(false)
        }}
        initialEmailAddress={emailAddress.trim()}
      />
    </div>
  )
}

function AuthBrandHeroPanel(): ReactElement {
  return (
    <aside className="wl-auth-brand relative hidden overflow-hidden text-white lg:sticky lg:top-0 lg:block lg:h-[100dvh]">
      <div className="relative mx-auto flex h-full max-w-xl flex-col justify-between px-10 py-10 xl:px-14 xl:py-12">
        <WashLinkWordmark />

        <div className="space-y-5">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-[var(--color-on-primary-soft)]">
            <Sparkles className="h-3.5 w-3.5 text-[var(--color-accent)]" /> Shine in minutes
          </p>
          <h2 className="text-4xl font-bold leading-[1.1] tracking-tight xl:text-5xl">
            Your car. Washed where it&nbsp;parks.
          </h2>
          <p className="max-w-md text-base leading-relaxed text-white/80">
            Book a detail in seconds, track it live, and let a washer bring the
            shine to your driveway.
          </p>

          <ul className="space-y-3 pt-2 text-sm">
            <AuthHeroFeatureRow
              icon={<Car className="h-4 w-4" />}
              text="Car wash professionals, booked online"
            />
            <AuthHeroFeatureRow
              icon={<Tag className="h-4 w-4" />}
              text="Upfront pricing"
            />
            <AuthHeroFeatureRow
              icon={<Sparkles className="h-4 w-4" />}
              text="Realtime status from booking to sparkle"
            />
          </ul>

          <AuthStatusPreview />
        </div>

        <p className="text-xs text-white/60">
          &copy; {new Date().getFullYear()} WashLink. All rights reserved.
        </p>
      </div>
    </aside>
  )
}

function WashLinkWordmark({ size = 'lg' }: { readonly size?: 'md' | 'lg' }): ReactElement {
  const isLarge = size === 'lg'
  return (
    <div className="flex items-center gap-3">
      <span className={joinClassNames(
        'inline-flex items-center justify-center rounded-[var(--radius-control)] bg-white/15 text-white shadow-[var(--shadow-card)] backdrop-blur-sm',
        isLarge ? 'h-12 w-12' : 'h-10 w-10',
      )}>
        <Sparkles className={isLarge ? 'h-6 w-6' : 'h-5 w-5'} aria-hidden="true" />
      </span>
      <span className={joinClassNames('font-extrabold tracking-tight', isLarge ? 'text-2xl' : 'text-xl')}>
        Wash<span className="text-[var(--color-on-primary-accent)]">Link</span>
      </span>
    </div>
  )
}

/** Phones and tablets: the brand as a short teal band, so the page is not a bare form. */
function AuthCompactBrandHeader(): ReactElement {
  return (
    <div className="px-4 pt-2 sm:px-6 lg:hidden">
      <div className="wl-auth-brand mx-auto w-full max-w-[26rem] overflow-hidden rounded-[var(--radius-surface)] px-5 py-5 text-white shadow-[var(--shadow-card-hover)]">
        <WashLinkWordmark size="md" />
        <p className="mt-3 text-lg font-bold leading-snug">Your car. Washed where it&nbsp;parks.</p>
        <p className="mt-1 text-sm text-white/80">Book in seconds, track it live, pay after the wash.</p>
      </div>
    </div>
  )
}

/** A picture of what tracking looks like: the steps a booking moves through. Decorative, not real booking data. */
function AuthStatusPreview(): ReactElement {
  const steps: readonly { readonly label: string; readonly state: 'done' | 'current' | 'next' }[] = [
    { label: 'Washer accepted', state: 'done' },
    { label: 'On the way', state: 'done' },
    { label: 'Washing your car', state: 'current' },
    { label: 'Done', state: 'next' },
  ]
  return (
    <div aria-hidden="true" className="mt-4 max-w-sm rounded-[var(--radius-surface)] border border-white/15 bg-white/10 p-4 shadow-[0_18px_40px_-18px_rgb(0_0_0/0.45)] backdrop-blur-md">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold">Full Wash</span>
        <span className="rounded-full bg-[var(--color-accent)] px-2 py-0.5 font-semibold text-[var(--color-on-accent)]">Live</span>
      </div>
      <ol className="mt-3 space-y-2">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-2.5 text-sm">
            <span className={joinClassNames(
              'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
              step.state === 'done' ? 'bg-white text-[var(--color-primary-strong)]'
                : step.state === 'current' ? 'bg-[var(--color-accent)] ring-4 ring-[var(--color-accent)]/25'
                  : 'border border-white/40',
            )}>
              {step.state === 'done' ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
            </span>
            <span className={step.state === 'next' ? 'text-white/55' : 'text-white/90'}>{step.label}</span>
          </li>
        ))}
      </ol>
    </div>
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
      className="inline-flex w-full rounded-full border border-[var(--color-card-border)] bg-[var(--color-card)]/70 p-1 shadow-[var(--shadow-card)] backdrop-blur"
    >
      {tabDefinitions.map((tabDefinition) => {
        const isActive = tabDefinition.value === activeAuthTab
        return (
          <button
            key={tabDefinition.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={(): void => {
              onAuthTabChange(tabDefinition.value)
            }}
            className={joinClassNames(
              'flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-colors',
              isActive
                ? 'bg-[var(--color-primary)] text-white shadow-[var(--shadow-button)]'
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
