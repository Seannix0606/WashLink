import { describe, expect, it } from 'vitest'
import { trainingVersusPaidWorkText } from './trainingNoticeCopy'

// W15 D-81: the trainee copy states only what the w6h / w15a booking gate enforces (F-C2, F-C3, W15-L1).
const w15TraineeNoticeText =
  "Training is not productive work for customers. While your required training is unfinished, WashLink refuses the training shop's requests to assign you to its customer bookings through a roster entry that is or was linked to your account. WashLink cannot detect a roster entry that was never linked to your account, or work arranged outside WashLink. Terms for any later customer work are agreed separately and are not part of this training."

describe('Training copy (W15)', () => {
  it('w15_trainee_notice_states_only_what_the_platform_enforces', () => {
    expect(trainingVersusPaidWorkText).toBe(w15TraineeNoticeText)
    expect(trainingVersusPaidWorkText).toContain('Training is not productive work for customers.')
    expect(trainingVersusPaidWorkText).toContain('training shop')
    expect(trainingVersusPaidWorkText).toContain('never linked')
    // No absolute enforcement claim, and no statement that training is unpaid (D-7).
    expect(trainingVersusPaidWorkText).not.toMatch(/Trainees cannot be\s+assigned/)
    expect(trainingVersusPaidWorkText).not.toMatch(/\b(guarantee|always|never be assigned)\b/i)
    expect(trainingVersusPaidWorkText.toLowerCase()).not.toMatch(/not paid work|unpaid/)
  })
})
