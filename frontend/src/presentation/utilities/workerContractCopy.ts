/**
 * Worker contract wording (W9). No string here may say that a contract is signed, binding,
 * valid, approved, lawful or compliant. Allowed only in negated form: "not an e-signature",
 * "not an electronic signature", "not legal advice", "does not check whether ... lawful",
 * "does not mean the terms are lawful", "not certified or official".
 */
import { draftLegalReviewNotice } from './contractTemplateCopy'

/** Same text as contract_acceptances.record_label (w9d CHECK) and the document read. */
export const acceptanceRecordLabel = 'Acceptance record — not an e-signature'

export const contractDraftNotice = draftLegalReviewNotice

export const draftContractLabel = 'Draft template — requires legal review'

export const acceptanceExplanationText =
  'Accepting keeps a record of who accepted which version and when. It is a recorded acceptance (not an electronic signature).'

export const noLegalCheckText = 'WashLink does not check whether a contract is lawful.'

/** Shown if worker_contract_flag_notices() cannot be read; the same text the server returns. */
export const flagDisclaimerFallback =
  'Automatic keyword check. It may miss problems or flag acceptable text. It is not legal advice and WashLink does not check whether terms are lawful.'

export const noFlagMatchFallback = 'No keyword matches. This does not mean the terms are lawful.'

export const ownerContractsIntroText =
  'Draft a contract for a worker with an accepted application or completed training at your shop. The worker reads it and can accept or decline. Every sent version is kept exactly as sent.'

export const myContractsIntroText =
  'Contract offers from shops appear here once they are sent to you. An offer applies only if you accept it. You can always decline an offer or end an accepted contract.'

export const ownerContractsEmptyTitle = 'No worker contracts yet'

export const ownerContractsEmptyDescription =
  'Start a draft for a worker with an accepted application or completed training at your shop.'

export const myContractsEmptyTitle = 'No contract offers'

export const myContractsEmptyDescription = 'When a shop sends you a contract to review, it appears here.'

export const noEligibleWorkersText =
  'No worker can get a contract draft yet. Accept an application or complete a required training first.'

export const classificationHelpText =
  'Choose the relationship type for this contract. Nothing is preselected. The choice has legal consequences; confirm it with a qualified professional.'

export const contractorFallbackAcknowledgement =
  'The relationship type chosen is independent contractor. This choice has legal consequences and should be confirmed with a qualified professional. WashLink does not decide or check it.'

export const ownerValuesHelpText = 'Written by your shop and shown to the worker exactly as typed. WashLink never fills these in.'

export const payDetailsHelpText = 'Write the pay terms in your own words. WashLink does not suggest or fill in any amount.'

export const unsavedBeforeSendText = 'Save your changes before sending.'

export const sendIntroText =
  'Sending seals this version: its text can no longer change. The worker reads exactly this text and can accept or decline.'

export const ownerAmendmentIntroText =
  "This is a proposed change. The worker's current terms stay in force until the worker accepts it."

export const amendmentCurrentTermsStayText = 'Your current terms stay until you accept this change.'

export const declineOfferText = 'Declining ends this offer. You do not need to give a reason.'

export const declineAmendmentText = 'Declining keeps your current contract terms unchanged.'

export const workerTerminateText =
  'You can end this contract at any time. Give a short reason; the shop will see it. Notice periods, final pay and clearance are not handled on WashLink.'

export const ownerTerminateText =
  'This records the end of the contract now. Give a reason; the worker will see it. Any pending change is withdrawn.'

export const shopGoneOfferText = 'This shop is no longer on WashLink, so this offer can only be declined.'

export const partyRemovedText = "The other party left WashLink. This contract record is kept."

export const activateExplanationText =
  'Record the start after the worker accepted and the start date is reached. Training is not productive work: a worker still in required training with your shop cannot start yet.'

export const withdrawOfferText = 'The worker can no longer accept this version. Accepted versions stay unchanged.'

export const discardDraftText = 'This draft was never sent. Discarding removes it.'

export const amendIntroText =
  'A change is a new version. It applies only after the worker accepts it; until then the current version stays in force.'

export const downloadCopyNoteText =
  'Downloads and prints are plain-text copies of the stored record. They are not certified or official documents.'

export const storedTextNoteText = 'This is the stored text of this version, exactly as sent. It cannot change.'

export const flagCountChangedText = 'The keyword check changed since you last looked. Review the flags again before sending.'

export const retainedRecordsTitle = 'Kept application records'

export const retainedRecordsIntroText =
  'These applications were kept after the shop or its owner left WashLink. They show what you applied to.'

export const retainedRecordsEmptyText = 'No kept application records.'

export const contractNotFoundText = 'Contract not found. It may have been removed, or it is not yours.'

export const documentUnavailableText = 'The text of this version is not available.'

/** Every fixed string above, for the wording check. */
export const workerContractCopyConstants: readonly string[] = [
  acceptanceRecordLabel,
  contractDraftNotice,
  draftContractLabel,
  acceptanceExplanationText,
  noLegalCheckText,
  flagDisclaimerFallback,
  noFlagMatchFallback,
  ownerContractsIntroText,
  myContractsIntroText,
  ownerContractsEmptyTitle,
  ownerContractsEmptyDescription,
  myContractsEmptyTitle,
  myContractsEmptyDescription,
  noEligibleWorkersText,
  classificationHelpText,
  contractorFallbackAcknowledgement,
  ownerValuesHelpText,
  payDetailsHelpText,
  unsavedBeforeSendText,
  sendIntroText,
  ownerAmendmentIntroText,
  amendmentCurrentTermsStayText,
  declineOfferText,
  declineAmendmentText,
  workerTerminateText,
  ownerTerminateText,
  shopGoneOfferText,
  partyRemovedText,
  activateExplanationText,
  withdrawOfferText,
  discardDraftText,
  amendIntroText,
  downloadCopyNoteText,
  storedTextNoteText,
  flagCountChangedText,
  retainedRecordsTitle,
  retainedRecordsIntroText,
  retainedRecordsEmptyText,
  contractNotFoundText,
  documentUnavailableText,
]
