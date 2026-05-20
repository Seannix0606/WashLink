import type { ReactElement } from 'react'
import type { Booking } from '../../../domain/models/Booking'
import {
  bookingMatchesOwnerDashboardFilterTab,
  type OwnerDashboardBookingFilterTab,
} from '../../../domain/ownerDashboard/OwnerDashboardBookingFilterTab'
import { Tabs, type TabItemDefinition } from '../../design/ui'

interface OwnerBookingFilterPillTabsProps {
  readonly bookings: readonly Booking[]
  readonly selectedFilterTab: OwnerDashboardBookingFilterTab
  readonly onFilterTabSelected: (
    nextFilterTab: OwnerDashboardBookingFilterTab,
  ) => void
}

const ownerBookingFilterTabDefinitions: readonly {
  readonly tabValue: OwnerDashboardBookingFilterTab
  readonly displayLabel: string
}[] = [
  { tabValue: 'pending', displayLabel: 'New' },
  { tabValue: 'accepted', displayLabel: 'Accepted' },
  { tabValue: 'assigned', displayLabel: 'Assigned' },
  { tabValue: 'completed', displayLabel: 'Completed' },
]

export function OwnerBookingFilterPillTabs({
  bookings,
  selectedFilterTab,
  onFilterTabSelected,
}: OwnerBookingFilterPillTabsProps): ReactElement {
  const tabItems: TabItemDefinition<OwnerDashboardBookingFilterTab>[] =
    ownerBookingFilterTabDefinitions.map((tabDefinition) => {
      const matchingBookingsCount = bookings.filter((booking) =>
        bookingMatchesOwnerDashboardFilterTab(booking, tabDefinition.tabValue),
      ).length
      return {
        value: tabDefinition.tabValue,
        label: tabDefinition.displayLabel,
        badgeContent: matchingBookingsCount,
      }
    })

  return (
    <Tabs
      accessibleLabel="Filter bookings by workflow stage"
      tabItems={tabItems}
      activeTabValue={selectedFilterTab}
      onTabChange={onFilterTabSelected}
    />
  )
}
