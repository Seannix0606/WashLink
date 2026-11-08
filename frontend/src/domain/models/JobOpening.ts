export type JobOpeningStatus = 'draft' | 'published' | 'paused' | 'closed' | 'archived'

export const jobOpeningStatuses: readonly JobOpeningStatus[] = [
  'draft',
  'published',
  'paused',
  'closed',
  'archived',
]

/** A schedule category chosen by the shop, not a legal employment classification (W4-L2). */
export type JobOpeningJobType = 'full_time' | 'part_time' | 'temporary' | 'other'

export const jobOpeningJobTypes: readonly JobOpeningJobType[] = [
  'full_time',
  'part_time',
  'temporary',
  'other',
]

export type JobOpeningCompensationCurrency = 'PHP'

export const jobOpeningCompensationCurrencies: readonly JobOpeningCompensationCurrency[] = [
  'PHP',
]

export type JobOpeningCompensationPeriod = 'hour' | 'day' | 'week' | 'month' | 'per_task'

export const jobOpeningCompensationPeriods: readonly JobOpeningCompensationPeriod[] = [
  'hour',
  'day',
  'week',
  'month',
  'per_task',
]

/** "Certification" always means a shop-issued certification (W4-L5). */
export type JobOpeningApplicantRequirement = 'certification_required' | 'trainees_welcome'

export const jobOpeningApplicantRequirements: readonly JobOpeningApplicantRequirement[] = [
  'certification_required',
  'trainees_welcome',
]

/** Mirrors the CHECK constraints of public.job_openings (W4c). */
export const jobOpeningLimits = {
  titleMinLength: 3,
  titleMaxLength: 120,
  descriptionMaxLength: 4000,
  dutiesMaxCount: 20,
  dutyMaxLength: 200,
  workLocationMaxLength: 200,
  openingsCountMinimum: 1,
  openingsCountMaximum: 100,
  requiredSkillsMaxCount: 30,
  requiredSkillMaxLength: 60,
  minimumYearsExperienceMinimum: 0,
  minimumYearsExperienceMaximum: 60,
  experienceRequirementMaxLength: 500,
  availabilityRequirementMaxLength: 300,
  scheduleDetailsMaxLength: 1000,
  /** Amounts must be greater than 0 and less than this value (numeric(10,2)). */
  compensationAmountExclusiveMaximum: 10_000_000,
  compensationDecimalPlaces: 2,
  compensationDetailsMaxLength: 500,
  benefitsMaxLength: 1000,
  otherTermsMaxLength: 2000,
  qualificationsMaxCount: 20,
  qualificationMaxLength: 200,
  requiredTrainingMaxLength: 1000,
  certificationExpectationsMaxLength: 500,
  applicationInstructionsMaxLength: 1000,
  /** Non-archived openings per shop. */
  openingsPerShopMaximum: 50,
  /** Owner list page size (non-archived openings, most recently updated first). */
  ownListMaximum: 200,
} as const

/** Everything the owner writes. Empty values are null or [] and mean "not specified by the shop". */
export interface JobOpeningContent {
  readonly title: string
  readonly description: string | null
  readonly duties: readonly string[]
  readonly workLocation: string | null
  readonly openingsCount: number | null
  readonly jobType: JobOpeningJobType | null
  readonly requiredSkills: readonly string[]
  readonly minimumYearsExperience: number | null
  readonly experienceRequirement: string | null
  readonly availabilityRequirement: string | null
  readonly scheduleDetails: string | null
  readonly compensationMinAmount: number | null
  readonly compensationMaxAmount: number | null
  readonly compensationCurrency: JobOpeningCompensationCurrency | null
  readonly compensationPeriod: JobOpeningCompensationPeriod | null
  readonly compensationDetails: string | null
  readonly benefits: string | null
  readonly otherTerms: string | null
  readonly minimumQualifications: readonly string[]
  readonly preferredQualifications: readonly string[]
  readonly requiredTraining: string | null
  readonly applicantRequirement: JobOpeningApplicantRequirement | null
  readonly certificationExpectations: string | null
  /** Asia/Manila calendar date (YYYY-MM-DD); applications are accepted through that day. */
  readonly applicationDeadline: string | null
  readonly applicationInstructions: string | null
}

export interface JobOpening extends JobOpeningContent {
  readonly id: string
  readonly shopId: string
  readonly status: JobOpeningStatus
  readonly firstPublishedAt: string | null
  readonly statusChangedAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

/** Owner input for create and edit. Owner, status and server stamps are never part of it. */
export type SaveJobOpeningInput = JobOpeningContent
