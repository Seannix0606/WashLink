/**
 * The B2C booking lifecycle. `service_booking_transition_allowed` in the database is the authority;
 * this copy lets both apps offer only valid actions, and a test keeps the two in step.
 */
export const serviceBookingStatuses = [
  'pending',
  'searching_for_worker',
  'accepted',
  'worker_on_the_way',
  'arrived',
  'in_progress',
  'completed',
  'cancelled',
  'expired',
  'no_worker_available',
] as const

export type ServiceBookingStatus = (typeof serviceBookingStatuses)[number]
export type ServiceBookingActor = 'customer' | 'worker' | 'super_admin' | 'system'

const workerSteps: Readonly<Partial<Record<ServiceBookingStatus, ServiceBookingStatus>>> = {
  accepted: 'worker_on_the_way',
  worker_on_the_way: 'arrived',
  arrived: 'in_progress',
  in_progress: 'completed',
}

const customerCancellable: readonly ServiceBookingStatus[] = [
  'pending',
  'searching_for_worker',
  'accepted',
  'worker_on_the_way',
  'no_worker_available',
]

export const terminalServiceBookingStatuses: readonly ServiceBookingStatus[] = [
  'completed',
  'cancelled',
  'expired',
]

export function nextWorkerStatus(status: ServiceBookingStatus): ServiceBookingStatus | null {
  return workerSteps[status] ?? null
}

export function canCustomerCancel(status: ServiceBookingStatus): boolean {
  return customerCancellable.includes(status)
}

export function isActiveServiceBooking(status: ServiceBookingStatus): boolean {
  return !terminalServiceBookingStatuses.includes(status) && status !== 'no_worker_available'
}

export const serviceBookingStatusLabel: Readonly<Record<ServiceBookingStatus, string>> = {
  pending: 'Booking received',
  searching_for_worker: 'Finding a washer',
  accepted: 'Washer confirmed',
  worker_on_the_way: 'Washer on the way',
  arrived: 'Washer has arrived',
  in_progress: 'Washing your vehicle',
  completed: 'Completed',
  cancelled: 'Cancelled',
  expired: 'Expired',
  no_worker_available: 'No washer available',
}

/**
 * Every status belongs to one group, and each group has one color on every screen (web tokens `--status-<group>-*`).
 * Color is never the only signal: the status label is always shown with it.
 */
export const serviceBookingStatusGroups = ['waiting', 'action', 'confirmed', 'moving', 'washing', 'done', 'stopped'] as const
export type ServiceBookingStatusGroup = (typeof serviceBookingStatusGroups)[number]

export const serviceBookingStatusGroup: Readonly<Record<ServiceBookingStatus, ServiceBookingStatusGroup>> = {
  pending: 'waiting',
  searching_for_worker: 'waiting',
  no_worker_available: 'action',
  accepted: 'confirmed',
  worker_on_the_way: 'moving',
  arrived: 'moving',
  in_progress: 'washing',
  completed: 'done',
  cancelled: 'stopped',
  expired: 'stopped',
}

/** Short names for legends, for example under a calendar. */
export const serviceBookingStatusGroupLabel: Readonly<Record<ServiceBookingStatusGroup, string>> = {
  waiting: 'Finding a washer',
  action: 'Needs action',
  confirmed: 'Confirmed',
  moving: 'On the way',
  washing: 'Washing',
  done: 'Completed',
  stopped: 'Cancelled',
}

export const nextWorkerActionLabel: Readonly<Partial<Record<ServiceBookingStatus, string>>> = {
  accepted: 'Start travelling',
  worker_on_the_way: 'Mark arrived',
  arrived: 'Start wash',
  in_progress: 'Complete wash',
}

/** Must match `platform_settings.worker_start_window_minutes`. A changed setting needs a client release; the server still decides. */
export const WORKER_START_WINDOW_MINUTES = 120
/** Must match `platform_settings.worker_arrival_window_minutes`. A changed setting needs a client release; the server still decides. */
export const WORKER_ARRIVAL_WINDOW_MINUTES = 30
/** Must match `platform_settings.overdue_cancel_grace_minutes`. A changed setting needs a client release; the server still decides. */
export const OVERDUE_CANCEL_GRACE_MINUTES = 60

const millisecondsPerMinute = 60000

/**
 * Mirrors `advance_service_booking`, so a job's steps stay closed until its start window. An immediate booking carries a
 * scheduled time of about now, so it passes without needing to be told apart. Screens must still show a server refusal.
 */
export function canWorkerAdvanceNow(scheduledAt: string, now: Date, status: ServiceBookingStatus = 'accepted'): boolean {
  const windowMinutes = status === 'accepted' ? WORKER_START_WINDOW_MINUTES : WORKER_ARRIVAL_WINDOW_MINUTES
  return now.getTime() >= Date.parse(scheduledAt) - windowMinutes * millisecondsPerMinute
}

/** Mirrors `cancel_service_booking`: a started job the customer can leave once it is well past its expected finish. */
export function canCustomerCancelOverdue(status: ServiceBookingStatus, scheduledAt: string, durationMinutes: number, now: Date): boolean {
  return (status === 'arrived' || status === 'in_progress')
    && now.getTime() >= Date.parse(scheduledAt) + (durationMinutes + OVERDUE_CANCEL_GRACE_MINUTES) * millisecondsPerMinute
}

/** What a washer sees while the next step is still closed, worded for that step. Travel opens first, the rest later. */
export function workerEarlyStepNotice(status: ServiceBookingStatus): string {
  switch (status) {
    case 'accepted':
      return "This booking can't start yet. You can begin up to 2 hours before its scheduled time."
    case 'arrived':
      return "It's too early for this step. You can start the wash up to 30 minutes before the scheduled time."
    case 'in_progress':
      return "It's too early for this step. You can complete the wash from 30 minutes before the scheduled time."
    default:
      return "It's too early for this step. You can mark arrival up to 30 minutes before the scheduled time."
  }
}
export const customerOverdueCancelNotice = 'This booking is well past its expected finish time, so you can cancel it here.'

/**
 * Any status other than verified masks customer details and blocks job steps. A brand-new washer still under review has
 * nothing paused, so they see this only when suspended or when a booking is still assigned to them.
 */
export function workerPausedNotice(verificationStatus: string, activeJobCount: number): string | null {
  const isPaused = verificationStatus === 'suspended' || (verificationStatus !== 'verified' && activeJobCount > 0)
  return isPaused
    ? "WashLink has paused your account, so you can't progress bookings or see customer details. Bookings you hadn't started went back to search. Contact WashLink about any booking still listed."
    : null
}

/** The stored value is the upper bound of a distance band, never a measured distance. */
export function distanceBandLabel(distanceKm: number): string {
  return `Within ${String(distanceKm)} km`
}
