/**
 * Messages the W9 worker contract migrations raise on purpose (docs/workforce/WORKER_CONTRACTS.md,
 * "Messages"). Merged into supabaseErrorMessages.ts; W8 texts the W9 RPCs reuse (owner text,
 * shop terms, "Contract template not found." ...) are already listed there.
 */
export const workerContractDatabaseMessages: readonly string[] = [
  // 42501
  'Contract not found.',
  'This contract change is not allowed.',
  'Contracts are changed only through WashLink.',
  'Sent contract versions cannot be edited.',
  'Acceptance records are created only by the accepting party.',
  'Acceptance records cannot be changed.',
  'Contract reference data changes only through migrations.',
  'Retained application records are written only by WashLink.',
  'Retained application records cannot be changed.',
  // 23514
  'You can draft a contract only for a worker with an accepted application or completed training at this shop.',
  'Choose a contract template.',
  'Choose the relationship type for this contract.',
  'Unknown relationship type.',
  'Give a start date.',
  'The end date cannot be before the start date.',
  'Write the role title in 3 to 120 characters.',
  'Write the schedule in 3 to 500 characters.',
  'Write the pay details in 3 to 1000 characters.',
  'Your shop needs a recorded verification before you send a contract.',
  'The start date cannot be in the past.',
  'Confirm the offer statement before sending.',
  'Confirm the independent contractor acknowledgement.',
  'Confirm the acceptance statement before accepting.',
  'Confirm the required statements before continuing.',
  "This shop is no longer on WashLink, so this offer can only be declined.",
  "This shop's verification is not current. You can decline or wait.",
  'Keep the note to 500 characters.',
  'Give a reason of 10 to 500 characters.',
  'The contract start date has not been reached yet.',
  'Your shop needs a recorded verification before you record the start.',
  'This worker is still in required training with your shop. Training is not productive work, so the contract cannot start yet.',
  // validator texts (w9d / w9e)
  'A clause hash does not match its text.',
  'A contract version must be based on a standard template version.',
  'Contract versions are numbered in order.',
  'The contract hash does not match its text.',
  'The contract text does not match its clauses.',
  'The contract text still has unfilled placeholders.',
  'The keyword flags do not match the contract text.',
  'The owner acceptance record is missing.',
  // 23505
  'This worker already has an open contract with this shop.',
  'This contract already has an open change.',
  // 55000
  'This contract changed. Reload it and try again.',
  'This contract changed. Read the new version before you accept.',
  'The keyword check changed. Review the flags again.',
  // 22023
  'Contract details must be text.',
  'Unknown contract detail.',
  'The expiry date cannot be in the past.',
]

/** W9 messages that carry keys (the unfilled list, a clause key); capped so no long echo passes. */
export const workerContractDatabaseMessagePatterns: readonly RegExp[] = [
  /^Fill in every shop clause and contract detail before sending \(missing: [a-z0-9_:., ]{1,600}\)\.$/,
  /^Every clause of the standard template must stay in place \([a-z_]{1,60}\)\.$/,
]
