import type { ReactElement } from 'react'
import { useId, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import type { CertificationService } from '../../../../application/services/CertificationService'
import { parseValidityMonthsInput, validityMonthsMessage } from '../../../../application/validation/certificationSchemas'
import { Button, Input, Skeleton } from '../../../design/ui'
import { useShopCertificationPolicy } from '../../../hooks/useShopCertificationPolicy'
import { validityPolicyText } from '../../../utilities/certificationCopy'
import { LoadErrorNotice } from '../../shared/LoadErrorNotice'

interface ShopCertificationValiditySectionProps {
  readonly certificationService: CertificationService
  readonly shopId: string
}

/** D-5 per-shop validity: 1 to 36 months, 12 when not set. Applies to future issues and renewals only. */
export function ShopCertificationValiditySection({ certificationService, shopId }: ShopCertificationValiditySectionProps): ReactElement {
  const fieldId = useId()
  const { policy, isLoadingPolicy, policyErrorMessage, isSavingPolicy, reloadPolicy, saveValidityMonths } =
    useShopCertificationPolicy(certificationService, shopId)
  const [validityInput, setValidityInput] = useState<string | null>(null)
  const [validityError, setValidityError] = useState<string | undefined>(undefined)
  const shownInput = validityInput ?? (policy === null ? '' : String(policy.validityMonths))

  const saveValidity = async (): Promise<void> => {
    const validityMonths = parseValidityMonthsInput(shownInput)
    if (validityMonths === null) {
      setValidityError(validityMonthsMessage)
      return
    }
    setValidityError(undefined)
    if (await saveValidityMonths(validityMonths)) {
      setValidityInput(null)
    }
  }

  return (
    <section aria-label="Certification validity" className="space-y-2 rounded-[var(--radius-control)] border border-[var(--color-ink-200)] p-3">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-ink-900)]">
        <CalendarClock className="h-4 w-4 text-[var(--color-brand-700)]" aria-hidden="true" />
        Certification validity
      </h3>
      <p className="text-xs text-[var(--color-ink-500)]">{validityPolicyText}</p>
      {isLoadingPolicy ? (
        <div aria-busy="true" aria-label="Loading certification validity">
          <Skeleton heightClassName="h-11" />
        </div>
      ) : policyErrorMessage !== null || policy === null ? (
        <LoadErrorNotice
          title="Certification validity could not be loaded"
          errorMessage={policyErrorMessage ?? 'Could not load the certification validity.'}
          onRetry={(): void => {
            void reloadPolicy()
          }}
        />
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="sm:w-48">
            <Input
              id={`${fieldId}-validity`}
              name="certification-validity-months"
              label="Validity in months (1 to 36)"
              inputMode="numeric"
              value={shownInput}
              errorText={validityError}
              helperText={policy.hasPolicyRow ? undefined : 'Not set: 12 months applies.'}
              onChange={(changeEvent): void => {
                setValidityInput(changeEvent.target.value)
              }}
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            isLoading={isSavingPolicy}
            onClick={(): void => {
              void saveValidity()
            }}
          >
            Save validity
          </Button>
        </div>
      )}
    </section>
  )
}
