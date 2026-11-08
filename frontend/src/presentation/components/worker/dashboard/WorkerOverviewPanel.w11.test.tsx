import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { buildAdminSummary, buildLatestOpening, buildWorkerSummary, createOversightTestHarness } from '../../../../test/oversightFixtures'
import { workforceDashboardCopyConstants } from '../../../utilities/workforceDashboardCopy'
import { AdminOverviewPanel } from '../../superAdmin/AdminOverviewPanel'
import { WorkerOverviewPanel } from './WorkerOverviewPanel'

describe('Worker overview (W11)', () => {
  it('w11_worker_overview_counts_render_from_summary', async () => {
    const user = userEvent.setup()
    const harness = createOversightTestHarness()
    harness.dashboardRepository.fetchWorkerSummary.mockResolvedValue(
      buildWorkerSummary({ openOpeningCount: 17, activeContractCount: 2, contractOfferCount: 1, currentCertificationCount: 4, nextTrainingDate: '2026-11-03' }),
    )
    const onNavigate = vi.fn()
    render(<WorkerOverviewPanel workforceDashboardService={harness.workforceDashboardService} onNavigate={onNavigate} />)

    const nextActions = await screen.findByRole('list', { name: 'Next actions' })
    expect(within(nextActions).getByText('1 contract offer waiting for your answer')).toBeInTheDocument()
    // Counts are shown exactly as the database returned them.
    const openOpenings = screen.getByText('Openings you can apply to').closest('div')
    expect(openOpenings).toHaveTextContent('17')
    expect(screen.getByText('Active contracts').closest('div')).toHaveTextContent('2')
    expect(screen.getByText('Current shop-issued certificates').closest('div')).toHaveTextContent('4')
    expect(screen.getByText('Next training day').closest('div')).toHaveTextContent('Nov 3, 2026')
    expect(harness.dashboardRepository.fetchWorkerSummary).toHaveBeenCalledTimes(1)

    await user.click(within(nextActions).getByRole('button', { name: /contract offer/ }))
    expect(onNavigate).toHaveBeenCalledWith('contracts')
  })

  it('w11_latest_openings_never_says_recommended', async () => {
    const harness = createOversightTestHarness()
    harness.marketplaceRepository.searchJobOpenings.mockResolvedValue([buildLatestOpening()])
    const { container } = render(<WorkerOverviewPanel workforceDashboardService={harness.workforceDashboardService} onNavigate={vi.fn()} />)
    const latestList = await screen.findByRole('list', { name: 'Latest openings' })
    expect(within(latestList).getByText('Car wash attendant')).toBeInTheDocument()
    // Pay exactly as stated by the shop.
    expect(within(latestList).getByText(/PHP 650/)).toBeInTheDocument()
    // The normal search with no filters, newest three; no ranking input is sent.
    expect(harness.marketplaceRepository.searchJobOpenings).toHaveBeenCalledWith(expect.objectContaining({ query: null, location: null }), {
      limit: 3,
      offset: 0,
    })
    expect(container.textContent).not.toMatch(/recommend|picked for you|suggested|best match|top pick/i)
    for (const copyText of workforceDashboardCopyConstants) {
      expect(copyText).not.toMatch(/recommended|best match|top pick/i)
    }
  })

  it('w11_dashboard_loading_empty_error_states', async () => {
    const user = userEvent.setup()
    const harness = createOversightTestHarness()
    harness.dashboardRepository.fetchWorkerSummary
      .mockRejectedValueOnce(new Error('Could not load your overview.'))
      .mockResolvedValue(buildWorkerSummary())
    const { unmount } = render(<WorkerOverviewPanel workforceDashboardService={harness.workforceDashboardService} onNavigate={vi.fn()} />)
    // Loading.
    expect(screen.getByLabelText('Loading your overview')).toBeInTheDocument()
    // Error with retry.
    expect(await screen.findByText('Your overview could not be loaded')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Try again' })[0])
    // Empty: nothing waiting, no openings.
    expect(await screen.findByText('Nothing is waiting for you')).toBeInTheDocument()
    expect(await screen.findByText('No open job openings right now')).toBeInTheDocument()
    unmount()

    // A non-worker account gets no row: an empty state, never invented zeros.
    const wrongRoleHarness = createOversightTestHarness()
    wrongRoleHarness.dashboardRepository.fetchWorkerSummary.mockResolvedValue(null)
    const { unmount: unmountWrongRole } = render(
      <WorkerOverviewPanel workforceDashboardService={wrongRoleHarness.workforceDashboardService} onNavigate={vi.fn()} />,
    )
    expect(await screen.findByText('No overview for this account')).toBeInTheDocument()
    expect(screen.queryByText('Openings you can apply to')).toBeNull()
    unmountWrongRole()

    // Admin overview: loading, then the counts.
    const adminHarness = createOversightTestHarness()
    adminHarness.dashboardRepository.fetchAdminSummary.mockResolvedValue(buildAdminSummary({ openPlatformReviewCount: 2 }))
    render(<AdminOverviewPanel workforceDashboardService={adminHarness.workforceDashboardService} onNavigate={vi.fn()} />)
    expect(screen.getByLabelText('Loading the overview')).toBeInTheDocument()
    expect(await screen.findByText('2 WashLink reviews waiting for a decision')).toBeInTheDocument()
  })
})
