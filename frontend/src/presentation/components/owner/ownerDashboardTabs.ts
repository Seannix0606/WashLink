import type { OwnerNextActionTarget } from '../../../domain/utilities/workforceNextActions'
import type { TabItemDefinition } from '../../design/ui'
import { ownerWorkforceTabLabel } from '../../utilities/workforceDashboardCopy'

/** Owner dashboard sections (extracted from OwnerDashboardContent in W11). */
export type OwnerDashboardPrimaryTabKey =
  | 'bookings'
  | 'workforce'
  | 'shops'
  | 'team'
  | 'jobs'
  | 'training'
  | 'certifications'
  | 'contracts'
  | 'worker_contracts'
  | 'verification'

/** D-42: owners keep landing on Bookings; next actions and the Workforce tab are added around it. */
export const defaultOwnerDashboardTab: OwnerDashboardPrimaryTabKey = 'bookings'

export interface OwnerDashboardTabCounts {
  readonly bookingCount: number
  readonly shopCount: number
  readonly workerCount: number
  readonly unverifiedShopCount: number
}

export function ownerDashboardTabItems(counts: OwnerDashboardTabCounts): TabItemDefinition<OwnerDashboardPrimaryTabKey>[] {
  return [
    { value: 'bookings', label: 'Bookings', badgeContent: counts.bookingCount },
    { value: 'workforce', label: ownerWorkforceTabLabel },
    { value: 'shops', label: 'My shops', badgeContent: counts.shopCount },
    { value: 'team', label: 'My team', badgeContent: counts.workerCount },
    { value: 'jobs', label: 'Job openings' },
    { value: 'training', label: 'Training' },
    { value: 'certifications', label: 'Certifications' },
    { value: 'contracts', label: 'Contract templates' },
    { value: 'worker_contracts', label: 'Worker contracts' },
    {
      value: 'verification',
      label: 'Verification',
      badgeContent: counts.unverifiedShopCount > 0 ? counts.unverifiedShopCount : undefined,
    },
  ]
}

/** Every next-action target is an owner dashboard tab. */
export function ownerNextActionTab(target: OwnerNextActionTarget): OwnerDashboardPrimaryTabKey {
  return target
}
