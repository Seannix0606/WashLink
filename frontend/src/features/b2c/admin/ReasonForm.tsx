import type { ReactElement } from 'react'
import { useState } from 'react'
import { WORKER_DOCUMENT_REASON_MAX, workerReviewReasonProblem } from '@washlink/shared'
import { Button, Input } from '../../../presentation/design/ui'
import { errorMessage } from '../b2cApiClient'

interface ReasonFormProps {
  readonly id: string
  readonly label: string
  readonly confirmLabel: string
  readonly cancelLabel: string
  readonly warning?: string
  /** Gets the trimmed reason. A throw keeps the form open and shows the refusal. */
  readonly onConfirm: (reason: string) => Promise<void>
  readonly onCancel: () => void
}

/** The washer reads this text, and the database refuses anything outside 10 to 500 characters (D-117). */
export function ReasonForm({ id, label, confirmLabel, cancelLabel, warning, onConfirm, onCancel }: ReasonFormProps): ReactElement {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const confirm = async (): Promise<void> => {
    const problem = workerReviewReasonProblem(reason)
    if (problem !== null) {
      setError(problem)
      return
    }
    setIsBusy(true)
    setError(null)
    try {
      await onConfirm(reason.trim())
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="w-full space-y-2">
      {warning !== undefined ? <p className="text-xs text-[var(--color-ink-700)]">{warning}</p> : null}
      <Input id={id} label={label} helperText="10 to 500 characters. The washer will see this." value={reason} maxLength={WORKER_DOCUMENT_REASON_MAX}
        errorText={error ?? undefined} onChange={(event): void => { setReason(event.target.value) }} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="danger" isLoading={isBusy} onClick={(): void => void confirm()}>{confirmLabel}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
      </div>
    </div>
  )
}
