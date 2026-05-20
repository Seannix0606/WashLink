import type { ReactNode } from 'react'
import { createElement } from 'react'
import {
  Bike,
  Car,
  CarFront,
  Droplets,
  Sparkles,
  Star,
  Truck,
} from 'lucide-react'

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
  readonly priceLabel: string
  readonly durationLabel: string
  readonly icon: ReactNode
}

export const vehicleOptionDefinitions: readonly VehicleOptionDefinition[] = [
  {
    value: 'Sedan',
    label: 'Sedan',
    description: 'Compact to mid-size cars',
    icon: createElement(Car, { className: 'h-6 w-6' }),
  },
  {
    value: 'SUV',
    label: 'SUV',
    description: 'Crossovers and large SUVs',
    icon: createElement(CarFront, { className: 'h-6 w-6' }),
  },
  {
    value: 'Pickup',
    label: 'Pickup',
    description: 'Pickup trucks and utility beds',
    icon: createElement(Truck, { className: 'h-6 w-6' }),
  },
  {
    value: 'Motorcycle',
    label: 'Motorcycle',
    description: 'Scooters and motorbikes',
    icon: createElement(Bike, { className: 'h-6 w-6' }),
  },
]

export const serviceOptionDefinitions: readonly ServiceOptionDefinition[] = [
  {
    value: 'Basic Wash',
    label: 'Basic Wash',
    description: 'Exterior rinse, soap, and hand dry.',
    priceLabel: 'from ₱150',
    durationLabel: '~30 min',
    icon: createElement(Droplets, { className: 'h-5 w-5' }),
  },
  {
    value: 'Full Wash',
    label: 'Full Wash',
    description: 'Exterior + interior vacuum and tire shine.',
    priceLabel: 'from ₱300',
    durationLabel: '~60 min',
    icon: createElement(Sparkles, { className: 'h-5 w-5' }),
  },
  {
    value: 'Wax',
    label: 'Premium Wax',
    description: 'Full detail with polish and protective wax.',
    priceLabel: 'from ₱500',
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
