/**
 * W8 contract templates. Template text lives only in immutable, server-hashed versions;
 * the client never sends a locked safeguard clause, a heading of a standard clause, a hash
 * or a classification (D-26: the relationship type is chosen per contract in W9).
 */

export type ContractTemplateStatus = 'active' | 'archived'

export type ContractClauseKind = 'locked_safeguard' | 'editable' | 'shop_specific'

export type ContractTemplateSavedByRole = 'owner' | 'super_admin' | 'trusted_session'

export type ContractClauseChange = 'unchanged' | 'edited' | 'added_by_shop'

/** Row of owner_contract_templates() (w8g). */
export interface OwnerContractTemplate {
  readonly templateId: string
  readonly name: string
  readonly status: ContractTemplateStatus
  readonly currentVersionNumber: number
  readonly currentVersionId: string
  readonly lastSavedAt: string
  readonly basePlatformVersionId: string
  readonly basePlatformVersionNumber: number
  readonly latestPlatformVersionId: string | null
  readonly latestPlatformVersionNumber: number | null
  /** Live state from the server (D-30), never a notification. */
  readonly newerStandardAvailable: boolean
  readonly derivedFromVersionId: string | null
  readonly createdAt: string
}

/** Row of platform_contract_template_current() (w8g). */
export interface StandardContractTemplate {
  readonly templateId: string
  readonly name: string
  readonly versionId: string
  readonly versionNumber: number
  readonly contentHash: string
  readonly createdAt: string
}

/** Row of contract_template_version_history() (w8g), newest first. */
export interface ContractTemplateVersionSummary {
  readonly versionId: string
  readonly versionNumber: number
  readonly createdAt: string
  readonly contentHash: string
  readonly basePlatformVersionId: string | null
  readonly basePlatformVersionNumber: number | null
  readonly editedCount: number
  readonly addedCount: number
  readonly savedByRole: ContractTemplateSavedByRole
  readonly isCurrent: boolean
}

/** Row of contract_template_version_clauses() (w8g), ordered by section and position. */
export interface ContractTemplateClause {
  readonly clauseId: string
  readonly sectionNumber: number
  readonly sectionTitle: string
  readonly reviewNotice: string
  readonly ownerTermsAllowed: boolean
  readonly position: number
  readonly clauseKey: string | null
  readonly kind: ContractClauseKind
  readonly heading: string
  readonly body: string
  readonly requiresOwnerInput: boolean
  readonly sourceClauseId: string | null
}

/** Row of preview_contract_template_version() (w8g): placeholders rendered as labels. */
export interface ContractTemplatePreviewClause {
  readonly clauseId: string
  readonly sectionNumber: number
  readonly sectionTitle: string
  readonly reviewNotice: string
  readonly position: number
  readonly clauseKey: string | null
  readonly kind: ContractClauseKind
  readonly renderedHeading: string
  readonly renderedBody: string
  readonly requiresOwnerInput: boolean
}

/** Row of contract_template_version_diff() (w8g); standard_* is null for shop terms. */
export interface ContractTemplateDiffRow {
  readonly sectionNumber: number
  readonly sectionTitle: string
  readonly position: number
  readonly clauseKey: string | null
  readonly kind: ContractClauseKind
  readonly change: ContractClauseChange
  readonly standardHeading: string | null
  readonly standardBody: string | null
  readonly versionHeading: string
  readonly versionBody: string
}

/** Row of contract_template_placeholders (w8b allowlist). */
export interface ContractTemplatePlaceholder {
  readonly placeholderKey: string
  readonly previewLabel: string
}

export interface ShopSpecificTermInput {
  readonly sectionNumber: number
  readonly heading: string
  readonly body: string
}

/** p_* of save_owner_contract_template_version; never carries a locked clause. */
export interface SaveContractTemplateVersionInput {
  readonly templateId: string
  readonly expectedVersionNumber: number
  readonly basePlatformVersionId: string
  readonly editableBodies: Readonly<Record<string, string>>
  readonly shopTerms: readonly ShopSpecificTermInput[]
}

/** contract_templates row returned by the template RPCs. */
export interface ContractTemplateRecord {
  readonly templateId: string
  readonly name: string
  readonly status: ContractTemplateStatus
  readonly currentVersionNumber: number
}

/** contract_template_versions row returned by the save RPC. */
export interface ContractTemplateVersionRecord {
  readonly versionId: string
  readonly versionNumber: number
  readonly editedCount: number
  readonly addedCount: number
}

/** Mirrors the W8 CHECKs and RPC limits (w8c, w8d, w8f). The database stays the authority. */
export const contractTemplateLimits = {
  nameMinLength: 3,
  nameMaxLength: 120,
  editableBodyMinLength: 1,
  clauseBodyMaxLength: 4000,
  shopTermHeadingMinLength: 3,
  shopTermHeadingMaxLength: 160,
  shopTermBodyMinLength: 10,
  shopTermBodyMaxLength: 4000,
  shopTermsMaximum: 40,
  totalTextMaxLength: 120000,
  activeTemplatesMaximum: 25,
} as const

/** D-27: shop-specific terms are never allowed in these sections (the server also checks). */
export const sectionsWithoutShopTerms: readonly number[] = [1, 4, 14]

/** 55000 from every W8 write when the expected version or status is out of date. */
export const staleContractTemplateMessage = 'This template changed. Reload it and try again.'

export const contractTemplateNotFoundMessage = 'Contract template not found.'
