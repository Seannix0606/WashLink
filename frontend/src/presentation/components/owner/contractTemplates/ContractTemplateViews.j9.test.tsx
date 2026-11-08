import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  buildDiffRow,
  buildPreviewClause,
  buildVersionClauses,
  createContractTemplateTestHarness,
  testVersionIdentifier,
} from '../../../../test/contractTemplateFixtures'
import { ContractTemplateDiffView } from './ContractTemplateDiffView'
import { ContractTemplatePreview } from './ContractTemplatePreview'

const draftNotice = 'Draft — requires review by a qualified Philippine labor-law professional'

describe('Contract template preview and comparison (J9)', () => {
  it('j9_preview_shows_draft_banner_and_section_notices', async () => {
    const harness = createContractTemplateTestHarness()
    const [partiesClause, , businessClause] = buildVersionClauses()
    harness.repository.previewVersion.mockResolvedValue([
      buildPreviewClause(
        partiesClause,
        "The parties are [Shop owner's full name - filled in on the contract] for [Shop name - filled in on the contract] and [Worker's full name - filled in on the contract].",
      ),
      buildPreviewClause(businessClause, '[Shop: the business [Shop name - filled in on the contract] at [Shop address - filled in on the contract].]'),
    ])
    render(
      <ContractTemplatePreview
        contractTemplateService={harness.contractTemplateService}
        versionId={testVersionIdentifier}
        title="Wash bay crew agreement, version 1"
        onBack={vi.fn()}
      />,
    )
    const banner = screen.getByRole('note', { name: 'Draft template — requires legal review' })
    expect(banner).toHaveTextContent(draftNotice)
    expect(banner).toHaveTextContent('WashLink does not state that this template is legally compliant.')
    expect(banner).toHaveTextContent('recorded acceptance (not an electronic signature)')
    const preview = await screen.findByRole('article', { name: 'Preview of Wash bay crew agreement, version 1' })
    expect(harness.repository.previewVersion).toHaveBeenCalledWith(testVersionIdentifier)
    const sectionOne = within(preview).getByRole('region', { name: 'Section 1' })
    const sectionTwo = within(preview).getByRole('region', { name: 'Section 2' })
    for (const section of [sectionOne, sectionTwo]) {
      expect(within(section).getByText(draftNotice)).toBeInTheDocument()
    }
    // Placeholders appear as the server's bracketed labels, never as invented values or raw keys.
    expect(sectionOne).toHaveTextContent("[Worker's full name - filled in on the contract]")
    expect(preview).not.toHaveTextContent('{{')
    expect(sectionOne).toHaveTextContent('Platform safeguard — cannot be edited')
    expect(sectionTwo).toHaveTextContent('Editable')
  })

  it('j9_diff_view_highlights_edited_and_added', async () => {
    const user = userEvent.setup()
    const harness = createContractTemplateTestHarness()
    harness.repository.diffVersion.mockResolvedValue([
      buildDiffRow({
        change: 'unchanged',
        sectionNumber: 1,
        sectionTitle: 'Parties and verified identities',
        clauseKey: 'parties_named',
        kind: 'locked_safeguard',
        versionHeading: 'Parties',
        versionBody: 'The parties are named.',
      }),
      buildDiffRow({ change: 'edited', versionBody: '[Shop: the business and where the crew works.]' }),
      buildDiffRow({
        change: 'added_by_shop',
        sectionNumber: 15,
        sectionTitle: 'Attachments or shop-specific terms',
        position: 3,
        clauseKey: null,
        kind: 'shop_specific',
        standardHeading: null,
        standardBody: null,
        versionHeading: 'Uniform care',
        versionBody: 'The shop washes the uniforms it provides.',
      }),
    ])
    render(
      <ContractTemplateDiffView
        contractTemplateService={harness.contractTemplateService}
        versionId={testVersionIdentifier}
        title="Wash bay crew agreement, version 2"
        onBack={vi.fn()}
      />,
    )
    expect(await screen.findByText('1 unchanged, 1 edited, 1 added by your shop.')).toBeInTheDocument()
    // Only changes by default.
    expect(screen.queryByRole('listitem', { name: 'Parties: Unchanged' })).not.toBeInTheDocument()
    const editedRow = screen.getByRole('listitem', { name: 'Business and location: Edited by your shop' })
    expect(within(editedRow).getByLabelText('Removed: happens.]')).toBeInTheDocument()
    expect(within(editedRow).getByLabelText('Added: works.]')).toBeInTheDocument()
    expect(editedRow.querySelector('del')).not.toBeNull()
    expect(editedRow.querySelector('ins')).not.toBeNull()
    const addedRow = screen.getByRole('listitem', { name: 'Uniform care: Added by your shop' })
    expect(addedRow).toHaveTextContent('Shop-specific term')
    expect(addedRow).toHaveTextContent('The shop washes the uniforms it provides.')

    await user.click(screen.getByRole('checkbox', { name: 'Show only changes' }))
    expect(screen.getByRole('listitem', { name: 'Parties: Unchanged' })).toBeInTheDocument()
  })
})
