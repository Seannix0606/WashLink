/**
 * Contract template wording (W8). Every template is a draft. No string here may say that a
 * template is reviewed, approved, valid, compliant or signed; the only mention of compliance
 * is the negated disclaimer. Acceptance is a recorded acceptance, not an electronic signature.
 */

/** Same text as contract_template_sections.review_notice (w8b CHECK). */
export const draftLegalReviewNotice = 'Draft — requires review by a qualified Philippine labor-law professional'

export const noComplianceClaimText = 'WashLink does not state that this template is legally compliant.'

export const draftTemplateLabel = 'Draft template — requires legal review'

export const lockedClauseLabel = 'Platform safeguard — cannot be edited'

export const editableClauseLabel = 'Editable'

export const shopSpecificTermLabel = 'Shop-specific term'

export const lockedClauseExplanation =
  'WashLink sets this clause for every shop. It is copied from the standard template and cannot be changed or removed.'

export const placeholderHelpText =
  'Placeholders in double braces are filled in on each contract later. Use only the ones listed here; anything else is refused.'

export const lockedOnlyPlaceholdersText =
  'The relationship type and the party names ({{worker_classification}}, {{owner_full_name}}, {{worker_full_name}}) appear only in platform safeguards and cannot be used in your text.'

export const ownerInputNeededText = 'Write your own text here. Until you do, the bracketed instruction stays in the template.'

export const noShopTermsSectionText = 'Shop-specific terms are not allowed in this section.'

export const classificationNotChosenHereText =
  'The relationship type (section 4) is not chosen in a template. It is chosen for each contract, and nothing is preselected.'

export const acceptanceRecordText =
  'When a worker accepts a contract later, WashLink keeps a recorded acceptance (not an electronic signature).'

export const contractTemplatesIntroText =
  'Start from the WashLink standard template, edit the clauses marked Editable and add shop-specific terms. Every save keeps a new version; earlier versions stay unchanged.'

export const newerStandardBadgeLabel = 'A newer standard template is available'

export const newerStandardExplanation =
  'Updating keeps every clause you edited and your shop-specific terms. Platform safeguards and the clauses you did not edit take the newer standard text.'

export const unsavedChangesBlockUpdateText = 'Save or discard your changes before updating to the newer standard.'

export const archivedTemplateReadOnlyText = 'This template is archived and read-only. Restore it to make changes.'

export const templatesEmptyTitle = 'No contract templates yet'

export const templatesEmptyDescription =
  'Create one from the WashLink standard template. It is a draft that you adapt for your shop.'

export const archivedTemplatesEmptyDescription = 'Archived templates appear here. Their versions are kept.'

export const archiveConfirmMessage =
  'The template and all of its versions are kept. You can restore it later. Archived templates cannot be edited.'

export const standardUnavailableText = 'The standard template could not be found. Try again later.'

export const templateNotFoundText = 'Template not found. It may have been removed, or it is not yours.'

/** Every fixed string above, for the review / compliance wording check. */
export const contractTemplateCopyConstants: readonly string[] = [
  draftLegalReviewNotice,
  noComplianceClaimText,
  draftTemplateLabel,
  lockedClauseLabel,
  editableClauseLabel,
  shopSpecificTermLabel,
  lockedClauseExplanation,
  placeholderHelpText,
  lockedOnlyPlaceholdersText,
  ownerInputNeededText,
  noShopTermsSectionText,
  classificationNotChosenHereText,
  acceptanceRecordText,
  contractTemplatesIntroText,
  newerStandardBadgeLabel,
  newerStandardExplanation,
  unsavedChangesBlockUpdateText,
  archivedTemplateReadOnlyText,
  templatesEmptyTitle,
  templatesEmptyDescription,
  archivedTemplatesEmptyDescription,
  archiveConfirmMessage,
  standardUnavailableText,
  templateNotFoundText,
]
