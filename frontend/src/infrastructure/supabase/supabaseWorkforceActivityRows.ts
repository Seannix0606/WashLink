import {
  workforceActivityActorLabels,
  type WorkforceActivityActorLabel,
  type WorkforceActivityDetailValue,
  type WorkforceActivityEvent,
} from '../../domain/models/WorkforceActivity'

/** `my_workforce_activity(p_before_id, p_limit)` (w14h): no actor, subject or profile id column exists. */
export interface SupabaseWorkforceActivityRow {
  event_id: number | string
  created_at: string
  action: string
  subject_type: string
  actor_label: string
  details: unknown
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function toActorLabel(actorLabel: string): WorkforceActivityActorLabel {
  return workforceActivityActorLabels.find((candidate) => candidate === actorLabel) ?? 'someone'
}

/** Keeps text, number and yes / no values; drops anything id-shaped (the database already does). */
function toDetails(detailsJson: unknown): Record<string, WorkforceActivityDetailValue> {
  const details: Record<string, WorkforceActivityDetailValue> = {}
  if (typeof detailsJson !== 'object' || detailsJson === null || Array.isArray(detailsJson)) {
    return details
  }
  for (const [detailKey, detailValue] of Object.entries(detailsJson as Record<string, unknown>)) {
    if (typeof detailValue === 'string' && !uuidPattern.test(detailValue)) {
      details[detailKey] = detailValue
    } else if (typeof detailValue === 'number' || typeof detailValue === 'boolean') {
      details[detailKey] = detailValue
    }
  }
  return details
}

export function mapWorkforceActivityRow(row: SupabaseWorkforceActivityRow): WorkforceActivityEvent {
  return {
    eventId: Number(row.event_id),
    createdAt: row.created_at,
    action: row.action,
    subjectType: row.subject_type,
    actorLabel: toActorLabel(row.actor_label),
    details: toDetails(row.details),
  }
}
