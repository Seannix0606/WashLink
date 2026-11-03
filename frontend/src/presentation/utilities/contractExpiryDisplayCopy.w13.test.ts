import { describe, expect, it } from 'vitest'
import { workerOwnerRelationshipReasons, workerOwnerRelationshipStatuses } from '../../domain/models/OwnerRelationship'
import { ownerRelationshipCopyTexts } from './ownerRelationshipCopy'
import { ownerSideStatusDisplay, relationshipReasonText, relationshipStatusDisplay } from './ownerRelationshipDisplay'
import { myContractsIntroText, workerContractCopyConstants, workerTerminateText } from './workerContractCopy'
import { contractStatusDisplay, endedByLabel, workerContractDisplayLabels } from './workerContractDisplay'

/** W13 fix cycle 1 (C3, W13-L9): an end date passing is shown as a WashLink record, never as the relationship ending in law. */
const expiryAsEndingWording = /ended \(end date passed\)|reached its end date|ended when the end date passed/i

/** Wording that would state a right or a legal effect instead of what WashLink records. */
const legalEffectClaims =
  /\bvalid\b|\blawful|\blegally\b|\bbinding\b|\bcomplian|\bguarantee|\bterminated by law\b/i

function everyReasonText(): string[] {
  return workerOwnerRelationshipReasons.flatMap((reason) => [
    relationshipReasonText(reason, 'worker'),
    relationshipReasonText(reason, 'owner'),
  ])
}

describe('Contract expiry display copy (W13 fix cycle 1, C1 / C3)', () => {
  it('w13_expired_status_and_system_end_read_as_washlink_records', () => {
    expect(contractStatusDisplay('expired', 'owner').label).toBe('Past end date')
    expect(contractStatusDisplay('expired', 'worker').label).toBe('Past end date')
    expect(endedByLabel.system).toBe('End date passed (recorded on WashLink)')
    expect(relationshipReasonText('contract_expired', 'worker')).toBe("The contract's end date has passed (recorded on WashLink).")
    expect(relationshipReasonText('contract_expired', 'owner')).toBe("The contract's end date has passed (recorded on WashLink).")
  })

  it('w13_no_contract_or_relationship_string_presents_expiry_as_an_ending', () => {
    const relationshipLabels = workerOwnerRelationshipStatuses.flatMap((status) => [
      relationshipStatusDisplay[status].label,
      ownerSideStatusDisplay[status].label,
    ])
    const allTexts = [
      ...workerContractDisplayLabels,
      ...workerContractCopyConstants,
      ...ownerRelationshipCopyTexts,
      ...everyReasonText(),
      ...relationshipLabels,
      myContractsIntroText,
    ]
    for (const text of allTexts) {
      expect(text).not.toMatch(expiryAsEndingWording)
    }
    const expiryTexts = [
      contractStatusDisplay('expired', 'owner').label,
      contractStatusDisplay('expired', 'worker').label,
      endedByLabel.system,
      relationshipReasonText('contract_expired', 'worker'),
      relationshipReasonText('contract_expired', 'owner'),
    ]
    for (const text of expiryTexts) {
      expect(text).not.toMatch(/\bended\b|\bterminat/i)
      expect(text).not.toMatch(legalEffectClaims)
    }
  })

  it('w13_owner_facing_relationship_text_never_says_suspended', () => {
    const ownerTexts = [
      ...workerOwnerRelationshipStatuses.map((status) => ownerSideStatusDisplay[status].label),
      ...workerOwnerRelationshipReasons.map((reason) => relationshipReasonText(reason, 'owner')),
      contractStatusDisplay('expired', 'owner').label,
    ]
    for (const text of ownerTexts) {
      expect(text).not.toMatch(/suspend/i)
    }
  })

  it('w13_worker_intro_records_the_end_on_washlink_consistent_with_d73', () => {
    expect(myContractsIntroText).toBe(
      'Contract offers from shops appear here once they are sent to you. An offer applies only if you accept it. You can decline an offer, or record the end of an accepted contract, on WashLink at any time.',
    )
    // The unconditional W9 sentence is gone (W9 C2 remainder).
    expect(myContractsIntroText).not.toMatch(/can always decline/i)
    expect(myContractsIntroText).not.toMatch(/\bvalid\b/i)
    // Same "record the end ... on WashLink at any time" framing as the D-73 terminate text.
    expect(myContractsIntroText).toContain('record the end of an accepted contract, on WashLink at any time')
    expect(workerTerminateText).toContain('record the end of this contract on WashLink at any time')
    expect(myContractsIntroText).not.toMatch(legalEffectClaims)
  })
})
