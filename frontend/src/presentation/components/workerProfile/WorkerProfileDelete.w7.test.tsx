import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toUserFacingErrorMessage } from '../../../infrastructure/supabase/supabaseErrorMessages'
import { buildWorkerProfile } from '../../../test/fixtures'
import { workerProfileDeleteCertificationNote, workerProfileDeleteConfirmText } from '../../utilities/workerProfileDeleteCopy'
import { WorkerProfileEditorModal } from './WorkerProfileEditorModal'

const certifiedDeleteMessage = 'A worker profile with certifications cannot be deleted. Delete the account instead.'

describe('Worker profile deletion with certifications (W7 review polish)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('w7p_certified_profile_delete_message_is_shown_not_generic_23503', () => {
    expect(toUserFacingErrorMessage({ code: '23503', message: certifiedDeleteMessage }, 'Could not delete your worker profile.')).toBe(
      certifiedDeleteMessage,
    )
    expect(toUserFacingErrorMessage({ code: '23503', message: 'insert or update violates foreign key' }, 'x')).toBe(
      'A related record could not be found. Refresh and try again.',
    )
  })

  it('w7p_delete_confirmation_explains_certified_profiles_beforehand', async () => {
    const user = userEvent.setup()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onDeleteWorkerProfile = vi.fn().mockResolvedValue(false)
    render(
      <WorkerProfileEditorModal
        isOpen
        workerProfile={buildWorkerProfile()}
        workerPrivateContact={null}
        isDeletingWorkerProfile={false}
        onClose={vi.fn()}
        onSaveWorkerProfile={vi.fn()}
        onDeleteWorkerProfile={onDeleteWorkerProfile}
      />,
    )
    expect(screen.getByText(workerProfileDeleteCertificationNote, { exact: false })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete profile' }))
    expect(confirmSpy).toHaveBeenCalledWith(workerProfileDeleteConfirmText)
    expect(workerProfileDeleteConfirmText).toContain(workerProfileDeleteCertificationNote)
    expect(onDeleteWorkerProfile).not.toHaveBeenCalled()
  })
})
