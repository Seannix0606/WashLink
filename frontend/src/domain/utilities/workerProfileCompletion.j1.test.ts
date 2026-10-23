import { describe, expect, it } from 'vitest'
import { buildWorkerProfile } from '../../test/fixtures'
import { calculateWorkerProfileCompletion } from './workerProfileCompletion'

describe('calculateWorkerProfileCompletion (J1 worker profile)', () => {
  it('j1_worker_profile_completion_reports_missing_sections', () => {
    expect(calculateWorkerProfileCompletion(null, null)).toEqual({
      completionPercent: 0,
      missingSections: ['about', 'experience', 'skills', 'locations', 'contact'],
    })

    const partialProfile = buildWorkerProfile({
      headline: 'Detailer',
      yearsOfExperience: 0,
      skills: ['Waxing'],
    })
    expect(calculateWorkerProfileCompletion(partialProfile, null)).toEqual({
      completionPercent: 60,
      missingSections: ['locations', 'contact'],
    })

    const completeProfile = buildWorkerProfile({
      headline: 'Detailer',
      experienceSummary: 'Two years at a local shop.',
      skills: ['Waxing'],
      preferredLocations: ['Test City'],
    })
    expect(
      calculateWorkerProfileCompletion(completeProfile, {
        contactPhone: null,
        contactEmail: null,
        preferredContactMethod: 'in_app',
      }),
    ).toEqual({ completionPercent: 100, missingSections: [] })

    expect(
      calculateWorkerProfileCompletion(buildWorkerProfile({ headline: '   ' }), null)
        .missingSections,
    ).toContain('about')
  })
})
