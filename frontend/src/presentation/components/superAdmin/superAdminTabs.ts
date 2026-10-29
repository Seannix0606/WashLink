import type { AdminNextActionTarget } from '../../../domain/utilities/workforceNextActions'
import type { TabItemDefinition } from '../../design/ui'

/**
 * W11 (D-42) and W14 (D-57): the super_admin console sections. Overview is the default. Without
 * the W14 services (callers that predate W14) the W11 five tabs are kept.
 */
export type SuperAdminTabKey =
  | 'overview'
  | 'shop_verification'
  | 'posting_reports'
  | 'certification_reviews'
  | 'contract_disputes'
  | 'standard_contract'
  | 'relationships'
  | 'audit_log'
  | 'policies'

export const defaultSuperAdminTab: SuperAdminTabKey = 'overview'

/** D-57: the nine W14 console tabs, in order. */
export const superAdminTabItems: readonly TabItemDefinition<SuperAdminTabKey>[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'shop_verification', label: 'Shop verification' },
  { value: 'posting_reports', label: 'Posting reports' },
  { value: 'certification_reviews', label: 'Certification reviews' },
  { value: 'contract_disputes', label: 'Contract disputes' },
  { value: 'standard_contract', label: 'Standard contract' },
  { value: 'relationships', label: 'Relationships' },
  { value: 'audit_log', label: 'Audit log' },
  { value: 'policies', label: 'Policies' },
]

const w11TabKeys: readonly SuperAdminTabKey[] = ['overview', 'shop_verification', 'certification_reviews', 'contract_disputes', 'policies']

/** The tabs to show: all nine with the W14 services, else the W11 five. */
export function superAdminTabItemsFor(hasModerationServices: boolean): readonly TabItemDefinition<SuperAdminTabKey>[] {
  return hasModerationServices ? superAdminTabItems : superAdminTabItems.filter((tabItem) => w11TabKeys.includes(tabItem.value))
}

/** Every admin next-action target is a console tab. */
export function adminNextActionTab(target: AdminNextActionTarget): SuperAdminTabKey {
  return target
}
