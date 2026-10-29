import type { ReactElement } from 'react'
import { FileText } from 'lucide-react'
import type { ContractDisputeService } from '../../../application/services/ContractDisputeService'
import type { AdminContractDisputeCase } from '../../../domain/models/ContractDispute'
import { Badge, Button, Drawer, Skeleton } from '../../design/ui'
import { useAdminContractDisputeCase, type DisputeVersionDocumentState } from '../../hooks/useAdminContractDisputeCase'
import { formatCertificationDate } from '../../utilities/certificationDisplay'
import {
  adminDisputeCaseAuditedText,
  adminDisputeContractHiddenText,
  adminRelationshipNoteText,
  contractDisputeCategoryLabel,
  contractDisputeResolutionLabel,
  contractDisputeStatusLabel,
  viewVersionTextLabel,
} from '../../utilities/contractDisputeCopy'
import { shortContentHash } from '../../utilities/contractTemplateDisplay'
import { draftContractLabel } from '../../utilities/workerContractCopy'
import { describeContractDates, describeVersion, endedByLabel, partyRoleLabel } from '../../utilities/workerContractDisplay'
import { LoadErrorNotice } from '../shared/LoadErrorNotice'
import { CloseContractDisputeForm } from './CloseContractDisputeForm'

const sectionHeadingClassName = 'text-xs font-semibold tracking-wide text-[var(--color-ink-500)] uppercase'

function DisputeSummary({ disputeCase }: { readonly disputeCase: AdminContractDisputeCase }): ReactElement {
  const { dispute } = disputeCase
  return (
    <section className="space-y-1 text-xs text-[var(--color-ink-700)]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-[var(--color-ink-900)]">{contractDisputeCategoryLabel[dispute.category]}</span>
        <Badge tone={dispute.status === 'open' ? 'warning' : 'neutral'}>{contractDisputeStatusLabel[dispute.status]}</Badge>
      </div>
      <p>{`Reported by the ${partyRoleLabel[dispute.raisedByRole].toLowerCase()} on ${formatCertificationDate(dispute.createdAt)}`}</p>
      <p className="whitespace-pre-line break-words text-[var(--color-ink-900)]">{dispute.statement}</p>
      <p className="whitespace-pre-line break-words">
        {dispute.responseStatement === null ? 'The other party has not added its side.' : `Other party: ${dispute.responseStatement}`}
      </p>
      {dispute.resolutionKind !== null ? (
        <p className="whitespace-pre-line break-words">
          {`Closed: ${contractDisputeResolutionLabel[dispute.resolutionKind]}${dispute.resolutionNote === null ? '' : ` - ${dispute.resolutionNote}`}`}
        </p>
      ) : null}
    </section>
  )
}

function VersionDocument({ documentState, versionId }: { readonly documentState: DisputeVersionDocumentState; readonly versionId: string }): ReactElement | null {
  if (documentState.kind === 'idle' || documentState.versionId !== versionId) {
    return null
  }
  if (documentState.kind === 'loading') {
    return <Skeleton heightClassName="h-24" />
  }
  if (documentState.kind === 'unavailable') {
    return <p role="status">The text of this version is not available.</p>
  }
  if (documentState.kind === 'error') {
    return <p role="alert" className="text-[var(--color-danger-600)]">{documentState.errorMessage}</p>
  }
  return (
    <div className="space-y-1">
      <p className="font-medium text-[var(--color-warning-600)]">{draftContractLabel}</p>
      <p>{`${documentState.document.recordLabel} · hash ${shortContentHash(documentState.document.contentHash)}`}</p>
      <pre className="max-h-80 overflow-y-auto rounded-[var(--radius-control)] bg-[var(--color-surface-muted)] p-2 text-[11px] whitespace-pre-wrap break-words">
        {documentState.document.renderedText}
      </pre>
    </div>
  )
}

interface CaseBodyProps {
  readonly contractDisputeService: ContractDisputeService
  readonly disputeId: string
  readonly onClosed: () => Promise<void>
}

