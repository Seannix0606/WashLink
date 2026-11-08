import { describe, expect, it } from 'vitest'
import { trainingNoticeText, trainingVersusPaidWorkText } from './trainingNoticeCopy'

describe('Training copy (W6 review polish)', () => {
  it('w6_polish_training_copy_does_not_contradict_optional_training_pay', () => {
    // D-7: a shop may offer training pay, so the copy must not say training is unpaid.
    for (const copyText of [trainingVersusPaidWorkText, trainingNoticeText]) {
      expect(copyText.toLowerCase()).not.toMatch(/not paid work|unpaid/)
    }
    expect(trainingVersusPaidWorkText).toContain('Training is not productive work for customers.')
  })
})
