import type { ReactElement } from 'react'
import { Lock, Mail, Phone } from 'lucide-react'
import {
  workerPreferredContactMethods,
  workerProfileLimits,
  type WorkerPreferredContactMethod,
} from '../../../domain/models/WorkerProfile'
import { Input, Select } from '../../design/ui'
import {
  workerPreferredContactMethodOptions,
  workerPrivateContactVisibilityNotice,
} from '../../utilities/workerProfileDisplay'
import type { WorkerProfileStepProps } from './workerProfileStepProps'

function toContactMethod(selectedValue: string): WorkerPreferredContactMethod | '' {
  return workerPreferredContactMethods.find((method) => method === selectedValue) ?? ''
}

export function WorkerPrivateContactStep({
  draft,
  fieldErrors,
  onDraftChange,
}: WorkerProfileStepProps): ReactElement {
  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-[var(--radius-control)] bg-[var(--color-brand-50)] p-3 text-xs text-[var(--color-brand-800)]">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{workerPrivateContactVisibilityNotice} All fields are optional.</span>
      </p>
      <Input
        name="contactPhone"
        type="tel"
        label="Contact phone"
        autoComplete="tel"
        maxLength={20}
        value={draft.contactPhone}
        errorText={fieldErrors.contactPhone}
        leadingIcon={<Phone className="h-4 w-4" />}
        onChange={(changeEvent): void => {
          onDraftChange({ contactPhone: changeEvent.target.value })
        }}
      />
      <Input
        name="contactEmail"
        type="email"
        label="Contact email"
        autoComplete="email"
        maxLength={workerProfileLimits.contactEmailMaxLength}
        value={draft.contactEmail}
        errorText={fieldErrors.contactEmail}
        leadingIcon={<Mail className="h-4 w-4" />}
        onChange={(changeEvent): void => {
          onDraftChange({ contactEmail: changeEvent.target.value })
        }}
      />
      <Select
        name="preferredContactMethod"
        label="Preferred contact method"
        options={workerPreferredContactMethodOptions}
        value={draft.preferredContactMethod}
        errorText={fieldErrors.preferredContactMethod}
        onChange={(changeEvent): void => {
          onDraftChange({
            preferredContactMethod: toContactMethod(changeEvent.target.value),
          })
        }}
      />
    </div>
  )
}
