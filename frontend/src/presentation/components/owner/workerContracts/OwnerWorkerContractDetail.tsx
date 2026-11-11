import type { ReactElement } from 'react'
import { useState } from 'react'
import { ArrowLeft, FilePen, GitPullRequestArrow, PlayCircle, Undo2, XCircle } from 'lucide-react'
import type { WorkerContractService } from '../../../../application/services/WorkerContractService'
import type { ContractVersionSummary, OwnerWorkerContract } from '../../../../domain/models/WorkerContract'
import { ownerContractActions } from '../../../../domain/utilities/workerContractActions'
import { Button } from '../../../design/ui'
import type { UseWorkerContractActionsResult } from '../../../hooks/useWorkerContractActions'
import { useWorkerContractVersionHistory } from '../../../hooks/useWorkerContractVersionHistory'
import {
  activateExplanationText,
  amendIntroText,
  partyRemovedText,
  withdrawOfferText,
} from '../../../utilities/workerContractCopy'
import { contractOriginLabel, describeContractDates, describeVersion, endedByLabel } from '../../../utilities/workerContractDisplay'
import { ContractStatusBadge } from '../../contracts/ContractStatusBadge'
import { ContractVersionHistory } from '../../contracts/ContractVersionHistory'
import { ContractVersionRecordView } from '../../contracts/ContractVersionRecordView'
import { TerminateContractModal } from '../../contracts/TerminateContractModal'
import { TrainingConfirmModal } from '../../training/TrainingConfirmModals'

type ConfirmAction = 'withdraw' | 'activate' | 'amend' | null

interface OwnerWorkerContractDetailProps {
  readonly workerContractService: WorkerContractService
  readonly contract: OwnerWorkerContract
  readonly actions: UseWorkerContractActionsResult
  readonly onBack: () => void
  readonly onEditDraft: () => void
}

const confirmCopy: Readonly<Record<Exclude<ConfirmAction, null>, { title: string; message: string; label: string }>> = {
  withdraw: { title: 'Withdraw the sent version?', message: withdrawOfferText, label: 'Withdraw' },
  activate: { title: 'Record the contract start?', message: activateExplanationText, label: 'Record start' },
  amend: { title: 'Propose a change?', message: amendIntroText, label: 'Start a change' },
}

