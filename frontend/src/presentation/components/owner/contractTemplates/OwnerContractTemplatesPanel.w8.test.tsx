import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import {
  buildOwnerTemplate,
  createContractTemplateTestHarness,
  testNewerStandardVersionIdentifier,
  testTemplateIdentifier,
  testVersionIdentifier,
} from '../../../../test/contractTemplateFixtures'
import { OwnerContractTemplatesPanel } from './OwnerContractTemplatesPanel'

const staleMessage = 'This template changed. Reload it and try again.'

describe('Owner contract templates panel (W8)', () => {
  it('w8_template_list_loading_empty_error_states', async () => {
    const user = userEvent.setup()
    const emptyHarness = createContractTemplateTestHarness([])
    const { unmount } = render(<OwnerContractTemplatesPanel contractTemplateService={emptyHarness.contractTemplateService} />)
    expect(screen.getByLabelText('Loading your contract templates')).toBeInTheDocument()
    expect(await screen.findByText('No contract templates yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New from standard' })).toBeEnabled()
    unmount()

    const errorHarness = createContractTemplateTestHarness()
    errorHarness.repository.listOwnerTemplates
      .mockRejectedValueOnce(new Error('Could not load your contract templates.'))
      .mockResolvedValue([buildOwnerTemplate()])
    render(<OwnerContractTemplatesPanel contractTemplateService={errorHarness.contractTemplateService} />)
    expect(await screen.findByText('Your contract templates could not be loaded')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    const list = await screen.findByRole('list', { name: 'Contract templates' })
    expect(within(list).getByRole('listitem', { name: 'Wash bay crew agreement' })).toHaveTextContent('Version 1')

    // Creating from the standard sends only the name (null source = the latest standard).
    errorHarness.actionRepository.create.mockResolvedValue({
      templateId: testTemplateIdentifier, name: 'Detailing crew agreement', status: 'active', currentVersionNumber: 1,
    })
    await user.click(screen.getByRole('button', { name: 'New from standard' }))
    const dialog = screen.getByRole('dialog', { name: 'New template from the standard' })
    await user.click(within(dialog).getByRole('button', { name: 'Create template' }))
    expect(within(dialog).getByText('Template names must be 3 to 120 characters.')).toBeInTheDocument()
    await user.type(within(dialog).getByRole('textbox', { name: /Template name/ }), '  Detailing crew agreement ')
    await user.click(within(dialog).getByRole('button', { name: 'Create template' }))
    expect(errorHarness.actionRepository.create).toHaveBeenCalledWith('Detailing crew agreement', null)
  })

  it('w8_stale_template_error_reloads', async () => {
    const user = userEvent.setup()
    const harness = createContractTemplateTestHarness()
    harness.actionRepository.saveVersion.mockRejectedValue(new Error(staleMessage))
    render(<OwnerContractTemplatesPanel contractTemplateService={harness.contractTemplateService} />)
    await user.click(await screen.findByRole('button', { name: 'Edit Wash bay crew agreement' }))
    const payTerms = await screen.findByRole('textbox', { name: 'Pay terms' })
    await user.type(payTerms, ' Weekly.')
    const listReadsBeforeSave = harness.repository.listOwnerTemplates.mock.calls.length
    const clauseReadsBeforeSave = harness.repository.listVersionClauses.mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Save as version 2' }))

    // The stale answer is never shown as success: the template row and its version are re-read.
    expect(await screen.findByRole('textbox', { name: 'Pay terms' })).toHaveValue('[Shop: pay as agreed {{pay_details}}.]')
    expect(harness.repository.listOwnerTemplates.mock.calls.length).toBeGreaterThan(listReadsBeforeSave)
    expect(harness.repository.listVersionClauses.mock.calls.length).toBeGreaterThan(clauseReadsBeforeSave)
    expect(harness.repository.listVersionClauses).toHaveBeenLastCalledWith(testVersionIdentifier)
    expect(screen.getByRole('button', { name: 'Save as version 2' })).toBeDisabled()
  })

  it('w8_newer_standard_banner_and_rebase', async () => {
    const user = userEvent.setup()
    const harness = createContractTemplateTestHarness([
      buildOwnerTemplate({
        newerStandardAvailable: true,
        latestPlatformVersionId: testNewerStandardVersionIdentifier,
        latestPlatformVersionNumber: 2,
      }),
    ])
    render(<OwnerContractTemplatesPanel contractTemplateService={harness.contractTemplateService} />)
    const listItem = await screen.findByRole('listitem', { name: 'Wash bay crew agreement' })
    expect(listItem).toHaveTextContent('A newer standard template is available')
    await user.click(within(listItem).getByRole('button', { name: 'Edit Wash bay crew agreement' }))
    const updateButton = await screen.findByRole('button', { name: 'Update to standard version 2' })

    // Unsaved edits block the rebase until saved or discarded.
    await user.type(screen.getByRole('textbox', { name: 'Pay terms' }), ' Weekly.')
    expect(updateButton).toBeDisabled()
    expect(screen.getByText('Save or discard your changes before updating to the newer standard.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(updateButton).toBeEnabled()

    await user.click(updateButton)
    const dialog = screen.getByRole('dialog', { name: 'Update to the newer standard' })
    await user.click(within(dialog).getByRole('button', { name: 'Update and save' }))
    expect(harness.actionRepository.saveVersion).toHaveBeenCalledWith({
      templateId: testTemplateIdentifier,
      expectedVersionNumber: 1,
      basePlatformVersionId: testNewerStandardVersionIdentifier,
      editableBodies: {},
      shopTerms: [],
    })
    expect(await screen.findByRole('button', { name: 'Save as version 3' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Update to standard version/ })).not.toBeInTheDocument()
  })

  it('w8_archived_template_read_only', async () => {
    const user = userEvent.setup()
    const harness = createContractTemplateTestHarness([buildOwnerTemplate({ status: 'archived', newerStandardAvailable: true })])
    harness.actionRepository.setStatus.mockResolvedValue({
      templateId: testTemplateIdentifier, name: 'Wash bay crew agreement', status: 'active', currentVersionNumber: 1,
    })
    render(<OwnerContractTemplatesPanel contractTemplateService={harness.contractTemplateService} />)
    expect(await screen.findByText('No active templates')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /Archived/ }))
    const listItem = screen.getByRole('listitem', { name: 'Wash bay crew agreement' })
    expect(listItem).toHaveTextContent('Archived')
    expect(listItem).not.toHaveTextContent('A newer standard template is available')
    expect(within(listItem).queryByRole('button', { name: /^Edit|^Rename|^Archive/ })).not.toBeInTheDocument()

    await user.click(within(listItem).getByRole('button', { name: 'View Wash bay crew agreement' }))
    expect(await screen.findByText('This template is archived and read-only. Restore it to make changes.')).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Pay terms' })).toHaveTextContent('[Shop: pay as agreed {{pay_details}}.]')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Save as version|Add a shop-specific term|Update to standard/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back to templates' }))
    await user.click(screen.getByRole('button', { name: 'Restore Wash bay crew agreement' }))
    expect(harness.actionRepository.setStatus).toHaveBeenCalledWith(testTemplateIdentifier, 'archived', 'active')
  })
})
