import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  buildOwnerTemplate,
  buildVersionSummary,
  createContractTemplateTestHarness,
  testNextVersionIdentifier,
  testStandardVersionIdentifier,
  testTemplateIdentifier,
} from '../../../../test/contractTemplateFixtures'
import { ContractTemplateEditor } from './ContractTemplateEditor'
import { OwnerContractTemplatesPanel } from './OwnerContractTemplatesPanel'

const lockedKeys = [
  'parties_named',
  'classification_not_preselected',
  'classification_reasons',
  'no_training_fee_or_deduction',
  'required_training_free_and_supervised',
  'training_pay_or_reimbursement',
  'certification_shop_issued',
  'template_is_draft',
  'safeguards_prevail',
]

async function renderEditor(): Promise<{
  harness: ReturnType<typeof createContractTemplateTestHarness>
  onTemplateChanged: ReturnType<typeof vi.fn>
}> {
  const harness = createContractTemplateTestHarness()
  const onTemplateChanged = vi.fn().mockResolvedValue(undefined)
  render(
    <ContractTemplateEditor
      contractTemplateService={harness.contractTemplateService}
      template={buildOwnerTemplate()}
      onBack={vi.fn()}
      onTemplateChanged={onTemplateChanged}
    />,
  )
  await screen.findByRole('form', { name: 'Edit Wash bay crew agreement' })
  return { harness, onTemplateChanged }
}

