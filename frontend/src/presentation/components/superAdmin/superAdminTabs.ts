import type { AdminNextActionTarget } from '../../../domain/utilities/workforceNextActions'
import type { TabItemDefinition } from '../../design/ui'

/** W11 (D-42): the super_admin console sections. Overview is the default. */
export type SuperAdminTabKey = 'overview' | 'shop_verification' | 'certification_reviews' | 'contract_disputes' | 'policies'

export const defaultSuperAdminTab: SuperAdminTabKey = 'overview'

export const superAdminTabItems: readonly TabItemDefinition<SuperAdminTabKey>[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'shop_verification', label: 'Shop verification' },
  { value: 'certification_reviews', label: 'Certification reviews' },
  { value: 'contract_disputes', label: 'Contract disputes' },
  { value: 'policies', label: 'Policies' },
]

/** Every admin next-action target is a console tab. */
export function adminNextActionTab(target: AdminNextActionTarget): SuperAdminTabKey {
  return target
}
