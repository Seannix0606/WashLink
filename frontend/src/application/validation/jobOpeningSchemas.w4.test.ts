import { describe, expect, it } from 'vitest'
import { jobOpeningLimits, type SaveJobOpeningInput } from '../../domain/models/JobOpening'
import { buildJobOpening } from '../../test/fixtures'
import { createJobOpeningDraft, parseJobOpeningDraft } from './jobOpeningDraft'
import { compensationAmountFormatMessage, saveJobOpeningInputSchema } from './jobOpeningSchemas'

function firstIssueFor(candidateInput: Partial<SaveJobOpeningInput>): {
  readonly path: string
  readonly message: string
} | null {
  const parseResult = saveJobOpeningInputSchema.safeParse({ ...buildJobOpening(), ...candidateInput })
  if (parseResult.success) {
    return null
  }
  const firstIssue = parseResult.error.issues.at(0)
  return firstIssue === undefined
    ? null
    : { path: String(firstIssue.path.at(0)), message: firstIssue.message }
}

describe('Job opening schema (W4)', () => {
  it('w4_job_opening_schema_requires_title_and_mirrors_db_limits', () => {
    // Same numbers as the public.job_openings CHECK constraints.
    expect(jobOpeningLimits).toMatchObject({
      titleMinLength: 3, titleMaxLength: 120, descriptionMaxLength: 4000, dutiesMaxCount: 20,
      dutyMaxLength: 200, workLocationMaxLength: 200, openingsCountMinimum: 1, openingsCountMaximum: 100,
      requiredSkillsMaxCount: 30, requiredSkillMaxLength: 60, minimumYearsExperienceMaximum: 60,
      experienceRequirementMaxLength: 500, availabilityRequirementMaxLength: 300,
      scheduleDetailsMaxLength: 1000, compensationAmountExclusiveMaximum: 10_000_000,
      compensationDetailsMaxLength: 500, benefitsMaxLength: 1000, otherTermsMaxLength: 2000,
      qualificationsMaxCount: 20, qualificationMaxLength: 200, requiredTrainingMaxLength: 1000,
      certificationExpectationsMaxLength: 500, applicationInstructionsMaxLength: 1000,
    })
    expect(firstIssueFor({ title: '' })?.path).toBe('title')
    expect(firstIssueFor({ title: '  ab  ' })?.message).toBe('Title must be at least 3 characters.')
    expect(firstIssueFor({ title: 'abc' })).toBeNull()
    expect(firstIssueFor({ title: 'x'.repeat(121) })?.path).toBe('title')
    expect(firstIssueFor({ description: 'x'.repeat(4001) })?.path).toBe('description')
    expect(firstIssueFor({ duties: Array.from({ length: 21 }, (_unused, index) => `Duty ${String(index)}`) })?.path).toBe('duties')
    expect(firstIssueFor({ duties: ['x'.repeat(201)] })?.message).toBe('Each duty must be 200 characters or fewer.')
    expect(firstIssueFor({ requiredSkills: ['x'.repeat(61)] })?.path).toBe('requiredSkills')
    expect(firstIssueFor({ openingsCount: 0 })?.path).toBe('openingsCount')
    expect(firstIssueFor({ openingsCount: 101 })?.path).toBe('openingsCount')
    expect(firstIssueFor({ openingsCount: 1.5 })?.path).toBe('openingsCount')
    expect(firstIssueFor({ minimumYearsExperience: 61 })?.path).toBe('minimumYearsExperience')
    expect(firstIssueFor({ benefits: 'x'.repeat(1001) })?.path).toBe('benefits')
    expect(firstIssueFor({ otherTerms: 'x'.repeat(2001) })?.path).toBe('otherTerms')
    expect(firstIssueFor({ applicationDeadline: '2026-02-30' })?.path).toBe('applicationDeadline')
    // A draft may leave every publish field empty except the title.
    expect(
      firstIssueFor({ description: null, workLocation: null, openingsCount: null, jobType: null, applicantRequirement: null }),
    ).toBeNull()
    // Empty text is stored as null, never as an invented value.
    const parseResult = saveJobOpeningInputSchema.safeParse({ ...buildJobOpening(), benefits: '   ' })
    expect(parseResult.success && parseResult.data.benefits).toBeNull()
  })

  it('w4_job_opening_schema_rejects_amount_without_period', () => {
    const pay = { compensationMinAmount: 600, compensationCurrency: 'PHP', compensationPeriod: 'day' } as const
    expect(firstIssueFor({ ...pay, compensationPeriod: null })).toEqual({
      path: 'compensationPeriod',
      message: 'Choose the pay period for the pay amount.',
    })
    expect(firstIssueFor({ ...pay, compensationCurrency: null })?.path).toBe('compensationCurrency')
    expect(firstIssueFor({ compensationPeriod: 'day' })?.message).toBe(
      'Enter a pay amount, or clear the currency and pay period.',
    )
    expect(firstIssueFor({ ...pay, compensationMaxAmount: 599.99 })?.path).toBe('compensationMaxAmount')
    expect(firstIssueFor({ ...pay, compensationMinAmount: 0 })?.path).toBe('compensationMinAmount')
    expect(firstIssueFor({ ...pay, compensationMinAmount: 10_000_000 })?.path).toBe('compensationMinAmount')
    expect(firstIssueFor({ ...pay, compensationMinAmount: 600.555 })?.message).toBe('Use at most 2 decimal places.')
    expect(firstIssueFor({ ...pay, compensationMinAmount: 9_999_999.99 })).toBeNull()
    expect(firstIssueFor(pay)).toBeNull()

    // From the form: the typed amount is kept exactly; malformed text is reported, not guessed.
    const formDraft = {
      ...createJobOpeningDraft(buildJobOpening(), ''),
      compensationMinAmountText: '650.50',
      compensationCurrency: 'PHP',
      compensationPeriod: 'day',
    } as const
    const parsedDraft = parseJobOpeningDraft(formDraft)
    expect(parsedDraft.isValid && parsedDraft.input.compensationMinAmount).toBe(650.5)
    expect(parsedDraft.isValid && parsedDraft.input.compensationMaxAmount).toBeNull()
    const malformedDraft = parseJobOpeningDraft({ ...formDraft, compensationMinAmountText: '1,500' })
    expect(!malformedDraft.isValid && malformedDraft.fieldErrors.compensationMinAmount).toBe(
      compensationAmountFormatMessage,
    )
    const periodlessDraft = parseJobOpeningDraft({ ...formDraft, compensationPeriod: '' })
    expect(!periodlessDraft.isValid && periodlessDraft.fieldErrors.compensationPeriod).toBe(
      'Choose the pay period for the pay amount.',
    )
  })
})
