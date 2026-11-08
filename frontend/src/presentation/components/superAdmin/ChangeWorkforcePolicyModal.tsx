import type { ReactElement } from 'react'
import { useState } from 'react'
import type { WorkforcePolicyFieldErrors } from '../../../application/services/WorkforcePolicyService'
import { workforcePolicyLimits, type WorkforcePolicy } from '../../../domain/models/WorkforcePolicy'
import { Button, Input, Modal } from '../../design/ui'
import { changePolicyAuditText, changePolicyModalTitle, workforcePolicyNotice } from '../../utilities/ownerRelationshipCopy'
import { WorkerProfileTextArea } from '../workerProfile/WorkerProfileTextArea'

interface ChangeWorkforcePolicyModalProps {
  readonly policy: WorkforcePolicy | null
  readonly isSubmitting: boolean
  readonly fieldErrors: WorkforcePolicyFieldErrors
  /** Resolves true when the change was recorded (the modal then closes). */
  readonly onSubmit: (policy: WorkforcePolicy, valueText: string, changeReason: string) => Promise<boolean>
  readonly onCancel: () => void
}

function ChangePolicyForm({ policy, isSubmitting, fieldErrors, onSubmit, onCancel }: Omit<ChangeWorkforcePolicyModalProps, 'policy'> & { readonly policy: WorkforcePolicy }): ReactElement {
  const [valueText, setValueText] = useState<string>(String(policy.integerValue))
  const [changeReason, setChangeReason] = useState<string>('')
  return (
    <form
      aria-label={changePolicyModalTitle}
      className="space-y-3 text-sm"
      noValidate
      onSubmit={(submitEvent): void => {
        submitEvent.preventDefault()
        void onSubmit(policy, valueText, changeReason)
      }}
    >
      <p className="text-[var(--color-ink-700)]">{workforcePolicyNotice}</p>
      <p className="text-xs text-[var(--color-ink-500)]">
        {`Current value: ${String(policy.integerValue)}. WashLink default: ${String(policy.defaultValue)}. Revision ${String(policy.revision)}.`}
      </p>
      <Input
        id="workforce-policy-value"
        name="workforce-policy-value"
        label={`New value (whole number, ${String(workforcePolicyLimits.minimumValue)} to ${String(workforcePolicyLimits.maximumValue)})`}
        inputMode="numeric"
        autoComplete="off"
        value={valueText}
        errorText={fieldErrors.value}
        aria-invalid={fieldErrors.value !== undefined}
        onChange={(changeEvent): void => {
          setValueText(changeEvent.target.value)
        }}
      />
      <WorkerProfileTextArea
        fieldName="workforce-policy-reason"
        label="Reason for the change (10 to 300 characters)"
        value={changeReason}
        maximumLength={workforcePolicyLimits.reasonMaxLength}
        errorText={fieldErrors.reason}
        rows={3}
        onValueChange={setChangeReason}
      />
      <p className="text-xs text-[var(--color-ink-500)]">{changePolicyAuditText}</p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isSubmitting}>
          Save change
        </Button>
      </div>
    </form>
  )
}

/** Changing `minimum_distinct_owners`: a new value 1..10 and a reason; the database checks everything again. */
export function ChangeWorkforcePolicyModal({ policy, onCancel, ...formProps }: ChangeWorkforcePolicyModalProps): ReactElement {
  return (
    <Modal isOpen={policy !== null} onClose={onCancel} title={changePolicyModalTitle}>
      {policy !== null ? <ChangePolicyForm key={policy.policyId} policy={policy} onCancel={onCancel} {...formProps} /> : null}
    </Modal>
  )
}
