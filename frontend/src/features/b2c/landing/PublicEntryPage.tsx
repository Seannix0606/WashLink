import type { ReactElement } from 'react'
import { lazy, Suspense, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { PublicLandingPage } from './PublicLandingPage'

const AuthLandingPage = lazy(async () => ({
  default: (await import('../../../presentation/pages/AuthLandingPage')).AuthLandingPage,
}))

/** Signed-out visitors see the site; booking or signing in opens the existing account forms. */
export function PublicEntryPage(): ReactElement {
  const [isAuthOpen, setIsAuthOpen] = useState(false)

  if (!isAuthOpen) {
    return (
      <PublicLandingPage
        onSignIn={(): void => {
          setIsAuthOpen(true)
          window.scrollTo(0, 0)
        }}
      />
    )
  }
  return (
    <div>
      <button
        type="button"
        onClick={(): void => {
          setIsAuthOpen(false)
        }}
        className="m-3 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-3 text-sm font-medium text-[var(--color-ink-700)] hover:bg-[var(--color-surface-sunken)]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to WashLink
      </button>
      <Suspense fallback={null}>
        <AuthLandingPage />
      </Suspense>
    </div>
  )
}
