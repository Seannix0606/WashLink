import type { ReactElement } from 'react'
import { useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobOpeningModerationService } from '../../../../application/services/JobOpeningModerationService'
import type { OwnerJobOpeningModeration } from '../../../../domain/models/JobOpeningModeration'
import { toUserFacingErrorMessage } from '../../../../infrastructure/supabase/supabaseErrorMessages'
import { buildJobOpening } from '../../../../test/fixtures'
import { buildOwnerModeration, createModerationTestHarness, testModerationCaseIdentifier, validOwnerMessage } from '../../../../test/moderationFixtures'
import { useOwnerJobOpeningModeration } from '../../../hooks/useOwnerJobOpeningModeration'
import { JobOpeningListItem } from './JobOpeningListItem'
import { SubmitOpeningChangesModal } from './SubmitOpeningChangesModal'

const toastDouble = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastDouble, Toaster: (): null => null }))

const heldMessage = 'WashLink paused this job opening. Edit it and ask WashLink to check it before publishing again.'
const evaluatedAt = new Date('2026-10-29T02:00:00Z')

function renderItem(moderation: OwnerJobOpeningModeration): void {
  render(
    <ul>
      <JobOpeningListItem
        jobOpening={buildJobOpening({ status: 'paused' })}
        shopName="Test Shop"
        isShopVerifiedForPublishing
        evaluatedAt={evaluatedAt}
        isActionPending={false}
        onEditRequested={vi.fn()}
        onPreviewRequested={vi.fn()}
        onActionRequested={vi.fn()}
        moderation={moderation}
        onAskWashLinkRequested={vi.fn()}
      />
    </ul>,
  )
}

/** The panel wiring (hook + list item + modal) without the rest of the jobs panel. */
function OwnerModerationHarness({ moderationService }: { readonly moderationService: JobOpeningModerationService }): ReactElement {
  const moderationState = useOwnerJobOpeningModeration(moderationService)
  const [target, setTarget] = useState<OwnerJobOpeningModeration | null>(null)
  const jobOpening = buildJobOpening({ status: 'paused' })
  return (
    <>
      <ul>
        <JobOpeningListItem
          jobOpening={jobOpening}
          shopName="Test Shop"
          isShopVerifiedForPublishing
          evaluatedAt={evaluatedAt}
          isActionPending={false}
          onEditRequested={vi.fn()}
          onPreviewRequested={vi.fn()}
          onActionRequested={vi.fn()}
          moderation={moderationState.moderationByOpeningId.get(jobOpening.id)}
          isModerationSubmitting={moderationState.isSubmitting}
          onAskWashLinkRequested={setTarget}
        />
      </ul>
      <SubmitOpeningChangesModal
        moderation={target}
        isSubmitting={moderationState.isSubmitting}
        onSubmit={moderationState.submitChanges}
        onClose={(): void => {
          setTarget(null)
        }}
      />
    </>
  )
}

describe('Owner WashLink notice on a job opening (J2, W14)', () => {
  beforeEach(() => {
    toastDouble.success.mockClear()
    toastDouble.error.mockClear()
  })

  it('j2_w14_owner_notice_shows_reason_and_history_without_reports', () => {
    renderItem(buildOwnerModeration({ canSubmitChanges: false }))
    const notice = screen.getByRole('region', { name: 'WashLink notice' })
    expect(notice).toHaveTextContent('WashLink paused this opening')
    expect(notice).toHaveTextContent('This is not a legal finding.')
    expect(notice).toHaveTextContent('Reason: Asks workers for a fee or deposit')
    expect(notice).toHaveTextContent(validOwnerMessage)
    expect(within(notice).getByRole('list', { name: 'History' })).toHaveTextContent('WashLink paused this opening')
    expect(notice).toHaveTextContent('Change the opening first. Saving it without changing what it says is not enough.')
    // D-53: no report, statement, count or reporter; owner-facing copy never says "Suspended".
    expect(notice).not.toHaveTextContent(/Reporter|report count|reported by|statement|Suspended/i)
    expect(within(notice).queryByRole('button', { name: 'Ask WashLink to check it' })).toBeNull()
    // P75: Resume is shown as unavailable with the hold reason; Close stays available.
    expect(screen.getByRole('button', { name: 'Resume' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Resume' })).toHaveAccessibleDescription(`Resume is unavailable: ${heldMessage}`)
    expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled()
  })

  it('j2_w14_owner_submit_changes_flow', async () => {
    const user = userEvent.setup()
    const harness = createModerationTestHarness()
    harness.moderationRepository.listOwnerModeration
      .mockResolvedValueOnce([buildOwnerModeration()])
      .mockResolvedValue([buildOwnerModeration({ status: 'changes_submitted', canSubmitChanges: false })])
    harness.moderationRepository.submitChanges.mockResolvedValue({
      caseId: testModerationCaseIdentifier,
      status: 'changes_submitted',
      revision: 2,
      statusChangedAt: '2026-10-29T02:00:00Z',
    })
    render(<OwnerModerationHarness moderationService={harness.jobOpeningModerationService} />)

    await user.click(await screen.findByRole('button', { name: 'Ask WashLink to check it' }))
    const form = screen.getByRole('form', { name: 'Ask WashLink to check your changes' })
    await user.click(within(form).getByLabelText(/What you changed/))
    await user.paste('x'.repeat(501))
    await user.click(within(form).getByRole('button', { name: 'Ask WashLink to check it' }))
    expect(within(form).getByText('Write at most 500 characters.')).toBeInTheDocument()
    expect(harness.moderationRepository.submitChanges).not.toHaveBeenCalled()

    await user.clear(within(form).getByLabelText(/What you changed/))
    await user.click(within(form).getByRole('button', { name: 'Ask WashLink to check it' }))
    await waitFor(() => {
      expect(harness.moderationRepository.submitChanges).toHaveBeenCalledWith(testModerationCaseIdentifier, null)
    })
    expect(await screen.findByText('WashLink is checking your changes')).toBeInTheDocument()
    expect(toastDouble.success).toHaveBeenCalledWith('WashLink will check your changes.')
    expect(screen.getByRole('button', { name: 'Resume' })).toBeDisabled()
  })

  it('j2_w14_resume_refusal_message_mapped', () => {
    // The hold refusal from transition_job_opening is shown as written (never a generic error).
    expect(toUserFacingErrorMessage({ code: '23514', message: heldMessage }, 'Could not change the job opening.')).toBe(heldMessage)
    expect(toUserFacingErrorMessage({ code: '23514', message: 'Edit the job opening before asking WashLink to check it.' }, 'fallback')).toBe(
      'Edit the job opening before asking WashLink to check it.',
    )
    // Once lifted, the opening can be resumed again (verification still checked by the database).
    renderItem(buildOwnerModeration({ status: 'lifted', canSubmitChanges: false }))
    expect(screen.getByRole('region', { name: 'WashLink notice' })).toHaveTextContent('You can publish this opening again.')
    expect(screen.getByRole('button', { name: 'Resume' })).toBeEnabled()
  })
})
