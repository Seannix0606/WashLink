import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShopVerificationService } from '../../../../application/services/ShopVerificationService'
import { testShopIdentifier } from '../../../../test/fixtures'
import { buildUnreviewedShop, createModerationTestHarness } from '../../../../test/moderationFixtures'
import { UnreviewedApprovedShopsPanel } from './UnreviewedApprovedShopsPanel'

const toastDouble = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastDouble, Toaster: (): null => null }))

const rereviewNotes = 'Upload a current business permit; the stored one has expired.'

describe('Approved shops without a recorded review (J3, W14)', () => {
  beforeEach(() => {
    toastDouble.success.mockClear()
    toastDouble.error.mockClear()
  })

  it('j3_w14_unreviewed_shops_panel_and_rereview_drawer', async () => {
    const user = userEvent.setup()
    const harness = createModerationTestHarness()
    const listDocumentsForShop = vi.fn().mockResolvedValue([])
    const shopVerificationService = { listDocumentsForShop } as unknown as ShopVerificationService
    harness.oversightRepository.listUnreviewedApprovedShops
      .mockResolvedValueOnce([buildUnreviewedShop(), buildUnreviewedShop({ shopId: 'shop-2', shopName: 'Second Bay', reviewerState: 'reviewer_not_super_admin' })])
      .mockResolvedValue([buildUnreviewedShop({ shopId: 'shop-2', shopName: 'Second Bay', reviewerState: 'reviewer_not_super_admin' })])
    harness.oversightRepository.rereviewShop.mockResolvedValue({ shopId: testShopIdentifier, verificationStatus: 'approved', verificationReviewedAt: '2026-10-29T02:00:00Z' })
    render(<UnreviewedApprovedShopsPanel adminOversightService={harness.adminOversightService} shopVerificationService={shopVerificationService} />)

    const shopList = await screen.findByRole('list', { name: 'Approved without a recorded review' })
    expect(shopList).toHaveTextContent('No reviewer recorded')
    expect(shopList).toHaveTextContent('Reviewer was not a platform administrator')
    expect(shopList).toHaveTextContent('1 published openings · 0 current certificates · 2 active contracts')

    await user.click(within(shopList).getByRole('button', { name: 'Review Legacy Wash Bay' }))
    const dialog = await screen.findByRole('dialog', { name: 'Review an approved shop' })
    // The verification documents are read for this shop (ShopReviewDocumentList is reused).
    expect(listDocumentsForShop).toHaveBeenCalledWith(testShopIdentifier)
    const form = within(dialog).getByRole('form', { name: 'Review this approved shop' })

    await user.click(within(form).getByRole('button', { name: 'Record review' }))
    expect(within(form).getByText('Choose confirm approval, request changes or reject.')).toBeInTheDocument()
    await user.selectOptions(within(form).getByLabelText(/Decision/), 'request_changes')
    await user.click(within(form).getByRole('button', { name: 'Record review' }))
    expect(within(form).getByText('Write notes of 20 to 1000 characters.')).toBeInTheDocument()
    expect(harness.oversightRepository.rereviewShop).not.toHaveBeenCalled()

    // Confirm needs no notes and keeps the shop approved.
    await user.selectOptions(within(form).getByLabelText(/Decision/), 'confirm_approval')
    expect(within(form).getByText(/does not need new documents/)).toBeInTheDocument()
    await user.click(within(form).getByRole('button', { name: 'Record review' }))
    await waitFor(() => {
      expect(harness.oversightRepository.rereviewShop).toHaveBeenCalledWith(testShopIdentifier, 'confirm_approval', null)
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Review an approved shop' })).toBeNull()
    })
    expect(toastDouble.success).toHaveBeenCalledWith('The approval was confirmed and your review is recorded. The owner is told.')
    expect(await screen.findByRole('list', { name: 'Approved without a recorded review' })).not.toHaveTextContent('Legacy Wash Bay')

    // Request changes sends the notes.
    await user.click(screen.getByRole('button', { name: 'Review Second Bay' }))
    const secondForm = await screen.findByRole('form', { name: 'Review this approved shop' })
    await user.selectOptions(within(secondForm).getByLabelText(/Decision/), 'request_changes')
    await user.click(within(secondForm).getByLabelText(/Notes to the owner/))
    await user.paste(rereviewNotes)
    await user.click(within(secondForm).getByRole('button', { name: 'Record review' }))
    await waitFor(() => {
      expect(harness.oversightRepository.rereviewShop).toHaveBeenLastCalledWith('shop-2', 'request_changes', rereviewNotes)
    })
  })
})
