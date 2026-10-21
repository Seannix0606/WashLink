import type { ReactNode } from 'react'
import { createElement } from 'react'
import { Car, CarFront, Droplets, Sparkles, Star, Truck } from 'lucide-react'
import {
  shopPricingServiceTypes,
  shopPricingVehicleTypes,
} from '../../../domain/models/ShopPricing'

export interface VehicleOptionDefinition {
  readonly value: string
  readonly label: string
  readonly description: string
  readonly icon: ReactNode
}

export interface ServiceOptionDefinition {
  readonly value: string
  readonly label: string
  readonly description: string
  readonly durationLabel: string
  readonly icon: ReactNode
}

export const vehicleOptionDefinitions: readonly VehicleOptionDefinition[] = [
  {
    value: shopPricingVehicleTypes[0],
    label: 'Sedan',
    description: 'Compact to mid-size cars',
    icon: createElement(Car, { className: 'h-6 w-6' }),
  },
  {
    value: shopPricingVehicleTypes[1],
    label: 'SUV',
    description: 'Crossovers and large SUVs',
    icon: createElement(CarFront, { className: 'h-6 w-6' }),
  },
  {
    value: shopPricingVehicleTypes[2],
    label: 'Pickup',
    description: 'Pickup trucks and utility beds',
    icon: createElement(Truck, { className: 'h-6 w-6' }),
  },
]

export const serviceOptionDefinitions: readonly ServiceOptionDefinition[] = [
  {
    value: shopPricingServiceTypes[0],
    label: 'Basic Wash',
    description: 'Exterior rinse, soap, and hand dry.',
    durationLabel: '~30 min',
    icon: createElement(Droplets, { className: 'h-5 w-5' }),
  },
  {
    value: shopPricingServiceTypes[1],
    label: 'Full Wash',
    description: 'Exterior + interior vacuum and tire shine.',
    durationLabel: '~60 min',
    icon: createElement(Sparkles, { className: 'h-5 w-5' }),
  },
  {
    value: shopPricingServiceTypes[2],
    label: 'Premium Wax',
    description: 'Full detail with polish and protective wax.',
    durationLabel: '~90 min',
    icon: createElement(Star, { className: 'h-5 w-5' }),
  },
]

export function findVehicleOptionByValue(
  vehicleValue: string,
): VehicleOptionDefinition | undefined {
  return vehicleOptionDefinitions.find(
    (vehicleOption) => vehicleOption.value === vehicleValue,
  )
}

export function findServiceOptionByValue(
  serviceValue: string,
): ServiceOptionDefinition | undefined {
  return serviceOptionDefinitions.find(
    (serviceOption) => serviceOption.value === serviceValue,
  )
}
