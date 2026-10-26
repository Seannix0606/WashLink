import type { ContractVersionDocument } from '../models/WorkerContract'

/** `washlink-contract-<first 8 characters of the contract id>-v<version number>.txt` */
export function contractDocumentFileName(contractDocument: Pick<ContractVersionDocument, 'contractId' | 'versionNumber'>): string {
  return `washlink-contract-${contractDocument.contractId.slice(0, 8)}-v${String(contractDocument.versionNumber)}.txt`
}

/**
 * The download is the stored rendered_text verbatim (no header, footer or reformatting added
 * by the browser). It is an uncertified copy, not an official document (W9-L10).
 */
export function createContractDocumentBlob(contractDocument: Pick<ContractVersionDocument, 'renderedText'>): Blob {
  return new Blob([contractDocument.renderedText], { type: 'text/plain;charset=utf-8' })
}

interface DownloadEnvironment {
  readonly createObjectUrl: (blob: Blob) => string
  readonly revokeObjectUrl: (objectUrl: string) => void
  readonly clickLink: (objectUrl: string, fileName: string) => void
}

/** Saves the stored text as a .txt file through the given browser functions. */
export function downloadContractDocument(contractDocument: ContractVersionDocument, environment: DownloadEnvironment): void {
  const objectUrl = environment.createObjectUrl(createContractDocumentBlob(contractDocument))
  try {
    environment.clickLink(objectUrl, contractDocumentFileName(contractDocument))
  } finally {
    environment.revokeObjectUrl(objectUrl)
  }
}
