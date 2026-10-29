import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { buildAdminSummary, createOversightTestHarness, type OversightTestHarness } from '../../test/oversightFixtures'
import { SuperAdminDashboardPage } from './SuperAdminDashboardPage'

const pageDependencies = vi.hoisted(() => ({ harness: null as unknown }))

vi.mock('../../presentation/dependencyInjection/createSuperAdminDependencies', () => ({
  createSuperAdminDependencies: (): unknown => {
    const harness = pageDependencies.harness as OversightTestHarness
    return {
      shopService: {},
      shopVerificationService: {},
      workforcePolicyService: { listPolicies: vi.fn().mockResolvedValue([]) },
      oversightDependencies: harness,
    }
  },
}))
vi.mock('../../presentation/components/AuthenticatedTopBar', () => ({ AuthenticatedTopBar: (): null => null }))
vi.mock('../../presentation/components/superAdmin/ShopVerificationSection', () => ({
  ShopVerificationSection: (): unknown => <p>Shop verification stub</p>,
}))

describe('Super_admin console (W11)', () => {
  it('w11_super_admin_console_tabs_and_default_overview', async () => {
    const user = userEvent.setup()
    const harness = createOversightTestHarness()
    harness.dashboardRepository.fetchAdminSummary.mockResolvedValue(buildAdminSummary({ openPlatformReviewCount: 1, unviewedDisputeCount: 1, openDisputeCount: 1 }))
    pageDependencies.harness = harness
    render(<SuperAdminDashboardPage superAdminIdentifier="admin-1" />)

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Overview',
      'Shop verification',
      'Certification reviews',
      'Contract disputes',
      'Policies',
    ])
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByRole('region', { name: 'Overview' })).toBeInTheDocument()
    // Only the overview loads at first; the queues are read when their tab opens.
    expect(harness.platformReviewRepository.listAdminQueue).not.toHaveBeenCalled()
    expect(harness.disputeRepository.listAdminQueue).not.toHaveBeenCalled()

    // A next action opens its section.
    await user.click(await screen.findByRole('button', { name: /WashLink review waiting for a decision/ }))
    expect(screen.getByRole('tab', { name: 'Certification reviews' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText('No WashLink reviews here')).toBeInTheDocument()
    expect(harness.platformReviewRepository.listAdminQueue).toHaveBeenCalledWith('open')

    await user.click(screen.getByRole('tab', { name: 'Contract disputes' }))
    expect(await screen.findByText('No reported problems here')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Shop verification' }))
    expect(await screen.findByText('Shop verification stub')).toBeInTheDocument()
  })
})
