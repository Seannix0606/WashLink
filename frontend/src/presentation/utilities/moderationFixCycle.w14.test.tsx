import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { isActivityEventShownTo } from '../../application/services/WorkforceActivityService'
import { subjectTypeSchema } from '../../application/validation/moderationSchemas'
import { relationshipLookupPurposes } from '../../domain/models/AdminOversight'
import type { WorkforceActivityEvent } from '../../domain/models/WorkforceActivity'
import { createModerationTestHarness } from '../../test/moderationFixtures'
import { WorkforceActivityDrawer } from '../components/account/WorkforceActivityDrawer'
import { lookupPurposeLabel, relationshipsIntro } from './adminOversightCopy'
import { askWashLinkIntro, jobOpeningModerationCopyConstants, ownerEditFirstText, reportCategoryLabel } from './jobOpeningModerationCopy'
import { describeActivityDetails, subjectLookupPurposeKey, subjectLookupPurposeText } from './workforceActivityCopy'

function buildActivityEvent(eventId: number, action: string, overrides: Partial<WorkforceActivityEvent> = {}): WorkforceActivityEvent {
  return {
    eventId,
    createdAt: '2026-10-29T02:00:00Z',
    action,
    subjectType: action.slice(0, action.indexOf('.')),
    actorLabel: 'you',
    details: {},
    ...overrides,
  }
}

const reportActions = ['job_opening_report.submitted', 'job_opening_report.withdrawn', 'job_opening_report.closed'] as const

describe('W14 fix cycle 1 (frontend)', () => {
  it('w14_fix_s1_unpaid_report_reason_does_not_cover_free_training', () => {
    const unpaidLabel = reportCategoryLabel.unpaid_trial_or_training
    expect(unpaidLabel).toBe('Unpaid work presented as a trial or training')
    // Free, unpaid initial training is the WashLink model; the reason is about unpaid WORK, and it stays apart from fees.
    expect(unpaidLabel).not.toMatch(/^Unpaid trial work or training$|fee|deposit/i)
    expect(reportCategoryLabel.worker_fee_or_deposit).toMatch(/fee or deposit/)
  })

  it('w14_fix_s5_relationships_intro_names_only_the_looked_up_person', () => {
    expect(relationshipsIntro).toContain('Only the person you look up sees an entry in their activity')
    expect(relationshipsIntro).toContain('general purpose')
    expect(relationshipsIntro).toContain('Other people in the results see nothing.')
    expect(relationshipsIntro).not.toMatch(/the person sees in their activity that WashLink looked|everyone/i)
  })

  it('w14_fix_n7_subject_sees_only_the_generic_lookup_purpose', () => {
    expect(describeActivityDetails({ purpose: subjectLookupPurposeKey })).toEqual([`Purpose: ${subjectLookupPurposeText}`])
    // A specific purpose never reaches the looked-up person through this view, even if one came back.
    for (const specificPurpose of relationshipLookupPurposes) {
      const detailLines = describeActivityDetails({ purpose: specificPurpose, access_kind: 'worker_relationships' })
      expect(detailLines).toEqual([`Purpose: ${subjectLookupPurposeText}`, 'Looked up: worker relationships'])
      expect(detailLines.join(' ')).not.toContain(lookupPurposeLabel[specificPurpose])
      expect(detailLines.join(' ')).not.toContain(specificPurpose.replace(/_/g, ' '))
    }
    // The admin views keep the specific labels; the generic key is not one of them.
    expect(Object.keys(lookupPurposeLabel)).not.toContain(subjectLookupPurposeKey)
  })

  it('w14_fix_n9_subject_type_filter_matches_the_database_limit', () => {
    expect(subjectTypeSchema.safeParse('a'.repeat(40)).success).toBe(true)
    expect(subjectTypeSchema.safeParse('a'.repeat(41)).success).toBe(false)
    expect(subjectTypeSchema.safeParse('').success).toBe(true)
  })

  it('w14_fix_n5_owner_copy_says_a_real_change_is_needed', () => {
    expect(askWashLinkIntro).toContain('It must differ from the version WashLink paused')
    expect(askWashLinkIntro).toContain('saving it without a real change is not enough')
    expect(ownerEditFirstText).toContain('Saving it without changing what it says is not enough.')
    for (const ownerText of [askWashLinkIntro, ownerEditFirstText, ...jobOpeningModerationCopyConstants]) {
      expect(ownerText).not.toMatch(/Suspended|lawful|legally (valid|binding)|compliant/i)
    }
  })

  it('w14_fix_b1_report_rows_are_never_shown_to_an_owner', () => {
    for (const reportAction of reportActions) {
      expect(isActivityEventShownTo(buildActivityEvent(1, reportAction), 'owner')).toBe(false)
      expect(isActivityEventShownTo(buildActivityEvent(1, reportAction, { actorLabel: 'washlink' }), 'worker')).toBe(true)
    }
    expect(isActivityEventShownTo(buildActivityEvent(1, 'job_opening_moderation.paused', { actorLabel: 'washlink' }), 'owner')).toBe(true)
  })

  it('w14_fix_b1_owner_activity_drawer_renders_no_report_row_and_pages_past_hidden_rows', async () => {
    const harness = createModerationTestHarness()
    const fullPage: WorkforceActivityEvent[] = [
      buildActivityEvent(500, 'job_opening_moderation.resolved_owner_closed'),
      buildActivityEvent(499, 'job_opening_report.closed', { details: { category: 'age_requirement', outcome: 'opening_closed' } }),
      ...Array.from({ length: 48 }, (_unused, index) => buildActivityEvent(498 - index, 'job_opening_report.closed')),
    ]
    harness.activityRepository.listMyActivity.mockResolvedValueOnce(fullPage)
    render(<WorkforceActivityDrawer isOpen workforceActivityService={harness.workforceActivityService} viewerRole="owner" onClose={vi.fn()} />)

    const activityList = await screen.findByRole('list', { name: 'Activity' })
    expect(activityList).toHaveTextContent('A paused job opening was closed by its owner')
    expect(activityList).not.toHaveTextContent(/report|Category|Outcome|Age requirement|age requirement/i)
    expect(activityList.querySelectorAll('li')).toHaveLength(1)

    // Paging continues from the oldest row the database returned, not the oldest one shown.
    harness.activityRepository.listMyActivity.mockResolvedValueOnce([])
    screen.getByRole('button', { name: 'Show older activity' }).click()
    await vi.waitFor(() => {
      expect(harness.activityRepository.listMyActivity).toHaveBeenLastCalledWith(451, 50)
    })
  })

  it('w14_fix_b1_reporter_still_sees_their_report_rows', async () => {
    const harness = createModerationTestHarness()
    harness.activityRepository.listMyActivity.mockResolvedValueOnce([
      buildActivityEvent(10, 'job_opening_report.closed', { actorLabel: 'washlink', details: { outcome: 'no_action' } }),
    ])
    render(<WorkforceActivityDrawer isOpen workforceActivityService={harness.workforceActivityService} viewerRole="worker" onClose={vi.fn()} />)
    expect(await screen.findByRole('list', { name: 'Activity' })).toHaveTextContent('WashLink reviewed a job opening report')
  })
})
