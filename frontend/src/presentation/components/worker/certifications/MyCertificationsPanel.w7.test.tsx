import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import {
  buildMyCertification,
  buildOwnerCertification,
  createCertificationTestHarness,
  testCurrentInstant,
} from '../../../../test/certificationFixtures'
import { buildShop } from '../../../../test/fixtures'
import { OwnerCertificationsPanel } from '../../owner/certifications/OwnerCertificationsPanel'
import { MyCertificationsPanel } from './MyCertificationsPanel'

const suspendReason = 'Repeated unsafe chemical handling on the wash floor.'

describe('My certifications and owner certifications panels (W7)', () => {
  it('w7_my_certifications_shows_status_expiry_and_reason', async () => {
    const user = userEvent.setup()
    const harness = createCertificationTestHarness()
    harness.certificationRepository.listMyCertifications.mockResolvedValue([
      buildMyCertification({ certificationId: 'cert-active', certificationTitle: 'Interior detailing' }),
      buildMyCertification({
        certificationId: 'cert-suspended',
        status: 'suspended',
        effectiveStatus: 'suspended',
        statusReason: suspendReason,
        statusChangedAt: '2026-10-20T02:00:00Z',
        reviewWindowEndsAt: '2026-11-19T02:00:00Z',
      }),
    ])
    render(<MyCertificationsPanel certificationDependencies={harness.certificationDependencies} currentInstant={testCurrentInstant} />)
    const list = await screen.findByRole('list', { name: 'My certifications' })
    const [activeCard, suspendedCard] = within(list).getAllByRole('listitem')
    expect(activeCard).toHaveTextContent('Active')
    expect(activeCard).toHaveTextContent(/Expires .*2027/)
    expect(activeCard).toHaveTextContent('Issued by Test Shop through WashLink. Not a government-recognized credential.')
    expect(activeCard).toHaveTextContent('Shop-issued certification')
    expect(suspendedCard).toHaveTextContent('Suspended')
    expect(suspendedCard).toHaveTextContent(`Reason: ${suspendReason}`)
    expect(screen.getByText('Shop-issued: not a government-recognized credential.')).toBeInTheDocument()

    // A review is offered inside the window, with a statement of 20 to 1000 characters.
    await user.click(within(suspendedCard).getByRole('button', { name: 'Ask for a review' }))
    const dialog = screen.getByRole('dialog', { name: 'Ask for a review' })
    await user.click(within(dialog).getByRole('button', { name: 'Send review request' }))
    expect(within(dialog).getByText('Write a statement of 20 to 1000 characters.')).toBeInTheDocument()
    expect(harness.actionRepository.requestReview).not.toHaveBeenCalled()
  })

  it('w7_certification_panels_loading_empty_error_states', async () => {
    const user = userEvent.setup()
    const emptyHarness = createCertificationTestHarness()
    emptyHarness.certificationRepository.listMyCertifications.mockResolvedValue([])
    const { unmount } = render(<MyCertificationsPanel certificationDependencies={emptyHarness.certificationDependencies} />)
    expect(screen.getByLabelText('Loading your certifications')).toBeInTheDocument()
    expect(
      await screen.findByText('No certifications yet. A shop issues one after you complete its required training and pass the assessment.'),
    ).toBeInTheDocument()
    unmount()

    const errorHarness = createCertificationTestHarness()
    errorHarness.certificationRepository.listMyCertifications
      .mockRejectedValueOnce(new Error('Could not load your certifications.'))
      .mockResolvedValue([buildMyCertification()])
    render(<MyCertificationsPanel certificationDependencies={errorHarness.certificationDependencies} currentInstant={testCurrentInstant} />)
    expect(await screen.findByText('Your certifications could not be loaded')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('list', { name: 'My certifications' })).toBeInTheDocument()
  })

  it('w7_training_record_changed_flag_shown_to_owner', async () => {
    const harness = createCertificationTestHarness()
    harness.certificationRepository.listOwnerCertifications.mockResolvedValue([
      buildOwnerCertification({ isTrainingRecordChangedAfterIssue: true }),
    ])
    render(
      <OwnerCertificationsPanel
        certificationDependencies={harness.certificationDependencies}
        ownerShopList={[buildShop({ verificationStatus: 'approved' })]}
        currentInstant={testCurrentInstant}
      />,
    )
    const list = await screen.findByRole('list', { name: 'Certificate list' })
    expect(within(list).getByText(/Training record changed after issue/)).toBeInTheDocument()
    // D-24: never auto-suspended; the owner still decides.
    expect(within(list).getByText('Active')).toBeInTheDocument()
    expect(within(list).getByRole('button', { name: 'Suspend' })).toBeInTheDocument()
    expect(harness.actionRepository.transition).not.toHaveBeenCalled()
    expect(await screen.findByLabelText(/Validity in months/)).toHaveValue('12')
  })
})
