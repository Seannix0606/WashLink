import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useId, useState } from 'react'
import type { CustomerBooking } from '@washlink/shared'
import { api, errorMessage, supabase } from '../../lib/api'

interface CustomerBookingsState {
  readonly bookings: readonly CustomerBooking[] | null
  readonly error: string | null
  readonly isRefreshing: boolean
  readonly refresh: () => Promise<void>
}

export function useCustomerBookings(customerId: string): CustomerBookingsState {
  const [bookings, setBookings] = useState<readonly CustomerBooking[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  // Each mounted tab needs its own channel: the client refuses a second subscription to the same name.
  const channelSuffix = useId()

  const refresh = useCallback(async (): Promise<void> => {
    setIsRefreshing(true)
    try {
      setBookings(await api.myBookings())
      setError(null)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { void refresh() }, [refresh]))

  // Realtime keeps the status live; the slower poll covers a dropped connection.
  useEffect(() => {
    const poll = setInterval(() => void refresh(), 30000)
    const channel = supabase
      .channel(`mobile-customer-${customerId}-${channelSuffix}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_bookings', filter: `customer_id=eq.${customerId}` }, () => void refresh())
      .subscribe()
    return (): void => {
      clearInterval(poll)
      void supabase.removeChannel(channel)
    }
  }, [customerId, refresh, channelSuffix])

  return { bookings, error, isRefreshing, refresh }
}
