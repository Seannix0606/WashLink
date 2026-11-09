import { customerVehicleCategories, vehicleCategoryLabel } from '@washlink/shared'

export const vehicleCategoryOptions = customerVehicleCategories.map((value) => ({ value, label: vehicleCategoryLabel[value] }))
