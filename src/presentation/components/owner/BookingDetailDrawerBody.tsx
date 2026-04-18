import type { ReactElement } from 'react'
import { useState } from 'react'
import {
  Calendar,
  Car,
  CheckCircle2,
  MapPin,
  Phone,
  UserCircle2,
  UserPlus,
  XCircle,
} from 'lucide-react'
import type { Booking } from '../../../domain/models/Booking'
import type { Worker } from '../../../domain/models/Worker'
import {
  Avatar,
  Badge,
  Button,
  Select,
  applicationToast,
} from '../../design/ui'
import {
  formatRelativeTimeFromNow,
  formatScheduledDateTime,
} from '../../utilities/datetimeFormatting'
import { runServiceActionWithToast } from '../../utilities/runServiceActionWithToast'
import { describeBookingStatus } from '../../utilities/bookingStatusDisplay'
import { BookingDetailRow } from './BookingDetailRow'

interface BookingDetailDrawerBodyProps {
  readonly booking: Booking
  readonly workers: readonly Worker[]
  readonly onAcceptBooking: (bookingIdentifier: string) => Promise<void>
  readonly onRejectBooking: (bookingIdentifier: string) => Promise<void>
  readonly onAssignWorkerToBooking: (
    bookingIdentifier: string,
    workerIdentifier: string,
  ) => Promise<void>
  readonly onCloseDrawer: () => void
}

export function BookingDetailDrawerBody({
  booking,
  workers,
  onAcceptBooking,
  onRejectBooking,
  onAssignWorkerToBooking,
  onCloseDrawer,
}: BookingDetailDrawerBodyProps): ReactElement {
  const statusDisplayDefinition = describeBookingStatus(booking.bookingStatus)
  const [draftSelectedWorkerIdentifier, setDraftSelectedWorkerIdentifier] =
    useState<string>('')
  const [isAcceptingBooking, setIsAcceptingBooking] = useState<boolean>(false)
  const [isRejectingBooking, setIsRejectingBooking] = useState<boolean>(false)
  const [isAssigningWorker, setIsAssigningWorker] = useState<boolean>(false)

  const availableWorkerOptions = [
    { value: '', label: 'Select a worker…' },
    ...workers
      .filter((worker) => worker.isAvailable)
      .map((worker) => ({
        value: worker.workerIdentifier,
        label: `${worker.workerName} · ${worker.workerPhoneNumber}`,
      })),
  ]

  const assignedWorker = workers.find(
    (worker) => worker.workerIdentifier === booking.assignedWorkerIdentifier,
  )

  const canAccept = booking.bookingStatus === 'pending'
  const canReject =
    booking.bookingStatus === 'pending' || booking.bookingStatus === 'accepted'
  const canAssign =
    booking.bookingStatus === 'accepted' &&
    booking.assignedWorkerIdentifier === undefined

  const handleAccept = async (): Promise<void> => {
    setIsAcceptingBooking(true)
    await runServiceActionWithToast(() => onAcceptBooking(booking.id), {
      successMessage: 'Booking accepted.',
      fallbackErrorMessage: 'Could not accept this booking.',
    })
    setIsAcceptingBooking(false)
  }

  const handleReject = async (): Promise<void> => {
    setIsRejectingBooking(true)
    await runServiceActionWithToast(() => onRejectBooking(booking.id), {
      successMessage: 'Booking rejected.',
      fallbackErrorMessage: 'Could not reject this booking.',
    })
    setIsRejectingBooking(false)
  }

  const handleAssignWorker = async (): Promise<void> => {
    if (draftSelectedWorkerIdentifier.length === 0) {
      applicationToast.warning('Please select a worker first.')
      return
    }
    setIsAssigningWorker(true)
    const assignmentResult = await runServiceActionWithToast(
      () =>
        onAssignWorkerToBooking(booking.id, draftSelectedWorkerIdentifier),
      {
        successMessage: 'Worker assigned.',
        fallbackErrorMessage: 'Could not assign this worker.',
      },
    )
    setIsAssigningWorker(false)
    if (assignmentResult !== null) {
      setDraftSelectedWorkerIdentifier('')
      onCloseDrawer()
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 rounded-[var(--radius-surface)] bg-[var(--color-surface-muted)] p-3">
        <Avatar fullName={booking.customerName} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--color-ink-900)]">
            {booking.customerName}
          </p>
          <p className="text-xs text-[var(--color-ink-500)]">
            Requested {formatRelativeTimeFromNow(booking.createdAt)}
          </p>
        </div>
        <Badge tone={statusDisplayDefinition.badgeTone}>
          {statusDisplayDefinition.displayLabel}
        </Badge>
      </div>

      <div className="space-y-3">
        <BookingDetailRow
          iconNode={<Car className="h-4 w-4" />}
          label="Service"
          value={`${booking.vehicleType} · ${booking.serviceType}`}
        />
        <BookingDetailRow
          iconNode={<Calendar className="h-4 w-4" />}
          label="Scheduled"
          value={formatScheduledDateTime(booking.time)}
        />
        <BookingDetailRow
          iconNode={<MapPin className="h-4 w-4" />}
          label="Address"
          value={booking.address}
        />
        {assignedWorker ? (
          <BookingDetailRow
            iconNode={<UserCircle2 className="h-4 w-4" />}
            label="Assigned worker"
            value={
              <span className="inline-flex items-center gap-2">
                {assignedWorker.workerName}
                <span className="inline-flex items-center gap-1 text-xs text-[var(--color-ink-500)]">
                  <Phone className="h-3 w-3" />
                  {assignedWorker.workerPhoneNumber}
                </span>
              </span>
            }
          />
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="primary"
          leadingIcon={<CheckCircle2 className="h-4 w-4" />}
          isLoading={isAcceptingBooking}
          disabled={!canAccept || isAcceptingBooking}
          onClick={() => void handleAccept()}
        >
          Accept
        </Button>
        <Button
          variant="danger"
          leadingIcon={<XCircle className="h-4 w-4" />}
          isLoading={isRejectingBooking}
          disabled={!canReject || isRejectingBooking}
          onClick={() => void handleReject()}
        >
          Reject
        </Button>
      </div>

      {canAssign ? (
        <div className="space-y-2 rounded-[var(--radius-surface)] border border-[var(--color-ink-200)] bg-white p-3">
          <p className="text-sm font-medium text-[var(--color-ink-900)]">
            Assign a worker
          </p>
          <Select
            name="assignWorker"
            options={availableWorkerOptions}
            value={draftSelectedWorkerIdentifier}
            onChange={(changeEvent) =>
              setDraftSelectedWorkerIdentifier(changeEvent.target.value)
            }
          />
          <Button
            isFullWidth
            leadingIcon={<UserPlus className="h-4 w-4" />}
            isLoading={isAssigningWorker}
            disabled={
              isAssigningWorker || draftSelectedWorkerIdentifier.length === 0
            }
            onClick={() => void handleAssignWorker()}
          >
            Assign worker
          </Button>
        </div>
      ) : null}
    </div>
  )
}
