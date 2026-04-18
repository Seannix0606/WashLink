import type { ReactElement } from 'react'
import { useState } from 'react'
import type { ShopService } from '../../../application/services/ShopService'
import type { WorkerService } from '../../../application/services/WorkerService'
import type { CreateShopInput, Shop } from '../../../domain/models/Shop'
import type { CreateWorkerInput, Worker } from '../../../domain/models/Worker'
import { AppShell, Card } from '../../design/ui'
import { runServiceActionWithToast } from '../../utilities/runServiceActionWithToast'
import { AuthenticatedTopBar } from '../AuthenticatedTopBar'
import {
  BookingStepProgress,
  type BookingStepDefinition,
} from '../booking/BookingStepProgress'
import {
  OwnerOnboardingGreetingBanner,
  type OwnerOnboardingStepKey,
} from './OwnerOnboardingGreetingBanner'
import { OwnerOnboardingDonePanel } from './OwnerOnboardingDonePanel'
import { ShopSetupStep } from './ShopSetupStep'
import { WorkerSetupStep } from './WorkerSetupStep'

interface OwnerOnboardingFlowProps {
  readonly ownerIdentifier: string
  readonly ownerDisplayName: string | null
  readonly shopService: ShopService
  readonly workerService: WorkerService
  readonly onOwnerOnboardingCompleted: () => void
}

const ownerOnboardingStepDefinitions: readonly BookingStepDefinition<OwnerOnboardingStepKey>[] =
  [
    { key: 'shopSetup', label: 'Shop' },
    { key: 'workerSetup', label: 'Workers' },
    { key: 'onboardingDone', label: 'Done' },
  ]

export function OwnerOnboardingFlow({
  ownerIdentifier,
  ownerDisplayName,
  shopService,
  workerService,
  onOwnerOnboardingCompleted,
}: OwnerOnboardingFlowProps): ReactElement {
  const [activeOnboardingStepKey, setActiveOnboardingStepKey] =
    useState<OwnerOnboardingStepKey>('shopSetup')
  const [createdShop, setCreatedShop] = useState<Shop | null>(null)
  const [createdWorkerList, setCreatedWorkerList] = useState<Worker[]>([])
  const [isSubmittingShopSetup, setIsSubmittingShopSetup] =
    useState<boolean>(false)
  const [isSubmittingWorkerSetup, setIsSubmittingWorkerSetup] =
    useState<boolean>(false)

  const handleShopSetupSubmitted = async (
    createShopInput: CreateShopInput,
  ): Promise<void> => {
    setIsSubmittingShopSetup(true)
    const persistedShop = await runServiceActionWithToast(
      () => shopService.createShopForOwner(ownerIdentifier, createShopInput),
      {
        successMessage: (shop) => `${shop.name} is ready to accept bookings.`,
        fallbackErrorMessage:
          'Could not create your shop. Please try again.',
      },
    )
    setIsSubmittingShopSetup(false)
    if (persistedShop !== null) {
      setCreatedShop(persistedShop)
      setActiveOnboardingStepKey('workerSetup')
    }
  }

  const handleWorkersSubmitted = async (
    workersToCreate: CreateWorkerInput[],
  ): Promise<void> => {
    setIsSubmittingWorkerSetup(true)
    const persistedWorkers = await runServiceActionWithToast(
      async () => {
        const successfullyCreatedWorkers: Worker[] = []
        for (const workerInput of workersToCreate) {
          const persistedWorker = await workerService.createWorkerForOwner(
            ownerIdentifier,
            workerInput,
          )
          successfullyCreatedWorkers.push(persistedWorker)
        }
        return successfullyCreatedWorkers
      },
      {
        successMessage: (createdWorkers) =>
          createdWorkers.length === 1
            ? 'Added your first worker.'
            : `Added ${createdWorkers.length} workers.`,
        shouldShowSuccessToast: workersToCreate.length > 0,
        fallbackErrorMessage:
          'Could not add one or more workers. Please try again.',
      },
    )
    setIsSubmittingWorkerSetup(false)
    if (persistedWorkers !== null) {
      setCreatedWorkerList(persistedWorkers)
      setActiveOnboardingStepKey('onboardingDone')
    }
  }

  const handleSkipWorkerSetup = (): void => {
    setCreatedWorkerList([])
    setActiveOnboardingStepKey('onboardingDone')
  }

  return (
    <AppShell topBar={<AuthenticatedTopBar />}>
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <OwnerOnboardingGreetingBanner
          ownerDisplayName={ownerDisplayName}
          activeOnboardingStepKey={activeOnboardingStepKey}
        />

        <Card elevation="raised" className="space-y-5 sm:p-6">
          <BookingStepProgress
            steps={ownerOnboardingStepDefinitions}
            activeStepKey={activeOnboardingStepKey}
          />

          {activeOnboardingStepKey === 'shopSetup' ? (
            <ShopSetupStep
              isSubmitting={isSubmittingShopSetup}
              onShopSetupSubmitted={(createShopInput) =>
                void handleShopSetupSubmitted(createShopInput)
              }
            />
          ) : null}

          {activeOnboardingStepKey === 'workerSetup' ? (
            <WorkerSetupStep
              isSubmitting={isSubmittingWorkerSetup}
              onWorkersSubmitted={(workersToCreate) =>
                void handleWorkersSubmitted(workersToCreate)
              }
              onSkipWorkersSetup={handleSkipWorkerSetup}
            />
          ) : null}

          {activeOnboardingStepKey === 'onboardingDone' ? (
            <OwnerOnboardingDonePanel
              createdShop={createdShop}
              createdWorkerCount={createdWorkerList.length}
              onEnterDashboard={onOwnerOnboardingCompleted}
            />
          ) : null}
        </Card>
      </div>
    </AppShell>
  )
}
