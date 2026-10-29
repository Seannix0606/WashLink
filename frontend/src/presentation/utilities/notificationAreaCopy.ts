import type { NotificationArea } from '../../domain/utilities/notificationAreas'

/**
 * W12 (D-68) inbox wording. Notices are in-app only (D-61): nothing here says that an email, SMS
 * or push message was sent, and no notice is described as a legal notice.
 */
export const notificationAreaLabel: Readonly<Record<NotificationArea, string>> = {
  applications: 'Applications',
  job_openings: 'Job openings',
  training: 'Training',
  certifications: 'Shop-issued certificates',
  contracts: 'Contracts',
  shop: 'Shop verification',
  roster: 'Roster',
  washlink_reviews: 'WashLink reviews',
  // The safe generic label for any category the app does not know yet.
  other: 'Other updates',
}

export const allAreasOptionLabel = 'All areas'
export const areaFilterLabel = 'Area'
export const areaFilterHelperText = 'Filters the notifications loaded so far.'
export const readFilterGroupLabel = 'Show notifications'
export const allReadStatesLabel = 'All'
export const unreadOnlyLabel = 'Unread'
export const inAppOnlyNoticeText = 'Notifications appear here in the app only.'

export const noNotificationsTitle = 'No notifications yet'
export const noNotificationsDescription =
  'Updates about your shop, applications, training, shop-issued certificates and contracts appear here.'
export const noUnreadNotificationsTitle = 'No unread notifications'
export const noUnreadNotificationsDescription = 'Choose "All" to see notifications you have already read.'
export const noAreaNotificationsTitle = 'Nothing in this area'
export const noAreaNotificationsDescription =
  'None of the notifications loaded so far are in this area. Load older ones or choose another area.'

export const loadOlderLabel = 'Load older'
export const noOlderNotificationsText = 'No older notifications.'
export const loadOlderErrorTitle = 'Could not load older notifications'
