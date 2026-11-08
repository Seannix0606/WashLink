import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContractTemplateService } from '../../../../application/services/ContractTemplateService'
import { SupabasePlatformContractTemplateRepository } from '../../../../infrastructure/repositories/SupabasePlatformContractTemplateRepository'
import { toUserFacingErrorMessage } from '../../../../infrastructure/supabase/supabaseErrorMessages'
import { createModerationTestHarness } from '../../../../test/moderationFixtures'
import { StandardContractPanel } from './StandardContractPanel'

const toastDouble = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
const rpcDouble = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: toastDouble, Toaster: (): null => null }))
vi.mock('../../../../infrastructure/supabase/supabaseClient', () => ({
  isSupabaseConfigured: true,
  getSupabaseClient: (): { rpc: typeof rpcDouble } => ({ rpc: rpcDouble }),
}))

const corePinPrefix = 'WashLink safeguard text in the standard template can change only through a human-run migration: '
const fallbackMessage = 'Could not publish the standard template.'
// The pin can name any locked clause, not only core keys: the 15 core keys plus the non-core locked clause.
const everyLockedKey =
  'training_pay_or_reimbursement, parties_named, classification_not_preselected, classification_reasons, required_training_free_and_supervised, no_training_fee_or_deduction, deductions_listed_only, certification_shop_issued, right_to_decline_or_leave, no_waiver_of_mandatory_rights, safety_terms_need_review, customer_data_minimum, changes_need_new_version_and_consent, acceptance_record_not_e_signature, safeguards_prevail, template_is_draft'

describe('Standard contract core text refusal (W16 D-87)', () => {
  beforeEach(() => {
    toastDouble.success.mockClear()
    toastDouble.error.mockClear()
    rpcDouble.mockReset()
  })

  it('w16_core_text_refusal_is_shown_by_prefix_with_its_keys', () => {
    for (const keys of ['customer_data_minimum', 'parties_named, customer_data_minimum', 'training_pay_or_reimbursement', 'added_safeguard_2', everyLockedKey]) {
      const databaseMessage = `${corePinPrefix}${keys}.`
      expect(toUserFacingErrorMessage({ code: '23514', message: databaseMessage }, fallbackMessage)).toBe(databaseMessage)
    }
    // The earlier wording is no longer a shipped message (C-S8).
    expect(toUserFacingErrorMessage({ code: '23514', message: 'WashLink safeguard text in the standard template can change only through a reviewed migration: customer_data_minimum.' }, fallbackMessage))
      .toBe('Some details are outside the allowed limits. Check them and try again.')
    // Only clause keys pass after the prefix; anything else gets the generic 23514 text, never the raw message.
    const genericConstraintText = 'Some details are outside the allowed limits. Check them and try again.'
    for (const unexpectedEnding of ['Call support at +63 900 000 0000.', `${'a'.repeat(601)}.`, 'customer_data_minimum']) {
      expect(toUserFacingErrorMessage({ code: '23514', message: `${corePinPrefix}${unexpectedEnding}` }, fallbackMessage)).toBe(genericConstraintText)
    }
  })

  it('w16_core_text_refusal_reaches_the_publish_flow', async () => {
    const databaseMessage = `${corePinPrefix}parties_safeguard.`
    rpcDouble.mockResolvedValue({ data: null, error: { code: '23514', message: databaseMessage } })
    const harness = createModerationTestHarness()
    // The real repository turns the RPC error into the message; everything else stays on the harness.
    harness.platformTemplateRepository.publish.mockImplementation(async (input) => new SupabasePlatformContractTemplateRepository().publish(input))
    const user = userEvent.setup()
    render(
      <StandardContractPanel
        platformTemplateService={harness.platformContractTemplateService}
        contractTemplateService={{ previewVersion: vi.fn().mockResolvedValue([]) } as unknown as ContractTemplateService}
      />,
    )
    await user.click(await screen.findByRole('button', { name: 'Edit a new version' }))
    const bodyField = screen.getByLabelText('Text: Introduction')
    await user.clear(bodyField)
    await user.type(bodyField, 'This template describes the car wash work.')
    await user.click(screen.getByRole('button', { name: 'Review and publish' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Publish a new standard version' })).getByRole('button', { name: 'Publish' }))

    await waitFor(() => {
      expect(rpcDouble).toHaveBeenCalledWith('publish_platform_contract_template_version', expect.objectContaining({ p_expected_version_number: 3 }))
      expect(toastDouble.error.mock.calls.flat().join(' ')).toContain(databaseMessage)
    })
    expect(toastDouble.success).not.toHaveBeenCalled()
    // Nothing typed is lost after the refusal.
    expect(screen.getByLabelText('Text: Introduction')).toHaveValue('This template describes the car wash work.')
  })
})
