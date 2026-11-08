import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ShopService } from '../../application/services/ShopService'
import { buildShop } from '../../test/fixtures'
import { useOwnerShopManagement } from '../hooks/useOwnerShopManagement'
import { shopRemovalConfirmationText } from './shopRemovalCopy'

const expectedConfirmationText =
  "Remove Test Shop? Customers will no longer be able to book this shop. Its job openings and the applications to them, including applicants' notes, are permanently deleted; applicants are told only that an application ended. Open training stays open and you can no longer cancel it after removal; cancel it first if it should end. This cannot be undone."

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Shop removal confirmation (W16 D-86)', () => {
  it('w16_remove_shop_confirmation_states_what_is_deleted', async () => {
    expect(shopRemovalConfirmationText('Test Shop')).toBe(expectedConfirmationText)
    // Neutral about the trainee: it never suggests asking the worker to leave (C-S6, W16-L2).
    expect(expectedConfirmationText).not.toMatch(/\b(ask|tell|leave|leaves|leaving|worker|trainee)\b/i)

    // The owner's confirm uses this text, and declining deletes nothing.
    const shop = buildShop({ name: 'Test Shop' })
    const deleteShop = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { result } = renderHook(() =>
      useOwnerShopManagement({
        ownerIdentifier: 'owner',
        shopService: { deleteShop } as unknown as ShopService,
        ownerShopList: [shop],
        onOwnerShopListChanged: vi.fn(),
      }),
    )
    await act(async () => {
      await result.current.removeShop(shop)
    })
    expect(confirmSpy).toHaveBeenCalledWith(expectedConfirmationText)
    expect(deleteShop).not.toHaveBeenCalled()
  })
})
