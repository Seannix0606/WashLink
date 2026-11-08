/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// W16 K10 docs (PLAN section 7, AC14). The docs live outside the Vite root and are read from disk (test only).
const docsDirectory = join(resolve(process.cwd(), '..'), 'docs', 'workforce')

function readDoc(docName: string): string {
  return readFileSync(join(docsDirectory, docName), 'utf8').replace(/\r\n/g, '\n')
}

describe('Workforce docs (W16)', () => {
  it('w16_limitations_list_final_review_outcomes', () => {
    const limitations = readDoc('LIMITATIONS.md')
    // Line wraps must not decide whether a sentence is found.
    const limitationsOnOneLine = limitations.replace(/\s+/g, ' ')
    for (const outcome of ['SEC-5', 'F-C1', 'F-C2', 'F-C3', 'F-C5', 'F-C6', 'F-C7', 'F-S1', 'F-S2', 'F-S3', 'F-S5', 'F-S6', 'D-69', 'D-83', 'D-84', 'D-86', 'D-87']) {
      expect(limitations, `LIMITATIONS.md names ${outcome}`).toContain(outcome)
    }
    for (let itemNumber = 1; itemNumber <= 7; itemNumber += 1) {
      expect(limitations, `LIMITATIONS.md names W16-L${String(itemNumber)}`).toContain(`W16-L${String(itemNumber)}`)
    }
    // F-C1 states the route, and W16-L1 says plainly what the gate does not stop.
    expect(limitations).toContain('human-run migration')
    // C-S8: no review is required on that route, and D-28 is not the route for changing text.
    for (const docName of ['LIMITATIONS.md', 'CONTRACT_TEMPLATES.md', 'ARCHITECTURE.md']) {
      expect(readDoc(docName), docName).not.toMatch(/reviewed migration|D-28 route/)
    }
    // C-S7, N3: facts instead of absolutes.
    expect(limitationsOnOneLine).not.toContain('cannot trap')
    expect(limitationsOnOneLine).not.toContain('no worker action gains a refusal')
    expect(limitationsOnOneLine).not.toContain('each lift above')
    expect(limitationsOnOneLine).toContain('starting a gated booking is refused in more states')
    // C-S1, C-S9, N2, N4, pin widening.
    expect(limitationsOnOneLine).toContain('No notification is sent when the training shop is deleted')
    expect(limitationsOnOneLine).toContain('soft-deactivation')
    expect(limitationsOnOneLine).toContain('can be permanent')
    expect(limitationsOnOneLine).toContain('j18_w16_accepted_booking_at_deleted_shop_moves_only_after_trainee_leaves')
    expect(limitationsOnOneLine).toContain('every locked clause')
    expect(limitations).toContain('what a dishonest owner can still do')
    expect(limitations).toContain('w16_limitation_owner_cancel_at_zero_days_then_assign_succeeds')
    expect(limitations).toContain('no interview feature')
    expect(limitations).toContain('All 174 register items are OPEN')
    // The old lift statements are gone (W6-L10 lines).
    expect(limitations).not.toContain('once training ends, fails or the shop is removed')
    expect(limitations).not.toContain('after a completion, a fail or a shop removal the booking gate lifts')
  })

  it('w16_readiness_trigger_gate_covers_bookings_and_profiles', () => {
    const readiness = readDoc('DEPLOYMENT_READINESS.md')
    const triggerGate = readiness.split('\n- [ ] ').find((gate) => gate.startsWith('**Trigger name order')) ?? ''
    for (const triggerName of [
      'bookings_guard_update_training_gate',
      'bookings_guard_update`',
      'profiles_sanitize_role_on_insert',
      'profiles_guard_protected_columns',
      'contract_template_versions_zz_core_text_pin',
      'contract_template_versions_validate_at_commit',
      'F-S4',
    ]) {
      expect(triggerGate, `the trigger-order gate names ${triggerName}`).toContain(triggerName)
    }
    expect(readiness).toMatch(/^- \[ \] \*\*Anon default grants \(F-S3\)/m)
    expect(readiness).toMatch(/^- \[ \] \*\*Trusted-session allow-list \(F-S5\)/m)
    expect(readiness).toMatch(/^- \[ \] \*\*W16 pre-apply count/m)
    expect(readiness).toContain('99 staged migrations')
    expect(readiness).toContain('174 items, all OPEN')
    // N2, N5, N7: the gate's own predicate, every W16 preflight and the trigger-function note.
    expect(readiness).toContain('public.roster_worker_in_required_training(assigned_worker_id, shop_id)')
    expect(readiness).toMatch(/w13a, w15a, w16a, w16b\)/)
    expect(readiness).toContain('handle_new_user')
    expect(readiness).not.toMatch(/^\s*- \[x\]/im)
  })

  it('w16_acceptance_k9_does_not_restate_vitest_numbers', () => {
    const acceptance = readDoc('ACCEPTANCE_TESTS.md')
    const k9Row = acceptance.split('\n').find((line) => line.startsWith('| K9 ')) ?? ''
    expect(k9Row).toContain('STATE.md')
    expect(k9Row).not.toMatch(/Vitest \d/)
    // F-C4: run totals stay in STATE.md across the whole file.
    expect(acceptance).not.toMatch(/Vitest \d+\s*\/\s*\d+/)
    // D-76: the inverted test keeps its evidence trail.
    expect(acceptance).toContain('`d18_booking_gate_lifts_after_shop_removal` | `d18_booking_gate_holds_after_shop_removal`')
    expect(acceptance).toContain('174 items, all OPEN')
    expect(readDoc('CONTRACT_TEMPLATES.md')).toContain('contract_template_insert_version')
    expect(readDoc('MARKETPLACE_AND_APPLICATIONS.md')).toContain('soft-deactivation')
    expect(readDoc('ROLE_AND_PROFILE_SECURITY.md')).toContain('public.roster_worker_in_required_training(assigned_worker_id, shop_id)')
  })
})
