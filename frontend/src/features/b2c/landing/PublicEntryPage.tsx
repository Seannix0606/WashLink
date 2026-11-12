import type { ReactElement } from 'react'
import { lazy, Suspense, useState } from 'react'
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
    <Suspense fallback={null}>
      <AuthLandingPage
        onBack={(): void => {
          setIsAuthOpen(false)
        }}
      />
    </Suspense>
  )
}
