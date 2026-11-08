import { describe, expect, it } from 'vitest'
import { toUserFacingErrorMessage } from '../../infrastructure/supabase/supabaseErrorMessages'
import { acceptanceRecordLabel, workerContractCopyConstants } from './workerContractCopy'
import { workerContractDisplayLabels } from './workerContractDisplay'

/** The only allowed mentions: negated, never a claim. */
const allowedNegatedPhrases: readonly RegExp[] = [
  /not an e-signature/gi,
  /not an electronic signature/gi,
  /it is not legal advice/gi,
  /washlink does not check whether (terms are|a contract is) lawful/gi,
  /this does not mean the terms are lawful/gi,
  /not certified or official/gi,
]

const forbiddenClaims =
  /\bsigned\b|\bsignatures?\b|\be-?sign|\bvalid(ated|ity)?\b|\bbinding\b|complian|\bapproved\b|\blawful\b|\blegal advice\b|\bcertified\b|\bguarantee|\benforceable\b|\blegally reviewed\b/i

// Every message the W9 migrations raise on purpose (docs/workforce/WORKER_CONTRACTS.md, "Messages").
const w9DatabaseMessages: readonly [string, string][] = [
  ['42501', 'Contract not found.'],
  ['42501', 'This contract change is not allowed.'],
  ['42501', 'Contracts are changed only through WashLink.'],
  ['42501', 'Sent contract versions cannot be edited.'],
  ['42501', 'Acceptance records are created only by the accepting party.'],
  ['42501', 'Acceptance records cannot be changed.'],
  ['42501', 'Contract template not found.'],
  ['23514', 'You can draft a contract only for a worker with an accepted application or completed training at this shop.'],
  ['23514', 'Choose a contract template.'],
  ['23514', 'Use the current standard template version.'],
  ['23514', 'Archived templates cannot be changed. Restore it first.'],
  ['23514', 'Choose the relationship type for this contract.'],
  ['23514', 'Unknown relationship type.'],
  ['23514', 'Give a start date.'],
  ['23514', 'The end date cannot be before the start date.'],
  ['23514', 'Write the role title in 3 to 120 characters.'],
  ['23514', 'Write the schedule in 3 to 500 characters.'],
  ['23514', 'Write the pay details in 3 to 1000 characters.'],
  ['23514', 'This clause is a WashLink safeguard and cannot be changed.'],
  ['23514', 'Editable clauses cannot be empty.'],
  ['23514', 'A clause can hold up to 4000 characters.'],
  ['23514', 'Shop-specific terms are not allowed in this section.'],
  ['23514', 'Your shop needs a recorded verification before you send a contract.'],
  ['23514', 'The start date cannot be in the past.'],
  ['23514', 'Fill in every shop clause and contract detail before sending (missing: pay_details, clause:pay_terms, shop_term:15.2).'],
  ['23514', 'Confirm the offer statement before sending.'],
  ['23514', 'Confirm the independent contractor acknowledgement.'],
  ['23514', 'Confirm the acceptance statement before accepting.'],
  ['23514', 'This shop is no longer on WashLink, so this offer can only be declined.'],
  ["23514", "This shop's verification is not current. You can decline or wait."],
  ['23514', 'Keep the note to 500 characters.'],
  ['23514', 'Give a reason of 10 to 500 characters.'],
  ['23514', 'The contract start date has not been reached yet.'],
  ['23514', 'Your shop needs a recorded verification before you record the start.'],
  ['23514', 'This worker is still in required training with your shop. Training is not productive work, so the contract cannot start yet.'],
  ['23514', 'The contract hash does not match its text.'],
  ['23514', 'Every clause of the standard template must stay in place (pay_terms).'],
  ['23505', 'This worker already has an open contract with this shop.'],
  ['23505', 'This contract already has an open change.'],
  ['55000', 'This contract changed. Reload it and try again.'],
  ['55000', 'This contract changed. Read the new version before you accept.'],
  ['55000', 'The keyword check changed. Review the flags again.'],
  ['22023', 'Contract details must be text.'],
  ['22023', 'Unknown contract detail.'],
  ['22023', 'Placeholder values cannot contain {{ or }}.'],
  ['22023', 'Unknown clause.'],
  ['22023', 'Editable clause bodies must be text.'],
  ['22023', 'The expiry date cannot be in the past.'],
]

describe('Worker contract copy and errors (W9)', () => {
  it('w9_copy_never_claims_signature_validity_or_compliance', () => {
    const everyCopy = [...workerContractCopyConstants, ...workerContractDisplayLabels]
    expect(everyCopy.length).toBeGreaterThan(60)
    for (const copyText of everyCopy) {
      const withoutNegations = allowedNegatedPhrases.reduce((remainingText, allowedPhrase) => remainingText.replace(allowedPhrase, ''), copyText)
      expect(withoutNegations, copyText).not.toMatch(forbiddenClaims)
    }
    expect(acceptanceRecordLabel).toBe('Acceptance record — not an e-signature')
    expect(workerContractCopyConstants).toContain('Draft — requires review by a qualified Philippine labor-law professional')
    expect(workerContractCopyConstants).toContain('Draft template — requires legal review')
    expect(workerContractCopyConstants.some((copyText) => copyText.includes('recorded acceptance (not an electronic signature)'))).toBe(true)
    expect(workerContractCopyConstants).toContain('Your current terms stay until you accept this change.')
  })

  it('w9_worker_contract_error_messages_mapped', () => {
    for (const [errorCode, databaseMessage] of w9DatabaseMessages) {
      expect(toUserFacingErrorMessage({ code: errorCode, message: databaseMessage }, 'fallback')).toBe(databaseMessage)
    }
    // Raw SQL text and oversized or unexpected echoes are never passed through.
    expect(toUserFacingErrorMessage({ code: '23514', message: 'new row violates check constraint "wc_lifecycle_consistency"' }, 'Try again.')).toBe(
      'Some details are outside the allowed limits. Check them and try again.',
    )
    expect(
      toUserFacingErrorMessage({ code: '23514', message: `Fill in every shop clause and contract detail before sending (missing: ${'x'.repeat(700)}).` }, 'Try again.'),
    ).toBe('Some details are outside the allowed limits. Check them and try again.')
    expect(
      toUserFacingErrorMessage({ code: '23514', message: 'Fill in every shop clause and contract detail before sending (missing: <script>).' }, 'Try again.'),
    ).toBe('Some details are outside the allowed limits. Check them and try again.')
    expect(toUserFacingErrorMessage({ code: '55000', message: 'could not obtain lock on row in relation "worker_contracts"' }, 'Try again.')).toBe('Try again.')
  })
})
