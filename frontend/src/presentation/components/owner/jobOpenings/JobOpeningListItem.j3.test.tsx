import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { JobOpening } from '../../../../domain/models/JobOpening'
import { buildJobOpening } from '../../../../test/fixtures'
import { JobOpeningListItem } from './JobOpeningListItem'

const evaluatedAt = new Date('2026-10-24T02:00:00Z')

function renderListItem(jobOpening: JobOpening, isShopVerifiedForPublishing: boolean): () => void {
  const { unmount } = render(
    <ul>
      <JobOpeningListItem
        jobOpening={jobOpening}
        shopName="Test Shop"
        isShopVerifiedForPublishing={isShopVerifiedForPublishing}
        evaluatedAt={evaluatedAt}
        isActionPending={false}
        onEditRequested={vi.fn()}
        onPreviewRequested={vi.fn()}
        onActionRequested={vi.fn()}
      />
    </ul>,
  )
  return unmount
}

describe('Job opening list item (J3 verified shop gate)', () => {
  it('j3_publish_action_disabled_with_reason_for_unverified_shop', () => {
    let unmountListItem = renderListItem(buildJobOpening(), false)
    const publishButton = screen.getByRole('button', { name: 'Publish' })
    expect(publishButton).toBeDisabled()
    expect(publishButton).toHaveAccessibleDescription(
      'Publish is unavailable: Publishing needs an approved shop verification.',
    )
    // Saving drafts stays available.
    expect(screen.getByRole('button', { name: 'Edit' })).toBeEnabled()
    unmountListItem()

    // Verified but incomplete: the reason names the missing fields.
    unmountListItem = renderListItem(buildJobOpening({ description: null, applicantRequirement: null }), true)
    expect(screen.getByRole('button', { name: 'Publish' })).toHaveAccessibleDescription(
      'Publish is unavailable: Complete these fields first: Description, Who can apply.',
    )
    unmountListItem()

    // Verified and complete: available.
    unmountListItem = renderListItem(buildJobOpening(), true)
    expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled()
    unmountListItem()

    // Paused at a shop that lost verification: Resume is blocked, Close is not.
    unmountListItem = renderListItem(buildJobOpening({ status: 'paused' }), false)
    expect(screen.getByRole('button', { name: 'Resume' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled()
    unmountListItem()

    // Published at a shop that lost verification: still published, shown as hidden from workers.
    unmountListItem = renderListItem(buildJobOpening({ status: 'published' }), false)
    expect(screen.getByText('Published')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Hidden from workers')
    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled()
  })
})
