import type { ReactElement } from 'react'
import { useMemo, useState } from 'react'
import type { BookingService } from '../../../application/services/BookingService'
import type { ShopService } from '../../../application/services/ShopService'
import type { WorkerService } from '../../../application/services/WorkerService'
import type { Booking } from '../../../domain/models/Booking'
import type { Shop } from '../../../domain/models/Shop'
import { AppShell, Tabs, type TabItemDefinition } from '../../design/ui'
import { useOwnerBookingDashboard } from '../../hooks/useOwnerBookingDashboard'
import { useOwnerDashboardBookingFilterSelection } from '../../hooks/useOwnerDashboardBookingFilterSelection'
import { BookingDetailDrawer } from './BookingDetailDrawer'
import { OwnerDashboardBookingsSection } from './OwnerDashboardBookingsSection'
import { OwnerDashboardKpiStrip } from './OwnerDashboardKpiStrip'
import { OwnerDashboardTopBar } from './OwnerDashboardTopBar'
import { OwnerShopsPanel } from './OwnerShopsPanel'
import { OwnerWorkersPanel } from './OwnerWorkersPanel'

type OwnerDashboardPrimaryTabKey = 'bookings' | 'shops' | 'team'

interface OwnerDashboardContentProps {
  readonly ownerIdentifier: string
  readonly bookingService: BookingService
  readonly workerService: WorkerService
  readonly shopService: ShopService
  readonly ownerShopList: Shop[]
  readonly onOwnerShopListChanged: (nextOwnerShopList: Shop[]) => void
}

export function OwnerDashboardContent({
  ownerIdentifier,
  bookingService,
  workerService,
  shopService,
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

  const primaryTabItems: TabItemDefinition<OwnerDashboardPrimaryTabKey>[] = [
    { value: 'bookings', label: 'Bookings', badgeContent: bookings.length },
    { value: 'shops', label: 'My shops', badgeContent: ownerShopList.length },
    { value: 'team', label: 'My team', badgeContent: workers.length },
  ]

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
            workers={workers}
            onWorkersChanged={replaceLocalWorkerList}
          />
        ) : null}
      </div>

      <BookingDetailDrawer
        isOpen={selectedBookingIdentifier !== null}
        booking={selectedBooking}
        workers={workers}
        onClose={() => setSelectedBookingIdentifier(null)}
        onAcceptBooking={acceptOwnerBooking}
        onRejectBooking={rejectOwnerBooking}
        onAssignWorkerToBooking={assignWorkerToOwnerBooking}
      />
    </AppShell>
  )
}
