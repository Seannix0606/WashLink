import { describe, expect, it } from 'vitest'
import { jobApplicationStatuses, type JobApplicationStatus } from '../models/JobApplication'
import { jobOpeningStatuses } from '../models/JobOpening'
import {
  isOpeningEditedAfterApplying,
  isOwnerJobApplicationTransitionAllowed,
  ownerJobApplicationTransitions,
  workerJobApplicationActions,
} from './jobApplicationLifecycle'

describe('jobApplicationLifecycle (J5 transitions per actor)', () => {
  it('j5_worker_lifecycle_offers_only_allowed_actions', () => {
    const expectedWorkerActions: Readonly<Record<JobApplicationStatus, readonly string[]>> = {
      draft: ['submit_draft', 'delete_draft'],
      submitted: ['withdraw'],
      under_review: ['withdraw'],
      shortlisted: ['withdraw'],
      accepted: ['withdraw'],
      rejected: [],
      withdrawn: [],
      closed: [],
    }
    for (const status of jobApplicationStatuses) {
      expect(workerJobApplicationActions(status)).toEqual(expectedWorkerActions[status])
    }
    // A worker never decides: no worker action leads to a pipeline decision or to closed.
    const allWorkerActions = jobApplicationStatuses.flatMap((status) => workerJobApplicationActions(status))
    expect(new Set(allWorkerActions)).toEqual(new Set(['submit_draft', 'delete_draft', 'withdraw']))

    // Snapshot edit detection keeps microsecond precision and ignores the offset format.
    expect(isOpeningEditedAfterApplying('2026-10-25T01:00:00.123456+00:00', '2026-10-25T01:00:00.123457+00:00')).toBe(true)
    expect(isOpeningEditedAfterApplying('2026-10-25T01:00:00.123456+00:00', '2026-10-25T09:00:00.123456+08:00')).toBe(false)
    expect(isOpeningEditedAfterApplying('2026-10-25T01:00:00.5+00:00', '2026-10-25T01:00:00.4+00:00')).toBe(false)
  })

  it('j5_owner_pipeline_offers_only_allowed_transitions', () => {
    const allowedPairs = new Set([
      'submitted>under_review',
      'submitted>rejected',
      'under_review>shortlisted',
      'under_review>accepted',
      'under_review>rejected',
      'shortlisted>accepted',
      'shortlisted>rejected',
    ])
    for (const openingStatus of jobOpeningStatuses) {
      const isDecidable = openingStatus === 'published' || openingStatus === 'paused'
      for (const fromStatus of jobApplicationStatuses) {
        for (const toStatus of jobApplicationStatuses) {
          const isExpected = isDecidable && allowedPairs.has(`${fromStatus}>${toStatus}`)
          expect(isOwnerJobApplicationTransitionAllowed(fromStatus, toStatus, openingStatus)).toBe(isExpected)
        }
      }
    }
    // Owners never withdraw, never touch drafts and never set closed.
    for (const fromStatus of jobApplicationStatuses) {
      const offeredTransitions: readonly string[] = ownerJobApplicationTransitions(fromStatus, 'published')
      expect(offeredTransitions).not.toContain('withdrawn')
      expect(offeredTransitions).not.toContain('closed')
      expect(offeredTransitions).not.toContain('draft')
    }
    expect(ownerJobApplicationTransitions('draft', 'published')).toEqual([])
    expect(ownerJobApplicationTransitions('under_review', 'closed')).toEqual([])
  })
})
