import { useCallback, useState } from 'react'
import type { OwnerDashboardBookingFilterTab } from '../../domain/ownerDashboard/OwnerDashboardBookingFilterTab'

interface UseOwnerDashboardBookingFilterSelectionResult {
  selectedOwnerDashboardBookingFilterTab: OwnerDashboardBookingFilterTab
  selectOwnerDashboardBookingFilterTab: (
    ownerDashboardBookingFilterTab: OwnerDashboardBookingFilterTab,
  ) => void
}

export function useOwnerDashboardBookingFilterSelection(): UseOwnerDashboardBookingFilterSelectionResult {
  const [selectedOwnerDashboardBookingFilterTab, setSelectedOwnerDashboardBookingFilterTab] =
    useState<OwnerDashboardBookingFilterTab>('pending')

  const selectOwnerDashboardBookingFilterTab = useCallback(
    (ownerDashboardBookingFilterTab: OwnerDashboardBookingFilterTab): void => {
      setSelectedOwnerDashboardBookingFilterTab(ownerDashboardBookingFilterTab)
    },
    [],
  )

  return {
    selectedOwnerDashboardBookingFilterTab,
    selectOwnerDashboardBookingFilterTab,
  }
}
