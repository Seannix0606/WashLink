/**
 * W12 (D-68): the inbox area of each notification category. Pure and client-side: the database
 * registry (`notification_categories`) is not readable by any client, so this map is kept in step
 * with the w12b seed by a Vitest test. A category that is not in the map is never hidden; it is
 * shown in the generic `other` area.
 */
export const notificationAreas = [
  'applications',
  'job_openings',
  'training',
  'certifications',
  'contracts',
  'shop',
  'roster',
  'washlink_reviews',
  'other',
] as const

export type NotificationArea = (typeof notificationAreas)[number]

/** The 37 registered categories (w12b seed), grouped by area. */
const categoriesByArea: Readonly<Record<Exclude<NotificationArea, 'other'>, readonly string[]>> = {
  shop: ['shop_verification.status_changed', 'shop_verification.rereviewed'],
  roster: ['roster.linked', 'roster.unlinked'],
  applications: [
    'job_application.submitted',
    'job_application.status_changed',
    'job_application.withdrawn',
    'job_application.closed',
    'job_application.removed',
    'job_opening.paused',
  ],
  job_openings: [
    'job_opening_moderation.paused',
    'job_opening_moderation.closed',
    'job_opening_moderation.pause_kept',
    'job_opening_moderation.lifted',
    'job_opening_report.closed',
  ],
  training: [
    'training.schedule_changed',
    'training.trainer_role',
    'training.invited',
    'training.response',
    'training.cancelled',
    'training.record_corrected',
    'training.assessment',
  ],
  certifications: [
    'certification.issued',
    'certification.renewed',
    'certification.suspended',
    'certification.revoked',
    'certification.reinstated',
    'certification.review_requested',
    'certification.review_decided',
    'certification.training_record_changed',
    'certification.expiring',
    'certification.expired',
  ],
  contracts: ['worker_contract', 'worker_contract_dispute.raised', 'worker_contract_dispute.closed'],
  washlink_reviews: ['certification_platform_review.opened', 'certification_platform_review.decided'],
}

// A Map (not an object) so a category such as `constructor` can never hit a prototype property.
const areaByCategory: ReadonlyMap<string, NotificationArea> = new Map(
  Object.entries(categoriesByArea).flatMap(([area, categories]) =>
    categories.map((category): [string, NotificationArea] => [category, area as NotificationArea]),
  ),
)

/** Every category the client knows, in map order. */
export const knownNotificationCategories: readonly string[] = [...areaByCategory.keys()]

/** The area of a category; unknown or future categories fall back to `other`. */
export function notificationAreaForCategory(category: string): NotificationArea {
  return areaByCategory.get(category) ?? 'other'
}

export function isNotificationArea(value: string): value is NotificationArea {
  return (notificationAreas as readonly string[]).includes(value)
}
