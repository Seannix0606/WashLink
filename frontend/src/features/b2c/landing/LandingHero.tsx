import type { ReactElement } from 'react'
import { ArrowDown, CarFront } from 'lucide-react'

interface LandingHeroProps {
  readonly onBook: () => void
}

/**
 * A wet street at night, drawn in CSS with WashLink teal: real photography can replace `.wl-hero-scene` later
 * without touching the layout. Decorative only, so it is hidden from assistive technology.
 */
export function LandingHero({ onBook }: LandingHeroProps): ReactElement {
  return (
    <section className="relative flex min-h-[100dvh] items-center overflow-hidden" aria-labelledby="landing-title">
      <div className="wl-hero-scene" aria-hidden="true">
        <span className="wl-hero-headlight" />
        <span className="wl-hero-taillights" />
        <span className="wl-hero-road" />
      </div>
      <div className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-24 pt-28 sm:px-8">
        <h1 id="landing-title" className="wl-display max-w-3xl text-[clamp(2.75rem,9vw,6rem)]">
          Your car.
          <br />
          Washed where it&nbsp;parks.
        </h1>
        <p className="mt-6 max-w-md text-base leading-relaxed text-[var(--landing-soft)] sm:text-lg">
          Book an independent washer for your home, office, condo or parking spot. Choose a time, pin the
          location, and pay in cash when the job is done.
        </p>
        <button type="button" onClick={onBook} className="wl-landing-primary-button mt-8">
          <CarFront className="h-5 w-5" aria-hidden="true" />
          Book a car wash
        </button>
      </div>
      <a href="#how-it-works" className="wl-hero-scroll">
        <span>See how it works</span>
        <ArrowDown className="h-4 w-4" aria-hidden="true" />
      </a>
    </section>
  )
}
