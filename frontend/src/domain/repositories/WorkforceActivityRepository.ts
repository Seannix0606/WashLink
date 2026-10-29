import type { WorkforceActivityEvent } from '../models/WorkforceActivity'

/** W14 "Your activity": one RPC (`my_workforce_activity`), newest first, paged by event number. */
export interface WorkforceActivityRepository {
  listMyActivity(beforeEventId: number | null, limit: number): Promise<WorkforceActivityEvent[]>
}
