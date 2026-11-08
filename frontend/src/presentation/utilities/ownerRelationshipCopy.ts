/**
 * W10 copy. The distinct-owner count is a WashLink progress goal only (D-3, W10-L1): no text here
 * presents it as a condition, a duty or pressure, and owner-facing text never mentions it (D-38).
 */

// Worker progress card.
export const ownerProgressTitle = 'Progress toward working with different shop owners'
export const ownerProgressNotice =
  'This is a WashLink progress goal. It is not a requirement and not an obligation to work for several shops at the same time. It never stops you from declining an offer or recording the end of a contract.'
export const ownerProgressCountingText =
  'Only active contracts with a verified shop owner count. Several contracts, shops or changes with the same owner count once. Offers, applications, training, certificates and roster links do not count.'
export const ownerProgressUnavailableTitle = 'Progress is not available'
export const ownerProgressUnavailableText = 'WashLink could not show a progress goal for this account.'
export const findWorkButtonLabel = 'Find work'
export const findWorkHintText = 'Browse openings from verified shops if you are looking for more work.'

export function describeOwnerProgressCount(qualifyingOwnerCount: number, minimumDistinctOwners: number): string {
  const ownerWord = minimumDistinctOwners === 1 ? 'shop owner' : 'different shop owners'
  return `${String(qualifyingOwnerCount)} of ${String(minimumDistinctOwners)} ${ownerWord}`
}

export function describeOwnerProgressRemaining(remainingOwnerCount: number): string {
  if (remainingOwnerCount <= 0) {
    return 'You have reached this WashLink progress goal.'
  }
  const ownerWord = remainingOwnerCount === 1 ? 'shop owner' : 'different shop owners'
  return `${String(remainingOwnerCount)} more ${ownerWord} with an active contract would reach this goal.`
}

export function describeOwnerGoalSource(minimumDistinctOwners: number, defaultMinimum: number): string {
  const ownerWords = minimumDistinctOwners === 1 ? '1 shop owner' : `${String(minimumDistinctOwners)} different shop owners`
  return minimumDistinctOwners === defaultMinimum
    ? `Goal set by WashLink: ${ownerWords}.`
    : `Goal set by WashLink: ${ownerWords} (WashLink default: ${String(defaultMinimum)}).`
}

export function describeCountedAsOf(countedAsOf: string): string {
  return `Counted as of ${countedAsOf}.`
}

// Worker relationship list.
export const myRelationshipsHeading = 'Shop owners you have contracts with'
export const myRelationshipsEmptyTitle = 'No shop owner relationships yet'
export const myRelationshipsEmptyText = 'A shop owner appears here after you accept a contract offer from one of their shops.'

// Owner relationship list (own rows only; never the worker's goal, count or other owners).
export const ownerRelationshipsHeading = 'Your relationships with workers'
export const ownerRelationshipsIntroText =
  'One row per worker who accepted a contract with you. Shows only your own contracts with each worker.'
export const ownerRelationshipsEmptyTitle = 'No worker relationships yet'
export const ownerRelationshipsEmptyText = 'A worker appears here after they accept a contract you sent.'

export function describeContractsWithYou(contractCount: number): string {
  return contractCount === 1 ? '1 accepted contract with you' : `${String(contractCount)} accepted contracts with you`
}

export function describeAcceptedContracts(contractCount: number): string {
  return contractCount === 1 ? '1 accepted contract' : `${String(contractCount)} accepted contracts`
}

// Super_admin policy panel.
export const workforcePoliciesHeading = 'Workforce policies'
export const informationalOnlyLabel = 'Informational only'
export const workforcePolicyNotice =
  'This value is shown to workers as a progress goal. It never blocks declining an offer, ending a contract or any other action. Enforcing it in any way would take a new migration and legal review first.'
export const workforcePolicyKeyLabel: Readonly<Record<string, string>> = {
  minimum_distinct_owners: 'Different shop owners in the worker progress goal',
}
export const workforcePoliciesEmptyTitle = 'No workforce policies found'
export const workforcePoliciesEmptyText = 'The policy rows are created by the database migrations.'
export const changePolicyModalTitle = 'Change the progress goal'
export const changePolicyAuditText =
  'The change is recorded in the audit log with the old and new value. The reason is kept with the policy and is not copied into the audit log.'

/** Every fixed W10 text, for wording checks. */
export const ownerRelationshipCopyTexts: readonly string[] = [
  ownerProgressTitle,
  ownerProgressNotice,
  ownerProgressCountingText,
  ownerProgressUnavailableTitle,
  ownerProgressUnavailableText,
  findWorkButtonLabel,
  findWorkHintText,
  myRelationshipsHeading,
  myRelationshipsEmptyTitle,
  myRelationshipsEmptyText,
  ownerRelationshipsHeading,
  ownerRelationshipsIntroText,
  ownerRelationshipsEmptyTitle,
  ownerRelationshipsEmptyText,
  workforcePoliciesHeading,
  informationalOnlyLabel,
  workforcePolicyNotice,
  changePolicyModalTitle,
  changePolicyAuditText,
]
