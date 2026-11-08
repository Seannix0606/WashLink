/**
 * W14 standard contract template publishing wording (D-28, W14-L11). Publishing never makes the
 * template legally reviewed, never changes owner versions or sent contracts, and WashLink is not
 * a party to any contract made from it.
 */

export const standardContractHeading = 'Standard contract template'
export const standardContractIntro =
  'Owners start their templates from this standard. WashLink safeguard clauses are locked; you can change the heading and text of editable clauses.'
export const stillDraftForLegalReviewText =
  'Publishing does not make the standard template legally reviewed. It stays a draft that needs review by a qualified Philippine labor-law professional.'
export const publishEffectText =
  'Owners see that a newer standard is available. Their own template versions and every contract already sent stay exactly as they are. WashLink is not a party to any contract.'
export const standardEditButtonLabel = 'Edit a new version'
export const standardPreviewButtonLabel = 'Preview the current version'
export const standardHistoryHeading = 'Published versions'
export const standardHistoryEmptyText = 'No versions found.'
export const standardEditorHeading = 'New version of the standard'
export const standardChangeCountText = (changedClauseCount: number): string =>
  `${String(changedClauseCount)} editable ${changedClauseCount === 1 ? 'clause' : 'clauses'} changed`
export const standardDiscardLabel = 'Discard changes'
export const standardReviewPublishLabel = 'Review and publish'
export const publishModalTitle = 'Publish a new standard version'
export const publishConfirmLabel = 'Publish'
export const publishedText = 'A new version of the standard was published. It is still a draft for legal review.'
export const staleStandardText = 'This template changed. Reload it and try again.'
export const standardNotFoundTitle = 'No standard template'
export const clauseHeadingLabel = 'Heading'
export const clauseBodyLabel = 'Text'

export const standardContractCopyConstants: readonly string[] = [
  standardContractIntro,
  stillDraftForLegalReviewText,
  publishEffectText,
]
