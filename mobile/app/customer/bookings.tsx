import type { ReactElement } from 'react'
import { BookingCard } from '../../src/features/customer/BookingCard'
import { useCustomerBookings } from '../../src/features/customer/useCustomerBookings'
import { useUserId } from '../../src/lib/AuthProvider'
import { Body, Notice, Screen, Title } from '../../src/ui'

export default function CustomerBookings(): ReactElement {
  const { bookings, error, isRefreshing, refresh } = useCustomerBookings(useUserId())
  return (
    <Screen onRefresh={(): void => void refresh()} isRefreshing={isRefreshing}>
      <Title>Your bookings</Title>
      <Notice tone="error" message={error} />
      {bookings?.length === 0 ? <Body muted>No bookings yet. Book a wash and it will appear here.</Body> : null}
      {bookings?.map((booking) => <BookingCard key={booking.id} booking={booking} onChanged={refresh} />)}
    </Screen>
  )
}
