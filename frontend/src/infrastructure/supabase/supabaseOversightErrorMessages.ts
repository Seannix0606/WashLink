/**
 * Messages the W11 migrations raise on purpose (w11b..w11g; loop/workforce/increments/W11/LOG.md).
 * Merged into supabaseErrorMessages.ts. Texts W7 / W9 already list (for example `Certification not
 * found.` or `Contract not found.`) are repeated here so this list is complete for W11.
 */
export const oversightDatabaseMessages: readonly string[] = [
  // WashLink certification review (w11b holds, w11c RPCs, w11d reads)
  'Certification not found.',
  'This certification changed. Refresh and try again.',
  'Only a suspended or revoked certification can be reviewed.',
  'WashLink is already reviewing this certification.',
  'WashLink already reviewed this decision.',
  'You can ask WashLink to review this decision at most 3 times.',
  'Ask the shop to review this decision first. You can ask WashLink when the shop keeps its decision, has not decided within 14 days, or can no longer decide.',
  'Write a statement of 20 to 1000 characters.',
  'WashLink review not found.',
  'This review is no longer open.',
  'Only a platform administrator can decide WashLink reviews.',
  'This review changed. Refresh and try again.',
  'Choose reinstate or uphold.',
  'Give a reason of 20 to 500 characters.',
  'This certification is no longer suspended or revoked.',
  'WashLink is reviewing this certification. Wait for its decision.',
  'Choose a review status.',
  'Only a platform administrator can read WashLink reviews.',
  'Certification records cannot be edited.',
  'WashLink reviews change only through the WashLink review actions.',
  // Reported contract problems (w11e guard, w11f RPCs, w11g reads)
  'Contract not found.',
  'Only a contract that was sent can be reported.',
  'Problems can be reported up to 90 days after a contract ends.',
  'Choose a problem category.',
  'This category does not match the contract.',
  'You already reported a problem with this contract.',
  'You can report at most 3 problems with this contract.',
  'Reported problem not found.',
  'Only the other party can add a response.',
  'This reported problem is no longer open.',
  'A response was already recorded.',
  'Only a platform administrator can close disputes.',
  'This reported problem changed. Refresh and try again.',
  'Choose how the problem was closed.',
  'Write a note of 20 to 1000 characters.',
  'Choose a dispute status.',
  'Only a platform administrator can read reported contract problems.',
  'Reported contract problems cannot be edited.',
  'Reported contract problems change only through WashLink.',
]
