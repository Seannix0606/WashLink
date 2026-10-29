import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ReportContractProblemModal } from '../components/contracts/ReportContractProblemModal'
import { contractDisputeCopyConstants, washLinkCannotChangeContractText } from './contractDisputeCopy'
import { platformReviewCopyConstants } from './platformReviewCopy'
import { workforceDashboardCopyConstants } from './workforceDashboardCopy'

/** D-45 / D-47: WashLink is neither the issuer of a certificate nor a party to a contract. */
const issuerOrPartyClaims: readonly RegExp[] = [
  /WashLink[- ](issued|certified|certificate)/i,
  /WashLink (issues|certifies|grants|awards)\b/i,
  /issued by WashLink/i,
  /WashLink (will|can) (change|restart|end|reinstate|terminate) (the|a|this|your) contract/i,
  /\b(binding|enforceable|legally valid|compliant|e-?signed)\b/i,
  /WashLink (decides|will decide) (pay|legal rights)/i,
]

describe('W11 oversight copy (J16)', () => {
  it('j16_w11_dispute_copy_says_washlink_cannot_change_contract', () => {
    expect(washLinkCannotChangeContractText).toBe(
      'WashLink can read this contract only while the problem is open. WashLink cannot change, restart or end a contract, decide pay or decide legal rights. For those, contact the proper government office or a lawyer.',
    )
    for (const copyText of [...contractDisputeCopyConstants, ...platformReviewCopyConstants, ...workforceDashboardCopyConstants]) {
      for (const forbiddenClaim of issuerOrPartyClaims) {
        expect(copyText).not.toMatch(forbiddenClaim)
      }
    }
    // The WashLink review is described as a review of the shop's decision; the shop stays the issuer.
    expect(platformReviewCopyConstants.some((copyText) => copyText.includes('the shop stays the issuer'))).toBe(true)

    // The report dialog shows the notice before anything is sent.
    render(
      <ReportContractProblemModal
        target={{ contractId: 'contract-1', subjectText: 'Contract with Test Wash Bay', raiserRole: 'worker', endedBy: null }}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const dialog = screen.getByRole('dialog', { name: 'Report a problem with this contract' })
    expect(within(dialog).getByRole('note')).toHaveTextContent(washLinkCannotChangeContractText)
  })
})
