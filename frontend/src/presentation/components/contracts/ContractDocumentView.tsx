import type { ReactElement } from 'react'
import { Download, FileText, Printer } from 'lucide-react'
import type { ContractVersionDocument } from '../../../domain/models/WorkerContract'
import { downloadContractDocument } from '../../../domain/utilities/contractDocumentDownload'
import { Badge, Button } from '../../design/ui'
import { shortContentHash } from '../../utilities/contractTemplateDisplay'
import { formatShortDateTime } from '../../utilities/datetimeFormatting'
import { acceptanceRecordLabel, downloadCopyNoteText, storedTextNoteText } from '../../utilities/workerContractCopy'
import { describeVersion, versionStateLabel } from '../../utilities/workerContractDisplay'

const printAreaClassName = 'washlink-contract-print-area'

/** Prints only the stored text: everything else on the page is hidden while printing. */
const printStylesheet = `@media print {
  body * { visibility: hidden !important; }
  .${printAreaClassName}, .${printAreaClassName} * { visibility: visible !important; }
  .${printAreaClassName} { position: absolute; inset: 0 auto auto 0; width: 100%; }
}`

function saveAsTextFile(contractDocument: ContractVersionDocument): void {
  downloadContractDocument(contractDocument, {
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (objectUrl): void => {
      URL.revokeObjectURL(objectUrl)
    },
    clickLink: (objectUrl, fileName): void => {
      const downloadLink = window.document.createElement('a')
      downloadLink.href = objectUrl
      downloadLink.download = fileName
      downloadLink.rel = 'noopener'
      downloadLink.click()
    },
  })
}

interface ContractDocumentViewProps {
  readonly contractDocument: ContractVersionDocument
}

/**
 * The sealed text exactly as stored (pre-wrap, no re-rendering), its short hash and the
 * "Acceptance record — not an e-signature" label. Download saves the stored text verbatim.
 */
export function ContractDocumentView({ contractDocument }: ContractDocumentViewProps): ReactElement {
  const title = describeVersion(contractDocument.versionNumber, contractDocument.kind)
  return (
    <article aria-label={`Contract text, ${title}`} className="space-y-3">
      <style>{printStylesheet}</style>
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink-900)]">
            <FileText className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
            {title}
          </h4>
          <Badge tone="neutral">{versionStateLabel[contractDocument.state]}</Badge>
          <Badge tone="warning">{contractDocument.recordLabel}</Badge>
        </div>
        <p className="text-xs text-[var(--color-ink-500)]">
          {`Fingerprint ${shortContentHash(contractDocument.contentHash)} · sealed ${formatShortDateTime(contractDocument.sealedAt)}`}
        </p>
        <p className="text-xs text-[var(--color-ink-500)]">{storedTextNoteText}</p>
      </header>
      <div className={`${printAreaClassName} rounded-[var(--radius-control)] border border-[var(--color-card-border)] bg-[var(--color-card)] p-3`}>
        <p className="mb-2 text-xs font-semibold text-[var(--color-warning-600)]">{acceptanceRecordLabel}</p>
        <pre
          aria-label="Stored contract text"
          tabIndex={0}
          className="max-h-[32rem] overflow-auto font-sans text-sm whitespace-pre-wrap break-words text-[var(--color-ink-900)]"
        >
          {contractDocument.renderedText}
        </pre>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<Download className="h-4 w-4" aria-hidden="true" />}
          onClick={(): void => {
            saveAsTextFile(contractDocument)
          }}
        >
          Download text
        </Button>
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={<Printer className="h-4 w-4" aria-hidden="true" />}
          onClick={(): void => {
            window.print()
          }}
        >
          Print
        </Button>
      </div>
      <p className="text-xs text-[var(--color-ink-500)]">{downloadCopyNoteText}</p>
    </article>
  )
}
