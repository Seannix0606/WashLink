import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  jobOpeningSupabaseDouble as supabaseDouble,
  recordedArgumentsOf,
  resetJobOpeningSupabaseDouble,
} from '../../test/jobOpeningSupabaseDouble'
import { testPolicyIdentifier, testRelationshipIdentifier } from '../../test/ownerRelationshipFixtures'
import { SupabaseOwnerRelationshipRepository } from './SupabaseOwnerRelationshipRepository'
import { SupabaseWorkforcePolicyRepository } from './SupabaseWorkforcePolicyRepository'

vi.mock('../supabase/supabaseClient', async () => {
  const { createJobOpeningSupabaseClientDouble } = await import('../../test/jobOpeningSupabaseDouble')
  return { isSupabaseConfigured: true, getSupabaseClient: createJobOpeningSupabaseClientDouble }
})

const policyRow = {
  id: testPolicyIdentifier,
  policy_key: 'minimum_distinct_owners',
  integer_value: 5,
  default_value: 3,
  enforcement: 'informational',
  description: 'Number of different verified shop owners with an active contract that WashLink shows to workers as a progress goal.',
  revision: 2,
  last_change_reason: 'Testing a higher goal for a pilot.',
  updated_by: null,
  created_at: '2026-10-28T00:00:00Z',
  updated_at: '2026-10-28T01:00:00Z',
}

function expectNoTableWrite(): void {
  for (const tableWrite of ['insert', 'update', 'delete', 'upsert']) {
    expect(recordedArgumentsOf(tableWrite)).toEqual([])
  }
}

describe('Owner relationship and workforce policy repositories (J17 authorization)', () => {
  beforeEach(() => {
    resetJobOpeningSupabaseDouble()
  })

  it('j17_owner_relationship_repository_reads_only_through_rpcs', async () => {
    const repository = new SupabaseOwnerRelationshipRepository()
    supabaseDouble.rpcResult = {
      data: [{
        minimum_distinct_owners: 3, default_minimum: 3, qualifying_owner_count: 2, remaining_owner_count: 1, goal_reached: false,
        enforcement: 'informational', policy_revision: 1, counted_as_of: '2026-10-28',
      }],
      error: null,
    }
    expect(await repository.fetchMyProgress()).toMatchObject({ qualifyingOwnerCount: 2, remainingOwnerCount: 1, isGoalReached: false })
    // No row (not a worker account): no progress is invented.
    supabaseDouble.rpcResult = { data: [], error: null }
    expect(await repository.fetchMyProgress()).toBeNull()

    supabaseDouble.rpcResult = {
      data: [{
        relationship_id: testRelationshipIdentifier, owner_name: 'Alma Owner', owner_removed: false, shop_names: ['North Bay'],
        status: 'suspended', status_reason: 'shop_removed', counts_toward_goal: false, qualifying_contract_count: 0,
        accepted_contract_count: 1, first_accepted_at: '2026-10-01T02:00:00Z', status_changed_at: '2026-10-05T02:00:00Z',
      }],
      error: null,
    }
    expect(await repository.listMyRelationships()).toEqual([
      expect.objectContaining({ ownerName: 'Alma Owner', status: 'suspended', statusReason: 'shop_removed', shopNames: ['North Bay'] }),
    ])
    supabaseDouble.rpcResult = { data: [], error: null }
    expect(await repository.listOwnerWorkerRelationships()).toEqual([])

    // The relationship table is never touched directly; the RPCs take no arguments (the database scopes to the caller).
    expect(recordedArgumentsOf('from')).toEqual([])
    expectNoTableWrite()
    expect(recordedArgumentsOf('rpc')).toEqual([
      ['my_owner_relationship_progress'],
      ['my_owner_relationship_progress'],
      ['my_owner_relationships'],
      ['owner_worker_relationships'],
    ])

    // A database refusal is shown as plain text, never as raw SQL.
    supabaseDouble.rpcResult = { data: null, error: { code: '42501', message: 'permission denied for function owner_worker_relationships' } }
    await expect(repository.listOwnerWorkerRelationships()).rejects.toThrow('Your account is not allowed to do this.')
  })

  it('j17_workforce_policy_repository_writes_only_through_rpc', async () => {
    const repository = new SupabaseWorkforcePolicyRepository()
    supabaseDouble.queryResult = { data: [policyRow], error: null }
    expect(await repository.listPolicies()).toEqual([
      expect.objectContaining({ policyId: testPolicyIdentifier, integerValue: 5, defaultValue: 3, enforcement: 'informational', revision: 2 }),
    ])
    expect(recordedArgumentsOf('from')).toEqual([['workforce_policies']])

    supabaseDouble.rpcResult = { data: { ...policyRow, integer_value: 4, revision: 3 }, error: null }
    const changedPolicy = await repository.changePolicyValue({
      policyKey: 'minimum_distinct_owners', newValue: 4, expectedRevision: 2, changeReason: 'Lowering the goal after review.',
    })
    expect(changedPolicy).toMatchObject({ integerValue: 4, revision: 3 })

    // The only write is the audited RPC with the expected revision; no table write, no role or actor sent.
    expectNoTableWrite()
    expect(recordedArgumentsOf('rpc')).toEqual([
      ['set_workforce_policy_value', {
        p_policy_key: 'minimum_distinct_owners', p_new_value: 4, p_expected_revision: 2, p_change_reason: 'Lowering the goal after review.',
      }],
    ])

    supabaseDouble.rpcResult = { data: null, error: { code: '42501', message: 'Only a platform administrator can change workforce policies.' } }
    await expect(
      repository.changePolicyValue({ policyKey: 'minimum_distinct_owners', newValue: 4, expectedRevision: 3, changeReason: 'Lowering the goal after review.' }),
    ).rejects.toThrow('Only a platform administrator can change workforce policies.')
  })
})
