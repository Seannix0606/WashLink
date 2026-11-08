import type { AdminDashboardSummary, OwnerDashboardSummary, WorkerDashboardSummary } from '../../domain/models/WorkforceDashboardSummary'
import type { DashboardCountGroup } from '../components/shared/DashboardCountGrid'
import { formatCertificationDate } from './certificationDisplay'
import { formatCalendarDate } from './jobOpeningDisplay'
import { overdueShopReviewHelpText, strandedSuspensionHelpText } from './workforceDashboardCopy'

/** W11: summary -> labelled count groups. Values are passed through; nothing is added up here. */

const noneText = 'None'

export function workerCountGroups(summary: WorkerDashboardSummary): DashboardCountGroup[] {
  return [
    {
      key: 'work',
      heading: 'Work',
      items: [
        { key: 'open_openings', label: 'Openings you can apply to', value: summary.openOpeningCount },
        { key: 'active_applications', label: 'Applications in progress', value: summary.activeApplicationCount },
        { key: 'accepted_applications', label: 'Accepted applications', value: summary.acceptedApplicationCount },
      ],
    },
    {
      key: 'training',
      heading: 'Training and certificates',
      items: [
        { key: 'training_in_progress', label: 'Trainings in progress', value: summary.trainingInProgressCount },
        {
          key: 'next_training',
          label: 'Next training day',
          value: summary.nextTrainingDate === null ? noneText : formatCalendarDate(summary.nextTrainingDate),
        },
        { key: 'current_certifications', label: 'Current shop-issued certificates', value: summary.currentCertificationCount },
        { key: 'expiring_certifications', label: 'Expiring within 30 days', value: summary.expiringCertificationCount },
        { key: 'suspended_or_revoked', label: 'Suspended or revoked', value: summary.suspendedOrRevokedCertificationCount },
        { key: 'open_platform_reviews', label: 'Open WashLink reviews', value: summary.openPlatformReviewCount },
      ],
    },
    {
      key: 'contracts',
      heading: 'Contracts',
      items: [
        { key: 'accepted_not_started', label: 'Accepted, not started', value: summary.acceptedNotStartedCount },
        { key: 'active_contracts', label: 'Active contracts', value: summary.activeContractCount },
        { key: 'open_disputes', label: 'Open reported problems', value: summary.openDisputeCount },
      ],
    },
  ]
}

export function ownerCountGroups(summary: OwnerDashboardSummary): DashboardCountGroup[] {
  return [
    {
      key: 'shops',
      heading: 'Shops and hiring',
      items: [
        { key: 'shops', label: 'Shops', value: summary.shopCount },
        { key: 'verified_shops', label: 'Verified shops', value: summary.verifiedShopCount },
        { key: 'published_openings', label: 'Published openings', value: summary.publishedOpeningCount },
        { key: 'draft_openings', label: 'Opening drafts', value: summary.draftOpeningCount },
        { key: 'new_applications', label: 'New applications', value: summary.newApplicationCount },
        { key: 'in_review_applications', label: 'Applications in review', value: summary.inReviewApplicationCount },
      ],
    },
    {
      key: 'training',
      heading: 'Training and certificates',
      items: [
        { key: 'invitations_pending', label: 'Invitations not answered', value: summary.trainingInvitationPendingCount },
        { key: 'trainees_in_progress', label: 'Trainees in progress', value: summary.traineeInProgressCount },
        { key: 'ready_to_certify', label: 'Ready to certify', value: summary.readyToCertifyCount },
        { key: 'shop_review_requests', label: 'Open review requests', value: summary.openShopReviewRequestCount },
        { key: 'platform_reviews', label: 'Under WashLink review', value: summary.openPlatformReviewCount },
        { key: 'expiring_certifications', label: 'Expiring within 30 days', value: summary.expiringCertificationCount },
      ],
    },
    {
      key: 'contracts',
      heading: 'Contracts',
      items: [
        { key: 'active_templates', label: 'Active templates', value: summary.activeTemplateCount },
        { key: 'contract_drafts', label: 'Contract drafts', value: summary.contractDraftCount },
        { key: 'offers_waiting', label: 'Offers waiting for the worker', value: summary.offerAwaitingWorkerCount },
        { key: 'amendments_waiting', label: 'Changes waiting for the worker', value: summary.amendmentAwaitingWorkerCount },
        { key: 'accepted_not_started', label: 'Accepted, not started', value: summary.acceptedNotStartedCount },
        { key: 'active_contracts', label: 'Active contracts', value: summary.activeContractCount },
        { key: 'relationships_needing_attention', label: 'Relationships needing attention', value: summary.relationshipNeedsAttentionCount },
        { key: 'open_disputes', label: 'Open reported problems', value: summary.openDisputeCount },
      ],
    },
  ]
}

export function adminCountGroups(summary: AdminDashboardSummary): DashboardCountGroup[] {
  return [
    {
      key: 'shops',
      heading: 'Shop verification',
      items: [{ key: 'shops_pending', label: 'Shops waiting for review', value: summary.shopsPendingReviewCount }],
    },
    {
      key: 'certifications',
      heading: 'Certification reviews',
      items: [
        { key: 'open_reviews', label: 'Open WashLink reviews', value: summary.openPlatformReviewCount },
        {
          key: 'oldest_review',
          label: 'Oldest open review',
          value: summary.oldestPlatformReviewOpenedAt === null ? noneText : formatCertificationDate(summary.oldestPlatformReviewOpenedAt),
        },
        {
          key: 'overdue_shop_requests',
          label: 'Shop requests past 14 days',
          value: summary.overdueShopReviewRequestCount,
          helperText: overdueShopReviewHelpText,
        },
        {
          key: 'stranded_suspensions',
          label: 'Suspensions without a deciding shop',
          value: summary.strandedSuspendedCertificationCount,
          helperText: strandedSuspensionHelpText,
        },
      ],
    },
    {
      key: 'disputes',
      heading: 'Contract disputes',
      items: [
        { key: 'open_disputes', label: 'Open reported problems', value: summary.openDisputeCount },
        { key: 'unviewed_disputes', label: 'Not opened yet', value: summary.unviewedDisputeCount },
        {
          key: 'oldest_dispute',
          label: 'Oldest open report',
          value: summary.oldestDisputeOpenedAt === null ? noneText : formatCertificationDate(summary.oldestDisputeOpenedAt),
        },
      ],
    },
  ]
}
