import type { ReactElement } from 'react'
import { useId, useState } from 'react'
import { Flag, ShieldAlert } from 'lucide-react'
import type { JobOpeningModerationService } from '../../../../application/services/JobOpeningModerationService'
import { firstModerationIssue, reportCategorySchema, reportStatementSchema } from '../../../../application/validation/moderationSchemas'
import { jobOpeningModerationLimits, jobOpeningReportCategories } from '../../../../domain/models/JobOpeningModeration'
import { Button, Modal, Select } from '../../../design/ui'
import { useReportJobOpening } from '../../../hooks/useReportJobOpening'
import {
  reportCategoryFieldLabel,
  reportCategoryLabel,
  reportIntroText,
  reportModalTitle,
  reportNotLegalAdviceText,
  reportStatementFieldLabel,
  reportSubmitLabel,
} from '../../../utilities/jobOpeningModerationCopy'
import { WorkerProfileTextArea } from '../../workerProfile/WorkerProfileTextArea'

export interface ReportOpeningTarget {
  readonly jobOpeningId: string
  readonly title: string
  readonly shopName: string
}

interface ReportOpeningModalProps {
  /** The opening to report; null closes the dialog. */
  readonly target: ReportOpeningTarget | null
  readonly isSubmitting: boolean
  /** A refusal from the database (already mapped to plain text). */
  readonly errorMessage: string | null
  /** Resolves true when the report was recorded. */
  readonly onSubmit: (category: string, statement: string) => Promise<boolean>
  readonly onClose: () => void
}

interface FieldErrors {
  readonly category?: string
  readonly statement?: string
}

const categoryOptions = [
  { value: '', label: 'Choose one' },
  ...jobOpeningReportCategories.map((category) => ({ value: category, label: reportCategoryLabel[category] })),
]

/** D-50 report dialog: a reason and a statement of 20 to 1000 characters. The shop never sees it (D-53). */
export function ReportOpeningModal({ target, isSubmitting, errorMessage, onSubmit, onClose }: ReportOpeningModalProps): ReactElement {
  const fieldId = useId()
  const [categoryInput, setCategoryInput] = useState<string>('')
  const [statementInput, setStatementInput] = useState<string>('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  const submitReport = async (): Promise<void> => {
    const nextErrors: FieldErrors = {
      category: firstModerationIssue(reportCategorySchema, categoryInput),
      statement: firstModerationIssue(reportStatementSchema, statementInput),
    }
    setFieldErrors(nextErrors)
    if (nextErrors.category !== undefined || nextErrors.statement !== undefined) {
      return
    }
    const isSent = await onSubmit(categoryInput, statementInput)
    if (isSent) {
      setCategoryInput('')
      setStatementInput('')
    }
  }

  return (
    <Modal isOpen={target !== null} onClose={onClose} title={reportModalTitle} maxWidthClassName="max-w-lg">
      {target !== null ? (
        <form
          aria-label={reportModalTitle}
          noValidate
          className="space-y-4"
          onSubmit={(submitEvent): void => {
            submitEvent.preventDefault()
            void submitReport()
          }}
        >
          <p className="text-sm font-semibold break-words text-[var(--color-ink-900)]">{`${target.title} · ${target.shopName}`}</p>
          <div role="note" className="flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs text-[var(--color-ink-700)]">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="space-y-1">
              <span className="block">{reportIntroText}</span>
              <span className="block">{reportNotLegalAdviceText}</span>
            </span>
          </div>
          <Select
            id={`${fieldId}-category`}
            name="report-category"
            label={reportCategoryFieldLabel}
            required
            options={categoryOptions}
            value={categoryInput}
            errorText={fieldErrors.category}
            onChange={(changeEvent): void => {
              setCategoryInput(changeEvent.target.value)
            }}
          />
          <WorkerProfileTextArea
            fieldName={`${fieldId}-statement`}
            label={reportStatementFieldLabel}
            value={statementInput}
            maximumLength={jobOpeningModerationLimits.statementMaxLength}
            errorText={fieldErrors.statement}
            rows={5}
            onValueChange={setStatementInput}
          />
          {errorMessage !== null ? (
            <p role="alert" className="text-sm text-[var(--color-danger-600)]">
              {errorMessage}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting} leadingIcon={<Flag className="h-4 w-4" aria-hidden="true" />}>
              {reportSubmitLabel}
            </Button>
          </div>
        </form>
      ) : null}
    </Modal>
  )
}

interface ReportOpeningDialogProps {
  readonly moderationService: JobOpeningModerationService
  readonly target: ReportOpeningTarget | null
  readonly onClose: () => void
}

/** The report dialog wired to the W14 service (keyed by opening so each report starts empty). */
export function ReportOpeningDialog({ moderationService, target, onClose }: ReportOpeningDialogProps): ReactElement {
  const { isSubmitting, errorMessage, clearError, sendReport } = useReportJobOpening(moderationService)
  const closeDialog = (): void => {
    clearError()
    onClose()
  }
  return (
    <ReportOpeningModal
      key={target?.jobOpeningId ?? 'none'}
      target={target}
      isSubmitting={isSubmitting}
      errorMessage={errorMessage}
      onSubmit={async (category, statement): Promise<boolean> => {
        if (target === null) {
          return false
        }
        const isSent = await sendReport(target.jobOpeningId, category, statement)
        if (isSent) {
          closeDialog()
        }
        return isSent
      }}
      onClose={closeDialog}
    />
  )
}
