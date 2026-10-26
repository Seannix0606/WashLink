import type {
  ContractEndedBy,
  ContractOwnerValueKey,
  ContractPartyRole,
  ContractPreviewClause,
  ContractVersionChangeKind,
  ContractVersionKind,
  ContractVersionState,
  WorkerContractOrigin,
  WorkerContractStatus,
} from '../../domain/models/WorkerContract'
import type { ContractDisplayLabel } from './contractTemplateDisplay'

export type ContractViewerRole = 'owner' | 'worker'

const ownerStatusDisplay: Readonly<Record<WorkerContractStatus, ContractDisplayLabel>> = {
  draft: { label: 'Draft (not sent)', tone: 'neutral' },
  sent_for_review: { label: 'Sent, waiting for the worker', tone: 'warning' },
  accepted: { label: 'Accepted, not started', tone: 'info' },
  declined: { label: 'Declined by the worker', tone: 'neutral' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
  active: { label: 'Active', tone: 'success' },
  expired: { label: 'Ended (end date passed)', tone: 'neutral' },
  terminated: { label: 'Ended', tone: 'danger' },
}

const workerStatusDisplay: Readonly<Record<WorkerContractStatus, ContractDisplayLabel>> = {
  ...ownerStatusDisplay,
  sent_for_review: { label: 'Waiting for your answer', tone: 'warning' },
  declined: { label: 'You declined', tone: 'neutral' },
  withdrawn: { label: 'Withdrawn by the shop', tone: 'neutral' },
}

export function contractStatusDisplay(status: WorkerContractStatus, viewerRole: ContractViewerRole): ContractDisplayLabel {
  return viewerRole === 'owner' ? ownerStatusDisplay[status] : workerStatusDisplay[status]
}

export const versionStateLabel: Readonly<Record<ContractVersionState, string>> = {
  draft: 'Draft',
  sent_for_review: 'Sent for review',
  accepted: 'Accepted',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
  superseded: 'Replaced by a later accepted version',
}

export const versionKindLabel: Readonly<Record<ContractVersionKind, string>> = {
  initial: 'Offer',
  amendment: 'Change',
}

export const contractOriginLabel: Readonly<Record<WorkerContractOrigin, string>> = {
  accepted_application: 'Accepted application',
  completed_training: 'Completed training',
}

export const endedByLabel: Readonly<Record<ContractEndedBy, string>> = {
  worker: 'Ended by the worker',
  owner: 'Ended by the shop owner',
  system: 'Ended when the end date passed',
  trusted_session: 'Ended by WashLink support',
}

export const partyRoleLabel: Readonly<Record<ContractPartyRole, string>> = {
  owner: 'Shop owner',
  worker: 'Worker',
}

export const ownerValueLabel: Readonly<Record<ContractOwnerValueKey, string>> = {
  role_title: 'Role title',
  schedule_summary: 'Schedule',
  pay_details: 'Pay details',
}

export const changeKindLabel: Readonly<Record<ContractVersionChangeKind, string>> = {
  clause_changed: 'Clause changed',
  clause_added: 'Clause added',
  clause_removed: 'Clause removed',
  classification_changed: 'Relationship type changed',
  dates_changed: 'Dates changed',
  contract_detail_changed: 'Contract detail changed',
}

export function describeContractDates(startDate: string | null, endDate: string | null): string {
  if (startDate === null) {
    return 'No start date recorded'
  }
  return endDate === null ? `Starts ${startDate}, no end date stated` : `Starts ${startDate}, ends ${endDate}`
}

export function describeVersion(versionNumber: number, kind: ContractVersionKind): string {
  return `Version ${String(versionNumber)} (${versionKindLabel[kind]})`
}

export function describeFlagCount(flagCount: number): string {
  return flagCount === 1 ? '1 keyword match' : `${String(flagCount)} keyword matches`
}

/** One unfilled item of the preview (`<placeholder>`, `clause:<key>`, `shop_term:<section>.<position>`). */
export function describeUnfilledItem(unfilledItem: string, clauses: readonly ContractPreviewClause[]): string {
  if (unfilledItem.startsWith('clause:')) {
    const clauseKey = unfilledItem.slice('clause:'.length)
    const clause = clauses.find((candidate) => candidate.clauseKey === clauseKey)
    return `Write the clause "${clause?.heading ?? clauseKey}"`
  }
  if (unfilledItem.startsWith('shop_term:')) {
    return `Write the shop-specific term ${unfilledItem.slice('shop_term:'.length)}`
  }
  const valueLabel = ownerValueLabel[unfilledItem as ContractOwnerValueKey] as string | undefined
  return valueLabel === undefined ? `Fill in {{${unfilledItem}}}` : `Fill in the ${valueLabel.toLowerCase()}`
}

/** Every fixed label above, for the wording check. */
export const workerContractDisplayLabels: readonly string[] = [
  ...Object.values(ownerStatusDisplay).map((display) => display.label),
  ...Object.values(workerStatusDisplay).map((display) => display.label),
  ...Object.values(versionStateLabel),
  ...Object.values(versionKindLabel),
  ...Object.values(contractOriginLabel),
  ...Object.values(endedByLabel),
  ...Object.values(partyRoleLabel),
  ...Object.values(ownerValueLabel),
  ...Object.values(changeKindLabel),
]
