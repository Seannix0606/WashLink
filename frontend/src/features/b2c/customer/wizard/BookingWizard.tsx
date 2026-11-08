import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import {
  bookingStepProblem,
  bookingStepTitles,
  createBookingSubmissionKey,
  emptyBookingDraft,
  type BookingDraft,
  type CatalogAddon,
  type CatalogService,
} from '@washlink/shared'
import { Button, Skeleton } from '../../../../presentation/design/ui'
import { errorMessage, getB2cApi } from '../../b2cApiClient'
import { StepWhen } from './StepWhen'
import { StepWhere } from './StepWhere'
import { StepService } from './StepService'
import { StepVehicle } from './StepVehicle'
import { StepReview } from './StepReview'

export type WizardDraft = BookingDraft

export interface StepProps {
  readonly draft: WizardDraft
  readonly update: (patch: Partial<WizardDraft>) => void
  readonly services: readonly CatalogService[]
  readonly addons: readonly CatalogAddon[]
  readonly customerId: string
}

interface BookingWizardProps {
  readonly customerId: string
  readonly onClose: () => void
}

export function BookingWizard({ customerId, onClose }: BookingWizardProps): ReactElement {
  const [step, setStep] = useState(0)
  const [services, setServices] = useState<readonly CatalogService[] | null>(null)
  const [addons, setAddons] = useState<readonly CatalogAddon[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [stepError, setStepError] = useState<string | null>(null)
  const [draft, setDraft] = useState<WizardDraft>(emptyBookingDraft)
  // One key per wizard: a repeated or interrupted submit returns the same booking, never a second one.
  const submissionKey = useMemo(() => createBookingSubmissionKey(crypto.randomUUID()), [])

  useEffect(() => {
    let isCurrent = true
    Promise.all([getB2cApi().listServices(), getB2cApi().listAddons()])
      .then(([nextServices, nextAddons]) => {
        if (isCurrent) {
          setServices(nextServices)
          setAddons(nextAddons)
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setLoadError(errorMessage(error))
        }
      })
    return (): void => { isCurrent = false }
  }, [])

  const stepProps: StepProps | null = services === null ? null : {
    draft,
    update: (patch): void => { setDraft((current) => ({ ...current, ...patch })) },
    services,
    addons,
    customerId,
  }

  const goNext = (): void => {
    const problem = bookingStepProblem(step, draft)
    setStepError(problem)
    if (problem === null) {
      setStep(step + 1)
    }
  }

  return (
    <div className="min-h-[100dvh] bg-[var(--color-surface-muted)]">
      <div className="mx-auto max-w-2xl px-4 py-4 sm:px-6">
        <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[var(--color-ink-700)]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Leave booking
        </button>
        <h1 className="mt-1 text-2xl font-bold text-[var(--color-ink-900)]">Book a car wash</h1>
        <ol className="mt-3 flex gap-1.5" aria-label={`Step ${String(step + 1)} of ${String(bookingStepTitles.length)}`}>
          {bookingStepTitles.map((title, index) => (
            <li key={title} aria-current={index === step ? 'step' : undefined} className="min-w-0 flex-1">
              <span className={index <= step ? 'block h-1.5 rounded-full bg-[var(--color-brand-600)]' : 'block h-1.5 rounded-full bg-[var(--color-ink-200)]'} />
              <span className={index === step ? 'mt-1 block truncate text-xs font-semibold text-[var(--color-ink-900)]' : 'mt-1 block truncate text-xs text-[var(--color-ink-500)]'}>{title}</span>
            </li>
          ))}
        </ol>
        <div className="mt-5">
          {loadError !== null ? <p role="alert" className="text-sm text-[var(--color-danger-600)]">{loadError}</p> : null}
          {stepProps === null && loadError === null ? <Skeleton heightClassName="h-64" /> : null}
          {stepProps !== null && step === 0 ? <StepWhen {...stepProps} /> : null}
          {stepProps !== null && step === 1 ? <StepWhere {...stepProps} /> : null}
          {stepProps !== null && step === 2 ? <StepService {...stepProps} /> : null}
          {stepProps !== null && step === 3 ? <StepVehicle {...stepProps} /> : null}
          {stepProps !== null && step === 4 ? (
            <StepReview {...stepProps} submissionKey={submissionKey} onEditStep={setStep} onDone={onClose} />
          ) : null}
        </div>
        {stepError !== null ? <p role="alert" className="mt-3 text-sm text-[var(--color-danger-600)]">{stepError}</p> : null}
        {step < 4 ? (
          <div className="mt-6 flex gap-3">
            {step > 0 ? (
              <Button variant="secondary" onClick={(): void => { setStepError(null); setStep(step - 1) }}>Back</Button>
            ) : null}
            <Button onClick={goNext}>Continue</Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
