/**
 * Messages the W10 migrations raise on purpose (w10c policies, w10d relationships).
 * Merged into supabaseErrorMessages.ts. The refresh date message is internal (no client can call it).
 */
export const ownerRelationshipDatabaseMessages: readonly string[] = [
  // 42501
  'Only a platform administrator can change workforce policies.',
  'Workforce policies cannot be deleted.',
  'Workforce policies are changed only by a platform administrator.',
  'This part of a workforce policy cannot be changed.',
  'Owner relationships are kept by WashLink.',
  'Owner relationships are changed only by WashLink.',
  // 22023
  'Unknown workforce policy.',
  // 55000
  'This policy changed. Reload it and try again.',
  // 23514
  'Choose a whole number from 1 to 10.',
  'Give a reason of 10 to 300 characters.',
  'This is already the current value.',
]
