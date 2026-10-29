import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { JobApplicationService } from '../../../../application/services/JobApplicationService'
import { MarketplaceService } from '../../../../application/services/MarketplaceService'
import { buildJobOpening, testJobOpeningIdentifier } from '../../../../test/fixtures'
import {
  buildMarketplaceJobOpening,
  createMockJobApplicationRepository,
  createMockMarketplaceRepository,
} from '../../../../test/jobApplicationFixtures'
import { buildMyReport, createModerationTestHarness, testReportIdentifier, validStatement } from '../../../../test/moderationFixtures'
import { MarketplaceOpeningDetail } from './MarketplaceOpeningDetail'
import { MyOpeningReportsList } from './MyOpeningReportsList'
import { WorkerMarketplacePanel } from './WorkerMarketplacePanel'

const toastDouble = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastDouble, Toaster: (): null => null }))

describe('Worker reports of job openings (J2, W14)', () => {
  beforeEach(() => {
    toastDouble.success.mockClear()
    toastDouble.error.mockClear()
  })

  it('j2_w14_report_modal_validates_and_maps_errors', async () => {
    const user = userEvent.setup()
    const harness = createModerationTestHarness()
    const marketplaceRepository = createMockMarketplaceRepository()
    marketplaceRepository.searchJobOpenings.mockResolvedValue([buildMarketplaceJobOpening()])
    marketplaceRepository.fetchJobOpening.mockResolvedValue(buildJobOpening({ status: 'published' }))
    harness.moderationRepository.report
      .mockRejectedValueOnce(new Error('You already reported this job opening.'))
      .mockResolvedValue({ reportId: testReportIdentifier, status: 'open', changedAt: '2026-10-29T02:00:00Z' })
    render(
      <WorkerMarketplacePanel
        marketplaceService={new MarketplaceService(marketplaceRepository)}
        jobApplicationService={new JobApplicationService(createMockJobApplicationRepository())}
        hasWorkerProfile
        onCreateProfileRequested={vi.fn()}
        jobOpeningModerationService={harness.jobOpeningModerationService}
      />,
    )
    const resultList = await screen.findByRole('list', { name: 'Job openings' })
    await user.click(within(resultList).getByRole('button', { name: /View details/ }))
    await user.click(await screen.findByRole('button', { name: 'Report this opening' }))

    const form = screen.getByRole('form', { name: 'Report this job opening' })
    // The protection notice is shown before anything is sent.
    expect(within(form).getByRole('note')).toHaveTextContent('The shop does not see your report, what you write or who reported.')
    await user.click(within(form).getByRole('button', { name: 'Send report' }))
    expect(within(form).getByText('Choose a report reason.')).toBeInTheDocument()
    expect(within(form).getByText('Write 20 to 1000 characters.')).toBeInTheDocument()
    expect(harness.moderationRepository.report).not.toHaveBeenCalled()

    await user.selectOptions(within(form).getByLabelText(/Reason/), 'worker_fee_or_deposit')
    await user.type(within(form).getByLabelText(/What is wrong/), validStatement)
    await user.click(within(form).getByRole('button', { name: 'Send report' }))
    // A database refusal is shown in the dialog as its own text.
    expect(await within(form).findByRole('alert')).toHaveTextContent('You already reported this job opening.')

    await user.click(within(form).getByRole('button', { name: 'Send report' }))
    await waitFor(() => {
      expect(screen.queryByRole('form', { name: 'Report this job opening' })).toBeNull()
    })
    expect(harness.moderationRepository.report).toHaveBeenLastCalledWith({
      jobOpeningId: testJobOpeningIdentifier,
      category: 'worker_fee_or_deposit',
      statement: validStatement,
    })
    expect(toastDouble.success).toHaveBeenCalledWith('Report sent. WashLink will review it.')
  })

  it('j2_w14_report_button_only_for_workers_on_readable_openings', async () => {
    const marketplaceRepository = createMockMarketplaceRepository()
    marketplaceRepository.fetchJobOpening.mockResolvedValue(buildJobOpening({ status: 'published' }))
    const onReportRequested = vi.fn()
    const { unmount } = render(
      <MarketplaceOpeningDetail
        marketplaceService={new MarketplaceService(marketplaceRepository)}
        selectedJobOpening={buildMarketplaceJobOpening()}
        onApplyRequested={vi.fn()}
        onClose={vi.fn()}
        onReportRequested={onReportRequested}
      />,
    )
    expect(await screen.findByRole('button', { name: 'Report this opening' })).toBeInTheDocument()
    unmount()

    // Without the report callback (callers that are not worker views) there is no button.
    const secondRender = render(
      <MarketplaceOpeningDetail
        marketplaceService={new MarketplaceService(marketplaceRepository)}
        selectedJobOpening={buildMarketplaceJobOpening()}
        onApplyRequested={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(await screen.findByRole('button', { name: 'Apply' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Report this opening' })).toBeNull()
    secondRender.unmount()

    // An opening the worker cannot read (error) has no report button either.
    marketplaceRepository.fetchJobOpening.mockRejectedValue(new Error('Job opening not found.'))
    render(
      <MarketplaceOpeningDetail
        marketplaceService={new MarketplaceService(marketplaceRepository)}
        selectedJobOpening={buildMarketplaceJobOpening()}
        onApplyRequested={vi.fn()}
        onClose={vi.fn()}
        onReportRequested={onReportRequested}
      />,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Job opening not found.')
    expect(screen.queryByRole('button', { name: 'Report this opening' })).toBeNull()
  })

  it('j2_w14_my_reports_list_shows_outcome_without_owner_data', async () => {
    const user = userEvent.setup()
    const harness = createModerationTestHarness()
    harness.moderationRepository.listMyReports.mockResolvedValue([
      buildMyReport(),
      buildMyReport({ reportId: 'r-2', status: 'closed', outcome: 'opening_paused', canWithdraw: false, closedAt: '2026-10-28T02:00:00Z' }),
    ])
    harness.moderationRepository.withdrawReport.mockResolvedValue({ reportId: testReportIdentifier, status: 'withdrawn', changedAt: null })
    render(<MyOpeningReportsList moderationService={harness.jobOpeningModerationService} />)

    const reportList = await screen.findByRole('list', { name: 'Your reports' })
    expect(reportList).toHaveTextContent('WashLink paused the listing.')
    expect(reportList).toHaveTextContent('Asks workers for a fee or deposit')
    // Only the reporter's own text and the outcome kind: no owner message, admin note or other reporters.
    expect(reportList).not.toHaveTextContent(/Reporter \d|Internal note|Message from WashLink/)
    expect(within(reportList).getAllByRole('button', { name: 'Withdraw' })).toHaveLength(1)

    await user.click(within(reportList).getByRole('button', { name: 'Withdraw' }))
    await waitFor(() => {
      expect(harness.moderationRepository.withdrawReport).toHaveBeenCalledWith(testReportIdentifier)
    })
    expect(harness.moderationRepository.listMyReports).toHaveBeenCalledTimes(2)
  })
})
