import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toUserFacingError } from '../../../../infrastructure/supabase/supabaseErrorMessages'
import { buildMyCertification, buildOwnerCertification, createCertificationTestHarness, testCertificationIdentifier, testCurrentInstant } from '../../../../test/certificationFixtures'
import { buildShop } from '../../../../test/fixtures'
import { buildMyPlatformReview, buildOwnerPlatformReview, createOversightTestHarness, testPlatformReviewIdentifier } from '../../../../test/oversightFixtures'
import { OwnerCertificationsPanel } from '../../owner/certifications/OwnerCertificationsPanel'
import { MyCertificationsPanel } from './MyCertificationsPanel'

const toastDouble = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastDouble, Toaster: (): null => null }))

const suspendedCertification = buildMyCertification({
  status: 'suspended',
  effectiveStatus: 'suspended',
  statusReason: 'Repeated unsafe chemical handling on the wash floor.',
  statusChangedAt: '2026-10-01T02:00:00Z',
  reviewWindowEndsAt: '2026-10-31T02:00:00Z',
})
const validStatement = 'The shop kept its decision but I was not on shift that day.'
const escalationRefusal =
  'Ask the shop to review this decision first. You can ask WashLink when the shop keeps its decision, has not decided within 14 days, or can no longer decide.'

function renderWorkerPanel(platformReviewHarness: ReturnType<typeof createOversightTestHarness>): ReturnType<typeof createCertificationTestHarness> {
  const certificationHarness = createCertificationTestHarness()
  certificationHarness.certificationRepository.listMyCertifications.mockResolvedValue([suspendedCertification])
  render(
    <MyCertificationsPanel
      certificationDependencies={certificationHarness.certificationDependencies}
      platformReviewService={platformReviewHarness.certificationPlatformReviewService}
      currentInstant={testCurrentInstant}
    />,
  )
  return certificationHarness
}

