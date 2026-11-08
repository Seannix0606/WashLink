import { describe, expect, it } from 'vitest'
import { toUserFacingErrorMessage } from '../../infrastructure/supabase/supabaseErrorMessages'
import { contractTemplateCopyConstants, draftLegalReviewNotice, lockedClauseLabel } from './contractTemplateCopy'
import { clauseChangeDisplay, clauseKindDisplay, savedByRoleLabel, templateStatusDisplay } from './contractTemplateDisplay'

// Every message the W8 migrations raise (w8c guards, w8d validator, w8f RPCs), by SQLSTATE.
const w8DatabaseMessages: readonly [string, string][] = [
  ['42501', 'Only shop owners can create contract templates.'],
  ['42501', 'Contract template not found.'],
  ['42501', 'Only WashLink administrators can change the standard template.'],
  ['42501', 'Contract templates are changed only through WashLink.'],
  ['42501', 'Contract template versions cannot be edited.'],
  ['23514', 'Template names must be 3 to 120 characters.'],
  ['23514', 'You can keep up to 25 active templates. Archive one first.'],
  ['23514', 'Archived templates cannot be changed. Restore it first.'],
  ['23514', 'Use the current standard template version.'],
  ['23514', 'This clause is a WashLink safeguard and cannot be changed.'],
  ['23514', 'Editable clauses cannot be empty.'],
  ['23514', 'A clause can hold up to 4000 characters.'],
  ['23514', 'Shop-specific terms are not allowed in this section.'],
  ['23514', 'A version can have up to 40 shop-specific terms.'],
  ['23514', 'Give each shop-specific term a heading of 3 to 160 characters.'],
  ['23514', 'Write each shop-specific term in 10 to 4000 characters.'],
  ['23514', 'A template can keep up to 200 versions. Start a new template from this version.'],
  ['23514', 'Nothing changed since the last version.'],
  ['23514', 'Unknown placeholder {{daily_rate}}.'],
  ['23514', 'Shop text cannot be labelled as a WashLink safeguard.'],
  ['23514', 'A contract template can hold up to 120000 characters.'],
  ['23514', 'The template already has this status.'],
  ['23514', 'Every contract section needs at least one clause (missing: 3, 9).'],
  ['23514', 'The standard template must keep these WashLink safeguard clauses locked: safeguards_prevail, template_is_draft.'],
  ['23514', 'Section 4 must keep the relationship-type placeholder in a WashLink safeguard clause.'],
  ['23514', 'The standard template cannot contain digits or amounts.'],
  ['23514', 'The standard template has only WashLink safeguard and editable clauses.'],
  ['23514', 'Remove invisible characters (such as zero-width spaces) from the text.'],
  ['23514', 'The relationship type and the party names can appear only in WashLink safeguard clauses.'],
  ['23514', 'Each clause of the standard template must appear exactly once.'],
  ['23514', 'These WashLink safeguard clauses must stay in their own sections: classification_reasons, parties_named.'],
  ['23514', 'Section 4 can hold only WashLink safeguard clauses.'],
  ['23514', 'The standard template cannot say it is reviewed, approved, valid, binding, signed or compliant.'],
  ['22023', 'Placeholder values cannot contain {{ or }}.'],
  ['55000', 'This template changed. Reload it and try again.'],
  ['22023', 'Unknown clause.'],
  ['22023', 'Editable clause bodies must be text.'],
  ['22023', 'Shop-specific terms must be a list of section, heading and text.'],
  ['22023', 'Unknown template status.'],
  ['22023', 'Give the standard template as a list of 1 to 120 clauses.'],
  ['22023', 'Each clause needs a section, key, kind, heading and text.'],
]

describe('Contract template copy and errors (W8)', () => {
  it('w8_copy_never_claims_review_or_compliance', () => {
    const everyCopy = [
      ...contractTemplateCopyConstants,
      ...Object.values(clauseKindDisplay).map((display) => display.label),
      ...Object.values(clauseChangeDisplay).map((display) => display.label),
      ...Object.values(templateStatusDisplay).map((display) => display.label),
      ...Object.values(savedByRoleLabel),
    ]
    for (const copyText of everyCopy) {
      // Only the negated disclaimer may mention compliance; nothing says reviewed, approved, valid or signed.
      for (const complianceMention of copyText.matchAll(/complian/gi)) {
        expect(copyText.slice(0, complianceMention.index).toLowerCase()).toMatch(/does not state that this template is legally $/)
      }
      expect(copyText).not.toMatch(/\breviewed\b|\bapproved\b|\bvalid\b|\bvalidated\b|\blegally binding\b|\bcertified\b|e-signature/i)
      expect(copyText).not.toMatch(/\b(signed|signature)\b(?![^(]*\))/i)
    }
    expect(contractTemplateCopyConstants).toContain('Draft — requires review by a qualified Philippine labor-law professional')
    expect(contractTemplateCopyConstants).toContain('Draft template — requires legal review')
    expect(draftLegalReviewNotice).toBe('Draft — requires review by a qualified Philippine labor-law professional')
    expect(lockedClauseLabel).toBe('Platform safeguard — cannot be edited')
    expect(
      contractTemplateCopyConstants.some((copyText) => copyText.includes('recorded acceptance (not an electronic signature)')),
    ).toBe(true)
  })

  it('w8_contract_template_error_messages_mapped', () => {
    for (const [errorCode, databaseMessage] of w8DatabaseMessages) {
      expect(toUserFacingErrorMessage({ code: errorCode, message: databaseMessage }, 'fallback')).toBe(databaseMessage)
    }
    // Raw SQL text and oversized echoes are never passed through.
    expect(toUserFacingErrorMessage({ code: '23514', message: 'new row violates check constraint "ctc_body_check"' }, 'Try again.')).toBe(
      'Some details are outside the allowed limits. Check them and try again.',
    )
    expect(toUserFacingErrorMessage({ code: '23514', message: `Unknown placeholder {{${'x'.repeat(60)}}}.` }, 'Try again.')).toBe(
      'Some details are outside the allowed limits. Check them and try again.',
    )
    expect(toUserFacingErrorMessage({ code: '55000', message: 'lock not available on contract_templates' }, 'Try again.')).toBe('Try again.')
  })
})
