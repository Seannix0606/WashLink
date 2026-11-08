import type { ReactElement } from 'react'
import { useCallback, useMemo, useState } from 'react'
import type { ApplicantPipelineService } from '../../../application/services/ApplicantPipelineService'
import type { BookingService } from '../../../application/services/BookingService'
import type { JobOpeningService } from '../../../application/services/JobOpeningService'
import type { RosterLinkService } from '../../../application/services/RosterLinkService'
import type { ShopService } from '../../../application/services/ShopService'
import type { ShopVerificationService } from '../../../application/services/ShopVerificationService'
import type { WorkerService } from '../../../application/services/WorkerService'
import type { Booking } from '../../../domain/models/Booking'
import type { Shop } from '../../../domain/models/Shop'
import type { OwnerNextActionTarget } from '../../../domain/utilities/workforceNextActions'
import type { CertificationDependencies } from '../../dependencyInjection/createCertificationDependencies'
import type { ContractTemplateDependencies } from '../../dependencyInjection/createContractTemplateDependencies'
import type { OversightDependencies } from '../../dependencyInjection/createOversightDependencies'
import type { TrainingDependencies } from '../../dependencyInjection/createTrainingDependencies'
import type { WorkerContractDependencies } from '../../dependencyInjection/createWorkerContractDependencies'
import { AppShell, Tabs } from '../../design/ui'
import { useOwnerBookingDashboard } from '../../hooks/useOwnerBookingDashboard'
import { useOwnerDashboardBookingFilterSelection } from '../../hooks/useOwnerDashboardBookingFilterSelection'
import { useWorkforceDashboardSummary } from '../../hooks/useWorkforceDashboardSummary'
import { OwnerOnboardingChecklist } from '../onboarding/OwnerOnboardingChecklist'
import { OwnerVerificationBanner } from '../verification/OwnerVerificationBanner'
import { BookingDetailDrawer } from './BookingDetailDrawer'
import { OwnerNextActionsStrip } from './dashboard/OwnerNextActionsStrip'
import { OwnerDashboardBookingsSection } from './OwnerDashboardBookingsSection'
import { OwnerDashboardKpiStrip } from './OwnerDashboardKpiStrip'
import { OwnerDashboardTabPanels } from './OwnerDashboardTabPanels'
import { defaultOwnerDashboardTab, ownerDashboardTabItems, ownerNextActionTab, type OwnerDashboardPrimaryTabKey } from './ownerDashboardTabs'
import { OwnerDashboardTopBar } from './OwnerDashboardTopBar'
import { OwnerShopSetupNotice } from './OwnerShopSetupNotice'

interface OwnerDashboardContentProps {
  readonly ownerIdentifier: string
  readonly bookingService: BookingService
  readonly workerService: WorkerService
  readonly shopService: ShopService
  readonly shopVerificationService: ShopVerificationService
  readonly rosterLinkService: RosterLinkService
  readonly jobOpeningService: JobOpeningService
  readonly applicantPipelineService: ApplicantPipelineService
  readonly trainingDependencies: TrainingDependencies
  readonly certificationDependencies: CertificationDependencies
  readonly contractTemplateDependencies: ContractTemplateDependencies
  readonly workerContractDependencies: WorkerContractDependencies
  /** W11: next actions, the Workforce tab, WashLink reviews and reported contract problems. */
  readonly oversightDependencies?: OversightDependencies
  readonly ownerShopList: Shop[]
  readonly onOwnerShopListChanged: (nextOwnerShopList: Shop[]) => void
}

