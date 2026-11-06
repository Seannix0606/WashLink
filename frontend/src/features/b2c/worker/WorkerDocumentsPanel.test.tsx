import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkerDocumentSlot } from '@washlink/shared'
import { WORKER_DOCUMENT_MAX_BYTES } from '@washlink/shared'
import { WorkerDocumentsPanel } from './WorkerDocumentsPanel'

const api = vi.hoisted(() => ({ myWorkerDocuments: vi.fn(), uploadWorkerDocument: vi.fn() }))
vi.mock('../b2cApiClient', () => ({ getB2cApi: (): unknown => api, errorMessage: (error: Error): string => error.message }))

const slot = (documentType: string, label: string, patch: Partial<WorkerDocumentSlot> = {}): WorkerDocumentSlot => ({
  documentType, label, instructions: `Instructions for ${label}`, isRequired: true, documentId: null, status: null, submittedAt: null, reviewedAt: null, reviewReason: null, hasApprovedCopy: false, ...patch,
})
const bothEmpty = [slot('government_id', 'Government ID'), slot('selfie', 'Selfie')]

const photo = (name: string, bytes: Uint8Array, type = 'image/jpeg'): File => {
  const file = new File([Uint8Array.from(bytes)], name, { type })
  Object.defineProperty(file, 'arrayBuffer', { configurable: true, writable: true, value: (): Promise<ArrayBuffer> => Promise.resolve(Uint8Array.from(bytes).buffer) })
  return file
}
const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])

beforeEach(() => {
  vi.clearAllMocks()
  api.myWorkerDocuments.mockResolvedValue(bothEmpty)
  api.uploadWorkerDocument.mockResolvedValue({ documentId: 'd1', documentType: 'selfie', status: 'submitted' })
})

