import type { BookingStatus } from '../../domain/models/Booking'

type CustomerBookingTransitionToastKind = 'success' | 'info' | 'error'

export interface CustomerBookingTransitionToast {
  readonly toastKind: CustomerBookingTransitionToastKind
  readonly toastMessage: string
}

interface CustomerBookingTransitionKey {
  readonly fromStatus: BookingStatus
  readonly toStatus: BookingStatus
}

const customerBookingTransitionToastByTransitionKey: readonly {
  readonly transitionKey: CustomerBookingTransitionKey
  readonly toast: CustomerBookingTransitionToast
}[] = [
  {
    transitionKey: { fromStatus: 'pending', toStatus: 'accepted' },
    toast: { toastKind: 'success', toastMessage: 'Your booking was accepted!' },
  },
  {
    transitionKey: { fromStatus: 'pending', toStatus: 'rejected' },
    toast: {
      toastKind: 'error',
      toastMessage: 'Your booking was declined by the shop.',
    },
  },
  {
    transitionKey: { fromStatus: 'accepted', toStatus: 'in_progress' },
    toast: {
      toastKind: 'info',
      toastMessage: 'Your washer has started the wash.',
    },
  },
  {
    transitionKey: { fromStatus: 'in_progress', toStatus: 'completed' },
    toast: {
      toastKind: 'success',
      toastMessage: 'Your wash is complete!',
    },
  },
]

export function describeCustomerBookingStatusTransition(
  previousBookingStatus: BookingStatus,
  nextBookingStatus: BookingStatus,
): CustomerBookingTransitionToast | null {
  if (previousBookingStatus === nextBookingStatus) {
    return null
  }
  const matchingEntry = customerBookingTransitionToastByTransitionKey.find(
    (entry) =>
      entry.transitionKey.fromStatus === previousBookingStatus &&
      entry.transitionKey.toStatus === nextBookingStatus,
  )
  return matchingEntry?.toast ?? null
}
