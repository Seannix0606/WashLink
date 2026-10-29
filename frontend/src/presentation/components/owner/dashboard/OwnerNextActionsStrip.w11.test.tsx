import type { ReactElement } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { OversightDependencies } from '../../../dependencyInjection/createOversightDependencies'
import { buildOwnerSummary, createOversightTestHarness } from '../../../../test/oversightFixtures'
import { OwnerDashboardContent } from '../OwnerDashboardContent'
import { defaultOwnerDashboardTab, ownerDashboardTabItems } from '../ownerDashboardTabs'
import { OwnerNextActionsStrip } from './OwnerNextActionsStrip'

// The booking dashboard, onboarding and the tab bodies are not under test; they are stubs.
vi.mock('../../../hooks/useOwnerBookingDashboard', () => ({
  useOwnerBookingDashboard: (): unknown => ({
    bookings: [],
    workers: [],
    isNotificationVisible: false,
    closeNotificationBanner: vi.fn(),
    acceptOwnerBooking: vi.fn(),
    rejectOwnerBooking: vi.fn(),
    assignWorkerToOwnerBooking: vi.fn(),
    replaceLocalWorkerList: vi.fn(),
  }),
}))
vi.mock('../OwnerDashboardTopBar', () => ({ OwnerDashboardTopBar: (): null => null }))
vi.mock('../../onboarding/OwnerOnboardingChecklist', () => ({ OwnerOnboardingChecklist: (): null => null }))
vi.mock('../../verification/OwnerVerificationBanner', () => ({ OwnerVerificationBanner: (): null => null }))
vi.mock('../OwnerShopSetupNotice', () => ({ OwnerShopSetupNotice: (): null => null }))
vi.mock('../OwnerDashboardKpiStrip', () => ({ OwnerDashboardKpiStrip: (): null => null }))
vi.mock('../BookingDetailDrawer', () => ({ BookingDetailDrawer: (): null => null }))
vi.mock('../OwnerDashboardBookingsSection', () => ({ OwnerDashboardBookingsSection: (): ReactElement => <p>Bookings section stub</p> }))
vi.mock('../OwnerDashboardTabPanels', () => ({
  OwnerDashboardTabPanels: ({ selectedTab }: { readonly selectedTab: string }): ReactElement => <p>{`Tab panel: ${selectedTab}`}</p>,
}))

function renderOwnerDashboard(oversightDependencies: OversightDependencies): void {
  render(
    <OwnerDashboardContent
      ownerIdentifier="owner-1"
      bookingService={{} as never}
      workerService={{} as never}
      shopService={{} as never}
      shopVerificationService={{} as never}
      rosterLinkService={{} as never}
      jobOpeningService={{} as never}
      applicantPipelineService={{} as never}
      trainingDependencies={{} as never}
      certificationDependencies={{} as never}
      contractTemplateDependencies={{} as never}
      workerContractDependencies={{} as never}
      oversightDependencies={oversightDependencies}
      ownerShopList={[]}
      onOwnerShopListChanged={vi.fn()}
    />,
  )
}

describe('Owner next actions and Workforce tab (W11)', () => {
  it('w11_owner_next_actions_strip_hidden_when_empty', () => {
    const { container, rerender } = render(<OwnerNextActionsStrip summary={buildOwnerSummary()} onActionSelected={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
    // Hidden too while there is no summary (loading, error, wrong role).
    rerender(<OwnerNextActionsStrip summary={null} onActionSelected={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<OwnerNextActionsStrip summary={buildOwnerSummary({ newApplicationCount: 2 })} onActionSelected={vi.fn()} />)
    expect(screen.getByRole('region', { name: 'Next actions' })).toHaveTextContent('2 new applications to review')
  })

  it('w11_owner_next_action_switches_tab', async () => {
    const user = userEvent.setup()
    const harness = createOversightTestHarness()
    harness.dashboardRepository.fetchOwnerSummary.mockResolvedValue(buildOwnerSummary({ disputeResponseNeededCount: 1, openShopReviewRequestCount: 2 }))
    renderOwnerDashboard(harness)
    const strip = await screen.findByRole('region', { name: 'Next actions' })
    const actionButtons = within(strip).getAllByRole('button')
    expect(actionButtons[0]).toHaveTextContent('1 reported contract problem where you can add your side')
    await user.click(within(strip).getByRole('button', { name: /certification review requests to decide/ }))
    expect(screen.getByText('Tab panel: certifications')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Certifications' })).toHaveAttribute('aria-selected', 'true')
    await user.click(within(strip).getByRole('button', { name: /reported contract problem/ }))
    expect(screen.getByText('Tab panel: worker_contracts')).toBeInTheDocument()
  })

  it('w11_owner_bookings_stays_default_tab', async () => {
    const harness = createOversightTestHarness()
    renderOwnerDashboard(harness)
    expect(defaultOwnerDashboardTab).toBe('bookings')
    expect(screen.getByRole('tab', { name: /Bookings/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Bookings section stub')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Workforce' })).toHaveAttribute('aria-selected', 'false')
    expect(ownerDashboardTabItems({ bookingCount: 0, shopCount: 0, workerCount: 0, unverifiedShopCount: 0 }).map((tabItem) => tabItem.value)).toEqual([
      'bookings',
      'workforce',
      'shops',
      'team',
      'jobs',
      'training',
      'certifications',
      'contracts',
      'worker_contracts',
      'verification',
    ])
    // Nothing to do: the strip stays hidden after the summary loads.
    await screen.findByText('Bookings section stub')
    expect(harness.dashboardRepository.fetchOwnerSummary).toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: 'Next actions' })).toBeNull()
  })
})
