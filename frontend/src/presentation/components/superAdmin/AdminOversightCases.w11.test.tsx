import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildAdminDisputeCase,
  buildAdminReviewCase,
  createOversightTestHarness,
  testDisputeIdentifier,
  testPlatformReviewIdentifier,
  testSealedVersionIdentifier,
} from '../../../test/oversightFixtures'
import { CertificationReviewCaseDrawer } from './CertificationReviewCaseDrawer'
import { ContractDisputeCaseDrawer } from './ContractDisputeCaseDrawer'

const toastDouble = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastDouble, Toaster: (): null => null }))

const validReason = 'The issuing shop is gone and the training record shows completion.'

describe('Super_admin review and dispute cases (W11)', () => {
  beforeEach(() => {
    toastDouble.success.mockClear()
    toastDouble.error.mockClear()
  })

  it('w11_admin_review_decision_form_validates_reason', async () => {
    const user = userEvent.setup()
    const harness = createOversightTestHarness()
    harness.platformReviewRepository.fetchAdminCase.mockResolvedValue(buildAdminReviewCase({ revision: 3 }))
    harness.platformReviewRepository.decideReview.mockResolvedValue({ reviewId: testPlatformReviewIdentifier, status: 'reinstated', revision: 4 })
    const onDecided = vi.fn().mockResolvedValue(undefined)
    render(
      <CertificationReviewCaseDrawer
        platformReviewService={harness.certificationPlatformReviewService}
        reviewId={testPlatformReviewIdentifier}
        onClose={vi.fn()}
        onDecided={onDecided}
      />,
    )
    const form = await screen.findByRole('form', { name: 'Decide this WashLink review' })
    expect(screen.getByText('Opening this review is recorded in the audit log.')).toBeInTheDocument()
    // The case is read once (audited), not polled.
    expect(harness.platformReviewRepository.fetchAdminCase).toHaveBeenCalledTimes(1)

    await user.click(within(form).getByRole('button', { name: 'Record decision' }))
    expect(within(form).getByText('Choose reinstate or uphold.')).toBeInTheDocument()
    expect(within(form).getByText('Give a reason of 20 to 500 characters.')).toBeInTheDocument()
    await user.click(within(form).getByLabelText('Reinstate the certificate'))
    await user.type(within(form).getByLabelText(/Reason shown to the worker and the shop/), 'Too short.')
    await user.click(within(form).getByRole('button', { name: 'Record decision' }))
    expect(within(form).getByText('Give a reason of 20 to 500 characters.')).toBeInTheDocument()
    expect(harness.platformReviewRepository.decideReview).not.toHaveBeenCalled()

    await user.clear(within(form).getByLabelText(/Reason shown to the worker and the shop/))
    await user.type(within(form).getByLabelText(/Reason shown to the worker and the shop/), validReason)
    await user.click(within(form).getByRole('button', { name: 'Record decision' }))
    // The revision read with the case is sent back (55000 when it changed).
    await waitFor(() => {
      expect(harness.platformReviewRepository.decideReview).toHaveBeenCalledWith(testPlatformReviewIdentifier, 3, 'reinstate', validReason)
    })
    await waitFor(() => {
      expect(onDecided).toHaveBeenCalled()
    })
    // No control to suspend, revoke, issue or renew exists for WashLink.
    expect(screen.queryByRole('button', { name: /suspend|revoke|issue|renew/i })).toBeNull()
  })

  it('w11_admin_dispute_case_shows_contract_only_while_open', async () => {
    const user = userEvent.setup()
    const harness = createOversightTestHarness()
    harness.disputeRepository.fetchAdminCase.mockResolvedValueOnce(buildAdminDisputeCase('open')).mockResolvedValue(buildAdminDisputeCase('closed'))
    harness.disputeRepository.fetchAdminVersionDocument.mockResolvedValue({
      renderedText: 'Section 1. Parties.',
      contentHash: 'ab'.repeat(32),
      sealedAt: '2026-10-26T03:00:00Z',
      recordLabel: 'Acceptance record — not an e-signature',
    })
    harness.disputeRepository.close.mockResolvedValue({ disputeId: testDisputeIdentifier, status: 'closed', revision: 2 })
    render(
      <ContractDisputeCaseDrawer
        contractDisputeService={harness.contractDisputeService}
        disputeId={testDisputeIdentifier}
        onClose={vi.fn()}
        onClosed={vi.fn().mockResolvedValue(undefined)}
      />,
    )
    const contractRecord = await screen.findByRole('region', { name: 'Contract record' })
    expect(contractRecord).toHaveTextContent('Draft template — requires legal review')
    expect(contractRecord).toHaveTextContent('Ended by the shop owner')
    expect(within(contractRecord).getByRole('list', { name: 'Acceptance records' })).toHaveTextContent('Acceptance record — not an e-signature')
    // The relationship block has a status only: no count, remaining or other owners.
    expect(contractRecord).toHaveTextContent('No counts or other owners are shown.')

    await user.click(within(contractRecord).getByRole('button', { name: 'Read this version' }))
    expect(await within(contractRecord).findByText('Section 1. Parties.')).toBeInTheDocument()
    expect(harness.disputeRepository.fetchAdminVersionDocument).toHaveBeenCalledWith(testDisputeIdentifier, testSealedVersionIdentifier)

    // Closing: kind and note are validated, then the case is re-read and the contract block is gone.
    const closeForm = screen.getByRole('form', { name: 'Close this reported problem' })
    await user.click(within(closeForm).getByRole('button', { name: 'Close the report' }))
    expect(within(closeForm).getByText('Choose how the problem was closed.')).toBeInTheDocument()
    expect(within(closeForm).getByText('Write a note of 20 to 1000 characters.')).toBeInTheDocument()
    await user.selectOptions(within(closeForm).getByLabelText(/How was it closed/), 'referred_outside_washlink')
    await user.type(within(closeForm).getByLabelText(/Note to both parties/), 'We shared where to ask about notice periods.')
    await user.click(within(closeForm).getByRole('button', { name: 'Close the report' }))
    await waitFor(() => {
      expect(harness.disputeRepository.close).toHaveBeenCalledWith({
        disputeId: testDisputeIdentifier,
        expectedRevision: 1,
        resolutionKind: 'referred_outside_washlink',
        resolutionNote: 'We shared where to ask about notice periods.',
      })
    })
    expect(await screen.findByText('This report is no longer open, so the contract record is not shown.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Contract record' })).toBeNull()
    expect(screen.queryByRole('form', { name: 'Close this reported problem' })).toBeNull()
  })
})
