import { describe, expect, it } from 'vitest'
import { toAssessmentTextParams } from '../../infrastructure/repositories/SupabaseTrainingEvidenceRepository'
import { correctAssessmentInputSchema, failureReasonMessage, recordAssessmentInputSchema } from './trainingEvidenceSchemas'

const baseRecord = { enrollmentId: 'enrollment-1', itemsMet: [true, false], result: 'failed', assessorComment: null } as const

describe('Assessment failure reason (W6 review polish)', () => {
  it('w6_polish_failed_assessment_schema_requires_reason_of_10_to_300_characters', () => {
    for (const failureReason of [null, '', '   short  ', 'x'.repeat(301)]) {
      const parsed = recordAssessmentInputSchema.safeParse({ ...baseRecord, failureReason })
      expect(parsed.success).toBe(false)
      expect(parsed.error?.issues.map((issue) => issue.message)).toContain(failureReasonMessage)
    }
    const parsed = recordAssessmentInputSchema.safeParse({ ...baseRecord, failureReason: '  Missed the rinse step.  ' })
    expect(parsed.success && parsed.data.failureReason).toBe('Missed the rinse step.')
    const corrected = correctAssessmentInputSchema.safeParse({
      assessmentId: 'assessment-1',
      itemsMet: [true, false],
      result: 'failed',
      assessorComment: null,
      failureReason: null,
      correctionReason: 'Recorded the wrong items.',
    })
    expect(corrected.success).toBe(false)
  })

  it('w6_polish_passed_assessment_carries_no_failure_reason', () => {
    const passed = { ...baseRecord, itemsMet: [true, true], result: 'passed' } as const
    expect(recordAssessmentInputSchema.safeParse({ ...passed, failureReason: null }).success).toBe(true)
    expect(recordAssessmentInputSchema.safeParse({ ...passed, failureReason: 'A reason on a pass.' }).success).toBe(false)
  })

  it('w6_polish_failure_reason_is_sent_as_its_own_rpc_parameter', () => {
    expect(toAssessmentTextParams({ result: 'failed', assessorComment: 'Keep practising.', failureReason: 'Missed the rinse step.' })).toEqual({
      p_assessor_comment: 'Keep practising.',
      p_failure_reason: 'Missed the rinse step.',
    })
    expect(toAssessmentTextParams({ result: 'passed', assessorComment: 'Good work.', failureReason: null })).toEqual({
      p_assessor_comment: 'Good work.',
      p_failure_reason: null,
    })
  })
})
