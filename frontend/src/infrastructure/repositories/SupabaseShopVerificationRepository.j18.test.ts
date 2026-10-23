import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  testOwnerIdentifier,
  testShopIdentifier,
} from '../../test/fixtures'
import type { ShopVerificationRepository } from '../../domain/repositories/ShopVerificationRepository'
import { SupabaseShopVerificationRepository } from './SupabaseShopVerificationRepository'

type RecordedCall = readonly [methodName: string, methodArguments: unknown[]]

const supabaseClientDouble = vi.hoisted(() => {
  const recordedCalls: RecordedCall[] = []
  const singleResult: { data: unknown; error: { code: string; message: string } | null } = {
    data: null,
    error: null,
  }
  const rpcBuilder = {
    select: (...methodArguments: unknown[]): unknown => {
      recordedCalls.push(['select', methodArguments])
      return rpcBuilder
    },
    single: (): Promise<typeof singleResult> => {
      recordedCalls.push(['single', []])
      return Promise.resolve(singleResult)
    },
  }
  const client = {
    rpc: (...methodArguments: unknown[]): unknown => {
      recordedCalls.push(['rpc', methodArguments])
      return rpcBuilder
    },
    from: (...methodArguments: unknown[]): unknown => {
      recordedCalls.push(['from', methodArguments])
      throw new Error('submitShopForVerification must not update the shops table directly')
    },
  }
  return { recordedCalls, singleResult, client }
})

vi.mock('../supabase/supabaseClient', () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: (): unknown => supabaseClientDouble.client,
}))

describe('SupabaseShopVerificationRepository (J18 verification, F5)', () => {
  beforeEach(() => {
    supabaseClientDouble.recordedCalls.length = 0
    supabaseClientDouble.singleResult.error = null
  })

  it('j18_submit_shop_for_verification_uses_rpc', async () => {
    supabaseClientDouble.singleResult.data = {
      id: testShopIdentifier,
      owner_id: testOwnerIdentifier,
      name: 'Test Shop',
      address: '2 Test Avenue',
      phone_number: null,
      latitude: null,
      longitude: null,
      is_active: true,
      created_at: '2026-10-24T00:00:00+00:00',
      verification_status: 'pending',
      verification_notes: 'Please re-upload the permit.',
      verification_submitted_at: '2026-10-24T09:00:00+00:00',
      verification_reviewed_at: null,
      verification_reviewed_by: null,
      shop_pricing: [],
    }
    // Called through the domain contract, exactly as ShopVerificationService does.
    const repository: ShopVerificationRepository = new SupabaseShopVerificationRepository()

    const submittedShop = await repository.submitShopForVerification(
      testShopIdentifier,
      testOwnerIdentifier,
    )

    const [firstCall] = supabaseClientDouble.recordedCalls
    expect(firstCall).toEqual([
      'rpc',
      ['submit_shop_for_verification', { p_shop_id: testShopIdentifier }],
    ])
    expect(
      supabaseClientDouble.recordedCalls.some(([methodName]) => methodName === 'from'),
    ).toBe(false)
    expect(submittedShop.verificationStatus).toBe('pending')
    expect(submittedShop.verificationSubmittedAt).toBe('2026-10-24T09:00:00+00:00')

    supabaseClientDouble.singleResult.error = {
      code: 'P0001',
      message: 'This shop cannot be submitted in its current status.',
    }
    await expect(
      repository.submitShopForVerification(testShopIdentifier, testOwnerIdentifier),
    ).rejects.toThrow('This shop cannot be submitted in its current status.')

    supabaseClientDouble.singleResult.error = {
      code: 'XX000',
      message: 'relation "shops" internal detail',
    }
    await expect(
      repository.submitShopForVerification(testShopIdentifier, testOwnerIdentifier),
    ).rejects.toThrow('Could not submit the shop for review.')
  })
})
