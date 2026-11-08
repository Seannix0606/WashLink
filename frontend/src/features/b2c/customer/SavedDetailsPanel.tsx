import type { ReactElement, SyntheticEvent } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import {
  validateVehicleText,
  vehicleCategoryLabel,
  type SavedAddress,
  type SavedVehicle,
  type VehicleCategory,
} from '@washlink/shared'
import { Button, Card, EmptyState, IconButton, Input, Select, Skeleton } from '../../../presentation/design/ui'
import { errorMessage, getB2cApi } from '../b2cApiClient'
import { vehicleCategoryOptions } from './vehicleCategoryOptions'

interface SavedDetailsPanelProps {
  readonly customerId: string
}

/** Addresses are added from the booking map, where the pin is confirmed; vehicles can be added here. */
export function SavedDetailsPanel({ customerId }: SavedDetailsPanelProps): ReactElement {
  const [addresses, setAddresses] = useState<readonly SavedAddress[] | null>(null)
  const [vehicles, setVehicles] = useState<readonly SavedVehicle[] | null>(null)
  const [category, setCategory] = useState<VehicleCategory>('sedan')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [nextAddresses, nextVehicles] = await Promise.all([getB2cApi().listAddresses(), getB2cApi().listVehicles()])
      setAddresses(nextAddresses)
      setVehicles(nextVehicles)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0)
    return (): void => { window.clearTimeout(timer) }
  }, [refresh])

  const addVehicle = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const problem = validateVehicleText('make', make) ?? validateVehicleText('model', model)
    setFormError(problem)
    if (problem !== null) {
      return
    }
    try {
      await getB2cApi().saveVehicle(customerId, { category, make: make.trim(), model: model.trim(), year: null })
      setMake('')
      setModel('')
      await refresh()
    } catch (error) {
      setFormError(errorMessage(error))
    }
  }

  const remove = async (action: () => Promise<void>): Promise<void> => {
    try {
      await action()
      await refresh()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="vehicles-title" className="space-y-3">
        <h2 id="vehicles-title" className="text-lg font-semibold text-[var(--color-ink-900)]">Vehicles</h2>
        {vehicles === null ? <Skeleton heightClassName="h-16" /> : null}
        {vehicles?.length === 0 ? <EmptyState title="No saved vehicles" description="Add one below to book faster." /> : null}
        {vehicles?.map((vehicle) => (
          <Card key={vehicle.id} className="flex items-center justify-between gap-3 p-3">
            <span className="text-sm text-[var(--color-ink-900)]">{vehicle.make} {vehicle.model} · {vehicleCategoryLabel[vehicle.category]}</span>
            <IconButton accessibleLabel={`Remove ${vehicle.make} ${vehicle.model}`} icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
              onClick={(): void => void remove(() => getB2cApi().deleteVehicle(vehicle.id))} />
          </Card>
        ))}
        <form onSubmit={(event): void => void addVehicle(event)} noValidate className="grid gap-3 sm:grid-cols-3">
          <Select label="Type" options={vehicleCategoryOptions} value={category} onChange={(event): void => { setCategory(event.target.value as VehicleCategory) }} />
          <Input label="Make" value={make} onChange={(event): void => { setMake(event.target.value) }} />
          <Input label="Model" value={model} onChange={(event): void => { setModel(event.target.value) }} />
          {formError !== null ? <p role="alert" className="text-sm text-[var(--color-danger-600)] sm:col-span-3">{formError}</p> : null}
          <div className="sm:col-span-3"><Button type="submit" variant="secondary">Add vehicle</Button></div>
        </form>
      </section>
      <section aria-labelledby="addresses-title" className="space-y-3">
        <h2 id="addresses-title" className="text-lg font-semibold text-[var(--color-ink-900)]">Addresses</h2>
        {addresses === null ? <Skeleton heightClassName="h-16" /> : null}
        {addresses?.length === 0 ? <EmptyState title="No saved addresses" description="Choose Save this address when you pin a location during booking." /> : null}
        {addresses?.map((address) => (
          <Card key={address.id} className="flex items-center justify-between gap-3 p-3">
            <span className="text-sm text-[var(--color-ink-900)] [overflow-wrap:anywhere]"><strong>{address.label}</strong>: {address.address}</span>
            <IconButton accessibleLabel={`Remove ${address.label}`} icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
              onClick={(): void => void remove(() => getB2cApi().deleteAddress(address.id))} />
          </Card>
        ))}
      </section>
    </div>
  )
}
