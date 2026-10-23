import type { ReactElement, ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RosterLinkService } from '../../application/services/RosterLinkService'
import { WorkerProfileService } from '../../application/services/WorkerProfileService'
import {
  buildRosterLinkEntry,
  createMockRosterLinkRepository,
  createMockWorkerProfileRepository,
  testWorkerUserIdentifier,
} from '../../test/fixtures'
import { decideWorkerWorkspaceView } from './workerWorkspaceView'
import { WorkerWorkspaceGate } from './WorkerWorkspaceGate'

const gateDependencies = vi.hoisted(() => ({
  workerProfileRepository: null as unknown,
  rosterLinkRepository: null as unknown,
}))

vi.mock('../../presentation/dependencyInjection/createWorkerProfileDependencies', () => ({
  createWorkerProfileDependencies: (): unknown => ({
    workerProfileService: new WorkerProfileService(
      gateDependencies.workerProfileRepository as never,
    ),
    rosterLinkService: new RosterLinkService(gateDependencies.rosterLinkRepository as never),
  }),
}))

vi.mock('./WorkerJobsPage', () => ({
  WorkerJobsPage: ({
    workerProfileSlot,
  }: {
    readonly workerProfileSlot: ReactNode
  }): ReactElement => (
    <div>
      <p>Assigned jobs page</p>
      {workerProfileSlot}
    </div>
  ),
}))

vi.mock('../../presentation/components/AuthenticatedTopBar', () => ({
  AuthenticatedTopBar: (): null => null,
}))

describe('WorkerWorkspaceGate (J1 worker onboarding)', () => {
  it('j1_worker_gate_does_not_block_linked_worker_without_profile', async () => {
    const workerProfileRepository = createMockWorkerProfileRepository()
    workerProfileRepository.fetchOwnWorkerProfile.mockResolvedValue({
      workerProfile: null,
      workerPrivateContact: null,
    })
    const rosterLinkRepository = createMockRosterLinkRepository()
    rosterLinkRepository.listMyRosterLinks.mockResolvedValue([buildRosterLinkEntry()])
    gateDependencies.workerProfileRepository = workerProfileRepository
    gateDependencies.rosterLinkRepository = rosterLinkRepository

    render(<WorkerWorkspaceGate workerUserIdentifier={testWorkerUserIdentifier} />)

    expect(await screen.findByText('Assigned jobs page')).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'Complete your worker profile' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Set up your worker profile')).not.toBeInTheDocument()

    // The routing rule: linked workers reach jobs even while the profile is missing or failing.
    const linkedWorkerBase = {
      isLoadingRosterLinks: false,
      rosterLinkCount: 1,
      isLoadingWorkerProfile: false,
      hasWorkerProfile: false,
      hasSkippedOnboarding: false,
    }
    expect(decideWorkerWorkspaceView({ ...linkedWorkerBase, hasWorkerProfileError: true })).toBe(
      'jobs',
    )
    expect(
      decideWorkerWorkspaceView({
        ...linkedWorkerBase,
        rosterLinkCount: 0,
        hasWorkerProfileError: false,
      }),
    ).toBe('onboarding')
  })
})
