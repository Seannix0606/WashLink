import type { ReactElement } from 'react'
import { useState } from 'react'
import { ArrowLeft, CheckCircle2, Info, ThumbsDown, XCircle } from 'lucide-react'
import type { WorkerContractResponseService } from '../../../../application/services/WorkerContractResponseService'
import { contractStatementKeys, type ContractVersionDocument, type ContractVersionSummary, type MyWorkerContract } from '../../../../domain/models/WorkerContract'
import { canWorkerAccept, canWorkerDecline, workerContractActions } from '../../../../domain/utilities/workerContractActions'
import { Button } from '../../../design/ui'
import { useContractReviewSupport } from '../../../hooks/useMyWorkerContracts'
import type { UseWorkerContractActionsResult } from '../../../hooks/useWorkerContractActions'
import { useWorkerContractVersionHistory } from '../../../hooks/useWorkerContractVersionHistory'
import { partyRemovedText, shopGoneOfferText } from '../../../utilities/workerContractCopy'
import { describeContractDates, describeVersion, endedByLabel } from '../../../utilities/workerContractDisplay'
import { ContractStatusBadge } from '../../contracts/ContractStatusBadge'
import { ContractVersionHistory } from '../../contracts/ContractVersionHistory'
import { ContractVersionRecordView } from '../../contracts/ContractVersionRecordView'
import { TerminateContractModal } from '../../contracts/TerminateContractModal'
import { AcceptContractModal } from './AcceptContractModal'
import { DeclineContractModal } from './DeclineContractModal'

interface WorkerContractReviewProps {
  readonly workerContractResponseService: WorkerContractResponseService
  readonly contract: MyWorkerContract
  readonly actions: UseWorkerContractActionsResult
  readonly onBack: () => void
}

/**
 * One contract for the worker: the offer or change waiting for an answer (Accept, and Decline,
 * which is always offered), the version in force (End contract, always offered), and history.
 */
