import type { ReactElement } from 'react'
import { Building2, Car, Home, ParkingSquare } from 'lucide-react'

const steps = [
  { title: 'Choose a time', body: 'Book for now or a later slot. You only see times a washer can actually make.' },
  { title: 'Pin the spot', body: 'Search or move the map pin, then add a landmark and any gate or parking notes.' },
  { title: 'Track the wash', body: 'See when your washer accepts, is on the way, arrives and finishes.' },
] as const

const locations = [
  { label: 'Homes', icon: Home },
  { label: 'Offices', icon: Building2 },
  { label: 'Condominiums', icon: Car },
  { label: 'Parking areas', icon: ParkingSquare },
] as const

export function LandingHowItWorks(): ReactElement {
  return (
    <section id="how-it-works" className="scroll-mt-4 border-t border-[var(--landing-line)]" aria-labelledby="how-title">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1fr_1.4fr] lg:py-28">
        <div>
          <h2 id="how-title" className="wl-display text-[clamp(1.9rem,4.5vw,3rem)]">
            We come to you
          </h2>
          <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-4">
            {locations.map(({ label, icon: Icon }) => (
              <li key={label} className="flex items-center gap-2.5 text-[var(--landing-soft)]">
                <Icon className="h-5 w-5 shrink-0 text-[var(--landing-accent)]" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        </div>
        <ol className="divide-y divide-[var(--landing-line)]">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-6 py-6 first:pt-0 last:pb-0">
              <span className="wl-display text-3xl text-[var(--landing-accent)]" aria-hidden="true">
                {index + 1}
              </span>
              <div>
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <p className="mt-1 leading-relaxed text-[var(--landing-soft)]">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
