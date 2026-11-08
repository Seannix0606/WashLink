import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { buildRosterEntry, buildTrainingSession, createTrainingTestHarness } from '../../../test/trainingFixtures'
import { TrainingEnrollmentRecordsPanel } from './TrainingEnrollmentRecordsPanel'

function renderPanel(rosterEntry: ReturnType<typeof buildRosterEntry>): void {
  const harness = createTrainingTestHarness()
  render(
    <TrainingEnrollmentRecordsPanel
      trainingEvidenceService={harness.trainingDependencies.trainingEvidenceService}
      rosterEntry={rosterEntry}
      sessions={[buildTrainingSession()]}
      assessmentChecklist={['Pre-rinses the whole car']}
      onEvidenceChanged={vi.fn()}
    />,
  )
}

describe('Assessment availability (J6)', () => {
  it('j6_assessment_button_hidden_until_required_days_attended', async () => {
    renderPanel(buildRosterEntry({ progressStatus: 'in_progress', attendedTrainingDays: 2 }))
    expect(await screen.findByText('2 of 3 training days attended')).toBeInTheDocument()
    await screen.findByText('Record history')
    expect(screen.queryByRole('button', { name: 'Record assessment' })).toBeNull()
  })

  it('j6_assessment_button_shown_once_server_reports_days_attended', async () => {
    renderPanel(buildRosterEntry({ progressStatus: 'awaiting_assessment', attendedTrainingDays: 3 }))
    expect(await screen.findByRole('button', { name: 'Record assessment' })).toBeInTheDocument()
    expect(screen.getByText('Assessment: not recorded yet')).toBeInTheDocument()
  })
})
