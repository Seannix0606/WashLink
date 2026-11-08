import { useCallback, useState } from 'react'
import type { ContractDisputeService } from '../../application/services/ContractDisputeService'
import type { AdminContractDisputeCase, AdminContractDisputeVersionDocument } from '../../domain/models/ContractDispute'
import { toDisplayErrorMessage } from '../utilities/toDisplayErrorMessage'
import { useLatestResource } from './useLatestResource'
import { useOversightActionRunner } from './useOversightActionRunner'

export type DisputeVersionDocumentState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading'; readonly versionId: string }
  | { readonly kind: 'loaded'; readonly versionId: string; readonly document: AdminContractDisputeVersionDocument }
  | { readonly kind: 'unavailable'; readonly versionId: string }
  | { readonly kind: 'error'; readonly versionId: string; readonly errorMessage: string }

export interface UseAdminContractDisputeCaseResult {
  readonly disputeCase: AdminContractDisputeCase | null
  readonly isLoading: boolean
  readonly errorMessage: string | null
  readonly isClosing: boolean
  readonly close: (resolutionKind: string, resolutionNote: string) => Promise<boolean>
  readonly versionDocument: DisputeVersionDocumentState
  readonly openVersionDocument: (versionId: string) => Promise<void>
  readonly reload: () => Promise<void>
}

const idleDocument: DisputeVersionDocumentState = { kind: 'idle' }

/**
 * Super_admin: one reported contract problem. Every case and document read writes an audit row in
 * the database, so they are read only on request (never polled). The contract block is present
 * only while the problem is open; the database decides that.
 */
export function useAdminContractDisputeCase(
  contractDisputeService: ContractDisputeService,
  disputeId: string,
  onClosed: () => Promise<void>,
): UseAdminContractDisputeCaseResult {
  const loadCase = useCallback(
    async (): Promise<AdminContractDisputeCase | null> => contractDisputeService.loadAdminCase(disputeId),
    [contractDisputeService, disputeId],
  )
  const caseResource = useLatestResource<AdminContractDisputeCase | null>({
    load: loadCase,
    initialResource: null,
    loadFailedMessage: 'Could not load this reported problem.',
  })
  const [versionDocument, setVersionDocument] = useState<DisputeVersionDocumentState>(idleDocument)
  const { refresh } = caseResource
  const refreshAfterClose = useCallback(async (): Promise<void> => {
    setVersionDocument(idleDocument)
    await Promise.all([refresh(), onClosed()])
  }, [refresh, onClosed])
  const { pendingActionKey, runAction } = useOversightActionRunner(refreshAfterClose)
  const disputeCase = caseResource.resource

  const close = useCallback(
    async (resolutionKind: string, resolutionNote: string): Promise<boolean> => {
      if (disputeCase === null) {
        return false
      }
      const closedDispute = await runAction(
        `close:${disputeCase.dispute.disputeId}`,
        async () => contractDisputeService.close(disputeCase, resolutionKind, resolutionNote),
        'The report was closed. Both parties get the note; the contract has not changed.',
        'Could not close the reported problem.',
      )
      return closedDispute !== null
    },
    [contractDisputeService, disputeCase, runAction],
  )

  const openVersionDocument = useCallback(
    async (versionId: string): Promise<void> => {
      setVersionDocument({ kind: 'loading', versionId })
      try {
        const loadedDocument = await contractDisputeService.loadAdminVersionDocument(disputeId, versionId)
        setVersionDocument(
          loadedDocument === null ? { kind: 'unavailable', versionId } : { kind: 'loaded', versionId, document: loadedDocument },
        )
      } catch (documentError) {
        setVersionDocument({ kind: 'error', versionId, errorMessage: toDisplayErrorMessage(documentError, 'Could not load the contract text.') })
      }
    },
    [contractDisputeService, disputeId],
  )

  return {
    disputeCase,
    isLoading: caseResource.isLoading,
    errorMessage: caseResource.errorMessage,
    isClosing: pendingActionKey !== null,
    close,
    versionDocument,
    openVersionDocument,
    reload: caseResource.reload,
  }
}
