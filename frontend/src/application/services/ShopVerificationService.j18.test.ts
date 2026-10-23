import { describe, expect, it } from 'vitest'
import {
  buildShop,
  createMockShopVerificationRepository,
  testOwnerIdentifier,
  testShopIdentifier,
} from '../../test/fixtures'
import { ShopVerificationService } from './ShopVerificationService'

describe('ShopVerificationService (J18 verification)', () => {
  it('j18_verification_service_submits_for_owner', async () => {
    const shopVerificationRepository = createMockShopVerificationRepository()
    const submittedShop = buildShop({
      verificationStatus: 'pending',
      verificationSubmittedAt: '2026-10-24T08:00:00+00:00',
    })
    shopVerificationRepository.submitShopForVerification.mockResolvedValue(
      submittedShop,
    )
    const shopVerificationService = new ShopVerificationService(
      shopVerificationRepository,
    )

    const result = await shopVerificationService.submitShopForVerification(
      testShopIdentifier,
      testOwnerIdentifier,
    )

    expect(result).toBe(submittedShop)
    expect(
      shopVerificationRepository.submitShopForVerification,
    ).toHaveBeenCalledTimes(1)
    expect(
      shopVerificationRepository.submitShopForVerification,
    ).toHaveBeenCalledWith(testShopIdentifier, testOwnerIdentifier)
  })
})
