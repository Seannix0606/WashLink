import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AdminModerationQueueItem, AdminModerationQueuePage } from '../../../../domain/models/JobOpeningModeration'
import { buildQueueItem, createModerationTestHarness } from '../../../../test/moderationFixtures'
import { PostingReportQueuePanel } from './PostingReportQueuePanel'

const toastDouble = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastDouble, Toaster: (): null => null }))

/** Synthetic cases, oldest first, one minute apart; ids are well-formed uuids. */
function buildCases(firstNumber: number, count: number): AdminModerationQueueItem[] {
  return Array.from({ length: count }, (_unused, offset) => {
    const caseNumber = firstNumber + offset
    return buildQueueItem({
      caseId: `c0000000-0000-4000-8000-${String(caseNumber).padStart(12, '0')}`,
      openedAt: new Date(Date.UTC(2026, 9, 20, 0, caseNumber)).toISOString(),
      openingTitleSnapshot: `Opening ${String(caseNumber)}`,
    })
  })
}

describe('Posting report queue paging (W13, D-71)', () => {
  it('w13_queue_panel_shows_n_of_total_and_load_more', async () => {
    const user = userEvent.setup()
    const harness = createModerationTestHarness()
    const firstPage = buildCases(1, 50)
    const lastFirstPageCase = firstPage[49]
    harness.moderationRepository.listAdminQueuePage
      .mockResolvedValueOnce({ items: firstPage, totalCount: 52 })
      .mockResolvedValueOnce({ items: buildCases(51, 2), totalCount: 52 })
    render(<PostingReportQueuePanel moderationService={harness.jobOpeningModerationService} />)

    const queueList = await screen.findByRole('list', { name: 'Posting report cases' })
    expect(within(queueList).getAllByRole('listitem')).toHaveLength(50)
    expect(screen.getByText('Showing 50 of 52')).toBeInTheDocument()
    expect(harness.moderationRepository.listAdminQueuePage).toHaveBeenCalledWith('active', null, 50)

    await user.click(screen.getByRole('button', { name: 'Load more' }))
    expect(await screen.findByText('Showing 52 of 52')).toBeInTheDocument()
    expect(harness.moderationRepository.listAdminQueuePage).toHaveBeenLastCalledWith(
      'active',
      { afterOpenedAt: lastFirstPageCase.openedAt, afterCaseId: lastFirstPageCase.caseId },
      50,
    )
    expect(within(queueList).getAllByRole('listitem')).toHaveLength(52)
    expect(within(queueList).getByText('Opening 52')).toBeInTheDocument()
    // The last page was not full: no further page is offered.
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
    // The queue never uses the 200-row W14 read and never opens a case by itself.
    expect(harness.moderationRepository.listAdminQueue).not.toHaveBeenCalled()
    expect(harness.moderationRepository.fetchAdminCase).not.toHaveBeenCalled()

    // A new filter starts again from the first page.
    harness.moderationRepository.listAdminQueuePage.mockResolvedValueOnce({ items: buildCases(1, 1), totalCount: 1 })
    await user.selectOptions(screen.getByLabelText('Show'), 'dismissed')
    expect(await screen.findByText('Showing 1 of 1')).toBeInTheDocument()
    expect(harness.moderationRepository.listAdminQueuePage).toHaveBeenLastCalledWith('dismissed', null, 50)
  })

  it('w13_queue_panel_empty_loading_error_states', async () => {
    const user = userEvent.setup()
    const harness = createModerationTestHarness()
    let resolveFirstPage: (page: AdminModerationQueuePage) => void = () => undefined
    harness.moderationRepository.listAdminQueuePage.mockReturnValueOnce(
      new Promise<AdminModerationQueuePage>((resolve) => {
        resolveFirstPage = resolve
      }),
    )
    const { unmount } = render(<PostingReportQueuePanel moderationService={harness.jobOpeningModerationService} />)

    // Loading.
    expect(screen.getByLabelText('Loading the posting reports')).toHaveAttribute('aria-busy', 'true')
    // Empty: an empty first page shows no count and no "Load more".
    resolveFirstPage({ items: [], totalCount: null })
    expect(await screen.findByText('No posting reports here')).toBeInTheDocument()
    expect(screen.queryByText(/^Showing/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
    unmount()

    // Error with retry: a database message from the page function is shown as written.
    harness.moderationRepository.listAdminQueuePage
      .mockRejectedValueOnce(new Error('Page size must be between 1 and 100.'))
      .mockResolvedValueOnce({ items: buildCases(1, 50), totalCount: 51 })
      .mockRejectedValueOnce(new Error('Could not load the posting reports.'))
      .mockResolvedValueOnce({ items: buildCases(51, 1), totalCount: 51 })
    render(<PostingReportQueuePanel moderationService={harness.jobOpeningModerationService} />)
    const loadAlert = await screen.findByRole('alert')
    expect(loadAlert).toHaveTextContent('The posting reports could not be loaded')
    expect(loadAlert).toHaveTextContent('Page size must be between 1 and 100.')
    await user.click(within(loadAlert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Showing 50 of 51')).toBeInTheDocument()

    // A failed "Load more" keeps the loaded cases and offers a retry of that page only.
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    const moreAlert = await screen.findByRole('alert')
    expect(moreAlert).toHaveTextContent('More posting reports could not be loaded')
    expect(within(screen.getByRole('list', { name: 'Posting report cases' })).getAllByRole('listitem')).toHaveLength(50)
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
    await user.click(within(moreAlert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Showing 51 of 51')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