export function OwnerDashboardContent({
  ownerIdentifier,
  bookingService,
  workerService,
  shopService,
  shopVerificationService,
  rosterLinkService,
  jobOpeningService,
  applicantPipelineService,
  trainingDependencies,
  certificationDependencies,
  contractTemplateDependencies,
  workerContractDependencies,
  oversightDependencies,
  ownerShopList,
  onOwnerShopListChanged,
}: OwnerDashboardContentProps): ReactElement {
  const {
    bookings,
    workers,
    isNotificationVisible,
    closeNotificationBanner,
    acceptOwnerBooking,
    rejectOwnerBooking,
    assignWorkerToOwnerBooking,
    replaceLocalWorkerList,
  } = useOwnerBookingDashboard(bookingService, workerService, ownerIdentifier)

  const {
    selectedOwnerDashboardBookingFilterTab,
    selectOwnerDashboardBookingFilterTab,
  } = useOwnerDashboardBookingFilterSelection()

  const workforceSummaryState = useWorkforceDashboardSummary(oversightDependencies?.workforceDashboardService, 'owner')

  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedPrimaryTab, setSelectedPrimaryTab] =
    useState<OwnerDashboardPrimaryTabKey>(defaultOwnerDashboardTab)
  const [selectedBookingIdentifier, setSelectedBookingIdentifier] = useState<
    string | null
  >(null)

  const selectedBooking: Booking | null = useMemo(() => {
    if (selectedBookingIdentifier === null) {
      return null
    }
    return (
      bookings.find((booking) => booking.id === selectedBookingIdentifier) ??
      null
    )
  }, [bookings, selectedBookingIdentifier])

  const unverifiedOwnerShopCount = useMemo<number>(() => {
    return ownerShopList.filter(
      (ownerShop) => ownerShop.verificationStatus !== 'approved',
    ).length
  }, [ownerShopList])

  const primaryTabItems = ownerDashboardTabItems({
    bookingCount: bookings.length,
    shopCount: ownerShopList.length,
    workerCount: workers.length,
    unverifiedShopCount: unverifiedOwnerShopCount,
  }).filter((tabItem) => tabItem.value !== 'workforce' || oversightDependencies !== undefined)

  const handleOwnerShopUpdatedAfterVerificationChange = useCallback(
    (updatedShop: Shop): void => {
      onOwnerShopListChanged(
        ownerShopList.map((existingOwnerShop) =>
          existingOwnerShop.id === updatedShop.id
            ? updatedShop
            : existingOwnerShop,
        ),
      )
    },
    [onOwnerShopListChanged, ownerShopList],
  )

  const handleNextActionSelected = (target: OwnerNextActionTarget): void => {
    setSelectedPrimaryTab(ownerNextActionTab(target))
  }

  const handleNotificationButtonClick = (): void => {
    closeNotificationBanner()
    setSelectedPrimaryTab('bookings')
    selectOwnerDashboardBookingFilterTab('pending')
  }

  return (
    <AppShell
      topBar={
        <OwnerDashboardTopBar
          searchInputValue={searchQuery}
          onSearchInputValueChange={setSearchQuery}
          hasNewNotification={isNotificationVisible}
          onNotificationButtonClick={handleNotificationButtonClick}
        />
      }
    >
      <div className="space-y-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-[var(--color-ink-900)] sm:text-3xl">
            Owner dashboard
          </h1>
          <p className="text-sm text-[var(--color-ink-500)]">
            Keep an eye on incoming bookings, your team, and your shops.
          </p>
        </header>

        <OwnerShopSetupNotice
          ownerShopList={ownerShopList}
          onSetupRequested={(): void => {
            setSelectedPrimaryTab('shops')
          }}
        />

        <OwnerOnboardingChecklist
          ownerShopList={ownerShopList}
          shopVerificationService={shopVerificationService}
        />

        <OwnerVerificationBanner
          ownerShopList={ownerShopList}
          onReviewVerificationRequested={(): void => {
            setSelectedPrimaryTab('verification')
          }}
        />

        <OwnerNextActionsStrip summary={workforceSummaryState.summary} onActionSelected={handleNextActionSelected} />

        <OwnerDashboardKpiStrip bookings={bookings} workers={workers} />

        <Tabs
          accessibleLabel="Owner dashboard sections"
          tabItems={primaryTabItems}
          activeTabValue={selectedPrimaryTab}
          onTabChange={setSelectedPrimaryTab}
        />

        {selectedPrimaryTab === 'bookings' ? (
          <OwnerDashboardBookingsSection
            bookings={bookings}
            workers={workers}
            searchQuery={searchQuery}
            selectedFilterTab={selectedOwnerDashboardBookingFilterTab}
            onFilterTabSelected={selectOwnerDashboardBookingFilterTab}
            onSelectBooking={setSelectedBookingIdentifier}
          />
        ) : (
          <OwnerDashboardTabPanels
            selectedTab={selectedPrimaryTab}
            ownerIdentifier={ownerIdentifier}
            workerService={workerService}
            shopService={shopService}
            shopVerificationService={shopVerificationService}
            rosterLinkService={rosterLinkService}
            jobOpeningService={jobOpeningService}
            applicantPipelineService={applicantPipelineService}
            trainingDependencies={trainingDependencies}
            certificationDependencies={certificationDependencies}
            contractTemplateDependencies={contractTemplateDependencies}
            workerContractDependencies={workerContractDependencies}
            oversightDependencies={oversightDependencies}
            workforceSummaryState={workforceSummaryState}
            ownerShopList={ownerShopList}
            onOwnerShopListChanged={onOwnerShopListChanged}
            onOwnerShopUpdatedAfterVerificationChange={handleOwnerShopUpdatedAfterVerificationChange}
            workers={workers}
            onWorkersChanged={replaceLocalWorkerList}
            onNextActionSelected={handleNextActionSelected}
          />
        )}
      </div>

      <BookingDetailDrawer
        isOpen={selectedBookingIdentifier !== null}
        booking={selectedBooking}
        workers={workers}
        onClose={(): void => {
          setSelectedBookingIdentifier(null)
        }}
        onAcceptBooking={acceptOwnerBooking}
        onRejectBooking={rejectOwnerBooking}
        onAssignWorkerToBooking={assignWorkerToOwnerBooking}
      />
    </AppShell>
  )
}
