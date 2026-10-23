import type {
  WorkerAvailabilityStatus,
  WorkerPreferredContactMethod,
} from '../../domain/models/WorkerProfile'
import type { SelectOption } from '../design/ui'

export const workerAvailabilityStatusLabels: Readonly<
  Record<WorkerAvailabilityStatus, string>
> = {
  full_time: 'Full time',
  part_time: 'Part time',
  weekends_only: 'Weekends only',
  flexible: 'Flexible',
  not_available: 'Not available right now',
}

export const workerPreferredContactMethodLabels: Readonly<
  Record<WorkerPreferredContactMethod, string>
> = {
  phone: 'Phone',
  email: 'Email',
  in_app: 'In the WashLink app',
}

export const workerAvailabilityStatusOptions: readonly SelectOption[] = [
  { value: '', label: 'Choose your availability' },
  ...Object.entries(workerAvailabilityStatusLabels).map(([value, label]) => ({
    value,
    label,
  })),
]

export const workerPreferredContactMethodOptions: readonly SelectOption[] = [
  { value: '', label: 'No preference' },
  ...Object.entries(workerPreferredContactMethodLabels).map(([value, label]) => ({
    value,
    label,
  })),
]

export const workerPrivateContactVisibilityNotice =
  'In the app, these contact details are visible only to you.'

export const workerProfileVisibilityNotice =
  'Who can see your profile: you and WashLink administrators. Shops you apply to will also see it once applications are available.'
