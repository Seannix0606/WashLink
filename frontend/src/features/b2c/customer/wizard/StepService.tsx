import type { ReactElement } from 'react'
import { formatPesos } from '@washlink/shared'
import { EmptyState } from '../../../../presentation/design/ui'
import { joinClassNames } from '../../../../presentation/design/classNames'
import type { StepProps } from './BookingWizard'

const optionClass = (isSelected: boolean): string =>
  joinClassNames(
    'block w-full rounded-[var(--radius-surface)] border p-4 text-left transition-colors',
    isSelected ? 'border-[var(--color-brand-700)] bg-[var(--color-brand-50)]' : 'border-[var(--color-card-border)] bg-[var(--color-card)]',
  )

export function StepService({ draft, update, services, addons }: StepProps): ReactElement {
  if (services.length === 0) {
    return <EmptyState title="No services available" description="WashLink has not published any services yet." />
  }
  return (
    <section aria-labelledby="service-title" className="space-y-4">
      <h2 id="service-title" className="text-lg font-semibold text-[var(--color-ink-900)]">Choose a service</h2>
      <ul className="space-y-2">
        {services.map((service) => (
          <li key={service.id}>
            <button type="button" aria-pressed={draft.serviceId === service.id} className={optionClass(draft.serviceId === service.id)}
              onClick={(): void => { update({ serviceId: service.id }) }}>
              <span className="flex flex-wrap justify-between gap-2 font-semibold text-[var(--color-ink-900)]">
                {service.name}
                <span className="tabular-nums font-medium">{service.priceIsDraft ? 'Price not set' : `From ${formatPesos(service.basePriceCents)}`}</span>
              </span>
              <span className="mt-1 block text-sm text-[var(--color-ink-700)]">{service.description}</span>
              <span className="mt-1 block text-xs text-[var(--color-ink-500)]">About {service.durationMinutes} minutes</span>
            </button>
          </li>
        ))}
      </ul>
      {addons.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-[var(--color-ink-700)]">Add-ons (optional)</legend>
          {addons.map((addon) => {
            const isChosen = draft.addonIds.includes(addon.id)
            return (
              <label key={addon.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border border-[var(--color-card-border)] bg-[var(--color-card)] px-3 py-2">
                <input type="checkbox" checked={isChosen} className="h-5 w-5 accent-[var(--color-brand-700)]"
                  onChange={(): void => { update({ addonIds: isChosen ? draft.addonIds.filter((id) => id !== addon.id) : [...draft.addonIds, addon.id] }) }} />
                <span className="flex-1 text-sm text-[var(--color-ink-900)]">{addon.name}</span>
                <span className="text-sm tabular-nums text-[var(--color-ink-700)]">{addon.priceIsDraft ? 'Price not set' : `+${formatPesos(addon.priceCents)}`}</span>
              </label>
            )
          })}
        </fieldset>
      ) : null}
    </section>
  )
}
