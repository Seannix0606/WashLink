import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { formatPesos, type CatalogService } from '@washlink/shared'
import { getB2cApi } from '../b2cApiClient'

interface LandingServicesProps {
  readonly onBook: () => void
}

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' }
  | { readonly kind: 'ready'; readonly services: readonly CatalogService[] }

/** Read live from the admin-managed catalog. A draft price is never shown as if it were real. */
export function LandingServices({ onBook }: LandingServicesProps): ReactElement {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    let isCurrent = true
    getB2cApi()
      .listServices()
      .then((services) => {
        if (isCurrent) {
          setState({ kind: 'ready', services })
        }
      })
      .catch(() => {
        if (isCurrent) {
          setState({ kind: 'error' })
        }
      })
    return (): void => {
      isCurrent = false
    }
  }, [])

  return (
    <section className="border-t border-[var(--landing-line)]" aria-labelledby="services-title">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
        <h2 id="services-title" className="wl-display text-[clamp(1.9rem,4.5vw,3rem)]">
          Services and prices
        </h2>
        <p className="mt-4 max-w-xl text-[var(--landing-soft)]">
          The price you confirm includes your vehicle type and any add-ons, and is checked again when you book.
        </p>
        {state.kind === 'loading' ? (
          <p className="mt-10 text-[var(--landing-muted)]" role="status">
            Loading services
          </p>
        ) : null}
        {state.kind === 'error' ? (
          <p className="mt-10 text-[var(--landing-soft)]" role="alert">
            Services could not be loaded. Refresh the page to try again.
          </p>
        ) : null}
        {state.kind === 'ready' && state.services.length === 0 ? (
          <p className="mt-10 text-[var(--landing-soft)]">Services will be listed here soon.</p>
        ) : null}
        {state.kind === 'ready' && state.services.length > 0 ? (
          <ul className="mt-10 divide-y divide-[var(--landing-line)] border-y border-[var(--landing-line)]">
            {state.services.map((service) => (
              <li key={service.id} className="flex flex-col gap-1 py-5 sm:flex-row sm:items-baseline sm:gap-8">
                <h3 className="text-lg font-semibold sm:w-72 sm:shrink-0">{service.name}</h3>
                <p className="flex-1 text-[var(--landing-soft)]">{service.description}</p>
                <p className="shrink-0 tabular-nums sm:text-right">
                  {service.priceIsDraft ? (
                    <span className="text-[var(--landing-muted)]">Price coming soon</span>
                  ) : (
                    <>From {formatPesos(service.basePriceCents)}</>
                  )}
                  <span className="ml-3 text-[var(--landing-muted)]">{service.durationMinutes} min</span>
                </p>
              </li>
            ))}
          </ul>
        ) : null}
        <button type="button" onClick={onBook} className="wl-landing-outline-button mt-10">
          Book a car wash
        </button>
      </div>
    </section>
  )
}
