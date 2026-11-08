import type { ReactElement, ReactNode } from 'react'
import { useId, useState } from 'react'
import type { z } from 'zod'
import { Button, Modal } from '../../design/ui'
import { WorkerProfileTextArea } from '../workerProfile/WorkerProfileTextArea'

export interface CertificationTextConfirmModalProps {
  readonly isOpen: boolean
  readonly title: string
  readonly subjectText: string
  readonly message: ReactNode
  readonly textLabel: string
  readonly guidanceText: string
  readonly textSchema: z.ZodType<string>
  readonly maximumLength: number
  readonly confirmButtonLabel: string
  readonly isDestructive: boolean
  readonly isSubmitting: boolean
  /** Extra controls above the text (for example the review decision choice). */
  readonly children?: ReactNode
  /** An error from the extra controls; blocks confirming. */
  readonly extraErrorText?: string | null
  /** Resolves true when the action succeeded and the dialog may close. */
  readonly onConfirm: (validText: string) => Promise<boolean>
  readonly onCancel: () => void
}

type TextFormProps = Omit<CertificationTextConfirmModalProps, 'isOpen' | 'title'>

function TextForm({
  subjectText,
  message,
  textLabel,
  guidanceText,
  textSchema,
  maximumLength,
  confirmButtonLabel,
  isDestructive,
  isSubmitting,
  children,
  extraErrorText,
  onConfirm,
  onCancel,
}: TextFormProps): ReactElement {
  const fieldId = useId()
  const [textInput, setTextInput] = useState<string>('')
  const [textError, setTextError] = useState<string | undefined>(undefined)
  const [hasTriedConfirm, setHasTriedConfirm] = useState<boolean>(false)
  const hasExtraError = extraErrorText !== undefined && extraErrorText !== null

  const confirmWithText = async (): Promise<void> => {
    setHasTriedConfirm(true)
    const parseResult = textSchema.safeParse(textInput)
    if (!parseResult.success) {
      setTextError(parseResult.error.issues.at(0)?.message ?? 'Check the text and try again.')
      return
    }
    setTextError(undefined)
    if (hasExtraError) {
      return
    }
    const didSucceed = await onConfirm(parseResult.data)
    if (didSucceed) {
      onCancel()
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="font-medium break-words text-[var(--color-ink-900)]">{subjectText}</p>
      <div className="text-[var(--color-ink-700)]">{message}</div>
      {children}
      <WorkerProfileTextArea
        fieldName={`${fieldId}-text`}
        label={textLabel}
        value={textInput}
        maximumLength={maximumLength}
        errorText={textError}
        rows={4}
        onValueChange={setTextInput}
      />
      <p className="text-xs text-[var(--color-ink-500)]">{guidanceText}</p>
      {hasTriedConfirm && hasExtraError ? (
        <p role="alert" className="text-sm text-[var(--color-danger-600)]">
          {extraErrorText}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          variant={isDestructive ? 'danger' : 'primary'}
          isLoading={isSubmitting}
          onClick={(): void => {
            void confirmWithText()
          }}
        >
          {confirmButtonLabel}
        </Button>
      </div>
    </div>
  )
}

/** A confirmation that requires a validated text (reason or statement). Nothing is sent before it. */
export function CertificationTextConfirmModal({ isOpen, title, ...formProps }: CertificationTextConfirmModalProps): ReactElement {
  return (
    <Modal isOpen={isOpen} onClose={formProps.onCancel} title={title} maxWidthClassName="max-w-lg">
      {isOpen ? <TextForm {...formProps} /> : null}
    </Modal>
  )
}
