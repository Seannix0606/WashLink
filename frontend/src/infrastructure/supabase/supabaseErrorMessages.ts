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
  // W6 training (program, session, trainer, enrollment and evidence RPCs; C7 booking gate).
  'A correction must change the attendance or the note.',
  'A pass needs every checklist item met.',
  'A session is already scheduled on this date.',
  'A shop can have at most 50 training programs that are not archived.',
  'A trainer of this program cannot be enrolled in it.',
  'A training program can have at most 30 scheduled sessions.',
  'A worker enrolled in this program cannot be its trainer.',
  'Add objectives, terms and at least one checklist item before opening.',
  'An assessment can be recorded only for an accepted enrollment.',
  'An assessment is already recorded. Record a correction instead.',
  'An open training program cannot be edited.',
  'Attendance can be recorded only for an accepted enrollment.',
  'Attendance for this day is already recorded. Record a correction instead.',
  'Attendance was recorded for this session; it cannot be cancelled.',
  'Choose a scheduled session of this program.',
  'Choose a session date from today up to one year ahead.',
  'Choose a worker linked to your roster.',
  'Confirm the free-training statement before opening.',
  'Each checklist item must be 3 to 200 characters.',
  'Give a correction reason of 10 to 300 characters.',
  'Give a reason for the fail of 10 to 300 characters.',
  'Give a reason of 10 to 300 characters.',
  'Invitations can be sent only while the program is open.',
  'Invite only an applicant you accepted for this shop.',
  'Mark every checklist item as met or not met.',
  'Only a verified shop can invite workers to training.',
  'Only a verified shop can open training programs.',
  'Only draft training programs can be deleted.',
  'Only the shop owner or a designated trainer can record training.',
  'Records can be corrected only for an accepted enrollment.',
  'Review the free-training notice before enrolling.',
  'Sessions can be added only while the program is a draft or open.',
  'Sessions can be deleted only while the program is a draft. Cancel it instead.',
  'The worker has not attended the required training days yet.',
  'This program does not have enough upcoming training days.',
  'This record was already corrected.',
  'This session cannot be cancelled.',
  'This session has not happened yet.',
  'This session was before the worker enrolled.',
  'This trainer role was already revoked.',
  'This training enrollment change is not allowed.',
  'This training program changed. Refresh and try again.',
  'This training program changed. Review it again.',
  'This training program is full.',
  'This training program is not open.',
  'This training program status change is not allowed.',
  'This worker already has a live enrollment in this program.',
  'This worker has reached the limit of 10 live trainings.',
  'This worker is already a trainer for this program.',
  'Trainers cannot be changed on an archived program.',
  'Training enrollment not found.',
  'Training is still in progress in this program.',
  'Training program not found.',
  'Training records cannot be deleted. Record a correction instead.',
  'Training records cannot be edited. Record a correction instead.',
  'You can create training programs only for your own shop.',
  'This worker is in required training with your shop and cannot be assigned to customer bookings until the training ends.',
  'You are in required training with this shop and cannot start customer bookings until the training ends.',
])

/** Guard messages that carry a number (for example the program's required training days). */
const userFacingDatabaseMessagePatterns: readonly RegExp[] = [
  /^Schedule at least \d{1,2} upcoming supervised training days \(and no past sessions\) before opening\.$/,
  /^Each (skill|checklist item) must be \d{1,3} characters or fewer\.$/,
]

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
  if (
    userFacingDatabaseMessages.has(databaseMessage) ||
    userFacingDatabaseMessagePatterns.some((messagePattern) => messagePattern.test(databaseMessage))
  ) {
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
