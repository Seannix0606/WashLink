import type { ApplicationUserRole } from '../../domain/models/AuthenticatedUser'
import { workforceActivityPageSize, type WorkforceActivityEvent, type WorkforceActivityPage } from '../../domain/models/WorkforceActivity'
import type { WorkforceActivityRepository } from '../../domain/repositories/WorkforceActivityRepository'

/** Posting report events (D-53): an owner never sees that a report exists, how many or why. */
const jobOpeningReportActionPrefix = 'job_opening_report.'

/**
 * Display safeguard only (W14 B1): the database decides what `my_workforce_activity` returns; this
 * just never renders a `job_opening_report.*` row to an owner even if one came back.
 */
export function isActivityEventShownTo(activityEvent: WorkforceActivityEvent, viewerRole: ApplicationUserRole | null): boolean {
  return !(viewerRole === 'owner' && activityEvent.action.startsWith(jobOpeningReportActionPrefix))
}

/** W14 "Your activity" (P76): redacted, newest first, one page at a time (every role). */
export class WorkforceActivityService {
  public constructor(private readonly workforceActivityRepository: WorkforceActivityRepository) {}

  /** `beforeEventId` null reads the newest page; otherwise the page older than that event. */
  public async loadPage(beforeEventId: number | null, viewerRole: ApplicationUserRole | null = null): Promise<WorkforceActivityPage> {
    const events = await this.workforceActivityRepository.listMyActivity(beforeEventId, workforceActivityPageSize)
    return {
      events: events.filter((activityEvent) => isActivityEventShownTo(activityEvent, viewerRole)),
      hasMore: events.length === workforceActivityPageSize,
      oldestEventId: events.at(-1)?.eventId ?? null,
    }
  }
}
