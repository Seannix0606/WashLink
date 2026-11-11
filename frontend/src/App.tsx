import { createElement, lazy, Suspense, type ReactElement } from 'react'
import { featureFlags } from './application/featureFlags'
import { isSupabaseConfigured } from './infrastructure/supabase/supabaseClient'
import {
  AuthenticatedUserProvider,
  useAuthenticatedUser,
} from './presentation/auth/AuthenticatedUserContext'
import { ApplicationToaster } from './presentation/design/ui'
import { AdminIdleSignOut } from './presentation/auth/AdminIdleSignOut'
import { ErrorBoundary } from './presentation/components/ErrorBoundary'
import { ThemeProvider } from './presentation/theme/ThemeContext'

const CustomerBookingPage = lazy(async () => ({
  default: (await import('./presentation/pages/CustomerBookingPage')).CustomerBookingPage,
}))
const OwnerDashboardPage = lazy(async () => ({
  default: (await import('./presentation/pages/OwnerDashboardPage')).OwnerDashboardPage,
}))
const WorkerWorkspaceGate = lazy(async () => ({
  default: (await import('./presentation/pages/WorkerWorkspacePage')).WorkerWorkspaceGate,
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

const PublicEntryPage = lazy(async () => {
  await import('./features/b2c/landing/landing.css')
  return { default: (await import('./features/b2c/landing/PublicEntryPage')).PublicEntryPage }
})
const CustomerHomePage = lazy(async () => ({
  default: (await import('./features/b2c/customer/CustomerHomePage')).CustomerHomePage,
}))
const IndependentWorkerPage = lazy(async () => ({
  default: (await import('./features/b2c/worker/IndependentWorkerPage')).IndependentWorkerPage,
}))
const OwnerAccountPausedScreen = lazy(async () => ({
  default: (await import('./features/auth/OwnerAccountPausedScreen')).OwnerAccountPausedScreen,
}))

function SupabaseEnvMissingScreen(): ReactElement {
  return createElement(
    'main',
    { className: 'mx-auto flex min-h-[100dvh] max-w-lg flex-col justify-center px-5 py-8 sm:px-6' },
    createElement('h1', { className: 'text-2xl font-bold text-[var(--color-ink-900)]' }, 'WashLink needs Supabase settings'),
    createElement(
      'p',
      { className: 'mt-3 text-sm leading-relaxed text-[var(--color-ink-500)]' },
      'The app was not loading because the Supabase URL and anon key were missing. Copy',
      ' ',
      createElement('code', { className: 'rounded bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-xs' }, '.env.example'),
      ' ',
      'to',
      ' ',
      createElement('code', { className: 'rounded bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-xs' }, '.env'),
      ' ',
      'in the project root, then set',
      ' ',
      createElement('code', { className: 'rounded bg-[var(--color-warning-50)] px-1.5 py-0.5 text-xs' }, 'VITE_SUPABASE_URL'),
      ' ',
      'and',
      ' ',
      createElement('code', { className: 'rounded bg-[var(--color-warning-50)] px-1.5 py-0.5 text-xs' }, 'VITE_SUPABASE_ANON_KEY'),
      '. Restart',
      ' ',
      createElement('code', { className: 'rounded bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-xs' }, 'npm run dev'),
      ' ',
      'after saving.',
    ),
  )
}

function PageLoadingFallback(): ReactElement {
  return createElement(
    'div',
    { className: 'flex min-h-[100dvh] items-center justify-center bg-[var(--color-surface-sunken)]' },
    createElement('span', {
      className:
        'inline-flex h-10 w-10 animate-spin rounded-full border-2 border-[var(--color-brand-600)] border-t-transparent',
    }),
  )
}

function AppContent(): ReactElement {
  const {
    authenticatedUser,
    isInitializingAuthState,
    isPasswordRecoveryInProgress,
  } = useAuthenticatedUser()

  if (isInitializingAuthState) {
    return createElement(PageLoadingFallback)
  }

  if (isPasswordRecoveryInProgress) {
    return createElement(
      Suspense,
      { fallback: createElement(PageLoadingFallback) },
      createElement(ResetPasswordPage),
    )
  }

  if (!authenticatedUser) {
    return createElement(
      Suspense,
      { fallback: createElement(PageLoadingFallback) },
      createElement(featureFlags.isB2cEnabled ? PublicEntryPage : AuthLandingPage),
    )
  }

  if (authenticatedUser.role === 'super_admin') {
    return createElement(
      Suspense,
      { fallback: createElement(PageLoadingFallback) },
      createElement(AdminIdleSignOut),
      createElement(SuperAdminDashboardPage, {
        superAdminIdentifier: authenticatedUser.userIdentifier,
      }),
    )
  }

  if (authenticatedUser.role === 'owner' && !featureFlags.isB2bEnabled) {
    return createElement(
      Suspense,
      { fallback: createElement(PageLoadingFallback) },
      createElement(OwnerAccountPausedScreen),
    )
  }

  if (authenticatedUser.role === 'owner') {
    return createElement(
      Suspense,
      { fallback: createElement(PageLoadingFallback) },
      createElement(OwnerDashboardPage, {
        ownerIdentifier: authenticatedUser.userIdentifier,
      }),
    )
  }

  if (authenticatedUser.role === 'worker' && featureFlags.isB2cEnabled) {
    return createElement(
      Suspense,
      { fallback: createElement(PageLoadingFallback) },
      createElement(IndependentWorkerPage, { workerId: authenticatedUser.userIdentifier, workerName: authenticatedUser.fullName }),
    )
  }

  if (authenticatedUser.role === 'worker') {
    return createElement(
      Suspense,
      { fallback: createElement(PageLoadingFallback) },
      createElement(WorkerWorkspaceGate, {
        workerUserIdentifier: authenticatedUser.userIdentifier,
      }),
    )
  }

  if (featureFlags.isB2cEnabled) {
    return createElement(
      Suspense,
      { fallback: createElement(PageLoadingFallback) },
      createElement(CustomerHomePage, { customerId: authenticatedUser.userIdentifier, customerName: authenticatedUser.fullName }),
    )
  }

  return createElement(
    Suspense,
    { fallback: createElement(PageLoadingFallback) },
    createElement(CustomerBookingPage, {
      customerIdentifier: authenticatedUser.userIdentifier,
    }),
  )
}

function App(): ReactElement {
  if (!isSupabaseConfigured) {
    return createElement(
      ThemeProvider,
      null,
      createElement(SupabaseEnvMissingScreen),
      createElement(ApplicationToaster),
    )
  }

  return createElement(
    ThemeProvider,
    null,
    createElement(
      ErrorBoundary,
      null,
      createElement(
        AuthenticatedUserProvider,
        null,
        createElement(AppContent),
        createElement(ApplicationToaster),
      ),
    ),
  )
}

export default App
