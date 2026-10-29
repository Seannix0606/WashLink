/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  knownNotificationCategories,
  notificationAreaForCategory,
  notificationAreas,
  type NotificationArea,
} from './notificationAreas'

// The w12b seed is outside the Vite root, so it is read from disk (test only; `npm test` runs in frontend/).
const registryMigrationText = readFileSync(
  resolve(process.cwd(), '..', 'supabase', 'migrations', '2026_10_30_w12b_notification_category_registry.sql'),
  'utf8',
)

/** The 37 categories and suggested areas listed in W12 LOG.md "RPCs and reads for the frontend". */
const loggedCategoryAreas: Readonly<Record<string, NotificationArea>> = {
  'shop_verification.status_changed': 'shop',
  'shop_verification.rereviewed': 'shop',
  'roster.linked': 'roster',
  'roster.unlinked': 'roster',
  'job_application.submitted': 'applications',
  'job_application.status_changed': 'applications',
  'job_application.withdrawn': 'applications',
  'job_application.closed': 'applications',
  'job_application.removed': 'applications',
  'job_opening.paused': 'applications',
  'job_opening_moderation.paused': 'job_openings',
  'job_opening_moderation.closed': 'job_openings',
  'job_opening_moderation.pause_kept': 'job_openings',
  'job_opening_moderation.lifted': 'job_openings',
  'job_opening_report.closed': 'job_openings',
  'training.schedule_changed': 'training',
  'training.trainer_role': 'training',
  'training.invited': 'training',
  'training.response': 'training',
  'training.cancelled': 'training',
  'training.record_corrected': 'training',
  'training.assessment': 'training',
  'certification.issued': 'certifications',
  'certification.renewed': 'certifications',
  'certification.suspended': 'certifications',
  'certification.revoked': 'certifications',
  'certification.reinstated': 'certifications',
  'certification.review_requested': 'certifications',
  'certification.review_decided': 'certifications',
  'certification.training_record_changed': 'certifications',
  'certification.expiring': 'certifications',
  'certification.expired': 'certifications',
  worker_contract: 'contracts',
  'worker_contract_dispute.raised': 'contracts',
  'worker_contract_dispute.closed': 'contracts',
  'certification_platform_review.opened': 'washlink_reviews',
  'certification_platform_review.decided': 'washlink_reviews',
}

/** Categories seeded by the w12b migration: each seed row starts with `('<category>', 'W<n>'`. */
function seededRegistryCategories(migrationText: string): string[] {
  return [...migrationText.matchAll(/^\s*\('([a-z_.]+)',\s*'W\d{1,2}'/gm)].map((match) => match[1])
}

describe('Notification areas (W12, D-68)', () => {
  it('w12_every_registered_category_has_an_area', () => {
    const loggedCategories = Object.keys(loggedCategoryAreas)
    expect(loggedCategories).toHaveLength(37)
    for (const category of loggedCategories) {
      expect(notificationAreaForCategory(category), category).toBe(loggedCategoryAreas[category])
    }

    // The client map and the database seed list exactly the same 37 categories.
    const seededCategories = seededRegistryCategories(registryMigrationText)
    expect(seededCategories).toHaveLength(37)
    expect([...seededCategories].sort()).toEqual([...loggedCategories].sort())
    expect([...knownNotificationCategories].sort()).toEqual([...seededCategories].sort())
    for (const category of seededCategories) {
      expect(notificationAreaForCategory(category), category).not.toBe('other')
    }

    // Every area except the generic one is used by at least one category.
    const usedAreas = new Set(knownNotificationCategories.map(notificationAreaForCategory))
    expect([...usedAreas].sort()).toEqual(notificationAreas.filter((area) => area !== 'other').sort())
  })

  it('w12_unknown_category_shows_other_area', () => {
    for (const unknownCategory of ['future.unknown_category', 'test.notice', '', 'constructor', '__proto__', 'toString', 'CERTIFICATION.ISSUED', 'certification']) {
      expect(notificationAreaForCategory(unknownCategory), unknownCategory).toBe('other')
    }
  })
})
