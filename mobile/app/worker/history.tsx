import { useFocusEffect } from 'expo-router'
import { useCallback, useState, type ReactElement } from 'react'
import { formatPesos, terminalServiceBookingStatuses, type B2cApi } from '@washlink/shared'
import { useWorkerData } from '../../src/features/worker/useWorkerData'
import { useUserId } from '../../src/lib/AuthProvider'
import { api } from '../../src/lib/api'
import { Badge, Body, Card, Heading, Notice, Screen, Title } from '../../src/ui'

export default function WorkerHistory(): ReactElement {
  const { jobs, summary, error, isRefreshing, refresh } = useWorkerData(useUserId())
  const [reviews, setReviews] = useState<Awaited<ReturnType<B2cApi['workerReviews']>>>([])
  useFocusEffect(useCallback(() => { api.workerReviews().then(setReviews).catch(() => undefined) }, []))
  const past = jobs.filter((job) => terminalServiceBookingStatuses.includes(job.status))

  return (
    <Screen onRefresh={(): void => void refresh()} isRefreshing={isRefreshing}>
      <Title>Earnings</Title>
      <Notice tone="error" message={error} />
      <Card>
        <Heading>{formatPesos(summary?.earningsCents ?? 0)}</Heading>
        <Body muted>Expected from {summary?.completedCount ?? 0} completed bookings, paid to you in cash.</Body>
        <Body>Rating: {summary?.averageRating ?? 'None yet'}</Body>
      </Card>
      <Heading>Past bookings</Heading>
      {past.length === 0 ? <Body muted>No past bookings yet.</Body> : null}
      {past.map((job) => (
        <Card key={job.id}>
          <Body>{job.serviceName} · {job.reference}</Body>
          <Body>{formatPesos(job.workerEarningsCents)}</Body>
          <Badge label={job.status === 'completed' ? 'Completed' : 'Cancelled'} tone={job.status === 'completed' ? 'success' : 'info'} />
        </Card>
      ))}
      <Heading>Reviews</Heading>
      {reviews.length === 0 ? <Body muted>No reviews yet.</Body> : null}
      {reviews.map((review) => (
        <Card key={review.createdAt}>
          <Body>{review.rating} out of 5{review.comment !== '' ? `: ${review.comment}` : ''}</Body>
        </Card>
      ))}
    </Screen>
  )
}
