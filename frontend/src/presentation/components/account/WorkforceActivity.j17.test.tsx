import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { WorkforceActivityEvent } from '../../../domain/models/WorkforceActivity'
import { mapWorkforceActivityRow } from '../../../infrastructure/supabase/supabaseWorkforceActivityRows'
import { createModerationTestHarness } from '../../../test/moderationFixtures'
import { WorkforceActivityDrawer } from './WorkforceActivityDrawer'

const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

function buildEvents(count: number, firstEventId: number): WorkforceActivityEvent[] {
  return Array.from({ length: count }, (_unused, index) => ({
    eventId: firstEventId - index,
    createdAt: '2026-10-28T02:00:00Z',
    action: 'certification.issued',
    subjectType: 'certification',
    actorLabel: 'shop_owner' as const,
    details: { to_status: 'current' },
  }))
}

describe('"Your activity" (J17, W14)', () => {
  it('j17_w14_activity_drawer_renders_labels_not_ids', async () => {
    const user = userEvent.setup()
    const harness = createModerationTestHarness()
    // The mapper keeps allow-listed scalar values and drops anything id-shaped.
    const lookupEvent = mapWorkforceActivityRow({
      event_id: '900',
      created_at: '2026-10-29T02:00:00Z',
      action: 'admin_access.relationships_viewed',
      subject_type: 'profile',
      actor_label: 'washlink',
      details: { purpose: 'washlink_review', access_kind: 'worker_relationships', leaked: '0b0b0b0b-0b0b-40b0-80b0-0b0b0b0b0b0b', nested: { id: 'x' } },
    })
    expect(lookupEvent.details).toEqual({ purpose: 'washlink_review', access_kind: 'worker_relationships' })
    const reportEvent: WorkforceActivityEvent = {
      eventId: 899,
      createdAt: '2026-10-28T02:00:00Z',
      action: 'job_opening_report.submitted',
      subjectType: 'job_opening',
      actorLabel: 'you',
      details: { category: 'age_requirement' },
    }
    harness.activityRepository.listMyActivity
      .mockResolvedValueOnce([lookupEvent, reportEvent, ...buildEvents(48, 898)])
      .mockResolvedValueOnce(buildEvents(1, 800))
    render(<WorkforceActivityDrawer isOpen workforceActivityService={harness.workforceActivityService} onClose={vi.fn()} />)

    const activityList = await screen.findByRole('list', { name: 'Activity' })
    expect(harness.activityRepository.listMyActivity).toHaveBeenCalledWith(null, 50)
    expect(activityList).toHaveTextContent('WashLink looked up your workforce relationships')
    expect(activityList).toHaveTextContent('Purpose: WashLink review')
    expect(activityList).toHaveTextContent('Job opening reported')
    expect(activityList).toHaveTextContent('You ·')
    expect(activityList).toHaveTextContent('A shop owner ·')
    expect(activityList).toHaveTextContent('Certificate: issued')
    expect(activityList.textContent).not.toMatch(uuidPattern)
    expect(screen.getByText(/not a complete copy of your data/)).toBeInTheDocument()

    // Older pages are read by event number, never polled.
    await user.click(screen.getByRole('button', { name: 'Show older activity' }))
    await waitFor(() => {
      expect(harness.activityRepository.listMyActivity).toHaveBeenLastCalledWith(851, 50)
    })
    expect(within(activityList).getAllByRole('listitem')).toHaveLength(51)
    expect(screen.queryByRole('button', { name: 'Show older activity' })).toBeNull()
  })
})