describe('WashLink certification review (J8, W11)', () => {
  beforeEach(() => {
    toastDouble.success.mockClear()
    toastDouble.error.mockClear()
  })

  it('j8_w11_ask_washlink_review_only_when_eligible', async () => {
    // Not eligible (the database said can_open = false): no WashLink button, the shop review stays.
    const notEligible = createOversightTestHarness()
    notEligible.platformReviewRepository.listMyReviews.mockResolvedValue([buildMyPlatformReview({ canOpen: false })])
    renderWorkerPanel(notEligible)
    const card = (await screen.findAllByRole('listitem'))[0]
    await waitFor(() => {
      expect(notEligible.platformReviewRepository.listMyReviews).toHaveBeenCalled()
    })
    expect(within(card).queryByRole('button', { name: 'Ask WashLink to review' })).toBeNull()
    expect(within(card).getByRole('button', { name: 'Ask for a review' })).toBeInTheDocument()
    cleanup()

    // An open WashLink review: withdraw only; the shop review request is on hold (P68).
    const underReview = createOversightTestHarness()
    underReview.platformReviewRepository.listMyReviews.mockResolvedValue([
      buildMyPlatformReview({ canOpen: false, openReviewId: testPlatformReviewIdentifier, latestStatus: 'open', basis: 'shop_decision_overdue' }),
    ])
    renderWorkerPanel(underReview)
    const reviewNote = await screen.findByRole('note', { name: 'WashLink review' })
    expect(reviewNote).toHaveTextContent('WashLink is reviewing the shop decision.')
    expect(within(reviewNote).getByRole('button', { name: 'Withdraw WashLink review' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ask for a review' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ask WashLink to review' })).toBeNull()
  })

  it('j8_w11_review_modal_validates_statement_and_maps_errors', async () => {
    const user = userEvent.setup()
    const harness = createOversightTestHarness()
    harness.platformReviewRepository.listMyReviews.mockResolvedValue([buildMyPlatformReview({ canOpen: true, basis: 'upheld_by_shop' })])
    harness.platformReviewRepository.openReview
      .mockRejectedValueOnce(toUserFacingError({ code: '23514', message: escalationRefusal }, 'Could not ask WashLink to review this certification.'))
      .mockRejectedValueOnce(toUserFacingError({ code: 'XX000', message: 'relation "certification_platform_reviews" does not exist' }, 'Could not ask WashLink to review this certification.'))
      .mockResolvedValueOnce({ reviewId: testPlatformReviewIdentifier, status: 'open', revision: 1 })
    renderWorkerPanel(harness)
    const askButton = await screen.findByRole('button', { name: 'Ask WashLink to review' })
    expect(screen.getByText('The shop kept its decision after your review request.')).toBeInTheDocument()
    await user.click(askButton)
    const dialog = screen.getByRole('dialog', { name: 'Ask WashLink to review the shop decision' })
    expect(dialog).toHaveTextContent('WashLink does not issue, renew or change certificates; the shop stays the issuer.')

    // Validation before anything is sent.
    await user.click(within(dialog).getByRole('button', { name: 'Send to WashLink' }))
    expect(within(dialog).getByText('Write a statement of 20 to 1000 characters.')).toBeInTheDocument()
    expect(harness.platformReviewRepository.openReview).not.toHaveBeenCalled()

    await user.type(within(dialog).getByLabelText(/Your statement/), validStatement)
    await user.click(within(dialog).getByRole('button', { name: 'Send to WashLink' }))
    // The status the worker saw is sent; a database refusal is shown as its own plain text.
    expect(harness.platformReviewRepository.openReview).toHaveBeenCalledWith(testCertificationIdentifier, 'suspended', validStatement)
    await waitFor(() => {
      expect(toastDouble.error).toHaveBeenCalledWith(escalationRefusal)
    })
    // Raw SQL is never shown.
    await user.click(within(dialog).getByRole('button', { name: 'Send to WashLink' }))
    await waitFor(() => {
      expect(toastDouble.error).toHaveBeenLastCalledWith('Could not ask WashLink to review this certification.')
    })
    await user.click(within(dialog).getByRole('button', { name: 'Send to WashLink' }))
    await waitFor(() => {
      expect(toastDouble.success).toHaveBeenCalledWith('WashLink was asked to review the shop decision.')
    })
  })

  it('j8_w11_owner_sees_washlink_review_status_and_reason', async () => {
    const certificationHarness = createCertificationTestHarness()
    certificationHarness.certificationRepository.listOwnerCertifications.mockResolvedValue([
      buildOwnerCertification({ status: 'suspended', effectiveStatus: 'suspended', statusReason: 'Repeated unsafe chemical handling on the wash floor.' }),
    ])
    const harness = createOversightTestHarness()
    harness.platformReviewRepository.listOwnerReviews.mockResolvedValue([buildOwnerPlatformReview({ status: 'open' })])
    const { unmount } = render(
      <OwnerCertificationsPanel
        certificationDependencies={certificationHarness.certificationDependencies}
        ownerShopList={[buildShop({ verificationStatus: 'approved' })]}
        platformReviewService={harness.certificationPlatformReviewService}
        currentInstant={testCurrentInstant}
      />,
    )
    const reviewNote = await screen.findByRole('note', { name: 'WashLink review' })
    expect(reviewNote).toHaveTextContent('WashLink review open')
    expect(reviewNote).toHaveTextContent('Worker statement: The suspension was based on a day I was not on shift.')
    // Hold: revoke is not offered while WashLink reviews; reinstate stays.
    const list = screen.getByRole('list', { name: 'Certificate list' })
    expect(within(list).queryByRole('button', { name: /Revoke/ })).toBeNull()
    expect(within(list).getByRole('button', { name: /Reinstate/ })).toBeInTheDocument()
    unmount()

    const decidedHarness = createOversightTestHarness()
    decidedHarness.platformReviewRepository.listOwnerReviews.mockResolvedValue([
      buildOwnerPlatformReview({ status: 'upheld', decisionReason: 'The shop record supports the suspension as written.', decidedAt: '2026-10-28T02:00:00Z' }),
    ])
    render(
      <OwnerCertificationsPanel
        certificationDependencies={certificationHarness.certificationDependencies}
        ownerShopList={[buildShop({ verificationStatus: 'approved' })]}
        platformReviewService={decidedHarness.certificationPlatformReviewService}
        currentInstant={testCurrentInstant}
      />,
    )
    const decidedNote = await screen.findByRole('note', { name: 'WashLink review' })
    expect(decidedNote).toHaveTextContent('WashLink review: shop decision kept')
    expect(decidedNote).toHaveTextContent('WashLink review reason: The shop record supports the suspension as written.')
    // Never an administrator name or id.
    expect(decidedNote.textContent).not.toMatch(/admin|super_admin/i)
  })
})
