import type { Shop } from '../models/Shop'

export type OwnerOnboardingStepKey =
  | 'account'
  | 'shop_registered'
  | 'documents'
  | 'submitted'
  | 'approved'

export type OwnerOnboardingStepState = 'done' | 'todo' | 'attention'

export interface OwnerOnboardingStep {
  readonly stepKey: OwnerOnboardingStepKey
  readonly stepState: OwnerOnboardingStepState
}

export interface OwnerOnboardingChecklistInput {
  readonly focusShop: Shop | null
  /** null while unknown (loading or failed); never guessed. */
  readonly hasAllRequiredDocuments: boolean | null
}

const shopProgressRank: Readonly<Record<Shop['verificationStatus'], number>> = {
  approved: 3,
  pending: 2,
  changes_requested: 1,
  rejected: 0,
}

/** The shop the checklist describes: the most advanced one in the review flow. */
export function selectOnboardingFocusShop(
  ownerShopList: readonly Shop[],
): Shop | null {
  let focusShop: Shop | null = null
  for (const ownerShop of ownerShopList) {
    if (
      focusShop === null ||
      shopProgressRank[ownerShop.verificationStatus] >
        shopProgressRank[focusShop.verificationStatus] ||
      (ownerShop.verificationStatus === focusShop.verificationStatus &&
        ownerShop.verificationSubmittedAt !== null &&
        focusShop.verificationSubmittedAt === null)
    ) {
      focusShop = ownerShop
    }
  }
  return focusShop
}

function resolveSubmittedStepState(focusShop: Shop): OwnerOnboardingStepState {
  if (focusShop.verificationStatus === 'approved') {
    return 'done'
  }
  if (
    focusShop.verificationStatus === 'changes_requested' ||
    focusShop.verificationStatus === 'rejected'
  ) {
    return 'attention'
  }
  return focusShop.verificationSubmittedAt !== null ? 'done' : 'todo'
}

/** Pure: owner onboarding progress, derived only from stored shop data. */
export function buildOwnerOnboardingChecklist({
  focusShop,
  hasAllRequiredDocuments,
}: OwnerOnboardingChecklistInput): readonly OwnerOnboardingStep[] {
  if (focusShop === null) {
    return [
      { stepKey: 'account', stepState: 'done' },
      { stepKey: 'shop_registered', stepState: 'todo' },
      { stepKey: 'documents', stepState: 'todo' },
      { stepKey: 'submitted', stepState: 'todo' },
      { stepKey: 'approved', stepState: 'todo' },
    ]
  }

  const isApproved = focusShop.verificationStatus === 'approved'
  return [
    { stepKey: 'account', stepState: 'done' },
    { stepKey: 'shop_registered', stepState: 'done' },
    {
      stepKey: 'documents',
      stepState: isApproved || hasAllRequiredDocuments === true ? 'done' : 'todo',
    },
    { stepKey: 'submitted', stepState: resolveSubmittedStepState(focusShop) },
    { stepKey: 'approved', stepState: isApproved ? 'done' : 'todo' },
  ]
}
