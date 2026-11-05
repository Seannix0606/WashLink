import { useRouter } from 'expo-router'
import { useEffect, useState, type ReactElement } from 'react'
import { Linking } from 'react-native'
import {
  directionsUrl,
  formatManilaDateTime,
  formatPesos,
  nextWorkerActionLabel,
  serviceBookingStatusLabel,
  terminalServiceBookingStatuses,
  vehicleCategoryLabel,
  type AssignedBooking,
  type DispatchRequest,
} from '@washlink/shared'
import { useWorkerData } from '../../src/features/worker/useWorkerData'
import { useUserId } from '../../src/lib/AuthProvider'
import { api, errorMessage } from '../../src/lib/api'
import { Badge, Body, Button, Card, Field, Heading, Notice, Row, Screen, Title } from '../../src/ui'

const statusText = {
  pending: 'WashLink is reviewing your account. You can go online once it is verified.',
  verified: 'Go online for as-soon-as-possible bookings. Scheduled requests inside your hours can still reach you.',
  rejected: 'WashLink did not verify your account.',
  suspended: 'Your account is suspended, so you cannot go online.',
} as const

function secondsUntil(expiresAt: string): number {
  return Math.max(0, Math.round((Date.parse(expiresAt) - Date.now()) / 1000))
}

/** A request shows no address or customer; those appear only after this washer accepts. */
function RequestCard({ request, onChanged }: { readonly request: DispatchRequest; readonly onChanged: () => Promise<void> }): ReactElement {
  const [secondsLeft, setSecondsLeft] = useState(() => secondsUntil(request.expiresAt))
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const timer = setInterval(() => { setSecondsLeft(secondsUntil(request.expiresAt)) }, 1000)
    return (): void => { clearInterval(timer) }
  }, [request.expiresAt])

  const act = async (action: () => Promise<void>): Promise<void> => {
    setIsBusy(true)
    setError(null)
    try {
      await action()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      await onChanged()
      setIsBusy(false)
    }
  }

  return (
    <Card>
      <Heading>{request.serviceName}</Heading>
      <Body>You earn {formatPesos(request.workerEarningsCents)}</Body>
      <Body>{vehicleCategoryLabel[request.vehicleCategory]} · {request.isImmediate ? 'As soon as possible' : formatManilaDateTime(request.scheduledAt)} · about {request.durationMinutes} min</Body>
      {request.distanceKm !== null ? <Body>{request.distanceKm} km away</Body> : null}
      {request.addonNames.length > 0 ? <Body>Add-ons: {request.addonNames.join(', ')}</Body> : null}
      <Body muted>Expires in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</Body>
      <Notice tone="error" message={error} />
      <Row>
        <Button label="Accept" isLoading={isBusy} isDisabled={secondsLeft === 0} onPress={(): void => void act(() => api.acceptRequest(request.id))} />
        <Button label="Decline" variant="secondary" isDisabled={isBusy || secondsLeft === 0} onPress={(): void => void act(() => api.declineRequest(request.id))} />
      </Row>
    </Card>
  )
}

