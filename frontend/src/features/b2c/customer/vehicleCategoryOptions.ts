import { vehicleCategories, vehicleCategoryLabel } from '@washlink/shared'

export const vehicleCategoryOptions = vehicleCategories.map((value) => ({ value, label: vehicleCategoryLabel[value] }))
