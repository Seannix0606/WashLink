import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { workerWorkspaceTabDefinitions } from '../../../../features/worker/workerWorkspaceView'
import { SupabaseTrainingProgramRepository } from '../../../../infrastructure/repositories/SupabaseTrainingProgramRepository'
import { testOwnerIdentifier } from '../../../../test/fixtures'
import {
  jobOpeningSupabaseDouble as supabaseDouble,
  recordedArgumentsOf,
  resetJobOpeningSupabaseDouble,
} from '../../../../test/jobOpeningSupabaseDouble'
import { buildTrainingProgram, createTrainingTestHarness } from '../../../../test/trainingFixtures'
import { TrainerProgramsPanel } from './TrainerProgramsPanel'

vi.mock('../../../../infrastructure/supabase/supabaseClient', async () => {
  const { createJobOpeningSupabaseClientDouble } = await import('../../../../test/jobOpeningSupabaseDouble')
  return { isSupabaseConfigured: true, getSupabaseClient: createJobOpeningSupabaseClientDouble }
})

describe('Training I run (J8 designated trainers only)', () => {
  beforeEach(() => {
    resetJobOpeningSupabaseDouble()
  })

  it('j8_trainer_panel_lists_only_designated_programs', async () => {
    // The repository asks only for the caller's unrevoked designations.
    supabaseDouble.queryResult = { data: [], error: null }
    await new SupabaseTrainingProgramRepository().listDesignatedPrograms()
    expect(recordedArgumentsOf('from')).toEqual([['training_program_trainers']])
    expect(recordedArgumentsOf('is')).toEqual([['revoked_at', null]])
    expect(recordedArgumentsOf('eq').map(([columnName]) => columnName)).toEqual(['trainer_id'])
    // Filtered by the signed-in user (the double's session user), never by an id from the UI.
    expect(recordedArgumentsOf('eq')[0]?.[1]).toBe(testOwnerIdentifier)

    // The tab exists only for a designated trainer.
    expect(workerWorkspaceTabDefinitions(false).map((tabItem) => tabItem.value)).not.toContain('training_i_run')
    expect(workerWorkspaceTabDefinitions(true).map((tabItem) => tabItem.value)).toContain('training_i_run')

    // The panel lists exactly the designated programs it is given.
    render(
      <TrainerProgramsPanel
        trainingDependencies={createTrainingTestHarness().trainingDependencies}
        designatedPrograms={[{ designationId: 'designation-1', program: buildTrainingProgram({ title: 'Program I train' }) }]}
        isLoadingDesignatedPrograms={false}
        designatedProgramsErrorMessage={null}
        onRetry={vi.fn()}
      />,
    )
    const programList = screen.getByRole('list', { name: 'Programs I train for' })
    expect(programList.querySelectorAll('li')).toHaveLength(1)
    expect(screen.getByText('Program I train')).toBeInTheDocument()
  })
})
