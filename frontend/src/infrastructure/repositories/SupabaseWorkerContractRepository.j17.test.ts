import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  jobOpeningSupabaseDouble as supabaseDouble,
  recordedArgumentsOf,
  resetJobOpeningSupabaseDouble,
} from '../../test/jobOpeningSupabaseDouble'
import {
  testContentHash,
  testContractIdentifier,
  testDraftVersionIdentifier,
  testPendingVersionIdentifier,
  testShopIdentifier,
  testWorkerIdentifier,
} from '../../test/workerContractFixtures'
import { testVersionIdentifier } from '../../test/contractTemplateFixtures'
import { SupabaseWorkerContractActionRepository } from './SupabaseWorkerContractActionRepository'
import { SupabaseWorkerContractRepository } from './SupabaseWorkerContractRepository'

vi.mock('../supabase/supabaseClient', async () => {
  const { createJobOpeningSupabaseClientDouble } = await import('../../test/jobOpeningSupabaseDouble')
  return { isSupabaseConfigured: true, getSupabaseClient: createJobOpeningSupabaseClientDouble }
})

describe('Worker contract repositories (J17 authorization)', () => {
  beforeEach(() => {
    resetJobOpeningSupabaseDouble()
  })

  it('j17_worker_contract_repository_writes_only_through_rpcs', async () => {
    supabaseDouble.rpcResult = {
      data: { id: testContractIdentifier, status: 'draft', revision: 1, contract_id: testContractIdentifier, version_number: 1, kind: 'initial', state: 'draft', draft_revision: 2, content_hash: null, flag_count: null },
      error: null,
    }
    const actionRepository = new SupabaseWorkerContractActionRepository()
    await actionRepository.createDraft({
      shopId: testShopIdentifier, workerId: testWorkerIdentifier, templateVersionId: testVersionIdentifier, classificationKey: 'employee',
      startDate: '2026-11-02', endDate: null, ownerValues: { role_title: 'Wash bay crew', pay_details: '' },
    })
    await actionRepository.saveDraft({
      contractId: testContractIdentifier, expectedDraftRevision: 1, classificationKey: 'employee', startDate: '2026-11-02', endDate: null,
      ownerValues: { role_title: 'Wash bay crew' }, editableBodies: { pay_terms: 'Paid every Friday.' },
      shopTerms: [{ sectionNumber: 15, heading: 'Uniform care', body: 'The shop washes the uniforms it provides.' }],
    })
    await actionRepository.sendVersion({ contractId: testContractIdentifier, expectedDraftRevision: 2, contractorAcknowledgementKey: null, acknowledgedFlagCount: 1 })
    await actionRepository.withdrawVersion(testContractIdentifier, testPendingVersionIdentifier)
    await actionRepository.createAmendment(testContractIdentifier, 4)
    await actionRepository.activate(testContractIdentifier, 4)
    await actionRepository.acceptVersion({ contractId: testContractIdentifier, versionId: testPendingVersionIdentifier, contentHash: testContentHash, contractorAcknowledgementKey: null })
    await actionRepository.declineVersion(testContractIdentifier, testPendingVersionIdentifier, null)
    await actionRepository.terminate(testContractIdentifier, 5, 'The shop closed for renovation.')
    supabaseDouble.rpcResult = { data: true, error: null }
    await actionRepository.discardDraft(testContractIdentifier, testDraftVersionIdentifier)

    // No table write at all: every W9 table is read-only for clients.
    expect(recordedArgumentsOf('from')).toEqual([])
    for (const tableWrite of ['insert', 'update', 'delete', 'upsert']) {
      expect(recordedArgumentsOf(tableWrite)).toEqual([])
    }
    const rpcCalls = recordedArgumentsOf('rpc') as [string, Record<string, unknown>][]
    expect(rpcCalls.map(([rpcName]) => rpcName)).toEqual([
      'create_worker_contract_draft',
      'save_worker_contract_draft',
      'send_worker_contract_version',
      'withdraw_worker_contract_version',
      'create_worker_contract_amendment',
      'activate_worker_contract',
      'accept_worker_contract_version',
      'decline_worker_contract_version',
      'terminate_worker_contract',
      'discard_worker_contract_draft',
    ])
    // Empty details are never sent (WashLink never fills one in); statement keys are fixed.
    expect(rpcCalls[0]?.[1]).toMatchObject({ p_classification_key: 'employee', p_owner_values: { role_title: 'Wash bay crew' } })
    expect(rpcCalls[2]?.[1]).toEqual({
      p_contract_id: testContractIdentifier, p_expected_draft_revision: 2, p_acknowledgement_key: 'w9_owner_send_v1',
      p_contractor_acknowledgement_key: null, p_acknowledged_flag_count: 1,
    })
    expect(rpcCalls[6]?.[1]).toMatchObject({ p_content_hash: testContentHash, p_acknowledgement_key: 'w9_worker_accept_v1' })
    // No argument names an owner, a party, a label, a name, a signature, a timestamp or a status.
    for (const [, rpcArguments] of rpcCalls) {
      expect(JSON.stringify(rpcArguments)).not.toMatch(/owner_id|party|record_label|signature|accepted_at|_name|status|sealed|rendered_text/)
    }

    // Reads: invoker RPCs plus three select-only reads (two reference tables and the own draft row).
    supabaseDouble.rpcResult = { data: [], error: null }
    supabaseDouble.queryResult = { data: [], error: null }
    const readRepository = new SupabaseWorkerContractRepository()
    await readRepository.listOwnerContracts()
    await readRepository.listMyContracts()
    await readRepository.listEligibleWorkers()
    expect(await readRepository.fetchFlagNotices()).toBeNull()
    expect(await readRepository.previewDraft(testContractIdentifier)).toBeNull()
    await readRepository.listVersions(testContractIdentifier)
    expect(await readRepository.fetchVersionDocument(testPendingVersionIdentifier)).toBeNull()
    await readRepository.listVersionClauses(testPendingVersionIdentifier)
    await readRepository.listVersionFlags(testPendingVersionIdentifier)
    await readRepository.listVersionChanges(testPendingVersionIdentifier)
    await readRepository.listAcceptances(testContractIdentifier)
    await readRepository.listRetainedApplicationRecords()
    await readRepository.listClassificationOptions()
    await readRepository.listAcknowledgementTexts()
    expect(await readRepository.fetchDraftVersion(testDraftVersionIdentifier)).toBeNull()
    expect(recordedArgumentsOf('from')).toEqual([['worker_classification_options'], ['contract_acknowledgement_texts'], ['contract_versions']])
    for (const tableWrite of ['insert', 'update', 'delete', 'upsert']) {
      expect(recordedArgumentsOf(tableWrite)).toEqual([])
    }
    const selectedColumns = recordedArgumentsOf('select').map(([columns]) => String(columns))
    expect(selectedColumns.join(',')).not.toMatch(/\*|rendered_text|content_hash|sealed_txid/)

    // An RPC answer without a row is a failure, never success.
    supabaseDouble.rpcResult = { data: { id: null }, error: null }
    await expect(actionRepository.activate(testContractIdentifier, 4)).rejects.toThrow(
      'This contract changed or is no longer available. Reload it and try again.',
    )
    supabaseDouble.rpcResult = { data: false, error: null }
    await expect(actionRepository.discardDraft(testContractIdentifier, testDraftVersionIdentifier)).rejects.toThrow(
      'This contract changed or is no longer available. Reload it and try again.',
    )
  })
})
