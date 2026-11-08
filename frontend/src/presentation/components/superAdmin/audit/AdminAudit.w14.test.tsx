import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { AdminAuditLogEvent } from '../../../../domain/models/AdminOversight'
import { createModerationTestHarness, testLookupProfileIdentifier } from '../../../../test/moderationFixtures'
import { AdminAccessFlagsList } from './AdminAccessFlagsList'
import { AdminAuditLogPanel } from './AdminAuditLogPanel'

function buildAuditEvents(count: number, firstEventId: number): AdminAuditLogEvent[] {
  return Array.from({ length: count }, (_unused, index) => ({
    eventId: firstEventId - index,
    createdAt: '2026-10-28T02:00:00Z',
    actorId: null,
    actorRole: 'super_admin',
    actorKind: 'user',
    action: 'admin_access.relationships_viewed',
    subjectType: 'profile',
    subjectId: testLookupProfileIdentifier,
    subjectProfileId: testLookupProfileIdentifier,
    payload: { purpose: 'policy_monitoring' },
    accessPurpose: 'policy_monitoring',
    accessNote: 'Monthly check of the relationship goal numbers.',
  }))
}

describe('Super_admin audit log (W14)', () => {
  it('w14_admin_audit_log_filters_and_paging', async () => {
    const user = userEvent.setup()
    const harness = createModerationTestHarness()
    harness.oversightRepository.searchAuditLog.mockResolvedValueOnce(buildAuditEvents(50, 500)).mockResolvedValueOnce(buildAuditEvents(2, 450))
    render(<AdminAuditLogPanel adminOversightService={harness.adminOversightService} />)

    // Every search is audited, so nothing is read before the administrator searches.
    expect(await screen.findByText('Choose filters and search. Nothing is read until you search.')).toBeInTheDocument()
    expect(harness.oversightRepository.searchAuditLog).not.toHaveBeenCalled()

    const filters = screen.getByRole('search', { name: 'Audit log filters' })
    await user.type(within(filters).getByLabelText(/Action starts with/), 'Job-Opening')
    await user.click(within(filters).getByRole('button', { name: 'Search the audit log' }))
    expect(within(filters).getByRole('alert')).toHaveTextContent('Use only lowercase letters, dots and underscores in the action filter.')
    await user.clear(within(filters).getByLabelText(/Action starts with/))
    await user.type(within(filters).getByLabelText(/About this account id/), 'not-an-id')
    await user.click(within(filters).getByRole('button', { name: 'Search the audit log' }))
    expect(within(filters).getByRole('alert')).toHaveTextContent('Enter a full id (36 characters) or leave it empty.')
    expect(harness.oversightRepository.searchAuditLog).not.toHaveBeenCalled()

    await user.clear(within(filters).getByLabelText(/About this account id/))
    await user.type(within(filters).getByLabelText(/Action starts with/), 'admin_access.')
    await user.type(within(filters).getByLabelText(/About this account id/), testLookupProfileIdentifier)
    await user.click(within(filters).getByRole('button', { name: 'Search the audit log' }))
    const events = await screen.findByRole('list', { name: 'Audit events' })
    const expectedFilters = {
      actionPrefix: 'admin_access.',
      subjectType: null,
      subjectId: null,
      profileId: testLookupProfileIdentifier,
      actorId: null,
      from: null,
      to: null,
    }
    expect(harness.oversightRepository.searchAuditLog).toHaveBeenCalledWith(expectedFilters, null, 50)
    expect(within(events).getAllByRole('listitem')).toHaveLength(50)
    expect(events).toHaveTextContent('Purpose: policy_monitoring · note: Monthly check of the relationship goal numbers.')

    await user.click(screen.getByRole('button', { name: 'Show older events' }))
    await waitFor(() => {
      expect(harness.oversightRepository.searchAuditLog).toHaveBeenLastCalledWith(expectedFilters, 451, 50)
    })
    expect(within(screen.getByRole('list', { name: 'Audit events' })).getAllByRole('listitem')).toHaveLength(52)
    expect(screen.queryByRole('button', { name: 'Show older events' })).toBeNull()
  })

  it('w14_admin_access_flags_list', async () => {
    const harness = createModerationTestHarness()
    harness.oversightRepository.listAccessFlags.mockResolvedValueOnce([
      { disputeId: 'dispute-1', contractId: 'contract-1', openedDays: 41, caseViewCount: 7, distinctViewerCount: 2, lastViewedAt: '2026-10-28T02:00:00Z' },
    ])
    const { unmount } = render(<AdminAccessFlagsList adminOversightService={harness.adminOversightService} />)
    const flagList = await screen.findByRole('list', { name: 'Long-open disputes read often' })
    expect(flagList).toHaveTextContent('Open 41 days · case opened 7 times by 2 administrators')
    expect(screen.getByText(/older than 30 days whose case was opened 5 or more times/)).toBeInTheDocument()
    unmount()

    harness.oversightRepository.listAccessFlags.mockResolvedValueOnce([])
    const emptyRender = render(<AdminAccessFlagsList adminOversightService={harness.adminOversightService} />)
    expect(await screen.findByText('No flagged disputes')).toBeInTheDocument()
    emptyRender.unmount()

    harness.oversightRepository.listAccessFlags.mockRejectedValueOnce(new Error('Only a platform administrator can read the audit log.'))
    render(<AdminAccessFlagsList adminOversightService={harness.adminOversightService} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Only a platform administrator can read the audit log.')
  })
})