function JobCard({ job, onChanged }: { readonly job: AssignedBooking; readonly onChanged: () => Promise<void> }): ReactElement {
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [noteMode, setNoteMode] = useState<'problem' | 'release' | null>(null)
  const [note, setNote] = useState('')
  const action = nextWorkerActionLabel[job.status]
  const canRelease = job.status === 'accepted' || job.status === 'worker_on_the_way'

  const act = async (run: () => Promise<void>): Promise<void> => {
    setIsBusy(true)
    setError(null)
    try {
      await run()
      setNoteMode(null)
      setNote('')
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      await onChanged()
      setIsBusy(false)
    }
  }

  return (
    <Card>
      <Heading>{job.serviceName}</Heading>
      <Badge label={serviceBookingStatusLabel[job.status]} />
      <Body>{formatManilaDateTime(job.scheduledAt)} · about {job.durationMinutes} min</Body>
      <Body>{job.vehicleMake} {job.vehicleModel}, {vehicleCategoryLabel[job.vehicleCategory]}</Body>
      {job.addonNames.length > 0 ? <Body>Add-ons: {job.addonNames.join(', ')}</Body> : null}
      <Body>{job.address}</Body>
      {job.landmark ? <Body>Landmark: {job.landmark}</Body> : null}
      {job.instructions ? <Body>Instructions: {job.instructions}</Body> : null}
      {job.customerName ? <Body>Customer: {job.customerName}</Body> : null}
      <Body>Collect {formatPesos(job.customerTotalCents)} in cash. You earn {formatPesos(job.workerEarningsCents)}.</Body>
      <Notice tone="error" message={error} />
      {action !== undefined ? <Button label={action} isLoading={isBusy} onPress={(): void => void act(() => api.advanceBooking(job.id, job.status))} /> : null}
      <Row>
        {job.latitude !== null && job.longitude !== null ? <Button label="Navigate" variant="secondary" onPress={(): void => void Linking.openURL(directionsUrl(job.latitude as number, job.longitude as number))} /> : null}
        {job.customerPhone ? <Button label="Call customer" variant="secondary" onPress={(): void => void Linking.openURL(`tel:${String(job.customerPhone)}`)} /> : null}
      </Row>
      {noteMode === null ? (
        <Row>
          <Button label="Report a problem" variant="ghost" onPress={(): void => { setNoteMode('problem') }} />
          {canRelease ? <Button label="I can't do this booking" variant="ghost" onPress={(): void => { setNoteMode('release') }} /> : null}
        </Row>
      ) : (
        <>
          <Field label={noteMode === 'problem' ? 'What happened?' : "Why can't you do this booking?"} helper="10 to 500 characters." value={note} maxLength={500} multiline onChangeText={setNote} />
          <Row>
            <Button label="Send" isLoading={isBusy} onPress={(): void => void act(() => (noteMode === 'problem' ? api.reportProblem(job.id, note) : api.releaseBooking(job.id, note)))} />
            <Button label="Back" variant="ghost" onPress={(): void => { setNoteMode(null) }} />
          </Row>
        </>
      )}
    </Card>
  )
}

export default function WorkerHome(): ReactElement {
  const router = useRouter()
  const { account, requests, jobs, error, isRefreshing, refresh } = useWorkerData(useUserId())
  const [isToggling, setIsToggling] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)
  const isOnline = account?.isOnline === true
  const activeJobs = jobs.filter((job) => !terminalServiceBookingStatuses.includes(job.status))

  const toggle = async (): Promise<void> => {
    setIsToggling(true)
    setToggleError(null)
    try {
      await api.setOnline(!isOnline)
      await refresh()
    } catch (caught) {
      setToggleError(errorMessage(caught))
    } finally {
      setIsToggling(false)
    }
  }

  if (account === null) {
    return (
      <Screen>
        <Title>Set up your washer profile</Title>
        <Body>Add your service area, hours and services so WashLink can review your account.</Body>
        <Button label="Set up profile" onPress={(): void => { router.push('/worker/setup') }} />
      </Screen>
    )
  }

  return (
    <Screen onRefresh={(): void => void refresh()} isRefreshing={isRefreshing}>
      <Notice tone="error" message={error} />
      {account ? (
        <Card>
          <Heading>{isOnline ? 'You are online' : 'You are offline'}</Heading>
          <Body>{isOnline ? 'New booking requests can reach you.' : statusText[account.verificationStatus]}</Body>
          <Notice tone="error" message={toggleError} />
          <Button label={isOnline ? 'Go offline' : 'Go online'} variant={isOnline ? 'secondary' : 'primary'} isLoading={isToggling} isDisabled={!isOnline && account.verificationStatus !== 'verified'} onPress={(): void => void toggle()} />
        </Card>
      ) : null}
      <Heading>Booking requests</Heading>
      {requests.length === 0 ? <Body muted>No requests right now.</Body> : null}
      {requests.map((request) => <RequestCard key={request.id} request={request} onChanged={refresh} />)}
      <Heading>Your bookings</Heading>
      {activeJobs.length === 0 ? <Body muted>No accepted bookings.</Body> : null}
      {activeJobs.map((job) => <JobCard key={job.id} job={job} onChanged={refresh} />)}
    </Screen>
  )
}
