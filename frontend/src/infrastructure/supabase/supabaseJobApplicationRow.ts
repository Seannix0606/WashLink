import type { ApplicantProfile } from '../../domain/models/ApplicantProfile'
import type {
  JobApplication,
  JobApplicationOpeningSnapshot,
  JobApplicationStatus,
} from '../../domain/models/JobApplication'
import type { VerifiedCertification } from '../../domain/models/VerifiedCertification'
import type { WorkerAvailabilityStatus } from '../../domain/models/WorkerProfile'
import {
  mapJobOpeningContentRow,
  type SupabaseJobOpeningContentPayload,
} from './supabaseJobOpeningRow'

/** Explicit columns only: never `*`, never `worker_id` or `owner_id` (RLS scopes the rows). */
export const jobApplicationSelectColumns = [
  'id',
  'job_opening_id',
  'shop_id',
  'status',
  'cover_note',
  'notice_version',
  'notice_acknowledged_at',
  'submitted_at',
  'decided_at',
  'withdrawn_at',
  'closed_at',
  'status_changed_at',
  'opening_snapshot',
  'opening_snapshot_taken_at',
  'created_at',
  'updated_at',
].join(', ')

/** jsonb written by job_opening_application_snapshot: W4 content columns plus these keys. */
export interface SupabaseJobApplicationSnapshotJson extends SupabaseJobOpeningContentPayload {
  snapshot_version: number
  job_opening_updated_at: string
  shop_name: string | null
  shop_address: string | null
}

export interface SupabaseJobApplicationRow {
  id: string
  job_opening_id: string
  shop_id: string
  status: JobApplicationStatus
  cover_note: string | null
  notice_version: string | null
  notice_acknowledged_at: string | null
  submitted_at: string | null
  decided_at: string | null
  withdrawn_at: string | null
  closed_at: string | null
  status_changed_at: string | null
  opening_snapshot: SupabaseJobApplicationSnapshotJson | null
  opening_snapshot_taken_at: string | null
  created_at: string
  updated_at: string
}

function mapOpeningSnapshot(
  snapshotJson: SupabaseJobApplicationSnapshotJson | null,
): JobApplicationOpeningSnapshot | null {
  if (snapshotJson === null || typeof snapshotJson !== 'object') {
    return null
  }
  return {
    ...mapJobOpeningContentRow(snapshotJson),
    snapshotVersion: snapshotJson.snapshot_version,
    jobOpeningUpdatedAt: snapshotJson.job_opening_updated_at,
    shopName: snapshotJson.shop_name,
    shopAddress: snapshotJson.shop_address,
  }
}

export function mapJobApplicationRow(jobApplicationRow: SupabaseJobApplicationRow): JobApplication {
  return {
    id: jobApplicationRow.id,
    jobOpeningId: jobApplicationRow.job_opening_id,
    shopId: jobApplicationRow.shop_id,
    status: jobApplicationRow.status,
    coverNote: jobApplicationRow.cover_note,
    noticeVersion: jobApplicationRow.notice_version,
    noticeAcknowledgedAt: jobApplicationRow.notice_acknowledged_at,
    submittedAt: jobApplicationRow.submitted_at,
    decidedAt: jobApplicationRow.decided_at,
    withdrawnAt: jobApplicationRow.withdrawn_at,
    closedAt: jobApplicationRow.closed_at,
    statusChangedAt: jobApplicationRow.status_changed_at,
    openingSnapshot: mapOpeningSnapshot(jobApplicationRow.opening_snapshot),
    openingSnapshotTakenAt: jobApplicationRow.opening_snapshot_taken_at,
    createdAt: jobApplicationRow.created_at,
    updatedAt: jobApplicationRow.updated_at,
  }
}

/** Row of applicant_profiles_for_job_opening (no contact columns exist in it). */
export interface SupabaseApplicantProfileRow {
  application_id: string
  display_name: string
  headline: string | null
  experience_summary: string | null
  years_of_experience: number | null
  skills: string[] | null
  preferred_locations: string[] | null
  availability_status: WorkerAvailabilityStatus | null
  availability_notes: string | null
  profile_updated_at: string | null
}

/** Copies the named fields only, so an unexpected extra column can never reach the UI. */
export function mapApplicantProfileRow(applicantProfileRow: SupabaseApplicantProfileRow): ApplicantProfile {
  return {
    applicationId: applicantProfileRow.application_id,
    displayName: applicantProfileRow.display_name,
    headline: applicantProfileRow.headline,
    experienceSummary: applicantProfileRow.experience_summary,
    yearsOfExperience: applicantProfileRow.years_of_experience,
    skills: applicantProfileRow.skills ?? [],
    preferredLocations: applicantProfileRow.preferred_locations ?? [],
    availabilityStatus: applicantProfileRow.availability_status,
    availabilityNotes: applicantProfileRow.availability_notes,
    profileUpdatedAt: applicantProfileRow.profile_updated_at,
  }
}

export interface SupabaseVerifiedCertificationRow {
  certification_id: string
  certification_title: string
  issuing_shop_name: string
  issued_at: string
  expires_at: string | null
}

export function mapVerifiedCertificationRow(
  verifiedCertificationRow: SupabaseVerifiedCertificationRow,
): VerifiedCertification {
  return {
    certificationId: verifiedCertificationRow.certification_id,
    certificationTitle: verifiedCertificationRow.certification_title,
    issuingShopName: verifiedCertificationRow.issuing_shop_name,
    issuedAt: verifiedCertificationRow.issued_at,
    expiresAt: verifiedCertificationRow.expires_at,
  }
}
