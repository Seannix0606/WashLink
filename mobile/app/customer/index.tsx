import { useRouter } from 'expo-router'
import type { ReactElement } from 'react'
import { isActiveServiceBooking } from '@washlink/shared'
import { BookingCard } from '../../src/features/customer/BookingCard'
import { useCustomerBookings } from '../../src/features/customer/useCustomerBookings'
import { useUserId } from '../../src/lib/AuthProvider'
import { Body, Button, Heading, Notice, Screen, Title } from '../../src/ui'

export default function CustomerHome(): ReactElement {
  const router = useRouter()
  const { bookings, error, isRefreshing, refresh } = useCustomerBookings(useUserId())
  const current = (bookings ?? []).filter((booking) => isActiveServiceBooking(booking.status) || booking.status === 'no_worker_available')
  return (
    <Screen onRefresh={(): void => void refresh()} isRefreshing={isRefreshing}>
      <Title>Book a car wash</Title>
      <Body>A washer comes to your home, office, condo or parking spot.</Body>
      <Button label="Book a car wash" onPress={(): void => { router.push('/book') }} />
      <Heading>Current bookings</Heading>
      <Notice tone="error" message={error} />
      {bookings !== null && current.length === 0 ? <Body muted>No current bookings.</Body> : null}
      {current.map((booking) => <BookingCard key={booking.id} booking={booking} onChanged={refresh} />)}
    </Screen>
  )
}
