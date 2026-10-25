/**
 * Turns Supabase / Postgres errors into text that is safe to show to people.
 * Raw SQL or PostgREST messages are never passed through; only the messages the
 * W2 database guards raise on purpose (already written for end users) are.
 */
interface SupabaseErrorLike {
  readonly code?: string | null
  readonly message?: string | null
}

const userFacingDatabaseMessages: ReadonlySet<string> = new Set([
  'Shop not found.',
  'This shop cannot be submitted in its current status.',
  'Only owner accounts can register a shop.',
  'Only owner accounts can issue roster link codes.',
  'Roster worker not found.',
  'This roster worker is already linked to an account.',
  'Only worker accounts can link to a shop roster.',
  'Roster entry not found.',
  'Workers are linked only when the worker accepts a link code.',
  'This booking field cannot be changed.',
  'This booking status change is not allowed.',
  'Only a worker from your own roster can be assigned to this booking.',
  'Only a completed, unrated booking can be rated by its customer.',
  'New bookings start as pending, unassigned and unrated.',
  'Your role and verification fields cannot be changed from the app.',
  'Sign in to manage notifications.',
  'Mark at most 200 notifications at a time.',
  // W4 job openings (guard trigger and transition_job_opening).
  'Only owner accounts can create job openings.',
  'You can create job openings only for your own shop.',
  'Job openings start as drafts.',
  'A shop can have at most 50 job openings that are not archived.',
  'Job opening not found.',
  'This job opening field cannot be changed.',
  'This job opening status change is not allowed.',
  'Closed or archived job openings cannot be edited.',
  'Complete the required job opening fields before publishing.',
  'The application deadline has passed.',
  'Only draft job openings can be deleted.',
  'Only a verified shop can publish job openings.',
  'This job opening changed. Refresh and try again.',
])

const userFacingMessageByErrorCode: ReadonlyMap<string, string> = new Map([
  ['23514', 'Some details are outside the allowed limits. Check them and try again.'],
  ['23505', 'This record already exists.'],
  ['23503', 'A related record could not be found. Refresh and try again.'],
  ['42501', 'Your account is not allowed to do this.'],
  ['PGRST116', 'The record could not be found. Refresh and try again.'],
])

export function toUserFacingErrorMessage(
  supabaseError: SupabaseErrorLike,
  fallbackMessage: string,
): string {
  const databaseMessage = supabaseError.message?.trim() ?? ''
  if (userFacingDatabaseMessages.has(databaseMessage)) {
    return databaseMessage
  }
  const errorCode = supabaseError.code ?? ''
  return userFacingMessageByErrorCode.get(errorCode) ?? fallbackMessage
}

export function toUserFacingError(
  supabaseError: SupabaseErrorLike,
  fallbackMessage: string,
): Error {
  return new Error(toUserFacingErrorMessage(supabaseError, fallbackMessage))
}
