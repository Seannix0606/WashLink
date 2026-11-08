import { describe, expect, it } from 'vitest'
import { shopTrainingVersusPaidWorkText, trainingVersusPaidWorkText } from './trainingNoticeCopy'

// W15 D-81, W16 D-85: the trainee copy states only what the w6h / w16a booking gate enforces (F-C2, F-C3, W15-L1, W16-L1).
const w15TraineeNoticeText =
  "Training is not productive work for customers. While your required training is unfinished, WashLink refuses requests by the training shop's owner to assign you to that owner's customer bookings through a roster entry that is or was linked to your account. This continues after a not-passed assessment or if the shop is removed, until the training is completed, is cancelled or you leave it; once the shop is removed, only leaving ends it. WashLink cannot detect a roster entry that was never linked to your account, or work arranged outside WashLink. Terms for any later customer work are agreed separately and are not part of this training."

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

  it('w16_trainee_notice_covers_failed_and_shop_removed', () => {
    expect(trainingVersusPaidWorkText).toContain(
      'This continues after a not-passed assessment or if the shop is removed, until the training is completed, is cancelled or you leave it; once the shop is removed, only leaving ends it.',
    )
    // The scope stays with the owner's own bookings; the detection limit stays stated.
    expect(trainingVersusPaidWorkText).toContain("that owner's customer bookings")
    expect(trainingVersusPaidWorkText).toContain('WashLink cannot detect a roster entry that was never linked to your account')
  })

  it('w16_shop_copy_does_not_suggest_asking_the_worker_to_leave', () => {
    expect(shopTrainingVersusPaidWorkText).toBe(
      "Training is not productive work for customers. The training shop's owner may not assign trainees to that owner's customer bookings while their required training is unfinished. WashLink refuses such assignments through roster entries that are or were linked to the trainee's account. This continues after a not-passed assessment or a shop removal, until the training is completed, is cancelled or the trainee leaves. Terms for any later customer work are agreed separately and are not part of this training.",
    )
    // Leaving is stated once, as a fact that ends the hold; never as something the shop can ask for (W16-L2).
    expect(shopTrainingVersusPaidWorkText).not.toMatch(/\b(ask|tell|request|encourage|persuade)\w*\b/i)
    expect(shopTrainingVersusPaidWorkText.match(/\bleaves?\b/g)).toEqual(['leaves'])
  })
})
