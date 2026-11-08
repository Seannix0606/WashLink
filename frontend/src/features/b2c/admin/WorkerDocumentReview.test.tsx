import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminWorkerDocument } from '@washlink/shared'
import { WorkerDocumentReview } from './WorkerDocumentReview'

const api = vi.hoisted(() => ({ adminOpenWorkerDocument: vi.fn(), adminReviewWorkerDocument: vi.fn(), adminReviewWorker: vi.fn() }))
vi.mock('../b2cApiClient', () => ({ getB2cApi: (): unknown => api, errorMessage: (error: Error): string => error.message }))

const objectUrl = 'blob:http://localhost/secret-object-url'
const fileBlob = new Blob([Uint8Array.from([0xff, 0xd8, 0xff])], { type: 'text/html' })
const adminDocument = (patch: Partial<AdminWorkerDocument> = {}): AdminWorkerDocument => ({
  documentId: 'd1', workerId: 'w1', workerName: 'Wes', documentType: 'government_id', label: 'Government ID', isRequired: true, status: 'submitted', contentType: 'image/jpeg', sizeBytes: 1000,
  createdAt: '2026-11-06T00:00:00Z', submittedAt: '2026-11-06T00:00:00Z', reviewedAt: null, reviewReason: null, openedByMe: false, ...patch,
})
const onChanged = vi.fn()
const createObjectURL = vi.fn()
const revokeObjectURL = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  onChanged.mockResolvedValue(undefined)
  createObjectURL.mockReturnValue(objectUrl)
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))
  api.adminOpenWorkerDocument.mockResolvedValue({ blob: fileBlob, contentType: 'image/jpeg', readOpenUntil: '2026-11-06T00:01:00Z' })
  api.adminReviewWorkerDocument.mockResolvedValue({ status: 'approved', verificationStatus: 'pending' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function openDocument(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'Open Government ID' }))
  await screen.findByRole('button', { name: 'Close file' })
}

async function openAndShow(): Promise<void> {
  await openDocument()
  fireEvent.load(screen.getByRole('img'))
}

