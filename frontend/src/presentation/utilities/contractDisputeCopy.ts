import type { ContractDisputeCategory, ContractDisputeResolutionKind, ContractDisputeStatus } from '../../domain/models/ContractDispute'

/**
 * W11 reported contract problem wording (D-47, W11-L5, W11-L6). WashLink is not a party to a
 * contract: it records the problem, can read the contract while the problem is open, and closes it
 * with a note. It never changes, restarts or ends a contract, decides pay or decides legal rights.
 */

export const washLinkCannotChangeContractText =
  'WashLink can read this contract only while the problem is open. WashLink cannot change, restart or end a contract, decide pay or decide legal rights. For those, contact the proper government office or a lawyer.'

export const reportProblemButtonLabel = 'Report a problem'

export const reportProblemTitle = 'Report a problem with this contract'

export const reportProblemIntro =
  'Your report, including what you write, is shown to the other party and to WashLink. The other party can add their side once. A WashLink administrator reads the report and closes it with a note to both of you.'

export const reportProblemWindowText =
  'You can report a problem on WashLink up to 90 days after a contract ends, at most 3 times per contract. This is a WashLink limit only. It does not affect any deadline for raising the matter with a government office.'

export const problemCategoryLabel = 'What is the problem about?'

export const problemCategoryPlaceholder = 'Choose a category'

export const problemStatementLabel = 'Describe the problem (required, 20 to 1000 characters)'

export const problemStatementGuidance =
  'What you write here is shown to the other party and to WashLink. Write facts only. Do not include phone numbers, addresses or other private details.'

export const sendProblemButtonLabel = 'Send report'

export const respondProblemTitle = 'Add your side'

export const respondProblemIntro = 'You can add your side once. It is shown to the other party and to WashLink.'

export const respondProblemButtonLabel = 'Add your side'

export const respondStatementLabel = 'Your side (required, 20 to 1000 characters)'

export const withdrawProblemButtonLabel = 'Withdraw report'

export const withdrawProblemTitle = 'Withdraw this report?'

export const withdrawProblemMessage = 'WashLink will not look at it further. The contract stays as it is.'

export const disputeListHeading = 'Reported problems'

export const disputeListEmptyText = 'No reported problems.'

export const washLinkViewedText = 'WashLink has opened this report.'

export const contractDisputeCategoryLabel: Readonly<Record<ContractDisputeCategory, string>> = {
  owner_ended_contract: 'The shop owner ended the contract',
  worker_ended_contract: 'The worker ended the contract',
  contract_terms: 'Contract terms',
  amendment: 'A proposed change',
  acceptance_record: 'An acceptance record',
  other: 'Something else',
}

export const contractDisputeStatusLabel: Readonly<Record<ContractDisputeStatus, string>> = {
  open: 'Open',
  closed: 'Closed by WashLink',
  withdrawn: 'Withdrawn',
}

export const contractDisputeResolutionLabel: Readonly<Record<ContractDisputeResolutionKind, string>> = {
  information_shared: 'Information shared',
  referred_outside_washlink: 'Referred outside WashLink',
  no_platform_action: 'No WashLink action',
}

export const adminDisputeQueueHeading = 'Contract disputes'

export const adminDisputeQueueIntro =
  'Problems workers and owners reported with a contract. Open one to read the report, the answer and, while it is open, the contract record. WashLink closes a report with a note; it never changes the contract.'

export const adminDisputeEmptyTitle = 'No reported problems here'

export const adminDisputeEmptyText = 'Reported contract problems appear here, oldest first.'

export const adminDisputeCaseAuditedText = 'Every time you open this report or a contract version, it is recorded in the audit log.'

export const adminDisputeContractHiddenText = 'This report is no longer open, so the contract record is not shown.'

export const adminRelationshipNoteText = 'Status of this worker with this owner only. No counts or other owners are shown.'

export const closeDisputeKindLabel = 'How was it closed?'

export const closeDisputeNoteLabel = 'Note to both parties (required, 20 to 1000 characters)'

export const closeDisputeNoteGuidance =
  'Explain what WashLink did. Do not decide pay or legal rights; for those, point to the proper government office or a lawyer.'

export const closeDisputeButtonLabel = 'Close the report'

export const viewVersionTextLabel = 'Read this version'

/** Every fixed string above, for the wording checks. */
export const contractDisputeCopyConstants: readonly string[] = [
  washLinkCannotChangeContractText,
  reportProblemTitle,
  reportProblemIntro,
  reportProblemWindowText,
  problemStatementLabel,
  problemStatementGuidance,
  respondProblemIntro,
  withdrawProblemMessage,
  washLinkViewedText,
  ...Object.values(contractDisputeCategoryLabel),
  ...Object.values(contractDisputeStatusLabel),
  ...Object.values(contractDisputeResolutionLabel),
  adminDisputeQueueIntro,
  adminDisputeCaseAuditedText,
  adminDisputeContractHiddenText,
  adminRelationshipNoteText,
  closeDisputeNoteGuidance,
]