function CaseBody({ contractDisputeService, disputeId, onClosed }: CaseBodyProps): ReactElement {
  const caseState = useAdminContractDisputeCase(contractDisputeService, disputeId, onClosed)
  if (caseState.isLoading) {
    return (
      <div aria-busy="true" aria-label="Loading this reported problem" className="space-y-2">
        <Skeleton heightClassName="h-24" />
        <Skeleton heightClassName="h-24" />
      </div>
    )
  }
  if (caseState.errorMessage !== null || caseState.disputeCase === null) {
    return (
      <LoadErrorNotice
        title="This reported problem could not be loaded"
        errorMessage={caseState.errorMessage ?? 'Could not load this reported problem.'}
        onRetry={(): void => {
          void caseState.reload()
        }}
      />
    )
  }
  const { contract, versions, acceptances, relationship } = caseState.disputeCase
  return (
    <div className="space-y-5 text-xs text-[var(--color-ink-700)]">
      <p className="text-[11px] text-[var(--color-ink-500)]">{adminDisputeCaseAuditedText}</p>
      <DisputeSummary disputeCase={caseState.disputeCase} />
      {contract === null ? (
        <p role="status">{adminDisputeContractHiddenText}</p>
      ) : (
        <section aria-label="Contract record" className="space-y-3">
          <h3 className={sectionHeadingClassName}>Contract record</h3>
          <p className="font-medium text-[var(--color-warning-600)]">{draftContractLabel}</p>
          <p className="break-words">{`${contract.shopNameSnapshot ?? 'Shop'} · owner ${contract.ownerNameSnapshot ?? 'not recorded'} · worker ${contract.workerNameSnapshot ?? 'not recorded'}`}</p>
          <p>{`Status ${contract.effectiveStatus} · ${describeContractDates(contract.startDate, contract.endDate)}`}</p>
          {contract.endedBy !== null ? <p>{endedByLabel[contract.endedBy]}</p> : null}
          {contract.endReason !== null ? <p className="whitespace-pre-line break-words">{`End reason: ${contract.endReason}`}</p> : null}
          {contract.declineNote !== null ? <p className="whitespace-pre-line break-words">{`Decline note: ${contract.declineNote}`}</p> : null}
          {relationship !== null ? <p>{`Relationship: ${relationship.status} (${relationship.statusReason}). ${adminRelationshipNoteText}`}</p> : null}
          <h4 className={sectionHeadingClassName}>Sealed versions</h4>
          <ul aria-label="Sealed versions" className="space-y-2">
            {versions.map((version) => (
              <li key={version.versionId} className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>{`${describeVersion(version.versionNumber, version.kind)} · ${version.state}`}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    leadingIcon={<FileText className="h-4 w-4" aria-hidden="true" />}
                    onClick={(): void => {
                      void caseState.openVersionDocument(version.versionId)
                    }}
                  >
                    {viewVersionTextLabel}
                  </Button>
                </div>
                <VersionDocument documentState={caseState.versionDocument} versionId={version.versionId} />
              </li>
            ))}
          </ul>
          <h4 className={sectionHeadingClassName}>Acceptance records</h4>
          <ul aria-label="Acceptance records" className="space-y-1">
            {acceptances.map((acceptance) => (
              <li key={`${acceptance.partyRole}-${String(acceptance.versionNumber)}`}>
                {`${partyRoleLabel[acceptance.partyRole]} · version ${String(acceptance.versionNumber)} · ${formatCertificationDate(acceptance.acceptedAt)} · ${acceptance.recordLabel}`}
              </li>
            ))}
          </ul>
        </section>
      )}
      {caseState.disputeCase.dispute.status === 'open' ? <CloseContractDisputeForm isSubmitting={caseState.isClosing} onClose={caseState.close} /> : null}
    </div>
  )
}

interface ContractDisputeCaseDrawerProps {
  readonly contractDisputeService: ContractDisputeService
  /** The report to show; the case is read (and audited) only while the drawer is open. */
  readonly disputeId: string | null
  readonly onClose: () => void
  readonly onClosed: () => Promise<void>
}

/** Super_admin: one reported contract problem; the contract record only while it is open (P70). */
export function ContractDisputeCaseDrawer({ contractDisputeService, disputeId, onClose, onClosed }: ContractDisputeCaseDrawerProps): ReactElement {
  return (
    <Drawer isOpen={disputeId !== null} onClose={onClose} title="Reported contract problem" description="WashLink is not a party to this contract">
      {disputeId !== null ? <CaseBody key={disputeId} contractDisputeService={contractDisputeService} disputeId={disputeId} onClosed={onClosed} /> : null}
    </Drawer>
  )
}
