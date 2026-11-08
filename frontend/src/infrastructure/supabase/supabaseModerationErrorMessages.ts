/**
 * Messages the W14 migrations raise on purpose (w14b..w14i; loop/workforce/increments/W14/LOG.md,
 * "BUILD (DB)"). Merged into supabaseErrorMessages.ts. Texts earlier increments already list (for
 * example `Job opening not found.` or `Shop not found.`) are repeated so this list is complete for
 * W14. Preflight and drift texts (`W14 preflight: ...`, `W14c: ...`) are internal and never shown.
 */
export const moderationDatabaseMessages: readonly string[] = [
  // 42501
  'Job opening not found.',
  'Report not found.',
  'Moderation case not found.',
  'Shop not found.',
  'Only a platform administrator can moderate job openings.',
  'Only a platform administrator can read moderation cases.',
  'Only a platform administrator can review shops.',
  'Only a platform administrator can look up relationships.',
  'Only a platform administrator can read the audit log.',
  'This job opening change is not allowed.',
  'Moderation records cannot be edited.',
  'Moderation records change only through the WashLink moderation actions.',
  'Access records are append-only.',
  'Access records are written only by the WashLink lookup actions.',
  // 22023
  'Choose a report reason.',
  'Choose a moderation action.',
  'Choose a reason for this action.',
  'Choose a case status.',
  'Choose confirm approval, request changes or reject.',
  'Choose a purpose for this lookup.',
  'Choose a person to look up.',
  'Choose a page size between 1 and 100.',
  'Choose a page size between 1 and 200.',
  'Use only lowercase letters, dots and underscores in the action filter.',
  'Use only lowercase letters and underscores in the subject type filter.',
  'The start of the range must be before the end.',
  // 22023 from admin_job_opening_moderation_queue_page (w13c; 'Choose a case status.' is listed above)
  'Page size must be between 1 and 100.',
  'Give both parts of the page cursor.',
  // 23505
  'You already reported this job opening.',
  // 23514
  'Write 20 to 1000 characters.',
  'You have reached the report limit. Wait for WashLink to review your reports.',
  'This report is no longer open.',
  'This action is not available for this case.',
  'This job opening no longer exists.',
  'Write a message to the owner of 20 to 500 characters.',
  'Write an internal note of 20 to 1000 characters.',
  'Only a published or paused job opening can be paused or closed.',
  'This job opening is not waiting for your changes.',
  'Edit the job opening before asking WashLink to check it.',
  'Write at most 500 characters.',
  'WashLink paused this job opening. Edit it and ask WashLink to check it before publishing again.',
  'This shop already has a recorded review.',
  'Write notes of 20 to 1000 characters.',
  'Write a note of 20 to 300 characters.',
  // 55000
  'This case changed. Refresh and try again.',
]
