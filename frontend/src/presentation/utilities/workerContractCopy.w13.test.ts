import { describe, expect, it } from 'vitest'
import { myContractsIntroText, ownerTerminateText, ownerTerminationCautionText, workerContractCopyConstants, workerTerminateText } from './workerContractCopy'

/** Wording that would state a right or a legal effect instead of what WashLink records. */
const legalEffectClaims =
  /\bvalid\b|\blawful\b|\blegally\b|\bbinding\b|\bcomplian|\bguarantee|\bno (notice|consequences?)\b|\bwithout (notice|consequences?)\b|\bterminated by law\b/i

describe('Termination copy (W13, D-73)', () => {
  it('w13_worker_terminate_copy_has_no_unconditional_right_statement', () => {
    expect(workerTerminateText).toBe(
      'You can record the end of this contract on WashLink at any time. Give a short reason; the shop will see it. Notice periods or other duties under your contract or the law may still apply. Final pay and clearance are not handled on WashLink.',
    )
    // The old W9 sentence stated an unconditional right to end the contract (W9 C2, W9-L15).
    for (const copyText of workerContractCopyConstants) {
      expect(copyText).not.toMatch(/can end this contract at any time/i)
    }
    // "At any time" now qualifies recording on WashLink only, and duties may remain.
    expect(workerTerminateText).toMatch(/record the end of this contract on WashLink at any time/)
    expect(workerTerminateText).toContain('may still apply')
    expect(workerTerminateText).not.toMatch(legalEffectClaims)
    // No email, SMS or push claim; the record lives in WashLink.
    expect(workerTerminateText).not.toMatch(/\bemail|\bsms\b|\btext message|\bpush\b/i)
    // The intro still promises only what WashLink offers (decline / end), not a legal outcome.
    expect(myContractsIntroText).not.toMatch(legalEffectClaims)
  })

  it('w13_owner_terminate_copy_has_legal_caution', () => {
    expect(ownerTerminationCautionText).toBe(
      'Ending a work relationship can have legal requirements such as a proper cause and notice. WashLink only records the end.',
    )
    expect(ownerTerminateText.startsWith('This records the end of the contract now. Give a reason; the worker will see it. Any pending change is withdrawn.')).toBe(true)
    expect(ownerTerminateText.endsWith(ownerTerminationCautionText)).toBe(true)
    expect(workerContractCopyConstants).toContain(ownerTerminateText)
    expect(workerContractCopyConstants).toContain(ownerTerminationCautionText)
    // A caution, never a statement that the end is valid, lawful or final in law.
    expect(ownerTerminateText).not.toMatch(legalEffectClaims)
    expect(ownerTerminateText).not.toMatch(/\bsuspend/i)
    expect(workerTerminateText).not.toContain(ownerTerminationCautionText)
  })
})
