import type {
  JobOpening,
  JobOpeningApplicantRequirement,
  JobOpeningCompensationCurrency,
  JobOpeningCompensationPeriod,
  JobOpeningJobType,
  JobOpeningStatus,
  SaveJobOpeningInput,
} from '../../domain/models/JobOpening'

/** Explicit columns only: never `*` and never `owner_id` (RLS scopes rows to the owner). */
export const jobOpeningSelectColumns = [
  'id',
  'shop_id',
  'status',
  'title',
  'description',
  'duties',
  'work_location',
  'openings_count',
  'job_type',
  'required_skills',
  'minimum_years_experience',
  'experience_requirement',
  'availability_requirement',
  'schedule_details',
  'compensation_min_amount',
  'compensation_max_amount',
  'compensation_currency',
  'compensation_period',
  'compensation_details',
  'benefits',
  'other_terms',
  'minimum_qualifications',
  'preferred_qualifications',
  'required_training',
  'applicant_requirement',
  'certification_expectations',
  'application_deadline',
  'application_instructions',
  'first_published_at',
  'status_changed_at',
  'created_at',
  'updated_at',
].join(', ')

export interface SupabaseJobOpeningRow {
  id: string
  shop_id: string
  status: JobOpeningStatus
  title: string
  description: string | null
  duties: string[] | null
  work_location: string | null
  openings_count: number | null
  job_type: JobOpeningJobType | null
  required_skills: string[] | null
  minimum_years_experience: number | null
  experience_requirement: string | null
  availability_requirement: string | null
  schedule_details: string | null
  /** numeric(10,2); PostgREST may send a number or a numeric string. */
  compensation_min_amount: number | string | null
  compensation_max_amount: number | string | null
  compensation_currency: JobOpeningCompensationCurrency | null
  compensation_period: JobOpeningCompensationPeriod | null
  compensation_details: string | null
  benefits: string | null
  other_terms: string | null
  minimum_qualifications: string[] | null
  preferred_qualifications: string[] | null
  required_training: string | null
  applicant_requirement: JobOpeningApplicantRequirement | null
  certification_expectations: string | null
  application_deadline: string | null
  application_instructions: string | null
  first_published_at: string | null
  status_changed_at: string | null
  created_at: string
  updated_at: string
}

/** Content columns the client may write. Owner, status and stamps are never included. */
export type SupabaseJobOpeningContentPayload = Omit<
  SupabaseJobOpeningRow,
  'id' | 'shop_id' | 'status' | 'first_published_at' | 'status_changed_at' | 'created_at' | 'updated_at'
>

function toAmount(storedAmount: number | string | null): number | null {
  return storedAmount === null ? null : Number(storedAmount)
}

export function mapJobOpeningRow(jobOpeningRow: SupabaseJobOpeningRow): JobOpening {
  return {
    id: jobOpeningRow.id,
    shopId: jobOpeningRow.shop_id,
    status: jobOpeningRow.status,
    title: jobOpeningRow.title,
    description: jobOpeningRow.description,
    duties: jobOpeningRow.duties ?? [],
    workLocation: jobOpeningRow.work_location,
    openingsCount: jobOpeningRow.openings_count,
    jobType: jobOpeningRow.job_type,
    requiredSkills: jobOpeningRow.required_skills ?? [],
    minimumYearsExperience: jobOpeningRow.minimum_years_experience,
    experienceRequirement: jobOpeningRow.experience_requirement,
    availabilityRequirement: jobOpeningRow.availability_requirement,
    scheduleDetails: jobOpeningRow.schedule_details,
    compensationMinAmount: toAmount(jobOpeningRow.compensation_min_amount),
    compensationMaxAmount: toAmount(jobOpeningRow.compensation_max_amount),
    compensationCurrency: jobOpeningRow.compensation_currency,
    compensationPeriod: jobOpeningRow.compensation_period,
    compensationDetails: jobOpeningRow.compensation_details,
    benefits: jobOpeningRow.benefits,
    otherTerms: jobOpeningRow.other_terms,
    minimumQualifications: jobOpeningRow.minimum_qualifications ?? [],
    preferredQualifications: jobOpeningRow.preferred_qualifications ?? [],
    requiredTraining: jobOpeningRow.required_training,
    applicantRequirement: jobOpeningRow.applicant_requirement,
    certificationExpectations: jobOpeningRow.certification_expectations,
    applicationDeadline: jobOpeningRow.application_deadline,
    applicationInstructions: jobOpeningRow.application_instructions,
    firstPublishedAt: jobOpeningRow.first_published_at,
    statusChangedAt: jobOpeningRow.status_changed_at,
    createdAt: jobOpeningRow.created_at,
    updatedAt: jobOpeningRow.updated_at,
  }
}

/** Lists are always sent as arrays ([] clears a list); the database rejects null lists. */
export function toJobOpeningContentPayload(
  saveJobOpeningInput: SaveJobOpeningInput,
): SupabaseJobOpeningContentPayload {
  return {
    title: saveJobOpeningInput.title,
    description: saveJobOpeningInput.description,
    duties: [...saveJobOpeningInput.duties],
    work_location: saveJobOpeningInput.workLocation,
    openings_count: saveJobOpeningInput.openingsCount,
    job_type: saveJobOpeningInput.jobType,
    required_skills: [...saveJobOpeningInput.requiredSkills],
    minimum_years_experience: saveJobOpeningInput.minimumYearsExperience,
    experience_requirement: saveJobOpeningInput.experienceRequirement,
    availability_requirement: saveJobOpeningInput.availabilityRequirement,
    schedule_details: saveJobOpeningInput.scheduleDetails,
    compensation_min_amount: saveJobOpeningInput.compensationMinAmount,
    compensation_max_amount: saveJobOpeningInput.compensationMaxAmount,
    compensation_currency: saveJobOpeningInput.compensationCurrency,
    compensation_period: saveJobOpeningInput.compensationPeriod,
    compensation_details: saveJobOpeningInput.compensationDetails,
    benefits: saveJobOpeningInput.benefits,
    other_terms: saveJobOpeningInput.otherTerms,
    minimum_qualifications: [...saveJobOpeningInput.minimumQualifications],
    preferred_qualifications: [...saveJobOpeningInput.preferredQualifications],
    required_training: saveJobOpeningInput.requiredTraining,
    applicant_requirement: saveJobOpeningInput.applicantRequirement,
    certification_expectations: saveJobOpeningInput.certificationExpectations,
    application_deadline: saveJobOpeningInput.applicationDeadline,
    application_instructions: saveJobOpeningInput.applicationInstructions,
  }
}
