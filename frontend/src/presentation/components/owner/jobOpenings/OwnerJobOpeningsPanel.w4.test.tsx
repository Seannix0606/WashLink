import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ApplicantPipelineService } from '../../../../application/services/ApplicantPipelineService'
import { JobOpeningService } from '../../../../application/services/JobOpeningService'
import { buildJobOpening, buildShop, createMockJobOpeningRepository } from '../../../../test/fixtures'
import { createMockApplicantPipelineRepository } from '../../../../test/jobApplicationFixtures'
import { OwnerJobOpeningsPanel } from './OwnerJobOpeningsPanel'

const draftOpening = buildJobOpening({ id: 'opening-draft', title: 'Draft opening' })
const publishedOpening = buildJobOpening({ id: 'opening-published', title: 'Published opening', status: 'published' })
const pausedOpening = buildJobOpening({ id: 'opening-paused', title: 'Paused opening', status: 'paused' })
const closedOpening = buildJobOpening({ id: 'opening-closed', title: 'Closed opening', status: 'closed' })

function listItemFor(jobOpeningTitle: string): HTMLElement {
  const jobOpeningList = screen.getByRole('list', { name: 'Job openings' })
  return within(jobOpeningList).getByText(jobOpeningTitle).closest('li') as HTMLElement
}

describe('Owner job openings panel (W4)', () => {
  it('w4_transition_requires_confirmation_before_publish_pause_close_archive_delete', async () => {
    const user = userEvent.setup()
    const jobOpeningRepository = createMockJobOpeningRepository()
    jobOpeningRepository.listOwnJobOpenings.mockResolvedValue([
      draftOpening,
      publishedOpening,
      pausedOpening,
      closedOpening,
    ])
    jobOpeningRepository.isShopVerifiedForPublishing.mockResolvedValue(true)
    jobOpeningRepository.transition.mockResolvedValue(buildJobOpening({ status: 'published' }))
    jobOpeningRepository.deleteDraft.mockResolvedValue(undefined)
    render(
      <OwnerJobOpeningsPanel
        jobOpeningService={new JobOpeningService(jobOpeningRepository)}
        applicantPipelineService={new ApplicantPipelineService(createMockApplicantPipelineRepository())}
        ownerShopList={[buildShop()]}
      />,
    )
    await screen.findByRole('list', { name: 'Job openings' })

    const confirmationCases = [
      { title: 'Draft opening', button: 'Publish', message: 'Workers will be able to see this opening.' },
      { title: 'Published opening', button: 'Pause', message: 'Hidden from workers until you resume it.' },
      { title: 'Paused opening', button: 'Close', message: 'Closing is final. It cannot be reopened; you can archive it later.' },
      { title: 'Closed opening', button: 'Archive', message: 'It leaves this list and cannot be edited or restored.' },
      { title: 'Draft opening', button: 'Delete draft', message: 'The draft is removed permanently. This cannot be undone.' },
    ] as const
    for (const confirmationCase of confirmationCases) {
      await user.click(within(listItemFor(confirmationCase.title)).getByRole('button', { name: confirmationCase.button }))
      const confirmDialog = screen.getByRole('dialog', { name: /\?$/ })
      expect(within(confirmDialog).getByText(confirmationCase.message)).toBeInTheDocument()
      expect(within(confirmDialog).getByText(confirmationCase.title)).toBeInTheDocument()
      // Opening the confirmation sends nothing; cancelling sends nothing.
      expect(jobOpeningRepository.transition).not.toHaveBeenCalled()
      expect(jobOpeningRepository.deleteDraft).not.toHaveBeenCalled()
      await user.click(within(confirmDialog).getByRole('button', { name: 'Cancel' }))
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).toBeNull()
      })
    }

    // Confirming sends exactly one request with the status the owner saw.
    await user.click(within(listItemFor('Paused opening')).getByRole('button', { name: 'Close' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close opening' }))
    await waitFor(() => {
      expect(jobOpeningRepository.transition).toHaveBeenCalledWith('opening-paused', 'paused', 'closed')
    })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    await user.click(within(listItemFor('Draft opening')).getByRole('button', { name: 'Delete draft' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete draft' }))
    await waitFor(() => {
      expect(jobOpeningRepository.deleteDraft).toHaveBeenCalledWith('opening-draft')
    })
    expect(jobOpeningRepository.transition).toHaveBeenCalledTimes(1)
  })

  it('w4_owner_job_openings_list_shows_notice_when_limit_reached', async () => {
    const fullPage = Array.from({ length: 200 }, (_unused, index) =>
      buildJobOpening({ id: `opening-${String(index)}`, title: `Opening ${String(index)}` }),
    )
    const jobOpeningRepository = createMockJobOpeningRepository()
    jobOpeningRepository.listOwnJobOpenings.mockResolvedValue(fullPage)
    jobOpeningRepository.isShopVerifiedForPublishing.mockResolvedValue(true)
    const { unmount } = render(
      <OwnerJobOpeningsPanel
        jobOpeningService={new JobOpeningService(jobOpeningRepository)}
        applicantPipelineService={new ApplicantPipelineService(createMockApplicantPipelineRepository())}
        ownerShopList={[buildShop()]}
      />,
    )
    expect(
      await screen.findByText(
        'Showing the 200 most recently updated openings. Archived openings are not listed.',
      ),
    ).toBeInTheDocument()
    // Archived openings are not loaded, so there is no Archived filter tab.
    expect(screen.queryByRole('tab', { name: /Archived/ })).toBeNull()
    unmount()

    jobOpeningRepository.listOwnJobOpenings.mockResolvedValue(fullPage.slice(0, 199))
    render(
      <OwnerJobOpeningsPanel
        jobOpeningService={new JobOpeningService(jobOpeningRepository)}
        applicantPipelineService={new ApplicantPipelineService(createMockApplicantPipelineRepository())}
        ownerShopList={[buildShop()]}
      />,
    )
    await screen.findByRole('list', { name: 'Job openings' })
    expect(screen.queryByText(/most recently updated openings/)).toBeNull()
  })
})