/** One contract for its owner: state, actions the owner may take, the versions in force and pending, and history. */
export function OwnerWorkerContractDetail({ workerContractService, contract, actions, onBack, onEditDraft }: OwnerWorkerContractDetailProps): ReactElement {
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [isTerminateOpen, setIsTerminateOpen] = useState<boolean>(false)
  const [openedVersion, setOpenedVersion] = useState<ContractVersionSummary | null>(null)
  const history = useWorkerContractVersionHistory(workerContractService, contract.contractId, contract.revision)
  const allowed = ownerContractActions(contract)
  const workerName = contract.workerName ?? 'Worker'
  const actionKey = (action: string): string => `${action}:${contract.contractId}`
  const isBusy = actions.pendingActionKey !== null
  const hasPartyLeft = contract.isOwnerRemoved || contract.isShopRemoved || contract.isWorkerRemoved

  const runConfirmedAction = async (action: Exclude<ConfirmAction, null>): Promise<void> => {
    if (action === 'withdraw') {
      await actions.runAction(actionKey(action), async () => workerContractService.withdrawPending(contract), 'Sent version withdrawn.', 'Could not withdraw the sent version.')
    } else if (action === 'activate') {
      await actions.runAction(actionKey(action), async () => workerContractService.activate(contract), 'Contract start recorded.', 'Could not record the contract start.')
    } else {
      const amendment = await actions.runAction(
        actionKey(action),
        async () => workerContractService.createAmendment(contract),
        'Change started as a new draft version. The current version stays in force.',
        'Could not start a change to the contract.',
      )
      if (amendment !== null) {
        onEditDraft()
      }
    }
    setConfirmAction(null)
  }

  return (
    <div className="space-y-4">
      <Button size="sm" variant="ghost" leadingIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />} onClick={onBack}>
        Back to contracts
      </Button>
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold break-words text-[var(--color-ink-900)]">{`Contract with ${workerName}`}</h3>
          <ContractStatusBadge status={contract.effectiveStatus} viewerRole="owner" />
        </div>
        <p className="text-xs break-words text-[var(--color-ink-500)]">
          {`${contract.shopName ?? 'Shop'} · ${contractOriginLabel[contract.origin]} · ${describeContractDates(contract.startDate, contract.endDate)}`}
        </p>
        {contract.endedBy !== null ? (
          <p className="text-sm text-[var(--color-ink-700)]">{`${endedByLabel[contract.endedBy]}${contract.endReason === null ? '' : `: ${contract.endReason}`}`}</p>
        ) : null}
        {contract.declineNote !== null ? <p className="text-sm text-[var(--color-ink-700)]">{`Worker's note: ${contract.declineNote}`}</p> : null}
        {hasPartyLeft ? <p role="note" className="text-sm text-[var(--color-warning-600)]">{partyRemovedText}</p> : null}
      </header>

      {allowed.length > 0 ? (
        <div aria-label="Contract actions" role="group" className="flex flex-wrap gap-2">
          {allowed.includes('save_draft') ? (
            <Button size="sm" leadingIcon={<FilePen className="h-4 w-4" aria-hidden="true" />} disabled={isBusy} onClick={onEditDraft}>
              {contract.draftVersionNumber === null ? 'Edit draft' : `Edit draft version ${String(contract.draftVersionNumber)}`}
            </Button>
          ) : null}
          {allowed.includes('withdraw') || allowed.includes('withdraw_amendment') ? (
            <Button size="sm" variant="secondary" leadingIcon={<Undo2 className="h-4 w-4" aria-hidden="true" />} disabled={isBusy} onClick={(): void => { setConfirmAction('withdraw') }}>
              {allowed.includes('withdraw') ? 'Withdraw offer' : 'Withdraw change'}
            </Button>
          ) : null}
          {allowed.includes('activate') ? (
            <Button size="sm" variant="secondary" leadingIcon={<PlayCircle className="h-4 w-4" aria-hidden="true" />} disabled={isBusy} onClick={(): void => { setConfirmAction('activate') }}>
              Record start
            </Button>
          ) : null}
          {allowed.includes('amend') ? (
            <Button size="sm" variant="secondary" leadingIcon={<GitPullRequestArrow className="h-4 w-4" aria-hidden="true" />} disabled={isBusy} onClick={(): void => { setConfirmAction('amend') }}>
              Propose a change
            </Button>
          ) : null}
          {allowed.includes('terminate') ? (
            <Button size="sm" variant="danger" leadingIcon={<XCircle className="h-4 w-4" aria-hidden="true" />} disabled={isBusy} onClick={(): void => { setIsTerminateOpen(true) }}>
              End contract
            </Button>
          ) : null}
        </div>
      ) : null}

      {contract.pendingVersionId !== null && contract.pendingVersionNumber !== null ? (
        <section aria-label="Sent version" className="space-y-2 rounded-[var(--radius-control)] border border-[var(--color-warning-500)] p-3">
          <h4 className="text-sm font-semibold text-[var(--color-ink-900)]">
            {`${describeVersion(contract.pendingVersionNumber, contract.pendingVersionKind ?? 'initial')}: waiting for the worker`}
          </h4>
          <ContractVersionRecordView
            recordReader={workerContractService}
            versionId={contract.pendingVersionId}
            viewerRole="owner"
            isAmendment={contract.pendingVersionKind === 'amendment'}
          />
        </section>
      ) : null}

      {contract.currentVersionId !== null && contract.currentVersionNumber !== null ? (
        <section aria-label="Version in force" className="space-y-2">
          <h4 className="text-sm font-semibold text-[var(--color-ink-900)]">{`Version ${String(contract.currentVersionNumber)}: in force`}</h4>
          <ContractVersionRecordView recordReader={workerContractService} versionId={contract.currentVersionId} viewerRole="owner" isAmendment={false} />
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
          <ContractVersionRecordView
            key={openedVersion.versionId}
            recordReader={workerContractService}
            versionId={openedVersion.versionId}
            viewerRole="owner"
            isAmendment={openedVersion.kind === 'amendment'}
          />
        </section>
      ) : null}

      <ContractVersionHistory history={history} onOpenVersion={setOpenedVersion} />

      <TrainingConfirmModal
        isOpen={confirmAction !== null}
        title={confirmAction === null ? '' : confirmCopy[confirmAction].title}
        subjectText={`Contract with ${workerName}`}
        message={<p>{confirmAction === null ? '' : confirmCopy[confirmAction].message}</p>}
        confirmButtonLabel={confirmAction === null ? '' : confirmCopy[confirmAction].label}
        isDestructive={confirmAction === 'withdraw'}
        isSubmitting={confirmAction !== null && actions.pendingActionKey === actionKey(confirmAction)}
        onConfirm={(): void => {
          if (confirmAction !== null) {
            void runConfirmedAction(confirmAction)
          }
        }}
        onCancel={(): void => { setConfirmAction(null) }}
      />
      <TerminateContractModal
        isOpen={isTerminateOpen}
        viewerRole="owner"
        subjectText={`Contract with ${workerName}`}
        isSubmitting={actions.pendingActionKey === actionKey('terminate')}
        onConfirm={async (reason): Promise<boolean> => {
          const endedContract = await actions.runAction(
            actionKey('terminate'),
            async () => workerContractService.terminate(contract, reason),
            'Contract ended.',
            'Could not end the contract.',
          )
          if (endedContract !== null) {
            setIsTerminateOpen(false)
          }
          return endedContract !== null
        }}
        onCancel={(): void => { setIsTerminateOpen(false) }}
      />
    </div>
  )
}
