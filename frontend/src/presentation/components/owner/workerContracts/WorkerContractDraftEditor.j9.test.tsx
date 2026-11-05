import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  buildOwnerContract,
  buildPreview,
  createWorkerContractTestHarness,
  testAcknowledgementTexts,
  testClassificationOptions,
  testContractIdentifier,
  testDraftVersionIdentifier,
  testFlagNotices,
  testShopIdentifier,
  testWorkerIdentifier,
} from '../../../../test/workerContractFixtures'
import { testVersionIdentifier } from '../../../../test/contractTemplateFixtures'
import { OwnerWorkerContractsPanel } from './OwnerWorkerContractsPanel'
import { SendContractModal } from './SendContractModal'

async function openDraftEditor(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('button', { name: 'Open the contract with Test Worker' }))
  await user.click(await screen.findByRole('button', { name: 'Edit draft version 1' }))
}

describe('Worker contract draft editor and send (J9 contract half)', () => {
  it('j9_contract_draft_editor_edits_only_editable_bodies_and_shop_terms', async () => {
    const user = userEvent.setup()
    const harness = createWorkerContractTestHarness()
    harness.actionRepository.saveDraft.mockResolvedValue({
      versionId: testDraftVersionIdentifier, contractId: testContractIdentifier, versionNumber: 1, kind: 'initial', state: 'draft', draftRevision: 2, contentHash: null, flagCount: null,
    })
    render(<OwnerWorkerContractsPanel workerContractService={harness.workerContractService} />)
    await openDraftEditor(user)

    // The draft starts from the owner's template version; locked safeguards are read-only text.
    const payTerms = await screen.findByRole('textbox', { name: 'Pay terms' })
    expect(harness.templateRepository.listVersionClauses).toHaveBeenCalledWith(testVersionIdentifier)
    expect(screen.queryByRole('textbox', { name: 'Parties' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Free supervised training' })).toBeNull()
    expect(screen.getByRole('article', { name: 'Parties' })).toHaveTextContent('Platform safeguard — cannot be edited')
    expect(screen.getByRole('textbox', { name: /^Role title/ })).toHaveValue('Wash bay crew')
    // Pay details are never prefilled by WashLink.
    expect(screen.getByRole('textbox', { name: 'Pay details' })).toHaveValue('')

    await user.clear(payTerms)
    await user.type(payTerms, 'Paid every Friday by bank transfer.')
    await user.click(screen.getByRole('button', { name: 'Add a shop-specific term to section 15' }))
    await user.type(screen.getByRole('textbox', { name: /^Term heading/ }), 'Uniform care')
    await user.type(screen.getByRole('textbox', { name: 'Term text' }), 'The shop washes the uniforms it provides.')
    expect(screen.getByRole('button', { name: 'Review and send' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Save draft' }))

    expect(harness.actionRepository.saveDraft).toHaveBeenCalledTimes(1)
    const saveInput = harness.actionRepository.saveDraft.mock.calls[0]?.[0]
    expect(saveInput).toEqual({
      contractId: testContractIdentifier,
      expectedDraftRevision: 1,
      classificationKey: 'employee',
      startDate: '2026-11-02',
      endDate: null,
      ownerValues: { role_title: 'Wash bay crew' },
      editableBodies: { pay_terms: 'Paid every Friday by bank transfer.' },
      shopTerms: [{ sectionNumber: 15, heading: 'Uniform care', body: 'The shop washes the uniforms it provides.' }],
    })
    // No locked safeguard key is ever sent.
    expect(Object.keys(saveInput.editableBodies)).not.toContain('parties_named')
    expect(JSON.stringify(saveInput)).not.toMatch(/locked|hash|signature|acceptance/)
  }, 15000)

  it('j9_classification_choice_has_no_preselection_and_contractor_last_with_extra_acknowledgement', async () => {
    const user = userEvent.setup()
    const harness = createWorkerContractTestHarness([])
    render(<OwnerWorkerContractsPanel workerContractService={harness.workerContractService} />)
    await user.click(await screen.findByRole('button', { name: 'New contract draft' }))
    const dialog = await screen.findByRole('dialog', { name: 'New contract draft' })
    const radios = await within(dialog).findAllByRole('radio')

    // Server sort order, nothing preselected, independent contractor last.
    expect(radios).toHaveLength(testClassificationOptions.length)
    for (const radio of radios) {
      expect(radio).not.toBeChecked()
    }
    expect(radios.map((radio) => (radio as HTMLInputElement).value)).toEqual([
      'employee', 'probationary_employee', 'fixed_term_employee', 'independent_contractor',
    ])
    expect(within(dialog).queryByRole('checkbox')).toBeNull()

    // Without a choice the draft is refused with the server's message.
    await user.selectOptions(within(dialog).getByRole('combobox', { name: /Worker/ }), `${testWorkerIdentifier}|${testShopIdentifier}`)
    await user.selectOptions(within(dialog).getByRole('combobox', { name: /Start from/ }), testVersionIdentifier)
    fireEvent.change(within(dialog).getByLabelText(/Start date/), { target: { value: '2026-11-02' } })
    await user.click(within(dialog).getByRole('button', { name: 'Create draft' }))
    expect(within(dialog).getByText('Choose the relationship type for this contract.')).toBeInTheDocument()

    // The contractor option needs the extra acknowledgement before anything is sent.
    await user.click(within(dialog).getByRole('radio', { name: /Independent contractor/ }))
    const contractorCheckbox = within(dialog).getByRole('checkbox', { name: /relationship type chosen is independent contractor/ })
    expect(contractorCheckbox).not.toBeChecked()
    await user.click(within(dialog).getByRole('button', { name: 'Create draft' }))
    expect(within(dialog).getByText('Confirm the independent contractor acknowledgement.')).toBeInTheDocument()
    expect(harness.actionRepository.createDraft).not.toHaveBeenCalled()

    await user.click(contractorCheckbox)
    await user.click(within(dialog).getByRole('button', { name: 'Create draft' }))
    expect(harness.actionRepository.createDraft).toHaveBeenCalledWith({
      shopId: testShopIdentifier,
      workerId: testWorkerIdentifier,
      templateVersionId: testVersionIdentifier,
      classificationKey: 'independent_contractor',
      startDate: '2026-11-02',
      endDate: null,
      ownerValues: {},
    })
  })

  it('j9_send_modal_requires_flag_acknowledgement', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const preview = buildPreview({ flagCount: 1 })
    render(
      <SendContractModal
        preview={preview}
        classification={testClassificationOptions[0]}
        offerStatementText={testAcknowledgementTexts[0]?.statementText ?? null}
        contractorStatementText={null}
        flagNotices={testFlagNotices}
        isSubmitting={false}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )
    const sendButton = screen.getByRole('button', { name: 'Send to the worker' })
    expect(screen.getByText(testFlagNotices.disclaimer)).toBeInTheDocument()
    expect(screen.getByText('Deposit or bond (Section 7)')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /I offer these terms/ }))
    expect(sendButton).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'I reviewed the keyword check (1 keyword match).' }))
    expect(sendButton).toBeEnabled()
    await user.click(sendButton)
    expect(onConfirm).toHaveBeenCalledWith({ isFlagReviewConfirmed: true, isOfferStatementConfirmed: true, isContractorAcknowledged: false })

    // The service refuses without the flag review and sends the count the owner saw.
    const harness = createWorkerContractTestHarness()
    const contract = buildOwnerContract()
    await expect(
      harness.workerContractService.sendVersion(contract, preview, testClassificationOptions[0], {
        isFlagReviewConfirmed: false, isOfferStatementConfirmed: true, isContractorAcknowledged: false,
      }),
    ).rejects.toThrow('Confirm that you reviewed the keyword check.')
    expect(harness.actionRepository.sendVersion).not.toHaveBeenCalled()
    await harness.workerContractService.sendVersion(contract, preview, testClassificationOptions[2], {
      isFlagReviewConfirmed: true, isOfferStatementConfirmed: true, isContractorAcknowledged: true,
    })
    expect(harness.actionRepository.sendVersion).toHaveBeenCalledWith({
      contractId: testContractIdentifier,
      expectedDraftRevision: 1,
      contractorAcknowledgementKey: 'w9_contractor_owner_v1',
      acknowledgedFlagCount: 1,
    })
  })
})
