import type { ReactElement } from 'react'
import { BrandMark } from '../../../presentation/design/ui/BrandMark'
import { LandingHero } from './LandingHero'
import { LandingHowItWorks } from './LandingHowItWorks'
import { LandingServices } from './LandingServices'
import { LandingWasherAndApp } from './LandingWasherAndApp'

interface PublicLandingPageProps {
  readonly onSignIn: () => void
}

/** The public site. Dark and cinematic here only; signed-in screens stay light so forms and maps stay legible. */
export function PublicLandingPage({ onSignIn }: PublicLandingPageProps): ReactElement {
  return (
    <div className="wl-landing min-h-[100dvh] bg-[var(--landing-night)] text-[var(--landing-text)]">
      <a href="#landing-main" className="wl-skip-link">
        Skip to main content
      </a>
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <span className="wl-landing-brand">
            <BrandMark size="md" />
          </span>
          <button type="button" onClick={onSignIn} className="wl-landing-outline-button">
            Sign in
          </button>
        </div>
      </header>
      <main id="landing-main">
        <LandingHero onBook={onSignIn} />
        <LandingHowItWorks />
        <LandingServices onBook={onSignIn} />
        <LandingWasherAndApp onSignUp={onSignIn} />
      </main>
      <footer className="border-t border-[var(--landing-line)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-sm text-[var(--landing-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span className="wl-landing-brand">
            <BrandMark size="sm" />
          </span>
          <span>On-demand car washing, wherever you park.</span>
        </div>
      </footer>
    </div>
  )
}
