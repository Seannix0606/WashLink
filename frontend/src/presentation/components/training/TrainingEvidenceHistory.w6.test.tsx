import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildAssessmentEvidence, buildAttendanceEvidence, testAttendanceIdentifier } from '../../../test/trainingFixtures'
import { TrainingEvidenceHistory } from './TrainingEvidenceHistory'

describe('Training record history (W6)', () => {
  it('w6_evidence_history_shows_superseded_rows_with_reason', () => {
    render(
      <TrainingEvidenceHistory
        evidence={[
          buildAttendanceEvidence({ isCurrent: false, attendanceStatus: 'present', recordedByDisplayName: 'Test Owner' }),
          buildAttendanceEvidence({
            evidenceId: '56565656-5656-4565-8565-565656565656',
            supersedesId: testAttendanceIdentifier,
            attendanceStatus: 'absent',
            recorderRole: 'trainer',
            recordedByDisplayName: 'Test Trainer',
            recordedAt: '2026-10-21T04:00:00+00:00',
            correctionReason: 'The trainee left before noon.',
          }),
          buildAssessmentEvidence(),
        ]}
      />,
    )
    const history = screen.getByRole('region', { name: 'Training record history' })
    const items = within(history)
      .getAllByRole('listitem')
      .filter((item) => item.closest('[aria-label="Checklist results"]') === null)
    expect(items).toHaveLength(3)
    // The superseded original stays visible and is labelled as such.
    const originalItem = items.find((item) => within(item).queryByText('Superseded') !== null)
    if (originalItem === undefined) {
      throw new Error('The superseded record is missing.')
    }
    expect(within(originalItem).getByText(/Present$/)).toBeInTheDocument()
    expect(within(originalItem).getByText(/Recorded by Test Owner \(shop owner\)/)).toBeInTheDocument()
    // The correction carries its reason and its recorder.
    const correctionItem = items.find((item) => within(item).queryByText('Correction') !== null)
    if (correctionItem === undefined) {
      throw new Error('The correction record is missing.')
    }
    expect(within(correctionItem).getByText('Reason for correction: The trainee left before noon.')).toBeInTheDocument()
    expect(within(correctionItem).getByText(/Recorded by Test Trainer \(trainer\)/)).toBeInTheDocument()
    expect(within(history).getByText('Assessment: Not passed (1 of 2 checklist items met)')).toBeInTheDocument()
    expect(within(history).getByText(/Records are never edited or deleted/)).toBeInTheDocument()
  })

  it('w6_polish_evidence_history_lists_each_checklist_item_and_whether_it_was_met', () => {
    render(
      <TrainingEvidenceHistory
        evidence={[
          buildAssessmentEvidence({
            checklistSnapshot: ['Pre-rinses the whole car', 'Uses two buckets', 'Dries without swirl marks'],
            itemsMet: [true, false, true],
          }),
        ]}
      />,
    )
    const results = screen.getByRole('list', { name: 'Checklist results' })
    const rows = within(results).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      'Pre-rinses the whole car: Met',
      'Uses two buckets: Not met',
      'Dries without swirl marks: Met',
    ])
    expect(screen.getByText('Assessment: Not passed (2 of 3 checklist items met)')).toBeInTheDocument()
    expect(screen.getByText('Reason for not passing: Skipped the second bucket rinse.')).toBeInTheDocument()
  })

  it('w6_polish_evidence_history_never_invents_checklist_text', () => {
    render(
      <TrainingEvidenceHistory evidence={[buildAssessmentEvidence({ checklistSnapshot: ['Pre-rinses the whole car'], itemsMet: [true, false] })]} />,
    )
    const rows = within(screen.getByRole('list', { name: 'Checklist results' })).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual(['Pre-rinses the whole car: Met', 'Item 2: Not met'])
  })

  it('w6_polish_evidence_history_omits_results_when_none_are_returned', () => {
    render(<TrainingEvidenceHistory evidence={[buildAssessmentEvidence({ checklistSnapshot: [], itemsMet: [] })]} />)
    expect(screen.queryByRole('list', { name: 'Checklist results' })).toBeNull()
  })
})
