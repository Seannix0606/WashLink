import type { ReactElement } from 'react'
import { Store } from 'lucide-react'

export type OwnerOnboardingStepKey =
  | 'shopSetup'
  | 'workerSetup'
  | 'onboardingDone'

interface OwnerOnboardingGreetingBannerProps {
  readonly ownerDisplayName: string | null
  readonly activeOnboardingStepKey: OwnerOnboardingStepKey
}

export function OwnerOnboardingGreetingBanner({
  ownerDisplayName,
  activeOnboardingStepKey,
}: OwnerOnboardingGreetingBannerProps): ReactElement {
  const greetingHeadline =
    activeOnboardingStepKey === 'onboardingDone'
      ? 'You are all set'
      : `Welcome${ownerDisplayName ? `, ${ownerDisplayName}` : ''}`

  const greetingSubline =
    activeOnboardingStepKey === 'shopSetup'
      ? 'Let us set up your car wash so customers can book you.'
      : activeOnboardingStepKey === 'workerSetup'
        ? 'Add the team members who will be handling jobs.'
        : 'Your shop is live on WashLink. Let us take you to your dashboard.'

  return (
    <div className="rounded-[var(--radius-surface)] bg-[linear-gradient(135deg,var(--color-brand-700),var(--color-brand-900))] p-6 text-white shadow-[var(--shadow-card)]">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
          <Store className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{greetingHeadline}</h1>
          <p className="mt-1 max-w-xl text-sm text-white/80">
            {greetingSubline}
          </p>
        </div>
      </div>
    </div>
  )
}
