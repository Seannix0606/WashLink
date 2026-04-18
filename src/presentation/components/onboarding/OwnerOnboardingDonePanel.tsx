import type { ReactElement } from 'react'
import { CheckCircle2, PartyPopper } from 'lucide-react'
import type { Shop } from '../../../domain/models/Shop'
import { Button } from '../../design/ui'

interface OwnerOnboardingDonePanelProps {
  readonly createdShop: Shop | null
  readonly createdWorkerCount: number
  readonly onEnterDashboard: () => void
}

export function OwnerOnboardingDonePanel({
  createdShop,
  createdWorkerCount,
  onEnterDashboard,
}: OwnerOnboardingDonePanelProps): ReactElement {
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-brand-50)] text-[var(--color-brand-700)]">
        <PartyPopper className="h-7 w-7" />
      </span>
      <div className="space-y-1">
        <h3 className="text-lg font-bold text-[var(--color-ink-900)]">
          Your shop is live
        </h3>
        <p className="max-w-md text-sm text-[var(--color-ink-500)]">
          {createdShop
            ? `${createdShop.name} is now visible to customers near you.`
            : 'Customers near your location can now book your services.'}
        </p>
      </div>

      <ul className="w-full max-w-sm space-y-2 text-left text-sm text-[var(--color-ink-700)]">
        <li className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-[var(--color-brand-700)]" />
          <span>Shop details saved</span>
        </li>
        <li className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-[var(--color-brand-700)]" />
          <span>
            {createdWorkerCount > 0
              ? `${createdWorkerCount} worker${createdWorkerCount === 1 ? '' : 's'} added`
              : 'Workers can be added anytime from your dashboard'}
          </span>
        </li>
        <li className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-[var(--color-brand-700)]" />
          <span>Ready to receive bookings</span>
        </li>
      </ul>

      <Button size="lg" onClick={onEnterDashboard} className="mt-2">
        Go to my dashboard
      </Button>
    </div>
  )
}
