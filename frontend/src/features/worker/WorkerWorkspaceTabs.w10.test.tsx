import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TrainingDependencies } from '../../presentation/dependencyInjection/createTrainingDependencies'
import type { WorkerMarketplaceDependencies } from '../../presentation/dependencyInjection/createWorkerMarketplaceDependencies'
import { createOwnerRelationshipTestHarness } from '../../test/ownerRelationshipFixtures'
import { createWorkerContractTestHarness } from '../../test/workerContractFixtures'
import { WorkerWorkspaceTabs } from './WorkerWorkspaceTabs'

// The trainer and certification reads are not under test here; the marketplace is a stub.
vi.mock('../../presentation/hooks/useTrainerPrograms', () => ({
  useTrainerPrograms: (): unknown => ({
    designatedPrograms: [],
    isLoadingDesignatedPrograms: false,
    designatedProgramsErrorMessage: null,
    isDesignatedTrainer: false,
    reloadDesignatedPrograms: (): Promise<void> => Promise.resolve(),
  }),
}))
vi.mock('../../presentation/hooks/useMyCertifications', () => ({
  useWorkerCertificationState: (): unknown => ({ verifiedCertifications: [] }),
}))
vi.mock('../../presentation/components/worker/marketplace/WorkerMarketplacePanel', () => ({
  WorkerMarketplacePanel: (): unknown => <p>Marketplace panel stub</p>,
}))

describe('Worker workspace tabs (W10)', () => {
  it('w10_progress_find_work_link_switches_tab', async () => {
    const user = userEvent.setup()
    const contractHarness = createWorkerContractTestHarness([], [])
    const relationshipHarness = createOwnerRelationshipTestHarness()
    const marketplaceDependencies = {
      certificationDependencies: { certificationService: {} },
      workerContractDependencies: {
        workerContractService: contractHarness.workerContractService,
        workerContractResponseService: contractHarness.workerContractResponseService,
        ownerRelationshipService: relationshipHarness.ownerRelationshipService,
      },
    } as unknown as WorkerMarketplaceDependencies
    render(
      <WorkerWorkspaceTabs
        initialTab="contracts"
        marketplaceDependencies={marketplaceDependencies}
        trainingDependencies={{ trainingProgramService: {} } as unknown as TrainingDependencies}
        hasWorkerProfile
        onCreateProfileRequested={vi.fn()}
        bookingsContent={null}
      />,
    )
    const progressRegion = await screen.findByRole('region', { name: 'Progress toward working with different shop owners' })
    expect(screen.getByRole('tab', { name: 'Contracts' })).toHaveAttribute('aria-selected', 'true')
    await user.click(within(progressRegion).getByRole('button', { name: 'Find work' }))
    expect(await screen.findByText('Marketplace panel stub')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Find work' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('region', { name: 'Progress toward working with different shop owners' })).toBeNull()
  })
})
