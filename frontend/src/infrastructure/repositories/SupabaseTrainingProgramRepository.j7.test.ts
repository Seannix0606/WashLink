import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TrainingProgramService } from '../../application/services/TrainingProgramService'
import { buildTrainingProgram, testTrainingProgramIdentifier } from '../../test/trainingFixtures'
import { testShopIdentifier } from '../../test/fixtures'
import {
  jobOpeningSupabaseDouble as supabaseDouble,
  recordedArgumentsOf,
  resetJobOpeningSupabaseDouble,
} from '../../test/jobOpeningSupabaseDouble'
import { trainingProgramSelectColumns } from '../supabase/supabaseTrainingRows'
import { SupabaseTrainingProgramRepository } from './SupabaseTrainingProgramRepository'

vi.mock('../supabase/supabaseClient', async () => {
  const { createJobOpeningSupabaseClientDouble } = await import('../../test/jobOpeningSupabaseDouble')
  return { isSupabaseConfigured: true, getSupabaseClient: createJobOpeningSupabaseClientDouble }
})

function storedProgramRow(): Record<string, unknown> {
  return {
    id: testTrainingProgramIdentifier,
    shop_id: testShopIdentifier,
    title: 'Hand wash basics',
    objectives: null,
    skills_to_learn: [],
    terms: null,
    training_kind: 'required_initial',
    min_training_days: 3,
    assessment_checklist: [],
    worker_fee: '0.00',
    training_pay_amount: '450.50',
    training_pay_currency: 'PHP',
    training_pay_period: 'day',
    training_pay_details: null,
    reimbursement_details: null,
    status: 'draft',
    owner_attestation_version: null,
    owner_attested_at: null,
    schedule_changed_at: null,
    status_changed_at: null,
    opened_at: null,
    created_at: '2026-10-25T01:00:00+00:00',
    updated_at: '2026-10-25T01:00:00.000001+00:00',
  }
}

describe('Training program repository (J7 free training)', () => {
  beforeEach(() => {
    resetJobOpeningSupabaseDouble()
  })

  it('j7_training_repository_never_sends_worker_fee', async () => {
    supabaseDouble.rpcResult = { data: storedProgramRow(), error: null }
    const service = new TrainingProgramService(new SupabaseTrainingProgramRepository())
    const savedProgram = await service.createProgram(testShopIdentifier, {
      ...buildTrainingProgram(),
      trainingPayAmount: 450.5,
      trainingPayCurrency: 'PHP',
      trainingPayPeriod: 'day',
    })

    const rpcCalls = recordedArgumentsOf('rpc') as [string, Record<string, unknown>][]
    expect(rpcCalls.map(([rpcName]) => rpcName)).toEqual(['create_training_program', 'update_training_program_draft'])
    for (const [, rpcArguments] of rpcCalls) {
      expect(Object.keys(rpcArguments).some((argumentName) => argumentName.includes('fee'))).toBe(false)
    }
    expect(JSON.stringify(rpcCalls)).not.toContain('worker_fee')
    // Pay is sent exactly as entered.
    expect(rpcCalls[1]?.[1]).toMatchObject({ p_training_pay_amount: 450.5, p_training_pay_currency: 'PHP', p_training_pay_period: 'day' })
    // The fee is read (to show "none"), stays 0, and stored pay is kept as stored.
    expect(trainingProgramSelectColumns.split(', ')).toContain('worker_fee')
    expect(trainingProgramSelectColumns.split(', ')).not.toContain('owner_id')
    expect(savedProgram.workerFee).toBe(0)
    expect(savedProgram.trainingPayAmount).toBe(450.5)
  })
})
