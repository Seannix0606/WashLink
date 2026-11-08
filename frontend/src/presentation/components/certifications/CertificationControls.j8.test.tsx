import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import {
  buildMyCertification,
  buildOwnerCertification,
  createCertificationTestHarness,
  testCertificationIdentifier,
  testCurrentInstant,
} from '../../../test/certificationFixtures'
import { testShopIdentifier } from '../../../test/fixtures'
import { OwnerShopCertifications } from '../owner/certifications/OwnerShopCertifications'
import { MyCertificationsPanel } from '../worker/certifications/MyCertificationsPanel'

describe('Certification status changes (J8)', () => {
  it('j8_status_change_modal_requires_reason', async () => {
    const user = userEvent.setup()
    const harness = createCertificationTestHarness()
    harness.certificationRepository.listOwnerCertifications.mockResolvedValue([buildOwnerCertification()])
    harness.actionRepository.transition.mockResolvedValue({
      certificationId: testCertificationIdentifier, status: 'suspended', issuedAt: '2026-06-01T02:00:00Z', expiresAt: '2027-06-01T02:00:00Z',
    })
    render(
      <OwnerShopCertifications
        certificationDependencies={harness.certificationDependencies}
        shopId={testShopIdentifier}
        isShopVerified
        currentInstant={testCurrentInstant}
      />,
    )
    await user.click(await screen.findByRole('button', { name: 'Suspend' }))
    const dialog = screen.getByRole('dialog', { name: 'Suspend this certificate?' })
    await user.click(within(dialog).getByRole('button', { name: 'Suspend certificate' }))
    expect(within(dialog).getByText('Give a reason of 20 to 500 characters.')).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText(/Reason \(required/), 'Too short')
    await user.click(within(dialog).getByRole('button', { name: 'Suspend certificate' }))
    expect(harness.actionRepository.transition).not.toHaveBeenCalled()

    await user.clear(within(dialog).getByLabelText(/Reason \(required/))
    await user.type(within(dialog).getByLabelText(/Reason \(required/), 'Repeated unsafe chemical handling on the floor.')
    await user.click(within(dialog).getByRole('button', { name: 'Suspend certificate' }))
    await waitFor(() => {
      expect(harness.actionRepository.transition).toHaveBeenCalledWith({
        certificationId: testCertificationIdentifier,
        fromStatus: 'active',
        toStatus: 'suspended',
        reason: 'Repeated unsafe chemical handling on the floor.',
      })
    })
  })

  it('j8_worker_view_has_no_status_change_controls', async () => {
    const harness = createCertificationTestHarness()
    harness.certificationRepository.listMyCertifications.mockResolvedValue([
      buildMyCertification(),
      buildMyCertification({
        certificationId: 'cert-suspended',
        status: 'suspended',
        effectiveStatus: 'suspended',
        statusReason: 'Repeated unsafe chemical handling on the floor.',
      }),
    ])
    render(<MyCertificationsPanel certificationDependencies={harness.certificationDependencies} currentInstant={testCurrentInstant} />)
    await screen.findByRole('list', { name: 'My certifications' })
    for (const forbiddenLabel of [/^Suspend/, /^Revoke/, /^Reinstate/, /^Renew/, /^Issue/, /Record re-assessment/, /Decide review/]) {
      expect(screen.queryByRole('button', { name: forbiddenLabel })).toBeNull()
    }
    expect(harness.actionRepository.transition).not.toHaveBeenCalled()
  })
})
