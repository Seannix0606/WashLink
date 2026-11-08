import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { B2cOperationsPanel } from './B2cOperationsPanel'

const api = vi.hoisted(() => ({
  adminSummary: vi.fn(), adminCatalog: vi.fn(), adminWorkers: vi.fn(), adminBookings: vi.fn(), adminReviewWorker: vi.fn(), adminWorkerDocuments: vi.fn(), adminWorkerDocumentOverview: vi.fn(),
}))
vi.mock('../b2cApiClient', () => ({ getB2cApi: (): unknown => api, errorMessage: (error: Error): string => error.message }))

beforeEach(() => {
  vi.clearAllMocks()
  api.adminSummary.mockResolvedValue({ draft_prices: 0, customer_total_cents: 0, platform_fee_cents: 0 })
  api.adminCatalog.mockResolvedValue({ settings: { bookings_open: false, commission_bps: 0 }, services: [], addons: [] })
  api.adminWorkers.mockResolvedValue([{ profile_id: 'w1', full_name: 'Wes', verification_status: 'verified', has_service_area: true, service_radius_km: 10, completed_count: 0 }])
  api.adminBookings.mockResolvedValue([])
  api.adminWorkerDocuments.mockResolvedValue([])
  api.adminWorkerDocumentOverview.mockResolvedValue({ documentsToReview: 3, filesWaitingForRemoval: 2, oldestFileWaitingSince: '2026-11-01T01:00:00Z' })
})

describe('washers in the admin panel', () => {
  it.each([['empty', ''], ['nine characters', '123456789'], ['501 characters', 'x'.repeat(501)]])('does not suspend with a reason that is %s', async (_label, reason) => {
    render(<B2cOperationsPanel />)
    await userEvent.click(await screen.findByRole('button', { name: 'Suspend' }))
    const field = screen.getByLabelText(/Reason for suspending/)
    field.removeAttribute('maxlength')
    if (reason !== '') {
      await userEvent.click(field)
      await userEvent.paste(reason)
    }
    await userEvent.click(screen.getByRole('button', { name: 'Confirm suspend' }))
    expect(screen.getByText('Give a reason of 10 to 500 characters.')).toBeInTheDocument()
    expect(api.adminReviewWorker).not.toHaveBeenCalled()
  })

  it('keeps the suspend form open and shows a server refusal', async () => {
    api.adminReviewWorker.mockRejectedValue(new Error('Give a reason of 10 to 500 characters.'))
    render(<B2cOperationsPanel />)
    await userEvent.click(await screen.findByRole('button', { name: 'Suspend' }))
    await userEvent.type(screen.getByLabelText(/Reason for suspending/), 'Repeated customer complaints')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm suspend' }))
    expect(await screen.findByText('Give a reason of 10 to 500 characters.')).toBeInTheDocument()
    expect(screen.getByLabelText(/Reason for suspending/)).toBeInTheDocument()
  })

  describe('verifying a washer', () => {
    const pendingWorker = { profile_id: 'w1', full_name: 'Wes', verification_status: 'pending', has_service_area: true, service_radius_km: 10, completed_count: 0 }
    const adminDocument = (documentType: string, label: string, status: string): unknown => ({ documentId: `${documentType}-${status}`, workerId: 'w1', workerName: 'Wes', documentType, label, isRequired: true, status, contentType: 'image/jpeg', sizeBytes: 1000, createdAt: '2026-11-01T00:00:00Z', submittedAt: null, reviewedAt: null, reviewReason: null, openedByMe: false })

    beforeEach(() => {
      api.adminWorkers.mockResolvedValue([pendingWorker])
    })

    it('shows which documents block verification, and keeps Verify unavailable', async () => {
      api.adminWorkerDocuments.mockResolvedValue([adminDocument('government_id', 'Government ID', 'submitted')])
      render(<B2cOperationsPanel />)
      expect(await screen.findByText('Government ID: under review')).toBeInTheDocument()
      expect(screen.getByText('Selfie: not uploaded')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled()
      expect(api.adminWorkerDocuments).toHaveBeenCalledWith('w1')
    })

    it('stays unavailable while documents are unknown, and says so when they could not load', async () => {
      api.adminWorkerDocuments.mockRejectedValue(new Error('Could not load documents.'))
      render(<B2cOperationsPanel />)
      expect(await screen.findByText('Could not load documents.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled()
    })

    it('offers Verify once every required document is approved, as a separate action that the server still decides', async () => {
      api.adminWorkerDocuments.mockResolvedValue([adminDocument('government_id', 'Government ID', 'approved'), adminDocument('selfie', 'Selfie', 'approved')])
      api.adminReviewWorker.mockRejectedValue(new Error('Approve every required document before verifying this washer.'))
      const toastError = vi.spyOn(toast, 'error')
      render(<B2cOperationsPanel />)
      await waitFor(() => { expect(screen.getByRole('button', { name: 'Verify' })).toBeEnabled() })
      expect(api.adminReviewWorker).not.toHaveBeenCalled()
      await userEvent.click(screen.getByRole('button', { name: 'Verify' }))
      expect(api.adminReviewWorker).toHaveBeenCalledWith('w1', 'verified', '')
      await waitFor(() => { expect(toastError).toHaveBeenCalledWith('Approve every required document before verifying this washer.') })
    })

    it.each(['suspended', 'rejected'])('lets an admin move a %s washer to pending, so they can upload again', async (status) => {
      api.adminWorkers.mockResolvedValue([{ ...pendingWorker, verification_status: status }])
      api.adminReviewWorker.mockResolvedValue(undefined)
      render(<B2cOperationsPanel />)
      await userEvent.click(await screen.findByRole('button', { name: 'Move to pending' }))
      expect(api.adminReviewWorker).toHaveBeenCalledWith('w1', 'pending', '')
    })
  })

  it('shows the document review count and the files still waiting for removal, without saying they are gone', async () => {
    render(<B2cOperationsPanel />)
    expect(await screen.findByText(/Documents to review/)).toHaveTextContent('Documents to review: 3')
    expect(screen.getByText(/Files waiting for removal/)).toHaveTextContent('Files waiting for removal: 2')
    expect(screen.getByText(/stay in storage until the removal job runs/)).toHaveTextContent("includes items the job hasn't reached yet")
  })
})
