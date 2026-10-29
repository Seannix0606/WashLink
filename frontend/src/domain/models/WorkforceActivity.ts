/**
 * W14 "Your activity" (P76, D-54): a redacted read of workforce audit events that concern the
 * signed-in account. The database never returns an actor, subject or profile id; details keep
 * only allow-listed keys with text, number or yes / no values.
 */

export const workforceActivityActorLabels = ['you', 'washlink', 'washlink_system', 'shop_owner', 'worker', 'someone'] as const

export type WorkforceActivityActorLabel = (typeof workforceActivityActorLabels)[number]

export type WorkforceActivityDetailValue = string | number | boolean

/** `my_workforce_activity(p_before_id, p_limit)` (w14h). */
export interface WorkforceActivityEvent {
  /** The audit event number, used only to page (never shown). */
  readonly eventId: number
  readonly createdAt: string
  readonly action: string
  readonly subjectType: string
  readonly actorLabel: WorkforceActivityActorLabel
  readonly details: Readonly<Record<string, WorkforceActivityDetailValue>>
}

export interface WorkforceActivityPage {
  readonly events: readonly WorkforceActivityEvent[]
  /** True when a full page came back, so an older page may exist. */
  readonly hasMore: boolean
  /** The oldest event number the database returned (also when a row was hidden), used to page; null when empty. */
  readonly oldestEventId: number | null
}

export const workforceActivityPageSize = 50
