import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContractTemplateService } from '../../../../application/services/ContractTemplateService'
import { buildStandardPublishInput, countStandardDraftChanges, createStandardDraft, updateStandardClause } from '../../../../domain/utilities/platformContractTemplateDraft'
import { buildStandardClauses, createModerationTestHarness, testStandardVersionIdentifier } from '../../../../test/moderationFixtures'
import { standardContractCopyConstants, stillDraftForLegalReviewText } from '../../../utilities/standardContractCopy'
import { StandardContractPanel } from './StandardContractPanel'

const toastDouble = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastDouble, Toaster: (): null => null }))

const contractTemplateServiceStub = { previewVersion: vi.fn().mockResolvedValue([]) } as unknown as ContractTemplateService

function renderPanel(): ReturnType<typeof createModerationTestHarness> {
  const harness = createModerationTestHarness()
  render(<StandardContractPanel platformTemplateService={harness.platformContractTemplateService} contractTemplateService={contractTemplateServiceStub} />)
  return harness
}

async function editIntroduction(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('button', { name: 'Edit a new version' }))
  const bodyField = screen.getByLabelText('Text: Introduction')
  await user.clear(bodyField)
  await user.type(bodyField, 'This template describes the car wash work.')
}

describe('Standard contract publishing (W14)', () => {
  beforeEach(() => {
    toastDouble.success.mockClear()
    toastDouble.error.mockClear()
  })

  it('w14_standard_contract_editor_builds_publish_payload', async () => {
    // Pure helper: locked clauses are copied verbatim; only edited editable text changes.
    const draft = createStandardDraft(3, buildStandardClauses())
    expect(countStandardDraftChanges(draft).changedClauseCount).toBe(0)
    const lockedAttempt = updateStandardClause(draft, 'parties_safeguard', { body: 'Changed.' })
    expect(countStandardDraftChanges(lockedAttempt).changedClauseCount).toBe(0)
    const edited = updateStandardClause(draft, 'parties_intro', { body: '  New introduction text.  ' })
    expect(buildStandardPublishInput(edited)).toEqual({
      expectedVersionNumber: 3,
      clauses: [
        { section_number: 1, clause_key: 'parties_safeguard', kind: 'locked_safeguard', heading: 'Who the parties are', body: 'WashLink is not a party to this contract.', requires_owner_input: false },
        { section_number: 1, clause_key: 'parties_intro', kind: 'editable', heading: 'Introduction', body: 'New introduction text.', requires_owner_input: false },
      ],
    })

    const user = userEvent.setup()
    const harness = renderPanel()
    harness.platformTemplateRepository.publish.mockResolvedValue({ versionId: 'v4', versionNumber: 4 })
    await editIntroduction(user)
    // The safeguard clause is read-only: no input for it.
    expect(screen.queryByLabelText('Text: Who the parties are')).toBeNull()
    expect(screen.getByText('WashLink is not a party to this contract.')).toBeInTheDocument()
    expect(screen.getByText('1 editable clause changed')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Review and publish' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Publish a new standard version' })).getByRole('button', { name: 'Publish' }))
    await waitFor(() => {
      expect(harness.platformTemplateRepository.publish).toHaveBeenCalledWith({
        expectedVersionNumber: 3,
        clauses: [
          { section_number: 1, clause_key: 'parties_safeguard', kind: 'locked_safeguard', heading: 'Who the parties are', body: 'WashLink is not a party to this contract.', requires_owner_input: false },
          { section_number: 1, clause_key: 'parties_intro', kind: 'editable', heading: 'Introduction', body: 'This template describes the car wash work.', requires_owner_input: false },
        ],
      })
    })
    expect(toastDouble.success).toHaveBeenCalledWith('A new version of the standard was published. It is still a draft for legal review.')
    expect(harness.platformTemplateRepository.listVersionClauses).toHaveBeenCalledWith(testStandardVersionIdentifier)
  })

  it('w14_standard_contract_publish_modal_says_still_draft_for_legal_review', async () => {
    const user = userEvent.setup()
    renderPanel()
    await editIntroduction(user)
    await user.click(screen.getByRole('button', { name: 'Review and publish' }))
    const dialog = screen.getByRole('dialog', { name: 'Publish a new standard version' })
    expect(within(dialog).getByRole('note', { name: 'Draft template — requires legal review' })).toHaveTextContent(stillDraftForLegalReviewText)
    expect(dialog).toHaveTextContent('Their own template versions and every contract already sent stay exactly as they are.')
    expect(dialog).toHaveTextContent('WashLink is not a party to any contract.')
    // No copy claims legal validity or makes WashLink the employer.
    for (const copyText of standardContractCopyConstants) {
      expect(copyText).not.toMatch(/\b(legally valid|binding|enforceable|compliant|approved by (a )?lawyer)\b|WashLink is the employer/i)
    }
  })

  it('w14_standard_contract_stale_version_message', async () => {
    const user = userEvent.setup()
    const harness = renderPanel()
    harness.platformTemplateRepository.publish.mockRejectedValue(new Error('This template changed. Reload it and try again.'))
    await editIntroduction(user)
    await user.click(screen.getByRole('button', { name: 'Review and publish' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Publish a new standard version' })).getByRole('button', { name: 'Publish' }))
    await waitFor(() => {
      expect(toastDouble.error).toHaveBeenCalledWith('This template changed. Reload it and try again. It was reloaded.')
    })
    expect(toastDouble.success).not.toHaveBeenCalled()
    // The standard was re-read after the refusal; the draft is kept so nothing typed is lost.
    expect(harness.platformTemplateRepository.fetchCurrentStandard).toHaveBeenCalledTimes(2)
    expect(screen.getByLabelText('Text: Introduction')).toHaveValue('This template describes the car wash work.')
  })
})
