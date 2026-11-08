import type { ReactElement } from 'react'
import { featureFlags } from '../../../application/featureFlags'
import { useInstallPrompt } from '../../install/useInstallPrompt'

interface LandingWasherAndAppProps {
  readonly onSignUp: () => void
}

export function LandingWasherAndApp({ onSignUp }: LandingWasherAndAppProps): ReactElement {
  // Washer sign-up is closed while WashLink operates the washes itself (FEATURE_WASHER_SIGNUP).
  const isWasherSignUpShown = featureFlags.isWasherSignUpEnabled
  return (
    <section className="border-t border-[var(--landing-line)]" aria-labelledby="app-title">
      <div className={`mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 lg:py-28 ${isWasherSignUpShown ? 'lg:grid-cols-2' : ''}`}>
        {isWasherSignUpShown ? (
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
        ) : null}
        <div className={isWasherSignUpShown ? 'lg:border-l lg:border-[var(--landing-line)] lg:pl-12' : ''}>
          <InstallAppPanel />
        </div>
      </div>
    </section>
  )
}

function InstallAppPanel(): ReactElement {
  const { installState, install } = useInstallPrompt()
  const message = {
    installed: 'You are using the WashLink app. Your account and bookings are the same as on the website.',
    ios: 'Install WashLink as an app: tap the Share button in Safari, then Add to Home Screen. It opens full screen with the same account and bookings as this website.',
    promptable: 'Install WashLink as an app on your phone. It opens full screen with the same account and bookings as this website.',
    manual: 'Install WashLink as an app: open this site in your phone’s browser and choose Install app or Add to Home Screen from the menu. It uses the same account and bookings as this website.',
  }[installState]
  return (
    <>
      <h2 id="app-title" className="text-xl font-semibold">WashLink on your phone</h2>
      <p className="mt-3 max-w-md leading-relaxed text-[var(--landing-soft)]">{message}</p>
      {installState === 'promptable' ? (
        <button type="button" onClick={(): void => { void install() }} className="wl-landing-primary-button mt-6">
          Install the app
        </button>
      ) : null}
    </>
  )
}