describe('reviewing a worker document', () => {
  it('shows no file until an admin opens it through the audited call', async () => {
    const { container } = render(<WorkerDocumentReview documents={[adminDocument()]} onChanged={onChanged} />)
    expect(container.querySelector('img')).toBeNull()
    expect(api.adminOpenWorkerDocument).not.toHaveBeenCalled()
    await openDocument()
    expect(api.adminOpenWorkerDocument).toHaveBeenCalledWith('d1')
    expect(screen.getByText(/recorded in the audit log/)).toBeInTheDocument()
  })

  it('renders the file only in an img, never as a link, frame or embedded document', async () => {
    const open = vi.spyOn(window, 'open')
    const { container } = render(<WorkerDocumentReview documents={[adminDocument()]} onChanged={onChanged} />)
    await openDocument()
    expect(container.querySelector('img')).toHaveAttribute('src', objectUrl)
    expect(container.querySelector('iframe, object, embed, a, video, audio, source')).toBeNull()
    expect(container.innerHTML.split(objectUrl).length - 1).toBe(1)
    expect(open).not.toHaveBeenCalled()
  })

  it('builds the image with the type from the server, not the type the download reported', async () => {
    render(<WorkerDocumentReview documents={[adminDocument()]} onChanged={onChanged} />)
    await openDocument()
    const made = createObjectURL.mock.calls[0][0] as Blob
    expect(made.type).toBe('image/jpeg')
    expect(made.size).toBe(fileBlob.size)
  })

  it.each(['text/html', 'image/svg+xml', 'application/pdf', null])('does not render or make a URL for a file reported as %s', async (contentType) => {
    api.adminOpenWorkerDocument.mockResolvedValue({ blob: fileBlob, contentType, readOpenUntil: '2026-11-06T00:01:00Z' })
    const { container } = render(<WorkerDocumentReview documents={[adminDocument()]} onChanged={onChanged} />)
    await openDocument()
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(container.querySelector('img, iframe, object, embed, a')).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent(/Consider rejecting it/)
    expect(screen.getByRole('button', { name: 'Approve Government ID' })).toBeDisabled()
  })

  it('suggests rejecting a file that will not display as an image, and keeps Approve unavailable', async () => {
    const { container } = render(<WorkerDocumentReview documents={[adminDocument({ openedByMe: true })]} onChanged={onChanged} />)
    await openDocument()
    fireEvent.error(screen.getByRole('img'))
    expect(screen.getByRole('alert')).toHaveTextContent(/may not be a real photo. Consider rejecting it/)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByRole('button', { name: 'Approve Government ID' })).toBeDisabled()
  })

  it('forgets and revokes the URL when the file is closed', async () => {
    const { container } = render(<WorkerDocumentReview documents={[adminDocument()]} onChanged={onChanged} />)
    await openDocument()
    expect(revokeObjectURL).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Close file' }))
    expect(container.querySelector('img')).toBeNull()
    expect(container.innerHTML).not.toContain('secret')
    expect(revokeObjectURL).toHaveBeenCalledWith(objectUrl)
  })

  it('revokes the URL on unmount', async () => {
    const { unmount } = render(<WorkerDocumentReview documents={[adminDocument()]} onChanged={onChanged} />)
    await openDocument()
    unmount()
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith(objectUrl)
  })

  it('makes no URL if the row has gone by the time the download finishes', async () => {
    let finish: (value: unknown) => void = () => undefined
    api.adminOpenWorkerDocument.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const { unmount } = render(<WorkerDocumentReview documents={[adminDocument()]} onChanged={onChanged} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open Government ID' }))
    unmount()
    finish({ blob: fileBlob, contentType: 'image/jpeg', readOpenUntil: '2026-11-06T00:01:00Z' })
    await waitFor(() => { expect(onChanged).toHaveBeenCalled() })
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('shows a refusal when a file cannot be opened', async () => {
    api.adminOpenWorkerDocument.mockRejectedValue(new Error('This document has no file to open.'))
    const { container } = render(<WorkerDocumentReview documents={[adminDocument()]} onChanged={onChanged} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open Government ID' }))
    await waitFor(() => { expect(api.adminOpenWorkerDocument).toHaveBeenCalled() })
    expect(container.querySelector('img')).toBeNull()
  })

  it('keeps Approve unavailable until the file is showing, even if this admin opened it earlier', async () => {
    render(<WorkerDocumentReview documents={[adminDocument({ openedByMe: true })]} onChanged={onChanged} />)
    expect(screen.getByRole('button', { name: 'Approve Government ID' })).toBeDisabled()
    expect(screen.getByText('Open this document before approving it.')).toBeInTheDocument()
    await openDocument()
    expect(screen.getByRole('button', { name: 'Approve Government ID' })).toBeDisabled()
    fireEvent.load(screen.getByRole('img'))
    expect(screen.getByRole('button', { name: 'Approve Government ID' })).toBeEnabled()
  })

  it('approves once showing, never verifies the washer, and revokes the URL', async () => {
    const { container } = render(<WorkerDocumentReview documents={[adminDocument({ openedByMe: true })]} onChanged={onChanged} />)
    await openAndShow()
    await userEvent.click(screen.getByRole('button', { name: 'Approve Government ID' }))
    expect(api.adminReviewWorkerDocument).toHaveBeenCalledWith('d1', 'approved')
    expect(api.adminReviewWorker).not.toHaveBeenCalled()
    await waitFor(() => { expect(onChanged).toHaveBeenCalled() })
    expect(container.querySelector('img')).toBeNull()
    expect(revokeObjectURL).toHaveBeenCalledWith(objectUrl)
  })

  it('needs a reason to reject, and says the washer will read it', async () => {
    render(<WorkerDocumentReview documents={[adminDocument()]} onChanged={onChanged} />)
    await userEvent.click(screen.getByRole('button', { name: 'Reject Government ID' }))
    expect(screen.getByText(/The washer will see this/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm rejection' }))
    expect(screen.getByText('Give a reason of 10 to 500 characters.')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/Reason for rejecting/), '123456789')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm rejection' }))
    expect(api.adminReviewWorkerDocument).not.toHaveBeenCalled()
  })

  it('sends the trimmed reason when rejecting, and revokes the URL', async () => {
    render(<WorkerDocumentReview documents={[adminDocument()]} onChanged={onChanged} />)
    await openDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reject Government ID' }))
    await userEvent.type(screen.getByLabelText(/Reason for rejecting/), '  The photo is too dark  ')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm rejection' }))
    await waitFor(() => { expect(api.adminReviewWorkerDocument).toHaveBeenCalledWith('d1', 'rejected', 'The photo is too dark') })
    await waitFor(() => { expect(revokeObjectURL).toHaveBeenCalledWith(objectUrl) })
  })

  it('keeps the form open and shows a server refusal', async () => {
    api.adminReviewWorkerDocument.mockRejectedValue(new Error('Only a document under review or already approved can be rejected.'))
    render(<WorkerDocumentReview documents={[adminDocument()]} onChanged={onChanged} />)
    await userEvent.click(screen.getByRole('button', { name: 'Reject Government ID' }))
    await userEvent.type(screen.getByLabelText(/Reason for rejecting/), 'The photo is too dark')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm rejection' }))
    expect(await screen.findByText('Only a document under review or already approved can be rejected.')).toBeInTheDocument()
    expect(screen.getByLabelText(/Reason for rejecting/)).toBeInTheDocument()
  })

  it('revokes an approved document with a reason, and warns what that does to a required one', async () => {
    render(<WorkerDocumentReview documents={[adminDocument({ status: 'approved' })]} onChanged={onChanged} />)
    expect(screen.queryByRole('button', { name: 'Approve Government ID' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Revoke Government ID' }))
    expect(screen.getByText(/moves a verified washer to pending/)).toHaveTextContent('On a started job, the washer loses customer details and job steps mid-wash, and the job waits until an admin cancels it or it becomes overdue.')
    await userEvent.type(screen.getByLabelText(/Reason for revoking/), 'This ID has since expired')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm revoke' }))
    await waitFor(() => { expect(api.adminReviewWorkerDocument).toHaveBeenCalledWith('d1', 'rejected', 'This ID has since expired') })
  })

  it('offers only opening on a rejected document, and shows the reason given', () => {
    render(<WorkerDocumentReview documents={[adminDocument({ status: 'rejected', reviewReason: 'The photo is too dark' })]} onChanged={onChanged} />)
    expect(screen.getByText('Reason given: The photo is too dark')).toBeInTheDocument()
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Open Government ID'])
  })

  it.each(['superseded', 'abandoned', 'awaiting_upload'] as const)('leaves out a %s row, which has no file to review', (status) => {
    render(<WorkerDocumentReview documents={[adminDocument({ status })]} onChanged={onChanged} />)
    expect(screen.getByText('This washer has no documents to review.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