export function WorkerContractReview({ workerContractResponseService, contract, actions, onBack }: WorkerContractReviewProps): ReactElement {
  const support = useContractReviewSupport(workerContractResponseService)
  const history = useWorkerContractVersionHistory(workerContractResponseService, contract.contractId, contract.revision)
  const [acceptDocument, setAcceptDocument] = useState<ContractVersionDocument | null>(null)
  const [isDeclineOpen, setIsDeclineOpen] = useState<boolean>(false)
  const [isTerminateOpen, setIsTerminateOpen] = useState<boolean>(false)
  const [openedVersion, setOpenedVersion] = useState<ContractVersionSummary | null>(null)
  const allowed = workerContractActions(contract)
  const shopName = contract.shopName ?? 'The shop'
  const isAmendment = contract.pendingVersionKind === 'amendment'
  const actionKey = (action: string): string => `${action}:${contract.contractId}`
  const isBusy = actions.pendingActionKey !== null
  const pendingVersion = history.resource.versions.find((version) => version.versionId === contract.pendingVersionId)
  const pendingClassification = support.resource.classificationOptions.find(
    (option) => option.classificationKey === pendingVersion?.classificationKey,
  )
  const statementText = (ackKey: string): string | null =>
    support.resource.acknowledgementTexts.find((text) => text.ackKey === ackKey)?.statementText ?? null

  return (
    <div className="space-y-4">
      <Button size="sm" variant="ghost" leadingIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />} onClick={onBack}>
        Back to my contracts
      </Button>
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold break-words text-[var(--color-ink-900)]">{`Contract with ${shopName}`}</h3>
          <ContractStatusBadge status={contract.effectiveStatus} viewerRole="worker" />
        </div>
        <p className="text-xs break-words text-[var(--color-ink-500)]">
          {`${contract.ownerName ?? 'Shop owner'} · ${describeContractDates(contract.startDate, contract.endDate)}`}
        </p>
        {contract.endedBy !== null ? (
          <p className="text-sm text-[var(--color-ink-700)]">{`${endedByLabel[contract.endedBy]}${contract.endReason === null ? '' : `: ${contract.endReason}`}`}</p>
        ) : null}
        {contract.isOwnerRemoved || contract.isShopRemoved ? <p role="note" className="text-sm text-[var(--color-warning-600)]">{partyRemovedText}</p> : null}
      </header>

      {contract.pendingVersionId !== null && contract.pendingVersionNumber !== null ? (
        <section aria-label={isAmendment ? 'Proposed change' : 'Contract offer'} className="space-y-3 rounded-[var(--radius-control)] border border-[var(--color-warning-500)] p-3">
          <h4 className="text-sm font-semibold text-[var(--color-ink-900)]">
            {`${describeVersion(contract.pendingVersionNumber, contract.pendingVersionKind ?? 'initial')}: waiting for your answer`}
          </h4>
          {!canWorkerAccept(contract) ? (
            <p role="note" className="flex items-start gap-2 text-sm text-[var(--color-ink-700)]">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {shopGoneOfferText}
            </p>
          ) : null}
          <div aria-label="Your answer" role="group" className="flex flex-wrap gap-2">
            {canWorkerDecline(contract) ? (
              <Button size="sm" variant="secondary" leadingIcon={<ThumbsDown className="h-4 w-4" aria-hidden="true" />} disabled={isBusy} onClick={(): void => { setIsDeclineOpen(true) }}>
                {isAmendment ? 'Decline change' : 'Decline offer'}
              </Button>
            ) : null}
          </div>
          <ContractVersionRecordView
            recordReader={workerContractResponseService}
            versionId={contract.pendingVersionId}
            viewerRole="worker"
            isAmendment={isAmendment}
            renderActions={(contractDocument): ReactElement | null =>
              canWorkerAccept(contract) ? (
                <Button leadingIcon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />} disabled={isBusy || support.isLoading} onClick={(): void => { setAcceptDocument(contractDocument) }}>
                  {isAmendment ? 'Accept this change' : 'Accept this offer'}
                </Button>
              ) : null
            }
          />
        </section>
      ) : null}

      {allowed.includes('terminate') ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="danger" leadingIcon={<XCircle className="h-4 w-4" aria-hidden="true" />} disabled={isBusy} onClick={(): void => { setIsTerminateOpen(true) }}>
            End contract
          </Button>
        </div>
      ) : null}

      {contract.currentVersionId !== null && contract.currentVersionNumber !== null ? (
        <section aria-label="Version in force" className="space-y-2">
          <h4 className="text-sm font-semibold text-[var(--color-ink-900)]">{`Version ${String(contract.currentVersionNumber)}: in force`}</h4>
          <ContractVersionRecordView recordReader={workerContractResponseService} versionId={contract.currentVersionId} viewerRole="worker" isAmendment={false} />
        </section>
      ) : null}

      {openedVersion !== null ? (
        <section aria-label="Opened version" className="space-y-2 border-t border-[var(--color-card-border)] pt-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-[var(--color-ink-900)]">{describeVersion(openedVersion.versionNumber, openedVersion.kind)}</h4>
            <Button size="sm" variant="ghost" onClick={(): void => { setOpenedVersion(null) }}>
              Close
            </Button>
          </div>
          <ContractVersionRecordView key={openedVersion.versionId} recordReader={workerContractResponseService} versionId={openedVersion.versionId} viewerRole="worker" isAmendment={openedVersion.kind === 'amendment'} />
        </section>
      ) : null}

      <ContractVersionHistory history={history} onOpenVersion={setOpenedVersion} />

      {acceptDocument !== null ? (
        <AcceptContractModal
          contractDocument={acceptDocument}
          shopName={shopName}
          acceptanceStatementText={statementText(contractStatementKeys.workerAccept)}
          contractorStatementText={statementText(contractStatementKeys.contractorWorker)}
          needsContractorAcknowledgement={pendingClassification?.needsExtraAcknowledgement === true}
          isSubmitting={actions.pendingActionKey === actionKey('accept')}
          onConfirm={(confirmations): void => {
            void actions
              .runAction(
                actionKey('accept'),
                async () => workerContractResponseService.accept(contract, acceptDocument, pendingClassification, confirmations),
                isAmendment ? 'Change accepted. It is now the version in force.' : 'Offer accepted. Your acceptance is recorded.',
                'Could not record your acceptance.',
              )
              .then((): void => {
                setAcceptDocument(null)
              })
          }}
          onCancel={(): void => { setAcceptDocument(null) }}
        />
      ) : null}
      {isDeclineOpen ? (
        <DeclineContractModal
          isAmendment={isAmendment}
          shopName={shopName}
          isSubmitting={actions.pendingActionKey === actionKey('decline')}
          onConfirm={async (note): Promise<boolean> => {
            const declined = await actions.runAction(
              actionKey('decline'),
              async () => workerContractResponseService.decline(contract, note),
              isAmendment ? 'Change declined. Your current terms stay.' : 'Offer declined.',
              'Could not record your decline.',
            )
            if (declined !== null) {
              setIsDeclineOpen(false)
            }
            return declined !== null
          }}
          onCancel={(): void => { setIsDeclineOpen(false) }}
        />
      ) : null}
      <TerminateContractModal
        isOpen={isTerminateOpen}
        viewerRole="worker"
        subjectText={`Contract with ${shopName}`}
        isSubmitting={actions.pendingActionKey === actionKey('terminate')}
        onConfirm={async (reason): Promise<boolean> => {
          const ended = await actions.runAction(
            actionKey('terminate'),
            async () => workerContractResponseService.terminate(contract, reason),
            'Contract ended.',
            'Could not end the contract.',
          )
          if (ended !== null) {
            setIsTerminateOpen(false)
          }
          return ended !== null
        }}
        onCancel={(): void => { setIsTerminateOpen(false) }}
      />
    </div>
  )
}
