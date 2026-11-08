import type { ReactElement } from 'react'
import { AlertCircle, CircleCheck, CircleDashed, ClipboardList } from 'lucide-react'
import type { ShopVerificationService } from '../../../application/services/ShopVerificationService'
import type { Shop } from '../../../domain/models/Shop'
import type {
  OwnerOnboardingStepKey,
  OwnerOnboardingStepState,
} from '../../../domain/utilities/ownerOnboardingChecklist'
import { Card } from '../../design/ui'
import { useOwnerOnboardingChecklist } from '../../hooks/useOwnerOnboardingChecklist'

const stepLabels: Readonly<Record<OwnerOnboardingStepKey, string>> = {
  account: 'Owner account created',
  shop_registered: 'Shop registered',
  documents: 'Verification documents uploaded',
  submitted: 'Submitted for review',
  approved: 'Shop approved',
}

const stepStateLabels: Readonly<Record<OwnerOnboardingStepState, string>> = {
  done: 'Done',
  todo: 'To do',
  attention: 'Needs your attention',
}

function StepStateIcon({
  stepState,
}: {
  readonly stepState: OwnerOnboardingStepState
}): ReactElement {
  if (stepState === 'done') {
    return <CircleCheck className="h-4 w-4 text-[var(--color-success-600)]" aria-hidden="true" />
  }
  if (stepState === 'attention') {
    return <AlertCircle className="h-4 w-4 text-[var(--color-warning-600)]" aria-hidden="true" />
  }
  return <CircleDashed className="h-4 w-4 text-[var(--color-ink-400)]" aria-hidden="true" />
}

interface OwnerOnboardingChecklistProps {
  readonly ownerShopList: readonly Shop[]
  readonly shopVerificationService: ShopVerificationService
}

/** Hidden once every step is done; the verification banner covers the approved state. */
export function OwnerOnboardingChecklist({
  ownerShopList,
  shopVerificationService,
}: OwnerOnboardingChecklistProps): ReactElement | null {
  const {
    focusShop,
    onboardingSteps,
    isOnboardingComplete,
    isLoadingDocumentStatus,
    documentStatusErrorMessage,
  } = useOwnerOnboardingChecklist({ ownerShopList, shopVerificationService })

  if (isOnboardingComplete) {
    return null
  }

  return (
    <Card elevation="flat" className="space-y-3" aria-labelledby="owner-onboarding-heading">
      <header className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-50)] text-[var(--color-brand-700)]">
          <ClipboardList className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2
            id="owner-onboarding-heading"
            className="text-sm font-semibold text-[var(--color-ink-900)]"
          >
            Getting started{focusShop !== null ? ` with ${focusShop.name}` : ''}
          </h2>
          <p className="mt-0.5 text-xs text-[var(--color-ink-500)]">
            Workforce features in WashLink are available only to verified shops.
          </p>
        </div>
      </header>

      <ol className="space-y-1.5" aria-busy={isLoadingDocumentStatus}>
        {onboardingSteps.map((onboardingStep) => (
          <li
            key={onboardingStep.stepKey}
            className="flex items-center gap-2 text-sm text-[var(--color-ink-700)]"
          >
            <StepStateIcon stepState={onboardingStep.stepState} />
            <span className={onboardingStep.stepState === 'done' ? 'line-through' : undefined}>
              {stepLabels[onboardingStep.stepKey]}
            </span>
            <span className="sr-only">: {stepStateLabels[onboardingStep.stepState]}</span>
            {onboardingStep.stepKey === 'documents' && isLoadingDocumentStatus ? (
              <span className="text-xs text-[var(--color-ink-400)]">Checking…</span>
            ) : null}
          </li>
        ))}
      </ol>

      {documentStatusErrorMessage !== null ? (
        <p role="alert" className="text-xs text-[var(--color-danger-600)]">
          {documentStatusErrorMessage}
        </p>
      ) : null}
    </Card>
  )
}
