import { useState, type ReactElement } from 'react'
import { Alert, Linking, Platform, View } from 'react-native'
import {
  canCustomerCancel,
  formatManilaDateTime,
  formatPesos,
  serviceBookingStatusLabel,
  type CustomerBooking,
} from '@washlink/shared'
import { api, errorMessage } from '../../lib/api'
import { Badge, Body, Button, Card, Heading, Notice, Row } from '../../ui'

interface BookingCardProps {
  readonly booking: CustomerBooking
  readonly onChanged: () => Promise<void>
}

export function BookingCard({ booking, onChanged }: BookingCardProps): ReactElement {
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rating, setRating] = useState(0)
  const [isConfirming, setIsConfirming] = useState(false)

  const act = async (action: () => Promise<void>): Promise<void> => {
    setIsBusy(true)
    setError(null)
    try {
      await action()
      await onChanged()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setIsBusy(false)
      setIsConfirming(false)
    }
  }

  const cancel = (): void => {
    if (Platform.OS === 'web') {
      setIsConfirming(true)
      return
    }
    Alert.alert('Cancel this booking?', undefined, [
      { text: 'Keep booking', style: 'cancel' },
      { text: 'Cancel booking', style: 'destructive', onPress: (): void => void act(() => api.cancelBooking(booking.id)) },
    ])
  }

  return (
    <Card>
      <Heading>{booking.serviceName}</Heading>
      <Badge label={serviceBookingStatusLabel[booking.status]} tone={booking.status === 'completed' ? 'success' : booking.status === 'no_worker_available' ? 'warning' : 'info'} />
      <Body>{booking.isImmediate ? 'As soon as possible' : formatManilaDateTime(booking.scheduledAt)}</Body>
      <Body>{booking.address}</Body>
      <Body>{booking.vehicleMake} {booking.vehicleModel}</Body>
      <Body>{formatPesos(booking.customerTotalCents)}, pay in cash</Body>
      <Body muted>Reference {booking.reference}</Body>
      {booking.workerName !== '' ? <Body>Your washer: {booking.workerName}</Body> : null}
      <Notice tone="error" message={error} />
      <Row>
        {booking.workerPhone ? <Button label="Call washer" variant="secondary" onPress={(): void => void Linking.openURL(`tel:${String(booking.workerPhone)}`)} /> : null}
        {booking.status === 'no_worker_available' ? <Button label="Search again" isLoading={isBusy} onPress={(): void => void act(() => api.retrySearch(booking.id))} /> : null}
        {canCustomerCancel(booking.status) && !isConfirming ? <Button label="Cancel booking" variant="ghost" isDisabled={isBusy} onPress={cancel} /> : null}
        {isConfirming ? (
          <>
            <Button label="Yes, cancel booking" variant="danger" isLoading={isBusy} onPress={(): void => void act(() => api.cancelBooking(booking.id))} />
            <Button label="Keep booking" variant="ghost" onPress={(): void => { setIsConfirming(false) }} />
          </>
        ) : null}
      </Row>
      {booking.status === 'completed' && !booking.hasReview ? (
        <View style={{ gap: 8 }}>
          <Body>Rate this wash</Body>
          <Row>
            {[1, 2, 3, 4, 5].map((value) => (
              <Button key={value} label={String(value)} variant={rating === value ? 'primary' : 'secondary'} accessibilityHint={`${String(value)} out of 5`} onPress={(): void => { setRating(value) }} />
            ))}
          </Row>
          <Button label="Submit rating" isDisabled={rating === 0} isLoading={isBusy} onPress={(): void => void act(() => api.reviewBooking(booking.id, rating, ''))} />
        </View>
      ) : null}
    </Card>
  )
}
