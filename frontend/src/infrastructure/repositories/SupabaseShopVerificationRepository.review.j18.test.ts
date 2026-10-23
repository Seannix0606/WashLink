import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testOwnerIdentifier, testShopIdentifier } from '../../test/fixtures'
import { SupabaseShopVerificationRepository } from './SupabaseShopVerificationRepository'

type RecordedCall = readonly [methodName: string, methodArguments: unknown[]]

const supabaseClientDouble = vi.hoisted(() => {
  const recordedCalls: RecordedCall[] = []
  const singleResult: { data: unknown; error: null } = { data: null, error: null }
  const queryBuilder: Record<string, (...methodArguments: unknown[]) => unknown> = {}
  for (const methodName of ['update', 'eq', 'select']) {
    queryBuilder[methodName] = (...methodArguments: unknown[]): unknown => {
      recordedCalls.push([methodName, methodArguments])
      return queryBuilder
    }
  }
  queryBuilder.single = (): Promise<typeof singleResult> => Promise.resolve(singleResult)
  const client = {
    from: (...methodArguments: unknown[]): unknown => {
      recordedCalls.push(['from', methodArguments])
      return queryBuilder
    },
  }
  return { recordedCalls, singleResult, client }
})

vi.mock('../supabase/supabaseClient', () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: (): unknown => supabaseClientDouble.client,
}))

describe('SupabaseShopVerificationRepository (J18 review decision)', () => {
  beforeEach(() => {
    supabaseClientDouble.recordedCalls.length = 0
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
      verification_status: 'approved',
      verification_notes: 'Looks good.',
      verification_submitted_at: '2026-10-24T09:00:00+00:00',
      verification_reviewed_at: '2026-10-24T10:00:00+00:00',
      verification_reviewed_by: 'server-set-reviewer',
      shop_pricing: [],
    }
  })

  it('j18_review_update_omits_server_set_reviewer_fields', async () => {
    const repository = new SupabaseShopVerificationRepository()

    await repository.approveShop({
      shopIdentifier: testShopIdentifier,
      reviewerIdentifier: 'client-supplied-reviewer',
      decisionNotes: 'Looks good.',
    })

    const updateCall = supabaseClientDouble.recordedCalls.find(
      ([methodName]) => methodName === 'update',
    )
    if (updateCall === undefined) {
      throw new Error('Expected the review decision to update the shops table.')
    }
    const [, [updatePayload]] = updateCall
    expect(updatePayload).toEqual({
      verification_status: 'approved',
      verification_notes: 'Looks good.',
    })
    expect(updatePayload).not.toHaveProperty('verification_reviewed_by')
    expect(updatePayload).not.toHaveProperty('verification_reviewed_at')
  })
})
