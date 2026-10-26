import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  testStandardVersionIdentifier,
  testTemplateIdentifier,
  testVersionIdentifier,
} from '../../test/contractTemplateFixtures'
import {
  jobOpeningSupabaseDouble as supabaseDouble,
  recordedArgumentsOf,
  resetJobOpeningSupabaseDouble,
} from '../../test/jobOpeningSupabaseDouble'
import { SupabaseContractTemplateActionRepository } from './SupabaseContractTemplateActionRepository'
import { SupabaseContractTemplateRepository } from './SupabaseContractTemplateRepository'

vi.mock('../supabase/supabaseClient', async () => {
  const { createJobOpeningSupabaseClientDouble } = await import('../../test/jobOpeningSupabaseDouble')
  return { isSupabaseConfigured: true, getSupabaseClient: createJobOpeningSupabaseClientDouble }
})

describe('Contract template repositories (J17 authorization)', () => {
  beforeEach(() => {
    resetJobOpeningSupabaseDouble()
  })

  it('j17_contract_template_repository_writes_only_through_rpcs', async () => {
    supabaseDouble.rpcResult = {
      data: { id: testTemplateIdentifier, name: 'Wash bay crew agreement', status: 'active', current_version_number: 2, version_number: 2, edited_count: 1, added_count: 1 },
      error: null,
    }
    const actionRepository = new SupabaseContractTemplateActionRepository()
    await actionRepository.create('Wash bay crew agreement', null)
    await actionRepository.create('Second agreement', testVersionIdentifier)
    await actionRepository.saveVersion({
      templateId: testTemplateIdentifier,
      expectedVersionNumber: 1,
      basePlatformVersionId: testStandardVersionIdentifier,
      editableBodies: { pay_terms: 'Pay as written on each contract: {{pay_details}}' },
      shopTerms: [{ sectionNumber: 15, heading: 'Uniform care', body: 'The shop washes the uniforms it provides.' }],
    })
    await actionRepository.rename(testTemplateIdentifier, 'Renamed agreement')
    await actionRepository.setStatus(testTemplateIdentifier, 'active', 'archived')

    // No table write at all: the template tables are read-only for clients.
    expect(recordedArgumentsOf('from')).toEqual([])
    for (const tableWrite of ['insert', 'update', 'delete', 'upsert']) {
      expect(recordedArgumentsOf(tableWrite)).toEqual([])
    }
    const rpcCalls = recordedArgumentsOf('rpc') as [string, Record<string, unknown>][]
    expect(rpcCalls.map(([rpcName]) => rpcName)).toEqual([
      'create_owner_contract_template',
      'create_owner_contract_template',
      'save_owner_contract_template_version',
      'rename_owner_contract_template',
      'set_owner_contract_template_status',
    ])
    expect(rpcCalls[2]?.[1]).toEqual({
      p_template_id: testTemplateIdentifier,
      p_expected_version_number: 1,
      p_base_platform_version_id: testStandardVersionIdentifier,
      p_editable_bodies: { pay_terms: 'Pay as written on each contract: {{pay_details}}' },
      p_shop_terms: [{ section_number: 15, heading: 'Uniform care', body: 'The shop washes the uniforms it provides.' }],
    })
    // No argument names an owner, a hash, a review status, a classification, a scope or a locked clause.
    for (const [, rpcArguments] of rpcCalls) {
      expect(JSON.stringify(rpcArguments)).not.toMatch(/owner_id|hash|review_status|classification|scope|locked|saved_by|platform_version_number/)
    }

    // Reads use the invoker RPCs plus the placeholder table (select only).
    supabaseDouble.rpcResult = { data: [], error: null }
    const readRepository = new SupabaseContractTemplateRepository()
    await readRepository.listOwnerTemplates()
    expect(await readRepository.fetchCurrentStandard()).toBeNull()
    await readRepository.listVersionClauses(testVersionIdentifier)
    await readRepository.listVersionHistory(testTemplateIdentifier)
    await readRepository.previewVersion(testVersionIdentifier)
    await readRepository.diffVersion(testVersionIdentifier)
    await readRepository.listPlaceholders()
    expect(recordedArgumentsOf('from')).toEqual([['contract_template_placeholders']])
    expect(recordedArgumentsOf('insert')).toEqual([])

    // An RPC answer without a row is a failure, never success.
    supabaseDouble.rpcResult = { data: { id: null }, error: null }
    await expect(actionRepository.rename(testTemplateIdentifier, 'Another name')).rejects.toThrow(
      'This template changed or is no longer available. Reload it and try again.',
    )
  })
})
