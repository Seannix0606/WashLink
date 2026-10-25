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
  // W5 job applications and marketplace search (guard trigger, RPCs, search input checks).
  'Only worker accounts can apply to job openings.',
  'Create your worker profile before applying.',
  'This job opening is paused and is not accepting applications.',
  'This job opening is closed.',
  'This shop cannot receive applications until its verification is reviewed.',
  'The application deadline for this opening has passed.',
  'You cannot apply to this job opening again.',
  'You have reached the limit of 50 open applications.',
  'This job opening is not accepting more applications.',
  'Review the training and work notice before applying.',
  'The cover note must be 1000 characters or fewer.',
  'You have already applied to this job opening.',
  'Job application not found.',
  'This application changed. Refresh and try again.',
  'This application status change is not allowed.',
  'Only a verified shop can accept applications.',
  'The application snapshot cannot be changed.',
  'Only draft applications can be deleted.',
  'Job applications change only through the application actions.',
  'This application field cannot be changed.',
  'A submitted application cannot be edited.',
  'Search filters must be 80 characters or fewer.',
  'Choose a pay period to filter by pay amount.',
  'The minimum pay amount cannot be negative.',
  'Results are limited to 1-50 per page and an offset of 0-1000.',
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
