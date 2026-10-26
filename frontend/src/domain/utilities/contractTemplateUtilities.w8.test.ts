import { describe, expect, it } from 'vitest'
import { editableBodySchema, findOwnerTextProblem, shopTermBodySchema, shopTermHeadingSchema } from '../../application/validation/contractTemplateSchemas'
import { diffClauseWords, type ClauseDiffSegment } from './clauseTextDiff'
import {
  contractTemplatePlaceholderKeys,
  findPlaceholderProblem,
  lockedOnlyPlaceholderKeys,
  ownerUsablePlaceholderKeys,
  placeholdersIn,
} from './contractTemplatePlaceholders'

// The w8b seed (contract_template_placeholders), in insert order.
const databasePlaceholderKeys = [
  'owner_full_name',
  'worker_full_name',
  'shop_name',
  'shop_address',
  'role_title',
  'worker_classification',
  'start_date',
  'end_date',
  'schedule_summary',
  'pay_details',
]

function rebuild(segments: readonly ClauseDiffSegment[], keptKind: 'removed' | 'added'): string {
  return segments.filter((segment) => segment.kind === 'same' || segment.kind === keptKind).map((segment) => segment.text).join('')
}

describe('Contract template utilities (W8)', () => {
  it('w8_placeholder_validation_matches_allowlist', () => {
    expect(contractTemplatePlaceholderKeys).toEqual(databasePlaceholderKeys)
    for (const placeholderKey of databasePlaceholderKeys) {
      expect(findPlaceholderProblem(`Text with {{${placeholderKey}}} inside.`)).toBeNull()
    }
    expect(placeholdersIn('{{shop_name}} and {{pay_details}} and {{shop_name}}')).toEqual(['pay_details', 'shop_name'])
    // Same messages as contract_template_placeholders_in (w8d): first unknown key in sorted order.
    expect(findPlaceholderProblem('Pay {{wage_amount}} to {{worker_name}}.')).toBe('Unknown placeholder {{wage_amount}}.')
    expect(findPlaceholderProblem('Pay {{ pay_details }}.')).toBe('Unknown placeholder {{ pay_details }}.')
    expect(findPlaceholderProblem('Broken {{pay_details here.')).toBe('Unknown placeholder {{pay_details here.}}.')
    expect(findPlaceholderProblem('Stray braces }} here.')).toBe('Unknown placeholder {{Stray braces }}.')
    // The zod schemas apply the same rule, plus the no-impersonation rule.
    expect(editableBodySchema.safeParse('Hours: {{schedule_summary}}').success).toBe(true)
    expect(editableBodySchema.safeParse('Daily rate {{daily_rate}}').error?.issues[0]?.message).toBe('Unknown placeholder {{daily_rate}}.')
    expect(shopTermBodySchema.safeParse('This is a WashLink safeguard clause.').error?.issues[0]?.message).toBe(
      'Shop text cannot be labelled as a WashLink safeguard.',
    )
    expect(editableBodySchema.safeParse('   ').error?.issues[0]?.message).toBe('Editable clauses cannot be empty.')
  })

  it('w8_clause_text_diff_word_level', () => {
    const standardText = '[Shop: the business and where the work happens.]'
    const versionText = 'Our business: the main wash bay, where the work happens daily.'
    const segments = diffClauseWords(standardText, versionText)
    expect(rebuild(segments, 'removed')).toBe(standardText)
    expect(rebuild(segments, 'added')).toBe(versionText)
    expect(segments.some((segment) => segment.kind === 'same' && segment.text.includes('where the work'))).toBe(true)
    // Whole words, never partial characters.
    for (const segment of segments.filter((changedSegment) => changedSegment.kind !== 'same')) {
      expect(segment.text.trim().split(/\s+/).every((word) => standardText.includes(word) || versionText.includes(word))).toBe(true)
    }
    expect(diffClauseWords('Same text.', 'Same text.')).toEqual([{ kind: 'same', text: 'Same text.' }])
    expect(diffClauseWords('', 'Added only.')).toEqual([{ kind: 'added', text: 'Added only.' }])
    expect(diffClauseWords('one two three', 'one three')).toEqual([
      { kind: 'same', text: 'one ' },
      { kind: 'removed', text: 'two ' },
      { kind: 'same', text: 'three' },
    ])
  })

  it('w8_owner_text_rules_match_server', () => {
    const impersonationMessage = 'Shop text cannot be labelled as a WashLink safeguard.'
    const invisibleMessage = 'Remove invisible characters (such as zero-width spaces) from the text.'
    const lockedOnlyMessage = 'The relationship type and the party names can appear only in WashLink safeguard clauses.'
    // Same normalisation as the server: lower-case, letters and digits only.
    for (const impersonation of [
      'WashLink safeguard',
      'washlink-SAFEGUARD',
      'This is a Wash Link safe guard.',
      'W.a.s.h.L.i.n.k_safeguard',
      'Platform safeguard: no changes',
      'platform\nsafe-guard',
    ]) {
      expect(findOwnerTextProblem(impersonation)).toBe(impersonationMessage)
    }
    expect(findOwnerTextProblem('Safety rules for the wash platform are posted at the bay.')).toBeNull()
    // Invisible characters (written as escapes, never literally): U+200B..U+200F, U+2060, U+FEFF.
    for (const invisibleCharacter of ['\u200B', '\u200C', '\u200D', '\u200E', '\u200F', '\u2060', '\uFEFF']) {
      expect(findOwnerTextProblem(`Uniform${invisibleCharacter} care`)).toBe(invisibleMessage)
    }
    // Hiding the words with a zero-width space is refused too.
    expect(findOwnerTextProblem('Wash\u200BLink safeguard')).toBe(invisibleMessage)
    // The relationship type and the party names are locked-only placeholders.
    expect(lockedOnlyPlaceholderKeys).toEqual(['worker_classification', 'owner_full_name', 'worker_full_name'])
    expect(ownerUsablePlaceholderKeys.filter((placeholderKey) => lockedOnlyPlaceholderKeys.includes(placeholderKey))).toEqual([])
    for (const lockedOnlyKey of lockedOnlyPlaceholderKeys) {
      expect(findOwnerTextProblem(`Agreement with {{${lockedOnlyKey}}}.`)).toBe(lockedOnlyMessage)
    }
    for (const usableKey of ownerUsablePlaceholderKeys) {
      expect(findOwnerTextProblem(`Agreed: {{${usableKey}}}.`)).toBeNull()
    }
    expect(shopTermHeadingSchema.safeParse('Platform Safeguard').error?.issues[0]?.message).toBe(impersonationMessage)
    expect(editableBodySchema.safeParse('Type: {{worker_classification}}').error?.issues[0]?.message).toBe(lockedOnlyMessage)
  })
})