describe('Contract template editor (J9)', () => {
  it('j9_editor_shows_locked_clauses_read_only', async () => {
    await renderEditor()
    const lockedClause = screen.getByRole('article', { name: 'Parties' })
    expect(lockedClause).toHaveTextContent('Platform safeguard — cannot be edited')
    expect(lockedClause).toHaveTextContent('The parties are {{owner_full_name}} for {{shop_name}} and {{worker_full_name}}.')
    expect(within(lockedClause).queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Parties' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Relationship type' })).not.toBeInTheDocument()
    // Section 4 holds only locked clauses; section 8 shows the training pay / reimbursement safeguard read-only.
    const sectionFour = screen.getByRole('region', { name: /^4\. / })
    expect(within(sectionFour).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(sectionFour).getAllByText('Platform safeguard — cannot be edited')).toHaveLength(2)
    const trainingPay = screen.getByRole('article', { name: 'Training pay or reimbursement' })
    expect(trainingPay).toHaveTextContent('Platform safeguard — cannot be edited')
    expect(screen.queryByRole('textbox', { name: 'Training pay or reimbursement' })).not.toBeInTheDocument()
    // Every section shows the stored draft notice under its heading.
    expect(screen.getAllByText('Draft — requires review by a qualified Philippine labor-law professional')).toHaveLength(7)
  })

  it('j9_editor_edits_only_editable_bodies', async () => {
    const user = userEvent.setup()
    await renderEditor()
    // Five editable clauses get a text box; the nine locked ones do not.
    expect(screen.getAllByRole('textbox')).toHaveLength(5)
    const saveButton = screen.getByRole('button', { name: 'Save as version 2' })
    expect(saveButton).toBeDisabled()
    const payTerms = screen.getByRole('textbox', { name: 'Pay terms' })
    await user.clear(payTerms)
    await user.click(payTerms)
    await user.paste('Pay as written on each contract: {{pay_details}}')
    expect(payTerms).toHaveValue('Pay as written on each contract: {{pay_details}}')
    expect(saveButton).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(screen.getByRole('textbox', { name: 'Pay terms' })).toHaveValue('[Shop: pay as agreed {{pay_details}}.]')
  })

  it('j9_add_shop_term_only_in_allowed_sections', async () => {
    await renderEditor()
    for (const allowedSection of [2, 7, 8, 15]) {
      expect(screen.getByRole('button', { name: `Add a shop-specific term to section ${String(allowedSection)}` })).toBeInTheDocument()
    }
    for (const blockedSection of [1, 4, 14]) {
      expect(screen.queryByRole('button', { name: `Add a shop-specific term to section ${String(blockedSection)}` })).not.toBeInTheDocument()
      const section = screen.getByRole('region', { name: new RegExp(`^${String(blockedSection)}\\. `) })
      expect(section).toHaveTextContent('Shop-specific terms are not allowed in this section.')
    }
  })

  it('j9_save_payload_never_contains_locked_clauses', async () => {
    const user = userEvent.setup()
    const { harness } = await renderEditor()
    const payTerms = screen.getByRole('textbox', { name: 'Pay terms' })
    await user.clear(payTerms)
    await user.click(payTerms)
    await user.paste('Pay as written on each contract: {{pay_details}}')
    await user.click(screen.getByRole('button', { name: 'Add a shop-specific term to section 7' }))
    const shopTerm = screen.getByRole('group', { name: 'Shop-specific term 1' })
    await user.click(screen.getByRole('button', { name: 'Save as version 2' }))
    // An empty new term is refused before anything is sent.
    expect(within(shopTerm).getByText('Give each shop-specific term a heading of 3 to 160 characters.')).toBeInTheDocument()
    expect(harness.actionRepository.saveVersion).not.toHaveBeenCalled()
    await user.type(within(shopTerm).getByRole('textbox', { name: /^Term heading/ }), 'Uniform care')
    await user.type(within(shopTerm).getByRole('textbox', { name: 'Term text' }), 'The shop washes the uniforms it provides.')
    await user.click(screen.getByRole('button', { name: 'Save as version 2' }))

    expect(harness.actionRepository.saveVersion).toHaveBeenCalledTimes(1)
    const [saveInput] = harness.actionRepository.saveVersion.mock.calls[0] ?? []
    expect(saveInput).toEqual({
      templateId: testTemplateIdentifier,
      expectedVersionNumber: 1,
      basePlatformVersionId: testStandardVersionIdentifier,
      editableBodies: { pay_terms: 'Pay as written on each contract: {{pay_details}}' },
      shopTerms: [{ sectionNumber: 7, heading: 'Uniform care', body: 'The shop washes the uniforms it provides.' }],
    })
    const serializedPayload = JSON.stringify(saveInput)
    for (const lockedKey of lockedKeys) {
      expect(serializedPayload).not.toContain(lockedKey)
    }
    expect(serializedPayload).not.toContain('The worker is not charged')
    expect(serializedPayload).not.toMatch(/hash|classification|review_status|owner_id/)
  })

  it('j9_save_creates_version_and_refreshes_history', async () => {
    const user = userEvent.setup()
    const harness = createContractTemplateTestHarness()
    render(<OwnerContractTemplatesPanel contractTemplateService={harness.contractTemplateService} />)
    await user.click(await screen.findByRole('button', { name: 'Edit Wash bay crew agreement' }))
    const payTerms = await screen.findByRole('textbox', { name: 'Pay terms' })
    await user.type(payTerms, ' Paid every week as agreed.')
    harness.repository.listOwnerTemplates.mockResolvedValue([
      buildOwnerTemplate({ currentVersionNumber: 2, currentVersionId: testNextVersionIdentifier }),
    ])
    harness.repository.listVersionHistory.mockResolvedValue([
      buildVersionSummary({ versionId: testNextVersionIdentifier, versionNumber: 2, editedCount: 1, contentHash: 'fedcba98'.repeat(8) }),
      buildVersionSummary({ isCurrent: false }),
    ])
    await user.click(screen.getByRole('button', { name: 'Save as version 2' }))

    // The editor reloads the new sealed version; the list is re-read.
    expect(await screen.findByRole('button', { name: 'Save as version 3' })).toBeInTheDocument()
    expect(harness.repository.listVersionClauses).toHaveBeenLastCalledWith(testNextVersionIdentifier)
    expect(harness.repository.listOwnerTemplates.mock.calls.length).toBeGreaterThanOrEqual(2)

    await user.click(screen.getByRole('button', { name: 'Back to templates' }))
    await user.click(screen.getByRole('button', { name: 'Versions of Wash bay crew agreement' }))
    const versionList = await screen.findByRole('list', { name: 'Template versions' })
    const [newestVersion, firstVersion] = within(versionList).getAllByRole('listitem')
    expect(newestVersion).toHaveTextContent('Version 2')
    expect(newestVersion).toHaveTextContent('Current')
    expect(newestVersion).toHaveTextContent('fedcba98')
    expect(newestVersion).toHaveTextContent('1 clause edited, 0 shop-specific terms')
    expect(newestVersion).toHaveTextContent('Based on standard version 1')
    expect(firstVersion).toHaveTextContent('Version 1')
    expect(firstVersion).not.toHaveTextContent('Current')
  })
})
