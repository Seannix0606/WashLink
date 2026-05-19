import type { ReactElement } from 'react'
import { lazy, Suspense } from 'react'
import { isSupabaseConfigured } from './infrastructure/supabase/supabaseClient'
import {
  AuthenticatedUserProvider,
  useAuthenticatedUser,
} from './presentation/auth/AuthenticatedUserContext'
import { ApplicationToaster } from './presentation/design/ui'
import { ErrorBoundary } from './presentation/components/ErrorBoundary'

const CustomerBookingPage = lazy(async () => ({
  default: (await import('./presentation/pages/CustomerBookingPage')).CustomerBookingPage,
}))
const OwnerDashboardPage = lazy(async () => ({
  default: (await import('./presentation/pages/OwnerDashboardPage')).OwnerDashboardPage,
}))
const WorkerJobsPage = lazy(async () => ({
  default: (await import('./presentation/pages/WorkerJobsPage')).WorkerJobsPage,
}))
const AuthLandingPage = lazy(async () => ({
  default: (await import('./presentation/pages/AuthLandingPage')).AuthLandingPage,
}))
const ResetPasswordPage = lazy(async () => ({
  default: (await import('./presentation/pages/ResetPasswordPage')).ResetPasswordPage,
}))
const SuperAdminDashboardPage = lazy(async () => ({
  default: (await import('./presentation/pages/SuperAdminDashboardPage')).SuperAdminDashboardPage,
}))

function SupabaseEnvMissingScreen(): ReactElement {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-lg flex-col justify-center px-5 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-[var(--color-ink-900)]">
        WashLink needs Supabase settings
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-500)]">
        The app was not loading because the Supabase URL and anon key were missing.
        Copy{' '}
        <code className="rounded bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-xs">
          .env.example
        </code>{' '}
        to{' '}
        <code className="rounded bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-xs">
          .env
        </code>{' '}
        in the project root, then set{' '}
        <code className="rounded bg-[var(--color-warning-50)] px-1.5 py-0.5 text-xs">
          VITE_SUPABASE_URL
        </code>{' '}
        and{' '}
        <code className="rounded bg-[var(--color-warning-50)] px-1.5 py-0.5 text-xs">
          VITE_SUPABASE_ANON_KEY
        </code>
        . Restart{' '}
        <code className="rounded bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-xs">
          npm run dev
        </code>{' '}
        after saving.
      </p>
    </main>
  )
}

function PageLoadingFallback(): ReactElement {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--color-surface-sunken)]">
      <span className="inline-flex h-10 w-10 animate-spin rounded-full border-2 border-[var(--color-brand-600)] border-t-transparent" />
    </div>
  )
}

function AppContent(): ReactElement {
  const {
    authenticatedUser,
    isInitializingAuthState,
    isPasswordRecoveryInProgress,
  } = useAuthenticatedUser()

  if (isInitializingAuthState) {
    return <PageLoadingFallback />
  }

  if (isPasswordRecoveryInProgress) {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <ResetPasswordPage />
      </Suspense>
    )
  }

  if (!authenticatedUser) {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <AuthLandingPage />
      </Suspense>
    )
  }

  if (authenticatedUser.role === 'super_admin') {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <SuperAdminDashboardPage
          superAdminIdentifier={authenticatedUser.userIdentifier}
        />
      </Suspense>
    )
  }
  if (authenticatedUser.role === 'owner') {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <OwnerDashboardPage ownerIdentifier={authenticatedUser.userIdentifier} />
      </Suspense>
    )
  }
  if (authenticatedUser.role === 'worker') {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <WorkerJobsPage workerUserIdentifier={authenticatedUser.userIdentifier} />
      </Suspense>
    )
  }
  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <CustomerBookingPage customerIdentifier={authenticatedUser.userIdentifier} />
    </Suspense>
  )
}

function App(): ReactElement {
  if (!isSupabaseConfigured) {
    return (
      <>
        <SupabaseEnvMissingScreen />
        <ApplicationToaster />
      </>
    )
  }

  return (
    <ErrorBoundary>
      <AuthenticatedUserProvider>
        <AppContent />
        <ApplicationToaster />
      </AuthenticatedUserProvider>
    </ErrorBoundary>
  )
}

export default App
