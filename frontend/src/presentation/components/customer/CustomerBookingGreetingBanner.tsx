import type { ReactElement } from 'react'
import { CalendarClock } from 'lucide-react'
import { Card } from '../../design/ui'

interface CustomerBookingGreetingBannerProps {
  readonly customerFullName: string
}

export function CustomerBookingGreetingBanner({
  customerFullName,
}: CustomerBookingGreetingBannerProps): ReactElement {
  const customerFirstName = customerFullName.trim().split(/\s+/)[0] ?? 'there'

  return (
    <Card
      elevation="flat"
      className="relative overflow-hidden border-0 bg-gradient-to-br from-[var(--color-brand-700)] to-[var(--color-brand-900)] p-5 text-white"
    >
      <div className="relative flex items-center gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm">
          <CalendarClock className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-white/70">
            Book a wash
          </p>
          <h1 className="truncate text-xl font-bold">
            Hi {customerFirstName}, let&apos;s get your ride shining.
          </h1>
        </div>
      </div>
      <div
        aria-hidden="true"
        className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10 blur-2xl"
      />
    </Card>
  )
}
