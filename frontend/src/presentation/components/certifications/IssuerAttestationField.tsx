import type { ReactElement } from 'react'
import { useId } from 'react'
import { issuerAttestationNote, issuerAttestationText } from '../../utilities/certificationCopy'

interface IssuerAttestationFieldProps {
  readonly hasConfirmed: boolean
  readonly onConfirmedChange: (hasConfirmed: boolean) => void
}

/** The w7_issuer_v1 owner confirmation. It starts unticked every time; it is not a signature. */
export function IssuerAttestationField({ hasConfirmed, onConfirmedChange }: IssuerAttestationFieldProps): ReactElement {
  const noteId = useId()
  return (
    <div className="space-y-1 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] px-3 py-2">
      <label className="flex items-start gap-2 text-sm text-[var(--color-ink-900)]">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-brand-700)]"
          aria-describedby={noteId}
          checked={hasConfirmed}
          onChange={(changeEvent): void => {
            onConfirmedChange(changeEvent.target.checked)
          }}
        />
        <span>{issuerAttestationText}</span>
      </label>
      <p id={noteId} className="text-xs text-[var(--color-ink-500)]">
        {issuerAttestationNote}
      </p>
    </div>
  )
}
