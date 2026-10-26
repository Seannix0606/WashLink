import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { contractDocumentFileName, createContractDocumentBlob } from '../../../domain/utilities/contractDocumentDownload'
import {
  acceptanceLabel,
  buildAcceptance,
  buildDocument,
  testContentHash,
  testRenderedText,
} from '../../../test/workerContractFixtures'
import { ContractAcceptanceRecords } from './ContractAcceptanceRecords'
import { ContractDocumentView } from './ContractDocumentView'

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const blobReader = new FileReader()
    blobReader.onload = (): void => {
      resolve(typeof blobReader.result === 'string' ? blobReader.result : '')
    }
    blobReader.onerror = (): void => {
      reject(new Error('could not read the blob'))
    }
    blobReader.readAsText(blob)
  })
}

const urlStatics = URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown }
const originalCreateObjectUrl = urlStatics.createObjectURL
const originalRevokeObjectUrl = urlStatics.revokeObjectURL

afterEach(() => {
  urlStatics.createObjectURL = originalCreateObjectUrl
  urlStatics.revokeObjectURL = originalRevokeObjectUrl
  vi.restoreAllMocks()
})

describe('Contract document view (J10 sealed text)', () => {
  it('j10_document_view_shows_stored_text_hash_and_not_e_signature_label', () => {
    const contractDocument = buildDocument()
    render(<ContractDocumentView contractDocument={contractDocument} />)
    const article = screen.getByRole('article', { name: 'Contract text, Version 1 (Offer)' })
    // The stored text exactly as sealed: whitespace and line breaks are not re-rendered.
    expect(within(article).getByLabelText('Stored contract text').textContent).toBe(testRenderedText)
    expect(article).toHaveTextContent(`Fingerprint ${testContentHash.slice(0, 8)}`)
    expect(within(article).getAllByText(acceptanceLabel).length).toBeGreaterThanOrEqual(2)
    expect(article).toHaveTextContent('They are not certified or official documents.')
    expect(within(article).getByRole('button', { name: 'Print' })).toBeInTheDocument()

    // Every acceptance record carries the version fingerprint and the same label.
    render(
      <ContractAcceptanceRecords
        acceptances={[buildAcceptance(), buildAcceptance({ partyRole: 'worker', partyName: 'Test Worker', statementKey: 'w9_worker_accept_v1' })]}
      />,
    )
    const ownerRecord = screen.getByRole('listitem', { name: 'Shop owner acceptance of version 1' })
    const workerRecord = screen.getByRole('listitem', { name: 'Worker acceptance of version 1' })
    for (const acceptanceRecord of [ownerRecord, workerRecord]) {
      expect(acceptanceRecord).toHaveTextContent(acceptanceLabel)
      expect(acceptanceRecord).toHaveTextContent(`fingerprint ${testContentHash.slice(0, 8)}`)
    }
    expect(screen.getByText(/recorded acceptance \(not an electronic signature\)/)).toBeInTheDocument()
  })

  it('j10_download_text_uses_stored_rendered_text_verbatim', async () => {
    const user = userEvent.setup()
    const contractDocument = buildDocument({ versionNumber: 3 })
    const createdBlobs: Blob[] = []
    urlStatics.createObjectURL = vi.fn((blob: Blob): string => {
      createdBlobs.push(blob)
      return 'blob:washlink-test'
    })
    const revokeObjectUrl = vi.fn()
    urlStatics.revokeObjectURL = revokeObjectUrl
    const clickedLinks: HTMLAnchorElement[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement): void {
      clickedLinks.push(this)
    })

    render(<ContractDocumentView contractDocument={contractDocument} />)
    await user.click(screen.getByRole('button', { name: 'Download text' }))

    expect(createdBlobs).toHaveLength(1)
    const downloadedBlob = createdBlobs[0] ?? new Blob([])
    expect(downloadedBlob.type).toBe('text/plain;charset=utf-8')
    expect(await readBlobText(downloadedBlob)).toBe(testRenderedText)
    expect(clickedLinks[0]?.download).toBe('washlink-contract-c9c9c9c9-v3.txt')
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:washlink-test')
    expect(contractDocumentFileName(contractDocument)).toBe('washlink-contract-c9c9c9c9-v3.txt')
    expect(await readBlobText(createContractDocumentBlob(contractDocument))).toBe(contractDocument.renderedText)
  })
})
