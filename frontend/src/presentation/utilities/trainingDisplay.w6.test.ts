import { describe, expect, it } from 'vitest'
import { trainingSessionKinds } from '../../domain/models/TrainingSession'
import { toUserFacingErrorMessage } from '../../infrastructure/supabase/supabaseErrorMessages'
import { trainingSessionKindLabels } from './trainingDisplay'

describe('Training display and messages (W6)', () => {
  it('w6_session_kind_labels_training_vs_assessment_not_work', () => {
    expect(trainingSessionKindLabels.supervised_training).toBe('Supervised training')
    expect(trainingSessionKindLabels.competency_assessment).toBe('Competency assessment')
    // There is no "work" kind: trainees are never used for customer work during training.
    expect(trainingSessionKinds).toEqual(['supervised_training', 'competency_assessment'])
    for (const kindLabel of Object.values(trainingSessionKindLabels)) {
      expect(kindLabel.toLowerCase()).not.toContain('work')
    }
  })

  it('w6_trainee_assignment_error_message_mapped', () => {
    const ownerGateMessage =
      'This worker is in required training with your shop and cannot be assigned to customer bookings until the training ends.'
    const workerGateMessage =
      'You are in required training with this shop and cannot start customer bookings until the training ends.'
    expect(toUserFacingErrorMessage({ code: '23514', message: ownerGateMessage }, 'fallback')).toBe(ownerGateMessage)
    expect(toUserFacingErrorMessage({ code: '23514', message: workerGateMessage }, 'fallback')).toBe(workerGateMessage)
    // The numbered open rule passes through; unknown text never does.
    const scheduleMessage = 'Schedule at least 3 upcoming supervised training days (and no past sessions) before opening.'
    expect(toUserFacingErrorMessage({ code: '23514', message: scheduleMessage }, 'fallback')).toBe(scheduleMessage)
    expect(toUserFacingErrorMessage({ code: '23514', message: 'new row violates check constraint "tp_x"' }, 'fallback')).toBe(
      'Some details are outside the allowed limits. Check them and try again.',
    )
  })
})
