import { describe, expect, it } from 'vitest'
import { canCorrectTrainingAssessment, ownerTrainingEnrollmentActions, workerTrainingActions } from './trainingEnrollmentLifecycle'

// W16 D-84: the UI must reach the release paths the database allows (w6f), or the D-83 hold would strand the worker.
describe('Training release paths (W16)', () => {
  it('w16_worker_can_leave_after_failed_and_shop_removed', () => {
    expect(workerTrainingActions('accepted', 'failed', 'open')).toEqual(['leave'])
    expect(workerTrainingActions('accepted', 'failed', null)).toEqual(['leave'])
    expect(workerTrainingActions('accepted', 'shop_removed', null)).toEqual(['leave'])
    expect(workerTrainingActions('accepted', null, null)).toEqual(['leave'])
  })

  it('w16_worker_cannot_leave_completed', () => {
    expect(workerTrainingActions('accepted', 'completed', 'open')).toEqual([])
    expect(workerTrainingActions('accepted', 'completed', null)).toEqual([])
  })

  it('w16_owner_can_cancel_failed_not_completed_or_shop_removed', () => {
    expect(ownerTrainingEnrollmentActions('accepted', 'failed')).toEqual(['cancel_enrollment'])
    expect(ownerTrainingEnrollmentActions('accepted', 'completed')).toEqual([])
    // After a shop removal the RPC refuses the owner (42501), so the button is not offered.
    expect(ownerTrainingEnrollmentActions('accepted', 'shop_removed')).toEqual([])
    // Correcting a recorded fail stays available next to the new cancel.
    expect(canCorrectTrainingAssessment('accepted', 'failed', 'assessment')).toBe(true)
  })
})