describe('washer verification photos', () => {
  it('shows who sees the photos and why, with one row per type', async () => {
    render(<WorkerDocumentsPanel verificationStatus="pending" />)
    expect(screen.getByText(/Only WashLink's admin screen opens them for review, and each of those openings is recorded. People who run WashLink's systems could also reach the files./)).toBeInTheDocument()
    expect(screen.queryByText(/Only WashLink admins can open them/)).toBeNull()
    expect(await screen.findByText('Instructions for Government ID')).toBeInTheDocument()
    expect(screen.getByText('Instructions for Selfie')).toBeInTheDocument()
    expect(screen.getAllByText('Not uploaded')).toHaveLength(2)
  })

  it('says how long files stay', () => {
    render(<WorkerDocumentsPanel verificationStatus="pending" />)
    expect(screen.getByText(/WashLink has not set a time limit for keeping these photos\. They stay in private storage while your account is open\. A replaced photo, or your photos after you delete your account, stay there until WashLink runs its removal job, which has no fixed date yet\./)).toBeInTheDocument()
  })

  it('shows the refusal as written while WashLink is not accepting uploads, which the client cannot tell in advance', async () => {
    const refusal = "WashLink isn't accepting verification documents yet. Try again later."
    api.uploadWorkerDocument.mockRejectedValue(new Error(refusal))
    render(<WorkerDocumentsPanel verificationStatus="pending" />)
    await userEvent.upload(await screen.findByLabelText('Choose a photo of your Selfie'), photo('a.jpg', jpegBytes))
    expect(await screen.findByRole('alert')).toHaveTextContent(refusal)
  })

  it('makes no legal or identity claim', async () => {
    const { container } = render(<WorkerDocumentsPanel verificationStatus="pending" />)
    await screen.findByText('Instructions for Selfie')
    expect(container.textContent).not.toMatch(/\blaw\b|legal|legally|regulation|compliance|identity (was |is )?(verified|confirmed|proven)|independently/i)
  })

  it('shows a loading state, then an error with a way to retry', async () => {
    api.myWorkerDocuments.mockRejectedValueOnce(new Error('Sign in with a worker account.'))
    render(<WorkerDocumentsPanel verificationStatus="pending" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign in with a worker account.')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Instructions for Selfie')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says so when no type is being asked for', async () => {
    api.myWorkerDocuments.mockResolvedValue([])
    render(<WorkerDocumentsPanel verificationStatus="pending" />)
    expect(await screen.findByText(/isn't asking for any photos/)).toBeInTheDocument()
  })

  it('asks for a saved profile first, and offers no upload until then', async () => {
    render(<WorkerDocumentsPanel verificationStatus={null} />)
    expect(screen.getByText(/Save your washer profile below first/)).toBeInTheDocument()
    await screen.findByText('Instructions for Selfie')
    expect(screen.queryByLabelText(/photo of your/)).toBeNull()
  })

  it('uploads bytes through the shared client, sends no filename, and shows the new status', async () => {
    render(<WorkerDocumentsPanel verificationStatus="pending" />)
    const input = await screen.findByLabelText('Choose a photo of your Selfie')
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png')
    api.myWorkerDocuments.mockResolvedValue([bothEmpty[0], slot('selfie', 'Selfie', { status: 'submitted', documentId: 'd1', submittedAt: '2026-11-06T01:00:00Z' })])
    await userEvent.upload(input, photo('../../my id card.jpg', jpegBytes))
    await waitFor(() => { expect(api.uploadWorkerDocument).toHaveBeenCalledTimes(1) })
    const args = api.uploadWorkerDocument.mock.calls[0] as unknown[]
    expect(args).toHaveLength(2)
    expect(args[0]).toBe('selfie')
    expect(new Uint8Array(args[1] as ArrayBuffer)).toEqual(jpegBytes)
    expect(await screen.findByText('Under review')).toBeInTheDocument()
  })

  it('offers no way to view a file', async () => {
    api.myWorkerDocuments.mockResolvedValue([slot('selfie', 'Selfie', { status: 'submitted', documentId: 'd1' })])
    const { container } = render(<WorkerDocumentsPanel verificationStatus="pending" />)
    await screen.findByText('Under review')
    expect(container.querySelector('img, a, iframe, object, embed')).toBeNull()
  })

  it('refuses a file over 10 MB without reading it', async () => {
    const file = photo('big.jpg', jpegBytes)
    Object.defineProperty(file, 'size', { value: WORKER_DOCUMENT_MAX_BYTES + 1 })
    const read = vi.spyOn(file, 'arrayBuffer')
    render(<WorkerDocumentsPanel verificationStatus="pending" />)
    await userEvent.upload(await screen.findByLabelText('Choose a photo of your Selfie'), file)
    expect(await screen.findByRole('alert')).toHaveTextContent('over 10 MB')
    expect(read).not.toHaveBeenCalled()
    expect(api.uploadWorkerDocument).not.toHaveBeenCalled()
  })

  it('shows the refusal when the shared check turns down the bytes', async () => {
    api.uploadWorkerDocument.mockRejectedValue(new Error('Upload a JPEG or PNG photo.'))
    const user = userEvent.setup({ applyAccept: false })
    render(<WorkerDocumentsPanel verificationStatus="pending" />)
    await user.upload(await screen.findByLabelText('Choose a photo of your Selfie'), photo('page.jpg', new TextEncoder().encode('<html></html>')))
    expect(await screen.findByRole('alert')).toHaveTextContent('Upload a JPEG or PNG photo.')
  })

  it('shows the rejection reason and lets the washer send a new photo', async () => {
    api.myWorkerDocuments.mockResolvedValue([slot('selfie', 'Selfie', { status: 'rejected', documentId: 'd1', reviewReason: 'The photo is too dark to read' })])
    render(<WorkerDocumentsPanel verificationStatus="rejected" />)
    expect(await screen.findByText("WashLink's reason: The photo is too dark to read")).toBeInTheDocument()
    expect(screen.getByLabelText('Send a new photo of your Selfie')).toBeEnabled()
  })

  it('says an approved copy still counts while a replacement is refused', async () => {
    api.myWorkerDocuments.mockResolvedValue([slot('selfie', 'Selfie', { status: 'rejected', documentId: 'd2', reviewReason: 'The photo is too dark to read', hasApprovedCopy: true })])
    render(<WorkerDocumentsPanel verificationStatus="verified" />)
    expect(await screen.findByText(/earlier approved photo still counts/)).toBeInTheDocument()
  })

  it('hides upload from a suspended washer, who can still read the status and reason', async () => {
    api.myWorkerDocuments.mockResolvedValue([slot('selfie', 'Selfie', { status: 'rejected', documentId: 'd1', reviewReason: 'The photo is too dark to read' })])
    render(<WorkerDocumentsPanel verificationStatus="suspended" />)
    expect(await screen.findByText("WashLink's reason: The photo is too dark to read")).toBeInTheDocument()
    expect(screen.getByText(/can't upload photos right now/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/photo of your/)).toBeNull()
  })
})
