import {
  sectionsWithoutShopTerms,
  type ContractTemplateClause,
  type ShopSpecificTermInput,
} from '../models/ContractTemplate'
import { normalizeClauseText } from './contractTemplatePlaceholders'

/** One shop-specific term in the editor; `draftId` is local only and never sent. */
export interface ShopTermDraft {
  readonly draftId: string
  readonly sectionNumber: number
  readonly heading: string
  readonly body: string
}

/**
 * Editor state from the current version. Only editable bodies (by clause key) and shop
 * terms are held: locked safeguard clauses and standard headings are never editor state.
 */
export interface ContractTemplateDraft {
  readonly editableBodies: Readonly<Record<string, string>>
  readonly shopTerms: readonly ShopTermDraft[]
}

/** The two save arguments the client may send (p_editable_bodies, p_shop_terms). */
export interface ContractTemplateSaveParts {
  readonly editableBodies: Readonly<Record<string, string>>
  readonly shopTerms: readonly ShopSpecificTermInput[]
}

export interface ContractTemplateSection<Row> {
  readonly sectionNumber: number
  readonly sectionTitle: string
  readonly reviewNotice: string
  readonly rows: readonly Row[]
}

interface SectionedRow {
  readonly sectionNumber: number
  readonly sectionTitle: string
  readonly reviewNotice?: string
}

/** Rows grouped by section in server order (sections 1..15, positions within). */
export function groupBySection<Row extends SectionedRow>(rows: readonly Row[]): ContractTemplateSection<Row>[] {
  const sections: ContractTemplateSection<Row>[] = []
  for (const row of rows) {
    const lastSection = sections.at(-1)
    if (lastSection?.sectionNumber === row.sectionNumber) {
      sections[sections.length - 1] = { ...lastSection, rows: [...lastSection.rows, row] }
    } else {
      sections.push({
        sectionNumber: row.sectionNumber,
        sectionTitle: row.sectionTitle,
        reviewNotice: row.reviewNotice ?? '',
        rows: [row],
      })
    }
  }
  return sections
}

export function createDraftFromClauses(clauses: readonly ContractTemplateClause[]): ContractTemplateDraft {
  const editableBodies: Record<string, string> = {}
  const shopTerms: ShopTermDraft[] = []
  for (const clause of clauses) {
    if (clause.kind === 'editable' && clause.clauseKey !== null) {
      editableBodies[clause.clauseKey] = clause.body
    } else if (clause.kind === 'shop_specific') {
      shopTerms.push({ draftId: clause.clauseId, sectionNumber: clause.sectionNumber, heading: clause.heading, body: clause.body })
    }
  }
  return { editableBodies, shopTerms }
}

/** D-27: a section takes shop terms only when the server allows it and it is not 1, 4 or 14. */
export function canAddShopTermToSection(sectionNumber: number, clauses: readonly ContractTemplateClause[]): boolean {
  if (sectionsWithoutShopTerms.includes(sectionNumber)) {
    return false
  }
  return clauses.some((clause) => clause.sectionNumber === sectionNumber && clause.ownerTermsAllowed)
}

/** Shop terms in section order; the order within a section is kept. */
function orderedShopTerms(shopTerms: readonly ShopTermDraft[]): ShopSpecificTermInput[] {
  return [...shopTerms]
    .map((shopTerm, listIndex) => ({ shopTerm, listIndex }))
    .sort((left, right) => left.shopTerm.sectionNumber - right.shopTerm.sectionNumber || left.listIndex - right.listIndex)
    .map(({ shopTerm }) => ({
      sectionNumber: shopTerm.sectionNumber,
      heading: normalizeClauseText(shopTerm.heading),
      body: normalizeClauseText(shopTerm.body),
    }))
}

/**
 * The save arguments. Only editable clauses the owner changed in this session are sent
 * (an omitted key keeps its current text on the server); locked keys are never included.
 * The full shop-term list is always sent.
 */
export function buildSaveParts(clauses: readonly ContractTemplateClause[], draft: ContractTemplateDraft): ContractTemplateSaveParts {
  const editableBodies: Record<string, string> = {}
  for (const clause of clauses) {
    if (clause.kind !== 'editable' || clause.clauseKey === null || !Object.hasOwn(draft.editableBodies, clause.clauseKey)) {
      continue
    }
    const draftBody = draft.editableBodies[clause.clauseKey]
    if (normalizeClauseText(draftBody) !== normalizeClauseText(clause.body)) {
      editableBodies[clause.clauseKey] = normalizeClauseText(draftBody)
    }
  }
  return { editableBodies, shopTerms: orderedShopTerms(draft.shopTerms) }
}

export function isDraftChanged(clauses: readonly ContractTemplateClause[], draft: ContractTemplateDraft): boolean {
  const saveParts = buildSaveParts(clauses, draft)
  if (Object.keys(saveParts.editableBodies).length > 0) {
    return true
  }
  const savedShopTerms = orderedShopTerms(createDraftFromClauses(clauses).shopTerms)
  return JSON.stringify(savedShopTerms) !== JSON.stringify(saveParts.shopTerms)
}
