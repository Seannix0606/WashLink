import type { ReactElement } from 'react'

interface LandingWasherAndAppProps {
  readonly onSignUp: () => void
}

export function LandingWasherAndApp({ onSignUp }: LandingWasherAndAppProps): ReactElement {
  return (
    <section className="border-t border-[var(--landing-line)]" aria-labelledby="washer-title">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:py-28">
        <div>
          <h2 id="washer-title" className="wl-display text-[clamp(1.9rem,4.5vw,3rem)]">
            Wash cars on your schedule
          </h2>
          <p className="mt-4 max-w-md leading-relaxed text-[var(--landing-soft)]">
            Set your hours and service area, go online when you want work, and accept the bookings that suit you.
            WashLink reviews each washer before their first booking.
          </p>
          <button type="button" onClick={onSignUp} className="wl-landing-primary-button mt-8">
            Sign up as a washer
          </button>
        </div>
        <div className="lg:border-l lg:border-[var(--landing-line)] lg:pl-12">
          <h2 className="text-xl font-semibold">WashLink on your phone</h2>
          <p className="mt-3 max-w-md leading-relaxed text-[var(--landing-soft)]">
            Android and iPhone apps are on the way, using the same account and bookings as this website. Until
            then, everything works in your phone&apos;s browser.
          </p>
        </div>
      </div>
    </section>
  )
}
