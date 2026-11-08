import type { WorkforceActivityActorLabel, WorkforceActivityDetailValue } from '../../domain/models/WorkforceActivity'

/**
 * W14 "Your activity" wording (P76, D-54, W14-L7). Labels only, never ids. This is an operational
 * view of recorded workforce events, not a complete copy of the personal data WashLink holds.
 */

export const activityMenuLabel = 'Your activity'
export const activityDrawerTitle = 'Your activity'
export const activityDrawerDescription = 'Workforce events that concern your account, newest first'
export const activityIntroText =
  'This list shows recorded workforce events about your account. It hides ids and private notes, and it is not a complete copy of your data.'
export const activityEmptyTitle = 'No activity yet'
export const activityEmptyText = 'Job, training, certificate and contract events appear here.'
export const activityLoadOlderLabel = 'Show older activity'

export const activityActorText: Readonly<Record<WorkforceActivityActorLabel, string>> = {
  you: 'You',
  washlink: 'WashLink',
  washlink_system: 'WashLink (automatic)',
  shop_owner: 'A shop owner',
  worker: 'A worker',
  someone: 'Someone',
}

/** Exact wording for events people most need to recognise. */
const activityActionText: Readonly<Partial<Record<string, string>>> = {
  'admin_access.relationships_viewed': 'WashLink looked up your workforce relationships',
  'job_opening_report.submitted': 'Job opening reported',
  'job_opening_report.withdrawn': 'Job opening report withdrawn',
  'job_opening_report.closed': 'WashLink reviewed a job opening report',
  'job_opening_moderation.paused': 'WashLink paused a job opening',
  'job_opening_moderation.closed': 'WashLink closed a job opening',
  'job_opening_moderation.pause_kept': 'WashLink kept the pause on a job opening',
  'job_opening_moderation.lifted': 'WashLink lifted the pause on a job opening',
  'job_opening_moderation.changes_submitted': 'Asked WashLink to check a job opening',
  'job_opening_moderation.resolved_owner_closed': 'A paused job opening was closed by its owner',
  'shop.verification_rereviewed': 'WashLink recorded a review of a shop verification',
  'worker_contract_dispute.case_viewed': 'WashLink opened a reported contract problem',
  'certification_platform_review.case_viewed': 'WashLink opened a certification review',
  'workforce_audit.log_searched': 'Audit log searched',
}

const subjectFamilyText: Readonly<Partial<Record<string, string>>> = {
  job_opening: 'Job opening',
  job_application: 'Job application',
  job_application_record: 'Application record',
  training: 'Training',
  certification: 'Certificate',
  certification_platform_review: 'WashLink certification review',
  contract_template: 'Contract template',
  worker_contract: 'Contract',
  worker_contract_dispute: 'Reported contract problem',
  worker_owner_relationship: 'Workforce relationship',
  workforce_policy: 'Workforce policy',
  roster: 'Shop roster',
  shop: 'Shop',
  shop_verification: 'Shop verification',
  shop_certification_policy: 'Shop certificate policy',
  profile: 'Profile',
  job_opening_report: 'Job opening report',
  job_opening_moderation: 'Job opening moderation',
  admin_access: 'WashLink lookup',
  workforce_audit: 'Audit log',
}

function humanize(machineText: string): string {
  const spaced = machineText.replace(/[._]+/g, ' ').trim()
  return spaced.length === 0 ? spaced : `${spaced.charAt(0).toUpperCase()}${spaced.slice(1)}`
}

/** A readable title for an audit action such as `certification.issued` ("Certificate: issued"). */
export function describeActivityAction(action: string): string {
  const exactText = activityActionText[action]
  if (exactText !== undefined) {
    return exactText
  }
  const separatorIndex = action.indexOf('.')
  if (separatorIndex < 0) {
    return humanize(action)
  }
  const family = action.slice(0, separatorIndex)
  const verb = action.slice(separatorIndex + 1).replace(/[._]+/g, ' ')
  return `${subjectFamilyText[family] ?? humanize(family)}: ${verb}`
}

const detailKeyText: Readonly<Partial<Record<string, string>>> = {
  from_status: 'From',
  to_status: 'To',
  status: 'Status',
  decision: 'Decision',
  result: 'Result',
  category: 'Category',
  reason_kind: 'Reason',
  basis: 'Basis',
  resolution_kind: 'Closed as',
  changed_by: 'Changed by',
  deleted_by: 'Deleted by',
  ended_by: 'Ended by',
  party_role: 'Party',
  version_number: 'Version',
  version_kind: 'Version kind',
  scope: 'Scope',
  purpose: 'Purpose',
  access_kind: 'Looked up',
  outcome: 'Outcome',
}

/**
 * N7 (w14h): the person who was looked up gets this generic purpose on `admin_access.*` events, not
 * the purpose the administrator chose. The specific purpose labels live in `adminOversightCopy.ts`
 * and are used only in the administrator's lookup and audit log views.
 */
export const subjectLookupPurposeKey = 'washlink_review'
export const subjectLookupPurposeText = 'WashLink review'

/**
 * One "Label: value" line per allow-listed detail (values as recorded, underscores as spaces). A
 * `purpose` is always shown as the generic lookup purpose: "Your activity" never names a specific
 * lookup purpose, even if one came back.
 */
export function describeActivityDetails(details: Readonly<Record<string, WorkforceActivityDetailValue>>): string[] {
  return Object.entries(details).map(([detailKey, detailValue]) => {
    const valueText =
      detailKey === 'purpose'
        ? subjectLookupPurposeText
        : typeof detailValue === 'boolean'
          ? detailValue
            ? 'yes'
            : 'no'
          : String(detailValue).replace(/_/g, ' ')
    return `${detailKeyText[detailKey] ?? humanize(detailKey)}: ${valueText}`
  })
}

export const workforceActivityCopyConstants: readonly string[] = [
  activityDrawerDescription,
  activityIntroText,
  activityEmptyText,
  subjectLookupPurposeText,
  ...Object.values(activityActionText).filter((actionText): actionText is string => actionText !== undefined),
]
