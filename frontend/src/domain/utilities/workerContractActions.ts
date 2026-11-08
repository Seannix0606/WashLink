import type {
  MyWorkerContract,
  OwnerContractAction,
  OwnerWorkerContract,
  WorkerContractAction,
  WorkerContractStatus,
} from '../models/WorkerContract'

/**
 * Which buttons each party sees (W9 PLAN 4, w9h allowed_actions). The UI only hides what a
 * role cannot do; every RPC re-checks. Owners never see accept / decline; workers never see
 * send, activate or amend.
 */

const openRelationshipStatuses: readonly WorkerContractStatus[] = ['accepted', 'active']

export function isRelationshipOpen(effectiveStatus: WorkerContractStatus): boolean {
  return openRelationshipStatuses.includes(effectiveStatus)
}

/** Owner actions from the contract state, kept only when the server also offers them. */
export function ownerContractActions(contract: OwnerWorkerContract): readonly OwnerContractAction[] {
  if (contract.isOwnerRemoved || contract.isShopRemoved || contract.shopId === null) {
    return []
  }
  const isOpen = isRelationshipOpen(contract.effectiveStatus)
  const hasDraft = contract.draftVersionId !== null
  const hasPending = contract.pendingVersionId !== null
  const derived: OwnerContractAction[] = []
  if (hasDraft) {
    derived.push('save_draft', 'send', 'discard')
  }
  if (hasPending) {
    derived.push(contract.pendingVersionKind === 'initial' ? 'withdraw' : 'withdraw_amendment')
  }
  if (contract.effectiveStatus === 'accepted') {
    derived.push('activate')
  }
  if (isOpen && !hasDraft && !hasPending && contract.workerId !== null) {
    derived.push('amend')
  }
  if (isOpen) {
    derived.push('terminate')
  }
  return derived.filter((action) => contract.allowedActions.includes(action))
}

/**
 * Worker actions. Decline (while an offer or change is pending) and Terminate (while the
 * relationship is accepted or active) are ALWAYS offered, whatever the shop's verification or
 * presence (P52). Accept is hidden when the shop or owner left WashLink.
 */
export function workerContractActions(contract: MyWorkerContract): readonly WorkerContractAction[] {
  const actions: WorkerContractAction[] = []
  if (contract.pendingVersionId !== null) {
    const isAmendment = contract.pendingVersionKind === 'amendment'
    const acceptAction: WorkerContractAction = isAmendment ? 'accept_amendment' : 'accept'
    const isPartyPresent = !contract.isOwnerRemoved && !contract.isShopRemoved && contract.shopId !== null
    if (isPartyPresent && contract.allowedActions.includes(acceptAction)) {
      actions.push(acceptAction)
    }
    actions.push(isAmendment ? 'decline_amendment' : 'decline')
  }
  if (isRelationshipOpen(contract.effectiveStatus) || contract.allowedActions.includes('terminate')) {
    actions.push('terminate')
  }
  return actions
}

export function canWorkerDecline(contract: MyWorkerContract): boolean {
  const actions = workerContractActions(contract)
  return actions.includes('decline') || actions.includes('decline_amendment')
}

export function canWorkerAccept(contract: MyWorkerContract): boolean {
  const actions = workerContractActions(contract)
  return actions.includes('accept') || actions.includes('accept_amendment')
}
