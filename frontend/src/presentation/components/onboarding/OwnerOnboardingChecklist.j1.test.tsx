import { render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ShopVerificationService } from '../../../application/services/ShopVerificationService'
import type { ShopVerificationDocumentType } from '../../../domain/models/ShopVerificationDocument'
import {
  buildShop,
  createMockShopVerificationRepository,
  testShopIdentifier,
} from '../../../test/fixtures'
import { OwnerOnboardingChecklist } from './OwnerOnboardingChecklist'

const requiredDocumentTypes: readonly ShopVerificationDocumentType[] = [
  'business_permit',
  'dti_sec_registration',
  'mayors_permit',
  'valid_government_id',
]

function buildUploadedDocuments(): ReturnType<
  ShopVerificationService['listDocumentsForShop']
> {
  return Promise.resolve(
    requiredDocumentTypes.map((documentType) => ({
      id: `document-${documentType}`,
      shopIdentifier: testShopIdentifier,
      documentType,
      storagePath: `${testShopIdentifier}/${documentType}.pdf`,
      fileName: null,
      fileSizeBytes: null,
      contentType: null,
      uploadedByIdentifier: null,
      uploadedAt: '2026-10-24T00:00:00+00:00',
    })),
  )
}

function readStepState(stepLabel: string): string {
  const checklist = screen.getByRole('list')
  const stepItem = within(checklist).getByText(stepLabel).closest('li')
  return stepItem?.textContent ?? ''
}

describe('OwnerOnboardingChecklist (J1 owner onboarding)', () => {
  it('j1_owner_onboarding_checklist_reflects_verification_status', async () => {
    const shopVerificationRepository = createMockShopVerificationRepository()
    shopVerificationRepository.listDocumentsForShop.mockImplementation(buildUploadedDocuments)
    const shopVerificationService = new ShopVerificationService(shopVerificationRepository)

    // No shop yet: only the account step is done.
    const { rerender } = render(
      <OwnerOnboardingChecklist
        ownerShopList={[]}
        shopVerificationService={shopVerificationService}
      />,
    )
    expect(readStepState('Owner account created')).toContain('Done')
    expect(readStepState('Shop registered')).toContain('To do')
    expect(screen.getByText(/available only to verified shops/)).toBeInTheDocument()

    // Changes requested: documents present, submission needs attention, not approved.
    rerender(
      <OwnerOnboardingChecklist
        ownerShopList={[
          buildShop({
            verificationStatus: 'changes_requested',
            verificationSubmittedAt: '2026-10-24T08:00:00+00:00',
          }),
        ]}
        shopVerificationService={shopVerificationService}
      />,
    )
    await waitFor(() => {
      expect(readStepState('Verification documents uploaded')).toContain('Done')
    })
    expect(readStepState('Submitted for review')).toContain('Needs your attention')
    expect(readStepState('Shop approved')).toContain('To do')

    // Approved: every step is done, so the checklist hides itself.
    rerender(
      <OwnerOnboardingChecklist
        ownerShopList={[buildShop({ verificationStatus: 'approved' })]}
        shopVerificationService={shopVerificationService}
      />,
    )
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})
