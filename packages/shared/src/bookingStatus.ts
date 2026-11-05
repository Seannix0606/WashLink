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

export const nextWorkerActionLabel: Readonly<Partial<Record<ServiceBookingStatus, string>>> = {
  accepted: 'Start travelling',
  worker_on_the_way: 'Mark arrived',
  arrived: 'Start wash',
  in_progress: 'Complete wash',
}
