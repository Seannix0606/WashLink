import { describe, expect, it } from 'vitest'
import { buildJobOpening } from '../../test/fixtures'
import {
  evaluateJobOpeningPublishReadiness,
  isApplicationDeadlinePassed,
  jobOpeningPublishRequiredFields,
  listMissingPublishFields,
} from './jobOpeningLifecycle'

describe('Job opening publish readiness (W4)', () => {
  it('w4_publish_readiness_matches_db_required_fields', () => {
    // Same names, same order as job_opening_missing_publish_fields(job_openings).
    expect(jobOpeningPublishRequiredFields).toEqual([
      'title',
      'description',
      'work_location',
      'openings_count',
      'job_type',
      'applicant_requirement',
    ])
    const emptyDraft = buildJobOpening({
      title: '',
      description: null,
      workLocation: null,
      openingsCount: null,
      jobType: null,
      applicantRequirement: null,
    })
    expect(listMissingPublishFields(emptyDraft)).toEqual(jobOpeningPublishRequiredFields)
    expect(listMissingPublishFields(buildJobOpening({ description: '   ' }))).toEqual(['description'])
    expect(listMissingPublishFields(buildJobOpening())).toEqual([])
    // Optional content (pay, terms, lists) never blocks publishing.
    expect(
      listMissingPublishFields(buildJobOpening({ benefits: null, compensationMinAmount: null, duties: [] })),
    ).toEqual([])

    // The gate checks in the RPC's order: verification, then fields, then deadline.
    const lateEvening = new Date('2026-10-24T16:30:00Z') // 2026-10-25 00:30 in Manila
    expect(evaluateJobOpeningPublishReadiness(emptyDraft, false, lateEvening)).toEqual({
      kind: 'shop_not_verified',
    })
    expect(evaluateJobOpeningPublishReadiness(buildJobOpening({ jobType: null }), true, lateEvening)).toEqual({
      kind: 'missing_fields',
      missingFields: ['job_type'],
    })
    expect(
      evaluateJobOpeningPublishReadiness(buildJobOpening({ applicationDeadline: '2026-10-24' }), true, lateEvening),
    ).toEqual({ kind: 'deadline_passed' })
    expect(
      evaluateJobOpeningPublishReadiness(buildJobOpening({ applicationDeadline: '2026-10-25' }), true, lateEvening),
    ).toEqual({ kind: 'ready' })
    expect(isApplicationDeadlinePassed(null, lateEvening)).toBe(false)
  })
})
