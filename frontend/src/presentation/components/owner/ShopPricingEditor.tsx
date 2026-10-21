import type { ReactElement, SubmitEvent } from 'react'
import { useEffect, useState } from 'react'
import type { Shop } from '../../../domain/models/Shop'
import {
  shopPricingServiceTypes,
  shopPricingVehicleTypes,
  type SaveShopPricingInput,
  type ShopPricingServiceType,
  type ShopPricingVehicleType,
  type ShopServicePrice,
} from '../../../domain/models/ShopPricing'
import { Button, Input, Modal, applicationToast } from '../../design/ui'

interface ShopPricingEditorProps {
  readonly shop: Shop | null
  readonly isSaving: boolean
  readonly onClose: () => void
  readonly onSave: (pricingInput: SaveShopPricingInput) => Promise<void>
}

type PricingDraft = Record<
  ShopPricingVehicleType,
  Record<ShopPricingServiceType, string>
>

function createPricingDraft(shop: Shop | null): PricingDraft {
  const pricingDraft = {} as PricingDraft
  for (const vehicleType of shopPricingVehicleTypes) {
    pricingDraft[vehicleType] = {} as Record<ShopPricingServiceType, string>
    for (const serviceType of shopPricingServiceTypes) {
      const currentPrice = shop?.servicePricing.find(
        (price) =>
          price.vehicleType === vehicleType &&
          price.serviceType === serviceType,
      )?.price
      pricingDraft[vehicleType][serviceType] =
        typeof currentPrice === 'number' ? String(currentPrice) : ''
    }
  }
  return pricingDraft
}

export function ShopPricingEditor({
  shop,
  isSaving,
  onClose,
  onSave,
}: ShopPricingEditorProps): ReactElement {
  const [pricingDraft, setPricingDraft] = useState<PricingDraft>(() =>
    createPricingDraft(shop),
  )

  useEffect(() => {
    setPricingDraft(createPricingDraft(shop))
  }, [shop])

  const handleSubmit = async (
    submitEvent: SubmitEvent<HTMLFormElement>,
  ): Promise<void> => {
    submitEvent.preventDefault()
    const prices: ShopServicePrice[] = []

    for (const vehicleType of shopPricingVehicleTypes) {
      for (const serviceType of shopPricingServiceTypes) {
        const rawPrice = pricingDraft[vehicleType][serviceType].trim()
        const price = Number(rawPrice)
        if (rawPrice.length === 0 || !Number.isFinite(price) || price <= 0) {
          applicationToast.error(
            `Enter a valid price for ${vehicleType} ${serviceType}.`,
          )
          return
        }
        prices.push({ vehicleType, serviceType, price })
      }
    }

    await onSave({ prices })
  }

  return (
    <Modal
      isOpen={shop !== null}
      onClose={onClose}
      title={shop ? `Rates · ${shop.name}` : 'Shop rates'}
      maxWidthClassName="max-w-3xl"
    >
      <form
        className="space-y-5"
        onSubmit={(submitEvent) => {
          void handleSubmit(submitEvent)
        }}
      >
        <p className="text-sm text-[var(--color-ink-500)]">
          Set the price for each wash package and vehicle. These prices are
          shown to customers when they book this shop.
        </p>

        <div className="space-y-5">
          {shopPricingVehicleTypes.map((vehicleType) => (
            <section
              key={vehicleType}
              className="space-y-3 rounded-[var(--radius-surface)] border border-[var(--color-ink-200)] p-4"
            >
              <h3 className="text-sm font-semibold text-[var(--color-ink-900)]">
                {vehicleType}
              </h3>
              <div className="grid gap-3 sm:grid-cols-3">
                {shopPricingServiceTypes.map((serviceType) => (
                  <Input
                    key={`${vehicleType}-${serviceType}`}
                    name={`${vehicleType}-${serviceType}`}
                    label={serviceType === 'Wax' ? 'Premium Wax' : serviceType}
                    type="number"
                    min="0.01"
                    max="999999.99"
                    step="0.01"
                    required
                    value={pricingDraft[vehicleType][serviceType]}
                    onChange={(changeEvent) => {
                      setPricingDraft((currentDraft) => ({
                        ...currentDraft,
                        [vehicleType]: {
                          ...currentDraft[vehicleType],
                          [serviceType]: changeEvent.target.value,
                        },
                      }))
                    }}
                    leadingIcon={<span className="text-sm">₱</span>}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSaving} disabled={isSaving}>
            Save rates
          </Button>
        </div>
      </form>
    </Modal>
  )
}
