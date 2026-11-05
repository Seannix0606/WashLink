import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { vehicleCategoryLabel, type SavedVehicle, type VehicleCategory } from '@washlink/shared'
import { Button, Input, Select } from '../../../../presentation/design/ui'
import { errorMessage, getB2cApi } from '../../b2cApiClient'
import { vehicleCategoryOptions } from '../vehicleCategoryOptions'
import type { StepProps } from './BookingWizard'

export function StepVehicle({ draft, update, services, customerId }: StepProps): ReactElement {
  const [saved, setSaved] = useState<readonly SavedVehicle[]>([])
  const [isSaved, setIsSaved] = useState(false)
  const service = services.find((candidate) => candidate.id === draft.serviceId)
  const isUnsupported = service !== undefined && !service.supportedVehicles.includes(draft.vehicleCategory)

  useEffect(() => {
    getB2cApi().listVehicles().then(setSaved).catch(() => { setSaved([]) })
  }, [])

  return (
    <section aria-labelledby="vehicle-title" className="space-y-4">
      <h2 id="vehicle-title" className="text-lg font-semibold text-[var(--color-ink-900)]">Which vehicle?</h2>
      {saved.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {saved.map((vehicle) => (
            <Button key={vehicle.id} size="sm" variant="secondary"
              onClick={(): void => { update({ vehicleCategory: vehicle.category, vehicleMake: vehicle.make, vehicleModel: vehicle.model }) }}>
              {vehicle.make} {vehicle.model}
            </Button>
          ))}
        </div>
      ) : null}
      <Select label="Vehicle type" options={vehicleCategoryOptions} value={draft.vehicleCategory}
        onChange={(event): void => { update({ vehicleCategory: event.target.value as VehicleCategory }) }}
        errorText={isUnsupported ? `${service.name} is not offered for a ${vehicleCategoryLabel[draft.vehicleCategory].toLowerCase()}. Go back and choose another service.` : undefined} />
      <Input label="Make" required value={draft.vehicleMake} maxLength={60} onChange={(event): void => { update({ vehicleMake: event.target.value }) }} />
      <Input label="Model" required value={draft.vehicleModel} maxLength={60} onChange={(event): void => { update({ vehicleModel: event.target.value }) }} />
      <Button size="sm" variant="ghost" disabled={isSaved}
        onClick={(): void => {
          getB2cApi().saveVehicle(customerId, { category: draft.vehicleCategory, make: draft.vehicleMake.trim(), model: draft.vehicleModel.trim(), year: null })
            .then(() => { setIsSaved(true); toast.success('Vehicle saved') })
            .catch((error: unknown) => { toast.error(errorMessage(error)) })
        }}>
        {isSaved ? 'Vehicle saved' : 'Save this vehicle'}
      </Button>
    </section>
  )
}
