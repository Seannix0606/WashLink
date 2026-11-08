import { useCallback } from 'react'
import type { ContractDisputeService, ReportContractProblemRequest } from '../../application/services/ContractDisputeService'
import type { MyContractDispute } from '../../domain/models/ContractDispute'
import { useLatestResource } from './useLatestResource'
import { useOversightActionRunner } from './useOversightActionRunner'

const noDisputes: readonly MyContractDispute[] = []

export interface UseContractDisputesResult {
  /** False when no service was given (older callers): nothing is offered. */
  readonly isAvailable: boolean
  readonly disputes: readonly MyContractDispute[]
  readonly isLoading: boolean
  readonly errorMessage: string | null
  readonly isEmpty: boolean
  readonly pendingActionKey: string | null
  readonly reportProblem: (request: ReportContractProblemRequest) => Promise<boolean>
  readonly respond: (dispute: MyContractDispute, statement: string) => Promise<boolean>
  readonly withdraw: (dispute: MyContractDispute) => Promise<boolean>
  readonly reload: () => Promise<void>
}

/**
 * A party's own reported contract problems (worker or owner; the database decides which). Polled
 * while visible. Without a service it is empty and every action resolves false.
 */
export function useContractDisputes(contractDisputeService: ContractDisputeService | undefined): UseContractDisputesResult {
  const loadDisputes = useCallback(
    async (): Promise<readonly MyContractDispute[]> =>
      contractDisputeService === undefined ? noDisputes : contractDisputeService.listMyDisputes(),
    [contractDisputeService],
  )
  const disputesResource = useLatestResource({
    load: loadDisputes,
    initialResource: noDisputes,
    loadFailedMessage: 'Could not load your reported problems.',
    isPolling: contractDisputeService !== undefined,
  })
  const { pendingActionKey, runAction } = useOversightActionRunner(disputesResource.refresh)

  const reportProblem = useCallback(
    async (request: ReportContractProblemRequest): Promise<boolean> =>
      contractDisputeService !== undefined &&
      (await runAction(
        `report:${request.contractId}`,
        async () => contractDisputeService.reportProblem(request),
        'The problem was reported to WashLink. The contract has not changed.',
        'Could not report the problem.',
      )) !== null,
    [contractDisputeService, runAction],
  )

  const respond = useCallback(
    async (dispute: MyContractDispute, statement: string): Promise<boolean> =>
      contractDisputeService !== undefined &&
      (await runAction(
        `respond:${dispute.disputeId}`,
        async () => contractDisputeService.respond(dispute, statement),
        'Your side was added.',
        'Could not add your side.',
      )) !== null,
    [contractDisputeService, runAction],
  )

  const withdraw = useCallback(
    async (dispute: MyContractDispute): Promise<boolean> =>
      contractDisputeService !== undefined &&
      (await runAction(
        `withdraw:${dispute.disputeId}`,
        async () => contractDisputeService.withdraw(dispute),
        'The report was withdrawn.',
        'Could not withdraw the reported problem.',
      )) !== null,
    [contractDisputeService, runAction],
  )

  return {
    isAvailable: contractDisputeService !== undefined,
    disputes: disputesResource.resource,
    isLoading: disputesResource.isLoading,
    errorMessage: disputesResource.errorMessage,
    isEmpty: !disputesResource.isLoading && disputesResource.errorMessage === null && disputesResource.resource.length === 0,
    pendingActionKey,
    reportProblem,
    respond,
    withdraw,
    reload: disputesResource.reload,
  }
}
