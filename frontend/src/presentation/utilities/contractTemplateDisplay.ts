import type {
  ContractClauseChange,
  ContractClauseKind,
  ContractTemplateSavedByRole,
  ContractTemplateStatus,
} from '../../domain/models/ContractTemplate'
import type { BadgeTone } from '../design/ui'
import { editableClauseLabel, lockedClauseLabel, shopSpecificTermLabel } from './contractTemplateCopy'

export interface ContractDisplayLabel {
  readonly label: string
  readonly tone: BadgeTone
}

export const clauseKindDisplay: Readonly<Record<ContractClauseKind, ContractDisplayLabel>> = {
  locked_safeguard: { label: lockedClauseLabel, tone: 'neutral' },
  editable: { label: editableClauseLabel, tone: 'brand' },
  shop_specific: { label: shopSpecificTermLabel, tone: 'info' },
}

export const clauseChangeDisplay: Readonly<Record<ContractClauseChange, ContractDisplayLabel>> = {
  unchanged: { label: 'Unchanged', tone: 'neutral' },
  edited: { label: 'Edited by your shop', tone: 'warning' },
  added_by_shop: { label: 'Added by your shop', tone: 'info' },
}

export const templateStatusDisplay: Readonly<Record<ContractTemplateStatus, ContractDisplayLabel>> = {
  active: { label: 'Active', tone: 'success' },
  archived: { label: 'Archived', tone: 'neutral' },
}

export const savedByRoleLabel: Readonly<Record<ContractTemplateSavedByRole, string>> = {
  owner: 'Saved by you',
  super_admin: 'Published by WashLink',
  trusted_session: 'Set up by WashLink',
}

/** First 8 characters of the server content hash (a version fingerprint, not a signature). */
export function shortContentHash(contentHash: string): string {
  return contentHash.slice(0, 8)
}

export function describeVersionCounts(editedCount: number, addedCount: number): string {
  const editedText = editedCount === 1 ? '1 clause edited' : `${String(editedCount)} clauses edited`
  const addedText = addedCount === 1 ? '1 shop-specific term' : `${String(addedCount)} shop-specific terms`
  return `${editedText}, ${addedText}`
}

export function describeStandardBase(basePlatformVersionNumber: number | null): string {
  return basePlatformVersionNumber === null ? 'Standard template' : `Based on standard version ${String(basePlatformVersionNumber)}`
}
