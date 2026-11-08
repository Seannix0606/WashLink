import type { ReactElement } from 'react'
import { SearchCheck, TriangleAlert } from 'lucide-react'
import type { ContractFlagNotices, ContractProblemTermFlag } from '../../../domain/models/WorkerContract'
import { flagDisclaimerFallback, noFlagMatchFallback } from '../../utilities/workerContractCopy'
import { describeFlagCount, ownerValueLabel } from '../../utilities/workerContractDisplay'

interface ContractProblemTermFlagsProps {
  readonly flags: readonly ContractProblemTermFlag[]
  readonly notices: ContractFlagNotices | null
}

function describeFlagPlace(flag: ContractProblemTermFlag): string {
  if (flag.valueKey !== null) {
    const valueLabel = ownerValueLabel[flag.valueKey as keyof typeof ownerValueLabel] as string | undefined
    return valueLabel ?? flag.valueKey
  }
  return flag.sectionNumber === null ? 'Contract text' : `Section ${String(flag.sectionNumber)}`
}

/**
 * Keyword flags on owner-written text. They inform and never block or validate: the disclaimer
 * is always shown, and zero matches says that this does not mean the terms are lawful.
 */
export function ContractProblemTermFlags({ flags, notices }: ContractProblemTermFlagsProps): ReactElement {
  const disclaimer = notices?.disclaimer ?? flagDisclaimerFallback
  const noMatchText = notices?.noMatchText ?? noFlagMatchFallback
  return (
    <section aria-label="Keyword check" className="space-y-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink-900)]">
        <SearchCheck className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
        {`Keyword check: ${describeFlagCount(flags.length)}`}
      </h4>
      <p role="note" className="text-xs text-[var(--color-ink-700)]">{disclaimer}</p>
      {flags.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-700)]">{noMatchText}</p>
      ) : (
        <ul aria-label="Keyword matches" className="space-y-2">
          {flags.map((flag, flagIndex) => (
            <li
              key={`${flag.ruleKey}-${String(flagIndex)}`}
              className="space-y-1 rounded-[var(--radius-control)] border border-[var(--color-warning-500)] bg-[var(--color-warning-50)] p-3"
            >
              <p className="flex items-center gap-2 text-sm font-medium text-[var(--color-ink-900)]">
                <TriangleAlert className="h-4 w-4 shrink-0 text-[var(--color-warning-600)]" aria-hidden="true" />
                {`${flag.label} (${describeFlagPlace(flag)})`}
              </p>
              <p className="text-sm break-words text-[var(--color-ink-700)]">{`"${flag.excerpt}"`}</p>
              <p className="text-xs text-[var(--color-ink-700)]">{flag.guidance}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
