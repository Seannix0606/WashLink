import type { ReactElement } from 'react'
import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import type { ApplicantPipelineService } from '../../../application/services/ApplicantPipelineService'
import type { BookingService } from '../../../application/services/BookingService'
import type { JobOpeningService } from '../../../application/services/JobOpeningService'
import type { RosterLinkService } from '../../../application/services/RosterLinkService'
import type { ShopService } from '../../../application/services/ShopService'
import type { ShopVerificationService } from '../../../application/services/ShopVerificationService'
import type { WorkerService } from '../../../application/services/WorkerService'
import type { Booking } from '../../../domain/models/Booking'
import type { Shop } from '../../../domain/models/Shop'
import type { CertificationDependencies } from '../../dependencyInjection/createCertificationDependencies'
import type { ContractTemplateDependencies } from '../../dependencyInjection/createContractTemplateDependencies'
import type { TrainingDependencies } from '../../dependencyInjection/createTrainingDependencies'
import { AppShell, Skeleton, Tabs, type TabItemDefinition } from '../../design/ui'
import { useOwnerBookingDashboard } from '../../hooks/useOwnerBookingDashboard'
import { useOwnerDashboardBookingFilterSelection } from '../../hooks/useOwnerDashboardBookingFilterSelection'
import { OwnerOnboardingChecklist } from '../onboarding/OwnerOnboardingChecklist'
import { OwnerVerificationBanner } from '../verification/OwnerVerificationBanner'
import { OwnerVerificationPanel } from '../verification/OwnerVerificationPanel'
import { BookingDetailDrawer } from './BookingDetailDrawer'
import { OwnerDashboardBookingsSection } from './OwnerDashboardBookingsSection'
import { OwnerDashboardKpiStrip } from './OwnerDashboardKpiStrip'
import { OwnerDashboardTopBar } from './OwnerDashboardTopBar'
import { OwnerShopSetupNotice } from './OwnerShopSetupNotice'
import { OwnerShopsPanel } from './OwnerShopsPanel'
import { OwnerWorkersPanel } from './OwnerWorkersPanel'

// W4: the job openings tab is loaded only when the owner opens it.
const OwnerJobOpeningsPanel = lazy(async () => {
  const jobOpeningsModule = await import('./jobOpenings/OwnerJobOpeningsPanel')
  return { default: jobOpeningsModule.OwnerJobOpeningsPanel }
})

// W6: the training tab is loaded only when the owner opens it.
const OwnerTrainingProgramsPanel = lazy(async () => {
  const trainingModule = await import('./training/OwnerTrainingProgramsPanel')
  return { default: trainingModule.OwnerTrainingProgramsPanel }
})

// W7: the certifications tab is loaded only when the owner opens it.
const OwnerCertificationsPanel = lazy(async () => {
  const certificationsModule = await import('./certifications/OwnerCertificationsPanel')
  return { default: certificationsModule.OwnerCertificationsPanel }
})

// W8: the contract templates tab is loaded only when the owner opens it.
const OwnerContractTemplatesPanel = lazy(async () => {
  const contractTemplatesModule = await import('./contractTemplates/OwnerContractTemplatesPanel')
  return { default: contractTemplatesModule.OwnerContractTemplatesPanel }
})

type OwnerDashboardPrimaryTabKey =
  | 'bookings'
  | 'shops'
  | 'team'
  | 'jobs'
  | 'training'
  | 'certifications'
  | 'contracts'
  | 'verification'

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

  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedPrimaryTab, setSelectedPrimaryTab] =
    useState<OwnerDashboardPrimaryTabKey>('bookings')
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

  const primaryTabItems: TabItemDefinition<OwnerDashboardPrimaryTabKey>[] = [
    { value: 'bookings', label: 'Bookings', badgeContent: bookings.length },
    { value: 'shops', label: 'My shops', badgeContent: ownerShopList.length },
    { value: 'team', label: 'My team', badgeContent: workers.length },
    { value: 'jobs', label: 'Job openings' },
    { value: 'training', label: 'Training' },
    { value: 'certifications', label: 'Certifications' },
    { value: 'contracts', label: 'Contract templates' },
    {
      value: 'verification',
      label: 'Verification',
      badgeContent:
        unverifiedOwnerShopCount > 0 ? unverifiedOwnerShopCount : undefined,
    },
  ]

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
        ) : null}

        {selectedPrimaryTab === 'shops' ? (
          <OwnerShopsPanel
            ownerIdentifier={ownerIdentifier}
            shopService={shopService}
            ownerShopList={ownerShopList}
            onOwnerShopListChanged={onOwnerShopListChanged}
          />
        ) : null}

        {selectedPrimaryTab === 'team' ? (
          <OwnerWorkersPanel
            ownerIdentifier={ownerIdentifier}
            workerService={workerService}
            rosterLinkService={rosterLinkService}
            workers={workers}
            onWorkersChanged={replaceLocalWorkerList}
          />
        ) : null}

        {selectedPrimaryTab === 'jobs' ? (
          <Suspense fallback={<Skeleton heightClassName="h-40" />}>
            <OwnerJobOpeningsPanel
              jobOpeningService={jobOpeningService}
              applicantPipelineService={applicantPipelineService}
              ownerShopList={ownerShopList}
              trainingDependencies={trainingDependencies}
            />
          </Suspense>
        ) : null}

        {selectedPrimaryTab === 'training' ? (
          <Suspense fallback={<Skeleton heightClassName="h-40" />}>
            <OwnerTrainingProgramsPanel
              trainingDependencies={trainingDependencies}
              ownerShopList={ownerShopList}
              rosterWorkers={workers}
              certificationDependencies={certificationDependencies}
            />
          </Suspense>
        ) : null}

        {selectedPrimaryTab === 'certifications' ? (
          <Suspense fallback={<Skeleton heightClassName="h-40" />}>
            <OwnerCertificationsPanel certificationDependencies={certificationDependencies} ownerShopList={ownerShopList} />
          </Suspense>
        ) : null}

        {selectedPrimaryTab === 'contracts' ? (
          <Suspense fallback={<Skeleton heightClassName="h-40" />}>
            <OwnerContractTemplatesPanel contractTemplateService={contractTemplateDependencies.contractTemplateService} />
          </Suspense>
        ) : null}

        {selectedPrimaryTab === 'verification' ? (
          <OwnerVerificationPanel
            ownerIdentifier={ownerIdentifier}
            ownerShopList={ownerShopList}
            shopVerificationService={shopVerificationService}
            onOwnerShopUpdatedAfterVerificationChange={
              handleOwnerShopUpdatedAfterVerificationChange
            }
          />
        ) : null}
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
